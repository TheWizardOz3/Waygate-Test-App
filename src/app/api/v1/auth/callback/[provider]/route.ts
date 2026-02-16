/**
 * OAuth Callback Handler
 *
 * GET /api/v1/auth/callback/:provider
 *
 * Handles the OAuth callback after user authorization.
 * Exchanges the authorization code for tokens and stores them.
 *
 * For standard flows: redirects to the integration detail page.
 * For connect flows: redirects to the consuming app's redirectUrl
 * with session_id and status query params.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  handleOAuthCallback,
  AuthServiceError,
  validateOAuthState,
} from '@/lib/modules/auth/auth.service';
import { failSession } from '@/lib/modules/connect-sessions/connect-session.service';
import type { OAuthCallbackResult } from '@/lib/modules/auth/auth.schemas';

/**
 * Builds the redirect URL after a successful OAuth callback.
 *
 * Connect flows: redirectUrl?session_id=xxx&status=success
 * Standard flows: /integrations/:id?oauth_success=true or custom redirectUrl
 */
function buildSuccessRedirect(result: OAuthCallbackResult, appUrl: string): URL {
  if (result.connectSessionToken && result.redirectUrl) {
    // Connect flow: redirect to consuming app with session params
    const redirectUrl = new URL(result.redirectUrl);
    redirectUrl.searchParams.set('session_id', result.connectSessionToken);
    redirectUrl.searchParams.set('status', 'success');
    return redirectUrl;
  }

  // Standard flow
  let redirectUrl: URL;
  if (result.redirectUrl) {
    redirectUrl = new URL(result.redirectUrl);
  } else {
    redirectUrl = new URL(`/integrations/${result.integrationId}`, appUrl);
  }
  redirectUrl.searchParams.set('oauth_success', 'true');
  return redirectUrl;
}

/**
 * Builds the redirect URL after an OAuth error.
 * For connect flows, attempts to redirect to the consuming app's redirectUrl.
 */
function buildErrorRedirect(errorMessage: string, stateParam: string | null, appUrl: string): URL {
  // Try to resolve connect session context from state
  if (stateParam) {
    const storedState = validateOAuthState(stateParam);
    if (storedState?.connectSessionToken && storedState.redirectAfterAuth) {
      // Connect flow error: redirect to consuming app with error params
      const redirectUrl = new URL(storedState.redirectAfterAuth);
      redirectUrl.searchParams.set('session_id', storedState.connectSessionToken);
      redirectUrl.searchParams.set('status', 'failed');
      redirectUrl.searchParams.set('error', errorMessage);
      return redirectUrl;
    }
  }

  // Standard flow: redirect to integrations page with error
  const redirectUrl = new URL('/integrations', appUrl);
  redirectUrl.searchParams.set('oauth_error', errorMessage);
  return redirectUrl;
}

/**
 * Marks a connect session as failed if state contains a connect session token.
 * Best-effort: errors are logged but not propagated.
 */
async function tryFailConnectSession(
  stateParam: string | null,
  errorMessage: string
): Promise<void> {
  if (!stateParam) return;

  const storedState = validateOAuthState(stateParam);
  if (storedState?.connectSessionToken) {
    try {
      await failSession(storedState.connectSessionToken, errorMessage);
    } catch {
      // Best-effort
    }
  }
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');
  const errorDescription = searchParams.get('error_description');

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  // Handle OAuth errors from the provider
  if (error) {
    const errorMessage = errorDescription || error;
    console.error('OAuth provider error:', error, errorDescription);
    await tryFailConnectSession(state, errorMessage);
    return NextResponse.redirect(buildErrorRedirect(errorMessage, state, appUrl).toString());
  }

  if (!code) {
    await tryFailConnectSession(state, 'Authorization code not received');
    return NextResponse.redirect(
      buildErrorRedirect('Authorization code not received', state, appUrl).toString()
    );
  }

  if (!state) {
    return NextResponse.redirect(
      buildErrorRedirect('OAuth state parameter missing', null, appUrl).toString()
    );
  }

  try {
    const result = await handleOAuthCallback(code, state);
    return NextResponse.redirect(buildSuccessRedirect(result, appUrl).toString());
  } catch (error) {
    console.error('OAuth callback error:', error);

    const errorMessage =
      error instanceof AuthServiceError ? error.message : 'Failed to complete OAuth connection';

    // handleOAuthCallback already fails the connect session internally,
    // so no need to call tryFailConnectSession here
    return NextResponse.redirect(buildErrorRedirect(errorMessage, state, appUrl).toString());
  }
}

/**
 * POST handler for providers that use POST for callbacks
 */
export async function POST(request: NextRequest) {
  let code: string | null = null;
  let state: string | null = null;
  let error: string | null = null;
  let errorDescription: string | null = null;

  const contentType = request.headers.get('content-type') || '';

  if (contentType.includes('application/x-www-form-urlencoded')) {
    const formData = await request.formData();
    code = formData.get('code') as string | null;
    state = formData.get('state') as string | null;
    error = formData.get('error') as string | null;
    errorDescription = formData.get('error_description') as string | null;
  } else if (contentType.includes('application/json')) {
    const body = await request.json();
    code = body.code;
    state = body.state;
    error = body.error;
    errorDescription = body.error_description;
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  if (error) {
    const errorMessage = errorDescription || error;
    console.error('OAuth provider error:', error, errorDescription);
    await tryFailConnectSession(state, errorMessage);
    return NextResponse.redirect(buildErrorRedirect(errorMessage, state, appUrl).toString());
  }

  if (!code || !state) {
    await tryFailConnectSession(state, 'Invalid OAuth callback parameters');
    return NextResponse.redirect(
      buildErrorRedirect('Invalid OAuth callback parameters', state, appUrl).toString()
    );
  }

  try {
    const result = await handleOAuthCallback(code, state);
    return NextResponse.redirect(buildSuccessRedirect(result, appUrl).toString());
  } catch (error) {
    console.error('OAuth callback error:', error);

    const errorMessage =
      error instanceof AuthServiceError ? error.message : 'Failed to complete OAuth connection';

    return NextResponse.redirect(buildErrorRedirect(errorMessage, state, appUrl).toString());
  }
}
