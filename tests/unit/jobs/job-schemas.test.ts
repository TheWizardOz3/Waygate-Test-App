/**
 * Async Job Schemas Unit Tests
 *
 * Tests for Zod validation schemas, response formatters, and error codes.
 */

import { describe, it, expect } from 'vitest';
import {
  AsyncJobStatusSchema,
  AsyncJobItemStatusSchema,
  AsyncJobTypeSchema,
  EnqueueJobInputSchema,
  EnqueueJobItemInputSchema,
  EnqueueBatchJobInputSchema,
  ListJobsQuerySchema,
  ListJobItemsQuerySchema,
  AsyncJobResponseSchema,
  AsyncJobDetailResponseSchema,
  toAsyncJobResponse,
  toAsyncJobItemResponse,
  JobErrorCodes,
} from '@/lib/modules/jobs/jobs.schemas';

// Valid v4 UUIDs for testing
const UUID_1 = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
const UUID_2 = 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e';

// =============================================================================
// Enum Schema Tests
// =============================================================================

describe('AsyncJobStatusSchema', () => {
  it('should accept valid statuses', () => {
    expect(AsyncJobStatusSchema.parse('queued')).toBe('queued');
    expect(AsyncJobStatusSchema.parse('running')).toBe('running');
    expect(AsyncJobStatusSchema.parse('completed')).toBe('completed');
    expect(AsyncJobStatusSchema.parse('failed')).toBe('failed');
    expect(AsyncJobStatusSchema.parse('cancelled')).toBe('cancelled');
  });

  it('should reject invalid statuses', () => {
    expect(() => AsyncJobStatusSchema.parse('pending')).toThrow();
    expect(() => AsyncJobStatusSchema.parse('active')).toThrow();
    expect(() => AsyncJobStatusSchema.parse('')).toThrow();
  });
});

describe('AsyncJobItemStatusSchema', () => {
  it('should accept valid item statuses', () => {
    expect(AsyncJobItemStatusSchema.parse('pending')).toBe('pending');
    expect(AsyncJobItemStatusSchema.parse('running')).toBe('running');
    expect(AsyncJobItemStatusSchema.parse('completed')).toBe('completed');
    expect(AsyncJobItemStatusSchema.parse('failed')).toBe('failed');
    expect(AsyncJobItemStatusSchema.parse('skipped')).toBe('skipped');
  });

  it('should reject invalid item statuses', () => {
    expect(() => AsyncJobItemStatusSchema.parse('queued')).toThrow();
    expect(() => AsyncJobItemStatusSchema.parse('cancelled')).toThrow();
  });
});

describe('AsyncJobTypeSchema', () => {
  it('should accept valid job types', () => {
    expect(AsyncJobTypeSchema.parse('batch_operation')).toBe('batch_operation');
    expect(AsyncJobTypeSchema.parse('schema_drift')).toBe('schema_drift');
    expect(AsyncJobTypeSchema.parse('scrape')).toBe('scrape');
  });

  it('should reject invalid job types', () => {
    expect(() => AsyncJobTypeSchema.parse('unknown')).toThrow();
    expect(() => AsyncJobTypeSchema.parse('')).toThrow();
  });
});

// =============================================================================
// Enqueue Input Schema Tests
// =============================================================================

