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
  isJobInProgress,
} from './scrape-job.schemas';
import { scrapeDocumentation, crawlDocumentation, isScrapeError } from './doc-scraper';
import { parseApiDocumentation, isParseError } from './document-parser';
import { parseOpenApiSpec, isOpenApiSpec, isOpenApiParseError } from './openapi-parser';
import { storeScrapedContent, isStorageError } from './storage';

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
 * Creates a new scrape job with PENDING status
 *
 * @param tenantId - The tenant creating the job
 * @param input - Job creation parameters
 * @returns Created job response with estimated duration
 */
export async function createScrapeJob(
  tenantId: string,
  input: CreateScrapeJobInput
): Promise<CreateScrapeJobResponse> {
  // Validate input
  const parsed = CreateScrapeJobInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new ScrapeJobError('INVALID_INPUT', `Invalid scrape job input: ${parsed.error.message}`);
  }

  const { documentationUrl, wishlist } = parsed.data;

  // Check for existing completed scrape of the same URL (cache check)
  const existingJob = await findScrapeJobByUrl(tenantId, documentationUrl);
  if (existingJob) {
    // Return the existing completed job info
    return {
      jobId: existingJob.id,
      status: existingJob.status as CreateScrapeJobResponse['status'],
      estimatedDuration: 0, // Already complete
    };
  }

  // Create the new job
  const job = await repoCreateScrapeJob({
    tenantId,
    documentationUrl,
    wishlist,
  });

  return {
    jobId: job.id,
    status: 'PENDING',
    estimatedDuration: DEFAULT_ESTIMATED_DURATION,
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
  /** Whether to use multi-page crawling (default: false for single page) */
  crawlMode?: boolean;
  /** Maximum pages to crawl if crawlMode is enabled */
  maxPages?: number;
  /** Maximum crawl depth if crawlMode is enabled */
  maxDepth?: number;
  /** Callback for progress updates */
  onProgress?: (stage: string, message: string) => void;
}

/**
 * Process a scrape job end-to-end
 *
 * This function orchestrates the entire scraping workflow:
 * 1. CRAWLING - Scrape documentation from URL
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
 * // Process synchronously (MVP approach)
 * const job = await processJob(jobId);
 *
 * // Process with crawling for multi-page docs
 * const job = await processJob(jobId, { crawlMode: true, maxPages: 10 });
 * ```
 */
export async function processJob(
  jobId: string,
  options: ProcessJobOptions = {}
): Promise<ScrapeJob> {
  const { crawlMode = false, maxPages = 20, maxDepth = 3, onProgress } = options;

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
  let scrapedContent = '';
  let sourceUrls: string[] = [documentationUrl];

  try {
    // ==========================================================================
    // Stage 1: CRAWLING - Scrape the documentation
    // ==========================================================================
    onProgress?.('CRAWLING', `Starting to scrape ${documentationUrl}`);
    await updateJobStatus(jobId, 'CRAWLING', 10);

    if (crawlMode) {
      // Multi-page crawling
      onProgress?.('CRAWLING', 'Crawling multiple documentation pages...');
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
    return doc;
  }

  const wishlistLower = wishlist.map((w) => w.toLowerCase());

  // Score endpoints based on wishlist matches
  const scoredEndpoints = doc.endpoints.map((endpoint) => {
    const nameMatch = wishlistLower.some(
      (w) =>
        endpoint.name.toLowerCase().includes(w) ||
        endpoint.slug.toLowerCase().includes(w) ||
        endpoint.path.toLowerCase().includes(w)
    );
    return { endpoint, score: nameMatch ? 1 : 0 };
  });

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
