/**
 * Composite Tool Transformer
 *
 * Transforms composite tools into exportable tool definitions.
 * Supports Universal, LangChain, and MCP formats.
 *
 * Key differences from simple tool export:
 * - Uses unified input schema (merged from all operations)
 * - Adds operation enum for agent-driven routing
 * - Aggregates context types from all operations
 * - Uses composite tool's stored description (or generates if missing)
 */

import type {
  UniversalTool,
  UniversalToolParameters,
  UniversalToolProperty,
} from '../../tool-export/tool-export.schemas';
import type {
  LangChainTool,
  LangChainTransformOptions,
} from '../../tool-export/formats/langchain.transformer';
import { transformToLangChainTool } from '../../tool-export/formats/langchain.transformer';
import type {
  MCPTool,
  MCPTransformOptions,
  MCPServerDefinition,
} from '../../tool-export/formats/mcp.transformer';
import {
  transformToMCPTool,
  generateMCPResources,
  generatePackageJson,
  generateClaudeDesktopConfig,
} from '../../tool-export/formats/mcp.transformer';
import type { CompositeToolDetailResponse } from '../composite-tool.schemas';
import {
  generateBasicCompositeToolDescription,
  loadOperationActionData,
} from './composite-tool-description-generator';

// =============================================================================
// Types
// =============================================================================

/**
 * Options for transforming a composite tool
 */
export interface CompositeToolTransformOptions {
  /** Maximum description length (truncate if exceeded) */
  maxDescriptionLength?: number;
  /** Include context types from operations */
  includeContextTypes?: boolean;
  /** Force regenerate description even if stored */
  forceBasicDescription?: boolean;
}

/**
 * Result of transforming a composite tool to universal format
 */
export interface CompositeToolTransformResult {
  success: true;
  tool: UniversalTool;
  contextTypes: string[];
}

/**
 * Failed transformation result
 */
export interface CompositeToolTransformError {
  success: false;
  error: string;
  compositeToolSlug: string;
}

/**
 * Composite tool export response (Universal format)
 */
export interface CompositeToolExportResponse {
  /** Composite tool metadata */
  compositeTool: {
    id: string;
    slug: string;
    name: string;
  };
  /** Exported tool in universal format */
  tool: UniversalTool;
  /** Aggregated context types from all operations */
  contextTypes: string[];
  /** Export format metadata */
  format: {
    name: 'universal';
    version: '1.0';
    compatibleWith: string[];
  };
}

/**
 * LangChain export response for composite tools
 */
export interface CompositeToolLangChainExportResponse {
  /** Composite tool metadata */
  compositeTool: {
    id: string;
    slug: string;
    name: string;
  };
  /** Exported tool in LangChain format */
  tool: LangChainTool;
  /** Aggregated context types */
  contextTypes: string[];
  /** Export format metadata */
  format: {
    name: 'langchain';
    version: '1.0';
    compatibleWith: string[];
  };
  /** Code snippets for integration */
  codeSnippets: {
    typescript: string;
    python: string;
  };
}

/**
 * MCP export response for composite tools
 */
export interface CompositeToolMCPExportResponse {
  /** Composite tool metadata */
  compositeTool: {
    id: string;
    slug: string;
    name: string;
  };
  /** MCP server definition */
  server: MCPServerDefinition;
  /** Export format metadata */
  format: {
    name: 'mcp';
    version: '1.0';
    compatibleWith: string[];
  };
  /** Generated server file content */
  serverFile: {
    typescript: string;
    packageJson: string;
    claudeDesktopConfig: string;
  };
}

// =============================================================================
// Universal Format Transformer
// =============================================================================

/**
 * Generate tool name from composite tool slug.
 * Format: composite_{slug} in snake_case.
 */
export function generateCompositeToolName(slug: string): string {
  // Ensure snake_case by replacing hyphens with underscores
  const normalizedSlug = slug.toLowerCase().replace(/-/g, '_');
  return `composite_${normalizedSlug}`;
}

/**
 * Build Universal tool parameters from composite tool's unified schema.
 * Adds operation enum for agent-driven routing.
 */
