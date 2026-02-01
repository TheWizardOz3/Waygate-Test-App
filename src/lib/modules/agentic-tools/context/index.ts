/**
 * Context Module
 *
 * Exports for context loading and variable injection for agentic tools.
 */

// Schema Loader
export {
  loadIntegrationSchema,
  loadIntegrationSchemas,
  formatSchemaForPrompt,
  formatSchemasForPrompt,
  formatSchemaCompact,
  SchemaLoadError,
  type ActionSchemaInfo,
  type IntegrationSchema,
  type SchemaLoadOptions,
} from './schema-loader';

// Variable Injector
export {
  buildContext,
  validateContextConfig,
  type BuildContextOptions,
  type LoadedRuntimeContext,
  type PromptContext,
} from './variable-injector';
