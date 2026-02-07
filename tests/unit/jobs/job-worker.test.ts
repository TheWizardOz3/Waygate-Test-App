/**
 * Job Worker Unit Tests
 *
 * Tests the worker cycle: timeout detection, claiming, handler dispatch,
 * concurrency limiting, success/failure lifecycle.
 *
 * Both the queue and repository are mocked to isolate worker logic.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AsyncJob, AsyncJobItem } from '@prisma/client';

// Mock dependencies
vi.mock('@/lib/modules/jobs/jobs.queue', () => ({
  jobQueue: {
    detectTimeouts: vi.fn(),
    claimNext: vi.fn(),
    completeJob: vi.fn(),
    failJob: vi.fn(),
    updateProgress: vi.fn(),
  },
}));

vi.mock('@/lib/modules/jobs/jobs.handlers', () => ({
  getJobTypeConfig: vi.fn(),
}));

vi.mock('@/lib/modules/jobs/jobs.repository', () => ({
  countRunningJobsByType: vi.fn(),
  updateAsyncJob: vi.fn(),
  findPendingItemsForJob: vi.fn(),
  updateAsyncJobItem: vi.fn(),
  batchUpdateJobItems: vi.fn(),
}));

import { jobQueue } from '@/lib/modules/jobs/jobs.queue';
import { getJobTypeConfig } from '@/lib/modules/jobs/jobs.handlers';
import * as repo from '@/lib/modules/jobs/jobs.repository';
import { runWorkerCycle } from '@/lib/modules/jobs/jobs.worker';
import { HandlerNotFoundError } from '@/lib/modules/jobs/jobs.errors';

const UUID_1 = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
const UUID_2 = 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e';

function makeJob(
  overrides: Partial<AsyncJob & { items: AsyncJobItem[] }> = {}
): AsyncJob & { items: AsyncJobItem[] } {
  return {
    id: UUID_1,
    tenantId: null,
    type: 'batch_operation',
    status: 'running',
    input: null,
    output: null,
    error: null,
    progress: 0,
    progressDetails: null,
    attempts: 1,
    maxAttempts: 3,
    timeoutSeconds: 300,
    nextRunAt: null,
    startedAt: new Date(),
    completedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    items: [],
    ...overrides,
  };
}

describe('runWorkerCycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ===========================================================================
  // Basic cycle flow
  // ===========================================================================

  describe('basic cycle flow', () => {
    it('should detect timeouts, claim jobs, and process them', async () => {
      vi.mocked(jobQueue.detectTimeouts).mockResolvedValue(2);
      vi.mocked(jobQueue.claimNext).mockResolvedValue([makeJob()]);
      vi.mocked(getJobTypeConfig).mockReturnValue({
        handler: vi.fn().mockResolvedValue({ result: 'ok' }),
      });
      vi.mocked(jobQueue.completeJob).mockResolvedValue(undefined);

      const result = await runWorkerCycle();

      expect(result.timedOut).toBe(2);
      expect(result.claimed).toBe(1);
      expect(result.succeeded).toBe(1);
      expect(result.failed).toBe(0);
      expect(result.jobs).toHaveLength(1);
      expect(result.jobs[0].result).toBe('succeeded');
    });

    it('should pass limit and type options to claimNext', async () => {
      vi.mocked(jobQueue.detectTimeouts).mockResolvedValue(0);
      vi.mocked(jobQueue.claimNext).mockResolvedValue([]);

      await runWorkerCycle({ limit: 5, type: 'schema_drift' });

      expect(jobQueue.claimNext).toHaveBeenCalledWith('schema_drift', 5);
    });

    it('should return zero counts when no jobs are queued', async () => {
      vi.mocked(jobQueue.detectTimeouts).mockResolvedValue(0);
      vi.mocked(jobQueue.claimNext).mockResolvedValue([]);

      const result = await runWorkerCycle();

      expect(result.timedOut).toBe(0);
      expect(result.claimed).toBe(0);
      expect(result.succeeded).toBe(0);
      expect(result.failed).toBe(0);
      expect(result.jobs).toHaveLength(0);
    });
  });

  // ===========================================================================
  // Handler dispatch
  // ===========================================================================

  describe('handler dispatch', () => {
    it('should call the handler with context including the job', async () => {
      const handler = vi.fn().mockResolvedValue(null);
      const job = makeJob();

      vi.mocked(jobQueue.detectTimeouts).mockResolvedValue(0);
      vi.mocked(jobQueue.claimNext).mockResolvedValue([job]);
      vi.mocked(getJobTypeConfig).mockReturnValue({ handler });
      vi.mocked(jobQueue.completeJob).mockResolvedValue(undefined);

      await runWorkerCycle();

      expect(handler).toHaveBeenCalledTimes(1);
      const ctx = handler.mock.calls[0][0];
      expect(ctx.job).toBe(job);
      expect(typeof ctx.updateProgress).toBe('function');
      expect(typeof ctx.getPendingItems).toBe('function');
      expect(typeof ctx.updateItem).toBe('function');
      expect(typeof ctx.batchUpdateItems).toBe('function');
    });

    it('should complete job with handler output', async () => {
      const handler = vi.fn().mockResolvedValue({ answer: 42 });

      vi.mocked(jobQueue.detectTimeouts).mockResolvedValue(0);
      vi.mocked(jobQueue.claimNext).mockResolvedValue([makeJob()]);
      vi.mocked(getJobTypeConfig).mockReturnValue({ handler });
      vi.mocked(jobQueue.completeJob).mockResolvedValue(undefined);

      await runWorkerCycle();

      expect(jobQueue.completeJob).toHaveBeenCalledWith(UUID_1, { answer: 42 });
    });

    it('should complete job with undefined when handler returns void', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);

      vi.mocked(jobQueue.detectTimeouts).mockResolvedValue(0);
      vi.mocked(jobQueue.claimNext).mockResolvedValue([makeJob()]);
      vi.mocked(getJobTypeConfig).mockReturnValue({ handler });
      vi.mocked(jobQueue.completeJob).mockResolvedValue(undefined);

      await runWorkerCycle();

      expect(jobQueue.completeJob).toHaveBeenCalledWith(UUID_1, undefined);
    });
  });

  // ===========================================================================
  // Handler failure
  // ===========================================================================

  describe('handler failure', () => {
    it('should call failJob when handler throws', async () => {
      const handler = vi.fn().mockRejectedValue(new Error('Handler exploded'));

      vi.mocked(jobQueue.detectTimeouts).mockResolvedValue(0);
      vi.mocked(jobQueue.claimNext).mockResolvedValue([makeJob()]);
      vi.mocked(getJobTypeConfig).mockReturnValue({ handler });
      vi.mocked(jobQueue.failJob).mockResolvedValue(undefined);

      const result = await runWorkerCycle();

      expect(jobQueue.failJob).toHaveBeenCalledWith(
        UUID_1,
        expect.objectContaining({
          code: 'HANDLER_ERROR',
          message: 'Handler exploded',
        })
      );
      expect(result.failed).toBe(1);
      expect(result.jobs[0].result).toBe('failed');
      expect(result.jobs[0].error).toBe('Handler exploded');
    });

    it('should use HANDLER_NOT_FOUND code when no handler registered', async () => {
      vi.mocked(jobQueue.detectTimeouts).mockResolvedValue(0);
      vi.mocked(jobQueue.claimNext).mockResolvedValue([makeJob({ type: 'unknown_type' })]);
      vi.mocked(getJobTypeConfig).mockImplementation(() => {
        throw new HandlerNotFoundError('unknown_type');
      });
      vi.mocked(jobQueue.failJob).mockResolvedValue(undefined);

      const result = await runWorkerCycle();

      expect(jobQueue.failJob).toHaveBeenCalledWith(
        UUID_1,
        expect.objectContaining({ code: 'HANDLER_NOT_FOUND' })
      );
      expect(result.failed).toBe(1);
    });
  });

  // ===========================================================================
  // Concurrency limiting
  // ===========================================================================

  describe('concurrency limiting', () => {
    it('should re-queue job when concurrency limit exceeded', async () => {
      const handler = vi.fn();
      const job = makeJob({ attempts: 2 });

      vi.mocked(jobQueue.detectTimeouts).mockResolvedValue(0);
      vi.mocked(jobQueue.claimNext).mockResolvedValue([job]);
      vi.mocked(getJobTypeConfig).mockReturnValue({ handler, concurrencyLimit: 2 });
      vi.mocked(repo.countRunningJobsByType).mockResolvedValue(3); // > limit of 2
      vi.mocked(repo.updateAsyncJob).mockResolvedValue(makeJob({ status: 'queued' }));

      const result = await runWorkerCycle();

      expect(handler).not.toHaveBeenCalled();
      expect(repo.updateAsyncJob).toHaveBeenCalledWith(job.id, {
        status: 'queued',
        startedAt: null,
        attempts: 1, // decremented from 2 → 1 (undo claim)
      });
      expect(result.failed).toBe(1);
      expect(result.jobs[0].error).toContain('Concurrency limit reached');
    });

    it('should proceed normally when under concurrency limit', async () => {
      const handler = vi.fn().mockResolvedValue(null);

      vi.mocked(jobQueue.detectTimeouts).mockResolvedValue(0);
      vi.mocked(jobQueue.claimNext).mockResolvedValue([makeJob()]);
      vi.mocked(getJobTypeConfig).mockReturnValue({ handler, concurrencyLimit: 5 });
      vi.mocked(repo.countRunningJobsByType).mockResolvedValue(3); // <= limit of 5
      vi.mocked(jobQueue.completeJob).mockResolvedValue(undefined);

      const result = await runWorkerCycle();

      expect(handler).toHaveBeenCalled();
      expect(result.succeeded).toBe(1);
    });

    it('should skip concurrency check when no limit configured', async () => {
      const handler = vi.fn().mockResolvedValue(null);

      vi.mocked(jobQueue.detectTimeouts).mockResolvedValue(0);
      vi.mocked(jobQueue.claimNext).mockResolvedValue([makeJob()]);
      vi.mocked(getJobTypeConfig).mockReturnValue({ handler }); // no concurrencyLimit
      vi.mocked(jobQueue.completeJob).mockResolvedValue(undefined);

      const result = await runWorkerCycle();

      expect(repo.countRunningJobsByType).not.toHaveBeenCalled();
      expect(result.succeeded).toBe(1);
    });

    it('should not check concurrency when limit is 0', async () => {
      const handler = vi.fn().mockResolvedValue(null);

      vi.mocked(jobQueue.detectTimeouts).mockResolvedValue(0);
      vi.mocked(jobQueue.claimNext).mockResolvedValue([makeJob()]);
      vi.mocked(getJobTypeConfig).mockReturnValue({ handler, concurrencyLimit: 0 });
      vi.mocked(jobQueue.completeJob).mockResolvedValue(undefined);

      const result = await runWorkerCycle();

      expect(repo.countRunningJobsByType).not.toHaveBeenCalled();
      expect(result.succeeded).toBe(1);
    });
  });

  // ===========================================================================
  // Multiple jobs in a cycle
  // ===========================================================================

  describe('multiple jobs', () => {
    it('should process multiple claimed jobs and count successes/failures', async () => {
      const job1 = makeJob({ id: UUID_1, type: 'batch_operation' });
      const job2 = makeJob({ id: UUID_2, type: 'schema_drift' });

      const handler1 = vi.fn().mockResolvedValue({ ok: true });
      const handler2 = vi.fn().mockRejectedValue(new Error('drift failed'));

      vi.mocked(jobQueue.detectTimeouts).mockResolvedValue(0);
      vi.mocked(jobQueue.claimNext).mockResolvedValue([job1, job2]);
      vi.mocked(getJobTypeConfig).mockImplementation((type) => {
        if (type === 'batch_operation') return { handler: handler1 };
        if (type === 'schema_drift') return { handler: handler2 };
        throw new HandlerNotFoundError(type);
      });
      vi.mocked(jobQueue.completeJob).mockResolvedValue(undefined);
      vi.mocked(jobQueue.failJob).mockResolvedValue(undefined);

      const result = await runWorkerCycle();

      expect(result.claimed).toBe(2);
      expect(result.succeeded).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.jobs).toHaveLength(2);
    });
  });

  // ===========================================================================
  // Handler context helpers
  // ===========================================================================

  describe('handler context helpers', () => {
    it('updateProgress in context should call jobQueue.updateProgress', async () => {
      const handler = vi.fn().mockImplementation(async (ctx) => {
        await ctx.updateProgress(50, { stage: 'halfway' });
      });

      vi.mocked(jobQueue.detectTimeouts).mockResolvedValue(0);
      vi.mocked(jobQueue.claimNext).mockResolvedValue([makeJob()]);
      vi.mocked(getJobTypeConfig).mockReturnValue({ handler });
      vi.mocked(jobQueue.updateProgress).mockResolvedValue(undefined);
      vi.mocked(jobQueue.completeJob).mockResolvedValue(undefined);

      await runWorkerCycle();

      expect(jobQueue.updateProgress).toHaveBeenCalledWith(UUID_1, 50, { stage: 'halfway' });
    });

    it('getPendingItems in context should call repo.findPendingItemsForJob', async () => {
      const handler = vi.fn().mockImplementation(async (ctx) => {
        await ctx.getPendingItems(50);
      });

      vi.mocked(jobQueue.detectTimeouts).mockResolvedValue(0);
      vi.mocked(jobQueue.claimNext).mockResolvedValue([makeJob()]);
      vi.mocked(getJobTypeConfig).mockReturnValue({ handler });
      vi.mocked(repo.findPendingItemsForJob).mockResolvedValue([]);
      vi.mocked(jobQueue.completeJob).mockResolvedValue(undefined);

      await runWorkerCycle();

      expect(repo.findPendingItemsForJob).toHaveBeenCalledWith(UUID_1, 50);
    });

    it('updateItem in context should call repo.updateAsyncJobItem', async () => {
      const handler = vi.fn().mockImplementation(async (ctx) => {
        await ctx.updateItem('item-1', { status: 'completed', output: { ok: true } });
      });

      vi.mocked(jobQueue.detectTimeouts).mockResolvedValue(0);
      vi.mocked(jobQueue.claimNext).mockResolvedValue([makeJob()]);
      vi.mocked(getJobTypeConfig).mockReturnValue({ handler });
      vi.mocked(repo.updateAsyncJobItem).mockResolvedValue({} as AsyncJobItem);
      vi.mocked(jobQueue.completeJob).mockResolvedValue(undefined);

      await runWorkerCycle();

      expect(repo.updateAsyncJobItem).toHaveBeenCalledWith('item-1', {
        status: 'completed',
        output: { ok: true },
        error: undefined,
        completedAt: undefined,
      });
    });

    it('batchUpdateItems in context should call repo.batchUpdateJobItems', async () => {
      const updates = [
        { id: 'item-1', data: { status: 'completed' } },
        { id: 'item-2', data: { status: 'failed', error: { msg: 'err' } } },
      ];
      const handler = vi.fn().mockImplementation(async (ctx) => {
        await ctx.batchUpdateItems(updates);
      });

      vi.mocked(jobQueue.detectTimeouts).mockResolvedValue(0);
      vi.mocked(jobQueue.claimNext).mockResolvedValue([makeJob()]);
      vi.mocked(getJobTypeConfig).mockReturnValue({ handler });
      vi.mocked(repo.batchUpdateJobItems).mockResolvedValue(undefined);
      vi.mocked(jobQueue.completeJob).mockResolvedValue(undefined);

      await runWorkerCycle();

      expect(repo.batchUpdateJobItems).toHaveBeenCalledWith([
        {
          id: 'item-1',
          data: {
            status: 'completed',
            output: undefined,
            error: undefined,
            completedAt: undefined,
          },
        },
        {
          id: 'item-2',
          data: {
            status: 'failed',
            output: undefined,
            error: { msg: 'err' },
            completedAt: undefined,
          },
        },
      ]);
    });
  });
});