describe('EnqueueJobInputSchema', () => {
  it('should accept valid input with defaults', () => {
    const result = EnqueueJobInputSchema.parse({ type: 'batch_operation' });
    expect(result.type).toBe('batch_operation');
    expect(result.maxAttempts).toBe(3);
    expect(result.timeoutSeconds).toBe(300);
  });

  it('should accept full input', () => {
    const result = EnqueueJobInputSchema.parse({
      type: 'schema_drift',
      tenantId: UUID_1,
      input: { key: 'value' },
      maxAttempts: 5,
      timeoutSeconds: 600,
    });
    expect(result.type).toBe('schema_drift');
    expect(result.tenantId).toBe(UUID_1);
    expect(result.input).toEqual({ key: 'value' });
    expect(result.maxAttempts).toBe(5);
    expect(result.timeoutSeconds).toBe(600);
  });

  it('should accept null tenantId for system-level jobs', () => {
    const result = EnqueueJobInputSchema.parse({
      type: 'scrape',
      tenantId: null,
    });
    expect(result.tenantId).toBeNull();
  });

  it('should reject empty type', () => {
    expect(() => EnqueueJobInputSchema.parse({ type: '' })).toThrow();
  });

  it('should reject maxAttempts below minimum', () => {
    expect(() => EnqueueJobInputSchema.parse({ type: 'scrape', maxAttempts: 0 })).toThrow();
  });

  it('should reject maxAttempts above maximum', () => {
    expect(() => EnqueueJobInputSchema.parse({ type: 'scrape', maxAttempts: 11 })).toThrow();
  });

  it('should reject timeoutSeconds below minimum', () => {
    expect(() => EnqueueJobInputSchema.parse({ type: 'scrape', timeoutSeconds: 10 })).toThrow();
  });

  it('should reject timeoutSeconds above maximum', () => {
    expect(() => EnqueueJobInputSchema.parse({ type: 'scrape', timeoutSeconds: 7200 })).toThrow();
  });

  it('should reject invalid tenantId format', () => {
    expect(() => EnqueueJobInputSchema.parse({ type: 'scrape', tenantId: 'not-a-uuid' })).toThrow();
  });
});

describe('EnqueueJobItemInputSchema', () => {
  it('should accept item with input', () => {
    const result = EnqueueJobItemInputSchema.parse({ input: { recordId: '123' } });
    expect(result.input).toEqual({ recordId: '123' });
  });

  it('should accept item without input', () => {
    const result = EnqueueJobItemInputSchema.parse({});
    expect(result.input).toBeUndefined();
  });
});

describe('EnqueueBatchJobInputSchema', () => {
  it('should accept batch input with items', () => {
    const result = EnqueueBatchJobInputSchema.parse({
      type: 'batch_operation',
      items: [{ input: { id: 1 } }, { input: { id: 2 } }],
    });
    expect(result.items).toHaveLength(2);
    expect(result.maxAttempts).toBe(3);
  });

  it('should reject empty items array', () => {
    expect(() =>
      EnqueueBatchJobInputSchema.parse({ type: 'batch_operation', items: [] })
    ).toThrow();
  });

  it('should accept max 10000 items', () => {
    const items = Array.from({ length: 10000 }, () => ({}));
    const result = EnqueueBatchJobInputSchema.parse({
      type: 'batch_operation',
      items,
    });
    expect(result.items).toHaveLength(10000);
  });

  it('should reject more than 10000 items', () => {
    const items = Array.from({ length: 10001 }, () => ({}));
    expect(() => EnqueueBatchJobInputSchema.parse({ type: 'batch_operation', items })).toThrow();
  });
});

// =============================================================================
// Query Schema Tests
// =============================================================================

describe('ListJobsQuerySchema', () => {
  it('should apply defaults', () => {
    const result = ListJobsQuerySchema.parse({});
    expect(result.limit).toBe(20);
  });

  it('should accept valid query params', () => {
    const result = ListJobsQuerySchema.parse({
      cursor: UUID_1,
      limit: 50,
      type: 'batch_operation',
      status: 'running',
    });
    expect(result.cursor).toBe(UUID_1);
    expect(result.limit).toBe(50);
    expect(result.type).toBe('batch_operation');
    expect(result.status).toBe('running');
  });

  it('should coerce string limit to number', () => {
    const result = ListJobsQuerySchema.parse({ limit: '10' });
    expect(result.limit).toBe(10);
  });

  it('should reject limit below 1', () => {
    expect(() => ListJobsQuerySchema.parse({ limit: 0 })).toThrow();
  });

  it('should reject limit above 100', () => {
    expect(() => ListJobsQuerySchema.parse({ limit: 101 })).toThrow();
  });

  it('should reject invalid status', () => {
    expect(() => ListJobsQuerySchema.parse({ status: 'invalid' })).toThrow();
  });
});

