/**
 * Tool Export Service
 *
 * Business logic for exporting Waygate actions as AI-consumable tool definitions.
 * Supports multiple formats: universal (LLM-agnostic), LangChain, and MCP.
 *
 * Key responsibilities:
 * - Export integration actions as universal tools
 * - Export individual actions as tools
 * - Validate integration/action ownership
 * - Aggregate context types from actions
 */

import { prisma } from '@/lib/db/client';
import { findActionsByIntegration, findActionBySlug, toActionResponse } from '../actions';
import {
  transformActionToUniversalTool,
  transformActionsToUniversalTools,
} from './formats/universal.transformer';
import {
  transformUniversalExportToLangChain,
  type LangChainExportResponse,
  type LangChainTransformOptions,
} from './formats/langchain.transformer';
import {
  transformUniversalExportToMCP,
  type MCPExportResponse,
  type MCPTransformOptions,
} from './formats/mcp.transformer';
import {
  ToolExportErrorCodes,
  type ToolExportErrorCode,
  type UniversalTool,
  type UniversalToolProperty,
  type ToolExportResponse,
  type SingleToolExportResponse,
} from './tool-export.schemas';

// =============================================================================
// Error Class
// =============================================================================

/**
 * Error thrown when tool export operations fail
 */
export class ToolExportError extends Error {
  constructor(
    public code: ToolExportErrorCode,
    message: string,
    public statusCode: number = 400
  ) {
    super(message);
    this.name = 'ToolExportError';
  }
}

// =============================================================================
// Types
// =============================================================================

/**
 * Options for exporting tools
 */
export interface ExportToolsOptions {
  /** Include action metadata in descriptions */
  includeMetadata?: boolean;
  /** Maximum description length */
  maxDescriptionLength?: number;
  /** Include context type declarations */
  includeContextTypes?: boolean;
}

// =============================================================================
// Integration Tool Export
// =============================================================================

/**
 * Export all actions from an integration as universal tools.
 *
 * @param tenantId - The tenant requesting the export
 * @param integrationId - The integration to export
 * @param options - Export options
 * @returns Tool export response with all tools
 */
export async function exportIntegrationToolsUniversal(
  tenantId: string,
  integrationId: string,
  options: ExportToolsOptions = {}
): Promise<ToolExportResponse> {
  // Verify integration ownership and get metadata
  const integration = await prisma.integration.findFirst({
    where: {
      id: integrationId,
      tenantId,
    },
    select: {
      id: true,
      slug: true,
      name: true,
    },
  });

  if (!integration) {
    throw new ToolExportError(
      ToolExportErrorCodes.INTEGRATION_NOT_FOUND,
      `Integration not found or access denied`,
      404
    );
  }

  // Get all actions for the integration
  const actions = await findActionsByIntegration(integrationId);

  if (actions.length === 0) {
    throw new ToolExportError(
      ToolExportErrorCodes.NO_ACTIONS_AVAILABLE,
      `No actions available for export. Create actions first.`,
      404
    );
  }

  // Transform actions to API response format
  const actionResponses = actions.map((action) => toActionResponse(action));

  // Transform to universal tools
  const { tools, errors } = transformActionsToUniversalTools(actionResponses, integration.slug, {
    includeMetadata: options.includeMetadata,
    maxDescriptionLength: options.maxDescriptionLength,
    includeContextTypes: options.includeContextTypes ?? true,
    integrationName: integration.name,
  });

  // Log transformation errors but don't fail the request
  if (errors.length > 0) {
    console.warn(
      `[ToolExport] ${errors.length} actions failed to transform:`,
      errors.map((e) => `${e.actionSlug}: ${e.error}`)
    );
  }

  // Aggregate context types from all tools
  const contextTypes = aggregateContextTypes(tools);

  return {
    integration: {
      id: integration.id,
      slug: integration.slug,
      name: integration.name,
    },
    tools,
    contextTypes,
    format: {
      name: 'universal',
      version: '1.0',
      compatibleWith: ['openai', 'anthropic', 'gemini', 'langchain'],
    },
  };
}

