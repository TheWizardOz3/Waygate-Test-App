/**
 * Gateway Service
 *
 * Core pipeline for action invocation. Orchestrates:
 * - Integration and action resolution
 * - Input validation
 * - Credential retrieval and application
 * - HTTP request building
 * - Execution with retry/circuit breaker
 * - Request/response logging
 * - Standardized response formatting
 *
 * This is the main entry point for all Gateway API action invocations.
 */

import { CredentialType } from '@prisma/client';
import type { Action, Integration } from '@prisma/client';
import type { JSONSchema7 } from 'json-schema';

// Internal modules
import { getIntegrationBySlugRaw } from '../integrations/integration.service';
import { IntegrationError } from '../integrations/integration.service';
import { getActionBySlug } from '../actions/action.service';
import { ActionError } from '../actions/action.service';
import {
  validateActionInput,
  formatAsApiError,
  type ValidationResult,
  type ValidationError,
} from '../actions/json-schema-validator';
import {
  getDecryptedCredential,
  isCredentialExpired,
  isOAuth2Credential,
  isApiKeyCredential,
  isBasicCredential,
  isBearerCredential,
  type DecryptedCredential,
} from '../credentials/credential.service';
import { applyApiKeyAuth } from '../credentials/auth-type-handlers/api-key.handler';
import { getBasicAuthHeaders } from '../credentials/auth-type-handlers/basic.handler';
import {
  getBearerAuthHeaders,
  getOAuth2AuthHeaders,
} from '../credentials/auth-type-handlers/bearer.handler';
import { getCustomHeaders } from '../credentials/auth-type-handlers/custom-header.handler';
import type { CustomHeaderCredentialData } from '../credentials/credential.schemas';
import {
  executeWithMetrics,
  type ExecutionResultWithMetrics,
} from '../execution/execution.service';
import type { HttpClientRequest, ExecutionErrorDetails } from '../execution/execution.schemas';
import { logRequestResponse } from '../logging/logging.service';
import {
  GatewayErrorCodes,
  type GatewaySuccessResponse,
  type GatewayErrorResponse,
  type GatewayInvokeOptions,
  type ValidationErrorDetail,
} from './gateway.schemas';

// =============================================================================
// Types
// =============================================================================

/**
 * Invocation context passed through the pipeline
 */
export interface InvocationContext {
  requestId: string;
  tenantId: string;
  integrationSlug: string;
  actionSlug: string;
  startTime: number;
}

/**
 * Result of resolving integration and action
 */
interface ResolvedAction {
  integration: Integration;
  action: Action;
}

/**
 * Built HTTP request ready for execution
 */
interface BuiltRequest {
  request: HttpClientRequest;
  url: string;
}

// =============================================================================
// Error Class
// =============================================================================

/**
 * Error thrown by gateway operations
 */
export class GatewayError extends Error {
  constructor(
    public code: keyof typeof GatewayErrorCodes,
    message: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'GatewayError';
  }

  get httpStatus(): number {
    return GatewayErrorCodes[this.code].httpStatus;
  }

  get suggestedAction(): string {
    return GatewayErrorCodes[this.code].suggestedAction;
  }

  get retryable(): boolean {
    return GatewayErrorCodes[this.code].retryable;
  }
}

// =============================================================================
// Main Gateway Service
// =============================================================================

/**
 * Invoke an action through the Gateway
 *
 * This is the main entry point for action invocation. It orchestrates:
 * 1. Resolving integration and action by slugs
 * 2. Validating input against action's JSON Schema
 * 3. Retrieving and applying credentials
 * 4. Building the HTTP request
 * 5. Executing with retry/circuit breaker
 * 6. Logging the request/response
 * 7. Returning standardized response
 *
 * @param tenantId - The tenant making the request
 * @param integrationSlug - The integration slug (e.g., 'slack')
 * @param actionSlug - The action slug (e.g., 'send-message')
 * @param input - The input data for the action
 * @param options - Optional invocation parameters
 * @returns Gateway response (success or error)
 */
