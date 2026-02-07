/**
 * Job Queue (DbJobQueue) Unit Tests
 *
 * Tests the DB-backed job queue implementation: enqueue, claim, complete, fail
 * (with retry/backoff logic), cancel, retry, progress, timeout detection.
 *
 * Repository calls are mocked — these tests verify the queue's lifecycle logic.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AsyncJob, AsyncJobItem } from '@prisma/client';

// Mock the repository module before importing the queue
vi.mock('@/lib/modules/jobs/jobs.repository', () => ({
  createAsyncJob: vi.fn(),
  createBatchJob: vi.fn(),
  claimNextJobs: vi.fn(),
  findAsyncJobById: vi.fn(),
  updateAsyncJob: vi.fn(),
  detectAndFailTimedOutJobs: vi.fn(),
}));

import * as repo from '@/lib/modules/jobs/jobs.repository';
import { DbJobQueue } from '@/lib/modules/jobs/jobs.queue';
import {
  JobNotFoundError,
  JobNotCancellableError,
  JobNotRetryableError,
} from '@/lib/modules/jobs/jobs.errors';

const UUID_1 = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';

function makeJob(overrides: Partial<AsyncJob> = {}): AsyncJob {
  return {
    id: UUID_1,
    tenantId: null,
    type: 'batch_operation',
    status: 'queued',
    input: null,
    output: null,
    error: null,
    progress: 0,
    progressDetails: null,
    attempts: 0,
    maxAttempts: 3,
    timeoutSeconds: 300,
    nextRunAt: null,
    startedAt: null,
    completedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('DbJobQueue', () => {
  let queue: DbJobQueue;

  beforeEach(() => {
    vi.clearAllMocks();
    queue = new DbJobQueue();
  });

  // ===========================================================================
  // enqueue
  // ===========================================================================

  describe('enqueue', () => {
    it('should delegate to repo.createAsyncJob', async () => {
      const job = makeJob();
      vi.mocked(repo.createAsyncJob).mockResolvedValue(job);

      const result = await queue.enqueue({
        type: 'batch_operation',
        tenantId: 'tid-123',
        input: { key: 'val' },
        maxAttempts: 5,
        timeoutSeconds: 600,
      });

      expect(repo.createAsyncJob).toHaveBeenCalledWith({
        tenantId: 'tid-123',
        type: 'batch_operation',
        input: { key: 'val' },
        maxAttempts: 5,
        timeoutSeconds: 600,
      });
      expect(result).toBe(job);
    });

    it('should default tenantId to null if not provided', async () => {
      const job = makeJob();
      vi.mocked(repo.createAsyncJob).mockResolvedValue(job);

      await queue.enqueue({ type: 'scrape' });

      expect(repo.createAsyncJob).toHaveBeenCalledWith(expect.objectContaining({ tenantId: null }));
    });
  });

  // ===========================================================================
  // enqueueWithItems
  // ===========================================================================

  describe('enqueueWithItems', () => {
    it('should delegate to repo.createBatchJob', async () => {
      const jobWithItems = {
        ...makeJob(),
        items: [
          {
            id: 'item-1',
            jobId: UUID_1,
            status: 'pending',
            input: null,
            output: null,
            error: null,
            attempts: 0,
            createdAt: new Date(),
            completedAt: null,
          },
        ] as AsyncJobItem[],
      };
      vi.mocked(repo.createBatchJob).mockResolvedValue(jobWithItems);

      const result = await queue.enqueueWithItems({
        type: 'batch_operation',
        items: [{ input: { id: 1 } }],
      });

      expect(repo.createBatchJob).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'batch_operation',
          items: [{ input: { id: 1 } }],
        })
      );
      expect(result.items).toHaveLength(1);
    });
  });

  // ===========================================================================
  // claimNext
  // ===========================================================================

  describe('claimNext', () => {
    it('should delegate to repo.claimNextJobs', async () => {
      vi.mocked(repo.claimNextJobs).mockResolvedValue([
        makeJob({ status: 'running', attempts: 1 }),
      ]);

      const result = await queue.claimNext('batch_operation', 5);

      expect(repo.claimNextJobs).toHaveBeenCalledWith({ type: 'batch_operation', limit: 5 });
      expect(result).toHaveLength(1);
    });
  });

  // ===========================================================================
  // updateProgress
  // ===========================================================================

  describe('updateProgress', () => {
    it('should update progress on the job', async () => {
      vi.mocked(repo.findAsyncJobById).mockResolvedValue(makeJob());
      vi.mocked(repo.updateAsyncJob).mockResolvedValue(makeJob({ progress: 50 }));

      await queue.updateProgress(UUID_1, 50, { stage: 'processing' });

      expect(repo.updateAsyncJob).toHaveBeenCalledWith(UUID_1, {
        progress: 50,
        progressDetails: { stage: 'processing' },
      });
    });

    it('should clamp progress to 0-100 range', async () => {
      vi.mocked(repo.findAsyncJobById).mockResolvedValue(makeJob());
      vi.mocked(repo.updateAsyncJob).mockResolvedValue(makeJob());

      await queue.updateProgress(UUID_1, 150);
      expect(repo.updateAsyncJob).toHaveBeenCalledWith(UUID_1, { progress: 100 });

      vi.clearAllMocks();
      vi.mocked(repo.findAsyncJobById).mockResolvedValue(makeJob());
      vi.mocked(repo.updateAsyncJob).mockResolvedValue(makeJob());

      await queue.updateProgress(UUID_1, -10);
      expect(repo.updateAsyncJob).toHaveBeenCalledWith(UUID_1, { progress: 0 });
    });

    it('should throw JobNotFoundError if job does not exist', async () => {
      vi.mocked(repo.findAsyncJobById).mockResolvedValue(null);
      await expect(queue.updateProgress(UUID_1, 50)).rejects.toThrow(JobNotFoundError);
    });
  });

  // ===========================================================================
  // completeJob
  // ===========================================================================

  describe('completeJob', () => {
    it('should set status to completed with progress 100', async () => {
      vi.mocked(repo.findAsyncJobById).mockResolvedValue(makeJob({ status: 'running' }));
      vi.mocked(repo.updateAsyncJob).mockResolvedValue(makeJob({ status: 'completed' }));

      await queue.completeJob(UUID_1, { result: 'done' });

      expect(repo.updateAsyncJob).toHaveBeenCalledWith(UUID_1, {
        status: 'completed',
        progress: 100,
        completedAt: expect.any(Date),
        output: { result: 'done' },
      });
    });

    it('should complete without output', async () => {
      vi.mocked(repo.findAsyncJobById).mockResolvedValue(makeJob({ status: 'running' }));
      vi.mocked(repo.updateAsyncJob).mockResolvedValue(makeJob({ status: 'completed' }));

      await queue.completeJob(UUID_1);

      expect(repo.updateAsyncJob).toHaveBeenCalledWith(UUID_1, {
        status: 'completed',
        progress: 100,
        completedAt: expect.any(Date),
      });
    });

    it('should throw JobNotFoundError if job does not exist', async () => {
      vi.mocked(repo.findAsyncJobById).mockResolvedValue(null);
      await expect(queue.completeJob(UUID_1)).rejects.toThrow(JobNotFoundError);
    });
  });

  // ===========================================================================
  // failJob — retry logic & exponential backoff
  // ===========================================================================

  describe('failJob', () => {
    it('should re-queue with backoff when retries remain', async () => {
      const job = makeJob({ status: 'running', attempts: 1, maxAttempts: 3 });
      vi.mocked(repo.findAsyncJobById).mockResolvedValue(job);
      vi.mocked(repo.updateAsyncJob).mockResolvedValue(makeJob());

      await queue.failJob(UUID_1, { code: 'ERR', message: 'fail' });

      expect(repo.updateAsyncJob).toHaveBeenCalledWith(UUID_1, {
        status: 'queued',
        error: { code: 'ERR', message: 'fail' },
        nextRunAt: expect.any(Date),
        startedAt: null,
      });

      // Verify backoff: 10 * 2^(1-1) = 10 seconds
      const nextRunAt = vi.mocked(repo.updateAsyncJob).mock.calls[0][1].nextRunAt as Date;
      const diffMs = nextRunAt.getTime() - Date.now();
      expect(diffMs).toBeGreaterThan(8000); // ~10s, allow for test execution time
      expect(diffMs).toBeLessThan(15000);
    });

    it('should use exponential backoff: attempt 2 → 20s delay', async () => {
      const job = makeJob({ status: 'running', attempts: 2, maxAttempts: 3 });
      vi.mocked(repo.findAsyncJobById).mockResolvedValue(job);
      vi.mocked(repo.updateAsyncJob).mockResolvedValue(makeJob());

      await queue.failJob(UUID_1, { code: 'ERR', message: 'fail' });

      // Backoff: 10 * 2^(2-1) = 20 seconds
      const nextRunAt = vi.mocked(repo.updateAsyncJob).mock.calls[0][1].nextRunAt as Date;
      const diffMs = nextRunAt.getTime() - Date.now();
      expect(diffMs).toBeGreaterThan(18000);
      expect(diffMs).toBeLessThan(25000);
    });

    it('should cap backoff at 1800 seconds', async () => {
      const job = makeJob({ status: 'running', attempts: 9, maxAttempts: 10 });
      vi.mocked(repo.findAsyncJobById).mockResolvedValue(job);
      vi.mocked(repo.updateAsyncJob).mockResolvedValue(makeJob());

      await queue.failJob(UUID_1, { code: 'ERR', message: 'fail' });

      // 10 * 2^8 = 2560, capped at 1800
      const nextRunAt = vi.mocked(repo.updateAsyncJob).mock.calls[0][1].nextRunAt as Date;
      const diffMs = nextRunAt.getTime() - Date.now();
      expect(diffMs).toBeLessThanOrEqual(1805000); // 1800s + tolerance
    });

    it('should mark as permanently failed when max attempts exhausted', async () => {
      const job = makeJob({ status: 'running', attempts: 3, maxAttempts: 3 });
      vi.mocked(repo.findAsyncJobById).mockResolvedValue(job);
      vi.mocked(repo.updateAsyncJob).mockResolvedValue(makeJob({ status: 'failed' }));

      await queue.failJob(UUID_1, { code: 'ERR', message: 'final' });

      expect(repo.updateAsyncJob).toHaveBeenCalledWith(UUID_1, {
        status: 'failed',
        error: { code: 'ERR', message: 'final' },
        completedAt: expect.any(Date),
      });
    });

    it('should throw JobNotFoundError if job does not exist', async () => {
      vi.mocked(repo.findAsyncJobById).mockResolvedValue(null);
      await expect(queue.failJob(UUID_1, { message: 'err' })).rejects.toThrow(JobNotFoundError);
    });
  });

  // ===========================================================================
  // cancelJob
  // ===========================================================================

  describe('cancelJob', () => {
    it('should cancel a queued job', async () => {
      vi.mocked(repo.findAsyncJobById).mockResolvedValue(makeJob({ status: 'queued' }));
      vi.mocked(repo.updateAsyncJob).mockResolvedValue(makeJob({ status: 'cancelled' }));

      await queue.cancelJob(UUID_1);

      expect(repo.updateAsyncJob).toHaveBeenCalledWith(UUID_1, {
        status: 'cancelled',
        completedAt: expect.any(Date),
      });
    });

    it('should cancel a running job', async () => {
      vi.mocked(repo.findAsyncJobById).mockResolvedValue(makeJob({ status: 'running' }));
      vi.mocked(repo.updateAsyncJob).mockResolvedValue(makeJob({ status: 'cancelled' }));

      await queue.cancelJob(UUID_1);

      expect(repo.updateAsyncJob).toHaveBeenCalledWith(UUID_1, {
        status: 'cancelled',
        completedAt: expect.any(Date),
      });
    });

    it('should throw JobNotCancellableError for completed job', async () => {
      vi.mocked(repo.findAsyncJobById).mockResolvedValue(makeJob({ status: 'completed' }));
      await expect(queue.cancelJob(UUID_1)).rejects.toThrow(JobNotCancellableError);
    });

    it('should throw JobNotCancellableError for failed job', async () => {
      vi.mocked(repo.findAsyncJobById).mockResolvedValue(makeJob({ status: 'failed' }));
      await expect(queue.cancelJob(UUID_1)).rejects.toThrow(JobNotCancellableError);
    });

    it('should throw JobNotCancellableError for cancelled job', async () => {
      vi.mocked(repo.findAsyncJobById).mockResolvedValue(makeJob({ status: 'cancelled' }));
      await expect(queue.cancelJob(UUID_1)).rejects.toThrow(JobNotCancellableError);
    });

    it('should throw JobNotFoundError if job does not exist', async () => {
      vi.mocked(repo.findAsyncJobById).mockResolvedValue(null);
      await expect(queue.cancelJob(UUID_1)).rejects.toThrow(JobNotFoundError);
    });
  });

  // ===========================================================================
  // retryJob
  // ===========================================================================

  describe('retryJob', () => {
    it('should reset failed job to queued state', async () => {
      vi.mocked(repo.findAsyncJobById).mockResolvedValue(
        makeJob({ status: 'failed', attempts: 3 })
      );
      vi.mocked(repo.updateAsyncJob).mockResolvedValue(makeJob({ status: 'queued' }));

      await queue.retryJob(UUID_1);

      expect(repo.updateAsyncJob).toHaveBeenCalledWith(UUID_1, {
        status: 'queued',
        error: null,
        progress: 0,
        attempts: 0,
        nextRunAt: null,
        startedAt: null,
        completedAt: null,
      });
    });

    it('should throw JobNotRetryableError for non-failed job', async () => {
      vi.mocked(repo.findAsyncJobById).mockResolvedValue(makeJob({ status: 'running' }));
      await expect(queue.retryJob(UUID_1)).rejects.toThrow(JobNotRetryableError);
    });

    it('should throw JobNotRetryableError for queued job', async () => {
      vi.mocked(repo.findAsyncJobById).mockResolvedValue(makeJob({ status: 'queued' }));
      await expect(queue.retryJob(UUID_1)).rejects.toThrow(JobNotRetryableError);
    });

    it('should throw JobNotFoundError if job does not exist', async () => {
      vi.mocked(repo.findAsyncJobById).mockResolvedValue(null);
      await expect(queue.retryJob(UUID_1)).rejects.toThrow(JobNotFoundError);
    });
  });

  // ===========================================================================
  // detectTimeouts
  // ===========================================================================

  describe('detectTimeouts', () => {
    it('should delegate to repo.detectAndFailTimedOutJobs', async () => {
      vi.mocked(repo.detectAndFailTimedOutJobs).mockResolvedValue(3);

      const count = await queue.detectTimeouts();

      expect(repo.detectAndFailTimedOutJobs).toHaveBeenCalled();
      expect(count).toBe(3);
    });

    it('should return 0 when no timeouts detected', async () => {
      vi.mocked(repo.detectAndFailTimedOutJobs).mockResolvedValue(0);
      expect(await queue.detectTimeouts()).toBe(0);
    });
  });
});
