/**
 * Credential Health Check Background Job Endpoint (Tier 1)
 *
 * Internal endpoint called by Vercel Cron to run credential health checks.
 * Protected by CRON_SECRET environment variable.
 *
 * Tier 1 checks verify credential validity without making external API calls:
 * - Checks if credentials exist
 * - Checks credential status (active, expired, needs_reauth)
 * - For OAuth2, checks if token will expire within 1 hour
 *
 * Schedule: Every 15 minutes (configured in vercel.json)
 *
 * @route POST /api/v1/internal/health-checks/credential
 */

import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/api/response';
import { verifyCronSecret } from '@/lib/api/middleware/cron-auth';
import {
  runCredentialCheckBatch,
  getAllConnectionsForCredentialCheck,
} from '@/lib/modules/health-checks';
import { HealthCheckTrigger } from '@prisma/client';

// =============================================================================
// CONFIGURATION
// =============================================================================

/**
 * Maximum execution time for the health check job (in seconds)
 * Set lower than Vercel's function timeout to ensure clean completion
 */
export const maxDuration = 60;

const LOG_PREFIX = '[CREDENTIAL_CHECK_CRON]';

/**
 * Default interval for credential checks (in minutes)
 */
const DEFAULT_CHECK_INTERVAL_MINUTES = 15;

/**
 * Maximum connections to check per job run
 */
const MAX_CONNECTIONS_PER_RUN = 100;

// =============================================================================
// HANDLER
// =============================================================================

/**
 * POST /api/v1/internal/health-checks/credential
 *
 * Triggers credential health checks for all connections needing a check.
 * Called by Vercel Cron every 15 minutes.
 *
 * @returns Summary of health check operation including success/failure counts
 */
export async function POST(request: NextRequest) {
  // Verify request is from Vercel Cron
  if (!verifyCronSecret(request, LOG_PREFIX)) {
    return errorResponse('UNAUTHORIZED', 'Invalid or missing cron secret', 401);
  }

  const startTime = Date.now();

  try {
    console.info('[CREDENTIAL_CHECK_CRON] Starting scheduled credential check job');

    // Parse optional interval from query params (for testing)
    const url = new URL(request.url);
    const intervalParam = url.searchParams.get('intervalMinutes');
    const intervalMinutes = intervalParam
      ? parseInt(intervalParam, 10)
      : DEFAULT_CHECK_INTERVAL_MINUTES;

    // Get connections needing credential checks
    const connectionIds = await getAllConnectionsForCredentialCheck(
      intervalMinutes,
      MAX_CONNECTIONS_PER_RUN
    );

    if (connectionIds.length === 0) {
      console.info('[CREDENTIAL_CHECK_CRON] No connections need credential checks');
      return successResponse({
        message: 'Credential check job completed - no connections to check',
        summary: {
          startedAt: new Date(startTime).toISOString(),
          completedAt: new Date().toISOString(),
          durationMs: Date.now() - startTime,
          connectionsChecked: 0,
          statusChanges: 0,
        },
      });
    }

    console.info(`[CREDENTIAL_CHECK_CRON] Checking ${connectionIds.length} connections`);

    // Run credential checks in batch
    const result = await runCredentialCheckBatch(connectionIds, HealthCheckTrigger.scheduled);

    const completedAt = new Date();
    const durationMs = completedAt.getTime() - startTime;

    console.info(
      `[CREDENTIAL_CHECK_CRON] Job complete: ${result.summary.succeeded}/${result.summary.total} successful, ` +
        `${result.summary.statusChanges} status changes, ${durationMs}ms`
    );

    // Return summary
    return successResponse({
      message: 'Credential check job completed',
      summary: {
        startedAt: new Date(startTime).toISOString(),
        completedAt: completedAt.toISOString(),
        durationMs,
        connectionsChecked: result.summary.total,
        succeeded: result.summary.succeeded,
        failed: result.summary.failed,
        statusChanges: result.summary.statusChanges,
      },
    });
  } catch (error) {
    console.error('[CREDENTIAL_CHECK_CRON] Job failed with error:', error);

    return errorResponse(
      'HEALTH_CHECK_JOB_FAILED',
      error instanceof Error
        ? error.message
        : 'An unexpected error occurred during credential checks',
      500
    );
  }
}

/**
 * GET /api/v1/internal/health-checks/credential
 *
 * Returns the status/configuration of the credential check job.
 * Useful for health checks and debugging.
 */
export async function GET(request: NextRequest) {
  // Verify request is from Vercel Cron or authorized user
  if (!verifyCronSecret(request, LOG_PREFIX)) {
    return errorResponse('UNAUTHORIZED', 'Invalid or missing cron secret', 401);
  }

  // Get count of connections needing checks
  const connectionIds = await getAllConnectionsForCredentialCheck(
    DEFAULT_CHECK_INTERVAL_MINUTES,
    1000 // Just for counting
  );

  return successResponse({
    endpoint: '/api/v1/internal/health-checks/credential',
    method: 'POST',
    schedule: '*/15 * * * *',
    tier: 1,
    description: 'Checks credential validity for connections (no API calls)',
    configuration: {
      checkIntervalMinutes: DEFAULT_CHECK_INTERVAL_MINUTES,
      maxConnectionsPerRun: MAX_CONNECTIONS_PER_RUN,
      expirationWarningMinutes: 60,
    },
    status: {
      ready: true,
      connectionsPending: connectionIds.length,
    },
  });
}
