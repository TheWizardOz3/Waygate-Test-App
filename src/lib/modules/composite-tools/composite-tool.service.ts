/**
 * Composite Tool Service
 *
 * Business logic layer for composite tool management.
 * Handles CRUD operations with tenant verification and validation.
 *
 * All operations verify tenant ownership before accessing/modifying data.
 */

import {
  CompositeToolRoutingMode,
  CompositeToolStatus,
  Prisma,
  RoutingConditionType,
} from '@prisma/client';
import {
  createCompositeTool as repoCreateCompositeTool,
  findCompositeToolByIdAndTenant,
  findCompositeToolBySlug,
  findCompositeToolWithRelations,
  findCompositeToolBySlugWithRelations,
  findCompositeToolsPaginated,
  findAllCompositeToolsForTenant,
  findCompositeToolsWithCounts,
  isCompositeToolSlugTaken,
  updateCompositeTool as repoUpdateCompositeTool,
  updateCompositeToolStatus,
  deleteCompositeTool as repoDeleteCompositeTool,
  disableCompositeTool as repoDisableCompositeTool,
  getCompositeToolCountsByStatus,
  createOperation as repoCreateOperation,
  createOperationsBatch,
  findOperationById,
  findOperationsByCompositeTool,
  isOperationSlugTaken,
  countOperations,
  updateOperation as repoUpdateOperation,
  deleteOperation as repoDeleteOperation,
  createRoutingRule as repoCreateRoutingRule,
  createRoutingRulesBatch,
  findRoutingRuleById,
  findRoutingRulesByCompositeTool,
  updateRoutingRule as repoUpdateRoutingRule,
  deleteRoutingRule as repoDeleteRoutingRule,
  findCompositeToolsUsingAction,
  findCompositeToolsUsingIntegration,
  countCompositeToolsUsingIntegration,
  type CreateCompositeToolDbInput,
  type UpdateCompositeToolDbInput,
  type CreateOperationDbInput,
  type UpdateOperationDbInput,
  type CreateRoutingRuleDbInput,
  type UpdateRoutingRuleDbInput,
  type CompositeToolPaginationOptions,
} from './composite-tool.repository';
import {
  CreateCompositeToolInputSchema,
  UpdateCompositeToolInputSchema,
  ListCompositeToolsQuerySchema,
  CreateCompositeToolOperationInputSchema,
  UpdateCompositeToolOperationInputSchema,
  CreateRoutingRuleInputSchema,
  UpdateRoutingRuleInputSchema,
  toCompositeToolResponse,
  toOperationResponse,
  toRoutingRuleResponse,
  CompositeToolErrorCodes,
  type CreateCompositeToolInput,
  type UpdateCompositeToolInput,
  type ListCompositeToolsQuery,
  type CompositeToolFilters,
  type CompositeToolResponse,
  type CompositeToolDetailResponse,
  type CompositeToolOperationResponse,
  type RoutingRuleResponse,
  type ListCompositeToolsResponse,
  type CreateCompositeToolOperationInput,
  type UpdateCompositeToolOperationInput,
  type CreateRoutingRuleInput,
  type UpdateRoutingRuleInput,
} from './composite-tool.schemas';
import { findActionByIdWithIntegration } from '../actions/action.repository';

import type { CompositeTool, CompositeToolOperation, RoutingRule } from '@prisma/client';

// Maximum number of operations allowed per composite tool
const MAX_OPERATIONS_PER_TOOL = 20;

// =============================================================================
// Error Class
// =============================================================================

/**
 * Error thrown when composite tool operations fail
 */
export class CompositeToolError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number = 400
  ) {
    super(message);
    this.name = 'CompositeToolError';
  }
}

// =============================================================================
// Composite Tool - Create Operations
// =============================================================================

/**
 * Creates a new composite tool
 *
 * @param tenantId - The tenant creating the composite tool
 * @param input - Composite tool creation data
 * @returns The created composite tool with detail response
 */
