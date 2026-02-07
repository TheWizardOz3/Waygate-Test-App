/**
 * Jobs List Endpoint
 *
 * GET /api/v1/jobs — Returns paginated list of async jobs for the authenticated tenant.
 *
 * @route GET /api/v1/jobs
 */

import { NextRequest, NextResponse } from 'next/server';
import { withApiAuth } from '@/lib/api/middleware/auth';
import { JobError } from '@/lib/modules/jobs';
import { ListJobsQuerySchema, toAsyncJobResponse } from '@/lib/modules/jobs';
import * as repo from '@/lib/modules/jobs/jobs.repository';

/**
 * GET /api/v1/jobs
 *
 * Query Parameters:
 * - `cursor` (optional): Pagination cursor from previous response
 * - `limit` (optional): Page size (1-100, default: 20)
 * - `type` (optional): Filter by job type
 * - `status` (optional): Filter by status (queued, running, completed, failed, cancelled)
 */
export const GET = withApiAuth(async (request: NextRequest, { tenant }) => {
  try {
    const url = new URL(request.url);
    const rawQuery = {
      cursor: url.searchParams.get('cursor') ?? undefined,
      limit: url.searchParams.get('limit') ?? undefined,
      type: url.searchParams.get('type') ?? undefined,
      status: url.searchParams.get('status') ?? undefined,
    };

    const parsed = ListJobsQuerySchema.safeParse(rawQuery);
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

    const { cursor, limit, type, status } = parsed.data;

    const result = await repo.findAsyncJobsPaginated(
      { cursor, limit },
      { tenantId: tenant.id, type, status }
    );

    return NextResponse.json(
      {
        success: true,
        data: {
          jobs: result.jobs.map(toAsyncJobResponse),
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
              retryable: true,
            },
          },
        },
        { status: error.statusCode }
      );
    }

    console.error('[JOBS_LIST] Error:', error);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'An error occurred fetching jobs',
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
