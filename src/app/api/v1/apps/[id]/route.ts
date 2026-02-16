/**
 * Single App Endpoint
 *
 * GET /api/v1/apps/:id
 * PATCH /api/v1/apps/:id
 * DELETE /api/v1/apps/:id
 *
 * Get, update, or delete a specific app.
 * Protected by tenant key (wg_live_) only.
 *
 * @route GET /api/v1/apps/:id
 * @route PATCH /api/v1/apps/:id
 * @route DELETE /api/v1/apps/:id
 */

import { NextRequest, NextResponse } from 'next/server';
import { withApiAuth } from '@/lib/api/middleware/auth';
import { getApp, updateApp, deleteApp, AppError } from '@/lib/modules/apps';

/**
 * Extract app ID from URL path
 * URL pattern: /api/v1/apps/{id}
 */
function extractAppId(url: string): string | null {
  const urlObj = new URL(url);
  const pathParts = urlObj.pathname.split('/');

  const appsIndex = pathParts.indexOf('apps');
  if (appsIndex === -1) return null;

  return pathParts[appsIndex + 1] || null;
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

function missingIdResponse() {
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

/**
 * GET /api/v1/apps/:id
 *
 * Returns a specific app by ID.
 */
export const GET = withApiAuth(async (request: NextRequest, { tenant, keyType }) => {
  if (keyType !== 'tenant') return forbiddenResponse();

  try {
    const appId = extractAppId(request.url);
    if (!appId) return missingIdResponse();

    const app = await getApp(appId, tenant.id);

    return NextResponse.json({ success: true, data: app }, { status: 200 });
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

    console.error('[APP_GET] Error:', error);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'An error occurred fetching app',
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
 * PATCH /api/v1/apps/:id
 *
 * Updates a specific app.
 *
 * Request Body (all fields optional):
 * - `name`: Display name
 * - `slug`: URL-safe identifier
 * - `description`: Description
 * - `status`: App status (active, disabled)
 * - `metadata`: App metadata including branding config
 */
export const PATCH = withApiAuth(async (request: NextRequest, { tenant, keyType }) => {
  if (keyType !== 'tenant') return forbiddenResponse();

  try {
    const appId = extractAppId(request.url);
    if (!appId) return missingIdResponse();

    const body = await request.json();
    const app = await updateApp(appId, tenant.id, body);

    return NextResponse.json({ success: true, data: app }, { status: 200 });
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

    console.error('[APP_UPDATE] Error:', error);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'An error occurred updating app',
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
 * DELETE /api/v1/apps/:id
 *
 * Deletes a specific app and all its associated data (cascading).
 */
export const DELETE = withApiAuth(async (request: NextRequest, { tenant, keyType }) => {
  if (keyType !== 'tenant') return forbiddenResponse();

  try {
    const appId = extractAppId(request.url);
    if (!appId) return missingIdResponse();

    await deleteApp(appId, tenant.id);

    return NextResponse.json(
      { success: true, message: 'App deleted successfully' },
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

    console.error('[APP_DELETE] Error:', error);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'An error occurred deleting app',
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
    case 'APP_SLUG_CONFLICT':
      return 'An app with this slug already exists. Choose a different slug.';
    case 'INVALID_INPUT':
      return 'The input data is invalid. Check the request body and try again.';
    default:
      return 'An error occurred while processing the app request';
  }
}
