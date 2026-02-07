/**
 * Pipeline Service
 *
 * Business logic layer for pipeline management.
 * Handles CRUD operations with tenant verification and validation.
 *
 * All operations verify tenant ownership before accessing/modifying data.
 */

import {
  PipelineStatus,
  PipelineExecutionStatus,
  PipelineStepToolType,
  StepOnError,
  Prisma,
} from '@prisma/client';
import {
  createPipeline as repoCreatePipeline,
  findPipelineByIdAndTenant,
  findPipelineWithSteps,
  findPipelineBySlug,
  findPipelineBySlugWithSteps,
  findPipelinesPaginated,
  findAllPipelinesForTenant,
  isPipelineSlugTaken,
  updatePipeline as repoUpdatePipeline,
  updatePipelineStatus,
  deletePipeline as repoDeletePipeline,
  createPipelineStep as repoCreatePipelineStep,
  createPipelineStepsBatch,
  findPipelineStepById,
  findStepsByPipeline,
  isStepSlugTaken,
  countSteps,
  updatePipelineStep as repoUpdatePipelineStep,
  deletePipelineStep as repoDeletePipelineStep,
  reorderPipelineSteps as repoReorderPipelineSteps,
  renumberStepsAfterDeletion,
  getPipelineCountsByStatus,
  findExecutionsByTenant,
  findExecutionsByPipeline,
  findPipelineExecutionById,
  findPipelineExecutionWithSteps,
  updatePipelineExecution as repoUpdatePipelineExecution,
  getPipelineExecutionStats,
  type CreatePipelineDbInput,
  type UpdatePipelineDbInput,
  type CreatePipelineStepDbInput,
  type UpdatePipelineStepDbInput,
  type PipelinePaginationOptions,
} from './pipeline.repository';
import {
  CreatePipelineInputSchema,
  UpdatePipelineInputSchema,
  CreatePipelineStepInputSchema,
  UpdatePipelineStepInputSchema,
  ListPipelinesQuerySchema,
  ReorderStepsInputSchema,
  toPipelineResponse,
  toPipelineStepResponse,
  toPipelineExecutionResponse,
  toStepExecutionResponse,
  PipelineErrorCodes,
  type CreatePipelineInput,
  type UpdatePipelineInput,
  type CreatePipelineStepInput,
  type UpdatePipelineStepInput,
  type ListPipelinesQuery,
  type ReorderStepsInput,
  type PipelineFilters,
  type PipelineResponse,
  type PipelineDetailResponse,
  type PipelineStepResponse,
  type ListPipelinesResponse,
  type PipelineSummary,
  type PipelineExecutionResponse,
  type PipelineExecutionDetailResponse,
} from './pipeline.schemas';

import type { Pipeline } from '@prisma/client';

// =============================================================================
// Constants
// =============================================================================

const MAX_STEPS_PER_PIPELINE = 20;

// =============================================================================
// Error Class
// =============================================================================

/**
 * Error thrown when pipeline operations fail
 */
export class PipelineError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number = 400
  ) {
    super(message);
    this.name = 'PipelineError';
  }
}

// =============================================================================
// Pipeline - Create Operations
// =============================================================================

/**
 * Creates a new pipeline with optional inline steps
 */
