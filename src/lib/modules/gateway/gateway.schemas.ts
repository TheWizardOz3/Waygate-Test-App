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
import { ABSOLUTE_PAGINATION_LIMITS } from '../execution/pagination';
import {
  ValidationModeSchema,
  DriftStatusSchema,
  ValidationIssueSchema,
} from '../execution/validation';
import { MappingRequestSchema, FailureModeSchema, MappingErrorSchema } from '../execution/mapping';

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
 * Pagination options for action invocation
 * These override the action's default pagination configuration
 */
export const GatewayPaginationOptionsSchema = z.object({
  /** Fetch all pages up to limits (default: false = single page only) */
  fetchAll: z.boolean().default(false),
  /** Override max pages limit */
  maxPages: z.number().int().min(1).max(ABSOLUTE_PAGINATION_LIMITS.maxPages).optional(),
  /** Override max items limit */
  maxItems: z.number().int().min(1).max(ABSOLUTE_PAGINATION_LIMITS.maxItems).optional(),
  /** Override max characters limit (~4 chars per token) */
  maxCharacters: z
    .number()
    .int()
    .min(1000)
    .max(ABSOLUTE_PAGINATION_LIMITS.maxCharacters)
    .optional(),
  /** Override max duration in milliseconds */
  maxDurationMs: z
    .number()
    .int()
    .min(1000)
    .max(ABSOLUTE_PAGINATION_LIMITS.maxDurationMs)
    .optional(),
  /** Override page size for this request */
  pageSize: z.number().int().min(1).max(ABSOLUTE_PAGINATION_LIMITS.maxPageSize).optional(),
  /** Resume pagination from a previous truncated result */
  continuationToken: z.string().optional(),
});

export type GatewayPaginationOptions = z.infer<typeof GatewayPaginationOptionsSchema>;

/**
 * Validation options for action invocation
 * These override the action's default validation configuration
 */
export const GatewayValidationOptionsSchema = z.object({
  /** Override validation mode for this request */
  mode: ValidationModeSchema.optional(),
  /** Bypass validation entirely for this request (debugging) */
  bypassValidation: z.boolean().optional(),
});

export type GatewayValidationOptions = z.infer<typeof GatewayValidationOptionsSchema>;

/**
 * Mapping options for action invocation
 * These override the action's default mapping configuration
 */
export const GatewayMappingOptionsSchema = MappingRequestSchema;

export type GatewayMappingOptions = z.infer<typeof GatewayMappingOptionsSchema>;

// =============================================================================
// Context Injection Schemas
// =============================================================================

/**
 * Current user context for variable resolution
 */
export const CurrentUserVariableContextSchema = z.object({
  /** User ID */
  id: z.string().nullable().optional(),
  /** User email */
  email: z.string().nullable().optional(),
  /** User display name */
  name: z.string().nullable().optional(),
});

export type CurrentUserVariableContext = z.infer<typeof CurrentUserVariableContextSchema>;

/**
 * Runtime variables that can be passed with tool invocation.
 * These are highest priority in the resolution order.
 *
 * @example
 * {
 *   current_user: { id: "user_123", name: "John Doe" },
 *   api_version: "v2",
 *   custom_setting: true
 * }
 */
export const RuntimeVariablesSchema = z
  .object({
    /** Current user context (for ${current_user.*} variables) */
    current_user: CurrentUserVariableContextSchema.optional(),
  })
  .catchall(z.unknown());

export type RuntimeVariables = z.infer<typeof RuntimeVariablesSchema>;

/**
 * A single item in the injection context (reference data)
 */
