/**
 * Unified Tool Service
 *
 * Service for aggregating and querying tools from all sources:
 * - Simple Tools (Actions with tool export enhancements)
 * - Composite Tools
 * - Agentic Tools
 */

import { prisma } from '@/lib/db/client';
import { CompositeToolStatus, AgenticToolStatus } from '@prisma/client';
import type {
  Action,
  CompositeTool,
  AgenticTool,
  CompositeToolOperation,
  Prisma,
} from '@prisma/client';
import type {
  UnifiedTool,
  UnifiedToolFilters,
  UnifiedToolPagination,
  PaginatedUnifiedTools,
  ToolType,
} from './unified-tool.types';

// =============================================================================
// Types
// =============================================================================

interface ListToolsOptions {
  tenantId: string;
  filters?: UnifiedToolFilters;
  pagination?: UnifiedToolPagination;
}

// =============================================================================
// Service
// =============================================================================

/**
 * List unified tools from all sources based on filters.
 * Aggregates simple tools (actions), composite tools, and agentic tools.
 */
export async function listUnifiedTools(options: ListToolsOptions): Promise<PaginatedUnifiedTools> {
  const { tenantId, filters = {}, pagination = { limit: 50 } } = options;
  const { types, integrationId, search, status, excludeIds } = filters;
  const { limit } = pagination;

  // Determine which tool types to fetch
  const fetchSimple = !types || types.includes('simple');
  const fetchComposite = !types || types.includes('composite');
  const fetchAgentic = !types || types.includes('agentic');

  // Build status filter
  const statusFilter = status ?? ['active', 'draft', 'disabled'];

  // Fetch tools from each source in parallel
  const [simpleTools, compositeTools, agenticTools] = await Promise.all([
    fetchSimple
      ? fetchSimpleTools(tenantId, { integrationId, search, status: statusFilter, excludeIds })
      : [],
    fetchComposite
      ? fetchCompositeTools(tenantId, { search, status: statusFilter, excludeIds })
      : [],
    fetchAgentic ? fetchAgenticTools(tenantId, { search, status: statusFilter, excludeIds }) : [],
  ]);

  // Combine and sort by name
  let allTools = [...simpleTools, ...compositeTools, ...agenticTools];
  allTools.sort((a, b) => a.name.localeCompare(b.name));

  // Apply global exclusions if provided
  if (excludeIds && excludeIds.length > 0) {
    allTools = allTools.filter((tool) => !excludeIds.includes(tool.id));
  }

  // Calculate pagination
  const totalCount = allTools.length;
  const hasMore = totalCount > limit;
  const tools = allTools.slice(0, limit);

  return {
    tools,
    pagination: {
      cursor: hasMore ? (tools[tools.length - 1]?.id ?? null) : null,
      hasMore,
      totalCount,
    },
  };
}

/**
 * Get a single unified tool by ID and type
 */
export async function getUnifiedToolById(
  tenantId: string,
  toolId: string,
  toolType: ToolType
): Promise<UnifiedTool | null> {
  switch (toolType) {
    case 'simple':
      return getSimpleToolById(tenantId, toolId);
    case 'composite':
      return getCompositeToolById(tenantId, toolId);
    case 'agentic':
      return getAgenticToolById(tenantId, toolId);
    default:
      return null;
  }
}

// =============================================================================
// Simple Tools (Actions)
// =============================================================================

interface SimpleToolFilters {
  integrationId?: string;
  search?: string;
  status: string[];
  excludeIds?: string[];
}

