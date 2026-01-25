/**
 * Connection Disconnect Endpoint
 *
 * POST /api/v1/connections/:id/disconnect
 *
 * Revokes credentials for a specific connection.
 * Optionally attempts to revoke tokens with the OAuth provider.
 * This is the connection-level endpoint (vs the legacy integration-level endpoint).
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { AuthType, ConnectionStatus, CredentialStatus } from '@prisma/client';
import { withApiAuth } from '@/lib/api/middleware/auth';
import { getConnectionByIdRaw, ConnectionError } from '@/lib/modules/connections';
import { getDecryptedCredential } from '@/lib/modules/credentials/credential.service';
import { createGenericProvider } from '@/lib/modules/auth/oauth-providers';

/**
 * Extract connection ID from URL path
 * URL pattern: /api/v1/connections/{id}/disconnect
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

    // Get the integration for auth config
    const integration = await prisma.integration.findFirst({
      where: {
        id: connection.integrationId,
        tenantId: tenant.id,
      },
    });

    if (!integration) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INTEGRATION_NOT_FOUND',
            message: 'Integration not found',
          },
        },
        { status: 404 }
      );
    }

    // Find active credentials for this connection
    const credentials = await prisma.integrationCredential.findMany({
      where: {
        connectionId,
        tenantId: tenant.id,
        status: CredentialStatus.active,
      },
    });

    if (credentials.length === 0) {
      return NextResponse.json(
        {
          success: true,
          data: {
            message: 'Connection was not connected',
            connectionId,
          },
        },
        { status: 200 }
      );
    }

    // For OAuth2, attempt to revoke tokens with the provider
    if (integration.authType === AuthType.oauth2) {
      try {
        // Get decrypted credential for this connection's integration
        const decrypted = await getDecryptedCredential(integration.id, tenant.id, connectionId);

        if (decrypted && decrypted.refreshToken) {
          const authConfig = integration.authConfig as {
            authorizationUrl: string;
            tokenUrl: string;
            clientId: string;
            clientSecret: string;
            revocationUrl?: string;
          };

          // Only attempt revocation if we have the required config
          if (authConfig.clientId && authConfig.clientSecret && authConfig.revocationUrl) {
            const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
            const redirectUri = `${appUrl}/api/v1/auth/callback/oauth2`;

            const provider = createGenericProvider(
              authConfig,
              authConfig.clientId,
              authConfig.clientSecret,
              redirectUri
            );

            // Try to revoke the refresh token (and by extension, the access token)
            try {
              await provider.revokeToken(decrypted.refreshToken, 'refresh');
            } catch (revokeError) {
              // Log but don't fail - we still want to mark as revoked locally
              console.warn(
                '[CONNECTION_DISCONNECT] Failed to revoke token with provider:',
                revokeError
              );
            }
          }
        }
      } catch (decryptError) {
        // Log but continue - we still want to revoke locally
        console.warn(
          '[CONNECTION_DISCONNECT] Failed to decrypt credential for revocation:',
          decryptError
        );
      }
    }

    // Mark all credentials for this connection as revoked
    await prisma.integrationCredential.updateMany({
      where: {
        connectionId,
        tenantId: tenant.id,
        status: CredentialStatus.active,
      },
      data: {
        status: CredentialStatus.revoked,
      },
    });

    // Update connection status to disabled
    await prisma.connection.update({
      where: { id: connectionId },
      data: { status: ConnectionStatus.disabled },
    });

    return NextResponse.json(
      {
        success: true,
        data: {
          message: 'Connection disconnected successfully',
          connectionId,
          credentialsRevoked: credentials.length,
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

    console.error('[CONNECTION_DISCONNECT] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'An error occurred while disconnecting the connection',
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
      return 'This connection is already disabled';
    default:
      return 'An error occurred while processing the connection request';
  }
}
