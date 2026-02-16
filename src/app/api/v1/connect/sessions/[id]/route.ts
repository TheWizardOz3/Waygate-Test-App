/**
 * Single Connect Session Endpoint
 *
 * GET /api/v1/connect/sessions/:id
 *
 * Check connect session status (e.g., after redirect callback).
 * Protected by app key (wg_app_) only.
 *
 * @route GET /api/v1/connect/sessions/:id
 */

import { NextRequest, NextResponse } from 'next/server';
import { withApiAuth } from '@/lib/api/middleware/auth';
import { getSession, ConnectSessionError } from '@/lib/modules/connect-sessions';

/**
 * Extract session ID from URL path.
 * URL pattern: /api/v1/connect/sessions/{id}
 */
function extractSessionId(url: string): string | null {
  const urlObj = new URL(url);
  const pathParts = urlObj.pathname.split('/');

  const sessionsIndex = pathParts.indexOf('sessions');
  if (sessionsIndex === -1) return null;

  return pathParts[sessionsIndex + 1] || null;
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
        message: 'Session ID is required',
        suggestedResolution: {
          action: 'RETRY_WITH_MODIFIED_INPUT',
          description: 'Include a valid session ID in the URL path',
          retryable: false,
        },
      },
    },
    { status: 400 }
  );
}

/**
 * GET /api/v1/connect/sessions/:id
 *
 * Returns the status of a connect session.
 * Used by consuming apps to verify completion after the end-user is redirected back.
 */
export const GET = withApiAuth(async (request: NextRequest, { app, keyType }) => {
  if (keyType !== 'app') return forbiddenResponse();

  try {
    const sessionId = extractSessionId(request.url);
    if (!sessionId) return missingIdResponse();

    const session = await getSession(sessionId, app!.id);

    return NextResponse.json({ success: true, data: session }, { status: 200 });
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
              retryable: false,
            },
          },
        },
        { status: error.statusCode }
      );
    }

    console.error('[CONNECT_SESSION_GET] Error:', error);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message:
            error instanceof Error ? error.message : 'An error occurred fetching connect session',
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
    case 'CONNECT_SESSION_NOT_FOUND':
      return 'The specified connect session was not found. Check the session ID and try again.';
    case 'CONNECT_SESSION_EXPIRED':
      return 'This connect session has expired. Create a new session.';
    default:
      return 'An error occurred while processing the connect session request';
  }
}