export function buildUniversalToolParameters(
  compositeTool: CompositeToolDetailResponse
): UniversalToolParameters {
  const properties: Record<string, UniversalToolProperty> = {};
  const required: string[] = [];

  // Add operation parameter for agent-driven routing
  if (compositeTool.routingMode === 'agent_driven') {
    const operationSlugs = compositeTool.operations.map((op) => op.operationSlug);
    properties['operation'] = {
      type: 'string',
      description: `The operation to execute. Choose based on the task requirements. Available: ${operationSlugs.join(', ')}`,
      enum: operationSlugs,
    };
    required.push('operation');
  }

  // Add parameters from unified input schema
  const unifiedSchema = compositeTool.unifiedInputSchema as {
    parameters?: Record<
      string,
      {
        type?: string;
        description?: string;
        required?: boolean;
        operationMappings?: Record<string, unknown>;
      }
    >;
  };

  if (unifiedSchema?.parameters) {
    for (const [paramName, paramConfig] of Object.entries(unifiedSchema.parameters)) {
      // Map to universal property
      const propertyType = mapSchemaTypeToUniversalType(paramConfig.type || 'string');

      properties[paramName] = {
        type: propertyType,
        description: paramConfig.description || `The ${paramName} parameter`,
      };

      // Track required parameters
      if (paramConfig.required) {
        required.push(paramName);
      }
    }
  }

  // If no parameters defined, create a minimal schema
  if (Object.keys(properties).length === 0) {
    properties['input'] = {
      type: 'string',
      description: 'Input for the composite tool',
    };
  }

  return {
    type: 'object',
    properties,
    required,
  };
}

/**
 * Map JSON Schema type to Universal tool property type.
 */
function mapSchemaTypeToUniversalType(
  schemaType: string
): 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object' {
  switch (schemaType.toLowerCase()) {
    case 'string':
      return 'string';
    case 'number':
      return 'number';
    case 'integer':
      return 'integer';
    case 'boolean':
      return 'boolean';
    case 'array':
      return 'array';
    case 'object':
      return 'object';
    default:
      return 'string';
  }
}

/**
 * Aggregate context types from all operations' actions.
 */
export async function aggregateContextTypes(
  operations: Array<{
    id: string;
    operationSlug: string;
    displayName: string;
    actionId: string;
  }>
): Promise<string[]> {
  const operationData = await loadOperationActionData(operations);
  const contextTypesSet = new Set<string>();

  for (const op of operationData) {
    for (const contextType of op.contextTypes) {
      contextTypesSet.add(contextType);
    }
  }

  return Array.from(contextTypesSet);
}

/**
 * Get description for composite tool.
 * Uses stored description or generates a basic one.
 */
async function getCompositeToolDescription(
  compositeTool: CompositeToolDetailResponse,
  options: CompositeToolTransformOptions
): Promise<string> {
  // Use stored description if available and not forcing basic
  if (compositeTool.toolDescription && !options.forceBasicDescription) {
    return compositeTool.toolDescription;
  }

  // Generate basic description
  const operationData = await loadOperationActionData(
    compositeTool.operations.map((op) => ({
      id: op.id,
      operationSlug: op.operationSlug,
      displayName: op.displayName,
      actionId: op.actionId,
    }))
  );

  const basicDescriptions = generateBasicCompositeToolDescription({
    name: compositeTool.name,
    slug: compositeTool.slug,
    description: compositeTool.description,
    routingMode: compositeTool.routingMode,
    unifiedInputSchema: compositeTool.unifiedInputSchema,
    operations: operationData,
    hasDefaultOperation: !!compositeTool.defaultOperationId,
  });

  return basicDescriptions.toolDescription;
}

/**
 * Transform a composite tool to Universal tool format.
 *
 * @param compositeTool - Composite tool with operations
 * @param options - Transform options
 * @returns Universal tool definition or error
 */
