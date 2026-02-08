/**
 * Drift Reports List Endpoint
 *
 * GET /api/v1/integrations/:id/drift/reports
 *
 * Lists drift reports for an integration with cursor-based pagination
 * and optional filters (severity, status, actionId).
 */

import { NextRequest, NextResponse } from 'next/server';
import { withApiAuth } from '@/lib/api/middleware/auth';
import { listReports } from '@/lib/modules/schema-drift/schema-drift.service';
import { SchemaDriftError } from '@/lib/modules/schema-drift/schema-drift.errors';

/**
 * Extract integration ID from URL path
 * URL pattern: /api/v1/integrations/{id}/drift/reports
 */
function extractIntegrationId(url: string): string | null {
  const urlObj = new URL(url);
  const pathParts = urlObj.pathname.split('/');
  const integrationsIndex = pathParts.indexOf('integrations');
  if (integrationsIndex === -1) return null;
  return pathParts[integrationsIndex + 1] || null;
}

/**
 * GET /api/v1/integrations/:id/drift/reports
 *
 * Query params: cursor, limit, severity, status, actionId
 */
export const GET = withApiAuth(async (request: NextRequest, { tenant }) => {
  try {
    const integrationId = extractIntegrationId(request.url);

    if (!integrationId) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_REQUEST',
            message: 'Integration ID is required',
          },
        },
        { status: 400 }
      );
    }

    const { searchParams } = new URL(request.url);
    const query: Record<string, string | undefined> = {
      cursor: searchParams.get('cursor') ?? undefined,
      limit: searchParams.get('limit') ?? undefined,
      severity: searchParams.get('severity') ?? undefined,
      status: searchParams.get('status') ?? undefined,
      actionId: searchParams.get('actionId') ?? undefined,
    };

    const result = await listReports(tenant.id, integrationId, query);

    return NextResponse.json(
      {
        success: true,
        data: result,
      },
      { status: 200 }
    );
  } catch (error) {
    if (error instanceof SchemaDriftError) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: error.code,
            message: error.message,
          },
        },
        { status: error.statusCode }
      );
    }

    console.error('[DRIFT_REPORTS_LIST] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'An error occurred while listing drift reports',
        },
      },
      { status: 500 }
    );
  }
});