export async function createPipeline(
  tenantId: string,
  input: CreatePipelineInput
): Promise<PipelineDetailResponse> {
  // Validate input
  const parsed = CreatePipelineInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new PipelineError(
      PipelineErrorCodes.INVALID_INPUT,
      `Invalid pipeline data: ${parsed.error.message}`
    );
  }

  const data = parsed.data;

  // Check for slug collision
  const slugExists = await isPipelineSlugTaken(tenantId, data.slug);
  if (slugExists) {
    throw new PipelineError(
      PipelineErrorCodes.DUPLICATE_SLUG,
      `A pipeline with slug '${data.slug}' already exists`
    );
  }

  // Validate inline steps if provided
  if (data.steps && data.steps.length > 0) {
    // Check for duplicate step slugs
    const stepSlugs = data.steps.map((s) => s.slug);
    const uniqueSlugs = new Set(stepSlugs);
    if (uniqueSlugs.size !== stepSlugs.length) {
      throw new PipelineError(
        PipelineErrorCodes.DUPLICATE_STEP_SLUG,
        'Step slugs must be unique within a pipeline'
      );
    }

    // Validate step numbers are sequential from 1
    const sortedStepNumbers = data.steps.map((s) => s.stepNumber).sort((a, b) => a - b);
    for (let i = 0; i < sortedStepNumbers.length; i++) {
      if (sortedStepNumbers[i] !== i + 1) {
        throw new PipelineError(
          PipelineErrorCodes.INVALID_STEP_ORDER,
          'Step numbers must be sequential starting from 1 with no gaps'
        );
      }
    }

    // Check max steps
    if (data.steps.length > MAX_STEPS_PER_PIPELINE) {
      throw new PipelineError(
        PipelineErrorCodes.MAX_STEPS_EXCEEDED,
        `Pipeline cannot have more than ${MAX_STEPS_PER_PIPELINE} steps`
      );
    }
  }

  // Create the pipeline
  const dbInput: CreatePipelineDbInput = {
    tenantId,
    name: data.name,
    slug: data.slug,
    description: data.description,
    inputSchema: data.inputSchema as Prisma.InputJsonValue,
    outputMapping: data.outputMapping as Prisma.InputJsonValue | undefined,
    toolDescription: data.toolDescription,
    toolSuccessTemplate: data.toolSuccessTemplate,
    toolErrorTemplate: data.toolErrorTemplate,
    safetyLimits: data.safetyLimits as Prisma.InputJsonValue | undefined,
    reasoningConfig: data.reasoningConfig as Prisma.InputJsonValue | undefined,
    status: data.status as PipelineStatus,
    metadata: data.metadata as Prisma.InputJsonValue,
  };

  const pipeline = await repoCreatePipeline(dbInput);

  // Create inline steps if provided
  let steps: PipelineStepResponse[] = [];
  if (data.steps && data.steps.length > 0) {
    const stepInputs: CreatePipelineStepDbInput[] = data.steps.map((step) => ({
      pipelineId: pipeline.id,
      stepNumber: step.stepNumber,
      name: step.name,
      slug: step.slug,
      toolId: step.toolId ?? null,
      toolType: (step.toolType as PipelineStepToolType) ?? null,
      toolSlug: step.toolSlug ?? null,
      inputMapping: step.inputMapping as Prisma.InputJsonValue,
      onError: (step.onError as StepOnError) ?? StepOnError.fail_pipeline,
      retryConfig: step.retryConfig as Prisma.InputJsonValue | undefined,
      timeoutSeconds: step.timeoutSeconds,
      condition: step.condition as Prisma.InputJsonValue | null | undefined,
      reasoningEnabled: step.reasoningEnabled,
      reasoningPrompt: step.reasoningPrompt ?? null,
      reasoningConfig: step.reasoningConfig as Prisma.InputJsonValue | null | undefined,
      metadata: step.metadata as Prisma.InputJsonValue,
    }));

    const createdSteps = await createPipelineStepsBatch(stepInputs);
    steps = createdSteps.sort((a, b) => a.stepNumber - b.stepNumber).map(toPipelineStepResponse);
  }

  return {
    ...toPipelineResponse(pipeline),
    steps,
  };
}

// =============================================================================
// Pipeline - Read Operations
// =============================================================================

/**
 * Gets a pipeline by ID
 */
export async function getPipelineById(
  tenantId: string,
  pipelineId: string
): Promise<PipelineResponse> {
  const pipeline = await findPipelineByIdAndTenant(pipelineId, tenantId);
  if (!pipeline) {
    throw new PipelineError(
      PipelineErrorCodes.PIPELINE_NOT_FOUND,
      `Pipeline '${pipelineId}' not found`,
      404
    );
  }
  return toPipelineResponse(pipeline);
}

/**
 * Gets a pipeline by ID with steps
 */
export async function getPipelineDetail(
  tenantId: string,
  pipelineId: string
): Promise<PipelineDetailResponse> {
  const pipeline = await findPipelineWithSteps(pipelineId, tenantId);
  if (!pipeline) {
    throw new PipelineError(
      PipelineErrorCodes.PIPELINE_NOT_FOUND,
      `Pipeline '${pipelineId}' not found`,
      404
    );
  }
  return {
    ...toPipelineResponse(pipeline),
    steps: pipeline.steps.map(toPipelineStepResponse),
  };
}

/**
 * Gets a pipeline by slug
 */
