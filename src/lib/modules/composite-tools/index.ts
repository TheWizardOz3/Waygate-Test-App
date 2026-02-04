/**
 * Composite Tools Module
 *
 * Manages composite tool definitions - aggregate tools that wrap multiple actions
 * with configurable routing logic (rule-based or agent-driven).
 *
 * Provides CRUD operations with tenant isolation and validation.
 */

// =============================================================================
// Schemas & Types
// =============================================================================

export {
  // Enums
  CompositeToolRoutingModeSchema,
  CompositeToolStatusSchema,
  RoutingConditionTypeSchema,
  // Condition schemas
  RoutingConditionSchema,
  // Parameter mapping schemas
  OperationParameterMappingSchema,
  UnifiedSchemaConfigSchema,
  // Operation schemas
  CreateCompositeToolOperationInputSchema,
  UpdateCompositeToolOperationInputSchema,
  // Routing rule schemas
  CreateRoutingRuleInputSchema,
  UpdateRoutingRuleInputSchema,
  // Composite tool CRUD schemas
  CreateCompositeToolInputSchema,
  UpdateCompositeToolInputSchema,
  // Query schemas
  CompositeToolFiltersSchema,
  ListCompositeToolsQuerySchema,
  // Response schemas
  CompositeToolOperationResponseSchema,
  RoutingRuleResponseSchema,
  CompositeToolResponseSchema,
  CompositeToolDetailResponseSchema,
  ListCompositeToolsResponseSchema,
  CompositeToolSummarySchema,
  // Helper functions
  toCompositeToolResponse,
  toOperationResponse,
  toRoutingRuleResponse,
  // Error codes
  CompositeToolErrorCodes,
} from './composite-tool.schemas';

export type {
  CompositeToolRoutingMode,
  CompositeToolStatus,
  RoutingConditionType,
  RoutingCondition,
  UnifiedSchemaConfig,
  CreateCompositeToolOperationInput,
  UpdateCompositeToolOperationInput,
  CreateRoutingRuleInput,
  UpdateRoutingRuleInput,
  CreateCompositeToolInput,
  UpdateCompositeToolInput,
  CompositeToolFilters,
  ListCompositeToolsQuery,
  CompositeToolOperationResponse,
  RoutingRuleResponse,
  CompositeToolResponse,
  CompositeToolDetailResponse,
  ListCompositeToolsResponse,
  CompositeToolSummary,
} from './composite-tool.schemas';

// =============================================================================
// Repository (Data Access)
// =============================================================================

export {
  // Composite Tool
  createCompositeTool as createCompositeToolDb,
  findCompositeToolById,
  findCompositeToolByIdAndTenant,
  findCompositeToolWithRelations,
  findCompositeToolBySlug,
  findCompositeToolBySlugWithRelations,
  findCompositeToolsPaginated,
  findAllCompositeToolsForTenant,
  findCompositeToolsWithCounts,
  isCompositeToolSlugTaken,
  updateCompositeTool as updateCompositeToolDb,
  updateCompositeToolStatus,
  deleteCompositeTool as deleteCompositeToolDb,
  disableCompositeTool as disableCompositeToolDb,
  // Operations
  createOperation as createOperationDb,
  createOperationsBatch,
  findOperationById,
  findOperationBySlug,
  findOperationsByCompositeTool,
  isOperationSlugTaken,
  countOperations,
  updateOperation as updateOperationDb,
  deleteOperation as deleteOperationDb,
  findCompositeToolsUsingAction,
  // Routing Rules
  createRoutingRule as createRoutingRuleDb,
  createRoutingRulesBatch,
  findRoutingRuleById,
  findRoutingRulesByCompositeTool,
  findRoutingRulesByOperation,
  updateRoutingRule as updateRoutingRuleDb,
  deleteRoutingRule as deleteRoutingRuleDb,
  deleteRoutingRulesByCompositeTool,
  // Statistics
  getCompositeToolCountsByStatus,
} from './composite-tool.repository';

export type {
  CreateCompositeToolDbInput,
  UpdateCompositeToolDbInput,
  CreateOperationDbInput,
  UpdateOperationDbInput,
  CreateRoutingRuleDbInput,
  UpdateRoutingRuleDbInput,
  CompositeToolPaginationOptions,
  PaginatedCompositeTools,
  CompositeToolWithRelations,
  CompositeToolWithCounts,
} from './composite-tool.repository';

