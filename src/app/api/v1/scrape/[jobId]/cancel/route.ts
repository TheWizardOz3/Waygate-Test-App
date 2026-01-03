/**
 * Cancel Scrape Job API
 *
 * POST /api/v1/scrape/{jobId}/cancel
 * Cancels a running scrape job
 */

import { NextRequest } from 'next/server';
import { withApiAuth } from '@/lib/api/middleware/auth';
import { successResponse, errorResponse } from '@/lib/api/response';
import { cancelScrapeJob, markJobCancelled, ScrapeJobError } from '@/lib/modules/ai';

export const POST = withApiAuth(async (request: NextRequest, { tenant }) => {
  try {
    // Extract jobId from URL path
    const url = new URL(request.url);
    const pathParts = url.pathname.split('/');
    const scrapeIndex = pathParts.indexOf('scrape');
    const jobId = pathParts[scrapeIndex + 1];

    if (!jobId || jobId === 'cancel') {
      return errorResponse('VALIDATION_ERROR', 'Job ID is required', 400);
    }

    // Mark as cancelled so running processes can check
    markJobCancelled(jobId);

    // Cancel the job in the database
    const job = await cancelScrapeJob(jobId, tenant.id);

    return successResponse(
      {
        jobId: job.id,
        status: job.status,
        message: 'Job cancelled successfully',
      },
      200
    );
  } catch (error) {
    if (error instanceof ScrapeJobError) {
      return errorResponse(error.code, error.message, error.statusCode);
    }

    console.error('Cancel scrape job error:', error);
    return errorResponse('INTERNAL_ERROR', 'An error occurred while cancelling the job', 500);
  }
});
