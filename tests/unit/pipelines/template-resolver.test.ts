/**
 * Template Resolver Unit Tests
 *
 * Tests for expression parsing, nested property access, array indexing,
 * missing references, and template validation.
 */

import { describe, it, expect } from 'vitest';
import {
  parsePath,
  resolvePathValue,
  resolveExpression,
  resolveTemplateString,
  resolveTemplates,
  extractTemplateExpressions,
  validateTemplateExpressions,
  TemplateResolutionError,
} from '@/lib/modules/pipelines/orchestrator/template-resolver';
import type { PipelineState } from '@/lib/modules/pipelines/orchestrator/state-manager';

// =============================================================================
// Test Fixtures
// =============================================================================

function createTestState(overrides?: Partial<PipelineState>): PipelineState {
  return {
    input: { query: 'test query', depth: 'thorough' },
    steps: {
      search: {
        output: {
          results: [
            { id: '1', name: 'Result A', url: 'https://a.com' },
            { id: '2', name: 'Result B', url: 'https://b.com' },
          ],
          totalCount: 2,
        },
        reasoning: {
          relevantRecords: [{ id: '1', matchReason: 'exact match' }],
          suggestedOperation: 'update',
        },
        status: 'completed',
      },
      triage: {
        output: null,
        reasoning: {
          operation: 'update',
          recordIds: ['1'],
          updateFields: { stage: 'negotiation' },
        },
        status: 'completed',
      },
    },
    ...overrides,
  };
}

// =============================================================================
// parsePath Tests
// =============================================================================

describe('parsePath', () => {
  it('should parse simple dot-notation path', () => {
    expect(parsePath('input.query')).toEqual(['input', 'query']);
  });

  it('should parse multi-level path', () => {
    expect(parsePath('steps.search.output')).toEqual(['steps', 'search', 'output']);
  });

  it('should parse path with array index', () => {
    expect(parsePath('steps.search.output.results[0].url')).toEqual([
      'steps',
      'search',
      'output',
      'results',
      0,
      'url',
    ]);
  });

  it('should parse path with multiple array indices', () => {
    expect(parsePath('data[0].items[1].value')).toEqual(['data', 0, 'items', 1, 'value']);
  });

  it('should parse single segment path', () => {
    expect(parsePath('input')).toEqual(['input']);
  });

  it('should handle underscored property names', () => {
    expect(parsePath('steps.my_step.output')).toEqual(['steps', 'my_step', 'output']);
  });

  it('should handle $ prefix in property names', () => {
    expect(parsePath('$root.$child')).toEqual(['$root', '$child']);
  });

  it('should throw on empty path segment (double dots)', () => {
    expect(() => parsePath('steps..search')).toThrow(TemplateResolutionError);
  });

  it('should throw on leading dot', () => {
    expect(() => parsePath('.steps.search')).toThrow(TemplateResolutionError);
  });

  it('should throw on trailing dot', () => {
    expect(() => parsePath('steps.search.')).toThrow(TemplateResolutionError);
  });

  it('should throw on invalid segment characters', () => {
    expect(() => parsePath('steps.search-results')).toThrow(TemplateResolutionError);
  });

  it('should trim whitespace from path', () => {
    expect(parsePath('  input.query  ')).toEqual(['input', 'query']);
  });
});

// =============================================================================
// resolvePathValue Tests
// =============================================================================