export async function invokeAction(
  tenantId: string,
  integrationSlug: string,
  actionSlug: string,
  input: Record<string, unknown> = {},
  options: GatewayInvokeOptions = {}
): Promise<GatewaySuccessResponse | GatewayErrorResponse> {
  const startTime = Date.now();
  const requestId = generateRequestId();

  const context: InvocationContext = {
    requestId,
    tenantId,
    integrationSlug,
    actionSlug,
    startTime,
  };

  try {
    // 1. Resolve integration and action
    const { integration, action } = await resolveAction(tenantId, integrationSlug, actionSlug);

    // 2. Validate input (unless skipped)
    if (!options.skipValidation) {
      const validationResult = validateInput(action, input);
      if (!validationResult.valid) {
        throw createValidationError(validationResult);
      }
    }

    // 3. Get and validate credentials
    const credential = await getCredential(tenantId, integration.id);
    validateCredential(credential);

    // 4. Build the HTTP request
    const { request, url } = buildRequest(action, input, credential);

    // 5. Execute the request
    const executionResult = await executeRequest(request, integration.id, options);

    // 6. Log the request/response
    await logInvocation(context, action.id, request, url, executionResult);

    // 7. Format and return response
    if (executionResult.success) {
      return formatSuccessResponse(requestId, executionResult);
    } else {
      return formatExecutionErrorResponse(requestId, executionResult);
    }
  } catch (error) {
    // Handle known errors
    if (error instanceof GatewayError) {
      return formatGatewayErrorResponse(requestId, error);
    }
    if (error instanceof IntegrationError) {
      return formatIntegrationErrorResponse(requestId, error);
    }
    if (error instanceof ActionError) {
      return formatActionErrorResponse(requestId, error);
    }

    // Unknown error
    console.error('Gateway invocation error:', error);
    return formatInternalErrorResponse(requestId, error);
  }
}

// =============================================================================
// Pipeline Steps
// =============================================================================

/**
 * Step 1: Resolve integration and action by slugs
 */
async function resolveAction(
  tenantId: string,
  integrationSlug: string,
  actionSlug: string
): Promise<ResolvedAction> {
  // Get integration (also checks if disabled)
  const integration = await getIntegrationBySlugRaw(tenantId, integrationSlug);

  // Get action
  const action = await getActionBySlug(tenantId, integrationSlug, actionSlug);

  return { integration, action };
}

/**
 * Step 2: Validate input against action's JSON Schema
 */
function validateInput(action: Action, input: Record<string, unknown>): ValidationResult {
  const inputSchema = action.inputSchema as JSONSchema7 | null;

  // If no schema defined, allow any input
  if (!inputSchema || Object.keys(inputSchema).length === 0) {
    return { valid: true };
  }

  return validateActionInput(inputSchema, input);
}

/**
 * Create a validation error from result
 */
function createValidationError(result: ValidationResult): GatewayError {
  const errors = result.errors || [];
  const apiError = formatAsApiError(result);

  return new GatewayError('VALIDATION_ERROR', apiError.message, {
    errors: errors.map(formatValidationError),
  });
}

/**
 * Format a validation error for the API response
 */
function formatValidationError(error: ValidationError): ValidationErrorDetail {
  return {
    path: error.path,
    field: error.field,
    message: error.message,
    value: error.value,
  };
}

/**
 * Step 3: Get credentials for the integration
 */
async function getCredential(
  tenantId: string,
  integrationId: string
): Promise<DecryptedCredential | null> {
  return getDecryptedCredential(integrationId, tenantId);
}

/**
 * Validate that credentials are present and not expired
 */
function validateCredential(credential: DecryptedCredential | null): void {
  if (!credential) {
    throw new GatewayError('CREDENTIALS_MISSING', 'No credentials configured for this integration');
  }

  if (credential.status === 'needs_reauth') {
    throw new GatewayError('CREDENTIALS_EXPIRED', 'Credentials require re-authentication');
  }

  if (isCredentialExpired(credential)) {
    throw new GatewayError('CREDENTIALS_EXPIRED', 'Credentials have expired');
  }
}

/**
 * Step 4: Build the HTTP request from action template
 */
