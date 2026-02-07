/**
 * Pipeline Execution Detail Endpoint
 *
 * GET /api/v1/pipelines/executions/:id - Get execution detail with step executions
 *
 * @route GET /api/v1/pipelines/executions/:id
 */

import { NextRequest, NextResponse } from 'next/server';
import { withApiAuth } from '@/lib/api/middleware/auth';
import { getExecutionDetail, PipelineError } from '@/lib/modules/pipelines';

/**
 * Extract execution ID from URL
 */
function extractExecutionId(request: NextRequest): string | null {
  const url = new URL(request.url);
  const pathParts = url.pathname.split('/');
  const executionsIndex = pathParts.indexOf('executions');
  return executionsIndex !== -1 ? pathParts[executionsIndex + 1] : null;
}

/**
 * GET /api/v1/pipelines/executions/:id
 *
 * Returns detailed execution information including step-by-step progress,
 * outputs, reasoning, costs, and durations.
 */
export const GET = withApiAuth(async (request: NextRequest, { tenant }) => {
  try {
    const executionId = extractExecutionId(request);

    if (!executionId) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_REQUEST',
            message: 'Execution ID is required',
            suggestedResolution: {
              action: 'RETRY_WITH_MODIFIED_INPUT',
              description: 'Include a valid execution ID in the URL path.',
              retryable: false,
            },
          },
        },
        { status: 400 }
      );
    }

    const execution = await getExecutionDetail(tenant.id, executionId);

    return NextResponse.json(
      {
        success: true,
        data: execution,
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

    console.error('[PIPELINE_EXECUTION_GET] Error:', error);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message:
            error instanceof Error ? error.message : 'An error occurred fetching execution detail',
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
    case 'EXECUTION_NOT_FOUND':
      return 'The specified execution was not found.';
    default:
      return 'An error occurred while processing the execution request.';
  }
}
