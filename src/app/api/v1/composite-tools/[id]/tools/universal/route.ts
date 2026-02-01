/**
 * Composite Tool Universal Export Endpoint
 *
 * GET /api/v1/composite-tools/:id/tools/universal - Export composite tool in Universal format
 *
 * @route GET /api/v1/composite-tools/:id/tools/universal
 */

import { NextRequest, NextResponse } from 'next/server';
import { withApiAuth } from '@/lib/api/middleware/auth';
import {
  getCompositeToolDetail,
  createCompositeToolExportResponse,
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
 * GET /api/v1/composite-tools/:id/tools/universal
 *
 * Exports a composite tool in Universal (LLM-agnostic) format.
 *
 * Query Parameters:
 * - `maxDescriptionLength` (optional): Maximum description length (default: 2500)
 * - `includeContextTypes` (optional): Include context types (default: true)
 * - `forceBasicDescription` (optional): Force basic description generation (default: false)
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
      maxDescriptionLength: url.searchParams.get('maxDescriptionLength')
        ? parseInt(url.searchParams.get('maxDescriptionLength')!, 10)
        : undefined,
      includeContextTypes: url.searchParams.get('includeContextTypes') !== 'false',
      forceBasicDescription: url.searchParams.get('forceBasicDescription') === 'true',
    };

    // Get composite tool with relations
    const compositeTool = await getCompositeToolDetail(tenant.id, compositeToolId);

    // Export to universal format
    const exportResponse = await createCompositeToolExportResponse(compositeTool, options);

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

    console.error('[COMPOSITE_TOOL_EXPORT_UNIVERSAL] Error:', error);

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
