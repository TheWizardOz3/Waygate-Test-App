/**
 * Scrape Job Re-analyze API
 *
 * POST /api/v1/scrape/:jobId/reanalyze
 *
 * Re-runs AI extraction on cached scraped content without re-scraping.
 * Useful when previous extraction failed due to API key issues or rate limits.
 */

import { NextRequest } from 'next/server';
import { withApiAuth } from '@/lib/api/middleware/auth';
import { successResponse, errorResponse } from '@/lib/api/response';
import { reanalyzeJob, getScrapeJob, ScrapeJobError } from '@/lib/modules/ai';

// =============================================================================
// POST /api/v1/scrape/:jobId/reanalyze - Re-analyze a scrape job
// =============================================================================

export const POST = withApiAuth(async (request: NextRequest, { tenant }) => {
  // Extract jobId from URL path
  const url = new URL(request.url);
  const pathParts = url.pathname.split('/');
  const scrapeIndex = pathParts.indexOf('scrape');
  const jobId = pathParts[scrapeIndex + 1];

  if (!jobId || jobId === 'reanalyze') {
    return errorResponse('VALIDATION_ERROR', 'Job ID is required', 400);
  }

  try {
    // Re-analyze the job (will throw if not possible)
    await reanalyzeJob(jobId, tenant.id, {
      onProgress: (stage, message) => {
        console.log(`[Reanalyze ${jobId}] ${stage}: ${message}`);
      },
    });

    // Get the updated job
    const updatedJob = await getScrapeJob(tenant.id, jobId);

    return successResponse(
      {
        jobId,
        status: updatedJob.status,
        ...(updatedJob.status === 'COMPLETED' &&
          'result' in updatedJob && {
            result: updatedJob.result,
            endpointCount: updatedJob.result.endpoints?.length ?? 0,
          }),
        ...(updatedJob.status === 'FAILED' &&
          'error' in updatedJob && {
            error: updatedJob.error,
          }),
        message:
          updatedJob.status === 'COMPLETED'
            ? `Re-analysis complete. Found ${('result' in updatedJob ? updatedJob.result.endpoints?.length : 0) ?? 0} endpoints.`
            : 'Re-analysis failed. Check error details.',
      },
      updatedJob.status === 'COMPLETED' ? 200 : 500
    );
  } catch (error) {
    if (error instanceof ScrapeJobError) {
      return errorResponse(error.code, error.message, error.statusCode);
    }

    console.error('Reanalyze job error:', error);
    return errorResponse(
      'INTERNAL_ERROR',
      error instanceof Error ? error.message : 'An error occurred while re-analyzing the job',
      500
    );
  }
});
