/**
 * Scrape Job Service
 *
 * Business logic layer for scrape job management.
 * Handles job creation, status updates, result retrieval, and job execution.
 */

import { ScrapeJobStatus } from '@prisma/client';
import {
  createScrapeJob as repoCreateScrapeJob,
  findScrapeJobByIdAndTenant,
  findScrapeJobsByTenant,
  findScrapeJobByUrl,
  findScrapeJobById,
  updateScrapeJob,
  updateScrapeJobStatus as repoUpdateJobStatus,
  markScrapeJobFailed as repoMarkJobFailed,
  markScrapeJobCompleted as repoMarkJobCompleted,
} from './scrape-job.repository';
import {
  CreateScrapeJobInputSchema,
  type CreateScrapeJobInput,
  type CreateScrapeJobResponse,
  type ScrapeJobStatusResponse,
  type ScrapeJobCompletedResponse,
  type ScrapeJobFailedResponse,
  type ScrapeJobErrorDetails,
  type ParsedApiDoc,
  type ScrapeJobStatusType,
  isJobInProgress,
} from './scrape-job.schemas';
import { scrapeDocumentation, crawlDocumentation, isScrapeError } from './doc-scraper';
import { intelligentCrawl } from './intelligent-crawler';
import type { IntelligentCrawlProgress } from './intelligent-crawler';
import { parseApiDocumentation, isParseError } from './document-parser';
import { parseOpenApiSpec, isOpenApiSpec, isOpenApiParseError } from './openapi-parser';
import { storeScrapedContent, getScrapedContentByJobId, isStorageError } from './storage';

import type { ScrapeJob } from '@prisma/client';

// =============================================================================
// Constants
// =============================================================================

/**
 * Estimated duration per scrape stage (in milliseconds)
 */
const STAGE_DURATIONS = {
  CRAWLING: 30_000, // 30 seconds
  PARSING: 15_000, // 15 seconds
  GENERATING: 15_000, // 15 seconds
} as const;

/**
 * Default estimated total duration for a scrape job
 */
const DEFAULT_ESTIMATED_DURATION =
  STAGE_DURATIONS.CRAWLING + STAGE_DURATIONS.PARSING + STAGE_DURATIONS.GENERATING;

// =============================================================================
// Error Class
// =============================================================================

/**
 * Error thrown when scrape job operations fail
 */
export class ScrapeJobError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number = 400
  ) {
    super(message);
    this.name = 'ScrapeJobError';
  }
}

// =============================================================================
// Create Job
// =============================================================================

/**
 * Options for creating a scrape job
 */
export interface CreateScrapeJobOptions {
  /** Force a new scrape even if cached result exists */
  force?: boolean;
  /** Minimum number of endpoints required for a valid cache hit */
  minEndpointsForCache?: number;
}

/**
 * Creates a new scrape job with PENDING status
 *
 * @param tenantId - The tenant creating the job
 * @param input - Job creation parameters
 * @param options - Additional options (force, cache validation)
 * @returns Created job response with estimated duration
 */
export async function createScrapeJob(
  tenantId: string,
  input: CreateScrapeJobInput,
  options: CreateScrapeJobOptions = {}
): Promise<CreateScrapeJobResponse> {
  const { force = false, minEndpointsForCache = 1 } = options;

  // Validate input
  const parsed = CreateScrapeJobInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new ScrapeJobError('INVALID_INPUT', `Invalid scrape job input: ${parsed.error.message}`);
  }

  const { documentationUrl, specificUrls, wishlist } = parsed.data;

  // Determine the primary URL for display/caching
  // If specificUrls provided, use the first one as the primary
  const primaryUrl = documentationUrl || specificUrls?.[0];
  if (!primaryUrl) {
    throw new ScrapeJobError(
      'INVALID_INPUT',
      'Either documentationUrl or specificUrls must be provided'
    );
  }

  // Check for existing completed scrape of the same URL (cache check)
  // Skip cache check if force=true or if using specific URLs (always fresh)
  if (!force && !specificUrls?.length) {
    const existingJob = await findScrapeJobByUrl(tenantId, primaryUrl);
    if (existingJob) {
      // Validate that the cached result is actually useful
      const result = existingJob.result as ParsedApiDoc | null;
      const hasEnoughEndpoints =
        result?.endpoints && result.endpoints.length >= minEndpointsForCache;

      // Only use cache if it has valid results
      if (hasEnoughEndpoints) {
        return {
          jobId: existingJob.id,
          status: existingJob.status as CreateScrapeJobResponse['status'],
          estimatedDuration: 0, // Already complete
        };
      }

      // Cache exists but has 0/few endpoints - log and create new job
      console.log(
        `[Scrape Job] Found cached job ${existingJob.id} with ${result?.endpoints?.length ?? 0} endpoints ` +
          `(min required: ${minEndpointsForCache}). Creating fresh job.`
      );
    }
  }

  // Log scrape mode
  if (specificUrls?.length) {
    console.log(
      `[Scrape Job] Creating job with ${specificUrls.length} specific URLs (skipping site mapping)`
    );
  } else {
    console.log(`[Scrape Job] Creating job with auto-discovery for ${primaryUrl}`);
  }

  // Create the new job
  const job = await repoCreateScrapeJob({
    tenantId,
    documentationUrl: primaryUrl,
    specificUrls: specificUrls ?? [],
    wishlist,
  });

  // Estimate is shorter when using specific URLs (no mapping phase)
  const estimatedDuration = specificUrls?.length
    ? STAGE_DURATIONS.PARSING + STAGE_DURATIONS.GENERATING
    : DEFAULT_ESTIMATED_DURATION;

  return {
    jobId: job.id,
    status: 'PENDING',
    estimatedDuration,
  };
}

