/**
 * Maintenance Proposal Summary
 *
 * GET /api/v1/integrations/:id/maintenance/summary
 *
 * Returns proposal counts by status for an integration.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withApiAuth } from '@/lib/api/middleware/auth';
import { getProposalSummary } from '@/lib/modules/auto-maintenance/auto-maintenance.service';
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
 * GET /api/v1/integrations/:id/maintenance/summary
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

    const summary = await getProposalSummary(tenant.id, integrationId);

    return NextResponse.json({ success: true, data: summary }, { status: 200 });
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

    console.error('[MAINTENANCE_SUMMARY] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'An error occurred fetching proposal summary',
        },
      },
      { status: 500 }
    );
  }
});