export const InjectionContextItemSchema = z.object({
  /** External ID from the source system */
  id: z.string(),
  /** Display name for resolution */
  name: z.string(),
  /** Additional metadata */
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type InjectionContextItem = z.infer<typeof InjectionContextItemSchema>;

/**
 * Context for name-to-ID resolution during tool invocation.
 * Keyed by data type (e.g., "users", "channels").
 *
 * @example
 * {
 *   "channels": [{ "id": "C123", "name": "general" }],
 *   "users": [{ "id": "U456", "name": "sarah" }]
 * }
 */
export const InjectionContextSchema = z.record(z.string(), z.array(InjectionContextItemSchema));

export type InjectionContext = z.infer<typeof InjectionContextSchema>;

/**
 * Tracks a resolved input field
 */
export const ResolvedInputSchema = z.object({
  /** The original value provided */
  original: z.string(),
  /** The resolved value (ID) */
  resolved: z.string(),
});

export type ResolvedInput = z.infer<typeof ResolvedInputSchema>;

/**
 * All resolved inputs for an invocation
 */
export const ResolvedInputsMetadataSchema = z.record(z.string(), ResolvedInputSchema);

export type ResolvedInputsMetadata = z.infer<typeof ResolvedInputsMetadataSchema>;

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
  /** Pagination options for fetching multiple pages */
  pagination: GatewayPaginationOptionsSchema.optional(),
  /** Response validation options */
  validation: GatewayValidationOptionsSchema.optional(),
  /** Field mapping options */
  mapping: GatewayMappingOptionsSchema.optional(),
  /** Connection ID for multi-app connections (uses default/primary if not specified) */
  connectionId: z.string().uuid().optional(),
  /**
   * App ID for app-scoped invocations.
   * When provided (typically from wg_app_ key auth), the gateway resolves the App's
   * Connection for the integration instead of the default tenant connection.
   */
  appId: z.string().uuid().optional(),
  /**
   * External user ID for end-user credential resolution.
   * When provided, the gateway resolves AppUserCredential for this user under the
   * Connection, falling back to the Connection's shared IntegrationCredential.
   */
  externalUserId: z.string().optional(),
  /**
   * Context for name-to-ID resolution.
   * When provided, Waygate will resolve human-friendly names (like "#general" or "@sarah")
   * to their corresponding IDs using this context data.
   */
  context: InjectionContextSchema.optional(),
  /**
   * Runtime variables for dynamic context injection.
   * These override stored tenant/connection variables with highest priority.
   *
   * @example
   * {
   *   current_user: { id: "user_123", name: "John Doe" },
   *   api_version: "v2"
   * }
   */
  variables: RuntimeVariablesSchema.optional(),
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
// Pagination Metadata
// =============================================================================

/**
 * Truncation reasons for pagination
 */
export const TruncationReasonSchema = z.enum([
  'maxPages',
  'maxItems',
  'maxCharacters',
  'maxDuration',
  'error',
  'circular',
]);

export type TruncationReason = z.infer<typeof TruncationReasonSchema>;

/**
 * Pagination metadata included in paginated responses
 * Provides LLM-friendly information about what was fetched
 */
export const PaginationMetadataSchema = z.object({
  /** Number of items fetched across all pages */
  fetchedItems: z.number().int().min(0),
  /** Number of pages fetched */
  pagesFetched: z.number().int().min(0),
  /** Total items available (if API provides this) */
  totalItems: z.number().int().min(0).optional(),
  /** Total characters in the aggregated response */
  fetchedCharacters: z.number().int().min(0),
  /** Estimated token count (~fetchedCharacters / 4) - useful for LLM context planning */
  estimatedTokens: z.number().int().min(0),
  /** Whether more data exists beyond what was fetched */
  hasMore: z.boolean(),
  /** Whether pagination was stopped due to a limit being reached */
  truncated: z.boolean(),
  /** Why pagination was truncated (if truncated is true) */
  truncationReason: TruncationReasonSchema.optional(),
  /** Token to resume pagination from where it stopped */
  continuationToken: z.string().optional(),
  /** Total time spent paginating in milliseconds */
  durationMs: z.number().int().min(0),
});

export type PaginationMetadata = z.infer<typeof PaginationMetadataSchema>;

// =============================================================================
// Validation Metadata
// =============================================================================

/**
 * Validation metadata included in responses when validation is enabled
 */
export const ValidationMetadataSchema = z.object({
  /** Whether validation passed */
  valid: z.boolean(),
  /** Validation mode used */
  mode: ValidationModeSchema,
  /** Number of issues found */
  issueCount: z.number().int().min(0),
  /** Validation issues (if any) */
  issues: z.array(ValidationIssueSchema).optional(),
  /** Number of fields that were coerced */
  fieldsCoerced: z.number().int().min(0),
  /** Number of extra fields that were stripped */
  fieldsStripped: z.number().int().min(0),
  /** Number of fields that used defaults */
  fieldsDefaulted: z.number().int().min(0),
  /** Time spent validating */
  validationDurationMs: z.number().int().min(0),
  /** Current drift detection status */
  driftStatus: DriftStatusSchema.optional(),
  /** Drift status message (if not normal) */
  driftMessage: z.string().optional(),
});

export type ValidationMetadata = z.infer<typeof ValidationMetadataSchema>;

// =============================================================================
// Mapping Metadata
// =============================================================================

/**
 * Mapping source for connection-level mapping stats
 */
export const MappingSourceStatsSchema = z.object({
  /** Number of mappings from action-level defaults */
  fromDefaults: z.number().int().min(0),
  /** Number of mappings from connection-specific overrides */
  fromConnectionOverrides: z.number().int().min(0),
});

export type MappingSourceStats = z.infer<typeof MappingSourceStatsSchema>;

/**
 * Mapping metadata included in responses when field mapping is configured
 */
export const MappingMetadataSchema = z.object({
  /** Was mapping applied? */
  applied: z.boolean(),
  /** Was mapping bypassed? */
  bypassed: z.boolean(),
  /** Number of input mappings applied */
  inputMappingsApplied: z.number().int().min(0),
  /** Number of output mappings applied */
  outputMappingsApplied: z.number().int().min(0),
  /** Number of fields transformed */
  fieldsTransformed: z.number().int().min(0),
  /** Number of fields coerced */
  fieldsCoerced: z.number().int().min(0),
  /** Number of fields that used defaults */
  fieldsDefaulted: z.number().int().min(0),
  /** Time spent mapping */
  mappingDurationMs: z.number().int().min(0),
  /** Mapping errors (in passthrough mode) */
  errors: z.array(MappingErrorSchema).optional(),
  /** Failure mode used */
  failureMode: FailureModeSchema,
  /** Connection-level mapping resolution stats (only present when using per-app mappings) */
  connectionResolution: MappingSourceStatsSchema.optional(),
});

export type MappingMetadata = z.infer<typeof MappingMetadataSchema>;

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
  /** Pagination metadata (present when pagination was used) */
  pagination: PaginationMetadataSchema.optional(),
  /** Validation metadata (present when response validation is enabled) */
  validation: ValidationMetadataSchema.optional(),
  /** Mapping metadata (present when field mapping is configured) */
  mapping: MappingMetadataSchema.optional(),
});

