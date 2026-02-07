/**
 * Job Worker Service
 *
 * Processes the async job queue. Called by the Vercel Cron endpoint
 * (/api/v1/internal/job-worker) on a 1-minute interval.
 *
 * Each cycle:
 *  1. Detect and fail timed-out jobs
 *  2. Claim queued jobs (up to limit)
 *  3. Dispatch each claimed job to its registered handler
 *  4. On handler success → completeJob
 *  5. On handler failure → failJob (which handles retries/backoff)
 *
 * The worker never touches downstream domain logic — handlers are responsible
 * for the actual work. The worker manages job lifecycle only.
 */

import type { AsyncJob, AsyncJobItem } from '@prisma/client';

import { jobQueue } from './jobs.queue';
import { getJobTypeConfig } from './jobs.handlers';
import { HandlerNotFoundError } from './jobs.errors';
import * as repo from './jobs.repository';

import type { JobHandlerContext } from './jobs.handlers';

// =============================================================================
// Types
// =============================================================================

/** Summary returned after a worker cycle */
export interface WorkerCycleResult {
  /** Number of timed-out jobs detected and failed */
  timedOut: number;
  /** Number of jobs claimed for processing */
  claimed: number;
  /** Number of jobs that completed successfully */
  succeeded: number;
  /** Number of jobs that failed (handler error or no handler) */
  failed: number;
  /** Per-job results for diagnostics */
  jobs: {
    id: string;
    type: string;
    result: 'succeeded' | 'failed';
    error?: string;
  }[];
}

/** Options for a worker cycle */
export interface WorkerCycleOptions {
  /** Max jobs to claim per cycle (default: 10) */
  limit?: number;
  /** Only process jobs of this type (optional) */
  type?: string;
}

// =============================================================================
// Worker Cycle
// =============================================================================

/**
 * Run a single worker cycle: timeout detection → claim → dispatch.
 * This is the main entry point called by the cron endpoint.
 */
export async function runWorkerCycle(options: WorkerCycleOptions = {}): Promise<WorkerCycleResult> {
  const { limit = 10, type } = options;

  const result: WorkerCycleResult = {
    timedOut: 0,
    claimed: 0,
    succeeded: 0,
    failed: 0,
    jobs: [],
  };

  // Step 1: Detect and fail timed-out jobs
  result.timedOut = await jobQueue.detectTimeouts();

  // Step 2: Claim queued jobs
  const claimedJobs = await jobQueue.claimNext(type, limit);
  result.claimed = claimedJobs.length;

  // Step 3: Process each claimed job
  for (const job of claimedJobs) {
    const jobResult = await processJob(job as AsyncJob & { items: AsyncJobItem[] });
    result.jobs.push(jobResult);

    if (jobResult.result === 'succeeded') {
      result.succeeded++;
    } else {
      result.failed++;
    }
  }

  return result;
}

// =============================================================================
// Job Processing
// =============================================================================

/**
 * Process a single claimed job: look up handler, build context, execute,
 * and record success or failure.
 */
async function processJob(
  job: AsyncJob & { items: AsyncJobItem[] }
): Promise<{ id: string; type: string; result: 'succeeded' | 'failed'; error?: string }> {
  try {
    // Look up handler config — throws HandlerNotFoundError if missing
    const config = getJobTypeConfig(job.type);

    // Check concurrency limits
    if (config.concurrencyLimit && config.concurrencyLimit > 0) {
      const running = await repo.countRunningJobsByType(job.type);
      // The current job is already counted as running (claimed), so check
      // if adding it exceeds the limit. If running > limit, we should
      // release this job back to queued. But since claiming already set it
      // to running, we need to re-queue it.
      if (running > config.concurrencyLimit) {
        await repo.updateAsyncJob(job.id, {
          status: 'queued',
          startedAt: null,
          // Don't decrement attempts — the claim already incremented it,
          // but this isn't a real attempt, so undo.
          attempts: Math.max(0, job.attempts - 1),
        });
        return {
          id: job.id,
          type: job.type,
          result: 'failed',
          error: `Concurrency limit reached for type '${job.type}' (limit: ${config.concurrencyLimit})`,
        };
      }
    }

    // Build handler context
    const context = buildHandlerContext(job);

    // Execute handler
    const output = await config.handler(context);

    // Success — complete the job
    await jobQueue.completeJob(job.id, output ?? undefined);

    return { id: job.id, type: job.type, result: 'succeeded' };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    const errorCode = err instanceof HandlerNotFoundError ? 'HANDLER_NOT_FOUND' : 'HANDLER_ERROR';

    // Record failure — jobQueue.failJob handles retry logic
    await jobQueue.failJob(job.id, {
      code: errorCode,
      message: errorMessage,
      ...(err instanceof Error && { stack: err.stack }),
    });

    return {
      id: job.id,
      type: job.type,
      result: 'failed',
      error: errorMessage,
    };
  }
}

// =============================================================================
// Handler Context Builder
// =============================================================================

/**
 * Build the context object passed to job handlers. Provides convenience
 * wrappers around the queue and repository for the handler's job scope.
 */
function buildHandlerContext(job: AsyncJob & { items: AsyncJobItem[] }): JobHandlerContext {
  return {
    job,

    updateProgress: (progress, details) => jobQueue.updateProgress(job.id, progress, details),

    getPendingItems: (limit) => repo.findPendingItemsForJob(job.id, limit),

    updateItem: (itemId, update) =>
      repo
        .updateAsyncJobItem(itemId, {
          status: update.status,
          output: update.output,
          error: update.error,
          completedAt: update.completedAt,
        })
        .then(() => undefined),

    batchUpdateItems: (updates) =>
      repo.batchUpdateJobItems(
        updates.map((u) => ({
          id: u.id,
          data: {
            status: u.data.status,
            output: u.data.output,
            error: u.data.error,
            completedAt: u.data.completedAt,
          },
        }))
      ),
  };
}
