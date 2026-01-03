/**
 * Integrations List Endpoint
 *
 * GET /api/v1/integrations
 * POST /api/v1/integrations
 *
 * Returns paginated list of integrations for the authenticated tenant.
 * Creates a new integration for the authenticated tenant.
 *
 * @route GET /api/v1/integrations
 * @route POST /api/v1/integrations
 */

import { NextRequest, NextResponse } from 'next/server';
import { withApiAuth } from '@/lib/api/middleware/auth';
import {
  listIntegrations,
  getIntegrationsWithCounts,
  createIntegration,
  IntegrationError,
} from '@/lib/modules/integrations';

/**
 * GET /api/v1/integrations
 *
 * Returns paginated list of integrations for the authenticated tenant.
 *
 * Query Parameters:
 * - `cursor` (optional): Pagination cursor from previous response
 * - `limit` (optional): Number of integrations per page (1-100, default: 20)
 * - `status` (optional): Filter by status (draft, active, error, disabled)
 * - `authType` (optional): Filter by auth type (oauth2, api_key, basic, bearer, custom_header)
 * - `tags` (optional): Filter by tags (comma-separated)
 * - `search` (optional): Search by name or slug
 * - `withCounts` (optional): Include action counts (true/false)
 */
export const GET = withApiAuth(async (request: NextRequest, { tenant }) => {
  try {
    const url = new URL(request.url);
    const query = {
      cursor: url.searchParams.get('cursor') ?? undefined,
      limit: url.searchParams.get('limit') ?? undefined,
      status: url.searchParams.get('status') ?? undefined,
      authType: url.searchParams.get('authType') ?? undefined,
      tags: url.searchParams.get('tags') ?? undefined,
      search: url.searchParams.get('search') ?? undefined,
    };

    // Filter out undefined values
    const cleanQuery = Object.fromEntries(Object.entries(query).filter(([, v]) => v !== undefined));

    // Check if we should include counts
    const withCounts = url.searchParams.get('withCounts') === 'true';

    let result;
    if (withCounts) {
      result = await getIntegrationsWithCounts(tenant.id, cleanQuery);
    } else {
      result = await listIntegrations(tenant.id, cleanQuery);
    }

    return NextResponse.json(
      {
        success: true,
        data: result,
      },
      { status: 200 }
    );
  } catch (error) {
    if (error instanceof IntegrationError) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: error.code,
            message: error.message,
            suggestedResolution: {
              action: 'RETRY_WITH_MODIFIED_INPUT',
              description: getErrorDescription(error.code),
              retryable: true,
            },
          },
        },
        { status: error.statusCode }
      );
    }

    console.error('[INTEGRATIONS_LIST] Error:', error);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message:
            error instanceof Error ? error.message : 'An error occurred fetching integrations',
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

/**
 * POST /api/v1/integrations
 *
 * Creates a new integration for the authenticated tenant.
 *
 * Request Body:
 * - `name` (required): Display name
 * - `slug` (required): URL-safe identifier
 * - `description` (optional): Description
 * - `documentationUrl` (optional): Link to API docs
 * - `authType` (required): Authentication type
 * - `authConfig` (required): Authentication configuration
 * - `tags` (optional): Array of tags
 * - `metadata` (optional): Additional metadata
 */
export const POST = withApiAuth(async (request: NextRequest, { tenant }) => {
  try {
    const body = await request.json();

    const integration = await createIntegration(tenant.id, body);

    return NextResponse.json(
      {
        success: true,
        data: integration,
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof IntegrationError) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: error.code,
            message: error.message,
            suggestedResolution: {
              action: 'RETRY_WITH_MODIFIED_INPUT',
              description: getErrorDescription(error.code),
              retryable: error.statusCode !== 409, // Not retryable for conflicts
            },
          },
        },
        { status: error.statusCode }
      );
    }

    console.error('[INTEGRATIONS_CREATE] Error:', error);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message:
            error instanceof Error ? error.message : 'An error occurred creating integration',
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

/**
 * Get human-readable error description
 */
function getErrorDescription(code: string): string {
  switch (code) {
    case 'INTEGRATION_NOT_FOUND':
      return 'The specified integration was not found';
    case 'SLUG_ALREADY_EXISTS':
      return 'An integration with this slug already exists. Choose a different slug.';
    case 'INVALID_AUTH_CONFIG':
      return 'Invalid authentication configuration provided. Check the format and try again.';
    case 'INTEGRATION_DISABLED':
      return 'This integration is currently disabled.';
    default:
      return 'An error occurred while processing the integration request';
  }
}
