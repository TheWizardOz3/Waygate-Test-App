/**
 * Manual Token Refresh Endpoint
 *
 * POST /api/v1/integrations/:id/refresh
 *
 * Manually triggers a token refresh for an integration's OAuth2 credential.
 * Useful for debugging token issues or user-initiated refresh after re-authentication.
 *
 * @route POST /api/v1/integrations/:id/refresh
 */

import { NextRequest, NextResponse } from 'next/server';
import { withApiAuth } from '@/lib/api/middleware/auth';
import { successResponse, errorResponse } from '@/lib/api/response';
import { findActiveCredentialForIntegration } from '@/lib/modules/credentials/credential.repository';
import { refreshCredentialManually } from '@/lib/modules/credentials/token-refresh.service';
import { prisma } from '@/lib/db/client';

/**
 * POST /api/v1/integrations/:id/refresh
 *
 * Manually refreshes OAuth2 tokens for the specified integration.
 *
 * @param request - The incoming request
 * @returns Result of the refresh operation
 *
 * @example
 * ```
 * POST /api/v1/integrations/123e4567-e89b-12d3-a456-426614174000/refresh
 * Authorization: Bearer wg_live_xxx
 *
 * Response:
 * {
 *   "success": true,
 *   "data": {
 *     "message": "Token refresh completed",
 *     "credentialId": "...",
 *     "integrationId": "...",
 *     "success": true,
 *     "rotatedRefreshToken": false,
 *     "retryCount": 0
 *   }
 * }
 * ```
 */
export const POST = withApiAuth(async (request: NextRequest, { tenant }) => {
  try {
    // Extract integration ID from URL
    const url = new URL(request.url);
    const pathParts = url.pathname.split('/');
    const integrationIdIndex = pathParts.indexOf('integrations') + 1;
    const integrationId = pathParts[integrationIdIndex];

    if (!integrationId) {
      return errorResponse('INVALID_REQUEST', 'Integration ID is required', 400);
    }

    // Verify integration exists and belongs to tenant
    const integration = await prisma.integration.findFirst({
      where: {
        id: integrationId,
        tenantId: tenant.id,
      },
      select: {
        id: true,
        name: true,
        slug: true,
        authType: true,
      },
    });

    if (!integration) {
      return errorResponse(
        'INTEGRATION_NOT_FOUND',
        'Integration not found or does not belong to this tenant',
        404
      );
    }

    // Check if integration uses OAuth2
    if (integration.authType !== 'oauth2') {
      return errorResponse(
        'NOT_OAUTH2',
        `Integration "${integration.name}" uses ${integration.authType} authentication, which does not support token refresh`,
        400,
        {
          authType: integration.authType,
          supportedAuthTypes: ['oauth2'],
        }
      );
    }

    // Get the active credential for this integration
    const credential = await findActiveCredentialForIntegration(integrationId, tenant.id);

    if (!credential) {
      return errorResponse(
        'NO_CREDENTIAL',
        `Integration "${integration.name}" does not have an active credential. Please connect the integration first.`,
        400
      );
    }

    // Perform the refresh
    const result = await refreshCredentialManually(credential.id, tenant.id);

    if (result.success) {
      return successResponse({
        message: 'Token refresh completed successfully',
        credentialId: result.credentialId,
        integrationId: result.integrationId,
        integrationName: integration.name,
        success: true,
        rotatedRefreshToken: result.rotatedRefreshToken,
        retryCount: result.retryCount,
      });
    } else {
      // Refresh failed - return error with details
      return NextResponse.json(
        {
          success: false,
          error: {
            code: result.error?.code || 'REFRESH_FAILED',
            message: result.error?.message || 'Token refresh failed',
            details: {
              credentialId: result.credentialId,
              integrationId: result.integrationId,
              integrationName: integration.name,
              retryCount: result.retryCount,
            },
            suggestedResolution: {
              action: 'REFRESH_CREDENTIALS',
              description:
                result.error?.code === 'NO_REFRESH_TOKEN'
                  ? 'The credential does not have a refresh token. Please reconnect the integration.'
                  : 'The token refresh failed. Please try reconnecting the integration.',
              retryable: false,
            },
          },
        },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error('[MANUAL_REFRESH] Error:', error);

    return errorResponse(
      'INTERNAL_ERROR',
      error instanceof Error ? error.message : 'An error occurred during token refresh',
      500
    );
  }
});

/**
 * GET /api/v1/integrations/:id/refresh
 *
 * Returns information about the refresh capability for this integration.
 */
export const GET = withApiAuth(async (request: NextRequest, { tenant }) => {
  try {
    // Extract integration ID from URL
    const url = new URL(request.url);
    const pathParts = url.pathname.split('/');
    const integrationIdIndex = pathParts.indexOf('integrations') + 1;
    const integrationId = pathParts[integrationIdIndex];

    if (!integrationId) {
      return errorResponse('INVALID_REQUEST', 'Integration ID is required', 400);
    }

    // Verify integration exists and belongs to tenant
    const integration = await prisma.integration.findFirst({
      where: {
        id: integrationId,
        tenantId: tenant.id,
      },
      select: {
        id: true,
        name: true,
        slug: true,
        authType: true,
      },
    });

    if (!integration) {
      return errorResponse(
        'INTEGRATION_NOT_FOUND',
        'Integration not found or does not belong to this tenant',
        404
      );
    }

    // Get credential status
    const credential = await findActiveCredentialForIntegration(integrationId, tenant.id);

    const canRefresh =
      integration.authType === 'oauth2' &&
      credential !== null &&
      credential.encryptedRefreshToken !== null;

    return successResponse({
      integrationId: integration.id,
      integrationName: integration.name,
      authType: integration.authType,
      canRefresh,
      hasCredential: credential !== null,
      hasRefreshToken: credential?.encryptedRefreshToken !== null,
      credentialStatus: credential?.status ?? null,
      expiresAt: credential?.expiresAt?.toISOString() ?? null,
      message: canRefresh
        ? 'Integration supports token refresh. POST to this endpoint to refresh.'
        : !credential
          ? 'No active credential found. Connect the integration first.'
          : integration.authType !== 'oauth2'
            ? `${integration.authType} authentication does not support token refresh.`
            : 'No refresh token available. Reconnect the integration to enable refresh.',
    });
  } catch (error) {
    console.error('[MANUAL_REFRESH] Error:', error);

    return errorResponse(
      'INTERNAL_ERROR',
      error instanceof Error ? error.message : 'An error occurred',
      500
    );
  }
});
