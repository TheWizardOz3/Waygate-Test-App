/**
 * Composite Tool Router
 *
 * Routes composite tool invocations to the correct operation based on
 * the configured routing mode (rule-based or agent-driven).
 *
 * For rule-based routing, evaluates routing rules in priority order.
 * For agent-driven routing, uses the explicitly provided operation parameter.
 */

import type { CompositeTool, CompositeToolOperation, RoutingRule } from '@prisma/client';
import {
  findOperationsByCompositeTool,
  findOperationBySlug,
  findOperationById,
  findRoutingRulesByCompositeTool,
} from '../composite-tool.repository';
import { evaluateRulesInOrder, type RoutingParams } from './rule-evaluator';

// =============================================================================
// Types
// =============================================================================

/**
 * Result of routing a composite tool invocation
 */
export interface RoutingResult {
  /** The selected operation */
  operation: CompositeToolOperation;
  /** How the operation was selected */
  routingMode: 'rule_based' | 'agent_driven';
  /** Reason for the selection (for debugging/logging) */
  routingReason: string;
  /** The rule that matched (for rule-based routing only) */
  matchedRule?: RoutingRule;
  /** Whether the default operation was used as fallback */
  usedDefault: boolean;
}

/**
 * Options for routing
 */
export interface RoutingOptions {
  /** For agent-driven mode: the operation slug selected by the agent */
  operationSlug?: string;
  /** For agent-driven mode: the operation ID selected by the agent (alternative to slug) */
  operationId?: string;
}

// =============================================================================
// Error Classes
// =============================================================================

/**
 * Error thrown when routing fails
 */
export class RoutingError extends Error {
  constructor(
    message: string,
    public readonly code: RoutingErrorCode,
    public readonly compositeToolId: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'RoutingError';
  }
}

/**
 * Routing error codes
 */
export const RoutingErrorCode = {
  NO_RULE_MATCHED: 'NO_RULE_MATCHED',
  NO_DEFAULT_OPERATION: 'NO_DEFAULT_OPERATION',
  OPERATION_NOT_FOUND: 'OPERATION_NOT_FOUND',
  INVALID_ROUTING_MODE: 'INVALID_ROUTING_MODE',
  MISSING_OPERATION_PARAMETER: 'MISSING_OPERATION_PARAMETER',
  NO_OPERATIONS_CONFIGURED: 'NO_OPERATIONS_CONFIGURED',
} as const;

export type RoutingErrorCode = (typeof RoutingErrorCode)[keyof typeof RoutingErrorCode];

// =============================================================================
// Main Router Functions
// =============================================================================

/**
 * Routes a composite tool invocation to the correct operation
 *
 * @param compositeTool - The composite tool being invoked
 * @param params - Input parameters from the invocation
 * @param options - Additional routing options (operation selection for agent-driven mode)
 * @returns The routing result with selected operation and metadata
 * @throws RoutingError if no operation can be selected
 */
export async function routeInvocation(
  compositeTool: CompositeTool,
  params: RoutingParams,
  options: RoutingOptions = {}
): Promise<RoutingResult> {
  if (compositeTool.routingMode === 'agent_driven') {
    return routeAgentDriven(compositeTool, options);
  }

  if (compositeTool.routingMode === 'rule_based') {
    return routeRuleBased(compositeTool, params);
  }

  throw new RoutingError(
    `Invalid routing mode: ${compositeTool.routingMode}`,
    RoutingErrorCode.INVALID_ROUTING_MODE,
    compositeTool.id
  );
}

/**
 * Routes using rule-based logic
 * Evaluates routing rules in priority order and selects the matching operation
 */
