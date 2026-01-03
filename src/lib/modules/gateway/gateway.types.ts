/**
 * Gateway Types
 *
 * TypeScript types and helper functions for Gateway API responses.
 * Provides builders for creating standardized success and error responses.
 */

import { randomUUID } from 'crypto';
import {
  GatewayErrorCodes,
  type GatewaySuccessResponse,
  type GatewayErrorResponse,
  type ExecutionMetrics,
  type ResponseMeta,
  type GatewayErrorInfo,
  type SuggestedResolution,
  type ErrorDetails,
  type GatewayErrorCode,
  type ValidationErrorDetail,
} from './gateway.schemas';

// =============================================================================
// Request ID Generation
// =============================================================================

/**
 * Generates a unique request ID
 */
export function generateRequestId(): string {
  return `req_${randomUUID().replace(/-/g, '').substring(0, 24)}`;
}

// =============================================================================
// Success Response Builder
// =============================================================================

/**
 * Creates a successful gateway response
 */
export function createSuccessResponse(
  data: unknown,
  metrics: ExecutionMetrics,
  requestId?: string
): GatewaySuccessResponse {
  const meta: ResponseMeta = {
    requestId: requestId ?? generateRequestId(),
    timestamp: new Date().toISOString(),
    execution: metrics,
  };

  return {
    success: true,
    data,
    meta,
  };
}

/**
 * Default execution metrics for cases where we don't have real metrics
 */
export function createDefaultMetrics(latencyMs: number = 0): ExecutionMetrics {
  return {
    latencyMs,
    retryCount: 0,
    cached: false,
  };
}

// =============================================================================
// Error Response Builder
// =============================================================================

/**
 * Options for creating an error response
 */
export interface CreateErrorResponseOptions {
  /** Error code (use GatewayErrorCodes keys) */
  code: string;
  /** Human-readable error message */
  message: string;
  /** Additional error details */
  details?: ErrorDetails;
  /** Override the suggested resolution */
  suggestedResolution?: SuggestedResolution;
  /** Request ID (generated if not provided) */
  requestId?: string;
}

/**
 * Creates an error gateway response
 */
export function createErrorResponse(options: CreateErrorResponseOptions): GatewayErrorResponse {
  const { code, message, details, suggestedResolution, requestId } = options;

  // Look up error code info for defaults
  const errorCodeInfo = GatewayErrorCodes[code as GatewayErrorCode];

  const errorInfo: GatewayErrorInfo = {
    code,
    message,
    requestId: requestId ?? generateRequestId(),
    details,
    suggestedResolution:
      suggestedResolution ??
      (errorCodeInfo
        ? {
            action: errorCodeInfo.suggestedAction,
            description: message,
            retryable: errorCodeInfo.retryable,
          }
        : undefined),
  };

  return {
    success: false,
    error: errorInfo,
  };
}

/**
 * Creates an error response from a known error code
 */
export function createErrorFromCode(
  errorCode: GatewayErrorCode,
  message: string,
  details?: ErrorDetails,
  requestId?: string
): GatewayErrorResponse {
  const errorInfo = GatewayErrorCodes[errorCode];

  return createErrorResponse({
    code: errorInfo.code,
    message,
    details,
    suggestedResolution: {
      action: errorInfo.suggestedAction,
      description: message,
      retryable: errorInfo.retryable,
    },
    requestId,
  });
}

/**
 * Creates a validation error response
 */
export function createValidationErrorResponse(
  errors: ValidationErrorDetail[],
  requestId?: string
): GatewayErrorResponse {
  const message = errors.length === 1 ? errors[0].message : `${errors.length} validation errors`;

  return createErrorFromCode('VALIDATION_ERROR', message, { errors }, requestId);
}

/**
 * Creates an integration not found error response
 */
export function createIntegrationNotFoundResponse(
  integrationSlug: string,
  requestId?: string
): GatewayErrorResponse {
  return createErrorFromCode(
    'INTEGRATION_NOT_FOUND',
    `Integration '${integrationSlug}' not found`,
    undefined,
    requestId
  );
}

