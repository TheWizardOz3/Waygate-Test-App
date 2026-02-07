/**
 * Pipeline Repository
 *
 * Data access layer for Pipeline, PipelineStep, PipelineExecution, and StepExecution models.
 * Handles CRUD operations and queries for pipeline definitions, steps, and execution records.
 *
 * Pipelines are scoped to tenants for data isolation.
 */

import { prisma } from '@/lib/db/client';
import {
  PipelineStatus,
  PipelineStepToolType,
  StepOnError,
  PipelineExecutionStatus,
  StepExecutionStatus,
  Prisma,
} from '@prisma/client';

import type { Pipeline, PipelineStep, PipelineExecution, StepExecution } from '@prisma/client';
import type { PipelineFilters } from './pipeline.schemas';

// =============================================================================
// Types
// =============================================================================

/**
 * Input for creating a new pipeline (repository layer)
 */
export interface CreatePipelineDbInput {
  tenantId: string;
  name: string;
  slug: string;
  description?: string;
  inputSchema?: Prisma.InputJsonValue;
  outputMapping?: Prisma.InputJsonValue;
  toolDescription?: string;
  toolSuccessTemplate?: string;
  toolErrorTemplate?: string;
  safetyLimits?: Prisma.InputJsonValue;
  reasoningConfig?: Prisma.InputJsonValue;
  status?: PipelineStatus;
  metadata?: Prisma.InputJsonValue;
}

/**
 * Input for updating a pipeline (repository layer)
 */
export interface UpdatePipelineDbInput {
  name?: string;
  slug?: string;
  description?: string | null;
  inputSchema?: Prisma.InputJsonValue;
  outputMapping?: Prisma.InputJsonValue;
  toolDescription?: string | null;
  toolSuccessTemplate?: string | null;
  toolErrorTemplate?: string | null;
  safetyLimits?: Prisma.InputJsonValue;
  reasoningConfig?: Prisma.InputJsonValue;
  status?: PipelineStatus;
  metadata?: Prisma.InputJsonValue;
}

/**
 * Input for creating a pipeline step (repository layer)
 */
export interface CreatePipelineStepDbInput {
  pipelineId: string;
  stepNumber: number;
  name: string;
  slug: string;
  toolId?: string | null;
  toolType?: PipelineStepToolType | null;
  toolSlug?: string | null;
  inputMapping?: Prisma.InputJsonValue;
  onError?: StepOnError;
  retryConfig?: Prisma.InputJsonValue;
  timeoutSeconds?: number;
  condition?: Prisma.InputJsonValue | null;
  reasoningEnabled?: boolean;
  reasoningPrompt?: string | null;
  reasoningConfig?: Prisma.InputJsonValue | null;
  metadata?: Prisma.InputJsonValue;
}

/**
 * Input for updating a pipeline step (repository layer)
 */
export interface UpdatePipelineStepDbInput {
  stepNumber?: number;
  name?: string;
  slug?: string;
  toolId?: string | null;
  toolType?: PipelineStepToolType | null;
  toolSlug?: string | null;
  inputMapping?: Prisma.InputJsonValue;
  onError?: StepOnError;
  retryConfig?: Prisma.InputJsonValue;
  timeoutSeconds?: number;
  condition?: Prisma.InputJsonValue | null;
  reasoningEnabled?: boolean;
  reasoningPrompt?: string | null;
  reasoningConfig?: Prisma.InputJsonValue | null;
  metadata?: Prisma.InputJsonValue;
}

/**
 * Input for creating a pipeline execution (repository layer)
 */
export interface CreatePipelineExecutionDbInput {
  pipelineId: string;
  tenantId: string;
  input: Prisma.InputJsonValue;
  state?: Prisma.InputJsonValue;
  totalSteps: number;
  status?: PipelineExecutionStatus;
}

/**
 * Input for updating a pipeline execution (repository layer)
 */
