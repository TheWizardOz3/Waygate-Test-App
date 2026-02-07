/**
 * Pipeline Detail Endpoint
 *
 * GET /api/v1/pipelines/:id - Get pipeline details (with steps)
 * PATCH /api/v1/pipelines/:id - Update pipeline
 * DELETE /api/v1/pipelines/:id - Delete pipeline
 *
 * @route GET /api/v1/pipelines/:id
 * @route PATCH /api/v1/pipelines/:id
 * @route DELETE /api/v1/pipelines/:id
 */

import { NextRequest, NextResponse } from 'next/server';
import { withApiAuth } from '@/lib/api/middleware/auth';
import {
  getPipelineDetail,
  updatePipeline,
  deletePipeline,
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
 * GET /api/v1/pipelines/:id
 *
 * Returns detailed pipeline information including steps.
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

    const pipeline = await getPipelineDetail(tenant.id, pipelineId);

    return NextResponse.json(
      {
        success: true,
        data: pipeline,
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

    console.error('[PIPELINE_GET] Error:', error);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'An error occurred fetching pipeline',
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
 * PATCH /api/v1/pipelines/:id
 *
 * Updates a pipeline.
 *
 * Request Body (all optional):
 * - `name`: Display name
 * - `slug`: URL-safe identifier
 * - `description`: Description
 * - `inputSchema`: Pipeline input parameter schema
 * - `outputMapping`: Output mapping configuration
 * - `toolDescription`: LLM-optimized description
 * - `toolSuccessTemplate`: Success response template
 * - `toolErrorTemplate`: Error response template
 * - `safetyLimits`: Safety limits
 * - `reasoningConfig`: Default LLM config for reasoning
 * - `status`: 'draft' | 'active' | 'disabled'
 * - `metadata`: Additional metadata
 */
export const PATCH = withApiAuth(async (request: NextRequest, { tenant }) => {
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
    const pipeline = await updatePipeline(tenant.id, pipelineId, body);

    return NextResponse.json(
      {
        success: true,
        data: pipeline,
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

    console.error('[PIPELINE_UPDATE] Error:', error);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'An error occurred updating pipeline',
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
 * DELETE /api/v1/pipelines/:id
 *
 * Deletes a pipeline and all associated steps and execution records.
 */
export const DELETE = withApiAuth(async (request: NextRequest, { tenant }) => {
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

    await deletePipeline(tenant.id, pipelineId);

    return NextResponse.json(
      {
        success: true,
        message: 'Pipeline deleted successfully',
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

    console.error('[PIPELINE_DELETE] Error:', error);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'An error occurred deleting pipeline',
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
    case 'DUPLICATE_SLUG':
      return 'A pipeline with this slug already exists. Choose a different slug.';
    case 'INVALID_INPUT':
      return 'Invalid input provided. Check the request body and try again.';
    case 'PIPELINE_DISABLED':
      return 'This pipeline is currently disabled.';
    default:
      return 'An error occurred while processing the pipeline request.';
  }
}