export async function getPipelineBySlug(tenantId: string, slug: string): Promise<PipelineResponse> {
  const pipeline = await findPipelineBySlug(tenantId, slug);
  if (!pipeline) {
    throw new PipelineError(
      PipelineErrorCodes.PIPELINE_NOT_FOUND,
      `Pipeline with slug '${slug}' not found`,
      404
    );
  }
  return toPipelineResponse(pipeline);
}

/**
 * Gets a pipeline by slug with steps
 */
export async function getPipelineBySlugDetail(
  tenantId: string,
  slug: string
): Promise<PipelineDetailResponse> {
  const pipeline = await findPipelineBySlugWithSteps(tenantId, slug);
  if (!pipeline) {
    throw new PipelineError(
      PipelineErrorCodes.PIPELINE_NOT_FOUND,
      `Pipeline with slug '${slug}' not found`,
      404
    );
  }
  return {
    ...toPipelineResponse(pipeline),
    steps: pipeline.steps.map(toPipelineStepResponse),
  };
}

/**
 * Lists pipelines with pagination and filters
 */
export async function listPipelines(
  tenantId: string,
  query: Partial<ListPipelinesQuery> = {}
): Promise<ListPipelinesResponse> {
  const parsed = ListPipelinesQuerySchema.safeParse(query);
  if (!parsed.success) {
    throw new PipelineError(
      PipelineErrorCodes.INVALID_INPUT,
      `Invalid query parameters: ${parsed.error.message}`
    );
  }

  const { cursor, limit, status, search } = parsed.data;

  const pagination: PipelinePaginationOptions = { cursor, limit };
  const filters: PipelineFilters = { status, search };

  const result = await findPipelinesPaginated(tenantId, pagination, filters);

  const pipelines: PipelineSummary[] = result.pipelines.map((p) => ({
    ...toPipelineResponse(p),
    stepCount: p._count.steps,
  }));

  return {
    pipelines,
    pagination: {
      cursor: result.nextCursor,
      hasMore: result.nextCursor !== null,
      totalCount: result.totalCount,
    },
  };
}

/**
 * Gets all pipelines for a tenant (no pagination, for exports)
 */
export async function getAllPipelines(tenantId: string): Promise<PipelineResponse[]> {
  const pipelines = await findAllPipelinesForTenant(tenantId);
  return pipelines.map(toPipelineResponse);
}

// =============================================================================
// Pipeline - Update Operations
// =============================================================================

/**
 * Updates a pipeline
 */
export async function updatePipeline(
  tenantId: string,
  pipelineId: string,
  input: UpdatePipelineInput
): Promise<PipelineResponse> {
  const parsed = UpdatePipelineInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new PipelineError(
      PipelineErrorCodes.INVALID_INPUT,
      `Invalid update data: ${parsed.error.message}`
    );
  }

  const data = parsed.data;

  // Verify pipeline exists and belongs to tenant
  const existing = await findPipelineByIdAndTenant(pipelineId, tenantId);
  if (!existing) {
    throw new PipelineError(
      PipelineErrorCodes.PIPELINE_NOT_FOUND,
      `Pipeline '${pipelineId}' not found`,
      404
    );
  }

  // Check for slug collision if slug is being changed
  if (data.slug && data.slug !== existing.slug) {
    const slugExists = await isPipelineSlugTaken(tenantId, data.slug, pipelineId);
    if (slugExists) {
      throw new PipelineError(
        PipelineErrorCodes.DUPLICATE_SLUG,
        `A pipeline with slug '${data.slug}' already exists`
      );
    }
  }

  const dbInput: UpdatePipelineDbInput = {};
  if (data.name !== undefined) dbInput.name = data.name;
  if (data.slug !== undefined) dbInput.slug = data.slug;
  if (data.description !== undefined) dbInput.description = data.description;
  if (data.inputSchema !== undefined)
    dbInput.inputSchema = data.inputSchema as Prisma.InputJsonValue;
  if (data.outputMapping !== undefined)
    dbInput.outputMapping = data.outputMapping as Prisma.InputJsonValue;
  if (data.toolDescription !== undefined) dbInput.toolDescription = data.toolDescription;
  if (data.toolSuccessTemplate !== undefined)
    dbInput.toolSuccessTemplate = data.toolSuccessTemplate;
  if (data.toolErrorTemplate !== undefined) dbInput.toolErrorTemplate = data.toolErrorTemplate;
  if (data.safetyLimits !== undefined)
    dbInput.safetyLimits = data.safetyLimits as Prisma.InputJsonValue;
  if (data.reasoningConfig !== undefined)
    dbInput.reasoningConfig = data.reasoningConfig as Prisma.InputJsonValue;
  if (data.status !== undefined) dbInput.status = data.status as PipelineStatus;
  if (data.metadata !== undefined) dbInput.metadata = data.metadata as Prisma.InputJsonValue;

  const updated = await repoUpdatePipeline(pipelineId, dbInput);
  return toPipelineResponse(updated);
}

