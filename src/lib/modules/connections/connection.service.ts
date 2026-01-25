/**
 * Connection Service
 *
 * Business logic layer for connection management.
 * Handles CRUD operations with tenant verification and validation.
 *
 * Connections enable multiple consuming apps to connect to the same integration
 * with separate credentials and configurations.
 */

import { ConnectionStatus, Prisma } from '@prisma/client';
import {
  createConnection as repoCreateConnection,
  createDefaultConnectionIfNeeded,
  findConnectionByIdAndTenant,
  findConnectionBySlug,
  findPrimaryConnection,
  findFirstActiveConnection,
  findConnectionsPaginated,
  findAllConnectionsForIntegration,
  findConnectionsWithCounts,
  isSlugTaken,
  updateConnection as repoUpdateConnection,
  updateConnectionStatus,
  setConnectionAsPrimary as repoSetConnectionAsPrimary,
  deleteConnection as repoDeleteConnection,
  disableConnection as repoDisableConnection,
  getConnectionCountsByStatus,
  countConnectionsForIntegration,
  type CreateConnectionDbInput,
  type UpdateConnectionDbInput,
  type ConnectionPaginationOptions,
} from './connection.repository';
import { findIntegrationByIdAndTenant } from '../integrations/integration.repository';
import {
  CreateConnectionInputSchema,
  UpdateConnectionInputSchema,
  ListConnectionsQuerySchema,
  toConnectionResponse,
  ConnectionErrorCodes,
  type CreateConnectionInput,
  type UpdateConnectionInput,
  type ListConnectionsQuery,
  type ConnectionFilters,
  type ConnectionResponse,
  type ListConnectionsResponse,
} from './connection.schemas';

import type { Connection } from '@prisma/client';

// =============================================================================
// Error Class
// =============================================================================

/**
 * Error thrown when connection operations fail
 */
export class ConnectionError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number = 400
  ) {
    super(message);
    this.name = 'ConnectionError';
  }
}

// =============================================================================
// Create Operations
// =============================================================================

/**
 * Creates a new connection for an integration
 *
 * @param tenantId - The tenant creating the connection
 * @param integrationId - The integration to connect to
 * @param input - Connection creation data
 * @returns The created connection
 */
export async function createConnection(
  tenantId: string,
  integrationId: string,
  input: CreateConnectionInput
): Promise<ConnectionResponse> {
  // Validate input
  const parsed = CreateConnectionInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new ConnectionError(
      ConnectionErrorCodes.INVALID_STATUS,
      `Invalid connection data: ${parsed.error.message}`
    );
  }

  const data = parsed.data;

  // Verify integration exists and belongs to tenant
  const integration = await findIntegrationByIdAndTenant(integrationId, tenantId);
  if (!integration) {
    throw new ConnectionError(
      ConnectionErrorCodes.INTEGRATION_NOT_FOUND,
      'Integration not found',
      404
    );
  }

  // Check for slug collision
  const slugExists = await isSlugTaken(tenantId, integrationId, data.slug);
  if (slugExists) {
    throw new ConnectionError(
      ConnectionErrorCodes.DUPLICATE_SLUG,
      `A connection with slug '${data.slug}' already exists for this integration`
    );
  }

  // Create the connection
  const dbInput: CreateConnectionDbInput = {
    tenantId,
    integrationId,
    name: data.name,
    slug: data.slug,
    baseUrl: data.baseUrl,
    isPrimary: data.isPrimary,
    metadata: data.metadata as Prisma.InputJsonValue,
  };

  const connection = await repoCreateConnection(dbInput);

  // If this is marked as primary, ensure no other connections are primary
  if (data.isPrimary) {
    await repoSetConnectionAsPrimary(tenantId, integrationId, connection.id);
  }

  return toConnectionResponse(connection);
}

/**
 * Ensures a default connection exists for an integration
 * Used for backward compatibility with existing integrations
 */
export async function ensureDefaultConnection(
  tenantId: string,
  integrationId: string
): Promise<ConnectionResponse> {
  const connection = await createDefaultConnectionIfNeeded(tenantId, integrationId);
  return toConnectionResponse(connection);
}

