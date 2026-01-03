/**
 * Gateway Schemas
 *
 * Zod schemas for Gateway API request/response validation.
 * Defines the unified format for action invocation, responses, and errors.
 *
 * These schemas are designed to be LLM-friendly - error responses include
 * suggested resolutions that help AI agents understand how to fix issues.
 */

import { z } from 'zod';

// =============================================================================
// Request Schemas
// =============================================================================

/**
 * Action invocation request body
 * The actual shape depends on the action's inputSchema, but we validate
 * that it's a valid JSON object
 */
export const GatewayInvokeRequestSchema = z.record(z.string(), z.unknown());

export type GatewayInvokeRequest = z.infer<typeof GatewayInvokeRequestSchema>;

/**
 * Options that can be passed with the invocation
 */
export const GatewayInvokeOptionsSchema = z.object({
  /** Skip input validation (use with caution) */
  skipValidation: z.boolean().optional(),
  /** Custom timeout in milliseconds */
  timeoutMs: z.number().int().min(1000).max(300000).optional(),
  /** Idempotency key for safe retries */
  idempotencyKey: z.string().optional(),
  /** Whether to include raw response from external API */
  includeRawResponse: z.boolean().optional(),
});

export type GatewayInvokeOptions = z.infer<typeof GatewayInvokeOptionsSchema>;

// =============================================================================
// Execution Metrics
// =============================================================================

/**
 * Execution metrics included in response
 */
export const ExecutionMetricsSchema = z.object({
  /** Total latency in milliseconds (Waygate overhead + external API) */
  latencyMs: z.number().int().min(0),
  /** Number of retry attempts made */
  retryCount: z.number().int().min(0),
  /** Whether response was served from cache */
  cached: z.boolean(),
  /** External API response time in milliseconds (if available) */
  externalLatencyMs: z.number().int().min(0).optional(),
});

export type ExecutionMetrics = z.infer<typeof ExecutionMetricsSchema>;

// =============================================================================
// Response Meta
// =============================================================================

/**
 * Response metadata
 */
export const ResponseMetaSchema = z.object({
  /** Unique request ID for debugging */
  requestId: z.string(),
  /** Timestamp of the response */
  timestamp: z.string(),
  /** Execution metrics */
  execution: ExecutionMetricsSchema,
});

export type ResponseMeta = z.infer<typeof ResponseMetaSchema>;

// =============================================================================
// Success Response
// =============================================================================

/**
 * Successful gateway response
 */
export const GatewaySuccessResponseSchema = z.object({
  success: z.literal(true),
  /** Response data from the external API */
  data: z.unknown(),
  /** Response metadata with execution metrics */
  meta: ResponseMetaSchema,
});

export type GatewaySuccessResponse = z.infer<typeof GatewaySuccessResponseSchema>;

// =============================================================================
// Error Response
// =============================================================================

/**
 * Suggested resolution actions for LLM agents
 */
export const SuggestedActionSchema = z.enum([
  'RETRY_WITH_MODIFIED_INPUT',
  'RETRY_AFTER_DELAY',
  'REFRESH_CREDENTIALS',
  'CHECK_INTEGRATION_CONFIG',
  'CONTACT_EXTERNAL_PROVIDER',
  'ESCALATE_TO_ADMIN',
]);

export type SuggestedAction = z.infer<typeof SuggestedActionSchema>;

/**
 * Suggested resolution details
 */
export const SuggestedResolutionSchema = z.object({
  /** Type of action to take */
  action: SuggestedActionSchema,
  /** Human/LLM readable description of how to resolve */
  description: z.string(),
  /** Whether the request can be retried */
  retryable: z.boolean(),
  /** Delay before retry in milliseconds (if rate limited) */
  retryAfterMs: z.number().int().min(0).nullable().optional(),
});

export type SuggestedResolution = z.infer<typeof SuggestedResolutionSchema>;

/**
 * Validation error detail
 */
export const ValidationErrorDetailSchema = z.object({
  /** JSONPath to the invalid field */
  path: z.string(),
  /** Field name */
  field: z.string().optional(),
  /** Human-readable error message */
  message: z.string(),
  /** The value that failed validation */
  value: z.unknown().optional(),
});

export type ValidationErrorDetail = z.infer<typeof ValidationErrorDetailSchema>;

/**
 * Error details object
 */
export const ErrorDetailsSchema = z.object({
  /** Validation errors (for VALIDATION_ERROR) */
  errors: z.array(ValidationErrorDetailSchema).optional(),
  /** HTTP status code from external API */
  externalStatusCode: z.number().int().optional(),
  /** Error message from external API */
  externalMessage: z.string().optional(),
  /** Additional context */
  context: z.record(z.string(), z.unknown()).optional(),
});

export type ErrorDetails = z.infer<typeof ErrorDetailsSchema>;

/**
 * Error information in response
 */
export const GatewayErrorInfoSchema = z.object({
  /** Error code (e.g., VALIDATION_ERROR, INTEGRATION_NOT_FOUND) */
  code: z.string(),
  /** Human-readable error message */
  message: z.string(),
  /** Additional error details */
  details: ErrorDetailsSchema.optional(),
  /** Request ID for debugging */
  requestId: z.string(),
  /** Suggested resolution for LLM agents */
  suggestedResolution: SuggestedResolutionSchema.optional(),
});

