/**
 * Async Job Errors Unit Tests
 *
 * Tests for typed error classes: codes, messages, status codes, inheritance.
 */

import { describe, it, expect } from 'vitest';
import {
  JobError,
  JobNotFoundError,
  JobItemNotFoundError,
  JobNotCancellableError,
  JobNotRetryableError,
  JobTimeoutError,
  HandlerNotFoundError,
} from '@/lib/modules/jobs/jobs.errors';

describe('JobError (base)', () => {
  it('should create with code, message, and default statusCode', () => {
    const error = new JobError('TEST_CODE', 'Test message');
    expect(error.code).toBe('TEST_CODE');
    expect(error.message).toBe('Test message');
    expect(error.statusCode).toBe(400);
    expect(error.name).toBe('JobError');
  });

  it('should accept custom statusCode', () => {
    const error = new JobError('CUSTOM', 'Custom', 500);
    expect(error.statusCode).toBe(500);
  });

  it('should be an instance of Error', () => {
    const error = new JobError('TEST', 'msg');
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(JobError);
  });
});

describe('JobNotFoundError', () => {
  it('should have correct properties', () => {
    const error = new JobNotFoundError('job-123');
    expect(error.code).toBe('JOB_NOT_FOUND');
    expect(error.message).toBe('Job not found: job-123');
    expect(error.statusCode).toBe(404);
    expect(error.name).toBe('JobNotFoundError');
  });

  it('should be an instance of JobError', () => {
    expect(new JobNotFoundError('x')).toBeInstanceOf(JobError);
  });
});

describe('JobItemNotFoundError', () => {
  it('should have correct properties', () => {
    const error = new JobItemNotFoundError('item-456');
    expect(error.code).toBe('JOB_ITEM_NOT_FOUND');
    expect(error.message).toBe('Job item not found: item-456');
    expect(error.statusCode).toBe(404);
    expect(error.name).toBe('JobItemNotFoundError');
  });
});

describe('JobNotCancellableError', () => {
  it('should include current status in message', () => {
    const error = new JobNotCancellableError('job-1', 'completed');
    expect(error.code).toBe('JOB_NOT_CANCELLABLE');
    expect(error.message).toBe('Job job-1 cannot be cancelled (status: completed)');
    expect(error.statusCode).toBe(409);
    expect(error.name).toBe('JobNotCancellableError');
  });
});

describe('JobNotRetryableError', () => {
  it('should include current status in message', () => {
    const error = new JobNotRetryableError('job-2', 'running');
    expect(error.code).toBe('JOB_NOT_RETRYABLE');
    expect(error.message).toBe('Job job-2 cannot be retried (status: running)');
    expect(error.statusCode).toBe(409);
    expect(error.name).toBe('JobNotRetryableError');
  });
});

describe('JobTimeoutError', () => {
  it('should include timeout in message', () => {
    const error = new JobTimeoutError('job-3', 300);
    expect(error.code).toBe('JOB_TIMEOUT');
    expect(error.message).toBe('Job job-3 timed out after 300s');
    expect(error.statusCode).toBe(408);
    expect(error.name).toBe('JobTimeoutError');
  });
});

describe('HandlerNotFoundError', () => {
  it('should include job type in message', () => {
    const error = new HandlerNotFoundError('unknown_type');
    expect(error.code).toBe('HANDLER_NOT_FOUND');
    expect(error.message).toBe('No handler registered for job type: unknown_type');
    expect(error.statusCode).toBe(500);
    expect(error.name).toBe('HandlerNotFoundError');
  });
});
