/**
 * Batch Operations Error Classes
 *
 * Typed error classes for the batch operations system.
 */

import type { BatchItemValidationError } from './batch-operations.schemas';

/**
 * Base error class for batch-related errors
 */
export class BatchOperationError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number = 400
  ) {
    super(message);
    this.name = 'BatchOperationError';
  }
}

/**
 * Action does not have batch enabled
 */
export class BatchNotEnabledError extends BatchOperationError {
  constructor(actionSlug: string) {
    super('BATCH_NOT_ENABLED', `Batch not enabled for this action: ${actionSlug}`, 400);
    this.name = 'BatchNotEnabledError';
  }
}

/**
 * Batch items failed validation against the action's input schema
 */
export class BatchValidationError extends BatchOperationError {
  constructor(
    public itemErrors: BatchItemValidationError[],
    public validCount: number,
    public invalidCount: number
  ) {
    super(
      'BATCH_VALIDATION_ERROR',
      `${invalidCount} of ${validCount + invalidCount} items failed validation`,
      400
    );
    this.name = 'BatchValidationError';
  }
}

/**
 * Batch item count exceeds the action's maxItems limit
 */
export class BatchItemLimitExceededError extends BatchOperationError {
  constructor(itemCount: number, maxItems: number) {
    super(
      'BATCH_ITEM_LIMIT_EXCEEDED',
      `Batch contains ${itemCount} items, exceeds limit of ${maxItems}`,
      400
    );
    this.name = 'BatchItemLimitExceededError';
  }
}

/**
 * Bulk API call failed entirely
 */
export class BulkDispatchError extends BatchOperationError {
  constructor(
    message: string,
    public details?: Record<string, unknown>
  ) {
    super('BULK_DISPATCH_ERROR', message, 502);
    this.name = 'BulkDispatchError';
  }
}
