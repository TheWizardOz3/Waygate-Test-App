/**
 * Job Worker Cron Endpoint
 *
 * Internal endpoint called by Vercel Cron to process the async job queue.
 * Protected by CRON_SECRET environment variable.
 *
 * Schedule: Every 1 minute (configured in vercel.json)
 *
 * @route POST /api/v1/internal/job-worker
 * @route GET /api/v1/internal/job-worker
 */

import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/api/response';
import { verifyCronSecret } from '@/lib/api/middleware/cron-auth';
import { runWorkerCycle } from '@/lib/modules/jobs';

// Side-effect imports: register job handlers
import '@/lib/modules/batch-operations';
import '@/lib/modules/schema-drift';

// =============================================================================
// CONFIGURATION
// =============================================================================

/**
 * Maximum execution time for the worker cycle (in seconds).
 * Set lower than Vercel's function timeout to ensure clean completion.
 */
export const maxDuration = 60;

const LOG_PREFIX = '[JOB_WORKER_CRON]';

// =============================================================================
// HANDLER
// =============================================================================

/**
 * POST /api/v1/internal/job-worker
 *
 * Runs a single worker cycle: detect timeouts, claim queued jobs, dispatch to handlers.
 * Called by Vercel Cron every 1 minute.
 */
export async function POST(request: NextRequest) {
  if (!verifyCronSecret(request, LOG_PREFIX)) {
    return errorResponse('UNAUTHORIZED', 'Invalid or missing cron secret', 401);
  }

  try {
    console.info('[JOB_WORKER_CRON] Starting worker cycle');

    // Parse optional params from query string (for testing)
    const url = new URL(request.url);
    const limit = url.searchParams.get('limit')
      ? parseInt(url.searchParams.get('limit')!, 10)
      : undefined;
    const type = url.searchParams.get('type') ?? undefined;

    const result = await runWorkerCycle({ limit, type });

    console.info(
      `[JOB_WORKER_CRON] Cycle complete: claimed=${result.claimed}, succeeded=${result.succeeded}, failed=${result.failed}, timedOut=${result.timedOut}`
    );

    return successResponse({
      message: 'Worker cycle completed',
      summary: {
        timedOut: result.timedOut,
        claimed: result.claimed,
        succeeded: result.succeeded,
        failed: result.failed,
      },
      jobs: result.jobs,
    });
  } catch (error) {
    console.error('[JOB_WORKER_CRON] Worker cycle failed:', error);

    return errorResponse(
      'WORKER_CYCLE_FAILED',
      error instanceof Error ? error.message : 'An unexpected error occurred during worker cycle',
      500
    );
  }
}

/**
 * GET /api/v1/internal/job-worker
 *
 * Returns the status/configuration of the job worker.
 * Useful for health checks and debugging.
 */
export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request, LOG_PREFIX)) {
    return errorResponse('UNAUTHORIZED', 'Invalid or missing cron secret', 401);
  }

  return successResponse({
    endpoint: '/api/v1/internal/job-worker',
    method: 'POST',
    schedule: '* * * * *',
    description: 'Processes async job queue: timeout detection, job claiming, handler dispatch',
    configuration: {
      defaultLimit: 10,
      maxDuration: 60,
    },
    status: 'ready',
  });
}
