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
  resolveContextReferences,
  formatResolutionDetails,
  generateFieldHints,
  type ResolutionContext,
  type ContextResolutionResult,
} from '../tool-export/handlers/context-resolver';
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
import {
  validationService,
  type ValidateResponseResult,
  type ValidationRequest,
} from '../execution/validation/server';
import { logRequestResponse } from '../logging/logging.service';
import {
  GatewayErrorCodes,
  type GatewaySuccessResponse,
  type GatewayErrorResponse,
  type GatewayInvokeOptions,
  type ValidationErrorDetail,
  type ValidationMetadata,
  type MappingMetadata,
} from './gateway.schemas';
import {
  mappingService,
  type MappingResult,
  type FullMappingResult,
} from '../execution/mapping/server';
import { driftRepository } from '../execution/validation/drift/drift.repository';
import { applyPreamble, type PreambleResult } from '../execution/preamble';
import { resolveConnection } from '../connections';
import {
  findByTypes as findReferenceDataByTypes,
  getDataTypes as getReferenceDataTypes,
} from '../reference-data';
import type { ReferenceDataContext } from './gateway.schemas';

// Variable resolution imports (Phase 3: Gateway Integration)
import {
  resolveTemplate,
  resolveTemplates,
  containsVariableReferences,
  buildRuntimeContext,
  getEnvironment,
  summarizeResolution,
  type VariableResolutionResult,
} from '../variables';

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
  /** Connection ID for multi-app connections */
  connectionId?: string;
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
    connectionId: options.connectionId,
  };

  try {
    // 1. Resolve integration and action
    const { integration, action } = await resolveAction(tenantId, integrationSlug, actionSlug);

    // 1b. Resolve connection (defaults to primary/first active if not specified)
    const connection = await resolveConnection(tenantId, integration.id, options.connectionId);
    context.connectionId = connection.id;

    // 1.5. Resolve variables in action configuration
    // This resolves ${var.*}, ${current_user.*}, ${connection.*}, ${request.*} references
    const variableResolutionResult = await resolveActionVariables(
      tenantId,
      connection,
      action,
      options
    );
    // Use resolved action for subsequent steps
    const resolvedAction = variableResolutionResult.action;

    // 2. Apply INPUT mapping (transform request params before sending)
    // Uses connection-specific mapping overrides if available
    let inputMappingResult: FullMappingResult | undefined;
    let mappedInput: Record<string, unknown> = input;

    try {
      inputMappingResult = await mappingService.applyInputMapping(input, {
        actionId: action.id,
        tenantId,
        connectionId: connection.id, // Use resolved connection for per-app mappings
        requestOptions: options.mapping,
      });
      mappedInput = inputMappingResult.mappedInput as Record<string, unknown>;
    } catch (mappingError) {
      // Log but don't fail - input mapping errors should be non-fatal
      console.warn('[GATEWAY] Input mapping error:', mappingError);
    }

    // 2b. Apply CONTEXT resolution (resolve human-friendly names to IDs)
    // Uses the context from invocation options to resolve references like "#general" -> "C123"
    let contextResolutionResult: ContextResolutionResult | undefined;
    if (options.context && Object.keys(options.context).length > 0) {
      try {
        // Generate field hints from the input field names
        const fieldHints = generateFieldHints(Object.keys(mappedInput));

        // Resolve references in the mapped input
        contextResolutionResult = resolveContextReferences(
          mappedInput,
          options.context as ResolutionContext,
          fieldHints
        );

        // Use resolved input for subsequent steps
        if (contextResolutionResult.hasResolutions) {
          mappedInput = contextResolutionResult.resolvedInput;
          console.log('[GATEWAY] Context resolution applied:', {
            resolvedCount: contextResolutionResult.resolvedCount,
            resolutions: formatResolutionDetails(contextResolutionResult.resolutions),
          });
        }
      } catch (resolutionError) {
        // Log but don't fail - context resolution errors should be non-fatal
        console.warn('[GATEWAY] Context resolution error:', resolutionError);
      }
    }

    // 3. Validate input (unless skipped) - validate MAPPED and RESOLVED input
    if (!options.skipValidation) {
      const validationResult = validateInput(action, mappedInput);
      if (!validationResult.valid) {
        // Record input validation failures for drift detection (non-blocking)
        recordInputValidationFailures(action.id, tenantId, validationResult).catch((err) => {
          console.error('[GATEWAY] Failed to record input validation failures:', err);
        });
        throw createValidationError(validationResult);
      }
    }

    // 4. Get and validate credentials (skip for 'none' auth type)
    // Use the resolved connection's credentials
    let credential: DecryptedCredential | null = null;
    if (integration.authType !== 'none') {
      credential = await getCredential(tenantId, integration.id, connection.id);
      validateCredential(credential);
    }

    // 5. Build the HTTP request with MAPPED input
    // Use resolvedAction which has variable references resolved in endpoint, headers, and defaults
    const { request, url } = buildRequest(integration, resolvedAction, mappedInput, credential);

    // 6. Execute the request
    const executionResult = await executeRequest(request, integration.id, options);

    // 7. Validate RAW response (if execution succeeded)
    // Validation runs BEFORE output mapping per feature spec
    let validationResult: ValidateResponseResult | undefined;
    if (executionResult.success) {
      validationResult = await validateResponse(
        executionResult.data,
        action,
        context.tenantId,
        options.validation
      );

      // In strict mode, validation failure should return an error
      if (!validationResult.valid && validationResult.metadata.mode === 'strict') {
        return formatValidationErrorResponse(requestId, validationResult, executionResult);
      }
    }

    // 8. Apply OUTPUT mapping (transform response data after validation)
    // Uses connection-specific mapping overrides if available
    let outputMappingResult: MappingResult | undefined;
    let finalResponseData = executionResult.data;

    if (executionResult.success) {
      try {
        // Use validated data if available (may have been transformed by coercion)
        const dataToMap = validationResult?.data ?? executionResult.data;
        outputMappingResult = await mappingService.applyOutputMapping(dataToMap, {
          actionId: action.id,
          tenantId,
          connectionId: connection.id, // Use resolved connection for per-app mappings
          requestOptions: options.mapping,
        });
        finalResponseData = outputMappingResult.data;
      } catch (mappingError) {
        // Log but don't fail - output mapping errors should be non-fatal
        console.warn('[GATEWAY] Output mapping error:', mappingError);
      }
    }

    // 9. Apply LLM Response Preamble (if configured on connection)
    // Preamble is applied AFTER field mappings so it describes the final data shape
    let preambleResult: PreambleResult | undefined;
    if (executionResult.success && connection.preambleTemplate) {
      preambleResult = applyPreamble(
        connection.preambleTemplate,
        {
          integrationName: integration.name,
          integrationSlug: integration.slug,
          actionName: action.name,
          actionSlug: action.slug,
          connectionName: connection.name,
        },
        finalResponseData
      );
    }

    // 10. Fetch reference data for AI context (if synced for this integration)
    let referenceDataContext: ReferenceDataContext | undefined;
    if (executionResult.success) {
      referenceDataContext = await buildReferenceDataContext(integration.id, connection.id);
    }

    // 12. Log the request/response (with connection ID for multi-app tracking)
    await logInvocation(
      context,
      integration.id,
      action.id,
      connection.id,
      request,
      url,
      executionResult
    );

    // 13. Format and return response
    if (executionResult.success) {
      return formatSuccessResponse(
        requestId,
        executionResult,
        validationResult,
        inputMappingResult,
        outputMappingResult,
        finalResponseData,
        preambleResult,
        referenceDataContext,
        contextResolutionResult
      );
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
 * Step 1.5: Resolve variables in action configuration
 *
 * Resolves ${var.*}, ${current_user.*}, ${connection.*}, ${request.*} references in:
 * - Endpoint template (e.g., "/api/${var.api_version}/users")
 * - Header configurations (from action metadata)
 * - Default parameter values in inputSchema
 *
 * Resolution priority:
 * 1. Request context (options.variables) - Highest
 * 2. Connection-level variables
 * 3. Tenant-level variables
 * 4. Runtime context (current_user, connection, request)
 */
interface VariableResolutionContext {
  action: Action;
  endpointResolution?: VariableResolutionResult;
  headerResolutions?: Record<string, VariableResolutionResult>;
  defaultResolutions?: Record<string, VariableResolutionResult>;
  hasResolutions: boolean;
  totalVariablesResolved: number;
}

async function resolveActionVariables(
  tenantId: string,
  connection: { id: string; name: string; metadata: unknown },
  action: Action,
  options: GatewayInvokeOptions
): Promise<VariableResolutionContext> {
  const result: VariableResolutionContext = {
    action: { ...action },
    hasResolutions: false,
    totalVariablesResolved: 0,
  };

  // Check if any variable resolution is needed
  const hasEndpointVars = containsVariableReferences(action.endpointTemplate);
  const actionMetadata = action.metadata as Record<string, unknown> | null;
  const headers = actionMetadata?.headers as Record<string, string> | undefined;
  const hasHeaderVars = headers
    ? Object.values(headers).some((v) => containsVariableReferences(v))
    : false;
  const inputSchema = action.inputSchema as {
    properties?: Record<string, { default?: unknown }>;
  } | null;
  const hasDefaultVars = inputSchema?.properties
    ? Object.values(inputSchema.properties).some(
        (prop) => typeof prop.default === 'string' && containsVariableReferences(prop.default)
      )
    : false;

  // Early return if no variable references found
  if (!hasEndpointVars && !hasHeaderVars && !hasDefaultVars) {
    return result;
  }

  // Build runtime context for resolution
  const connectionMetadata = connection.metadata as Record<string, unknown> | null;
  const runtimeContext = buildRuntimeContext({
    currentUser: options.variables?.current_user
      ? {
          id: options.variables.current_user.id ?? undefined,
          email: options.variables.current_user.email ?? undefined,
          name: options.variables.current_user.name ?? undefined,
        }
      : undefined,
    connection: {
      id: connection.id,
      name: connection.name,
      workspaceId: (connectionMetadata?.workspaceId as string) ?? undefined,
    },
    request: {
      environment: getEnvironment(),
    },
  });

  // Build request variables (excluding current_user which is handled separately)
  const requestVariables = options.variables
    ? Object.fromEntries(
        Object.entries(options.variables).filter(([key]) => key !== 'current_user')
      )
    : undefined;

  // Common resolution options
  const resolutionOptions = {
    tenantId,
    connectionId: connection.id,
    environment: getEnvironment(),
    runtimeContext,
    requestVariables,
    throwOnMissing: false, // Non-fatal: continue with empty string for missing vars
  };

  // Resolve endpoint template
  if (hasEndpointVars) {
    try {
      result.endpointResolution = await resolveTemplate(action.endpointTemplate, resolutionOptions);
      result.action = {
        ...result.action,
        endpointTemplate: result.endpointResolution.resolved,
      };
      result.hasResolutions = true;
      result.totalVariablesResolved += result.endpointResolution.variables.filter(
        (v) => v.found
      ).length;

      console.log('[GATEWAY] Endpoint variables resolved:', {
        original: action.endpointTemplate,
        resolved: result.endpointResolution.resolved,
        ...summarizeResolution(result.endpointResolution),
      });
    } catch (error) {
      console.warn('[GATEWAY] Endpoint variable resolution error:', error);
      // Continue with original template on error
    }
  }

  // Resolve header configurations
  if (hasHeaderVars && headers) {
    try {
      const headerTemplates: Record<string, string> = {};
      for (const [key, value] of Object.entries(headers)) {
        if (containsVariableReferences(value)) {
          headerTemplates[key] = value;
        }
      }

      const resolvedHeaders = await resolveTemplates(headerTemplates, resolutionOptions);
      result.headerResolutions = resolvedHeaders;

      // Merge resolved headers into action metadata
      const newHeaders = { ...headers };
      for (const [key, resolution] of Object.entries(resolvedHeaders)) {
        newHeaders[key] = resolution.resolved;
        result.totalVariablesResolved += resolution.variables.filter((v) => v.found).length;
      }

      result.action = {
        ...result.action,
        metadata: {
          ...actionMetadata,
          headers: newHeaders,
        },
      };
      result.hasResolutions = true;

      console.log('[GATEWAY] Header variables resolved:', {
        headersResolved: Object.keys(resolvedHeaders).length,
      });
    } catch (error) {
      console.warn('[GATEWAY] Header variable resolution error:', error);
      // Continue with original headers on error
    }
  }

  // Resolve default parameter values in inputSchema
  if (hasDefaultVars && inputSchema?.properties) {
    try {
      const defaultTemplates: Record<string, string> = {};
      for (const [propName, propDef] of Object.entries(inputSchema.properties)) {
        if (typeof propDef.default === 'string' && containsVariableReferences(propDef.default)) {
          defaultTemplates[propName] = propDef.default;
        }
      }

      const resolvedDefaults = await resolveTemplates(defaultTemplates, resolutionOptions);
      result.defaultResolutions = resolvedDefaults;

      // Build new inputSchema with resolved defaults
      const newProperties = { ...inputSchema.properties };
      for (const [propName, resolution] of Object.entries(resolvedDefaults)) {
        newProperties[propName] = {
          ...newProperties[propName],
          default: resolution.resolved,
        };
        result.totalVariablesResolved += resolution.variables.filter((v) => v.found).length;
      }

      result.action = {
        ...result.action,
        inputSchema: {
          ...inputSchema,
          properties: newProperties,
        } as typeof action.inputSchema,
      };
      result.hasResolutions = true;

      console.log('[GATEWAY] Default value variables resolved:', {
        defaultsResolved: Object.keys(resolvedDefaults).length,
      });
    } catch (error) {
      console.warn('[GATEWAY] Default value variable resolution error:', error);
      // Continue with original defaults on error
    }
  }

  if (result.hasResolutions) {
    console.log('[GATEWAY] Variable resolution complete:', {
      totalVariablesResolved: result.totalVariablesResolved,
      endpointResolved: !!result.endpointResolution,
      headersResolved: result.headerResolutions ? Object.keys(result.headerResolutions).length : 0,
      defaultsResolved: result.defaultResolutions
        ? Object.keys(result.defaultResolutions).length
        : 0,
    });
  }

  return result;
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
 * Record input validation failures for drift detection.
 * Maps Ajv validation errors to drift repository format.
 * Non-blocking — failures are recorded best-effort.
 */
async function recordInputValidationFailures(
  actionId: string,
  tenantId: string,
  result: ValidationResult
): Promise<void> {
  const errors = result.errors || [];
  if (errors.length === 0) return;

  await Promise.all(
    errors.map(async (error) => {
      try {
        const issueCode = mapConstraintToIssueCode(error.constraint?.type);
        if (!issueCode) return;

        await driftRepository.recordFailure({
          actionId,
          tenantId,
          direction: 'input',
          issueCode,
          fieldPath: error.path || '/',
          expectedType:
            error.constraint?.expected != null ? String(error.constraint.expected) : undefined,
          receivedType:
            error.constraint?.received != null ? String(error.constraint.received) : undefined,
        });
      } catch (err) {
        console.error('[GATEWAY] Failed to record input validation failure:', err);
      }
    })
  );
}

/**
 * Map Ajv constraint types to ValidationIssueCode values
 */
function mapConstraintToIssueCode(
  constraintType: string | undefined
): 'MISSING_REQUIRED_FIELD' | 'TYPE_MISMATCH' | 'INVALID_ENUM_VALUE' | 'INVALID_FORMAT' | null {
  switch (constraintType) {
    case 'required':
      return 'MISSING_REQUIRED_FIELD';
    case 'type':
      return 'TYPE_MISMATCH';
    case 'enum':
      return 'INVALID_ENUM_VALUE';
    case 'format':
      return 'INVALID_FORMAT';
    default:
      return null;
  }
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
  integrationId: string,
  connectionId?: string
): Promise<DecryptedCredential | null> {
  return getDecryptedCredential(integrationId, tenantId, connectionId);
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
  integration: Integration,
  action: Action,
  input: Record<string, unknown>,
  credential: DecryptedCredential | null
): BuiltRequest {
  // Get base URL from credential FIRST (per-connection), then fall back to integration config
  // This allows each connected app to have its own endpoint (e.g., different Supabase projects)
  const credentialData = credential?.data as Record<string, unknown> | null;
  const authConfig = integration.authConfig as Record<string, unknown> | null;
  const baseUrl = (credentialData?.baseUrl as string) || (authConfig?.baseUrl as string) || '';

  // Debug logging for URL construction
  console.log('[GATEWAY] Building request:', {
    integrationSlug: integration.slug,
    actionSlug: action.slug,
    hasCredential: !!credential,
    credentialBaseUrl: credentialData?.baseUrl,
    authConfigBaseUrl: authConfig?.baseUrl,
    resolvedBaseUrl: baseUrl,
    endpointTemplate: action.endpointTemplate,
    input,
  });

  // Build the path with parameter substitution
  const path = buildUrl(action.endpointTemplate, input);

  // Combine baseUrl with path
  let url: string;
  if (baseUrl) {
    url = `${baseUrl.replace(/\/$/, '')}${path.startsWith('/') ? '' : '/'}${path}`;
  } else {
    // No base URL - check if path is already absolute
    if (path.startsWith('http://') || path.startsWith('https://')) {
      url = path;
    } else {
      // Relative path without base URL - this is a configuration error
      throw new GatewayError(
        'CONFIGURATION_ERROR',
        `Integration "${integration.name}" is missing a base URL. ` +
          `Please configure the base URL when connecting your credentials. ` +
          `For Supabase, use your project URL: https://YOUR-PROJECT-ID.supabase.co`,
        { integrationId: integration.id, path }
      );
    }
  }

  // Start with base headers
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };

  // Apply action-level headers from metadata (may contain resolved variable values)
  const actionMetadata = action.metadata as Record<string, unknown> | null;
  const actionHeaders = actionMetadata?.headers as Record<string, string> | undefined;
  if (actionHeaders) {
    for (const [key, value] of Object.entries(actionHeaders)) {
      if (typeof value === 'string' && value.trim() !== '') {
        headers[key] = value;
      }
    }
  }

  // Build body (for POST/PUT/PATCH)
  let body: unknown = undefined;
  if (['POST', 'PUT', 'PATCH'].includes(action.httpMethod)) {
    // Separate path params from body params
    body = extractBodyParams(action.endpointTemplate, input);
  }

  // Apply credentials
  const credentialConfig = applyCredentials(headers, credential);

  // Build query params for GET requests with remaining input
  let finalUrl = url;
  if (action.httpMethod === 'GET') {
    const queryParams = extractBodyParams(action.endpointTemplate, input);
    finalUrl = buildUrlWithQuery(
      url,
      queryParams as Record<string, unknown>,
      credentialConfig.queryParams
    );
  } else if (credentialConfig.queryParams && Object.keys(credentialConfig.queryParams).length > 0) {
    // Add auth query params even for non-GET requests
    finalUrl = buildUrlWithQuery(url, {}, credentialConfig.queryParams);
  }

  // Merge body params for non-GET requests
  if (body && credentialConfig.bodyParams && Object.keys(credentialConfig.bodyParams).length > 0) {
    body = { ...(body as Record<string, unknown>), ...credentialConfig.bodyParams };
  }

  const request: HttpClientRequest = {
    url: finalUrl,
    method: action.httpMethod as 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    headers: { ...headers, ...credentialConfig.headers },
    body,
  };

  console.log('[GATEWAY] Final request:', {
    url: finalUrl,
    method: request.method,
    headers: Object.keys(request.headers ?? {}),
    hasBody: !!body,
  });

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
 * Handles both absolute URLs (https://...) and relative paths (/api/...)
 * Filters out empty/null/undefined values to avoid issues with APIs like PostgREST
 */
function buildUrlWithQuery(
  baseUrl: string,
  params: Record<string, unknown>,
  authParams: Record<string, string> = {}
): string {
  // Helper to check if a value should be included
  const shouldInclude = (value: unknown): boolean => {
    if (value === undefined || value === null) return false;
    if (typeof value === 'string' && value.trim() === '') return false;
    return true;
  };

  // Check if we have any params to add (excluding empty values)
  const filteredParams = Object.fromEntries(
    Object.entries(params).filter(([, v]) => shouldInclude(v))
  );
  const filteredAuthParams = Object.fromEntries(
    Object.entries(authParams).filter(([, v]) => shouldInclude(v))
  );
  const hasParams =
    Object.keys(filteredParams).length > 0 || Object.keys(filteredAuthParams).length > 0;

  if (!hasParams) {
    return baseUrl;
  }

  // For absolute URLs, use URL object
  if (baseUrl.startsWith('http://') || baseUrl.startsWith('https://')) {
    const urlObj = new URL(baseUrl);

    // Add input params (already filtered)
    for (const [key, value] of Object.entries(filteredParams)) {
      urlObj.searchParams.set(key, String(value));
    }

    // Add auth params (already filtered)
    for (const [key, value] of Object.entries(filteredAuthParams)) {
      urlObj.searchParams.set(key, value);
    }

    return urlObj.toString();
  }

  // For relative URLs, build query string manually (use already filtered params)
  const allFilteredParams = { ...filteredParams, ...filteredAuthParams };
  const queryParts = Object.entries(allFilteredParams).map(
    ([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`
  );

  if (queryParts.length === 0) {
    return baseUrl;
  }

  // Check if URL already has query params
  const separator = baseUrl.includes('?') ? '&' : '?';
  return `${baseUrl}${separator}${queryParts.join('&')}`;
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
 * Step 5b: Validate API response against action's output schema
 */
async function validateResponse(
  data: unknown,
  action: Action,
  tenantId: string,
  validationOptions?: ValidationRequest
): Promise<ValidateResponseResult> {
  return validationService.validateResponse({
    data,
    outputSchema: action.outputSchema,
    validationConfig: action.validationConfig,
    requestOptions: validationOptions,
    actionId: action.id,
    tenantId,
  });
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
  // Debug: log the full request including headers
  console.log('[GATEWAY] Executing request:', {
    url: request.url,
    method: request.method,
    headers: request.headers,
    hasBody: !!request.body,
  });

  const result = await executeWithMetrics(request, {
    circuitBreakerId: integrationId,
    timeout: options.timeoutMs,
    idempotencyKey: options.idempotencyKey,
  });

  // Debug: log the result
  console.log('[GATEWAY] Execution result:', {
    success: result.success,
    attempts: result.attempts,
    durationMs: result.totalDurationMs,
    error: result.error,
    dataType: result.data ? typeof result.data : 'undefined',
  });

  return result;
}

/**
 * Step 7: Log the invocation
 * TODO: Add validation info to logs (validationResult parameter)
 */
async function logInvocation(
  context: InvocationContext,
  integrationId: string,
  actionId: string,
  connectionId: string,
  request: HttpClientRequest,
  url: string,
  result: ExecutionResultWithMetrics<unknown>
): Promise<void> {
  try {
    await logRequestResponse({
      tenantId: context.tenantId,
      integrationId, // Must be UUID for database FK constraint
      actionId,
      connectionId, // For multi-app connection tracking
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
  result: ExecutionResultWithMetrics<unknown>,
  validationResult?: ValidateResponseResult,
  inputMappingResult?: FullMappingResult,
  outputMappingResult?: MappingResult,
  finalData?: unknown,
  preambleResult?: PreambleResult,
  referenceDataContext?: ReferenceDataContext,
  contextResolutionResult?: ContextResolutionResult
): GatewaySuccessResponse {
  // Use final mapped data, or validated data, or raw data
  const responseData = finalData ?? validationResult?.data ?? result.data;

  // Build validation metadata if validation was performed
  const validationMeta: ValidationMetadata | undefined = validationResult
    ? {
        valid: validationResult.valid,
        mode: validationResult.metadata.mode,
        issueCount: validationResult.metadata.issueCount,
        issues: validationResult.metadata.issues,
        fieldsCoerced: validationResult.metadata.fieldsCoerced,
        fieldsStripped: validationResult.metadata.fieldsStripped,
        fieldsDefaulted: validationResult.metadata.fieldsDefaulted,
        validationDurationMs: validationResult.metadata.validationDurationMs,
        driftStatus: validationResult.metadata.driftStatus,
        driftMessage: validationResult.metadata.driftMessage,
      }
    : undefined;

  // Build mapping metadata if any mapping was performed
  let mappingMeta: MappingMetadata | undefined;
  if (inputMappingResult || outputMappingResult) {
    const inputResult = inputMappingResult?.inputResult;
    const outputResult = outputMappingResult;

    // Merge errors from both input and output mapping
    const errors = [...(inputResult?.errors ?? []), ...(outputResult?.errors ?? [])];

    mappingMeta = {
      applied: (inputResult?.applied ?? false) || (outputResult?.applied ?? false),
      bypassed: (inputResult?.bypassed ?? false) && (outputResult?.bypassed ?? true),
      inputMappingsApplied: inputResult?.meta.inputMappingsApplied ?? 0,
      outputMappingsApplied: outputResult?.meta.outputMappingsApplied ?? 0,
      fieldsTransformed:
        (inputResult?.meta.fieldsTransformed ?? 0) + (outputResult?.meta.fieldsTransformed ?? 0),
      fieldsCoerced:
        (inputResult?.meta.fieldsCoerced ?? 0) + (outputResult?.meta.fieldsCoerced ?? 0),
      fieldsDefaulted:
        (inputResult?.meta.fieldsDefaulted ?? 0) + (outputResult?.meta.fieldsDefaulted ?? 0),
      mappingDurationMs:
        (inputResult?.meta.mappingDurationMs ?? 0) + (outputResult?.meta.mappingDurationMs ?? 0),
      errors: errors.length > 0 ? errors : undefined,
      failureMode: outputResult?.failureMode ?? inputResult?.failureMode ?? 'passthrough',
    };
  }

  // Build the response object
  const response: GatewaySuccessResponse = {
    success: true,
    data: responseData,
    meta: {
      requestId,
      timestamp: new Date().toISOString(),
      execution: {
        latencyMs: result.totalDurationMs,
        retryCount: result.attempts - 1,
        cached: false, // TODO: Implement caching
        externalLatencyMs: result.lastRequestDurationMs,
      },
      validation: validationMeta,
      mapping: mappingMeta,
    },
  };

  // Add preamble context if applied (for LLM-friendly responses)
  if (preambleResult?.applied && preambleResult.context) {
    response.context = preambleResult.context;
  }

  // Add reference data context if available (for AI context awareness)
  if (referenceDataContext && Object.keys(referenceDataContext).length > 0) {
    response.referenceData = referenceDataContext;
  }

  // Add resolved inputs if context resolution occurred (for AI transparency)
  if (contextResolutionResult?.hasResolutions) {
    response.resolvedInputs = formatResolutionDetails(contextResolutionResult.resolutions);
  }

  return response;
}

/**
 * Format a response validation error (strict mode failure)
 */
function formatValidationErrorResponse(
  requestId: string,
  validationResult: ValidateResponseResult,
  executionResult: ExecutionResultWithMetrics<unknown>
): GatewayErrorResponse {
  const issues = validationResult.metadata.issues ?? [];
  const issuesSummary = issues
    .slice(0, 3)
    .map((i) => `${i.path}: ${i.message}`)
    .join('; ');

  return {
    success: false,
    error: {
      code: GatewayErrorCodes.RESPONSE_VALIDATION_ERROR.code,
      message: `Response validation failed: ${issuesSummary}${issues.length > 3 ? ` (+${issues.length - 3} more)` : ''}`,
      details: {
        errors: issues.map((issue) => ({
          path: issue.path,
          field: issue.path.split('.').pop(),
          message: issue.message,
          value: undefined, // Don't expose actual values
        })),
        context: {
          mode: validationResult.metadata.mode,
          issueCount: validationResult.metadata.issueCount,
          driftStatus: validationResult.metadata.driftStatus,
          executionLatencyMs: executionResult.totalDurationMs,
        },
      },
      requestId,
      suggestedResolution: {
        action: GatewayErrorCodes.RESPONSE_VALIDATION_ERROR.suggestedAction,
        description:
          validationResult.metadata.driftStatus === 'alert'
            ? "Schema drift detected. The external API response format may have changed. Consider updating the action's output schema or switching to lenient validation mode."
            : 'The external API response does not match the expected schema. This may indicate an API change. Try using "warn" or "lenient" validation mode, or update the action\'s output schema.',
        retryable: GatewayErrorCodes.RESPONSE_VALIDATION_ERROR.retryable,
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

// =============================================================================
// Reference Data Context
// =============================================================================

/**
 * Build reference data context for AI-friendly responses
 *
 * Fetches cached reference data (users, channels, etc.) for an integration
 * and formats it for inclusion in gateway responses. This provides AI agents
 * with contextual information to resolve names to IDs without additional API calls.
 *
 * @param integrationId - The integration to fetch reference data for
 * @param connectionId - The connection (for connection-specific data)
 * @returns Reference data grouped by type, or undefined if none exists
 */
async function buildReferenceDataContext(
  integrationId: string,
  connectionId: string
): Promise<ReferenceDataContext | undefined> {
  try {
    // Get all available data types for this integration/connection
    const dataTypes = await getReferenceDataTypes(integrationId, connectionId);

    if (dataTypes.length === 0) {
      return undefined;
    }

    // Fetch all reference data for these types
    const referenceData = await findReferenceDataByTypes(integrationId, connectionId, dataTypes);

    if (referenceData.length === 0) {
      return undefined;
    }

    // Group by data type and transform to context format
    const context: ReferenceDataContext = {};

    for (const item of referenceData) {
      if (!context[item.dataType]) {
        context[item.dataType] = [];
      }

      context[item.dataType].push({
        id: item.externalId,
        name: item.name,
        metadata: item.metadata as Record<string, unknown> | undefined,
      });
    }

    return context;
  } catch (error) {
    // Log but don't fail - reference data is optional enhancement
    console.warn('[GATEWAY] Failed to fetch reference data context:', error);
    return undefined;
  }
}
