/**
 * Async Job Schemas
 *
 * Zod schemas for async job validation, CRUD operations, and API responses.
 * Async jobs provide background processing infrastructure for batch operations,
 * schema drift detection, and other async work.
 */

import { z } from 'zod';

// =============================================================================
// Enums
// =============================================================================

/**
 * Async job status
 */
export const AsyncJobStatusSchema = z.enum([
  'queued',
  'running',
  'completed',
  'failed',
  'cancelled',
]);
export type AsyncJobStatus = z.infer<typeof AsyncJobStatusSchema>;

/**
 * Async job item status
 */
export const AsyncJobItemStatusSchema = z.enum([
  'pending',
  'running',
  'completed',
  'failed',
  'skipped',
]);
export type AsyncJobItemStatus = z.infer<typeof AsyncJobItemStatusSchema>;

/**
 * Known job types (extensible — downstream features register new types)
 */
export const AsyncJobTypeSchema = z.enum(['batch_operation', 'schema_drift', 'scrape']);
export type AsyncJobType = z.infer<typeof AsyncJobTypeSchema>;

// =============================================================================
// Enqueue Input Schemas
// =============================================================================

/**
 * Input for enqueuing a single async job
 */
export const EnqueueJobInputSchema = z.object({
  type: z.string().min(1),
  tenantId: z.string().uuid().nullable().optional(),
  input: z.record(z.string(), z.unknown()).optional(),
  maxAttempts: z.number().int().min(1).max(10).default(3),
  timeoutSeconds: z.number().int().min(30).max(3600).default(300),
});
export type EnqueueJobInput = z.infer<typeof EnqueueJobInputSchema>;

/**
 * Input for a single batch job item
 */
export const EnqueueJobItemInputSchema = z.object({
  input: z.record(z.string(), z.unknown()).optional(),
});
export type EnqueueJobItemInput = z.infer<typeof EnqueueJobItemInputSchema>;

/**
 * Input for enqueuing a batch job (parent + items)
 */
export const EnqueueBatchJobInputSchema = EnqueueJobInputSchema.extend({
  items: z.array(EnqueueJobItemInputSchema).min(1).max(10000),
});
export type EnqueueBatchJobInput = z.infer<typeof EnqueueBatchJobInputSchema>;

// =============================================================================
// Query Schemas
// =============================================================================

/**
 * Internal filters for service layer
 */
export const AsyncJobFiltersSchema = z.object({
  type: z.string().optional(),
  status: AsyncJobStatusSchema.optional(),
  tenantId: z.string().uuid().optional(),
});
export type AsyncJobFilters = z.infer<typeof AsyncJobFiltersSchema>;

/**
 * API query parameters for listing jobs
 */
export const ListJobsQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  type: z.string().optional(),
  status: AsyncJobStatusSchema.optional(),
});
export type ListJobsQuery = z.infer<typeof ListJobsQuerySchema>;

/**
 * API query parameters for listing job items
 */
export const ListJobItemsQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: AsyncJobItemStatusSchema.optional(),
});
export type ListJobItemsQuery = z.infer<typeof ListJobItemsQuerySchema>;

// =============================================================================
// API Response Schemas
// =============================================================================

/**
 * Async job item as returned by the API
 */
export const AsyncJobItemResponseSchema = z.object({
  id: z.string().uuid(),
  jobId: z.string().uuid(),
  status: AsyncJobItemStatusSchema,
  input: z.record(z.string(), z.unknown()).nullable(),
  output: z.record(z.string(), z.unknown()).nullable(),
  error: z.record(z.string(), z.unknown()).nullable(),
  attempts: z.number().int(),
  createdAt: z.string(),
  completedAt: z.string().nullable(),
});
export type AsyncJobItemResponse = z.infer<typeof AsyncJobItemResponseSchema>;

/**
 * Async job as returned by the API
 */
export const AsyncJobResponseSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid().nullable(),
  type: z.string(),
  status: AsyncJobStatusSchema,
  input: z.record(z.string(), z.unknown()).nullable(),
  output: z.record(z.string(), z.unknown()).nullable(),
  error: z.record(z.string(), z.unknown()).nullable(),
  progress: z.number().int().min(0).max(100),
  progressDetails: z.record(z.string(), z.unknown()).nullable(),
  attempts: z.number().int(),
  maxAttempts: z.number().int(),
  timeoutSeconds: z.number().int(),
  nextRunAt: z.string().nullable(),
  startedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type AsyncJobResponse = z.infer<typeof AsyncJobResponseSchema>;

