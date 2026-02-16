/**
 * Action Service
 *
 * Business logic layer for action management.
 * Handles action CRUD operations, validation, slug conflict resolution,
 * and persisting actions from AI-generated definitions.
 */

import { HttpMethod, Prisma } from '@prisma/client';
import {
  createAction as repoCreateAction,
  createActionsInBatch,
  replaceActionsForIntegration,
  findActionByIdWithIntegration,
  findActionBySlug,
  findActionByIntegrationAndActionSlug,
  findActionsByIntegration,
  findActionsByIntegrationPaginated,
  findActionSummariesByIntegration,
  findExistingSlugs,
  updateAction as repoUpdateAction,
  deleteAction as repoDeleteAction,
  deleteActionsByIntegration,
  getActionStats,
  type CreateActionDbInput,
  type UpdateActionDbInput,
  type ActionFilters,
  type PaginationOptions,
} from './action.repository';
import {
  CreateActionInputSchema,
  UpdateActionInputSchema,
  ListActionsQuerySchema,
  ActionErrorCodes,
  generateActionId,
  toActionResponse,
  type CreateActionInput,
  type UpdateActionInput,
  type ListActionsQuery,
  type ActionResponse,
  type ActionSummary,
  type ListActionsResponse,
  type ActionSchemaResponse,
  type BatchCreateActionsResponse,
} from './action.schemas';
import { prisma } from '@/lib/db/client';

import type { Action } from '@prisma/client';
import type { ActionDefinition } from '../ai/action-generator';

// =============================================================================
// Error Class
// =============================================================================

/**
 * Error thrown when action operations fail
 */
export class ActionError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number = 400
  ) {
    super(message);
    this.name = 'ActionError';
  }
}

// =============================================================================
// Create Operations
// =============================================================================

/**
 * Creates a new action for an integration
 *
 * @param tenantId - The tenant creating the action
 * @param input - Action creation data
 * @returns The created action as API response
 */
export async function createAction(
  tenantId: string,
  input: CreateActionInput
): Promise<ActionResponse> {
  // Validate input
  const parsed = CreateActionInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new ActionError(
      ActionErrorCodes.INVALID_SCHEMA,
      `Invalid action data: ${parsed.error.message}`
    );
  }

  const data = parsed.data;

  // Verify integration belongs to tenant
  const integration = await prisma.integration.findFirst({
    where: {
      id: data.integrationId,
      tenantId,
    },
  });

  if (!integration) {
    throw new ActionError(ActionErrorCodes.INTEGRATION_NOT_FOUND, 'Integration not found', 404);
  }

  // Check for slug collision
  const existingSlug = await findActionBySlug(data.integrationId, data.slug);
  if (existingSlug) {
    throw new ActionError(
      ActionErrorCodes.DUPLICATE_SLUG,
      `An action with slug '${data.slug}' already exists for this integration`
    );
  }

  // Create the action - serialize schemas to plain JSON for Prisma
  const dbInput: CreateActionDbInput = {
    integrationId: data.integrationId,
    name: data.name,
    slug: data.slug,
    description: data.description,
    httpMethod: data.httpMethod as HttpMethod,
    endpointTemplate: data.endpointTemplate,
    inputSchema: toJsonValue(data.inputSchema),
    outputSchema: toJsonValue(data.outputSchema),
    paginationConfig: data.paginationConfig ? toJsonValue(data.paginationConfig) : undefined,
    retryConfig: data.retryConfig ? toJsonValue(data.retryConfig) : undefined,
    cacheable: data.cacheable,
    cacheTtlSeconds: data.cacheTtlSeconds ?? undefined,
    metadata: data.metadata ? toJsonValue(data.metadata) : {},
  };

  const action = await repoCreateAction(dbInput);

  return toActionResponse(action);
}

/**
 * Persists actions from AI-generated definitions
 * Used after scraping API documentation
 *
 * @param tenantId - The tenant ID for verification
 * @param integrationId - The integration to add actions to
 * @param definitions - Array of ActionDefinition from the AI generator
 * @param options - Options for persistence
 * @returns Batch create response with created actions
 */
