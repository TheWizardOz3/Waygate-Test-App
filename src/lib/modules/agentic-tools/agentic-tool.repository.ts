/**
 * Agentic Tool Repository
 *
 * Data access layer for AgenticTool and AgenticToolExecution models.
 * Handles CRUD operations and queries for agentic tool definitions and their execution records.
 *
 * Agentic tools are scoped to tenants for data isolation.
 */

import { prisma } from '@/lib/db/client';
import {
  AgenticToolExecutionMode,
  AgenticToolStatus,
  AgenticToolExecutionStatus,
  Prisma,
} from '@prisma/client';

import type { AgenticTool, AgenticToolExecution } from '@prisma/client';
import type { AgenticToolFilters } from './agentic-tool.schemas';

// =============================================================================
// Types
// =============================================================================

/**
 * Input for creating a new agentic tool (repository layer)
 */
export interface CreateAgenticToolDbInput {
  tenantId: string;
  name: string;
  slug: string;
  description?: string;
  executionMode: AgenticToolExecutionMode;
  embeddedLLMConfig: Prisma.InputJsonValue;
  systemPrompt: string;
  toolAllocation: Prisma.InputJsonValue;
  contextConfig?: Prisma.InputJsonValue;
  inputSchema?: Prisma.InputJsonValue;
  toolDescription?: string;
  safetyLimits?: Prisma.InputJsonValue;
  status?: AgenticToolStatus;
  metadata?: Prisma.InputJsonValue;
}

/**
 * Input for updating an agentic tool (repository layer)
 */
export interface UpdateAgenticToolDbInput {
  name?: string;
  slug?: string;
  description?: string | null;
  executionMode?: AgenticToolExecutionMode;
  embeddedLLMConfig?: Prisma.InputJsonValue;
  systemPrompt?: string;
  toolAllocation?: Prisma.InputJsonValue;
  contextConfig?: Prisma.InputJsonValue;
  inputSchema?: Prisma.InputJsonValue;
  toolDescription?: string | null;
  safetyLimits?: Prisma.InputJsonValue;
  status?: AgenticToolStatus;
  metadata?: Prisma.InputJsonValue;
}

/**
 * Input for creating an agentic tool execution (repository layer)
 */
export interface CreateAgenticToolExecutionDbInput {
  agenticToolId: string;
  tenantId: string;
  parentRequest: Prisma.InputJsonValue;
  llmCalls?: Prisma.InputJsonValue[];
  toolCalls?: Prisma.InputJsonValue[];
  result?: Prisma.InputJsonValue;
  status: AgenticToolExecutionStatus;
  error?: Prisma.InputJsonValue;
  totalCost?: number;
  totalTokens?: number;
  durationMs?: number;
  traceId?: string;
  completedAt?: Date;
}

/**
 * Input for updating an agentic tool execution (repository layer)
 */
export interface UpdateAgenticToolExecutionDbInput {
  llmCalls?: Prisma.InputJsonValue[];
  toolCalls?: Prisma.InputJsonValue[];
  result?: Prisma.InputJsonValue;
  status?: AgenticToolExecutionStatus;
  error?: Prisma.InputJsonValue;
  totalCost?: number;
  totalTokens?: number;
  durationMs?: number;
  completedAt?: Date;
}

/**
 * Pagination options
 */
export interface AgenticToolPaginationOptions {
  cursor?: string;
  limit?: number;
}

/**
 * Paginated result
 */
export interface PaginatedAgenticTools {
  agenticTools: AgenticTool[];
  nextCursor: string | null;
  totalCount: number;
}

/**
 * Agentic tool with execution count
 */
export interface AgenticToolWithCounts extends AgenticTool {
  _count: {
    executions: number;
  };
}

// =============================================================================
// Agentic Tool - Create Operations
// =============================================================================

/**
 * Creates a new agentic tool
 */
