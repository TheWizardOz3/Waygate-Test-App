/**
 * Description Suggestions Decisions
 *
 * POST /api/v1/integrations/:id/maintenance/proposals/:proposalId/descriptions
 *
 * Accept or skip description update suggestions for affected tools.
 * Body: { decisions: [{ toolId: string, accept: boolean }] }
 */

import { NextRequest, NextResponse } from 'next/server';
import { withApiAuth } from '@/lib/api/middleware/auth';
import { applyDescriptionDecisions } from '@/lib/modules/auto-maintenance/auto-maintenance.service';
import { AutoMaintenanceError } from '@/lib/modules/auto-maintenance/auto-maintenance.errors';

/**
 * Extract proposalId from URL path.
 */
function extractProposalId(url: string): string | null {
  const urlObj = new URL(url);
  const pathParts = urlObj.pathname.split('/');
  const proposalsIndex = pathParts.indexOf('proposals');
  return proposalsIndex !== -1 ? pathParts[proposalsIndex + 1] || null : null;
}

/**
 * POST /api/v1/integrations/:id/maintenance/proposals/:proposalId/descriptions
 */
export const POST = withApiAuth(async (request: NextRequest, { tenant }) => {
  try {
    const proposalId = extractProposalId(request.url);
    if (!proposalId) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_REQUEST',
            message: 'Proposal ID is required',
          },
        },
        { status: 400 }
      );
    }

    const body = await request.json();
    const proposal = await applyDescriptionDecisions(tenant.id, proposalId, body);

    return NextResponse.json({ success: true, data: proposal }, { status: 200 });
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

    console.error('[MAINTENANCE_DESCRIPTIONS] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'An error occurred applying description decisions',
        },
      },
      { status: 500 }
    );
  }
});