// =============================================================================
// Service (Business Logic)
// =============================================================================

export {
  // Error class
  CompositeToolError,
  // Composite Tool CRUD
  createCompositeTool,
  getCompositeToolById,
  getCompositeToolDetail,
  getCompositeToolBySlug,
  getCompositeToolBySlugDetail,
  getCompositeToolBySlugRaw,
  listCompositeTools,
  getAllCompositeTools,
  getCompositeToolsWithCounts,
  getCompositeToolsForAction,
  updateCompositeTool,
  activateCompositeTool,
  deleteCompositeTool,
  disableCompositeTool,
  // Operation CRUD
  addOperation,
  getOperationById,
  listOperations,
  updateOperation,
  removeOperation,
  // Routing Rule CRUD
  addRoutingRule,
  getRoutingRuleById,
  listRoutingRules,
  updateRoutingRule,
  removeRoutingRule,
  // Statistics
  getCompositeToolStats,
  // Description Generation
  regenerateCompositeToolDescription,
} from './composite-tool.service';

// =============================================================================
// Routing Engine
// =============================================================================

export {
  // Rule Evaluator
  evaluateRule,
  evaluateRulesInOrder,
  evaluateAllRules,
  evaluateCondition,
  extractFieldValue,
  RuleEvaluationError,
  // Router
  routeInvocation,
  getAvailableOperations,
  validateHasOperations,
  getDefaultOperation,
  extractOperationFromParams,
  RoutingError,
  RoutingErrorCode,
  // Schema Merger
  mergeOperationSchemas,
  mapParametersToOperation,
  getOperationEnumValues,
  buildAgentDrivenSchema,
  validateUnifiedParams,
  SchemaMergeError,
} from './routing';

export type {
  // Rule Evaluator types
  RuleEvaluationResult,
  RoutingParams,
  // Router types
  RoutingResult,
  RoutingOptions,
  // Schema Merger types
  ActionInputSchema,
  OperationWithAction,
  MergedParameter,
  MergedSchemaResult,
  SchemaMergeOptions,
} from './routing';

// =============================================================================
// Context Loading (Phase 3)
// =============================================================================

export {
  // Context Loader
  loadOperationContext,
  requiresCredentials,
  summarizeContext,
  ContextLoadError,
  ContextLoadErrorCode,
  // Parameter Mapper
  mapParameters,
  extractAndRemoveOperationSlug,
  summarizeMappingResult,
  createMappingErrorResponse,
  ParameterMappingError,
} from './context';

export type {
  // Context Loader types
  ActionWithIntegration,
  OperationContext,
  LoadContextOptions,
  // Parameter Mapper types
  ParameterMappingRecord,
  ParameterMappingResult,
  ParameterMappingOptions,
} from './context';

// =============================================================================
// Invocation Handlers (Phase 3)
// =============================================================================

export { invokeCompositeTool, CompositeToolInvokeErrorCodes } from './handlers';

export type {
  CompositeToolInvokeInput,
  CompositeToolInvocationMeta,
  CompositeToolSuccessResponse,
  CompositeToolErrorResponse,
  CompositeToolResponse as CompositeToolInvokeResponse,
} from './handlers';

// =============================================================================
// Export & Description Generation (Phase 4)
// =============================================================================

export {
  // Description Generator
  generateCompositeToolDescriptions,
  generateDescriptionsFromCompositeTool,
  generateBasicCompositeToolDescription,
  generateCompositeToolDescriptionsWithFallback,
  loadOperationActionData,
  buildUnifiedInputSchema,
  mergeParamsFromDescription,
  // Transformer (Universal)
  transformCompositeToolToUniversalTool,
  createCompositeToolExportResponse,
  generateCompositeToolName,
  buildUniversalToolParameters,
  aggregateContextTypes,
  // Transformer (LangChain)
  transformCompositeToolToLangChain,
  // Transformer (MCP)
  transformCompositeToolToMCP,
} from './export';

export type {
  // Description Generator types
  OperationActionData,
  GeneratedCompositeToolDescriptions,
  CompositeToolDescriptionInput,
  // Transformer types
  CompositeToolTransformOptions,
  CompositeToolTransformResult,
  CompositeToolTransformError,
  CompositeToolExportResponse,
  CompositeToolLangChainExportResponse,
  CompositeToolMCPExportResponse,
} from './export';
