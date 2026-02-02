/**
 * All Tools Export - MCP Format
 *
 * GET /api/v1/tools/export/mcp - Export all tools in MCP (Model Context Protocol) format
 *
 * This endpoint exports all tools (simple, composite, agentic) across all integrations
 * with MCP-compatible server definitions for Claude Desktop and other MCP clients.
 *
 * @route GET /api/v1/tools/export/mcp
 */

import { NextRequest, NextResponse } from 'next/server';
import { withApiAuth } from '@/lib/api/middleware/auth';
import { exportAllToolsMCP } from '@/lib/modules/tool-export/tool-export.service';

/**
 * GET /api/v1/tools/export/mcp
 *
 * Returns all tools in MCP format for the authenticated tenant.
 *
 * Query Parameters:
 * - `includeMetadata` (optional): Include action metadata in descriptions
 * - `maxDescriptionLength` (optional): Maximum description length
 * - `includeContextTypes` (optional): Include context type declarations
 * - `includeServerFile` (optional): Include server file generation (default: true)
 * - `includeResources` (optional): Include resources for reference data (default: true)
 * - `serverVersion` (optional): Server version (default: 1.0.0)
 * - `apiBaseUrl` (optional): Custom API base URL for server code
 */
export const GET = withApiAuth(async (request: NextRequest, { tenant }) => {
  try {
    const url = new URL(request.url);

    // Parse query parameters
    const options = {
      includeMetadata: url.searchParams.get('includeMetadata') === 'true',
      maxDescriptionLength: url.searchParams.get('maxDescriptionLength')
        ? parseInt(url.searchParams.get('maxDescriptionLength')!, 10)
        : undefined,
      includeContextTypes: url.searchParams.get('includeContextTypes') !== 'false',
      includeServerFile: url.searchParams.get('includeServerFile') !== 'false',
      includeResources: url.searchParams.get('includeResources') !== 'false',
      serverVersion: url.searchParams.get('serverVersion') ?? undefined,
      apiBaseUrl: url.searchParams.get('apiBaseUrl') ?? undefined,
    };

    // Export all tools
    const result = await exportAllToolsMCP(tenant.id, options);

    return NextResponse.json(
      {
        success: true,
        data: result,
      },
      {
        status: 200,
        headers: {
          'Cache-Control': 'private, max-age=300', // 5 minute cache
        },
      }
    );
  } catch (error) {
    console.error('[ALL_TOOLS_EXPORT_MCP] Error:', error);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'EXPORT_FAILED',
          message: error instanceof Error ? error.message : 'Failed to export tools',
          suggestedResolution: {
            action: 'ESCALATE_TO_ADMIN',
            description: 'An error occurred exporting tools. Please try again or contact support.',
            retryable: true,
          },
        },
      },
      { status: 500 }
    );
  }
});
