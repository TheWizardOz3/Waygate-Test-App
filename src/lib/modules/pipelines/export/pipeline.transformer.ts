/**
 * Pipeline Transformer
 *
 * Transforms pipelines into exportable tool definitions.
 * Supports Universal, LangChain, and MCP formats.
 *
 * Key characteristics of pipeline tool export:
 * - Exposed as single tools — internal step complexity is hidden
 * - Uses pipeline input schema for parameters
 * - Uses AI-generated or custom tool descriptions
 * - No step details visible to parent agent
 *
 * Follows the same patterns as agentic-tools/export/agentic-tool.transformer.ts
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
  generatePackageJson,
  generateClaudeDesktopConfig,
} from '../../tool-export/formats/mcp.transformer';
import type { PipelineResponse } from '../pipeline.schemas';

// =============================================================================
// Types
// =============================================================================

/**
 * Options for transforming a pipeline
 */
export interface PipelineTransformOptions {
  /** Maximum description length (truncate if exceeded) */
  maxDescriptionLength?: number;
  /** Force regenerate description even if stored */
  forceRegenerateDescription?: boolean;
}

/**
 * Result of transforming a pipeline to universal format
 */
export interface PipelineTransformResult {
  success: true;
  tool: UniversalTool;
}

/**
 * Failed transformation result
 */
export interface PipelineTransformError {
  success: false;
  error: string;
  pipelineSlug: string;
}

/**
 * Pipeline export response (Universal format)
 */