/**
 * Export a single action as a universal tool.
 *
 * @param tenantId - The tenant requesting the export
 * @param integrationId - The integration containing the action
 * @param actionSlug - The action's slug
 * @param options - Export options
 * @returns Single tool export response
 */
export async function exportActionToolUniversal(
  tenantId: string,
  integrationId: string,
  actionSlug: string,
  options: ExportToolsOptions = {}
): Promise<SingleToolExportResponse> {
  // Verify integration ownership and get metadata
  const integration = await prisma.integration.findFirst({
    where: {
      id: integrationId,
      tenantId,
    },
    select: {
      id: true,
      slug: true,
      name: true,
    },
  });

  if (!integration) {
    throw new ToolExportError(
      ToolExportErrorCodes.INTEGRATION_NOT_FOUND,
      `Integration not found or access denied`,
      404
    );
  }

  // Get the specific action
  const action = await findActionBySlug(integrationId, actionSlug);

  if (!action) {
    throw new ToolExportError(
      ToolExportErrorCodes.ACTION_NOT_FOUND,
      `Action '${actionSlug}' not found in integration`,
      404
    );
  }

  // Transform to API response format
  const actionResponse = toActionResponse(action);

  // Transform to universal tool
  const result = transformActionToUniversalTool(actionResponse, integration.slug, {
    includeMetadata: options.includeMetadata,
    maxDescriptionLength: options.maxDescriptionLength,
    includeContextTypes: options.includeContextTypes ?? true,
    integrationName: integration.name,
  });

  if (!result.success) {
    throw new ToolExportError(
      ToolExportErrorCodes.SCHEMA_TRANSFORMATION_FAILED,
      `Failed to transform action: ${result.error}`,
      500
    );
  }

  return {
    action: {
      id: action.id,
      slug: action.slug,
      name: action.name,
    },
    tool: result.tool,
    format: {
      name: 'universal',
      version: '1.0',
      compatibleWith: ['openai', 'anthropic', 'gemini', 'langchain'],
    },
  };
}

// =============================================================================
// LangChain Tool Export
// =============================================================================

/**
 * Options for LangChain export
 */
export interface LangChainExportOptions extends ExportToolsOptions {
  /** Waygate API base URL for code generation */
  apiBaseUrl?: string;
  /** Include code snippets in response */
  includeCodeSnippets?: boolean;
}

/**
 * Export all actions from an integration as LangChain tools.
 *
 * @param tenantId - The tenant requesting the export
 * @param integrationId - The integration to export
 * @param options - Export options
 * @returns LangChain export response with all tools
 */
export async function exportIntegrationToolsLangChain(
  tenantId: string,
  integrationId: string,
  options: LangChainExportOptions = {}
): Promise<LangChainExportResponse> {
  // First get the universal export
  const universalExport = await exportIntegrationToolsUniversal(tenantId, integrationId, {
    includeMetadata: options.includeMetadata,
    maxDescriptionLength: options.maxDescriptionLength,
    includeContextTypes: options.includeContextTypes,
  });

  // Transform to LangChain format
  const langchainOptions: LangChainTransformOptions = {
    apiBaseUrl: options.apiBaseUrl,
    includeCodeSnippets: options.includeCodeSnippets ?? true,
  };

  return transformUniversalExportToLangChain(universalExport, langchainOptions);
}

// =============================================================================
// MCP Tool Export
// =============================================================================

/**
 * Options for MCP export
 */
export interface MCPExportOptions extends ExportToolsOptions {
  /** Waygate API base URL */
  apiBaseUrl?: string;
  /** Include server file generation */
  includeServerFile?: boolean;
  /** Include resources for reference data */
  includeResources?: boolean;
  /** Server version */
  serverVersion?: string;
}

/**
 * Export all actions from an integration as MCP tools.
 *
 * @param tenantId - The tenant requesting the export
 * @param integrationId - The integration to export
 * @param options - Export options
 * @returns MCP export response with server definition
 */
