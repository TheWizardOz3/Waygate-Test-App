/**
 * Pipeline Schemas
 *
 * Zod schemas for pipeline validation, CRUD operations, and API responses.
 * Pipelines are multi-step orchestrated workflows that appear as single tools
 * to consuming agents.
 */

import { z } from 'zod';
import { LLMProviderSchema, ReasoningLevelSchema } from '../agentic-tools/agentic-tool.schemas';

// =============================================================================
// Enums
// =============================================================================

/**
 * Pipeline status
 */
export const PipelineStatusSchema = z.enum(['draft', 'active', 'disabled']);
export type PipelineStatusType = z.infer<typeof PipelineStatusSchema>;

/**
 * Tool type for a pipeline step
 */
export const PipelineStepToolTypeSchema = z.enum(['simple', 'composite', 'agentic']);
export type PipelineStepToolType = z.infer<typeof PipelineStepToolTypeSchema>;

/**
 * Error handling strategy for a pipeline step
 */
export const StepOnErrorSchema = z.enum(['fail_pipeline', 'continue', 'skip_remaining']);
export type StepOnErrorType = z.infer<typeof StepOnErrorSchema>;

/**
 * Pipeline execution status
 */
export const PipelineExecutionStatusSchema = z.enum([
  'running',
  'completed',
  'failed',
  'timeout',
  'cancelled',
]);
export type PipelineExecutionStatusType = z.infer<typeof PipelineExecutionStatusSchema>;

/**
 * Step execution status
 */
export const StepExecutionStatusSchema = z.enum([
  'pending',
  'running',
  'completed',
  'failed',
  'skipped',
]);
export type StepExecutionStatusType = z.infer<typeof StepExecutionStatusSchema>;

// =============================================================================
// Embedded Configuration Schemas
// =============================================================================

/**
 * Safety limits for pipeline execution
 */
export const PipelineSafetyLimitsSchema = z.object({
  maxCostUsd: z.number().min(0.01).max(100).default(5),
  maxDurationSeconds: z.number().int().min(30).max(3600).default(1800),
});
export type PipelineSafetyLimits = z.infer<typeof PipelineSafetyLimitsSchema>;

/**
 * LLM configuration for inter-step reasoning
 */
export const ReasoningConfigSchema = z.object({
  provider: LLMProviderSchema,
  model: z.string().min(1),
  reasoningLevel: ReasoningLevelSchema.optional(),
  temperature: z.number().min(0).max(1).default(0.2),
  maxTokens: z.number().int().min(100).max(8000).default(2000),
  outputSchema: z.record(z.string(), z.unknown()).optional(),
});
export type ReasoningConfig = z.infer<typeof ReasoningConfigSchema>;

/**
 * Retry configuration for steps
 */
export const RetryConfigSchema = z.object({
  maxRetries: z.number().int().min(0).max(5).default(0),
  backoffMs: z.number().int().min(100).max(30000).default(1000),
});
export type RetryConfig = z.infer<typeof RetryConfigSchema>;

/**
 * Step condition for conditional execution
 */
export const StepConditionSchema = z.object({
  type: z.literal('expression'),
  expression: z.string().min(1),
  skipWhen: z.enum(['truthy', 'falsy']),
});
export type StepCondition = z.infer<typeof StepConditionSchema>;

/**
 * Output mapping configuration
 */
export const OutputMappingSchema = z.object({
  fields: z
    .record(
      z.string(),
      z.object({
        source: z.string().min(1),
        description: z.string().optional(),
      })
    )
    .default({}),
  includeMeta: z.boolean().default(false),
});
export type OutputMapping = z.infer<typeof OutputMappingSchema>;

// =============================================================================
// Pipeline Step CRUD Schemas
// =============================================================================

/**
 * Input for creating a pipeline step
 */
