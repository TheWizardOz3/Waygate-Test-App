/**
 * Job Handler Registry Unit Tests
 *
 * Tests for handler registration, lookup, and diagnostic functions.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// We need to re-import after clearing the module to reset the internal registry
// between tests. Use dynamic import to reset state.
let registerJobHandler: typeof import('@/lib/modules/jobs/jobs.handlers').registerJobHandler;
let getJobTypeConfig: typeof import('@/lib/modules/jobs/jobs.handlers').getJobTypeConfig;
let hasJobHandler: typeof import('@/lib/modules/jobs/jobs.handlers').hasJobHandler;
let getRegisteredJobTypes: typeof import('@/lib/modules/jobs/jobs.handlers').getRegisteredJobTypes;

describe('Job Handler Registry', () => {
  beforeEach(async () => {
    // Reset module to clear internal registry between tests
    vi.resetModules();
    const mod = await import('@/lib/modules/jobs/jobs.handlers');
    registerJobHandler = mod.registerJobHandler;
    getJobTypeConfig = mod.getJobTypeConfig;
    hasJobHandler = mod.hasJobHandler;
    getRegisteredJobTypes = mod.getRegisteredJobTypes;
  });

  describe('registerJobHandler', () => {
    it('should register a handler for a job type', () => {
      const handler = vi.fn();
      registerJobHandler('test_type', { handler });
      expect(hasJobHandler('test_type')).toBe(true);
    });

    it('should register handler with concurrency limit', () => {
      const handler = vi.fn();
      registerJobHandler('limited_type', { handler, concurrencyLimit: 5 });
      const config = getJobTypeConfig('limited_type');
      expect(config.concurrencyLimit).toBe(5);
    });

    it('should overwrite existing handler for same type', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      registerJobHandler('overwrite_type', { handler: handler1 });
      registerJobHandler('overwrite_type', { handler: handler2 });
      const config = getJobTypeConfig('overwrite_type');
      expect(config.handler).toBe(handler2);
    });
  });

  describe('getJobTypeConfig', () => {
    it('should return config for registered type', () => {
      const handler = vi.fn();
      registerJobHandler('my_type', { handler, concurrencyLimit: 3 });
      const config = getJobTypeConfig('my_type');
      expect(config.handler).toBe(handler);
      expect(config.concurrencyLimit).toBe(3);
    });

    it('should throw HandlerNotFoundError for unregistered type', () => {
      expect(() => getJobTypeConfig('nonexistent')).toThrow(
        'No handler registered for job type: nonexistent'
      );
    });
  });

  describe('hasJobHandler', () => {
    it('should return true for registered type', () => {
      registerJobHandler('exists', { handler: vi.fn() });
      expect(hasJobHandler('exists')).toBe(true);
    });

    it('should return false for unregistered type', () => {
      expect(hasJobHandler('nope')).toBe(false);
    });
  });

  describe('getRegisteredJobTypes', () => {
    it('should return empty array when no handlers registered', () => {
      expect(getRegisteredJobTypes()).toEqual([]);
    });

    it('should return all registered types', () => {
      registerJobHandler('type_a', { handler: vi.fn() });
      registerJobHandler('type_b', { handler: vi.fn() });
      registerJobHandler('type_c', { handler: vi.fn() });
      const types = getRegisteredJobTypes();
      expect(types).toHaveLength(3);
      expect(types).toContain('type_a');
      expect(types).toContain('type_b');
      expect(types).toContain('type_c');
    });
  });
});
