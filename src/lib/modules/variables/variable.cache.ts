/**
 * Variable Cache
 *
 * In-memory cache for variable lookups with TTL-based expiration.
 * Provides fast access to tenant and connection variables for resolution.
 *
 * For MVP, this uses a simple in-memory Map.
 * Future: Can be replaced with Redis for distributed caching.
 */

import type { ScopedVariables } from './types';

// =============================================================================
// Types
// =============================================================================

/**
 * Cached scoped variables with metadata
 */
export interface CachedScopedVariables {
  data: ScopedVariables;
  cachedAt: number;
  expiresAt: number;
}

/**
 * Cache configuration options
 */
export interface VariableCacheOptions {
  /** Time-to-live in milliseconds (default: 60000 = 60 seconds) */
  ttlMs?: number;
  /** Maximum number of entries (default: 1000) */
  maxEntries?: number;
  /** Whether to enable cache statistics (default: false) */
  enableStats?: boolean;
}

/**
 * Cache statistics
 */
export interface CacheStats {
  hits: number;
  misses: number;
  size: number;
  evictions: number;
}

// =============================================================================
// Cache Key Generation
// =============================================================================

/**
 * Generates a cache key from tenant, connection, and environment
 */
function generateCacheKey(
  tenantId: string,
  connectionId: string | null,
  environment?: string
): string {
  const parts = [tenantId];
  parts.push(connectionId ?? 'tenant');
  if (environment) {
    parts.push(environment);
  } else {
    parts.push('all');
  }
  return parts.join(':');
}

// =============================================================================
// Variable Cache Class
// =============================================================================

/**
 * In-memory cache for variable lookups
 */
class VariableCache {
  private cache: Map<string, CachedScopedVariables>;
  private ttlMs: number;
  private maxEntries: number;
  private enableStats: boolean;
  private stats: CacheStats;

  constructor(options: VariableCacheOptions = {}) {
    this.cache = new Map();
    this.ttlMs = options.ttlMs ?? 60000; // 60 seconds default
    this.maxEntries = options.maxEntries ?? 1000;
    this.enableStats = options.enableStats ?? false;
    this.stats = { hits: 0, misses: 0, size: 0, evictions: 0 };
  }

  /**
   * Gets cached variables for a tenant/connection
   * Returns null if not cached or expired
   */
  get(tenantId: string, connectionId: string | null, environment?: string): ScopedVariables | null {
    const key = generateCacheKey(tenantId, connectionId, environment);
    const entry = this.cache.get(key);

    if (!entry) {
      if (this.enableStats) this.stats.misses++;
      return null;
    }

    // Check if expired
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      if (this.enableStats) {
        this.stats.misses++;
        this.stats.size--;
      }
      return null;
    }

    if (this.enableStats) this.stats.hits++;
    return entry.data;
  }

  /**
   * Caches variables for a tenant/connection
   */
  set(
    tenantId: string,
    connectionId: string | null,
    environment: string | undefined,
    data: ScopedVariables
  ): void {
    // Enforce max entries limit
    if (this.cache.size >= this.maxEntries) {
      this.evictOldest();
    }

    const key = generateCacheKey(tenantId, connectionId, environment);
    const now = Date.now();

    const isNew = !this.cache.has(key);

    this.cache.set(key, {
      data,
      cachedAt: now,
      expiresAt: now + this.ttlMs,
    });

    if (this.enableStats && isNew) {
      this.stats.size++;
    }
  }

  /**
   * Invalidates cache for a tenant
   * Call this when variables are created/updated/deleted
   */
  invalidateTenant(tenantId: string): void {
    const prefix = `${tenantId}:`;
    const keysToDelete: string[] = [];

    // Use Array.from to avoid downlevelIteration requirement
    for (const key of Array.from(this.cache.keys())) {
      if (key.startsWith(prefix)) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      this.cache.delete(key);
      if (this.enableStats) this.stats.size--;
    }
  }

  /**
   * Invalidates cache for a specific connection
   */
  invalidateConnection(tenantId: string, connectionId: string): void {
    const prefix = `${tenantId}:${connectionId}:`;
    const keysToDelete: string[] = [];

    // Use Array.from to avoid downlevelIteration requirement
    for (const key of Array.from(this.cache.keys())) {
      if (key.startsWith(prefix)) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      this.cache.delete(key);
      if (this.enableStats) this.stats.size--;
    }
  }

  /**
   * Clears all cached entries
   */
  clear(): void {
    this.cache.clear();
    if (this.enableStats) {
      this.stats.size = 0;
    }
  }

  /**
   * Gets cache statistics
   */
  getStats(): CacheStats {
    return { ...this.stats, size: this.cache.size };
  }

  /**
   * Gets the hit rate as a percentage
   */
  getHitRate(): number {
    const total = this.stats.hits + this.stats.misses;
    if (total === 0) return 0;
    return (this.stats.hits / total) * 100;
  }

  /**
   * Prunes expired entries (call periodically for cleanup)
   */
  prune(): number {
    const now = Date.now();
    let pruned = 0;

    // Use Array.from to avoid downlevelIteration requirement
    for (const [key, entry] of Array.from(this.cache.entries())) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
        pruned++;
      }
    }

    if (this.enableStats) {
      this.stats.size -= pruned;
    }

    return pruned;
  }

  /**
   * Evicts the oldest entries when cache is full
   */
  private evictOldest(): void {
    // Find the oldest entry
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    // Use Array.from to avoid downlevelIteration requirement
    for (const [key, entry] of Array.from(this.cache.entries())) {
      if (entry.cachedAt < oldestTime) {
        oldestTime = entry.cachedAt;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
      if (this.enableStats) {
        this.stats.evictions++;
        this.stats.size--;
      }
    }
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

let cacheInstance: VariableCache | null = null;

/**
 * Gets the global variable cache instance
 * Creates one if it doesn't exist
 */
export function getVariableCache(options?: VariableCacheOptions): VariableCache {
  if (!cacheInstance) {
    cacheInstance = new VariableCache(options);
  }
  return cacheInstance;
}

/**
 * Resets the global cache instance (useful for testing)
 */
export function resetVariableCache(): void {
  if (cacheInstance) {
    cacheInstance.clear();
  }
  cacheInstance = null;
}

/**
 * Creates a new cache instance (useful for isolated caching)
 */
export function createVariableCache(options?: VariableCacheOptions): VariableCache {
  return new VariableCache(options);
}

// =============================================================================
// Cache Invalidation Helpers
// =============================================================================

/**
 * Invalidates cache when a variable is created/updated/deleted
 */
export function invalidateVariableCache(params: {
  tenantId: string;
  connectionId?: string | null;
}): void {
  const cache = getVariableCache();

  if (params.connectionId) {
    cache.invalidateConnection(params.tenantId, params.connectionId);
  } else {
    // Tenant-level variable changed, invalidate all tenant entries
    cache.invalidateTenant(params.tenantId);
  }
}
