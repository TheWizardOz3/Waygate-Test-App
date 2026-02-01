/**
 * Composite Tool LangChain Export Endpoint
 *
 * GET /api/v1/composite-tools/:id/tools/langchain - Export composite tool in LangChain format
 *
 * @route GET /api/v1/composite-tools/:id/tools/langchain
 */

import { NextRequest, NextResponse } from 'next/server';
import { withApiAuth } from '@/lib/api/middleware/auth';
import {
  getCompositeToolDetail,
  transformCompositeToolToLangChain,
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
 * GET /api/v1/composite-tools/:id/tools/langchain
 *
 * Exports a composite tool in LangChain format.
 *
 * Query Parameters:
 * - `apiBaseUrl` (optional): Base URL for API calls in code snippets (default: https://app.waygate.dev)
 * - `includeCodeSnippets` (optional): Include TypeScript/Python code snippets (default: true)
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
      includeCodeSnippets: url.searchParams.get('includeCodeSnippets') !== 'false',
    };

    // Get composite tool with relations
    const compositeTool = await getCompositeToolDetail(tenant.id, compositeToolId);

    // Export to LangChain format
    const exportResponse = await transformCompositeToolToLangChain(compositeTool, options);

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

    console.error('[COMPOSITE_TOOL_EXPORT_LANGCHAIN] Error:', error);

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
