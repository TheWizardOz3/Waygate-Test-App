/**
 * Single Proposal Detail
 *
 * GET /api/v1/integrations/:id/maintenance/proposals/:proposalId
 *
 * Get full proposal detail including schemas, changes, affected tools,
 * and description suggestions.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withApiAuth } from '@/lib/api/middleware/auth';
import { getProposal } from '@/lib/modules/auto-maintenance/auto-maintenance.service';
import { AutoMaintenanceError } from '@/lib/modules/auto-maintenance/auto-maintenance.errors';

/**
 * Extract proposalId from URL path.
 */
function extractProposalId(url: string): string | null {
  const urlObj = new URL(url);
  const pathParts = urlObj.pathname.split('/');
  const proposalsIndex = pathParts.indexOf('proposals');
  if (proposalsIndex === -1) return null;
  const proposalId = pathParts[proposalsIndex + 1];
  // Skip sub-resource paths like 'approve', 'reject', etc.
  return proposalId && !['approve', 'reject', 'revert', 'descriptions'].includes(proposalId)
    ? proposalId
    : null;
}

/**
 * GET /api/v1/integrations/:id/maintenance/proposals/:proposalId
 */
export const GET = withApiAuth(async (request: NextRequest, { tenant }) => {
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

    const proposal = await getProposal(tenant.id, proposalId);

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

    console.error('[MAINTENANCE_PROPOSAL_DETAIL] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'An error occurred fetching proposal detail',
        },
      },
      { status: 500 }
    );
  }
});