export async function createCompositeTool(
  tenantId: string,
  input: CreateCompositeToolInput
): Promise<CompositeToolDetailResponse> {
  // Validate input
  const parsed = CreateCompositeToolInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new CompositeToolError(
      CompositeToolErrorCodes.INVALID_INPUT,
      `Invalid composite tool data: ${parsed.error.message}`
    );
  }

  const data = parsed.data;

  // Check for slug collision
  const slugExists = await isCompositeToolSlugTaken(tenantId, data.slug);
  if (slugExists) {
    throw new CompositeToolError(
      CompositeToolErrorCodes.DUPLICATE_SLUG,
      `A composite tool with slug '${data.slug}' already exists`
    );
  }

  // Validate operations if provided
  if (data.operations && data.operations.length > MAX_OPERATIONS_PER_TOOL) {
    throw new CompositeToolError(
      CompositeToolErrorCodes.MAX_OPERATIONS_EXCEEDED,
      `Maximum ${MAX_OPERATIONS_PER_TOOL} operations allowed per composite tool`
    );
  }

  // Verify all action IDs exist and belong to tenant
  if (data.operations) {
    for (const op of data.operations) {
      const actionWithIntegration = await findActionByIdWithIntegration(op.actionId);
      if (!actionWithIntegration || actionWithIntegration.integration.tenantId !== tenantId) {
        throw new CompositeToolError(
          CompositeToolErrorCodes.ACTION_NOT_FOUND,
          `Action '${op.actionId}' not found`,
          404
        );
      }
    }
  }

  // Create the composite tool
  const dbInput: CreateCompositeToolDbInput = {
    tenantId,
    name: data.name,
    slug: data.slug,
    description: data.description,
    routingMode: data.routingMode as CompositeToolRoutingMode,
    unifiedInputSchema: data.unifiedInputSchema as Prisma.InputJsonValue,
    toolDescription: data.toolDescription,
    toolSuccessTemplate: data.toolSuccessTemplate,
    toolErrorTemplate: data.toolErrorTemplate,
    status: data.status as CompositeToolStatus,
    metadata: data.metadata as Prisma.InputJsonValue,
  };

  const compositeTool = await repoCreateCompositeTool(dbInput);

  // Create operations if provided
  let operations: CompositeToolOperation[] = [];
  if (data.operations && data.operations.length > 0) {
    const operationInputs: CreateOperationDbInput[] = data.operations.map((op, index) => ({
      compositeToolId: compositeTool.id,
      actionId: op.actionId,
      operationSlug: op.operationSlug,
      displayName: op.displayName,
      parameterMapping: op.parameterMapping as Prisma.InputJsonValue,
      priority: op.priority ?? index,
    }));

    operations = await createOperationsBatch(operationInputs);
  }

  // If a default operation slug was specified, find and set it
  if (data.defaultOperationSlug && operations.length > 0) {
    const defaultOp = operations.find((op) => op.operationSlug === data.defaultOperationSlug);
    if (defaultOp) {
      await repoUpdateCompositeTool(compositeTool.id, {
        defaultOperationId: defaultOp.id,
      });
    }
  }

  // Create routing rules if provided
  let routingRules: RoutingRule[] = [];
  if (data.routingRules && data.routingRules.length > 0) {
    // Build a map of operation slugs to IDs for routing rules
    const operationMap = new Map<string, string>();
    for (const op of operations) {
      operationMap.set(op.operationSlug, op.id);
    }

    const ruleInputs: CreateRoutingRuleDbInput[] = data.routingRules
      .map((rule, index) => {
        // The rule.operationId might actually be an operation slug if the tool was just created
        // Check if it's a valid UUID, otherwise treat it as a slug
        const operationId = operationMap.get(rule.operationId) ?? rule.operationId;
        return {
          compositeToolId: compositeTool.id,
          operationId,
          conditionType: rule.conditionType as RoutingConditionType,
          conditionField: rule.conditionField,
          conditionValue: rule.conditionValue,
          caseSensitive: rule.caseSensitive,
          priority: rule.priority ?? index,
        };
      })
      .filter((rule) => rule.operationId);

    if (ruleInputs.length > 0) {
      routingRules = await createRoutingRulesBatch(ruleInputs);
    }
  }

  // Return the full detail response
  const response = toCompositeToolResponse(compositeTool);
  return {
    ...response,
    defaultOperationId: data.defaultOperationSlug
      ? (operations.find((op) => op.operationSlug === data.defaultOperationSlug)?.id ?? null)
      : null,
    operations: operations.map(toOperationResponse),
    routingRules: routingRules.map(toRoutingRuleResponse),
  };
}

// =============================================================================
// Composite Tool - Read Operations
// =============================================================================

/**
 * Gets a composite tool by ID with tenant verification
 */
export async function getCompositeToolById(
  tenantId: string,
  compositeToolId: string
): Promise<CompositeToolResponse> {
  const compositeTool = await findCompositeToolByIdAndTenant(compositeToolId, tenantId);

  if (!compositeTool) {
    throw new CompositeToolError(
      CompositeToolErrorCodes.COMPOSITE_TOOL_NOT_FOUND,
      'Composite tool not found',
      404
    );
  }

  return toCompositeToolResponse(compositeTool);
}