export const CreatePipelineStepInputSchema = z
  .object({
    stepNumber: z.number().int().min(1).max(20),
    name: z.string().min(1).max(255),
    slug: z
      .string()
      .min(1)
      .max(100)
      .regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens'),
    toolId: z.string().uuid().nullable().optional(),
    toolType: PipelineStepToolTypeSchema.nullable().optional(),
    toolSlug: z.string().max(200).nullable().optional(),
    inputMapping: z.record(z.string(), z.unknown()).optional().default({}),
    onError: StepOnErrorSchema.optional().default('fail_pipeline'),
    retryConfig: RetryConfigSchema.optional(),
    timeoutSeconds: z.number().int().min(5).max(1800).optional().default(300),
    condition: StepConditionSchema.nullable().optional(),
    reasoningEnabled: z.boolean().optional().default(false),
    reasoningPrompt: z.string().nullable().optional(),
    reasoningConfig: ReasoningConfigSchema.nullable().optional(),
    metadata: z.record(z.string(), z.unknown()).optional().default({}),
  })
  .refine(
    (data) => {
      const hasToolId = data.toolId !== null && data.toolId !== undefined;
      const hasToolType = data.toolType !== null && data.toolType !== undefined;
      return hasToolId === hasToolType;
    },
    {
      message:
        'toolId and toolType must both be provided or both be null (for reasoning-only steps)',
    }
  );
export type CreatePipelineStepInput = z.infer<typeof CreatePipelineStepInputSchema>;

/**
 * Input for updating a pipeline step
 */
export const UpdatePipelineStepInputSchema = z.object({
  stepNumber: z.number().int().min(1).max(20).optional(),
  name: z.string().min(1).max(255).optional(),
  slug: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens')
    .optional(),
  toolId: z.string().uuid().nullable().optional(),
  toolType: PipelineStepToolTypeSchema.nullable().optional(),
  toolSlug: z.string().max(200).nullable().optional(),
  inputMapping: z.record(z.string(), z.unknown()).optional(),
  onError: StepOnErrorSchema.optional(),
  retryConfig: RetryConfigSchema.optional(),
  timeoutSeconds: z.number().int().min(5).max(1800).optional(),
  condition: StepConditionSchema.nullable().optional(),
  reasoningEnabled: z.boolean().optional(),
  reasoningPrompt: z.string().nullable().optional(),
  reasoningConfig: ReasoningConfigSchema.nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type UpdatePipelineStepInput = z.infer<typeof UpdatePipelineStepInputSchema>;

// =============================================================================
// Pipeline CRUD Schemas
// =============================================================================

/**
 * Input for creating a pipeline
 */
export const CreatePipelineInputSchema = z.object({
  name: z.string().min(1).max(255),
  slug: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens'),
  description: z.string().optional(),
  inputSchema: z.record(z.string(), z.unknown()).optional().default({}),
  outputMapping: OutputMappingSchema.optional(),
  toolDescription: z.string().optional(),
  toolSuccessTemplate: z.string().optional(),
  toolErrorTemplate: z.string().optional(),
  safetyLimits: PipelineSafetyLimitsSchema.optional(),
  reasoningConfig: ReasoningConfigSchema.optional(),
  status: PipelineStatusSchema.optional().default('draft'),
  metadata: z.record(z.string(), z.unknown()).optional().default({}),
  steps: z.array(CreatePipelineStepInputSchema).max(20).optional(),
});
export type CreatePipelineInput = z.infer<typeof CreatePipelineInputSchema>;

/**
 * Input for updating a pipeline
 */
export const UpdatePipelineInputSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  slug: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens')
    .optional(),
  description: z.string().nullable().optional(),
  inputSchema: z.record(z.string(), z.unknown()).optional(),
  outputMapping: OutputMappingSchema.optional(),
  toolDescription: z.string().nullable().optional(),
  toolSuccessTemplate: z.string().nullable().optional(),
  toolErrorTemplate: z.string().nullable().optional(),
  safetyLimits: PipelineSafetyLimitsSchema.optional(),
  reasoningConfig: ReasoningConfigSchema.optional(),
  status: PipelineStatusSchema.optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type UpdatePipelineInput = z.infer<typeof UpdatePipelineInputSchema>;

// =============================================================================
// Query Schemas
// =============================================================================

/**
 * Filters for querying pipelines
 */
export const PipelineFiltersSchema = z.object({
  status: PipelineStatusSchema.optional(),
  search: z.string().optional(),
});
export type PipelineFilters = z.infer<typeof PipelineFiltersSchema>;

/**
 * Query parameters for listing pipelines (API)
 */
export const ListPipelinesQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: PipelineStatusSchema.optional(),
  search: z.string().optional(),
});
export type ListPipelinesQuery = z.infer<typeof ListPipelinesQuerySchema>;

