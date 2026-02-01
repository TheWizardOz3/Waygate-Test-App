/**
 * Composite Tool Operation Detail Endpoint
 *
 * GET /api/v1/composite-tools/:id/operations/:opId - Get operation details
 * PATCH /api/v1/composite-tools/:id/operations/:opId - Update operation
 * DELETE /api/v1/composite-tools/:id/operations/:opId - Delete operation
 *
 * @route GET /api/v1/composite-tools/:id/operations/:opId
 * @route PATCH /api/v1/composite-tools/:id/operations/:opId
 * @route DELETE /api/v1/composite-tools/:id/operations/:opId
 */

import { NextRequest, NextResponse } from 'next/server';
import { withApiAuth } from '@/lib/api/middleware/auth';
import {
  getOperationById,
  updateOperation,
  removeOperation,
  CompositeToolError,
} from '@/lib/modules/composite-tools';

/**
 * Extract operation ID from URL
 */
function extractOperationId(request: NextRequest): string | null {
  const url = new URL(request.url);
  const pathParts = url.pathname.split('/');
  const operationsIndex = pathParts.indexOf('operations');
  return operationsIndex !== -1 ? pathParts[operationsIndex + 1] : null;
}

/**
 * GET /api/v1/composite-tools/:id/operations/:opId
 *
 * Returns operation details.
 */
export const GET = withApiAuth(async (request: NextRequest, { tenant }) => {
  try {
    const operationId = extractOperationId(request);

    if (!operationId) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_REQUEST',
            message: 'Operation ID is required',
            suggestedResolution: {
              action: 'RETRY_WITH_MODIFIED_INPUT',
              description: 'Include a valid operation ID in the URL path.',
              retryable: false,
            },
          },
        },
        { status: 400 }
      );
    }

    const operation = await getOperationById(tenant.id, operationId);

    return NextResponse.json(
      {
        success: true,
        data: operation,
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

    console.error('[COMPOSITE_TOOL_OPERATION_GET] Error:', error);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'An error occurred fetching operation',
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
 * PATCH /api/v1/composite-tools/:id/operations/:opId
 *
 * Updates an operation.
 *
 * Request Body (all optional):
 * - `operationSlug`: Unique slug for this operation
 * - `displayName`: Human-readable name
 * - `parameterMapping`: Parameter mapping configuration
 * - `priority`: Priority order
 */
export const PATCH = withApiAuth(async (request: NextRequest, { tenant }) => {
  try {
    const operationId = extractOperationId(request);

    if (!operationId) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_REQUEST',
            message: 'Operation ID is required',
            suggestedResolution: {
              action: 'RETRY_WITH_MODIFIED_INPUT',
              description: 'Include a valid operation ID in the URL path.',
              retryable: false,
            },
          },
        },
        { status: 400 }
      );
    }

    const body = await request.json();
    const operation = await updateOperation(tenant.id, operationId, body);

    return NextResponse.json(
      {
        success: true,
        data: operation,
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

    console.error('[COMPOSITE_TOOL_OPERATION_UPDATE] Error:', error);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'An error occurred updating operation',
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
 * DELETE /api/v1/composite-tools/:id/operations/:opId
 *
 * Removes an operation from a composite tool.
 */
export const DELETE = withApiAuth(async (request: NextRequest, { tenant }) => {
  try {
    const operationId = extractOperationId(request);

    if (!operationId) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_REQUEST',
            message: 'Operation ID is required',
            suggestedResolution: {
              action: 'RETRY_WITH_MODIFIED_INPUT',
              description: 'Include a valid operation ID in the URL path.',
              retryable: false,
            },
          },
        },
        { status: 400 }
      );
    }

    await removeOperation(tenant.id, operationId);

    return NextResponse.json(
      {
        success: true,
        message: 'Operation removed successfully',
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

    console.error('[COMPOSITE_TOOL_OPERATION_DELETE] Error:', error);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'An error occurred removing operation',
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
    case 'OPERATION_NOT_FOUND':
      return 'The specified operation was not found.';
    case 'DUPLICATE_OPERATION_SLUG':
      return 'An operation with this slug already exists in this composite tool.';
    case 'INVALID_INPUT':
      return 'Invalid input provided. Check the request body and try again.';
    default:
      return 'An error occurred while processing the operation request.';
  }
}
