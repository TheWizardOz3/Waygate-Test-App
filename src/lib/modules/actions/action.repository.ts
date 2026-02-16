/**
 * Action Repository
 *
 * Data access layer for Action model.
 * Handles CRUD operations, batch imports, and queries for action definitions.
 *
 * Actions are scoped to integrations, which are scoped to tenants.
 * All queries that access actions should verify tenant ownership through the integration.
 */

import { prisma } from '@/lib/db/client';
import { HttpMethod, Prisma } from '@prisma/client';

import type { Action } from '@prisma/client';

// =============================================================================
// Types
// =============================================================================

/**
 * Input for creating a new action (repository layer)
 */
export interface CreateActionDbInput {
  integrationId: string;
  name: string;
  slug: string;
  description?: string;
  httpMethod: HttpMethod;
  endpointTemplate: string;
  inputSchema: Prisma.InputJsonValue;
  outputSchema: Prisma.InputJsonValue;
  paginationConfig?: Prisma.InputJsonValue;
  retryConfig?: Prisma.InputJsonValue;
  cacheable?: boolean;
  cacheTtlSeconds?: number;
  metadata?: Prisma.InputJsonValue;
}

/**
 * Input for updating an action (repository layer)
 */
export interface UpdateActionDbInput {
  name?: string;
  slug?: string;
  description?: string;
  httpMethod?: HttpMethod;
  endpointTemplate?: string;
  inputSchema?: Prisma.InputJsonValue;
  outputSchema?: Prisma.InputJsonValue;
  paginationConfig?: Prisma.InputJsonValue;
  retryConfig?: Prisma.InputJsonValue;
  cacheable?: boolean;
  cacheTtlSeconds?: number | null;
  metadata?: Prisma.InputJsonValue;
  /** Set to true to clear paginationConfig */
  clearPaginationConfig?: boolean;
  /** Set to true to clear retryConfig */
  clearRetryConfig?: boolean;
}

/**
 * Filters for querying actions
 */
export interface ActionFilters {
  integrationId?: string;
  httpMethod?: HttpMethod;
  cacheable?: boolean;
  search?: string;
  tags?: string[];
}

/**
 * Pagination options
 */
export interface PaginationOptions {
  cursor?: string;
  limit?: number;
}

/**
 * Paginated result
 */
export interface PaginatedActions {
  actions: Action[];
  nextCursor: string | null;
  totalCount: number;
}

/**
 * Lightweight action summary (id, integrationId, name, slug only)
 */
export interface ActionSummaryRow {
  id: string;
  integrationId: string;
  name: string;
  slug: string;
}

export interface PaginatedActionSummaries {
  actions: ActionSummaryRow[];
  nextCursor: string | null;
  totalCount: number;
}

// =============================================================================
// Create Operations
// =============================================================================

/**
 * Creates a new action
 */
export async function createAction(input: CreateActionDbInput): Promise<Action> {
  return prisma.action.create({
    data: {
      integrationId: input.integrationId,
      name: input.name,
      slug: input.slug,
      description: input.description,
      httpMethod: input.httpMethod,
      endpointTemplate: input.endpointTemplate,
      inputSchema: input.inputSchema,
      outputSchema: input.outputSchema,
      paginationConfig: input.paginationConfig,
      retryConfig: input.retryConfig,
      cacheable: input.cacheable ?? false,
      cacheTtlSeconds: input.cacheTtlSeconds,
      metadata: input.metadata ?? {},
    },
  });
}

/**
 * Creates multiple actions in a single transaction
 * Used for batch importing actions from AI scraper
 */
export async function createActionsInBatch(
  integrationId: string,
  actions: Omit<CreateActionDbInput, 'integrationId'>[]
): Promise<Action[]> {
  // Use createMany for efficiency, but it doesn't return created records
  // So we use a transaction with individual creates for small batches
  // or createManyAndReturn if available (Prisma 5.14+)

  return prisma.$transaction(
    actions.map((action) =>
      prisma.action.create({
        data: {
          integrationId,
          name: action.name,
          slug: action.slug,
          description: action.description,
          httpMethod: action.httpMethod,
          endpointTemplate: action.endpointTemplate,
          inputSchema: action.inputSchema,
          outputSchema: action.outputSchema,
          paginationConfig: action.paginationConfig,
          retryConfig: action.retryConfig,
          cacheable: action.cacheable ?? false,
          cacheTtlSeconds: action.cacheTtlSeconds,
          metadata: action.metadata ?? {},
        },
      })
    )
  );
}

