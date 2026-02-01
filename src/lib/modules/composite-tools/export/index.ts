/**
 * Composite Tools Export Module
 *
 * Provides LLM description generation and tool export functionality
 * for composite tools.
 *
 * Exports composite tools in Universal, LangChain, and MCP formats.
 */

// =============================================================================
// Description Generator
// =============================================================================

export {
  generateCompositeToolDescriptions,
  generateDescriptionsFromCompositeTool,
  generateBasicCompositeToolDescription,
  generateCompositeToolDescriptionsWithFallback,
  loadOperationActionData,
} from './composite-tool-description-generator';

export type {
  OperationActionData,
  GeneratedCompositeToolDescriptions,
  CompositeToolDescriptionInput,
} from './composite-tool-description-generator';

// =============================================================================
// Transformer (Universal, LangChain, MCP)
// =============================================================================

export {
  // Universal format
  transformCompositeToolToUniversalTool,
  createCompositeToolExportResponse,
  generateCompositeToolName,
  buildUniversalToolParameters,
  aggregateContextTypes,
  // LangChain format
  transformCompositeToolToLangChain,
  // MCP format
  transformCompositeToolToMCP,
} from './composite-tool.transformer';

export type {
  CompositeToolTransformOptions,
  CompositeToolTransformResult,
  CompositeToolTransformError,
  CompositeToolExportResponse,
  CompositeToolLangChainExportResponse,
  CompositeToolMCPExportResponse,
} from './composite-tool.transformer';