export async function persistGeneratedActions(
  tenantId: string,
  integrationId: string,
  definitions: ActionDefinition[],
  options: {
    /** Replace existing actions (delete all first) */
    replaceExisting?: boolean;
  } = {}
): Promise<BatchCreateActionsResponse> {
  const { replaceExisting = false } = options;

  // Verify integration belongs to tenant
  const integration = await prisma.integration.findFirst({
    where: {
      id: integrationId,
      tenantId,
    },
  });

  if (!integration) {
    throw new ActionError(ActionErrorCodes.INTEGRATION_NOT_FOUND, 'Integration not found', 404);
  }

  // Validate batch size
  if (definitions.length > 100) {
    throw new ActionError(
      ActionErrorCodes.BATCH_LIMIT_EXCEEDED,
      'Cannot create more than 100 actions at once'
    );
  }

  const warnings: string[] = [];

  // Convert ActionDefinition to CreateActionDbInput - serialize to plain JSON for Prisma
  const actionsToCreate = definitions.map((def) => ({
    name: def.name,
    slug: def.slug,
    description: def.description,
    httpMethod: def.httpMethod as HttpMethod,
    endpointTemplate: def.endpointTemplate,
    inputSchema: toJsonValue(def.inputSchema),
    outputSchema: toJsonValue(def.outputSchema),
    paginationConfig: def.paginationConfig ? toJsonValue(def.paginationConfig) : undefined,
    retryConfig: def.retryConfig ? toJsonValue(def.retryConfig) : undefined,
    cacheable: def.cacheable,
    cacheTtlSeconds: def.cacheTtlSeconds,
    metadata: def.metadata ? toJsonValue(def.metadata) : {},
  }));

  // Handle slug conflicts if not replacing
  if (!replaceExisting) {
    const slugs = actionsToCreate.map((a) => a.slug);
    const existingSlugs = await findExistingSlugs(integrationId, slugs);

    if (existingSlugs.length > 0) {
      // Rename conflicting slugs
      for (const action of actionsToCreate) {
        if (existingSlugs.includes(action.slug)) {
          const newSlug = makeUniqueSlug(action.slug, action.httpMethod, new Set(slugs));
          warnings.push(
            `Renamed action slug from '${action.slug}' to '${newSlug}' to avoid conflict`
          );
          action.slug = newSlug;
        }
      }
    }
  }

  let created: Action[];
  let deleted = 0;

  if (replaceExisting) {
    const result = await replaceActionsForIntegration(integrationId, actionsToCreate);
    created = result.created;
    deleted = result.deleted;
  } else {
    created = await createActionsInBatch(integrationId, actionsToCreate);
  }

  return {
    created: created.length,
    deleted: deleted > 0 ? deleted : undefined,
    actions: created.map(toActionResponse),
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

// =============================================================================
// Read Operations
// =============================================================================

/**
 * Gets an action by ID with tenant verification
 *
 * @param tenantId - The tenant requesting the action
 * @param actionId - The action ID
 * @returns The action as API response
 */
export async function getAction(tenantId: string, actionId: string): Promise<ActionResponse> {
  const action = await findActionByIdWithIntegration(actionId);

  if (!action || action.integration.tenantId !== tenantId) {
    throw new ActionError(ActionErrorCodes.ACTION_NOT_FOUND, 'Action not found', 404);
  }

  return toActionResponse(action);
}

/**
 * Gets an action by integration slug and action slug
 * Used for the gateway API: /actions/{integrationSlug}/{actionSlug}
 *
 * @param tenantId - The tenant ID
 * @param integrationSlug - The integration slug
 * @param actionSlug - The action slug
 * @returns The action with integration info
 */
export async function getActionBySlug(
  tenantId: string,
  integrationSlug: string,
  actionSlug: string
): Promise<Action & { integration: { id: string; tenantId: string; slug: string; name: string } }> {
  const action = await findActionByIntegrationAndActionSlug(tenantId, integrationSlug, actionSlug);

  if (!action) {
    throw new ActionError(
      ActionErrorCodes.ACTION_NOT_FOUND,
      `Action '${integrationSlug}.${actionSlug}' not found`,
      404
    );
  }

  return action;
}

/**
 * Gets the schema for an action (for API consumers)
 *
 * @param tenantId - The tenant ID
 * @param integrationSlug - The integration slug
 * @param actionSlug - The action slug
 * @returns Action schema response
 */
export async function getActionSchema(
  tenantId: string,
  integrationSlug: string,
  actionSlug: string
): Promise<ActionSchemaResponse> {
  const action = await getActionBySlug(tenantId, integrationSlug, actionSlug);
  const metadata = action.metadata as Record<string, unknown> | null;

  return {
    actionId: generateActionId(integrationSlug, actionSlug),
    inputSchema: action.inputSchema as unknown as ActionSchemaResponse['inputSchema'],
    outputSchema: action.outputSchema as unknown as ActionSchemaResponse['outputSchema'],
    metadata: {
      httpMethod: action.httpMethod,
      cacheable: action.cacheable,
      cacheTtlSeconds: action.cacheTtlSeconds,
      rateLimit: metadata?.rateLimit as ActionSchemaResponse['metadata']['rateLimit'],
      tags: metadata?.tags as string[] | undefined,
      paginationConfig:
        action.paginationConfig as unknown as ActionSchemaResponse['metadata']['paginationConfig'],
    },
  };
}

/**
 * Lists actions for an integration with pagination and filtering
 *
 * @param tenantId - The tenant ID
 * @param integrationId - The integration ID
 * @param query - Query parameters (pagination, search, filters)
 * @returns Paginated list of actions
 */
export async function listActions(
  tenantId: string,
  integrationId: string,
  query: Partial<ListActionsQuery> = {}
): Promise<
  ListActionsResponse | { actions: ActionSummary[]; pagination: ListActionsResponse['pagination'] }
> {
  // Validate query - schema has defaults so partial input is ok
  const parsed = ListActionsQuerySchema.safeParse(query);
  if (!parsed.success) {
    throw new ActionError(
      ActionErrorCodes.INVALID_SCHEMA,
      `Invalid query parameters: ${parsed.error.message}`
    );
  }

  const { cursor, limit, search, tags, httpMethod, cacheable, fields } = parsed.data;

  // Verify integration belongs to tenant
  const integration = await prisma.integration.findFirst({
    where: {
      id: integrationId,
      tenantId,
    },
  });

  if (!integration) {
    throw new ActionError(ActionErrorCodes.INTEGRATION_NOT_FOUND, 'Integration not found', 404);
  }

  // Build filters
  const filters: Omit<ActionFilters, 'integrationId'> = {};
  if (search) filters.search = search;
  if (tags) filters.tags = tags.split(',').map((t) => t.trim());
  if (httpMethod) filters.httpMethod = httpMethod as HttpMethod;
  if (cacheable !== undefined) filters.cacheable = cacheable;

  // Build pagination options
  const paginationOptions: PaginationOptions = { limit };
  if (cursor) paginationOptions.cursor = cursor;

  // Use lightweight query when only summary fields are needed
  if (fields === 'summary') {
    const result = await findActionSummariesByIntegration(
      integrationId,
      paginationOptions,
      filters
    );
    return {
      actions: result.actions,
      pagination: {
        cursor: result.nextCursor,
        hasMore: result.nextCursor !== null,
        totalCount: result.totalCount,
      },
    };
  }

  // Full query
  const result = await findActionsByIntegrationPaginated(integrationId, paginationOptions, filters);

  return {
    actions: result.actions.map(toActionResponse),
    pagination: {
      cursor: result.nextCursor,
      hasMore: result.nextCursor !== null,
      totalCount: result.totalCount,
    },
  };
}

/**
 * Gets all actions for an integration (no pagination)
 * Useful for internal use or small integrations
 *
 * @param tenantId - The tenant ID
 * @param integrationId - The integration ID
 * @returns Array of actions
 */
export async function getAllActions(
  tenantId: string,
  integrationId: string
): Promise<ActionResponse[]> {
  // Verify integration belongs to tenant
  const integration = await prisma.integration.findFirst({
    where: {
      id: integrationId,
      tenantId,
    },
  });

  if (!integration) {
    throw new ActionError(ActionErrorCodes.INTEGRATION_NOT_FOUND, 'Integration not found', 404);
  }

  const actions = await findActionsByIntegration(integrationId);
  return actions.map(toActionResponse);
}

// =============================================================================
// Update Operations
// =============================================================================

/**
 * Updates an action
 *
 * @param tenantId - The tenant making the update
 * @param actionId - The action ID to update
 * @param input - Update data
 * @returns The updated action
 */
export async function updateAction(
  tenantId: string,
  actionId: string,
  input: UpdateActionInput
): Promise<ActionResponse> {
  // Validate input
  const parsed = UpdateActionInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new ActionError(
      ActionErrorCodes.INVALID_SCHEMA,
      `Invalid action data: ${parsed.error.message}`
    );
  }

  const data = parsed.data;

  // Get existing action with tenant verification
  const existing = await findActionByIdWithIntegration(actionId);
  if (!existing || existing.integration.tenantId !== tenantId) {
    throw new ActionError(ActionErrorCodes.ACTION_NOT_FOUND, 'Action not found', 404);
  }

  // Check for slug collision if slug is being changed
  if (data.slug && data.slug !== existing.slug) {
    const existingSlug = await findActionBySlug(existing.integrationId, data.slug);
    if (existingSlug) {
      throw new ActionError(
        ActionErrorCodes.DUPLICATE_SLUG,
        `An action with slug '${data.slug}' already exists for this integration`
      );
    }
  }

  // Build update input - serialize schemas to plain JSON for Prisma
  const updateInput: UpdateActionDbInput = {};
  if (data.name !== undefined) updateInput.name = data.name;
  if (data.slug !== undefined) updateInput.slug = data.slug;
  if (data.description !== undefined) updateInput.description = data.description;
  if (data.httpMethod !== undefined) updateInput.httpMethod = data.httpMethod as HttpMethod;
  if (data.endpointTemplate !== undefined) updateInput.endpointTemplate = data.endpointTemplate;
  if (data.inputSchema !== undefined) updateInput.inputSchema = toJsonValue(data.inputSchema);
  if (data.outputSchema !== undefined) updateInput.outputSchema = toJsonValue(data.outputSchema);
  if (data.cacheable !== undefined) updateInput.cacheable = data.cacheable;
  if (data.cacheTtlSeconds !== undefined) updateInput.cacheTtlSeconds = data.cacheTtlSeconds;
  if (data.metadata !== undefined) updateInput.metadata = toJsonValue(data.metadata);

  // Handle nullable fields
  if (data.paginationConfig !== undefined) {
    if (data.paginationConfig === null) {
      updateInput.clearPaginationConfig = true;
    } else {
      updateInput.paginationConfig = toJsonValue(data.paginationConfig);
    }
  }
  if (data.retryConfig !== undefined) {
    if (data.retryConfig === null) {
      updateInput.clearRetryConfig = true;
    } else {
      updateInput.retryConfig = toJsonValue(data.retryConfig);
    }
  }

  const updated = await repoUpdateAction(actionId, updateInput);
  return toActionResponse(updated);
}

// =============================================================================
// Delete Operations
// =============================================================================

/**
 * Deletes an action
 *
 * @param tenantId - The tenant making the deletion
 * @param actionId - The action ID to delete
 */
export async function deleteAction(tenantId: string, actionId: string): Promise<void> {
  // Get existing action with tenant verification
  const existing = await findActionByIdWithIntegration(actionId);
  if (!existing || existing.integration.tenantId !== tenantId) {
    throw new ActionError(ActionErrorCodes.ACTION_NOT_FOUND, 'Action not found', 404);
  }

  await repoDeleteAction(actionId);
}

/**
 * Deletes all actions for an integration
 *
 * @param tenantId - The tenant ID
 * @param integrationId - The integration ID
 * @returns Number of deleted actions
 */
export async function deleteAllActions(tenantId: string, integrationId: string): Promise<number> {
  // Verify integration belongs to tenant
  const integration = await prisma.integration.findFirst({
    where: {
      id: integrationId,
      tenantId,
    },
  });

  if (!integration) {
    throw new ActionError(ActionErrorCodes.INTEGRATION_NOT_FOUND, 'Integration not found', 404);
  }

  return deleteActionsByIntegration(integrationId);
}

// =============================================================================
// Statistics
// =============================================================================

/**
 * Gets statistics for actions in an integration
 *
 * @param tenantId - The tenant ID
 * @param integrationId - The integration ID
 * @returns Action statistics
 */
export async function getIntegrationActionStats(
  tenantId: string,
  integrationId: string
): Promise<{
  total: number;
  cacheable: number;
  byMethod: Record<HttpMethod, number>;
}> {
  // Verify integration belongs to tenant
  const integration = await prisma.integration.findFirst({
    where: {
      id: integrationId,
      tenantId,
    },
  });

  if (!integration) {
    throw new ActionError(ActionErrorCodes.INTEGRATION_NOT_FOUND, 'Integration not found', 404);
  }

  return getActionStats(integrationId);
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Converts a typed object to Prisma InputJsonValue
 * Uses JSON serialization to ensure clean JSON compatible with Prisma
 */
function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

/**
 * Make a slug unique by appending method or counter
 */
function makeUniqueSlug(slug: string, method: string, existing: Set<string>): string {
  // First try appending method
  const withMethod = `${slug}-${method.toLowerCase()}`;
  if (!existing.has(withMethod)) {
    existing.add(withMethod);
    return withMethod;
  }

  // Fall back to counter
  let counter = 2;
  while (existing.has(`${slug}-${counter}`)) {
    counter++;
  }
  const newSlug = `${slug}-${counter}`;
  existing.add(newSlug);
  return newSlug;
}

/**
 * Verifies an integration exists and belongs to a tenant
 * Throws ActionError if not found
 */
export async function verifyIntegrationOwnership(
  integrationId: string,
  tenantId: string
): Promise<{ id: string; slug: string; name: string }> {
  const integration = await prisma.integration.findFirst({
    where: {
      id: integrationId,
      tenantId,
    },
    select: {
      id: true,
      slug: true,
      name: true,
    },
  });

  if (!integration) {
    throw new ActionError(ActionErrorCodes.INTEGRATION_NOT_FOUND, 'Integration not found', 404);
  }

  return integration;
}
