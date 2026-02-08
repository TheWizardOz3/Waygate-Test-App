/**
 * Drift Summary Endpoint
 *
 * GET /api/v1/integrations/:id/drift/summary
 *
 * Returns unresolved drift report counts by severity for an integration.
 * Used by the UI badge and auto-maintenance prioritization.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withApiAuth } from '@/lib/api/middleware/auth';
import { getIntegrationDriftSummary } from '@/lib/modules/schema-drift/schema-drift.service';
import { SchemaDriftError } from '@/lib/modules/schema-drift/schema-drift.errors';

/**
 * Extract integration ID from URL path
 * URL pattern: /api/v1/integrations/{id}/drift/summary
 */
function extractIntegrationId(url: string): string | null {
  const urlObj = new URL(url);
  const pathParts = urlObj.pathname.split('/');
  const integrationsIndex = pathParts.indexOf('integrations');
  if (integrationsIndex === -1) return null;
  return pathParts[integrationsIndex + 1] || null;
}

/**
 * GET /api/v1/integrations/:id/drift/summary
 *
 * Returns: { breaking: number, warning: number, info: number, total: number }
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

    const summary = await getIntegrationDriftSummary(tenant.id, integrationId);

    return NextResponse.json(
      {
        success: true,
        data: summary,
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

    console.error('[DRIFT_SUMMARY] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'An error occurred while fetching the drift summary',
        },
      },
      { status: 500 }
    );
  }
});
