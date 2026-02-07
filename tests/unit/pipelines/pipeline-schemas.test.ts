/**
 * Pipeline Schemas Unit Tests
 *
 * Tests for Zod validation schemas, response formatters, and error codes.
 */

import { describe, it, expect } from 'vitest';
import {
  CreatePipelineInputSchema,
  CreatePipelineStepInputSchema,
  ReorderStepsInputSchema,
  ListPipelinesQuerySchema,
  PipelineSafetyLimitsSchema,
  RetryConfigSchema,
  StepConditionSchema,
  OutputMappingSchema,
  PipelineStatusSchema,
  PipelineStepToolTypeSchema,
  StepOnErrorSchema,
  toPipelineResponse,
  toPipelineStepResponse,
  toPipelineExecutionResponse,
  toStepExecutionResponse,
  PipelineErrorCodes,
} from '@/lib/modules/pipelines/pipeline.schemas';

// Valid v4 UUIDs for testing (Zod v4 validates UUID version digit)
const UUID_1 = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
const UUID_2 = 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e';
const UUID_3 = 'c3d4e5f6-a7b8-4c9d-0e1f-2a3b4c5d6e7f';

// =============================================================================
// Enum Schema Tests
// =============================================================================

describe('Pipeline Enum Schemas', () => {
  it('PipelineStatusSchema should accept valid values', () => {
    expect(PipelineStatusSchema.parse('draft')).toBe('draft');
    expect(PipelineStatusSchema.parse('active')).toBe('active');
    expect(PipelineStatusSchema.parse('disabled')).toBe('disabled');
  });

  it('PipelineStatusSchema should reject invalid values', () => {
    expect(() => PipelineStatusSchema.parse('invalid')).toThrow();
  });

  it('PipelineStepToolTypeSchema should accept valid values', () => {
    expect(PipelineStepToolTypeSchema.parse('simple')).toBe('simple');
    expect(PipelineStepToolTypeSchema.parse('composite')).toBe('composite');
    expect(PipelineStepToolTypeSchema.parse('agentic')).toBe('agentic');
  });

  it('StepOnErrorSchema should accept valid values', () => {
    expect(StepOnErrorSchema.parse('fail_pipeline')).toBe('fail_pipeline');
    expect(StepOnErrorSchema.parse('continue')).toBe('continue');
    expect(StepOnErrorSchema.parse('skip_remaining')).toBe('skip_remaining');
  });
});

// =============================================================================
// Configuration Schema Tests
// =============================================================================

describe('PipelineSafetyLimitsSchema', () => {
  it('should accept valid limits', () => {
    const result = PipelineSafetyLimitsSchema.parse({ maxCostUsd: 1, maxDurationSeconds: 300 });
    expect(result.maxCostUsd).toBe(1);
    expect(result.maxDurationSeconds).toBe(300);
  });

  it('should apply defaults', () => {
    const result = PipelineSafetyLimitsSchema.parse({});
    expect(result.maxCostUsd).toBe(5);
    expect(result.maxDurationSeconds).toBe(1800);
  });

  it('should reject cost below minimum', () => {
    expect(() => PipelineSafetyLimitsSchema.parse({ maxCostUsd: 0.001 })).toThrow();
  });

  it('should reject cost above maximum', () => {
    expect(() => PipelineSafetyLimitsSchema.parse({ maxCostUsd: 200 })).toThrow();
  });

  it('should reject duration below minimum', () => {
    expect(() => PipelineSafetyLimitsSchema.parse({ maxDurationSeconds: 10 })).toThrow();
  });

  it('should reject duration above maximum', () => {
    expect(() => PipelineSafetyLimitsSchema.parse({ maxDurationSeconds: 5000 })).toThrow();
  });
});

describe('RetryConfigSchema', () => {
  it('should accept valid retry config', () => {
    const result = RetryConfigSchema.parse({ maxRetries: 3, backoffMs: 2000 });
    expect(result.maxRetries).toBe(3);
    expect(result.backoffMs).toBe(2000);
  });

  it('should apply defaults', () => {
    const result = RetryConfigSchema.parse({});
    expect(result.maxRetries).toBe(0);
    expect(result.backoffMs).toBe(1000);
  });

  it('should reject retries above max', () => {
    expect(() => RetryConfigSchema.parse({ maxRetries: 10 })).toThrow();
  });
});