// =============================================================================
// Read Operations
// =============================================================================

/**
 * Gets a connection by ID with tenant verification
 *
 * @param tenantId - The tenant requesting the connection
 * @param connectionId - The connection ID
 * @returns The connection
 * @throws ConnectionError if not found
 */
export async function getConnectionById(
  tenantId: string,
  connectionId: string
): Promise<ConnectionResponse> {
  const connection = await findConnectionByIdAndTenant(connectionId, tenantId);

  if (!connection) {
    throw new ConnectionError(
      ConnectionErrorCodes.CONNECTION_NOT_FOUND,
      'Connection not found',
      404
    );
  }

  return toConnectionResponse(connection);
}

/**
 * Gets a connection by ID, returning the raw database model
 * Used internally
 */
export async function getConnectionByIdRaw(
  tenantId: string,
  connectionId: string
): Promise<Connection> {
  const connection = await findConnectionByIdAndTenant(connectionId, tenantId);

  if (!connection) {
    throw new ConnectionError(
      ConnectionErrorCodes.CONNECTION_NOT_FOUND,
      'Connection not found',
      404
    );
  }

  return connection;
}

/**
 * Gets a connection by slug with tenant verification
 *
 * @param tenantId - The tenant ID
 * @param integrationId - The integration ID
 * @param slug - The connection slug
 * @returns The connection
 * @throws ConnectionError if not found
 */
export async function getConnectionBySlug(
  tenantId: string,
  integrationId: string,
  slug: string
): Promise<ConnectionResponse> {
  const connection = await findConnectionBySlug(tenantId, integrationId, slug);

  if (!connection) {
    throw new ConnectionError(
      ConnectionErrorCodes.CONNECTION_NOT_FOUND,
      `Connection '${slug}' not found`,
      404
    );
  }

  return toConnectionResponse(connection);
}

/**
 * Gets the primary connection for an integration
 * Returns null if no primary connection exists
 */
export async function getPrimaryConnection(
  tenantId: string,
  integrationId: string
): Promise<ConnectionResponse | null> {
  const connection = await findPrimaryConnection(tenantId, integrationId);
  return connection ? toConnectionResponse(connection) : null;
}

/**
 * Gets the default connection to use for an integration
 * Prefers primary, falls back to first active connection
 * Creates a default connection if none exist
 */
export async function getDefaultConnection(
  tenantId: string,
  integrationId: string
): Promise<Connection> {
  // Try to find an existing active connection
  const connection = await findFirstActiveConnection(tenantId, integrationId);

  if (connection) {
    return connection;
  }

  // No active connections exist - create default
  return createDefaultConnectionIfNeeded(tenantId, integrationId);
}

/**
 * Resolves which connection to use based on optional connectionId
 * If no connectionId provided, uses default resolution strategy
 */
export async function resolveConnection(
  tenantId: string,
  integrationId: string,
  connectionId?: string | null
): Promise<Connection> {
  // If specific connection requested, use it
  if (connectionId) {
    const connection = await findConnectionByIdAndTenant(connectionId, tenantId);
    if (!connection) {
      throw new ConnectionError(
        ConnectionErrorCodes.CONNECTION_NOT_FOUND,
        'Connection not found',
        404
      );
    }
    if (connection.integrationId !== integrationId) {
      throw new ConnectionError(
        ConnectionErrorCodes.CONNECTION_NOT_FOUND,
        'Connection does not belong to this integration',
        404
      );
    }
    if (connection.status === ConnectionStatus.disabled) {
      throw new ConnectionError(
        ConnectionErrorCodes.CONNECTION_DISABLED,
        'Connection is disabled',
        403
      );
    }
    return connection;
  }

  // Use default resolution
  return getDefaultConnection(tenantId, integrationId);
}

/**
 * Lists connections for an integration with filtering and pagination
 *
 * @param tenantId - The tenant ID
 * @param integrationId - The integration ID
 * @param query - Query parameters
 * @returns Paginated list of connections
 */
