/**
 * HealthCheck Schemas
 *
 * Zod schemas for health check validation, CRUD operations, and API responses.
 * Tier-aware validation ensures required fields are present for each check type.
 */

import { z } from 'zod';

// =============================================================================
// Enums
// =============================================================================

/**
 * Health check status
 */
export const HealthCheckStatusSchema = z.enum(['healthy', 'degraded', 'unhealthy']);
export type HealthCheckStatus = z.infer<typeof HealthCheckStatusSchema>;

/**
 * Health check tier - determines what gets checked
 * - credential: No API calls, checks credential validity/expiration
 * - connectivity: Single test action API call
 * - full_scan: Tests all actions for breaking changes
 */
export const HealthCheckTierSchema = z.enum(['credential', 'connectivity', 'full_scan']);
export type HealthCheckTier = z.infer<typeof HealthCheckTierSchema>;

/**
 * How the health check was triggered
 */
export const HealthCheckTriggerSchema = z.enum(['scheduled', 'manual']);
export type HealthCheckTrigger = z.infer<typeof HealthCheckTriggerSchema>;

/**
 * Credential health status for health checks
 */
export const CredentialHealthStatusSchema = z.enum(['active', 'expiring', 'expired', 'missing']);
export type CredentialHealthStatus = z.infer<typeof CredentialHealthStatusSchema>;

/**
 * Circuit breaker status
 */
export const CircuitBreakerStatusSchema = z.enum(['closed', 'open', 'half_open']);
export type CircuitBreakerStatus = z.infer<typeof CircuitBreakerStatusSchema>;

// =============================================================================
// User Credential Health (End-User Credentials)
// =============================================================================

/**
 * Health stats for end-user credentials under a connection.
 * Used by Tier 1 credential checks to detect degraded connections
 * where >10% of user credentials are expired or need re-auth.
 */
export const UserCredentialHealthSchema = z.object({
  total: z.number().int().nonnegative(),
  active: z.number().int().nonnegative(),
  expired: z.number().int().nonnegative(),
  needsReauth: z.number().int().nonnegative(),
  revoked: z.number().int().nonnegative(),
  degradedPercentage: z.number().nonnegative(),
  isDegraded: z.boolean(),
});

export type UserCredentialHealth = z.infer<typeof UserCredentialHealthSchema>;

/**
 * Degradation threshold: if more than 10% of non-revoked user credentials
 * are expired or need re-auth, the connection is considered degraded.
 */
export const USER_CREDENTIAL_DEGRADATION_THRESHOLD = 10;

// =============================================================================
// Base Result Schemas
// =============================================================================

/**
 * Test action error details
 */
export const TestActionErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.record(z.string(), z.unknown()).optional(),
});

export type TestActionError = z.infer<typeof TestActionErrorSchema>;

/**
 * Single action scan result (for Tier 3)
 */
export const ActionScanResultSchema = z.object({
  actionId: z.string().uuid(),
  actionSlug: z.string(),
  success: z.boolean(),
  latencyMs: z.number().int().nonnegative().optional(),
  statusCode: z.number().int().optional(),
  error: TestActionErrorSchema.optional(),
});

export type ActionScanResult = z.infer<typeof ActionScanResultSchema>;

/**
 * Full scan results (Tier 3)
 */
export const ScanResultsSchema = z.object({
  actions: z.array(ActionScanResultSchema),
  summary: z.object({
    total: z.number().int().nonnegative(),
    passed: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    skipped: z.number().int().nonnegative().optional(),
  }),
});

export type ScanResults = z.infer<typeof ScanResultsSchema>;

// =============================================================================
// Health Check Create Schemas (Tier-Aware)
// =============================================================================

/**
 * Base fields required for all health checks
 */
const HealthCheckBaseSchema = z.object({
  connectionId: z.string().uuid(),
  tenantId: z.string().uuid(),
  status: HealthCheckStatusSchema,
  checkTrigger: HealthCheckTriggerSchema,
  durationMs: z.number().int().nonnegative(),
  circuitBreakerStatus: CircuitBreakerStatusSchema.optional(),
  error: z.record(z.string(), z.unknown()).optional(),
});

/**
 * Tier 1: Credential check input
 * No API calls, just checks credential validity
 */
