/**
 * Schema Drift Detection Service
 *
 * Business logic layer: manages drift reports, provides summaries,
 * validates status transitions, and manages per-integration drift config.
 *
 * All operations verify tenant ownership before accessing/modifying data.
 */

import prisma from '@/lib/db/client';

import {
  findDriftReportById,
  findDriftReportsByIntegration,
  updateDriftReportStatus as repoUpdateDriftReportStatus,
  countUnresolvedByIntegration,
  bulkResolveByAction,
} from './schema-drift.repository';
import {
  ListDriftReportsQuerySchema,
  UpdateDriftReportStatusSchema,
  UpdateDriftConfigSchema,
  DriftConfigSchema,
  VALID_STATUS_TRANSITIONS,
  toDriftReportResponse,
} from './schema-drift.schemas';
import type {
  ListDriftReportsQuery,
  ListDriftReportsResponse,
  DriftReportResponse,
  DriftSummaryResponse,
  UpdateDriftReportStatusInput,
  UpdateDriftConfigInput,
  DriftConfig,
  DriftReportStatus,
} from './schema-drift.schemas';
import {
  DriftReportNotFoundError,
  InvalidDriftStatusTransitionError,
  SchemaDriftError,
} from './schema-drift.errors';

// =============================================================================
// Report - Read Operations
// =============================================================================

/**
 * Lists drift reports for an integration with pagination and filters.
 */
export async function listReports(
  tenantId: string,
  integrationId: string,
  query: Partial<ListDriftReportsQuery> = {}
): Promise<ListDriftReportsResponse> {
  const parsed = ListDriftReportsQuerySchema.safeParse(query);
  if (!parsed.success) {
    throw new SchemaDriftError(
      'INVALID_INPUT',
      `Invalid query parameters: ${parsed.error.message}`
    );
  }

  await verifyIntegrationOwnership(integrationId, tenantId);

  const { cursor, limit, severity, status, actionId } = parsed.data;

  const result = await findDriftReportsByIntegration(
    integrationId,
    tenantId,
    { cursor, limit },
    { severity, status, actionId }
  );

  return {
    reports: result.reports.map(toDriftReportResponse),
    pagination: {
      cursor: result.nextCursor,
      hasMore: result.nextCursor !== null,
      totalCount: result.totalCount,
    },
  };
}

/**
 * Gets a single drift report by ID with tenant verification.
 */
export async function getReport(tenantId: string, reportId: string): Promise<DriftReportResponse> {
  const report = await findDriftReportById(reportId, tenantId);
  if (!report) {
    throw new DriftReportNotFoundError(reportId);
  }

  return toDriftReportResponse(report);
}

// =============================================================================
// Report - Status Transitions
// =============================================================================

/**
 * Updates a drift report's status with transition validation.
 *
 * Valid transitions:
 *   detected → acknowledged | resolved | dismissed
 *   acknowledged → resolved | dismissed
 *   resolved → (terminal)
 *   dismissed → (terminal)
 */
export async function updateReportStatus(
  tenantId: string,
  reportId: string,
  input: UpdateDriftReportStatusInput
): Promise<DriftReportResponse> {
  const parsed = UpdateDriftReportStatusSchema.safeParse(input);
  if (!parsed.success) {
    throw new SchemaDriftError('INVALID_INPUT', `Invalid status update: ${parsed.error.message}`);
  }

  const newStatus = parsed.data.status;

  const report = await findDriftReportById(reportId, tenantId);
  if (!report) {
    throw new DriftReportNotFoundError(reportId);
  }

  const currentStatus = report.status as DriftReportStatus;
  const allowedTransitions = VALID_STATUS_TRANSITIONS[currentStatus];

  if (!allowedTransitions.includes(newStatus as DriftReportStatus)) {
    throw new InvalidDriftStatusTransitionError(currentStatus, newStatus);
  }

  const updated = await repoUpdateDriftReportStatus(
    reportId,
    tenantId,
    newStatus as DriftReportStatus
  );

  return toDriftReportResponse(updated);
}

// =============================================================================
// Summary
// =============================================================================

/**
 * Gets unresolved drift report counts by severity for an integration.
 */
export async function getIntegrationDriftSummary(
  tenantId: string,
  integrationId: string
): Promise<DriftSummaryResponse> {
  await verifyIntegrationOwnership(integrationId, tenantId);

  const counts = await countUnresolvedByIntegration(integrationId);

  return {
    breaking: counts.breaking,
    warning: counts.warning,
    info: counts.info,
    total: counts.breaking + counts.warning + counts.info,
  };
}

// =============================================================================
// Drift Config
// =============================================================================

/**
 * Updates the drift detection config on an integration.
 * Validates the config shape and merges with existing config.
 */
export async function updateDriftConfig(
  tenantId: string,
  integrationId: string,
  input: UpdateDriftConfigInput
): Promise<DriftConfig> {
  const parsed = UpdateDriftConfigSchema.safeParse(input);
  if (!parsed.success) {
    throw new SchemaDriftError('INVALID_INPUT', `Invalid drift config: ${parsed.error.message}`);
  }

  const integration = await verifyIntegrationOwnership(integrationId, tenantId);

  // Merge with existing config (or defaults)
  const existingConfig = DriftConfigSchema.safeParse(integration.driftConfig ?? {});
  const currentConfig = existingConfig.success
    ? existingConfig.data
    : { enabled: true, sensitivity: 'medium' as const, ignoreFieldPaths: [] as string[] };

  const mergedConfig: DriftConfig = {
    ...currentConfig,
    ...parsed.data,
  };

  await prisma.integration.update({
    where: { id: integrationId },
    data: { driftConfig: mergedConfig },
  });

  return mergedConfig;
}

// =============================================================================
// Bulk Operations
// =============================================================================

/**
 * Resolves all unresolved drift reports for a specific action.
 * Used by auto-maintenance after successfully fixing an action's schema.
 */
export async function resolveReportsForAction(tenantId: string, actionId: string): Promise<number> {
  return bulkResolveByAction(actionId, tenantId);
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Verifies an integration exists and belongs to the tenant.
 * Throws if not found.
 */
async function verifyIntegrationOwnership(integrationId: string, tenantId: string) {
  const integration = await prisma.integration.findFirst({
    where: { id: integrationId, tenantId },
  });

  if (!integration) {
    throw new SchemaDriftError(
      'INTEGRATION_NOT_FOUND',
      `Integration not found: ${integrationId}`,
      404
    );
  }

  return integration;
}