describe('resolvePathValue', () => {
  const state = createTestState();

  it('should resolve top-level input', () => {
    expect(resolvePathValue(state, ['input', 'query'])).toBe('test query');
  });

  it('should resolve step output', () => {
    const result = resolvePathValue(state, ['steps', 'search', 'output', 'totalCount']);
    expect(result).toBe(2);
  });

  it('should resolve array element', () => {
    const result = resolvePathValue(state, ['steps', 'search', 'output', 'results', 0, 'name']);
    expect(result).toBe('Result A');
  });

  it('should resolve second array element', () => {
    const result = resolvePathValue(state, ['steps', 'search', 'output', 'results', 1, 'url']);
    expect(result).toBe('https://b.com');
  });

  it('should resolve reasoning output', () => {
    const result = resolvePathValue(state, ['steps', 'triage', 'reasoning', 'operation']);
    expect(result).toBe('update');
  });

  it('should resolve step status', () => {
    expect(resolvePathValue(state, ['steps', 'search', 'status'])).toBe('completed');
  });

  it('should return undefined for missing path', () => {
    expect(resolvePathValue(state, ['steps', 'nonexistent', 'output'])).toBeUndefined();
  });

  it('should return undefined for out-of-bounds array index', () => {
    const result = resolvePathValue(state, ['steps', 'search', 'output', 'results', 99]);
    expect(result).toBeUndefined();
  });

  it('should return undefined when accessing array index on non-array', () => {
    const result = resolvePathValue(state, ['input', 0]);
    expect(result).toBeUndefined();
  });

  it('should return undefined when accessing property on primitive', () => {
    const result = resolvePathValue(state, ['input', 'query', 'nonexistent']);
    expect(result).toBeUndefined();
  });

  it('should return undefined for null intermediate value', () => {
    const result = resolvePathValue(state, ['steps', 'triage', 'output', 'field']);
    expect(result).toBeUndefined();
  });

  it('should return full object when path ends at object', () => {
    const result = resolvePathValue(state, ['steps', 'search', 'output']);
    expect(result).toEqual({
      results: [
        { id: '1', name: 'Result A', url: 'https://a.com' },
        { id: '2', name: 'Result B', url: 'https://b.com' },
      ],
      totalCount: 2,
    });
  });
});

// =============================================================================
// resolveExpression Tests
// =============================================================================

describe('resolveExpression', () => {
  const state = createTestState();

  it('should resolve input expression', () => {
    expect(resolveExpression('input.query', state)).toBe('test query');
  });

  it('should resolve step output expression', () => {
    expect(resolveExpression('steps.search.output.totalCount', state)).toBe(2);
  });

  it('should resolve step reasoning expression', () => {
    expect(resolveExpression('steps.triage.reasoning.operation', state)).toBe('update');
  });

  it('should trim whitespace from expression', () => {
    expect(resolveExpression('  input.query  ', state)).toBe('test query');
  });

  it('should throw when referencing non-existent step', () => {
    expect(() => resolveExpression('steps.missing_step.output', state)).toThrow(
      TemplateResolutionError
    );
    expect(() => resolveExpression('steps.missing_step.output', state)).toThrow(
      "hasn't executed yet"
    );
  });

  it('should return undefined for valid step but missing nested property', () => {
    expect(resolveExpression('steps.search.output.nonexistent', state)).toBeUndefined();
  });
});

// =============================================================================
// resolveTemplateString Tests
// =============================================================================

describe('resolveTemplateString', () => {
  const state = createTestState();

  it('should resolve a single template expression preserving type', () => {
    const result = resolveTemplateString('{{steps.search.output.totalCount}}', state);
    expect(result).toBe(2);
    expect(typeof result).toBe('number');
  });

  it('should resolve a single template returning an object', () => {
    const result = resolveTemplateString('{{steps.search.output}}', state);
    expect(result).toEqual({
      results: expect.any(Array),
      totalCount: 2,
    });
  });

  it('should resolve a single template returning an array', () => {
    const result = resolveTemplateString('{{steps.search.output.results}}', state);
    expect(result).toBeInstanceOf(Array);
    expect(result).toHaveLength(2);
  });

  it('should interpolate mixed template as string', () => {
    const result = resolveTemplateString(
      'Found {{steps.search.output.totalCount}} results for {{input.query}}',
      state
    );
    expect(result).toBe('Found 2 results for test query');
  });

  it('should stringify objects in mixed templates', () => {
    const result = resolveTemplateString('Records: {{steps.triage.reasoning.recordIds}}', state);
    expect(result).toBe('Records: ["1"]');
  });

  it('should handle undefined values in mixed templates as empty string', () => {
    const result = resolveTemplateString('Value: {{steps.search.output.nonexistent}}', state);
    expect(result).toBe('Value: ');
  });

  it('should handle null values in mixed templates as empty string', () => {
    const result = resolveTemplateString('Output: {{steps.triage.output}}', state);
    expect(result).toBe('Output: ');
  });

  it('should pass through strings without templates', () => {
    expect(resolveTemplateString('plain text', state)).toBe('plain text');
  });

  it('should resolve multiple templates in one string', () => {
    const result = resolveTemplateString('{{input.query}} at {{input.depth}} depth', state);
    expect(result).toBe('test query at thorough depth');
  });
});

// =============================================================================
// resolveTemplates (deep resolution) Tests
// =============================================================================

