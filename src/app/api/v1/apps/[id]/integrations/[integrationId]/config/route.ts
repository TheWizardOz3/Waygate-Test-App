/**
 * App Integration Config Endpoint
 *
 * GET /api/v1/apps/:id/integrations/:integrationId/config
 * PUT /api/v1/apps/:id/integrations/:integrationId/config
 * DELETE /api/v1/apps/:id/integrations/:integrationId/config
 *
 * Manage per-app OAuth client credentials for a specific integration.
 * Protected by tenant key (wg_live_) only.
 *
 * @route GET /api/v1/apps/:id/integrations/:integrationId/config
 * @route PUT /api/v1/apps/:id/integrations/:integrationId/config
 * @route DELETE /api/v1/apps/:id/integrations/:integrationId/config
 */

import { NextRequest, NextResponse } from 'next/server';
import { withApiAuth } from '@/lib/api/middleware/auth';
import {
  getIntegrationConfig,
  setIntegrationConfig,
  deleteIntegrationConfig,
  AppError,
} from '@/lib/modules/apps';

/**
 * Extract app ID and integration ID from URL path.
 * URL pattern: /api/v1/apps/{appId}/integrations/{integrationId}/config
 */
function extractIds(url: string): { appId: string | null; integrationId: string | null } {
  const urlObj = new URL(url);
  const pathParts = urlObj.pathname.split('/');

  const appsIndex = pathParts.indexOf('apps');
  const integrationsIndex = pathParts.indexOf('integrations');

  return {
    appId: appsIndex !== -1 ? pathParts[appsIndex + 1] || null : null,
    integrationId: integrationsIndex !== -1 ? pathParts[integrationsIndex + 1] || null : null,
  };
}

function forbiddenResponse() {
  return NextResponse.json(
    {
      success: false,
      error: {
        code: 'FORBIDDEN',
        message: 'App management requires a tenant API key (wg_live_)',
        suggestedResolution: {
          action: 'RETRY_WITH_MODIFIED_INPUT',
          description: 'Use your tenant API key (wg_live_) instead of an app API key (wg_app_)',
          retryable: false,
        },
      },
    },
    { status: 403 }
  );
}

function missingIdsResponse(missing: string) {
  return NextResponse.json(
    {
      success: false,
      error: {
        code: 'INVALID_REQUEST',
        message: `${missing} is required`,
        suggestedResolution: {
          action: 'RETRY_WITH_MODIFIED_INPUT',
          description: `Include a valid ${missing.toLowerCase()} in the URL path`,
          retryable: false,
        },
      },
    },
    { status: 400 }
  );
}

/**
 * GET /api/v1/apps/:id/integrations/:integrationId/config
 *
 * Returns the integration config (without decrypted secrets).
 */
export const GET = withApiAuth(async (request: NextRequest, { tenant, keyType }) => {
  if (keyType !== 'tenant') return forbiddenResponse();

  try {
    const { appId, integrationId } = extractIds(request.url);
    if (!appId) return missingIdsResponse('App ID');
    if (!integrationId) return missingIdsResponse('Integration ID');

    const config = await getIntegrationConfig(appId, integrationId, tenant.id);

    return NextResponse.json({ success: true, data: config }, { status: 200 });
  } catch (error) {
    if (error instanceof AppError) {
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

    console.error('[APP_INTEGRATION_CONFIG_GET] Error:', error);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message:
            error instanceof Error
              ? error.message
              : 'An error occurred fetching integration config',
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
 * PUT /api/v1/apps/:id/integrations/:integrationId/config
 *
 * Sets (creates or updates) per-app OAuth client credentials for an integration.
 *
 * Request Body:
 * - `clientId` (required): OAuth client ID
 * - `clientSecret` (required): OAuth client secret
 * - `scopes` (optional): Array of OAuth scopes
 * - `metadata` (optional): Additional metadata
 */
export const PUT = withApiAuth(async (request: NextRequest, { tenant, keyType }) => {
  if (keyType !== 'tenant') return forbiddenResponse();

  try {
    const { appId, integrationId } = extractIds(request.url);
    if (!appId) return missingIdsResponse('App ID');
    if (!integrationId) return missingIdsResponse('Integration ID');

    const body = await request.json();
    const config = await setIntegrationConfig(appId, integrationId, tenant.id, body);

    return NextResponse.json({ success: true, data: config }, { status: 200 });
  } catch (error) {
    if (error instanceof AppError) {
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

    console.error('[APP_INTEGRATION_CONFIG_SET] Error:', error);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message:
            error instanceof Error ? error.message : 'An error occurred setting integration config',
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
 * DELETE /api/v1/apps/:id/integrations/:integrationId/config
 *
 * Removes an app's integration config (OAuth client credentials).
 */
export const DELETE = withApiAuth(async (request: NextRequest, { tenant, keyType }) => {
  if (keyType !== 'tenant') return forbiddenResponse();

  try {
    const { appId, integrationId } = extractIds(request.url);
    if (!appId) return missingIdsResponse('App ID');
    if (!integrationId) return missingIdsResponse('Integration ID');

    await deleteIntegrationConfig(appId, integrationId, tenant.id);

    return NextResponse.json(
      { success: true, message: 'Integration config deleted successfully' },
      { status: 200 }
    );
  } catch (error) {
    if (error instanceof AppError) {
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

    console.error('[APP_INTEGRATION_CONFIG_DELETE] Error:', error);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message:
            error instanceof Error
              ? error.message
              : 'An error occurred deleting integration config',
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
    case 'APP_NOT_FOUND':
      return 'The specified app was not found';
    case 'APP_INTEGRATION_CONFIG_ERROR':
      return 'Integration config error. Check the app and integration IDs and try again.';
    case 'INVALID_INPUT':
      return 'The input data is invalid. Check the request body and try again.';
    default:
      return 'An error occurred while processing the integration config request';
  }
}
