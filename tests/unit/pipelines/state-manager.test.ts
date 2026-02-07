/**
 * Pipeline State Manager Unit Tests
 *
 * Tests for state accumulation, step output storage, state immutability,
 * serialization, and state summaries.
 */

import { describe, it, expect } from 'vitest';
import {
  createInitialState,
  recordStepResult,
  hasStepResult,
  getStepResult,
  getCompletedStepSlugs,
  getRecordedStepSlugs,
  getStepStatusCounts,
  createStateSummary,
  serializeState,
  deserializeState,
} from '@/lib/modules/pipelines/orchestrator/state-manager';
import type { StepCompletionData } from '@/lib/modules/pipelines/orchestrator/state-manager';

// =============================================================================
// createInitialState Tests
// =============================================================================

describe('createInitialState', () => {
  it('should create state with input and empty steps', () => {
    const state = createInitialState({ query: 'test' });
    expect(state.input).toEqual({ query: 'test' });
    expect(state.steps).toEqual({});
  });

  it('should create a copy of the input (not reference)', () => {
    const input = { query: 'test' };
    const state = createInitialState(input);
    input.query = 'modified';
    expect(state.input.query).toBe('test');
  });

  it('should handle empty input', () => {
    const state = createInitialState({});
    expect(state.input).toEqual({});
    expect(state.steps).toEqual({});
  });

  it('should handle complex input', () => {
    const state = createInitialState({
      task: 'Update CRM',
      options: { depth: 'thorough' },
      tags: ['a', 'b'],
    });
    expect(state.input.task).toBe('Update CRM');
    expect(state.input.options).toEqual({ depth: 'thorough' });
    expect(state.input.tags).toEqual(['a', 'b']);
  });
});

// =============================================================================
// recordStepResult Tests
// =============================================================================

describe('recordStepResult', () => {
  it('should add a completed step result', () => {
    const state = createInitialState({ query: 'test' });
    const data: StepCompletionData = {
      stepSlug: 'search',
      output: { results: [1, 2, 3] },
      status: 'completed',
    };

    const newState = recordStepResult(state, data);

    expect(newState.steps.search).toBeDefined();
    expect(newState.steps.search.output).toEqual({ results: [1, 2, 3] });
    expect(newState.steps.search.status).toBe('completed');
  });

  it('should add reasoning output when provided', () => {
    const state = createInitialState({});
    const data: StepCompletionData = {
      stepSlug: 'triage',
      output: null,
      reasoning: { plan: 'execute update' },
      status: 'completed',
    };

    const newState = recordStepResult(state, data);

    expect(newState.steps.triage.reasoning).toEqual({ plan: 'execute update' });
  });

  it('should not include reasoning when not provided', () => {
    const state = createInitialState({});
    const data: StepCompletionData = {
      stepSlug: 'search',
      output: { data: 'results' },
      status: 'completed',
    };

    const newState = recordStepResult(state, data);

    expect(newState.steps.search.reasoning).toBeUndefined();
  });

  it('should add error when provided', () => {
    const state = createInitialState({});
    const data: StepCompletionData = {
      stepSlug: 'failing',
      output: null,
      status: 'failed',
      error: 'Connection timeout',
    };

    const newState = recordStepResult(state, data);

    expect(newState.steps.failing.status).toBe('failed');
    expect(newState.steps.failing.error).toBe('Connection timeout');
  });

  it('should return a new state object (immutability)', () => {
    const state = createInitialState({ query: 'test' });
    const data: StepCompletionData = {
      stepSlug: 'search',
      output: {},
      status: 'completed',
    };

    const newState = recordStepResult(state, data);

    expect(newState).not.toBe(state);
    expect(newState.steps).not.toBe(state.steps);
    expect(state.steps.search).toBeUndefined(); // original unchanged
  });

  it('should preserve previous steps when adding new ones', () => {
    let state = createInitialState({});
    state = recordStepResult(state, {
      stepSlug: 'step1',
      output: 'first',
      status: 'completed',
    });
    state = recordStepResult(state, {
      stepSlug: 'step2',
      output: 'second',
      status: 'completed',
    });

    expect(state.steps.step1.output).toBe('first');
    expect(state.steps.step2.output).toBe('second');
  });

  it('should handle skipped step status', () => {
    const state = createInitialState({});
    const data: StepCompletionData = {
      stepSlug: 'optional',
      output: null,
      status: 'skipped',
    };

    const newState = recordStepResult(state, data);

    expect(newState.steps.optional.status).toBe('skipped');
  });
});

// =============================================================================
// hasStepResult / getStepResult Tests
// =============================================================================

describe('hasStepResult', () => {
  it('should return true for recorded step', () => {
    let state = createInitialState({});
    state = recordStepResult(state, {
      stepSlug: 'search',
      output: {},
      status: 'completed',
    });

    expect(hasStepResult(state, 'search')).toBe(true);
  });

  it('should return false for missing step', () => {
    const state = createInitialState({});
    expect(hasStepResult(state, 'search')).toBe(false);
  });
});

