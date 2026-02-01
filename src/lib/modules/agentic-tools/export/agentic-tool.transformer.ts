/**
 * Agentic Tool Transformer
 *
 * Transforms agentic tools into exportable tool definitions.
 * Supports Universal, LangChain, and MCP formats.
 *
 * Key characteristics of agentic tool export:
 * - Exposed as simple tools with natural language input
 * - Embedded LLM complexity is hidden from parent agent
 * - Uses AI-generated or custom tool descriptions
 * - No operation routing (handled internally by embedded LLM)
 */

import type { UniversalTool, UniversalToolParameters } from '../../tool-export/tool-export.schemas';
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
  generatePackageJson,
  generateClaudeDesktopConfig,
} from '../../tool-export/formats/mcp.transformer';
import type { AgenticToolResponse } from '../agentic-tool.schemas';

// =============================================================================
// Types
// =============================================================================

/**
 * Options for transforming an agentic tool
 */
export interface AgenticToolTransformOptions {
  /** Maximum description length (truncate if exceeded) */
  maxDescriptionLength?: number;
  /** Force regenerate description even if stored */
  forceRegenerateDescription?: boolean;
}

/**
 * Result of transforming an agentic tool to universal format
 */
export interface AgenticToolTransformResult {
  success: true;
  tool: UniversalTool;
}

/**
 * Failed transformation result
 */
export interface AgenticToolTransformError {
  success: false;
  error: string;
  agenticToolSlug: string;
}

/**
 * Agentic tool export response (Universal format)
 */
export interface AgenticToolExportResponse {
  /** Agentic tool metadata */
  agenticTool: {
    id: string;
    slug: string;
    name: string;
    executionMode: 'parameter_interpreter' | 'autonomous_agent';
  };
  /** Exported tool in universal format */
  tool: UniversalTool;
  /** Export format metadata */
  format: {
    name: 'universal';
    version: '1.0';
    compatibleWith: string[];
  };
}

/**
 * LangChain export response for agentic tools
 */
