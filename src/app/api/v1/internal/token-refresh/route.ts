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

// =============================================================================
// SECURITY
// =============================================================================

/**
 * Verifies that the request is from Vercel Cron
 *
 * Vercel Cron includes an Authorization header with the CRON_SECRET when configured.
 * In development, we allow requests without the secret for testing.
 */
function verifyCronSecret(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;

  // In development without CRON_SECRET, allow requests for testing
  if (!cronSecret && process.env.NODE_ENV === 'development') {
    console.warn('[TOKEN_REFRESH_CRON] CRON_SECRET not set, allowing request in development');
    return true;
  }

  // In production, CRON_SECRET must be set
  if (!cronSecret) {
    console.error('[TOKEN_REFRESH_CRON] CRON_SECRET environment variable not set');
    return false;
  }

  // Check Authorization header
  const authHeader = request.headers.get('authorization');
  if (!authHeader) {
    console.warn('[TOKEN_REFRESH_CRON] Missing Authorization header');
    return false;
  }

  // Vercel Cron sends: Authorization: Bearer <CRON_SECRET>
  const expectedHeader = `Bearer ${cronSecret}`;
  if (authHeader !== expectedHeader) {
    console.warn('[TOKEN_REFRESH_CRON] Invalid Authorization header');
    return false;
  }

  return true;
}

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
  if (!verifyCronSecret(request)) {
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
  if (!verifyCronSecret(request)) {
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
