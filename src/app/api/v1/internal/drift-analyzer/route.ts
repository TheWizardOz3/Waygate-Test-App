/**
 * Drift Analyzer Cron Endpoint
 *
 * Internal endpoint called by Vercel Cron to enqueue a passive drift analysis
 * job every 6 hours. The job analyzes ValidationFailure records across all
 * integrations to detect systematic schema drift.
 *
 * Protected by CRON_SECRET environment variable.
 *
 * Schedule: Every 6 hours (configured in vercel.json)
 *
 * @route POST /api/v1/internal/drift-analyzer
 * @route GET /api/v1/internal/drift-analyzer
 */

import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/api/response';
import { verifyCronSecret } from '@/lib/api/middleware/cron-auth';
import { jobQueue } from '@/lib/modules/jobs';
import prisma from '@/lib/db/client';

// =============================================================================
// CONFIGURATION
// =============================================================================

const LOG_PREFIX = '[DRIFT_ANALYZER_CRON]';
const JOB_TYPE = 'schema_drift';

/** Timeout for drift analysis job (1 hour) */
const JOB_TIMEOUT_SECONDS = 3600;

// =============================================================================
// HANDLER
// =============================================================================

/**
 * POST /api/v1/internal/drift-analyzer
 *
 * Enqueues a passive drift analysis job if one is not already running or queued.
 * Called by Vercel Cron every 6 hours.
 */
export async function POST(request: NextRequest) {
  if (!verifyCronSecret(request, LOG_PREFIX)) {
    return errorResponse('UNAUTHORIZED', 'Invalid or missing cron secret', 401);
  }

  try {
    console.info('[DRIFT_ANALYZER_CRON] Checking for existing drift analysis jobs');

    // Check if a drift analysis job is already running or queued (prevent overlap)
    const existingJob = await prisma.asyncJob.findFirst({
      where: {
        type: JOB_TYPE,
        status: { in: ['queued', 'running'] },
      },
      select: { id: true, status: true, createdAt: true },
    });

    if (existingJob) {
      console.info(
        `[DRIFT_ANALYZER_CRON] Skipping — existing ${existingJob.status} job: ${existingJob.id}`
      );
      return successResponse({
        message: 'Drift analysis job already in progress',
        existingJobId: existingJob.id,
        existingJobStatus: existingJob.status,
        skipped: true,
      });
    }

    // Enqueue a new passive drift analysis job
    const job = await jobQueue.enqueue({
      type: JOB_TYPE,
      tenantId: null, // System-level job, not tenant-scoped
      timeoutSeconds: JOB_TIMEOUT_SECONDS,
      input: { triggerSource: 'cron' },
    });

    console.info(`[DRIFT_ANALYZER_CRON] Enqueued drift analysis job: ${job.id}`);

    return successResponse({
      message: 'Passive drift analysis job enqueued',
      jobId: job.id,
      skipped: false,
    });
  } catch (error) {
    console.error('[DRIFT_ANALYZER_CRON] Failed to enqueue drift analysis:', error);

    return errorResponse(
      'DRIFT_ANALYSIS_ENQUEUE_FAILED',
      error instanceof Error ? error.message : 'Failed to enqueue drift analysis job',
      500
    );
  }
}

/**
 * GET /api/v1/internal/drift-analyzer
 *
 * Returns status information about the drift analyzer cron.
 */
export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request, LOG_PREFIX)) {
    return errorResponse('UNAUTHORIZED', 'Invalid or missing cron secret', 401);
  }

  // Check for any recent drift analysis jobs
  const recentJob = await prisma.asyncJob.findFirst({
    where: { type: JOB_TYPE },
    orderBy: { createdAt: 'desc' },
    select: { id: true, status: true, progress: true, createdAt: true, completedAt: true },
  });

  return successResponse({
    endpoint: '/api/v1/internal/drift-analyzer',
    method: 'POST',
    schedule: '0 */6 * * *',
    description:
      'Enqueues passive drift analysis job to detect API schema changes from runtime validation failures',
    jobType: JOB_TYPE,
    configuration: {
      timeoutSeconds: JOB_TIMEOUT_SECONDS,
    },
    lastJob: recentJob ?? null,
    status: 'ready',
  });
}