export async function listConnections(
  tenantId: string,
  integrationId: string,
  query: Partial<ListConnectionsQuery> = {}
): Promise<ListConnectionsResponse> {
  // Validate query
  const parsed = ListConnectionsQuerySchema.safeParse(query);
  if (!parsed.success) {
    throw new ConnectionError(
      ConnectionErrorCodes.INVALID_STATUS,
      `Invalid query parameters: ${parsed.error.message}`
    );
  }

  const { cursor, limit, status, isPrimary, search } = parsed.data;

  // Verify integration exists
  const integration = await findIntegrationByIdAndTenant(integrationId, tenantId);
  if (!integration) {
    throw new ConnectionError(
      ConnectionErrorCodes.INTEGRATION_NOT_FOUND,
      'Integration not found',
      404
    );
  }

  // Build filters
  const filters: ConnectionFilters = {};
  if (status) filters.status = status;
  if (isPrimary !== undefined) filters.isPrimary = isPrimary;
  if (search) filters.search = search;

  // Build pagination options
  const paginationOptions: ConnectionPaginationOptions = { limit };
  if (cursor) paginationOptions.cursor = cursor;

  // Query
  const result = await findConnectionsPaginated(
    tenantId,
    integrationId,
    paginationOptions,
    filters
  );

  return {
    connections: result.connections.map(toConnectionResponse),
    pagination: {
      cursor: result.nextCursor,
      hasMore: result.nextCursor !== null,
      totalCount: result.totalCount,
    },
  };
}

/**
 * Gets all connections for an integration (no pagination)
 * Use sparingly - prefer paginated list
 */
export async function getAllConnections(
  tenantId: string,
  integrationId: string
): Promise<ConnectionResponse[]> {
  const connections = await findAllConnectionsForIntegration(tenantId, integrationId);
  return connections.map(toConnectionResponse);
}

/**
 * Gets connections with credential counts (for UI)
 */
export async function getConnectionsWithCounts(
  tenantId: string,
  integrationId: string,
  query: Partial<ListConnectionsQuery> = {}
): Promise<{
  connections: (ConnectionResponse & { credentialCount: number })[];
  pagination: { cursor: string | null; hasMore: boolean; totalCount: number };
}> {
  const parsed = ListConnectionsQuerySchema.safeParse(query);
  if (!parsed.success) {
    throw new ConnectionError(
      ConnectionErrorCodes.INVALID_STATUS,
      `Invalid query parameters: ${parsed.error.message}`
    );
  }

  const { cursor, limit } = parsed.data;

  const result = await findConnectionsWithCounts(tenantId, integrationId, { cursor, limit });

  return {
    connections: result.connections.map((conn) => ({
      ...toConnectionResponse(conn),
      credentialCount: conn._count.credentials,
    })),
    pagination: {
      cursor: result.nextCursor,
      hasMore: result.nextCursor !== null,
      totalCount: result.totalCount,
    },
  };
}

// =============================================================================
// Update Operations
// =============================================================================

/**
 * Updates a connection
 *
 * @param tenantId - The tenant making the update
 * @param connectionId - The connection ID to update
 * @param input - Update data
 * @returns The updated connection
 */
export async function updateConnection(
  tenantId: string,
  connectionId: string,
  input: UpdateConnectionInput
): Promise<ConnectionResponse> {
  // Validate input
  const parsed = UpdateConnectionInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new ConnectionError(
      ConnectionErrorCodes.INVALID_STATUS,
      `Invalid connection data: ${parsed.error.message}`
    );
  }

  const data = parsed.data;

  // Verify connection exists and belongs to tenant
  const existing = await findConnectionByIdAndTenant(connectionId, tenantId);
  if (!existing) {
    throw new ConnectionError(
      ConnectionErrorCodes.CONNECTION_NOT_FOUND,
      'Connection not found',
      404
    );
  }

  // Check for slug collision if slug is being changed
  if (data.slug && data.slug !== existing.slug) {
    const slugExists = await isSlugTaken(tenantId, existing.integrationId, data.slug, connectionId);
    if (slugExists) {
      throw new ConnectionError(
        ConnectionErrorCodes.DUPLICATE_SLUG,
        `A connection with slug '${data.slug}' already exists for this integration`
      );
    }
  }

  // Build update input
  const updateInput: UpdateConnectionDbInput = {};
  if (data.name !== undefined) updateInput.name = data.name;
  if (data.slug !== undefined) updateInput.slug = data.slug;
  if (data.baseUrl !== undefined) updateInput.baseUrl = data.baseUrl;
  if (data.isPrimary !== undefined) updateInput.isPrimary = data.isPrimary;
  if (data.status !== undefined) updateInput.status = data.status as ConnectionStatus;
  if (data.metadata !== undefined) updateInput.metadata = data.metadata as Prisma.InputJsonValue;

  const updated = await repoUpdateConnection(connectionId, updateInput);

  // If setting as primary, ensure no other connections are primary
  if (data.isPrimary === true) {
    await repoSetConnectionAsPrimary(tenantId, existing.integrationId, connectionId);
  }

  return toConnectionResponse(updated);
}

