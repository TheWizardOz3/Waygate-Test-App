/**
 * User Connections List Endpoint
 *
 * GET /api/v1/connect/users/:externalUserId/connections
 *
 * Lists an end-user's active connections with credential status.
 * Protected by app key (wg_app_) only.
 *
 * @route GET /api/v1/connect/users/:externalUserId/connections
 */

import { NextRequest, NextResponse } from 'next/server';
import { withApiAuth } from '@/lib/api/middleware/auth';
import { findAppUserByExternalId, AppUserNotFoundError } from '@/lib/modules/app-users';
import {
  findByAppUserIdWithConnections,
  type UserCredentialWithConnectionInfo,
} from '@/lib/modules/app-user-credentials';

/**
 * Extract externalUserId from URL path.
 * URL pattern: /api/v1/connect/users/{externalUserId}/connections
 */
function extractExternalUserId(url: string): string | null {
  const urlObj = new URL(url);
  const pathParts = urlObj.pathname.split('/');

  const usersIndex = pathParts.indexOf('users');
  if (usersIndex === -1) return null;

  return decodeURIComponent(pathParts[usersIndex + 1] || '');
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

function missingIdResponse() {
  return NextResponse.json(
    {
      success: false,
      error: {
        code: 'INVALID_REQUEST',
        message: 'External user ID is required',
        suggestedResolution: {
          action: 'RETRY_WITH_MODIFIED_INPUT',
          description: 'Include a valid external user ID in the URL path',
          retryable: false,
        },
      },
    },
    { status: 400 }
  );
}

function toUserConnectionResponse(credential: UserCredentialWithConnectionInfo) {
  return {
    connectionId: credential.connection.id,
    connectionName: credential.connection.name,
    integrationId: credential.connection.integration.id,
    integrationSlug: credential.connection.integration.slug,
    integrationName: credential.connection.integration.name,
    credentialId: credential.id,
    credentialStatus: credential.status,
    expiresAt: credential.expiresAt?.toISOString() ?? null,
    scopes: credential.scopes,
    connectedAt: credential.createdAt.toISOString(),
  };
}

/**
 * GET /api/v1/connect/users/:externalUserId/connections
 *
 * Returns all connections where this end-user has a credential,
 * along with credential status, integration info, and expiration.
 */
export const GET = withApiAuth(async (request: NextRequest, { app, keyType }) => {
  if (keyType !== 'app') return forbiddenResponse();

  try {
    const externalUserId = extractExternalUserId(request.url);
    if (!externalUserId) return missingIdResponse();

    // Resolve the AppUser by externalId within this app
    const appUser = await findAppUserByExternalId(app!.id, externalUserId);
    if (!appUser) {
      // No user record → no connections (not an error, just empty)
      return NextResponse.json({ success: true, data: { connections: [] } }, { status: 200 });
    }

    // Find all credentials with connection+integration info
    const credentials = await findByAppUserIdWithConnections(appUser.id);

    const connections = credentials.map(toUserConnectionResponse);

    return NextResponse.json({ success: true, data: { connections } }, { status: 200 });
  } catch (error) {
    if (error instanceof AppUserNotFoundError) {
      return NextResponse.json({ success: true, data: { connections: [] } }, { status: 200 });
    }

    console.error('[CONNECT_USER_CONNECTIONS_LIST] Error:', error);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message:
            error instanceof Error ? error.message : 'An error occurred listing user connections',
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
