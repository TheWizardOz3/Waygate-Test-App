/**
 * Pipeline Invoke Endpoint
 *
 * POST /api/v1/pipelines/invoke - Invoke a pipeline
 *
 * Delegates to the pipeline invocation handler which resolves the pipeline,
 * validates status, and orchestrates execution.
 *
 * @route POST /api/v1/pipelines/invoke
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withApiAuth } from '@/lib/api/middleware/auth';
import { invokePipeline } from '@/lib/modules/pipelines';

/**
 * Request body schema for pipeline invocation
 */
const InvokePipelineSchema = z.object({
  /** The pipeline slug or ID */
  pipeline: z.string().min(1, 'Pipeline slug or ID is required'),
  /** Pipeline input parameters */
  params: z.record(z.string(), z.unknown()).optional().default({}),
  /** Optional invocation options */
  options: z
    .object({
      requestId: z.string().optional(),
      context: z.record(z.string(), z.unknown()).optional(),
    })
    .optional(),
});

/**
 * POST /api/v1/pipelines/invoke
 *
 * Invokes a pipeline with the provided parameters. The pipeline executes
 * all steps sequentially server-side and returns a single result.
 *
 * Request Body:
 * - `pipeline` (required): Pipeline slug or ID
 * - `params` (optional): Input parameters matching the pipeline's input schema
 * - `options` (optional): Invocation options
 *   - `requestId` (optional): Request ID for tracing
 *   - `context` (optional): Reference data context forwarded to step tools
 *
 * Response:
 * - `success`: Whether the pipeline completed successfully
 * - `data`: Final output from output mapping
 * - `meta`: Execution metadata (steps, cost, duration, tokens)
 */
export const POST = withApiAuth(async (request: NextRequest, { tenant }) => {
  try {
    const body = await request.json();

    // Validate request body
    const parsed = InvokePipelineSchema.safeParse(body);
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

    const { pipeline: pipelineIdentifier, params, options } = parsed.data;

    // Delegate to invocation handler
    const result = await invokePipeline({
      pipelineIdentifier,
      tenantId: tenant.id,
      params,
      requestId: options?.requestId,
      gatewayOptions: options?.context
        ? {
            context: options.context as Record<
              string,
              { id: string; name: string; metadata?: Record<string, unknown> }[]
            >,
          }
        : undefined,
    });

    // Map result to HTTP response
    if (result.success) {
      return NextResponse.json(
        {
          success: true,
          data: result.data,
          meta: result.metadata,
        },
        { status: 200 }
      );
    }

    const statusCode = getStatusCodeForError(result.error?.code ?? 'UNKNOWN_ERROR');
    return NextResponse.json(
      {
        success: false,
        data: result.data, // Include partial results
        error: {
          code: result.error?.code,
          message: result.error?.message,
          details: result.error?.details,
          suggestedResolution: {
            action: 'RETRY_WITH_MODIFIED_INPUT',
            description: getErrorDescription(result.error?.code ?? 'UNKNOWN_ERROR'),
            retryable: statusCode >= 500,
          },
        },
        meta: result.metadata,
      },
      { status: statusCode }
    );
  } catch (error) {
    console.error('[PIPELINE_INVOKE] Unexpected error:', error);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'An error occurred invoking pipeline',
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
    case 'PIPELINE_NOT_FOUND':
      return 404;
    case 'PIPELINE_DISABLED':
    case 'PIPELINE_NOT_ACTIVE':
      return 403;
    case 'INVALID_INPUT':
    case 'TEMPLATE_RESOLUTION_ERROR':
      return 400;
    case 'COST_LIMIT_EXCEEDED':
    case 'DURATION_LIMIT_EXCEEDED':
      return 429;
    case 'STEP_FAILED':
    case 'STEP_TIMEOUT':
      return 502;
    case 'EMPTY_PIPELINE':
      return 400;
    case 'EXECUTION_CANCELLED':
      return 499;
    default:
      return 500;
  }
}

/**
 * Get human-readable error description
 */
function getErrorDescription(code: string): string {
  switch (code) {
    case 'PIPELINE_NOT_FOUND':
      return 'The specified pipeline was not found. Check the pipeline slug or ID.';
    case 'PIPELINE_DISABLED':
      return 'This pipeline is currently disabled.';
    case 'PIPELINE_NOT_ACTIVE':
      return 'This pipeline is in draft status and cannot be invoked.';
    case 'EMPTY_PIPELINE':
      return 'This pipeline has no steps defined.';
    case 'STEP_FAILED':
      return 'A pipeline step failed. Check execution details for more information.';
    case 'STEP_TIMEOUT':
      return 'A pipeline step timed out. Try with a longer timeout or simpler input.';
    case 'COST_LIMIT_EXCEEDED':
      return 'Pipeline cost limit exceeded. The pipeline was stopped to prevent excessive spending.';
    case 'DURATION_LIMIT_EXCEEDED':
      return 'Pipeline duration limit exceeded. The pipeline was stopped to prevent excessive runtime.';
    case 'TEMPLATE_RESOLUTION_ERROR':
      return 'Failed to resolve template expressions. Check step input mappings.';
    case 'EXECUTION_CANCELLED':
      return 'Pipeline execution was cancelled.';
    default:
      return 'An error occurred while invoking the pipeline.';
  }
}