describe('ListJobItemsQuerySchema', () => {
  it('should apply defaults', () => {
    const result = ListJobItemsQuerySchema.parse({});
    expect(result.limit).toBe(20);
  });

  it('should accept valid item status filter', () => {
    const result = ListJobItemsQuerySchema.parse({ status: 'pending' });
    expect(result.status).toBe('pending');
  });

  it('should reject invalid item status', () => {
    expect(() => ListJobItemsQuerySchema.parse({ status: 'queued' })).toThrow();
  });
});

// =============================================================================
// Response Schema Tests
// =============================================================================

describe('AsyncJobResponseSchema', () => {
  const validResponse = {
    id: UUID_1,
    tenantId: UUID_2,
    type: 'batch_operation',
    status: 'running',
    input: { key: 'value' },
    output: null,
    error: null,
    progress: 50,
    progressDetails: { stage: 'processing' },
    attempts: 1,
    maxAttempts: 3,
    timeoutSeconds: 300,
    nextRunAt: null,
    startedAt: '2025-01-01T00:00:00.000Z',
    completedAt: null,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  };

  it('should accept valid response', () => {
    const result = AsyncJobResponseSchema.parse(validResponse);
    expect(result.id).toBe(UUID_1);
    expect(result.progress).toBe(50);
  });

  it('should accept null tenantId', () => {
    const result = AsyncJobResponseSchema.parse({ ...validResponse, tenantId: null });
    expect(result.tenantId).toBeNull();
  });

  it('should reject progress above 100', () => {
    expect(() => AsyncJobResponseSchema.parse({ ...validResponse, progress: 101 })).toThrow();
  });

  it('should reject progress below 0', () => {
    expect(() => AsyncJobResponseSchema.parse({ ...validResponse, progress: -1 })).toThrow();
  });
});

describe('AsyncJobDetailResponseSchema', () => {
  it('should include itemCounts', () => {
    const result = AsyncJobDetailResponseSchema.parse({
      id: UUID_1,
      tenantId: null,
      type: 'batch_operation',
      status: 'running',
      input: null,
      output: null,
      error: null,
      progress: 45,
      progressDetails: null,
      attempts: 1,
      maxAttempts: 3,
      timeoutSeconds: 300,
      nextRunAt: null,
      startedAt: '2025-01-01T00:00:00.000Z',
      completedAt: null,
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
      itemCounts: {
        total: 100,
        pending: 55,
        running: 5,
        completed: 40,
        failed: 0,
        skipped: 0,
      },
    });
    expect(result.itemCounts.total).toBe(100);
    expect(result.itemCounts.completed).toBe(40);
  });
});

// =============================================================================
// Response Formatter Tests
// =============================================================================