function buildRequest(
  action: Action,
  input: Record<string, unknown>,
  credential: DecryptedCredential | null
): BuiltRequest {
  // Build the URL with path parameters substituted
  const url = buildUrl(action.endpointTemplate, input);

  // Start with base headers
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };

  // Build body (for POST/PUT/PATCH)
  let body: unknown = undefined;
  if (['POST', 'PUT', 'PATCH'].includes(action.httpMethod)) {
    // Separate path params from body params
    body = extractBodyParams(action.endpointTemplate, input);
  }

  // Apply credentials
  const authConfig = applyCredentials(headers, credential);

  // Build query params for GET requests with remaining input
  let finalUrl = url;
  if (action.httpMethod === 'GET') {
    const queryParams = extractBodyParams(action.endpointTemplate, input);
    finalUrl = buildUrlWithQuery(
      url,
      queryParams as Record<string, unknown>,
      authConfig.queryParams
    );
  } else if (authConfig.queryParams && Object.keys(authConfig.queryParams).length > 0) {
    // Add auth query params even for non-GET requests
    finalUrl = buildUrlWithQuery(url, {}, authConfig.queryParams);
  }

  // Merge body params for non-GET requests
  if (body && authConfig.bodyParams && Object.keys(authConfig.bodyParams).length > 0) {
    body = { ...(body as Record<string, unknown>), ...authConfig.bodyParams };
  }

  const request: HttpClientRequest = {
    url: finalUrl,
    method: action.httpMethod as 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    headers: { ...headers, ...authConfig.headers },
    body,
  };

  return { request, url: finalUrl };
}

/**
 * Build URL with path parameter substitution
 * Replaces {param} placeholders with values from input
 */
function buildUrl(template: string, input: Record<string, unknown>): string {
  let url = template;

  // Find all {param} placeholders
  const paramRegex = /\{([^}]+)\}/g;
  let match;

  while ((match = paramRegex.exec(template)) !== null) {
    const paramName = match[1];
    const value = input[paramName];

    if (value === undefined || value === null) {
      throw new GatewayError('VALIDATION_ERROR', `Missing required path parameter: ${paramName}`, {
        missingParam: paramName,
      });
    }

    url = url.replace(`{${paramName}}`, encodeURIComponent(String(value)));
  }

  return url;
}

/**
 * Build URL with query parameters
 */
function buildUrlWithQuery(
  baseUrl: string,
  params: Record<string, unknown>,
  authParams: Record<string, string> = {}
): string {
  const urlObj = new URL(baseUrl);

  // Add input params
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      urlObj.searchParams.set(key, String(value));
    }
  }

  // Add auth params
  for (const [key, value] of Object.entries(authParams)) {
    urlObj.searchParams.set(key, value);
  }

  return urlObj.toString();
}

/**
 * Extract body params (remove path params from input)
 */
function extractBodyParams(
  template: string,
  input: Record<string, unknown>
): Record<string, unknown> {
  const pathParams = new Set<string>();

  // Find all {param} placeholders
  const paramRegex = /\{([^}]+)\}/g;
  let match;

  while ((match = paramRegex.exec(template)) !== null) {
    pathParams.add(match[1]);
  }

  // Return input without path params
  const body: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (!pathParams.has(key)) {
      body[key] = value;
    }
  }

  return body;
}

/**
 * Apply credentials to request headers/query/body
 */
function applyCredentials(
  headers: Record<string, string>,
  credential: DecryptedCredential | null
): {
  headers: Record<string, string>;
  queryParams: Record<string, string>;
  bodyParams: Record<string, string>;
} {
  const result = {
    headers: { ...headers },
    queryParams: {} as Record<string, string>,
    bodyParams: {} as Record<string, string>,
  };

  if (!credential) {
    return result;
  }

  // Apply based on credential type
  if (isOAuth2Credential(credential)) {
    result.headers = { ...result.headers, ...getOAuth2AuthHeaders(credential.data) };
  } else if (isBearerCredential(credential)) {
    result.headers = { ...result.headers, ...getBearerAuthHeaders(credential.data) };
  } else if (isBasicCredential(credential)) {
    result.headers = { ...result.headers, ...getBasicAuthHeaders(credential.data) };
  } else if (isApiKeyCredential(credential)) {
    const apiKeyConfig = applyApiKeyAuth(credential.data);
    result.headers = { ...result.headers, ...apiKeyConfig.headers };
    result.queryParams = { ...result.queryParams, ...apiKeyConfig.queryParams };
    result.bodyParams = { ...result.bodyParams, ...apiKeyConfig.bodyParams };
  } else if (credential.credentialType === CredentialType.bearer) {
    // Handle custom header credentials (stored as bearer type for flexibility)
    // Check if data has headers property (custom header format)
    const data = credential.data as unknown;
    if (data && typeof data === 'object' && 'headers' in data) {
      result.headers = {
        ...result.headers,
        ...getCustomHeaders(data as CustomHeaderCredentialData),
      };
    }
  }

  return result;
}