/**
 * Gets a composite tool by ID with all relations
 */
export async function getCompositeToolDetail(
  tenantId: string,
  compositeToolId: string
): Promise<CompositeToolDetailResponse> {
  const compositeTool = await findCompositeToolWithRelations(compositeToolId, tenantId);

  if (!compositeTool) {
    throw new CompositeToolError(
      CompositeToolErrorCodes.COMPOSITE_TOOL_NOT_FOUND,
      'Composite tool not found',
      404
    );
  }

  return {
    ...toCompositeToolResponse(compositeTool),
    operations: compositeTool.operations.map(toOperationResponse),
    routingRules: compositeTool.routingRules.map(toRoutingRuleResponse),
  };
}

/**
 * Gets a composite tool by slug
 */
export async function getCompositeToolBySlug(
  tenantId: string,
  slug: string
): Promise<CompositeToolResponse> {
  const compositeTool = await findCompositeToolBySlug(tenantId, slug);

  if (!compositeTool) {
    throw new CompositeToolError(
      CompositeToolErrorCodes.COMPOSITE_TOOL_NOT_FOUND,
      `Composite tool '${slug}' not found`,
      404
    );
  }

  return toCompositeToolResponse(compositeTool);
}

/**
 * Gets a composite tool by slug with all relations
 */
export async function getCompositeToolBySlugDetail(
  tenantId: string,
  slug: string
): Promise<CompositeToolDetailResponse> {
  const compositeTool = await findCompositeToolBySlugWithRelations(tenantId, slug);

  if (!compositeTool) {
    throw new CompositeToolError(
      CompositeToolErrorCodes.COMPOSITE_TOOL_NOT_FOUND,
      `Composite tool '${slug}' not found`,
      404
    );
  }

  return {
    ...toCompositeToolResponse(compositeTool),
    operations: compositeTool.operations.map(toOperationResponse),
    routingRules: compositeTool.routingRules.map(toRoutingRuleResponse),
  };
}

/**
 * Gets the raw composite tool model (for internal use)
 */
export async function getCompositeToolBySlugRaw(
  tenantId: string,
  slug: string
): Promise<CompositeTool> {
  const compositeTool = await findCompositeToolBySlug(tenantId, slug);

  if (!compositeTool) {
    throw new CompositeToolError(
      CompositeToolErrorCodes.COMPOSITE_TOOL_NOT_FOUND,
      `Composite tool '${slug}' not found`,
      404
    );
  }

  if (compositeTool.status === CompositeToolStatus.disabled) {
    throw new CompositeToolError(
      CompositeToolErrorCodes.COMPOSITE_TOOL_DISABLED,
      `Composite tool '${slug}' is disabled`,
      403
    );
  }

  return compositeTool;
}

/**
 * Lists composite tools with filtering and pagination
 */
export async function listCompositeTools(
  tenantId: string,
  query: Partial<ListCompositeToolsQuery> = {}
): Promise<ListCompositeToolsResponse> {
  // Validate query
  const parsed = ListCompositeToolsQuerySchema.safeParse(query);
  if (!parsed.success) {
    throw new CompositeToolError(
      CompositeToolErrorCodes.INVALID_INPUT,
      `Invalid query parameters: ${parsed.error.message}`
    );
  }

  const { cursor, limit, status, routingMode, search } = parsed.data;

  // Build filters
  const filters: CompositeToolFilters = {};
  if (status) filters.status = status;
  if (routingMode) filters.routingMode = routingMode;
  if (search) filters.search = search;

  // Build pagination options
  const paginationOptions: CompositeToolPaginationOptions = { limit };
  if (cursor) paginationOptions.cursor = cursor;

  // Query
  const result = await findCompositeToolsPaginated(tenantId, paginationOptions, filters);

  return {
    compositeTools: result.compositeTools.map(toCompositeToolResponse),
    pagination: {
      cursor: result.nextCursor,
      hasMore: result.nextCursor !== null,
      totalCount: result.totalCount,
    },
  };
}

/**
 * Gets all composite tools for a tenant (no pagination)
 */
export async function getAllCompositeTools(tenantId: string): Promise<CompositeToolResponse[]> {
  const compositeTools = await findAllCompositeToolsForTenant(tenantId);
  return compositeTools.map(toCompositeToolResponse);
}

