/**
 * Schema Drift Detection Repository
 *
 * Data access layer for DriftReport CRUD operations.
 * All queries are tenant-scoped. Cursor-based pagination for list queries.
 */

import prisma from '@/lib/db/client';
import type { DriftReport, DriftReportStatus, DriftSeverity, Prisma } from '@prisma/client';

// =============================================================================
// Types
// =============================================================================

/** Input for creating or updating a drift report via upsert */
export interface UpsertDriftReportInput {
  integrationId: string;
  tenantId: string;
  actionId: string;
  fingerprint: string;
  issueCode: string;
  severity: DriftSeverity;
  fieldPath: string;
  expectedType: string | null;
  currentType: string | null;
  description: string;
  failureCount: number;
}

/** Pagination options for list queries */
export interface DriftReportPaginationOptions {
  cursor?: string;
  limit?: number;
}

/** Filter options for list queries */
export interface DriftReportFilterOptions {
  severity?: string;
  status?: string;
  actionId?: string;
}

/** Paginated result set */
export interface PaginatedDriftReports {
  reports: DriftReport[];
  nextCursor: string | null;
  totalCount: number;
}

/** Unresolved counts by severity */
export interface DriftSummaryCounts {
  breaking: number;
  warning: number;
  info: number;
}

// =============================================================================
// Repository Functions
// =============================================================================

/**
 * Upsert a drift report by fingerprint.
 * - If no report with this fingerprint exists: creates a new one.
 * - If an unresolved report exists: updates lastDetectedAt, scanCount, failureCount.
 * - If a resolved/dismissed report exists: skips (no reopen).
 *
 * Returns true if a new report was created, false otherwise.
 */
export async function upsertDriftReport(input: UpsertDriftReportInput): Promise<boolean> {
  const now = new Date();

  const existing = await prisma.driftReport.findUnique({
    where: {
      drift_reports_integration_fingerprint_idx: {
        integrationId: input.integrationId,
        fingerprint: input.fingerprint,
      },
    },
    select: { id: true, status: true },
  });

  // Skip resolved/dismissed reports — don't reopen
  if (existing && (existing.status === 'resolved' || existing.status === 'dismissed')) {
    return false;
  }

  if (existing) {
    // Update existing unresolved report
    await prisma.driftReport.update({
      where: { id: existing.id },
      data: {
        lastDetectedAt: now,
        scanCount: { increment: 1 },
        failureCount: input.failureCount,
        expectedType: input.expectedType,
        currentType: input.currentType,
        description: input.description,
      },
    });
    return false;
  }

  // Create new report
  await prisma.driftReport.create({
    data: {
      integrationId: input.integrationId,
      tenantId: input.tenantId,
      actionId: input.actionId,
      fingerprint: input.fingerprint,
      issueCode: input.issueCode,
      severity: input.severity,
      status: 'detected',
      fieldPath: input.fieldPath,
      expectedType: input.expectedType,
      currentType: input.currentType,
      description: input.description,
      failureCount: input.failureCount,
      scanCount: 1,
      firstDetectedAt: now,
      lastDetectedAt: now,
    },
  });
  return true;
}

/**
 * Find a drift report by ID with tenant verification.
 */
export async function findDriftReportById(
  id: string,
  tenantId: string
): Promise<DriftReport | null> {
  return prisma.driftReport.findFirst({
    where: { id, tenantId },
  });
}

/**
 * Find drift reports for an integration with cursor-based pagination and filters.
 */
export async function findDriftReportsByIntegration(
  integrationId: string,
  tenantId: string,
  pagination: DriftReportPaginationOptions = {},
  filters: DriftReportFilterOptions = {}
): Promise<PaginatedDriftReports> {
  const { cursor, limit = 20 } = pagination;

  const where: Prisma.DriftReportWhereInput = {
    integrationId,
    tenantId,
  };

  if (filters.severity) {
    where.severity = filters.severity as DriftSeverity;
  }
  if (filters.status) {
    where.status = filters.status as DriftReportStatus;
  }
  if (filters.actionId) {
    where.actionId = filters.actionId;
  }

  const totalCount = await prisma.driftReport.count({ where });

  const reports = await prisma.driftReport.findMany({
    where,
    take: limit + 1,
    orderBy: { lastDetectedAt: 'desc' },
    ...(cursor && {
      cursor: { id: cursor },
      skip: 1,
    }),
  });

  const hasMore = reports.length > limit;
  if (hasMore) {
    reports.pop();
  }

  const nextCursor = hasMore && reports.length > 0 ? reports[reports.length - 1].id : null;

  return { reports, nextCursor, totalCount };
}

/**
 * Update a drift report's status with appropriate timestamps.
 */
export async function updateDriftReportStatus(
  id: string,
  tenantId: string,
  status: DriftReportStatus
): Promise<DriftReport> {
  const now = new Date();

  const data: Prisma.DriftReportUpdateInput = { status };

  if (status === 'acknowledged') {
    data.acknowledgedAt = now;
  } else if (status === 'resolved') {
    data.resolvedAt = now;
  }

  return prisma.driftReport.update({
    where: { id, tenantId },
    data,
  });
}

/**
 * Count unresolved drift reports for an integration, grouped by severity.
 */
export async function countUnresolvedByIntegration(
  integrationId: string
): Promise<DriftSummaryCounts> {
  const counts = await prisma.driftReport.groupBy({
    by: ['severity'],
    where: {
      integrationId,
      status: { in: ['detected', 'acknowledged'] },
    },
    _count: true,
  });

  const result: DriftSummaryCounts = { breaking: 0, warning: 0, info: 0 };

  for (const row of counts) {
    const severity = row.severity as keyof DriftSummaryCounts;
    if (severity in result) {
      result[severity] = row._count;
    }
  }

  return result;
}

/**
 * Count unresolved drift reports across all integrations for a tenant.
 */
export async function countUnresolvedByTenant(tenantId: string): Promise<DriftSummaryCounts> {
  const counts = await prisma.driftReport.groupBy({
    by: ['severity'],
    where: {
      tenantId,
      status: { in: ['detected', 'acknowledged'] },
    },
    _count: true,
  });

  const result: DriftSummaryCounts = { breaking: 0, warning: 0, info: 0 };

  for (const row of counts) {
    const severity = row.severity as keyof DriftSummaryCounts;
    if (severity in result) {
      result[severity] = row._count;
    }
  }

  return result;
}

/**
 * Bulk resolve all unresolved drift reports for a specific action.
 * Used by auto-maintenance after successfully fixing an action's schema.
 */
export async function bulkResolveByAction(actionId: string, tenantId: string): Promise<number> {
  const result = await prisma.driftReport.updateMany({
    where: {
      actionId,
      tenantId,
      status: { in: ['detected', 'acknowledged'] },
    },
    data: {
      status: 'resolved',
      resolvedAt: new Date(),
    },
  });

  return result.count;
}
