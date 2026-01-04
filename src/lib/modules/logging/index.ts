/**
 * Logging Module
 *
 * Request logging and audit trail for the Waygate Gateway.
 * Provides sanitized logging with automatic sensitive data removal.
 */

// =============================================================================
// Schemas & Types
// =============================================================================

export {
  // Constants
  MAX_BODY_SIZE,
  SENSITIVE_HEADERS,
  SENSITIVE_FIELDS,
  // Schemas
  RequestSummarySchema,
  ResponseSummarySchema,
  LogErrorSchema,
  CreateRequestLogInputSchema,
  RequestLogFiltersSchema,
  ListLogsQuerySchema,
  RequestLogResponseSchema,
  ListLogsResponseSchema,
  // Helper functions
  toRequestLogResponse,
  // Error codes
  LoggingErrorCodes,
} from './logging.schemas';

export type {
  RequestSummary,
  ResponseSummary,
  LogError,
  CreateRequestLogInput,
  RequestLogFilters,
  ListLogsQuery,
  RequestLogResponse,
  ListLogsResponse,
} from './logging.schemas';

// =============================================================================
// Repository (Data Access)
// =============================================================================

export {
  createRequestLog,
  findRequestLogById,
  findRequestLogByIdAndTenant,
  findRequestLogsPaginated,
  findLatestLogForIntegration,
  findLatestSuccessfulLogForIntegration,
  findRecentLogsForIntegration,
  getLogStatsForIntegration,
  getLogStatsForTenant,
  deleteOldLogs,
  deleteLogsForIntegration,
} from './logging.repository';

export type {
  CreateRequestLogDbInput,
  LogPaginationOptions,
  PaginatedLogs,
  TenantLogStats,
} from './logging.repository';

// =============================================================================
// Service (Business Logic)
// =============================================================================

export {
  // Error class
  LoggingError,
  // Sanitization utilities
  sanitizeHeaders,
  sanitizeBody,
  truncateBody,
  prepareRequestSummary,
  prepareResponseSummary,
  prepareError,
  // Logging operations
  logRequest,
  logRequestResponse,
  // Read operations
  getRequestLog,
  listRequestLogs,
  getLastSuccessfulRequestTime,
  getIntegrationLogStats,
} from './logging.service';

export type { EnrichedLogEntry } from './logging.service';
