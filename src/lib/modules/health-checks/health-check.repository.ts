/**
 * HealthCheck Repository
 *
 * Data access layer for HealthCheck model.
 * Handles CRUD operations and queries for health check records.
 *
 * Health checks track the status of connections across three tiers:
 * - Tier 1 (credential): No API calls, checks credential validity/expiration
 * - Tier 2 (connectivity): Single test action API call
 * - Tier 3 (full_scan): Tests all actions for breaking changes
 */

import { prisma } from '@/lib/db/client';
import {
  HealthCheckStatus,
  HealthCheckTier,
  HealthCheckTrigger,
  CredentialHealthStatus,
  CircuitBreakerStatus,
  Prisma,
} from '@prisma/client';

import type { HealthCheck } from '@prisma/client';

// =============================================================================
// Types
// =============================================================================

/**
 * Input for creating a new health check (repository layer)
 */
export interface CreateHealthCheckDbInput {
  connectionId: string;
  tenantId: string;
  status: HealthCheckStatus;
  checkTier: HealthCheckTier;
  checkTrigger: HealthCheckTrigger;
  durationMs: number;

  // Credential check results (Tier 1+)
  credentialStatus?: CredentialHealthStatus | null;
  credentialExpiresAt?: Date | null;

  // Test action results (Tier 2+)
  testActionId?: string | null;
  testActionSuccess?: boolean | null;
  testActionLatencyMs?: number | null;
  testActionStatusCode?: number | null;
  testActionError?: Prisma.InputJsonValue | null;

  // Full scan results (Tier 3 only)
  actionsScanned?: number | null;
  actionsPassed?: number | null;
  actionsFailed?: number | null;
  scanResults?: Prisma.InputJsonValue | null;

  // User credential health stats
  userCredentialHealth?: Prisma.InputJsonValue | null;

  // Circuit breaker status
  circuitBreakerStatus?: CircuitBreakerStatus | null;

  // Error details
  error?: Prisma.InputJsonValue | null;
}

/**
 * Pagination options for health check queries
 */
export interface HealthCheckPaginationOptions {
  cursor?: string;
  limit?: number;
}

/**
 * Filters for health check queries
 */
export interface HealthCheckFilters {
  tier?: HealthCheckTier;
  status?: HealthCheckStatus;
  credentialStatus?: CredentialHealthStatus;
  startDate?: Date;
  endDate?: Date;
}

/**
 * Paginated result for health checks
 */
export interface PaginatedHealthChecks {
  healthChecks: HealthCheck[];
  nextCursor: string | null;
  totalCount: number;
}

/**
 * Health check with related connection data
 */
export interface HealthCheckWithConnection extends HealthCheck {
  connection: {
    id: string;
    name: string;
    slug: string;
    integrationId: string;
  };
}

/**
 * Health summary statistics
 */
export interface HealthCheckSummary {
  healthy: number;
  degraded: number;
  unhealthy: number;
  total: number;
}

// =============================================================================
// Create Operations
// =============================================================================

/**
 * Creates a new health check record
 */
export async function createHealthCheck(input: CreateHealthCheckDbInput): Promise<HealthCheck> {
  return prisma.healthCheck.create({
    data: {
      connectionId: input.connectionId,
      tenantId: input.tenantId,
      status: input.status,
      checkTier: input.checkTier,
      checkTrigger: input.checkTrigger,
      durationMs: input.durationMs,

      // Credential check results
      credentialStatus: input.credentialStatus ?? null,
      credentialExpiresAt: input.credentialExpiresAt ?? null,

      // Test action results
      testActionId: input.testActionId ?? null,
      testActionSuccess: input.testActionSuccess ?? null,
      testActionLatencyMs: input.testActionLatencyMs ?? null,
      testActionStatusCode: input.testActionStatusCode ?? null,
      testActionError: input.testActionError ?? Prisma.JsonNull,

      // Full scan results
      actionsScanned: input.actionsScanned ?? null,
      actionsPassed: input.actionsPassed ?? null,
      actionsFailed: input.actionsFailed ?? null,
      scanResults: input.scanResults ?? Prisma.JsonNull,

      // User credential health
      userCredentialHealth: input.userCredentialHealth ?? Prisma.JsonNull,

      // Circuit breaker
      circuitBreakerStatus: input.circuitBreakerStatus ?? null,

      // Error
      error: input.error ?? Prisma.JsonNull,
    },
  });
}