/**
 * Replaces all actions for an integration
 * Deletes existing actions and creates new ones in a transaction
 */
export async function replaceActionsForIntegration(
  integrationId: string,
  actions: Omit<CreateActionDbInput, 'integrationId'>[]
): Promise<{ deleted: number; created: Action[] }> {
  return prisma.$transaction(async (tx) => {
    // Delete all existing actions for the integration
    const deleteResult = await tx.action.deleteMany({
      where: { integrationId },
    });

    // Create new actions
    const created = await Promise.all(
      actions.map((action) =>
        tx.action.create({
          data: {
            integrationId,
            name: action.name,
            slug: action.slug,
            description: action.description,
            httpMethod: action.httpMethod,
            endpointTemplate: action.endpointTemplate,
            inputSchema: action.inputSchema,
            outputSchema: action.outputSchema,
            paginationConfig: action.paginationConfig,
            retryConfig: action.retryConfig,
            cacheable: action.cacheable ?? false,
            cacheTtlSeconds: action.cacheTtlSeconds,
            metadata: action.metadata ?? {},
          },
        })
      )
    );

    return {
      deleted: deleteResult.count,
      created,
    };
  });
}

// =============================================================================
// Read Operations
// =============================================================================

/**
 * Finds an action by ID
 */
export async function findActionById(id: string): Promise<Action | null> {
  return prisma.action.findUnique({
    where: { id },
  });
}

/**
 * Finds an action by ID with integration included
 */
export async function findActionByIdWithIntegration(id: string): Promise<
  | (Action & {
      integration: { id: string; tenantId: string; slug: string; name: string };
    })
  | null
> {
  return prisma.action.findUnique({
    where: { id },
    include: {
      integration: {
        select: {
          id: true,
          tenantId: true,
          slug: true,
          name: true,
        },
      },
    },
  });
}

/**
 * Finds an action by slug within an integration
 */
export async function findActionBySlug(
  integrationId: string,
  slug: string
): Promise<Action | null> {
  return prisma.action.findFirst({
    where: {
      integrationId,
      slug,
    },
  });
}

/**
 * Finds an action by integration slug and action slug
 * Used for the gateway API: /actions/{integrationSlug}/{actionSlug}
 */
export async function findActionByIntegrationAndActionSlug(
  tenantId: string,
  integrationSlug: string,
  actionSlug: string
): Promise<
  | (Action & {
      integration: { id: string; tenantId: string; slug: string; name: string };
    })
  | null
> {
  return prisma.action.findFirst({
    where: {
      slug: actionSlug,
      integration: {
        slug: integrationSlug,
        tenantId,
      },
    },
    include: {
      integration: {
        select: {
          id: true,
          tenantId: true,
          slug: true,
          name: true,
        },
      },
    },
  });
}

/**
 * Finds all actions for an integration
 */
export async function findActionsByIntegration(integrationId: string): Promise<Action[]> {
  return prisma.action.findMany({
    where: { integrationId },
    orderBy: { name: 'asc' },
  });
}

/**
 * Finds actions for an integration with pagination and filtering
 */
export async function findActionsByIntegrationPaginated(
  integrationId: string,
  options: PaginationOptions = {},
  filters: Omit<ActionFilters, 'integrationId'> = {}
): Promise<PaginatedActions> {
  const limit = Math.min(options.limit ?? 50, 100);

  // Build where clause
  const where: Prisma.ActionWhereInput = {
    integrationId,
  };

  if (filters.httpMethod) {
    where.httpMethod = filters.httpMethod;
  }

  if (filters.cacheable !== undefined) {
    where.cacheable = filters.cacheable;
  }

  if (filters.search) {
    where.OR = [
      { name: { contains: filters.search, mode: 'insensitive' } },
      { description: { contains: filters.search, mode: 'insensitive' } },
      { slug: { contains: filters.search, mode: 'insensitive' } },
    ];
  }

  if (filters.tags && filters.tags.length > 0) {
    // Filter by tags in metadata.tags array
    where.metadata = {
      path: ['tags'],
      array_contains: filters.tags,
    };
  }

  // Get total count
  const totalCount = await prisma.action.count({ where });

  // Build query options
  const queryOptions: Prisma.ActionFindManyArgs = {
    where,
    take: limit + 1, // Fetch one extra to determine if there are more
    orderBy: { name: 'asc' },
  };

  // Add cursor if provided
  if (options.cursor) {
    queryOptions.cursor = { id: options.cursor };
    queryOptions.skip = 1; // Skip the cursor record itself
  }

  // Execute query
  const actions = await prisma.action.findMany(queryOptions);

  // Determine if there are more results
  const hasMore = actions.length > limit;
  if (hasMore) {
    actions.pop(); // Remove the extra record
  }

  // Get next cursor
  const nextCursor = hasMore && actions.length > 0 ? actions[actions.length - 1].id : null;

  return {
    actions,
    nextCursor,
    totalCount,
  };
}

