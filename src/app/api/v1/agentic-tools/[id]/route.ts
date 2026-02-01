/**
 * Agentic Tool Detail Endpoint
 *
 * GET /api/v1/agentic-tools/:id - Get agentic tool details
 * PATCH /api/v1/agentic-tools/:id - Update agentic tool
 * DELETE /api/v1/agentic-tools/:id - Delete agentic tool
 *
 * @route GET /api/v1/agentic-tools/:id
 * @route PATCH /api/v1/agentic-tools/:id
 * @route DELETE /api/v1/agentic-tools/:id
 */

import { NextRequest, NextResponse } from 'next/server';
import { withApiAuth } from '@/lib/api/middleware/auth';
import {
  getAgenticToolById,
  updateAgenticTool,
  deleteAgenticTool,
  getExecutionStats,
  AgenticToolError,
} from '@/lib/modules/agentic-tools';

/**
 * Extract agentic tool ID from URL
 */
function extractAgenticToolId(request: NextRequest): string | null {
  const url = new URL(request.url);
  const pathParts = url.pathname.split('/');
  const agenticToolsIndex = pathParts.indexOf('agentic-tools');
  return agenticToolsIndex !== -1 ? pathParts[agenticToolsIndex + 1] : null;
}

/**
 * GET /api/v1/agentic-tools/:id
 *
 * Returns detailed agentic tool information.
 *
 * Query Parameters:
 * - `withStats` (optional): Include execution statistics (true/false)
 */
export const GET = withApiAuth(async (request: NextRequest, { tenant }) => {
  try {
    const agenticToolId = extractAgenticToolId(request);

    if (!agenticToolId) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_REQUEST',
            message: 'Agentic tool ID is required',
            suggestedResolution: {
              action: 'RETRY_WITH_MODIFIED_INPUT',
              description: 'Include a valid agentic tool ID in the URL path.',
              retryable: false,
            },
          },
        },
        { status: 400 }
      );
    }

    const agenticTool = await getAgenticToolById(agenticToolId, tenant.id);

    // Check if stats are requested
    const url = new URL(request.url);
    const withStats = url.searchParams.get('withStats') === 'true';

    let stats;
    if (withStats) {
      stats = await getExecutionStats(agenticToolId, tenant.id);
    }

    return NextResponse.json(
      {
        success: true,
        data: {
          ...agenticTool,
          ...(stats && { stats }),
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
              retryable: false,
            },
          },
        },
        { status: error.statusCode }
      );
    }

    console.error('[AGENTIC_TOOL_GET] Error:', error);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message:
            error instanceof Error ? error.message : 'An error occurred fetching agentic tool',
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
 * PATCH /api/v1/agentic-tools/:id
 *
 * Updates an agentic tool.
 *
 * Request Body (all optional):
 * - `name`: Display name
 * - `slug`: URL-safe identifier
 * - `description`: Description
 * - `executionMode`: 'parameter_interpreter' | 'autonomous_agent'
 * - `embeddedLLMConfig`: LLM configuration
 * - `systemPrompt`: System prompt template
 * - `toolAllocation`: Target actions or available tools
 * - `contextConfig`: Variable injection configuration
 * - `inputSchema`: Input parameter schema
 * - `toolDescription`: Parent-facing tool description
 * - `safetyLimits`: Safety limits
 * - `status`: 'draft' | 'active' | 'disabled'
 * - `metadata`: Additional metadata
 */
export const PATCH = withApiAuth(async (request: NextRequest, { tenant }) => {
  try {
    const agenticToolId = extractAgenticToolId(request);

    if (!agenticToolId) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_REQUEST',
            message: 'Agentic tool ID is required',
            suggestedResolution: {
              action: 'RETRY_WITH_MODIFIED_INPUT',
              description: 'Include a valid agentic tool ID in the URL path.',
              retryable: false,
            },
          },
        },
        { status: 400 }
      );
    }

    const body = await request.json();
    const agenticTool = await updateAgenticTool(agenticToolId, tenant.id, body);

    return NextResponse.json(
      {
        success: true,
        data: agenticTool,
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
              retryable: error.statusCode !== 409,
            },
          },
        },
        { status: error.statusCode }
      );
    }

    console.error('[AGENTIC_TOOL_UPDATE] Error:', error);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message:
            error instanceof Error ? error.message : 'An error occurred updating agentic tool',
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
 * DELETE /api/v1/agentic-tools/:id
 *
 * Deletes an agentic tool and all associated execution records.
 */
export const DELETE = withApiAuth(async (request: NextRequest, { tenant }) => {
  try {
    const agenticToolId = extractAgenticToolId(request);

    if (!agenticToolId) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_REQUEST',
            message: 'Agentic tool ID is required',
            suggestedResolution: {
              action: 'RETRY_WITH_MODIFIED_INPUT',
              description: 'Include a valid agentic tool ID in the URL path.',
              retryable: false,
            },
          },
        },
        { status: 400 }
      );
    }

    await deleteAgenticTool(agenticToolId, tenant.id);

    return NextResponse.json(
      {
        success: true,
        message: 'Agentic tool deleted successfully',
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
              retryable: false,
            },
          },
        },
        { status: error.statusCode }
      );
    }

    console.error('[AGENTIC_TOOL_DELETE] Error:', error);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message:
            error instanceof Error ? error.message : 'An error occurred deleting agentic tool',
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
    case 'AGENTIC_TOOL_DISABLED':
      return 'This agentic tool is currently disabled.';
    default:
      return 'An error occurred while processing the agentic tool request.';
  }
}
