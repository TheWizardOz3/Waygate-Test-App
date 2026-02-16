/**
 * Integration Repository
 *
 * Data access layer for Integration model.
 * Handles CRUD operations and queries for integration definitions.
 *
 * Integrations are scoped to tenants for data isolation.
 */

import { prisma } from '@/lib/db/client';
import { AuthType, IntegrationStatus, Prisma } from '@prisma/client';

import type { Integration } from '@prisma/client';
import type { IntegrationFilters } from './integration.schemas';

// =============================================================================
// Types
// =============================================================================

/**
 * Input for creating a new integration (repository layer)
 */
export interface CreateIntegrationDbInput {
  tenantId: string;
  name: string;
  slug: string;
  description?: string;
  documentationUrl?: string;
  authType: AuthType;
  authConfig?: Prisma.InputJsonValue;
  status?: IntegrationStatus;
  tags?: string[];
  metadata?: Prisma.InputJsonValue;
}

/**
 * Input for updating an integration (repository layer)
 */
export interface UpdateIntegrationDbInput {
  name?: string;
  slug?: string;
  description?: string | null;
  documentationUrl?: string | null;
  authType?: AuthType;
  authConfig?: Prisma.InputJsonValue;
  status?: IntegrationStatus;
  tags?: string[];
  metadata?: Prisma.InputJsonValue;
}

/**
 * Pagination options
 */
export interface IntegrationPaginationOptions {
  cursor?: string;
  limit?: number;
}

/**
 * Paginated result
 */
export interface PaginatedIntegrations {
  integrations: Integration[];
  nextCursor: string | null;
  totalCount: number;
}

/**
 * Integration with related counts
 */
export interface IntegrationWithCounts extends Integration {
  _count: {
    actions: number;
    credentials: number;
  };
}

/**
 * Connection health summary for an integration
 */
export interface IntegrationConnectionHealthSummary {
  totalConnections: number;
  healthy: number;
  degraded: number;
  unhealthy: number;
  unknown: number;
}

/**
 * Integration with counts and connection health
 */
export interface IntegrationWithCountsAndHealth extends IntegrationWithCounts {
  connectionHealth: IntegrationConnectionHealthSummary;
}

// =============================================================================
// Create Operations
// =============================================================================

/**
 * Creates a new integration
 *
 * Note: Integrations with verified authType='none' are set to 'active' status
 * immediately since they don't require credentials. Other integrations start as 'draft'.
 * AI-scraped integrations where auth detection failed (authTypeUnverified) stay as 'draft'.
 */
export async function createIntegration(input: CreateIntegrationDbInput): Promise<Integration> {
  // Only auto-activate if authType is 'none' AND it was confidently detected
  // (not just a fallback from failed AI auth detection)
  const metadata = input.metadata as Record<string, unknown> | undefined;
  const isVerifiedNoAuth = input.authType === AuthType.none && !metadata?.authTypeUnverified;
  const defaultStatus = isVerifiedNoAuth ? IntegrationStatus.active : IntegrationStatus.draft;

  return prisma.integration.create({
    data: {
      tenantId: input.tenantId,
      name: input.name,
      slug: input.slug,
      description: input.description,
      documentationUrl: input.documentationUrl,
      authType: input.authType,
      authConfig: input.authConfig ?? {},
      status: input.status ?? defaultStatus,
      tags: input.tags ?? [],
      metadata: input.metadata ?? {},
    },
  });
}

// =============================================================================
// Read Operations
// =============================================================================

/**
 * Finds an integration by ID
 */
export async function findIntegrationById(id: string): Promise<Integration | null> {
  return prisma.integration.findUnique({
    where: { id },
  });
}

/**
 * Finds an integration by ID with tenant verification
 */
export async function findIntegrationByIdAndTenant(
  id: string,
  tenantId: string
): Promise<Integration | null> {
  return prisma.integration.findFirst({
    where: {
      id,
      tenantId,
    },
  });
}

/**
 * Finds an integration by slug within a tenant
 */
export async function findIntegrationBySlug(
  tenantId: string,
  slug: string
): Promise<Integration | null> {
  return prisma.integration.findFirst({
    where: {
      tenantId,
      slug,
    },
  });
}

/**
 * Finds an integration by slug with action and credential counts
 */
