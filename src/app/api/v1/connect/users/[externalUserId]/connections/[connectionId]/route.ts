/**
 * User Connection Disconnect Endpoint
 *
 * DELETE /api/v1/connect/users/:externalUserId/connections/:connectionId
 *
 * Disconnects an end-user from a connection by revoking their credential.
 * Protected by app key (wg_app_) only.
 *
 * @route DELETE /api/v1/connect/users/:externalUserId/connections/:connectionId
 */

import { NextRequest, NextResponse } from 'next/server';
import { withApiAuth } from '@/lib/api/middleware/auth';
import { findAppUserByExternalId } from '@/lib/modules/app-users';
import {
  findByConnectionAndUser,
  revokeUserCredential,
  AppUserCredentialError,
  AppUserCredentialNotFoundError,
} from '@/lib/modules/app-user-credentials';

/**
 * Extract externalUserId and connectionId from URL path.
 * URL pattern: /api/v1/connect/users/{externalUserId}/connections/{connectionId}
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
 * DELETE /api/v1/connect/users/:externalUserId/connections/:connectionId
 *
 * Revokes the end-user's credential for the specified connection.
 * The credential is soft-deleted (marked as revoked) for audit trails.
 */
export const DELETE = withApiAuth(async (request: NextRequest, { app, keyType }) => {
  if (keyType !== 'app') return forbiddenResponse();

  try {
    const { externalUserId, connectionId } = extractIds(request.url);
    if (!externalUserId || !connectionId) return missingIdsResponse();

    // Resolve the AppUser
    const appUser = await findAppUserByExternalId(app!.id, externalUserId);
    if (!appUser) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'USER_NOT_FOUND',
            message: `No user found with external ID '${externalUserId}'`,
            suggestedResolution: {
              action: 'RETRY_WITH_MODIFIED_INPUT',
              description: 'Check the external user ID and try again',
              retryable: false,
            },
          },
        },
        { status: 404 }
      );
    }

    // Find the credential for this connection + user
    const credential = await findByConnectionAndUser(connectionId, appUser.id);
    if (!credential) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'CREDENTIAL_NOT_FOUND',
            message: 'No credential found for this user on the specified connection',
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

    // Revoke the credential
    await revokeUserCredential(credential.id);

    return NextResponse.json(
      { success: true, message: 'User credential revoked successfully' },
      { status: 200 }
    );
  } catch (error) {
    if (error instanceof AppUserCredentialNotFoundError) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: error.code,
            message: error.message,
            suggestedResolution: {
              action: 'RETRY_WITH_MODIFIED_INPUT',
              description: 'The credential was not found',
              retryable: false,
            },
          },
        },
        { status: error.statusCode }
      );
    }

    if (error instanceof AppUserCredentialError) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: error.code,
            message: error.message,
            suggestedResolution: {
              action: 'RETRY_WITH_MODIFIED_INPUT',
              description: 'An error occurred with the credential operation',
              retryable: false,
            },
          },
        },
        { status: error.statusCode }
      );
    }

    console.error('[CONNECT_USER_DISCONNECT] Error:', error);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'An error occurred disconnecting user',
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
