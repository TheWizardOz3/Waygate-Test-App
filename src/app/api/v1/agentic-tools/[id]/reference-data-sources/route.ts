/**
 * Agentic Tool Reference Data Sources Endpoint
 *
 * GET /api/v1/agentic-tools/:id/reference-data-sources
 * Returns available reference data sources from integrations linked to the tool's allocated actions.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withApiAuth } from '@/lib/api/middleware/auth';
import { getAgenticToolById, AgenticToolError } from '@/lib/modules/agentic-tools';
import { getAction } from '@/lib/modules/actions';
import { getTypeSummary } from '@/lib/modules/reference-data';
import { prisma } from '@/lib/db/client';

interface ToolAllocation {
  mode?: string;
  targetActions?: { actionId: string; actionSlug: string }[];
  availableTools?: { actionId: string; actionSlug: string; description?: string }[];
}

interface ReferenceDataSource {
  integrationId: string;
  integrationName: string;
  dataType: string;
  enabled: boolean;
  lastSyncedAt?: string;
  itemCount?: number;
}

/**
 * Extract agentic tool ID from URL
 */
function extractAgenticToolId(request: NextRequest): string | null {
  const url = new URL(request.url);
  const pathParts = url.pathname.split('/');
  const agenticToolsIndex = pathParts.indexOf('agentic-tools');
  return agenticToolsIndex !== -1 ? pathParts[agenticToolsIndex + 1] : null;
}

/**
 * GET /api/v1/agentic-tools/:id/reference-data-sources
 *
 * Returns available reference data sources for the agentic tool.
 * Aggregates reference data from integrations linked to allocated actions.
 */
export const GET = withApiAuth(async (request: NextRequest, { tenant }) => {
  try {
    const agenticToolId = extractAgenticToolId(request);

    if (!agenticToolId) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_REQUEST',
            message: 'Agentic tool ID is required',
          },
        },
        { status: 400 }
      );
    }

    // Get the agentic tool
    const agenticTool = await getAgenticToolById(agenticToolId, tenant.id);
    const toolAllocation = agenticTool.toolAllocation as ToolAllocation;

    // Extract action IDs from tool allocation
    const actionIds = [
      ...(toolAllocation?.targetActions?.map((t) => t.actionId) ?? []),
      ...(toolAllocation?.availableTools?.map((t) => t.actionId) ?? []),
    ];

    if (actionIds.length === 0) {
      return NextResponse.json(
        {
          success: true,
          sources: [],
        },
        { status: 200 }
      );
    }

    // Get unique integration IDs from actions
    const integrationMap = new Map<string, string>(); // integrationId -> integrationName

    for (const actionId of actionIds) {
      try {
        const action = await getAction(tenant.id, actionId);
        if (action.integrationId && !integrationMap.has(action.integrationId)) {
          // Get integration name
          const integration = await prisma.integration.findUnique({
            where: { id: action.integrationId },
            select: { id: true, name: true },
          });
          if (integration) {
            integrationMap.set(integration.id, integration.name);
          }
        }
      } catch {
        // Skip actions that can't be found
        continue;
      }
    }

    // Get reference data summaries for each integration
    const sources: ReferenceDataSource[] = [];

    const integrationEntries = Array.from(integrationMap.entries());
    for (const [integrationId, integrationName] of integrationEntries) {
      const summaries = await getTypeSummary(integrationId);

      for (const summary of summaries) {
        sources.push({
          integrationId,
          integrationName,
          dataType: summary.dataType,
          enabled: false, // Default to disabled, client will merge with stored state
          lastSyncedAt: summary.lastSyncedAt?.toISOString(),
          itemCount: summary.activeCount,
        });
      }
    }

    return NextResponse.json(
      {
        success: true,
        sources,
      },
      { status: 200 }
    );
  } catch (error) {
    if (error instanceof AgenticToolError) {
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

    console.error('[AGENTIC_TOOL_REF_DATA_SOURCES] Error:', error);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message:
            error instanceof Error
              ? error.message
              : 'An error occurred fetching reference data sources',
        },
      },
      { status: 500 }
    );
  }
});
