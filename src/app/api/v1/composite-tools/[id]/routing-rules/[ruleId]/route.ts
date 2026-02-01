/**
 * Composite Tool Routing Rule Detail Endpoint
 *
 * GET /api/v1/composite-tools/:id/routing-rules/:ruleId - Get routing rule details
 * PATCH /api/v1/composite-tools/:id/routing-rules/:ruleId - Update routing rule
 * DELETE /api/v1/composite-tools/:id/routing-rules/:ruleId - Delete routing rule
 *
 * @route GET /api/v1/composite-tools/:id/routing-rules/:ruleId
 * @route PATCH /api/v1/composite-tools/:id/routing-rules/:ruleId
 * @route DELETE /api/v1/composite-tools/:id/routing-rules/:ruleId
 */

import { NextRequest, NextResponse } from 'next/server';
import { withApiAuth } from '@/lib/api/middleware/auth';
import {
  getRoutingRuleById,
  updateRoutingRule,
  removeRoutingRule,
  CompositeToolError,
} from '@/lib/modules/composite-tools';

/**
 * Extract routing rule ID from URL
 */
function extractRoutingRuleId(request: NextRequest): string | null {
  const url = new URL(request.url);
  const pathParts = url.pathname.split('/');
  const routingRulesIndex = pathParts.indexOf('routing-rules');
  return routingRulesIndex !== -1 ? pathParts[routingRulesIndex + 1] : null;
}

/**
 * GET /api/v1/composite-tools/:id/routing-rules/:ruleId
 *
 * Returns routing rule details.
 */
export const GET = withApiAuth(async (request: NextRequest, { tenant }) => {
  try {
    const ruleId = extractRoutingRuleId(request);

    if (!ruleId) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_REQUEST',
            message: 'Routing rule ID is required',
            suggestedResolution: {
              action: 'RETRY_WITH_MODIFIED_INPUT',
              description: 'Include a valid routing rule ID in the URL path.',
              retryable: false,
            },
          },
        },
        { status: 400 }
      );
    }

    const routingRule = await getRoutingRuleById(tenant.id, ruleId);

    return NextResponse.json(
      {
        success: true,
        data: routingRule,
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

    console.error('[COMPOSITE_TOOL_ROUTING_RULE_GET] Error:', error);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message:
            error instanceof Error ? error.message : 'An error occurred fetching routing rule',
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
 * PATCH /api/v1/composite-tools/:id/routing-rules/:ruleId
 *
 * Updates a routing rule.
 *
 * Request Body (all optional):
 * - `operationId`: The ID of the operation this rule routes to
 * - `conditionType`: Type of condition
 * - `conditionField`: Field to evaluate
 * - `conditionValue`: Value to compare against
 * - `caseSensitive`: Whether comparison is case-sensitive
 * - `priority`: Priority order
 */
export const PATCH = withApiAuth(async (request: NextRequest, { tenant }) => {
  try {
    const ruleId = extractRoutingRuleId(request);

    if (!ruleId) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_REQUEST',
            message: 'Routing rule ID is required',
            suggestedResolution: {
              action: 'RETRY_WITH_MODIFIED_INPUT',
              description: 'Include a valid routing rule ID in the URL path.',
              retryable: false,
            },
          },
        },
        { status: 400 }
      );
    }

    const body = await request.json();
    const routingRule = await updateRoutingRule(tenant.id, ruleId, body);

    return NextResponse.json(
      {
        success: true,
        data: routingRule,
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

    console.error('[COMPOSITE_TOOL_ROUTING_RULE_UPDATE] Error:', error);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message:
            error instanceof Error ? error.message : 'An error occurred updating routing rule',
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
 * DELETE /api/v1/composite-tools/:id/routing-rules/:ruleId
 *
 * Deletes a routing rule from a composite tool.
 */
export const DELETE = withApiAuth(async (request: NextRequest, { tenant }) => {
  try {
    const ruleId = extractRoutingRuleId(request);

    if (!ruleId) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_REQUEST',
            message: 'Routing rule ID is required',
            suggestedResolution: {
              action: 'RETRY_WITH_MODIFIED_INPUT',
              description: 'Include a valid routing rule ID in the URL path.',
              retryable: false,
            },
          },
        },
        { status: 400 }
      );
    }

    await removeRoutingRule(tenant.id, ruleId);

    return NextResponse.json(
      {
        success: true,
        message: 'Routing rule deleted successfully',
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

    console.error('[COMPOSITE_TOOL_ROUTING_RULE_DELETE] Error:', error);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message:
            error instanceof Error ? error.message : 'An error occurred deleting routing rule',
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
    case 'ROUTING_RULE_NOT_FOUND':
      return 'The specified routing rule was not found.';
    case 'OPERATION_NOT_FOUND':
      return 'The specified operation was not found in this composite tool.';
    case 'INVALID_INPUT':
      return 'Invalid input provided. Check the request body and try again.';
    default:
      return 'An error occurred while processing the routing rule request.';
  }
}