// =============================================================================
// Get Job
// =============================================================================

/**
 * Retrieves a scrape job by ID with tenant verification
 *
 * @param tenantId - The tenant requesting the job
 * @param jobId - The job ID to retrieve
 * @returns Job status, progress, and result if complete
 */
export async function getScrapeJob(
  tenantId: string,
  jobId: string
): Promise<ScrapeJobStatusResponse | ScrapeJobCompletedResponse | ScrapeJobFailedResponse> {
  const job = await findScrapeJobByIdAndTenant(jobId, tenantId);

  if (!job) {
    throw new ScrapeJobError('JOB_NOT_FOUND', 'Scrape job not found', 404);
  }

  return formatJobResponse(job);
}

/**
 * Retrieves all scrape jobs for a tenant
 *
 * @param tenantId - The tenant ID
 * @param options - Filter options
 * @returns List of scrape jobs
 */
export async function listScrapeJobs(
  tenantId: string,
  options?: {
    status?: ScrapeJobStatus;
    limit?: number;
  }
): Promise<Array<ScrapeJobStatusResponse | ScrapeJobCompletedResponse | ScrapeJobFailedResponse>> {
  const jobs = await findScrapeJobsByTenant(tenantId, {
    status: options?.status,
  });

  const limitedJobs = options?.limit ? jobs.slice(0, options.limit) : jobs;

  return limitedJobs.map(formatJobResponse);
}

// =============================================================================
// Update Job Status
// =============================================================================

/**
 * Progress percentages for each status
 */
const STATUS_PROGRESS: Record<ScrapeJobStatus, number> = {
  PENDING: 0,
  CRAWLING: 25,
  PARSING: 50,
  GENERATING: 75,
  COMPLETED: 100,
  FAILED: -1, // Special case
};

/**
 * Updates the status of a scrape job
 *
 * @param jobId - The job ID to update
 * @param status - The new status
 * @param progress - Optional specific progress value (0-100)
 * @returns Updated job
 */
export async function updateJobStatus(
  jobId: string,
  status: ScrapeJobStatus,
  progress?: number
): Promise<ScrapeJob> {
  // Use provided progress or default based on status
  const effectiveProgress = progress ?? STATUS_PROGRESS[status];

  return repoUpdateJobStatus(jobId, status, effectiveProgress >= 0 ? effectiveProgress : undefined);
}

/**
 * Updates job progress without changing status
 *
 * @param jobId - The job ID to update
 * @param progress - Progress value (0-100)
 * @returns Updated job
 */
export async function updateJobProgress(jobId: string, progress: number): Promise<ScrapeJob> {
  if (progress < 0 || progress > 100) {
    throw new ScrapeJobError('INVALID_PROGRESS', 'Progress must be between 0 and 100');
  }

  return updateScrapeJob(jobId, { progress });
}

// =============================================================================
// Complete/Fail Job
// =============================================================================

/**
 * Marks a scrape job as completed with the parsed result
 *
 * @param jobId - The job ID to complete
 * @param result - The parsed API documentation
 * @param cachedContentKey - Optional storage key for cached content
 * @returns Updated job
 */
