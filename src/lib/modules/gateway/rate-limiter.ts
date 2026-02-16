/**
 * Per-User Rate Limiter
 *
 * Implements fair-share rate limiting for end-user auth delegation.
 * Tracks per-user request counts using sliding window counters (in-memory for MVP).
 *
 * Key concepts:
 * - **Total budget**: The Connection's rate limit from the external provider
 * - **Fair share**: Total budget / number of active users in the current window
 * - **Burst**: If other users are idle, a single user can use their unused capacity
 * - **Throttling**: When a user exceeds fair share AND total budget is near capacity, reject with 429
 *
 * Rate limit config is read from Connection.metadata.rateLimits:
 *   { maxRequestsPerMinute: number }
 */

// =============================================================================
// Types
// =============================================================================

/** Rate limit configuration for a connection */
export interface RateLimitConfig {
  /** Maximum requests per minute for the entire connection (external provider limit) */
  maxRequestsPerMinute: number;
}

/** Result of a rate limit check */
export interface RateLimitResult {
  /** Whether the request is allowed */
  allowed: boolean;
  /** Milliseconds to wait before retrying (only set when denied) */
  retryAfterMs?: number;
  /** Current request count for this user in the window */
  userCount: number;
  /** Total request count across all users in the window */
  totalCount: number;
  /** Computed fair share for this user */
  fairShare: number;
  /** Number of active users in the window */
  activeUsers: number;
}

// =============================================================================
// Sliding Window Counter Store (In-Memory MVP)
// =============================================================================

/**
 * A single timestamped request entry.
 * We store timestamps so we can compute a precise sliding window.
 */
interface RequestEntry {
  timestamp: number;
}

/**
 * Per-connection, per-user request tracking.
 * Key: `${connectionId}:${userId}` where userId is appUserId or '__shared__' for org-level.
 */
const userCounters = new Map<string, RequestEntry[]>();

/** Window size in milliseconds (1 minute) */
const WINDOW_MS = 60_000;

/**
 * Threshold at which the total budget is considered "near capacity".
 * When total usage exceeds this fraction of the budget, fair-share enforcement kicks in.
 */
const CAPACITY_THRESHOLD = 0.8;

/** Periodic cleanup interval (5 minutes) */
const CLEANUP_INTERVAL_MS = 5 * 60_000;

/** Sentinel value for requests without a specific user */
const SHARED_USER_KEY = '__shared__';

// =============================================================================
// Core Functions
// =============================================================================

/**
 * Build a counter key from connectionId and optional userId.
 */
function buildKey(connectionId: string, userId?: string): string {
  return `${connectionId}:${userId ?? SHARED_USER_KEY}`;
}

/**
 * Build a connection prefix for scanning all users under a connection.
 */
function buildConnectionPrefix(connectionId: string): string {
  return `${connectionId}:`;
}

/**
 * Prune entries older than the sliding window from a counter.
 */
function pruneEntries(entries: RequestEntry[], now: number): RequestEntry[] {
  const cutoff = now - WINDOW_MS;
  // Entries are appended in order, so we can find the first valid index
  let firstValid = 0;
  while (firstValid < entries.length && entries[firstValid].timestamp < cutoff) {
    firstValid++;
  }
  return firstValid > 0 ? entries.slice(firstValid) : entries;
}

/**
 * Get the current count for a specific user on a connection within the sliding window.
 */
function getUserCount(connectionId: string, userId: string | undefined, now: number): number {
  const key = buildKey(connectionId, userId);
  const entries = userCounters.get(key);
  if (!entries || entries.length === 0) return 0;

  const pruned = pruneEntries(entries, now);
  if (pruned !== entries) {
    if (pruned.length === 0) {
      userCounters.delete(key);
    } else {
      userCounters.set(key, pruned);
    }
  }
  return pruned.length;
}

/**
 * Get total request count and active user count for a connection within the sliding window.
 */
function getConnectionStats(
  connectionId: string,
  now: number
): { totalCount: number; activeUsers: number } {
  const prefix = buildConnectionPrefix(connectionId);
  let totalCount = 0;
  let activeUsers = 0;

  userCounters.forEach((entries, key) => {
    if (!key.startsWith(prefix)) return;

    const pruned = pruneEntries(entries, now);
    if (pruned !== entries) {
      if (pruned.length === 0) {
        userCounters.delete(key);
        return;
      }
      userCounters.set(key, pruned);
    }

    if (pruned.length > 0) {
      totalCount += pruned.length;
      activeUsers++;
    }
  });

  return { totalCount, activeUsers };
}

/**
 * Record a request for a user on a connection.
 * Call this AFTER the rate limit check passes and the request is about to execute.
 */
export function recordRequest(connectionId: string, appUserId?: string): void {
  const key = buildKey(connectionId, appUserId);
  const entries = userCounters.get(key) ?? [];
  entries.push({ timestamp: Date.now() });
  userCounters.set(key, entries);
}

/**
 * Check whether a request should be allowed under the rate limit.
 *
 * Algorithm:
 * 1. If no rate limit config, always allow
 * 2. Compute total usage across all users for this connection
 * 3. If total budget has spare capacity (< 80% threshold), allow (burst mode)
 * 4. If total budget is near capacity, enforce fair share per user
 * 5. Fair share = maxRequestsPerMinute / activeUsers (at least 1 user)
 */
