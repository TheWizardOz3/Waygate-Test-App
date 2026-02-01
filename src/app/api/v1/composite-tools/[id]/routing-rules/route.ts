/**
 * Composite Tool Routing Rules List/Create Endpoint
 *
 * GET /api/v1/composite-tools/:id/routing-rules - List routing rules
 * POST /api/v1/composite-tools/:id/routing-rules - Add routing rule
 *
 * @route GET /api/v1/composite-tools/:id/routing-rules
 * @route POST /api/v1/composite-tools/:id/routing-rules
 */

import { NextRequest, NextResponse } from 'next/server';
import { withApiAuth } from '@/lib/api/middleware/auth';
import {
  listRoutingRules,
  addRoutingRule,
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
 * GET /api/v1/composite-tools/:id/routing-rules
 *
 * Returns all routing rules for a composite tool, ordered by priority.
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

    const routingRules = await listRoutingRules(tenant.id, compositeToolId);

    return NextResponse.json(
      {
        success: true,
        data: {
          routingRules,
          count: routingRules.length,
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

    console.error('[COMPOSITE_TOOL_ROUTING_RULES_LIST] Error:', error);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message:
            error instanceof Error ? error.message : 'An error occurred fetching routing rules',
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
 * POST /api/v1/composite-tools/:id/routing-rules
 *
 * Adds a new routing rule to a composite tool.
 *
 * Request Body:
 * - `operationId` (required): The ID of the operation this rule routes to
 * - `conditionType` (required): Type of condition ('contains', 'equals', 'matches', 'starts_with', 'ends_with')
 * - `conditionField` (required): Field to evaluate (e.g., 'url')
 * - `conditionValue` (required): Value to compare against
 * - `caseSensitive` (optional): Whether comparison is case-sensitive (default: false)
 * - `priority` (optional): Priority order (lower = higher priority)
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
    const routingRule = await addRoutingRule(tenant.id, compositeToolId, body);

    return NextResponse.json(
      {
        success: true,
        data: routingRule,
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

    console.error('[COMPOSITE_TOOL_ROUTING_RULES_CREATE] Error:', error);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'An error occurred adding routing rule',
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
      return 'The specified operation was not found in this composite tool.';
    case 'ROUTING_RULE_NOT_FOUND':
      return 'The specified routing rule was not found.';
    case 'INVALID_INPUT':
      return 'Invalid input provided. Check the request body and try again.';
    default:
      return 'An error occurred while processing the routing rule request.';
  }
}