/**
 * Creates an action not found error response
 */
export function createActionNotFoundResponse(
  integrationSlug: string,
  actionSlug: string,
  requestId?: string
): GatewayErrorResponse {
  return createErrorFromCode(
    'ACTION_NOT_FOUND',
    `Action '${integrationSlug}.${actionSlug}' not found`,
    undefined,
    requestId
  );
}

/**
 * Creates a credentials missing error response
 */
export function createCredentialsMissingResponse(
  integrationSlug: string,
  requestId?: string
): GatewayErrorResponse {
  return createErrorFromCode(
    'CREDENTIALS_MISSING',
    `No credentials configured for integration '${integrationSlug}'`,
    undefined,
    requestId
  );
}

/**
 * Creates a credentials expired error response
 */
export function createCredentialsExpiredResponse(
  integrationSlug: string,
  requestId?: string
): GatewayErrorResponse {
  return createErrorFromCode(
    'CREDENTIALS_EXPIRED',
    `Credentials for integration '${integrationSlug}' have expired`,
    undefined,
    requestId
  );
}

/**
 * Creates a rate limited error response
 */
export function createRateLimitedResponse(
  retryAfterMs?: number,
  requestId?: string
): GatewayErrorResponse {
  return createErrorResponse({
    code: GatewayErrorCodes.RATE_LIMITED.code,
    message: 'Rate limit exceeded',
    suggestedResolution: {
      action: 'RETRY_AFTER_DELAY',
      description: retryAfterMs
        ? `Wait ${Math.ceil(retryAfterMs / 1000)} seconds before retrying`
        : 'Wait before retrying',
      retryable: true,
      retryAfterMs: retryAfterMs ?? null,
    },
    requestId,
  });
}

/**
 * Creates a circuit open error response
 */
export function createCircuitOpenResponse(
  integrationSlug: string,
  requestId?: string
): GatewayErrorResponse {
  return createErrorFromCode(
    'CIRCUIT_OPEN',
    `Circuit breaker is open for integration '${integrationSlug}'. Too many recent failures.`,
    undefined,
    requestId
  );
}

/**
 * Creates an external API error response
 */
export function createExternalApiErrorResponse(
  statusCode: number,
  externalMessage?: string,
  requestId?: string
): GatewayErrorResponse {
  return createErrorResponse({
    code: GatewayErrorCodes.EXTERNAL_API_ERROR.code,
    message: externalMessage ?? `External API returned error (${statusCode})`,
    details: {
      externalStatusCode: statusCode,
      externalMessage,
    },
    requestId,
  });
}

/**
 * Creates a timeout error response
 */
export function createTimeoutResponse(timeoutMs: number, requestId?: string): GatewayErrorResponse {
  return createErrorFromCode(
    'TIMEOUT',
    `Request timed out after ${timeoutMs}ms`,
    { context: { timeoutMs } },
    requestId
  );
}

/**
 * Creates an internal error response
 */
export function createInternalErrorResponse(
  message: string = 'An internal error occurred',
  requestId?: string
): GatewayErrorResponse {
  return createErrorFromCode('INTERNAL_ERROR', message, undefined, requestId);
}

// =============================================================================
// HTTP Status Helpers
// =============================================================================

/**
 * Gets the HTTP status code for a gateway error code
 */
export function getHttpStatusForErrorCode(code: string): number {
  const errorInfo = GatewayErrorCodes[code as GatewayErrorCode];
  return errorInfo?.httpStatus ?? 500;
}

/**
 * Determines if an error is retryable based on its code
 */
export function isErrorRetryable(code: string): boolean {
  const errorInfo = GatewayErrorCodes[code as GatewayErrorCode];
  return errorInfo?.retryable ?? false;
}

// =============================================================================
// Type Guards
// =============================================================================

/**
 * Type guard for success response
 */
export function isSuccessResponse(response: {
  success: boolean;
}): response is GatewaySuccessResponse {
  return response.success === true;
}

/**
 * Type guard for error response
 */
export function isErrorResponse(response: { success: boolean }): response is GatewayErrorResponse {
  return response.success === false;
}