/**
 * Step 5: Execute the HTTP request
 */
async function executeRequest(
  request: HttpClientRequest,
  integrationId: string,
  options: GatewayInvokeOptions
): Promise<ExecutionResultWithMetrics<unknown>> {
  return executeWithMetrics(request, {
    circuitBreakerId: integrationId,
    timeout: options.timeoutMs,
    idempotencyKey: options.idempotencyKey,
  });
}

/**
 * Step 6: Log the invocation
 */
async function logInvocation(
  context: InvocationContext,
  actionId: string,
  request: HttpClientRequest,
  url: string,
  result: ExecutionResultWithMetrics<unknown>
): Promise<void> {
  try {
    await logRequestResponse({
      tenantId: context.tenantId,
      integrationId: context.integrationSlug, // Use slug for readability in logs
      actionId,
      request: {
        method: request.method,
        url,
        headers: request.headers,
        body: request.body,
      },
      response: result.success
        ? {
            statusCode: 200, // Execution service doesn't return status code on success
            body: result.data,
          }
        : undefined,
      latencyMs: result.totalDurationMs,
      retryCount: result.attempts - 1,
      error: result.success ? undefined : result.error,
    });
  } catch (logError) {
    // Don't fail the request if logging fails
    console.error('Failed to log request:', logError);
  }
}

// =============================================================================
// Response Formatting
// =============================================================================

/**
 * Format a successful response
 */
function formatSuccessResponse(
  requestId: string,
  result: ExecutionResultWithMetrics<unknown>
): GatewaySuccessResponse {
  return {
    success: true,
    data: result.data,
    meta: {
      requestId,
      timestamp: new Date().toISOString(),
      execution: {
        latencyMs: result.totalDurationMs,
        retryCount: result.attempts - 1,
        cached: false, // TODO: Implement caching
        externalLatencyMs: result.lastRequestDurationMs,
      },
    },
  };
}

/**
 * Format an execution error response
 */
function formatExecutionErrorResponse(
  requestId: string,
  result: ExecutionResultWithMetrics<unknown>
): GatewayErrorResponse {
  const error = result.error as ExecutionErrorDetails;
  const errorCode = mapExecutionErrorCode(error?.code);

  return {
    success: false,
    error: {
      code: errorCode.code,
      message: error?.message || 'External API request failed',
      details: error?.statusCode
        ? {
            externalStatusCode: error.statusCode,
            externalMessage: error.message,
          }
        : undefined,
      requestId,
      suggestedResolution: {
        action: errorCode.suggestedAction,
        description: getErrorResolutionDescription(errorCode.code, error),
        retryable: errorCode.retryable,
        retryAfterMs: error?.retryAfterMs ?? null,
      },
    },
  };
}

/**
 * Map execution error codes to gateway error codes
 */
function mapExecutionErrorCode(
  code?: string
): (typeof GatewayErrorCodes)[keyof typeof GatewayErrorCodes] {
  switch (code) {
    case 'RATE_LIMITED':
      return GatewayErrorCodes.RATE_LIMITED;
    case 'TIMEOUT':
      return GatewayErrorCodes.TIMEOUT;
    case 'CIRCUIT_OPEN':
      return GatewayErrorCodes.CIRCUIT_OPEN;
    case 'NETWORK_ERROR':
    case 'SERVER_ERROR':
      return GatewayErrorCodes.EXTERNAL_API_ERROR;
    default:
      return GatewayErrorCodes.EXTERNAL_API_ERROR;
  }
}

/**
 * Get human-readable resolution description
 */
