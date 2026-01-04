/**
 * Log Statistics Endpoint
 *
 * GET /api/v1/logs/stats
 *
 * Returns aggregated log statistics for the authenticated tenant.
 *
 * @route GET /api/v1/logs/stats
 */

import { NextRequest, NextResponse } from 'next/server';
import { withApiAuth } from '@/lib/api/middleware/auth';
import { getLogStatsForTenant } from '@/lib/modules/logging';

/**
 * GET /api/v1/logs/stats
 *
 * Returns log statistics for the authenticated tenant.
 *
 * Query Parameters:
 * - `startDate` (optional): Filter logs after this date (ISO 8601)
 * - `endDate` (optional): Filter logs before this date (ISO 8601)
 * - `integrationId` (optional): Filter by integration UUID
 *
 * Response:
 * ```json
 * {
 *   "success": true,
 *   "data": {
 *     "totalRequests": 1234,
 *     "successRate": 98.5,
 *     "averageLatency": 145,
 *     "errorCount": 18,
 *     "requestsByIntegration": [...],
 *     "requestsByStatus": [...],
 *     "latencyPercentiles": { "p50": 120, "p90": 280, "p99": 450 }
 *   }
 * }
 * ```
 */
export const GET = withApiAuth(async (request: NextRequest, { tenant }) => {
  try {
    const url = new URL(request.url);
    const startDate = url.searchParams.get('startDate');

    // Default to last 7 days if no start date provided
    const since = startDate ? new Date(startDate) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const stats = await getLogStatsForTenant(tenant.id, since);

    return NextResponse.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error('[Log Stats API] Error fetching stats:', error);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to fetch log statistics',
        },
      },
      { status: 500 }
    );
  }
});
