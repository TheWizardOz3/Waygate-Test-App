/**
 * Batch Operations Schemas Unit Tests
 *
 * Tests for Zod validation schemas, error classes, and error codes.
 */

import { describe, it, expect } from 'vitest';
import {
  BatchConfigSchema,
  BulkConfigSchema,
  BatchOperationInputSchema,
  BatchOperationResponseSchema,
  BatchResultSummarySchema,
  BatchRequestConfigSchema,
  BatchErrorCodes,
} from '@/lib/modules/batch-operations/batch-operations.schemas';
import {
  BatchOperationError,
  BatchNotEnabledError,
  BatchValidationError,
  BatchItemLimitExceededError,
  BulkDispatchError,
} from '@/lib/modules/batch-operations/batch-operations.errors';

// =============================================================================
// BatchConfigSchema
// =============================================================================

describe('BatchConfigSchema', () => {
  it('should apply defaults for empty object', () => {
    const result = BatchConfigSchema.parse({});
    expect(result.maxItems).toBe(1000);
    expect(result.defaultConcurrency).toBe(5);
    expect(result.defaultDelayMs).toBe(0);
    expect(result.toolDescription).toBeUndefined();
  });

  it('should accept valid full config', () => {
    const result = BatchConfigSchema.parse({
      maxItems: 500,
      defaultConcurrency: 10,
      defaultDelayMs: 100,
      toolDescription: 'Custom batch description',
    });
    expect(result.maxItems).toBe(500);
    expect(result.defaultConcurrency).toBe(10);
    expect(result.defaultDelayMs).toBe(100);
    expect(result.toolDescription).toBe('Custom batch description');
  });

  it('should accept max boundary values', () => {
    const result = BatchConfigSchema.parse({
      maxItems: 10000,
      defaultConcurrency: 20,
      defaultDelayMs: 5000,
    });
    expect(result.maxItems).toBe(10000);
    expect(result.defaultConcurrency).toBe(20);
    expect(result.defaultDelayMs).toBe(5000);
  });

  it('should accept min boundary values', () => {
    const result = BatchConfigSchema.parse({
      maxItems: 1,
      defaultConcurrency: 1,
      defaultDelayMs: 0,
    });
    expect(result.maxItems).toBe(1);
    expect(result.defaultConcurrency).toBe(1);
    expect(result.defaultDelayMs).toBe(0);
  });

  it('should reject maxItems above 10000', () => {
    expect(() => BatchConfigSchema.parse({ maxItems: 10001 })).toThrow();
  });

  it('should reject maxItems below 1', () => {
    expect(() => BatchConfigSchema.parse({ maxItems: 0 })).toThrow();
  });

  it('should reject defaultConcurrency above 20', () => {
    expect(() => BatchConfigSchema.parse({ defaultConcurrency: 21 })).toThrow();
  });

  it('should reject defaultConcurrency below 1', () => {
    expect(() => BatchConfigSchema.parse({ defaultConcurrency: 0 })).toThrow();
  });

  it('should reject defaultDelayMs above 5000', () => {
    expect(() => BatchConfigSchema.parse({ defaultDelayMs: 5001 })).toThrow();
  });

  it('should reject defaultDelayMs below 0', () => {
    expect(() => BatchConfigSchema.parse({ defaultDelayMs: -1 })).toThrow();
  });

  it('should reject toolDescription longer than 2000 chars', () => {
    expect(() => BatchConfigSchema.parse({ toolDescription: 'a'.repeat(2001) })).toThrow();
  });
});

// =============================================================================
// BulkConfigSchema
// =============================================================================