/**
 * Finds action summaries (id, name, slug) for an integration with pagination.
 * Uses Prisma select to avoid fetching heavy JSON columns (schemas, configs).
 */
export async function findActionSummariesByIntegration(
  integrationId: string,
  options: PaginationOptions = {},
  filters: Omit<ActionFilters, 'integrationId'> = {}
): Promise<PaginatedActionSummaries> {
  const limit = Math.min(options.limit ?? 50, 100);

  const where: Prisma.ActionWhereInput = { integrationId };

  if (filters.search) {
    where.OR = [
      { name: { contains: filters.search, mode: 'insensitive' } },
      { slug: { contains: filters.search, mode: 'insensitive' } },
    ];
  }

  const totalCount = await prisma.action.count({ where });

  const queryOptions: Parameters<typeof prisma.action.findMany>[0] = {
    where,
    take: limit + 1,
    orderBy: { name: 'asc' as const },
    select: {
      id: true,
      integrationId: true,
      name: true,
      slug: true,
    },
  };

  if (options.cursor) {
    queryOptions.cursor = { id: options.cursor };
    queryOptions.skip = 1;
  }

  const actions = await prisma.action.findMany(queryOptions);

  const hasMore = actions.length > limit;
  if (hasMore) {
    actions.pop();
  }

  const nextCursor = hasMore && actions.length > 0 ? actions[actions.length - 1].id : null;

  return { actions, nextCursor, totalCount };
}

/**
 * Finds all actions for a tenant (across all integrations)
 */
export async function findActionsByTenant(
  tenantId: string,
  options: PaginationOptions = {}
): Promise<PaginatedActions> {
  const limit = Math.min(options.limit ?? 50, 100);

  const where: Prisma.ActionWhereInput = {
    integration: {
      tenantId,
    },
  };

  // Get total count
  const totalCount = await prisma.action.count({ where });

  // Build query options
  const queryOptions: Prisma.ActionFindManyArgs = {
    where,
    take: limit + 1,
    orderBy: [{ integration: { name: 'asc' } }, { name: 'asc' }],
    include: {
      integration: {
        select: {
          id: true,
          slug: true,
          name: true,
        },
      },
    },
  };

  if (options.cursor) {
    queryOptions.cursor = { id: options.cursor };
    queryOptions.skip = 1;
  }

  const actions = await prisma.action.findMany(queryOptions);

  const hasMore = actions.length > limit;
  if (hasMore) {
    actions.pop();
  }

  const nextCursor = hasMore && actions.length > 0 ? actions[actions.length - 1].id : null;

  return {
    actions,
    nextCursor,
    totalCount,
  };
}

/**
 * Checks if an action slug exists within an integration
 */
export async function actionSlugExists(integrationId: string, slug: string): Promise<boolean> {
  const count = await prisma.action.count({
    where: {
      integrationId,
      slug,
    },
  });
  return count > 0;
}

/**
 * Checks if any of the given slugs exist within an integration
 * Returns the list of existing slugs
 */
export async function findExistingSlugs(integrationId: string, slugs: string[]): Promise<string[]> {
  const existing = await prisma.action.findMany({
    where: {
      integrationId,
      slug: { in: slugs },
    },
    select: { slug: true },
  });
  return existing.map((a) => a.slug);
}

// =============================================================================
// Update Operations
// =============================================================================

/**
 * Updates an action
 */
