/**
 * Condition Evaluator Unit Tests
 *
 * Tests for step skip condition evaluation, truthy/falsy logic,
 * and edge cases like unresolvable expressions.
 */

import { describe, it, expect } from 'vitest';
import { evaluateCondition } from '@/lib/modules/pipelines/orchestrator/condition-evaluator';
import type { StepCondition } from '@/lib/modules/pipelines/pipeline.schemas';
import type { PipelineState } from '@/lib/modules/pipelines/orchestrator/state-manager';

// =============================================================================
// Test Fixtures
// =============================================================================

function createState(steps: Record<string, { output: unknown; status: string }>): PipelineState {
  const stepsRecord: PipelineState['steps'] = {};
  for (const [slug, data] of Object.entries(steps)) {
    stepsRecord[slug] = {
      output: data.output,
      status: data.status as 'completed' | 'failed' | 'skipped',
    };
  }
  return { input: {}, steps: stepsRecord };
}

function makeCondition(expression: string, skipWhen: 'truthy' | 'falsy'): StepCondition {
  return { type: 'expression', expression, skipWhen };
}

// =============================================================================
// No Condition (always execute)
// =============================================================================

describe('evaluateCondition - no condition', () => {
  it('should not skip when condition is null', () => {
    const state = createState({});
    const result = evaluateCondition(null, state);
    expect(result.shouldSkip).toBe(false);
  });

  it('should not skip when condition is undefined', () => {
    const state = createState({});
    const result = evaluateCondition(undefined, state);
    expect(result.shouldSkip).toBe(false);
  });
});

// =============================================================================
// skipWhen: 'falsy' - Skip when expression resolves to falsy
// =============================================================================

describe('evaluateCondition - skipWhen: falsy', () => {
  it('should skip when expression resolves to 0', () => {
    const state = createState({
      search: { output: { results: { length: 0 } }, status: 'completed' },
    });
    const condition = makeCondition('{{steps.search.output.results.length}}', 'falsy');
    const result = evaluateCondition(condition, state);
    expect(result.shouldSkip).toBe(true);
  });

  it('should NOT skip when expression resolves to a positive number', () => {
    const state = createState({
      search: { output: { results: { length: 5 } }, status: 'completed' },
    });
    const condition = makeCondition('{{steps.search.output.results.length}}', 'falsy');
    const result = evaluateCondition(condition, state);
    expect(result.shouldSkip).toBe(false);
  });

  it('should skip when expression resolves to empty string', () => {
    const state = createState({
      search: { output: { name: '' }, status: 'completed' },
    });
    const condition = makeCondition('{{steps.search.output.name}}', 'falsy');
    const result = evaluateCondition(condition, state);
    expect(result.shouldSkip).toBe(true);
  });

  it('should NOT skip when expression resolves to non-empty string', () => {
    const state = createState({
      search: { output: { name: 'Result A' }, status: 'completed' },
    });
    const condition = makeCondition('{{steps.search.output.name}}', 'falsy');
    const result = evaluateCondition(condition, state);
    expect(result.shouldSkip).toBe(false);
  });

  it('should skip when expression resolves to null', () => {
    const state = createState({
      search: { output: null, status: 'completed' },
    });
    const condition = makeCondition('{{steps.search.output}}', 'falsy');
    const result = evaluateCondition(condition, state);
    expect(result.shouldSkip).toBe(true);
  });

  it('should skip when expression resolves to undefined (missing path)', () => {
    const state = createState({
      search: { output: {}, status: 'completed' },
    });
    const condition = makeCondition('{{steps.search.output.missing}}', 'falsy');
    const result = evaluateCondition(condition, state);
    expect(result.shouldSkip).toBe(true);
  });

  it('should NOT skip when expression resolves to boolean true', () => {
    const state = createState({
      search: { output: { active: true }, status: 'completed' },
    });
    const condition = makeCondition('{{steps.search.output.active}}', 'falsy');
    const result = evaluateCondition(condition, state);
    expect(result.shouldSkip).toBe(false);
  });

  it('should skip when expression resolves to boolean false', () => {
    const state = createState({
      search: { output: { active: false }, status: 'completed' },
    });
    const condition = makeCondition('{{steps.search.output.active}}', 'falsy');
    const result = evaluateCondition(condition, state);
    expect(result.shouldSkip).toBe(true);
  });

  it('should NOT skip when expression resolves to non-empty object', () => {
    const state = createState({
      search: { output: { data: { key: 'value' } }, status: 'completed' },
    });
    const condition = makeCondition('{{steps.search.output.data}}', 'falsy');
    const result = evaluateCondition(condition, state);
    expect(result.shouldSkip).toBe(false);
  });

  it('should skip when expression resolves to empty object', () => {
    const state = createState({
      search: { output: { data: {} }, status: 'completed' },
    });
    const condition = makeCondition('{{steps.search.output.data}}', 'falsy');
    const result = evaluateCondition(condition, state);
    expect(result.shouldSkip).toBe(true);
  });

  it('should NOT skip when expression resolves to non-empty array', () => {
    const state = createState({
      search: { output: { items: [1, 2] }, status: 'completed' },
    });
    const condition = makeCondition('{{steps.search.output.items}}', 'falsy');
    const result = evaluateCondition(condition, state);
    expect(result.shouldSkip).toBe(false);
  });

  it('should skip when expression resolves to empty array', () => {
    const state = createState({
      search: { output: { items: [] }, status: 'completed' },
    });
    const condition = makeCondition('{{steps.search.output.items}}', 'falsy');
    const result = evaluateCondition(condition, state);
    expect(result.shouldSkip).toBe(true);
  });
});

