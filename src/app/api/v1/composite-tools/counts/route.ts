/**
 * API Route: GET /api/v1/composite-tools/counts
 *
 * Returns counts of composite tools per integration.
 * Used for displaying AI tool badges in integration lists.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withApiAuth } from '@/lib/api/middleware/auth';
import { prisma } from '@/lib/db/client';

/**
 * GET /api/v1/composite-tools/counts
 *
 * Returns a map of integrationId -> count of composite tools using that integration's actions.
 */
export const GET = withApiAuth(async (_request: NextRequest, { tenant }) => {
  // Get all operations with their action's integration ID
  const operations = await prisma.compositeToolOperation.findMany({
    where: {
      compositeTool: {
        tenantId: tenant.id,
      },
    },
    select: {
      compositeToolId: true,
      action: {
        select: {
          integrationId: true,
        },
      },
    },
  });

  // Build a map of integrationId -> Set of composite tool IDs
  const integrationToolsMap = new Map<string, Set<string>>();
  for (const op of operations) {
    const integrationId = op.action.integrationId;
    if (!integrationToolsMap.has(integrationId)) {
      integrationToolsMap.set(integrationId, new Set());
    }
    integrationToolsMap.get(integrationId)!.add(op.compositeToolId);
  }

  // Convert to count map
  const counts: Record<string, number> = {};
  integrationToolsMap.forEach((toolIds, integrationId) => {
    counts[integrationId] = toolIds.size;
  });

  return NextResponse.json({ counts });
});