describe('StepConditionSchema', () => {
  it('should accept valid condition', () => {
    const result = StepConditionSchema.parse({
      type: 'expression',
      expression: '{{steps.search.output.results.length}}',
      skipWhen: 'falsy',
    });
    expect(result.type).toBe('expression');
    expect(result.skipWhen).toBe('falsy');
  });

  it('should reject empty expression', () => {
    expect(() =>
      StepConditionSchema.parse({
        type: 'expression',
        expression: '',
        skipWhen: 'falsy',
      })
    ).toThrow();
  });

  it('should reject invalid skipWhen value', () => {
    expect(() =>
      StepConditionSchema.parse({
        type: 'expression',
        expression: '{{test}}',
        skipWhen: 'always',
      })
    ).toThrow();
  });
});

describe('OutputMappingSchema', () => {
  it('should accept valid output mapping', () => {
    const result = OutputMappingSchema.parse({
      fields: {
        contacts: { source: '{{steps.create.output.created}}' },
        count: { source: '{{steps.search.output.totalCount}}', description: 'Total found' },
      },
      includeMeta: true,
    });
    expect(result.fields.contacts.source).toBe('{{steps.create.output.created}}');
    expect(result.includeMeta).toBe(true);
  });

  it('should apply defaults', () => {
    const result = OutputMappingSchema.parse({});
    expect(result.fields).toEqual({});
    expect(result.includeMeta).toBe(false);
  });
});

// =============================================================================
// CreatePipelineInputSchema Tests
// =============================================================================

describe('CreatePipelineInputSchema', () => {
  it('should accept valid pipeline input', () => {
    const result = CreatePipelineInputSchema.parse({
      name: 'CRM Tool',
      slug: 'crm-tool',
      description: 'A CRM tool',
    });
    expect(result.name).toBe('CRM Tool');
    expect(result.slug).toBe('crm-tool');
    expect(result.status).toBe('draft'); // default
  });

  it('should reject empty name', () => {
    expect(() =>
      CreatePipelineInputSchema.parse({
        name: '',
        slug: 'test',
      })
    ).toThrow();
  });

  it('should reject invalid slug format', () => {
    expect(() =>
      CreatePipelineInputSchema.parse({
        name: 'Test',
        slug: 'Invalid Slug!',
      })
    ).toThrow();
  });

  it('should accept pipeline with inline steps', () => {
    const result = CreatePipelineInputSchema.parse({
      name: 'Test Pipeline',
      slug: 'test-pipeline',
      steps: [
        {
          stepNumber: 1,
          name: 'Search',
          slug: 'search',
          toolId: UUID_1,
          toolType: 'simple',
          toolSlug: 'hubspot/search',
        },
      ],
    });
    expect(result.steps).toHaveLength(1);
    expect(result.steps![0].name).toBe('Search');
  });

  it('should accept pipeline with reasoning-only step (no toolId/toolType)', () => {
    const result = CreatePipelineInputSchema.parse({
      name: 'Test',
      slug: 'test',
      steps: [
        {
          stepNumber: 1,
          name: 'Reasoning Step',
          slug: 'reasoning',
          toolId: null,
          toolType: null,
          reasoningEnabled: true,
          reasoningPrompt: 'Analyze the data',
        },
      ],
    });
    expect(result.steps![0].toolId).toBeNull();
    expect(result.steps![0].toolType).toBeNull();
  });

  it('should reject step with toolId but no toolType', () => {
    expect(() =>
      CreatePipelineInputSchema.parse({
        name: 'Test',
        slug: 'test',
        steps: [
          {
            stepNumber: 1,
            name: 'Bad Step',
            slug: 'bad',
            toolId: UUID_1,
            toolType: null,
          },
        ],
      })
    ).toThrow();
  });

  it('should reject more than 20 steps', () => {
    const steps = Array.from({ length: 21 }, (_, i) => ({
      stepNumber: i + 1,
      name: `Step ${i + 1}`,
      slug: `step-${i + 1}`,
    }));
    expect(() =>
      CreatePipelineInputSchema.parse({
        name: 'Test',
        slug: 'test',
        steps,
      })
    ).toThrow();
  });
});

// =============================================================================
// CreatePipelineStepInputSchema Tests
// =============================================================================