export async function exportIntegrationToolsMCP(
  tenantId: string,
  integrationId: string,
  options: MCPExportOptions = {}
): Promise<MCPExportResponse> {
  // First get the universal export
  const universalExport = await exportIntegrationToolsUniversal(tenantId, integrationId, {
    includeMetadata: options.includeMetadata,
    maxDescriptionLength: options.maxDescriptionLength,
    includeContextTypes: options.includeContextTypes,
  });

  // Transform to MCP format
  const mcpOptions: MCPTransformOptions = {
    apiBaseUrl: options.apiBaseUrl,
    includeServerFile: options.includeServerFile ?? true,
    includeResources: options.includeResources ?? true,
    serverVersion: options.serverVersion,
  };

  return transformUniversalExportToMCP(universalExport, mcpOptions);
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Aggregate all unique context types from a list of tools.
 */
function aggregateContextTypes(tools: UniversalTool[]): string[] {
  const contextTypesSet = new Set<string>();

  for (const tool of tools) {
    if (tool.contextTypes) {
      for (const contextType of tool.contextTypes) {
        contextTypesSet.add(contextType);
      }
    }
  }

  return Array.from(contextTypesSet).sort();
}

/**
 * Get available export formats.
 */
export function getAvailableExportFormats(): string[] {
  return ['universal', 'langchain', 'mcp'];
}

// =============================================================================
// All Tools Export (Aggregated)
// =============================================================================

/**
 * Response for aggregated tool export across all integrations
 */
export interface AggregatedToolExportResponse {
  /** All exported tools grouped by type */
  tools: UniversalTool[];
  /** Summary of tools by type */
  summary: {
    total: number;
    simple: number;
    composite: number;
    agentic: number;
  };
  /** Available context types across all integrations */
  contextTypes: string[];
  /** Export format metadata */
  format: {
    name: 'universal';
    version: '1.0';
    compatibleWith: string[];
  };
}

/**
 * Export all tools (simple, composite, agentic) in universal format.
 *
 * @param tenantId - The tenant requesting the export
 * @param options - Export options
 * @returns Aggregated tool export response
 */
export async function exportAllToolsUniversal(
  tenantId: string,
  options: ExportToolsOptions = {}
): Promise<AggregatedToolExportResponse> {
  // Fetch all actions (simple tools) across all integrations
  const actions = await prisma.action.findMany({
    where: {
      integration: { tenantId },
    },
    include: {
      integration: {
        select: {
          id: true,
          name: true,
          slug: true,
        },
      },
    },
  });

  // Fetch all composite tools with their operations
  const compositeTools = await prisma.compositeTool.findMany({
    where: {
      tenantId,
      status: { in: ['active', 'draft'] },
    },
    include: {
      operations: {
        select: {
          operationSlug: true,
          displayName: true,
        },
        orderBy: { priority: 'asc' },
      },
    },
  });

  // Fetch all agentic tools
  const agenticTools = await prisma.agenticTool.findMany({
    where: {
      tenantId,
      status: { in: ['active', 'draft'] },
    },
  });

  // Transform simple tools (actions)
  const simpleToolsResult = actions.map((action) => {
    const actionResponse = toActionResponse(action);
    return transformActionToUniversalTool(actionResponse, action.integration.slug, {
      includeMetadata: options.includeMetadata,
      maxDescriptionLength: options.maxDescriptionLength,
      includeContextTypes: options.includeContextTypes ?? true,
      integrationName: action.integration.name,
    });
  });

  const simpleTools: UniversalTool[] = simpleToolsResult
    .filter((r): r is { success: true; tool: UniversalTool } => r.success)
    .map((r) => r.tool);

  // Transform composite tools to universal format
  const compositeUniversalTools: UniversalTool[] = compositeTools.map((tool) => {
    // Get operation names for agent_driven mode
    const operationNames = tool.operations.map((op) => op.operationSlug);

    return {
      name: generateCompositeToolName(tool.slug),
      description: buildCompositeToolDescription(
        {
          name: tool.name,
          description: tool.description,
          toolDescription: tool.toolDescription,
          routingMode: tool.routingMode,
          unifiedInputSchema: tool.unifiedInputSchema as Record<string, unknown> | null,
        },
        operationNames
      ),
      parameters: {
        type: 'object' as const,
        properties: transformCompositeInputSchema(
          tool.unifiedInputSchema as Record<string, unknown>
        ),
        required: extractRequiredFields(tool.unifiedInputSchema as Record<string, unknown>),
      },
      contextTypes: [],
    };
  });

  // Transform agentic tools to universal format
  const agenticUniversalTools: UniversalTool[] = agenticTools.map((tool) => ({
    name: generateAgenticToolName(tool.slug),
    description: buildAgenticToolDescription({
      name: tool.name,
      description: tool.description,
      toolDescription: tool.toolDescription,
      executionMode: tool.executionMode,
      inputSchema: tool.inputSchema as Record<string, unknown> | null,
    }),
    parameters: {
      type: 'object' as const,
      properties: transformAgenticInputSchema(tool.inputSchema as Record<string, unknown>),
      required: extractRequiredFields(tool.inputSchema as Record<string, unknown>),
    },
    contextTypes: [],
  }));

  // Combine all tools
  const allTools = [...simpleTools, ...compositeUniversalTools, ...agenticUniversalTools];

  // Aggregate context types
  const contextTypes = aggregateContextTypes(allTools);

  return {
    tools: allTools,
    summary: {
      total: allTools.length,
      simple: simpleTools.length,
      composite: compositeUniversalTools.length,
      agentic: agenticUniversalTools.length,
    },
    contextTypes,
    format: {
      name: 'universal',
      version: '1.0',
      compatibleWith: ['openai', 'anthropic', 'gemini', 'langchain'],
    },
  };
}

/**
 * LangChain export response for all tools
 */
export interface AggregatedLangChainExportResponse {
  tools: ReturnType<typeof transformUniversalExportToLangChain>['tools'];
  summary: {
    total: number;
    simple: number;
    composite: number;
    agentic: number;
  };
  contextTypes: string[];
  format: {
    name: 'langchain';
    version: '1.0';
    compatibleWith: string[];
  };
  codeSnippets: {
    typescript: string;
    python: string;
  };
}

/**
 * Export all tools in LangChain format.
 */
export async function exportAllToolsLangChain(
  tenantId: string,
  options: LangChainExportOptions = {}
): Promise<AggregatedLangChainExportResponse> {
  const universalExport = await exportAllToolsUniversal(tenantId, {
    includeMetadata: options.includeMetadata,
    maxDescriptionLength: options.maxDescriptionLength,
    includeContextTypes: options.includeContextTypes,
  });

  // Create a mock integration for the transformer
  const mockExport: ToolExportResponse = {
    integration: {
      id: 'all-tools',
      slug: 'all-tools',
      name: 'All Tools',
    },
    tools: universalExport.tools,
    contextTypes: universalExport.contextTypes,
    format: universalExport.format,
  };

  const langchainResult = transformUniversalExportToLangChain(mockExport, {
    apiBaseUrl: options.apiBaseUrl,
    includeCodeSnippets: options.includeCodeSnippets ?? true,
  });

  // Update code snippets to use the all-tools endpoint
  const apiBaseUrl = options.apiBaseUrl || 'https://app.waygate.dev';

  return {
    tools: langchainResult.tools,
    summary: universalExport.summary,
    contextTypes: universalExport.contextTypes,
    format: {
      name: 'langchain',
      version: '1.0',
      compatibleWith: ['langchain-js', 'langchain-python', 'llamaindex'],
    },
    codeSnippets: {
      typescript: generateAllToolsTypeScriptSnippet(apiBaseUrl),
      python: generateAllToolsPythonSnippet(apiBaseUrl),
    },
  };
}

/**
 * MCP export response for all tools
 */
export interface AggregatedMCPExportResponse {
  server: ReturnType<typeof transformUniversalExportToMCP>['server'];
  summary: {
    total: number;
    simple: number;
    composite: number;
    agentic: number;
  };
  format: {
    name: 'mcp';
    version: '1.0';
    compatibleWith: string[];
  };
  serverFile: {
    typescript: string;
    packageJson: string;
    claudeDesktopConfig: string;
  };
}

/**
 * Export all tools in MCP format.
 */
export async function exportAllToolsMCP(
  tenantId: string,
  options: MCPExportOptions = {}
): Promise<AggregatedMCPExportResponse> {
  const universalExport = await exportAllToolsUniversal(tenantId, {
    includeMetadata: options.includeMetadata,
    maxDescriptionLength: options.maxDescriptionLength,
    includeContextTypes: options.includeContextTypes,
  });

  // Create a mock integration for the transformer
  const mockExport: ToolExportResponse = {
    integration: {
      id: 'all-tools',
      slug: 'waygate-all',
      name: 'Waygate All Tools',
    },
    tools: universalExport.tools,
    contextTypes: universalExport.contextTypes,
    format: universalExport.format,
  };

  const mcpResult = transformUniversalExportToMCP(mockExport, {
    apiBaseUrl: options.apiBaseUrl,
    includeServerFile: options.includeServerFile ?? true,
    includeResources: options.includeResources ?? true,
    serverVersion: options.serverVersion,
  });

  return {
    server: mcpResult.server,
    summary: universalExport.summary,
    format: {
      name: 'mcp',
      version: '1.0',
      compatibleWith: ['claude-desktop', 'mcp-client'],
    },
    serverFile: mcpResult.serverFile,
  };
}

// =============================================================================
// Helper Functions for Aggregated Export
// =============================================================================

/**
 * Generate tool name for composite tools
 */
function generateCompositeToolName(slug: string): string {
  return `composite_${slug.toLowerCase().replace(/-/g, '_')}`;
}

/**
 * Build a mini-prompt formatted description for a composite tool.
 * Follows the playbook format from simple-tool-export.md.
 */
function buildCompositeToolDescription(
  tool: {
    name: string;
    description: string | null;
    toolDescription: string | null;
    routingMode: string;
    unifiedInputSchema: Record<string, unknown> | null;
  },
  operationNames: string[]
): string {
  // If toolDescription already exists and looks formatted, use it
  if (tool.toolDescription && tool.toolDescription.includes('# ')) {
    return tool.toolDescription;
  }

  const parts: string[] = [];

  // 1. Opening line
  const baseDescription = tool.description || `A composite tool that combines multiple operations`;
  if (tool.routingMode === 'agent_driven') {
    parts.push(
      `Use this tool to ${baseDescription.charAt(0).toLowerCase()}${baseDescription.slice(1).replace(/\.$/, '')}. ` +
        `Select the appropriate operation from the available options.`
    );
  } else {
    parts.push(
      `Use this tool to ${baseDescription.charAt(0).toLowerCase()}${baseDescription.slice(1).replace(/\.$/, '')}.`
    );
  }

  // 2. Extract parameters from schema
  const schema = tool.unifiedInputSchema;
  if (schema && typeof schema === 'object') {
    const properties = (schema as { properties?: Record<string, unknown> }).properties || {};
    const required = (schema as { required?: string[] }).required || [];
    const requiredSet = new Set(required);

    const requiredParams: Array<{ name: string; desc: string }> = [];
    const optionalParams: Array<{ name: string; desc: string }> = [];

    for (const [name, propValue] of Object.entries(properties)) {
      const prop = propValue as { description?: string; type?: string; enum?: unknown[] };
      let description = prop.description || `The ${name}`;

      // Add type info
      if (prop.type) {
        description += ` (${prop.type})`;
      }

      // Add enum values for operation parameter
      if (name === 'operation' && prop.enum && Array.isArray(prop.enum)) {
        description = `Which operation to perform. Must be one of: ${prop.enum.map((v) => `"${v}"`).join(', ')}`;
      }

      if (requiredSet.has(name)) {
        requiredParams.push({ name, desc: description });
      } else {
        optionalParams.push({ name, desc: description });
      }
    }

    // 3. Required inputs section
    if (requiredParams.length > 0) {
      parts.push('');
      parts.push('# Required inputs:');
      for (const param of requiredParams) {
        parts.push(`- ${param.name}: ${param.desc}`);
      }
    }

    // 4. Optional inputs section
    if (optionalParams.length > 0) {
      parts.push('');
      parts.push('# Optional inputs:');
      for (const param of optionalParams) {
        parts.push(`- ${param.name}: ${param.desc}`);
      }
    }
  }

  // 5. Operations available (for agent_driven mode)
  if (tool.routingMode === 'agent_driven' && operationNames.length > 0) {
    parts.push('');
    parts.push('# Available operations:');
    for (const opName of operationNames) {
      parts.push(`- ${opName}`);
    }
  }

  // 6. Output description
  parts.push('');
  parts.push('# What the tool outputs:');
  parts.push(
    'Returns the result from the selected operation. The response format depends on which operation is executed.'
  );

  return parts.join('\n');
}

/**
 * Build a mini-prompt formatted description for an agentic tool.
 * Follows the playbook format from simple-tool-export.md.
 */
function buildAgenticToolDescription(tool: {
  name: string;
  description: string | null;
  toolDescription: string | null;
  executionMode: string;
  inputSchema: Record<string, unknown> | null;
}): string {
  // If toolDescription already exists and looks formatted, use it
  if (tool.toolDescription && tool.toolDescription.includes('# ')) {
    return tool.toolDescription;
  }

  const parts: string[] = [];

  // 1. Opening line - explain what the tool does based on execution mode
  const baseDescription = tool.description || `An AI-powered tool`;
  if (tool.executionMode === 'parameter_interpreter') {
    parts.push(
      `Use this tool to ${baseDescription.charAt(0).toLowerCase()}${baseDescription.slice(1).replace(/\.$/, '')}. ` +
        `Provide a natural language description of what you want, and the embedded LLM will generate the appropriate parameters.`
    );
  } else {
    // autonomous_agent mode
    parts.push(
      `Use this tool to ${baseDescription.charAt(0).toLowerCase()}${baseDescription.slice(1).replace(/\.$/, '')}. ` +
        `Provide your goal in natural language, and the embedded AI agent will autonomously select and execute the necessary actions.`
    );
  }

  // 2. Extract parameters from schema
  const schema = tool.inputSchema;
  if (schema && typeof schema === 'object') {
    const properties = (schema as { properties?: Record<string, unknown> }).properties || {};
    const required = (schema as { required?: string[] }).required || [];
    const requiredSet = new Set(required);

    const requiredParams: Array<{ name: string; desc: string }> = [];
    const optionalParams: Array<{ name: string; desc: string }> = [];

    for (const [name, propValue] of Object.entries(properties)) {
      const prop = propValue as { description?: string; type?: string };
      let description = prop.description || `The ${name}`;

      // Add type info
      if (prop.type) {
        description += ` (${prop.type})`;
      }

      // Special handling for common agentic tool parameters
      if (name === 'task' || name === 'goal' || name === 'input') {
        description =
          tool.executionMode === 'parameter_interpreter'
            ? `Natural language description of your request. Be specific about what you want to accomplish.`
            : `Natural language description of your goal. The AI agent will determine the best way to achieve it.`;
      }

      if (requiredSet.has(name)) {
        requiredParams.push({ name, desc: description });
      } else {
        optionalParams.push({ name, desc: description });
      }
    }

    // 3. Required inputs section
    if (requiredParams.length > 0) {
      parts.push('');
      parts.push('# Required inputs:');
      for (const param of requiredParams) {
        parts.push(`- ${param.name}: ${param.desc}`);
      }
    }

    // 4. Optional inputs section
    if (optionalParams.length > 0) {
      parts.push('');
      parts.push('# Optional inputs:');
      for (const param of optionalParams) {
        parts.push(`- ${param.name}: ${param.desc}`);
      }
    }
  }

  // 5. Output description
  parts.push('');
  parts.push('# What the tool outputs:');
  if (tool.executionMode === 'parameter_interpreter') {
    parts.push(
      'Returns the result of the action executed with the interpreted parameters. ' +
        'The response includes the operation result and any relevant data from the API.'
    );
  } else {
    parts.push(
      'Returns a summary of the actions taken and their results. ' +
        'The AI agent may execute multiple operations and will synthesize the results into a coherent response.'
    );
  }

  return parts.join('\n');
}

/**
 * Generate tool name for agentic tools
 */
function generateAgenticToolName(slug: string): string {
  return `agentic_${slug.toLowerCase().replace(/-/g, '_')}`;
}

/**
 * Transform composite tool input schema to universal properties
 */
function transformCompositeInputSchema(
  schema: Record<string, unknown> | null | undefined
): Record<string, UniversalToolProperty> {
  if (!schema || typeof schema !== 'object') {
    return {};
  }

  const properties = (schema as { properties?: Record<string, unknown> }).properties;
  if (!properties) {
    return {};
  }

  const result: Record<string, UniversalToolProperty> = {};
  for (const [key, value] of Object.entries(properties)) {
    const prop = value as { type?: string; description?: string; enum?: unknown[] };
    result[key] = {
      type: (prop.type as UniversalToolProperty['type']) || 'string',
      description: prop.description || key,
      ...(prop.enum ? { enum: prop.enum as (string | number | boolean)[] } : {}),
    };
  }
  return result;
}

/**
 * Transform agentic tool input schema to universal properties
 */
function transformAgenticInputSchema(
  schema: Record<string, unknown> | null | undefined
): Record<string, UniversalToolProperty> {
  // Same logic as composite for now
  return transformCompositeInputSchema(schema);
}

/**
 * Extract required fields from a JSON schema
 */
function extractRequiredFields(schema: Record<string, unknown> | null | undefined): string[] {
  if (!schema || typeof schema !== 'object') {
    return [];
  }
  const required = (schema as { required?: string[] }).required;
  return Array.isArray(required) ? required : [];
}

/**
 * Generate TypeScript snippet for all tools export
 */
function generateAllToolsTypeScriptSnippet(apiBaseUrl: string): string {
  return `// LangChain TypeScript Integration for All Waygate Tools
import { DynamicStructuredTool } from '@langchain/core/tools';

// Fetch all tools from Waygate
const response = await fetch(
  '${apiBaseUrl}/api/v1/tools/export/langchain',
  { headers: { Authorization: \`Bearer \${WAYGATE_API_KEY}\` } }
);
const { tools, contextTypes } = await response.json();

// Create LangChain tools with Waygate invocation
const langchainTools = tools.map((tool) =>
  new DynamicStructuredTool({
    name: tool.name,
    description: tool.description,
    schema: tool.schema,
    func: async (params) => {
      const result = await fetch('${apiBaseUrl}/api/v1/tools/invoke', {
        method: 'POST',
        headers: {
          Authorization: \`Bearer \${WAYGATE_API_KEY}\`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tool: tool.name,
          params,
        }),
      });
      const response = await result.json();

      return response.success
        ? \`\${response.message}\\n\\n\${response.nextSteps}\`
        : \`\${response.message}\\n\\n\${response.remediation}\`;
    },
  })
);

// Use with your agent
// agent.tools = langchainTools;`;
}

/**
 * Generate Python snippet for all tools export
 */
function generateAllToolsPythonSnippet(apiBaseUrl: string): string {
  return `# LangChain Python Integration for All Waygate Tools
import requests
from langchain.tools import StructuredTool
from typing import Any, Dict

# Fetch all tools from Waygate
response = requests.get(
    "${apiBaseUrl}/api/v1/tools/export/langchain",
    headers={"Authorization": f"Bearer {WAYGATE_API_KEY}"}
)
tools_data = response.json()

def create_waygate_tool(tool_def: Dict[str, Any]) -> StructuredTool:
    """Create a LangChain tool from a Waygate tool definition."""

    def invoke_tool(**kwargs) -> str:
        result = requests.post(
            "${apiBaseUrl}/api/v1/tools/invoke",
            headers={
                "Authorization": f"Bearer {WAYGATE_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "tool": tool_def["name"],
                "params": kwargs,
            },
        )
        response = result.json()

        if response.get("success"):
            return f"{response['message']}\\n\\n{response['nextSteps']}"
        else:
            return f"{response['message']}\\n\\n{response['remediation']}"

    return StructuredTool.from_function(
        func=invoke_tool,
        name=tool_def["name"],
        description=tool_def["description"],
    )

# Create LangChain tools
langchain_tools = [create_waygate_tool(tool) for tool in tools_data["tools"]]

# Use with your agent
# agent = create_react_agent(llm, langchain_tools, ...)`;
}
