/**
 * Composite Tool Invoke Endpoint
 *
 * POST /api/v1/composite-tools/invoke - Invoke a composite tool
 *
 * @route POST /api/v1/composite-tools/invoke
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withApiAuth } from '@/lib/api/middleware/auth';
import {
  invokeCompositeTool,
  CompositeToolError,
  type CompositeToolInvokeInput,
} from '@/lib/modules/composite-tools';

/**
 * Request body schema for composite tool invocation
 */
const InvokeCompositeToolSchema = z.object({
  /** The composite tool slug or ID */
  tool: z.string().min(1, 'Tool slug is required'),
  /** Input parameters for the tool */
  params: z.record(z.string(), z.unknown()).default({}),
  /** Optional gateway invoke options */
  options: z
    .object({
      connectionId: z.string().uuid().optional(),
      context: z
        .record(
          z.string(),
          z.array(
            z.object({
              id: z.string(),
              name: z.string(),
              metadata: z.record(z.string(), z.unknown()).optional(),
            })
          )
        )
        .optional(),
    })
    .optional(),
});

/**
 * POST /api/v1/composite-tools/invoke
 *
 * Invokes a composite tool with the provided parameters.
 * The tool automatically routes to the appropriate operation based on
 * the routing mode (rule-based or agent-driven).
 *
 * Request Body:
 * - `tool` (required): The composite tool slug
 * - `params` (required): Input parameters for the tool
 * - `options` (optional): Additional invocation options
 *   - `connectionId` (optional): Specific connection to use
 *   - `context` (optional): Reference data context
 *
 * Response:
 * - `success`: Whether the invocation was successful
 * - `message`: Human-readable result message
 * - `data`: Response data from the underlying action
 * - `meta`: Metadata including routing information
 */
export const POST = withApiAuth(async (request: NextRequest, { tenant }) => {
  try {
    const body = await request.json();

    // Validate request body
    const parsed = InvokeCompositeToolSchema.safeParse(body);
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

    const { tool, params, options } = parsed.data;

    // Build invocation input
    const invokeInput: CompositeToolInvokeInput = {
      toolSlug: tool,
      params,
      options,
    };

    // Invoke the composite tool
    const result = await invokeCompositeTool(tenant.id, invokeInput);

    // Return the result (which includes success/error formatting from invocation handler)
    if (result.success) {
      return NextResponse.json(result, { status: 200 });
    } else {
      // Determine appropriate status code from error
      const statusCode = getStatusCodeForError(result.error.code);
      return NextResponse.json(result, { status: statusCode });
    }
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
              retryable: error.statusCode >= 500,
            },
          },
        },
        { status: error.statusCode }
      );
    }

    console.error('[COMPOSITE_TOOL_INVOKE] Error:', error);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message:
            error instanceof Error ? error.message : 'An error occurred invoking composite tool',
          suggestedResolution: {
            action: 'ESCALATE_TO_ADMIN',
            description: 'An internal error occurred. Please try again or contact support.',
            retryable: true,
          },
        },
      },
      { status: 500 }
    );
  }
});

/**
 * Get HTTP status code for error code
 */
function getStatusCodeForError(code: string): number {
  switch (code) {
    case 'COMPOSITE_TOOL_NOT_FOUND':
    case 'OPERATION_NOT_FOUND':
      return 404;
    case 'COMPOSITE_TOOL_DISABLED':
      return 403;
    case 'ROUTING_FAILED':
    case 'PARAMETER_MAPPING_FAILED':
    case 'INVALID_INPUT':
      return 400;
    case 'CONTEXT_LOAD_FAILED':
    case 'EXECUTION_FAILED':
      return 502;
    default:
      return 500;
  }
}

/**
 * Get human-readable error description
 */
function getErrorDescription(code: string): string {
  switch (code) {
    case 'COMPOSITE_TOOL_NOT_FOUND':
      return 'The specified composite tool was not found. Check the tool slug.';
    case 'COMPOSITE_TOOL_DISABLED':
      return 'This composite tool is currently disabled.';
    case 'ROUTING_FAILED':
      return 'Failed to route to an operation. Check routing rules or include operation parameter.';
    case 'CONTEXT_LOAD_FAILED':
      return 'Failed to load execution context. Check integration credentials.';
    case 'PARAMETER_MAPPING_FAILED':
      return 'Failed to map parameters. Check the input parameters match expected schema.';
    case 'EXECUTION_FAILED':
      return 'The underlying action execution failed. Check the action configuration.';
    default:
      return 'An error occurred while invoking the composite tool.';
  }
}