/**
 * Sets a connection as the primary for its integration
 */
export async function setAsPrimary(
  tenantId: string,
  connectionId: string
): Promise<ConnectionResponse> {
  const existing = await findConnectionByIdAndTenant(connectionId, tenantId);
  if (!existing) {
    throw new ConnectionError(
      ConnectionErrorCodes.CONNECTION_NOT_FOUND,
      'Connection not found',
      404
    );
  }

  const updated = await repoSetConnectionAsPrimary(tenantId, existing.integrationId, connectionId);

  return toConnectionResponse(updated);
}

/**
 * Sets connection to error status
 */
export async function markConnectionError(
  tenantId: string,
  connectionId: string
): Promise<ConnectionResponse> {
  const existing = await findConnectionByIdAndTenant(connectionId, tenantId);
  if (!existing) {
    throw new ConnectionError(
      ConnectionErrorCodes.CONNECTION_NOT_FOUND,
      'Connection not found',
      404
    );
  }

  const updated = await updateConnectionStatus(connectionId, ConnectionStatus.error);

  return toConnectionResponse(updated);
}

// =============================================================================
// Delete Operations
// =============================================================================

/**
 * Deletes a connection
 *
 * @param tenantId - The tenant making the deletion
 * @param connectionId - The connection ID to delete
 */
export async function deleteConnection(tenantId: string, connectionId: string): Promise<void> {
  // Verify connection exists and belongs to tenant
  const existing = await findConnectionByIdAndTenant(connectionId, tenantId);
  if (!existing) {
    throw new ConnectionError(
      ConnectionErrorCodes.CONNECTION_NOT_FOUND,
      'Connection not found',
      404
    );
  }

  // Check if this is the only connection
  const connectionCount = await countConnectionsForIntegration(tenantId, existing.integrationId);
  if (connectionCount === 1) {
    throw new ConnectionError(
      ConnectionErrorCodes.CANNOT_DELETE_PRIMARY,
      'Cannot delete the last connection for an integration'
    );
  }

  // If deleting the primary, promote another connection
  if (existing.isPrimary) {
    const others = await findAllConnectionsForIntegration(tenantId, existing.integrationId);
    const nextPrimary = others.find((c) => c.id !== connectionId);
    if (nextPrimary) {
      await repoSetConnectionAsPrimary(tenantId, existing.integrationId, nextPrimary.id);
    }
  }

  await repoDeleteConnection(connectionId);
}

/**
 * Disables a connection (soft delete)
 */
export async function disableConnection(
  tenantId: string,
  connectionId: string
): Promise<ConnectionResponse> {
  const existing = await findConnectionByIdAndTenant(connectionId, tenantId);
  if (!existing) {
    throw new ConnectionError(
      ConnectionErrorCodes.CONNECTION_NOT_FOUND,
      'Connection not found',
      404
    );
  }

  const updated = await repoDisableConnection(connectionId);

  return toConnectionResponse(updated);
}

// =============================================================================
// Statistics
// =============================================================================

/**
 * Gets connection statistics for an integration
 */
export async function getConnectionStats(
  tenantId: string,
  integrationId: string
): Promise<{
  total: number;
  byStatus: Record<string, number>;
}> {
  const byStatus = await getConnectionCountsByStatus(tenantId, integrationId);
  const total = Object.values(byStatus).reduce((sum, count) => sum + count, 0);

  return {
    total,
    byStatus,
  };
}
