/**
 * Rate Limit Tracker Unit Tests
 *
 * Tests for proactive rate limit budget tracking per integration.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { rateLimitTracker } from '@/lib/modules/batch-operations/rate-limit-tracker';

describe('RateLimitTracker', () => {
  beforeEach(() => {
    rateLimitTracker.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ===========================================================================
  // hasBudget
  // ===========================================================================

  describe('hasBudget', () => {
    it('should return true when no data exists (first request)', () => {
      expect(rateLimitTracker.hasBudget('integration-1')).toBe(true);
    });

    it('should return true when remaining > 0', () => {
      rateLimitTracker.updateFromHeaders('integration-1', {
        remaining: 50,
        limit: 100,
        reset: Date.now() + 60_000,
      });
      expect(rateLimitTracker.hasBudget('integration-1')).toBe(true);
    });

    it('should return false when remaining is 0', () => {
      rateLimitTracker.updateFromHeaders('integration-1', {
        remaining: 0,
        limit: 100,
        reset: Date.now() + 60_000,
      });
      expect(rateLimitTracker.hasBudget('integration-1')).toBe(false);
    });

    it('should return true when reset window has expired', () => {
      rateLimitTracker.updateFromHeaders('integration-1', {
        remaining: 0,
        limit: 100,
        reset: Date.now() + 1000,
      });
      expect(rateLimitTracker.hasBudget('integration-1')).toBe(false);

      // Advance past the reset window
      vi.advanceTimersByTime(1001);
      expect(rateLimitTracker.hasBudget('integration-1')).toBe(true);
    });

    it('should track different integrations independently', () => {
      rateLimitTracker.updateFromHeaders('integration-1', {
        remaining: 0,
        limit: 100,
        reset: Date.now() + 60_000,
      });
      rateLimitTracker.updateFromHeaders('integration-2', {
        remaining: 50,
        limit: 100,
        reset: Date.now() + 60_000,
      });

      expect(rateLimitTracker.hasBudget('integration-1')).toBe(false);
      expect(rateLimitTracker.hasBudget('integration-2')).toBe(true);
    });
  });

  // ===========================================================================
  // updateFromHeaders
  // ===========================================================================

  describe('updateFromHeaders', () => {
    it('should skip update when no rate limit info', () => {
      rateLimitTracker.updateFromHeaders(
        'integration-1',
        {} as Parameters<typeof rateLimitTracker.updateFromHeaders>[1]
      );
      expect(rateLimitTracker.getBudgetInfo('integration-1')).toBeUndefined();
    });

    it('should update budget from remaining + reset', () => {
      const resetAt = Date.now() + 30_000;
      rateLimitTracker.updateFromHeaders('integration-1', {
        remaining: 75,
        limit: 100,
        reset: resetAt,
      });

      const info = rateLimitTracker.getBudgetInfo('integration-1');
      expect(info).toBeDefined();
      expect(info!.remaining).toBe(75);
      expect(info!.limit).toBe(100);
      expect(info!.resetAt).toBe(resetAt);
    });

    it('should preserve existing values when partial update', () => {
      const resetAt = Date.now() + 30_000;
      rateLimitTracker.updateFromHeaders('integration-1', {
        remaining: 100,
        limit: 100,
        reset: resetAt,
      });

      // Update with only remaining
      rateLimitTracker.updateFromHeaders('integration-1', {
        remaining: 50,
      } as Parameters<typeof rateLimitTracker.updateFromHeaders>[1]);

      const info = rateLimitTracker.getBudgetInfo('integration-1');
      expect(info!.remaining).toBe(50);
      expect(info!.limit).toBe(100);
      expect(info!.resetAt).toBe(resetAt);
    });
  });

  // ===========================================================================
  // acquireBudget
  // ===========================================================================

  describe('acquireBudget', () => {
    it('should resolve immediately when no data exists', async () => {
      await rateLimitTracker.acquireBudget('integration-1');
      // No error means it resolved
    });

    it('should decrement remaining on acquire', async () => {
      rateLimitTracker.updateFromHeaders('integration-1', {
        remaining: 5,
        limit: 100,
        reset: Date.now() + 60_000,
      });

      await rateLimitTracker.acquireBudget('integration-1');
      const info = rateLimitTracker.getBudgetInfo('integration-1');
      expect(info!.remaining).toBe(4);
    });

    it('should resolve immediately when reset window expired', async () => {
      rateLimitTracker.updateFromHeaders('integration-1', {
        remaining: 0,
        limit: 100,
        reset: Date.now() + 1000,
      });

      // Advance past reset
      vi.advanceTimersByTime(1001);
      await rateLimitTracker.acquireBudget('integration-1');

      // Budget cleared after expiry
      expect(rateLimitTracker.getBudgetInfo('integration-1')).toBeUndefined();
    });

    it('should wait until reset when no budget available', async () => {
      const now = Date.now();
      rateLimitTracker.updateFromHeaders('integration-1', {
        remaining: 0,
        limit: 100,
        reset: now + 2000,
      });

      let resolved = false;
      const promise = rateLimitTracker.acquireBudget('integration-1').then(() => {
        resolved = true;
      });

      // Should not be resolved yet
      await vi.advanceTimersByTimeAsync(1000);
      expect(resolved).toBe(false);

      // Advance past reset
      await vi.advanceTimersByTimeAsync(1001);
      await promise;
      expect(resolved).toBe(true);
    });
  });

  // ===========================================================================
  // getBudgetInfo
  // ===========================================================================

  describe('getBudgetInfo', () => {
    it('should return undefined for unknown integration', () => {
      expect(rateLimitTracker.getBudgetInfo('unknown')).toBeUndefined();
    });

    it('should return budget info after update', () => {
      rateLimitTracker.updateFromHeaders('integration-1', {
        remaining: 50,
        limit: 100,
        reset: Date.now() + 60_000,
      });
      const info = rateLimitTracker.getBudgetInfo('integration-1');
      expect(info).toBeDefined();
      expect(info!.remaining).toBe(50);
    });
  });

  // ===========================================================================
  // clear
  // ===========================================================================

  describe('clear', () => {
    it('should remove all tracked budgets', () => {
      rateLimitTracker.updateFromHeaders('integration-1', {
        remaining: 50,
        limit: 100,
        reset: Date.now() + 60_000,
      });
      rateLimitTracker.updateFromHeaders('integration-2', {
        remaining: 25,
        limit: 50,
        reset: Date.now() + 60_000,
      });

      rateLimitTracker.clear();
      expect(rateLimitTracker.getBudgetInfo('integration-1')).toBeUndefined();
      expect(rateLimitTracker.getBudgetInfo('integration-2')).toBeUndefined();
    });
  });
});