export async function transformCompositeToolToUniversalTool(
  compositeTool: CompositeToolDetailResponse,
  options: CompositeToolTransformOptions = {}
): Promise<CompositeToolTransformResult | CompositeToolTransformError> {
  const { maxDescriptionLength = 2500, includeContextTypes = true } = options;

  try {
    // Generate tool name
    const toolName = generateCompositeToolName(compositeTool.slug);

    // Build parameters from unified schema
    const parameters = buildUniversalToolParameters(compositeTool);

    // Get description
    let description = await getCompositeToolDescription(compositeTool, options);

    // Truncate if needed
    if (description.length > maxDescriptionLength) {
      description = description.substring(0, maxDescriptionLength - 3) + '...';
    }

    // Aggregate context types from operations
    const contextTypes = includeContextTypes
      ? await aggregateContextTypes(
          compositeTool.operations.map((op) => ({
            id: op.id,
            operationSlug: op.operationSlug,
            displayName: op.displayName,
            actionId: op.actionId,
          }))
        )
      : [];

    const tool: UniversalTool = {
      name: toolName,
      description,
      parameters,
      ...(contextTypes.length > 0 ? { contextTypes } : {}),
    };

    return {
      success: true,
      tool,
      contextTypes,
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown transformation error';
    return {
      success: false,
      error: errorMessage,
      compositeToolSlug: compositeTool.slug,
    };
  }
}

/**
 * Create a complete export response for a composite tool.
 */
export async function createCompositeToolExportResponse(
  compositeTool: CompositeToolDetailResponse,
  options: CompositeToolTransformOptions = {}
): Promise<CompositeToolExportResponse> {
  const result = await transformCompositeToolToUniversalTool(compositeTool, options);

  if (!result.success) {
    throw new Error(`Failed to transform composite tool: ${result.error}`);
  }

  return {
    compositeTool: {
      id: compositeTool.id,
      slug: compositeTool.slug,
      name: compositeTool.name,
    },
    tool: result.tool,
    contextTypes: result.contextTypes,
    format: {
      name: 'universal',
      version: '1.0',
      compatibleWith: ['openai', 'anthropic', 'gemini', 'langchain', 'mcp'],
    },
  };
}

// =============================================================================
// LangChain Format Transformer
// =============================================================================

/**
 * Generate TypeScript snippet for composite tool LangChain usage.
 */
function generateCompositeToolTypeScriptSnippet(
  compositeToolSlug: string,
  apiBaseUrl: string
): string {
  return `// LangChain TypeScript Integration for Composite Tool: ${compositeToolSlug}
import { DynamicStructuredTool } from '@langchain/core/tools';

// Fetch composite tool definition from Waygate
const response = await fetch(
  '${apiBaseUrl}/api/v1/composite-tools/${compositeToolSlug}/tools/langchain',
  { headers: { Authorization: \`Bearer \${WAYGATE_API_KEY}\` } }
);
const { tool, contextTypes } = await response.json();

// Create LangChain tool with Waygate invocation
const compositeToolLangChain = new DynamicStructuredTool({
  name: tool.name,
  description: tool.description,
  schema: tool.schema,
  func: async (params) => {
    const result = await fetch('${apiBaseUrl}/api/v1/composite-tools/invoke', {
      method: 'POST',
      headers: {
        Authorization: \`Bearer \${WAYGATE_API_KEY}\`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        tool: '${compositeToolSlug}',
        params,
      }),
    });
    const response = await result.json();

    // Return agent-readable message
    return response.success
      ? \`\${response.message}\\n\\n\${response.nextSteps || ''}\`
      : \`\${response.message}\\n\\n\${response.remediation || ''}\`;
  },
});

// Use with your agent
// agent.tools = [compositeToolLangChain];`;
}

/**
 * Generate Python snippet for composite tool LangChain usage.
 */
function generateCompositeToolPythonSnippet(compositeToolSlug: string, apiBaseUrl: string): string {
  return `# LangChain Python Integration for Composite Tool: ${compositeToolSlug}
import requests
from langchain.tools import StructuredTool

# Fetch composite tool definition from Waygate
response = requests.get(
    "${apiBaseUrl}/api/v1/composite-tools/${compositeToolSlug}/tools/langchain",
    headers={"Authorization": f"Bearer {WAYGATE_API_KEY}"}
)
tool_data = response.json()

def invoke_composite_tool(**kwargs) -> str:
    """Invoke the composite tool via Waygate."""
    result = requests.post(
        "${apiBaseUrl}/api/v1/composite-tools/invoke",
        headers={
            "Authorization": f"Bearer {WAYGATE_API_KEY}",
            "Content-Type": "application/json",
        },
        json={
            "tool": "${compositeToolSlug}",
            "params": kwargs,
        },
    )
    response = result.json()

    # Return agent-readable message
    if response.get("success"):
        return f"{response['message']}\\n\\n{response.get('nextSteps', '')}"
    else:
        return f"{response['message']}\\n\\n{response.get('remediation', '')}"

# Create LangChain tool
composite_tool = StructuredTool.from_function(
    func=invoke_composite_tool,
    name=tool_data["tool"]["name"],
    description=tool_data["tool"]["description"],
)

# Use with your agent
# agent = create_react_agent(llm, [composite_tool], ...)`;
}

/**
 * Transform a composite tool to LangChain format.
 *
 * @param compositeTool - Composite tool with operations
 * @param options - Transform options
 * @returns LangChain export response
 */
export async function transformCompositeToolToLangChain(
  compositeTool: CompositeToolDetailResponse,
  options: LangChainTransformOptions = {}
): Promise<CompositeToolLangChainExportResponse> {
  const { apiBaseUrl = 'https://app.waygate.dev', includeCodeSnippets = true } = options;

  // First transform to universal format
  const universalResult = await transformCompositeToolToUniversalTool(compositeTool);

  if (!universalResult.success) {
    throw new Error(`Failed to transform composite tool: ${universalResult.error}`);
  }

  // Transform universal to LangChain
  const langchainTool = transformToLangChainTool(universalResult.tool);

  return {
    compositeTool: {
      id: compositeTool.id,
      slug: compositeTool.slug,
      name: compositeTool.name,
    },
    tool: langchainTool,
    contextTypes: universalResult.contextTypes,
    format: {
      name: 'langchain',
      version: '1.0',
      compatibleWith: ['langchain-js', 'langchain-python', 'llamaindex'],
    },
    codeSnippets: includeCodeSnippets
      ? {
          typescript: generateCompositeToolTypeScriptSnippet(compositeTool.slug, apiBaseUrl),
          python: generateCompositeToolPythonSnippet(compositeTool.slug, apiBaseUrl),
        }
      : { typescript: '', python: '' },
  };
}

// =============================================================================
// MCP Format Transformer
// =============================================================================

/**
 * Generate MCP server file for a composite tool.
 */
function generateCompositeToolMCPServerFile(
  compositeToolSlug: string,
  compositeToolName: string,
  mcpTool: MCPTool,
  resources: ReturnType<typeof generateMCPResources>,
  apiBaseUrl: string,
  serverVersion: string
): string {
  return `/**
 * MCP Server for Waygate Composite Tool: ${compositeToolName}
 *
 * This server exposes the ${compositeToolName} composite tool as an MCP tool
 * for use with Claude Desktop and other MCP-compatible clients.
 *
 * Generated by Waygate Tool Export
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

// =============================================================================
// Configuration
// =============================================================================

const WAYGATE_API_KEY = process.env.WAYGATE_API_KEY;
const WAYGATE_API_BASE = '${apiBaseUrl}';

if (!WAYGATE_API_KEY) {
  console.error('Error: WAYGATE_API_KEY environment variable is required');
  process.exit(1);
}

// =============================================================================
// Tool Definitions
// =============================================================================

const TOOL = ${JSON.stringify(mcpTool, null, 2)};

// =============================================================================
// Resource Definitions
// =============================================================================

const RESOURCES = ${JSON.stringify(resources, null, 2)};

// Reference data cache
let referenceDataCache: Record<string, unknown> | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// =============================================================================
// API Functions
// =============================================================================

async function invokeCompositeToolAction(
  params: Record<string, unknown>
): Promise<{ success: boolean; message: string; data?: unknown; nextSteps?: string; remediation?: string }> {
  const response = await fetch(\`\${WAYGATE_API_BASE}/api/v1/composite-tools/invoke\`, {
    method: 'POST',
    headers: {
      Authorization: \`Bearer \${WAYGATE_API_KEY}\`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      tool: '${compositeToolSlug}',
      params,
    }),
  });

  if (!response.ok) {
    return {
      success: false,
      message: \`API request failed: \${response.statusText}\`,
      remediation: 'Check your Waygate API key and try again.',
    };
  }

  return response.json();
}

// =============================================================================
// MCP Server
// =============================================================================

const server = new Server(
  {
    name: 'waygate-composite-${compositeToolSlug}',
    version: '${serverVersion}',
  },
  {
    capabilities: {
      tools: {},
      ${resources.length > 0 ? 'resources: {},' : ''}
    },
  }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: [TOOL] };
});

// Handle tool invocation
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name !== TOOL.name) {
    return {
      content: [
        {
          type: 'text',
          text: \`Unknown tool: \${name}. This server only supports: \${TOOL.name}\`,
        },
      ],
      isError: true,
    };
  }

  const result = await invokeCompositeToolAction(args || {});

  // Format response for Claude
  const text = result.success
    ? \`\${result.message}\\n\\n\${result.nextSteps || ''}\`
    : \`\${result.message}\\n\\n\${result.remediation || ''}\`;

  return {
    content: [{ type: 'text', text: text.trim() }],
    isError: !result.success,
  };
});

${
  resources.length > 0
    ? `// List available resources
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  return { resources: RESOURCES };
});

