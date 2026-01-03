/**
 * Scrape API - Initiate Scraping Job
 *
 * POST /api/v1/scrape
 *
 * Creates a new documentation scraping job. The job runs asynchronously
 * and can be polled for status via GET /api/v1/scrape/:jobId
 *
 * Processing modes:
 * - sync=true (default for MVP): Process synchronously, return when complete (~60s max)
 * - sync=false: Start background processing, return immediately with job ID
 * - crawl=true (default): Enable multi-page crawling for comprehensive action discovery
 * - crawl=false: Single page scraping only (faster but may miss actions on sub-pages)
 */

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { withApiAuth } from '@/lib/api/middleware/auth';
import { successResponse, errorResponse } from '@/lib/api/response';
import {
  createScrapeJob,
  processJob,
  startJobProcessing,
  getScrapeJob,
  ScrapeJobError,
  CreateScrapeJobInputSchema,
} from '@/lib/modules/ai';

// =============================================================================
// Request Validation
// =============================================================================

const CreateScrapeJobRequestSchema = CreateScrapeJobInputSchema.extend({
  /** Process synchronously (default: true for MVP) */
  sync: z.boolean().optional().default(true),
  /** Enable multi-page crawling (default: true - crawls from top-level page to find all actions) */
  crawl: z.boolean().optional().default(true),
  /** Max pages to crawl (default: 20) */
  maxPages: z.number().min(1).max(100).optional().default(20),
  /** Max depth to crawl (default: 3) */
  maxDepth: z.number().min(1).max(5).optional().default(3),
});

type CreateScrapeJobRequest = z.infer<typeof CreateScrapeJobRequestSchema>;

// =============================================================================
// POST /api/v1/scrape - Create a new scraping job
// =============================================================================

export const POST = withApiAuth(async (request: NextRequest, { tenant }) => {
  try {
    // Parse and validate request body
    const body = await request.json().catch(() => ({}));
    const parseResult = CreateScrapeJobRequestSchema.safeParse(body);

    if (!parseResult.success) {
      return errorResponse('VALIDATION_ERROR', 'Invalid request body', 400, {
        errors: parseResult.error.flatten().fieldErrors,
      });
    }

    const input: CreateScrapeJobRequest = parseResult.data;
    const { sync, crawl, maxPages, maxDepth, ...jobInput } = input;

    // Create the scraping job
    const createResult = await createScrapeJob(tenant.id, {
      documentationUrl: jobInput.documentationUrl,
      wishlist: jobInput.wishlist,
    });

    // If job already completed (cache hit), return immediately
    if (createResult.status === 'COMPLETED') {
      return successResponse(
        {
          jobId: createResult.jobId,
          status: createResult.status,
          estimatedDuration: 0,
          message: 'Documentation was previously scraped. Use the jobId to retrieve results.',
        },
        200
      );
    }

    // Processing options
    const processOptions = {
      crawlMode: crawl,
      maxPages,
      maxDepth,
    };

    if (sync) {
      // Synchronous processing (MVP default)
      // Process the job and wait for completion
      try {
        await processJob(createResult.jobId, processOptions);

        // Get the completed job result
        const completedJob = await getScrapeJob(tenant.id, createResult.jobId);

        return successResponse(
          {
            jobId: createResult.jobId,
            status: completedJob.status,
            ...(completedJob.status === 'COMPLETED' &&
              'result' in completedJob && {
                result: completedJob.result,
              }),
            ...(completedJob.status === 'FAILED' &&
              'error' in completedJob && {
                error: completedJob.error,
              }),
            message:
              completedJob.status === 'COMPLETED'
                ? 'Documentation scraped successfully.'
                : 'Scraping job failed. Check error details.',
          },
          completedJob.status === 'COMPLETED' ? 200 : 500
        );
      } catch {
        // Job failed, return the failure info
        const failedJob = await getScrapeJob(tenant.id, createResult.jobId);
        return successResponse(
          {
            jobId: createResult.jobId,
            status: failedJob.status,
            ...('error' in failedJob && { error: failedJob.error }),
            message: 'Scraping job failed. Check error details.',
          },
          500
        );
      }
    } else {
      // Asynchronous processing
      // Start background processing and return immediately
      startJobProcessing(createResult.jobId, processOptions);

      return successResponse(
        {
          jobId: createResult.jobId,
          status: 'PENDING',
          estimatedDuration: createResult.estimatedDuration,
          message: 'Scraping job started. Poll GET /api/v1/scrape/{jobId} for status updates.',
        },
        202
      );
    }
  } catch (error) {
    if (error instanceof ScrapeJobError) {
      return errorResponse(error.code, error.message, error.statusCode);
    }

    console.error('Scrape job creation error:', error);
    return errorResponse(
      'INTERNAL_ERROR',
      'An error occurred while creating the scraping job',
      500
    );
  }
});

// =============================================================================
// GET /api/v1/scrape - List recent scraping jobs
// =============================================================================

export const GET = withApiAuth(async (request: NextRequest, { tenant }) => {
  try {
    const url = new URL(request.url);
    const limitParam = url.searchParams.get('limit');
    const statusParam = url.searchParams.get('status');

    // Validate limit
    const limit = limitParam ? parseInt(limitParam, 10) : 10;
    if (isNaN(limit) || limit < 1 || limit > 100) {
      return errorResponse(
        'VALIDATION_ERROR',
        'Invalid limit parameter. Must be between 1 and 100.',
        400
      );
    }

    // Validate status if provided
    const validStatuses = ['PENDING', 'CRAWLING', 'PARSING', 'GENERATING', 'COMPLETED', 'FAILED'];
    if (statusParam && !validStatuses.includes(statusParam)) {
      return errorResponse(
        'VALIDATION_ERROR',
        `Invalid status parameter. Must be one of: ${validStatuses.join(', ')}`,
        400
      );
    }

    // Import dynamically to avoid issues with service dependencies
    const { listScrapeJobs } = await import('@/lib/modules/ai');

    const jobs = await listScrapeJobs(tenant.id, {
      status: statusParam as
        | 'PENDING'
        | 'CRAWLING'
        | 'PARSING'
        | 'GENERATING'
        | 'COMPLETED'
        | 'FAILED'
        | undefined,
      limit,
    });

    return successResponse({
      jobs,
      count: jobs.length,
    });
  } catch (error) {
    console.error('List scrape jobs error:', error);
    return errorResponse('INTERNAL_ERROR', 'An error occurred while listing scraping jobs', 500);
  }
});