/**
 * Gets composite tools with operation counts (for list views)
 */
export async function getCompositeToolsWithCounts(
  tenantId: string,
  query: Partial<ListCompositeToolsQuery> = {}
): Promise<{
  compositeTools: (CompositeToolResponse & { operationCount: number })[];
  pagination: { cursor: string | null; hasMore: boolean; totalCount: number };
}> {
  const parsed = ListCompositeToolsQuerySchema.safeParse(query);
  if (!parsed.success) {
    throw new CompositeToolError(
      CompositeToolErrorCodes.INVALID_INPUT,
      `Invalid query parameters: ${parsed.error.message}`
    );
  }

  const { cursor, limit } = parsed.data;

  const result = await findCompositeToolsWithCounts(tenantId, { cursor, limit });

  return {
    compositeTools: result.compositeTools.map((tool) => ({
      ...toCompositeToolResponse(tool),
      operationCount: tool._count.operations,
    })),
    pagination: {
      cursor: result.nextCursor,
      hasMore: result.nextCursor !== null,
      totalCount: result.totalCount,
    },
  };
}

/**
 * Gets composite tools that use a specific action
 */
export async function getCompositeToolsForAction(
  tenantId: string,
  actionId: string
): Promise<CompositeToolResponse[]> {
  const compositeTools = await findCompositeToolsUsingAction(actionId, tenantId);
  return compositeTools.map(toCompositeToolResponse);
}

/**
 * Gets composite tools that use any action from a specific integration
 */
export async function getCompositeToolsForIntegration(
  tenantId: string,
  integrationId: string
): Promise<CompositeToolResponse[]> {
  const compositeTools = await findCompositeToolsUsingIntegration(integrationId, tenantId);
  return compositeTools.map(toCompositeToolResponse);
}

/**
 * Counts composite tools that use any action from a specific integration
 */
export async function getCompositeToolCountForIntegration(
  tenantId: string,
  integrationId: string
): Promise<number> {
  return countCompositeToolsUsingIntegration(integrationId, tenantId);
}

// =============================================================================
// Composite Tool - Update Operations
// =============================================================================

/**
 * Updates a composite tool
 */
export async function updateCompositeTool(
  tenantId: string,
  compositeToolId: string,
  input: UpdateCompositeToolInput
): Promise<CompositeToolResponse> {
  // Validate input
  const parsed = UpdateCompositeToolInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new CompositeToolError(
      CompositeToolErrorCodes.INVALID_INPUT,
      `Invalid composite tool data: ${parsed.error.message}`
    );
  }

  const data = parsed.data;

  // Verify composite tool exists and belongs to tenant
  const existing = await findCompositeToolByIdAndTenant(compositeToolId, tenantId);
  if (!existing) {
    throw new CompositeToolError(
      CompositeToolErrorCodes.COMPOSITE_TOOL_NOT_FOUND,
      'Composite tool not found',
      404
    );
  }

  // Check for slug collision if slug is being changed
  if (data.slug && data.slug !== existing.slug) {
    const slugExists = await isCompositeToolSlugTaken(tenantId, data.slug, compositeToolId);
    if (slugExists) {
      throw new CompositeToolError(
        CompositeToolErrorCodes.DUPLICATE_SLUG,
        `A composite tool with slug '${data.slug}' already exists`
      );
    }
  }

  // Build update input
  const updateInput: UpdateCompositeToolDbInput = {};
  if (data.name !== undefined) updateInput.name = data.name;
  if (data.slug !== undefined) updateInput.slug = data.slug;
  if (data.description !== undefined) updateInput.description = data.description;
  if (data.routingMode !== undefined)
    updateInput.routingMode = data.routingMode as CompositeToolRoutingMode;
  if (data.defaultOperationId !== undefined)
    updateInput.defaultOperationId = data.defaultOperationId;
  if (data.unifiedInputSchema !== undefined)
    updateInput.unifiedInputSchema = data.unifiedInputSchema as Prisma.InputJsonValue;
  if (data.toolDescription !== undefined) updateInput.toolDescription = data.toolDescription;
  if (data.toolSuccessTemplate !== undefined)
    updateInput.toolSuccessTemplate = data.toolSuccessTemplate;
  if (data.toolErrorTemplate !== undefined) updateInput.toolErrorTemplate = data.toolErrorTemplate;
  if (data.status !== undefined) updateInput.status = data.status as CompositeToolStatus;
  if (data.metadata !== undefined) updateInput.metadata = data.metadata as Prisma.InputJsonValue;

  const updated = await repoUpdateCompositeTool(compositeToolId, updateInput);

  return toCompositeToolResponse(updated);
}