describe('BulkConfigSchema', () => {
  const validBulkConfig = {
    endpoint: '/api/bulk/records',
    httpMethod: 'POST' as const,
    payloadTransform: 'array' as const,
    maxItemsPerCall: 200,
    responseMapping: {
      itemIdField: 'id',
      successField: 'success',
      errorField: 'error',
    },
  };

  it('should accept valid bulk config', () => {
    const result = BulkConfigSchema.parse(validBulkConfig);
    expect(result.endpoint).toBe('/api/bulk/records');
    expect(result.httpMethod).toBe('POST');
    expect(result.payloadTransform).toBe('array');
    expect(result.maxItemsPerCall).toBe(200);
    expect(result.responseMapping.itemIdField).toBe('id');
  });

  it('should apply default maxItemsPerCall of 200', () => {
    const withoutMax = { ...validBulkConfig };
    delete (withoutMax as Record<string, unknown>).maxItemsPerCall;
    const result = BulkConfigSchema.parse(withoutMax);
    expect(result.maxItemsPerCall).toBe(200);
  });

  it('should accept optional wrapperKey', () => {
    const result = BulkConfigSchema.parse({
      ...validBulkConfig,
      wrapperKey: 'records',
    });
    expect(result.wrapperKey).toBe('records');
  });

  it('should accept all valid httpMethod values', () => {
    for (const method of ['POST', 'PUT', 'PATCH'] as const) {
      const result = BulkConfigSchema.parse({ ...validBulkConfig, httpMethod: method });
      expect(result.httpMethod).toBe(method);
    }
  });

  it('should reject invalid httpMethod', () => {
    expect(() => BulkConfigSchema.parse({ ...validBulkConfig, httpMethod: 'GET' })).toThrow();
  });

  it('should accept all valid payloadTransform values', () => {
    for (const transform of ['array', 'csv', 'ndjson'] as const) {
      const result = BulkConfigSchema.parse({ ...validBulkConfig, payloadTransform: transform });
      expect(result.payloadTransform).toBe(transform);
    }
  });

  it('should reject invalid payloadTransform', () => {
    expect(() => BulkConfigSchema.parse({ ...validBulkConfig, payloadTransform: 'xml' })).toThrow();
  });

  it('should reject empty endpoint', () => {
    expect(() => BulkConfigSchema.parse({ ...validBulkConfig, endpoint: '' })).toThrow();
  });

  it('should reject empty responseMapping fields', () => {
    expect(() =>
      BulkConfigSchema.parse({
        ...validBulkConfig,
        responseMapping: { itemIdField: '', successField: 'ok', errorField: 'err' },
      })
    ).toThrow();
  });
});

// =============================================================================
// BatchOperationInputSchema
// =============================================================================

describe('BatchOperationInputSchema', () => {
  const validInput = {
    integrationSlug: 'salesforce',
    actionSlug: 'update-record',
    items: [{ input: { name: 'Test' } }],
  };

  it('should accept valid input', () => {
    const result = BatchOperationInputSchema.parse(validInput);
    expect(result.integrationSlug).toBe('salesforce');
    expect(result.actionSlug).toBe('update-record');
    expect(result.items).toHaveLength(1);
    expect(result.config).toBeUndefined();
  });

  it('should accept input with config overrides', () => {
    const result = BatchOperationInputSchema.parse({
      ...validInput,
      config: { concurrency: 10, delayMs: 100, skipInvalidItems: true },
    });
    expect(result.config?.concurrency).toBe(10);
    expect(result.config?.delayMs).toBe(100);
    expect(result.config?.skipInvalidItems).toBe(true);
  });

  it('should accept multiple items', () => {
    const items = Array.from({ length: 100 }, (_, i) => ({ input: { id: i } }));
    const result = BatchOperationInputSchema.parse({ ...validInput, items });
    expect(result.items).toHaveLength(100);
  });

  it('should reject empty items array', () => {
    expect(() => BatchOperationInputSchema.parse({ ...validInput, items: [] })).toThrow();
  });

  it('should reject more than 10000 items', () => {
    const items = Array.from({ length: 10001 }, () => ({ input: {} }));
    expect(() => BatchOperationInputSchema.parse({ ...validInput, items })).toThrow();
  });

  it('should reject empty integrationSlug', () => {
    expect(() => BatchOperationInputSchema.parse({ ...validInput, integrationSlug: '' })).toThrow();
  });

  it('should reject empty actionSlug', () => {
    expect(() => BatchOperationInputSchema.parse({ ...validInput, actionSlug: '' })).toThrow();
  });
});