export function checkRateLimit(
  connectionId: string,
  appUserId: string | undefined,
  config: RateLimitConfig | undefined
): RateLimitResult {
  // No config = no rate limiting
  if (!config || config.maxRequestsPerMinute <= 0) {
    return {
      allowed: true,
      userCount: 0,
      totalCount: 0,
      fairShare: Infinity,
      activeUsers: 0,
    };
  }

  const now = Date.now();
  const { maxRequestsPerMinute } = config;

  // Get current stats
  const userCount = getUserCount(connectionId, appUserId, now);
  const { totalCount, activeUsers } = getConnectionStats(connectionId, now);

  // Account for the current user potentially not being counted yet in activeUsers
  // (first request from this user in this window)
  const effectiveActiveUsers = Math.max(1, activeUsers + (userCount === 0 ? 1 : 0));
  const fairShare = Math.max(1, Math.floor(maxRequestsPerMinute / effectiveActiveUsers));

  // Hard limit: total budget exhausted
  if (totalCount >= maxRequestsPerMinute) {
    const retryAfterMs = computeRetryAfter(connectionId, now);
    return {
      allowed: false,
      retryAfterMs,
      userCount,
      totalCount,
      fairShare,
      activeUsers: effectiveActiveUsers,
    };
  }

  // Below capacity threshold: allow burst (any user can use spare capacity)
  const capacityUsed = totalCount / maxRequestsPerMinute;
  if (capacityUsed < CAPACITY_THRESHOLD) {
    return {
      allowed: true,
      userCount,
      totalCount,
      fairShare,
      activeUsers: effectiveActiveUsers,
    };
  }

  // Near capacity: enforce fair share per user
  if (userCount >= fairShare) {
    const retryAfterMs = computeRetryAfter(connectionId, now);
    return {
      allowed: false,
      retryAfterMs,
      userCount,
      totalCount,
      fairShare,
      activeUsers: effectiveActiveUsers,
    };
  }

  // User is within their fair share, allow
  return {
    allowed: true,
    userCount,
    totalCount,
    fairShare,
    activeUsers: effectiveActiveUsers,
  };
}

/**
 * Compute how long the user should wait before retrying.
 * Estimates when the oldest entry in the window will expire, freeing capacity.
 */
function computeRetryAfter(connectionId: string, now: number): number {
  const prefix = buildConnectionPrefix(connectionId);
  let oldestTimestamp = now;

  userCounters.forEach((entries, key) => {
    if (!key.startsWith(prefix)) return;
    if (entries.length > 0 && entries[0].timestamp < oldestTimestamp) {
      oldestTimestamp = entries[0].timestamp;
    }
  });

  // Time until the oldest entry exits the window
  const expiresAt = oldestTimestamp + WINDOW_MS;
  const retryAfter = Math.max(1000, expiresAt - now);
  return retryAfter;
}

// =============================================================================
// Configuration Resolution
// =============================================================================

/**
 * Extract rate limit configuration from Connection metadata.
 *
 * Expected metadata shape:
 * ```json
 * {
 *   "rateLimits": {
 *     "maxRequestsPerMinute": 1000
 *   }
 * }
 * ```
 */
export function resolveRateLimitConfig(connectionMetadata: unknown): RateLimitConfig | undefined {
  if (!connectionMetadata || typeof connectionMetadata !== 'object') return undefined;

  const metadata = connectionMetadata as Record<string, unknown>;
  const rateLimits = metadata.rateLimits;

  if (!rateLimits || typeof rateLimits !== 'object') return undefined;

  const config = rateLimits as Record<string, unknown>;
  const maxRequestsPerMinute = config.maxRequestsPerMinute;

  if (typeof maxRequestsPerMinute !== 'number' || maxRequestsPerMinute <= 0) return undefined;

  return { maxRequestsPerMinute };
}

// =============================================================================
// Cleanup
// =============================================================================

/**
 * Remove all expired entries from the counter store.
 * Called periodically to prevent unbounded memory growth.
 */
export function cleanupExpiredEntries(): void {
  const now = Date.now();
  userCounters.forEach((entries, key) => {
    const pruned = pruneEntries(entries, now);
    if (pruned.length === 0) {
      userCounters.delete(key);
    } else if (pruned !== entries) {
      userCounters.set(key, pruned);
    }
  });
}

/**
 * Clear all counters. Useful for testing.
 */
export function resetAllCounters(): void {
  userCounters.clear();
}

// Start periodic cleanup
let cleanupTimer: ReturnType<typeof setInterval> | null = null;

export function startCleanupTimer(): void {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(cleanupExpiredEntries, CLEANUP_INTERVAL_MS);
  // Allow the process to exit without waiting for this timer
  if (cleanupTimer && typeof cleanupTimer === 'object' && 'unref' in cleanupTimer) {
    cleanupTimer.unref();
  }
}

export function stopCleanupTimer(): void {
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }
}

// Auto-start cleanup on module load
startCleanupTimer();