export interface UpdatePipelineExecutionDbInput {
  state?: Prisma.InputJsonValue;
  output?: Prisma.InputJsonValue;
  status?: PipelineExecutionStatus;
  currentStepNumber?: number;
  totalCostUsd?: number;
  totalTokens?: number;
  error?: Prisma.InputJsonValue;
  completedAt?: Date;
}

/**
 * Input for creating a step execution (repository layer)
 */
export interface CreateStepExecutionDbInput {
  pipelineExecutionId: string;
  pipelineStepId: string;
  stepNumber: number;
  status?: StepExecutionStatus;
}

/**
 * Input for updating a step execution (repository layer)
 */
export interface UpdateStepExecutionDbInput {
  status?: StepExecutionStatus;
  resolvedInput?: Prisma.InputJsonValue;
  toolOutput?: Prisma.InputJsonValue;
  reasoningOutput?: Prisma.InputJsonValue;
  error?: Prisma.InputJsonValue;
  retryCount?: number;
  costUsd?: number;
  tokensUsed?: number;
  durationMs?: number;
  startedAt?: Date;
  completedAt?: Date;
}

/**
 * Pagination options
 */
export interface PipelinePaginationOptions {
  cursor?: string;
  limit?: number;
}

/**
 * Paginated pipeline result
 */
export interface PaginatedPipelines {
  pipelines: PipelineWithStepCount[];
  nextCursor: string | null;
  totalCount: number;
}

/**
 * Pipeline with step count
 */
export interface PipelineWithStepCount extends Pipeline {
  _count: { steps: number };
}

/**
 * Pipeline with steps
 */
export interface PipelineWithSteps extends Pipeline {
  steps: PipelineStep[];
}

/**
 * Pipeline execution with step executions
 */
export interface PipelineExecutionWithSteps extends PipelineExecution {
  stepExecutions: StepExecution[];
}

// =============================================================================
// Pipeline - Create Operations
// =============================================================================

/**
 * Creates a new pipeline
 */
export async function createPipeline(input: CreatePipelineDbInput): Promise<Pipeline> {
  return prisma.pipeline.create({
    data: {
      tenantId: input.tenantId,
      name: input.name,
      slug: input.slug,
      description: input.description,
      inputSchema: input.inputSchema ?? {},
      outputMapping: input.outputMapping ?? {},
      toolDescription: input.toolDescription,
      toolSuccessTemplate: input.toolSuccessTemplate,
      toolErrorTemplate: input.toolErrorTemplate,
      safetyLimits:
        input.safetyLimits ??
        ({ maxCostUsd: 5, maxDurationSeconds: 1800 } as Prisma.InputJsonValue),
      reasoningConfig: input.reasoningConfig ?? {},
      status: input.status ?? PipelineStatus.draft,
      metadata: input.metadata ?? {},
    },
  });
}

// =============================================================================
// Pipeline - Read Operations
// =============================================================================

/**
 * Finds a pipeline by ID
 */
export async function findPipelineById(id: string): Promise<Pipeline | null> {
  return prisma.pipeline.findUnique({
    where: { id },
  });
}

/**
 * Finds a pipeline by ID with tenant verification
 */
export async function findPipelineByIdAndTenant(
  id: string,
  tenantId: string
): Promise<Pipeline | null> {
  return prisma.pipeline.findFirst({
    where: { id, tenantId },
  });
}

/**
 * Finds a pipeline by ID with steps included
 */
export async function findPipelineWithSteps(
  id: string,
  tenantId: string
): Promise<PipelineWithSteps | null> {
  return prisma.pipeline.findFirst({
    where: { id, tenantId },
    include: {
      steps: {
        orderBy: { stepNumber: 'asc' },
      },
    },
  });
}

/**
 * Finds a pipeline by slug within a tenant
 */
export async function findPipelineBySlug(tenantId: string, slug: string): Promise<Pipeline | null> {
  return prisma.pipeline.findFirst({
    where: { tenantId, slug },
  });
}