export type ResponseMeta = z.infer<typeof ResponseMetaSchema>;

// =============================================================================
// Success Response
// =============================================================================

/**
 * Reference data item as returned in gateway response
 * Simplified format for AI context
 */
export const ReferenceDataContextItemSchema = z.object({
  /** External ID from the source system */
  id: z.string(),
  /** Display name */
  name: z.string(),
  /** Additional metadata fields */
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type ReferenceDataContextItem = z.infer<typeof ReferenceDataContextItemSchema>;

/**
 * Reference data context grouped by data type
 * Example: { users: [...], channels: [...] }
 */
export const ReferenceDataContextSchema = z.record(
  z.string(),
  z.array(ReferenceDataContextItemSchema)
);

export type ReferenceDataContext = z.infer<typeof ReferenceDataContextSchema>;

/**
 * Successful gateway response
 */
export const GatewaySuccessResponseSchema = z.object({
  success: z.literal(true),
  /**
   * LLM-friendly context string describing the response data.
   * Only present when the connection has a preamble template configured.
   * Example: "The Search Contacts results from Salesforce are:"
   */
  context: z.string().optional(),
  /**
   * Cached reference data for AI context (users, channels, etc.).
   * Keyed by data type (e.g., "users", "channels").
   * Only present when reference data is synced for this integration.
   */
  referenceData: ReferenceDataContextSchema.optional(),
  /**
   * Details of input fields that were resolved from human-friendly names to IDs.
   * Only present when context resolution occurred.
   * Allows AI agents to see what was resolved for transparency.
   *
   * @example
   * { "channel": { "original": "#general", "resolved": "C123456789" } }
   */
  resolvedInputs: ResolvedInputsMetadataSchema.optional(),
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
  CONFIGURATION_ERROR: {
    code: 'CONFIGURATION_ERROR',
    httpStatus: 400,
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

  // Response validation errors
  RESPONSE_VALIDATION_ERROR: {
    code: 'RESPONSE_VALIDATION_ERROR',
    httpStatus: 502,
    suggestedAction: 'CONTACT_EXTERNAL_PROVIDER' as SuggestedAction,
    retryable: false,
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