export async function updateAction(id: string, input: UpdateActionDbInput): Promise<Action> {
  // Build update data, handling nullable JSON fields specially
  const data: Prisma.ActionUpdateInput = {};

  if (input.name !== undefined) data.name = input.name;
  if (input.slug !== undefined) data.slug = input.slug;
  if (input.description !== undefined) data.description = input.description;
  if (input.httpMethod !== undefined) data.httpMethod = input.httpMethod;
  if (input.endpointTemplate !== undefined) data.endpointTemplate = input.endpointTemplate;
  if (input.inputSchema !== undefined) data.inputSchema = input.inputSchema;
  if (input.outputSchema !== undefined) data.outputSchema = input.outputSchema;
  if (input.cacheable !== undefined) data.cacheable = input.cacheable;
  if (input.cacheTtlSeconds !== undefined) data.cacheTtlSeconds = input.cacheTtlSeconds;
  if (input.metadata !== undefined) data.metadata = input.metadata;

  // Handle nullable JSON fields
  if (input.clearPaginationConfig) {
    data.paginationConfig = Prisma.DbNull;
  } else if (input.paginationConfig !== undefined) {
    data.paginationConfig = input.paginationConfig;
  }

  if (input.clearRetryConfig) {
    data.retryConfig = Prisma.DbNull;
  } else if (input.retryConfig !== undefined) {
    data.retryConfig = input.retryConfig;
  }

  return prisma.action.update({
    where: { id },
    data,
  });
}

/**
 * Updates an action with tenant verification
 * Returns null if action doesn't belong to tenant's integration
 */
export async function updateActionForTenant(
  id: string,
  tenantId: string,
  input: UpdateActionDbInput
): Promise<Action | null> {
  // First verify ownership through integration
  const existing = await findActionByIdWithIntegration(id);
  if (!existing || existing.integration.tenantId !== tenantId) {
    return null;
  }

  return updateAction(id, input);
}

// =============================================================================
// Delete Operations
// =============================================================================

/**
 * Deletes an action
 */
export async function deleteAction(id: string): Promise<void> {
  await prisma.action.delete({
    where: { id },
  });
}

/**
 * Deletes an action with tenant verification
 * Returns true if deleted, false if not found or not owned
 */
export async function deleteActionForTenant(id: string, tenantId: string): Promise<boolean> {
  const existing = await findActionByIdWithIntegration(id);
  if (!existing || existing.integration.tenantId !== tenantId) {
    return false;
  }

  await deleteAction(id);
  return true;
}

/**
 * Deletes all actions for an integration
 */
export async function deleteActionsByIntegration(integrationId: string): Promise<number> {
  const result = await prisma.action.deleteMany({
    where: { integrationId },
  });
  return result.count;
}

// =============================================================================
// Aggregation Operations
// =============================================================================

/**
 * Counts actions for an integration
 */
export async function countActionsByIntegration(integrationId: string): Promise<number> {
  return prisma.action.count({
    where: { integrationId },
  });
}

/**
 * Counts actions by HTTP method for an integration
 */
export async function countActionsByHttpMethod(
  integrationId: string
): Promise<Record<HttpMethod, number>> {
  const counts = await prisma.action.groupBy({
    by: ['httpMethod'],
    where: { integrationId },
    _count: true,
  });

  // Initialize all methods to 0
  const result: Record<HttpMethod, number> = {
    [HttpMethod.GET]: 0,
    [HttpMethod.POST]: 0,
    [HttpMethod.PUT]: 0,
    [HttpMethod.PATCH]: 0,
    [HttpMethod.DELETE]: 0,
  };

  // Fill in actual counts
  for (const count of counts) {
    result[count.httpMethod] = count._count;
  }

  return result;
}

/**
 * Gets statistics for actions in an integration
 */
export async function getActionStats(integrationId: string): Promise<{
  total: number;
  cacheable: number;
  byMethod: Record<HttpMethod, number>;
}> {
  const [total, cacheableCount, byMethod] = await Promise.all([
    countActionsByIntegration(integrationId),
    prisma.action.count({
      where: { integrationId, cacheable: true },
    }),
    countActionsByHttpMethod(integrationId),
  ]);

  return {
    total,
    cacheable: cacheableCount,
    byMethod,
  };
}
