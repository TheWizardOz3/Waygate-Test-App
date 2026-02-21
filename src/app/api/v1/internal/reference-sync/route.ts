/**
 * Reference Data Sync Background Job Endpoint
 *
 * Internal endpoint called by Vercel Cron to run reference data syncs.
 * Protected by CRON_SECRET environment variable.
 *
 * This job finds integrations/connections that need reference data synced
 * based on TTL settings and triggers syncs in batches.
 *
 * Schedule: Every 15 minutes (configured in vercel.json)
 *
 * @route POST /api/v1/internal/reference-sync
 */

import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/api/response';
import { verifyCronSecret } from '@/lib/api/middleware/cron-auth';
import {
  findSyncCandidates,
  runBatchSync,
  getSyncQueueSummary,
} from '@/lib/modules/reference-data';

// =============================================================================
// CONFIGURATION
// =============================================================================

/**
 * Maximum execution time for the sync job (in seconds)
 * Set lower than Vercel's function timeout to ensure clean completion
 */
export const maxDuration = 60;

const LOG_PREFIX = '[REFERENCE_SYNC_CRON]';

/**
 * Default TTL for reference data in seconds (1 hour)
 */
const DEFAULT_TTL_SECONDS = 3600;

/**
 * Maximum sync candidates to process per job run
 */
const MAX_CANDIDATES_PER_RUN = 50;

/**
 * Delay between syncs in milliseconds to avoid rate limiting
 */
const DELAY_BETWEEN_SYNCS_MS = 500;

// =============================================================================
// HANDLER
// =============================================================================

/**
 * POST /api/v1/internal/reference-sync
 *
 * Triggers reference data sync for all connections/integrations needing a sync.
 * Called by Vercel Cron every 15 minutes.
 *
 * Query params:
 * - ttlSeconds: Override default TTL for determining stale data (default: 3600)
 * - limit: Maximum candidates to process (default: 50)
 * - delayMs: Delay between syncs in ms (default: 500)
 *
 * @returns Summary of sync operation including success/failure counts
 */
export async function POST(request: NextRequest) {
  // Verify request is from Vercel Cron
  if (!verifyCronSecret(request, LOG_PREFIX)) {
    return errorResponse('UNAUTHORIZED', 'Invalid or missing cron secret', 401);
  }

  const startTime = Date.now();

  try {
    console.info('[REFERENCE_SYNC_CRON] Starting scheduled reference data sync job');

    // Parse optional params from query string (for testing/tuning)
    const url = new URL(request.url);
    const ttlSeconds =
      parseInt(url.searchParams.get('ttlSeconds') ?? '', 10) || DEFAULT_TTL_SECONDS;
    const limit = parseInt(url.searchParams.get('limit') ?? '', 10) || MAX_CANDIDATES_PER_RUN;
    const delayMs = parseInt(url.searchParams.get('delayMs') ?? '', 10) || DELAY_BETWEEN_SYNCS_MS;

    // Find candidates needing sync
    const candidates = await findSyncCandidates(ttlSeconds, limit);

    if (candidates.length === 0) {
      console.info('[REFERENCE_SYNC_CRON] No sync candidates found');
      return successResponse({
        message: 'Reference sync job completed - no candidates to sync',
        summary: {
          startedAt: new Date(startTime).toISOString(),
          completedAt: new Date().toISOString(),
          durationMs: Date.now() - startTime,
          totalCandidates: 0,
          syncsAttempted: 0,
          syncsSucceeded: 0,
          syncsFailed: 0,
          syncsSkipped: 0,
        },
      });
    }

    console.info(`[REFERENCE_SYNC_CRON] Found ${candidates.length} sync candidates`);

    // Run batch sync
    const result = await runBatchSync(candidates, {
      delayBetweenSyncsMs: delayMs,
    });

    const completedAt = new Date();
    const durationMs = completedAt.getTime() - startTime;

    console.info(
      `[REFERENCE_SYNC_CRON] Job complete: ${result.syncsSucceeded}/${result.syncsAttempted} succeeded, ` +
        `${result.syncsFailed} failed, ${result.syncsSkipped} skipped, ${durationMs}ms`
    );

    // Return summary
    return successResponse({
      message: 'Reference sync job completed',
      summary: {
        startedAt: new Date(startTime).toISOString(),
        completedAt: completedAt.toISOString(),
        durationMs,
        totalCandidates: result.totalCandidates,
        syncsAttempted: result.syncsAttempted,
        syncsSucceeded: result.syncsSucceeded,
        syncsFailed: result.syncsFailed,
        syncsSkipped: result.syncsSkipped,
      },
      errors: result.errors.length > 0 ? result.errors : undefined,
    });
  } catch (error) {
    console.error('[REFERENCE_SYNC_CRON] Job failed with error:', error);

    return errorResponse(
      'REFERENCE_SYNC_JOB_FAILED',
      error instanceof Error ? error.message : 'An unexpected error occurred during reference sync',
      500
    );
  }
}

/**
 * GET /api/v1/internal/reference-sync
 *
 * Returns the status/configuration of the reference sync job.
 * Useful for health checks and debugging.
 */
export async function GET(request: NextRequest) {
  // Verify request is from Vercel Cron or authorized user
  if (!verifyCronSecret(request, LOG_PREFIX)) {
    return errorResponse('UNAUTHORIZED', 'Invalid or missing cron secret', 401);
  }

  try {
    // Get summary of pending sync work
    const summary = await getSyncQueueSummary(DEFAULT_TTL_SECONDS);

    return successResponse({
      endpoint: '/api/v1/internal/reference-sync',
      method: 'POST',
      schedule: '*/15 * * * *',
      description: 'Syncs reference data from external APIs based on configured TTL',
      configuration: {
        defaultTtlSeconds: DEFAULT_TTL_SECONDS,
        maxCandidatesPerRun: MAX_CANDIDATES_PER_RUN,
        delayBetweenSyncsMs: DELAY_BETWEEN_SYNCS_MS,
      },
      status: {
        ready: true,
        pendingSyncs: summary.pendingSyncs,
        dataTypeCounts: summary.dataTypeCounts,
      },
    });
  } catch (error) {
    console.error('[REFERENCE_SYNC_CRON] Failed to get status:', error);

    return errorResponse(
      'REFERENCE_SYNC_STATUS_FAILED',
      error instanceof Error ? error.message : 'Failed to get sync status',
      500
    );
  }
}