// =============================================================================
// Read Operations
// =============================================================================

/**
 * Finds a health check by ID
 */
export async function findHealthCheckById(id: string): Promise<HealthCheck | null> {
  return prisma.healthCheck.findUnique({
    where: { id },
  });
}

/**
 * Finds a health check by ID with tenant verification
 */
export async function findHealthCheckByIdAndTenant(
  id: string,
  tenantId: string
): Promise<HealthCheck | null> {
  return prisma.healthCheck.findFirst({
    where: {
      id,
      tenantId,
    },
  });
}

/**
 * Gets the latest health check for a connection (across all tiers)
 */
export async function getLatestByConnectionId(connectionId: string): Promise<HealthCheck | null> {
  return prisma.healthCheck.findFirst({
    where: { connectionId },
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Gets the latest health check for a connection filtered by tier
 */
export async function getLatestByTier(
  connectionId: string,
  tier: HealthCheckTier
): Promise<HealthCheck | null> {
  return prisma.healthCheck.findFirst({
    where: {
      connectionId,
      checkTier: tier,
    },
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Gets the latest health check for each tier for a connection
 */
export async function getLatestByAllTiers(
  connectionId: string
): Promise<Record<HealthCheckTier, HealthCheck | null>> {
  const [credential, connectivity, fullScan] = await Promise.all([
    getLatestByTier(connectionId, HealthCheckTier.credential),
    getLatestByTier(connectionId, HealthCheckTier.connectivity),
    getLatestByTier(connectionId, HealthCheckTier.full_scan),
  ]);

  return {
    [HealthCheckTier.credential]: credential,
    [HealthCheckTier.connectivity]: connectivity,
    [HealthCheckTier.full_scan]: fullScan,
  };
}

/**
 * Finds health checks for a connection with filtering and pagination
 */
export async function findByConnectionId(
  connectionId: string,
  pagination: HealthCheckPaginationOptions = {},
  filters: HealthCheckFilters = {}
): Promise<PaginatedHealthChecks> {
  const { cursor, limit = 20 } = pagination;

  // Build where clause
  const where: Prisma.HealthCheckWhereInput = {
    connectionId,
  };

  if (filters.tier) {
    where.checkTier = filters.tier;
  }

  if (filters.status) {
    where.status = filters.status;
  }

  if (filters.credentialStatus) {
    where.credentialStatus = filters.credentialStatus;
  }

  if (filters.startDate || filters.endDate) {
    where.createdAt = {};
    if (filters.startDate) {
      where.createdAt.gte = filters.startDate;
    }
    if (filters.endDate) {
      where.createdAt.lte = filters.endDate;
    }
  }

  // Get total count
  const totalCount = await prisma.healthCheck.count({ where });

  // Get health checks with cursor pagination (newest first)
  const healthChecks = await prisma.healthCheck.findMany({
    where,
    take: limit + 1,
    orderBy: { createdAt: 'desc' },
    ...(cursor && {
      cursor: { id: cursor },
      skip: 1,
    }),
  });

  // Determine if there are more results
  const hasMore = healthChecks.length > limit;
  if (hasMore) {
    healthChecks.pop();
  }

  // Get next cursor
  const nextCursor =
    hasMore && healthChecks.length > 0 ? healthChecks[healthChecks.length - 1].id : null;

  return {
    healthChecks,
    nextCursor,
    totalCount,
  };
}

/**
 * Finds health checks for a tenant with filtering and pagination
 */
export async function findByTenantId(
  tenantId: string,
  pagination: HealthCheckPaginationOptions = {},
  filters: HealthCheckFilters = {}
): Promise<PaginatedHealthChecks> {
  const { cursor, limit = 20 } = pagination;

  // Build where clause
  const where: Prisma.HealthCheckWhereInput = {
    tenantId,
  };

  if (filters.tier) {
    where.checkTier = filters.tier;
  }

  if (filters.status) {
    where.status = filters.status;
  }

  if (filters.credentialStatus) {
    where.credentialStatus = filters.credentialStatus;
  }

  if (filters.startDate || filters.endDate) {
    where.createdAt = {};
    if (filters.startDate) {
      where.createdAt.gte = filters.startDate;
    }
    if (filters.endDate) {
      where.createdAt.lte = filters.endDate;
    }
  }

  // Get total count
  const totalCount = await prisma.healthCheck.count({ where });

  // Get health checks with cursor pagination (newest first)
  const healthChecks = await prisma.healthCheck.findMany({
    where,
    take: limit + 1,
    orderBy: { createdAt: 'desc' },
    ...(cursor && {
      cursor: { id: cursor },
      skip: 1,
    }),
  });

  // Determine if there are more results
  const hasMore = healthChecks.length > limit;
  if (hasMore) {
    healthChecks.pop();
  }

  // Get next cursor
  const nextCursor =
    hasMore && healthChecks.length > 0 ? healthChecks[healthChecks.length - 1].id : null;

  return {
    healthChecks,
    nextCursor,
    totalCount,
  };
}

/**
 * Gets health checks with connection data
 */
export async function findWithConnection(
  connectionId: string,
  pagination: HealthCheckPaginationOptions = {}
): Promise<{
  healthChecks: HealthCheckWithConnection[];
  nextCursor: string | null;
  totalCount: number;
}> {
  const { cursor, limit = 20 } = pagination;

  const where = { connectionId };

  const totalCount = await prisma.healthCheck.count({ where });

  const healthChecks = await prisma.healthCheck.findMany({
    where,
    take: limit + 1,
    orderBy: { createdAt: 'desc' },
    include: {
      connection: {
        select: {
          id: true,
          name: true,
          slug: true,
          integrationId: true,
        },
      },
    },
    ...(cursor && {
      cursor: { id: cursor },
      skip: 1,
    }),
  });

  const hasMore = healthChecks.length > limit;
  if (hasMore) {
    healthChecks.pop();
  }

  const nextCursor =
    hasMore && healthChecks.length > 0 ? healthChecks[healthChecks.length - 1].id : null;

  return {
    healthChecks,
    nextCursor,
    totalCount,
  };
}

/**
 * Counts health checks by status for a connection
 */
export async function getHealthCheckCountsByStatus(
  connectionId: string,
  since?: Date
): Promise<HealthCheckSummary> {
  const where: Prisma.HealthCheckWhereInput = { connectionId };

  if (since) {
    where.createdAt = { gte: since };
  }

  const counts = await prisma.healthCheck.groupBy({
    by: ['status'],
    where,
    _count: true,
  });

  // Initialize all statuses to 0
  const result: HealthCheckSummary = {
    healthy: 0,
    degraded: 0,
    unhealthy: 0,
    total: 0,
  };

  // Fill in actual counts
  for (const item of counts) {
    if (item.status === HealthCheckStatus.healthy) {
      result.healthy = item._count;
    } else if (item.status === HealthCheckStatus.degraded) {
      result.degraded = item._count;
    } else if (item.status === HealthCheckStatus.unhealthy) {
      result.unhealthy = item._count;
    }
    result.total += item._count;
  }

  return result;
}

/**
 * Gets health check summary for a tenant
 */
export async function getTenantHealthSummary(
  tenantId: string,
  since?: Date
): Promise<HealthCheckSummary> {
  const where: Prisma.HealthCheckWhereInput = { tenantId };

  if (since) {
    where.createdAt = { gte: since };
  }

  const counts = await prisma.healthCheck.groupBy({
    by: ['status'],
    where,
    _count: true,
  });

  const result: HealthCheckSummary = {
    healthy: 0,
    degraded: 0,
    unhealthy: 0,
    total: 0,
  };

  for (const item of counts) {
    if (item.status === HealthCheckStatus.healthy) {
      result.healthy = item._count;
    } else if (item.status === HealthCheckStatus.degraded) {
      result.degraded = item._count;
    } else if (item.status === HealthCheckStatus.unhealthy) {
      result.unhealthy = item._count;
    }
    result.total += item._count;
  }

  return result;
}

// =============================================================================
// Delete Operations
// =============================================================================

/**
 * Deletes old health check records (for cleanup/retention)
 * Returns the count of deleted records
 */
export async function deleteOldHealthChecks(olderThan: Date): Promise<number> {
  const result = await prisma.healthCheck.deleteMany({
    where: {
      createdAt: { lt: olderThan },
    },
  });

  return result.count;
}

/**
 * Deletes all health checks for a connection
 * Used when deleting a connection (if cascade doesn't handle it)
 */
export async function deleteByConnectionId(connectionId: string): Promise<number> {
  const result = await prisma.healthCheck.deleteMany({
    where: { connectionId },
  });

  return result.count;
}

// =============================================================================
// Utility Queries
// =============================================================================

/**
 * Gets connections that need a credential check (Tier 1)
 * Returns connections where last credential check is older than the specified interval
 */
export async function getConnectionsNeedingCredentialCheck(
  tenantId: string,
  olderThan: Date
): Promise<string[]> {
  const connections = await prisma.connection.findMany({
    where: {
      tenantId,
      OR: [{ lastCredentialCheckAt: null }, { lastCredentialCheckAt: { lt: olderThan } }],
    },
    select: { id: true },
  });

  return connections.map((c) => c.id);
}

/**
 * Gets connections that need a connectivity check (Tier 2)
 */
export async function getConnectionsNeedingConnectivityCheck(
  tenantId: string,
  olderThan: Date
): Promise<string[]> {
  const connections = await prisma.connection.findMany({
    where: {
      tenantId,
      OR: [{ lastConnectivityCheckAt: null }, { lastConnectivityCheckAt: { lt: olderThan } }],
    },
    select: { id: true },
  });

  return connections.map((c) => c.id);
}

/**
 * Gets connections that need a full scan (Tier 3)
 */
export async function getConnectionsNeedingFullScan(
  tenantId: string,
  olderThan: Date
): Promise<string[]> {
  const connections = await prisma.connection.findMany({
    where: {
      tenantId,
      OR: [{ lastFullScanAt: null }, { lastFullScanAt: { lt: olderThan } }],
    },
    select: { id: true },
  });

  return connections.map((c) => c.id);
}

/**
 * Updates connection health status and tier timestamps after a health check
 */
export async function updateConnectionHealthStatus(
  connectionId: string,
  status: HealthCheckStatus,
  tier: HealthCheckTier
): Promise<void> {
  const now = new Date();

  const data: Prisma.ConnectionUpdateInput = {
    healthStatus: status,
  };

  // Update the appropriate tier timestamp
  switch (tier) {
    case HealthCheckTier.credential:
      data.lastCredentialCheckAt = now;
      break;
    case HealthCheckTier.connectivity:
      data.lastConnectivityCheckAt = now;
      break;
    case HealthCheckTier.full_scan:
      data.lastFullScanAt = now;
      break;
  }

  await prisma.connection.update({
    where: { id: connectionId },
    data,
  });
}

/**
 * Gets all connections for a tenant with their health status
 */
export async function getConnectionsWithHealthStatus(tenantId: string): Promise<
  Array<{
    id: string;
    name: string;
    slug: string;
    integrationId: string;
    healthStatus: HealthCheckStatus;
    lastCredentialCheckAt: Date | null;
    lastConnectivityCheckAt: Date | null;
    lastFullScanAt: Date | null;
  }>
> {
  return prisma.connection.findMany({
    where: { tenantId },
    select: {
      id: true,
      name: true,
      slug: true,
      integrationId: true,
      healthStatus: true,
      lastCredentialCheckAt: true,
      lastConnectivityCheckAt: true,
      lastFullScanAt: true,
    },
    orderBy: { name: 'asc' },
  });
}
