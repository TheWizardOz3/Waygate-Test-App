/**
 * Rate Limiter Tests
 *
 * Tests for the per-user fair-share rate limiter used in end-user auth delegation.
 * Covers: checkRateLimit, recordRequest, resolveRateLimitConfig, resetAllCounters,
 * cleanupExpiredEntries, fair share calculation, and burst behavior.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

import {
  checkRateLimit,
  recordRequest,
  resolveRateLimitConfig,
  resetAllCounters,
  cleanupExpiredEntries,
  stopCleanupTimer,
} from '@/lib/modules/gateway/rate-limiter';

import type { RateLimitConfig } from '@/lib/modules/gateway/rate-limiter';

// Stop the auto-started cleanup timer so it doesn't interfere with tests
afterEach(() => {
  stopCleanupTimer();
});

describe('Rate Limiter', () => {
  beforeEach(() => {
    resetAllCounters();
    vi.restoreAllMocks();
  });

  // ===========================================================================
  // 1. checkRateLimit - no config = always allow
  // ===========================================================================
  describe('checkRateLimit - no config', () => {
    it('should always allow when config is undefined', () => {
      const result = checkRateLimit('conn-1', 'user-1', undefined);

      expect(result.allowed).toBe(true);
      expect(result.userCount).toBe(0);
      expect(result.totalCount).toBe(0);
      expect(result.fairShare).toBe(Infinity);
      expect(result.activeUsers).toBe(0);
      expect(result.retryAfterMs).toBeUndefined();
    });

    it('should always allow when maxRequestsPerMinute is 0', () => {
      const result = checkRateLimit('conn-1', 'user-1', { maxRequestsPerMinute: 0 });

      expect(result.allowed).toBe(true);
      expect(result.fairShare).toBe(Infinity);
    });

    it('should always allow when maxRequestsPerMinute is negative', () => {
      const result = checkRateLimit('conn-1', 'user-1', { maxRequestsPerMinute: -10 });

      expect(result.allowed).toBe(true);
      expect(result.fairShare).toBe(Infinity);
    });
  });

  // ===========================================================================
  // 2. checkRateLimit - below capacity threshold = allow (burst mode)
  // ===========================================================================
  describe('checkRateLimit - below capacity threshold (burst mode)', () => {
    it('should allow when total usage is well below 80% of budget', () => {
      const config: RateLimitConfig = { maxRequestsPerMinute: 100 };

      // Record 50 requests (50% of budget, below 80% threshold)
      for (let i = 0; i < 50; i++) {
        recordRequest('conn-1', 'user-1');
      }

      const result = checkRateLimit('conn-1', 'user-1', config);

      expect(result.allowed).toBe(true);
      expect(result.userCount).toBe(50);
      expect(result.totalCount).toBe(50);
    });

    it('should allow burst from a single user when others are idle', () => {
      const config: RateLimitConfig = { maxRequestsPerMinute: 100 };

      // Single user makes 79 requests (79% < 80% threshold)
      for (let i = 0; i < 79; i++) {
        recordRequest('conn-1', 'user-1');
      }

      const result = checkRateLimit('conn-1', 'user-1', config);

      expect(result.allowed).toBe(true);
      expect(result.userCount).toBe(79);
    });
  });

  // ===========================================================================
  // 3. checkRateLimit - total budget exhausted = deny with retryAfterMs
  // ===========================================================================
  describe('checkRateLimit - total budget exhausted', () => {
    it('should deny when total requests reach maxRequestsPerMinute', () => {
      const config: RateLimitConfig = { maxRequestsPerMinute: 10 };

      // Exhaust the entire budget
      for (let i = 0; i < 10; i++) {
        recordRequest('conn-1', 'user-1');
      }

      const result = checkRateLimit('conn-1', 'user-1', config);

      expect(result.allowed).toBe(false);
      expect(result.retryAfterMs).toBeDefined();
      expect(result.retryAfterMs).toBeGreaterThanOrEqual(1000);
      expect(result.totalCount).toBe(10);
    });

    it('should deny any user when total budget is exhausted by multiple users', () => {
      const config: RateLimitConfig = { maxRequestsPerMinute: 10 };

      // Spread requests across users to exhaust budget
      for (let i = 0; i < 5; i++) {
        recordRequest('conn-1', 'user-1');
      }
      for (let i = 0; i < 5; i++) {
        recordRequest('conn-1', 'user-2');
      }

      // A third user should also be denied
      const result = checkRateLimit('conn-1', 'user-3', config);

      expect(result.allowed).toBe(false);
      expect(result.retryAfterMs).toBeDefined();
      expect(result.totalCount).toBe(10);
    });
  });

  // ===========================================================================
  // 4. checkRateLimit - near capacity + user exceeds fair share = deny
  // ===========================================================================
  describe('checkRateLimit - near capacity + user exceeds fair share', () => {
    it('should deny when user exceeds fair share and total is near capacity', () => {
      const config: RateLimitConfig = { maxRequestsPerMinute: 100 };

      // Two users: user-1 takes 70 requests, user-2 takes 15 requests
      // Total = 85 (85% > 80% threshold)
      // Fair share with 2 active users = 100 / 2 = 50
      for (let i = 0; i < 70; i++) {
        recordRequest('conn-1', 'user-1');
      }
      for (let i = 0; i < 15; i++) {
        recordRequest('conn-1', 'user-2');
      }

      // user-1 has 70 requests, fair share is 50 => should be denied
      const result = checkRateLimit('conn-1', 'user-1', config);

      expect(result.allowed).toBe(false);
      expect(result.retryAfterMs).toBeDefined();
      expect(result.userCount).toBe(70);
      expect(result.fairShare).toBe(50);
    });
  });

  // ===========================================================================
  // 5. checkRateLimit - near capacity + user within fair share = allow
  // ===========================================================================
  describe('checkRateLimit - near capacity + user within fair share', () => {
    it('should allow when user is within fair share even if total is near capacity', () => {
      const config: RateLimitConfig = { maxRequestsPerMinute: 100 };

      // Two users: user-1 takes 70 requests, user-2 takes 15 requests
      // Total = 85 (85% > 80% threshold)
      // Fair share with 2 active users = 100 / 2 = 50
      for (let i = 0; i < 70; i++) {
        recordRequest('conn-1', 'user-1');
      }
      for (let i = 0; i < 15; i++) {
        recordRequest('conn-1', 'user-2');
      }

      // user-2 has 15 requests, fair share is 50 => should be allowed
      const result = checkRateLimit('conn-1', 'user-2', config);

      expect(result.allowed).toBe(true);
      expect(result.userCount).toBe(15);
      expect(result.fairShare).toBe(50);
    });
  });

  // ===========================================================================
  // 6. recordRequest + checkRateLimit - recording affects counters
  // ===========================================================================
  describe('recordRequest + checkRateLimit interaction', () => {
    it('should reflect recorded requests in subsequent checkRateLimit calls', () => {
      const config: RateLimitConfig = { maxRequestsPerMinute: 100 };

      // Initially no requests
      const before = checkRateLimit('conn-1', 'user-1', config);
      expect(before.userCount).toBe(0);
      expect(before.totalCount).toBe(0);

      // Record some requests
      recordRequest('conn-1', 'user-1');
      recordRequest('conn-1', 'user-1');
      recordRequest('conn-1', 'user-1');

      const after = checkRateLimit('conn-1', 'user-1', config);
      expect(after.userCount).toBe(3);
      expect(after.totalCount).toBe(3);
    });

    it('should track requests per-user independently', () => {
      const config: RateLimitConfig = { maxRequestsPerMinute: 100 };

      recordRequest('conn-1', 'user-1');
      recordRequest('conn-1', 'user-1');
      recordRequest('conn-1', 'user-2');

      const user1Result = checkRateLimit('conn-1', 'user-1', config);
      const user2Result = checkRateLimit('conn-1', 'user-2', config);

      expect(user1Result.userCount).toBe(2);
      expect(user2Result.userCount).toBe(1);
      // Total should be the same for both checks
      expect(user1Result.totalCount).toBe(3);
      expect(user2Result.totalCount).toBe(3);
    });

    it('should track requests per-connection independently', () => {
      const config: RateLimitConfig = { maxRequestsPerMinute: 100 };

      recordRequest('conn-1', 'user-1');
      recordRequest('conn-1', 'user-1');
      recordRequest('conn-2', 'user-1');

      const conn1Result = checkRateLimit('conn-1', 'user-1', config);
      const conn2Result = checkRateLimit('conn-2', 'user-1', config);

      expect(conn1Result.userCount).toBe(2);
      expect(conn1Result.totalCount).toBe(2);
      expect(conn2Result.userCount).toBe(1);
      expect(conn2Result.totalCount).toBe(1);
    });

    it('should handle requests without a userId (shared key)', () => {
      const config: RateLimitConfig = { maxRequestsPerMinute: 100 };

      recordRequest('conn-1', undefined);
      recordRequest('conn-1', undefined);

      const result = checkRateLimit('conn-1', undefined, config);

      expect(result.userCount).toBe(2);
      expect(result.totalCount).toBe(2);
    });
  });

  // ===========================================================================
  // 7. Fair share calculation - 1000 req/min with 10 users = 100 each
  // ===========================================================================
  describe('Fair share calculation', () => {
    it('should compute fair share as maxRequestsPerMinute / activeUsers', () => {
      const config: RateLimitConfig = { maxRequestsPerMinute: 1000 };

      // Create 10 active users by recording at least 1 request each
      for (let i = 1; i <= 10; i++) {
        recordRequest('conn-1', `user-${i}`);
      }

      const result = checkRateLimit('conn-1', 'user-1', config);

      // 1000 / 10 active users = 100 fair share each
      expect(result.fairShare).toBe(100);
      expect(result.activeUsers).toBe(10);
    });

    it('should give full budget as fair share to a single active user', () => {
      const config: RateLimitConfig = { maxRequestsPerMinute: 1000 };

      recordRequest('conn-1', 'user-1');

      const result = checkRateLimit('conn-1', 'user-1', config);

      // 1000 / 1 active user = 1000 fair share
      expect(result.fairShare).toBe(1000);
      expect(result.activeUsers).toBe(1);
    });

    it('should count a new user (zero requests) as an additional active user', () => {
      const config: RateLimitConfig = { maxRequestsPerMinute: 1000 };

      // 4 existing active users
      for (let i = 1; i <= 4; i++) {
        recordRequest('conn-1', `user-${i}`);
      }

      // Check for a brand-new user who has no requests yet
      const result = checkRateLimit('conn-1', 'user-new', config);

      // The new user has 0 requests, so effectiveActiveUsers = 4 + 1 = 5
      // Fair share = 1000 / 5 = 200
      expect(result.fairShare).toBe(200);
      expect(result.activeUsers).toBe(5);
    });

    it('should floor fair share to an integer', () => {
      const config: RateLimitConfig = { maxRequestsPerMinute: 100 };

      // 3 active users: 100 / 3 = 33.33... => floor to 33
      for (let i = 1; i <= 3; i++) {
        recordRequest('conn-1', `user-${i}`);
      }

      const result = checkRateLimit('conn-1', 'user-1', config);

      expect(result.fairShare).toBe(33);
    });

    it('should enforce minimum fair share of 1', () => {
      const config: RateLimitConfig = { maxRequestsPerMinute: 1 };

      // Even with many users, fair share should be at least 1
      for (let i = 1; i <= 5; i++) {
        recordRequest('conn-1', `user-${i}`);
      }

      const result = checkRateLimit('conn-1', 'user-1', config);

      // 1 / 5 = 0.2, floored to 0, but clamped to minimum of 1
      expect(result.fairShare).toBe(1);
    });
  });

  // ===========================================================================
  // 8. Burst behavior - 2 users can use 500 each when others are idle
  // ===========================================================================
  describe('Burst behavior', () => {
    it('should allow a single user to burst up to 80% of total budget', () => {
      const config: RateLimitConfig = { maxRequestsPerMinute: 1000 };

      // Single user makes 799 requests (79.9% < 80%)
      for (let i = 0; i < 799; i++) {
        recordRequest('conn-1', 'user-1');
      }

      const result = checkRateLimit('conn-1', 'user-1', config);

      expect(result.allowed).toBe(true);
      expect(result.userCount).toBe(799);
    });

    it('should allow two users to split spare capacity (500 each) when under threshold', () => {
      const config: RateLimitConfig = { maxRequestsPerMinute: 1000 };

      // Two users each take 400 requests = 800 total
      // But check user-1 when they have 399 and user-2 has 399 = 798 total (79.8% < 80%)
      for (let i = 0; i < 399; i++) {
        recordRequest('conn-1', 'user-1');
      }
      for (let i = 0; i < 399; i++) {
        recordRequest('conn-1', 'user-2');
      }

      // Total = 798, which is under 80% (800), so burst is allowed
      const result1 = checkRateLimit('conn-1', 'user-1', config);
      const result2 = checkRateLimit('conn-1', 'user-2', config);

      expect(result1.allowed).toBe(true);
      expect(result2.allowed).toBe(true);
    });

    it('should throttle at 80% threshold when fair share is exceeded', () => {
      const config: RateLimitConfig = { maxRequestsPerMinute: 1000 };

      // user-1 takes 700, user-2 takes 100 => total = 800 (exactly 80%)
      for (let i = 0; i < 700; i++) {
        recordRequest('conn-1', 'user-1');
      }
      for (let i = 0; i < 100; i++) {
        recordRequest('conn-1', 'user-2');
      }

      // Total = 800, capacity = 80% >= 80% threshold, fair share enforcement kicks in
      // Fair share = 1000 / 2 = 500
      // user-1 has 700 >= 500 fair share => denied
      const result = checkRateLimit('conn-1', 'user-1', config);

      expect(result.allowed).toBe(false);
      expect(result.fairShare).toBe(500);
    });

    it('should still allow burst user when only one user is active', () => {
      const config: RateLimitConfig = { maxRequestsPerMinute: 1000 };

      // Single user with 799 requests
      for (let i = 0; i < 799; i++) {
        recordRequest('conn-1', 'user-solo');
      }

      // 799/1000 = 79.9% < 80% threshold, so burst is allowed
      // Fair share = 1000/1 = 1000, so even if threshold kicked in, they'd be under fair share
      const result = checkRateLimit('conn-1', 'user-solo', config);

      expect(result.allowed).toBe(true);
    });
  });

  // ===========================================================================
  // 9. resolveRateLimitConfig - valid metadata, missing metadata, invalid values
  // ===========================================================================
  describe('resolveRateLimitConfig', () => {
    it('should extract valid rate limit config from metadata', () => {
      const metadata = {
        rateLimits: {
          maxRequestsPerMinute: 1000,
        },
      };

      const config = resolveRateLimitConfig(metadata);

      expect(config).toEqual({ maxRequestsPerMinute: 1000 });
    });

    it('should return undefined for null metadata', () => {
      expect(resolveRateLimitConfig(null)).toBeUndefined();
    });

    it('should return undefined for undefined metadata', () => {
      expect(resolveRateLimitConfig(undefined)).toBeUndefined();
    });

    it('should return undefined for non-object metadata', () => {
      expect(resolveRateLimitConfig('not-an-object')).toBeUndefined();
      expect(resolveRateLimitConfig(42)).toBeUndefined();
      expect(resolveRateLimitConfig(true)).toBeUndefined();
    });

    it('should return undefined when rateLimits key is missing', () => {
      const metadata = { someOtherKey: 'value' };
      expect(resolveRateLimitConfig(metadata)).toBeUndefined();
    });

    it('should return undefined when rateLimits is not an object', () => {
      const metadata = { rateLimits: 'invalid' };
      expect(resolveRateLimitConfig(metadata)).toBeUndefined();
    });

    it('should return undefined when maxRequestsPerMinute is missing', () => {
      const metadata = { rateLimits: {} };
      expect(resolveRateLimitConfig(metadata)).toBeUndefined();
    });

    it('should return undefined when maxRequestsPerMinute is not a number', () => {
      const metadata = { rateLimits: { maxRequestsPerMinute: 'fast' } };
      expect(resolveRateLimitConfig(metadata)).toBeUndefined();
    });

    it('should return undefined when maxRequestsPerMinute is zero', () => {
      const metadata = { rateLimits: { maxRequestsPerMinute: 0 } };
      expect(resolveRateLimitConfig(metadata)).toBeUndefined();
    });

    it('should return undefined when maxRequestsPerMinute is negative', () => {
      const metadata = { rateLimits: { maxRequestsPerMinute: -100 } };
      expect(resolveRateLimitConfig(metadata)).toBeUndefined();
    });

    it('should accept float values for maxRequestsPerMinute', () => {
      const metadata = { rateLimits: { maxRequestsPerMinute: 99.5 } };
      const config = resolveRateLimitConfig(metadata);
      expect(config).toEqual({ maxRequestsPerMinute: 99.5 });
    });
  });

  // ===========================================================================
  // 10. resetAllCounters - clears all state
  // ===========================================================================
  describe('resetAllCounters', () => {
    it('should clear all tracked request counters', () => {
      const config: RateLimitConfig = { maxRequestsPerMinute: 100 };

      // Record requests across multiple connections and users
      recordRequest('conn-1', 'user-1');
      recordRequest('conn-1', 'user-2');
      recordRequest('conn-2', 'user-1');

      // Verify they are tracked
      const beforeConn1 = checkRateLimit('conn-1', 'user-1', config);
      expect(beforeConn1.totalCount).toBeGreaterThan(0);

      // Reset
      resetAllCounters();

      // Verify everything is cleared
      const afterConn1 = checkRateLimit('conn-1', 'user-1', config);
      const afterConn2 = checkRateLimit('conn-2', 'user-1', config);

      expect(afterConn1.userCount).toBe(0);
      expect(afterConn1.totalCount).toBe(0);
      expect(afterConn2.userCount).toBe(0);
      expect(afterConn2.totalCount).toBe(0);
    });

    it('should allow requests again after reset even if budget was exhausted', () => {
      const config: RateLimitConfig = { maxRequestsPerMinute: 5 };

      // Exhaust budget
      for (let i = 0; i < 5; i++) {
        recordRequest('conn-1', 'user-1');
      }

      const denied = checkRateLimit('conn-1', 'user-1', config);
      expect(denied.allowed).toBe(false);

      // Reset counters
      resetAllCounters();

      const allowed = checkRateLimit('conn-1', 'user-1', config);
      expect(allowed.allowed).toBe(true);
      expect(allowed.userCount).toBe(0);
      expect(allowed.totalCount).toBe(0);
    });
  });

  // ===========================================================================
  // 11. cleanupExpiredEntries - removes old entries
  // ===========================================================================
  describe('cleanupExpiredEntries', () => {
    it('should remove entries older than the 60-second window', () => {
      const config: RateLimitConfig = { maxRequestsPerMinute: 100 };

      // Record some requests
      recordRequest('conn-1', 'user-1');
      recordRequest('conn-1', 'user-1');

      // Verify they exist
      const before = checkRateLimit('conn-1', 'user-1', config);
      expect(before.userCount).toBe(2);

      // Advance time past the 60-second window
      vi.useFakeTimers();
      vi.advanceTimersByTime(61_000);

      // Cleanup should remove the expired entries
      cleanupExpiredEntries();

      // Now check - entries should be gone
      const after = checkRateLimit('conn-1', 'user-1', config);
      expect(after.userCount).toBe(0);
      expect(after.totalCount).toBe(0);

      vi.useRealTimers();
    });

    it('should retain entries within the 60-second window', () => {
      vi.useFakeTimers();
      const config: RateLimitConfig = { maxRequestsPerMinute: 100 };

      // Record requests at current (fake) time
      recordRequest('conn-1', 'user-1');
      recordRequest('conn-1', 'user-1');

      // Advance only 30 seconds (within window)
      vi.advanceTimersByTime(30_000);

      cleanupExpiredEntries();

      const result = checkRateLimit('conn-1', 'user-1', config);
      expect(result.userCount).toBe(2);

      vi.useRealTimers();
    });

    it('should handle mixed expired and fresh entries across connections', () => {
      vi.useFakeTimers();
      const config: RateLimitConfig = { maxRequestsPerMinute: 100 };

      // Record old requests
      recordRequest('conn-old', 'user-1');

      // Advance time past window
      vi.advanceTimersByTime(61_000);

      // Record new requests (after advancing time)
      recordRequest('conn-new', 'user-1');

      cleanupExpiredEntries();

      const oldResult = checkRateLimit('conn-old', 'user-1', config);
      const newResult = checkRateLimit('conn-new', 'user-1', config);

      expect(oldResult.userCount).toBe(0);
      expect(newResult.userCount).toBe(1);

      vi.useRealTimers();
    });

    it('should be safe to call with no entries', () => {
      // Should not throw
      expect(() => cleanupExpiredEntries()).not.toThrow();
    });
  });

  // ===========================================================================
  // Edge cases
  // ===========================================================================
  describe('Edge cases', () => {
    it('should handle retryAfterMs being at least 1000ms', () => {
      const config: RateLimitConfig = { maxRequestsPerMinute: 1 };

      recordRequest('conn-1', 'user-1');

      const result = checkRateLimit('conn-1', 'user-1', config);

      expect(result.allowed).toBe(false);
      expect(result.retryAfterMs).toBeGreaterThanOrEqual(1000);
    });

    it('should isolate connections completely', () => {
      const config: RateLimitConfig = { maxRequestsPerMinute: 5 };

      // Exhaust budget on conn-1
      for (let i = 0; i < 5; i++) {
        recordRequest('conn-1', 'user-1');
      }

      // conn-2 should be unaffected
      const conn2Result = checkRateLimit('conn-2', 'user-1', config);
      expect(conn2Result.allowed).toBe(true);
      expect(conn2Result.totalCount).toBe(0);
    });
  });
});
