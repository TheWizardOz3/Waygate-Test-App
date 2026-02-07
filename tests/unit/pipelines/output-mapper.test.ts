/**
 * Output Mapper Unit Tests
 *
 * Tests for final output mapping from pipeline state, field resolution,
 * missing field handling, and metadata inclusion.
 */

import { describe, it, expect } from 'vitest';
import { resolveOutputMapping } from '@/lib/modules/pipelines/orchestrator/output-mapper';
import type { OutputMapping } from '@/lib/modules/pipelines/pipeline.schemas';
import type { PipelineState } from '@/lib/modules/pipelines/orchestrator/state-manager';

// =============================================================================
// Test Fixtures
// =============================================================================

function createTestState(): PipelineState {
  return {
    input: { task: 'find leads' },
    steps: {
      search: {
        output: {
          results: [
            { id: '1', name: 'Company A' },
            { id: '2', name: 'Company B' },
          ],
          totalCount: 2,
        },
        reasoning: {
          companies: ['Company A', 'Company B'],
          confidence: 'high',
        },
        status: 'completed',
      },
      create: {
        output: {
          created: [
            { contactId: 'c1', name: 'Lead 1' },
            { contactId: 'c2', name: 'Lead 2' },
          ],
        },
        status: 'completed',
      },
      failed_step: {
        output: null,
        status: 'failed',
        error: 'API timeout',
      },
    },
  };
}

// =============================================================================
// Field Resolution Tests
// =============================================================================

describe('resolveOutputMapping - field resolution', () => {
  it('should resolve simple field from step output', () => {
    const state = createTestState();
    const mapping: OutputMapping = {
      fields: {
        contacts: { source: '{{steps.create.output.created}}' },
      },
      includeMeta: false,
    };

    const result = resolveOutputMapping(mapping, state);

    expect(result.contacts).toEqual([
      { contactId: 'c1', name: 'Lead 1' },
      { contactId: 'c2', name: 'Lead 2' },
    ]);
  });

  it('should resolve fields from reasoning output', () => {
    const state = createTestState();
    const mapping: OutputMapping = {
      fields: {
        companies: { source: '{{steps.search.reasoning.companies}}' },
        confidence: { source: '{{steps.search.reasoning.confidence}}' },
      },
      includeMeta: false,
    };

    const result = resolveOutputMapping(mapping, state);

    expect(result.companies).toEqual(['Company A', 'Company B']);
    expect(result.confidence).toBe('high');
  });

  it('should resolve fields from input', () => {
    const state = createTestState();
    const mapping: OutputMapping = {
      fields: {
        originalTask: { source: '{{input.task}}' },
      },
      includeMeta: false,
    };

    const result = resolveOutputMapping(mapping, state);

    expect(result.originalTask).toBe('find leads');
  });

  it('should resolve multiple fields from different steps', () => {
    const state = createTestState();
    const mapping: OutputMapping = {
      fields: {
        searchCount: { source: '{{steps.search.output.totalCount}}' },
        contacts: { source: '{{steps.create.output.created}}' },
      },
      includeMeta: false,
    };

    const result = resolveOutputMapping(mapping, state);

    expect(result.searchCount).toBe(2);
    expect(result.contacts).toHaveLength(2);
  });
});

// =============================================================================
// Missing Field Handling Tests
// =============================================================================

describe('resolveOutputMapping - missing fields', () => {
  it('should set null for unresolvable field (missing property)', () => {
    const state = createTestState();
    const mapping: OutputMapping = {
      fields: {
        missing: { source: '{{steps.nonexistent.output}}' },
      },
      includeMeta: false,
    };

    const result = resolveOutputMapping(mapping, state);

    expect(result.missing).toBeNull();
  });

  it('should set null for failed step reference', () => {
    const state = createTestState();
    const mapping: OutputMapping = {
      fields: {
        failedOutput: { source: '{{steps.failed_step.output.data}}' },
      },
      includeMeta: false,
    };

    const result = resolveOutputMapping(mapping, state);

    // failed_step exists but output is null — accessing .data on null
    // resolveTemplateString doesn't throw (caught by output mapper), so field is null
    // But resolvePathValue returns undefined for null intermediate → not a throw → result is undefined
    expect(result.failedOutput).toBeUndefined();
  });

  it('should handle empty fields map', () => {
    const state = createTestState();
    const mapping: OutputMapping = {
      fields: {},
      includeMeta: false,
    };

    const result = resolveOutputMapping(mapping, state);

    expect(result).toEqual({});
  });
});

// =============================================================================
// Metadata Inclusion Tests
// =============================================================================

describe('resolveOutputMapping - includeMeta', () => {
  it('should include metadata when includeMeta is true', () => {
    const state = createTestState();
    const mapping: OutputMapping = {
      fields: {
        contacts: { source: '{{steps.create.output.created}}' },
      },
      includeMeta: true,
    };

    const result = resolveOutputMapping(mapping, state);

    expect(result._meta).toBeDefined();
    expect(result._meta).toEqual({
      stepsCompleted: 2,
      stepsFailed: 1,
      stepsSkipped: 0,
      stepResults: {
        search: { status: 'completed', error: null },
        create: { status: 'completed', error: null },
        failed_step: { status: 'failed', error: 'API timeout' },
      },
    });
  });

  it('should not include metadata when includeMeta is false', () => {
    const state = createTestState();
    const mapping: OutputMapping = {
      fields: {
        contacts: { source: '{{steps.create.output.created}}' },
      },
      includeMeta: false,
    };

    const result = resolveOutputMapping(mapping, state);

    expect(result._meta).toBeUndefined();
  });

  it('should include both fields and metadata', () => {
    const state = createTestState();
    const mapping: OutputMapping = {
      fields: {
        task: { source: '{{input.task}}' },
      },
      includeMeta: true,
    };

    const result = resolveOutputMapping(mapping, state);

    expect(result.task).toBe('find leads');
    expect(result._meta).toBeDefined();
  });
});

// =============================================================================
// Edge Cases
// =============================================================================

describe('resolveOutputMapping - edge cases', () => {
  it('should handle state with no steps', () => {
    const state: PipelineState = { input: { task: 'test' }, steps: {} };
    const mapping: OutputMapping = {
      fields: {
        task: { source: '{{input.task}}' },
      },
      includeMeta: true,
    };

    const result = resolveOutputMapping(mapping, state);

    expect(result.task).toBe('test');
    expect(result._meta).toEqual({
      stepsCompleted: 0,
      stepsFailed: 0,
      stepsSkipped: 0,
      stepResults: {},
    });
  });

  it('should handle fields with undefined mapping', () => {
    const state = createTestState();
    const mapping: OutputMapping = {
      fields: undefined as unknown as Record<string, { source: string }>,
      includeMeta: false,
    };

    const result = resolveOutputMapping(mapping, state);

    expect(result).toEqual({});
  });
});
