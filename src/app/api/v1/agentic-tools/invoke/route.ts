/**
 * Agentic Tool Invoke Endpoint
 *
 * POST /api/v1/agentic-tools/invoke - Invoke an agentic tool
 *
 * @route POST /api/v1/agentic-tools/invoke
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withApiAuth } from '@/lib/api/middleware/auth';
import {
  invokeAgenticTool,
  InvocationError,
  type InvokeAgenticToolInput,
} from '@/lib/modules/agentic-tools';

/**
 * Request body schema for agentic tool invocation
 */
const InvokeAgenticToolSchema = z.object({
  /** The agentic tool slug or ID */
  tool: z.string().min(1, 'Tool slug is required'),
  /** Input parameters for the tool */
  params: z.record(z.string(), z.unknown()).default({}),
  /** Optional invocation options */
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
      tracing: z
        .object({
          provider: z.enum(['langsmith', 'opentelemetry']).optional(),
          apiKey: z.string().optional(),
          endpoint: z.string().optional(),
          traceName: z.string().optional(),
          parentRunId: z.string().optional(),
        })
        .optional(),
    })
    .optional(),
});

/**
 * POST /api/v1/agentic-tools/invoke
 *
 * Invokes an agentic tool with the provided parameters.
 * The tool uses its embedded LLM to either:
 * - (Parameter Interpreter) Generate structured parameters and execute target action
 * - (Autonomous Agent) Autonomously select and execute tools to accomplish task
 *
 * Request Body:
 * - `tool` (required): The agentic tool slug
 * - `params` (required): Input parameters for the tool
 * - `options` (optional): Additional invocation options
 *   - `connectionId` (optional): Specific connection to use
 *   - `context` (optional): Reference data context
 *   - `tracing` (optional): Tracing configuration (Langsmith/OpenTelemetry)
 *
 * Response:
 * - `success`: Whether the invocation was successful
 * - `data`: Response data from execution
 * - `meta`: Metadata including mode, LLM calls, cost, tokens, duration
 */
export const POST = withApiAuth(async (request: NextRequest, { tenant }) => {
  try {
    const body = await request.json();

    // Validate request body
    const parsed = InvokeAgenticToolSchema.safeParse(body);
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

    // Extract tracing info from headers if provided
    const tracingHeaders = {
      provider: request.headers.get('X-Trace-Provider') as 'langsmith' | 'opentelemetry' | null,
      apiKey: request.headers.get('X-Trace-API-Key'),
      endpoint: request.headers.get('X-Trace-Endpoint'),
      parentRunId: request.headers.get('X-Trace-Run-ID'),
    };

    // Merge tracing config from body and headers (headers take precedence)
    const tracing = {
      ...options?.tracing,
      ...(tracingHeaders.provider && { provider: tracingHeaders.provider }),
      ...(tracingHeaders.apiKey && { apiKey: tracingHeaders.apiKey }),
      ...(tracingHeaders.endpoint && { endpoint: tracingHeaders.endpoint }),
      ...(tracingHeaders.parentRunId && { parentRunId: tracingHeaders.parentRunId }),
    };

    // Build invocation input
    const invokeInput: InvokeAgenticToolInput = {
      toolSlug: tool,
      params,
      options: {
        ...options,
        tracing: Object.keys(tracing).length > 0 ? tracing : undefined,
      },
    };

    // Invoke the agentic tool
    const result = await invokeAgenticTool(tenant.id, invokeInput);

    // Return the result
    if (result.success) {
      return NextResponse.json(result, { status: 200 });
    } else {
      // Determine appropriate status code from error
      const statusCode = getStatusCodeForError(result.error.code);
      return NextResponse.json(result, { status: statusCode });
    }
  } catch (error) {
    if (error instanceof InvocationError) {
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

    console.error('[AGENTIC_TOOL_INVOKE] Error:', error);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message:
            error instanceof Error ? error.message : 'An error occurred invoking agentic tool',
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
    case 'AGENTIC_TOOL_NOT_FOUND':
      return 404;
    case 'AGENTIC_TOOL_DISABLED':
      return 403;
    case 'INVALID_INPUT':
    case 'PARAMETER_GENERATION_FAILED':
    case 'OUTPUT_VALIDATION_FAILED':
      return 400;
    case 'SAFETY_LIMIT_EXCEEDED':
    case 'TIMEOUT':
      return 429;
    case 'LLM_ERROR':
    case 'EXECUTION_FAILED':
    case 'CONTEXT_LOAD_FAILED':
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
    case 'AGENTIC_TOOL_NOT_FOUND':
      return 'The specified agentic tool was not found. Check the tool slug.';
    case 'AGENTIC_TOOL_DISABLED':
      return 'This agentic tool is currently disabled.';
    case 'INVALID_INPUT':
      return 'Invalid input parameters. Check the input schema for the tool.';
    case 'LLM_ERROR':
      return 'LLM call failed. This may be a temporary issue. Try again.';
    case 'PARAMETER_GENERATION_FAILED':
      return 'Failed to generate parameters. The LLM output was invalid.';
    case 'OUTPUT_VALIDATION_FAILED':
      return 'LLM output validation failed. The generated parameters do not match the expected schema.';
    case 'EXECUTION_FAILED':
      return 'The underlying action execution failed. Check the action configuration.';
    case 'CONTEXT_LOAD_FAILED':
      return 'Failed to load execution context. Check integration credentials and schemas.';
    case 'SAFETY_LIMIT_EXCEEDED':
      return 'Safety limit exceeded (max tool calls, timeout, or cost limit).';
    case 'TIMEOUT':
      return 'Execution timed out. The operation took too long to complete.';
    default:
      return 'An error occurred while invoking the agentic tool.';
  }
}