// =============================================================================
// skipWhen: 'truthy' - Skip when expression resolves to truthy
// =============================================================================

describe('evaluateCondition - skipWhen: truthy', () => {
  it('should skip when expression resolves to a positive number', () => {
    const state = createState({
      search: { output: { count: 5 }, status: 'completed' },
    });
    const condition = makeCondition('{{steps.search.output.count}}', 'truthy');
    const result = evaluateCondition(condition, state);
    expect(result.shouldSkip).toBe(true);
  });

  it('should NOT skip when expression resolves to 0', () => {
    const state = createState({
      search: { output: { count: 0 }, status: 'completed' },
    });
    const condition = makeCondition('{{steps.search.output.count}}', 'truthy');
    const result = evaluateCondition(condition, state);
    expect(result.shouldSkip).toBe(false);
  });

  it('should skip when expression resolves to "completed" status', () => {
    const state = createState({
      search: { output: {}, status: 'completed' },
    });
    const condition = makeCondition('{{steps.search.status}}', 'truthy');
    const result = evaluateCondition(condition, state);
    expect(result.shouldSkip).toBe(true);
  });

  it('should NOT skip when expression resolves to "false" string', () => {
    const state = createState({
      search: { output: { flag: 'false' }, status: 'completed' },
    });
    const condition = makeCondition('{{steps.search.output.flag}}', 'truthy');
    const result = evaluateCondition(condition, state);
    expect(result.shouldSkip).toBe(false);
  });
});

// =============================================================================
// Unresolvable Expression
// =============================================================================

describe('evaluateCondition - unresolvable expression', () => {
  it('should treat unresolvable step as falsy and skip when skipWhen=falsy', () => {
    const state = createState({});
    const condition = makeCondition('{{steps.nonexistent.output}}', 'falsy');
    const result = evaluateCondition(condition, state);
    expect(result.shouldSkip).toBe(true);
    expect(result.reason).toContain('could not be resolved');
  });

  it('should treat unresolvable step as falsy and NOT skip when skipWhen=truthy', () => {
    const state = createState({});
    const condition = makeCondition('{{steps.nonexistent.output}}', 'truthy');
    const result = evaluateCondition(condition, state);
    expect(result.shouldSkip).toBe(false);
  });
});

// =============================================================================
// Result metadata
// =============================================================================

describe('evaluateCondition - result metadata', () => {
  it('should include resolved value in result', () => {
    const state = createState({
      search: { output: { count: 3 }, status: 'completed' },
    });
    const condition = makeCondition('{{steps.search.output.count}}', 'falsy');
    const result = evaluateCondition(condition, state);
    expect(result.resolvedValue).toBe(3);
  });

  it('should include reason when skipping', () => {
    const state = createState({
      search: { output: { count: 0 }, status: 'completed' },
    });
    const condition = makeCondition('{{steps.search.output.count}}', 'falsy');
    const result = evaluateCondition(condition, state);
    expect(result.shouldSkip).toBe(true);
    expect(result.reason).toBeDefined();
    expect(result.reason).toContain('falsy');
  });

  it('should not include reason when NOT skipping', () => {
    const state = createState({
      search: { output: { count: 5 }, status: 'completed' },
    });
    const condition = makeCondition('{{steps.search.output.count}}', 'falsy');
    const result = evaluateCondition(condition, state);
    expect(result.shouldSkip).toBe(false);
    expect(result.reason).toBeUndefined();
  });
});
