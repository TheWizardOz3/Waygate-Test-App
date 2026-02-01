/**
 * Unified Tools List Endpoint
 *
 * GET /api/v1/tools - List all tools (simple, composite, agentic) with unified interface
 *
 * This endpoint aggregates tools from all sources to provide a single view for
 * composite and agentic tool wizards to select from.
 *
 * @route GET /api/v1/tools
 */

import { NextRequest, NextResponse } from 'next/server';
import { withApiAuth } from '@/lib/api/middleware/auth';
import {
  listUnifiedTools,
  ListUnifiedToolsQuerySchema,
  UnifiedToolErrorCodes,
} from '@/lib/modules/tools';
import type { ToolType } from '@/lib/modules/tools';

/**
 * GET /api/v1/tools
 *
 * Returns paginated list of all tools (simple, composite, agentic) for the authenticated tenant.
 *
 * Query Parameters:
 * - `types` (optional): Comma-separated list of tool types to include (simple, composite, agentic)
 * - `integrationId` (optional): Filter simple tools by integration ID
 * - `search` (optional): Search by name, description, or slug
 * - `status` (optional): Comma-separated list of statuses to include (active, draft, disabled)
 * - `excludeIds` (optional): Comma-separated list of tool IDs to exclude
 * - `cursor` (optional): Pagination cursor from previous response
 * - `limit` (optional): Number of items per page (1-100, default: 50)
 */
export const GET = withApiAuth(async (request: NextRequest, { tenant }) => {
  try {
    const url = new URL(request.url);

    // Parse query parameters
    const rawQuery = {
      types: url.searchParams.get('types') ?? undefined,
      integrationId: url.searchParams.get('integrationId') ?? undefined,
      search: url.searchParams.get('search') ?? undefined,
      status: url.searchParams.get('status') ?? undefined,
      excludeIds: url.searchParams.get('excludeIds') ?? undefined,
      cursor: url.searchParams.get('cursor') ?? undefined,
      limit: url.searchParams.get('limit') ?? undefined,
    };

    // Filter out undefined values
    const cleanQuery = Object.fromEntries(
      Object.entries(rawQuery).filter(([, v]) => v !== undefined)
    );

    // Validate and parse query parameters
    const parseResult = ListUnifiedToolsQuerySchema.safeParse(cleanQuery);
    if (!parseResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_QUERY_PARAMETERS',
            message: 'Invalid query parameters',
            details: parseResult.error.flatten(),
            suggestedResolution: {
              action: 'RETRY_WITH_MODIFIED_INPUT',
              description: 'Check the query parameters and try again.',
              retryable: true,
            },
          },
        },
        { status: 400 }
      );
    }

    const query = parseResult.data;

    // Build filters
    const filters = {
      types: query.types as ToolType[] | undefined,
      integrationId: query.integrationId,
      search: query.search,
      status: query.status as ('active' | 'draft' | 'disabled')[] | undefined,
      excludeIds: query.excludeIds as string[] | undefined,
    };

    // Fetch unified tools
    const result = await listUnifiedTools({
      tenantId: tenant.id,
      filters,
      pagination: {
        cursor: query.cursor,
        limit: query.limit,
      },
    });

    return NextResponse.json(
      {
        success: true,
        data: result,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('[UNIFIED_TOOLS_LIST] Error:', error);

    // Check for specific error types
    if (error instanceof Error && error.message.includes(UnifiedToolErrorCodes.TOOL_NOT_FOUND)) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: UnifiedToolErrorCodes.TOOL_NOT_FOUND,
            message: 'Tool not found',
            suggestedResolution: {
              action: 'RETRY_WITH_MODIFIED_INPUT',
              description: 'The specified tool was not found.',
              retryable: true,
            },
          },
        },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'An error occurred fetching tools',
          suggestedResolution: {
            action: 'ESCALATE_TO_ADMIN',
            description: 'An internal error occurred. Please try again or contact support.',
            retryable: false,
          },
        },
      },
      { status: 500 }
    );
  }
});