/**
 * Activates a pipeline (requires at least 1 step)
 */
export async function activatePipeline(
  tenantId: string,
  pipelineId: string
): Promise<PipelineResponse> {
  const existing = await findPipelineByIdAndTenant(pipelineId, tenantId);
  if (!existing) {
    throw new PipelineError(
      PipelineErrorCodes.PIPELINE_NOT_FOUND,
      `Pipeline '${pipelineId}' not found`,
      404
    );
  }

  // Verify pipeline has at least 1 step
  const stepCount = await countSteps(pipelineId);
  if (stepCount === 0) {
    throw new PipelineError(
      PipelineErrorCodes.EMPTY_PIPELINE,
      'Pipeline must have at least one step before activation'
    );
  }

  const updated = await updatePipelineStatus(pipelineId, PipelineStatus.active);
  return toPipelineResponse(updated);
}

/**
 * Disables a pipeline
 */
export async function disablePipeline(
  tenantId: string,
  pipelineId: string
): Promise<PipelineResponse> {
  const existing = await findPipelineByIdAndTenant(pipelineId, tenantId);
  if (!existing) {
    throw new PipelineError(
      PipelineErrorCodes.PIPELINE_NOT_FOUND,
      `Pipeline '${pipelineId}' not found`,
      404
    );
  }

  const updated = await updatePipelineStatus(pipelineId, PipelineStatus.disabled);
  return toPipelineResponse(updated);
}

// =============================================================================
// Pipeline - Delete Operations
// =============================================================================

/**
 * Deletes a pipeline (cascades to steps and executions)
 */
export async function deletePipeline(tenantId: string, pipelineId: string): Promise<void> {
  const existing = await findPipelineByIdAndTenant(pipelineId, tenantId);
  if (!existing) {
    throw new PipelineError(
      PipelineErrorCodes.PIPELINE_NOT_FOUND,
      `Pipeline '${pipelineId}' not found`,
      404
    );
  }

  await repoDeletePipeline(pipelineId);
}

// =============================================================================
// Step - Create Operations
// =============================================================================

/**
 * Adds a step to a pipeline
 */
export async function addStep(
  tenantId: string,
  pipelineId: string,
  input: CreatePipelineStepInput
): Promise<PipelineStepResponse> {
  const parsed = CreatePipelineStepInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new PipelineError(
      PipelineErrorCodes.INVALID_INPUT,
      `Invalid step data: ${parsed.error.message}`
    );
  }

  const data = parsed.data;

  // Verify pipeline exists and belongs to tenant
  const pipeline = await findPipelineByIdAndTenant(pipelineId, tenantId);
  if (!pipeline) {
    throw new PipelineError(
      PipelineErrorCodes.PIPELINE_NOT_FOUND,
      `Pipeline '${pipelineId}' not found`,
      404
    );
  }

  // Check step count limit
  const currentCount = await countSteps(pipelineId);
  if (currentCount >= MAX_STEPS_PER_PIPELINE) {
    throw new PipelineError(
      PipelineErrorCodes.MAX_STEPS_EXCEEDED,
      `Pipeline cannot have more than ${MAX_STEPS_PER_PIPELINE} steps`
    );
  }

  // Check step slug uniqueness
  const stepSlugExists = await isStepSlugTaken(pipelineId, data.slug);
  if (stepSlugExists) {
    throw new PipelineError(
      PipelineErrorCodes.DUPLICATE_STEP_SLUG,
      `A step with slug '${data.slug}' already exists in this pipeline`
    );
  }

  const dbInput: CreatePipelineStepDbInput = {
    pipelineId,
    stepNumber: data.stepNumber,
    name: data.name,
    slug: data.slug,
    toolId: data.toolId ?? null,
    toolType: (data.toolType as PipelineStepToolType) ?? null,
    toolSlug: data.toolSlug ?? null,
    inputMapping: data.inputMapping as Prisma.InputJsonValue,
    onError: (data.onError as StepOnError) ?? StepOnError.fail_pipeline,
    retryConfig: data.retryConfig as Prisma.InputJsonValue | undefined,
    timeoutSeconds: data.timeoutSeconds,
    condition: data.condition as Prisma.InputJsonValue | null | undefined,
    reasoningEnabled: data.reasoningEnabled,
    reasoningPrompt: data.reasoningPrompt ?? null,
    reasoningConfig: data.reasoningConfig as Prisma.InputJsonValue | null | undefined,
    metadata: data.metadata as Prisma.InputJsonValue,
  };

  const step = await repoCreatePipelineStep(dbInput);
  return toPipelineStepResponse(step);
}

