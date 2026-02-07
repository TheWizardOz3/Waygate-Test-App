/**
 * Pipeline Executions List Endpoint
 *
 * GET /api/v1/pipelines/executions - List pipeline executions
 *
 * @route GET /api/v1/pipelines/executions
 */

import { NextRequest, NextResponse } from 'next/server';
import { withApiAuth } from '@/lib/api/middleware/auth';
import { listExecutions, PipelineError } from '@/lib/modules/pipelines';

/**
 * GET /api/v1/pipelines/executions
 *
 * Returns paginated list of pipeline executions for the authenticated tenant.
 *
 * Query Parameters:
 * - `cursor` (optional): Pagination cursor from previous response
 * - `limit` (optional): Number of items per page (1-100, default: 20)
 * - `pipelineId` (optional): Filter by pipeline ID
 */
export const GET = withApiAuth(async (request: NextRequest, { tenant }) => {
  try {
    const url = new URL(request.url);
    const limit = url.searchParams.get('limit');
    const query = {
      cursor: url.searchParams.get('cursor') ?? undefined,
      limit: limit ? parseInt(limit, 10) : 20,
      pipelineId: url.searchParams.get('pipelineId') ?? undefined,
    };

    const result = await listExecutions(tenant.id, query);

    return NextResponse.json(
      {
        success: true,
        data: result,
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

    console.error('[PIPELINE_EXECUTIONS_LIST] Error:', error);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message:
            error instanceof Error
              ? error.message
              : 'An error occurred fetching pipeline executions',
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
    case 'EXECUTION_NOT_FOUND':
      return 'The specified execution was not found.';
    default:
      return 'An error occurred while processing the execution request.';
  }
}