export async function findIntegrationBySlugWithCounts(
  tenantId: string,
  slug: string
): Promise<IntegrationWithCounts | null> {
  return prisma.integration.findFirst({
    where: {
      tenantId,
      slug,
    },
    include: {
      _count: {
        select: {
          actions: true,
          credentials: true,
        },
      },
    },
  });
}

/**
 * Queries integrations with filters and pagination
 */
export async function findIntegrationsPaginated(
  tenantId: string,
  pagination: IntegrationPaginationOptions = {},
  filters: IntegrationFilters = {}
): Promise<PaginatedIntegrations> {
  const { cursor, limit = 20 } = pagination;

  // Build where clause
  const where: Prisma.IntegrationWhereInput = {
    tenantId,
  };

  if (filters.status) {
    where.status = filters.status as IntegrationStatus;
  }

  if (filters.authType) {
    where.authType = filters.authType as AuthType;
  }

  if (filters.tags && filters.tags.length > 0) {
    where.tags = { hasEvery: filters.tags };
  }

  if (filters.search) {
    where.OR = [
      { name: { contains: filters.search, mode: 'insensitive' } },
      { slug: { contains: filters.search, mode: 'insensitive' } },
      { description: { contains: filters.search, mode: 'insensitive' } },
    ];
  }

  // Get total count
  const totalCount = await prisma.integration.count({ where });

  // Get integrations with cursor pagination
  const integrations = await prisma.integration.findMany({
    where,
    take: limit + 1,
    orderBy: { createdAt: 'desc' },
    ...(cursor && {
      cursor: { id: cursor },
      skip: 1,
    }),
  });

  // Determine if there are more results
  const hasMore = integrations.length > limit;
  if (hasMore) {
    integrations.pop();
  }

  // Get next cursor
  const nextCursor =
    hasMore && integrations.length > 0 ? integrations[integrations.length - 1].id : null;

  return {
    integrations,
    nextCursor,
    totalCount,
  };
}

/**
 * Gets all integrations for a tenant (no pagination)
 */
export async function findAllIntegrationsForTenant(tenantId: string): Promise<Integration[]> {
  return prisma.integration.findMany({
    where: { tenantId },
    orderBy: { name: 'asc' },
  });
}

/**
 * Gets integrations with their action counts
 */
export async function findIntegrationsWithCounts(
  tenantId: string,
  pagination: IntegrationPaginationOptions = {}
): Promise<{
  integrations: IntegrationWithCounts[];
  nextCursor: string | null;
  totalCount: number;
}> {
  const { cursor, limit = 20 } = pagination;

  const totalCount = await prisma.integration.count({ where: { tenantId } });

  const integrations = await prisma.integration.findMany({
    where: { tenantId },
    take: limit + 1,
    orderBy: { createdAt: 'desc' },
    include: {
      _count: {
        select: {
          actions: true,
          credentials: true,
        },
      },
    },
    ...(cursor && {
      cursor: { id: cursor },
      skip: 1,
    }),
  });

  const hasMore = integrations.length > limit;
  if (hasMore) {
    integrations.pop();
  }

  const nextCursor =
    hasMore && integrations.length > 0 ? integrations[integrations.length - 1].id : null;

  return {
    integrations,
    nextCursor,
    totalCount,
  };
}

/**
 * Gets integrations with their action counts and connection health summary
 */
