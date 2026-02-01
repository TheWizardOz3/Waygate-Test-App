/**
 * API Route: GET /api/v1/integrations/[id]/composite-tools
 *
 * Returns composite tools that use any action from the specified integration.
 * Used for displaying "Used in AI Tools" sections in the UI.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withApiAuth } from '@/lib/api/middleware/auth';
import { getCompositeToolsForIntegration } from '@/lib/modules/composite-tools/composite-tool.service';

/**
 * Extract integration ID from URL
 */
function extractIntegrationId(request: NextRequest): string | null {
  const url = new URL(request.url);
  const pathParts = url.pathname.split('/');
  const integrationsIndex = pathParts.indexOf('integrations');
  return integrationsIndex !== -1 ? pathParts[integrationsIndex + 1] : null;
}

/**
 * GET /api/v1/integrations/[id]/composite-tools
 *
 * Returns a list of composite tools that include any action from this integration.
 */
export const GET = withApiAuth(async (request: NextRequest, { tenant }) => {
  const integrationId = extractIntegrationId(request);

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

  const compositeTools = await getCompositeToolsForIntegration(tenant.id, integrationId);

  return NextResponse.json({ compositeTools });
});
