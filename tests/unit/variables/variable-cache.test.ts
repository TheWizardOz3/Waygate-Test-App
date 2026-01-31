import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  getVariableCache,
  resetVariableCache,
  createVariableCache,
  invalidateVariableCache,
} from '@/lib/modules/variables/variable.cache';
import type { ScopedVariables } from '@/lib/modules/variables/types';

describe('Variable Cache', () => {
  const sampleVariables: ScopedVariables = {
    tenant: {
      api_version: { value: 'v2', valueType: 'string', sensitive: false },
    },
    connection: {
      channel: { value: 'C123', valueType: 'string', sensitive: false },
    },
  };

  beforeEach(() => {
    resetVariableCache();
  });

  afterEach(() => {
    resetVariableCache();
  });

  describe('createVariableCache', () => {
    it('should create a new cache instance', () => {
      const cache1 = createVariableCache();
      const cache2 = createVariableCache();

      // Should be different instances
      cache1.set('tenant1', null, undefined, sampleVariables);
      expect(cache2.get('tenant1', null)).toBeNull();
    });

    it('should use custom TTL', async () => {
      const cache = createVariableCache({ ttlMs: 50 });
      cache.set('tenant1', null, undefined, sampleVariables);

      expect(cache.get('tenant1', null)).not.toBeNull();

      // Wait for TTL to expire
      await new Promise((resolve) => setTimeout(resolve, 60));

      expect(cache.get('tenant1', null)).toBeNull();
    });
  });

  describe('getVariableCache', () => {
    it('should return singleton instance', () => {
      const cache1 = getVariableCache();
      const cache2 = getVariableCache();

      expect(cache1).toBe(cache2);
    });

    it('should persist data across calls', () => {
      const cache1 = getVariableCache();
      cache1.set('tenant1', null, undefined, sampleVariables);

      const cache2 = getVariableCache();
      expect(cache2.get('tenant1', null)).not.toBeNull();
    });
  });

  describe('resetVariableCache', () => {
    it('should clear and reset the singleton', () => {
      const cache = getVariableCache();
      cache.set('tenant1', null, undefined, sampleVariables);

      resetVariableCache();

      const newCache = getVariableCache();
      expect(newCache.get('tenant1', null)).toBeNull();
    });
  });

  describe('cache operations', () => {
    let cache: ReturnType<typeof createVariableCache>;

    beforeEach(() => {
      cache = createVariableCache({ enableStats: true });
    });

    describe('set and get', () => {
      it('should store and retrieve variables', () => {
        cache.set('tenant1', null, undefined, sampleVariables);
        const result = cache.get('tenant1', null);

        expect(result).toEqual(sampleVariables);
      });

      it('should handle different scopes independently', () => {
        cache.set('tenant1', null, undefined, sampleVariables);
        cache.set('tenant1', 'conn1', undefined, {
          tenant: {},
          connection: { custom: { value: 'X', valueType: 'string', sensitive: false } },
        });

        const tenantResult = cache.get('tenant1', null);
        const connResult = cache.get('tenant1', 'conn1');

        expect(tenantResult?.tenant.api_version?.value).toBe('v2');
        expect(connResult?.connection.custom?.value).toBe('X');
      });

      it('should handle environment-specific entries', () => {
        cache.set('tenant1', null, 'production', sampleVariables);
        cache.set('tenant1', null, 'staging', {
          tenant: { env: { value: 'staging', valueType: 'string', sensitive: false } },
          connection: {},
        });

        expect(cache.get('tenant1', null, 'production')).toEqual(sampleVariables);
        expect(cache.get('tenant1', null, 'staging')?.tenant.env?.value).toBe('staging');
        expect(cache.get('tenant1', null, 'development')).toBeNull();
      });

      it('should return null for non-existent entries', () => {
        expect(cache.get('nonexistent', null)).toBeNull();
      });
    });

    describe('invalidation', () => {
      it('should invalidate all tenant entries', () => {
        cache.set('tenant1', null, undefined, sampleVariables);
        cache.set('tenant1', 'conn1', undefined, sampleVariables);
        cache.set('tenant1', 'conn2', undefined, sampleVariables);

        cache.invalidateTenant('tenant1');

        expect(cache.get('tenant1', null)).toBeNull();
        expect(cache.get('tenant1', 'conn1')).toBeNull();
        expect(cache.get('tenant1', 'conn2')).toBeNull();
      });

      it('should not invalidate other tenants', () => {
        cache.set('tenant1', null, undefined, sampleVariables);
        cache.set('tenant2', null, undefined, sampleVariables);

        cache.invalidateTenant('tenant1');

        expect(cache.get('tenant1', null)).toBeNull();
        expect(cache.get('tenant2', null)).not.toBeNull();
      });

      it('should invalidate specific connection', () => {
        cache.set('tenant1', 'conn1', undefined, sampleVariables);
        cache.set('tenant1', 'conn2', undefined, sampleVariables);

        cache.invalidateConnection('tenant1', 'conn1');

        expect(cache.get('tenant1', 'conn1')).toBeNull();
        expect(cache.get('tenant1', 'conn2')).not.toBeNull();
      });
    });

    describe('clear', () => {
      it('should remove all entries', () => {
        cache.set('tenant1', null, undefined, sampleVariables);
        cache.set('tenant2', null, undefined, sampleVariables);

        cache.clear();

        expect(cache.get('tenant1', null)).toBeNull();
        expect(cache.get('tenant2', null)).toBeNull();
      });
    });

    describe('statistics', () => {
      it('should track hits and misses', () => {
        cache.set('tenant1', null, undefined, sampleVariables);

        cache.get('tenant1', null); // Hit
        cache.get('tenant1', null); // Hit
        cache.get('nonexistent', null); // Miss

        const stats = cache.getStats();
        expect(stats.hits).toBe(2);
        expect(stats.misses).toBe(1);
      });

      it('should calculate hit rate', () => {
        cache.set('tenant1', null, undefined, sampleVariables);

        cache.get('tenant1', null); // Hit
        cache.get('tenant1', null); // Hit
        cache.get('nonexistent', null); // Miss
        cache.get('nonexistent', null); // Miss

        const hitRate = cache.getHitRate();
        expect(hitRate).toBe(50);
      });

      it('should return 0 hit rate when no operations', () => {
        expect(cache.getHitRate()).toBe(0);
      });
    });

    describe('prune', () => {
      it('should remove expired entries', async () => {
        const shortCache = createVariableCache({ ttlMs: 50 });
        shortCache.set('tenant1', null, undefined, sampleVariables);

        await new Promise((resolve) => setTimeout(resolve, 60));

        const pruned = shortCache.prune();
        expect(pruned).toBe(1);
        expect(shortCache.get('tenant1', null)).toBeNull();
      });

      it('should not remove non-expired entries', () => {
        cache.set('tenant1', null, undefined, sampleVariables);

        const pruned = cache.prune();
        expect(pruned).toBe(0);
        expect(cache.get('tenant1', null)).not.toBeNull();
      });
    });

    describe('max entries limit', () => {
      it('should evict oldest entry when limit reached', async () => {
        const smallCache = createVariableCache({ maxEntries: 2 });

        smallCache.set('tenant1', null, undefined, sampleVariables);

        // Small delay to ensure different timestamps
        await new Promise((resolve) => setTimeout(resolve, 10));

        smallCache.set('tenant2', null, undefined, sampleVariables);

        await new Promise((resolve) => setTimeout(resolve, 10));

        smallCache.set('tenant3', null, undefined, sampleVariables);

        // tenant1 should be evicted as oldest
        expect(smallCache.get('tenant1', null)).toBeNull();
        expect(smallCache.get('tenant2', null)).not.toBeNull();
        expect(smallCache.get('tenant3', null)).not.toBeNull();
      });
    });
  });

  describe('invalidateVariableCache helper', () => {
    it('should invalidate tenant when no connection provided', () => {
      const cache = getVariableCache();
      cache.set('tenant1', null, undefined, sampleVariables);
      cache.set('tenant1', 'conn1', undefined, sampleVariables);

      invalidateVariableCache({ tenantId: 'tenant1' });

      expect(cache.get('tenant1', null)).toBeNull();
      expect(cache.get('tenant1', 'conn1')).toBeNull();
    });

    it('should invalidate only connection when provided', () => {
      const cache = getVariableCache();
      cache.set('tenant1', null, undefined, sampleVariables);
      cache.set('tenant1', 'conn1', undefined, sampleVariables);
      cache.set('tenant1', 'conn2', undefined, sampleVariables);

      invalidateVariableCache({ tenantId: 'tenant1', connectionId: 'conn1' });

      expect(cache.get('tenant1', null)).not.toBeNull();
      expect(cache.get('tenant1', 'conn1')).toBeNull();
      expect(cache.get('tenant1', 'conn2')).not.toBeNull();
    });
  });
});
