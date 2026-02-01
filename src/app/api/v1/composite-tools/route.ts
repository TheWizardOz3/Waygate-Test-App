/**
 * Composite Tools List/Create Endpoint
 *
 * GET /api/v1/composite-tools - List composite tools with pagination and filtering
 * POST /api/v1/composite-tools - Create a new composite tool
 *
 * @route GET /api/v1/composite-tools
 * @route POST /api/v1/composite-tools
 */

import { NextRequest, NextResponse } from 'next/server';
import { withApiAuth } from '@/lib/api/middleware/auth';
import {
  listCompositeTools,
  getCompositeToolsWithCounts,
  createCompositeTool,
  CompositeToolError,
} from '@/lib/modules/composite-tools';

/**
 * GET /api/v1/composite-tools
 *
 * Returns paginated list of composite tools for the authenticated tenant.
 *
 * Query Parameters:
 * - `cursor` (optional): Pagination cursor from previous response
 * - `limit` (optional): Number of items per page (1-100, default: 20)
 * - `status` (optional): Filter by status (draft, active, disabled)
 * - `routingMode` (optional): Filter by routing mode (rule_based, agent_driven)
 * - `search` (optional): Search by name or slug
 * - `withCounts` (optional): Include operation counts (true/false)
 */
export const GET = withApiAuth(async (request: NextRequest, { tenant }) => {
  try {
    const url = new URL(request.url);
    const query = {
      cursor: url.searchParams.get('cursor') ?? undefined,
      limit: url.searchParams.get('limit') ?? undefined,
      status: url.searchParams.get('status') ?? undefined,
      routingMode: url.searchParams.get('routingMode') ?? undefined,
      search: url.searchParams.get('search') ?? undefined,
    };

    // Filter out undefined values
    const cleanQuery = Object.fromEntries(Object.entries(query).filter(([, v]) => v !== undefined));

    // Check if we should include counts
    const withCounts = url.searchParams.get('withCounts') === 'true';

    let result;
    if (withCounts) {
      result = await getCompositeToolsWithCounts(tenant.id, cleanQuery);
    } else {
      result = await listCompositeTools(tenant.id, cleanQuery);
    }

    return NextResponse.json(
      {
        success: true,
        data: result,
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
              retryable: true,
            },
          },
        },
        { status: error.statusCode }
      );
    }

    console.error('[COMPOSITE_TOOLS_LIST] Error:', error);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message:
            error instanceof Error ? error.message : 'An error occurred fetching composite tools',
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
 * POST /api/v1/composite-tools
 *
 * Creates a new composite tool for the authenticated tenant.
 *
 * Request Body:
 * - `name` (required): Display name
 * - `slug` (required): URL-safe identifier
 * - `description` (optional): Description
 * - `routingMode` (required): 'rule_based' | 'agent_driven'
 * - `unifiedInputSchema` (optional): Merged input schema
 * - `toolDescription` (optional): LLM-optimized description
 * - `toolSuccessTemplate` (optional): Success response template
 * - `toolErrorTemplate` (optional): Error response template
 * - `status` (optional): 'draft' | 'active' | 'disabled' (default: 'draft')
 * - `metadata` (optional): Additional metadata
 * - `operations` (optional): Array of operations to create
 * - `routingRules` (optional): Array of routing rules to create
 * - `defaultOperationSlug` (optional): Default operation slug
 */
export const POST = withApiAuth(async (request: NextRequest, { tenant }) => {
  try {
    const body = await request.json();

    const compositeTool = await createCompositeTool(tenant.id, body);

    return NextResponse.json(
      {
        success: true,
        data: compositeTool,
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
              retryable: error.statusCode !== 409, // Not retryable for conflicts
            },
          },
        },
        { status: error.statusCode }
      );
    }

    console.error('[COMPOSITE_TOOLS_CREATE] Error:', error);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message:
            error instanceof Error ? error.message : 'An error occurred creating composite tool',
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
    case 'ACTION_NOT_FOUND':
      return 'One or more specified actions were not found.';
    case 'MAX_OPERATIONS_EXCEEDED':
      return 'Maximum number of operations exceeded. A composite tool can have at most 20 operations.';
    default:
      return 'An error occurred while processing the composite tool request.';
  }
}