export type GatewayErrorInfo = z.infer<typeof GatewayErrorInfoSchema>;

/**
 * Error gateway response
 */
export const GatewayErrorResponseSchema = z.object({
  success: z.literal(false),
  error: GatewayErrorInfoSchema,
});

export type GatewayErrorResponse = z.infer<typeof GatewayErrorResponseSchema>;

// =============================================================================
// Combined Response Type
// =============================================================================

/**
 * Union type for all gateway responses
 */
export const GatewayResponseSchema = z.discriminatedUnion('success', [
  GatewaySuccessResponseSchema,
  GatewayErrorResponseSchema,
]);

export type GatewayResponse = z.infer<typeof GatewayResponseSchema>;

// =============================================================================
// Health Check Schemas
// =============================================================================

/**
 * Health status values
 */
export const HealthStatusSchema = z.enum(['healthy', 'degraded', 'unhealthy']);
export type HealthStatus = z.infer<typeof HealthStatusSchema>;

/**
 * Circuit breaker status values
 */
export const CircuitBreakerStatusSchema = z.enum(['closed', 'open', 'half_open']);
export type CircuitBreakerStatus = z.infer<typeof CircuitBreakerStatusSchema>;

/**
 * Credential health info
 */
export const CredentialHealthSchema = z.object({
  status: z.string(),
  expiresAt: z.string().nullable(),
  needsRefresh: z.boolean(),
});

export type CredentialHealth = z.infer<typeof CredentialHealthSchema>;

/**
 * Circuit breaker health info
 */
export const CircuitBreakerHealthSchema = z.object({
  status: CircuitBreakerStatusSchema,
  failureCount: z.number().int().min(0),
});

export type CircuitBreakerHealth = z.infer<typeof CircuitBreakerHealthSchema>;

/**
 * Integration health response data
 */
export const IntegrationHealthDataSchema = z.object({
  status: HealthStatusSchema,
  credentials: CredentialHealthSchema.nullable(),
  circuitBreaker: CircuitBreakerHealthSchema,
  lastSuccessfulRequest: z.string().nullable(),
});

export type IntegrationHealthData = z.infer<typeof IntegrationHealthDataSchema>;

/**
 * Integration health response
 */
export const IntegrationHealthResponseSchema = z.object({
  success: z.literal(true),
  data: IntegrationHealthDataSchema,
});

export type IntegrationHealthResponse = z.infer<typeof IntegrationHealthResponseSchema>;

// =============================================================================
// Error Codes
// =============================================================================

/**
 * Gateway error codes with their HTTP status and suggested actions
 */
export const GatewayErrorCodes = {
  // Client errors
  VALIDATION_ERROR: {
    code: 'VALIDATION_ERROR',
    httpStatus: 400,
    suggestedAction: 'RETRY_WITH_MODIFIED_INPUT' as SuggestedAction,
    retryable: true,
  },
  INTEGRATION_NOT_FOUND: {
    code: 'INTEGRATION_NOT_FOUND',
    httpStatus: 404,
    suggestedAction: 'CHECK_INTEGRATION_CONFIG' as SuggestedAction,
    retryable: false,
  },
  ACTION_NOT_FOUND: {
    code: 'ACTION_NOT_FOUND',
    httpStatus: 404,
    suggestedAction: 'CHECK_INTEGRATION_CONFIG' as SuggestedAction,
    retryable: false,
  },
  INTEGRATION_DISABLED: {
    code: 'INTEGRATION_DISABLED',
    httpStatus: 403,
    suggestedAction: 'CHECK_INTEGRATION_CONFIG' as SuggestedAction,
    retryable: false,
  },
  CREDENTIALS_MISSING: {
    code: 'CREDENTIALS_MISSING',
    httpStatus: 401,
    suggestedAction: 'REFRESH_CREDENTIALS' as SuggestedAction,
    retryable: false,
  },
  CREDENTIALS_EXPIRED: {
    code: 'CREDENTIALS_EXPIRED',
    httpStatus: 401,
    suggestedAction: 'REFRESH_CREDENTIALS' as SuggestedAction,
    retryable: true,
  },

  // External API errors
  RATE_LIMITED: {
    code: 'RATE_LIMITED',
    httpStatus: 429,
    suggestedAction: 'RETRY_AFTER_DELAY' as SuggestedAction,
    retryable: true,
  },
  CIRCUIT_OPEN: {
    code: 'CIRCUIT_OPEN',
    httpStatus: 503,
    suggestedAction: 'RETRY_AFTER_DELAY' as SuggestedAction,
    retryable: true,
  },
  EXTERNAL_API_ERROR: {
    code: 'EXTERNAL_API_ERROR',
    httpStatus: 502,
    suggestedAction: 'CONTACT_EXTERNAL_PROVIDER' as SuggestedAction,
    retryable: false,
  },
  TIMEOUT: {
    code: 'TIMEOUT',
    httpStatus: 504,
    suggestedAction: 'RETRY_AFTER_DELAY' as SuggestedAction,
    retryable: true,
  },

  // Internal errors
  INTERNAL_ERROR: {
    code: 'INTERNAL_ERROR',
    httpStatus: 500,
    suggestedAction: 'ESCALATE_TO_ADMIN' as SuggestedAction,
    retryable: false,
  },
} as const;

export type GatewayErrorCode = keyof typeof GatewayErrorCodes;