export async function createAgenticTool(input: CreateAgenticToolDbInput): Promise<AgenticTool> {
  return prisma.agenticTool.create({
    data: {
      tenantId: input.tenantId,
      name: input.name,
      slug: input.slug,
      description: input.description,
      executionMode: input.executionMode,
      embeddedLLMConfig: input.embeddedLLMConfig,
      systemPrompt: input.systemPrompt,
      toolAllocation: input.toolAllocation,
      contextConfig: input.contextConfig ?? {},
      inputSchema: input.inputSchema ?? {},
      toolDescription: input.toolDescription,
      safetyLimits:
        input.safetyLimits ??
        ({ maxToolCalls: 10, timeoutSeconds: 300, maxTotalCost: 1.0 } as Prisma.InputJsonValue),
      status: input.status ?? AgenticToolStatus.draft,
      metadata: input.metadata ?? {},
    },
  });
}

// =============================================================================
// Agentic Tool - Read Operations
// =============================================================================

/**
 * Finds an agentic tool by ID
 */
export async function findAgenticToolById(id: string): Promise<AgenticTool | null> {
  return prisma.agenticTool.findUnique({
    where: { id },
  });
}

/**
 * Finds an agentic tool by ID with tenant verification
 */
export async function findAgenticToolByIdAndTenant(
  id: string,
  tenantId: string
): Promise<AgenticTool | null> {
  return prisma.agenticTool.findFirst({
    where: {
      id,
      tenantId,
    },
  });
}

/**
 * Finds an agentic tool by slug within a tenant
 */
export async function findAgenticToolBySlug(
  tenantId: string,
  slug: string
): Promise<AgenticTool | null> {
  return prisma.agenticTool.findFirst({
    where: {
      tenantId,
      slug,
    },
  });
}

/**
 * Queries agentic tools with filters and pagination
 */
export async function findAgenticToolsPaginated(
  tenantId: string,
  pagination: AgenticToolPaginationOptions = {},
  filters: AgenticToolFilters = {}
): Promise<PaginatedAgenticTools> {
  const { cursor, limit = 20 } = pagination;

  // Build where clause
  const where: Prisma.AgenticToolWhereInput = {
    tenantId,
  };

  if (filters.status) {
    where.status = filters.status as AgenticToolStatus;
  }

  if (filters.executionMode) {
    where.executionMode = filters.executionMode as AgenticToolExecutionMode;
  }

  if (filters.search) {
    where.OR = [
      { name: { contains: filters.search, mode: 'insensitive' } },
      { slug: { contains: filters.search, mode: 'insensitive' } },
      { description: { contains: filters.search, mode: 'insensitive' } },
    ];
  }

  // Get total count
  const totalCount = await prisma.agenticTool.count({ where });

  // Get agentic tools with cursor pagination
  const agenticTools = await prisma.agenticTool.findMany({
    where,
    take: limit + 1,
    orderBy: { createdAt: 'desc' },
    ...(cursor && {
      cursor: { id: cursor },
      skip: 1,
    }),
  });

  // Determine if there are more results
  const hasMore = agenticTools.length > limit;
  if (hasMore) {
    agenticTools.pop();
  }

  // Get next cursor
  const nextCursor =
    hasMore && agenticTools.length > 0 ? agenticTools[agenticTools.length - 1].id : null;

  return {
    agenticTools,
    nextCursor,
    totalCount,
  };
}

/**
 * Gets all agentic tools for a tenant (no pagination)
 */
export async function findAllAgenticToolsForTenant(tenantId: string): Promise<AgenticTool[]> {
  return prisma.agenticTool.findMany({
    where: { tenantId },
    orderBy: { name: 'asc' },
  });
}

/**
 * Gets agentic tools with their execution counts
 */
export async function findAgenticToolsWithCounts(
  tenantId: string,
  pagination: AgenticToolPaginationOptions = {}
): Promise<{
  agenticTools: AgenticToolWithCounts[];
  nextCursor: string | null;
  totalCount: number;
}> {
  const { cursor, limit = 20 } = pagination;

  const totalCount = await prisma.agenticTool.count({ where: { tenantId } });

  const agenticTools = await prisma.agenticTool.findMany({
    where: { tenantId },
    take: limit + 1,
    orderBy: { createdAt: 'desc' },
    include: {
      _count: {
        select: {
          executions: true,
        },
      },
    },
    ...(cursor && {
      cursor: { id: cursor },
      skip: 1,
    }),
  });

  const hasMore = agenticTools.length > limit;
  if (hasMore) {
    agenticTools.pop();
  }

  const nextCursor =
    hasMore && agenticTools.length > 0 ? agenticTools[agenticTools.length - 1].id : null;

  return {
    agenticTools,
    nextCursor,
    totalCount,
  };
}

