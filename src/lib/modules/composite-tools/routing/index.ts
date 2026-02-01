/**
 * Routing Module
 *
 * Exports for the composite tool routing engine.
 * Handles rule evaluation, request routing, and schema merging.
 */

// =============================================================================
// Rule Evaluator
// =============================================================================

export {
  evaluateRule,
  evaluateRulesInOrder,
  evaluateAllRules,
  evaluateCondition,
  extractFieldValue,
  RuleEvaluationError,
  type RuleEvaluationResult,
  type RoutingParams,
} from './rule-evaluator';

// =============================================================================
// Router
// =============================================================================

export {
  routeInvocation,
  getAvailableOperations,
  validateHasOperations,
  getDefaultOperation,
  extractOperationFromParams,
  RoutingError,
  RoutingErrorCode,
  type RoutingResult,
  type RoutingOptions,
} from './router';

// =============================================================================
// Schema Merger
// =============================================================================

export {
  mergeOperationSchemas,
  mapParametersToOperation,
  getOperationEnumValues,
  buildAgentDrivenSchema,
  validateUnifiedParams,
  SchemaMergeError,
  type ActionInputSchema,
  type OperationWithAction,
  type MergedParameter,
  type MergedSchemaResult,
  type SchemaMergeOptions,
} from './schema-merger';
