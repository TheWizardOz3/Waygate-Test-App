/**
 * API Route: GET /api/v1/actions/[id]/composite-tools
 *
 * Returns composite tools that use the specified action as an operation.
 * Used for displaying "Used in AI Tools" sections in the UI.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withApiAuth } from '@/lib/api/middleware/auth';
import { getCompositeToolsForAction } from '@/lib/modules/composite-tools/composite-tool.service';

/**
 * Extract action ID from URL
 */
function extractActionId(request: NextRequest): string | null {
  const url = new URL(request.url);
  const pathParts = url.pathname.split('/');
  const actionsIndex = pathParts.indexOf('actions');
  return actionsIndex !== -1 ? pathParts[actionsIndex + 1] : null;
}

/**
 * GET /api/v1/actions/[id]/composite-tools
 *
 * Returns a list of composite tools that include this action as an operation.
 */
export const GET = withApiAuth(async (request: NextRequest, { tenant }) => {
  const actionId = extractActionId(request);

  if (!actionId) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INVALID_REQUEST',
          message: 'Action ID is required',
        },
      },
      { status: 400 }
    );
  }

  const compositeTools = await getCompositeToolsForAction(tenant.id, actionId);

  return NextResponse.json({ compositeTools });
});
