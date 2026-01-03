/**
 * Request Logs Endpoint
 *
 * GET /api/v1/logs
 *
 * Returns paginated request logs for the authenticated tenant.
 * Supports filtering by integration, action, and date range.
 *
 * @route GET /api/v1/logs
 *
 * @example
 * ```
 * GET /api/v1/logs?integrationId=xxx&limit=20&cursor=abc
 * Authorization: Bearer wg_live_xxx
 *
 * Response:
 * {
 *   "success": true,
 *   "data": {
 *     "logs": [
 *       {
 *         "id": "...",
 *         "integrationId": "...",
 *         "actionId": "...",
 *         "requestSummary": { "method": "POST", "url": "..." },
 *         "responseSummary": { "statusCode": 200, "body": {...} },
 *         "statusCode": 200,
 *         "latencyMs": 234,
 *         "retryCount": 0,
 *         "error": null,
 *         "createdAt": "2026-01-02T..."
 *       }
 *     ],
 *     "pagination": {
 *       "cursor": "next-cursor",
 *       "hasMore": true,
 *       "totalCount": 150
 *     }
 *   }
 * }
 * ```
 */

import { NextRequest, NextResponse } from 'next/server';
import { withApiAuth } from '@/lib/api/middleware/auth';
import { listRequestLogs, LoggingError, type ListLogsResponse } from '@/lib/modules/logging';

/**
 * GET /api/v1/logs
 *
 * Returns paginated request logs for the authenticated tenant.
 *
 * Query Parameters:
 * - `integrationId` (optional): Filter by integration UUID
 * - `actionId` (optional): Filter by action UUID
 * - `startDate` (optional): Filter logs after this date (ISO 8601)
 * - `endDate` (optional): Filter logs before this date (ISO 8601)
 * - `cursor` (optional): Pagination cursor from previous response
 * - `limit` (optional): Number of logs per page (1-100, default: 20)
 */
export const GET = withApiAuth(async (request: NextRequest, { tenant }) => {
  try {
    // Parse query parameters
    const url = new URL(request.url);
    const query = {
      cursor: url.searchParams.get('cursor') ?? undefined,
      limit: url.searchParams.get('limit') ?? undefined,
      integrationId: url.searchParams.get('integrationId') ?? undefined,
      actionId: url.searchParams.get('actionId') ?? undefined,
      startDate: url.searchParams.get('startDate') ?? undefined,
      endDate: url.searchParams.get('endDate') ?? undefined,
    };

    // Filter out undefined values
    const cleanQuery = Object.fromEntries(Object.entries(query).filter(([, v]) => v !== undefined));

    // Get paginated logs for the tenant
    const result: ListLogsResponse = await listRequestLogs(tenant.id, cleanQuery);

    return NextResponse.json(
      {
        success: true,
        data: result,
      },
      { status: 200 }
    );
  } catch (error) {
    if (error instanceof LoggingError) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: error.code,
            message: error.message,
            suggestedResolution: {
              action: 'RETRY_WITH_MODIFIED_INPUT',
              description: getErrorDescription(error.code),
              retryable: true,
            },
          },
        },
        { status: error.statusCode }
      );
    }

    console.error('[REQUEST_LOGS] Error:', error);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'An error occurred fetching logs',
          suggestedResolution: {
            action: 'ESCALATE_TO_ADMIN',
            description: 'An internal error occurred. Please try again or contact support.',
            retryable: false,
          },
        },
      },
      { status: 500 }
    );
  }
});

/**
 * Get human-readable error description
 */
function getErrorDescription(code: string): string {
  switch (code) {
    case 'LOG_NOT_FOUND':
      return 'The specified log entry was not found';
    case 'INVALID_FILTERS':
      return 'Invalid query parameters provided. Check the filter values and try again.';
    default:
      return 'An error occurred while fetching request logs';
  }
}