// =============================================================================
// BatchRequestConfigSchema
// =============================================================================

describe('BatchRequestConfigSchema', () => {
  it('should apply skipInvalidItems default of false', () => {
    const result = BatchRequestConfigSchema.parse({});
    expect(result.skipInvalidItems).toBe(false);
  });

  it('should accept valid config overrides', () => {
    const result = BatchRequestConfigSchema.parse({
      concurrency: 15,
      delayMs: 500,
      timeoutSeconds: 600,
      skipInvalidItems: true,
    });
    expect(result.concurrency).toBe(15);
    expect(result.delayMs).toBe(500);
    expect(result.timeoutSeconds).toBe(600);
    expect(result.skipInvalidItems).toBe(true);
  });

  it('should reject concurrency above 20', () => {
    expect(() => BatchRequestConfigSchema.parse({ concurrency: 21 })).toThrow();
  });

  it('should reject concurrency below 1', () => {
    expect(() => BatchRequestConfigSchema.parse({ concurrency: 0 })).toThrow();
  });

  it('should reject delayMs above 5000', () => {
    expect(() => BatchRequestConfigSchema.parse({ delayMs: 5001 })).toThrow();
  });

  it('should reject timeoutSeconds below 30', () => {
    expect(() => BatchRequestConfigSchema.parse({ timeoutSeconds: 29 })).toThrow();
  });

  it('should reject timeoutSeconds above 3600', () => {
    expect(() => BatchRequestConfigSchema.parse({ timeoutSeconds: 3601 })).toThrow();
  });
});

// =============================================================================
// BatchOperationResponseSchema
// =============================================================================

describe('BatchOperationResponseSchema', () => {
  it('should accept valid response', () => {
    const result = BatchOperationResponseSchema.parse({
      jobId: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
      status: 'queued',
      itemCount: 50,
      hasBulkRoute: true,
    });
    expect(result.jobId).toBe('a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d');
    expect(result.status).toBe('queued');
    expect(result.itemCount).toBe(50);
    expect(result.hasBulkRoute).toBe(true);
  });

  it('should reject invalid UUID for jobId', () => {
    expect(() =>
      BatchOperationResponseSchema.parse({
        jobId: 'not-a-uuid',
        status: 'queued',
        itemCount: 10,
        hasBulkRoute: false,
      })
    ).toThrow();
  });

  it('should reject non-queued status', () => {
    expect(() =>
      BatchOperationResponseSchema.parse({
        jobId: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
        status: 'running',
        itemCount: 10,
        hasBulkRoute: false,
      })
    ).toThrow();
  });
});

// =============================================================================
// BatchResultSummarySchema
// =============================================================================

describe('BatchResultSummarySchema', () => {
  it('should accept valid summary', () => {
    const result = BatchResultSummarySchema.parse({
      succeeded: 45,
      failed: 5,
      skipped: 0,
      bulkCallsMade: 1,
      individualCallsMade: 0,
    });
    expect(result.succeeded).toBe(45);
    expect(result.failed).toBe(5);
    expect(result.skipped).toBe(0);
    expect(result.bulkCallsMade).toBe(1);
    expect(result.individualCallsMade).toBe(0);
  });

  it('should accept all-zero summary', () => {
    const result = BatchResultSummarySchema.parse({
      succeeded: 0,
      failed: 0,
      skipped: 0,
      bulkCallsMade: 0,
      individualCallsMade: 0,
    });
    expect(result.succeeded).toBe(0);
  });

  it('should reject negative counts', () => {
    expect(() =>
      BatchResultSummarySchema.parse({
        succeeded: -1,
        failed: 0,
        skipped: 0,
        bulkCallsMade: 0,
        individualCallsMade: 0,
      })
    ).toThrow();
  });
});

