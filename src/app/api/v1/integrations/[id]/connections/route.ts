/**
 * Integration Connections Endpoint
 *
 * GET /api/v1/integrations/:id/connections
 * POST /api/v1/integrations/:id/connections
 *
 * List and create connections for a specific integration.
 *
 * @route GET /api/v1/integrations/:id/connections
 * @route POST /api/v1/integrations/:id/connections
 */

import { NextRequest, NextResponse } from 'next/server';
import { withApiAuth } from '@/lib/api/middleware/auth';
import {
  listConnections,
  createConnection,
  ConnectionError,
  ConnectionStatusSchema,
  type ConnectionStatus,
} from '@/lib/modules/connections';

/**
 * Extract integration ID from URL path
 * URL pattern: /api/v1/integrations/{id}/connections
 */
function extractIntegrationId(url: string): string | null {
  const urlObj = new URL(url);
  const pathParts = urlObj.pathname.split('/');

  // Find 'integrations' in path and get the next segment
  const integrationsIndex = pathParts.indexOf('integrations');
  if (integrationsIndex === -1) {
    return null;
  }

  return pathParts[integrationsIndex + 1] || null;
}

/**
 * GET /api/v1/integrations/:id/connections
 *
 * Lists all connections for an integration with optional filtering and pagination.
 *
 * Query Parameters:
 * - `cursor`: Pagination cursor
 * - `limit`: Number of results (default: 20, max: 100)
 * - `status`: Filter by status (active, error, disabled)
 * - `isPrimary`: Filter by primary flag
 * - `search`: Search by name or slug
 */
export const GET = withApiAuth(async (request: NextRequest, { tenant }) => {
  try {
    const integrationId = extractIntegrationId(request.url);

    if (!integrationId) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_REQUEST',
            message: 'Integration ID is required',
            suggestedResolution: {
              action: 'RETRY_WITH_MODIFIED_INPUT',
              description: 'Include a valid integration ID in the URL path',
              retryable: false,
            },
          },
        },
        { status: 400 }
      );
    }

    // Parse query parameters
    const { searchParams } = new URL(request.url);

    // Validate status if provided
    const statusParam = searchParams.get('status');
    let status: ConnectionStatus | undefined;
    if (statusParam) {
      const statusResult = ConnectionStatusSchema.safeParse(statusParam);
      if (statusResult.success) {
        status = statusResult.data;
      }
      // Invalid status will be caught by service validation
    }

    const query = {
      cursor: searchParams.get('cursor') ?? undefined,
      limit: searchParams.get('limit') ? Number(searchParams.get('limit')) : undefined,
      status,
      isPrimary: searchParams.get('isPrimary')
        ? searchParams.get('isPrimary') === 'true'
        : undefined,
      search: searchParams.get('search') ?? undefined,
    };

    const result = await listConnections(tenant.id, integrationId, query);

    return NextResponse.json(
      {
        success: true,
        data: result.connections,
        pagination: result.pagination,
      },
      { status: 200 }
    );
  } catch (error) {
    if (error instanceof ConnectionError) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: error.code,
            message: error.message,
            suggestedResolution: {
              action: 'RETRY_WITH_MODIFIED_INPUT',
              description: getErrorDescription(error.code),
              retryable: false,
            },
          },
        },
        { status: error.statusCode }
      );
    }

    console.error('[CONNECTIONS_LIST] Error:', error);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'An error occurred listing connections',
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
 * POST /api/v1/integrations/:id/connections
 *
 * Creates a new connection for an integration.
 *
 * Request Body:
 * - `name`: Display name for the connection (required)
 * - `slug`: URL-safe identifier (required)
 * - `baseUrl`: Optional base URL override
 * - `isPrimary`: Whether this is the primary connection (default: false)
 * - `metadata`: Additional metadata (optional)
 */
export const POST = withApiAuth(async (request: NextRequest, { tenant }) => {
  try {
    const integrationId = extractIntegrationId(request.url);

    if (!integrationId) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_REQUEST',
            message: 'Integration ID is required',
            suggestedResolution: {
              action: 'RETRY_WITH_MODIFIED_INPUT',
              description: 'Include a valid integration ID in the URL path',
              retryable: false,
            },
          },
        },
        { status: 400 }
      );
    }

    const body = await request.json();

    const connection = await createConnection(tenant.id, integrationId, body);

    return NextResponse.json(
      {
        success: true,
        data: connection,
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof ConnectionError) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: error.code,
            message: error.message,
            suggestedResolution: {
              action: 'RETRY_WITH_MODIFIED_INPUT',
              description: getErrorDescription(error.code),
              retryable: false,
            },
          },
        },
        { status: error.statusCode }
      );
    }

    console.error('[CONNECTION_CREATE] Error:', error);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'An error occurred creating connection',
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
    case 'CONNECTION_NOT_FOUND':
      return 'The specified connection was not found';
    case 'INTEGRATION_NOT_FOUND':
      return 'The specified integration was not found';
    case 'DUPLICATE_SLUG':
      return 'A connection with this slug already exists for this integration';
    case 'INVALID_STATUS':
      return 'The provided status is invalid';
    case 'CONNECTION_DISABLED':
      return 'This connection is currently disabled';
    case 'CANNOT_DELETE_PRIMARY':
      return 'Cannot delete the last connection for an integration';
    default:
      return 'An error occurred while processing the connection request';
  }
}