// =============================================================================
// Step - Read Operations
// =============================================================================

/**
 * Gets a step by ID with ownership verification
 */
export async function getStepById(tenantId: string, stepId: string): Promise<PipelineStepResponse> {
  const step = await findPipelineStepById(stepId);
  if (!step) {
    throw new PipelineError(PipelineErrorCodes.STEP_NOT_FOUND, `Step '${stepId}' not found`, 404);
  }

  // Verify pipeline belongs to tenant
  const pipeline = await findPipelineByIdAndTenant(step.pipelineId, tenantId);
  if (!pipeline) {
    throw new PipelineError(PipelineErrorCodes.STEP_NOT_FOUND, `Step '${stepId}' not found`, 404);
  }

  return toPipelineStepResponse(step);
}

/**
 * Lists steps for a pipeline
 */
export async function listSteps(
  tenantId: string,
  pipelineId: string
): Promise<PipelineStepResponse[]> {
  // Verify pipeline belongs to tenant
  const pipeline = await findPipelineByIdAndTenant(pipelineId, tenantId);
  if (!pipeline) {
    throw new PipelineError(
      PipelineErrorCodes.PIPELINE_NOT_FOUND,
      `Pipeline '${pipelineId}' not found`,
      404
    );
  }

  const steps = await findStepsByPipeline(pipelineId);
  return steps.map(toPipelineStepResponse);
}

// =============================================================================
// Step - Update Operations
// =============================================================================

/**
 * Updates a step
 */
export async function updateStep(
  tenantId: string,
  stepId: string,
  input: UpdatePipelineStepInput
): Promise<PipelineStepResponse> {
  const parsed = UpdatePipelineStepInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new PipelineError(
      PipelineErrorCodes.INVALID_INPUT,
      `Invalid step update data: ${parsed.error.message}`
    );
  }

  const data = parsed.data;

  // Verify step exists
  const step = await findPipelineStepById(stepId);
  if (!step) {
    throw new PipelineError(PipelineErrorCodes.STEP_NOT_FOUND, `Step '${stepId}' not found`, 404);
  }

  // Verify pipeline belongs to tenant
  const pipeline = await findPipelineByIdAndTenant(step.pipelineId, tenantId);
  if (!pipeline) {
    throw new PipelineError(PipelineErrorCodes.STEP_NOT_FOUND, `Step '${stepId}' not found`, 404);
  }

  // Check slug collision if slug is being changed
  if (data.slug && data.slug !== step.slug) {
    const slugExists = await isStepSlugTaken(step.pipelineId, data.slug, stepId);
    if (slugExists) {
      throw new PipelineError(
        PipelineErrorCodes.DUPLICATE_STEP_SLUG,
        `A step with slug '${data.slug}' already exists in this pipeline`
      );
    }
  }

  const dbInput: UpdatePipelineStepDbInput = {};
  if (data.stepNumber !== undefined) dbInput.stepNumber = data.stepNumber;
  if (data.name !== undefined) dbInput.name = data.name;
  if (data.slug !== undefined) dbInput.slug = data.slug;
  if (data.toolId !== undefined) dbInput.toolId = data.toolId;
  if (data.toolType !== undefined) dbInput.toolType = data.toolType as PipelineStepToolType | null;
  if (data.toolSlug !== undefined) dbInput.toolSlug = data.toolSlug;
  if (data.inputMapping !== undefined)
    dbInput.inputMapping = data.inputMapping as Prisma.InputJsonValue;
  if (data.onError !== undefined) dbInput.onError = data.onError as StepOnError;
  if (data.retryConfig !== undefined)
    dbInput.retryConfig = data.retryConfig as Prisma.InputJsonValue;
  if (data.timeoutSeconds !== undefined) dbInput.timeoutSeconds = data.timeoutSeconds;
  if (data.condition !== undefined)
    dbInput.condition = data.condition as Prisma.InputJsonValue | null;
  if (data.reasoningEnabled !== undefined) dbInput.reasoningEnabled = data.reasoningEnabled;
  if (data.reasoningPrompt !== undefined) dbInput.reasoningPrompt = data.reasoningPrompt;
  if (data.reasoningConfig !== undefined)
    dbInput.reasoningConfig = data.reasoningConfig as Prisma.InputJsonValue | null;
  if (data.metadata !== undefined) dbInput.metadata = data.metadata as Prisma.InputJsonValue;

  const updated = await repoUpdatePipelineStep(stepId, dbInput);
  return toPipelineStepResponse(updated);
}

