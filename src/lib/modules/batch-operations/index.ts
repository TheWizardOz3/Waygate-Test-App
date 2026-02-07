/**
 * Batch Operations Module
 *
 * Provides batch processing for action invocations with dual-path support:
 * - Bulk API routing (single API call for N items)
 * - Paced individual calls with rate limit awareness
 *
 * Registers the batch_operation job handler with the async job system.
 */

// Schemas
export {
  BatchConfigSchema,
  BulkConfigSchema,
  BatchOperationInputSchema,
  BatchOperationResponseSchema,
  BatchResultSummarySchema,
  BatchRequestConfigSchema,
  BatchErrorCodes,
  type BatchConfig,
  type BulkConfig,
  type BatchOperationInput,
  type BatchOperationResponse,
  type BatchResultSummary,
  type BatchItemValidationError,
} from './batch-operations.schemas';

// Errors
export {
  BatchOperationError,
  BatchNotEnabledError,
  BatchValidationError,
  BatchItemLimitExceededError,
  BulkDispatchError,
} from './batch-operations.errors';

// Service
export { submitBatchOperation } from './batch-operations.service';

// Tool export integration
export { generateBatchVariant, generateBatchVariants } from './batch-tool-variant';

// Rate limit tracker
export { rateLimitTracker } from './rate-limit-tracker';

// =============================================================================
// Handler Registration
// =============================================================================

import { registerJobHandler } from '@/lib/modules/jobs/jobs.handlers';
import { batchOperationHandler } from './batch-operations.handler';

/**
 * Register the batch_operation job handler.
 * Called as a side effect when this module is imported.
 */
registerJobHandler('batch_operation', {
  handler: batchOperationHandler,
  concurrencyLimit: 3,
});