export async function completeJob(
  jobId: string,
  result: ParsedApiDoc,
  cachedContentKey?: string
): Promise<ScrapeJob> {
  // Serialize to plain JSON for Prisma
  return repoMarkJobCompleted(jobId, JSON.parse(JSON.stringify(result)), cachedContentKey);
}

/**
 * Marks a scrape job as failed with error details
 *
 * @param jobId - The job ID to fail
 * @param error - Error details
 * @returns Updated job
 */
export async function failJob(
  jobId: string,
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
    retryable?: boolean;
  }
): Promise<ScrapeJob> {
  const errorData = {
    code: error.code,
    message: error.message,
    details: error.details ?? {},
    retryable: error.retryable ?? false,
    occurredAt: new Date().toISOString(),
  };

  // Serialize to plain JSON for Prisma
  return repoMarkJobFailed(jobId, JSON.parse(JSON.stringify(errorData)));
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Formats a ScrapeJob entity into the appropriate API response
 */
function formatJobResponse(
  job: ScrapeJob
): ScrapeJobStatusResponse | ScrapeJobCompletedResponse | ScrapeJobFailedResponse {
  const baseResponse: ScrapeJobStatusResponse = {
    jobId: job.id,
    status: job.status,
    progress: job.progress,
    documentationUrl: job.documentationUrl,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
  };

  if (job.status === 'COMPLETED' && job.result) {
    return {
      ...baseResponse,
      status: 'COMPLETED' as const,
      progress: 100,
      result: job.result as ParsedApiDoc,
      completedAt: job.completedAt?.toISOString() ?? job.updatedAt.toISOString(),
    };
  }

  if (job.status === 'FAILED' && job.error) {
    return {
      ...baseResponse,
      status: 'FAILED' as const,
      error: job.error as ScrapeJobErrorDetails,
      completedAt: job.completedAt?.toISOString() ?? job.updatedAt.toISOString(),
    };
  }

  // In progress job - add current step based on status
  return {
    ...baseResponse,
    currentStep: getStepDescription(job.status),
  };
}

/**
 * Returns a human-readable description for each status
 */
function getStepDescription(status: ScrapeJobStatus): string {
  switch (status) {
    case 'PENDING':
      return 'Waiting to start...';
    case 'CRAWLING':
      return 'Crawling documentation pages...';
    case 'PARSING':
      return 'Extracting API information...';
    case 'GENERATING':
      return 'Generating integration schema...';
    case 'COMPLETED':
      return 'Complete';
    case 'FAILED':
      return 'Failed';
    default:
      return 'Processing...';
  }
}

/**
 * Checks if a job can be retried
 */
export function canRetryJob(job: ScrapeJob): boolean {
  // Only failed jobs can be retried
  if (job.status !== 'FAILED') {
    return false;
  }

  // Check if error is marked as retryable
  const error = job.error as ScrapeJobErrorDetails | null;
  return error?.retryable ?? false;
}

/**
 * Checks if a job is still in progress
 */
export function isJobRunning(job: ScrapeJob): boolean {
  return isJobInProgress(job.status);
}

// =============================================================================
// Job Processing
// =============================================================================

/**
 * Options for job processing
 */
export interface ProcessJobOptions {
  /** Whether to use multi-page crawling (default: true for comprehensive action discovery) */
  crawlMode?: boolean;
  /**
   * Whether to use intelligent crawling with LLM-guided link prioritization
   * When true (default), uses Firecrawl's map function + LLM triage to select the best pages
   * When false, falls back to basic breadth-first crawling
   */
  intelligentCrawl?: boolean;
  /** Maximum pages to crawl/scrape */
  maxPages?: number;
  /** Maximum crawl depth (only used when intelligentCrawl is false) */
  maxDepth?: number;
  /** Callback for progress updates */
  onProgress?: (stage: string, message: string) => void;
}

/**
 * Process a scrape job end-to-end
 *
 * This function orchestrates the entire scraping workflow:
 * 1. CRAWLING - Scrape documentation from URL (with intelligent link selection)
 * 2. PARSING - Extract API information using AI or OpenAPI parser
 * 3. GENERATING - Finalize and validate the parsed structure
 * 4. COMPLETED/FAILED - Mark job as done
 *
 * @param jobId - The job ID to process
 * @param options - Processing options
 * @returns The completed job with results
 *
 * @example
 * ```ts
 * // Process with intelligent crawling (recommended - uses LLM to select best pages)
 * const job = await processJob(jobId);
 *
 * // Process with basic breadth-first crawling (fallback)
 * const job = await processJob(jobId, { intelligentCrawl: false });
 *
 * // Process with single page only (fastest but may miss actions)
 * const job = await processJob(jobId, { crawlMode: false });
 *
 * // Process with custom settings
 * const job = await processJob(jobId, { maxPages: 50, intelligentCrawl: true });
 * ```
 */
export async function processJob(
  jobId: string,
  options: ProcessJobOptions = {}
): Promise<ScrapeJob> {
  const {
    crawlMode = true,
    intelligentCrawl: useIntelligentCrawl = true,
    maxPages = 30,
    maxDepth = 3,
    onProgress,
  } = options;

  // Get the job
  const job = await findScrapeJobById(jobId);
  if (!job) {
    throw new ScrapeJobError('JOB_NOT_FOUND', 'Scrape job not found', 404);
  }

  // Don't process already completed/failed jobs
  if (job.status === 'COMPLETED' || job.status === 'FAILED') {
    return job;
  }

  const documentationUrl = job.documentationUrl;
  const specificUrls = job.specificUrls ?? [];
  const hasSpecificUrls = specificUrls.length > 0;

  let scrapedContent = '';
  let sourceUrls: string[] = hasSpecificUrls ? specificUrls : [documentationUrl];

  try {
    // ==========================================================================
    // Stage 1: CRAWLING - Scrape the documentation
    // ==========================================================================
    onProgress?.(
      'CRAWLING',
      `Starting to scrape ${hasSpecificUrls ? `${specificUrls.length} specific pages` : documentationUrl}`
    );
    await updateJobStatus(jobId, 'CRAWLING', 10);

    if (hasSpecificUrls) {
      // SPECIFIC URLS MODE: Skip mapping, directly scrape the provided URLs
      onProgress?.(
        'CRAWLING',
        `Scraping ${specificUrls.length} specific documentation pages (skipping site mapping)...`
      );
      console.log(
        `[Scrape Job] Using SPECIFIC URLS mode - scraping ${specificUrls.length} URLs directly`
      );

      const contentParts: string[] = [];
      let successCount = 0;

      for (let i = 0; i < specificUrls.length; i++) {
        const url = specificUrls[i];
        onProgress?.('CRAWLING', `Scraping page ${i + 1}/${specificUrls.length}: ${url}`);

        try {
          const scrapeResult = await scrapeDocumentation(url, {
            onProgress: (msg) => onProgress?.('CRAWLING', msg),
          });
          if (scrapeResult.content) {
            contentParts.push(`\n\n--- SOURCE: ${url} ---\n\n${scrapeResult.content}`);
            successCount++;
          }
        } catch (err) {
          console.warn(`[Scrape Job] Failed to scrape specific URL ${url}:`, err);
          // Continue with other URLs
        }

        // Update progress proportionally
        const progress = 10 + Math.floor((15 * (i + 1)) / specificUrls.length);
        await updateJobProgress(jobId, progress);
      }

      scrapedContent = contentParts.join('\n');
      sourceUrls = specificUrls.slice(0, successCount); // Only include successfully scraped URLs
      console.log(
        `[Scrape Job] Specific URLs mode: scraped ${successCount}/${specificUrls.length} pages`
      );
      await updateJobProgress(jobId, 25);
    } else if (crawlMode) {
      if (useIntelligentCrawl) {
        // Intelligent crawling: Map site → LLM triage → Scrape best pages
        onProgress?.('CRAWLING', 'Using intelligent crawling with LLM-guided page selection...');
        const crawlResult = await intelligentCrawl(documentationUrl, {
          maxPages,
          wishlist: job.wishlist ?? [],
          onProgress: (p: IntelligentCrawlProgress) => {
            // Map intelligent crawl stages to our progress
            const stageMap: Record<string, string> = {
              mapping: 'CRAWLING',
              triaging: 'CRAWLING',
              scraping: 'CRAWLING',
              completed: 'CRAWLING',
              error: 'CRAWLING',
            };
            onProgress?.(stageMap[p.stage] || 'CRAWLING', p.message);
          },
        });
        scrapedContent = crawlResult.aggregatedContent;
        sourceUrls = crawlResult.pages.filter((p) => p.success).map((p) => p.url);

        // Log intelligent crawl stats
        console.log(
          `[Intelligent Crawl] Discovered ${crawlResult.totalUrlsDiscovered} URLs, ` +
            `selected ${crawlResult.prioritizedUrls.length}, ` +
            `scraped ${crawlResult.pagesCrawled} pages`
        );
        await updateJobProgress(jobId, 25);
      } else {
        // Fallback: Basic breadth-first crawling
        onProgress?.('CRAWLING', 'Crawling documentation pages (breadth-first)...');
        const crawlResult = await crawlDocumentation(documentationUrl, {
          maxPages,
          maxDepth,
          onProgress: (p) => {
            onProgress?.('CRAWLING', p.message);
          },
        });
        scrapedContent = crawlResult.aggregatedContent;
        sourceUrls = crawlResult.pages.filter((p) => p.success).map((p) => p.url);
        await updateJobProgress(jobId, 25);
      }
    } else {
      // Single page scraping
      onProgress?.('CRAWLING', 'Scraping documentation page...');
      const scrapeResult = await scrapeDocumentation(documentationUrl, {
        onProgress: (msg) => onProgress?.('CRAWLING', msg),
      });
      scrapedContent = scrapeResult.content;
      await updateJobProgress(jobId, 25);
    }

    onProgress?.('CRAWLING', `Scraped ${scrapedContent.length} characters`);

    // DEBUG: Log scraping details
    console.log(`[Scrape Job] URL: ${documentationUrl}`);
    console.log(`[Scrape Job] Total scraped content length: ${scrapedContent.length} characters`);
    console.log(`[Scrape Job] Source URLs scraped: ${sourceUrls.length}`);
    if (scrapedContent.length > 0) {
      console.log(
        `[Scrape Job] Content preview (first 500 chars):\n${scrapedContent.substring(0, 500)}`
      );
    } else {
      console.log(`[Scrape Job] WARNING: No content scraped!`);
    }

    // Store scraped content for caching (non-blocking, don't fail job if storage fails)
    let cachedContentKey: string | undefined;
    try {
      cachedContentKey = await storeScrapedContent(jobId, scrapedContent, {
        sourceUrl: documentationUrl,
        scrapedAt: new Date().toISOString(),
        pageCount: String(sourceUrls.length),
      });
      onProgress?.('CRAWLING', 'Content cached for future use');
    } catch (storageError) {
      // Log but don't fail the job - caching is optional
      console.warn(`Failed to cache scraped content for job ${jobId}:`, storageError);
    }

    // ==========================================================================
    // Stage 2: PARSING - Extract API information
    // ==========================================================================
    onProgress?.('PARSING', 'Analyzing documentation content...');
    await updateJobStatus(jobId, 'PARSING', 30);

    let parsedDoc: ParsedApiDoc;

    // Check if content is OpenAPI/Swagger spec (no AI needed)
    if (isOpenApiSpec(scrapedContent)) {
      onProgress?.('PARSING', 'Detected OpenAPI/Swagger specification, parsing directly...');
      const openApiResult = await parseOpenApiSpec(scrapedContent, {
        sourceUrl: documentationUrl,
      });
      parsedDoc = openApiResult.doc;
      await updateJobProgress(jobId, 70);
      onProgress?.('PARSING', `Parsed OpenAPI ${openApiResult.openApiVersion} specification`);
    } else {
      // Use AI to parse unstructured documentation
      onProgress?.('PARSING', 'Using AI to extract API information...');
      const parseResult = await parseApiDocumentation(scrapedContent, {
        sourceUrls,
        onProgress: (msg) => onProgress?.('PARSING', msg),
      });
      parsedDoc = parseResult.doc;
      await updateJobProgress(jobId, 70);
      onProgress?.(
        'PARSING',
        `AI parsing complete (confidence: ${Math.round(parseResult.confidence * 100)}%)`
      );
    }

    // ==========================================================================
    // Stage 3: GENERATING - Finalize the parsed structure
    // ==========================================================================
    onProgress?.('GENERATING', 'Finalizing API structure...');
    await updateJobStatus(jobId, 'GENERATING', 80);

    // Apply wishlist filtering/prioritization if provided
    if (job.wishlist && job.wishlist.length > 0) {
      parsedDoc = applyWishlistPrioritization(parsedDoc, job.wishlist);
      onProgress?.('GENERATING', `Applied wishlist prioritization (${job.wishlist.length} items)`);
    }

    // Validate and finalize the document
    parsedDoc = finalizeDocument(parsedDoc, sourceUrls);
    await updateJobProgress(jobId, 95);

    // ==========================================================================
    // Stage 4: COMPLETED - Mark job as done
    // ==========================================================================
    onProgress?.('COMPLETED', 'Scraping job completed successfully');
    const completedJob = await completeJob(jobId, parsedDoc, cachedContentKey);

    return completedJob;
  } catch (error) {
    // Handle and record the error
    const errorInfo = categorizeError(error);
    onProgress?.('FAILED', `Job failed: ${errorInfo.message}`);

    await failJob(jobId, errorInfo);

    // Re-throw for caller to handle
    throw error;
  }
}

/**
 * Start processing a job asynchronously (fire-and-forget)
 *
 * This is useful for API endpoints that want to return immediately
 * while the job processes in the background.
 *
 * @param jobId - The job ID to process
 * @param options - Processing options
 */
export function startJobProcessing(jobId: string, options: ProcessJobOptions = {}): void {
  // Fire and forget - errors are recorded in the job itself
  processJob(jobId, options).catch((error) => {
    console.error(`Job ${jobId} processing failed:`, error);
  });
}

// =============================================================================
// Processing Helpers
// =============================================================================

/**
 * Apply wishlist prioritization to move matched endpoints to the front
 */
function applyWishlistPrioritization(doc: ParsedApiDoc, wishlist: string[]): ParsedApiDoc {
  if (!doc.endpoints || doc.endpoints.length === 0) {
    console.log(`[Wishlist] No endpoints to prioritize`);
    return doc;
  }

  const wishlistLower = wishlist.map((w) => w.toLowerCase());
  console.log(`[Wishlist] Applying prioritization for: ${wishlist.join(', ')}`);

  // Score endpoints based on wishlist matches
  const scoredEndpoints = doc.endpoints.map((endpoint) => {
    // Check name, slug, path, and description for matches
    const searchText = [endpoint.name, endpoint.slug, endpoint.path, endpoint.description || '']
      .join(' ')
      .toLowerCase();

    const matchedItems = wishlistLower.filter((w) => searchText.includes(w));
    const score = matchedItems.length;

    if (score > 0) {
      console.log(`[Wishlist] Match! "${endpoint.name}" matches: ${matchedItems.join(', ')}`);
    }

    return { endpoint, score, matchedItems };
  });

  const matchCount = scoredEndpoints.filter((s) => s.score > 0).length;
  console.log(`[Wishlist] ${matchCount}/${doc.endpoints.length} endpoints matched wishlist items`);

  // Sort by score (matched first), then by original order
  scoredEndpoints.sort((a, b) => b.score - a.score);

  return {
    ...doc,
    endpoints: scoredEndpoints.map((s) => s.endpoint),
  };
}

/**
 * Finalize the document with metadata and defaults
 */
function finalizeDocument(doc: ParsedApiDoc, sourceUrls: string[]): ParsedApiDoc {
  return {
    ...doc,
    // Ensure required fields have values
    name: doc.name || 'Unknown API',
    baseUrl: doc.baseUrl || 'https://api.example.com',
    authMethods: doc.authMethods || [],
    endpoints: doc.endpoints || [],
    // Update metadata
    metadata: {
      ...doc.metadata,
      scrapedAt: new Date().toISOString(),
      sourceUrls,
      aiConfidence: doc.metadata?.aiConfidence ?? 0.8,
      warnings: doc.metadata?.warnings ?? [],
    },
  };
}

/**
 * Categorize an error for recording in the job
 */
function categorizeError(error: unknown): {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  retryable: boolean;
} {
  if (isScrapeError(error)) {
    return {
      code: `SCRAPE_${error.code}`,
      message: error.message,
      details: { url: error.url },
      retryable: error.retryable,
    };
  }

  if (isParseError(error)) {
    return {
      code: `PARSE_${error.code}`,
      message: error.message,
      retryable: false,
    };
  }

  if (isOpenApiParseError(error)) {
    return {
      code: `OPENAPI_${error.code}`,
      message: error.message,
      retryable: false,
    };
  }

  if (isStorageError(error)) {
    return {
      code: `STORAGE_${error.code}`,
      message: error.message,
      details: error.details,
      retryable: true, // Storage errors are often transient
    };
  }

  if (error instanceof ScrapeJobError) {
    return {
      code: error.code,
      message: error.message,
      retryable: false,
    };
  }

  if (error instanceof Error) {
    return {
      code: 'UNKNOWN_ERROR',
      message: error.message,
      retryable: false,
    };
  }

  return {
    code: 'UNKNOWN_ERROR',
    message: 'An unexpected error occurred',
    retryable: false,
  };
}

// =============================================================================
// Re-analyze Job (Re-extraction from Cached Content)
// =============================================================================

/**
 * Options for re-analyzing a job
 */
export interface ReanalyzeJobOptions {
  /** Callback for progress updates */
  onProgress?: (stage: string, message: string) => void;
}

/**
 * Re-analyze a completed job by re-running AI extraction on cached content
 *
 * This is useful when:
 * - Previous extraction failed due to API key issues
 * - Rate limits prevented proper extraction
 * - You want to try extraction with updated AI models
 *
 * @param jobId - The job ID to re-analyze
 * @param tenantId - The tenant ID (for authorization)
 * @param options - Processing options
 * @returns The updated job with new results
 *
 * @throws ScrapeJobError if job not found, not owned by tenant, or no cached content
 */
export async function reanalyzeJob(
  jobId: string,
  tenantId: string,
  options: ReanalyzeJobOptions = {}
): Promise<ScrapeJob> {
  const { onProgress } = options;

  // Get the job and verify ownership
  const job = await findScrapeJobByIdAndTenant(jobId, tenantId);
  if (!job) {
    throw new ScrapeJobError('JOB_NOT_FOUND', 'Scrape job not found or access denied', 404);
  }

  // Job must be completed (even with 0 results) to re-analyze
  if (job.status !== 'COMPLETED' && job.status !== 'FAILED') {
    throw new ScrapeJobError(
      'INVALID_STATUS',
      `Cannot re-analyze job with status ${job.status}. Job must be COMPLETED or FAILED.`,
      400
    );
  }

  // Try to get cached content
  let cachedContent: string | null = null;

  // First try by cached_content_key if available
  if (job.cachedContentKey) {
    try {
      const { getScrapedContent } = await import('./storage');
      cachedContent = await getScrapedContent(job.cachedContentKey);
    } catch (error) {
      console.warn(`Failed to retrieve content by key ${job.cachedContentKey}:`, error);
    }
  }

  // Fallback to job ID lookup
  if (!cachedContent) {
    cachedContent = await getScrapedContentByJobId(jobId);
  }

  if (!cachedContent) {
    throw new ScrapeJobError(
      'NO_CACHED_CONTENT',
      'No cached scraped content available for this job. You need to re-scrape the documentation.',
      400
    );
  }

  onProgress?.('PARSING', 'Re-analyzing cached content with AI...');

  // Reset job to PARSING status
  await updateJobStatus(jobId, 'PARSING', 30);

  try {
    let parsedDoc: ParsedApiDoc;
    const sourceUrls = [job.documentationUrl];

    // Check if content is OpenAPI/Swagger spec
    if (isOpenApiSpec(cachedContent)) {
      onProgress?.('PARSING', 'Detected OpenAPI/Swagger specification, parsing directly...');
      const openApiResult = await parseOpenApiSpec(cachedContent, {
        sourceUrl: job.documentationUrl,
      });
      parsedDoc = openApiResult.doc;
      onProgress?.('PARSING', `Parsed OpenAPI ${openApiResult.openApiVersion} specification`);
    } else {
      // Use AI to parse unstructured documentation
      onProgress?.('PARSING', 'Using AI to extract API information...');
      const parseResult = await parseApiDocumentation(cachedContent, {
        sourceUrls,
        onProgress: (msg) => onProgress?.('PARSING', msg),
      });
      parsedDoc = parseResult.doc;
      onProgress?.(
        'PARSING',
        `AI parsing complete (confidence: ${Math.round(parseResult.confidence * 100)}%)`
      );
    }

    await updateJobStatus(jobId, 'GENERATING', 80);

    // Apply wishlist filtering/prioritization if provided
    if (job.wishlist && job.wishlist.length > 0) {
      parsedDoc = applyWishlistPrioritization(parsedDoc, job.wishlist);
      onProgress?.('GENERATING', `Applied wishlist prioritization (${job.wishlist.length} items)`);
    }

    // Finalize the document
    parsedDoc = finalizeDocument(parsedDoc, sourceUrls);

    // Add metadata about re-analysis
    parsedDoc.metadata = {
      ...parsedDoc.metadata,
      reanalyzedAt: new Date().toISOString(),
      previousEndpointCount: (job.result as ParsedApiDoc | null)?.endpoints?.length ?? 0,
    } as ParsedApiDoc['metadata'];

    await updateJobProgress(jobId, 95);

    // Complete the job with new results
    onProgress?.('COMPLETED', 'Re-analysis completed successfully');
    const completedJob = await completeJob(jobId, parsedDoc, job.cachedContentKey ?? undefined);

    console.log(
      `[Reanalyze] Job ${jobId} re-analyzed: ` +
        `${parsedDoc.endpoints.length} endpoints found (was ${(job.result as ParsedApiDoc | null)?.endpoints?.length ?? 0})`
    );

    return completedJob;
  } catch (error) {
    // Handle and record the error
    const errorInfo = categorizeError(error);
    onProgress?.('FAILED', `Re-analysis failed: ${errorInfo.message}`);

    await failJob(jobId, errorInfo);

    throw error;
  }
}

/**
 * Check if a job can be re-analyzed
 *
 * @param job - The scrape job to check
 * @returns Object with canReanalyze flag and reason
 */
export async function canReanalyzeJob(job: ScrapeJob): Promise<{
  canReanalyze: boolean;
  reason: string;
  hasCachedContent: boolean;
}> {
  // Must be completed or failed
  if (job.status !== 'COMPLETED' && job.status !== 'FAILED') {
    return {
      canReanalyze: false,
      reason: `Job is still ${job.status.toLowerCase()}`,
      hasCachedContent: false,
    };
  }

  // Check for cached content
  let hasCachedContent = false;

  if (job.cachedContentKey) {
    try {
      const { getScrapedContent } = await import('./storage');
      await getScrapedContent(job.cachedContentKey);
      hasCachedContent = true;
    } catch {
      // Content not available by key
    }
  }

  if (!hasCachedContent) {
    const content = await getScrapedContentByJobId(job.id);
    hasCachedContent = content !== null;
  }

  if (!hasCachedContent) {
    return {
      canReanalyze: false,
      reason: 'No cached content available. Re-scrape required.',
      hasCachedContent: false,
    };
  }

  // Check current results
  const result = job.result as ParsedApiDoc | null;
  const endpointCount = result?.endpoints?.length ?? 0;

  if (job.status === 'FAILED') {
    return {
      canReanalyze: true,
      reason: 'Job failed - re-analysis may recover results',
      hasCachedContent: true,
    };
  }

  if (endpointCount === 0) {
    return {
      canReanalyze: true,
      reason: 'No endpoints extracted - re-analysis recommended',
      hasCachedContent: true,
    };
  }

  return {
    canReanalyze: true,
    reason: `${endpointCount} endpoints found - re-analysis available`,
    hasCachedContent: true,
  };
}

/**
 * Cancel a running scrape job
 *
 * @param jobId - The job ID to cancel
 * @param tenantId - The tenant ID (for authorization)
 * @returns The cancelled job
 */
export async function cancelScrapeJob(jobId: string, tenantId: string): Promise<ScrapeJob> {
  const job = await findScrapeJobByIdAndTenant(jobId, tenantId);

  if (!job) {
    throw new ScrapeJobError('JOB_NOT_FOUND', 'Scrape job not found', 404);
  }

  // Can only cancel in-progress jobs
  if (!isJobInProgress(job.status as ScrapeJobStatusType)) {
    throw new ScrapeJobError('INVALID_STATE', `Cannot cancel job with status ${job.status}`, 400);
  }

  // Mark as failed with CANCELLED error
  await repoMarkJobFailed(jobId, {
    code: 'CANCELLED',
    message: 'Job cancelled by user',
    retryable: true,
  });

  console.log(`[Scrape Job] Job ${jobId} cancelled by user`);

  return (await findScrapeJobById(jobId))!;
}

// Track cancelled jobs so running processes can check
const cancelledJobs = new Set<string>();

/**
 * Check if a job has been cancelled
 */
export function isJobCancelled(jobId: string): boolean {
  return cancelledJobs.has(jobId);
}

/**
 * Mark a job as cancelled in the tracking set
 */
export function markJobCancelled(jobId: string): void {
  cancelledJobs.add(jobId);
  // Clean up after 5 minutes
  setTimeout(() => cancelledJobs.delete(jobId), 5 * 60 * 1000);
}
