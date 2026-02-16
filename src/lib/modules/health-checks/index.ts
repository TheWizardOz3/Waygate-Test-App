/**
 * Health Checks Module
 *
 * Manages health monitoring for connections across three tiers:
 * - Tier 1 (credential): No API calls, checks credential validity/expiration
 * - Tier 2 (connectivity): Single test action API call
 * - Tier 3 (full_scan): Tests all actions for breaking changes
 *
 * Health checks run on configurable schedules:
 * - Credential checks: Every 15 minutes (default)
 * - Connectivity checks: Every 12 hours (default)
 * - Full scans: Monthly/manual (opt-in)
 */

// =============================================================================
// Schemas & Types
// =============================================================================

export {
  // Enums
  HealthCheckStatusSchema,
  HealthCheckTierSchema,
  HealthCheckTriggerSchema,
  CredentialHealthStatusSchema,
  CircuitBreakerStatusSchema,
  // Result schemas
  TestActionErrorSchema,
  ActionScanResultSchema,
  ScanResultsSchema,
  // User credential health
  UserCredentialHealthSchema,
  USER_CREDENTIAL_DEGRADATION_THRESHOLD,
  // Create schemas (tier-aware)
  CreateCredentialCheckInputSchema,
  CreateConnectivityCheckInputSchema,
  CreateFullScanCheckInputSchema,
  CreateHealthCheckInputSchema,
  // Query schemas
  HealthCheckFiltersSchema,
  ListHealthChecksQuerySchema,
  TriggerHealthCheckInputSchema,
  // Response schemas
  HealthCheckResponseSchema,
  HealthCheckSummarySchema,
  ConnectionHealthStatusSchema,
  ListHealthChecksResponseSchema,
  HealthCheckConfigSchema,
  // Helper functions
  toHealthCheckResponse,
  toListHealthChecksResponse,
  getHealthStatusFromCredential,
  calculateOverallHealthStatus,
  // Error codes
  HealthCheckErrorCodes,
} from './health-check.schemas';

export type {
  HealthCheckStatus,
  HealthCheckTier,
  HealthCheckTrigger,
  CredentialHealthStatus,
  CircuitBreakerStatus,
  TestActionError,
  ActionScanResult,
  ScanResults,
  UserCredentialHealth,
  CreateCredentialCheckInput,
  CreateConnectivityCheckInput,
  CreateFullScanCheckInput,
  CreateHealthCheckInput,
  HealthCheckFilters,
  ListHealthChecksQuery,
  TriggerHealthCheckInput,
  HealthCheckResponse,
  HealthCheckSummaryResponse,
  ConnectionHealthStatus,
  ListHealthChecksResponse,
  HealthCheckConfig,
  HealthCheckErrorCode,
} from './health-check.schemas';

// =============================================================================
// Repository (Data Access)
// =============================================================================

export {
  // Create
  createHealthCheck as createHealthCheckDb,
  // Read
  findHealthCheckById,
  findHealthCheckByIdAndTenant,
  getLatestByConnectionId,
  getLatestByTier,
  getLatestByAllTiers,
  findByConnectionId,
  findByTenantId,
  findWithConnection,
  getHealthCheckCountsByStatus,
  getTenantHealthSummary,
  // Delete
  deleteOldHealthChecks,
  deleteByConnectionId,
  // Utility
  getConnectionsNeedingCredentialCheck,
  getConnectionsNeedingConnectivityCheck,
  getConnectionsNeedingFullScan,
  updateConnectionHealthStatus,
  getConnectionsWithHealthStatus,
} from './health-check.repository';

export type {
  CreateHealthCheckDbInput,
  HealthCheckPaginationOptions,
  HealthCheckFilters as HealthCheckDbFilters,
  PaginatedHealthChecks,
  HealthCheckWithConnection,
  HealthCheckSummary,
} from './health-check.repository';

// =============================================================================
// Tier 1: Credential Check Service
// =============================================================================

export {
  runCredentialCheck,
  runCredentialCheckBatch,
  getConnectionsForCredentialCheck,
  getAllConnectionsForCredentialCheck,
  CredentialCheckError,
} from './credential-check.service';

export type { CredentialCheckResult } from './credential-check.service';

// =============================================================================
// Tier 2: Connectivity Check Service
// =============================================================================

export {
  runConnectivityCheck,
  runConnectivityCheckBatch,
  getConnectionsForConnectivityCheck,
  getAllConnectionsForConnectivityCheck,
  ConnectivityCheckError,
} from './connectivity-check.service';

export type { ConnectivityCheckResult } from './connectivity-check.service';

// =============================================================================
// Tier 3: Full Scan Service
// =============================================================================

export { runFullScan, getConnectionsForFullScan, FullScanError } from './full-scan.service';

export type { FullScanResult } from './full-scan.service';