async function routeRuleBased(
  compositeTool: CompositeTool,
  params: RoutingParams
): Promise<RoutingResult> {
  // Fetch routing rules for this composite tool
  const rules = await findRoutingRulesByCompositeTool(compositeTool.id);

  // Evaluate rules in priority order (they come pre-sorted from repository)
  const matchResult = evaluateRulesInOrder(rules, params);

  if (matchResult) {
    // A rule matched - fetch the operation
    const operation = await findOperationById(matchResult.rule.operationId);

    if (!operation) {
      throw new RoutingError(
        `Operation '${matchResult.rule.operationId}' not found for matched rule`,
        RoutingErrorCode.OPERATION_NOT_FOUND,
        compositeTool.id,
        { ruleId: matchResult.rule.id }
      );
    }

    return {
      operation,
      routingMode: 'rule_based',
      routingReason: matchResult.reason,
      matchedRule: matchResult.rule,
      usedDefault: false,
    };
  }

  // No rule matched - try to use default operation
  if (compositeTool.defaultOperationId) {
    const defaultOperation = await findOperationById(compositeTool.defaultOperationId);

    if (defaultOperation) {
      return {
        operation: defaultOperation,
        routingMode: 'rule_based',
        routingReason: 'No routing rule matched, using default operation',
        usedDefault: true,
      };
    }
  }

  // No rule matched and no default operation configured
  throw new RoutingError(
    'No routing rule matched and no default operation configured',
    RoutingErrorCode.NO_RULE_MATCHED,
    compositeTool.id,
    { rulesEvaluated: rules.length }
  );
}

/**
 * Routes using agent-driven logic
 * Uses the operation explicitly selected by the agent via the operation parameter
 */
async function routeAgentDriven(
  compositeTool: CompositeTool,
  options: RoutingOptions
): Promise<RoutingResult> {
  const { operationSlug, operationId } = options;

  // Agent must provide either slug or id
  if (!operationSlug && !operationId) {
    throw new RoutingError(
      'Agent-driven routing requires an operation to be specified',
      RoutingErrorCode.MISSING_OPERATION_PARAMETER,
      compositeTool.id
    );
  }

  let operation: CompositeToolOperation | null = null;

  // Try to find by slug first (most common), then by ID
  if (operationSlug) {
    operation = await findOperationBySlug(compositeTool.id, operationSlug);
  } else if (operationId) {
    operation = await findOperationById(operationId);
    // Verify the operation belongs to this composite tool
    if (operation && operation.compositeToolId !== compositeTool.id) {
      operation = null;
    }
  }

  if (!operation) {
    throw new RoutingError(
      `Operation '${operationSlug || operationId}' not found in composite tool '${compositeTool.slug}'`,
      RoutingErrorCode.OPERATION_NOT_FOUND,
      compositeTool.id,
      { requestedOperation: operationSlug || operationId }
    );
  }

  return {
    operation,
    routingMode: 'agent_driven',
    routingReason: `Agent selected operation '${operation.operationSlug}'`,
    usedDefault: false,
  };
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Gets all available operations for a composite tool
 * Used for agent-driven mode to expose operation options
 */
export async function getAvailableOperations(
  compositeToolId: string
): Promise<CompositeToolOperation[]> {
  return findOperationsByCompositeTool(compositeToolId);
}

/**
 * Validates that a composite tool has at least one operation configured
 */
export async function validateHasOperations(compositeTool: CompositeTool): Promise<void> {
  const operations = await findOperationsByCompositeTool(compositeTool.id);

  if (operations.length === 0) {
    throw new RoutingError(
      `Composite tool '${compositeTool.slug}' has no operations configured`,
      RoutingErrorCode.NO_OPERATIONS_CONFIGURED,
      compositeTool.id
    );
  }
}

/**
 * Gets the default operation for a composite tool if configured
 */
export async function getDefaultOperation(
  compositeTool: CompositeTool
): Promise<CompositeToolOperation | null> {
  if (!compositeTool.defaultOperationId) {
    return null;
  }

  return findOperationById(compositeTool.defaultOperationId);
}

/**
 * Extracts the operation selection from invocation params
 * Used for agent-driven mode where the operation is passed as a parameter
 *
 * @param params - Input parameters from the invocation
 * @returns The operation slug if present in params
 */
export function extractOperationFromParams(params: RoutingParams): string | undefined {
  // Check for operation parameter (standard name)
  if (typeof params.operation === 'string') {
    return params.operation;
  }

  // Check for operationSlug (alternative name)
  if (typeof params.operationSlug === 'string') {
    return params.operationSlug;
  }

  return undefined;
}