export async function findIntegrationsWithCountsAndHealth(
  tenantId: string,
  pagination: IntegrationPaginationOptions = {}
): Promise<{
  integrations: IntegrationWithCountsAndHealth[];
  nextCursor: string | null;
  totalCount: number;
}> {
  const { cursor, limit = 20 } = pagination;

  const totalCount = await prisma.integration.count({ where: { tenantId } });

  const integrations = await prisma.integration.findMany({
    where: { tenantId },
    take: limit + 1,
    orderBy: { createdAt: 'desc' },
    include: {
      _count: {
        select: {
          actions: true,
          credentials: true,
        },
      },
      connections: {
        select: {
          healthStatus: true,
        },
      },
    },
    ...(cursor && {
      cursor: { id: cursor },
      skip: 1,
    }),
  });

  const hasMore = integrations.length > limit;
  if (hasMore) {
    integrations.pop();
  }

  const nextCursor =
    hasMore && integrations.length > 0 ? integrations[integrations.length - 1].id : null;

  // Transform to include connection health summary
  const integrationsWithHealth: IntegrationWithCountsAndHealth[] = integrations.map((int) => {
    const connections = int.connections || [];
    const healthSummary: IntegrationConnectionHealthSummary = {
      totalConnections: connections.length,
      healthy: connections.filter((c) => c.healthStatus === 'healthy').length,
      degraded: connections.filter((c) => c.healthStatus === 'degraded').length,
      unhealthy: connections.filter((c) => c.healthStatus === 'unhealthy').length,
      unknown: connections.filter((c) => !c.healthStatus).length,
    };

    // Remove connections from the object and add connectionHealth
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { connections: _omitted, ...integrationWithoutConnections } = int;
    return {
      ...integrationWithoutConnections,
      connectionHealth: healthSummary,
    };
  });

  return {
    integrations: integrationsWithHealth,
    nextCursor,
    totalCount,
  };
}

/**
 * Gets connection health summary for a single integration
 */
export async function getIntegrationConnectionHealthSummary(
  integrationId: string
): Promise<IntegrationConnectionHealthSummary> {
  const connections = await prisma.connection.findMany({
    where: { integrationId },
    select: { healthStatus: true },
  });

  return {
    totalConnections: connections.length,
    healthy: connections.filter((c) => c.healthStatus === 'healthy').length,
    degraded: connections.filter((c) => c.healthStatus === 'degraded').length,
    unhealthy: connections.filter((c) => c.healthStatus === 'unhealthy').length,
    unknown: connections.filter((c) => !c.healthStatus).length,
  };
}

/**
 * Checks if a slug is already used by another integration in the tenant
 */
export async function isSlugTaken(
  tenantId: string,
  slug: string,
  excludeId?: string
): Promise<boolean> {
  const existing = await prisma.integration.findFirst({
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
// Update Operations
// =============================================================================

/**
 * Updates an integration
 */
export async function updateIntegration(
  id: string,
  input: UpdateIntegrationDbInput
): Promise<Integration> {
  const data: Prisma.IntegrationUpdateInput = {};

  if (input.name !== undefined) data.name = input.name;
  if (input.slug !== undefined) data.slug = input.slug;
  if (input.description !== undefined) data.description = input.description;
  if (input.documentationUrl !== undefined) data.documentationUrl = input.documentationUrl;
  if (input.authType !== undefined) data.authType = input.authType;
  if (input.authConfig !== undefined) data.authConfig = input.authConfig;
  if (input.status !== undefined) data.status = input.status;
  if (input.tags !== undefined) data.tags = input.tags;
  if (input.metadata !== undefined) data.metadata = input.metadata;

  return prisma.integration.update({
    where: { id },
    data,
  });
}

/**
 * Updates integration status
 */
export async function updateIntegrationStatus(
  id: string,
  status: IntegrationStatus
): Promise<Integration> {
  return prisma.integration.update({
    where: { id },
    data: { status },
  });
}

// =============================================================================
// Delete Operations
// =============================================================================

/**
 * Deletes an integration (cascades to actions, credentials, logs)
 */
export async function deleteIntegration(id: string): Promise<Integration> {
  return prisma.integration.delete({
    where: { id },
  });
}

/**
 * Soft-disables an integration
 */
export async function disableIntegration(id: string): Promise<Integration> {
  return prisma.integration.update({
    where: { id },
    data: { status: IntegrationStatus.disabled },
  });
}

// =============================================================================
// Statistics
// =============================================================================

/**
 * Gets integration counts by status for a tenant
 */
export async function getIntegrationCountsByStatus(
  tenantId: string
): Promise<Record<IntegrationStatus, number>> {
  const counts = await prisma.integration.groupBy({
    by: ['status'],
    where: { tenantId },
    _count: true,
  });

  // Initialize all statuses to 0
  const result: Record<IntegrationStatus, number> = {
    [IntegrationStatus.draft]: 0,
    [IntegrationStatus.active]: 0,
    [IntegrationStatus.error]: 0,
    [IntegrationStatus.disabled]: 0,
  };

  // Fill in actual counts
  for (const item of counts) {
    result[item.status] = item._count;
  }

  return result;
}
