/**
 * Batch Operations Schemas
 *
 * Zod schemas for batch input, configuration, bulk config, and responses.
 * These schemas validate batch API requests, per-action batch configuration,
 * and bulk API routing configuration.
 */

import { z } from 'zod';

// =============================================================================
// Batch Config (per-action behavior settings)
// =============================================================================

/**
 * Batch behavior configuration stored on Action.batchConfig.
 * Controls how batch operations behave for this action.
 */
export const BatchConfigSchema = z.object({
  /** Max items per batch (default 1000, max 10000) */
  maxItems: z.number().int().min(1).max(10000).default(1000),
  /** Default parallel items for individual path (1-20, default 5) */
  defaultConcurrency: z.number().int().min(1).max(20).default(5),
  /** Default delay between items in ms (0-5000, default 0) */
  defaultDelayMs: z.number().int().min(0).max(5000).default(0),
  /** Custom description for the batch tool variant */
  toolDescription: z.string().max(2000).optional(),
});
export type BatchConfig = z.infer<typeof BatchConfigSchema>;

// =============================================================================
// Bulk Config (optional bulk API routing)
// =============================================================================

/**
 * Response mapping for bulk API responses.
 * Maps bulk response fields to individual item results.
 */
export const BulkResponseMappingSchema = z.object({
  /** Field in response that maps to individual items */
  itemIdField: z.string().min(1),
  /** Field indicating per-item success */
  successField: z.string().min(1),
  /** Field containing per-item error details */
  errorField: z.string().min(1),
});
export type BulkResponseMapping = z.infer<typeof BulkResponseMappingSchema>;

/**
 * Bulk API routing configuration stored on Action.bulkConfig.
 * When present, enables the bulk API path (single API call for N items).
 */
export const BulkConfigSchema = z.object({
  /** Bulk API endpoint template */
  endpoint: z.string().min(1),
  /** HTTP method for bulk endpoint */
  httpMethod: z.enum(['POST', 'PUT', 'PATCH']),
  /** How to combine items into bulk payload */
  payloadTransform: z.enum(['array', 'csv', 'ndjson']),
  /** Wrapper key for payload (e.g., 'records' for { records: [...] }) */
  wrapperKey: z.string().optional(),
  /** Max items per single bulk API call */
  maxItemsPerCall: z.number().int().min(1).max(10000).default(200),
  /** Response mapping for per-item results */
  responseMapping: BulkResponseMappingSchema,
});
export type BulkConfig = z.infer<typeof BulkConfigSchema>;

// =============================================================================
// Batch Operation Input (API request)
// =============================================================================

/**
 * A single item in a batch request
 */
export const BatchItemInputSchema = z.object({
  /** Input parameters for this item (validated against action's input schema) */
  input: z.record(z.string(), z.unknown()),
});
export type BatchItemInput = z.infer<typeof BatchItemInputSchema>;

/**
 * Config overrides for a batch request (optional)
 */
export const BatchRequestConfigSchema = z.object({
  /** Override concurrency (1-20) */
  concurrency: z.number().int().min(1).max(20).optional(),
  /** Override delay between items in ms */
  delayMs: z.number().int().min(0).max(5000).optional(),
  /** Timeout per item in seconds */
  timeoutSeconds: z.number().int().min(30).max(3600).optional(),
  /** If true, skip invalid items instead of failing the whole batch */
  skipInvalidItems: z.boolean().default(false),
});
export type BatchRequestConfig = z.infer<typeof BatchRequestConfigSchema>;

/**
 * POST /api/v1/batch request body
 */
export const BatchOperationInputSchema = z.object({
  /** Integration slug (e.g., 'salesforce') */
  integrationSlug: z.string().min(1),
  /** Action slug (e.g., 'update-record') */
  actionSlug: z.string().min(1),
  /** Items to process */
  items: z.array(BatchItemInputSchema).min(1).max(10000),
  /** Optional config overrides */
  config: BatchRequestConfigSchema.optional(),
});
export type BatchOperationInput = z.infer<typeof BatchOperationInputSchema>;

// =============================================================================
// Batch Operation Response
// =============================================================================

/**
 * Response from POST /api/v1/batch (202 Accepted)
 */
export const BatchOperationResponseSchema = z.object({
  /** Created job ID */
  jobId: z.string().uuid(),
  /** Initial job status */
  status: z.literal('queued'),
  /** Number of items enqueued */
  itemCount: z.number().int(),
  /** Whether the bulk API path is available */
  hasBulkRoute: z.boolean(),
});
export type BatchOperationResponse = z.infer<typeof BatchOperationResponseSchema>;

// =============================================================================
// Batch Result Summary
// =============================================================================

/**
 * Summary of batch operation results (stored in job.output)
 */
export const BatchResultSummarySchema = z.object({
  /** Number of items that succeeded */
  succeeded: z.number().int().min(0),
  /** Number of items that failed */
  failed: z.number().int().min(0),
  /** Number of items skipped (e.g., cancelled) */
  skipped: z.number().int().min(0),
  /** Number of bulk API calls made (0 if individual path) */
  bulkCallsMade: z.number().int().min(0),
  /** Number of individual API calls made */
  individualCallsMade: z.number().int().min(0),
});
export type BatchResultSummary = z.infer<typeof BatchResultSummarySchema>;

// =============================================================================
// Item Validation Result
// =============================================================================

/**
 * Validation result for a single batch item
 */
export interface BatchItemValidationError {
  /** Index of the item in the input array */
  index: number;
  /** Validation errors for this item */
  errors: string[];
}

// =============================================================================
// Error Codes
// =============================================================================

export const BatchErrorCodes = {
  BATCH_NOT_ENABLED: 'BATCH_NOT_ENABLED',
  BATCH_VALIDATION_ERROR: 'BATCH_VALIDATION_ERROR',
  BATCH_OPERATION_ERROR: 'BATCH_OPERATION_ERROR',
  BATCH_ITEM_LIMIT_EXCEEDED: 'BATCH_ITEM_LIMIT_EXCEEDED',
  BULK_DISPATCH_ERROR: 'BULK_DISPATCH_ERROR',
} as const;
