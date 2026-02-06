/**
 * Agentic Tool Test Prompt Endpoint
 *
 * POST /api/v1/agentic-tools/:id/test-prompt - Test system prompt with sample input
 *
 * @route POST /api/v1/agentic-tools/:id/test-prompt
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withApiAuth } from '@/lib/api/middleware/auth';
import { getAgenticToolById, AgenticToolError } from '@/lib/modules/agentic-tools';
import {
  processPrompt,
  buildPromptContext,
} from '@/lib/modules/agentic-tools/llm/prompt-processor';
import type { ContextConfig } from '@/lib/modules/agentic-tools/agentic-tool.schemas';

/**
 * Request body schema for test prompt
 */
const TestPromptSchema = z.object({
  /** Sample user input to test with */
  sampleInput: z.string().min(1, 'Sample input is required'),
  /** Optional context variables for testing */
  testContext: z
    .object({
      integrationSchemas: z.record(z.string(), z.string()).optional(),
      referenceData: z.record(z.string(), z.string()).optional(),
      availableTools: z
        .array(
          z.object({
            name: z.string(),
            description: z.string(),
          })
        )
        .optional(),
    })
    .optional(),
});

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
 * POST /api/v1/agentic-tools/:id/test-prompt
 *
 * Tests the system prompt with sample input to see how variables are replaced.
 * This helps users preview the final prompt before saving or invoking the tool.
 *
 * Request Body:
 * - `sampleInput` (required): Sample user input to test
 * - `testContext` (optional): Test context variables
 *   - `integrationSchemas`: Schema data for testing
 *   - `referenceData`: Reference data for testing
 *   - `availableTools`: Available tools for testing
 *
 * Response:
 * - `processedPrompt`: Prompt with variables replaced
 * - `replacedVariables`: List of variables that were replaced
 * - `missingVariables`: List of variables not found in context
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

    const body = await request.json();

    // Validate request body
    const parsed = TestPromptSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_INPUT',
            message: `Invalid request body: ${parsed.error.message}`,
            details: parsed.error.flatten(),
            suggestedResolution: {
              action: 'RETRY_WITH_MODIFIED_INPUT',
              description: 'Check the request body format and required fields.',
              retryable: true,
            },
          },
        },
        { status: 400 }
      );
    }

    const { sampleInput, testContext } = parsed.data;

    // Get the agentic tool
    const agenticTool = await getAgenticToolById(agenticToolId, tenant.id);

    // Build prompt context from test data
    const promptContext = buildPromptContext(
      agenticTool.contextConfig as ContextConfig | undefined,
      {
        userInput: sampleInput,
        integrationSchemas: testContext?.integrationSchemas,
        referenceData: testContext?.referenceData,
        availableTools: testContext?.availableTools,
      }
    );

    // Process the prompt
    const result = processPrompt(agenticTool.systemPrompt, promptContext);

    return NextResponse.json(
      {
        success: true,
        data: {
          processedPrompt: result.processedPrompt,
          replacedVariables: result.replacedVariables,
          missingVariables: result.missingVariables,
          originalPrompt: agenticTool.systemPrompt,
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

    console.error('[AGENTIC_TOOL_TEST_PROMPT] Error:', error);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'An error occurred testing prompt',
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
      return 'An error occurred while testing the prompt.';
  }
}
