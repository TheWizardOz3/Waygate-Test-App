/**
 * Connect Sessions Endpoint
 *
 * POST /api/v1/connect/sessions
 *
 * Creates a connect session for an end-user to authenticate with an integration.
 * Protected by app key (wg_app_) only.
 *
 * @route POST /api/v1/connect/sessions
 */

import { NextRequest, NextResponse } from 'next/server';
import { withApiAuth } from '@/lib/api/middleware/auth';
import { createConnectSession, ConnectSessionError } from '@/lib/modules/connect-sessions';

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

/**
 * POST /api/v1/connect/sessions
 *
 * Creates a connect session for an end-user to authenticate via the hosted connect page.
 * The consuming app creates this server-side, then redirects the end-user to the connectUrl.
 *
 * Request Body:
 * - `externalUserId` (required): The consuming app's user ID
 * - `integrationSlug` (required): Which integration to connect (e.g., "slack")
 * - `redirectUrl` (optional): Where to redirect after completion
 * - `user` (optional): { displayName?, email? } for user metadata
 */
export const POST = withApiAuth(async (request: NextRequest, { tenant, app, keyType }) => {
  if (keyType !== 'app') return forbiddenResponse();

  try {
    const body = await request.json();
    const result = await createConnectSession(app!.id, tenant.id, body);

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

    console.error('[CONNECT_SESSION_CREATE] Error:', error);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message:
            error instanceof Error ? error.message : 'An error occurred creating connect session',
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
      return 'The specified integration slug was not found. Check the integration slug and try again.';
    case 'INVALID_INPUT':
      return 'The input data is invalid. Check the request body and try again.';
    case 'CONNECT_SESSION_ALREADY_COMPLETED':
      return 'This connect session has already been completed.';
    default:
      return 'An error occurred while processing the connect session request';
  }
}
