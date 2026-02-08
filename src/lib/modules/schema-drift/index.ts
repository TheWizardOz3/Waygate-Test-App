/**
 * Schema Drift Detection Module
 *
 * Detects when external APIs change their response schemas by analyzing
 * patterns in runtime validation failures. Creates structured drift reports
 * that the Auto-Maintenance System can act on.
 *
 * Registers the schema_drift job handler with the async job system.
 * Handler registration is a side effect of importing this module.
 */

// =============================================================================
// Handler Registration (side-effect)
// =============================================================================

import { registerJobHandler } from '@/lib/modules/jobs/jobs.handlers';
import { driftPassiveAnalysisHandler } from './handlers/drift-passive.handler';

registerJobHandler('schema_drift', {
  handler: driftPassiveAnalysisHandler,
  concurrencyLimit: 1,
});

// =============================================================================
// Schemas & Types
// =============================================================================

export {
  // Enums
  DriftSeveritySchema,
  DriftReportStatusSchema,
  DriftSensitivitySchema,
  // Config
  DriftConfigSchema,
  DRIFT_THRESHOLDS,
  // Query / Input
  ListDriftReportsQuerySchema,
  UpdateDriftReportStatusSchema,
  UpdateDriftConfigSchema,
  // Response
  DriftReportResponseSchema,
  DriftSummaryResponseSchema,
  ListDriftReportsResponseSchema,
  // Helpers
  toDriftReportResponse,
  // Severity classification
  ISSUE_CODE_SEVERITY_MAP,
  DEFAULT_DRIFT_SEVERITY,
  VALID_STATUS_TRANSITIONS,
  // Error codes
  SchemaDriftErrorCodes,
} from './schema-drift.schemas';

export type {
  DriftSeverity,
  DriftReportStatus,
  DriftSensitivity,
  DriftConfig,
  ListDriftReportsQuery,
  UpdateDriftReportStatusInput,
  UpdateDriftConfigInput,
  DriftReportResponse,
  DriftSummaryResponse,
  ListDriftReportsResponse,
} from './schema-drift.schemas';

// =============================================================================
// Errors
// =============================================================================

export {
  SchemaDriftError,
  DriftReportNotFoundError,
  InvalidDriftStatusTransitionError,
} from './schema-drift.errors';

// =============================================================================
// Repository (Data Access)
// =============================================================================

export {
  upsertDriftReport,
  findDriftReportById,
  findDriftReportsByIntegration,
  updateDriftReportStatus,
  countUnresolvedByIntegration,
  countUnresolvedByTenant,
  bulkResolveByAction,
} from './schema-drift.repository';

export type {
  UpsertDriftReportInput,
  DriftReportPaginationOptions,
  DriftReportFilterOptions,
  PaginatedDriftReports,
  DriftSummaryCounts,
} from './schema-drift.repository';

// =============================================================================
// Service (Business Logic)
// =============================================================================

export {
  listReports,
  getReport,
  updateReportStatus,
  getIntegrationDriftSummary,
  updateDriftConfig,
  resolveReportsForAction,
} from './schema-drift.service';

// =============================================================================
// Passive Drift Analyzer
// =============================================================================

export {
  analyzeIntegration,
  classifySeverity,
  buildFingerprint,
  buildDescription,
} from './passive-drift-analyzer';

export type { AnalyzeIntegrationResult } from './passive-drift-analyzer';

// =============================================================================
// Handlers
// =============================================================================

export { driftPassiveAnalysisHandler } from './handlers/drift-passive.handler';