export interface AgenticToolLangChainExportResponse {
  /** Agentic tool metadata */
  agenticTool: {
    id: string;
    slug: string;
    name: string;
    executionMode: 'parameter_interpreter' | 'autonomous_agent';
  };
  /** Exported tool in LangChain format */
  tool: LangChainTool;
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
 * MCP export response for agentic tools
 */
export interface AgenticToolMCPExportResponse {
  /** Agentic tool metadata */
  agenticTool: {
    id: string;
    slug: string;
    name: string;
    executionMode: 'parameter_interpreter' | 'autonomous_agent';
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
 * Generate tool name from agentic tool slug.
 * Format: agentic_{slug} in snake_case.
 */
export function generateAgenticToolName(slug: string): string {
  // Ensure snake_case by replacing hyphens with underscores
  const normalizedSlug = slug.toLowerCase().replace(/-/g, '_');
  return `agentic_${normalizedSlug}`;
}

/**
 * Build Universal tool parameters for agentic tools.
 * Agentic tools accept natural language input via a 'task' parameter.
 */
export function buildUniversalToolParameters(
  agenticTool: AgenticToolResponse
): UniversalToolParameters {
  // Check if custom input schema is defined
  const inputSchema = agenticTool.inputSchema as Record<string, unknown> | undefined;

  if (inputSchema && Object.keys(inputSchema).length > 0) {
    // Use custom input schema if provided
    return inputSchema as UniversalToolParameters;
  }

  // Default: natural language task parameter
  return {
    type: 'object',
    properties: {
      task: {
        type: 'string',
        description:
          'Natural language description of the task to perform. Be specific and include all relevant details.',
      },
    },
    required: ['task'],
  };
}

/**
 * Get description for agentic tool.
 * Uses stored description or generates a basic one.
 */
function getAgenticToolDescription(
  agenticTool: AgenticToolResponse,
  options: AgenticToolTransformOptions
): string {
  // Use stored description if available and not forcing regeneration
  if (agenticTool.toolDescription && !options.forceRegenerateDescription) {
    return agenticTool.toolDescription;
  }

  // Generate basic description based on execution mode
  const modeDescription =
    agenticTool.executionMode === 'parameter_interpreter'
      ? 'This tool uses an embedded LLM to interpret your request and generate precise parameters for execution.'
      : 'This tool uses an autonomous agent that selects and executes multiple tools to accomplish your goal.';

  return `${agenticTool.description || agenticTool.name}\n\n${modeDescription}\n\nProvide a clear, natural language description of what you want to accomplish.`;
}

/**
 * Transform an agentic tool to Universal tool format.
 *
 * @param agenticTool - Agentic tool configuration
 * @param options - Transform options
 * @returns Universal tool definition or error
 */
export function transformAgenticToolToUniversalTool(
  agenticTool: AgenticToolResponse,
  options: AgenticToolTransformOptions = {}
): AgenticToolTransformResult | AgenticToolTransformError {
  const { maxDescriptionLength = 2500 } = options;

  try {
    // Generate tool name
    const toolName = generateAgenticToolName(agenticTool.slug);

    // Build parameters
    const parameters = buildUniversalToolParameters(agenticTool);

    // Get description
    let description = getAgenticToolDescription(agenticTool, options);

    // Truncate if needed
    if (description.length > maxDescriptionLength) {
      description = description.substring(0, maxDescriptionLength - 3) + '...';
    }

    const tool: UniversalTool = {
      name: toolName,
      description,
      parameters,
    };

    return {
      success: true,
      tool,
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown transformation error';
    return {
      success: false,
      error: errorMessage,
      agenticToolSlug: agenticTool.slug,
    };
  }
}

/**
 * Create a complete export response for an agentic tool.
 */
export function createAgenticToolExportResponse(
  agenticTool: AgenticToolResponse,
  options: AgenticToolTransformOptions = {}
): AgenticToolExportResponse {
  const result = transformAgenticToolToUniversalTool(agenticTool, options);

  if (!result.success) {
    throw new Error(`Failed to transform agentic tool: ${result.error}`);
  }

  return {
    agenticTool: {
      id: agenticTool.id,
      slug: agenticTool.slug,
      name: agenticTool.name,
      executionMode: agenticTool.executionMode,
    },
    tool: result.tool,
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
 * Generate TypeScript snippet for agentic tool LangChain usage.
 */
function generateAgenticToolTypeScriptSnippet(agenticToolSlug: string, apiBaseUrl: string): string {
  return `// LangChain TypeScript Integration for Agentic Tool: ${agenticToolSlug}
import { DynamicStructuredTool } from '@langchain/core/tools';

// Fetch agentic tool definition from Waygate
const response = await fetch(
  '${apiBaseUrl}/api/v1/agentic-tools/${agenticToolSlug}/tools/langchain',
  { headers: { Authorization: \`Bearer \${WAYGATE_API_KEY}\` } }
);
const { tool } = await response.json();

// Create LangChain tool with Waygate invocation
const agenticToolLangChain = new DynamicStructuredTool({
  name: tool.name,
  description: tool.description,
  schema: tool.schema,
  func: async (params) => {
    const result = await fetch('${apiBaseUrl}/api/v1/agentic-tools/invoke', {
      method: 'POST',
      headers: {
        Authorization: \`Bearer \${WAYGATE_API_KEY}\`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        tool: '${agenticToolSlug}',
        params,
      }),
    });
    const response = await result.json();

    // Return result with metadata
    return response.success
      ? JSON.stringify(response.data)
      : \`Error: \${response.error?.message}\`;
  },
});

// Use with your agent
// agent.tools = [agenticToolLangChain];`;
}

/**
 * Generate Python snippet for agentic tool LangChain usage.
 */
function generateAgenticToolPythonSnippet(agenticToolSlug: string, apiBaseUrl: string): string {
  return `# LangChain Python Integration for Agentic Tool: ${agenticToolSlug}
import requests
from langchain.tools import StructuredTool

# Fetch agentic tool definition from Waygate
response = requests.get(
    "${apiBaseUrl}/api/v1/agentic-tools/${agenticToolSlug}/tools/langchain",
    headers={"Authorization": f"Bearer {WAYGATE_API_KEY}"}
)
tool_data = response.json()

def invoke_agentic_tool(**kwargs) -> str:
    """Invoke the agentic tool via Waygate."""
    result = requests.post(
        "${apiBaseUrl}/api/v1/agentic-tools/invoke",
        headers={
            "Authorization": f"Bearer {WAYGATE_API_KEY}",
            "Content-Type": "application/json",
        },
        json={
            "tool": "${agenticToolSlug}",
            "params": kwargs,
        },
    )
    response = result.json()

    # Return result with metadata
    if response.get("success"):
        return str(response.get("data"))
    else:
        return f"Error: {response.get('error', {}).get('message')}"

# Create LangChain tool
agentic_tool = StructuredTool.from_function(
    func=invoke_agentic_tool,
    name=tool_data["tool"]["name"],
    description=tool_data["tool"]["description"],
)

# Use with your agent
# agent = create_react_agent(llm, [agentic_tool], ...)`;
}

/**
 * Transform an agentic tool to LangChain format.
 *
 * @param agenticTool - Agentic tool configuration
 * @param options - Transform options
 * @returns LangChain export response
 */
export function transformAgenticToolToLangChain(
  agenticTool: AgenticToolResponse,
  options: LangChainTransformOptions = {}
): AgenticToolLangChainExportResponse {
  const { apiBaseUrl = 'https://app.waygate.dev', includeCodeSnippets = true } = options;

  // First transform to universal format
  const universalResult = transformAgenticToolToUniversalTool(agenticTool);

  if (!universalResult.success) {
    throw new Error(`Failed to transform agentic tool: ${universalResult.error}`);
  }

  // Transform universal to LangChain
  const langchainTool = transformToLangChainTool(universalResult.tool);

  return {
    agenticTool: {
      id: agenticTool.id,
      slug: agenticTool.slug,
      name: agenticTool.name,
      executionMode: agenticTool.executionMode,
    },
    tool: langchainTool,
    format: {
      name: 'langchain',
      version: '1.0',
      compatibleWith: ['langchain-js', 'langchain-python', 'llamaindex'],
    },
    codeSnippets: includeCodeSnippets
      ? {
          typescript: generateAgenticToolTypeScriptSnippet(agenticTool.slug, apiBaseUrl),
          python: generateAgenticToolPythonSnippet(agenticTool.slug, apiBaseUrl),
        }
      : { typescript: '', python: '' },
  };
}

// =============================================================================
// MCP Format Transformer
// =============================================================================

/**
 * Generate MCP server file for an agentic tool.
 */
function generateAgenticToolMCPServerFile(
  agenticToolSlug: string,
  agenticToolName: string,
  mcpTool: MCPTool,
  apiBaseUrl: string,
  serverVersion: string
): string {
  return `/**
 * MCP Server for Waygate Agentic Tool: ${agenticToolName}
 *
 * This server exposes the ${agenticToolName} agentic tool as an MCP tool
 * for use with Claude Desktop and other MCP-compatible clients.
 *
 * Generated by Waygate Tool Export
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
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
// Tool Definition
// =============================================================================

const TOOL = ${JSON.stringify(mcpTool, null, 2)};

// =============================================================================
// API Functions
// =============================================================================

async function invokeAgenticTool(
  params: Record<string, unknown>
): Promise<{ success: boolean; data?: unknown; error?: { message: string } }> {
  const response = await fetch(\`\${WAYGATE_API_BASE}/api/v1/agentic-tools/invoke\`, {
    method: 'POST',
    headers: {
      Authorization: \`Bearer \${WAYGATE_API_KEY}\`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      tool: '${agenticToolSlug}',
      params,
    }),
  });

  if (!response.ok) {
    return {
      success: false,
      error: { message: \`API request failed: \${response.statusText}\` },
    };
  }

  return response.json();
}

// =============================================================================
// MCP Server
// =============================================================================

const server = new Server(
  {
    name: 'waygate-agentic-${agenticToolSlug}',
    version: '${serverVersion}',
  },
  {
    capabilities: {
      tools: {},
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

  const result = await invokeAgenticTool(args || {});

  // Format response for Claude
  const text = result.success
    ? JSON.stringify(result.data, null, 2)
    : \`Error: \${result.error?.message || 'Unknown error'}\`;

  return {
    content: [{ type: 'text', text }],
    isError: !result.success,
  };
});

// =============================================================================
// Start Server
// =============================================================================

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Waygate ${agenticToolName} MCP server running on stdio');
}

main().catch((error) => {
  console.error('Server error:', error);
  process.exit(1);
});
`;
}

/**
 * Transform an agentic tool to MCP format.
 *
 * @param agenticTool - Agentic tool configuration
 * @param options - Transform options
 * @returns MCP export response
 */
export function transformAgenticToolToMCP(
  agenticTool: AgenticToolResponse,
  options: MCPTransformOptions = {}
): AgenticToolMCPExportResponse {
  const {
    apiBaseUrl = 'https://app.waygate.dev',
    includeServerFile = true,
    serverVersion = '1.0.0',
  } = options;

  // First transform to universal format
  const universalResult = transformAgenticToolToUniversalTool(agenticTool);

  if (!universalResult.success) {
    throw new Error(`Failed to transform agentic tool: ${universalResult.error}`);
  }

  // Transform universal to MCP
  const mcpTool = transformToMCPTool(universalResult.tool);

  const server: MCPServerDefinition = {
    name: `waygate-agentic-${agenticTool.slug}`,
    version: serverVersion,
    capabilities: {
      tools: {},
    },
    tools: [mcpTool],
    resources: [], // Agentic tools don't expose resources directly
  };

  return {
    agenticTool: {
      id: agenticTool.id,
      slug: agenticTool.slug,
      name: agenticTool.name,
      executionMode: agenticTool.executionMode,
    },
    server,
    format: {
      name: 'mcp',
      version: '1.0',
      compatibleWith: ['claude-desktop', 'mcp-client'],
    },
    serverFile: includeServerFile
      ? {
          typescript: generateAgenticToolMCPServerFile(
            agenticTool.slug,
            agenticTool.name,
            mcpTool,
            apiBaseUrl,
            serverVersion
          ),
          packageJson: generatePackageJson(agenticTool.slug, agenticTool.name, serverVersion),
          claudeDesktopConfig: generateClaudeDesktopConfig(`agentic-${agenticTool.slug}`),
        }
      : { typescript: '', packageJson: '', claudeDesktopConfig: '' },
  };
}
