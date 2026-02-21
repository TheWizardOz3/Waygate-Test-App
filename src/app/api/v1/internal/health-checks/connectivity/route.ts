/**
 * Connectivity Health Check Background Job Endpoint (Tier 2)
 *
 * Internal endpoint called by Vercel Cron to run connectivity health checks.
 * Protected by CRON_SECRET environment variable.
 *
 * Tier 2 checks verify API connectivity by executing a single test action:
 * - Selects a safe test action (configured or default GET)
 * - Executes the action with timeout handling
 * - Records latency and success/failure
 *
 * Schedule: Every 12 hours (configured in vercel.json)
 *
 * @route POST /api/v1/internal/health-checks/connectivity
 */

import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/api/response';
import { verifyCronSecret } from '@/lib/api/middleware/cron-auth';
import {
  runConnectivityCheckBatch,
  getAllConnectionsForConnectivityCheck,
} from '@/lib/modules/health-checks';
import { HealthCheckTrigger } from '@prisma/client';

// =============================================================================
// CONFIGURATION
// =============================================================================

/**
 * Maximum execution time for the health check job (in seconds)
 * Connectivity checks make API calls, so we need more time
 */
export const maxDuration = 300; // 5 minutes

const LOG_PREFIX = '[CONNECTIVITY_CHECK_CRON]';

/**
 * Default interval for connectivity checks (in hours)
 */
const DEFAULT_CHECK_INTERVAL_HOURS = 12;

/**
 * Maximum connections to check per job run
 * Lower than Tier 1 since each check makes an API call
 */
const MAX_CONNECTIONS_PER_RUN = 50;

// =============================================================================
// HANDLER
// =============================================================================

/**
 * POST /api/v1/internal/health-checks/connectivity
 *
 * Triggers connectivity health checks for all connections needing a check.
 * Called by Vercel Cron every 12 hours.
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
    console.info('[CONNECTIVITY_CHECK_CRON] Starting scheduled connectivity check job');

    // Parse optional interval from query params (for testing)
    const url = new URL(request.url);
    const intervalParam = url.searchParams.get('intervalHours');
    const intervalHours = intervalParam
      ? parseInt(intervalParam, 10)
      : DEFAULT_CHECK_INTERVAL_HOURS;

    // Get connections needing connectivity checks
    const connectionIds = await getAllConnectionsForConnectivityCheck(
      intervalHours,
      MAX_CONNECTIONS_PER_RUN
    );

    if (connectionIds.length === 0) {
      console.info('[CONNECTIVITY_CHECK_CRON] No connections need connectivity checks');
      return successResponse({
        message: 'Connectivity check job completed - no connections to check',
        summary: {
          startedAt: new Date(startTime).toISOString(),
          completedAt: new Date().toISOString(),
          durationMs: Date.now() - startTime,
          connectionsChecked: 0,
          statusChanges: 0,
          avgLatencyMs: null,
        },
      });
    }

    console.info(`[CONNECTIVITY_CHECK_CRON] Checking ${connectionIds.length} connections`);

    // Run connectivity checks in batch
    const result = await runConnectivityCheckBatch(connectionIds, HealthCheckTrigger.scheduled);

    const completedAt = new Date();
    const durationMs = completedAt.getTime() - startTime;

    console.info(
      `[CONNECTIVITY_CHECK_CRON] Job complete: ${result.summary.succeeded}/${result.summary.total} successful, ` +
        `${result.summary.statusChanges} status changes, ` +
        `avg latency: ${result.summary.avgLatencyMs ?? 'N/A'}ms, ` +
        `${durationMs}ms total`
    );

    // Return summary
    return successResponse({
      message: 'Connectivity check job completed',
      summary: {
        startedAt: new Date(startTime).toISOString(),
        completedAt: completedAt.toISOString(),
        durationMs,
        connectionsChecked: result.summary.total,
        succeeded: result.summary.succeeded,
        failed: result.summary.failed,
        statusChanges: result.summary.statusChanges,
        avgLatencyMs: result.summary.avgLatencyMs,
      },
    });
  } catch (error) {
    console.error('[CONNECTIVITY_CHECK_CRON] Job failed with error:', error);

    return errorResponse(
      'HEALTH_CHECK_JOB_FAILED',
      error instanceof Error
        ? error.message
        : 'An unexpected error occurred during connectivity checks',
      500
    );
  }
}

/**
 * GET /api/v1/internal/health-checks/connectivity
 *
 * Returns the status/configuration of the connectivity check job.
 * Useful for health checks and debugging.
 */
export async function GET(request: NextRequest) {
  // Verify request is from Vercel Cron or authorized user
  if (!verifyCronSecret(request, LOG_PREFIX)) {
    return errorResponse('UNAUTHORIZED', 'Invalid or missing cron secret', 401);
  }

  // Get count of connections needing checks
  const connectionIds = await getAllConnectionsForConnectivityCheck(
    DEFAULT_CHECK_INTERVAL_HOURS,
    1000 // Just for counting
  );

  return successResponse({
    endpoint: '/api/v1/internal/health-checks/connectivity',
    method: 'POST',
    schedule: '0 */12 * * *',
    tier: 2,
    description: 'Checks API connectivity by executing a test action (1 API call per connection)',
    configuration: {
      checkIntervalHours: DEFAULT_CHECK_INTERVAL_HOURS,
      maxConnectionsPerRun: MAX_CONNECTIONS_PER_RUN,
      actionTimeoutMs: 30000,
    },
    status: {
      ready: true,
      connectionsPending: connectionIds.length,
    },
  });
}
