/**
 * Agentic Tool MCP Export Endpoint
 *
 * GET /api/v1/agentic-tools/:id/tools/mcp - Export as MCP tool
 *
 * @route GET /api/v1/agentic-tools/:id/tools/mcp
 */

import { NextRequest, NextResponse } from 'next/server';
import { withApiAuth } from '@/lib/api/middleware/auth';
import {
  getAgenticToolById,
  AgenticToolError,
  transformAgenticToolToMCP,
} from '@/lib/modules/agentic-tools';

/**
 * Extract agentic tool ID from URL
 */
function extractAgenticToolId(request: NextRequest): string | null {
  const url = new URL(request.url);
  const pathParts = url.pathname.split('/');
  const agenticToolsIndex = pathParts.indexOf('agentic-tools');
  return agenticToolsIndex !== -1 ? pathParts[agenticToolsIndex + 1] : null;
}

/**
 * GET /api/v1/agentic-tools/:id/tools/mcp
 *
 * Exports the agentic tool in Model Context Protocol (MCP) format.
 * MCP is Anthropic's standard for tool integration.
 *
 * Response:
 * - `name`: Tool name
 * - `description`: Tool description
 * - `inputSchema`: JSON Schema for input parameters
 * - `mcpConfig`: MCP-specific configuration
 */
export const GET = withApiAuth(async (request: NextRequest, { tenant }) => {
  try {
    const agenticToolId = extractAgenticToolId(request);

    if (!agenticToolId) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_REQUEST',
            message: 'Agentic tool ID is required',
            suggestedResolution: {
              action: 'RETRY_WITH_MODIFIED_INPUT',
              description: 'Include a valid agentic tool ID in the URL path.',
              retryable: false,
            },
          },
        },
        { status: 400 }
      );
    }

    // Get the agentic tool
    const agenticTool = await getAgenticToolById(agenticToolId, tenant.id);

    // Transform to MCP format
    const mcpTool = transformAgenticToolToMCP(agenticTool, {
      apiBaseUrl: process.env.NEXT_PUBLIC_API_BASE_URL || 'https://api.waygate.ai',
    });

    return NextResponse.json(
      {
        success: true,
        data: mcpTool,
      },
      { status: 200 }
    );
  } catch (error) {
    if (error instanceof AgenticToolError) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: error.code,
            message: error.message,
            suggestedResolution: {
              action: 'RETRY_WITH_MODIFIED_INPUT',
              description: getErrorDescription(error.code),
              retryable: false,
            },
          },
        },
        { status: error.statusCode }
      );
    }

    console.error('[AGENTIC_TOOL_EXPORT_MCP] Error:', error);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message:
            error instanceof Error ? error.message : 'An error occurred exporting agentic tool',
          suggestedResolution: {
            action: 'ESCALATE_TO_ADMIN',
            description: 'An internal error occurred. Please try again or contact support.',
            retryable: false,
          },
        },
      },
      { status: 500 }
    );
  }
});

/**
 * Get human-readable error description
 */
function getErrorDescription(code: string): string {
  switch (code) {
    case 'AGENTIC_TOOL_NOT_FOUND':
      return 'The specified agentic tool was not found.';
    case 'AGENTIC_TOOL_DISABLED':
      return 'This agentic tool is currently disabled.';
    default:
      return 'An error occurred while exporting the agentic tool.';
  }
}
