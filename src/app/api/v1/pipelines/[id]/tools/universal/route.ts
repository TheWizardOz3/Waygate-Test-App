/**
 * Pipeline Universal Export Endpoint
 *
 * GET /api/v1/pipelines/:id/tools/universal - Export pipeline as Universal tool
 *
 * @route GET /api/v1/pipelines/:id/tools/universal
 */

import { NextRequest, NextResponse } from 'next/server';
import { withApiAuth } from '@/lib/api/middleware/auth';
import {
  getPipelineById,
  createPipelineExportResponse,
  PipelineError,
} from '@/lib/modules/pipelines';

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
 * GET /api/v1/pipelines/:id/tools/universal
 *
 * Returns the pipeline exported as a Universal tool definition.
 * The pipeline appears as a single tool — internal step complexity is hidden.
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

    const pipeline = await getPipelineById(tenant.id, pipelineId);
    const exportResponse = createPipelineExportResponse(pipeline);

    return NextResponse.json(
      {
        success: true,
        data: exportResponse,
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
              description:
                error.code === 'PIPELINE_NOT_FOUND'
                  ? 'The specified pipeline was not found.'
                  : 'An error occurred exporting the pipeline.',
              retryable: false,
            },
          },
        },
        { status: error.statusCode }
      );
    }

    console.error('[PIPELINE_EXPORT_UNIVERSAL] Error:', error);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'An error occurred exporting pipeline',
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
