/**
 * Maintenance Proposals List & Trigger
 *
 * GET /api/v1/integrations/:id/maintenance/proposals
 * POST /api/v1/integrations/:id/maintenance/proposals
 *
 * List proposals for an integration (paginated, filterable).
 * Trigger manual proposal generation for an integration.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withApiAuth } from '@/lib/api/middleware/auth';
import {
  listProposals,
  generateProposalsForIntegration,
} from '@/lib/modules/auto-maintenance/auto-maintenance.service';
import { AutoMaintenanceError } from '@/lib/modules/auto-maintenance/auto-maintenance.errors';

/**
 * Extract integration ID from URL path.
 */
function extractIntegrationId(url: string): string | null {
  const urlObj = new URL(url);
  const pathParts = urlObj.pathname.split('/');
  const integrationsIndex = pathParts.indexOf('integrations');
  return integrationsIndex !== -1 ? pathParts[integrationsIndex + 1] || null : null;
}

/**
 * GET /api/v1/integrations/:id/maintenance/proposals
 *
 * Returns paginated list of maintenance proposals for an integration.
 * Query params: cursor, limit, status, severity, actionId
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
    const query = {
      cursor: searchParams.get('cursor') || undefined,
      limit: searchParams.get('limit') || undefined,
      status: searchParams.get('status') || undefined,
      severity: searchParams.get('severity') || undefined,
      actionId: searchParams.get('actionId') || undefined,
    };

    const result = await listProposals(tenant.id, integrationId, query);

    return NextResponse.json({ success: true, data: result }, { status: 200 });
  } catch (error) {
    if (error instanceof AutoMaintenanceError) {
      return NextResponse.json(
        {
          success: false,
          error: { code: error.code, message: error.message },
        },
        { status: error.statusCode }
      );
    }

    console.error('[MAINTENANCE_PROPOSALS_LIST] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'An error occurred listing maintenance proposals',
        },
      },
      { status: 500 }
    );
  }
});

/**
 * POST /api/v1/integrations/:id/maintenance/proposals
 *
 * Trigger manual proposal generation for an integration.
 */
export const POST = withApiAuth(async (request: NextRequest, { tenant }) => {
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

    const result = await generateProposalsForIntegration(integrationId, tenant.id);

    return NextResponse.json({ success: true, data: result }, { status: 201 });
  } catch (error) {
    if (error instanceof AutoMaintenanceError) {
      return NextResponse.json(
        {
          success: false,
          error: { code: error.code, message: error.message },
        },
        { status: error.statusCode }
      );
    }

    console.error('[MAINTENANCE_PROPOSALS_GENERATE] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'An error occurred generating maintenance proposals',
        },
      },
      { status: 500 }
    );
  }
});
