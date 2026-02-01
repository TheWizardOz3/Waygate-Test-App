/**
 * Cost Calculator Unit Tests
 *
 * Tests for LLM cost calculation functions.
 * Validates pricing accuracy, rounding, and token estimation.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  calculateCost,
  calculateCostBreakdown,
  estimateCost,
  estimateTokens,
  getAllPricing,
} from '@/lib/modules/agentic-tools/llm/cost-calculator';

// =============================================================================
// Cost Calculation Tests
// =============================================================================

describe('calculateCost', () => {
  it('should calculate cost for Claude Opus 4.5', () => {
    // Claude Opus 4.5: $15/1M input, $75/1M output
    const cost = calculateCost('anthropic', 'claude-opus-4.5', 1000, 500);

    // Expected: (1000/1M * 15) + (500/1M * 75) = 0.015 + 0.0375 = 0.0525
    expect(cost).toBe(0.0525);
  });

  it('should calculate cost for Claude Sonnet 4.5', () => {
    // Claude Sonnet 4.5: $3/1M input, $15/1M output
    const cost = calculateCost('anthropic', 'claude-sonnet-4.5', 1000, 500);

    // Expected: (1000/1M * 3) + (500/1M * 15) = 0.003 + 0.0075 = 0.0105
    expect(cost).toBe(0.0105);
  });

  it('should calculate cost for Gemini 3 Pro', () => {
    // Gemini 3 Pro: $1.25/1M input, $5/1M output
    const cost = calculateCost('google', 'gemini-3-pro-preview', 2000, 1000);

    // Expected: (2000/1M * 1.25) + (1000/1M * 5) = 0.0025 + 0.005 = 0.0075
    expect(cost).toBe(0.0075);
  });

  it('should calculate cost for Gemini 2.5 Flash', () => {
    // Gemini 2.5 Flash: $0.625/1M input, $2.5/1M output
    const cost = calculateCost('google', 'gemini-2.5-flash', 5000, 2000);

    // Expected: (5000/1M * 0.625) + (2000/1M * 2.5) = 0.003125 + 0.005 = 0.008125
    expect(cost).toBe(0.008125);
  });

  it('should handle zero tokens', () => {
    const cost = calculateCost('anthropic', 'claude-sonnet-4.5', 0, 0);
    expect(cost).toBe(0);
  });

  it('should handle large token counts', () => {
    // 1 million input tokens, 500k output tokens for Claude Opus
    const cost = calculateCost('anthropic', 'claude-opus-4.5', 1_000_000, 500_000);

    // Expected: (1M/1M * 15) + (500k/1M * 75) = 15 + 37.5 = 52.5
    expect(cost).toBe(52.5);
  });

  it('should round to 6 decimal places', () => {
    // Small numbers that would produce more than 6 decimals
    const cost = calculateCost('anthropic', 'claude-sonnet-4.5', 1, 1);

    // Should be rounded to 6 decimal places
    expect(cost.toString().split('.')[1]?.length || 0).toBeLessThanOrEqual(6);
  });

  it('should use default pricing for unknown model', () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const cost = calculateCost('anthropic', 'unknown-model', 1000, 500);

    // Default pricing: $5/1M input, $15/1M output
    // Expected: (1000/1M * 5) + (500/1M * 15) = 0.005 + 0.0075 = 0.0125
    expect(cost).toBe(0.0125);
    expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('Unknown model pricing'));

    consoleWarnSpy.mockRestore();
  });
});

// =============================================================================
// Cost Breakdown Tests
// =============================================================================

describe('calculateCostBreakdown', () => {
  it('should provide detailed cost breakdown', () => {
    const breakdown = calculateCostBreakdown('anthropic', 'claude-sonnet-4.5', 1000, 500);

    expect(breakdown).toMatchObject({
      inputTokens: 1000,
      outputTokens: 500,
      totalTokens: 1500,
      inputCost: 0.003,
      outputCost: 0.0075,
      totalCost: 0.0105,
      pricing: {
        input: 3.0,
        output: 15.0,
      },
    });
  });

  it('should round individual costs to 6 decimals', () => {
    const breakdown = calculateCostBreakdown('google', 'gemini-2.5-flash', 7, 3);

    const inputCostDecimals = breakdown.inputCost.toString().split('.')[1]?.length || 0;
    const outputCostDecimals = breakdown.outputCost.toString().split('.')[1]?.length || 0;

    expect(inputCostDecimals).toBeLessThanOrEqual(6);
    expect(outputCostDecimals).toBeLessThanOrEqual(6);
  });

  it('should calculate breakdown for zero tokens', () => {
    const breakdown = calculateCostBreakdown('anthropic', 'claude-opus-4.5', 0, 0);

    expect(breakdown.inputCost).toBe(0);
    expect(breakdown.outputCost).toBe(0);
    expect(breakdown.totalCost).toBe(0);
    expect(breakdown.totalTokens).toBe(0);
  });

  it('should return pricing information', () => {
    const breakdown = calculateCostBreakdown('anthropic', 'claude-opus-4.5', 100, 50);

    expect(breakdown.pricing).toEqual({
      input: 15.0,
      output: 75.0,
    });
  });
});

// =============================================================================
// Estimate Cost Tests
// =============================================================================

describe('estimateCost', () => {
  it('should estimate cost same as calculateCost', () => {
    const estimated = estimateCost('anthropic', 'claude-sonnet-4.5', 1000, 500);
    const calculated = calculateCost('anthropic', 'claude-sonnet-4.5', 1000, 500);

    expect(estimated).toBe(calculated);
  });

  it('should estimate cost for pre-execution planning', () => {
    // Estimate 10k input tokens, 2k output tokens
    const estimated = estimateCost('google', 'gemini-3-pro-preview', 10_000, 2_000);

    // Expected: (10k/1M * 1.25) + (2k/1M * 5) = 0.0125 + 0.01 = 0.0225
    expect(estimated).toBe(0.0225);
  });
});

// =============================================================================
// Token Estimation Tests
// =============================================================================

describe('estimateTokens', () => {
  it('should estimate tokens as chars / 4', () => {
    const text = 'This is a test sentence with exactly 50 chars.';
    const tokens = estimateTokens(text);

    // 47 chars / 4 = 11.75, ceil to 12
    expect(tokens).toBe(12);
  });

  it('should handle empty string', () => {
    const tokens = estimateTokens('');
    expect(tokens).toBe(0);
  });

  it('should handle single character', () => {
    const tokens = estimateTokens('a');
    expect(tokens).toBe(1);
  });

  it('should handle long text', () => {
    const text = 'a'.repeat(1000);
    const tokens = estimateTokens(text);

    // 1000 chars / 4 = 250
    expect(tokens).toBe(250);
  });

  it('should ceil fractional tokens', () => {
    const text = 'abc'; // 3 chars
    const tokens = estimateTokens(text);

    // 3 / 4 = 0.75, ceil to 1
    expect(tokens).toBe(1);
  });

  it('should estimate tokens for JSON', () => {
    const json = JSON.stringify({ name: 'Test', age: 30, active: true });
    const tokens = estimateTokens(json);

    // JSON length / 4, ceiled
    expect(tokens).toBeGreaterThan(0);
    expect(tokens).toBe(Math.ceil(json.length / 4));
  });

  it('should estimate tokens for system prompts', () => {
    const systemPrompt = `You are a database assistant. Generate SQL queries based on natural language.

# Database Schema:
{{database_schema}}

# User Request:
{{user_input}}`;

    const tokens = estimateTokens(systemPrompt);
    expect(tokens).toBeGreaterThan(0);
    expect(tokens).toBe(Math.ceil(systemPrompt.length / 4));
  });
});

// =============================================================================
// Pricing Data Tests
// =============================================================================

describe('getAllPricing', () => {
  it('should return all pricing data', () => {
    const pricing = getAllPricing();

    expect(pricing).toHaveProperty('anthropic');
    expect(pricing).toHaveProperty('google');
  });

  it('should include Claude models', () => {
    const pricing = getAllPricing();

    expect(pricing.anthropic).toHaveProperty('claude-opus-4.5');
    expect(pricing.anthropic).toHaveProperty('claude-sonnet-4.5');
  });

  it('should include Gemini models', () => {
    const pricing = getAllPricing();

    expect(pricing.google).toHaveProperty('gemini-3-pro-preview');
    expect(pricing.google).toHaveProperty('gemini-2.5-flash');
    expect(pricing.google).toHaveProperty('gemini-1.5-pro');
  });

  it('should return copies of pricing objects', () => {
    const pricing1 = getAllPricing();
    const pricing2 = getAllPricing();

    // Should be equal but not the same reference
    expect(pricing1).toEqual(pricing2);
    expect(pricing1).not.toBe(pricing2);
  });
});

// =============================================================================
// Edge Cases & Validation Tests
// =============================================================================

describe('Edge Cases', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should handle fuzzy model name matching', () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // Try a model with version suffix
    const cost1 = calculateCost('anthropic', 'claude-sonnet-4.5-20250101', 1000, 500);

    // Should match 'claude-sonnet-4.5' pricing
    expect(cost1).toBe(0.0105);
    expect(consoleWarnSpy).not.toHaveBeenCalled();

    consoleWarnSpy.mockRestore();
  });

  it('should warn once for unknown model', () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    calculateCost('google', 'nonexistent-model', 100, 50);

    expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Unknown model pricing for google/nonexistent-model')
    );

    consoleWarnSpy.mockRestore();
  });

  it('should handle very small token counts accurately', () => {
    // 1 input token, 1 output token for Claude Sonnet
    const cost = calculateCost('anthropic', 'claude-sonnet-4.5', 1, 1);

    // Expected: (1/1M * 3) + (1/1M * 15) = 0.000003 + 0.000015 = 0.000018
    expect(cost).toBe(0.000018);
  });

  it('should handle costs that round to zero', () => {
    // Such small usage it rounds to zero (0 tokens)
    const cost = calculateCost('google', 'gemini-2.5-flash', 0, 0);

    expect(cost).toBe(0);
  });

  it('should calculate consistent costs regardless of order', () => {
    const cost1 = calculateCost('anthropic', 'claude-opus-4.5', 1000, 500);
    const cost2 = calculateCost('anthropic', 'claude-opus-4.5', 1000, 500);

    expect(cost1).toBe(cost2);
  });
});

// =============================================================================
// Real-World Scenario Tests
// =============================================================================

describe('Real-World Scenarios', () => {
  it('should calculate typical agentic tool invocation cost', () => {
    // Typical parameter interpreter: ~2k input (prompt + schema), ~200 output (JSON)
    const cost = calculateCost('anthropic', 'claude-sonnet-4.5', 2000, 200);

    // Expected: (2000/1M * 3) + (200/1M * 15) = 0.006 + 0.003 = 0.009
    expect(cost).toBe(0.009);
    expect(cost).toBeLessThan(0.01); // Less than 1 cent
  });

  it('should calculate autonomous agent multi-turn cost', () => {
    // Autonomous agent with 5 LLM calls
    let totalCost = 0;

    // First call: Planning (1k input, 100 output)
    totalCost += calculateCost('anthropic', 'claude-opus-4.5', 1000, 100);

    // Tool selection calls (500 input, 50 output each)
    for (let i = 0; i < 4; i++) {
      totalCost += calculateCost('anthropic', 'claude-opus-4.5', 500, 50);
    }

    // Total should be reasonable (<$1)
    expect(totalCost).toBeGreaterThan(0);
    expect(totalCost).toBeLessThan(1.0);
  });

  it('should estimate cost before execution', () => {
    const systemPrompt = 'You are a database assistant...';
    const userInput = 'Find all active users who logged in within last 30 days';

    const estimatedInput = estimateTokens(systemPrompt) + estimateTokens(userInput) + 500; // +500 for schema
    const estimatedOutput = 100; // Small JSON output

    const estimatedCost = estimateCost(
      'anthropic',
      'claude-sonnet-4.5',
      estimatedInput,
      estimatedOutput
    );

    expect(estimatedCost).toBeGreaterThan(0);
    expect(estimatedCost).toBeLessThan(0.05); // Should be very cheap
  });

  it('should track cumulative cost across executions', () => {
    const executions = [
      { input: 2000, output: 200 },
      { input: 1500, output: 150 },
      { input: 2500, output: 300 },
    ];

    let totalCost = 0;
    for (const exec of executions) {
      totalCost += calculateCost('anthropic', 'claude-sonnet-4.5', exec.input, exec.output);
    }

    // Total for 3 executions with Sonnet should be reasonable
    expect(totalCost).toBeGreaterThan(0);
    expect(totalCost).toBeLessThan(0.1);
  });
});
