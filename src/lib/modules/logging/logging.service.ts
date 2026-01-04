/**
 * Logging Service
 *
 * Business logic layer for request logging.
 * Handles sanitization, truncation, and formatting of log entries.
 *
 * Security: Sensitive headers and fields are automatically stripped.
 * Performance: Large bodies are truncated to avoid storage bloat.
 */

import {
  createRequestLog as repoCreateRequestLog,
  findRequestLogByIdAndTenant,
  findRequestLogsPaginated,
  findLatestSuccessfulLogForIntegration,
  getLogStatsForIntegration,
  type CreateRequestLogDbInput,
  type LogPaginationOptions,
} from './logging.repository';
import {
  CreateRequestLogInputSchema,
  ListLogsQuerySchema,
  toRequestLogResponse,
  MAX_BODY_SIZE,
  SENSITIVE_HEADERS,
  SENSITIVE_FIELDS,
  LoggingErrorCodes,
  type CreateRequestLogInput,
  type RequestLogFilters,
  type ListLogsQuery,
  type ListLogsResponse,
  type RequestLogResponse,
  type RequestSummary,
  type ResponseSummary,
  type LogError,
} from './logging.schemas';
import { prisma } from '@/lib/db/client';

import type { RequestLog } from '@prisma/client';

// =============================================================================
// Error Class
// =============================================================================

/**
 * Error thrown when logging operations fail
 */
export class LoggingError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number = 400
  ) {
    super(message);
    this.name = 'LoggingError';
  }
}

// =============================================================================
// Sanitization Utilities
// =============================================================================

/**
 * Sanitizes headers by removing sensitive values
 */
