/**
 * App API Key Regeneration Endpoint
 *
 * POST /api/v1/apps/:id/api-key/regenerate
 *
 * Regenerates the API key for an app. The old key is immediately invalidated.
 * The new key is returned only once and cannot be retrieved later.
 * Protected by tenant key (wg_live_) only.
 *
 * @route POST /api/v1/apps/:id/api-key/regenerate
 */

import { NextRequest, NextResponse } from 'next/server';
import { withApiAuth } from '@/lib/api/middleware/auth';
import { regenerateAppKey, AppError } from '@/lib/modules/apps';

/**
 * Extract app ID from URL path
 * URL pattern: /api/v1/apps/{id}/api-key/regenerate
 */
function extractAppId(url: string): string | null {
  const urlObj = new URL(url);
  const pathParts = urlObj.pathname.split('/');

  const appsIndex = pathParts.indexOf('apps');
  if (appsIndex === -1) return null;

  return pathParts[appsIndex + 1] || null;
}

/**
 * POST /api/v1/apps/:id/api-key/regenerate
 *
 * Regenerates the app's API key. The old key is immediately invalidated.
 * Returns the new plaintext key (shown only once).
 */
export const POST = withApiAuth(async (request: NextRequest, { tenant, keyType }) => {
  if (keyType !== 'tenant') {
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

  try {
    const appId = extractAppId(request.url);

    if (!appId) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_REQUEST',
            message: 'App ID is required',
            suggestedResolution: {
              action: 'RETRY_WITH_MODIFIED_INPUT',
              description: 'Include a valid app ID in the URL path',
              retryable: false,
            },
          },
        },
        { status: 400 }
      );
    }

    const result = await regenerateAppKey(appId, tenant.id);

    return NextResponse.json({ success: true, data: result }, { status: 200 });
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
              description:
                error.code === 'APP_NOT_FOUND'
                  ? 'The specified app was not found'
                  : 'An error occurred while processing the request',
              retryable: false,
            },
          },
        },
        { status: error.statusCode }
      );
    }

    console.error('[APP_REGENERATE_KEY] Error:', error);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message:
            error instanceof Error ? error.message : 'An error occurred regenerating API key',
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
