/**
 * Composite Tool Detail Endpoint
 *
 * GET /api/v1/composite-tools/:id - Get composite tool details
 * PATCH /api/v1/composite-tools/:id - Update composite tool
 * DELETE /api/v1/composite-tools/:id - Delete composite tool
 *
 * @route GET /api/v1/composite-tools/:id
 * @route PATCH /api/v1/composite-tools/:id
 * @route DELETE /api/v1/composite-tools/:id
 */

import { NextRequest, NextResponse } from 'next/server';
import { withApiAuth } from '@/lib/api/middleware/auth';
import {
  getCompositeToolDetail,
  updateCompositeTool,
  deleteCompositeTool,
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
 * GET /api/v1/composite-tools/:id
 *
 * Returns detailed composite tool information including operations and routing rules.
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

    const compositeTool = await getCompositeToolDetail(tenant.id, compositeToolId);

    return NextResponse.json(
      {
        success: true,
        data: compositeTool,
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
              retryable: false,
            },
          },
        },
        { status: error.statusCode }
      );
    }

    console.error('[COMPOSITE_TOOL_GET] Error:', error);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message:
            error instanceof Error ? error.message : 'An error occurred fetching composite tool',
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
 * PATCH /api/v1/composite-tools/:id
 *
 * Updates a composite tool.
 *
 * Request Body (all optional):
 * - `name`: Display name
 * - `slug`: URL-safe identifier
 * - `description`: Description
 * - `routingMode`: 'rule_based' | 'agent_driven'
 * - `defaultOperationId`: Default operation ID
 * - `unifiedInputSchema`: Merged input schema
 * - `toolDescription`: LLM-optimized description
 * - `toolSuccessTemplate`: Success response template
 * - `toolErrorTemplate`: Error response template
 * - `status`: 'draft' | 'active' | 'disabled'
 * - `metadata`: Additional metadata
 */
export const PATCH = withApiAuth(async (request: NextRequest, { tenant }) => {
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

    const body = await request.json();
    const compositeTool = await updateCompositeTool(tenant.id, compositeToolId, body);

    return NextResponse.json(
      {
        success: true,
        data: compositeTool,
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
              retryable: error.statusCode !== 409,
            },
          },
        },
        { status: error.statusCode }
      );
    }

    console.error('[COMPOSITE_TOOL_UPDATE] Error:', error);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message:
            error instanceof Error ? error.message : 'An error occurred updating composite tool',
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
 * DELETE /api/v1/composite-tools/:id
 *
 * Deletes a composite tool and all associated operations and routing rules.
 */
export const DELETE = withApiAuth(async (request: NextRequest, { tenant }) => {
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

    await deleteCompositeTool(tenant.id, compositeToolId);

    return NextResponse.json(
      {
        success: true,
        message: 'Composite tool deleted successfully',
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
              retryable: false,
            },
          },
        },
        { status: error.statusCode }
      );
    }

    console.error('[COMPOSITE_TOOL_DELETE] Error:', error);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message:
            error instanceof Error ? error.message : 'An error occurred deleting composite tool',
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
    case 'COMPOSITE_TOOL_NOT_FOUND':
      return 'The specified composite tool was not found.';
    case 'DUPLICATE_SLUG':
      return 'A composite tool with this slug already exists. Choose a different slug.';
    case 'INVALID_INPUT':
      return 'Invalid input provided. Check the request body and try again.';
    case 'COMPOSITE_TOOL_DISABLED':
      return 'This composite tool is currently disabled.';
    default:
      return 'An error occurred while processing the composite tool request.';
  }
}
