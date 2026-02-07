/**
 * Reasoning Prompt Builder Unit Tests
 *
 * Tests for prompt construction, variable injection, context summarization,
 * and output truncation.
 */

import { describe, it, expect } from 'vitest';
import { buildReasoningPrompt } from '@/lib/modules/pipelines/reasoning/reasoning-prompt-builder';
import type { ReasoningPromptContext } from '@/lib/modules/pipelines/reasoning/reasoning-prompt-builder';
import type { PipelineState } from '@/lib/modules/pipelines/orchestrator/state-manager';

// =============================================================================
// Test Fixtures
// =============================================================================

function createContext(overrides?: Partial<ReasoningPromptContext>): ReasoningPromptContext {
  return {
    reasoningPrompt: 'Analyze the search results and identify relevant records.',
    stepOutput: { results: [{ id: '1', name: 'Acme Corp' }] },
    pipelineState: {
      input: { task: 'Update CRM records' },
      steps: {},
    },
    stepName: 'Search Records',
    stepSlug: 'search',
    stepNumber: 1,
    totalSteps: 3,
    ...overrides,
  };
}

// =============================================================================
// buildReasoningPrompt Tests
// =============================================================================

describe('buildReasoningPrompt', () => {
  it('should return both system and user prompts', () => {
    const context = createContext();
    const result = buildReasoningPrompt(context);

    expect(result.systemPrompt).toBeDefined();
    expect(result.userPrompt).toBeDefined();
    expect(typeof result.systemPrompt).toBe('string');
    expect(typeof result.userPrompt).toBe('string');
  });

  it('should include base system instructions', () => {
    const context = createContext();
    const result = buildReasoningPrompt(context);

    expect(result.systemPrompt).toContain('data processing assistant');
    expect(result.systemPrompt).toContain('valid JSON');
  });

  it('should include output schema in system prompt when provided', () => {
    const context = createContext({
      outputSchema: {
        type: 'object',
        properties: {
          relevantRecords: { type: 'array' },
        },
      },
    });
    const result = buildReasoningPrompt(context);

    expect(result.systemPrompt).toContain('Expected Output Schema');
    expect(result.systemPrompt).toContain('relevantRecords');
  });

  it('should NOT include output schema when not provided', () => {
    const context = createContext({ outputSchema: undefined });
    const result = buildReasoningPrompt(context);

    expect(result.systemPrompt).not.toContain('Expected Output Schema');
  });
});

// =============================================================================
// User Prompt Content Tests
// =============================================================================

describe('buildReasoningPrompt - user prompt', () => {
  it('should include pipeline progress info', () => {
    const context = createContext({ stepNumber: 2, totalSteps: 5 });
    const result = buildReasoningPrompt(context);

    expect(result.userPrompt).toContain('Step 2 of 5');
  });

  it('should include step name', () => {
    const context = createContext({ stepName: 'Triage Results' });
    const result = buildReasoningPrompt(context);

    expect(result.userPrompt).toContain('Triage Results');
  });

  it('should include step output as JSON', () => {
    const context = createContext({
      stepOutput: { results: [{ id: '1' }] },
    });
    const result = buildReasoningPrompt(context);

    expect(result.userPrompt).toContain('Current Step Output');
    expect(result.userPrompt).toContain('"results"');
  });

  it('should indicate reasoning-only step when no output', () => {
    const context = createContext({ stepOutput: null });
    const result = buildReasoningPrompt(context);

    expect(result.userPrompt).toContain('reasoning-only step');
  });

  it('should indicate reasoning-only step when output is undefined', () => {
    const context = createContext({ stepOutput: undefined });
    const result = buildReasoningPrompt(context);

    expect(result.userPrompt).toContain('reasoning-only step');
  });

  it('should include pipeline state summary', () => {
    const state: PipelineState = {
      input: { task: 'find leads' },
      steps: {
        search: {
          output: { count: 5 },
          status: 'completed',
        },
      },
    };
    const context = createContext({ pipelineState: state, stepNumber: 2 });
    const result = buildReasoningPrompt(context);

    expect(result.userPrompt).toContain('Pipeline State So Far');
    expect(result.userPrompt).toContain('find leads');
    expect(result.userPrompt).toContain('search');
  });

  it('should include the user-defined reasoning prompt', () => {
    const context = createContext({
      reasoningPrompt: 'Extract company names and classify by industry.',
    });
    const result = buildReasoningPrompt(context);

    expect(result.userPrompt).toContain('Your Task');
    expect(result.userPrompt).toContain('Extract company names and classify by industry.');
  });

  it('should include final instructions about JSON output', () => {
    const context = createContext();
    const result = buildReasoningPrompt(context);

    expect(result.userPrompt).toContain('Return ONLY valid JSON');
  });
});

// =============================================================================
// Large Output Truncation Tests
// =============================================================================

describe('buildReasoningPrompt - truncation', () => {
  it('should truncate very large step outputs', () => {
    const largeOutput = { data: 'x'.repeat(10000) };
    const context = createContext({ stepOutput: largeOutput });
    const result = buildReasoningPrompt(context);

    expect(result.userPrompt).toContain('truncated');
  });

  it('should not truncate small outputs', () => {
    const context = createContext({ stepOutput: { small: 'data' } });
    const result = buildReasoningPrompt(context);

    expect(result.userPrompt).not.toContain('truncated');
  });
});
