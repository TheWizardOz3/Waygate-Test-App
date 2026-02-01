/**
 * Composite Tool MCP Export Endpoint
 *
 * GET /api/v1/composite-tools/:id/tools/mcp - Export composite tool in MCP format
 *
 * @route GET /api/v1/composite-tools/:id/tools/mcp
 */

import { NextRequest, NextResponse } from 'next/server';
import { withApiAuth } from '@/lib/api/middleware/auth';
import {
  getCompositeToolDetail,
  transformCompositeToolToMCP,
  CompositeToolError,
} from '@/lib/modules/composite-tools';

/**
 * Extract composite tool ID from URL
 */
function extractCompositeToolId(request: NextRequest): string | null {
  const url = new URL(request.url);
  const pathParts = url.pathname.split('/');
  const compositeToolsIndex = pathParts.indexOf('composite-tools');
  return compositeToolsIndex !== -1 ? pathParts[compositeToolsIndex + 1] : null;
}

/**
 * GET /api/v1/composite-tools/:id/tools/mcp
 *
 * Exports a composite tool in MCP (Model Context Protocol) format.
 *
 * Query Parameters:
 * - `apiBaseUrl` (optional): Base URL for API calls (default: https://app.waygate.dev)
 * - `includeServerFile` (optional): Include generated server file (default: true)
 * - `includeResources` (optional): Include MCP resources (default: true)
 * - `serverVersion` (optional): Server version (default: 1.0.0)
 */
export const GET = withApiAuth(async (request: NextRequest, { tenant }) => {
  try {
    const compositeToolId = extractCompositeToolId(request);

    if (!compositeToolId) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_REQUEST',
            message: 'Composite tool ID is required',
            suggestedResolution: {
              action: 'RETRY_WITH_MODIFIED_INPUT',
              description: 'Include a valid composite tool ID in the URL path.',
              retryable: false,
            },
          },
        },
        { status: 400 }
      );
    }

    // Parse query parameters
    const url = new URL(request.url);
    const options = {
      apiBaseUrl: url.searchParams.get('apiBaseUrl') || undefined,
      includeServerFile: url.searchParams.get('includeServerFile') !== 'false',
      includeResources: url.searchParams.get('includeResources') !== 'false',
      serverVersion: url.searchParams.get('serverVersion') || undefined,
    };

    // Get composite tool with relations
    const compositeTool = await getCompositeToolDetail(tenant.id, compositeToolId);

    // Export to MCP format
    const exportResponse = await transformCompositeToolToMCP(compositeTool, options);

    // Return with cache headers (5 minute cache)
    return NextResponse.json(
      {
        success: true,
        data: exportResponse,
      },
      {
        status: 200,
        headers: {
          'Cache-Control': 'public, max-age=300',
        },
      }
    );
  } catch (error) {
    if (error instanceof CompositeToolError) {
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

    console.error('[COMPOSITE_TOOL_EXPORT_MCP] Error:', error);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message:
            error instanceof Error ? error.message : 'An error occurred exporting composite tool',
          suggestedResolution: {
            action: 'ESCALATE_TO_ADMIN',
            description: 'An internal error occurred. Please try again or contact support.',
            retryable: true,
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
    case 'COMPOSITE_TOOL_NOT_FOUND':
      return 'The specified composite tool was not found.';
    case 'COMPOSITE_TOOL_DISABLED':
      return 'This composite tool is currently disabled.';
    default:
      return 'An error occurred while exporting the composite tool.';
  }
}
