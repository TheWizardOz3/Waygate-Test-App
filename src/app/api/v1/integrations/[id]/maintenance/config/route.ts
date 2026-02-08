/**
 * Maintenance Configuration
 *
 * GET /api/v1/integrations/:id/maintenance/config
 * PATCH /api/v1/integrations/:id/maintenance/config
 *
 * Get or update per-integration auto-maintenance configuration.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withApiAuth } from '@/lib/api/middleware/auth';
import {
  getMaintenanceConfig,
  updateMaintenanceConfig,
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
 * GET /api/v1/integrations/:id/maintenance/config
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

    const config = await getMaintenanceConfig(tenant.id, integrationId);

    return NextResponse.json({ success: true, data: config }, { status: 200 });
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

    console.error('[MAINTENANCE_CONFIG_GET] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'An error occurred fetching maintenance config',
        },
      },
      { status: 500 }
    );
  }
});

/**
 * PATCH /api/v1/integrations/:id/maintenance/config
 *
 * Update maintenance configuration. Partial updates supported.
 * Body: { enabled?: boolean, autoApproveInfoLevel?: boolean, rescrapeOnBreaking?: boolean }
 */
export const PATCH = withApiAuth(async (request: NextRequest, { tenant }) => {
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

    const body = await request.json();
    const config = await updateMaintenanceConfig(tenant.id, integrationId, body);

    return NextResponse.json({ success: true, data: config }, { status: 200 });
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

    console.error('[MAINTENANCE_CONFIG_UPDATE] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'An error occurred updating maintenance config',
        },
      },
      { status: 500 }
    );
  }
});
