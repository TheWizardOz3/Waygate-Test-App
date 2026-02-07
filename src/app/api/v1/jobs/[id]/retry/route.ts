/**
 * Retry Job Endpoint
 *
 * POST /api/v1/jobs/:id/retry — Retries a failed job.
 *
 * @route POST /api/v1/jobs/:id/retry
 */

import { NextRequest, NextResponse } from 'next/server';
import { withApiAuth } from '@/lib/api/middleware/auth';
import { JobError, JobNotFoundError, jobQueue, toAsyncJobResponse } from '@/lib/modules/jobs';
import * as repo from '@/lib/modules/jobs/jobs.repository';

/**
 * Extract job ID from URL path.
 * URL pattern: /api/v1/jobs/{id}/retry
 */
function extractJobId(url: string): string | null {
  const urlObj = new URL(url);
  const pathParts = urlObj.pathname.split('/');

  const jobsIndex = pathParts.indexOf('jobs');
  if (jobsIndex === -1) return null;

  return pathParts[jobsIndex + 1] || null;
}

/**
 * POST /api/v1/jobs/:id/retry
 *
 * Retries a failed job by re-enqueueing it.
 */
export const POST = withApiAuth(async (request: NextRequest, { tenant }) => {
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

    await jobQueue.retryJob(jobId);

    const updated = await repo.findAsyncJobById(jobId);
    if (!updated) throw new JobNotFoundError(jobId);

    return NextResponse.json(
      {
        success: true,
        data: toAsyncJobResponse(updated),
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

    console.error('[JOB_RETRY] Error:', error);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'An error occurred retrying job',
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
