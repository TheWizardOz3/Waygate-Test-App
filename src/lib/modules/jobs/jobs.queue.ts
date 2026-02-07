/**
 * Job Queue Interface & DB-Backed Implementation
 *
 * Clean, swap-friendly interface for the async job system. Downstream features
 * (Batch Operations, Schema Drift, etc.) consume the JobQueue interface — never
 * the repository directly. If scale demands it later, swap DbJobQueue with a
 * Trigger.dev adapter without changing consumers.
 */

import type { AsyncJob, AsyncJobItem } from '@prisma/client';
import type { Prisma } from '@prisma/client';

import * as repo from './jobs.repository';
import { JobNotFoundError, JobNotCancellableError, JobNotRetryableError } from './jobs.errors';

// =============================================================================
// Types
// =============================================================================

export interface EnqueueJobParams {
  type: string;
  tenantId?: string | null;
  input?: Prisma.InputJsonValue;
  maxAttempts?: number;
  timeoutSeconds?: number;
}

export interface EnqueueBatchJobParams extends EnqueueJobParams {
  items: { input?: Prisma.InputJsonValue }[];
}

// =============================================================================
// Interface
// =============================================================================

/**
 * Abstract job queue interface.
 * Re-implement this interface with Trigger.dev (or another provider)
 * to swap the underlying queue engine without changing consumers.
 */
export interface JobQueue {
  /** Enqueue a single job */
  enqueue(params: EnqueueJobParams): Promise<AsyncJob>;

  /** Enqueue a batch job with child items */
  enqueueWithItems(params: EnqueueBatchJobParams): Promise<AsyncJob & { items: AsyncJobItem[] }>;

  /** Claim the next queued jobs for processing */
  claimNext(type?: string, limit?: number): Promise<AsyncJob[]>;

  /** Update job progress (0–100) with optional stage details */
  updateProgress(jobId: string, progress: number, details?: Prisma.InputJsonValue): Promise<void>;

  /** Mark a job as completed with optional output */
  completeJob(jobId: string, output?: Prisma.InputJsonValue): Promise<void>;

  /**
   * Record a job failure. If attempts remain, re-queues with exponential
   * backoff. Otherwise marks as permanently failed.
   */
  failJob(jobId: string, error: Prisma.InputJsonValue): Promise<void>;

  /** Cancel a queued or running job */
  cancelJob(jobId: string): Promise<void>;

  /** Retry a failed job (re-enqueues it) */
  retryJob(jobId: string): Promise<void>;

  /** Detect and fail jobs that have exceeded their timeout. Returns count. */
  detectTimeouts(): Promise<number>;
}

// =============================================================================
// Constants
// =============================================================================

/** Base delay for exponential backoff (seconds) */
const BACKOFF_BASE_SECONDS = 10;

/** Maximum backoff cap (seconds) — 30 minutes */
const BACKOFF_MAX_SECONDS = 1800;

// =============================================================================
// DB-Backed Implementation
// =============================================================================

/**
 * PostgreSQL-backed job queue implementation.
 *
 * Uses Prisma + raw SQL (for atomic claim) to manage the full job lifecycle.
 * Retry backoff: `min(base * 2^(attempts-1), cap)` seconds from now.
 */
export class DbJobQueue implements JobQueue {
  async enqueue(params: EnqueueJobParams): Promise<AsyncJob> {
    return repo.createAsyncJob({
      tenantId: params.tenantId ?? null,
      type: params.type,
      input: params.input,
      maxAttempts: params.maxAttempts,
      timeoutSeconds: params.timeoutSeconds,
    });
  }

  async enqueueWithItems(
    params: EnqueueBatchJobParams
  ): Promise<AsyncJob & { items: AsyncJobItem[] }> {
    return repo.createBatchJob({
      tenantId: params.tenantId ?? null,
      type: params.type,
      input: params.input,
      maxAttempts: params.maxAttempts,
      timeoutSeconds: params.timeoutSeconds,
      items: params.items,
    });
  }

  async claimNext(type?: string, limit?: number): Promise<AsyncJob[]> {
    return repo.claimNextJobs({ type, limit });
  }

  async updateProgress(
    jobId: string,
    progress: number,
    details?: Prisma.InputJsonValue
  ): Promise<void> {
    const job = await repo.findAsyncJobById(jobId);
    if (!job) throw new JobNotFoundError(jobId);

    await repo.updateAsyncJob(jobId, {
      progress: Math.max(0, Math.min(100, progress)),
      ...(details !== undefined && { progressDetails: details }),
    });
  }

  async completeJob(jobId: string, output?: Prisma.InputJsonValue): Promise<void> {
    const job = await repo.findAsyncJobById(jobId);
    if (!job) throw new JobNotFoundError(jobId);

    await repo.updateAsyncJob(jobId, {
      status: 'completed',
      progress: 100,
      completedAt: new Date(),
      ...(output !== undefined && { output }),
    });
  }

  async failJob(jobId: string, error: Prisma.InputJsonValue): Promise<void> {
    const job = await repo.findAsyncJobById(jobId);
    if (!job) throw new JobNotFoundError(jobId);

    const hasRetriesLeft = job.attempts < job.maxAttempts;

    if (hasRetriesLeft) {
      // Re-queue with exponential backoff
      const backoffSeconds = Math.min(
        BACKOFF_BASE_SECONDS * Math.pow(2, job.attempts - 1),
        BACKOFF_MAX_SECONDS
      );
      const nextRunAt = new Date(Date.now() + backoffSeconds * 1000);

      await repo.updateAsyncJob(jobId, {
        status: 'queued',
        error,
        nextRunAt,
        startedAt: null,
      });
    } else {
      // Max attempts exhausted — permanent failure
      await repo.updateAsyncJob(jobId, {
        status: 'failed',
        error,
        completedAt: new Date(),
      });
    }
  }

  async cancelJob(jobId: string): Promise<void> {
    const job = await repo.findAsyncJobById(jobId);
    if (!job) throw new JobNotFoundError(jobId);

    const cancellableStatuses = ['queued', 'running'];
    if (!cancellableStatuses.includes(job.status)) {
      throw new JobNotCancellableError(jobId, job.status);
    }

    await repo.updateAsyncJob(jobId, {
      status: 'cancelled',
      completedAt: new Date(),
    });
  }

  async retryJob(jobId: string): Promise<void> {
    const job = await repo.findAsyncJobById(jobId);
    if (!job) throw new JobNotFoundError(jobId);

    if (job.status !== 'failed') {
      throw new JobNotRetryableError(jobId, job.status);
    }

    await repo.updateAsyncJob(jobId, {
      status: 'queued',
      error: null as unknown as Prisma.InputJsonValue,
      progress: 0,
      attempts: 0,
      nextRunAt: null,
      startedAt: null,
      completedAt: null,
    });
  }

  async detectTimeouts(): Promise<number> {
    return repo.detectAndFailTimedOutJobs();
  }
}

// =============================================================================
// Singleton
// =============================================================================

/** Default DB-backed job queue instance */
export const jobQueue: JobQueue = new DbJobQueue();
