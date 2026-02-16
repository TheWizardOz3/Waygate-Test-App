/**
 * Hosted Connect Page
 *
 * Public page at /connect/[token] for end-users to connect their accounts
 * through a consuming app's OAuth flow. No API key needed — the connect
 * session token serves as authorization.
 *
 * Flow:
 * 1. Server validates the token and loads session data
 * 2. Client displays app branding, integration info, and scopes
 * 3. User clicks "Connect" → OAuth flow initiates → callback redirects to consuming app
 */

import { validateSession } from '@/lib/modules/connect-sessions/connect-session.service';
import { findIntegrationConfig } from '@/lib/modules/apps/app.repository';
import { ConnectPageClient } from './ConnectPageClient';
import { ConnectPageError } from './ConnectPageError';
import {
  ConnectSessionNotFoundError,
  ConnectSessionExpiredError,
  ConnectSessionAlreadyCompletedError,
} from '@/lib/modules/connect-sessions/connect-session.errors';

interface ConnectPageProps {
  params: Promise<{ token: string }>;
}

export default async function ConnectPage({ params }: ConnectPageProps) {
  const { token } = await params;

  try {
    const session = await validateSession(token);

    // Load scopes from AppIntegrationConfig
    const integrationConfig = await findIntegrationConfig(session.appId, session.integrationId);
    const scopes = integrationConfig?.scopes ?? [];

    // Extract branding from app metadata
    const metadata = session.app.metadata as Record<string, unknown> | null;
    const branding = (metadata?.branding as Record<string, string> | undefined) ?? {};

    return (
      <ConnectPageClient
        token={token}
        appName={branding.appName || session.app.name}
        appLogoUrl={branding.logoUrl}
        accentColor={branding.accentColor}
        privacyUrl={branding.privacyUrl}
        integrationName={session.integration.name}
        integrationLogoUrl={session.integration.logoUrl}
        scopes={scopes}
      />
    );
  } catch (error) {
    if (error instanceof ConnectSessionNotFoundError) {
      return <ConnectPageError type="not_found" />;
    }
    if (error instanceof ConnectSessionExpiredError) {
      return <ConnectPageError type="expired" />;
    }
    if (error instanceof ConnectSessionAlreadyCompletedError) {
      return <ConnectPageError type="completed" />;
    }
    return <ConnectPageError type="error" />;
  }
}