describe('CreatePipelineStepInputSchema', () => {
  it('should accept valid step', () => {
    const result = CreatePipelineStepInputSchema.parse({
      stepNumber: 1,
      name: 'Search Records',
      slug: 'search-records',
      toolId: UUID_1,
      toolType: 'simple',
      toolSlug: 'hubspot/search',
      inputMapping: { query: '{{input.task}}' },
    });
    expect(result.name).toBe('Search Records');
    expect(result.onError).toBe('fail_pipeline'); // default
    expect(result.timeoutSeconds).toBe(300); // default
  });

  it('should reject step number below 1', () => {
    expect(() =>
      CreatePipelineStepInputSchema.parse({
        stepNumber: 0,
        name: 'Test',
        slug: 'test',
      })
    ).toThrow();
  });

  it('should reject step number above 20', () => {
    expect(() =>
      CreatePipelineStepInputSchema.parse({
        stepNumber: 21,
        name: 'Test',
        slug: 'test',
      })
    ).toThrow();
  });

  it('should reject invalid step slug', () => {
    expect(() =>
      CreatePipelineStepInputSchema.parse({
        stepNumber: 1,
        name: 'Test',
        slug: 'Invalid_Slug',
      })
    ).toThrow();
  });
});

// =============================================================================
// ListPipelinesQuerySchema Tests
// =============================================================================

describe('ListPipelinesQuerySchema', () => {
  it('should accept valid query', () => {
    const result = ListPipelinesQuerySchema.parse({
      limit: 10,
      status: 'active',
      search: 'crm',
    });
    expect(result.limit).toBe(10);
    expect(result.status).toBe('active');
  });

  it('should apply default limit', () => {
    const result = ListPipelinesQuerySchema.parse({});
    expect(result.limit).toBe(20);
  });

  it('should coerce string limit to number', () => {
    const result = ListPipelinesQuerySchema.parse({ limit: '50' });
    expect(result.limit).toBe(50);
  });

  it('should reject limit above max', () => {
    expect(() => ListPipelinesQuerySchema.parse({ limit: 200 })).toThrow();
  });
});

// =============================================================================
// ReorderStepsInputSchema Tests
// =============================================================================

describe('ReorderStepsInputSchema', () => {
  it('should accept valid reorder input', () => {
    const result = ReorderStepsInputSchema.parse({
      steps: [
        { id: UUID_1, stepNumber: 1 },
        { id: UUID_2, stepNumber: 2 },
      ],
    });
    expect(result.steps).toHaveLength(2);
  });

  it('should reject empty steps array', () => {
    expect(() => ReorderStepsInputSchema.parse({ steps: [] })).toThrow();
  });

  it('should reject invalid UUID', () => {
    expect(() =>
      ReorderStepsInputSchema.parse({
        steps: [{ id: 'not-a-uuid', stepNumber: 1 }],
      })
    ).toThrow();
  });
});

// =============================================================================
// Response Helper Tests
// =============================================================================

