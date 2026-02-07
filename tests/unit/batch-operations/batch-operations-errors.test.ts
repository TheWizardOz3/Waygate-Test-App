/**
 * Batch Operations Service Logic Unit Tests
 *
 * Tests for the batch operations service helper functions,
 * specifically config parsing and merging logic.
 * Service integration tests would require mocking the job queue and action service.
 */

import { describe, it, expect } from 'vitest';
import {
  BatchConfigSchema,
  BulkConfigSchema,
} from '@/lib/modules/batch-operations/batch-operations.schemas';

// =============================================================================
// Config Parsing (mirrors service internal logic)
// =============================================================================

describe('parseBatchConfig logic', () => {
  function parseBatchConfig(raw: unknown) {
    if (!raw || typeof raw !== 'object') {
      return { maxItems: 1000, defaultConcurrency: 5, defaultDelayMs: 0 };
    }
    const result = BatchConfigSchema.safeParse(raw);
    return result.success
      ? result.data
      : { maxItems: 1000, defaultConcurrency: 5, defaultDelayMs: 0 };
  }

  it('should return defaults for null', () => {
    const config = parseBatchConfig(null);
    expect(config.maxItems).toBe(1000);
    expect(config.defaultConcurrency).toBe(5);
    expect(config.defaultDelayMs).toBe(0);
  });

  it('should return defaults for undefined', () => {
    const config = parseBatchConfig(undefined);
    expect(config.maxItems).toBe(1000);
    expect(config.defaultConcurrency).toBe(5);
  });

  it('should return defaults for non-object', () => {
    const config = parseBatchConfig('string');
    expect(config.maxItems).toBe(1000);
  });

  it('should parse valid config', () => {
    const config = parseBatchConfig({
      maxItems: 500,
      defaultConcurrency: 10,
      defaultDelayMs: 200,
    });
    expect(config.maxItems).toBe(500);
    expect(config.defaultConcurrency).toBe(10);
    expect(config.defaultDelayMs).toBe(200);
  });

  it('should return defaults for invalid config object', () => {
    const config = parseBatchConfig({ maxItems: -1 });
    expect(config.maxItems).toBe(1000);
  });
});

describe('parseBulkConfig logic', () => {
  function parseBulkConfig(raw: unknown) {
    if (!raw || typeof raw !== 'object') return null;
    const result = BulkConfigSchema.safeParse(raw);
    return result.success ? result.data : null;
  }

  it('should return null for null', () => {
    expect(parseBulkConfig(null)).toBeNull();
  });

  it('should return null for undefined', () => {
    expect(parseBulkConfig(undefined)).toBeNull();
  });

  it('should return null for non-object', () => {
    expect(parseBulkConfig('string')).toBeNull();
  });

  it('should return null for invalid bulk config', () => {
    expect(parseBulkConfig({ endpoint: '' })).toBeNull();
  });

  it('should parse valid bulk config', () => {
    const result = parseBulkConfig({
      endpoint: '/bulk/records',
      httpMethod: 'POST',
      payloadTransform: 'array',
      maxItemsPerCall: 200,
      responseMapping: {
        itemIdField: 'id',
        successField: 'success',
        errorField: 'error',
      },
    });
    expect(result).not.toBeNull();
    expect(result!.endpoint).toBe('/bulk/records');
    expect(result!.payloadTransform).toBe('array');
  });
});

describe('mergeConfig logic', () => {
  function mergeConfig(
    batchConfig: { defaultConcurrency: number; defaultDelayMs: number },
    requestConfig?: { concurrency?: number; delayMs?: number; timeoutSeconds?: number }
  ) {
    return {
      concurrency: Math.min(requestConfig?.concurrency ?? batchConfig.defaultConcurrency, 20),
      delayMs: Math.min(requestConfig?.delayMs ?? batchConfig.defaultDelayMs, 5000),
      timeoutSeconds: requestConfig?.timeoutSeconds ?? 300,
    };
  }

  it('should use batch config defaults when no request config', () => {
    const result = mergeConfig({ defaultConcurrency: 5, defaultDelayMs: 100 });
    expect(result.concurrency).toBe(5);
    expect(result.delayMs).toBe(100);
    expect(result.timeoutSeconds).toBe(300);
  });

  it('should override with request config values', () => {
    const result = mergeConfig(
      { defaultConcurrency: 5, defaultDelayMs: 100 },
      { concurrency: 10, delayMs: 200, timeoutSeconds: 600 }
    );
    expect(result.concurrency).toBe(10);
    expect(result.delayMs).toBe(200);
    expect(result.timeoutSeconds).toBe(600);
  });

  it('should cap concurrency at 20', () => {
    const result = mergeConfig({ defaultConcurrency: 5, defaultDelayMs: 0 }, { concurrency: 50 });
    expect(result.concurrency).toBe(20);
  });

  it('should cap delayMs at 5000', () => {
    const result = mergeConfig({ defaultConcurrency: 5, defaultDelayMs: 0 }, { delayMs: 10000 });
    expect(result.delayMs).toBe(5000);
  });

  it('should use partial request config', () => {
    const result = mergeConfig({ defaultConcurrency: 5, defaultDelayMs: 100 }, { concurrency: 8 });
    expect(result.concurrency).toBe(8);
    expect(result.delayMs).toBe(100); // from batch config default
    expect(result.timeoutSeconds).toBe(300); // global default
  });
});
