/**
 * Safety Enforcer Unit Tests
 *
 * Tests for safety limit enforcement in agentic tools.
 * Validates limits, timeouts, cost tracking, and error handling.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  SafetyEnforcer,
  SafetyLimitError,
  getDefaultSafetyLimits,
  mergeSafetyLimits,
  validateSafetyLimits,
} from '@/lib/modules/agentic-tools/orchestrator/safety-enforcer';
import type { SafetyLimits } from '@/lib/modules/agentic-tools/agentic-tool.schemas';

// =============================================================================
// SafetyEnforcer Tests
// =============================================================================

describe('SafetyEnforcer', () => {
  const defaultLimits: SafetyLimits = {
    maxToolCalls: 10,
    timeoutSeconds: 300,
    maxTotalCost: 1.0,
  };

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ===========================================================================
  // Tool Call Limit Tests
  // ===========================================================================

  describe('checkToolCallLimit', () => {
    it('should pass when below limit', () => {
      const enforcer = new SafetyEnforcer(defaultLimits);

      expect(() => enforcer.checkToolCallLimit(5)).not.toThrow();
      expect(() => enforcer.checkToolCallLimit(9)).not.toThrow();
    });

    it('should throw when at limit', () => {
      const enforcer = new SafetyEnforcer(defaultLimits);

      expect(() => enforcer.checkToolCallLimit(10)).toThrow(SafetyLimitError);
    });

    it('should throw when exceeding limit', () => {
      const enforcer = new SafetyEnforcer(defaultLimits);

      expect(() => enforcer.checkToolCallLimit(11)).toThrow(SafetyLimitError);
      expect(() => enforcer.checkToolCallLimit(100)).toThrow(SafetyLimitError);
    });

    it('should throw with correct error code', () => {
      const enforcer = new SafetyEnforcer(defaultLimits);

      try {
        enforcer.checkToolCallLimit(10);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(SafetyLimitError);
        expect((error as SafetyLimitError).code).toBe('MAX_TOOL_CALLS_EXCEEDED');
      }
    });

    it('should include limit and actual in error', () => {
      const enforcer = new SafetyEnforcer(defaultLimits);

      try {
        enforcer.checkToolCallLimit(15);
        expect.fail('Should have thrown');
      } catch (error) {
        const limitError = error as SafetyLimitError;
        expect(limitError.limit).toBe(10);
        expect(limitError.actual).toBe(15);
      }
    });

    it('should respect custom tool call limit', () => {
      const enforcer = new SafetyEnforcer({ ...defaultLimits, maxToolCalls: 5 });

      expect(() => enforcer.checkToolCallLimit(4)).not.toThrow();
      expect(() => enforcer.checkToolCallLimit(5)).toThrow(SafetyLimitError);
    });
  });

  // ===========================================================================
  // Timeout Tests
  // ===========================================================================

  describe('checkTimeout', () => {
    it('should pass when within timeout', () => {
      const startTime = Date.now();
      const enforcer = new SafetyEnforcer(defaultLimits, startTime);

      vi.advanceTimersByTime(60_000); // 1 minute
      expect(() => enforcer.checkTimeout()).not.toThrow();

      vi.advanceTimersByTime(120_000); // +2 minutes = 3 minutes total
      expect(() => enforcer.checkTimeout()).not.toThrow();
    });

    it('should throw when timeout exceeded', () => {
      const startTime = Date.now();
      const enforcer = new SafetyEnforcer(defaultLimits, startTime);

      vi.advanceTimersByTime(300_000); // Exactly 5 minutes
      expect(() => enforcer.checkTimeout()).toThrow(SafetyLimitError);
    });

    it('should throw when significantly past timeout', () => {
      const startTime = Date.now();
      const enforcer = new SafetyEnforcer(defaultLimits, startTime);

      vi.advanceTimersByTime(600_000); // 10 minutes
      expect(() => enforcer.checkTimeout()).toThrow(SafetyLimitError);
    });

    it('should throw with correct error code', () => {
      const startTime = Date.now();
      const enforcer = new SafetyEnforcer(defaultLimits, startTime);

      vi.advanceTimersByTime(300_000);

      try {
        enforcer.checkTimeout();
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(SafetyLimitError);
        expect((error as SafetyLimitError).code).toBe('TIMEOUT');
      }
    });

    it('should respect custom timeout', () => {
      const startTime = Date.now();
      const enforcer = new SafetyEnforcer({ ...defaultLimits, timeoutSeconds: 60 }, startTime);

      vi.advanceTimersByTime(59_000);
      expect(() => enforcer.checkTimeout()).not.toThrow();

      vi.advanceTimersByTime(1_000); // Total: 60 seconds
      expect(() => enforcer.checkTimeout()).toThrow(SafetyLimitError);
    });

    it('should calculate elapsed seconds correctly in error', () => {
      const startTime = Date.now();
      const enforcer = new SafetyEnforcer({ ...defaultLimits, timeoutSeconds: 60 }, startTime);

      vi.advanceTimersByTime(90_000); // 90 seconds

      try {
        enforcer.checkTimeout();
        expect.fail('Should have thrown');
      } catch (error) {
        const limitError = error as SafetyLimitError;
        expect(limitError.limit).toBe(60);
        expect(limitError.actual).toBe(90);
      }
    });
  });

  // ===========================================================================
  // Cost Limit Tests
  // ===========================================================================

  describe('checkCostLimit', () => {
    it('should pass when below cost limit', () => {
      const enforcer = new SafetyEnforcer(defaultLimits);

      expect(() => enforcer.checkCostLimit(0.5)).not.toThrow();
      expect(() => enforcer.checkCostLimit(0.99)).not.toThrow();
    });

    it('should throw when at cost limit', () => {
      const enforcer = new SafetyEnforcer(defaultLimits);

      expect(() => enforcer.checkCostLimit(1.0)).toThrow(SafetyLimitError);
    });

    it('should throw when exceeding cost limit', () => {
      const enforcer = new SafetyEnforcer(defaultLimits);

      expect(() => enforcer.checkCostLimit(1.01)).toThrow(SafetyLimitError);
      expect(() => enforcer.checkCostLimit(5.0)).toThrow(SafetyLimitError);
    });

    it('should throw with correct error code', () => {
      const enforcer = new SafetyEnforcer(defaultLimits);

      try {
        enforcer.checkCostLimit(1.5);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(SafetyLimitError);
        expect((error as SafetyLimitError).code).toBe('MAX_COST_EXCEEDED');
      }
    });

    it('should respect custom cost limit', () => {
      const enforcer = new SafetyEnforcer({ ...defaultLimits, maxTotalCost: 0.5 });

      expect(() => enforcer.checkCostLimit(0.49)).not.toThrow();
      expect(() => enforcer.checkCostLimit(0.5)).toThrow(SafetyLimitError);
    });

    it('should handle very small costs', () => {
      const enforcer = new SafetyEnforcer({ ...defaultLimits, maxTotalCost: 0.01 });

      expect(() => enforcer.checkCostLimit(0.001)).not.toThrow();
      expect(() => enforcer.checkCostLimit(0.009)).not.toThrow();
      expect(() => enforcer.checkCostLimit(0.01)).toThrow(SafetyLimitError);
    });
  });

  // ===========================================================================
  // Elapsed Time Tracking Tests
  // ===========================================================================

  describe('getElapsedMs / getElapsedSeconds', () => {
    it('should track elapsed milliseconds', () => {
      const startTime = Date.now();
      const enforcer = new SafetyEnforcer(defaultLimits, startTime);

      expect(enforcer.getElapsedMs()).toBe(0);

      vi.advanceTimersByTime(1000);
      expect(enforcer.getElapsedMs()).toBe(1000);

      vi.advanceTimersByTime(2500);
      expect(enforcer.getElapsedMs()).toBe(3500);
    });

    it('should track elapsed seconds', () => {
      const startTime = Date.now();
      const enforcer = new SafetyEnforcer(defaultLimits, startTime);

      expect(enforcer.getElapsedSeconds()).toBe(0);

      vi.advanceTimersByTime(3500);
      expect(enforcer.getElapsedSeconds()).toBe(3); // Floor to 3 seconds

      vi.advanceTimersByTime(4600);
      expect(enforcer.getElapsedSeconds()).toBe(8); // Floor to 8 seconds
    });

    it('should use Date.now() by default', () => {
      const enforcer = new SafetyEnforcer(defaultLimits);

      vi.advanceTimersByTime(5000);
      expect(enforcer.getElapsedMs()).toBe(5000);
    });
  });

  // ===========================================================================
  // canContinue Tests
  // ===========================================================================

  describe('canContinue', () => {
    it('should return true when all limits OK', () => {
      const startTime = Date.now();
      const enforcer = new SafetyEnforcer(defaultLimits, startTime);

      vi.advanceTimersByTime(60_000); // 1 minute

      expect(enforcer.canContinue(5, 0.5)).toBe(true);
    });

    it('should return false when tool call limit exceeded', () => {
      const enforcer = new SafetyEnforcer(defaultLimits);

      expect(enforcer.canContinue(10, 0.5)).toBe(false);
    });

    it('should return false when timeout exceeded', () => {
      const startTime = Date.now();
      const enforcer = new SafetyEnforcer(defaultLimits, startTime);

      vi.advanceTimersByTime(300_000); // 5 minutes

      expect(enforcer.canContinue(5, 0.5)).toBe(false);
    });

    it('should return false when cost limit exceeded', () => {
      const enforcer = new SafetyEnforcer(defaultLimits);

      expect(enforcer.canContinue(5, 1.0)).toBe(false);
    });

    it('should return false when any limit exceeded', () => {
      const startTime = Date.now();
      const enforcer = new SafetyEnforcer(defaultLimits, startTime);

      vi.advanceTimersByTime(300_000);

      expect(enforcer.canContinue(10, 1.0)).toBe(false);
    });

    it('should not throw, just return false', () => {
      const enforcer = new SafetyEnforcer(defaultLimits);

      expect(() => enforcer.canContinue(100, 5.0)).not.toThrow();
      expect(enforcer.canContinue(100, 5.0)).toBe(false);
    });
  });

  // ===========================================================================
  // getRemainingCapacity Tests
  // ===========================================================================

  describe('getRemainingCapacity', () => {
    it('should calculate remaining capacity for all limits', () => {
      const startTime = Date.now();
      const enforcer = new SafetyEnforcer(defaultLimits, startTime);

      vi.advanceTimersByTime(60_000); // 1 minute

      const remaining = enforcer.getRemainingCapacity(3, 0.25);

      expect(remaining.toolCalls).toBe(7); // 10 - 3
      expect(remaining.timeSeconds).toBe(240); // 300 - 60
      expect(remaining.cost).toBe(0.75); // 1.0 - 0.25
    });

    it('should return 0 for exhausted limits', () => {
      const startTime = Date.now();
      const enforcer = new SafetyEnforcer(defaultLimits, startTime);

      vi.advanceTimersByTime(300_000);

      const remaining = enforcer.getRemainingCapacity(10, 1.0);

      expect(remaining.toolCalls).toBe(0);
      expect(remaining.timeSeconds).toBe(0);
      expect(remaining.cost).toBe(0);
    });

    it('should not return negative values', () => {
      const startTime = Date.now();
      const enforcer = new SafetyEnforcer(defaultLimits, startTime);

      vi.advanceTimersByTime(400_000); // Past timeout

      const remaining = enforcer.getRemainingCapacity(20, 2.0);

      expect(remaining.toolCalls).toBe(0);
      expect(remaining.timeSeconds).toBe(0);
      expect(remaining.cost).toBe(0);
    });

    it('should calculate partial remaining capacity', () => {
      const startTime = Date.now();
      const enforcer = new SafetyEnforcer(defaultLimits, startTime);

      vi.advanceTimersByTime(150_000); // 2.5 minutes

      const remaining = enforcer.getRemainingCapacity(5, 0.5);

      expect(remaining.toolCalls).toBe(5);
      expect(remaining.timeSeconds).toBe(150); // 300 - 150
      expect(remaining.cost).toBeCloseTo(0.5);
    });
  });

  // ===========================================================================
  // getLimits Tests
  // ===========================================================================

  describe('getLimits', () => {
    it('should return copy of limits', () => {
      const enforcer = new SafetyEnforcer(defaultLimits);

      const limits = enforcer.getLimits();

      expect(limits).toEqual(defaultLimits);
      expect(limits).not.toBe(defaultLimits); // Different object
    });

    it('should return immutable limits', () => {
      const enforcer = new SafetyEnforcer(defaultLimits);

      const limits1 = enforcer.getLimits();
      limits1.maxToolCalls = 999;

      const limits2 = enforcer.getLimits();
      expect(limits2.maxToolCalls).toBe(10); // Original value
    });
  });
});

// =============================================================================
// SafetyLimitError Tests
// =============================================================================

describe('SafetyLimitError', () => {
  it('should create error with correct properties', () => {
    const error = new SafetyLimitError('MAX_TOOL_CALLS_EXCEEDED', 'Limit exceeded', 10, 15);

    expect(error.name).toBe('SafetyLimitError');
    expect(error.code).toBe('MAX_TOOL_CALLS_EXCEEDED');
    expect(error.message).toBe('Limit exceeded');
    expect(error.limit).toBe(10);
    expect(error.actual).toBe(15);
  });

  it('should convert to API error format', () => {
    const error = new SafetyLimitError('TIMEOUT', 'Timeout exceeded', 300, 450);

    const apiError = error.toApiError();

    expect(apiError).toEqual({
      code: 'TIMEOUT',
      message: 'Timeout exceeded',
      details: {
        limit: 300,
        actual: 450,
        exceeded: 150, // 450 - 300
      },
      retryable: false,
    });
  });

  it('should mark as not retryable', () => {
    const error = new SafetyLimitError('MAX_COST_EXCEEDED', 'Cost exceeded', 1.0, 1.5);

    expect(error.toApiError().retryable).toBe(false);
  });

  it('should calculate exceeded amount', () => {
    const error = new SafetyLimitError('MAX_TOOL_CALLS_EXCEEDED', 'Exceeded', 10, 25);

    const apiError = error.toApiError();
    expect(apiError.details.exceeded).toBe(15); // 25 - 10
  });
});

// =============================================================================
// Helper Function Tests
// =============================================================================

describe('getDefaultSafetyLimits', () => {
  it('should return default limits', () => {
    const limits = getDefaultSafetyLimits();

    expect(limits).toEqual({
      maxToolCalls: 10,
      timeoutSeconds: 300,
      maxTotalCost: 1.0,
    });
  });

  it('should return a new object each time', () => {
    const limits1 = getDefaultSafetyLimits();
    const limits2 = getDefaultSafetyLimits();

    expect(limits1).toEqual(limits2);
    expect(limits1).not.toBe(limits2);
  });
});

describe('mergeSafetyLimits', () => {
  it('should use defaults when no overrides provided', () => {
    const merged = mergeSafetyLimits({});

    expect(merged).toEqual(getDefaultSafetyLimits());
  });

  it('should merge partial overrides', () => {
    const merged = mergeSafetyLimits({ maxToolCalls: 5 });

    expect(merged).toEqual({
      maxToolCalls: 5,
      timeoutSeconds: 300,
      maxTotalCost: 1.0,
    });
  });

  it('should override all limits', () => {
    const merged = mergeSafetyLimits({
      maxToolCalls: 20,
      timeoutSeconds: 600,
      maxTotalCost: 2.0,
    });

    expect(merged).toEqual({
      maxToolCalls: 20,
      timeoutSeconds: 600,
      maxTotalCost: 2.0,
    });
  });

  it('should handle zero values correctly', () => {
    // Even though invalid, merge should preserve them
    const merged = mergeSafetyLimits({ maxToolCalls: 0 });

    expect(merged.maxToolCalls).toBe(0);
  });
});

describe('validateSafetyLimits', () => {
  const validLimits: SafetyLimits = {
    maxToolCalls: 10,
    timeoutSeconds: 300,
    maxTotalCost: 1.0,
  };

  it('should validate correct limits', () => {
    const result = validateSafetyLimits(validLimits);

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('should reject maxToolCalls < 1', () => {
    const result = validateSafetyLimits({ ...validLimits, maxToolCalls: 0 });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('maxToolCalls must be at least 1');
  });

  it('should reject maxToolCalls > 100', () => {
    const result = validateSafetyLimits({ ...validLimits, maxToolCalls: 101 });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('maxToolCalls cannot exceed 100');
  });

  it('should reject timeoutSeconds < 30', () => {
    const result = validateSafetyLimits({ ...validLimits, timeoutSeconds: 29 });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('timeoutSeconds must be at least 30');
  });

  it('should reject timeoutSeconds > 600', () => {
    const result = validateSafetyLimits({ ...validLimits, timeoutSeconds: 601 });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('timeoutSeconds cannot exceed 600 (10 minutes)');
  });

  it('should reject maxTotalCost < 0.01', () => {
    const result = validateSafetyLimits({ ...validLimits, maxTotalCost: 0.009 });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('maxTotalCost must be at least $0.01');
  });

  it('should reject maxTotalCost > 10', () => {
    const result = validateSafetyLimits({ ...validLimits, maxTotalCost: 10.01 });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('maxTotalCost cannot exceed $10.00');
  });

  it('should accumulate multiple errors', () => {
    const result = validateSafetyLimits({
      maxToolCalls: 0,
      timeoutSeconds: 10,
      maxTotalCost: 0.001,
    });

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBe(3);
  });

  it('should accept boundary values', () => {
    const result1 = validateSafetyLimits({ ...validLimits, maxToolCalls: 1 });
    const result2 = validateSafetyLimits({ ...validLimits, maxToolCalls: 100 });
    const result3 = validateSafetyLimits({ ...validLimits, timeoutSeconds: 30 });
    const result4 = validateSafetyLimits({ ...validLimits, timeoutSeconds: 600 });
    const result5 = validateSafetyLimits({ ...validLimits, maxTotalCost: 0.01 });
    const result6 = validateSafetyLimits({ ...validLimits, maxTotalCost: 10 });

    expect(result1.valid).toBe(true);
    expect(result2.valid).toBe(true);
    expect(result3.valid).toBe(true);
    expect(result4.valid).toBe(true);
    expect(result5.valid).toBe(true);
    expect(result6.valid).toBe(true);
  });
});

// =============================================================================
// Real-World Scenario Tests
// =============================================================================

describe('Real-World Scenarios', () => {
  const defaultLimits: SafetyLimits = {
    maxToolCalls: 10,
    timeoutSeconds: 300,
    maxTotalCost: 1.0,
  };

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should enforce limits during autonomous agent execution', () => {
    const startTime = Date.now();
    const enforcer = new SafetyEnforcer(defaultLimits, startTime);

    let toolCalls = 0;
    let totalCost = 0;

    // Simulate tool calls
    for (let i = 0; i < 8; i++) {
      vi.advanceTimersByTime(10_000); // 10 seconds per call
      toolCalls++;
      totalCost += 0.05;

      expect(enforcer.canContinue(toolCalls, totalCost)).toBe(true);
    }

    // 9th call should still be OK
    toolCalls++;
    totalCost += 0.05;
    expect(enforcer.canContinue(toolCalls, totalCost)).toBe(true);

    // 10th call hits limit
    toolCalls++;
    expect(enforcer.canContinue(toolCalls, totalCost)).toBe(false);
  });

  it('should stop execution when cost limit hit first', () => {
    const startTime = Date.now();
    const enforcer = new SafetyEnforcer(
      { maxToolCalls: 100, timeoutSeconds: 600, maxTotalCost: 0.5 },
      startTime
    );

    let toolCalls = 0;
    let totalCost = 0;

    // Expensive LLM calls
    while (totalCost < 0.5) {
      toolCalls++;
      totalCost += 0.12; // $0.12 per call

      if (totalCost < 0.5) {
        expect(enforcer.canContinue(toolCalls, totalCost)).toBe(true);
      }
    }

    // Cost limit exceeded
    expect(enforcer.canContinue(toolCalls, totalCost)).toBe(false);
    expect(toolCalls).toBeLessThan(100); // Stopped by cost, not tool calls
  });

  it('should provide useful remaining capacity info', () => {
    const startTime = Date.now();
    const enforcer = new SafetyEnforcer(defaultLimits, startTime);

    // After 3 minutes, 6 calls, $0.40 spent
    vi.advanceTimersByTime(180_000);

    const remaining = enforcer.getRemainingCapacity(6, 0.4);

    expect(remaining.toolCalls).toBe(4); // Can make 4 more calls
    expect(remaining.timeSeconds).toBe(120); // 2 minutes left
    expect(remaining.cost).toBeCloseTo(0.6); // $0.60 budget remaining

    // Agent could estimate: "I have room for ~4-5 more tool calls if I stay on budget"
  });
});