async function fetchSimpleTools(
  tenantId: string,
  filters: SimpleToolFilters
): Promise<UnifiedTool[]> {
  const { integrationId, search, excludeIds } = filters;

  // Build where clause for actions
  const where: Prisma.ActionWhereInput = {
    integration: {
      tenantId,
      ...(integrationId ? { id: integrationId } : {}),
    },
    ...(excludeIds && excludeIds.length > 0 ? { id: { notIn: excludeIds } } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { description: { contains: search, mode: 'insensitive' } },
            { slug: { contains: search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  const actions = await prisma.action.findMany({
    where,
    include: {
      integration: {
        select: {
          id: true,
          name: true,
          slug: true,
        },
      },
    },
    orderBy: { name: 'asc' },
    take: 200, // Reasonable limit for aggregation
  });

  return actions.map(actionToUnifiedTool);
}

async function getSimpleToolById(tenantId: string, actionId: string): Promise<UnifiedTool | null> {
  const action = await prisma.action.findFirst({
    where: {
      id: actionId,
      integration: { tenantId },
    },
    include: {
      integration: {
        select: {
          id: true,
          name: true,
          slug: true,
        },
      },
    },
  });

  if (!action) return null;
  return actionToUnifiedTool(action);
}

type ActionWithIntegration = Action & {
  integration: {
    id: string;
    name: string;
    slug: string;
  };
};

function actionToUnifiedTool(action: ActionWithIntegration): UnifiedTool {
  return {
    id: action.id,
    type: 'simple',
    name: action.name,
    slug: action.slug,
    // Prefer AI-optimized toolDescription over basic description
    description: action.toolDescription || action.description || '',
    integrationId: action.integration.id,
    integrationName: action.integration.name,
    integrationSlug: action.integration.slug,
    inputSchema: (action.inputSchema as Record<string, unknown>) ?? {},
    outputSchema: (action.outputSchema as Record<string, unknown>) ?? undefined,
    actionId: action.id,
    actionSlug: action.slug,
    status: 'active', // Actions don't have status; default to active
    createdAt: action.createdAt.toISOString(),
    updatedAt: action.updatedAt.toISOString(),
  };
}

// =============================================================================
// Composite Tools
// =============================================================================

interface CompositeToolFilters {
  search?: string;
  status: string[];
  excludeIds?: string[];
}

async function fetchCompositeTools(
  tenantId: string,
  filters: CompositeToolFilters
): Promise<UnifiedTool[]> {
  const { search, status, excludeIds } = filters;

  const where: Prisma.CompositeToolWhereInput = {
    tenantId,
    status: { in: status as CompositeToolStatus[] },
    ...(excludeIds && excludeIds.length > 0 ? { id: { notIn: excludeIds } } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { description: { contains: search, mode: 'insensitive' } },
            { slug: { contains: search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  const tools = await prisma.compositeTool.findMany({
    where,
    include: {
      operations: {
        select: { id: true },
      },
    },
    orderBy: { name: 'asc' },
    take: 200,
  });

  return tools.map(compositeToolToUnifiedTool);
}

async function getCompositeToolById(tenantId: string, toolId: string): Promise<UnifiedTool | null> {
  const tool = await prisma.compositeTool.findFirst({
    where: {
      id: toolId,
      tenantId,
    },
    include: {
      operations: {
        select: { id: true },
      },
    },
  });

  if (!tool) return null;
  return compositeToolToUnifiedTool(tool);
}

type CompositeToolWithOperations = CompositeTool & {
  operations: Pick<CompositeToolOperation, 'id'>[];
};

function compositeToolToUnifiedTool(tool: CompositeToolWithOperations): UnifiedTool {
  return {
    id: tool.id,
    type: 'composite',
    name: tool.name,
    slug: tool.slug,
    description: tool.toolDescription || tool.description || '',
    inputSchema: (tool.unifiedInputSchema as Record<string, unknown>) ?? {},
    childOperationIds: tool.operations.map((op) => op.id),
    status: tool.status as 'active' | 'draft' | 'disabled',
    createdAt: tool.createdAt.toISOString(),
    updatedAt: tool.updatedAt.toISOString(),
  };
}

// =============================================================================
// Agentic Tools
// =============================================================================

interface AgenticToolFilters {
  search?: string;
  status: string[];
  excludeIds?: string[];
}

async function fetchAgenticTools(
  tenantId: string,
  filters: AgenticToolFilters
): Promise<UnifiedTool[]> {
  const { search, status, excludeIds } = filters;

  const where: Prisma.AgenticToolWhereInput = {
    tenantId,
    status: { in: status as AgenticToolStatus[] },
    ...(excludeIds && excludeIds.length > 0 ? { id: { notIn: excludeIds } } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { description: { contains: search, mode: 'insensitive' } },
            { slug: { contains: search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  const tools = await prisma.agenticTool.findMany({
    where,
    orderBy: { name: 'asc' },
    take: 200,
  });

  return tools.map(agenticToolToUnifiedTool);
}

async function getAgenticToolById(tenantId: string, toolId: string): Promise<UnifiedTool | null> {
  const tool = await prisma.agenticTool.findFirst({
    where: {
      id: toolId,
      tenantId,
    },
  });

  if (!tool) return null;
  return agenticToolToUnifiedTool(tool);
}

function agenticToolToUnifiedTool(tool: AgenticTool): UnifiedTool {
  return {
    id: tool.id,
    type: 'agentic',
    name: tool.name,
    slug: tool.slug,
    description: tool.toolDescription || tool.description || '',
    inputSchema: (tool.inputSchema as Record<string, unknown>) ?? {},
    executionMode: tool.executionMode as 'parameter_interpreter' | 'autonomous_agent',
    status: tool.status as 'active' | 'draft' | 'disabled',
    createdAt: tool.createdAt.toISOString(),
    updatedAt: tool.updatedAt.toISOString(),
  };
}