/**
 * Activates a composite tool
 */
export async function activateCompositeTool(
  tenantId: string,
  compositeToolId: string
): Promise<CompositeToolResponse> {
  const existing = await findCompositeToolByIdAndTenant(compositeToolId, tenantId);
  if (!existing) {
    throw new CompositeToolError(
      CompositeToolErrorCodes.COMPOSITE_TOOL_NOT_FOUND,
      'Composite tool not found',
      404
    );
  }

  const updated = await updateCompositeToolStatus(compositeToolId, CompositeToolStatus.active);

  return toCompositeToolResponse(updated);
}

// =============================================================================
// Composite Tool - Delete Operations
// =============================================================================

/**
 * Deletes a composite tool
 */
export async function deleteCompositeTool(
  tenantId: string,
  compositeToolId: string
): Promise<void> {
  const existing = await findCompositeToolByIdAndTenant(compositeToolId, tenantId);
  if (!existing) {
    throw new CompositeToolError(
      CompositeToolErrorCodes.COMPOSITE_TOOL_NOT_FOUND,
      'Composite tool not found',
      404
    );
  }

  await repoDeleteCompositeTool(compositeToolId);
}

/**
 * Disables a composite tool (soft delete)
 */
export async function disableCompositeTool(
  tenantId: string,
  compositeToolId: string
): Promise<CompositeToolResponse> {
  const existing = await findCompositeToolByIdAndTenant(compositeToolId, tenantId);
  if (!existing) {
    throw new CompositeToolError(
      CompositeToolErrorCodes.COMPOSITE_TOOL_NOT_FOUND,
      'Composite tool not found',
      404
    );
  }

  const updated = await repoDisableCompositeTool(compositeToolId);

  return toCompositeToolResponse(updated);
}

// =============================================================================
// Operation - CRUD Operations
// =============================================================================

/**
 * Adds an operation to a composite tool
 */
export async function addOperation(
  tenantId: string,
  compositeToolId: string,
  input: CreateCompositeToolOperationInput
): Promise<CompositeToolOperationResponse> {
  // Validate input
  const parsed = CreateCompositeToolOperationInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new CompositeToolError(
      CompositeToolErrorCodes.INVALID_INPUT,
      `Invalid operation data: ${parsed.error.message}`
    );
  }

  const data = parsed.data;

  // Verify composite tool exists and belongs to tenant
  const compositeTool = await findCompositeToolByIdAndTenant(compositeToolId, tenantId);
  if (!compositeTool) {
    throw new CompositeToolError(
      CompositeToolErrorCodes.COMPOSITE_TOOL_NOT_FOUND,
      'Composite tool not found',
      404
    );
  }

  // Check operation count limit
  const currentCount = await countOperations(compositeToolId);
  if (currentCount >= MAX_OPERATIONS_PER_TOOL) {
    throw new CompositeToolError(
      CompositeToolErrorCodes.MAX_OPERATIONS_EXCEEDED,
      `Maximum ${MAX_OPERATIONS_PER_TOOL} operations allowed per composite tool`
    );
  }

  // Verify action exists and belongs to tenant
  const actionWithIntegration = await findActionByIdWithIntegration(data.actionId);
  if (!actionWithIntegration || actionWithIntegration.integration.tenantId !== tenantId) {
    throw new CompositeToolError(
      CompositeToolErrorCodes.ACTION_NOT_FOUND,
      `Action '${data.actionId}' not found`,
      404
    );
  }

  // Check for operation slug collision
  const slugExists = await isOperationSlugTaken(compositeToolId, data.operationSlug);
  if (slugExists) {
    throw new CompositeToolError(
      CompositeToolErrorCodes.DUPLICATE_OPERATION_SLUG,
      `An operation with slug '${data.operationSlug}' already exists in this composite tool`
    );
  }

  // Create the operation
  const operationInput: CreateOperationDbInput = {
    compositeToolId,
    actionId: data.actionId,
    operationSlug: data.operationSlug,
    displayName: data.displayName,
    parameterMapping: data.parameterMapping as Prisma.InputJsonValue,
    priority: data.priority,
  };

  const operation = await repoCreateOperation(operationInput);

  return toOperationResponse(operation);
}

/**
 * Gets an operation by ID
 */