describe('toAsyncJobResponse', () => {
  it('should convert DB job to API response', () => {
    const now = new Date();
    const dbJob = {
      id: UUID_1,
      tenantId: UUID_2,
      type: 'batch_operation',
      status: 'running',
      input: { key: 'value' },
      output: null,
      error: null,
      progress: 50,
      progressDetails: { stage: 'processing' },
      attempts: 1,
      maxAttempts: 3,
      timeoutSeconds: 300,
      nextRunAt: null,
      startedAt: now,
      completedAt: null,
      createdAt: now,
      updatedAt: now,
    };

    const result = toAsyncJobResponse(dbJob);
    expect(result.id).toBe(UUID_1);
    expect(result.tenantId).toBe(UUID_2);
    expect(result.type).toBe('batch_operation');
    expect(result.status).toBe('running');
    expect(result.input).toEqual({ key: 'value' });
    expect(result.output).toBeNull();
    expect(result.progress).toBe(50);
    expect(result.startedAt).toBe(now.toISOString());
    expect(result.completedAt).toBeNull();
    expect(result.createdAt).toBe(now.toISOString());
  });

  it('should handle null dates', () => {
    const now = new Date();
    const result = toAsyncJobResponse({
      id: UUID_1,
      tenantId: null,
      type: 'scrape',
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
      createdAt: now,
      updatedAt: now,
    });
    expect(result.tenantId).toBeNull();
    expect(result.nextRunAt).toBeNull();
    expect(result.startedAt).toBeNull();
    expect(result.completedAt).toBeNull();
  });

  it('should convert nextRunAt Date to ISO string', () => {
    const now = new Date();
    const nextRun = new Date(now.getTime() + 60000);
    const result = toAsyncJobResponse({
      id: UUID_1,
      tenantId: null,
      type: 'scrape',
      status: 'queued',
      input: null,
      output: null,
      error: null,
      progress: 0,
      progressDetails: null,
      attempts: 1,
      maxAttempts: 3,
      timeoutSeconds: 300,
      nextRunAt: nextRun,
      startedAt: null,
      completedAt: null,
      createdAt: now,
      updatedAt: now,
    });
    expect(result.nextRunAt).toBe(nextRun.toISOString());
  });
});

describe('toAsyncJobItemResponse', () => {
  it('should convert DB item to API response', () => {
    const now = new Date();
    const result = toAsyncJobItemResponse({
      id: UUID_1,
      jobId: UUID_2,
      status: 'completed',
      input: { recordId: '123' },
      output: { success: true },
      error: null,
      attempts: 1,
      createdAt: now,
      completedAt: now,
    });
    expect(result.id).toBe(UUID_1);
    expect(result.jobId).toBe(UUID_2);
    expect(result.status).toBe('completed');
    expect(result.input).toEqual({ recordId: '123' });
    expect(result.output).toEqual({ success: true });
    expect(result.error).toBeNull();
    expect(result.completedAt).toBe(now.toISOString());
  });

  it('should handle null completedAt', () => {
    const now = new Date();
    const result = toAsyncJobItemResponse({
      id: UUID_1,
      jobId: UUID_2,
      status: 'pending',
      input: null,
      output: null,
      error: null,
      attempts: 0,
      createdAt: now,
      completedAt: null,
    });
    expect(result.completedAt).toBeNull();
  });
});

// =============================================================================
// Error Codes Tests
// =============================================================================

describe('JobErrorCodes', () => {
  it('should contain all expected error codes', () => {
    expect(JobErrorCodes.JOB_NOT_FOUND).toBe('JOB_NOT_FOUND');
    expect(JobErrorCodes.JOB_ITEM_NOT_FOUND).toBe('JOB_ITEM_NOT_FOUND');
    expect(JobErrorCodes.INVALID_INPUT).toBe('INVALID_INPUT');
    expect(JobErrorCodes.INVALID_STATUS).toBe('INVALID_STATUS');
    expect(JobErrorCodes.JOB_NOT_CANCELLABLE).toBe('JOB_NOT_CANCELLABLE');
    expect(JobErrorCodes.JOB_NOT_RETRYABLE).toBe('JOB_NOT_RETRYABLE');
    expect(JobErrorCodes.JOB_TIMEOUT).toBe('JOB_TIMEOUT');
    expect(JobErrorCodes.MAX_ATTEMPTS_EXCEEDED).toBe('MAX_ATTEMPTS_EXCEEDED');
    expect(JobErrorCodes.HANDLER_NOT_FOUND).toBe('HANDLER_NOT_FOUND');
    expect(JobErrorCodes.CONCURRENCY_LIMIT_REACHED).toBe('CONCURRENCY_LIMIT_REACHED');
  });

  it('should have exactly 10 error codes', () => {
    expect(Object.keys(JobErrorCodes)).toHaveLength(10);
  });
});
