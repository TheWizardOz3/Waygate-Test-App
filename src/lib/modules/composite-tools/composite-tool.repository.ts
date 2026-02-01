/**
 * Composite Tool Repository
 *
 * Data access layer for CompositeTool, CompositeToolOperation, and RoutingRule models.
 * Handles CRUD operations and queries for composite tool definitions.
 *
 * Composite tools are scoped to tenants for data isolation.
 */

import { prisma } from '@/lib/db/client';
import {
  CompositeToolRoutingMode,
  CompositeToolStatus,
  RoutingConditionType,
  Prisma,
} from '@prisma/client';

import type { CompositeTool, CompositeToolOperation, RoutingRule } from '@prisma/client';
import type { CompositeToolFilters } from './composite-tool.schemas';

// =============================================================================
// Types
// =============================================================================

/**
 * Input for creating a new composite tool (repository layer)
 */
export interface CreateCompositeToolDbInput {
  tenantId: string;
  name: string;
  slug: string;
  description?: string;
  routingMode: CompositeToolRoutingMode;
  defaultOperationId?: string;
  unifiedInputSchema?: Prisma.InputJsonValue;
  toolDescription?: string;
  toolSuccessTemplate?: string;
  toolErrorTemplate?: string;
  status?: CompositeToolStatus;
  metadata?: Prisma.InputJsonValue;
}

/**
 * Input for updating a composite tool (repository layer)
 */
export interface UpdateCompositeToolDbInput {
  name?: string;
  slug?: string;
  description?: string | null;
  routingMode?: CompositeToolRoutingMode;
  defaultOperationId?: string | null;
  unifiedInputSchema?: Prisma.InputJsonValue;
  toolDescription?: string | null;
  toolSuccessTemplate?: string | null;
  toolErrorTemplate?: string | null;
  status?: CompositeToolStatus;
  metadata?: Prisma.InputJsonValue;
}

/**
 * Input for creating an operation (repository layer)
 */
export interface CreateOperationDbInput {
  compositeToolId: string;
  actionId: string;
  operationSlug: string;
  displayName: string;
  parameterMapping?: Prisma.InputJsonValue;
  priority?: number;
}

/**
 * Input for updating an operation (repository layer)
 */
export interface UpdateOperationDbInput {
  operationSlug?: string;
  displayName?: string;
  parameterMapping?: Prisma.InputJsonValue;
  priority?: number;
}

/**
 * Input for creating a routing rule (repository layer)
 */
export interface CreateRoutingRuleDbInput {
  compositeToolId: string;
  operationId: string;
  conditionType: RoutingConditionType;
  conditionField: string;
  conditionValue: string;
  caseSensitive?: boolean;
  priority?: number;
}

/**
 * Input for updating a routing rule (repository layer)
 */
export interface UpdateRoutingRuleDbInput {
  operationId?: string;
  conditionType?: RoutingConditionType;
  conditionField?: string;
  conditionValue?: string;
  caseSensitive?: boolean;
  priority?: number;
}

/**
 * Pagination options
 */
export interface CompositeToolPaginationOptions {
  cursor?: string;
  limit?: number;
}

/**
 * Paginated result
 */
export interface PaginatedCompositeTools {
  compositeTools: CompositeTool[];
  nextCursor: string | null;
  totalCount: number;
}

/**
 * Composite tool with related data
 */
/**
 * Operation with action details for navigation
 */
export interface CompositeToolOperationWithAction extends CompositeToolOperation {
  action: {
    id: string;
    name: string;
    slug: string;
    integrationId: string;
    integration: {
      id: string;
      name: string;
      slug: string;
    };
  };
}

export interface CompositeToolWithRelations extends CompositeTool {
  operations: CompositeToolOperationWithAction[];
  routingRules: RoutingRule[];
}

/**
 * Composite tool with operation count
 */
export interface CompositeToolWithCounts extends CompositeTool {
  _count: {
    operations: number;
    routingRules: number;
  };
}

// =============================================================================
// Composite Tool - Create Operations
// =============================================================================

/**
 * Creates a new composite tool
 */
export async function createCompositeTool(
  input: CreateCompositeToolDbInput
): Promise<CompositeTool> {
  return prisma.compositeTool.create({
    data: {
      tenantId: input.tenantId,
      name: input.name,
      slug: input.slug,
      description: input.description,
      routingMode: input.routingMode,
      defaultOperationId: input.defaultOperationId,
      unifiedInputSchema: input.unifiedInputSchema ?? {},
      toolDescription: input.toolDescription,
      toolSuccessTemplate: input.toolSuccessTemplate,
      toolErrorTemplate: input.toolErrorTemplate,
      status: input.status ?? CompositeToolStatus.draft,
      metadata: input.metadata ?? {},
    },
  });
}