describe('toPipelineResponse', () => {
  it('should convert database pipeline to API response', () => {
    const dbPipeline = {
      id: UUID_1,
      tenantId: UUID_2,
      name: 'CRM Tool',
      slug: 'crm-tool',
      description: 'A CRM tool',
      inputSchema: { task: { type: 'string' } },
      outputMapping: { fields: {} },
      toolDescription: 'Use this tool...',
      toolSuccessTemplate: null,
      toolErrorTemplate: null,
      safetyLimits: { maxCostUsd: 5 },
      reasoningConfig: { provider: 'google' },
      status: 'active',
      metadata: {},
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-02'),
    };

    const result = toPipelineResponse(dbPipeline);

    expect(result.id).toBe(dbPipeline.id);
    expect(result.name).toBe('CRM Tool');
    expect(result.status).toBe('active');
    expect(result.createdAt).toBe('2024-01-01T00:00:00.000Z');
    expect(result.updatedAt).toBe('2024-01-02T00:00:00.000Z');
  });

  it('should handle null description', () => {
    const dbPipeline = {
      id: UUID_1,
      tenantId: UUID_2,
      name: 'Test',
      slug: 'test',
      description: null,
      inputSchema: {},
      outputMapping: {},
      toolDescription: null,
      toolSuccessTemplate: null,
      toolErrorTemplate: null,
      safetyLimits: null,
      reasoningConfig: null,
      status: 'draft',
      metadata: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = toPipelineResponse(dbPipeline);

    expect(result.description).toBeNull();
    expect(result.safetyLimits).toEqual({});
    expect(result.reasoningConfig).toEqual({});
    expect(result.metadata).toEqual({});
  });
});

describe('toPipelineStepResponse', () => {
  it('should convert database step to API response', () => {
    const dbStep = {
      id: UUID_1,
      pipelineId: UUID_2,
      stepNumber: 1,
      name: 'Search',
      slug: 'search',
      toolId: UUID_3,
      toolType: 'simple',
      toolSlug: 'hubspot/search',
      inputMapping: { query: '{{input.task}}' },
      onError: 'fail_pipeline',
      retryConfig: { maxRetries: 2 },
      timeoutSeconds: 300,
      condition: null,
      reasoningEnabled: true,
      reasoningPrompt: 'Analyze results',
      reasoningConfig: null,
      metadata: {},
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-02'),
    };

    const result = toPipelineStepResponse(dbStep);

    expect(result.stepNumber).toBe(1);
    expect(result.name).toBe('Search');
    expect(result.toolType).toBe('simple');
    expect(result.reasoningEnabled).toBe(true);
    expect(result.createdAt).toBe('2024-01-01T00:00:00.000Z');
  });
});

describe('toPipelineExecutionResponse', () => {
  it('should convert database execution to API response', () => {
    const dbExec = {
      id: UUID_1,
      pipelineId: UUID_2,
      tenantId: UUID_3,
      input: { task: 'test' },
      state: { input: {}, steps: {} },
      output: null,
      status: 'running',
      currentStepNumber: 2,
      totalSteps: 3,
      totalCostUsd: 0.04,
      totalTokens: 500,
      error: null,
      startedAt: new Date('2024-01-01T10:00:00Z'),
      completedAt: null,
      createdAt: new Date('2024-01-01T10:00:00Z'),
    };

    const result = toPipelineExecutionResponse(dbExec);

    expect(result.status).toBe('running');
    expect(result.currentStepNumber).toBe(2);
    expect(result.totalCostUsd).toBe(0.04);
    expect(result.completedAt).toBeNull();
  });

  it('should handle Decimal totalCostUsd from Prisma', () => {
    const dbExec = {
      id: UUID_1,
      pipelineId: UUID_2,
      tenantId: UUID_3,
      input: {},
      state: {},
      output: null,
      status: 'completed',
      currentStepNumber: 3,
      totalSteps: 3,
      totalCostUsd: { toNumber: () => 0.15 } as unknown,
      totalTokens: 1200,
      error: null,
      startedAt: new Date(),
      completedAt: new Date(),
      createdAt: new Date(),
    };

    const result = toPipelineExecutionResponse(dbExec);
    expect(typeof result.totalCostUsd).toBe('number');
  });
});

describe('toStepExecutionResponse', () => {
  it('should convert database step execution to API response', () => {
    const dbStepExec = {
      id: UUID_1,
      pipelineExecutionId: UUID_2,
      pipelineStepId: UUID_3,
      stepNumber: 1,
      status: 'completed',
      resolvedInput: { query: 'search acme' },
      toolOutput: { results: [] },
      reasoningOutput: { plan: 'update' },
      error: null,
      retryCount: 0,
      costUsd: 0.02,
      tokensUsed: 300,
      durationMs: 1500,
      startedAt: new Date('2024-01-01T10:00:00Z'),
      completedAt: new Date('2024-01-01T10:00:01.5Z'),
      createdAt: new Date('2024-01-01T10:00:00Z'),
    };

    const result = toStepExecutionResponse(dbStepExec);

    expect(result.status).toBe('completed');
    expect(result.retryCount).toBe(0);
    expect(result.durationMs).toBe(1500);
    expect(result.startedAt).toBe('2024-01-01T10:00:00.000Z');
  });
});

// =============================================================================
// Error Codes Tests
// =============================================================================

describe('PipelineErrorCodes', () => {
  it('should have all expected error codes', () => {
    expect(PipelineErrorCodes.PIPELINE_NOT_FOUND).toBe('PIPELINE_NOT_FOUND');
    expect(PipelineErrorCodes.STEP_NOT_FOUND).toBe('STEP_NOT_FOUND');
    expect(PipelineErrorCodes.EXECUTION_NOT_FOUND).toBe('EXECUTION_NOT_FOUND');
    expect(PipelineErrorCodes.DUPLICATE_SLUG).toBe('DUPLICATE_SLUG');
    expect(PipelineErrorCodes.COST_LIMIT_EXCEEDED).toBe('COST_LIMIT_EXCEEDED');
    expect(PipelineErrorCodes.DURATION_LIMIT_EXCEEDED).toBe('DURATION_LIMIT_EXCEEDED');
    expect(PipelineErrorCodes.TEMPLATE_RESOLUTION_ERROR).toBe('TEMPLATE_RESOLUTION_ERROR');
    expect(PipelineErrorCodes.EMPTY_PIPELINE).toBe('EMPTY_PIPELINE');
    expect(PipelineErrorCodes.MAX_STEPS_EXCEEDED).toBe('MAX_STEPS_EXCEEDED');
  });
});