/**
 * Input for reordering steps
 */
export const ReorderStepsInputSchema = z.object({
  steps: z
    .array(
      z.object({
        id: z.string().uuid(),
        stepNumber: z.number().int().min(1).max(20),
      })
    )
    .min(1)
    .max(20),
});
export type ReorderStepsInput = z.infer<typeof ReorderStepsInputSchema>;

// =============================================================================
// API Response Schemas
// =============================================================================

/**
 * Pipeline step as returned by the API
 */
export const PipelineStepResponseSchema = z.object({
  id: z.string().uuid(),
  pipelineId: z.string().uuid(),
  stepNumber: z.number().int(),
  name: z.string(),
  slug: z.string(),
  toolId: z.string().uuid().nullable(),
  toolType: PipelineStepToolTypeSchema.nullable(),
  toolSlug: z.string().nullable(),
  inputMapping: z.record(z.string(), z.unknown()),
  onError: StepOnErrorSchema,
  retryConfig: z.record(z.string(), z.unknown()),
  timeoutSeconds: z.number().int(),
  condition: z.record(z.string(), z.unknown()).nullable(),
  reasoningEnabled: z.boolean(),
  reasoningPrompt: z.string().nullable(),
  reasoningConfig: z.record(z.string(), z.unknown()).nullable(),
  metadata: z.record(z.string(), z.unknown()),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type PipelineStepResponse = z.infer<typeof PipelineStepResponseSchema>;

/**
 * Pipeline as returned by the API
 */
export const PipelineResponseSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  name: z.string(),
  slug: z.string(),
  description: z.string().nullable(),
  inputSchema: z.record(z.string(), z.unknown()),
  outputMapping: z.record(z.string(), z.unknown()),
  toolDescription: z.string().nullable(),
  toolSuccessTemplate: z.string().nullable(),
  toolErrorTemplate: z.string().nullable(),
  safetyLimits: z.record(z.string(), z.unknown()),
  reasoningConfig: z.record(z.string(), z.unknown()),
  status: PipelineStatusSchema,
  metadata: z.record(z.string(), z.unknown()),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type PipelineResponse = z.infer<typeof PipelineResponseSchema>;

/**
 * Pipeline with steps (detail view)
 */
export const PipelineDetailResponseSchema = PipelineResponseSchema.extend({
  steps: z.array(PipelineStepResponseSchema),
});
export type PipelineDetailResponse = z.infer<typeof PipelineDetailResponseSchema>;

/**
 * Pipeline summary (for list views)
 */
export const PipelineSummarySchema = PipelineResponseSchema.extend({
  stepCount: z.number().int(),
});
export type PipelineSummary = z.infer<typeof PipelineSummarySchema>;

/**
 * Paginated list of pipelines
 */
export const ListPipelinesResponseSchema = z.object({
  pipelines: z.array(PipelineSummarySchema),
  pagination: z.object({
    cursor: z.string().nullable(),
    hasMore: z.boolean(),
    totalCount: z.number().int(),
  }),
});
export type ListPipelinesResponse = z.infer<typeof ListPipelinesResponseSchema>;

/**
 * Pipeline execution as returned by the API
 */
export const PipelineExecutionResponseSchema = z.object({
  id: z.string().uuid(),
  pipelineId: z.string().uuid(),
  tenantId: z.string().uuid(),
  input: z.record(z.string(), z.unknown()),
  state: z.record(z.string(), z.unknown()),
  output: z.record(z.string(), z.unknown()).nullable(),
  status: PipelineExecutionStatusSchema,
  currentStepNumber: z.number().int(),
  totalSteps: z.number().int(),
  totalCostUsd: z.number(),
  totalTokens: z.number().int(),
  error: z.record(z.string(), z.unknown()).nullable(),
  startedAt: z.string(),
  completedAt: z.string().nullable(),
  createdAt: z.string(),
});
export type PipelineExecutionResponse = z.infer<typeof PipelineExecutionResponseSchema>;

/**
 * Step execution as returned by the API
 */
export const StepExecutionResponseSchema = z.object({
  id: z.string().uuid(),
  pipelineExecutionId: z.string().uuid(),
  pipelineStepId: z.string().uuid(),
  stepNumber: z.number().int(),
  status: StepExecutionStatusSchema,
  resolvedInput: z.record(z.string(), z.unknown()).nullable(),
  toolOutput: z.record(z.string(), z.unknown()).nullable(),
  reasoningOutput: z.record(z.string(), z.unknown()).nullable(),
  error: z.record(z.string(), z.unknown()).nullable(),
  retryCount: z.number().int(),
  costUsd: z.number(),
  tokensUsed: z.number().int(),
  durationMs: z.number().int(),
  startedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
  createdAt: z.string(),
});
export type StepExecutionResponse = z.infer<typeof StepExecutionResponseSchema>;

/**
 * Pipeline execution with step executions (detail view)
 */
export const PipelineExecutionDetailResponseSchema = PipelineExecutionResponseSchema.extend({
  stepExecutions: z.array(StepExecutionResponseSchema),
});
export type PipelineExecutionDetailResponse = z.infer<typeof PipelineExecutionDetailResponseSchema>;

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Converts a database Pipeline to API response format
 */
export function toPipelineResponse(pipeline: {
  id: string;
  tenantId: string;
  name: string;
  slug: string;
  description: string | null;
  inputSchema: unknown;
  outputMapping: unknown;
  toolDescription: string | null;
  toolSuccessTemplate: string | null;
  toolErrorTemplate: string | null;
  safetyLimits: unknown;
  reasoningConfig: unknown;
  status: string;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
}): PipelineResponse {
  return {
    id: pipeline.id,
    tenantId: pipeline.tenantId,
    name: pipeline.name,
    slug: pipeline.slug,
    description: pipeline.description,
    inputSchema: (pipeline.inputSchema as Record<string, unknown>) ?? {},
    outputMapping: (pipeline.outputMapping as Record<string, unknown>) ?? {},
    toolDescription: pipeline.toolDescription,
    toolSuccessTemplate: pipeline.toolSuccessTemplate,
    toolErrorTemplate: pipeline.toolErrorTemplate,
    safetyLimits: (pipeline.safetyLimits as Record<string, unknown>) ?? {},
    reasoningConfig: (pipeline.reasoningConfig as Record<string, unknown>) ?? {},
    status: pipeline.status as PipelineStatusType,
    metadata: (pipeline.metadata as Record<string, unknown>) ?? {},
    createdAt: pipeline.createdAt.toISOString(),
    updatedAt: pipeline.updatedAt.toISOString(),
  };
}

/**
 * Converts a database PipelineStep to API response format
 */
export function toPipelineStepResponse(step: {
  id: string;
  pipelineId: string;
  stepNumber: number;
  name: string;
  slug: string;
  toolId: string | null;
  toolType: string | null;
  toolSlug: string | null;
  inputMapping: unknown;
  onError: string;
  retryConfig: unknown;
  timeoutSeconds: number;
  condition: unknown;
  reasoningEnabled: boolean;
  reasoningPrompt: string | null;
  reasoningConfig: unknown;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
}): PipelineStepResponse {
  return {
    id: step.id,
    pipelineId: step.pipelineId,
    stepNumber: step.stepNumber,
    name: step.name,
    slug: step.slug,
    toolId: step.toolId,
    toolType: (step.toolType as PipelineStepToolType) ?? null,
    toolSlug: step.toolSlug,
    inputMapping: (step.inputMapping as Record<string, unknown>) ?? {},
    onError: step.onError as StepOnErrorType,
    retryConfig: (step.retryConfig as Record<string, unknown>) ?? {},
    timeoutSeconds: step.timeoutSeconds,
    condition: (step.condition as Record<string, unknown>) ?? null,
    reasoningEnabled: step.reasoningEnabled,
    reasoningPrompt: step.reasoningPrompt,
    reasoningConfig: (step.reasoningConfig as Record<string, unknown>) ?? null,
    metadata: (step.metadata as Record<string, unknown>) ?? {},
    createdAt: step.createdAt.toISOString(),
    updatedAt: step.updatedAt.toISOString(),
  };
}

/**
 * Converts a database PipelineExecution to API response format
 */
export function toPipelineExecutionResponse(execution: {
  id: string;
  pipelineId: string;
  tenantId: string;
  input: unknown;
  state: unknown;
  output: unknown;
  status: string;
  currentStepNumber: number;
  totalSteps: number;
  totalCostUsd: unknown;
  totalTokens: number;
  error: unknown;
  startedAt: Date;
  completedAt: Date | null;
  createdAt: Date;
}): PipelineExecutionResponse {
  return {
    id: execution.id,
    pipelineId: execution.pipelineId,
    tenantId: execution.tenantId,
    input: (execution.input as Record<string, unknown>) ?? {},
    state: (execution.state as Record<string, unknown>) ?? {},
    output: (execution.output as Record<string, unknown>) ?? null,
    status: execution.status as PipelineExecutionStatusType,
    currentStepNumber: execution.currentStepNumber,
    totalSteps: execution.totalSteps,
    totalCostUsd: Number(execution.totalCostUsd ?? 0),
    totalTokens: execution.totalTokens,
    error: (execution.error as Record<string, unknown>) ?? null,
    startedAt: execution.startedAt.toISOString(),
    completedAt: execution.completedAt?.toISOString() ?? null,
    createdAt: execution.createdAt.toISOString(),
  };
}

/**
 * Converts a database StepExecution to API response format
 */
export function toStepExecutionResponse(stepExecution: {
  id: string;
  pipelineExecutionId: string;
  pipelineStepId: string;
  stepNumber: number;
  status: string;
  resolvedInput: unknown;
  toolOutput: unknown;
  reasoningOutput: unknown;
  error: unknown;
  retryCount: number;
  costUsd: unknown;
  tokensUsed: number;
  durationMs: number;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
}): StepExecutionResponse {
  return {
    id: stepExecution.id,
    pipelineExecutionId: stepExecution.pipelineExecutionId,
    pipelineStepId: stepExecution.pipelineStepId,
    stepNumber: stepExecution.stepNumber,
    status: stepExecution.status as StepExecutionStatusType,
    resolvedInput: (stepExecution.resolvedInput as Record<string, unknown>) ?? null,
    toolOutput: (stepExecution.toolOutput as Record<string, unknown>) ?? null,
    reasoningOutput: (stepExecution.reasoningOutput as Record<string, unknown>) ?? null,
    error: (stepExecution.error as Record<string, unknown>) ?? null,
    retryCount: stepExecution.retryCount,
    costUsd: Number(stepExecution.costUsd ?? 0),
    tokensUsed: stepExecution.tokensUsed,
    durationMs: stepExecution.durationMs,
    startedAt: stepExecution.startedAt?.toISOString() ?? null,
    completedAt: stepExecution.completedAt?.toISOString() ?? null,
    createdAt: stepExecution.createdAt.toISOString(),
  };
}

// =============================================================================
// Error Codes
// =============================================================================

export const PipelineErrorCodes = {
  PIPELINE_NOT_FOUND: 'PIPELINE_NOT_FOUND',
  STEP_NOT_FOUND: 'STEP_NOT_FOUND',
  EXECUTION_NOT_FOUND: 'EXECUTION_NOT_FOUND',
  DUPLICATE_SLUG: 'DUPLICATE_SLUG',
  DUPLICATE_STEP_SLUG: 'DUPLICATE_STEP_SLUG',
  INVALID_INPUT: 'INVALID_INPUT',
  INVALID_STATUS: 'INVALID_STATUS',
  PIPELINE_DISABLED: 'PIPELINE_DISABLED',
  PIPELINE_NOT_ACTIVE: 'PIPELINE_NOT_ACTIVE',
  MAX_STEPS_EXCEEDED: 'MAX_STEPS_EXCEEDED',
  EMPTY_PIPELINE: 'EMPTY_PIPELINE',
  INVALID_STEP_ORDER: 'INVALID_STEP_ORDER',
  TOOL_NOT_FOUND: 'TOOL_NOT_FOUND',
  COST_LIMIT_EXCEEDED: 'COST_LIMIT_EXCEEDED',
  DURATION_LIMIT_EXCEEDED: 'DURATION_LIMIT_EXCEEDED',
  STEP_FAILED: 'STEP_FAILED',
  STEP_TIMEOUT: 'STEP_TIMEOUT',
  TEMPLATE_RESOLUTION_ERROR: 'TEMPLATE_RESOLUTION_ERROR',
  EXECUTION_CANCELLED: 'EXECUTION_CANCELLED',
} as const;