describe('resolveTemplates', () => {
  const state = createTestState();

  it('should deep-resolve templates in a flat object', () => {
    const template = {
      query: '{{input.query}}',
      count: '{{steps.search.output.totalCount}}',
    };
    const result = resolveTemplates(template, state);
    expect(result).toEqual({
      query: 'test query',
      count: 2,
    });
  });

  it('should deep-resolve templates in nested objects', () => {
    const template = {
      params: {
        query: '{{input.query}}',
        filters: {
          operation: '{{steps.triage.reasoning.operation}}',
        },
      },
    };
    const result = resolveTemplates(template, state);
    expect(result).toEqual({
      params: {
        query: 'test query',
        filters: {
          operation: 'update',
        },
      },
    });
  });

  it('should deep-resolve templates in arrays', () => {
    const template = {
      ids: ['{{steps.triage.reasoning.recordIds}}'],
    };
    const result = resolveTemplates(template, state);
    expect(result.ids).toEqual([['1']]);
  });

  it('should pass through non-string values', () => {
    const template = {
      count: 42,
      active: true,
      nothing: null,
    };
    const result = resolveTemplates(template, state);
    expect(result).toEqual({
      count: 42,
      active: true,
      nothing: null,
    });
  });

  it('should pass through strings without templates', () => {
    const template = {
      literal: 'no templates here',
      mixed: 'prefix-{{input.query}}-suffix',
    };
    const result = resolveTemplates(template, state);
    expect(result).toEqual({
      literal: 'no templates here',
      mixed: 'prefix-test query-suffix',
    });
  });
});

// =============================================================================
// extractTemplateExpressions Tests
// =============================================================================

describe('extractTemplateExpressions', () => {
  it('should extract expressions from a string', () => {
    const result = extractTemplateExpressions('{{input.query}} and {{steps.search.output}}');
    expect(result).toEqual(['input.query', 'steps.search.output']);
  });

  it('should extract expressions from nested objects', () => {
    const result = extractTemplateExpressions({
      a: '{{input.query}}',
      b: { c: '{{steps.search.output}}' },
    });
    expect(result).toEqual(['input.query', 'steps.search.output']);
  });

  it('should extract expressions from arrays', () => {
    const result = extractTemplateExpressions(['{{input.a}}', '{{input.b}}']);
    expect(result).toEqual(['input.a', 'input.b']);
  });

  it('should return empty array for no templates', () => {
    expect(extractTemplateExpressions('plain text')).toEqual([]);
  });

  it('should return empty array for non-string values', () => {
    expect(extractTemplateExpressions(42)).toEqual([]);
    expect(extractTemplateExpressions(null)).toEqual([]);
    expect(extractTemplateExpressions(undefined)).toEqual([]);
  });
});

// =============================================================================
// validateTemplateExpressions Tests
// =============================================================================

describe('validateTemplateExpressions', () => {
  const availableSteps = ['search', 'triage'];

  it('should return no errors for valid expressions', () => {
    const errors = validateTemplateExpressions(
      { query: '{{input.query}}', data: '{{steps.search.output}}' },
      availableSteps
    );
    expect(errors).toEqual([]);
  });

  it('should error when expression starts with invalid root', () => {
    const errors = validateTemplateExpressions('{{invalid.path}}', availableSteps);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("must start with 'input' or 'steps'");
  });

  it('should error when referencing unavailable step', () => {
    const errors = validateTemplateExpressions('{{steps.nonexistent.output}}', availableSteps);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("'nonexistent'");
    expect(errors[0]).toContain('not available');
  });

  it('should error when steps expression has no slug', () => {
    const errors = validateTemplateExpressions('{{steps}}', availableSteps);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('must reference a step slug');
  });

  it('should return no errors for plain text (no templates)', () => {
    expect(validateTemplateExpressions('plain text', availableSteps)).toEqual([]);
  });

  it('should catch multiple errors in one value', () => {
    const errors = validateTemplateExpressions(
      {
        a: '{{invalid.root}}',
        b: '{{steps.nonexistent.output}}',
      },
      availableSteps
    );
    expect(errors).toHaveLength(2);
  });

  it('should accept valid step references', () => {
    const errors = validateTemplateExpressions('{{steps.search.reasoning.urls}}', availableSteps);
    expect(errors).toEqual([]);
  });
});
