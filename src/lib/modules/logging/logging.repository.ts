/**
 * Logging Repository
 *
 * Data access layer for RequestLog model.
 * Handles CRUD operations and queries for request logs (audit trail).
 *
 * Request logs are scoped to tenants for data isolation.
 */

import { prisma } from '@/lib/db/client';
import { Prisma } from '@prisma/client';

import type { RequestLog } from '@prisma/client';
import type { RequestLogFilters } from './logging.schemas';

// =============================================================================
// Types
// =============================================================================

/**
 * Input for creating a request log (repository layer)
 */
export interface CreateRequestLogDbInput {
  tenantId: string;
  integrationId: string;
  actionId: string;
  requestSummary: Prisma.InputJsonValue;
  responseSummary?: Prisma.InputJsonValue;
  statusCode?: number;
  latencyMs: number;
  retryCount?: number;
  error?: Prisma.InputJsonValue;
}

/**
 * Pagination options for log queries
 */
export interface LogPaginationOptions {
  cursor?: string;
  limit?: number;
}

/**
 * Paginated result for logs
 */
export interface PaginatedLogs {
  logs: RequestLog[];
  nextCursor: string | null;
  totalCount: number;
}

// =============================================================================
// Create Operations
// =============================================================================

/**
 * Creates a new request log entry
 */
export async function createRequestLog(input: CreateRequestLogDbInput): Promise<RequestLog> {
  return prisma.requestLog.create({
    data: {
      tenantId: input.tenantId,
      integrationId: input.integrationId,
      actionId: input.actionId,
      requestSummary: input.requestSummary,
      responseSummary: input.responseSummary ?? Prisma.JsonNull,
      statusCode: input.statusCode ?? null,
      latencyMs: input.latencyMs,
      retryCount: input.retryCount ?? 0,
      error: input.error ?? Prisma.JsonNull,
    },
  });
}

// =============================================================================
// Read Operations
// =============================================================================

/**
 * Finds a request log by ID
 */
export async function findRequestLogById(id: string): Promise<RequestLog | null> {
  return prisma.requestLog.findUnique({
    where: { id },
  });
}

/**
 * Finds a request log by ID with tenant verification
 */
export async function findRequestLogByIdAndTenant(
  id: string,
  tenantId: string
): Promise<RequestLog | null> {
  return prisma.requestLog.findFirst({
    where: {
      id,
      tenantId,
    },
  });
}

/**
 * Queries request logs with filters and pagination
 */
export async function findRequestLogsPaginated(
  tenantId: string,
  pagination: LogPaginationOptions = {},
  filters: RequestLogFilters = {}
): Promise<PaginatedLogs> {
  const { cursor, limit = 20 } = pagination;

  // Build where clause
  const where: Prisma.RequestLogWhereInput = {
    tenantId,
  };

  if (filters.integrationId) {
    where.integrationId = filters.integrationId;
  }

  if (filters.actionId) {
    where.actionId = filters.actionId;
  }

  if (filters.statusCode !== undefined) {
    where.statusCode = filters.statusCode;
  }

  if (filters.hasError !== undefined) {
    // For nullable Json fields, use DbNull for database-level null checks
    where.error = filters.hasError ? { not: Prisma.DbNull } : { equals: Prisma.DbNull };
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
  const totalCount = await prisma.requestLog.count({ where });

  // Get logs with cursor pagination
  const logs = await prisma.requestLog.findMany({
    where,
    take: limit + 1, // Take one extra to determine if there are more
    orderBy: { createdAt: 'desc' },
    ...(cursor && {
      cursor: { id: cursor },
      skip: 1, // Skip the cursor itself
    }),
  });

  // Determine if there are more results
  const hasMore = logs.length > limit;
  if (hasMore) {
    logs.pop(); // Remove the extra item
  }

  // Get next cursor
  const nextCursor = hasMore && logs.length > 0 ? logs[logs.length - 1].id : null;

  return {
    logs,
    nextCursor,
    totalCount,
  };
}

/**
 * Gets the most recent log for an integration
 * Useful for health checks
 */
export async function findLatestLogForIntegration(
  integrationId: string,
  tenantId: string
): Promise<RequestLog | null> {
  return prisma.requestLog.findFirst({
    where: {
      integrationId,
      tenantId,
    },
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Gets the most recent successful log for an integration
 */
export async function findLatestSuccessfulLogForIntegration(
  integrationId: string,
  tenantId: string
): Promise<RequestLog | null> {
  return prisma.requestLog.findFirst({
    where: {
      integrationId,
      tenantId,
      statusCode: {
        gte: 200,
        lt: 300,
      },
      error: { equals: Prisma.DbNull },
    },
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Gets recent logs for an integration (for debugging)
 */
export async function findRecentLogsForIntegration(
  integrationId: string,
  tenantId: string,
  limit: number = 10
): Promise<RequestLog[]> {
  return prisma.requestLog.findMany({
    where: {
      integrationId,
      tenantId,
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}

/**
 * Gets log statistics for an integration
 */
export async function getLogStatsForIntegration(
  integrationId: string,
  tenantId: string,
  since?: Date
): Promise<{
  total: number;
  successful: number;
  failed: number;
  avgLatencyMs: number;
}> {
  const where: Prisma.RequestLogWhereInput = {
    integrationId,
    tenantId,
    ...(since && { createdAt: { gte: since } }),
  };

  const [total, successful, aggregation] = await Promise.all([
    prisma.requestLog.count({ where }),
    prisma.requestLog.count({
      where: {
        ...where,
        statusCode: { gte: 200, lt: 300 },
        error: { equals: Prisma.DbNull },
      },
    }),
    prisma.requestLog.aggregate({
      where,
      _avg: { latencyMs: true },
    }),
  ]);

  return {
    total,
    successful,
    failed: total - successful,
    avgLatencyMs: Math.round(aggregation._avg.latencyMs ?? 0),
  };
}

// =============================================================================
// Delete Operations
// =============================================================================

/**
 * Deletes old logs (for retention policy)
 * @param olderThan - Delete logs older than this date
 * @returns Number of deleted logs
 */
export async function deleteOldLogs(olderThan: Date): Promise<number> {
  const result = await prisma.requestLog.deleteMany({
    where: {
      createdAt: { lt: olderThan },
    },
  });
  return result.count;
}

/**
 * Deletes all logs for an integration
 */
export async function deleteLogsForIntegration(
  integrationId: string,
  tenantId: string
): Promise<number> {
  const result = await prisma.requestLog.deleteMany({
    where: {
      integrationId,
      tenantId,
    },
  });
  return result.count;
}
