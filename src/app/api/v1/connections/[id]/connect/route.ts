/**
 * Connection OAuth Connect Endpoint
 *
 * POST /api/v1/connections/:id/connect
 *
 * Initiates an OAuth connection flow for a specific connection.
 * Returns the authorization URL to redirect the user to.
 * This is the connection-level endpoint (vs the legacy integration-level endpoint).
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withApiAuth } from '@/lib/api/middleware/auth';
import { getConnectionByIdRaw, ConnectionError } from '@/lib/modules/connections';
import { initiateOAuthConnection, AuthServiceError } from '@/lib/modules/auth/auth.service';

const ConnectRequestSchema = z.object({
  redirectAfterAuth: z.string().url().optional(),
});

/**
 * Extract connection ID from URL path
 * URL pattern: /api/v1/connections/{id}/connect
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

export const POST = withApiAuth(async (request: NextRequest, { tenant }) => {
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

    // Get the connection (with tenant verification)
    const connection = await getConnectionByIdRaw(tenant.id, connectionId);

    // Parse request body (optional)
    let redirectAfterAuth: string | undefined;
    try {
      const body = await request.json();
      const parsed = ConnectRequestSchema.safeParse(body);
      if (parsed.success) {
        redirectAfterAuth = parsed.data.redirectAfterAuth;
      }
    } catch {
      // Body is optional, ignore parse errors
    }

    // Initiate OAuth flow with connection context
    const result = await initiateOAuthConnection(
      connection.integrationId,
      tenant.id,
      redirectAfterAuth,
      connectionId
    );

    return NextResponse.json(
      {
        success: true,
        data: {
          authorizationUrl: result.authorizationUrl,
          state: result.state,
          connectionId,
        },
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
              description: getConnectionErrorDescription(error.code),
              retryable: false,
            },
          },
        },
        { status: error.statusCode }
      );
    }

    if (error instanceof AuthServiceError) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: error.code,
            message: error.message,
            suggestedResolution:
              error.code === 'INVALID_AUTH_TYPE'
                ? {
                    action: 'CHECK_INTEGRATION_CONFIG',
                    description:
                      'This integration does not use OAuth2. Use the appropriate authentication method.',
                    retryable: false,
                  }
                : error.code === 'MISSING_CREDENTIALS'
                  ? {
                      action: 'CHECK_INTEGRATION_CONFIG',
                      description:
                        'Configure OAuth client ID and secret in the integration settings.',
                      retryable: false,
                    }
                  : undefined,
          },
        },
        { status: error.statusCode }
      );
    }

    console.error('[CONNECTION_CONNECT] OAuth connect error:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'An error occurred while initiating OAuth connection',
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
 * Get human-readable error description for connection errors
 */
function getConnectionErrorDescription(code: string): string {
  switch (code) {
    case 'CONNECTION_NOT_FOUND':
      return 'The specified connection was not found';
    case 'CONNECTION_DISABLED':
      return 'This connection is currently disabled';
    default:
      return 'An error occurred while processing the connection request';
  }
}
