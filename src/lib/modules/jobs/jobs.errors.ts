/**
 * Async Job Error Classes
 *
 * Typed error classes for the async job system.
 */

/**
 * Base error class for job-related errors
 */
export class JobError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number = 400
  ) {
    super(message);
    this.name = 'JobError';
  }
}

/**
 * Job not found
 */
export class JobNotFoundError extends JobError {
  constructor(jobId: string) {
    super('JOB_NOT_FOUND', `Job not found: ${jobId}`, 404);
    this.name = 'JobNotFoundError';
  }
}

/**
 * Job item not found
 */
export class JobItemNotFoundError extends JobError {
  constructor(itemId: string) {
    super('JOB_ITEM_NOT_FOUND', `Job item not found: ${itemId}`, 404);
    this.name = 'JobItemNotFoundError';
  }
}

/**
 * Job cannot be cancelled (not in queued or running state)
 */
export class JobNotCancellableError extends JobError {
  constructor(jobId: string, currentStatus: string) {
    super(
      'JOB_NOT_CANCELLABLE',
      `Job ${jobId} cannot be cancelled (status: ${currentStatus})`,
      409
    );
    this.name = 'JobNotCancellableError';
  }
}

/**
 * Job cannot be retried (not in failed state)
 */
export class JobNotRetryableError extends JobError {
  constructor(jobId: string, currentStatus: string) {
    super('JOB_NOT_RETRYABLE', `Job ${jobId} cannot be retried (status: ${currentStatus})`, 409);
    this.name = 'JobNotRetryableError';
  }
}

/**
 * Job timed out
 */
export class JobTimeoutError extends JobError {
  constructor(jobId: string, timeoutSeconds: number) {
    super('JOB_TIMEOUT', `Job ${jobId} timed out after ${timeoutSeconds}s`, 408);
    this.name = 'JobTimeoutError';
  }
}

/**
 * No handler registered for job type
 */
export class HandlerNotFoundError extends JobError {
  constructor(jobType: string) {
    super('HANDLER_NOT_FOUND', `No handler registered for job type: ${jobType}`, 500);
    this.name = 'HandlerNotFoundError';
  }
}
