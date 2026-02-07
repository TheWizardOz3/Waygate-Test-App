/**
 * Pipeline Steps Reorder Endpoint
 *
 * PUT /api/v1/pipelines/:id/steps/reorder - Reorder steps within a pipeline
 *
 * @route PUT /api/v1/pipelines/:id/steps/reorder
 */

import { NextRequest, NextResponse } from 'next/server';
import { withApiAuth } from '@/lib/api/middleware/auth';
import { reorderSteps, PipelineError } from '@/lib/modules/pipelines';

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
 * PUT /api/v1/pipelines/:id/steps/reorder
 *
 * Reorders all steps within a pipeline.
 *
 * Request Body:
 * - `steps` (required): Array of { id: string, stepNumber: number }
 *   Must include ALL steps with sequential step numbers starting from 1.
 */
export const PUT = withApiAuth(async (request: NextRequest, { tenant }) => {
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
    const steps = await reorderSteps(tenant.id, pipelineId, body);

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

    console.error('[PIPELINE_STEPS_REORDER] Error:', error);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message:
            error instanceof Error ? error.message : 'An error occurred reordering pipeline steps',
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
      return 'One or more step IDs do not belong to this pipeline.';
    case 'INVALID_STEP_ORDER':
      return 'Step numbers must be sequential starting from 1, and all steps must be included.';
    case 'INVALID_INPUT':
      return 'Invalid input provided. Check the request body and try again.';
    default:
      return 'An error occurred while reordering pipeline steps.';
  }
}
