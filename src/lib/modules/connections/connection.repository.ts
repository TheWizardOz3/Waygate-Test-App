/**
 * Connection Repository
 *
 * Data access layer for Connection model.
 * Handles CRUD operations and queries for connections.
 *
 * Connections link consuming apps to integrations with their own credentials.
 * They are scoped to both tenant and integration for isolation.
 */

import { prisma } from '@/lib/db/client';
import { ConnectionStatus, Prisma } from '@prisma/client';

import type { Connection } from '@prisma/client';
import type { ConnectionFilters } from './connection.schemas';

// =============================================================================
// Types
// =============================================================================

/**
 * Input for creating a new connection (repository layer)
 */
export interface CreateConnectionDbInput {
  tenantId: string;
  integrationId: string;
  name: string;
  slug: string;
  baseUrl?: string | null;
  isPrimary?: boolean;
  status?: ConnectionStatus;
  metadata?: Prisma.InputJsonValue;
}

/**
 * Input for updating a connection (repository layer)
 */
export interface UpdateConnectionDbInput {
  name?: string;
  slug?: string;
  baseUrl?: string | null;
  isPrimary?: boolean;
  status?: ConnectionStatus;
  metadata?: Prisma.InputJsonValue;
}

/**
 * Pagination options
 */
export interface ConnectionPaginationOptions {
  cursor?: string;
  limit?: number;
}

/**
 * Paginated result
 */
export interface PaginatedConnections {
  connections: Connection[];
  nextCursor: string | null;
  totalCount: number;
}

/**
 * Connection with credential count
 */
export interface ConnectionWithCounts extends Connection {
  _count: {
    credentials: number;
  };
}

// =============================================================================
// Create Operations
// =============================================================================

/**
 * Creates a new connection
 */
export async function createConnection(input: CreateConnectionDbInput): Promise<Connection> {
  return prisma.connection.create({
    data: {
      tenantId: input.tenantId,
      integrationId: input.integrationId,
      name: input.name,
      slug: input.slug,
      baseUrl: input.baseUrl ?? null,
      isPrimary: input.isPrimary ?? false,
      status: input.status ?? ConnectionStatus.active,
      metadata: input.metadata ?? {},
    },
  });
}

/**
 * Creates a default connection for an integration if none exists
 */
export async function createDefaultConnectionIfNeeded(
  tenantId: string,
  integrationId: string
): Promise<Connection> {
  // Check if any connection exists
  const existing = await prisma.connection.findFirst({
    where: { tenantId, integrationId },
  });

  if (existing) {
    return existing;
  }

  // Create default connection
  return prisma.connection.create({
    data: {
      tenantId,
      integrationId,
      name: 'Default',
      slug: 'default',
      isPrimary: true,
      status: ConnectionStatus.active,
      metadata: {},
    },
  });
}

// =============================================================================
// Read Operations
// =============================================================================

/**
 * Finds a connection by ID
 */
export async function findConnectionById(id: string): Promise<Connection | null> {
  return prisma.connection.findUnique({
    where: { id },
  });
}

/**
 * Finds a connection by ID with tenant verification
 */
export async function findConnectionByIdAndTenant(
  id: string,
  tenantId: string
): Promise<Connection | null> {
  return prisma.connection.findFirst({
    where: {
      id,
      tenantId,
    },
  });
}

/**
 * Finds a connection by slug within a tenant and integration
 */
export async function findConnectionBySlug(
  tenantId: string,
  integrationId: string,
  slug: string
): Promise<Connection | null> {
  return prisma.connection.findFirst({
    where: {
      tenantId,
      integrationId,
      slug,
    },
  });
}

/**
 * Finds the primary connection for an integration
 */
export async function findPrimaryConnection(
  tenantId: string,
  integrationId: string
): Promise<Connection | null> {
  return prisma.connection.findFirst({
    where: {
      tenantId,
      integrationId,
      isPrimary: true,
    },
  });
}

/**
 * Finds the first available connection for an integration
 * Used when no specific connection is requested
 */
export async function findFirstActiveConnection(
  tenantId: string,
  integrationId: string
): Promise<Connection | null> {
  // First try to find the primary connection
  const primary = await findPrimaryConnection(tenantId, integrationId);
  if (primary && primary.status === ConnectionStatus.active) {
    return primary;
  }

  // Fall back to any active connection
  return prisma.connection.findFirst({
    where: {
      tenantId,
      integrationId,
      status: ConnectionStatus.active,
    },
    orderBy: { createdAt: 'asc' },
  });
}

/**
 * Queries connections for an integration with filters and pagination
 */
export async function findConnectionsPaginated(
  tenantId: string,
  integrationId: string,
  pagination: ConnectionPaginationOptions = {},
  filters: ConnectionFilters = {}
): Promise<PaginatedConnections> {
  const { cursor, limit = 20 } = pagination;

  // Build where clause
  const where: Prisma.ConnectionWhereInput = {
    tenantId,
    integrationId,
  };

  if (filters.status) {
    where.status = filters.status as ConnectionStatus;
  }

  if (filters.isPrimary !== undefined) {
    where.isPrimary = filters.isPrimary;
  }

  if (filters.search) {
    where.OR = [
      { name: { contains: filters.search, mode: 'insensitive' } },
      { slug: { contains: filters.search, mode: 'insensitive' } },
    ];
  }

  // Get total count
  const totalCount = await prisma.connection.count({ where });

  // Get connections with cursor pagination
  const connections = await prisma.connection.findMany({
    where,
    take: limit + 1,
    orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }], // Primary first, then by creation date
    ...(cursor && {
      cursor: { id: cursor },
      skip: 1,
    }),
  });

  // Determine if there are more results
  const hasMore = connections.length > limit;
  if (hasMore) {
    connections.pop();
  }

  // Get next cursor
  const nextCursor =
    hasMore && connections.length > 0 ? connections[connections.length - 1].id : null;

  return {
    connections,
    nextCursor,
    totalCount,
  };
}

