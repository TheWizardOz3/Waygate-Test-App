/**
 * Composite Tool Invocation Handler
 *
 * Orchestrates the execution of composite tool invocations:
 * 1. Load and validate the composite tool
 * 2. Route to the correct operation (rule-based or agent-driven)
 * 3. Load execution context (credentials, reference data)
 * 4. Map parameters (unified → operation-specific)
 * 5. Invoke the underlying action via gateway
 * 6. Format response with composite tool metadata
 *
 * This is the main entry point for composite tool invocations.
 */

import type { CompositeTool } from '@prisma/client';
import { invokeAction } from '../../gateway/gateway.service';
import type {
  GatewayInvokeOptions,
  ReferenceDataContext,
  GatewaySuccessResponse,
  GatewayErrorResponse,
} from '../../gateway/gateway.schemas';
import { getCompositeToolBySlugRaw, CompositeToolError } from '../composite-tool.service';
import {
  routeInvocation,
  validateHasOperations,
  extractOperationFromParams,
  type RoutingResult,
  type RoutingOptions,
  RoutingError,
} from '../routing/router';
import type { RoutingParams } from '../routing/rule-evaluator';
import type { UnifiedSchemaConfig } from '../composite-tool.schemas';
import {
  loadOperationContext,
  ContextLoadError,
  type OperationContext,
  type LoadContextOptions,
} from '../context/context-loader';
import {
  mapParameters,
  extractAndRemoveOperationSlug,
  ParameterMappingError,
  type ParameterMappingResult,
} from '../context/parameter-mapper';

// =============================================================================
// Types
// =============================================================================

/**
 * Input for invoking a composite tool
 */
export interface CompositeToolInvokeInput {
  /** The composite tool slug */
  toolSlug: string;
  /** Input parameters for the tool */
  params: Record<string, unknown>;
  /** Optional gateway invoke options */
  options?: GatewayInvokeOptions;
  /** Optional context loading options */
  contextOptions?: LoadContextOptions;
}

/**
 * Metadata about the composite tool invocation
 */
export interface CompositeToolInvocationMeta {
  /** The composite tool that was invoked */
  compositeToolSlug: string;
  /** The composite tool ID */
  compositeToolId: string;
  /** The operation that was selected */
  selectedOperation: string;
  /** The action that was executed */
  executedAction: string;
  /** The integration the action belongs to */
  integrationSlug: string;
  /** How the operation was selected */
  routingMode: 'rule_based' | 'agent_driven';
  /** Human-readable reason for operation selection */
  routingReason: string;
  /** Whether the default operation was used */
  usedDefaultOperation: boolean;
  /** Parameter mapping details */
  parameterMapping: {
    /** Number of parameters that were mapped */
    mappedCount: number;
    /** Number of parameters passed through as-is */
    passedThroughCount: number;
  };
}

/**
 * Successful composite tool response
 */
export interface CompositeToolSuccessResponse extends Omit<GatewaySuccessResponse, 'meta'> {
  /** Gateway meta with composite tool additions */
  meta: GatewaySuccessResponse['meta'] & {
    /** Composite tool specific metadata */
    compositeTool: CompositeToolInvocationMeta;
  };
}

/**
 * Error composite tool response
 */
export interface CompositeToolErrorResponse extends GatewayErrorResponse {
  /** Additional composite tool error context */
  compositeToolContext?: {
    toolSlug: string;
    selectedOperation?: string;
    routingMode?: string;
    errorPhase: 'routing' | 'context_loading' | 'parameter_mapping' | 'execution';
  };
}

/**
 * Combined response type
 */
export type CompositeToolResponse = CompositeToolSuccessResponse | CompositeToolErrorResponse;

// =============================================================================
// Error Codes
// =============================================================================

/**
 * Composite tool invocation error codes
 */
export const CompositeToolInvokeErrorCodes = {
  TOOL_NOT_FOUND: 'COMPOSITE_TOOL_NOT_FOUND',
  TOOL_DISABLED: 'COMPOSITE_TOOL_DISABLED',
  ROUTING_FAILED: 'ROUTING_FAILED',
  CONTEXT_LOAD_FAILED: 'CONTEXT_LOAD_FAILED',
  PARAMETER_MAPPING_FAILED: 'PARAMETER_MAPPING_FAILED',
  EXECUTION_FAILED: 'EXECUTION_FAILED',
} as const;

// =============================================================================
// Main Invocation Handler
// =============================================================================