// =============================================================================
// Error Codes
// =============================================================================

describe('BatchErrorCodes', () => {
  it('should contain all expected error codes', () => {
    expect(BatchErrorCodes.BATCH_NOT_ENABLED).toBe('BATCH_NOT_ENABLED');
    expect(BatchErrorCodes.BATCH_VALIDATION_ERROR).toBe('BATCH_VALIDATION_ERROR');
    expect(BatchErrorCodes.BATCH_OPERATION_ERROR).toBe('BATCH_OPERATION_ERROR');
    expect(BatchErrorCodes.BATCH_ITEM_LIMIT_EXCEEDED).toBe('BATCH_ITEM_LIMIT_EXCEEDED');
    expect(BatchErrorCodes.BULK_DISPATCH_ERROR).toBe('BULK_DISPATCH_ERROR');
  });

  it('should have exactly 5 error codes', () => {
    expect(Object.keys(BatchErrorCodes)).toHaveLength(5);
  });
});

// =============================================================================
// Error Classes
// =============================================================================

describe('BatchOperationError', () => {
  it('should create with code, message, and statusCode', () => {
    const err = new BatchOperationError('BATCH_OPERATION_ERROR', 'Something went wrong', 400);
    expect(err.code).toBe('BATCH_OPERATION_ERROR');
    expect(err.message).toBe('Something went wrong');
    expect(err.statusCode).toBe(400);
    expect(err.name).toBe('BatchOperationError');
    expect(err).toBeInstanceOf(Error);
  });

  it('should default statusCode to 400', () => {
    const err = new BatchOperationError('TEST', 'test');
    expect(err.statusCode).toBe(400);
  });
});

describe('BatchNotEnabledError', () => {
  it('should include action slug in message', () => {
    const err = new BatchNotEnabledError('update-record');
    expect(err.code).toBe('BATCH_NOT_ENABLED');
    expect(err.message).toContain('update-record');
    expect(err.statusCode).toBe(400);
    expect(err.name).toBe('BatchNotEnabledError');
    expect(err).toBeInstanceOf(BatchOperationError);
  });
});

describe('BatchValidationError', () => {
  it('should include item errors and counts', () => {
    const itemErrors = [
      { index: 0, errors: ['Missing required field: name'] },
      { index: 3, errors: ['Invalid type for field: email'] },
    ];
    const err = new BatchValidationError(itemErrors, 8, 2);
    expect(err.code).toBe('BATCH_VALIDATION_ERROR');
    expect(err.message).toContain('2');
    expect(err.message).toContain('10');
    expect(err.itemErrors).toEqual(itemErrors);
    expect(err.validCount).toBe(8);
    expect(err.invalidCount).toBe(2);
    expect(err.statusCode).toBe(400);
    expect(err).toBeInstanceOf(BatchOperationError);
  });
});

describe('BatchItemLimitExceededError', () => {
  it('should include item count and max in message', () => {
    const err = new BatchItemLimitExceededError(5000, 1000);
    expect(err.code).toBe('BATCH_ITEM_LIMIT_EXCEEDED');
    expect(err.message).toContain('5000');
    expect(err.message).toContain('1000');
    expect(err.statusCode).toBe(400);
    expect(err).toBeInstanceOf(BatchOperationError);
  });
});

describe('BulkDispatchError', () => {
  it('should have 502 status code', () => {
    const err = new BulkDispatchError('Bulk API returned 500');
    expect(err.code).toBe('BULK_DISPATCH_ERROR');
    expect(err.message).toBe('Bulk API returned 500');
    expect(err.statusCode).toBe(502);
    expect(err).toBeInstanceOf(BatchOperationError);
  });

  it('should include optional details', () => {
    const err = new BulkDispatchError('Failed', { status: 500, body: 'Error' });
    expect(err.details).toEqual({ status: 500, body: 'Error' });
  });
});