/**
 * Finds a pipeline by slug with steps included
 */
export async function findPipelineBySlugWithSteps(
  tenantId: string,
  slug: string
): Promise<PipelineWithSteps | null> {
  return prisma.pipeline.findFirst({
    where: { tenantId, slug },
    include: {
      steps: {
        orderBy: { stepNumber: 'asc' },
      },
    },
  });
}

/**
 * Queries pipelines with filters and pagination
 */
export async function findPipelinesPaginated(
  tenantId: string,
  pagination: PipelinePaginationOptions = {},
  filters: PipelineFilters = {}
): Promise<PaginatedPipelines> {
  const { cursor, limit = 20 } = pagination;

  const where: Prisma.PipelineWhereInput = { tenantId };

  if (filters.status) {
    where.status = filters.status as PipelineStatus;
  }

  if (filters.search) {
    where.OR = [
      { name: { contains: filters.search, mode: 'insensitive' } },
      { slug: { contains: filters.search, mode: 'insensitive' } },
      { description: { contains: filters.search, mode: 'insensitive' } },
    ];
  }

  const totalCount = await prisma.pipeline.count({ where });

  const pipelines = await prisma.pipeline.findMany({
    where,
    take: limit + 1,
    orderBy: { createdAt: 'desc' },
    include: {
      _count: {
        select: { steps: true },
      },
    },
    ...(cursor && {
      cursor: { id: cursor },
      skip: 1,
    }),
  });

  const hasMore = pipelines.length > limit;
  if (hasMore) {
    pipelines.pop();
  }

  const nextCursor = hasMore && pipelines.length > 0 ? pipelines[pipelines.length - 1].id : null;

  return {
    pipelines,
    nextCursor,
    totalCount,
  };
}

/**
 * Gets all pipelines for a tenant (no pagination, for exports)
 */
export async function findAllPipelinesForTenant(tenantId: string): Promise<Pipeline[]> {
  return prisma.pipeline.findMany({
    where: { tenantId },
    orderBy: { name: 'asc' },
  });
}

/**
 * Checks if a slug is already used by another pipeline in the tenant
 */
export async function isPipelineSlugTaken(
  tenantId: string,
  slug: string,
  excludeId?: string
): Promise<boolean> {
  const existing = await prisma.pipeline.findFirst({
    where: {
      tenantId,
      slug,
      ...(excludeId && { id: { not: excludeId } }),
    },
    select: { id: true },
  });
  return existing !== null;
}

// =============================================================================
// Pipeline - Update Operations
// =============================================================================

/**
 * Updates a pipeline
 */
export async function updatePipeline(id: string, input: UpdatePipelineDbInput): Promise<Pipeline> {
  const data: Prisma.PipelineUpdateInput = {};

  if (input.name !== undefined) data.name = input.name;
  if (input.slug !== undefined) data.slug = input.slug;
  if (input.description !== undefined) data.description = input.description;
  if (input.inputSchema !== undefined) data.inputSchema = input.inputSchema;
  if (input.outputMapping !== undefined) data.outputMapping = input.outputMapping;
  if (input.toolDescription !== undefined) data.toolDescription = input.toolDescription;
  if (input.toolSuccessTemplate !== undefined) data.toolSuccessTemplate = input.toolSuccessTemplate;
  if (input.toolErrorTemplate !== undefined) data.toolErrorTemplate = input.toolErrorTemplate;
  if (input.safetyLimits !== undefined) data.safetyLimits = input.safetyLimits;
  if (input.reasoningConfig !== undefined) data.reasoningConfig = input.reasoningConfig;
  if (input.status !== undefined) data.status = input.status;
  if (input.metadata !== undefined) data.metadata = input.metadata;

  return prisma.pipeline.update({
    where: { id },
    data,
  });
}

/**
 * Updates pipeline status
 */
