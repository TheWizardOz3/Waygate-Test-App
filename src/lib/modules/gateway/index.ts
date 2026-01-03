/**
 * Gateway Module
 *
 * Unified REST API for invoking actions across integrations.
 * Provides standardized request/response formats with LLM-friendly error handling.
 */

// =============================================================================
// Schemas
// =============================================================================

export {
  // Request schemas
  GatewayInvokeRequestSchema,
  GatewayInvokeOptionsSchema,
  // Metrics & Meta
  ExecutionMetricsSchema,
  ResponseMetaSchema,
  // Success response
  GatewaySuccessResponseSchema,
  // Error response components
  SuggestedActionSchema,
  SuggestedResolutionSchema,
  ValidationErrorDetailSchema,
  ErrorDetailsSchema,
  GatewayErrorInfoSchema,
  GatewayErrorResponseSchema,
  // Combined response
  GatewayResponseSchema,
  // Health check schemas
  HealthStatusSchema,
  CircuitBreakerStatusSchema,
  CredentialHealthSchema,
  CircuitBreakerHealthSchema,
  IntegrationHealthDataSchema,
  IntegrationHealthResponseSchema,
  // Error codes
  GatewayErrorCodes,
} from './gateway.schemas';

export type {
  GatewayInvokeRequest,
  GatewayInvokeOptions,
  ExecutionMetrics,
  ResponseMeta,
  GatewaySuccessResponse,
  SuggestedAction,
  SuggestedResolution,
  ValidationErrorDetail,
  ErrorDetails,
  GatewayErrorInfo,
  GatewayErrorResponse,
  GatewayResponse,
  HealthStatus,
  CircuitBreakerStatus,
  CredentialHealth,
  CircuitBreakerHealth,
  IntegrationHealthData,
  IntegrationHealthResponse,
  GatewayErrorCode,
} from './gateway.schemas';

// =============================================================================
// Types & Builders
// =============================================================================

export {
  // Request ID generation
  generateRequestId,
  // Success response builders
  createSuccessResponse,
  createDefaultMetrics,
  // Error response builders
  createErrorResponse,
  createErrorFromCode,
  createValidationErrorResponse,
  createIntegrationNotFoundResponse,
  createActionNotFoundResponse,
  createCredentialsMissingResponse,
  createCredentialsExpiredResponse,
  createRateLimitedResponse,
  createCircuitOpenResponse,
  createExternalApiErrorResponse,
  createTimeoutResponse,
  createInternalErrorResponse,
  // HTTP status helpers
  getHttpStatusForErrorCode,
  isErrorRetryable,
  // Type guards
  isSuccessResponse,
  isErrorResponse,
} from './gateway.types';

export type { CreateErrorResponseOptions } from './gateway.types';

// =============================================================================
// Service
// =============================================================================

export {
  // Main invocation function
  invokeAction,
  // Error class
  GatewayError,
  // HTTP status helper
  getHttpStatusForError,
} from './gateway.service';

export type { InvocationContext } from './gateway.service';
