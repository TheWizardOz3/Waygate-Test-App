/**
 * Token Refresh Background Job Endpoint
 *
 * Internal endpoint called by Vercel Cron to refresh expiring OAuth2 tokens.
 * Protected by CRON_SECRET environment variable.
 *
 * Schedule: Every 5 minutes (configured in vercel.json)
 *
 * @route POST /api/v1/internal/token-refresh
 */

import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/api/response';
import { verifyCronSecret } from '@/lib/api/middleware/cron-auth';
import {
  refreshExpiringTokens,
  DEFAULT_BUFFER_MINUTES,
  type RefreshBatchResult,
} from '@/lib/modules/credentials';

// =============================================================================
// CONFIGURATION
// =============================================================================

/**
 * Maximum execution time for the refresh job (in seconds)
 * Set lower than Vercel's function timeout to ensure clean completion
 */
export const maxDuration = 60;

const LOG_PREFIX = '[TOKEN_REFRESH_CRON]';

// =============================================================================
// HANDLER
// =============================================================================

/**
 * POST /api/v1/internal/token-refresh
 *
 * Triggers token refresh for all expiring OAuth2 credentials.
 * Called by Vercel Cron every 5 minutes.
 *
 * @returns Summary of refresh operation including success/failure counts
 */
export async function POST(request: NextRequest) {
  // Verify request is from Vercel Cron
  if (!verifyCronSecret(request, LOG_PREFIX)) {
    return errorResponse('UNAUTHORIZED', 'Invalid or missing cron secret', 401);
  }

  try {
    console.info('[TOKEN_REFRESH_CRON] Starting scheduled token refresh job');

    // Parse optional buffer time from query params (for testing)
    const url = new URL(request.url);
    const bufferParam = url.searchParams.get('bufferMinutes');
    const bufferMinutes = bufferParam ? parseInt(bufferParam, 10) : DEFAULT_BUFFER_MINUTES;

    // Run the refresh
    const result: RefreshBatchResult = await refreshExpiringTokens(bufferMinutes);

    console.info(
      `[TOKEN_REFRESH_CRON] Job complete: ${result.successful}/${result.totalProcessed} successful`
    );

    // Return summary (without sensitive data)
    return successResponse({
      message: 'Token refresh job completed',
      summary: {
        startedAt: result.startedAt.toISOString(),
        completedAt: result.completedAt.toISOString(),
        durationMs: result.completedAt.getTime() - result.startedAt.getTime(),
        totalProcessed: result.totalProcessed,
        successful: result.successful,
        failed: result.failed,
        skipped: result.skipped,
      },
      // Include individual results for debugging (without tokens)
      results: result.results.map((r) => ({
        credentialId: r.credentialId,
        integrationId: r.integrationId,
        success: r.success,
        retryCount: r.retryCount,
        rotatedRefreshToken: r.rotatedRefreshToken,
        error: r.error,
      })),
    });
  } catch (error) {
    console.error('[TOKEN_REFRESH_CRON] Job failed with error:', error);

    return errorResponse(
      'REFRESH_JOB_FAILED',
      error instanceof Error ? error.message : 'An unexpected error occurred during token refresh',
      500
    );
  }
}

/**
 * GET /api/v1/internal/token-refresh
 *
 * Returns the status/configuration of the token refresh job.
 * Useful for health checks and debugging.
 */
export async function GET(request: NextRequest) {
  // Verify request is from Vercel Cron or authorized user
  if (!verifyCronSecret(request, LOG_PREFIX)) {
    return errorResponse('UNAUTHORIZED', 'Invalid or missing cron secret', 401);
  }

  return successResponse({
    endpoint: '/api/v1/internal/token-refresh',
    method: 'POST',
    schedule: '*/5 * * * *',
    description: 'Refreshes OAuth2 tokens expiring within the buffer window',
    configuration: {
      bufferMinutes: DEFAULT_BUFFER_MINUTES,
      maxRetries: 3,
      backoffMs: [1000, 2000, 4000],
    },
    status: 'ready',
  });
}