/**
 * Checks if a slug is already used by another agentic tool in the tenant
 */
export async function isAgenticToolSlugTaken(
  tenantId: string,
  slug: string,
  excludeId?: string
): Promise<boolean> {
  const existing = await prisma.agenticTool.findFirst({
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
// Agentic Tool - Update Operations
// =============================================================================

/**
 * Updates an agentic tool
 */
export async function updateAgenticTool(
  id: string,
  input: UpdateAgenticToolDbInput
): Promise<AgenticTool> {
  const data: Prisma.AgenticToolUpdateInput = {};

  if (input.name !== undefined) data.name = input.name;
  if (input.slug !== undefined) data.slug = input.slug;
  if (input.description !== undefined) data.description = input.description;
  if (input.executionMode !== undefined) data.executionMode = input.executionMode;
  if (input.embeddedLLMConfig !== undefined) data.embeddedLLMConfig = input.embeddedLLMConfig;
  if (input.systemPrompt !== undefined) data.systemPrompt = input.systemPrompt;
  if (input.toolAllocation !== undefined) data.toolAllocation = input.toolAllocation;
  if (input.contextConfig !== undefined) data.contextConfig = input.contextConfig;
  if (input.inputSchema !== undefined) data.inputSchema = input.inputSchema;
  if (input.toolDescription !== undefined) data.toolDescription = input.toolDescription;
  if (input.safetyLimits !== undefined) data.safetyLimits = input.safetyLimits;
  if (input.status !== undefined) data.status = input.status;
  if (input.metadata !== undefined) data.metadata = input.metadata;

  return prisma.agenticTool.update({
    where: { id },
    data,
  });
}

/**
 * Updates agentic tool status
 */
export async function updateAgenticToolStatus(
  id: string,
  status: AgenticToolStatus
): Promise<AgenticTool> {
  return prisma.agenticTool.update({
    where: { id },
    data: { status },
  });
}

// =============================================================================
// Agentic Tool - Delete Operations
// =============================================================================

/**
 * Deletes an agentic tool (cascades to executions)
 */
export async function deleteAgenticTool(id: string): Promise<AgenticTool> {
  return prisma.agenticTool.delete({
    where: { id },
  });
}

/**
 * Soft-disables an agentic tool
 */
export async function disableAgenticTool(id: string): Promise<AgenticTool> {
  return prisma.agenticTool.update({
    where: { id },
    data: { status: AgenticToolStatus.disabled },
  });
}

// =============================================================================
// Agentic Tool Execution - Create Operations
// =============================================================================

/**
 * Creates a new agentic tool execution record
 */
export async function createAgenticToolExecution(
  input: CreateAgenticToolExecutionDbInput
): Promise<AgenticToolExecution> {
  return prisma.agenticToolExecution.create({
    data: {
      agenticToolId: input.agenticToolId,
      tenantId: input.tenantId,
      parentRequest: input.parentRequest,
      llmCalls: input.llmCalls ?? [],
      toolCalls: input.toolCalls ?? [],
      result: input.result,
      status: input.status,
      error: input.error,
      totalCost: input.totalCost ?? 0,
      totalTokens: input.totalTokens ?? 0,
      durationMs: input.durationMs ?? 0,
      traceId: input.traceId,
      completedAt: input.completedAt,
    },
  });
}

// =============================================================================
// Agentic Tool Execution - Read Operations
// =============================================================================

/**
 * Finds an execution by ID
 */
export async function findAgenticToolExecutionById(
  id: string
): Promise<AgenticToolExecution | null> {
  return prisma.agenticToolExecution.findUnique({
    where: { id },
  });
}

/**
 * Finds executions for an agentic tool with pagination
 */
export async function findExecutionsByAgenticTool(
  agenticToolId: string,
  pagination: { cursor?: string; limit?: number } = {}
): Promise<{
  executions: AgenticToolExecution[];
  nextCursor: string | null;
  totalCount: number;
}> {
  const { cursor, limit = 20 } = pagination;

  const totalCount = await prisma.agenticToolExecution.count({
    where: { agenticToolId },
  });

  const executions = await prisma.agenticToolExecution.findMany({
    where: { agenticToolId },
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

  return {
    executions,
    nextCursor,
    totalCount,
  };
}

/**
 * Finds executions for a tenant with pagination
 */
export async function findExecutionsByTenant(
  tenantId: string,
  pagination: { cursor?: string; limit?: number } = {}
): Promise<{
  executions: AgenticToolExecution[];
  nextCursor: string | null;
  totalCount: number;
}> {
  const { cursor, limit = 20 } = pagination;

  const totalCount = await prisma.agenticToolExecution.count({
    where: { tenantId },
  });

  const executions = await prisma.agenticToolExecution.findMany({
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

  return {
    executions,
    nextCursor,
    totalCount,
  };
}

// =============================================================================
// Agentic Tool Execution - Update Operations
// =============================================================================

/**
 * Updates an agentic tool execution
 */
export async function updateAgenticToolExecution(
  id: string,
  input: UpdateAgenticToolExecutionDbInput
): Promise<AgenticToolExecution> {
  const data: Prisma.AgenticToolExecutionUpdateInput = {};

  if (input.llmCalls !== undefined) data.llmCalls = input.llmCalls;
  if (input.toolCalls !== undefined) data.toolCalls = input.toolCalls;
  if (input.result !== undefined) data.result = input.result;
  if (input.status !== undefined) data.status = input.status;
  if (input.error !== undefined) data.error = input.error;
  if (input.totalCost !== undefined) data.totalCost = input.totalCost;
  if (input.totalTokens !== undefined) data.totalTokens = input.totalTokens;
  if (input.durationMs !== undefined) data.durationMs = input.durationMs;
  if (input.completedAt !== undefined) data.completedAt = input.completedAt;

  return prisma.agenticToolExecution.update({
    where: { id },
    data,
  });
}

// =============================================================================
// Statistics
// =============================================================================

/**
 * Gets agentic tool counts by status for a tenant
 */
export async function getAgenticToolCountsByStatus(
  tenantId: string
): Promise<Record<AgenticToolStatus, number>> {
  const counts = await prisma.agenticTool.groupBy({
    by: ['status'],
    where: { tenantId },
    _count: true,
  });

  // Initialize all statuses to 0
  const result: Record<AgenticToolStatus, number> = {
    [AgenticToolStatus.draft]: 0,
    [AgenticToolStatus.active]: 0,
    [AgenticToolStatus.disabled]: 0,
  };

  // Fill in actual counts
  for (const item of counts) {
    result[item.status] = item._count;
  }

  return result;
}

/**
 * Gets execution statistics for an agentic tool
 */
export async function getAgenticToolExecutionStats(agenticToolId: string): Promise<{
  totalExecutions: number;
  successCount: number;
  errorCount: number;
  timeoutCount: number;
  avgDurationMs: number;
  totalCost: number;
  totalTokens: number;
}> {
  const stats = await prisma.agenticToolExecution.aggregate({
    where: { agenticToolId },
    _count: true,
    _avg: {
      durationMs: true,
    },
    _sum: {
      totalCost: true,
      totalTokens: true,
    },
  });

  const statusCounts = await prisma.agenticToolExecution.groupBy({
    by: ['status'],
    where: { agenticToolId },
    _count: true,
  });

  const countByStatus: Record<string, number> = {};
  for (const item of statusCounts) {
    countByStatus[item.status] = item._count;
  }

  return {
    totalExecutions: stats._count,
    successCount: countByStatus[AgenticToolExecutionStatus.success] ?? 0,
    errorCount: countByStatus[AgenticToolExecutionStatus.error] ?? 0,
    timeoutCount: countByStatus[AgenticToolExecutionStatus.timeout] ?? 0,
    avgDurationMs: Math.round(stats._avg.durationMs ?? 0),
    totalCost: Number(stats._sum.totalCost ?? 0),
    totalTokens: stats._sum.totalTokens ?? 0,
  };
}