/**
 * Async job detail response (includes item summary counts)
 */
export const AsyncJobDetailResponseSchema = AsyncJobResponseSchema.extend({
  itemCounts: z.object({
    total: z.number().int(),
    pending: z.number().int(),
    running: z.number().int(),
    completed: z.number().int(),
    failed: z.number().int(),
    skipped: z.number().int(),
  }),
});
export type AsyncJobDetailResponse = z.infer<typeof AsyncJobDetailResponseSchema>;

/**
 * Paginated list of async jobs
 */
export const ListJobsResponseSchema = z.object({
  jobs: z.array(AsyncJobResponseSchema),
  pagination: z.object({
    cursor: z.string().nullable(),
    hasMore: z.boolean(),
    totalCount: z.number().int(),
  }),
});
export type ListJobsResponse = z.infer<typeof ListJobsResponseSchema>;

/**
 * Paginated list of async job items
 */
export const ListJobItemsResponseSchema = z.object({
  items: z.array(AsyncJobItemResponseSchema),
  pagination: z.object({
    cursor: z.string().nullable(),
    hasMore: z.boolean(),
    totalCount: z.number().int(),
  }),
});
export type ListJobItemsResponse = z.infer<typeof ListJobItemsResponseSchema>;

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Converts a database AsyncJob to API response format
 */
export function toAsyncJobResponse(job: {
  id: string;
  tenantId: string | null;
  type: string;
  status: string;
  input: unknown;
  output: unknown;
  error: unknown;
  progress: number;
  progressDetails: unknown;
  attempts: number;
  maxAttempts: number;
  timeoutSeconds: number;
  nextRunAt: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): AsyncJobResponse {
  return {
    id: job.id,
    tenantId: job.tenantId,
    type: job.type,
    status: job.status as AsyncJobStatus,
    input: (job.input as Record<string, unknown>) ?? null,
    output: (job.output as Record<string, unknown>) ?? null,
    error: (job.error as Record<string, unknown>) ?? null,
    progress: job.progress,
    progressDetails: (job.progressDetails as Record<string, unknown>) ?? null,
    attempts: job.attempts,
    maxAttempts: job.maxAttempts,
    timeoutSeconds: job.timeoutSeconds,
    nextRunAt: job.nextRunAt?.toISOString() ?? null,
    startedAt: job.startedAt?.toISOString() ?? null,
    completedAt: job.completedAt?.toISOString() ?? null,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
  };
}

/**
 * Converts a database AsyncJobItem to API response format
 */
export function toAsyncJobItemResponse(item: {
  id: string;
  jobId: string;
  status: string;
  input: unknown;
  output: unknown;
  error: unknown;
  attempts: number;
  createdAt: Date;
  completedAt: Date | null;
}): AsyncJobItemResponse {
  return {
    id: item.id,
    jobId: item.jobId,
    status: item.status as AsyncJobItemStatus,
    input: (item.input as Record<string, unknown>) ?? null,
    output: (item.output as Record<string, unknown>) ?? null,
    error: (item.error as Record<string, unknown>) ?? null,
    attempts: item.attempts,
    createdAt: item.createdAt.toISOString(),
    completedAt: item.completedAt?.toISOString() ?? null,
  };
}

// =============================================================================
// Error Codes
// =============================================================================

export const JobErrorCodes = {
  JOB_NOT_FOUND: 'JOB_NOT_FOUND',
  JOB_ITEM_NOT_FOUND: 'JOB_ITEM_NOT_FOUND',
  INVALID_INPUT: 'INVALID_INPUT',
  INVALID_STATUS: 'INVALID_STATUS',
  JOB_NOT_CANCELLABLE: 'JOB_NOT_CANCELLABLE',
  JOB_NOT_RETRYABLE: 'JOB_NOT_RETRYABLE',
  JOB_TIMEOUT: 'JOB_TIMEOUT',
  MAX_ATTEMPTS_EXCEEDED: 'MAX_ATTEMPTS_EXCEEDED',
  HANDLER_NOT_FOUND: 'HANDLER_NOT_FOUND',
  CONCURRENCY_LIMIT_REACHED: 'CONCURRENCY_LIMIT_REACHED',
} as const;
