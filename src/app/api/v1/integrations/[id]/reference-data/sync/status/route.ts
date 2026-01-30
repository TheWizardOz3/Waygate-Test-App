/**
 * Reference Data Sync Status Endpoint
 *
 * GET /api/v1/integrations/:id/reference-data/sync/status
 *   - Returns sync status and job history
 *
 * @route GET /api/v1/integrations/:id/reference-data/sync/status
 *
 * @example
 * ```
 * GET /api/v1/integrations/123e4567-e89b-12d3-a456-426614174000/reference-data/sync/status
 * Authorization: Bearer wg_live_xxx
 *
 * Response:
 * {
 *   "success": true,
 *   "data": {
 *     "dataTypes": [
 *       {
 *         "dataType": "users",
 *         "itemCount": 150,
 *         "lastSyncedAt": "2026-01-29T12:00:00.000Z",
 *         "lastJobStatus": "completed"
 *       }
 *     ],
 *     "recentJobs": [...]
 *   }
 * }
 * ```
 */

import { NextRequest, NextResponse } from 'next/server';
import { withApiAuth } from '@/lib/api/middleware/auth';
import { findIntegrationById } from '@/lib/modules/integrations/integration.repository';
import { findSyncJobsByIntegrationId } from '@/lib/modules/reference-data/reference-data.repository';
import { getSyncStatus } from '@/lib/modules/reference-data/sync-job.service';
import {
  toListSyncJobsResponse,
  ListSyncJobsQuerySchema,
} from '@/lib/modules/reference-data/reference-data.schemas';

/**
 * GET /api/v1/integrations/:id/reference-data/sync/status
 *
 * Returns sync status and job history for an integration.
 *
 * Query Parameters:
 * - connectionId: (optional) Filter by specific connection
 * - dataType: (optional) Filter by data type
 * - status: (optional) Filter jobs by status
 * - limit: Items per page for job history (default 20)
 * - cursor: Pagination cursor for job history
 */
export const GET = withApiAuth(async (request: NextRequest, { tenant }) => {
  try {
    // Extract integration ID from URL
    const integrationId = extractIntegrationId(request.url);

    if (!integrationId) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_REQUEST',
            message: 'Integration ID is required',
            suggestedResolution: {
              action: 'RETRY_WITH_MODIFIED_INPUT',
              description: 'Include a valid integration ID in the URL path',
              retryable: false,
            },
          },
        },
        { status: 400 }
      );
    }

    // Verify integration exists and belongs to tenant
    const integration = await findIntegrationById(integrationId);
    if (!integration || integration.tenantId !== tenant.id) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INTEGRATION_NOT_FOUND',
            message: 'The specified integration does not exist',
            suggestedResolution: {
              action: 'CHECK_INTEGRATION_ID',
              description: 'Verify the integration ID is correct and belongs to your account',
              retryable: false,
            },
          },
        },
        { status: 404 }
      );
    }

    // Parse query parameters
    const url = new URL(request.url);
    const queryParams = Object.fromEntries(url.searchParams.entries());

    // Validate query parameters
    const parsed = ListSyncJobsQuerySchema.safeParse(queryParams);

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_REQUEST',
            message: 'Invalid query parameters',
            details: parsed.error.issues,
            suggestedResolution: {
              action: 'RETRY_WITH_MODIFIED_INPUT',
              description: 'Fix the query parameter issues and retry',
              retryable: true,
            },
          },
        },
        { status: 400 }
      );
    }

    const { cursor, limit, status, dataType, connectionId, startDate, endDate } = parsed.data;

    // Get sync status (summary by data type)
    const syncStatus = await getSyncStatus(tenant.id, integrationId, connectionId, dataType);

    // Get recent sync jobs
    const jobsResult = await findSyncJobsByIntegrationId(
      integrationId,
      { cursor, limit },
      { status, dataType, connectionId, startDate, endDate }
    );

    // Transform jobs to API response format
    const jobsResponse = toListSyncJobsResponse(
      jobsResult.jobs,
      jobsResult.nextCursor,
      jobsResult.totalCount
    );

    return NextResponse.json(
      {
        success: true,
        data: {
          dataTypes: syncStatus.dataTypes.map((dt) => ({
            dataType: dt.dataType,
            itemCount: dt.itemCount,
            lastSyncedAt: dt.lastSyncedAt?.toISOString() ?? null,
            lastJobStatus: dt.lastJobStatus,
          })),
          recentJobs: jobsResponse.jobs,
          jobsPagination: jobsResponse.pagination,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('[REFERENCE_DATA_SYNC_STATUS] Error:', error);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'An error occurred',
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
 * Extract integration ID from URL path
 * URL pattern: /api/v1/integrations/{id}/reference-data/sync/status
 */
function extractIntegrationId(url: string): string | null {
  const urlObj = new URL(url);
  const pathParts = urlObj.pathname.split('/');

  // Find 'integrations' in path and get the next segment
  const integrationsIndex = pathParts.indexOf('integrations');
  if (integrationsIndex === -1) {
    return null;
  }

  return pathParts[integrationsIndex + 1] || null;
}
