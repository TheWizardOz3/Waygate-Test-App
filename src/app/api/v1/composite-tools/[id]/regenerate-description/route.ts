/**
 * Composite Tool Regenerate Description Endpoint
 *
 * POST /api/v1/composite-tools/:id/regenerate-description - Regenerate tool description using LLM
 *
 * @route POST /api/v1/composite-tools/:id/regenerate-description
 */

import { NextRequest, NextResponse } from 'next/server';
import { withApiAuth } from '@/lib/api/middleware/auth';
import {
  regenerateCompositeToolDescription,
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
 * POST /api/v1/composite-tools/:id/regenerate-description
 *
 * Regenerates the LLM-optimized description for a composite tool.
 * Aggregates information from all sub-operations to generate:
 * - A unified toolDescription in mini-prompt format
 * - A toolSuccessTemplate for formatting successful responses
 * - A toolErrorTemplate for formatting error responses
 *
 * Query Parameters:
 * - `useFallback` (optional): Use basic generation on LLM failure (default: true)
 */
export const POST = withApiAuth(async (request: NextRequest, { tenant }) => {
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
    const useFallback = url.searchParams.get('useFallback') !== 'false';

    // Regenerate the description
    const updatedTool = await regenerateCompositeToolDescription(
      tenant.id,
      compositeToolId,
      useFallback
    );

    return NextResponse.json(
      {
        success: true,
        data: {
          compositeTool: updatedTool,
          regenerated: {
            toolDescription: updatedTool.toolDescription,
            toolSuccessTemplate: updatedTool.toolSuccessTemplate,
            toolErrorTemplate: updatedTool.toolErrorTemplate,
          },
        },
        message: 'Tool description regenerated successfully',
      },
      { status: 200 }
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
              retryable: error.statusCode >= 500,
            },
          },
        },
        { status: error.statusCode }
      );
    }

    console.error('[COMPOSITE_TOOL_REGENERATE_DESCRIPTION] Error:', error);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message:
            error instanceof Error ? error.message : 'An error occurred regenerating description',
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
      return 'An error occurred while regenerating the tool description.';
  }
}
