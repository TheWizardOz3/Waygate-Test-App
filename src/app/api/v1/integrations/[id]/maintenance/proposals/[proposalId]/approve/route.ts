/**
 * Approve Proposal
 *
 * POST /api/v1/integrations/:id/maintenance/proposals/:proposalId/approve
 *
 * Approve and apply a pending maintenance proposal. Updates action schemas,
 * resolves drift reports, and generates description suggestions.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withApiAuth } from '@/lib/api/middleware/auth';
import { approveProposal } from '@/lib/modules/auto-maintenance/auto-maintenance.service';
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
 * POST /api/v1/integrations/:id/maintenance/proposals/:proposalId/approve
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

    const proposal = await approveProposal(tenant.id, proposalId);

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

    console.error('[MAINTENANCE_PROPOSAL_APPROVE] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'An error occurred approving the proposal',
        },
      },
      { status: 500 }
    );
  }
});