/**
 * Invokes a composite tool
 *
 * This is the main entry point for composite tool invocations.
 * It orchestrates the full pipeline:
 * 1. Load composite tool by slug
 * 2. Route to operation (rule-based or agent-driven)
 * 3. Load context (credentials, reference data)
 * 4. Map parameters (unified → operation-specific)
 * 5. Invoke underlying action
 * 6. Format response with composite metadata
 *
 * @param tenantId - The tenant making the request
 * @param input - The invocation input
 * @returns The composite tool response
 */
export async function invokeCompositeTool(
  tenantId: string,
  input: CompositeToolInvokeInput
): Promise<CompositeToolResponse> {
  const { toolSlug, params, options = {}, contextOptions = {} } = input;

  let compositeTool: CompositeTool;
  let routingResult: RoutingResult;
  let operationContext: OperationContext;
  let mappingResult: ParameterMappingResult;

  try {
    // 1. Load and validate composite tool
    compositeTool = await loadCompositeTool(tenantId, toolSlug);

    // 2. Validate that the tool has operations
    await validateHasOperations(compositeTool);

    // 3. Extract operation slug if present (for agent-driven mode)
    const { operationSlug: selectedOperationSlug, cleanedParams } =
      extractAndRemoveOperationSlug(params);

    // 4. Route to the correct operation
    const routingOptions: RoutingOptions = {};
    if (selectedOperationSlug) {
      routingOptions.operationSlug = selectedOperationSlug;
    } else if (compositeTool.routingMode === 'agent_driven') {
      // For agent-driven mode, try extracting from params
      const opFromParams = extractOperationFromParams(params as RoutingParams);
      if (opFromParams) {
        routingOptions.operationSlug = opFromParams;
      }
    }

    routingResult = await routeInvocation(
      compositeTool,
      cleanedParams as RoutingParams,
      routingOptions
    );

    console.log('[COMPOSITE_TOOL] Routing result:', {
      compositeToolSlug: toolSlug,
      selectedOperation: routingResult.operation.operationSlug,
      routingMode: routingResult.routingMode,
      routingReason: routingResult.routingReason,
    });

    // 5. Load execution context for the selected operation
    operationContext = await loadOperationContext(
      tenantId,
      routingResult.operation,
      contextOptions
    );

    console.log('[COMPOSITE_TOOL] Context loaded:', {
      operationSlug: routingResult.operation.operationSlug,
      actionSlug: operationContext.action.slug,
      integrationSlug: operationContext.integration.slug,
      hasCredentials: operationContext.credential !== null,
      hasReferenceData: operationContext.referenceData !== undefined,
    });

    // 6. Map parameters (unified → operation-specific)
    const unifiedSchemaConfig = compositeTool.unifiedInputSchema as UnifiedSchemaConfig | null;
    mappingResult = mapParameters(
      cleanedParams,
      routingResult.operation,
      operationContext.action,
      unifiedSchemaConfig
    );

    if (!mappingResult.success) {
      return formatParameterMappingError(toolSlug, routingResult, mappingResult.validationErrors);
    }

    console.log('[COMPOSITE_TOOL] Parameters mapped:', {
      totalParams: mappingResult.mappings.length,
      mappedCount: mappingResult.mappings.filter((m) => m.mapped).length,
      passedThroughCount: mappingResult.unmappedParams.length,
    });

    // 7. Build gateway options with reference data context
    const gatewayOptions: GatewayInvokeOptions = {
      ...options,
      connectionId: operationContext.connection.id,
    };

    // Merge reference data context if available
    if (operationContext.referenceData) {
      gatewayOptions.context = mergeReferenceDataContext(
        options.context,
        operationContext.referenceData
      );
    }

    // 8. Invoke the underlying action
    const gatewayResponse = await invokeAction(
      tenantId,
      operationContext.integration.slug,
      operationContext.action.slug,
      mappingResult.mappedParams,
      gatewayOptions
    );

    // 9. Format response with composite tool metadata
    return formatCompositeToolResponse(
      gatewayResponse,
      compositeTool,
      routingResult,
      operationContext,
      mappingResult
    );
  } catch (error) {
    // Handle known error types
    if (error instanceof CompositeToolError) {
      return formatCompositeToolNotFoundError(toolSlug, error);
    }
    if (error instanceof RoutingError) {
      return formatRoutingError(toolSlug, error);
    }
    if (error instanceof ContextLoadError) {
      return formatContextLoadError(toolSlug, error);
    }
    if (error instanceof ParameterMappingError) {
      return formatParameterMappingError(toolSlug, undefined, error.errors);
    }

    // Unknown error
    console.error('[COMPOSITE_TOOL] Invocation error:', error);
    return formatUnknownError(toolSlug, error);
  }
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Loads a composite tool by slug with validation
 */
async function loadCompositeTool(tenantId: string, toolSlug: string): Promise<CompositeTool> {
  return getCompositeToolBySlugRaw(tenantId, toolSlug);
}

/**
 * Merges reference data context from operation with request context
 */
function mergeReferenceDataContext(
  requestContext:
    | Record<string, { id: string; name: string; metadata?: Record<string, unknown> }[]>
    | undefined,
  operationReferenceData: ReferenceDataContext
): Record<string, { id: string; name: string; metadata?: Record<string, unknown> }[]> {
  if (!requestContext) {
    return operationReferenceData;
  }

  // Merge contexts, preferring operation-specific data
  const merged: ReferenceDataContext = { ...requestContext };

  for (const [dataType, items] of Object.entries(operationReferenceData)) {
    if (!merged[dataType]) {
      merged[dataType] = items;
    } else {
      // Merge items, avoiding duplicates by ID
      const existingIds = new Set(merged[dataType].map((item) => item.id));
      const newItems = items.filter((item) => !existingIds.has(item.id));
      merged[dataType] = [...merged[dataType], ...newItems];
    }
  }

  return merged;
}

// =============================================================================
// Response Formatting
// =============================================================================

/**
 * Formats a successful composite tool response
 */
function formatCompositeToolResponse(
  gatewayResponse: GatewaySuccessResponse | GatewayErrorResponse,
  compositeTool: CompositeTool,
  routingResult: RoutingResult,
  operationContext: OperationContext,
  mappingResult: ParameterMappingResult
): CompositeToolResponse {
  const compositeToolMeta: CompositeToolInvocationMeta = {
    compositeToolSlug: compositeTool.slug,
    compositeToolId: compositeTool.id,
    selectedOperation: routingResult.operation.operationSlug,
    executedAction: `${operationContext.integration.slug}/${operationContext.action.slug}`,
    integrationSlug: operationContext.integration.slug,
    routingMode: routingResult.routingMode,
    routingReason: routingResult.routingReason,
    usedDefaultOperation: routingResult.usedDefault,
    parameterMapping: {
      mappedCount: mappingResult.mappings.filter((m) => m.mapped).length,
      passedThroughCount: mappingResult.unmappedParams.length,
    },
  };

  if (gatewayResponse.success) {
    return {
      ...gatewayResponse,
      meta: {
        ...gatewayResponse.meta,
        compositeTool: compositeToolMeta,
      },
    };
  }

  // Gateway returned an error
  return {
    ...gatewayResponse,
    compositeToolContext: {
      toolSlug: compositeTool.slug,
      selectedOperation: routingResult.operation.operationSlug,
      routingMode: routingResult.routingMode,
      errorPhase: 'execution',
    },
  };
}

/**
 * Formats a composite tool not found error
 */
function formatCompositeToolNotFoundError(
  toolSlug: string,
  error: CompositeToolError
): CompositeToolErrorResponse {
  return {
    success: false as const,
    error: {
      code: error.code,
      message: error.message,
      requestId: generateRequestId(),
      suggestedResolution: {
        action: 'CHECK_INTEGRATION_CONFIG',
        description: `Composite tool '${toolSlug}' not found or disabled. Check the tool configuration.`,
        retryable: false,
      },
    },
    compositeToolContext: {
      toolSlug,
      errorPhase: 'routing',
    },
  } as CompositeToolErrorResponse;
}

/**
 * Formats a routing error
 */
function formatRoutingError(toolSlug: string, error: RoutingError): CompositeToolErrorResponse {
  return {
    success: false as const,
    error: {
      code: CompositeToolInvokeErrorCodes.ROUTING_FAILED,
      message: error.message,
      details: error.details ? { context: error.details } : undefined,
      requestId: generateRequestId(),
      suggestedResolution: {
        action: 'RETRY_WITH_MODIFIED_INPUT',
        description: getRoutingErrorResolution(error.code),
        retryable: error.code === 'MISSING_OPERATION_PARAMETER',
      },
    },
    compositeToolContext: {
      toolSlug,
      routingMode: 'rule_based', // Unknown at this point
      errorPhase: 'routing',
    },
  } as CompositeToolErrorResponse;
}

/**
 * Formats a context load error
 */
function formatContextLoadError(
  toolSlug: string,
  error: ContextLoadError
): CompositeToolErrorResponse {
  return {
    success: false as const,
    error: {
      code: CompositeToolInvokeErrorCodes.CONTEXT_LOAD_FAILED,
      message: error.message,
      details: error.details ? { context: error.details } : undefined,
      requestId: generateRequestId(),
      suggestedResolution: {
        action: getContextErrorSuggestedAction(error.code),
        description: getContextErrorResolution(error.code),
        retryable: error.code === 'CREDENTIALS_EXPIRED',
      },
    },
    compositeToolContext: {
      toolSlug,
      errorPhase: 'context_loading',
    },
  } as CompositeToolErrorResponse;
}

/**
 * Formats a parameter mapping error
 */
function formatParameterMappingError(
  toolSlug: string,
  routingResult: RoutingResult | undefined,
  validationErrors: string[]
): CompositeToolErrorResponse {
  return {
    success: false as const,
    error: {
      code: CompositeToolInvokeErrorCodes.PARAMETER_MAPPING_FAILED,
      message: `Parameter validation failed: ${validationErrors.join('; ')}`,
      details: {
        errors: validationErrors.map((err) => ({
          path: '',
          message: err,
        })),
      },
      requestId: generateRequestId(),
      suggestedResolution: {
        action: 'RETRY_WITH_MODIFIED_INPUT',
        description: 'Check the input parameters and correct any validation errors.',
        retryable: true,
      },
    },
    compositeToolContext: {
      toolSlug,
      selectedOperation: routingResult?.operation.operationSlug,
      routingMode: routingResult?.routingMode,
      errorPhase: 'parameter_mapping',
    },
  } as CompositeToolErrorResponse;
}

/**
 * Formats an unknown error
 */
function formatUnknownError(toolSlug: string, error: unknown): CompositeToolErrorResponse {
  const message = error instanceof Error ? error.message : 'An unexpected error occurred';

  return {
    success: false as const,
    error: {
      code: 'INTERNAL_ERROR',
      message,
      requestId: generateRequestId(),
      suggestedResolution: {
        action: 'ESCALATE_TO_ADMIN',
        description: 'An internal error occurred. Please try again or contact support.',
        retryable: false,
      },
    },
    compositeToolContext: {
      toolSlug,
      errorPhase: 'execution',
    },
  };
}

/**
 * Gets resolution description for routing errors
 */
function getRoutingErrorResolution(code: string): string {
  switch (code) {
    case 'NO_RULE_MATCHED':
      return 'No routing rule matched the input parameters. Check the routing rules or configure a default operation.';
    case 'OPERATION_NOT_FOUND':
      return 'The specified operation was not found. Check the operation slug.';
    case 'MISSING_OPERATION_PARAMETER':
      return 'Agent-driven routing requires an operation parameter. Include "operation" in the input.';
    case 'NO_OPERATIONS_CONFIGURED':
      return 'The composite tool has no operations configured. Add operations to the tool.';
    default:
      return 'Routing failed. Check the composite tool configuration.';
  }
}

/**
 * Gets suggested action for context errors
 */
function getContextErrorSuggestedAction(
  code: string
): 'REFRESH_CREDENTIALS' | 'CHECK_INTEGRATION_CONFIG' | 'ESCALATE_TO_ADMIN' {
  switch (code) {
    case 'CREDENTIALS_NOT_FOUND':
    case 'CREDENTIALS_EXPIRED':
      return 'REFRESH_CREDENTIALS';
    case 'ACTION_NOT_FOUND':
    case 'INTEGRATION_NOT_FOUND':
    case 'INTEGRATION_DISABLED':
    case 'CONNECTION_NOT_FOUND':
      return 'CHECK_INTEGRATION_CONFIG';
    default:
      return 'ESCALATE_TO_ADMIN';
  }
}

/**
 * Gets resolution description for context errors
 */
function getContextErrorResolution(code: string): string {
  switch (code) {
    case 'CREDENTIALS_NOT_FOUND':
      return "No credentials configured for the operation's integration. Set up authentication.";
    case 'CREDENTIALS_EXPIRED':
      return 'Credentials have expired. Re-authenticate to continue.';
    case 'ACTION_NOT_FOUND':
      return 'The action for this operation was not found. The action may have been deleted.';
    case 'INTEGRATION_NOT_FOUND':
      return 'The integration for this operation was not found.';
    case 'INTEGRATION_DISABLED':
      return 'The integration for this operation is disabled. Enable it to continue.';
    case 'CONNECTION_NOT_FOUND':
      return 'No connection found for the integration. Configure a connection.';
    default:
      return 'Failed to load execution context. Check the operation configuration.';
  }
}

/**
 * Generates a unique request ID
 */
function generateRequestId(): string {
  return `req_ct_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}
