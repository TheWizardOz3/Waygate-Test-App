/**
 * Rate Limit Tracker
 *
 * Proactive rate limit budget tracking per integration. Reads
 * X-RateLimit-Remaining / X-RateLimit-Reset from response headers
 * and paces outgoing requests to avoid 429s entirely.
 *
 * In-memory store for MVP (sufficient for single-process worker).
 * Future: Redis-backed for multi-instance deployments.
 */

import type { RateLimitInfo } from '@/lib/modules/execution/http-client';

// =============================================================================
// Types
// =============================================================================

interface RateLimitBudget {
  /** Remaining requests allowed in current window */
  remaining: number;
  /** Max requests per window (informational) */
  limit: number;
  /** When the rate limit resets (Unix timestamp in ms) */
  resetAt: number;
  /** Last updated timestamp */
  updatedAt: number;
}

// =============================================================================
// Rate Limit Tracker
// =============================================================================

/**
 * In-memory rate limit budget tracker.
 * Tracks per-integration rate limit state and provides budget acquisition.
 */
class RateLimitTracker {
  private budgets = new Map<string, RateLimitBudget>();

  /**
   * Update rate limit budget from response headers.
   * Called after each API response to track remaining quota.
   */
  updateFromHeaders(integrationId: string, rateLimitInfo: RateLimitInfo): void {
    if (rateLimitInfo.remaining === undefined && rateLimitInfo.reset === undefined) {
      return;
    }

    const existing = this.budgets.get(integrationId);
    const now = Date.now();

    this.budgets.set(integrationId, {
      remaining: rateLimitInfo.remaining ?? existing?.remaining ?? 0,
      limit: rateLimitInfo.limit ?? existing?.limit ?? 0,
      resetAt: rateLimitInfo.reset ?? existing?.resetAt ?? now + 60_000,
      updatedAt: now,
    });
  }

  /**
   * Synchronous check: is there budget available?
   * Returns true if we have remaining requests or no tracking data yet.
   */
  hasBudget(integrationId: string): boolean {
    const budget = this.budgets.get(integrationId);

    // No data yet — allow freely (conservative: start pacing after first response)
    if (!budget) return true;

    // Reset window expired — budget should be refreshed
    if (Date.now() >= budget.resetAt) {
      this.budgets.delete(integrationId);
      return true;
    }

    return budget.remaining > 0;
  }

  /**
   * Acquire budget for one request. If no budget available, waits until
   * the reset window expires, then resolves.
   */
  async acquireBudget(integrationId: string): Promise<void> {
    const budget = this.budgets.get(integrationId);

    // No data yet — pass through freely
    if (!budget) return;

    // Reset window expired — clear stale budget and pass through
    const now = Date.now();
    if (now >= budget.resetAt) {
      this.budgets.delete(integrationId);
      return;
    }

    // Budget available — decrement and proceed
    if (budget.remaining > 0) {
      budget.remaining -= 1;
      return;
    }

    // No budget — wait until reset
    const waitMs = budget.resetAt - now;
    if (waitMs > 0) {
      await sleep(waitMs);
    }

    // After waiting, clear the stale budget (will be refreshed by next response)
    this.budgets.delete(integrationId);
  }

  /**
   * Get current budget info for diagnostics.
   */
  getBudgetInfo(integrationId: string): RateLimitBudget | undefined {
    return this.budgets.get(integrationId);
  }

  /**
   * Clear all tracked budgets (for testing).
   */
  clear(): void {
    this.budgets.clear();
  }
}

// =============================================================================
// Helpers
// =============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// =============================================================================
// Singleton
// =============================================================================

export const rateLimitTracker = new RateLimitTracker();
