/**
 * Agentic Tool Regenerate Prompt Endpoint
 *
 * POST /api/v1/agentic-tools/:id/regenerate-prompt - Regenerate system prompt
 *
 * @route POST /api/v1/agentic-tools/:id/regenerate-prompt
 */

import { NextRequest, NextResponse } from 'next/server';
import { withApiAuth } from '@/lib/api/middleware/auth';
import {
  getAgenticToolById,
  updateAgenticTool,
  AgenticToolError,
} from '@/lib/modules/agentic-tools';
import { generateDescriptionsFromAgenticTool } from '@/lib/modules/agentic-tools/export/description-generator';

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
 * POST /api/v1/agentic-tools/:id/regenerate-prompt
 *
 * Regenerates the tool description for an agentic tool using AI.
 * This is useful when the tool configuration changes (execution mode,
 * allocated tools, context variables, etc.) and the description needs to be updated.
 *
 * Response:
 * - `toolDescription`: The newly generated tool description
 * - `exampleUsages`: Example usage scenarios for the tool
 * - `updated`: Whether the tool was automatically updated (false by default)
 */
export const POST = withApiAuth(async (request: NextRequest, { tenant }) => {
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

    // Get the agentic tool
    const agenticTool = await getAgenticToolById(agenticToolId, tenant.id);

    // Regenerate descriptions
    const regenerated = await generateDescriptionsFromAgenticTool(agenticTool);

    // Optionally auto-update the tool if requested
    const url = new URL(request.url);
    const autoUpdate = url.searchParams.get('autoUpdate') === 'true';

    let updatedTool;
    if (autoUpdate) {
      updatedTool = await updateAgenticTool(agenticToolId, tenant.id, {
        toolDescription: regenerated.toolDescription,
      });
    }

    return NextResponse.json(
      {
        success: true,
        data: {
          toolDescription: regenerated.toolDescription,
          exampleUsages: regenerated.exampleUsages,
          updated: autoUpdate,
          ...(updatedTool && { agenticTool: updatedTool }),
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

    console.error('[AGENTIC_TOOL_REGENERATE_PROMPT] Error:', error);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'An error occurred regenerating prompt',
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
    case 'INVALID_INPUT':
      return 'Invalid input provided. Check the request body and try again.';
    default:
      return 'An error occurred while regenerating the prompt.';
  }
}
