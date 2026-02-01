/**
 * Composite Tools Context Module
 *
 * Handles loading execution context for composite tool operations:
 * - Credentials and authentication
 * - Reference data for context resolution
 * - Parameter mapping from unified to operation-specific
 */

// Context Loader
export {
  loadOperationContext,
  requiresCredentials,
  summarizeContext,
  ContextLoadError,
  ContextLoadErrorCode,
} from './context-loader';

export type { ActionWithIntegration, OperationContext, LoadContextOptions } from './context-loader';

// Parameter Mapper
export {
  mapParameters,
  extractAndRemoveOperationSlug,
  summarizeMappingResult,
  createMappingErrorResponse,
  ParameterMappingError,
} from './parameter-mapper';

export type {
  ParameterMappingRecord,
  ParameterMappingResult,
  ParameterMappingOptions,
} from './parameter-mapper';