// =============================================================================
// Step - Delete Operations
// =============================================================================

/**
 * Removes a step and renumbers remaining steps
 */
export async function removeStep(tenantId: string, stepId: string): Promise<void> {
  // Verify step exists
  const step = await findPipelineStepById(stepId);
  if (!step) {
    throw new PipelineError(PipelineErrorCodes.STEP_NOT_FOUND, `Step '${stepId}' not found`, 404);
  }

  // Verify pipeline belongs to tenant
  const pipeline = await findPipelineByIdAndTenant(step.pipelineId, tenantId);
  if (!pipeline) {
    throw new PipelineError(PipelineErrorCodes.STEP_NOT_FOUND, `Step '${stepId}' not found`, 404);
  }

  await repoDeletePipelineStep(stepId);

  // Renumber remaining steps to close gaps
  await renumberStepsAfterDeletion(step.pipelineId);
}

// =============================================================================
// Step - Reorder Operations
// =============================================================================

/**
 * Reorders steps within a pipeline
 */
export async function reorderSteps(
  tenantId: string,
  pipelineId: string,
  input: ReorderStepsInput
): Promise<PipelineStepResponse[]> {
  const parsed = ReorderStepsInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new PipelineError(
      PipelineErrorCodes.INVALID_INPUT,
      `Invalid reorder data: ${parsed.error.message}`
    );
  }

  const data = parsed.data;

  // Verify pipeline exists and belongs to tenant
  const pipeline = await findPipelineByIdAndTenant(pipelineId, tenantId);
  if (!pipeline) {
    throw new PipelineError(
      PipelineErrorCodes.PIPELINE_NOT_FOUND,
      `Pipeline '${pipelineId}' not found`,
      404
    );
  }

  // Verify all step IDs belong to this pipeline
  const existingSteps = await findStepsByPipeline(pipelineId);
  const existingStepIds = new Set(existingSteps.map((s) => s.id));

  for (const step of data.steps) {
    if (!existingStepIds.has(step.id)) {
      throw new PipelineError(
        PipelineErrorCodes.STEP_NOT_FOUND,
        `Step '${step.id}' does not belong to pipeline '${pipelineId}'`
      );
    }
  }

  // Verify step numbers are sequential starting from 1
  const sortedStepNumbers = data.steps.map((s) => s.stepNumber).sort((a, b) => a - b);
  for (let i = 0; i < sortedStepNumbers.length; i++) {
    if (sortedStepNumbers[i] !== i + 1) {
      throw new PipelineError(
        PipelineErrorCodes.INVALID_STEP_ORDER,
        'Step numbers must be sequential starting from 1 with no gaps'
      );
    }
  }

  // Verify all existing steps are included in the reorder
  if (data.steps.length !== existingSteps.length) {
    throw new PipelineError(
      PipelineErrorCodes.INVALID_STEP_ORDER,
      'All steps must be included when reordering'
    );
  }

  const reorderedSteps = await repoReorderPipelineSteps(pipelineId, data.steps);
  return reorderedSteps.map(toPipelineStepResponse);
}

// =============================================================================
// Statistics
// =============================================================================

/**
 * Gets pipeline counts by status for a tenant
 */
export async function getPipelineStats(
  tenantId: string
): Promise<{ total: number; byStatus: Record<string, number> }> {
  const byStatus = await getPipelineCountsByStatus(tenantId);
  const total = Object.values(byStatus).reduce((sum, count) => sum + count, 0);
  return { total, byStatus };
}

// =============================================================================
// Execution - Read Operations
// =============================================================================

/**
 * Lists executions for a tenant with pagination
 */