// Read resource content (placeholder - composite tools may need custom implementation)
server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;

  return {
    contents: [
      {
        uri,
        mimeType: 'application/json',
        text: JSON.stringify({ message: 'Resource data would be loaded here' }, null, 2),
      },
    ],
  };
});
`
    : ''
}
// =============================================================================
// Start Server
// =============================================================================

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Waygate ${compositeToolName} MCP server running on stdio');
}

main().catch((error) => {
  console.error('Server error:', error);
  process.exit(1);
});
`;
}

/**
 * Transform a composite tool to MCP format.
 *
 * @param compositeTool - Composite tool with operations
 * @param options - Transform options
 * @returns MCP export response
 */
export async function transformCompositeToolToMCP(
  compositeTool: CompositeToolDetailResponse,
  options: MCPTransformOptions = {}
): Promise<CompositeToolMCPExportResponse> {
  const {
    apiBaseUrl = 'https://app.waygate.dev',
    includeServerFile = true,
    includeResources = true,
    serverVersion = '1.0.0',
  } = options;

  // First transform to universal format
  const universalResult = await transformCompositeToolToUniversalTool(compositeTool);

  if (!universalResult.success) {
    throw new Error(`Failed to transform composite tool: ${universalResult.error}`);
  }

  // Transform universal to MCP
  const mcpTool = transformToMCPTool(universalResult.tool);
  const resources = includeResources
    ? generateMCPResources(`composite-${compositeTool.slug}`, universalResult.contextTypes)
    : [];

  const server: MCPServerDefinition = {
    name: `waygate-composite-${compositeTool.slug}`,
    version: serverVersion,
    capabilities: {
      tools: {},
      ...(resources.length > 0 ? { resources: {} } : {}),
    },
    tools: [mcpTool],
    resources,
  };

  return {
    compositeTool: {
      id: compositeTool.id,
      slug: compositeTool.slug,
      name: compositeTool.name,
    },
    server,
    format: {
      name: 'mcp',
      version: '1.0',
      compatibleWith: ['claude-desktop', 'mcp-client'],
    },
    serverFile: includeServerFile
      ? {
          typescript: generateCompositeToolMCPServerFile(
            compositeTool.slug,
            compositeTool.name,
            mcpTool,
            resources,
            apiBaseUrl,
            serverVersion
          ),
          packageJson: generatePackageJson(compositeTool.slug, compositeTool.name, serverVersion),
          claudeDesktopConfig: generateClaudeDesktopConfig(`composite-${compositeTool.slug}`),
        }
      : { typescript: '', packageJson: '', claudeDesktopConfig: '' },
  };
}
