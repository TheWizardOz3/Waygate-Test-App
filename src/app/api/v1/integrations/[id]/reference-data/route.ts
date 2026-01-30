/**
 * Reference Data Endpoints
 *
 * GET /api/v1/integrations/:id/reference-data
 *   - List cached reference data for an integration
 *   - Supports filtering by dataType, status, search, connectionId
 *   - Supports cursor-based pagination
 *
 * @route GET /api/v1/integrations/:id/reference-data
 *
 * @example
 * ```
 * GET /api/v1/integrations/123e4567-e89b-12d3-a456-426614174000/reference-data?dataType=users&limit=50
 * Authorization: Bearer wg_live_xxx
 *
 * Response:
 * {
 *   "success": true,
 *   "data": [...],
 *   "pagination": { "cursor": null, "hasMore": false, "totalCount": 25 }
 * }
 * ```
 */

import { NextRequest, NextResponse } from 'next/server';
import { withApiAuth } from '@/lib/api/middleware/auth';
import { findIntegrationById } from '@/lib/modules/integrations/integration.repository';
import {
  findByIntegrationId,
  getTypeSummary,
} from '@/lib/modules/reference-data/reference-data.repository';
import {
  ListReferenceDataQuerySchema,
  toListReferenceDataResponse,
} from '@/lib/modules/reference-data/reference-data.schemas';

/**
 * GET /api/v1/integrations/:id/reference-data
 *
 * Returns paginated reference data for an integration.
 *
 * Query Parameters:
 * - dataType: Filter by data type (e.g., 'users', 'channels')
 * - status: Filter by status ('active', 'inactive', 'deleted')
 * - search: Search in name or externalId
 * - connectionId: Filter by specific connection
 * - cursor: Pagination cursor
 * - limit: Items per page (default 100, max 500)
 * - summary: If 'true', returns summary by data type instead of items
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

    // Check for summary request
    if (queryParams.summary === 'true') {
      const summary = await getTypeSummary(integrationId, queryParams.connectionId);

      return NextResponse.json(
        {
          success: true,
          data: summary.map((s) => ({
            dataType: s.dataType,
            totalCount: s.totalCount,
            activeCount: s.activeCount,
            lastSyncedAt: s.lastSyncedAt?.toISOString() ?? null,
          })),
        },
        { status: 200 }
      );
    }

    // Validate query parameters
    const parsed = ListReferenceDataQuerySchema.safeParse(queryParams);

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

    const { cursor, limit, dataType, status, search, connectionId } = parsed.data;

    // Fetch reference data
    const result = await findByIntegrationId(
      integrationId,
      { cursor, limit },
      { dataType, status, search, connectionId }
    );

    // Transform to API response format
    const response = toListReferenceDataResponse(result.data, result.nextCursor, result.totalCount);

    return NextResponse.json({ success: true, ...response }, { status: 200 });
  } catch (error) {
    console.error('[REFERENCE_DATA] Error:', error);

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
 * URL pattern: /api/v1/integrations/{id}/reference-data
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
