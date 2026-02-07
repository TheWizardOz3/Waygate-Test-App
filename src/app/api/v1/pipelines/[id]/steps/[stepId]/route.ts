/**
 * Pipeline Step Detail Endpoint
 *
 * PATCH /api/v1/pipelines/:id/steps/:stepId - Update a step
 * DELETE /api/v1/pipelines/:id/steps/:stepId - Remove a step
 *
 * @route PATCH /api/v1/pipelines/:id/steps/:stepId
 * @route DELETE /api/v1/pipelines/:id/steps/:stepId
 */

import { NextRequest, NextResponse } from 'next/server';
import { withApiAuth } from '@/lib/api/middleware/auth';
import { updateStep, removeStep, PipelineError } from '@/lib/modules/pipelines';

/**
 * Extract step ID from URL
 */
function extractStepId(request: NextRequest): string | null {
  const url = new URL(request.url);
  const pathParts = url.pathname.split('/');
  const stepsIndex = pathParts.indexOf('steps');
  return stepsIndex !== -1 ? pathParts[stepsIndex + 1] : null;
}

/**
 * PATCH /api/v1/pipelines/:id/steps/:stepId
 *
 * Updates a pipeline step.
 *
 * Request Body (all optional):
 * - `stepNumber`: Position in pipeline
 * - `name`: Step display name
 * - `slug`: URL-safe identifier
 * - `toolId`: Tool ID
 * - `toolType`: 'simple' | 'composite' | 'agentic'
 * - `toolSlug`: Tool slug for display
 * - `inputMapping`: Template expressions for input
 * - `onError`: Error handling policy
 * - `retryConfig`: Retry configuration
 * - `timeoutSeconds`: Per-step timeout
 * - `condition`: Skip condition
 * - `reasoningEnabled`: Enable inter-step reasoning
 * - `reasoningPrompt`: Reasoning instructions
 * - `reasoningConfig`: LLM config override
 * - `metadata`: Additional metadata
 */
export const PATCH = withApiAuth(async (request: NextRequest, { tenant }) => {
  try {
    const stepId = extractStepId(request);

    if (!stepId) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_REQUEST',
            message: 'Step ID is required',
            suggestedResolution: {
              action: 'RETRY_WITH_MODIFIED_INPUT',
              description: 'Include a valid step ID in the URL path.',
              retryable: false,
            },
          },
        },
        { status: 400 }
      );
    }

    const body = await request.json();
    const step = await updateStep(tenant.id, stepId, body);

    return NextResponse.json(
      {
        success: true,
        data: step,
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
              retryable: error.statusCode !== 409,
            },
          },
        },
        { status: error.statusCode }
      );
    }

    console.error('[PIPELINE_STEP_UPDATE] Error:', error);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message:
            error instanceof Error ? error.message : 'An error occurred updating pipeline step',
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
 * DELETE /api/v1/pipelines/:id/steps/:stepId
 *
 * Removes a step from a pipeline and renumbers remaining steps.
 */
export const DELETE = withApiAuth(async (request: NextRequest, { tenant }) => {
  try {
    const stepId = extractStepId(request);

    if (!stepId) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_REQUEST',
            message: 'Step ID is required',
            suggestedResolution: {
              action: 'RETRY_WITH_MODIFIED_INPUT',
              description: 'Include a valid step ID in the URL path.',
              retryable: false,
            },
          },
        },
        { status: 400 }
      );
    }

    await removeStep(tenant.id, stepId);

    return NextResponse.json(
      {
        success: true,
        message: 'Step removed successfully',
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

    console.error('[PIPELINE_STEP_DELETE] Error:', error);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message:
            error instanceof Error ? error.message : 'An error occurred removing pipeline step',
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
    case 'STEP_NOT_FOUND':
      return 'The specified step was not found.';
    case 'DUPLICATE_STEP_SLUG':
      return 'A step with this slug already exists in the pipeline.';
    case 'INVALID_INPUT':
      return 'Invalid input provided. Check the request body and try again.';
    default:
      return 'An error occurred while processing the pipeline step request.';
  }
}
