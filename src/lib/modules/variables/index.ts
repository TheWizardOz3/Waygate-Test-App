/**
 * Variables Module
 *
 * Provides developer-defined variables for dynamic context injection in AI tools.
 * Supports tenant-level and connection-level variables with environment-specific overrides.
 *
 * @module variables
 */

// Types - export specific types to avoid conflicts
export type {
  Variable,
  VariableValueType,
  VariableEnvironment,
  CurrentUserContext,
  ConnectionContext,
  RequestContext,
  RuntimeContext,
  ParsedVariableReference,
  ResolvedVariable,
  VariableResolutionOptions,
  VariableResolutionResult,
  VariableMap,
  ScopedVariables,
} from './types';

// Schemas - export all (includes VariableScope, VariableFilters)
export * from './variable.schemas';

// Repository - export specific to avoid conflicts with schema types
export {
  // Types
  type CreateVariableDbInput,
  type UpdateVariableDbInput,
  type VariableFilters as VariableRepositoryFilters,
  type PaginationOptions,
  type PaginatedVariables,
  // Create
  createVariable,
  createManyVariables,
  // Read
  findVariableById,
  findVariableByIdAndTenant,
  findVariableByKey,
  findTenantVariables,
  findConnectionVariables,
  findByTenantId,
  getScopedVariables,
  variableKeyExists,
  // Update
  updateVariable,
  upsertVariable,
  // Delete
  deleteVariable,
  deleteVariableByIdAndTenant,
  deleteByTenantId,
  deleteByConnectionId,
  // Count
  countByTenantId,
  getVariableCountsByConnection,
} from './variable.repository';

// Parser - Phase 2
export {
  // Constants
  VALID_NAMESPACES,
  type ValidNamespace,
  // Parser functions
  parseVariableReferences,
  parsePath,
  isValidNamespace,
  validateVariableSyntax,
  containsVariableReferences,
  extractUniqueVariables,
  categorizeByNamespace,
  replaceVariableReferences,
  valueToString,
  // Template validation
  type TemplateValidationResult,
  validateTemplate,
} from './variable.parser';

// Runtime Context - Phase 2
export {
  // Types
  type CurrentUserInput,
  type ConnectionInput,
  type RequestInput,
  type RuntimeContextInput,
  // Builders
  buildCurrentUserContext,
  buildConnectionContext,
  buildRequestContext,
  buildRuntimeContext,
  // Context extraction
  getContextValue,
  flattenRuntimeContext,
  getRuntimeContextPaths,
  validateRuntimeContext,
  // Environment
  getEnvironment,
  isEnvironment,
  ENVIRONMENTS,
} from './runtime-context';

// Resolver - Phase 2
export {
  // Main resolver functions
  resolveTemplate,
  resolveValue,
  resolveTemplates,
  // Utilities
  maskSensitiveValues,
  summarizeResolution,
  // Preview/Validation
  previewResolution,
  validateResolvability,
  // Errors
  VariableResolutionError,
} from './variable.resolver';

// Cache - Phase 2
export {
  // Types
  type CachedScopedVariables,
  type VariableCacheOptions,
  type CacheStats,
  // Cache access
  getVariableCache,
  resetVariableCache,
  createVariableCache,
  // Invalidation
  invalidateVariableCache,
} from './variable.cache';

// Service - Phase 5
export {
  // Error class
  VariableError,
  // List operations
  listVariables,
  listTenantVariables,
  listConnectionVariables,
  // Get operation
  getVariableById,
  // Create operations
  createTenantVariable,
  createConnectionVariable,
  // Update operation
  updateVariableById,
  // Delete operation
  deleteVariableById,
} from './variable.service';

// Encryption - Phase 7
export {
  // Functions
  encryptVariableValue,
  decryptVariableValue,
  maskValue,
  shouldMaskValue,
  // Constants
  SENSITIVE_VALUE_PLACEHOLDER,
  // Errors
  VariableEncryptionError,
} from './variable.encryption';
