/**
 * Agentic Tools List/Create Endpoint
 *
 * GET /api/v1/agentic-tools - List agentic tools with pagination and filtering
 * POST /api/v1/agentic-tools - Create a new agentic tool
 *
 * @route GET /api/v1/agentic-tools
 * @route POST /api/v1/agentic-tools
 */

import { NextRequest, NextResponse } from 'next/server';
import { withApiAuth } from '@/lib/api/middleware/auth';
import {
  listAgenticTools,
  createAgenticTool,
  getStatusCounts,
  AgenticToolError,
} from '@/lib/modules/agentic-tools';

/**
 * GET /api/v1/agentic-tools
 *
 * Returns paginated list of agentic tools for the authenticated tenant.
 *
 * Query Parameters:
 * - `cursor` (optional): Pagination cursor from previous response
 * - `limit` (optional): Number of items per page (1-100, default: 20)
 * - `status` (optional): Filter by status (draft, active, disabled)
 * - `executionMode` (optional): Filter by execution mode (parameter_interpreter, autonomous_agent)
 * - `search` (optional): Search by name or slug
 * - `withCounts` (optional): Include status counts (true/false)
 */
export const GET = withApiAuth(async (request: NextRequest, { tenant }) => {
  try {
    const url = new URL(request.url);
    const limit = url.searchParams.get('limit');
    const query = {
      cursor: url.searchParams.get('cursor') ?? undefined,
      limit: limit ? parseInt(limit, 10) : 50,
      status: url.searchParams.get('status') ?? undefined,
      executionMode: url.searchParams.get('executionMode') ?? undefined,
      search: url.searchParams.get('search') ?? undefined,
    };

    // Filter out undefined values (keep limit as it has a default)
    const cleanQuery = Object.fromEntries(
      Object.entries(query).filter(([k, v]) => k === 'limit' || v !== undefined)
    );

    // Check if we should include counts
    const withCounts = url.searchParams.get('withCounts') === 'true';

    // Get agentic tools
    const result = await listAgenticTools(tenant.id, cleanQuery);

    // Add counts if requested
    let counts;
    if (withCounts) {
      counts = await getStatusCounts(tenant.id);
    }

    return NextResponse.json(
      {
        success: true,
        data: {
          ...result,
          ...(counts && { counts }),
        },
      },
      { status: 200 }
    );
  } catch (error) {
    if (error instanceof AgenticToolError) {
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

    console.error('[AGENTIC_TOOLS_LIST] Error:', error);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message:
            error instanceof Error ? error.message : 'An error occurred fetching agentic tools',
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
 * POST /api/v1/agentic-tools
 *
 * Creates a new agentic tool for the authenticated tenant.
 *
 * Request Body:
 * - `name` (required): Display name
 * - `slug` (required): URL-safe identifier
 * - `description` (optional): Description
 * - `executionMode` (required): 'parameter_interpreter' | 'autonomous_agent'
 * - `embeddedLLMConfig` (required): LLM configuration (provider, model, temperature, etc.)
 * - `systemPrompt` (required): System prompt template with variable placeholders
 * - `toolAllocation` (required): Target actions or available tools
 * - `contextConfig` (optional): Variable injection configuration
 * - `inputSchema` (required): Input parameter schema
 * - `toolDescription` (optional): Parent-facing tool description
 * - `safetyLimits` (optional): Safety limits (max tool calls, timeout, cost)
 * - `status` (optional): 'draft' | 'active' | 'disabled' (default: 'draft')
 * - `metadata` (optional): Additional metadata
 */
export const POST = withApiAuth(async (request: NextRequest, { tenant }) => {
  try {
    const body = await request.json();

    const agenticTool = await createAgenticTool(tenant.id, body);

    return NextResponse.json(
      {
        success: true,
        data: agenticTool,
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof AgenticToolError) {
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

    console.error('[AGENTIC_TOOLS_CREATE] Error:', error);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message:
            error instanceof Error ? error.message : 'An error occurred creating agentic tool',
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
    case 'AGENTIC_TOOL_NOT_FOUND':
      return 'The specified agentic tool was not found.';
    case 'DUPLICATE_SLUG':
      return 'An agentic tool with this slug already exists. Choose a different slug.';
    case 'INVALID_INPUT':
      return 'Invalid input provided. Check the request body and try again.';
    case 'ACTION_NOT_FOUND':
      return 'One or more specified actions were not found.';
    case 'AGENTIC_TOOL_DISABLED':
      return 'This agentic tool is currently disabled.';
    default:
      return 'An error occurred while processing the agentic tool request.';
  }
}