export async function listExecutions(
  tenantId: string,
  query: { cursor?: string; limit?: number; pipelineId?: string } = {}
): Promise<{
  executions: PipelineExecutionResponse[];
  pagination: { cursor: string | null; hasMore: boolean; totalCount: number };
}> {
  const { cursor, limit = 20, pipelineId } = query;

  const result = pipelineId
    ? await findExecutionsByPipeline(pipelineId, { cursor, limit })
    : await findExecutionsByTenant(tenantId, { cursor, limit });

  // If querying by pipelineId, verify pipeline belongs to tenant
  if (pipelineId) {
    const pipeline = await findPipelineByIdAndTenant(pipelineId, tenantId);
    if (!pipeline) {
      throw new PipelineError(
        PipelineErrorCodes.PIPELINE_NOT_FOUND,
        `Pipeline '${pipelineId}' not found`,
        404
      );
    }
  }

  return {
    executions: result.executions.map(toPipelineExecutionResponse),
    pagination: {
      cursor: result.nextCursor,
      hasMore: result.nextCursor !== null,
      totalCount: result.totalCount,
    },
  };
}

/**
 * Gets execution detail with step executions
 */
export async function getExecutionDetail(
  tenantId: string,
  executionId: string
): Promise<PipelineExecutionDetailResponse> {
  const execution = await findPipelineExecutionWithSteps(executionId);
  if (!execution) {
    throw new PipelineError(
      PipelineErrorCodes.EXECUTION_NOT_FOUND,
      `Execution '${executionId}' not found`,
      404
    );
  }

  // Verify execution belongs to tenant
  if (execution.tenantId !== tenantId) {
    throw new PipelineError(
      PipelineErrorCodes.EXECUTION_NOT_FOUND,
      `Execution '${executionId}' not found`,
      404
    );
  }

  return {
    ...toPipelineExecutionResponse(execution),
    stepExecutions: execution.stepExecutions.map(toStepExecutionResponse),
  };
}

/**
 * Cancels a running pipeline execution
 */
export async function cancelExecution(
  tenantId: string,
  executionId: string
): Promise<PipelineExecutionResponse> {
  const execution = await findPipelineExecutionById(executionId);
  if (!execution) {
    throw new PipelineError(
      PipelineErrorCodes.EXECUTION_NOT_FOUND,
      `Execution '${executionId}' not found`,
      404
    );
  }

  // Verify execution belongs to tenant
  if (execution.tenantId !== tenantId) {
    throw new PipelineError(
      PipelineErrorCodes.EXECUTION_NOT_FOUND,
      `Execution '${executionId}' not found`,
      404
    );
  }

  // Only running executions can be cancelled
  if (execution.status !== PipelineExecutionStatus.running) {
    throw new PipelineError(
      PipelineErrorCodes.INVALID_STATUS,
      `Execution is not running (status: ${execution.status})`,
      400
    );
  }

  const updated = await repoUpdatePipelineExecution(executionId, {
    status: PipelineExecutionStatus.cancelled,
    completedAt: new Date(),
  });

  return toPipelineExecutionResponse(updated);
}

/**
 * Gets execution statistics for a pipeline
 */
export async function getExecutionStatistics(
  tenantId: string,
  pipelineId: string
): Promise<{
  totalExecutions: number;
  completedCount: number;
  failedCount: number;
  timeoutCount: number;
  cancelledCount: number;
  avgDurationMs: number;
  totalCost: number;
  totalTokens: number;
}> {
  // Verify pipeline belongs to tenant
  const pipeline = await findPipelineByIdAndTenant(pipelineId, tenantId);
  if (!pipeline) {
    throw new PipelineError(
      PipelineErrorCodes.PIPELINE_NOT_FOUND,
      `Pipeline '${pipelineId}' not found`,
      404
    );
  }

  return getPipelineExecutionStats(pipelineId);
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Generates a slug from a name
 */
export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Validates that a pipeline is active (for invocation)
 */
export function validatePipelineActive(pipeline: Pipeline): void {
  if (pipeline.status === PipelineStatus.disabled) {
    throw new PipelineError(
      PipelineErrorCodes.PIPELINE_DISABLED,
      `Pipeline '${pipeline.slug}' is disabled`,
      403
    );
  }
  if (pipeline.status === PipelineStatus.draft) {
    throw new PipelineError(
      PipelineErrorCodes.PIPELINE_NOT_ACTIVE,
      `Pipeline '${pipeline.slug}' is in draft status and cannot be invoked`,
      403
    );
  }
}