function getErrorResolutionDescription(code: string, error?: ExecutionErrorDetails): string {
  switch (code) {
    case 'RATE_LIMITED':
      return error?.retryAfterMs
        ? `External API rate limited. Retry after ${Math.ceil(error.retryAfterMs / 1000)} seconds.`
        : 'External API rate limited. Wait before retrying.';
    case 'TIMEOUT':
      return 'Request timed out. The external API may be slow or unresponsive.';
    case 'CIRCUIT_OPEN':
      return 'Circuit breaker is open due to repeated failures. The service will retry automatically.';
    case 'EXTERNAL_API_ERROR':
      return 'The external API returned an error. Check the external service status.';
    default:
      return 'An error occurred while processing the request.';
  }
}

/**
 * Format a gateway error response
 */
function formatGatewayErrorResponse(requestId: string, error: GatewayError): GatewayErrorResponse {
  return {
    success: false,
    error: {
      code: error.code,
      message: error.message,
      details: error.details ? { context: error.details } : undefined,
      requestId,
      suggestedResolution: {
        action:
          error.suggestedAction as GatewayErrorResponse['error']['suggestedResolution'] extends {
            action: infer A;
          }
            ? A
            : never,
        description: getGatewayErrorDescription(error.code, error.message),
        retryable: error.retryable,
      },
    },
  };
}

/**
 * Get description for gateway errors
 */
function getGatewayErrorDescription(code: string, message: string): string {
  switch (code) {
    case 'VALIDATION_ERROR':
      return `Input validation failed: ${message}. Please check the action schema and correct your input.`;
    case 'CREDENTIALS_MISSING':
      return 'No credentials are configured for this integration. Set up authentication first.';
    case 'CREDENTIALS_EXPIRED':
      return 'Credentials have expired. Re-authenticate to continue using this integration.';
    default:
      return message;
  }
}

/**
 * Format an integration error response
 */
function formatIntegrationErrorResponse(
  requestId: string,
  error: IntegrationError
): GatewayErrorResponse {
  let code: keyof typeof GatewayErrorCodes = 'INTERNAL_ERROR';

  if (error.code === 'INTEGRATION_NOT_FOUND') {
    code = 'INTEGRATION_NOT_FOUND';
  } else if (error.code === 'INTEGRATION_DISABLED') {
    code = 'INTEGRATION_DISABLED';
  }

  const errorConfig = GatewayErrorCodes[code];

  return {
    success: false,
    error: {
      code: errorConfig.code,
      message: error.message,
      requestId,
      suggestedResolution: {
        action: errorConfig.suggestedAction,
        description: `Integration error: ${error.message}`,
        retryable: errorConfig.retryable,
      },
    },
  };
}

/**
 * Format an action error response
 */
function formatActionErrorResponse(requestId: string, error: ActionError): GatewayErrorResponse {
  const code: keyof typeof GatewayErrorCodes =
    error.code === 'ACTION_NOT_FOUND' ? 'ACTION_NOT_FOUND' : 'INTERNAL_ERROR';

  const errorConfig = GatewayErrorCodes[code];

  return {
    success: false,
    error: {
      code: errorConfig.code,
      message: error.message,
      requestId,
      suggestedResolution: {
        action: errorConfig.suggestedAction,
        description: `Action error: ${error.message}`,
        retryable: errorConfig.retryable,
      },
    },
  };
}

/**
 * Format an internal error response
 */
function formatInternalErrorResponse(requestId: string, error: unknown): GatewayErrorResponse {
  const message = error instanceof Error ? error.message : 'An unexpected error occurred';

  return {
    success: false,
    error: {
      code: GatewayErrorCodes.INTERNAL_ERROR.code,
      message,
      requestId,
      suggestedResolution: {
        action: GatewayErrorCodes.INTERNAL_ERROR.suggestedAction,
        description:
          'An internal error occurred. Please try again or contact support if the issue persists.',
        retryable: false,
      },
    },
  };
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Generate a unique request ID
 */
function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Get the HTTP status code for a gateway error response
 */
export function getHttpStatusForError(response: GatewayErrorResponse): number {
  const code = response.error.code as keyof typeof GatewayErrorCodes;
  return GatewayErrorCodes[code]?.httpStatus ?? 500;
}