/**
 * Gets all connections for an integration (no pagination)
 */
export async function findAllConnectionsForIntegration(
  tenantId: string,
  integrationId: string
): Promise<Connection[]> {
  return prisma.connection.findMany({
    where: { tenantId, integrationId },
    orderBy: [{ isPrimary: 'desc' }, { name: 'asc' }],
  });
}

/**
 * Gets connections with their credential counts
 */
export async function findConnectionsWithCounts(
  tenantId: string,
  integrationId: string,
  pagination: ConnectionPaginationOptions = {}
): Promise<{
  connections: ConnectionWithCounts[];
  nextCursor: string | null;
  totalCount: number;
}> {
  const { cursor, limit = 20 } = pagination;

  const where = { tenantId, integrationId };

  const totalCount = await prisma.connection.count({ where });

  const connections = await prisma.connection.findMany({
    where,
    take: limit + 1,
    orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
    include: {
      _count: {
        select: {
          credentials: true,
        },
      },
    },
    ...(cursor && {
      cursor: { id: cursor },
      skip: 1,
    }),
  });

  const hasMore = connections.length > limit;
  if (hasMore) {
    connections.pop();
  }

  const nextCursor =
    hasMore && connections.length > 0 ? connections[connections.length - 1].id : null;

  return {
    connections,
    nextCursor,
    totalCount,
  };
}

/**
 * Checks if a slug is already used by another connection in the tenant+integration
 */
export async function isSlugTaken(
  tenantId: string,
  integrationId: string,
  slug: string,
  excludeId?: string
): Promise<boolean> {
  const existing = await prisma.connection.findFirst({
    where: {
      tenantId,
      integrationId,
      slug,
      ...(excludeId && { id: { not: excludeId } }),
    },
    select: { id: true },
  });
  return existing !== null;
}

/**
 * Counts connections for an integration
 */
export async function countConnectionsForIntegration(
  tenantId: string,
  integrationId: string
): Promise<number> {
  return prisma.connection.count({
    where: { tenantId, integrationId },
  });
}

// =============================================================================
// Update Operations
// =============================================================================

/**
 * Updates a connection
 */
export async function updateConnection(
  id: string,
  input: UpdateConnectionDbInput
): Promise<Connection> {
  const data: Prisma.ConnectionUpdateInput = {};

  if (input.name !== undefined) data.name = input.name;
  if (input.slug !== undefined) data.slug = input.slug;
  if (input.baseUrl !== undefined) data.baseUrl = input.baseUrl;
  if (input.isPrimary !== undefined) data.isPrimary = input.isPrimary;
  if (input.status !== undefined) data.status = input.status;
  if (input.metadata !== undefined) data.metadata = input.metadata;

  return prisma.connection.update({
    where: { id },
    data,
  });
}

/**
 * Updates connection status
 */
export async function updateConnectionStatus(
  id: string,
  status: ConnectionStatus
): Promise<Connection> {
  return prisma.connection.update({
    where: { id },
    data: { status },
  });
}

/**
 * Sets a connection as primary (and unsets others)
 */
export async function setConnectionAsPrimary(
  tenantId: string,
  integrationId: string,
  connectionId: string
): Promise<Connection> {
  // Unset any existing primary connections
  await prisma.connection.updateMany({
    where: {
      tenantId,
      integrationId,
      isPrimary: true,
      id: { not: connectionId },
    },
    data: { isPrimary: false },
  });

  // Set this connection as primary
  return prisma.connection.update({
    where: { id: connectionId },
    data: { isPrimary: true },
  });
}

// =============================================================================
// Delete Operations
// =============================================================================

/**
 * Deletes a connection (cascades to credentials)
 */
export async function deleteConnection(id: string): Promise<Connection> {
  return prisma.connection.delete({
    where: { id },
  });
}

/**
 * Soft-disables a connection
 */
export async function disableConnection(id: string): Promise<Connection> {
  return prisma.connection.update({
    where: { id },
    data: { status: ConnectionStatus.disabled },
  });
}

// =============================================================================
// Statistics
// =============================================================================

/**
 * Gets connection counts by status for an integration
 */
export async function getConnectionCountsByStatus(
  tenantId: string,
  integrationId: string
): Promise<Record<ConnectionStatus, number>> {
  const counts = await prisma.connection.groupBy({
    by: ['status'],
    where: { tenantId, integrationId },
    _count: true,
  });

  // Initialize all statuses to 0
  const result: Record<ConnectionStatus, number> = {
    [ConnectionStatus.active]: 0,
    [ConnectionStatus.error]: 0,
    [ConnectionStatus.disabled]: 0,
  };

  // Fill in actual counts
  for (const item of counts) {
    result[item.status] = item._count;
  }

  return result;
}
