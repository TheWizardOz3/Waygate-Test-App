/**
 * App Connections Endpoint
 *
 * GET /api/v1/apps/:id/connections
 *
 * Returns all connections associated with an app, including integration name.
 * Protected by tenant key (wg_live_) only.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withApiAuth } from '@/lib/api/middleware/auth';
import { getApp, AppError } from '@/lib/modules/apps';
import { prisma } from '@/lib/db/client';
import { toConnectionResponse } from '@/lib/modules/connections';

function extractAppId(url: string): string | null {
  const urlObj = new URL(url);
  const pathParts = urlObj.pathname.split('/');
  const appsIndex = pathParts.indexOf('apps');
  if (appsIndex === -1) return null;
  return pathParts[appsIndex + 1] || null;
}

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

    // Verify app exists and belongs to tenant
    await getApp(appId, tenant.id);

    const connections = await prisma.connection.findMany({
      where: { appId, tenantId: tenant.id },
      include: {
        integration: {
          select: { name: true, slug: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const data = connections.map((c) => ({
      ...toConnectionResponse(c),
      integrationName: c.integration.name,
      integrationSlug: c.integration.slug,
    }));

    return NextResponse.json({ success: true, data: { connections: data } }, { status: 200 });
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
                  : 'An error occurred while fetching connections',
              retryable: false,
            },
          },
        },
        { status: error.statusCode }
      );
    }

    console.error('[APP_CONNECTIONS] Error:', error);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message:
            error instanceof Error ? error.message : 'An error occurred fetching connections',
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
