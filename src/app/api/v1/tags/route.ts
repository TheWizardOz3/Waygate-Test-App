/**
 * Tags API Endpoint
 *
 * GET /api/v1/tags
 *
 * Returns all unique tags used across integrations and actions for the tenant.
 * Used for tag autocomplete in the UI.
 *
 * @route GET /api/v1/tags
 */

import { NextRequest, NextResponse } from 'next/server';
import { withApiAuth } from '@/lib/api/middleware/auth';
import { prisma } from '@/lib/db/client';

/**
 * GET /api/v1/tags
 *
 * Returns all unique tags used across integrations and actions for the tenant.
 *
 * Query Parameters:
 * - `type` (optional): Filter by source - 'integrations', 'actions', or 'all' (default: 'all')
 *
 * Response:
 * ```json
 * {
 *   "success": true,
 *   "data": {
 *     "tags": ["communication", "payments", "crm"]
 *   }
 * }
 * ```
 */
export const GET = withApiAuth(async (request: NextRequest, { tenant }) => {
  try {
    const url = new URL(request.url);
    const type = url.searchParams.get('type') ?? 'all';

    const tags = new Set<string>();

    // Get integration tags
    if (type === 'all' || type === 'integrations') {
      const integrations = await prisma.integration.findMany({
        where: { tenantId: tenant.id },
        select: { tags: true },
      });

      for (const integration of integrations) {
        for (const tag of integration.tags) {
          tags.add(tag);
        }
      }
    }

    // Get action tags
    if (type === 'all' || type === 'actions') {
      const actions = await prisma.action.findMany({
        where: {
          integration: {
            tenantId: tenant.id,
          },
        },
        select: { tags: true },
      });

      for (const action of actions) {
        for (const tag of action.tags) {
          tags.add(tag);
        }
      }
    }

    // Sort alphabetically
    const sortedTags = Array.from(tags).sort((a, b) => a.localeCompare(b));

    return NextResponse.json({
      success: true,
      data: {
        tags: sortedTags,
      },
    });
  } catch (error) {
    console.error('[Tags API] Error fetching tags:', error);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to fetch tags',
        },
      },
      { status: 500 }
    );
  }
});
