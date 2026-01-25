/**
 * Single Connection Endpoint
 *
 * GET /api/v1/connections/:id
 * PATCH /api/v1/connections/:id
 * DELETE /api/v1/connections/:id
 *
 * Get, update, or delete a specific connection.
 *
 * @route GET /api/v1/connections/:id
 * @route PATCH /api/v1/connections/:id
 * @route DELETE /api/v1/connections/:id
 */

import { NextRequest, NextResponse } from 'next/server';
import { withApiAuth } from '@/lib/api/middleware/auth';
import {
  getConnectionById,
  updateConnection,
  deleteConnection,
  ConnectionError,
} from '@/lib/modules/connections';

/**
 * Extract connection ID from URL path
 * URL pattern: /api/v1/connections/{id}
 */
function extractConnectionId(url: string): string | null {
  const urlObj = new URL(url);
  const pathParts = urlObj.pathname.split('/');

  // Find 'connections' in path and get the next segment
  const connectionsIndex = pathParts.indexOf('connections');
  if (connectionsIndex === -1) {
    return null;
  }

  return pathParts[connectionsIndex + 1] || null;
}

/**
 * GET /api/v1/connections/:id
 *
 * Returns a specific connection by ID.
 */
export const GET = withApiAuth(async (request: NextRequest, { tenant }) => {
  try {
    const connectionId = extractConnectionId(request.url);

    if (!connectionId) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_REQUEST',
            message: 'Connection ID is required',
            suggestedResolution: {
              action: 'RETRY_WITH_MODIFIED_INPUT',
              description: 'Include a valid connection ID in the URL path',
              retryable: false,
            },
          },
        },
        { status: 400 }
      );
    }

    const connection = await getConnectionById(tenant.id, connectionId);

    return NextResponse.json(
      {
        success: true,
        data: connection,
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

    console.error('[CONNECTION_GET] Error:', error);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'An error occurred fetching connection',
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
 * PATCH /api/v1/connections/:id
 *
 * Updates a specific connection.
 *
 * Request Body (all fields optional):
 * - `name`: Display name
 * - `slug`: URL-safe identifier
 * - `baseUrl`: Base URL override
 * - `isPrimary`: Whether this is the primary connection
 * - `status`: Connection status (active, error, disabled)
 * - `metadata`: Additional metadata
 */
export const PATCH = withApiAuth(async (request: NextRequest, { tenant }) => {
  try {
    const connectionId = extractConnectionId(request.url);

    if (!connectionId) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_REQUEST',
            message: 'Connection ID is required',
            suggestedResolution: {
              action: 'RETRY_WITH_MODIFIED_INPUT',
              description: 'Include a valid connection ID in the URL path',
              retryable: false,
            },
          },
        },
        { status: 400 }
      );
    }

    const body = await request.json();

    const connection = await updateConnection(tenant.id, connectionId, body);

    return NextResponse.json(
      {
        success: true,
        data: connection,
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

    console.error('[CONNECTION_UPDATE] Error:', error);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'An error occurred updating connection',
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
 * DELETE /api/v1/connections/:id
 *
 * Deletes a specific connection and all its associated credentials.
 * Cannot delete the last connection for an integration.
 */
export const DELETE = withApiAuth(async (request: NextRequest, { tenant }) => {
  try {
    const connectionId = extractConnectionId(request.url);

    if (!connectionId) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_REQUEST',
            message: 'Connection ID is required',
            suggestedResolution: {
              action: 'RETRY_WITH_MODIFIED_INPUT',
              description: 'Include a valid connection ID in the URL path',
              retryable: false,
            },
          },
        },
        { status: 400 }
      );
    }

    await deleteConnection(tenant.id, connectionId);

    return NextResponse.json(
      {
        success: true,
        message: 'Connection deleted successfully',
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

    console.error('[CONNECTION_DELETE] Error:', error);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'An error occurred deleting connection',
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
