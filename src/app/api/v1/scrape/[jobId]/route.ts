/**
 * Scrape Job Status Endpoint
 *
 * GET /api/v1/scrape/:jobId
 *
 * Returns the current status of a scraping job, including results
 * if the job has completed successfully.
 */

import { NextRequest } from 'next/server';
import { withApiAuth } from '@/lib/api/middleware/auth';
import { successResponse, errorResponse } from '@/lib/api/response';
import { getScrapeJob, ScrapeJobError } from '@/lib/modules/ai';

// =============================================================================
// GET /api/v1/scrape/:jobId - Get job status
// =============================================================================

export const GET = withApiAuth(async (request: NextRequest, { tenant }) => {
  try {
    // Extract jobId from URL path
    const url = new URL(request.url);
    const pathParts = url.pathname.split('/');
    const scrapeIndex = pathParts.indexOf('scrape');
    const jobId = pathParts[scrapeIndex + 1];

    if (!jobId) {
      return errorResponse('VALIDATION_ERROR', 'Job ID is required', 400);
    }

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(jobId)) {
      return errorResponse(
        'VALIDATION_ERROR',
        'Invalid job ID format. Expected a valid UUID.',
        400
      );
    }

    // Get the job
    const job = await getScrapeJob(tenant.id, jobId);

    // Format response based on status
    const response: Record<string, unknown> = {
      jobId: job.jobId,
      status: job.status,
      progress: job.progress,
      documentationUrl: job.documentationUrl,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    };

    // Add current step for in-progress jobs
    if ('currentStep' in job && job.currentStep) {
      response.currentStep = job.currentStep;
    }

    // Add result for completed jobs
    if (job.status === 'COMPLETED' && 'result' in job) {
      response.result = job.result;
      response.completedAt = job.completedAt;
    }

    // Add error for failed jobs
    if (job.status === 'FAILED' && 'error' in job) {
      response.error = job.error;
      response.completedAt = job.completedAt;
    }

    return successResponse(response);
  } catch (error) {
    if (error instanceof ScrapeJobError) {
      return errorResponse(error.code, error.message, error.statusCode);
    }

    console.error('Get scrape job error:', error);
    return errorResponse(
      'INTERNAL_ERROR',
      'An error occurred while fetching the scraping job',
      500
    );
  }
});

// =============================================================================
// DELETE /api/v1/scrape/:jobId - Cancel/delete a job
// =============================================================================

export const DELETE = withApiAuth(async (request: NextRequest, { tenant }) => {
  try {
    // Extract jobId from URL path
    const url = new URL(request.url);
    const pathParts = url.pathname.split('/');
    const scrapeIndex = pathParts.indexOf('scrape');
    const jobId = pathParts[scrapeIndex + 1];

    if (!jobId) {
      return errorResponse('VALIDATION_ERROR', 'Job ID is required', 400);
    }

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(jobId)) {
      return errorResponse(
        'VALIDATION_ERROR',
        'Invalid job ID format. Expected a valid UUID.',
        400
      );
    }

    // Import delete function
    const { deleteScrapeJobForTenant } = await import('@/lib/modules/ai');

    const deleted = await deleteScrapeJobForTenant(jobId, tenant.id);

    if (!deleted) {
      return errorResponse(
        'JOB_NOT_FOUND',
        'Scrape job not found or does not belong to this tenant',
        404
      );
    }

    return successResponse({
      deleted: true,
      jobId,
    });
  } catch (error) {
    console.error('Delete scrape job error:', error);
    return errorResponse(
      'INTERNAL_ERROR',
      'An error occurred while deleting the scraping job',
      500
    );
  }
});