// =============================================================================
// Composite Tool - Read Operations
// =============================================================================

/**
 * Finds a composite tool by ID
 */
export async function findCompositeToolById(id: string): Promise<CompositeTool | null> {
  return prisma.compositeTool.findUnique({
    where: { id },
  });
}

/**
 * Finds a composite tool by ID with tenant verification
 */
export async function findCompositeToolByIdAndTenant(
  id: string,
  tenantId: string
): Promise<CompositeTool | null> {
  return prisma.compositeTool.findFirst({
    where: {
      id,
      tenantId,
    },
  });
}

/**
 * Finds a composite tool by ID with all relations
 */
export async function findCompositeToolWithRelations(
  id: string,
  tenantId: string
): Promise<CompositeToolWithRelations | null> {
  return prisma.compositeTool.findFirst({
    where: {
      id,
      tenantId,
    },
    include: {
      operations: {
        orderBy: { priority: 'asc' },
        include: {
          action: {
            select: {
              id: true,
              name: true,
              slug: true,
              integrationId: true,
              integration: {
                select: {
                  id: true,
                  name: true,
                  slug: true,
                },
              },
            },
          },
        },
      },
      routingRules: {
        orderBy: { priority: 'asc' },
      },
    },
  });
}

/**
 * Finds a composite tool by slug within a tenant
 */
export async function findCompositeToolBySlug(
  tenantId: string,
  slug: string
): Promise<CompositeTool | null> {
  return prisma.compositeTool.findFirst({
    where: {
      tenantId,
      slug,
    },
  });
}

/**
 * Finds a composite tool by slug with all relations
 */
export async function findCompositeToolBySlugWithRelations(
  tenantId: string,
  slug: string
): Promise<CompositeToolWithRelations | null> {
  return prisma.compositeTool.findFirst({
    where: {
      tenantId,
      slug,
    },
    include: {
      operations: {
        orderBy: { priority: 'asc' },
        include: {
          action: {
            select: {
              id: true,
              name: true,
              slug: true,
              integrationId: true,
              integration: {
                select: {
                  id: true,
                  name: true,
                  slug: true,
                },
              },
            },
          },
        },
      },
      routingRules: {
        orderBy: { priority: 'asc' },
      },
    },
  });
}

/**
 * Queries composite tools with filters and pagination
 */
export async function findCompositeToolsPaginated(
  tenantId: string,
  pagination: CompositeToolPaginationOptions = {},
  filters: CompositeToolFilters = {}
): Promise<PaginatedCompositeTools> {
  const { cursor, limit = 20 } = pagination;

  // Build where clause
  const where: Prisma.CompositeToolWhereInput = {
    tenantId,
  };

  if (filters.status) {
    where.status = filters.status as CompositeToolStatus;
  }

  if (filters.routingMode) {
    where.routingMode = filters.routingMode as CompositeToolRoutingMode;
  }

  if (filters.search) {
    where.OR = [
      { name: { contains: filters.search, mode: 'insensitive' } },
      { slug: { contains: filters.search, mode: 'insensitive' } },
      { description: { contains: filters.search, mode: 'insensitive' } },
    ];
  }

  // Get total count
  const totalCount = await prisma.compositeTool.count({ where });

  // Get composite tools with cursor pagination
  const compositeTools = await prisma.compositeTool.findMany({
    where,
    take: limit + 1,
    orderBy: { createdAt: 'desc' },
    ...(cursor && {
      cursor: { id: cursor },
      skip: 1,
    }),
  });

  // Determine if there are more results
  const hasMore = compositeTools.length > limit;
  if (hasMore) {
    compositeTools.pop();
  }

  // Get next cursor
  const nextCursor =
    hasMore && compositeTools.length > 0 ? compositeTools[compositeTools.length - 1].id : null;

  return {
    compositeTools,
    nextCursor,
    totalCount,
  };
}

/**
 * Gets all composite tools for a tenant (no pagination)
 */
export async function findAllCompositeToolsForTenant(tenantId: string): Promise<CompositeTool[]> {
  return prisma.compositeTool.findMany({
    where: { tenantId },
    orderBy: { name: 'asc' },
  });
}

