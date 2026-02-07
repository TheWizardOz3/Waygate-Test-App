/**
 * Job Items List Endpoint
 *
 * GET /api/v1/jobs/:id/items — Returns paginated list of items for a batch job.
 *
 * @route GET /api/v1/jobs/:id/items
 */

import { NextRequest, NextResponse } from 'next/server';
import { withApiAuth } from '@/lib/api/middleware/auth';
import {
  JobError,
  JobNotFoundError,
  ListJobItemsQuerySchema,
  toAsyncJobItemResponse,
} from '@/lib/modules/jobs';
import * as repo from '@/lib/modules/jobs/jobs.repository';

/**
 * Extract job ID from URL path.
 * URL pattern: /api/v1/jobs/{id}/items
 */
function extractJobId(url: string): string | null {
  const urlObj = new URL(url);
  const pathParts = urlObj.pathname.split('/');

  const jobsIndex = pathParts.indexOf('jobs');
  if (jobsIndex === -1) return null;

  return pathParts[jobsIndex + 1] || null;
}

/**
 * GET /api/v1/jobs/:id/items
 *
 * Query Parameters:
 * - `cursor` (optional): Pagination cursor
 * - `limit` (optional): Page size (1-100, default: 20)
 * - `status` (optional): Filter by item status (pending, running, completed, failed, skipped)
 */
export const GET = withApiAuth(async (request: NextRequest, { tenant }) => {
  try {
    const jobId = extractJobId(request.url);

    if (!jobId) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_REQUEST',
            message: 'Job ID is required',
            suggestedResolution: {
              action: 'RETRY_WITH_MODIFIED_INPUT',
              description: 'Include a valid job ID in the URL path',
              retryable: false,
            },
          },
        },
        { status: 400 }
      );
    }

    // Verify the job belongs to this tenant
    const job = await repo.findAsyncJobByIdAndTenant(jobId, tenant.id);
    if (!job) throw new JobNotFoundError(jobId);

    const url = new URL(request.url);
    const rawQuery = {
      cursor: url.searchParams.get('cursor') ?? undefined,
      limit: url.searchParams.get('limit') ?? undefined,
      status: url.searchParams.get('status') ?? undefined,
    };

    const parsed = ListJobItemsQuerySchema.safeParse(rawQuery);
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_INPUT',
            message: 'Invalid query parameters',
            details: parsed.error.flatten().fieldErrors,
            suggestedResolution: {
              action: 'RETRY_WITH_MODIFIED_INPUT',
              description: 'Check the query parameters and try again',
              retryable: true,
            },
          },
        },
        { status: 400 }
      );
    }

    const { cursor, limit, status } = parsed.data;

    const result = await repo.findAsyncJobItemsPaginated(jobId, { cursor, limit }, status);

    return NextResponse.json(
      {
        success: true,
        data: {
          items: result.items.map(toAsyncJobItemResponse),
          pagination: {
            cursor: result.nextCursor,
            hasMore: result.nextCursor !== null,
            totalCount: result.totalCount,
          },
        },
      },
      { status: 200 }
    );
  } catch (error) {
    if (error instanceof JobError) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: error.code,
            message: error.message,
            suggestedResolution: {
              action: 'RETRY_WITH_MODIFIED_INPUT',
              description: error.message,
              retryable: false,
            },
          },
        },
        { status: error.statusCode }
      );
    }

    console.error('[JOB_ITEMS_LIST] Error:', error);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'An error occurred fetching job items',
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