export interface PipelineExportResponse {
  /** Pipeline metadata */
  pipeline: {
    id: string;
    slug: string;
    name: string;
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
 * LangChain export response for pipelines
 */
export interface PipelineLangChainExportResponse {
  /** Pipeline metadata */
  pipeline: {
    id: string;
    slug: string;
    name: string;
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
 * MCP export response for pipelines
 */
export interface PipelineMCPExportResponse {
  /** Pipeline metadata */
  pipeline: {
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
 * Generate tool name from pipeline slug.
 * Format: pipeline_{slug} in snake_case.
 */
export function generatePipelineToolName(slug: string): string {
  const normalizedSlug = slug.toLowerCase().replace(/-/g, '_');
  return `pipeline_${normalizedSlug}`;
}

/**
 * Build Universal tool parameters from pipeline input schema.
 */
export function buildUniversalToolParameters(pipeline: PipelineResponse): UniversalToolParameters {
  const inputSchema = pipeline.inputSchema;

  if (inputSchema && typeof inputSchema === 'object' && Object.keys(inputSchema).length > 0) {
    // Check if it already has the right structure
    const typed = inputSchema as {
      type?: string;
      properties?: Record<string, unknown>;
      required?: string[];
    };

    if (typed.type === 'object' && typed.properties) {
      return inputSchema as UniversalToolParameters;
    }

    // If it has properties but no type wrapper, wrap it
    if (typed.properties) {
      return {
        type: 'object',
        properties: transformInputSchemaProperties(typed.properties),
        required: typed.required ?? [],
      };
    }
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
 * Transform input schema properties to UniversalToolProperty format
 */
function transformInputSchemaProperties(
  properties: Record<string, unknown>
): Record<string, UniversalToolProperty> {
  const result: Record<string, UniversalToolProperty> = {};

  for (const [key, value] of Object.entries(properties)) {
    const prop = value as {
      type?: string;
      description?: string;
      enum?: (string | number | boolean)[];
      default?: unknown;
    };

    result[key] = {
      type: (prop.type as UniversalToolProperty['type']) || 'string',
      description: prop.description || key,
      ...(prop.enum ? { enum: prop.enum } : {}),
      ...(prop.default !== undefined ? { default: prop.default } : {}),
    };
  }

  return result;
}

/**
 * Get description for pipeline tool.
 * Uses stored description or generates a basic one.
 */
function getPipelineToolDescription(
  pipeline: PipelineResponse,
  options: PipelineTransformOptions
): string {
  // Use stored description if available and not forcing regeneration
  if (pipeline.toolDescription && !options.forceRegenerateDescription) {
    return pipeline.toolDescription;
  }

  // Generate basic description
  const baseDescription = pipeline.description || pipeline.name;
  return (
    `Use this tool to ${baseDescription.charAt(0).toLowerCase()}${baseDescription.slice(1).replace(/\.$/, '')}.\n\n` +
    'Provide the required inputs and the tool will handle the operation and return the result.'
  );
}

/**
 * Transform a pipeline to Universal tool format.
 *
 * @param pipeline - Pipeline configuration
 * @param options - Transform options
 * @returns Universal tool definition or error
 */
export function transformPipelineToUniversalTool(
  pipeline: PipelineResponse,
  options: PipelineTransformOptions = {}
): PipelineTransformResult | PipelineTransformError {
  const { maxDescriptionLength = 2500 } = options;

  try {
    const toolName = generatePipelineToolName(pipeline.slug);
    const parameters = buildUniversalToolParameters(pipeline);

    let description = getPipelineToolDescription(pipeline, options);
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
      pipelineSlug: pipeline.slug,
    };
  }
}

/**
 * Create a complete export response for a pipeline.
 */
export function createPipelineExportResponse(
  pipeline: PipelineResponse,
  options: PipelineTransformOptions = {}
): PipelineExportResponse {
  const result = transformPipelineToUniversalTool(pipeline, options);

  if (!result.success) {
    throw new Error(`Failed to transform pipeline: ${result.error}`);
  }

  return {
    pipeline: {
      id: pipeline.id,
      slug: pipeline.slug,
      name: pipeline.name,
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
 * Generate TypeScript snippet for pipeline LangChain usage.
 */
function generatePipelineTypeScriptSnippet(pipelineSlug: string, apiBaseUrl: string): string {
  return `// LangChain TypeScript Integration for Pipeline: ${pipelineSlug}
import { DynamicStructuredTool } from '@langchain/core/tools';

// Fetch pipeline tool definition from Waygate
const response = await fetch(
  '${apiBaseUrl}/api/v1/pipelines/${pipelineSlug}/tools/langchain',
  { headers: { Authorization: \`Bearer \${WAYGATE_API_KEY}\` } }
);
const { tool } = await response.json();

// Create LangChain tool with Waygate invocation
const pipelineToolLangChain = new DynamicStructuredTool({
  name: tool.name,
  description: tool.description,
  schema: tool.schema,
  func: async (params) => {
    const result = await fetch('${apiBaseUrl}/api/v1/pipelines/invoke', {
      method: 'POST',
      headers: {
        Authorization: \`Bearer \${WAYGATE_API_KEY}\`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        pipeline: '${pipelineSlug}',
        params,
      }),
    });
    const response = await result.json();

    // Return formatted result
    return response.success
      ? \`\${response.message}\\n\\n\${response.nextSteps}\`
      : \`\${response.message}\\n\\n\${response.remediation}\`;
  },
});

// Use with your agent
// agent.tools = [pipelineToolLangChain];`;
}

/**
 * Generate Python snippet for pipeline LangChain usage.
 */
function generatePipelinePythonSnippet(pipelineSlug: string, apiBaseUrl: string): string {
  return `# LangChain Python Integration for Pipeline: ${pipelineSlug}
import requests
from langchain.tools import StructuredTool

# Fetch pipeline tool definition from Waygate
response = requests.get(
    "${apiBaseUrl}/api/v1/pipelines/${pipelineSlug}/tools/langchain",
    headers={"Authorization": f"Bearer {WAYGATE_API_KEY}"}
)
tool_data = response.json()

def invoke_pipeline(**kwargs) -> str:
    """Invoke the pipeline via Waygate."""
    result = requests.post(
        "${apiBaseUrl}/api/v1/pipelines/invoke",
        headers={
            "Authorization": f"Bearer {WAYGATE_API_KEY}",
            "Content-Type": "application/json",
        },
        json={
            "pipeline": "${pipelineSlug}",
            "params": kwargs,
        },
    )
    response = result.json()

    # Return formatted result
    if response.get("success"):
        return f"{response['message']}\\n\\n{response['nextSteps']}"
    else:
        return f"{response['message']}\\n\\n{response['remediation']}"

# Create LangChain tool
pipeline_tool = StructuredTool.from_function(
    func=invoke_pipeline,
    name=tool_data["tool"]["name"],
    description=tool_data["tool"]["description"],
)

# Use with your agent
# agent = create_react_agent(llm, [pipeline_tool], ...)`;
}

/**
 * Transform a pipeline to LangChain format.
 *
 * @param pipeline - Pipeline configuration
 * @param options - Transform options
 * @returns LangChain export response
 */
export function transformPipelineToLangChain(
  pipeline: PipelineResponse,
  options: LangChainTransformOptions = {}
): PipelineLangChainExportResponse {
  const { apiBaseUrl = 'https://app.waygate.dev', includeCodeSnippets = true } = options;

  // First transform to universal format
  const universalResult = transformPipelineToUniversalTool(pipeline);

  if (!universalResult.success) {
    throw new Error(`Failed to transform pipeline: ${universalResult.error}`);
  }

  // Transform universal to LangChain
  const langchainTool = transformToLangChainTool(universalResult.tool);

  return {
    pipeline: {
      id: pipeline.id,
      slug: pipeline.slug,
      name: pipeline.name,
    },
    tool: langchainTool,
    format: {
      name: 'langchain',
      version: '1.0',
      compatibleWith: ['langchain-js', 'langchain-python', 'llamaindex'],
    },
    codeSnippets: includeCodeSnippets
      ? {
          typescript: generatePipelineTypeScriptSnippet(pipeline.slug, apiBaseUrl),
          python: generatePipelinePythonSnippet(pipeline.slug, apiBaseUrl),
        }
      : { typescript: '', python: '' },
  };
}

// =============================================================================
// MCP Format Transformer
// =============================================================================

/**
 * Generate MCP server file for a pipeline.
 */
function generatePipelineMCPServerFile(
  pipelineSlug: string,
  pipelineName: string,
  mcpTool: MCPTool,
  apiBaseUrl: string,
  serverVersion: string
): string {
  return `/**
 * MCP Server for Waygate Pipeline: ${pipelineName}
 *
 * This server exposes the ${pipelineName} pipeline as an MCP tool
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

async function invokePipeline(
  params: Record<string, unknown>
): Promise<{ success: boolean; data?: unknown; message?: string; error?: { message: string } }> {
  const response = await fetch(\`\${WAYGATE_API_BASE}/api/v1/pipelines/invoke\`, {
    method: 'POST',
    headers: {
      Authorization: \`Bearer \${WAYGATE_API_KEY}\`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      pipeline: '${pipelineSlug}',
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
    name: 'waygate-pipeline-${pipelineSlug}',
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

  const result = await invokePipeline(args || {});

  // Format response for Claude
  const text = result.success
    ? result.message || JSON.stringify(result.data, null, 2)
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
  console.error('Waygate ${pipelineName} MCP server running on stdio');
}

main().catch((error) => {
  console.error('Server error:', error);
  process.exit(1);
});
`;
}

/**
 * Transform a pipeline to MCP format.
 *
 * @param pipeline - Pipeline configuration
 * @param options - Transform options
 * @returns MCP export response
 */
export function transformPipelineToMCP(
  pipeline: PipelineResponse,
  options: MCPTransformOptions = {}
): PipelineMCPExportResponse {
  const {
    apiBaseUrl = 'https://app.waygate.dev',
    includeServerFile = true,
    serverVersion = '1.0.0',
  } = options;

  // First transform to universal format
  const universalResult = transformPipelineToUniversalTool(pipeline);

  if (!universalResult.success) {
    throw new Error(`Failed to transform pipeline: ${universalResult.error}`);
  }

  // Transform universal to MCP
  const mcpTool = transformToMCPTool(universalResult.tool);

  const server: MCPServerDefinition = {
    name: `waygate-pipeline-${pipeline.slug}`,
    version: serverVersion,
    capabilities: {
      tools: {},
    },
    tools: [mcpTool],
    resources: [], // Pipelines don't expose resources directly
  };

  return {
    pipeline: {
      id: pipeline.id,
      slug: pipeline.slug,
      name: pipeline.name,
    },
    server,
    format: {
      name: 'mcp',
      version: '1.0',
      compatibleWith: ['claude-desktop', 'mcp-client'],
    },
    serverFile: includeServerFile
      ? {
          typescript: generatePipelineMCPServerFile(
            pipeline.slug,
            pipeline.name,
            mcpTool,
            apiBaseUrl,
            serverVersion
          ),
          packageJson: generatePackageJson(pipeline.slug, pipeline.name, serverVersion),
          claudeDesktopConfig: generateClaudeDesktopConfig(`pipeline-${pipeline.slug}`),
        }
      : { typescript: '', packageJson: '', claudeDesktopConfig: '' },
  };
}