export async function updatePipelineStatus(id: string, status: PipelineStatus): Promise<Pipeline> {
  return prisma.pipeline.update({
    where: { id },
    data: { status },
  });
}

// =============================================================================
// Pipeline - Delete Operations
// =============================================================================

/**
 * Deletes a pipeline (cascades to steps and executions)
 */
export async function deletePipeline(id: string): Promise<Pipeline> {
  return prisma.pipeline.delete({
    where: { id },
  });
}

// =============================================================================
// PipelineStep - Create Operations
// =============================================================================

/**
 * Creates a single pipeline step
 */
export async function createPipelineStep(input: CreatePipelineStepDbInput): Promise<PipelineStep> {
  return prisma.pipelineStep.create({
    data: {
      pipelineId: input.pipelineId,
      stepNumber: input.stepNumber,
      name: input.name,
      slug: input.slug,
      toolId: input.toolId ?? null,
      toolType: input.toolType ?? null,
      toolSlug: input.toolSlug ?? null,
      inputMapping: input.inputMapping ?? {},
      onError: input.onError ?? StepOnError.fail_pipeline,
      retryConfig:
        input.retryConfig ?? ({ maxRetries: 0, backoffMs: 1000 } as Prisma.InputJsonValue),
      timeoutSeconds: input.timeoutSeconds ?? 300,
      condition: input.condition ?? Prisma.JsonNull,
      reasoningEnabled: input.reasoningEnabled ?? false,
      reasoningPrompt: input.reasoningPrompt ?? null,
      reasoningConfig: input.reasoningConfig ?? Prisma.JsonNull,
      metadata: input.metadata ?? {},
    },
  });
}

/**
 * Creates multiple pipeline steps in a transaction
 */
export async function createPipelineStepsBatch(
  inputs: CreatePipelineStepDbInput[]
): Promise<PipelineStep[]> {
  const operations = inputs.map((input) =>
    prisma.pipelineStep.create({
      data: {
        pipelineId: input.pipelineId,
        stepNumber: input.stepNumber,
        name: input.name,
        slug: input.slug,
        toolId: input.toolId ?? null,
        toolType: input.toolType ?? null,
        toolSlug: input.toolSlug ?? null,
        inputMapping: input.inputMapping ?? {},
        onError: input.onError ?? StepOnError.fail_pipeline,
        retryConfig:
          input.retryConfig ?? ({ maxRetries: 0, backoffMs: 1000 } as Prisma.InputJsonValue),
        timeoutSeconds: input.timeoutSeconds ?? 300,
        condition: input.condition ?? Prisma.JsonNull,
        reasoningEnabled: input.reasoningEnabled ?? false,
        reasoningPrompt: input.reasoningPrompt ?? null,
        reasoningConfig: input.reasoningConfig ?? Prisma.JsonNull,
        metadata: input.metadata ?? {},
      },
    })
  );

  return prisma.$transaction(operations);
}

// =============================================================================
// PipelineStep - Read Operations
// =============================================================================

/**
 * Finds a pipeline step by ID
 */
export async function findPipelineStepById(id: string): Promise<PipelineStep | null> {
  return prisma.pipelineStep.findUnique({
    where: { id },
  });
}

/**
 * Finds all steps for a pipeline, ordered by stepNumber
 */
export async function findStepsByPipeline(pipelineId: string): Promise<PipelineStep[]> {
  return prisma.pipelineStep.findMany({
    where: { pipelineId },
    orderBy: { stepNumber: 'asc' },
  });
}

/**
 * Finds a step by slug within a pipeline
 */
export async function findPipelineStepBySlug(
  pipelineId: string,
  slug: string
): Promise<PipelineStep | null> {
  return prisma.pipelineStep.findFirst({
    where: { pipelineId, slug },
  });
}

/**
 * Checks if a step slug is already used within a pipeline
 */
