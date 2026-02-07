/**
 * Pipeline List/Create Endpoint
 *
 * GET /api/v1/pipelines - List pipelines with pagination and filtering
 * POST /api/v1/pipelines - Create a new pipeline
 *
 * @route GET /api/v1/pipelines
 * @route POST /api/v1/pipelines
 */

import { NextRequest, NextResponse } from 'next/server';
import { withApiAuth } from '@/lib/api/middleware/auth';
import {
  listPipelines,
  createPipeline,
  getPipelineStats,
  PipelineError,
} from '@/lib/modules/pipelines';

/**
 * GET /api/v1/pipelines
 *
 * Returns paginated list of pipelines for the authenticated tenant.
 *
 * Query Parameters:
 * - `cursor` (optional): Pagination cursor from previous response
 * - `limit` (optional): Number of items per page (1-100, default: 20)
 * - `status` (optional): Filter by status (draft, active, disabled)
 * - `search` (optional): Search by name, slug, or description
 * - `withCounts` (optional): Include status counts (true/false)
 */
export const GET = withApiAuth(async (request: NextRequest, { tenant }) => {
  try {
    const url = new URL(request.url);
    const limit = url.searchParams.get('limit');
    const query = {
      cursor: url.searchParams.get('cursor') ?? undefined,
      limit: limit ? parseInt(limit, 10) : 20,
      status: url.searchParams.get('status') ?? undefined,
      search: url.searchParams.get('search') ?? undefined,
    };

    // Filter out undefined values (keep limit as it has a default)
    const cleanQuery = Object.fromEntries(
      Object.entries(query).filter(([k, v]) => k === 'limit' || v !== undefined)
    );

    const result = await listPipelines(tenant.id, cleanQuery);

    // Add counts if requested
    const withCounts = url.searchParams.get('withCounts') === 'true';
    let counts;
    if (withCounts) {
      counts = await getPipelineStats(tenant.id);
    }

    return NextResponse.json(
      {
        success: true,
        data: {
          ...result,
          ...(counts && { counts }),
        },
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
              retryable: true,
            },
          },
        },
        { status: error.statusCode }
      );
    }

    console.error('[PIPELINES_LIST] Error:', error);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'An error occurred fetching pipelines',
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
 * POST /api/v1/pipelines
 *
 * Creates a new pipeline for the authenticated tenant.
 * Optionally includes inline steps.
 *
 * Request Body:
 * - `name` (required): Display name
 * - `slug` (required): URL-safe identifier
 * - `description` (optional): Description
 * - `inputSchema` (optional): Pipeline input parameter schema
 * - `outputMapping` (optional): How to build final output from step results
 * - `toolDescription` (optional): LLM-optimized description for export
 * - `toolSuccessTemplate` (optional): Success response template
 * - `toolErrorTemplate` (optional): Error response template
 * - `safetyLimits` (optional): { maxCostUsd, maxDurationSeconds }
 * - `reasoningConfig` (optional): Default LLM config for inter-step reasoning
 * - `status` (optional): 'draft' | 'active' | 'disabled' (default: 'draft')
 * - `metadata` (optional): Additional metadata
 * - `steps` (optional): Array of inline step definitions
 */
export const POST = withApiAuth(async (request: NextRequest, { tenant }) => {
  try {
    const body = await request.json();

    const pipeline = await createPipeline(tenant.id, body);

    return NextResponse.json(
      {
        success: true,
        data: pipeline,
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

    console.error('[PIPELINES_CREATE] Error:', error);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'An error occurred creating pipeline',
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
    case 'DUPLICATE_STEP_SLUG':
      return 'A step with this slug already exists in the pipeline.';
    case 'INVALID_INPUT':
      return 'Invalid input provided. Check the request body and try again.';
    case 'PIPELINE_DISABLED':
      return 'This pipeline is currently disabled.';
    case 'PIPELINE_NOT_ACTIVE':
      return 'This pipeline is in draft status and cannot be invoked.';
    case 'MAX_STEPS_EXCEEDED':
      return 'Pipeline has reached the maximum number of steps (20).';
    case 'EMPTY_PIPELINE':
      return 'Pipeline must have at least one step.';
    case 'INVALID_STEP_ORDER':
      return 'Step numbers must be sequential starting from 1.';
    default:
      return 'An error occurred while processing the pipeline request.';
  }
}
