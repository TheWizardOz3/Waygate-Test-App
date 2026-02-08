/**
 * Passive Drift Analyzer
 *
 * Core analysis logic: queries ValidationFailure records, applies thresholds
 * based on sensitivity, and creates/updates DriftReport records.
 *
 * This is "passive" because it only analyzes data already collected during
 * live invocations — no external API calls or doc re-scraping.
 */

import { createHash } from 'crypto';

import prisma from '@/lib/db/client';
import type { DriftSeverity as PrismaDriftSeverity } from '@prisma/client';

import {
  DriftConfigSchema,
  DRIFT_THRESHOLDS,
  ISSUE_CODE_SEVERITY_MAP,
  DEFAULT_DRIFT_SEVERITY,
} from './schema-drift.schemas';
import type { DriftConfig, DriftSeverity } from './schema-drift.schemas';

// =============================================================================
// Types
// =============================================================================

/** Result of analyzing a single integration */
export interface AnalyzeIntegrationResult {
  integrationId: string;
  reportsCreated: number;
  reportsUpdated: number;
}

/** A grouped failure pattern from ValidationFailure records */
interface FailurePattern {
  actionId: string;
  integrationId: string;
  direction: string;
  issueCode: string;
  fieldPath: string;
  failureCount: number;
  expectedType: string | null;
  receivedType: string | null;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Classify severity from a ValidationFailure issue code and direction.
 * Input drift is always at least 'breaking' for missing_required_field and type_mismatch,
 * since these cause invocation failures.
 * Falls back to DEFAULT_DRIFT_SEVERITY for unknown codes.
 */
export function classifySeverity(issueCode: string, direction: string = 'output'): DriftSeverity {
  if (direction === 'input') {
    // Input failures are inherently breaking — they cause invocation errors
    if (issueCode === 'missing_required_field' || issueCode === 'type_mismatch') {
      return 'breaking';
    }
  }
  return ISSUE_CODE_SEVERITY_MAP[issueCode] ?? DEFAULT_DRIFT_SEVERITY;
}

/**
 * Build a stable fingerprint for deduplication.
 * Hash of actionId + direction + issueCode + fieldPath ensures no duplicate reports
 * for the same drift pattern on the same action and direction.
 */
export function buildFingerprint(
  actionId: string,
  issueCode: string,
  fieldPath: string,
  direction: string = 'output'
): string {
  const input = `${actionId}:${direction}:${issueCode}:${fieldPath}`;
  return createHash('sha256').update(input).digest('hex').slice(0, 64);
}

/**
 * Build a human-readable description of the drift pattern.
 * Includes direction context for input vs output drift.
 */
export function buildDescription(
  issueCode: string,
  fieldPath: string,
  expectedType: string | null,
  currentType: string | null,
  direction: string = 'output'
): string {
  const isInput = direction === 'input';
  const context = isInput ? 'request input' : 'API response';

  switch (issueCode) {
    case 'type_mismatch':
      return `${isInput ? '[Input] ' : ''}Field '${fieldPath}' type changed from ${expectedType ?? 'unknown'} to ${currentType ?? 'unknown'}`;
    case 'missing_required_field':
      return isInput
        ? `[Input] New required parameter '${fieldPath}' is now expected by the API`
        : `Required field '${fieldPath}' is no longer present in API response`;
    case 'unexpected_field':
      return `New field '${fieldPath}' appeared in ${context} (type: ${currentType ?? 'unknown'})`;
    case 'invalid_enum_value':
      return `${isInput ? '[Input] ' : ''}Enum value for '${fieldPath}' changed — expected ${expectedType ?? 'known values'}, received ${currentType ?? 'unknown'}`;
    case 'schema_validation_error':
      return `${isInput ? '[Input] ' : ''}Schema validation failed for field '${fieldPath}'`;
    default:
      return `${isInput ? '[Input] ' : ''}Validation issue '${issueCode}' detected on field '${fieldPath}'`;
  }
}

/**
 * Parse and validate an integration's driftConfig JSON.
 * Returns defaults if null/invalid (enabled by default).
 */
function parseDriftConfig(driftConfigJson: unknown): DriftConfig {
  const result = DriftConfigSchema.safeParse(driftConfigJson ?? {});
  if (result.success) {
    return result.data;
  }
  // Invalid config — fall back to defaults
  return { enabled: true, sensitivity: 'medium', ignoreFieldPaths: [] };
}

// =============================================================================
// Core Analyzer
// =============================================================================

/**
 * Analyze a single integration for schema drift.
 *
 * 1. Load integration's driftConfig (sensitivity, ignoreFieldPaths)
 * 2. Query ValidationFailure records for the integration's actions,
 *    grouped by actionId + issueCode + fieldPath
 * 3. Apply count and time-window thresholds based on sensitivity
 * 4. For each group exceeding the threshold:
 *    - Build fingerprint for dedup
 *    - Upsert DriftReport (create new or update existing)
 * 5. Return summary of reports created/updated
 */
export async function analyzeIntegration(
  integrationId: string,
  tenantId: string
): Promise<AnalyzeIntegrationResult> {
  // Load integration with its drift config
  const integration = await prisma.integration.findFirst({
    where: { id: integrationId, tenantId },
    select: { id: true, driftConfig: true },
  });

  if (!integration) {
    return { integrationId, reportsCreated: 0, reportsUpdated: 0 };
  }

  const config = parseDriftConfig(integration.driftConfig);

  if (!config.enabled) {
    return { integrationId, reportsCreated: 0, reportsUpdated: 0 };
  }

  const threshold = DRIFT_THRESHOLDS[config.sensitivity];
  const windowStart = new Date(Date.now() - threshold.timeWindowHours * 60 * 60 * 1000);

  // Query ValidationFailure patterns grouped by action + issueCode + fieldPath
  // that exceed the time window threshold
  const failurePatterns = await queryFailurePatterns(
    integrationId,
    tenantId,
    windowStart,
    threshold.minFailures,
    config.ignoreFieldPaths
  );

  let reportsCreated = 0;
  let reportsUpdated = 0;

  for (const pattern of failurePatterns) {
    const fingerprint = buildFingerprint(
      pattern.actionId,
      pattern.issueCode,
      pattern.fieldPath,
      pattern.direction
    );
    const severity = classifySeverity(pattern.issueCode, pattern.direction);
    const description = buildDescription(
      pattern.issueCode,
      pattern.fieldPath,
      pattern.expectedType,
      pattern.receivedType,
      pattern.direction
    );

    const wasCreated = await upsertDriftReport({
      integrationId,
      tenantId,
      actionId: pattern.actionId,
      fingerprint,
      issueCode: pattern.issueCode,
      severity,
      fieldPath: pattern.fieldPath,
      expectedType: pattern.expectedType,
      currentType: pattern.receivedType,
      description,
      failureCount: pattern.failureCount,
    });

    if (wasCreated) {
      reportsCreated++;
    } else {
      reportsUpdated++;
    }
  }

  return { integrationId, reportsCreated, reportsUpdated };
}

// =============================================================================
// Database Queries
// =============================================================================

/**
 * Query ValidationFailure records for an integration's actions, grouped by
 * actionId + issueCode + fieldPath, filtered by time window and failure count.
 */
async function queryFailurePatterns(
  integrationId: string,
  tenantId: string,
  windowStart: Date,
  minFailures: number,
  ignoreFieldPaths: string[]
): Promise<FailurePattern[]> {
  // Get all actions for this integration
  const actions = await prisma.action.findMany({
    where: { integrationId },
    select: { id: true },
  });

  if (actions.length === 0) {
    return [];
  }

  const actionIds = actions.map((a) => a.id);

  // Build where clause for ValidationFailure query
  const whereClause: NonNullable<Parameters<typeof prisma.validationFailure.findMany>[0]>['where'] =
    {
      actionId: { in: actionIds },
      tenantId,
      lastSeenAt: { gte: windowStart },
      failureCount: { gte: minFailures },
    };

  // Exclude ignored field paths
  if (ignoreFieldPaths.length > 0) {
    whereClause.fieldPath = { notIn: ignoreFieldPaths };
  }

  // Query failures that meet the threshold (both input and output directions)
  const failures = await prisma.validationFailure.findMany({
    where: whereClause,
    select: {
      actionId: true,
      direction: true,
      issueCode: true,
      fieldPath: true,
      failureCount: true,
      expectedType: true,
      receivedType: true,
    },
  });

  return failures.map((f) => ({
    actionId: f.actionId,
    integrationId,
    direction: f.direction,
    issueCode: f.issueCode,
    fieldPath: f.fieldPath,
    failureCount: f.failureCount,
    expectedType: f.expectedType,
    receivedType: f.receivedType,
  }));
}

/**
 * Upsert a DriftReport: create if new fingerprint, update if existing.
 * Returns true if a new report was created, false if an existing one was updated.
 */
async function upsertDriftReport(input: {
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
}): Promise<boolean> {
  const now = new Date();

  // Check if an unresolved report with this fingerprint already exists
  const existing = await prisma.driftReport.findUnique({
    where: {
      drift_reports_integration_fingerprint_idx: {
        integrationId: input.integrationId,
        fingerprint: input.fingerprint,
      },
    },
    select: { id: true, status: true },
  });

  // If a resolved/dismissed report exists, skip — don't reopen it
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
        // Update types in case they've changed
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
      severity: input.severity as PrismaDriftSeverity,
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