export async function isStepSlugTaken(
  pipelineId: string,
  slug: string,
  excludeId?: string
): Promise<boolean> {
  const existing = await prisma.pipelineStep.findFirst({
    where: {
      pipelineId,
      slug,
      ...(excludeId && { id: { not: excludeId } }),
    },
    select: { id: true },
  });
  return existing !== null;
}

/**
 * Counts steps in a pipeline
 */
export async function countSteps(pipelineId: string): Promise<number> {
  return prisma.pipelineStep.count({
    where: { pipelineId },
  });
}

// =============================================================================
// PipelineStep - Update Operations
// =============================================================================

/**
 * Updates a pipeline step
 */
export async function updatePipelineStep(
  id: string,
  input: UpdatePipelineStepDbInput
): Promise<PipelineStep> {
  const data: Prisma.PipelineStepUpdateInput = {};

  if (input.stepNumber !== undefined) data.stepNumber = input.stepNumber;
  if (input.name !== undefined) data.name = input.name;
  if (input.slug !== undefined) data.slug = input.slug;
  if (input.toolId !== undefined) data.toolId = input.toolId;
  if (input.toolType !== undefined) data.toolType = input.toolType;
  if (input.toolSlug !== undefined) data.toolSlug = input.toolSlug;
  if (input.inputMapping !== undefined) data.inputMapping = input.inputMapping;
  if (input.onError !== undefined) data.onError = input.onError;
  if (input.retryConfig !== undefined) data.retryConfig = input.retryConfig;
  if (input.timeoutSeconds !== undefined) data.timeoutSeconds = input.timeoutSeconds;
  if (input.condition !== undefined) data.condition = input.condition ?? Prisma.JsonNull;
  if (input.reasoningEnabled !== undefined) data.reasoningEnabled = input.reasoningEnabled;
  if (input.reasoningPrompt !== undefined) data.reasoningPrompt = input.reasoningPrompt;
  if (input.reasoningConfig !== undefined)
    data.reasoningConfig = input.reasoningConfig ?? Prisma.JsonNull;
  if (input.metadata !== undefined) data.metadata = input.metadata;

  return prisma.pipelineStep.update({
    where: { id },
    data,
  });
}

// =============================================================================
// PipelineStep - Delete Operations
// =============================================================================

/**
 * Deletes a pipeline step
 */
export async function deletePipelineStep(id: string): Promise<PipelineStep> {
  return prisma.pipelineStep.delete({
    where: { id },
  });
}

/**
 * Reorders pipeline steps atomically
 * Uses negative step numbers temporarily to avoid unique constraint violations
 */
export async function reorderPipelineSteps(
  pipelineId: string,
  stepOrder: { id: string; stepNumber: number }[]
): Promise<PipelineStep[]> {
  // Phase 1: Set all step numbers to negative (avoids unique constraint collisions)
  const negativeOps = stepOrder.map((step, index) =>
    prisma.pipelineStep.update({
      where: { id: step.id },
      data: { stepNumber: -(index + 1) },
    })
  );

  // Phase 2: Set step numbers to their correct values
  const positiveOps = stepOrder.map((step) =>
    prisma.pipelineStep.update({
      where: { id: step.id },
      data: { stepNumber: step.stepNumber },
    })
  );

  await prisma.$transaction([...negativeOps, ...positiveOps]);

  // Return steps in new order
  return findStepsByPipeline(pipelineId);
}

/**
 * Renumbers steps after a deletion to close gaps
 */
export async function renumberStepsAfterDeletion(pipelineId: string): Promise<void> {
  const steps = await findStepsByPipeline(pipelineId);

  if (steps.length === 0) return;

  // Check if renumbering is needed
  const needsRenumber = steps.some((step, index) => step.stepNumber !== index + 1);
  if (!needsRenumber) return;

  const reorderOps = steps.map((step, index) => ({
    id: step.id,
    stepNumber: index + 1,
  }));

  await reorderPipelineSteps(pipelineId, reorderOps);
}

// =============================================================================
// PipelineExecution - Create Operations
// =============================================================================