export const CreateCredentialCheckInputSchema = HealthCheckBaseSchema.extend({
  checkTier: z.literal('credential'),
  credentialStatus: CredentialHealthStatusSchema,
  credentialExpiresAt: z.date().optional().nullable(),
});

export type CreateCredentialCheckInput = z.infer<typeof CreateCredentialCheckInputSchema>;

/**
 * Tier 2: Connectivity check input
 * Single test action API call
 */
export const CreateConnectivityCheckInputSchema = HealthCheckBaseSchema.extend({
  checkTier: z.literal('connectivity'),
  // Credential info (included from Tier 1)
  credentialStatus: CredentialHealthStatusSchema,
  credentialExpiresAt: z.date().optional().nullable(),
  // Test action results
  testActionId: z.string().uuid().optional().nullable(),
  testActionSuccess: z.boolean(),
  testActionLatencyMs: z.number().int().nonnegative().optional(),
  testActionStatusCode: z.number().int().optional(),
  testActionError: TestActionErrorSchema.optional().nullable(),
});

export type CreateConnectivityCheckInput = z.infer<typeof CreateConnectivityCheckInputSchema>;

/**
 * Tier 3: Full scan input
 * Tests all actions for breaking changes
 */
export const CreateFullScanCheckInputSchema = HealthCheckBaseSchema.extend({
  checkTier: z.literal('full_scan'),
  // Credential info (included from Tier 1)
  credentialStatus: CredentialHealthStatusSchema,
  credentialExpiresAt: z.date().optional().nullable(),
  // Test action results (for primary test action)
  testActionId: z.string().uuid().optional().nullable(),
  testActionSuccess: z.boolean().optional(),
  testActionLatencyMs: z.number().int().nonnegative().optional(),
  testActionStatusCode: z.number().int().optional(),
  testActionError: TestActionErrorSchema.optional().nullable(),
  // Full scan results
  actionsScanned: z.number().int().nonnegative(),
  actionsPassed: z.number().int().nonnegative(),
  actionsFailed: z.number().int().nonnegative(),
  scanResults: ScanResultsSchema,
});

export type CreateFullScanCheckInput = z.infer<typeof CreateFullScanCheckInputSchema>;

/**
 * Union of all health check input types
 */
export const CreateHealthCheckInputSchema = z.discriminatedUnion('checkTier', [
  CreateCredentialCheckInputSchema,
  CreateConnectivityCheckInputSchema,
  CreateFullScanCheckInputSchema,
]);

export type CreateHealthCheckInput = z.infer<typeof CreateHealthCheckInputSchema>;

// =============================================================================
// Query Schemas
// =============================================================================

/**
 * Filters for querying health checks
 */
export const HealthCheckFiltersSchema = z.object({
  tier: HealthCheckTierSchema.optional(),
  status: HealthCheckStatusSchema.optional(),
  credentialStatus: CredentialHealthStatusSchema.optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
});

export type HealthCheckFilters = z.infer<typeof HealthCheckFiltersSchema>;

/**
 * Query parameters for listing health checks (API)
 */
export const ListHealthChecksQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  tier: HealthCheckTierSchema.optional(),
  status: HealthCheckStatusSchema.optional(),
  credentialStatus: CredentialHealthStatusSchema.optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
});

export type ListHealthChecksQuery = z.infer<typeof ListHealthChecksQuerySchema>;

/**
 * Parameters for triggering a manual health check
 */
export const TriggerHealthCheckInputSchema = z.object({
  connectionId: z.string().uuid(),
  tier: HealthCheckTierSchema.optional().default('connectivity'),
});

export type TriggerHealthCheckInput = z.infer<typeof TriggerHealthCheckInputSchema>;

// =============================================================================
// API Response Schemas
// =============================================================================

/**
 * Health check as returned by the API
 */