export function sanitizeHeaders(
  headers: Record<string, string> | undefined
): Record<string, string> | undefined {
  if (!headers) return undefined;

  const sanitized: Record<string, string> = {};

  for (const [key, value] of Object.entries(headers)) {
    const lowerKey = key.toLowerCase();
    if (SENSITIVE_HEADERS.some((h) => lowerKey === h || lowerKey.includes(h))) {
      sanitized[key] = '[REDACTED]';
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Recursively sanitizes an object by redacting sensitive fields
 */
export function sanitizeBody(body: unknown, depth: number = 0): unknown {
  // Prevent infinite recursion
  if (depth > 10) return '[MAX_DEPTH_EXCEEDED]';

  if (body === null || body === undefined) {
    return body;
  }

  if (Array.isArray(body)) {
    return body.map((item) => sanitizeBody(item, depth + 1));
  }

  if (typeof body === 'object') {
    const sanitized: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
      const lowerKey = key.toLowerCase();
      if (
        SENSITIVE_FIELDS.some(
          (f) => lowerKey === f.toLowerCase() || lowerKey.includes(f.toLowerCase())
        )
      ) {
        sanitized[key] = '[REDACTED]';
      } else {
        sanitized[key] = sanitizeBody(value, depth + 1);
      }
    }

    return sanitized;
  }

  return body;
}

/**
 * Truncates a body if it exceeds the maximum size
 * Returns the body and a flag indicating if it was truncated
 */
export function truncateBody(body: unknown): { body: unknown; truncated: boolean } {
  if (body === null || body === undefined) {
    return { body, truncated: false };
  }

  const serialized = typeof body === 'string' ? body : JSON.stringify(body);

  if (serialized.length <= MAX_BODY_SIZE) {
    return { body, truncated: false };
  }

  // Truncate to max size
  const truncatedStr = serialized.substring(0, MAX_BODY_SIZE);

  // Try to parse back to object if it was an object
  if (typeof body !== 'string') {
    try {
      // For objects, we can't just truncate the JSON string
      // Instead, create a summary
      return {
        body: {
          _truncated: true,
          _originalSize: serialized.length,
          _preview: truncatedStr.substring(0, 500) + '...',
        },
        truncated: true,
      };
    } catch {
      return { body: truncatedStr + '... [TRUNCATED]', truncated: true };
    }
  }

  return { body: truncatedStr + '... [TRUNCATED]', truncated: true };
}

/**
 * Sanitizes and prepares a request summary for logging
 */
export function prepareRequestSummary(request: {
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: unknown;
}): RequestSummary {
  const sanitizedHeaders = sanitizeHeaders(request.headers);
  const sanitizedBody = sanitizeBody(request.body);
  const { body, truncated } = truncateBody(sanitizedBody);

  return {
    method: request.method,
    url: request.url,
    headers: sanitizedHeaders,
    body,
    bodyTruncated: truncated || undefined,
  };
}

/**
 * Sanitizes and prepares a response summary for logging
 */
export function prepareResponseSummary(response: {
  statusCode?: number;
  headers?: Record<string, string>;
  body?: unknown;
}): ResponseSummary {
  const sanitizedHeaders = sanitizeHeaders(response.headers);
  const sanitizedBody = sanitizeBody(response.body);
  const { body, truncated } = truncateBody(sanitizedBody);

  return {
    statusCode: response.statusCode,
    headers: sanitizedHeaders,
    body,
    bodyTruncated: truncated || undefined,
  };
}

/**
 * Prepares an error for logging
 */
export function prepareError(
  error: Error | { code?: string; message: string; details?: unknown }
): LogError {
  if (error instanceof Error) {
    return {
      code: (error as Error & { code?: string }).code ?? 'UNKNOWN_ERROR',
      message: error.message,
      // Don't include stack traces in production
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    };
  }

  return {
    code: error.code ?? 'UNKNOWN_ERROR',
    message: error.message,
    details: error.details as Record<string, unknown> | undefined,
  };
}

// =============================================================================
// Create Log Entry
// =============================================================================

/**
 * Creates a request log entry with automatic sanitization
 *
 * @param input - Log entry data (will be sanitized)
 * @returns The created log entry
 */
export async function logRequest(input: CreateRequestLogInput): Promise<RequestLog> {
  // Validate input
  const parsed = CreateRequestLogInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new LoggingError(
      LoggingErrorCodes.INVALID_FILTERS,
      `Invalid log data: ${parsed.error.message}`
    );
  }

  const data = parsed.data;

  // Convert to database input
  const dbInput: CreateRequestLogDbInput = {
    tenantId: data.tenantId,
    integrationId: data.integrationId,
    actionId: data.actionId,
    requestSummary: data.requestSummary as CreateRequestLogDbInput['requestSummary'],
    responseSummary: data.responseSummary as CreateRequestLogDbInput['responseSummary'],
    statusCode: data.statusCode,
    latencyMs: data.latencyMs,
    retryCount: data.retryCount,
    error: data.error as CreateRequestLogDbInput['error'],
  };

  return repoCreateRequestLog(dbInput);
}

/**
 * Convenience function to log a complete request/response cycle
 * Handles sanitization automatically
 */
export async function logRequestResponse(params: {
  tenantId: string;
  integrationId: string;
  actionId: string;
  request: {
    method: string;
    url: string;
    headers?: Record<string, string>;
    body?: unknown;
  };
  response?: {
    statusCode?: number;
    headers?: Record<string, string>;
    body?: unknown;
  };
  latencyMs: number;
  retryCount?: number;
  error?: Error | { code?: string; message: string; details?: unknown };
}): Promise<RequestLog> {
  const requestSummary = prepareRequestSummary(params.request);
  const responseSummary = params.response ? prepareResponseSummary(params.response) : undefined;
  const errorData = params.error ? prepareError(params.error) : undefined;

  return logRequest({
    tenantId: params.tenantId,
    integrationId: params.integrationId,
    actionId: params.actionId,
    requestSummary,
    responseSummary,
    statusCode: params.response?.statusCode,
    latencyMs: params.latencyMs,
    retryCount: params.retryCount ?? 0,
    error: errorData,
  });
}

// =============================================================================
// Read Operations
// =============================================================================

/**
 * Gets a request log by ID
 */
export async function getRequestLog(tenantId: string, logId: string): Promise<RequestLogResponse> {
  const log = await findRequestLogByIdAndTenant(logId, tenantId);

  if (!log) {
    throw new LoggingError(LoggingErrorCodes.LOG_NOT_FOUND, 'Request log not found', 404);
  }

  return toRequestLogResponse(log);
}

/**
 * Lists request logs with filtering and pagination (enriched with integration/action details)
 */
export async function listRequestLogs(
  tenantId: string,
  query: Partial<ListLogsQuery> = {}
): Promise<ListLogsResponse> {
  // Validate query
  const parsed = ListLogsQuerySchema.safeParse(query);
  if (!parsed.success) {
    throw new LoggingError(
      LoggingErrorCodes.INVALID_FILTERS,
      `Invalid query parameters: ${parsed.error.message}`
    );
  }

  const { cursor, limit, integrationId, actionId, startDate, endDate } = parsed.data;

  // Build filters
  const filters: RequestLogFilters = {};
  if (integrationId) filters.integrationId = integrationId;
  if (actionId) filters.actionId = actionId;
  if (startDate) filters.startDate = new Date(startDate);
  if (endDate) filters.endDate = new Date(endDate);

  // Build pagination options
  const paginationOptions: LogPaginationOptions = { limit };
  if (cursor) paginationOptions.cursor = cursor;

  // Query
  const result = await findRequestLogsPaginated(tenantId, paginationOptions, filters);

  // Enrich logs with integration and action details
  const enrichedLogs = await enrichLogsWithDetails(result.logs);

  return {
    logs: enrichedLogs,
    pagination: {
      cursor: result.nextCursor,
      hasMore: result.nextCursor !== null,
      totalCount: result.totalCount,
    },
  };
}

/**
 * Gets the most recent successful request time for an integration
 * Useful for health checks
 */
export async function getLastSuccessfulRequestTime(
  tenantId: string,
  integrationId: string
): Promise<Date | null> {
  const log = await findLatestSuccessfulLogForIntegration(integrationId, tenantId);
  return log?.createdAt ?? null;
}

/**
 * Gets request log statistics for an integration
 */
export async function getIntegrationLogStats(
  tenantId: string,
  integrationId: string,
  since?: Date
): Promise<{
  total: number;
  successful: number;
  failed: number;
  avgLatencyMs: number;
  successRate: number;
}> {
  const stats = await getLogStatsForIntegration(integrationId, tenantId, since);

  return {
    ...stats,
    successRate: stats.total > 0 ? Math.round((stats.successful / stats.total) * 100) : 100,
  };
}

// =============================================================================
// Enrichment Helpers
// =============================================================================

/**
 * Enriched log entry with integration and action details
 */
export interface EnrichedLogEntry {
  id: string;
  integrationId: string;
  integrationName: string;
  integrationSlug: string;
  actionId: string;
  actionName: string;
  actionSlug: string;
  httpMethod: string;
  endpoint: string;
  status: 'success' | 'error' | 'timeout';
  statusCode: number;
  duration: number;
  requestHeaders?: Record<string, string>;
  requestBody?: unknown;
  responseHeaders?: Record<string, string>;
  responseBody?: unknown;
  errorMessage?: string;
  errorCode?: string;
  timestamp: string;
  cached: boolean;
  retryCount: number;
}

/**
 * Enriches raw log entries with integration and action details
 */
async function enrichLogsWithDetails(logs: RequestLog[]): Promise<EnrichedLogEntry[]> {
  if (logs.length === 0) return [];

  // Get unique integration and action IDs
  const integrationIds = Array.from(new Set(logs.map((l) => l.integrationId)));
  const actionIds = Array.from(new Set(logs.map((l) => l.actionId)));

  // Fetch integration and action details in parallel
  const [integrations, actions] = await Promise.all([
    prisma.integration.findMany({
      where: { id: { in: integrationIds } },
      select: { id: true, name: true, slug: true },
    }),
    prisma.action.findMany({
      where: { id: { in: actionIds } },
      select: { id: true, name: true, slug: true, httpMethod: true, endpointTemplate: true },
    }),
  ]);

  // Create lookup maps
  const integrationMap = new Map(integrations.map((i) => [i.id, i]));
  const actionMap = new Map(actions.map((a) => [a.id, a]));

  // Enrich each log
  return logs.map((log) => {
    const integration = integrationMap.get(log.integrationId);
    const action = actionMap.get(log.actionId);
    const requestSummary = log.requestSummary as RequestSummary | null;
    const responseSummary = log.responseSummary as ResponseSummary | null;
    const error = log.error as LogError | null;

    // Determine status
    let status: 'success' | 'error' | 'timeout' = 'success';
    if (log.statusCode && log.statusCode >= 200 && log.statusCode < 300 && !error) {
      status = 'success';
    } else if (error?.code === 'TIMEOUT' || log.latencyMs > 30000) {
      status = 'timeout';
    } else {
      status = 'error';
    }

    return {
      id: log.id,
      integrationId: log.integrationId,
      integrationName: integration?.name ?? 'Unknown',
      integrationSlug: integration?.slug ?? 'unknown',
      actionId: log.actionId,
      actionName: action?.name ?? 'Unknown',
      actionSlug: action?.slug ?? 'unknown',
      httpMethod: action?.httpMethod ?? requestSummary?.method ?? 'GET',
      endpoint: action?.endpointTemplate ?? requestSummary?.url ?? '/',
      status,
      statusCode: log.statusCode ?? 0,
      duration: log.latencyMs,
      requestHeaders: requestSummary?.headers,
      requestBody: requestSummary?.body,
      responseHeaders: responseSummary?.headers,
      responseBody: responseSummary?.body,
      errorMessage: error?.message,
      errorCode: error?.code,
      timestamp: log.createdAt.toISOString(),
      cached: false, // TODO: implement caching flag
      retryCount: log.retryCount,
    };
  });
}