export async function getOperationById(
  tenantId: string,
  operationId: string
): Promise<CompositeToolOperationResponse> {
  const operation = await findOperationById(operationId);

  if (!operation) {
    throw new CompositeToolError(
      CompositeToolErrorCodes.OPERATION_NOT_FOUND,
      'Operation not found',
      404
    );
  }

  // Verify the composite tool belongs to the tenant
  const compositeTool = await findCompositeToolByIdAndTenant(operation.compositeToolId, tenantId);
  if (!compositeTool) {
    throw new CompositeToolError(
      CompositeToolErrorCodes.OPERATION_NOT_FOUND,
      'Operation not found',
      404
    );
  }

  return toOperationResponse(operation);
}

/**
 * Lists operations for a composite tool
 */
export async function listOperations(
  tenantId: string,
  compositeToolId: string
): Promise<CompositeToolOperationResponse[]> {
  // Verify composite tool exists and belongs to tenant
  const compositeTool = await findCompositeToolByIdAndTenant(compositeToolId, tenantId);
  if (!compositeTool) {
    throw new CompositeToolError(
      CompositeToolErrorCodes.COMPOSITE_TOOL_NOT_FOUND,
      'Composite tool not found',
      404
    );
  }

  const operations = await findOperationsByCompositeTool(compositeToolId);

  return operations.map(toOperationResponse);
}

/**
 * Updates an operation
 */
export async function updateOperation(
  tenantId: string,
  operationId: string,
  input: UpdateCompositeToolOperationInput
): Promise<CompositeToolOperationResponse> {
  // Validate input
  const parsed = UpdateCompositeToolOperationInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new CompositeToolError(
      CompositeToolErrorCodes.INVALID_INPUT,
      `Invalid operation data: ${parsed.error.message}`
    );
  }

  const data = parsed.data;

  // Get operation and verify tenant ownership
  const operation = await findOperationById(operationId);
  if (!operation) {
    throw new CompositeToolError(
      CompositeToolErrorCodes.OPERATION_NOT_FOUND,
      'Operation not found',
      404
    );
  }

  const compositeTool = await findCompositeToolByIdAndTenant(operation.compositeToolId, tenantId);
  if (!compositeTool) {
    throw new CompositeToolError(
      CompositeToolErrorCodes.OPERATION_NOT_FOUND,
      'Operation not found',
      404
    );
  }

  // Check for slug collision if slug is being changed
  if (data.operationSlug && data.operationSlug !== operation.operationSlug) {
    const slugExists = await isOperationSlugTaken(
      operation.compositeToolId,
      data.operationSlug,
      operationId
    );
    if (slugExists) {
      throw new CompositeToolError(
        CompositeToolErrorCodes.DUPLICATE_OPERATION_SLUG,
        `An operation with slug '${data.operationSlug}' already exists in this composite tool`
      );
    }
  }

  // Build update input
  const updateInput: UpdateOperationDbInput = {};
  if (data.operationSlug !== undefined) updateInput.operationSlug = data.operationSlug;
  if (data.displayName !== undefined) updateInput.displayName = data.displayName;
  if (data.parameterMapping !== undefined)
    updateInput.parameterMapping = data.parameterMapping as Prisma.InputJsonValue;
  if (data.priority !== undefined) updateInput.priority = data.priority;

  const updated = await repoUpdateOperation(operationId, updateInput);

  return toOperationResponse(updated);
}

/**
 * Removes an operation from a composite tool
 */
export async function removeOperation(tenantId: string, operationId: string): Promise<void> {
  const operation = await findOperationById(operationId);
  if (!operation) {
    throw new CompositeToolError(
      CompositeToolErrorCodes.OPERATION_NOT_FOUND,
      'Operation not found',
      404
    );
  }

  const compositeTool = await findCompositeToolByIdAndTenant(operation.compositeToolId, tenantId);
  if (!compositeTool) {
    throw new CompositeToolError(
      CompositeToolErrorCodes.OPERATION_NOT_FOUND,
      'Operation not found',
      404
    );
  }

  // If this is the default operation, clear it first
  if (compositeTool.defaultOperationId === operationId) {
    await repoUpdateCompositeTool(compositeTool.id, { defaultOperationId: null });
  }

  await repoDeleteOperation(operationId);
}

// =============================================================================
// Routing Rule - CRUD Operations
// =============================================================================

/**
 * Adds a routing rule to a composite tool
 */