/**
 * Creates a new pipeline execution record
 */
export async function createPipelineExecution(
  input: CreatePipelineExecutionDbInput
): Promise<PipelineExecution> {
  return prisma.pipelineExecution.create({
    data: {
      pipelineId: input.pipelineId,
      tenantId: input.tenantId,
      input: input.input,
      state: input.state ?? {},
      totalSteps: input.totalSteps,
      status: input.status ?? PipelineExecutionStatus.running,
    },
  });
}

// =============================================================================
// PipelineExecution - Read Operations
// =============================================================================

/**
 * Finds an execution by ID
 */
export async function findPipelineExecutionById(id: string): Promise<PipelineExecution | null> {
  return prisma.pipelineExecution.findUnique({
    where: { id },
  });
}

/**
 * Finds an execution with step executions
 */
export async function findPipelineExecutionWithSteps(
  id: string
): Promise<PipelineExecutionWithSteps | null> {
  return prisma.pipelineExecution.findFirst({
    where: { id },
    include: {
      stepExecutions: {
        orderBy: { stepNumber: 'asc' },
      },
    },
  });
}

/**
 * Finds executions for a pipeline with pagination
 */
export async function findExecutionsByPipeline(
  pipelineId: string,
  pagination: { cursor?: string; limit?: number } = {}
): Promise<{
  executions: PipelineExecution[];
  nextCursor: string | null;
  totalCount: number;
}> {
  const { cursor, limit = 20 } = pagination;

  const totalCount = await prisma.pipelineExecution.count({
    where: { pipelineId },
  });

  const executions = await prisma.pipelineExecution.findMany({
    where: { pipelineId },
    take: limit + 1,
    orderBy: { createdAt: 'desc' },
    ...(cursor && {
      cursor: { id: cursor },
      skip: 1,
    }),
  });

  const hasMore = executions.length > limit;
  if (hasMore) {
    executions.pop();
  }

  const nextCursor = hasMore && executions.length > 0 ? executions[executions.length - 1].id : null;

  return { executions, nextCursor, totalCount };
}

/**
 * Finds executions for a tenant with pagination
 */
export async function findExecutionsByTenant(
  tenantId: string,
  pagination: { cursor?: string; limit?: number } = {}
): Promise<{
  executions: PipelineExecution[];
  nextCursor: string | null;
  totalCount: number;
}> {
  const { cursor, limit = 20 } = pagination;

  const totalCount = await prisma.pipelineExecution.count({
    where: { tenantId },
  });

  const executions = await prisma.pipelineExecution.findMany({
    where: { tenantId },
    take: limit + 1,
    orderBy: { createdAt: 'desc' },
    ...(cursor && {
      cursor: { id: cursor },
      skip: 1,
    }),
  });

  const hasMore = executions.length > limit;
  if (hasMore) {
    executions.pop();
  }

  const nextCursor = hasMore && executions.length > 0 ? executions[executions.length - 1].id : null;

  return { executions, nextCursor, totalCount };
}

// =============================================================================
// PipelineExecution - Update Operations
// =============================================================================

/**
 * Updates a pipeline execution
 */
export async function updatePipelineExecution(
  id: string,
  input: UpdatePipelineExecutionDbInput
): Promise<PipelineExecution> {
  const data: Prisma.PipelineExecutionUpdateInput = {};

  if (input.state !== undefined) data.state = input.state;
  if (input.output !== undefined) data.output = input.output;
  if (input.status !== undefined) data.status = input.status;
  if (input.currentStepNumber !== undefined) data.currentStepNumber = input.currentStepNumber;
  if (input.totalCostUsd !== undefined) data.totalCostUsd = input.totalCostUsd;
  if (input.totalTokens !== undefined) data.totalTokens = input.totalTokens;
  if (input.error !== undefined) data.error = input.error;
  if (input.completedAt !== undefined) data.completedAt = input.completedAt;

  return prisma.pipelineExecution.update({
    where: { id },
    data,
  });
}

