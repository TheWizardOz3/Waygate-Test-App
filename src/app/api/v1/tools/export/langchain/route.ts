/**
 * All Tools Export - LangChain Format
 *
 * GET /api/v1/tools/export/langchain - Export all tools in LangChain format
 *
 * This endpoint exports all tools (simple, composite, agentic) across all integrations
 * with LangChain-compatible schemas and code snippets.
 *
 * @route GET /api/v1/tools/export/langchain
 */

import { NextRequest, NextResponse } from 'next/server';
import { withApiAuth } from '@/lib/api/middleware/auth';
import { exportAllToolsLangChain } from '@/lib/modules/tool-export/tool-export.service';

/**
 * GET /api/v1/tools/export/langchain
 *
 * Returns all tools in LangChain format for the authenticated tenant.
 *
 * Query Parameters:
 * - `includeMetadata` (optional): Include action metadata in descriptions
 * - `maxDescriptionLength` (optional): Maximum description length
 * - `includeContextTypes` (optional): Include context type declarations
 * - `includeCodeSnippets` (optional): Include TypeScript/Python code snippets (default: true)
 * - `apiBaseUrl` (optional): Custom API base URL for code snippets
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
      includeCodeSnippets: url.searchParams.get('includeCodeSnippets') !== 'false',
      apiBaseUrl: url.searchParams.get('apiBaseUrl') ?? undefined,
    };

    // Export all tools
    const result = await exportAllToolsLangChain(tenant.id, options);

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
    console.error('[ALL_TOOLS_EXPORT_LANGCHAIN] Error:', error);

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