/**
 * Gets composite tools with their operation counts
 */
export async function findCompositeToolsWithCounts(
  tenantId: string,
  pagination: CompositeToolPaginationOptions = {}
): Promise<{
  compositeTools: CompositeToolWithCounts[];
  nextCursor: string | null;
  totalCount: number;
}> {
  const { cursor, limit = 20 } = pagination;

  const totalCount = await prisma.compositeTool.count({ where: { tenantId } });

  const compositeTools = await prisma.compositeTool.findMany({
    where: { tenantId },
    take: limit + 1,
    orderBy: { createdAt: 'desc' },
    include: {
      _count: {
        select: {
          operations: true,
          routingRules: true,
        },
      },
    },
    ...(cursor && {
      cursor: { id: cursor },
      skip: 1,
    }),
  });

  const hasMore = compositeTools.length > limit;
  if (hasMore) {
    compositeTools.pop();
  }

  const nextCursor =
    hasMore && compositeTools.length > 0 ? compositeTools[compositeTools.length - 1].id : null;

  return {
    compositeTools,
    nextCursor,
    totalCount,
  };
}

/**
 * Checks if a slug is already used by another composite tool in the tenant
 */
export async function isCompositeToolSlugTaken(
  tenantId: string,
  slug: string,
  excludeId?: string
): Promise<boolean> {
  const existing = await prisma.compositeTool.findFirst({
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
// Composite Tool - Update Operations
// =============================================================================

/**
 * Updates a composite tool
 */
export async function updateCompositeTool(
  id: string,
  input: UpdateCompositeToolDbInput
): Promise<CompositeTool> {
  const data: Prisma.CompositeToolUpdateInput = {};

  if (input.name !== undefined) data.name = input.name;
  if (input.slug !== undefined) data.slug = input.slug;
  if (input.description !== undefined) data.description = input.description;
  if (input.routingMode !== undefined) data.routingMode = input.routingMode;
  if (input.defaultOperationId !== undefined) {
    if (input.defaultOperationId === null) {
      data.defaultOperation = { disconnect: true };
    } else {
      data.defaultOperation = { connect: { id: input.defaultOperationId } };
    }
  }
  if (input.unifiedInputSchema !== undefined) data.unifiedInputSchema = input.unifiedInputSchema;
  if (input.toolDescription !== undefined) data.toolDescription = input.toolDescription;
  if (input.toolSuccessTemplate !== undefined) data.toolSuccessTemplate = input.toolSuccessTemplate;
  if (input.toolErrorTemplate !== undefined) data.toolErrorTemplate = input.toolErrorTemplate;
  if (input.status !== undefined) data.status = input.status;
  if (input.metadata !== undefined) data.metadata = input.metadata;

  return prisma.compositeTool.update({
    where: { id },
    data,
  });
}

/**
 * Updates composite tool status
 */
export async function updateCompositeToolStatus(
  id: string,
  status: CompositeToolStatus
): Promise<CompositeTool> {
  return prisma.compositeTool.update({
    where: { id },
    data: { status },
  });
}

// =============================================================================
// Composite Tool - Delete Operations
// =============================================================================

/**
 * Deletes a composite tool (cascades to operations and routing rules)
 */
export async function deleteCompositeTool(id: string): Promise<CompositeTool> {
  return prisma.compositeTool.delete({
    where: { id },
  });
}

/**
 * Soft-disables a composite tool
 */
export async function disableCompositeTool(id: string): Promise<CompositeTool> {
  return prisma.compositeTool.update({
    where: { id },
    data: { status: CompositeToolStatus.disabled },
  });
}

// =============================================================================
// Operation - Create Operations
// =============================================================================

/**
 * Creates a new operation within a composite tool
 */
export async function createOperation(
  input: CreateOperationDbInput
): Promise<CompositeToolOperation> {
  return prisma.compositeToolOperation.create({
    data: {
      compositeToolId: input.compositeToolId,
      actionId: input.actionId,
      operationSlug: input.operationSlug,
      displayName: input.displayName,
      parameterMapping: input.parameterMapping ?? {},
      priority: input.priority ?? 0,
    },
  });
}

/**
 * Creates multiple operations in a transaction
 */
export async function createOperationsBatch(
  inputs: CreateOperationDbInput[]
): Promise<CompositeToolOperation[]> {
  return prisma.$transaction(
    inputs.map((input) =>
      prisma.compositeToolOperation.create({
        data: {
          compositeToolId: input.compositeToolId,
          actionId: input.actionId,
          operationSlug: input.operationSlug,
          displayName: input.displayName,
          parameterMapping: input.parameterMapping ?? {},
          priority: input.priority ?? 0,
        },
      })
    )
  );
}

// =============================================================================
// Operation - Read Operations
// =============================================================================

/**
 * Finds an operation by ID
 */
export async function findOperationById(id: string): Promise<CompositeToolOperation | null> {
  return prisma.compositeToolOperation.findUnique({
    where: { id },
  });
}

/**
 * Finds an operation by slug within a composite tool
 */
export async function findOperationBySlug(
  compositeToolId: string,
  operationSlug: string
): Promise<CompositeToolOperation | null> {
  return prisma.compositeToolOperation.findFirst({
    where: {
      compositeToolId,
      operationSlug,
    },
  });
}

/**
 * Finds all operations for a composite tool
 */
export async function findOperationsByCompositeTool(
  compositeToolId: string
): Promise<CompositeToolOperation[]> {
  return prisma.compositeToolOperation.findMany({
    where: { compositeToolId },
    orderBy: { priority: 'asc' },
  });
}

/**
 * Checks if an operation slug is already used within a composite tool
 */
export async function isOperationSlugTaken(
  compositeToolId: string,
  operationSlug: string,
  excludeId?: string
): Promise<boolean> {
  const existing = await prisma.compositeToolOperation.findFirst({
    where: {
      compositeToolId,
      operationSlug,
      ...(excludeId && { id: { not: excludeId } }),
    },
    select: { id: true },
  });
  return existing !== null;
}

/**
 * Counts operations for a composite tool
 */
export async function countOperations(compositeToolId: string): Promise<number> {
  return prisma.compositeToolOperation.count({
    where: { compositeToolId },
  });
}

/**
 * Finds composite tools that use a specific action
 * Used to display "Used in AI Tools" on action detail pages
 */
export async function findCompositeToolsUsingAction(
  actionId: string,
  tenantId: string
): Promise<CompositeTool[]> {
  const operations = await prisma.compositeToolOperation.findMany({
    where: {
      actionId,
      compositeTool: {
        tenantId,
      },
    },
    include: {
      compositeTool: true,
    },
  });

  // Return unique composite tools
  const toolMap = new Map<string, CompositeTool>();
  for (const op of operations) {
    if (!toolMap.has(op.compositeTool.id)) {
      toolMap.set(op.compositeTool.id, op.compositeTool);
    }
  }
  return Array.from(toolMap.values());
}

/**
 * Finds composite tools that use any action from a specific integration
 * Used to display "Used in AI Tools" on integration detail pages
 */
export async function findCompositeToolsUsingIntegration(
  integrationId: string,
  tenantId: string
): Promise<CompositeTool[]> {
  const operations = await prisma.compositeToolOperation.findMany({
    where: {
      action: {
        integrationId,
      },
      compositeTool: {
        tenantId,
      },
    },
    include: {
      compositeTool: true,
    },
  });

  // Return unique composite tools
  const toolMap = new Map<string, CompositeTool>();
  for (const op of operations) {
    if (!toolMap.has(op.compositeTool.id)) {
      toolMap.set(op.compositeTool.id, op.compositeTool);
    }
  }
  return Array.from(toolMap.values());
}

/**
 * Counts composite tools that use any action from a specific integration
 */
export async function countCompositeToolsUsingIntegration(
  integrationId: string,
  tenantId: string
): Promise<number> {
  const operations = await prisma.compositeToolOperation.findMany({
    where: {
      action: {
        integrationId,
      },
      compositeTool: {
        tenantId,
      },
    },
    select: {
      compositeToolId: true,
    },
    distinct: ['compositeToolId'],
  });

  return operations.length;
}

// =============================================================================
// Operation - Update Operations
// =============================================================================

/**
 * Updates an operation
 */
export async function updateOperation(
  id: string,
  input: UpdateOperationDbInput
): Promise<CompositeToolOperation> {
  const data: Prisma.CompositeToolOperationUpdateInput = {};

  if (input.operationSlug !== undefined) data.operationSlug = input.operationSlug;
  if (input.displayName !== undefined) data.displayName = input.displayName;
  if (input.parameterMapping !== undefined) data.parameterMapping = input.parameterMapping;
  if (input.priority !== undefined) data.priority = input.priority;

  return prisma.compositeToolOperation.update({
    where: { id },
    data,
  });
}

// =============================================================================
// Operation - Delete Operations
// =============================================================================

/**
 * Deletes an operation
 */
export async function deleteOperation(id: string): Promise<CompositeToolOperation> {
  return prisma.compositeToolOperation.delete({
    where: { id },
  });
}

// =============================================================================
// Routing Rule - Create Operations
// =============================================================================

/**
 * Creates a new routing rule
 */
export async function createRoutingRule(input: CreateRoutingRuleDbInput): Promise<RoutingRule> {
  return prisma.routingRule.create({
    data: {
      compositeToolId: input.compositeToolId,
      operationId: input.operationId,
      conditionType: input.conditionType,
      conditionField: input.conditionField,
      conditionValue: input.conditionValue,
      caseSensitive: input.caseSensitive ?? false,
      priority: input.priority ?? 0,
    },
  });
}

/**
 * Creates multiple routing rules in a transaction
 */
export async function createRoutingRulesBatch(
  inputs: CreateRoutingRuleDbInput[]
): Promise<RoutingRule[]> {
  return prisma.$transaction(
    inputs.map((input) =>
      prisma.routingRule.create({
        data: {
          compositeToolId: input.compositeToolId,
          operationId: input.operationId,
          conditionType: input.conditionType,
          conditionField: input.conditionField,
          conditionValue: input.conditionValue,
          caseSensitive: input.caseSensitive ?? false,
          priority: input.priority ?? 0,
        },
      })
    )
  );
}

// =============================================================================
// Routing Rule - Read Operations
// =============================================================================

/**
 * Finds a routing rule by ID
 */
export async function findRoutingRuleById(id: string): Promise<RoutingRule | null> {
  return prisma.routingRule.findUnique({
    where: { id },
  });
}

/**
 * Finds all routing rules for a composite tool (ordered by priority)
 */
export async function findRoutingRulesByCompositeTool(
  compositeToolId: string
): Promise<RoutingRule[]> {
  return prisma.routingRule.findMany({
    where: { compositeToolId },
    orderBy: { priority: 'asc' },
  });
}

/**
 * Finds routing rules for an operation
 */
export async function findRoutingRulesByOperation(operationId: string): Promise<RoutingRule[]> {
  return prisma.routingRule.findMany({
    where: { operationId },
    orderBy: { priority: 'asc' },
  });
}

// =============================================================================
// Routing Rule - Update Operations
// =============================================================================

/**
 * Updates a routing rule
 */
export async function updateRoutingRule(
  id: string,
  input: UpdateRoutingRuleDbInput
): Promise<RoutingRule> {
  const data: Prisma.RoutingRuleUpdateInput = {};

  if (input.operationId !== undefined) {
    data.operation = { connect: { id: input.operationId } };
  }
  if (input.conditionType !== undefined) data.conditionType = input.conditionType;
  if (input.conditionField !== undefined) data.conditionField = input.conditionField;
  if (input.conditionValue !== undefined) data.conditionValue = input.conditionValue;
  if (input.caseSensitive !== undefined) data.caseSensitive = input.caseSensitive;
  if (input.priority !== undefined) data.priority = input.priority;

  return prisma.routingRule.update({
    where: { id },
    data,
  });
}

// =============================================================================
// Routing Rule - Delete Operations
// =============================================================================

/**
 * Deletes a routing rule
 */
export async function deleteRoutingRule(id: string): Promise<RoutingRule> {
  return prisma.routingRule.delete({
    where: { id },
  });
}

/**
 * Deletes all routing rules for a composite tool
 */
export async function deleteRoutingRulesByCompositeTool(
  compositeToolId: string
): Promise<{ count: number }> {
  return prisma.routingRule.deleteMany({
    where: { compositeToolId },
  });
}

// =============================================================================
// Statistics
// =============================================================================

/**
 * Gets composite tool counts by status for a tenant
 */
export async function getCompositeToolCountsByStatus(
  tenantId: string
): Promise<Record<CompositeToolStatus, number>> {
  const counts = await prisma.compositeTool.groupBy({
    by: ['status'],
    where: { tenantId },
    _count: true,
  });

  // Initialize all statuses to 0
  const result: Record<CompositeToolStatus, number> = {
    [CompositeToolStatus.draft]: 0,
    [CompositeToolStatus.active]: 0,
    [CompositeToolStatus.disabled]: 0,
  };

  // Fill in actual counts
  for (const item of counts) {
    result[item.status] = item._count;
  }

  return result;
}