// =============================================================================
// StepExecution - Create Operations
// =============================================================================

/**
 * Creates a new step execution record
 */
export async function createStepExecution(
  input: CreateStepExecutionDbInput
): Promise<StepExecution> {
  return prisma.stepExecution.create({
    data: {
      pipelineExecutionId: input.pipelineExecutionId,
      pipelineStepId: input.pipelineStepId,
      stepNumber: input.stepNumber,
      status: input.status ?? StepExecutionStatus.pending,
    },
  });
}

// =============================================================================
// StepExecution - Update Operations
// =============================================================================

/**
 * Updates a step execution
 */
export async function updateStepExecution(
  id: string,
  input: UpdateStepExecutionDbInput
): Promise<StepExecution> {
  const data: Prisma.StepExecutionUpdateInput = {};

  if (input.status !== undefined) data.status = input.status;
  if (input.resolvedInput !== undefined) data.resolvedInput = input.resolvedInput;
  if (input.toolOutput !== undefined) data.toolOutput = input.toolOutput;
  if (input.reasoningOutput !== undefined) data.reasoningOutput = input.reasoningOutput;
  if (input.error !== undefined) data.error = input.error;
  if (input.retryCount !== undefined) data.retryCount = input.retryCount;
  if (input.costUsd !== undefined) data.costUsd = input.costUsd;
  if (input.tokensUsed !== undefined) data.tokensUsed = input.tokensUsed;
  if (input.durationMs !== undefined) data.durationMs = input.durationMs;
  if (input.startedAt !== undefined) data.startedAt = input.startedAt;
  if (input.completedAt !== undefined) data.completedAt = input.completedAt;

  return prisma.stepExecution.update({
    where: { id },
    data,
  });
}

// =============================================================================
// Statistics
// =============================================================================

/**
 * Gets pipeline counts by status for a tenant
 */
export async function getPipelineCountsByStatus(
  tenantId: string
): Promise<Record<PipelineStatus, number>> {
  const counts = await prisma.pipeline.groupBy({
    by: ['status'],
    where: { tenantId },
    _count: true,
  });

  const result: Record<PipelineStatus, number> = {
    [PipelineStatus.draft]: 0,
    [PipelineStatus.active]: 0,
    [PipelineStatus.disabled]: 0,
  };

  for (const item of counts) {
    result[item.status] = item._count;
  }

  return result;
}

/**
 * Gets execution statistics for a pipeline
 */
export async function getPipelineExecutionStats(pipelineId: string): Promise<{
  totalExecutions: number;
  completedCount: number;
  failedCount: number;
  timeoutCount: number;
  cancelledCount: number;
  avgDurationMs: number;
  totalCost: number;
  totalTokens: number;
}> {
  const stats = await prisma.pipelineExecution.aggregate({
    where: { pipelineId },
    _count: true,
    _avg: {
      totalCostUsd: true,
    },
    _sum: {
      totalCostUsd: true,
      totalTokens: true,
    },
  });

  const statusCounts = await prisma.pipelineExecution.groupBy({
    by: ['status'],
    where: { pipelineId },
    _count: true,
  });

  const countByStatus: Record<string, number> = {};
  for (const item of statusCounts) {
    countByStatus[item.status] = item._count;
  }

  return {
    totalExecutions: stats._count,
    completedCount: countByStatus[PipelineExecutionStatus.completed] ?? 0,
    failedCount: countByStatus[PipelineExecutionStatus.failed] ?? 0,
    timeoutCount: countByStatus[PipelineExecutionStatus.timeout] ?? 0,
    cancelledCount: countByStatus[PipelineExecutionStatus.cancelled] ?? 0,
    avgDurationMs: 0, // Duration not directly aggregated; computed at query time if needed
    totalCost: Number(stats._sum.totalCostUsd ?? 0),
    totalTokens: stats._sum.totalTokens ?? 0,
  };
}
