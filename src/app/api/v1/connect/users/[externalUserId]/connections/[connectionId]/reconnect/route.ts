/**
 * User Connection Reconnect Endpoint
 *
 * POST /api/v1/connect/users/:externalUserId/connections/:connectionId/reconnect
 *
 * Creates a new connect session for re-authentication when a user's credential
 * has expired or needs re-auth.
 * Protected by app key (wg_app_) only.
 *
 * @route POST /api/v1/connect/users/:externalUserId/connections/:connectionId/reconnect
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { withApiAuth } from '@/lib/api/middleware/auth';
import { createConnectSession, ConnectSessionError } from '@/lib/modules/connect-sessions';

/**
 * Extract externalUserId and connectionId from URL path.
 * URL pattern: /api/v1/connect/users/{externalUserId}/connections/{connectionId}/reconnect
 */
function extractIds(url: string): { externalUserId: string | null; connectionId: string | null } {
  const urlObj = new URL(url);
  const pathParts = urlObj.pathname.split('/');

  const usersIndex = pathParts.indexOf('users');
  const connectionsIndex = pathParts.indexOf('connections');

  return {
    externalUserId: usersIndex !== -1 ? decodeURIComponent(pathParts[usersIndex + 1] || '') : null,
    connectionId: connectionsIndex !== -1 ? pathParts[connectionsIndex + 1] || null : null,
  };
}

function forbiddenResponse() {
  return NextResponse.json(
    {
      success: false,
      error: {
        code: 'FORBIDDEN',
        message: 'Connect endpoints require an app API key (wg_app_)',
        suggestedResolution: {
          action: 'RETRY_WITH_MODIFIED_INPUT',
          description: 'Use your app API key (wg_app_) instead of a tenant API key (wg_live_)',
          retryable: false,
        },
      },
    },
    { status: 403 }
  );
}

function missingIdsResponse() {
  return NextResponse.json(
    {
      success: false,
      error: {
        code: 'INVALID_REQUEST',
        message: 'External user ID and connection ID are required',
        suggestedResolution: {
          action: 'RETRY_WITH_MODIFIED_INPUT',
          description: 'Include valid IDs in the URL path',
          retryable: false,
        },
      },
    },
    { status: 400 }
  );
}

/**
 * POST /api/v1/connect/users/:externalUserId/connections/:connectionId/reconnect
 *
 * Creates a new connect session for re-authentication.
 * Looks up the connection to determine the integration, then creates a session
 * using the same connect flow as initial connection.
 *
 * Request Body (optional):
 * - `redirectUrl` (optional): Where to redirect after completion
 */
export const POST = withApiAuth(async (request: NextRequest, { tenant, app, keyType }) => {
  if (keyType !== 'app') return forbiddenResponse();

  try {
    const { externalUserId, connectionId } = extractIds(request.url);
    if (!externalUserId || !connectionId) return missingIdsResponse();

    // Look up the connection to get the integration slug
    const connection = await prisma.connection.findFirst({
      where: {
        id: connectionId,
        tenantId: tenant.id,
        appId: app!.id,
      },
      include: {
        integration: {
          select: { slug: true },
        },
      },
    });

    if (!connection) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'CONNECTION_NOT_FOUND',
            message: 'The specified connection was not found for this app',
            suggestedResolution: {
              action: 'RETRY_WITH_MODIFIED_INPUT',
              description: 'Check the connection ID and try again',
              retryable: false,
            },
          },
        },
        { status: 404 }
      );
    }

    // Parse optional body for redirectUrl
    let redirectUrl: string | undefined;
    try {
      const body = await request.json();
      if (body.redirectUrl) {
        redirectUrl = body.redirectUrl;
      }
    } catch {
      // No body or invalid JSON — that's fine, redirectUrl is optional
    }

    // Create a new connect session for re-auth
    const result = await createConnectSession(app!.id, tenant.id, {
      externalUserId,
      integrationSlug: connection.integration.slug,
      redirectUrl,
    });

    return NextResponse.json({ success: true, data: result }, { status: 201 });
  } catch (error) {
    if (error instanceof ConnectSessionError) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: error.code,
            message: error.message,
            suggestedResolution: {
              action: 'RETRY_WITH_MODIFIED_INPUT',
              description: getErrorDescription(error.code),
              retryable: error.statusCode !== 409,
            },
          },
        },
        { status: error.statusCode }
      );
    }

    console.error('[CONNECT_USER_RECONNECT] Error:', error);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message:
            error instanceof Error ? error.message : 'An error occurred creating re-auth session',
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

function getErrorDescription(code: string): string {
  switch (code) {
    case 'INTEGRATION_NOT_FOUND':
      return 'The integration for this connection was not found';
    case 'INVALID_INPUT':
      return 'The input data is invalid. Check the request body and try again.';
    default:
      return 'An error occurred while processing the reconnect request';
  }
}