export async function addRoutingRule(
  tenantId: string,
  compositeToolId: string,
  input: CreateRoutingRuleInput
): Promise<RoutingRuleResponse> {
  // Validate input
  const parsed = CreateRoutingRuleInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new CompositeToolError(
      CompositeToolErrorCodes.INVALID_INPUT,
      `Invalid routing rule data: ${parsed.error.message}`
    );
  }

  const data = parsed.data;

  // Verify composite tool exists and belongs to tenant
  const compositeTool = await findCompositeToolByIdAndTenant(compositeToolId, tenantId);
  if (!compositeTool) {
    throw new CompositeToolError(
      CompositeToolErrorCodes.COMPOSITE_TOOL_NOT_FOUND,
      'Composite tool not found',
      404
    );
  }

  // Verify operation exists and belongs to this composite tool
  const operation = await findOperationById(data.operationId);
  if (!operation || operation.compositeToolId !== compositeToolId) {
    throw new CompositeToolError(
      CompositeToolErrorCodes.OPERATION_NOT_FOUND,
      'Operation not found in this composite tool',
      404
    );
  }

  // Create the routing rule
  const ruleInput: CreateRoutingRuleDbInput = {
    compositeToolId,
    operationId: data.operationId,
    conditionType: data.conditionType as RoutingConditionType,
    conditionField: data.conditionField,
    conditionValue: data.conditionValue,
    caseSensitive: data.caseSensitive,
    priority: data.priority,
  };

  const rule = await repoCreateRoutingRule(ruleInput);

  return toRoutingRuleResponse(rule);
}

/**
 * Gets a routing rule by ID
 */
export async function getRoutingRuleById(
  tenantId: string,
  ruleId: string
): Promise<RoutingRuleResponse> {
  const rule = await findRoutingRuleById(ruleId);

  if (!rule) {
    throw new CompositeToolError(
      CompositeToolErrorCodes.ROUTING_RULE_NOT_FOUND,
      'Routing rule not found',
      404
    );
  }

  // Verify the composite tool belongs to the tenant
  const compositeTool = await findCompositeToolByIdAndTenant(rule.compositeToolId, tenantId);
  if (!compositeTool) {
    throw new CompositeToolError(
      CompositeToolErrorCodes.ROUTING_RULE_NOT_FOUND,
      'Routing rule not found',
      404
    );
  }

  return toRoutingRuleResponse(rule);
}

/**
 * Lists routing rules for a composite tool
 */
export async function listRoutingRules(
  tenantId: string,
  compositeToolId: string
): Promise<RoutingRuleResponse[]> {
  // Verify composite tool exists and belongs to tenant
  const compositeTool = await findCompositeToolByIdAndTenant(compositeToolId, tenantId);
  if (!compositeTool) {
    throw new CompositeToolError(
      CompositeToolErrorCodes.COMPOSITE_TOOL_NOT_FOUND,
      'Composite tool not found',
      404
    );
  }

  const rules = await findRoutingRulesByCompositeTool(compositeToolId);

  return rules.map(toRoutingRuleResponse);
}

/**
 * Updates a routing rule
 */
export async function updateRoutingRule(
  tenantId: string,
  ruleId: string,
  input: UpdateRoutingRuleInput
): Promise<RoutingRuleResponse> {
  // Validate input
  const parsed = UpdateRoutingRuleInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new CompositeToolError(
      CompositeToolErrorCodes.INVALID_INPUT,
      `Invalid routing rule data: ${parsed.error.message}`
    );
  }

  const data = parsed.data;

  // Get rule and verify tenant ownership
  const rule = await findRoutingRuleById(ruleId);
  if (!rule) {
    throw new CompositeToolError(
      CompositeToolErrorCodes.ROUTING_RULE_NOT_FOUND,
      'Routing rule not found',
      404
    );
  }

  const compositeTool = await findCompositeToolByIdAndTenant(rule.compositeToolId, tenantId);
  if (!compositeTool) {
    throw new CompositeToolError(
      CompositeToolErrorCodes.ROUTING_RULE_NOT_FOUND,
      'Routing rule not found',
      404
    );
  }

  // If changing operation, verify the new operation belongs to this composite tool
  if (data.operationId && data.operationId !== rule.operationId) {
    const operation = await findOperationById(data.operationId);
    if (!operation || operation.compositeToolId !== rule.compositeToolId) {
      throw new CompositeToolError(
        CompositeToolErrorCodes.OPERATION_NOT_FOUND,
        'Operation not found in this composite tool',
        404
      );
    }
  }

  // Build update input
  const updateInput: UpdateRoutingRuleDbInput = {};
  if (data.operationId !== undefined) updateInput.operationId = data.operationId;
  if (data.conditionType !== undefined)
    updateInput.conditionType = data.conditionType as RoutingConditionType;
  if (data.conditionField !== undefined) updateInput.conditionField = data.conditionField;
  if (data.conditionValue !== undefined) updateInput.conditionValue = data.conditionValue;
  if (data.caseSensitive !== undefined) updateInput.caseSensitive = data.caseSensitive;
  if (data.priority !== undefined) updateInput.priority = data.priority;

  const updated = await repoUpdateRoutingRule(ruleId, updateInput);

  return toRoutingRuleResponse(updated);
}

