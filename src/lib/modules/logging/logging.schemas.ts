/**
 * Logging Schemas
 *
 * Zod schemas for request log validation, filtering, and API responses.
 * Defines the structure of request logs for audit trail and debugging.
 */

import { z } from 'zod';

// =============================================================================
// Constants
// =============================================================================

/**
 * Maximum size for request/response bodies in logs (in characters)
 * Larger bodies will be truncated
 */
export const MAX_BODY_SIZE = 10000;

/**
 * Headers that should never be logged (security)
 */
export const SENSITIVE_HEADERS = [
  'authorization',
  'x-api-key',
  'api-key',
  'apikey',
  'x-auth-token',
  'cookie',
  'set-cookie',
  'x-csrf-token',
  'x-xsrf-token',
] as const;

/**
 * Fields in request/response bodies that should be redacted
 */
export const SENSITIVE_FIELDS = [
  'password',
  'secret',
  'token',
  'apiKey',
  'api_key',
  'accessToken',
  'access_token',
  'refreshToken',
  'refresh_token',
  'privateKey',
  'private_key',
  'credential',
  'credentials',
] as const;

// =============================================================================
// Request Log Schemas
// =============================================================================

/**
 * Request summary stored in logs (sanitized)
 */
export const RequestSummarySchema = z.object({
  method: z.string(),
  url: z.string(),
  headers: z.record(z.string(), z.string()).optional(),
  body: z.unknown().optional(),
  bodyTruncated: z.boolean().optional(),
});

export type RequestSummary = z.infer<typeof RequestSummarySchema>;

/**
 * Response summary stored in logs (sanitized)
 */
export const ResponseSummarySchema = z.object({
  statusCode: z.number().optional(),
  headers: z.record(z.string(), z.string()).optional(),
  body: z.unknown().optional(),
  bodyTruncated: z.boolean().optional(),
});

export type ResponseSummary = z.infer<typeof ResponseSummarySchema>;

/**
 * Error details stored in logs
 */
export const LogErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.record(z.string(), z.unknown()).optional(),
  stack: z.string().optional(),
});

export type LogError = z.infer<typeof LogErrorSchema>;

// =============================================================================
// Create Request Log
// =============================================================================

/**
 * Input for creating a request log entry
 */
export const CreateRequestLogInputSchema = z.object({
  tenantId: z.string().uuid(),
  integrationId: z.string().uuid(),
  actionId: z.string().uuid(),
  connectionId: z.string().uuid().optional(), // For multi-app connection tracking
  appId: z.string().uuid().optional(), // App context (from wg_app_ key)
  appUserId: z.string().uuid().optional(), // End-user context (resolved from externalUserId)
  requestSummary: RequestSummarySchema,
  responseSummary: ResponseSummarySchema.optional(),
  statusCode: z.number().int().optional(),
  latencyMs: z.number().int().min(0),
  retryCount: z.number().int().min(0).default(0),
  error: LogErrorSchema.optional(),
});

export type CreateRequestLogInput = z.infer<typeof CreateRequestLogInputSchema>;

// =============================================================================
// Query Request Logs
// =============================================================================

/**
 * Filters for querying request logs
 */
export const RequestLogFiltersSchema = z.object({
  integrationId: z.string().uuid().optional(),
  actionId: z.string().uuid().optional(),
  statusCode: z.number().int().optional(),
  hasError: z.boolean().optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
});

export type RequestLogFilters = z.infer<typeof RequestLogFiltersSchema>;

/**
 * Query parameters for listing logs (API)
 */
export const ListLogsQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  integrationId: z.string().uuid().optional(),
  actionId: z.string().uuid().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

export type ListLogsQuery = z.infer<typeof ListLogsQuerySchema>;

// =============================================================================
// API Response Types
// =============================================================================

/**
 * Request log as returned by the API
 */
export const RequestLogResponseSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  integrationId: z.string().uuid(),
  actionId: z.string().uuid(),
  requestSummary: RequestSummarySchema,
  responseSummary: ResponseSummarySchema.nullable(),
  statusCode: z.number().int().nullable(),
  latencyMs: z.number().int(),
  retryCount: z.number().int(),
  error: LogErrorSchema.nullable(),
  createdAt: z.string(),
});

export type RequestLogResponse = z.infer<typeof RequestLogResponseSchema>;

/**
 * Enriched log entry with integration/action details (for API responses)
 */
export const EnrichedLogEntrySchema = z.object({
  id: z.string().uuid(),
  integrationId: z.string().uuid(),
  integrationName: z.string(),
  integrationSlug: z.string(),
  actionId: z.string().uuid(),
  actionName: z.string(),
  actionSlug: z.string(),
  httpMethod: z.string(),
  endpoint: z.string(),
  status: z.enum(['success', 'error', 'timeout']),
  statusCode: z.number().int(),
  duration: z.number().int(),
  requestHeaders: z.record(z.string(), z.string()).optional(),
  requestBody: z.unknown().optional(),
  responseHeaders: z.record(z.string(), z.string()).optional(),
  responseBody: z.unknown().optional(),
  errorMessage: z.string().optional(),
  errorCode: z.string().optional(),
  timestamp: z.string(),
  cached: z.boolean(),
  retryCount: z.number().int(),
});

/**
 * Paginated list of request logs (enriched)
 */
export const ListLogsResponseSchema = z.object({
  logs: z.array(EnrichedLogEntrySchema),
  pagination: z.object({
    cursor: z.string().nullable(),
    hasMore: z.boolean(),
    totalCount: z.number().int(),
  }),
});

export type ListLogsResponse = z.infer<typeof ListLogsResponseSchema>;

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Converts a database RequestLog to API response format
 */
export function toRequestLogResponse(log: {
  id: string;
  tenantId: string;
  integrationId: string;
  actionId: string;
  requestSummary: unknown;
  responseSummary: unknown;
  statusCode: number | null;
  latencyMs: number;
  retryCount: number;
  error: unknown;
  createdAt: Date;
}): RequestLogResponse {
  return {
    id: log.id,
    tenantId: log.tenantId,
    integrationId: log.integrationId,
    actionId: log.actionId,
    requestSummary: log.requestSummary as RequestSummary,
    responseSummary: (log.responseSummary as ResponseSummary) ?? null,
    statusCode: log.statusCode,
    latencyMs: log.latencyMs,
    retryCount: log.retryCount,
    error: (log.error as LogError) ?? null,
    createdAt: log.createdAt.toISOString(),
  };
}

// =============================================================================
// Error Codes
// =============================================================================

export const LoggingErrorCodes = {
  LOG_NOT_FOUND: 'LOG_NOT_FOUND',
  INVALID_FILTERS: 'INVALID_FILTERS',
} as const;
