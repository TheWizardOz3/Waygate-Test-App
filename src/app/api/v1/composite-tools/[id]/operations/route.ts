/**
 * Composite Tool Operations List/Create Endpoint
 *
 * GET /api/v1/composite-tools/:id/operations - List operations for a composite tool
 * POST /api/v1/composite-tools/:id/operations - Add operation to composite tool
 *
 * @route GET /api/v1/composite-tools/:id/operations
 * @route POST /api/v1/composite-tools/:id/operations
 */

import { NextRequest, NextResponse } from 'next/server';
import { withApiAuth } from '@/lib/api/middleware/auth';
import { listOperations, addOperation, CompositeToolError } from '@/lib/modules/composite-tools';

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
 * GET /api/v1/composite-tools/:id/operations
 *
 * Returns all operations for a composite tool.
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

    const operations = await listOperations(tenant.id, compositeToolId);

    return NextResponse.json(
      {
        success: true,
        data: {
          operations,
          count: operations.length,
        },
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

    console.error('[COMPOSITE_TOOL_OPERATIONS_LIST] Error:', error);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'An error occurred fetching operations',
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
 * POST /api/v1/composite-tools/:id/operations
 *
 * Adds a new operation to a composite tool.
 *
 * Request Body:
 * - `actionId` (required): The ID of the action this operation wraps
 * - `operationSlug` (required): Unique slug for this operation within the tool
 * - `displayName` (required): Human-readable name for the operation
 * - `parameterMapping` (optional): Parameter mapping configuration
 * - `priority` (optional): Priority order for routing rules
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

    const body = await request.json();
    const operation = await addOperation(tenant.id, compositeToolId, body);

    return NextResponse.json(
      {
        success: true,
        data: operation,
      },
      { status: 201 }
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

    console.error('[COMPOSITE_TOOL_OPERATIONS_CREATE] Error:', error);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'An error occurred adding operation',
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
    case 'OPERATION_NOT_FOUND':
      return 'The specified operation was not found.';
    case 'DUPLICATE_OPERATION_SLUG':
      return 'An operation with this slug already exists in this composite tool.';
    case 'ACTION_NOT_FOUND':
      return 'The specified action was not found.';
    case 'MAX_OPERATIONS_EXCEEDED':
      return 'Maximum number of operations exceeded (20).';
    case 'INVALID_INPUT':
      return 'Invalid input provided. Check the request body and try again.';
    default:
      return 'An error occurred while processing the operation request.';
  }
}