/**
 * Removes a routing rule
 */
export async function removeRoutingRule(tenantId: string, ruleId: string): Promise<void> {
  const rule = await findRoutingRuleById(ruleId);
  if (!rule) {
    throw new CompositeToolError(
      CompositeToolErrorCodes.ROUTING_RULE_NOT_FOUND,
      'Routing rule not found',
      404
    );
  }

  const compositeTool = await findCompositeToolByIdAndTenant(rule.compositeToolId, tenantId);
  if (!compositeTool) {
    throw new CompositeToolError(
      CompositeToolErrorCodes.ROUTING_RULE_NOT_FOUND,
      'Routing rule not found',
      404
    );
  }

  await repoDeleteRoutingRule(ruleId);
}

// =============================================================================
// Statistics
// =============================================================================

/**
 * Gets composite tool statistics for a tenant
 */
export async function getCompositeToolStats(tenantId: string): Promise<{
  total: number;
  byStatus: Record<string, number>;
}> {
  const byStatus = await getCompositeToolCountsByStatus(tenantId);
  const total = Object.values(byStatus).reduce((sum, count) => sum + count, 0);

  return {
    total,
    byStatus,
  };
}

// =============================================================================
// Description Generation
// =============================================================================

/**
 * Regenerates the tool description for a composite tool using LLM.
 *
 * This aggregates information from all sub-operations and generates:
 * - A unified toolDescription in mini-prompt format
 * - A toolSuccessTemplate for formatting successful responses
 * - A toolErrorTemplate for formatting error responses
 *
 * @param tenantId - The tenant owning the composite tool
 * @param compositeToolId - The composite tool to regenerate descriptions for
 * @param useFallback - If true, use basic description generation on LLM failure
 * @returns Updated composite tool with new descriptions
 *
 * @example
 * ```ts
 * const updated = await regenerateCompositeToolDescription(tenantId, compositeToolId);
 * console.log(updated.toolDescription);
 * ```
 */
export async function regenerateCompositeToolDescription(
  tenantId: string,
  compositeToolId: string,
  useFallback: boolean = true
): Promise<CompositeToolDetailResponse> {
  // Import dynamically to avoid circular dependencies
  const {
    generateDescriptionsFromCompositeTool,
    generateBasicCompositeToolDescription,
    loadOperationActionData,
  } = await import('./export/composite-tool-description-generator');

  // Get the composite tool with all relations
  const compositeTool = await getCompositeToolDetail(tenantId, compositeToolId);

  let descriptions;

  try {
    // Generate descriptions using LLM
    descriptions = await generateDescriptionsFromCompositeTool(compositeTool);
  } catch (error) {
    if (!useFallback) {
      throw error;
    }

    // Use fallback basic description generation
    console.error('LLM description generation failed, using basic fallback:', error);

    const operationData = await loadOperationActionData(
      compositeTool.operations.map((op) => ({
        id: op.id,
        operationSlug: op.operationSlug,
        displayName: op.displayName,
        actionId: op.actionId,
      }))
    );

    descriptions = generateBasicCompositeToolDescription({
      name: compositeTool.name,
      slug: compositeTool.slug,
      description: compositeTool.description,
      routingMode: compositeTool.routingMode,
      unifiedInputSchema: compositeTool.unifiedInputSchema,
      operations: operationData,
      hasDefaultOperation: !!compositeTool.defaultOperationId,
    });
  }

  // Update the composite tool with new descriptions
  await updateCompositeTool(tenantId, compositeToolId, {
    toolDescription: descriptions.toolDescription,
    toolSuccessTemplate: descriptions.toolSuccessTemplate,
    toolErrorTemplate: descriptions.toolErrorTemplate,
  });

  // Return updated detail
  return getCompositeToolDetail(tenantId, compositeToolId);
}