describe('getStepResult', () => {
  it('should return step result for existing step', () => {
    let state = createInitialState({});
    state = recordStepResult(state, {
      stepSlug: 'search',
      output: { count: 5 },
      status: 'completed',
    });

    const result = getStepResult(state, 'search');
    expect(result).toBeDefined();
    expect(result?.output).toEqual({ count: 5 });
    expect(result?.status).toBe('completed');
  });

  it('should return undefined for non-existent step', () => {
    const state = createInitialState({});
    expect(getStepResult(state, 'missing')).toBeUndefined();
  });
});

// =============================================================================
// getCompletedStepSlugs / getRecordedStepSlugs Tests
// =============================================================================

describe('getCompletedStepSlugs', () => {
  it('should return only completed steps', () => {
    let state = createInitialState({});
    state = recordStepResult(state, { stepSlug: 'a', output: null, status: 'completed' });
    state = recordStepResult(state, { stepSlug: 'b', output: null, status: 'failed' });
    state = recordStepResult(state, { stepSlug: 'c', output: null, status: 'completed' });
    state = recordStepResult(state, { stepSlug: 'd', output: null, status: 'skipped' });

    const completed = getCompletedStepSlugs(state);
    expect(completed).toEqual(['a', 'c']);
  });

  it('should return empty array when no steps completed', () => {
    const state = createInitialState({});
    expect(getCompletedStepSlugs(state)).toEqual([]);
  });
});

describe('getRecordedStepSlugs', () => {
  it('should return all recorded steps regardless of status', () => {
    let state = createInitialState({});
    state = recordStepResult(state, { stepSlug: 'a', output: null, status: 'completed' });
    state = recordStepResult(state, { stepSlug: 'b', output: null, status: 'failed' });

    const recorded = getRecordedStepSlugs(state);
    expect(recorded).toEqual(['a', 'b']);
  });
});

// =============================================================================
// getStepStatusCounts Tests
// =============================================================================

describe('getStepStatusCounts', () => {
  it('should count steps by status', () => {
    let state = createInitialState({});
    state = recordStepResult(state, { stepSlug: 'a', output: null, status: 'completed' });
    state = recordStepResult(state, { stepSlug: 'b', output: null, status: 'completed' });
    state = recordStepResult(state, { stepSlug: 'c', output: null, status: 'failed' });
    state = recordStepResult(state, { stepSlug: 'd', output: null, status: 'skipped' });

    const counts = getStepStatusCounts(state);
    expect(counts).toEqual({ completed: 2, failed: 1, skipped: 1 });
  });

  it('should return zeros for empty state', () => {
    const state = createInitialState({});
    expect(getStepStatusCounts(state)).toEqual({ completed: 0, failed: 0, skipped: 0 });
  });
});

// =============================================================================
// createStateSummary Tests
// =============================================================================

describe('createStateSummary', () => {
  it('should include pipeline input', () => {
    const state = createInitialState({ query: 'test' });
    const summary = createStateSummary(state);
    expect(summary).toContain('Pipeline Input');
    expect(summary).toContain('test');
  });

  it('should include step results', () => {
    let state = createInitialState({ query: 'test' });
    state = recordStepResult(state, {
      stepSlug: 'search',
      output: { results: ['a'] },
      status: 'completed',
    });

    const summary = createStateSummary(state);
    expect(summary).toContain('Step Results');
    expect(summary).toContain('search');
    expect(summary).toContain('completed');
  });

  it('should include error in summary for failed steps', () => {
    let state = createInitialState({});
    state = recordStepResult(state, {
      stepSlug: 'failing',
      output: null,
      status: 'failed',
      error: 'API timeout',
    });

    const summary = createStateSummary(state);
    expect(summary).toContain('API timeout');
  });

  it('should include reasoning output when present', () => {
    let state = createInitialState({});
    state = recordStepResult(state, {
      stepSlug: 'triage',
      output: null,
      reasoning: { plan: 'do update' },
      status: 'completed',
    });

    const summary = createStateSummary(state);
    expect(summary).toContain('Reasoning');
    expect(summary).toContain('do update');
  });

  it('should not include step results section when no steps', () => {
    const state = createInitialState({ query: 'test' });
    const summary = createStateSummary(state);
    expect(summary).not.toContain('Step Results');
  });
});

// =============================================================================
// serializeState / deserializeState Tests
// =============================================================================

describe('serializeState / deserializeState', () => {
  it('should round-trip serialize and deserialize', () => {
    let state = createInitialState({ query: 'test' });
    state = recordStepResult(state, {
      stepSlug: 'search',
      output: { results: [1, 2] },
      reasoning: { plan: 'update' },
      status: 'completed',
    });

    const serialized = serializeState(state);
    const deserialized = deserializeState(serialized);

    expect(deserialized.input).toEqual(state.input);
    expect(deserialized.steps.search.output).toEqual(state.steps.search.output);
    expect(deserialized.steps.search.reasoning).toEqual(state.steps.search.reasoning);
    expect(deserialized.steps.search.status).toBe('completed');
  });

  it('should handle empty state deserialization', () => {
    const deserialized = deserializeState({});
    expect(deserialized.input).toEqual({});
    expect(deserialized.steps).toEqual({});
  });

  it('should handle partial state deserialization', () => {
    const deserialized = deserializeState({ input: { query: 'test' } });
    expect(deserialized.input).toEqual({ query: 'test' });
    expect(deserialized.steps).toEqual({});
  });
});
