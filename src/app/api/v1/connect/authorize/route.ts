/**
 * Connect Authorize Route
 *
 * POST /api/v1/connect/authorize
 *
 * Public endpoint (no API key needed — the connect session token is the auth).
 * Validates the session token and initiates the OAuth flow with app-scoped credentials.
 * Returns the authorization URL for the client to redirect to.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { validateSession } from '@/lib/modules/connect-sessions/connect-session.service';
import { initiateOAuthConnection } from '@/lib/modules/auth/auth.service';
import {
  ConnectSessionNotFoundError,
  ConnectSessionExpiredError,
  ConnectSessionAlreadyCompletedError,
  ConnectSessionError,
} from '@/lib/modules/connect-sessions/connect-session.errors';

const AuthorizeRequestSchema = z.object({
  token: z.string().min(1, 'Token is required'),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = AuthorizeRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_INPUT',
            message: 'Invalid request body',
            details: parsed.error.flatten().fieldErrors,
          },
        },
        { status: 400 }
      );
    }

    const { token } = parsed.data;

    // Validate the session (checks pending status, not expired)
    const session = await validateSession(token);

    // Initiate OAuth with app context
    const { authorizationUrl } = await initiateOAuthConnection(
      session.integrationId,
      session.app.tenantId,
      undefined, // redirectAfterAuth handled by callback via connect session
      session.connectionId ?? undefined,
      {
        appId: session.appId,
        appUserId: session.appUserId,
        connectSessionToken: session.token,
      }
    );

    return NextResponse.json({
      success: true,
      data: { authorizationUrl },
    });
  } catch (error) {
    if (error instanceof ConnectSessionNotFoundError) {
      return NextResponse.json(
        {
          success: false,
          error: { code: error.code, message: 'Invalid or unknown session token' },
        },
        { status: 404 }
      );
    }

    if (error instanceof ConnectSessionExpiredError) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: error.code,
            message: 'This connect session has expired. Please request a new one.',
          },
        },
        { status: 410 }
      );
    }

    if (error instanceof ConnectSessionAlreadyCompletedError) {
      return NextResponse.json(
        {
          success: false,
          error: { code: error.code, message: 'This connect session has already been completed.' },
        },
        { status: 409 }
      );
    }

    if (error instanceof ConnectSessionError) {
      return NextResponse.json(
        {
          success: false,
          error: { code: error.code, message: error.message },
        },
        { status: error.statusCode }
      );
    }

    console.error('Connect authorize error:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to initiate connection. Please try again.',
        },
      },
      { status: 500 }
    );
  }
}