export const HealthCheckResponseSchema = z.object({
  id: z.string().uuid(),
  connectionId: z.string().uuid(),
  tenantId: z.string().uuid(),
  status: HealthCheckStatusSchema,
  checkTier: HealthCheckTierSchema,
  checkTrigger: HealthCheckTriggerSchema,

  // Credential check results
  credentialStatus: CredentialHealthStatusSchema.nullable(),
  credentialExpiresAt: z.string().datetime().nullable(),

  // Test action results
  testActionId: z.string().uuid().nullable(),
  testActionSuccess: z.boolean().nullable(),
  testActionLatencyMs: z.number().int().nullable(),
  testActionStatusCode: z.number().int().nullable(),
  testActionError: TestActionErrorSchema.nullable(),

  // Full scan results
  actionsScanned: z.number().int().nullable(),
  actionsPassed: z.number().int().nullable(),
  actionsFailed: z.number().int().nullable(),
  scanResults: ScanResultsSchema.nullable(),

  // User credential health (end-user credentials under this connection)
  userCredentialHealth: UserCredentialHealthSchema.nullable(),

  // Circuit breaker
  circuitBreakerStatus: CircuitBreakerStatusSchema.nullable(),

  // Overall
  durationMs: z.number().int(),
  error: z.record(z.string(), z.unknown()).nullable(),
  createdAt: z.string().datetime(),
});

export type HealthCheckResponse = z.infer<typeof HealthCheckResponseSchema>;

/**
 * Health check summary statistics
 */
export const HealthCheckSummarySchema = z.object({
  healthy: z.number().int().nonnegative(),
  degraded: z.number().int().nonnegative(),
  unhealthy: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
});

export type HealthCheckSummaryResponse = z.infer<typeof HealthCheckSummarySchema>;

/**
 * Connection health status response
 */
export const ConnectionHealthStatusSchema = z.object({
  connectionId: z.string().uuid(),
  connectionName: z.string(),
  connectionSlug: z.string(),
  integrationId: z.string().uuid(),
  healthStatus: HealthCheckStatusSchema,
  lastCredentialCheck: z.object({
    at: z.string().datetime().nullable(),
    status: HealthCheckStatusSchema.nullable(),
    credentialStatus: CredentialHealthStatusSchema.nullable(),
  }),
  lastConnectivityCheck: z.object({
    at: z.string().datetime().nullable(),
    status: HealthCheckStatusSchema.nullable(),
    latencyMs: z.number().int().nullable(),
  }),
  lastFullScan: z.object({
    at: z.string().datetime().nullable(),
    status: HealthCheckStatusSchema.nullable(),
    actionsPassed: z.number().int().nullable(),
    actionsFailed: z.number().int().nullable(),
  }),
});

export type ConnectionHealthStatus = z.infer<typeof ConnectionHealthStatusSchema>;

/**
 * Paginated list of health checks
 */
export const ListHealthChecksResponseSchema = z.object({
  healthChecks: z.array(HealthCheckResponseSchema),
  pagination: z.object({
    cursor: z.string().nullable(),
    hasMore: z.boolean(),
    totalCount: z.number().int(),
  }),
});

export type ListHealthChecksResponse = z.infer<typeof ListHealthChecksResponseSchema>;

/**
 * Health check configuration for an integration
 */
export const HealthCheckConfigSchema = z.object({
  enabled: z.boolean().default(true),
  credentialCheckMinutes: z.number().int().min(5).max(60).default(15),
  connectivityCheckHours: z.number().int().min(1).max(24).default(12),
  fullScanEnabled: z.boolean().default(false),
  testActionId: z.string().uuid().optional(),
});

export type HealthCheckConfig = z.infer<typeof HealthCheckConfigSchema>;

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Converts a database HealthCheck to API response format
 */
