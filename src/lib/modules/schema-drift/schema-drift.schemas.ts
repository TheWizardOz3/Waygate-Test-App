/**
 * Schema Drift Detection Schemas
 *
 * Zod schemas for drift configuration, report responses, and API inputs.
 * Schema drift detection analyzes ValidationFailure patterns to identify
 * systematic API schema changes.
 */

import { z } from 'zod';

// =============================================================================
// Enums
// =============================================================================

/**
 * Drift report severity (mirrors Prisma DriftSeverity)
 */
export const DriftSeveritySchema = z.enum(['info', 'warning', 'breaking']);
export type DriftSeverity = z.infer<typeof DriftSeveritySchema>;

/**
 * Drift report status lifecycle (mirrors Prisma DriftReportStatus)
 */
export const DriftReportStatusSchema = z.enum([
  'detected',
  'acknowledged',
  'resolved',
  'dismissed',
]);
export type DriftReportStatus = z.infer<typeof DriftReportStatusSchema>;

/**
 * Sensitivity level for drift detection thresholds
 */
export const DriftSensitivitySchema = z.enum(['low', 'medium', 'high']);
export type DriftSensitivity = z.infer<typeof DriftSensitivitySchema>;

// =============================================================================
// Configuration Schemas
// =============================================================================

/**
 * Per-integration drift detection configuration
 * Stored as JSON in Integration.driftConfig
 */
export const DriftConfigSchema = z.object({
  enabled: z.boolean().default(true),
  sensitivity: DriftSensitivitySchema.default('medium'),
  ignoreFieldPaths: z.array(z.string()).default([]),
});
export type DriftConfig = z.infer<typeof DriftConfigSchema>;

/**
 * Threshold configuration derived from sensitivity level
 */
export const DRIFT_THRESHOLDS = {
  high: { minFailures: 3, timeWindowHours: 24 },
  medium: { minFailures: 5, timeWindowHours: 24 },
  low: { minFailures: 10, timeWindowHours: 48 },
} as const;

// =============================================================================
// Query Schemas
// =============================================================================

/**
 * Query parameters for listing drift reports (API)
 */
export const ListDriftReportsQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  severity: DriftSeveritySchema.optional(),
  status: DriftReportStatusSchema.optional(),
  actionId: z.string().uuid().optional(),
});
export type ListDriftReportsQuery = z.infer<typeof ListDriftReportsQuerySchema>;

// =============================================================================
// Input Schemas
// =============================================================================

/**
 * Input for updating a drift report's status
 */
export const UpdateDriftReportStatusSchema = z.object({
  status: z.enum(['acknowledged', 'resolved', 'dismissed']),
});
export type UpdateDriftReportStatusInput = z.infer<typeof UpdateDriftReportStatusSchema>;

/**
 * Input for updating an integration's drift config
 */
export const UpdateDriftConfigSchema = DriftConfigSchema.partial();
export type UpdateDriftConfigInput = z.infer<typeof UpdateDriftConfigSchema>;

// =============================================================================
// API Response Schemas
// =============================================================================

/**
 * Drift report as returned by the API
 */
export const DriftReportResponseSchema = z.object({
  id: z.string().uuid(),
  integrationId: z.string().uuid(),
  tenantId: z.string().uuid(),
  actionId: z.string().uuid(),
  fingerprint: z.string(),
  issueCode: z.string(),
  severity: DriftSeveritySchema,
  status: DriftReportStatusSchema,
  fieldPath: z.string(),
  expectedType: z.string().nullable(),
  currentType: z.string().nullable(),
  description: z.string(),
  failureCount: z.number().int(),
  scanCount: z.number().int(),
  firstDetectedAt: z.string(),
  lastDetectedAt: z.string(),
  acknowledgedAt: z.string().nullable(),
  resolvedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type DriftReportResponse = z.infer<typeof DriftReportResponseSchema>;

/**
 * Drift summary — unresolved report counts by severity
 */
export const DriftSummaryResponseSchema = z.object({
  breaking: z.number().int(),
  warning: z.number().int(),
  info: z.number().int(),
  total: z.number().int(),
});
export type DriftSummaryResponse = z.infer<typeof DriftSummaryResponseSchema>;

/**
 * Paginated list of drift reports
 */
export const ListDriftReportsResponseSchema = z.object({
  reports: z.array(DriftReportResponseSchema),
  pagination: z.object({
    cursor: z.string().nullable(),
    hasMore: z.boolean(),
    totalCount: z.number().int(),
  }),
});
export type ListDriftReportsResponse = z.infer<typeof ListDriftReportsResponseSchema>;

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Converts a database DriftReport to API response format
 */
export function toDriftReportResponse(report: {
  id: string;
  integrationId: string;
  tenantId: string;
  actionId: string;
  fingerprint: string;
  issueCode: string;
  severity: string;
  status: string;
  fieldPath: string;
  expectedType: string | null;
  currentType: string | null;
  description: string;
  failureCount: number;
  scanCount: number;
  firstDetectedAt: Date;
  lastDetectedAt: Date;
  acknowledgedAt: Date | null;
  resolvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): DriftReportResponse {
  return {
    id: report.id,
    integrationId: report.integrationId,
    tenantId: report.tenantId,
    actionId: report.actionId,
    fingerprint: report.fingerprint,
    issueCode: report.issueCode,
    severity: report.severity as DriftSeverity,
    status: report.status as DriftReportStatus,
    fieldPath: report.fieldPath,
    expectedType: report.expectedType,
    currentType: report.currentType,
    description: report.description,
    failureCount: report.failureCount,
    scanCount: report.scanCount,
    firstDetectedAt: report.firstDetectedAt.toISOString(),
    lastDetectedAt: report.lastDetectedAt.toISOString(),
    acknowledgedAt: report.acknowledgedAt?.toISOString() ?? null,
    resolvedAt: report.resolvedAt?.toISOString() ?? null,
    createdAt: report.createdAt.toISOString(),
    updatedAt: report.updatedAt.toISOString(),
  };
}

// =============================================================================
// Severity Classification
// =============================================================================

/**
 * Maps ValidationFailure issue codes to drift severity levels.
 *
 * - type_mismatch → breaking (field type changed)
 * - missing_required_field → breaking (required field removed)
 * - invalid_enum_value → breaking (enum value changed/removed)
 * - schema_validation_error → warning (general mismatch)
 * - unexpected_field → info (new field appeared, backward compatible)
 */
export const ISSUE_CODE_SEVERITY_MAP: Record<string, DriftSeverity> = {
  type_mismatch: 'breaking',
  missing_required_field: 'breaking',
  invalid_enum_value: 'breaking',
  schema_validation_error: 'warning',
  unexpected_field: 'info',
};

/**
 * Default severity for unknown issue codes
 */
export const DEFAULT_DRIFT_SEVERITY: DriftSeverity = 'warning';

// =============================================================================
// Error Codes
// =============================================================================

export const SchemaDriftErrorCodes = {
  DRIFT_REPORT_NOT_FOUND: 'DRIFT_REPORT_NOT_FOUND',
  INVALID_STATUS_TRANSITION: 'INVALID_STATUS_TRANSITION',
  INVALID_INPUT: 'INVALID_INPUT',
} as const;

/**
 * Valid status transitions for drift reports
 */
export const VALID_STATUS_TRANSITIONS: Record<DriftReportStatus, DriftReportStatus[]> = {
  detected: ['acknowledged', 'resolved', 'dismissed'],
  acknowledged: ['resolved', 'dismissed'],
  resolved: [],
  dismissed: [],
};
