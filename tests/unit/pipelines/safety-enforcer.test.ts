/**
 * Pipeline Safety Enforcer Unit Tests
 *
 * Tests for cost limits, duration limits, default limit resolution,
 * and edge cases.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  checkSafetyLimits,
  resolveEffectiveLimits,
  getElapsedMs,
  DEFAULT_SAFETY_LIMITS,
} from '@/lib/modules/pipelines/orchestrator/safety-enforcer';
import type { SafetyContext } from '@/lib/modules/pipelines/orchestrator/safety-enforcer';

// =============================================================================
// Helpers
// =============================================================================

function createContext(overrides?: Partial<SafetyContext>): SafetyContext {
  return {
    totalCostUsd: 0,
    startedAt: new Date(),
    currentStepNumber: 1,
    totalSteps: 3,
    ...overrides,
  };
}

// =============================================================================
// DEFAULT_SAFETY_LIMITS Tests
// =============================================================================

describe('DEFAULT_SAFETY_LIMITS', () => {
  it('should have sensible defaults', () => {
    expect(DEFAULT_SAFETY_LIMITS.maxCostUsd).toBe(5);
    expect(DEFAULT_SAFETY_LIMITS.maxDurationSeconds).toBe(1800);
  });
});

// =============================================================================
// resolveEffectiveLimits Tests
// =============================================================================

describe('resolveEffectiveLimits', () => {
  it('should return defaults when limits are null', () => {
    const result = resolveEffectiveLimits(null);
    expect(result).toEqual(DEFAULT_SAFETY_LIMITS);
  });

  it('should return defaults when limits are undefined', () => {
    const result = resolveEffectiveLimits(undefined);
    expect(result).toEqual(DEFAULT_SAFETY_LIMITS);
  });

  it('should use provided limits', () => {
    const result = resolveEffectiveLimits({ maxCostUsd: 1, maxDurationSeconds: 300 });
    expect(result.maxCostUsd).toBe(1);
    expect(result.maxDurationSeconds).toBe(300);
  });

  it('should fill in missing cost with default', () => {
    const result = resolveEffectiveLimits({
      maxCostUsd: undefined as unknown as number,
      maxDurationSeconds: 600,
    });
    expect(result.maxCostUsd).toBe(DEFAULT_SAFETY_LIMITS.maxCostUsd);
    expect(result.maxDurationSeconds).toBe(600);
  });

  it('should fill in missing duration with default', () => {
    const result = resolveEffectiveLimits({
      maxCostUsd: 2,
      maxDurationSeconds: undefined as unknown as number,
    });
    expect(result.maxCostUsd).toBe(2);
    expect(result.maxDurationSeconds).toBe(DEFAULT_SAFETY_LIMITS.maxDurationSeconds);
  });
});

// =============================================================================
// checkSafetyLimits - Cost Tests
// =============================================================================

describe('checkSafetyLimits - cost', () => {
  it('should be safe when cost is under limit', () => {
    const context = createContext({ totalCostUsd: 0.5 });
    const result = checkSafetyLimits({ maxCostUsd: 1, maxDurationSeconds: 1800 }, context);
    expect(result.safe).toBe(true);
    expect(result.violation).toBeUndefined();
  });

  it('should violate when cost equals limit', () => {
    const context = createContext({ totalCostUsd: 1.0 });
    const result = checkSafetyLimits({ maxCostUsd: 1, maxDurationSeconds: 1800 }, context);
    expect(result.safe).toBe(false);
    expect(result.violation?.type).toBe('cost_limit_exceeded');
  });

  it('should violate when cost exceeds limit', () => {
    const context = createContext({ totalCostUsd: 5.5 });
    const result = checkSafetyLimits({ maxCostUsd: 5, maxDurationSeconds: 1800 }, context);
    expect(result.safe).toBe(false);
    expect(result.violation?.type).toBe('cost_limit_exceeded');
    expect(result.violation?.limit).toBe(5);
    expect(result.violation?.current).toBe(5.5);
  });

  it('should include cost values in violation message', () => {
    const context = createContext({ totalCostUsd: 2.5 });
    const result = checkSafetyLimits({ maxCostUsd: 2, maxDurationSeconds: 1800 }, context);
    expect(result.violation?.message).toContain('$2.5');
    expect(result.violation?.message).toContain('$2.00');
  });

  it('should be safe at zero cost', () => {
    const context = createContext({ totalCostUsd: 0 });
    const result = checkSafetyLimits({ maxCostUsd: 5, maxDurationSeconds: 1800 }, context);
    expect(result.safe).toBe(true);
  });
});

// =============================================================================
// checkSafetyLimits - Duration Tests
// =============================================================================

describe('checkSafetyLimits - duration', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should be safe when duration is under limit', () => {
    const context = createContext({
      startedAt: new Date(Date.now() - 10000), // 10 seconds ago
    });
    const result = checkSafetyLimits({ maxCostUsd: 5, maxDurationSeconds: 60 }, context);
    expect(result.safe).toBe(true);
  });

  it('should violate when duration exceeds limit', () => {
    const context = createContext({
      startedAt: new Date(Date.now() - 120000), // 120 seconds ago
    });
    const result = checkSafetyLimits({ maxCostUsd: 5, maxDurationSeconds: 60 }, context);
    expect(result.safe).toBe(false);
    expect(result.violation?.type).toBe('duration_limit_exceeded');
    expect(result.violation?.limit).toBe(60);
  });

  it('should violate when duration equals limit', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1000000 + 60000);
    const context = createContext({
      startedAt: new Date(1000000), // exactly 60 seconds ago
    });
    const result = checkSafetyLimits({ maxCostUsd: 5, maxDurationSeconds: 60 }, context);
    expect(result.safe).toBe(false);
    expect(result.violation?.type).toBe('duration_limit_exceeded');
  });
});

// =============================================================================
// checkSafetyLimits - Default Limits
// =============================================================================

describe('checkSafetyLimits - null limits', () => {
  it('should use default limits when limits are null', () => {
    const context = createContext({ totalCostUsd: 0.1 });
    const result = checkSafetyLimits(null, context);
    expect(result.safe).toBe(true);
  });

  it('should use default limits when limits are undefined', () => {
    const context = createContext({ totalCostUsd: 0.1 });
    const result = checkSafetyLimits(undefined, context);
    expect(result.safe).toBe(true);
  });

  it('should violate default cost limit at $5', () => {
    const context = createContext({ totalCostUsd: 5.01 });
    const result = checkSafetyLimits(null, context);
    expect(result.safe).toBe(false);
    expect(result.violation?.type).toBe('cost_limit_exceeded');
  });
});

// =============================================================================
// getElapsedMs Tests
// =============================================================================

describe('getElapsedMs', () => {
  it('should return elapsed milliseconds', () => {
    const startedAt = new Date(Date.now() - 5000);
    const elapsed = getElapsedMs(startedAt);
    expect(elapsed).toBeGreaterThanOrEqual(4900);
    expect(elapsed).toBeLessThan(6000);
  });
});