export function toHealthCheckResponse(healthCheck: {
  id: string;
  connectionId: string;
  tenantId: string;
  status: string;
  checkTier: string;
  checkTrigger: string;
  credentialStatus: string | null;
  credentialExpiresAt: Date | null;
  testActionId: string | null;
  testActionSuccess: boolean | null;
  testActionLatencyMs: number | null;
  testActionStatusCode: number | null;
  testActionError: unknown;
  actionsScanned: number | null;
  actionsPassed: number | null;
  actionsFailed: number | null;
  scanResults: unknown;
  userCredentialHealth: unknown;
  circuitBreakerStatus: string | null;
  durationMs: number;
  error: unknown;
  createdAt: Date;
}): HealthCheckResponse {
  return {
    id: healthCheck.id,
    connectionId: healthCheck.connectionId,
    tenantId: healthCheck.tenantId,
    status: healthCheck.status as HealthCheckStatus,
    checkTier: healthCheck.checkTier as HealthCheckTier,
    checkTrigger: healthCheck.checkTrigger as HealthCheckTrigger,
    credentialStatus: healthCheck.credentialStatus as CredentialHealthStatus | null,
    credentialExpiresAt: healthCheck.credentialExpiresAt?.toISOString() ?? null,
    testActionId: healthCheck.testActionId,
    testActionSuccess: healthCheck.testActionSuccess,
    testActionLatencyMs: healthCheck.testActionLatencyMs,
    testActionStatusCode: healthCheck.testActionStatusCode,
    testActionError: healthCheck.testActionError as TestActionError | null,
    actionsScanned: healthCheck.actionsScanned,
    actionsPassed: healthCheck.actionsPassed,
    actionsFailed: healthCheck.actionsFailed,
    scanResults: healthCheck.scanResults as ScanResults | null,
    userCredentialHealth: healthCheck.userCredentialHealth as UserCredentialHealth | null,
    circuitBreakerStatus: healthCheck.circuitBreakerStatus as CircuitBreakerStatus | null,
    durationMs: healthCheck.durationMs,
    error: healthCheck.error as Record<string, unknown> | null,
    createdAt: healthCheck.createdAt.toISOString(),
  };
}

/**
 * Converts a list of database health checks to paginated API response
 */
export function toListHealthChecksResponse(
  healthChecks: Array<Parameters<typeof toHealthCheckResponse>[0]>,
  nextCursor: string | null,
  totalCount: number
): ListHealthChecksResponse {
  return {
    healthChecks: healthChecks.map(toHealthCheckResponse),
    pagination: {
      cursor: nextCursor,
      hasMore: nextCursor !== null,
      totalCount,
    },
  };
}

/**
 * Determines health status based on credential status
 */
export function getHealthStatusFromCredential(
  credentialStatus: CredentialHealthStatus
): HealthCheckStatus {
  switch (credentialStatus) {
    case 'active':
      return 'healthy';
    case 'expiring':
      return 'degraded';
    case 'expired':
    case 'missing':
      return 'unhealthy';
    default:
      return 'unhealthy';
  }
}

/**
 * Determines overall health status from tier results
 */
export function calculateOverallHealthStatus(params: {
  credentialStatus?: CredentialHealthStatus | null;
  testActionSuccess?: boolean | null;
  actionsFailed?: number | null;
  userCredentialsDegraded?: boolean;
}): HealthCheckStatus {
  const { credentialStatus, testActionSuccess, actionsFailed, userCredentialsDegraded } = params;

  // Credential issues take priority
  if (credentialStatus === 'expired' || credentialStatus === 'missing') {
    return 'unhealthy';
  }

  // Test action failure is unhealthy
  if (testActionSuccess === false) {
    return 'unhealthy';
  }

  // Full scan failures
  if (actionsFailed !== null && actionsFailed !== undefined && actionsFailed > 0) {
    return 'degraded';
  }

  // Expiring credentials are degraded
  if (credentialStatus === 'expiring') {
    return 'degraded';
  }

  // User credentials degraded (>10% expired/needs_reauth)
  if (userCredentialsDegraded) {
    return 'degraded';
  }

  return 'healthy';
}

// =============================================================================
// Error Codes
// =============================================================================

export const HealthCheckErrorCodes = {
  HEALTH_CHECK_NOT_FOUND: 'HEALTH_CHECK_NOT_FOUND',
  CONNECTION_NOT_FOUND: 'CONNECTION_NOT_FOUND',
  HEALTH_CHECK_DISABLED: 'HEALTH_CHECK_DISABLED',
  NO_CREDENTIALS: 'NO_CREDENTIALS',
  NO_TEST_ACTION: 'NO_TEST_ACTION',
  TEST_ACTION_NOT_FOUND: 'TEST_ACTION_NOT_FOUND',
  TIER_NOT_SUPPORTED: 'TIER_NOT_SUPPORTED',
  HEALTH_CHECK_IN_PROGRESS: 'HEALTH_CHECK_IN_PROGRESS',
} as const;

export type HealthCheckErrorCode =
  (typeof HealthCheckErrorCodes)[keyof typeof HealthCheckErrorCodes];
