/**
 * Apps List & Create Endpoint
 *
 * GET /api/v1/apps
 * POST /api/v1/apps
 *
 * List and create consuming applications.
 * Protected by tenant key (wg_live_) only.
 *
 * @route GET /api/v1/apps
 * @route POST /api/v1/apps
 */

import { NextRequest, NextResponse } from 'next/server';
import { withApiAuth } from '@/lib/api/middleware/auth';
import { listApps, createApp, AppError } from '@/lib/modules/apps';

/**
 * GET /api/v1/apps
 *
 * Returns paginated list of apps for the authenticated tenant.
 *
 * Query Parameters:
 * - `cursor` (optional): Pagination cursor from previous response
 * - `limit` (optional): Number of apps per page (1-100, default: 20)
 * - `status` (optional): Filter by status (active, disabled)
 * - `search` (optional): Search by name or slug
 */
export const GET = withApiAuth(async (request: NextRequest, { tenant, keyType }) => {
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
    const url = new URL(request.url);
    const query = {
      cursor: url.searchParams.get('cursor') ?? undefined,
      limit: url.searchParams.get('limit') ?? undefined,
      status: url.searchParams.get('status') ?? undefined,
      search: url.searchParams.get('search') ?? undefined,
    };

    const cleanQuery = Object.fromEntries(Object.entries(query).filter(([, v]) => v !== undefined));

    const result = await listApps(tenant.id, cleanQuery);

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
              description: getErrorDescription(error.code),
              retryable: true,
            },
          },
        },
        { status: error.statusCode }
      );
    }

    console.error('[APPS_LIST] Error:', error);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'An error occurred fetching apps',
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
 * POST /api/v1/apps
 *
 * Creates a new consuming application with a generated API key.
 * The API key is returned only on creation and cannot be retrieved later.
 *
 * Request Body:
 * - `name` (required): Display name
 * - `slug` (required): URL-safe identifier (lowercase alphanumeric with hyphens)
 * - `description` (optional): Description
 * - `metadata` (optional): App metadata including branding config
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
    const body = await request.json();
    const result = await createApp(tenant.id, body);

    return NextResponse.json({ success: true, data: result }, { status: 201 });
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
              retryable: error.statusCode !== 409,
            },
          },
        },
        { status: error.statusCode }
      );
    }

    console.error('[APPS_CREATE] Error:', error);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'An error occurred creating app',
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
