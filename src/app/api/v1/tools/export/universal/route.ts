/**
 * All Tools Export - Universal Format
 *
 * GET /api/v1/tools/export/universal - Export all tools in universal (LLM-agnostic) format
 *
 * This endpoint exports all tools (simple, composite, agentic) across all integrations
 * in a format compatible with OpenAI, Anthropic, Gemini, and LangChain.
 *
 * @route GET /api/v1/tools/export/universal
 */

import { NextRequest, NextResponse } from 'next/server';
import { withApiAuth } from '@/lib/api/middleware/auth';
import { exportAllToolsUniversal } from '@/lib/modules/tool-export/tool-export.service';

/**
 * GET /api/v1/tools/export/universal
 *
 * Returns all tools in universal format for the authenticated tenant.
 *
 * Query Parameters:
 * - `includeMetadata` (optional): Include action metadata in descriptions
 * - `maxDescriptionLength` (optional): Maximum description length
 * - `includeContextTypes` (optional): Include context type declarations
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
    };

    // Export all tools
    const result = await exportAllToolsUniversal(tenant.id, options);

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
    console.error('[ALL_TOOLS_EXPORT_UNIVERSAL] Error:', error);

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
