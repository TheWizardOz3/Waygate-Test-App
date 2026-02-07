/**
 * Pipeline Steps Endpoint
 *
 * GET /api/v1/pipelines/:id/steps - List steps for a pipeline
 * POST /api/v1/pipelines/:id/steps - Add a step to a pipeline
 *
 * @route GET /api/v1/pipelines/:id/steps
 * @route POST /api/v1/pipelines/:id/steps
 */

import { NextRequest, NextResponse } from 'next/server';
import { withApiAuth } from '@/lib/api/middleware/auth';
import { listSteps, addStep, PipelineError } from '@/lib/modules/pipelines';

/**
 * Extract pipeline ID from URL
 */
function extractPipelineId(request: NextRequest): string | null {
  const url = new URL(request.url);
  const pathParts = url.pathname.split('/');
  const pipelinesIndex = pathParts.indexOf('pipelines');
  return pipelinesIndex !== -1 ? pathParts[pipelinesIndex + 1] : null;
}

/**
 * GET /api/v1/pipelines/:id/steps
 *
 * Returns all steps for a pipeline, ordered by step number.
 */
export const GET = withApiAuth(async (request: NextRequest, { tenant }) => {
  try {
    const pipelineId = extractPipelineId(request);

    if (!pipelineId) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_REQUEST',
            message: 'Pipeline ID is required',
            suggestedResolution: {
              action: 'RETRY_WITH_MODIFIED_INPUT',
              description: 'Include a valid pipeline ID in the URL path.',
              retryable: false,
            },
          },
        },
        { status: 400 }
      );
    }

    const steps = await listSteps(tenant.id, pipelineId);

    return NextResponse.json(
      {
        success: true,
        data: steps,
      },
      { status: 200 }
    );
  } catch (error) {
    if (error instanceof PipelineError) {
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

    console.error('[PIPELINE_STEPS_LIST] Error:', error);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message:
            error instanceof Error ? error.message : 'An error occurred fetching pipeline steps',
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
 * POST /api/v1/pipelines/:id/steps
 *
 * Adds a step to a pipeline.
 *
 * Request Body:
 * - `stepNumber` (required): Position in pipeline (1-based)
 * - `name` (required): Step display name
 * - `slug` (required): URL-safe identifier
 * - `toolId` (optional): Tool ID (null for reasoning-only steps)
 * - `toolType` (optional): 'simple' | 'composite' | 'agentic'
 * - `toolSlug` (optional): Tool slug for display
 * - `inputMapping` (optional): Template expressions for input
 * - `onError` (optional): 'fail_pipeline' | 'continue' | 'skip_remaining'
 * - `retryConfig` (optional): { maxRetries, backoffMs }
 * - `timeoutSeconds` (optional): Per-step timeout (default: 300)
 * - `condition` (optional): Skip condition
 * - `reasoningEnabled` (optional): Enable inter-step reasoning
 * - `reasoningPrompt` (optional): Reasoning instructions
 * - `reasoningConfig` (optional): LLM config override for reasoning
 * - `metadata` (optional): Additional metadata
 */
export const POST = withApiAuth(async (request: NextRequest, { tenant }) => {
  try {
    const pipelineId = extractPipelineId(request);

    if (!pipelineId) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_REQUEST',
            message: 'Pipeline ID is required',
            suggestedResolution: {
              action: 'RETRY_WITH_MODIFIED_INPUT',
              description: 'Include a valid pipeline ID in the URL path.',
              retryable: false,
            },
          },
        },
        { status: 400 }
      );
    }

    const body = await request.json();
    const step = await addStep(tenant.id, pipelineId, body);

    return NextResponse.json(
      {
        success: true,
        data: step,
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof PipelineError) {
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

    console.error('[PIPELINE_STEP_CREATE] Error:', error);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message:
            error instanceof Error ? error.message : 'An error occurred adding pipeline step',
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
    case 'PIPELINE_NOT_FOUND':
      return 'The specified pipeline was not found.';
    case 'STEP_NOT_FOUND':
      return 'The specified step was not found.';
    case 'DUPLICATE_STEP_SLUG':
      return 'A step with this slug already exists in the pipeline.';
    case 'INVALID_INPUT':
      return 'Invalid input provided. Check the request body and try again.';
    case 'MAX_STEPS_EXCEEDED':
      return 'Pipeline has reached the maximum number of steps (20).';
    case 'INVALID_STEP_ORDER':
      return 'Step numbers must be sequential starting from 1.';
    default:
      return 'An error occurred while processing the pipeline step request.';
  }
}
