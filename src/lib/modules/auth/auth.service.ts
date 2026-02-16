/**
 * Auth Service
 *
 * Orchestrates authentication flows including OAuth.
 * Manages OAuth state and coordinates between providers and credential storage.
 *
 * Supports three credential source patterns:
 * - platform: Uses Waygate's registered OAuth apps (one-click connect)
 * - user_owned: User provides their own OAuth app credentials (custom)
 * - app_scoped: App-level OAuth credentials from AppIntegrationConfig (end-user auth delegation)
 *
 * For end-user connect flows, OAuth state is persisted in the ConnectSession
 * metadata for multi-instance resilience.
 */

import { prisma } from '@/lib/db/client';
import { AuthType, CredentialSource, CredentialType, ConnectorType } from '@prisma/client';
import { getPlatformConnectorWithSecretsById } from '../platform-connectors';
import {
  createGenericProvider,
  type OAuthState,
  type OAuthTokenResponse,
  OAuthError,
  isStateExpired,
} from './oauth-providers';
import {
  storeOAuth2Credential,
  storeApiKeyCredential,
  storeBasicCredential,
  storeBearerCredential,
  getCredentialStatus,
  getCredentialStatuses,
  revokeCredential as revokeCredentialService,
} from '../credentials/credential.service';
import { findActiveCredentialForIntegration } from '../credentials/credential.repository';
import { getDecryptedIntegrationConfig } from '../apps/app.service';
import { storeUserCredential } from '../app-user-credentials/app-user-credential.service';
import { completeSession, failSession } from '../connect-sessions/connect-session.service';

/**
 * In-memory OAuth state storage.
 * For connect flows, state is also persisted in ConnectSession.metadata
 * for multi-instance resilience.
 */
const oauthStateStore = new Map<string, OAuthState>();

/**
 * OAuth state cleanup interval (10 minutes)
 */
const STATE_CLEANUP_INTERVAL = 600000;
const STATE_MAX_AGE = 600000; // 10 minutes

// Cleanup expired states periodically
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    oauthStateStore.forEach((state, key) => {
      if (now - state.createdAt.getTime() > STATE_MAX_AGE) {
        oauthStateStore.delete(key);
      }
    });
  }, STATE_CLEANUP_INTERVAL);
}

/**
 * Error thrown during auth operations
 */
export class AuthServiceError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number = 400
  ) {
    super(message);
    this.name = 'AuthServiceError';
  }
}

/**
 * OAuth connection configuration from integration
 */
interface OAuthIntegrationConfig {
  authorizationUrl: string;
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
  scopes?: string[];
  usePkce?: boolean;
  introspectionUrl?: string;
  revocationUrl?: string;
  userInfoUrl?: string;
  additionalAuthParams?: Record<string, string>;
  additionalTokenParams?: Record<string, string>;
}

import type { OAuthCallbackResult } from './auth.schemas';

/**
 * Optional app context for initiating OAuth with app-scoped credentials
 */
interface AppOAuthContext {
  appId: string;
  appUserId?: string;
  connectSessionToken?: string;
}

/**
 * Initiates an OAuth connection for an integration.
 *
 * Credential resolution priority:
 * 1. Platform connector credentials (if connection uses a platform connector)
 * 2. App-scoped credentials (from AppIntegrationConfig, if appContext provided)
 * 3. Integration-level authConfig credentials (fallback)
 *
 * @param integrationId - The integration to connect
 * @param tenantId - The tenant initiating the connection
 * @param redirectAfterAuth - Optional URL to redirect to after auth completes
 * @param connectionId - Optional connection ID for multi-app connections
 * @param appContext - Optional app context for app-scoped OAuth flows
 * @returns The authorization URL to redirect the user to
 */
export async function initiateOAuthConnection(
  integrationId: string,
  tenantId: string,
  redirectAfterAuth?: string,
  connectionId?: string,
  appContext?: AppOAuthContext
): Promise<{ authorizationUrl: string; state: string }> {
  // Get the integration
  const integration = await prisma.integration.findFirst({
    where: {
      id: integrationId,
      tenantId,
    },
  });

  if (!integration) {
    throw new AuthServiceError('INTEGRATION_NOT_FOUND', 'Integration not found', 404);
  }

  if (integration.authType !== AuthType.oauth2) {
    throw new AuthServiceError(
      'INVALID_AUTH_TYPE',
      'Integration does not use OAuth2 authentication'
    );
  }

  // Check if this is a platform connection
  let isPlatformConnection = false;
  let platformConnectorId: string | undefined;
  let platformCredentials: { clientId: string; clientSecret: string } | undefined;

  if (connectionId) {
    const connection = await prisma.connection.findFirst({
      where: { id: connectionId, tenantId },
    });

    if (connection?.connectorType === ConnectorType.platform && connection.platformConnectorId) {
      isPlatformConnection = true;
      platformConnectorId = connection.platformConnectorId;

      // Retrieve and decrypt platform connector credentials
      const platformConnector = await getPlatformConnectorWithSecretsById(platformConnectorId);
      if (!platformConnector) {
        throw new AuthServiceError(
          'PLATFORM_CONNECTOR_NOT_FOUND',
          'Platform connector not found or no longer available',
          404
        );
      }

      platformCredentials = {
        clientId: platformConnector.clientId,
        clientSecret: platformConnector.clientSecret,
      };
    }
  }

  // Parse the auth config from integration (used for URLs and scopes)
  const authConfig = integration.authConfig as unknown as OAuthIntegrationConfig;

  if (!authConfig.authorizationUrl || !authConfig.tokenUrl) {
    throw new AuthServiceError(
      'INVALID_AUTH_CONFIG',
      'Integration OAuth configuration is incomplete'
    );
  }

  // Determine which credentials to use (priority: platform > app > integration)
  let clientId: string;
  let clientSecret: string;
  let credentialSourceLabel: 'platform' | 'user_owned' = 'user_owned';

  if (isPlatformConnection && platformCredentials) {
    // Priority 1: Platform connector credentials
    clientId = platformCredentials.clientId;
    clientSecret = platformCredentials.clientSecret;
    credentialSourceLabel = 'platform';
  } else if (appContext?.appId) {
    // Priority 2: App-scoped credentials from AppIntegrationConfig
    const appConfig = await getDecryptedIntegrationConfig(appContext.appId, integrationId);

    if (appConfig) {
      clientId = appConfig.clientId;
      clientSecret = appConfig.clientSecret;
    } else {
      // Fall back to integration-level credentials
      if (!authConfig.clientId || !authConfig.clientSecret) {
        throw new AuthServiceError(
          'MISSING_CREDENTIALS',
          'No OAuth credentials configured: neither app integration config nor integration-level credentials found'
        );
      }
      clientId = authConfig.clientId;
      clientSecret = authConfig.clientSecret;
    }
  } else {
    // Priority 3: Integration's own credentials
    if (!authConfig.clientId || !authConfig.clientSecret) {
      throw new AuthServiceError(
        'MISSING_CREDENTIALS',
        'OAuth client credentials are not configured'
      );
    }
    clientId = authConfig.clientId;
    clientSecret = authConfig.clientSecret;
  }

  // Build the redirect URI
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const redirectUri = `${appUrl}/api/v1/auth/callback/oauth2`;

  // Create the provider
  const provider = createGenericProvider(authConfig, clientId, clientSecret, redirectUri);

  // Generate authorization URL (with optional connectionId for multi-app support)
  const { url, state } = provider.getAuthorizationUrl(
    integrationId,
    tenantId,
    redirectAfterAuth,
    connectionId
  );

  // Add context to state
  state.credentialSource = credentialSourceLabel;
  if (platformConnectorId) {
    state.platformConnectorId = platformConnectorId;
  }

  // Add app context to state for callback resolution
  if (appContext) {
    state.appId = appContext.appId;
    state.appUserId = appContext.appUserId;
    state.connectSessionToken = appContext.connectSessionToken;
  }

  // Store the state for callback validation (in-memory)
  oauthStateStore.set(state.state, state);

  // For connect flows, also persist state in ConnectSession.metadata
  // so it survives multi-instance deployments
  if (appContext?.connectSessionToken) {
    await persistOAuthStateToConnectSession(appContext.connectSessionToken, state);
  }

  return {
    authorizationUrl: url,
    state: state.state,
  };
}

/**
 * Handles the OAuth callback after user authorization.
 *
 * For app-scoped flows:
 * - Uses the app's OAuth credentials for token exchange
 * - Stores credential as AppUserCredential (if appUserId present) or IntegrationCredential
 * - Completes the ConnectSession if connectSessionToken present
 */
export async function handleOAuthCallback(
  code: string,
  stateParam: string
): Promise<OAuthCallbackResult> {
  // Try in-memory state first, then fall back to DB for connect flows
  let storedState: OAuthState | undefined = oauthStateStore.get(stateParam);

  if (storedState) {
    // Remove from in-memory (single use)
    oauthStateStore.delete(stateParam);
  } else {
    // Fall back to DB lookup via ConnectSession metadata
    storedState = (await retrieveOAuthStateFromConnectSession(stateParam)) ?? undefined;
  }

  if (!storedState) {
    throw new AuthServiceError(
      'INVALID_STATE',
      'OAuth state not found or expired. Please try again.',
      400
    );
  }

  // Check if state is expired
  if (isStateExpired(storedState)) {
    // If this was a connect flow, mark the session as failed
    if (storedState.connectSessionToken) {
      try {
        await failSession(storedState.connectSessionToken, 'OAuth session expired');
      } catch {
        // Best-effort: session may already be expired/failed
      }
    }
    throw new AuthServiceError('STATE_EXPIRED', 'OAuth session expired. Please try again.', 400);
  }

  // Get the integration
  const integration = await prisma.integration.findFirst({
    where: {
      id: storedState.integrationId,
      tenantId: storedState.tenantId,
    },
  });

  if (!integration) {
    if (storedState.connectSessionToken) {
      try {
        await failSession(storedState.connectSessionToken, 'Integration not found');
      } catch {
        // Best-effort
      }
    }
    throw new AuthServiceError('INTEGRATION_NOT_FOUND', 'Integration not found', 404);
  }

  const authConfig = integration.authConfig as unknown as OAuthIntegrationConfig;

  // Build the redirect URI (must match what was used in authorization)
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const redirectUri = `${appUrl}/api/v1/auth/callback/oauth2`;

  // Determine which credentials to use for token exchange
  // Same priority as initiation: platform > app > integration
  let clientId: string;
  let clientSecret: string;

  if (storedState.credentialSource === 'platform' && storedState.platformConnectorId) {
    // Platform connector credentials
    const platformConnector = await getPlatformConnectorWithSecretsById(
      storedState.platformConnectorId
    );
    if (!platformConnector) {
      throw new AuthServiceError(
        'PLATFORM_CONNECTOR_NOT_FOUND',
        'Platform connector not found or no longer available',
        404
      );
    }
    clientId = platformConnector.clientId;
    clientSecret = platformConnector.clientSecret;
  } else if (storedState.appId) {
    // App-scoped credentials
    const appConfig = await getDecryptedIntegrationConfig(
      storedState.appId,
      storedState.integrationId
    );
    if (appConfig) {
      clientId = appConfig.clientId;
      clientSecret = appConfig.clientSecret;
    } else {
      // Fall back to integration-level credentials
      clientId = authConfig.clientId;
      clientSecret = authConfig.clientSecret;
    }
  } else {
    // Integration-level credentials
    clientId = authConfig.clientId;
    clientSecret = authConfig.clientSecret;
  }

  // Create the provider
  const provider = createGenericProvider(authConfig, clientId, clientSecret, redirectUri);

  // Exchange the code for tokens
  let tokens: OAuthTokenResponse;
  try {
    tokens = await provider.exchangeCode(code, storedState);
  } catch (error) {
    if (storedState.connectSessionToken) {
      try {
        const msg = error instanceof OAuthError ? error.message : 'Token exchange failed';
        await failSession(storedState.connectSessionToken, msg);
      } catch {
        // Best-effort
      }
    }
    if (error instanceof OAuthError) {
      throw new AuthServiceError(
        'TOKEN_EXCHANGE_FAILED',
        `Failed to exchange authorization code: ${error.message}`,
        400
      );
    }
    throw error;
  }

  // Route credential storage based on whether this is an end-user or shared flow
  if (storedState.appUserId && storedState.connectionId) {
    // End-user flow: store as AppUserCredential under the Connection
    await storeUserCredential(storedState.connectionId, storedState.appUserId, {
      credentialType: CredentialType.oauth2_tokens,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      tokenType: tokens.tokenType,
      expiresIn: tokens.expiresIn,
      scopes: tokens.scope?.split(' '),
    });
  } else {
    // Shared/org flow: store as IntegrationCredential on the Connection (existing behavior)
    const credentialSource =
      storedState.credentialSource === 'platform'
        ? CredentialSource.platform
        : CredentialSource.user_owned;

    await storeOAuth2Credential(
      storedState.tenantId,
      storedState.integrationId,
      {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        tokenType: tokens.tokenType,
        expiresIn: tokens.expiresIn,
        scopes: tokens.scope?.split(' '),
      },
      storedState.connectionId,
      credentialSource
    );
  }

  // Update integration status to active
  await prisma.integration.update({
    where: { id: storedState.integrationId },
    data: { status: 'active' },
  });

  // Update connection status to active if connectionId provided
  if (storedState.connectionId) {
    await prisma.connection.update({
      where: { id: storedState.connectionId },
      data: { status: 'active' },
    });
  }

  // Complete the connect session if this was a connect flow
  if (storedState.connectSessionToken && storedState.connectionId) {
    try {
      await completeSession(storedState.connectSessionToken, storedState.connectionId);
    } catch (error) {
      // Log but don't fail the OAuth flow if session completion fails
      console.warn('Failed to complete connect session:', error);
    }
  }

  // Build redirect URL — for connect flows, use the session's redirectUrl
  let redirectUrl = storedState.redirectAfterAuth;
  if (storedState.connectSessionToken && !redirectUrl) {
    // Look up the connect session's redirectUrl
    const session = await prisma.connectSession.findFirst({
      where: { token: storedState.connectSessionToken },
      select: { redirectUrl: true },
    });
    redirectUrl = session?.redirectUrl ?? undefined;
  }

  return {
    integrationId: storedState.integrationId,
    tenantId: storedState.tenantId,
    connectionId: storedState.connectionId,
    redirectUrl,
    connectSessionToken: storedState.connectSessionToken,
    appUserId: storedState.appUserId,
  };
}

// =============================================================================
// OAUTH STATE PERSISTENCE (Connect Flow DB Backup)
// =============================================================================

/**
 * Persists OAuth state into the ConnectSession's metadata for multi-instance resilience.
 * The connect session token maps to the OAuth state param, allowing retrieval on callback.
 */
async function persistOAuthStateToConnectSession(
  connectSessionToken: string,
  state: OAuthState
): Promise<void> {
  try {
    await prisma.connectSession.update({
      where: { token: connectSessionToken },
      data: {
        metadata: {
          oauthStateParam: state.state,
          oauthCodeVerifier: state.codeVerifier,
          oauthCreatedAt: state.createdAt.toISOString(),
        },
      },
    });
  } catch (error) {
    // Non-fatal: in-memory store is the primary mechanism
    console.warn('Failed to persist OAuth state to ConnectSession:', error);
  }
}

/**
 * Retrieves OAuth state from ConnectSession metadata when in-memory lookup fails.
 * Used for multi-instance deployments where the callback hits a different server.
 */
async function retrieveOAuthStateFromConnectSession(
  stateParam: string
): Promise<OAuthState | null> {
  try {
    // Query ConnectSession where metadata contains this OAuth state param
    const session = await prisma.connectSession.findFirst({
      where: {
        status: 'pending',
        metadata: {
          path: ['oauthStateParam'],
          equals: stateParam,
        },
      },
      include: {
        app: { select: { id: true } },
        appUser: { select: { id: true } },
      },
    });

    if (!session) {
      return null;
    }

    const metadata = session.metadata as Record<string, unknown>;

    return {
      state: stateParam,
      codeVerifier: metadata.oauthCodeVerifier as string | undefined,
      integrationId: session.integrationId,
      tenantId: session.appId
        ? ((
            await prisma.app.findUnique({
              where: { id: session.appId },
              select: { tenantId: true },
            })
          )?.tenantId ?? '')
        : '',
      connectionId: session.connectionId ?? undefined,
      appId: session.appId,
      appUserId: session.appUser?.id,
      connectSessionToken: session.token,
      createdAt: new Date((metadata.oauthCreatedAt as string) || session.createdAt.toISOString()),
    };
  } catch {
    return null;
  }
}

/**
 * Gets the OAuth connection status for an integration
 */
export async function getOAuthConnectionStatus(
  integrationId: string,
  tenantId: string
): Promise<{
  connected: boolean;
  status?: string;
  expiresAt?: string | null;
}> {
  const credentialStatus = await getCredentialStatus(integrationId, tenantId);

  if (!credentialStatus) {
    return { connected: false };
  }

  return {
    connected: credentialStatus.status === 'active',
    status: credentialStatus.status,
    expiresAt: credentialStatus.expiresAt,
  };
}

/**
 * Validates that an OAuth state matches what we stored
 */
export function validateOAuthState(stateParam: string): OAuthState | null {
  const storedState = oauthStateStore.get(stateParam);

  if (!storedState || isStateExpired(storedState)) {
    return null;
  }

  return storedState;
}

// =============================================================================
// NON-OAUTH CREDENTIAL STORAGE
// =============================================================================

/**
 * Stores API key credentials for an integration
 */
export async function storeApiKey(
  tenantId: string,
  integrationId: string,
  data: {
    apiKey: string;
    placement: 'header' | 'query' | 'body';
    paramName: string;
  }
): Promise<void> {
  // Verify integration exists and belongs to tenant
  const integration = await prisma.integration.findFirst({
    where: { id: integrationId, tenantId },
  });

  if (!integration) {
    throw new AuthServiceError('INTEGRATION_NOT_FOUND', 'Integration not found', 404);
  }

  if (integration.authType !== AuthType.api_key) {
    throw new AuthServiceError(
      'INVALID_AUTH_TYPE',
      'Integration does not use API key authentication'
    );
  }

  await storeApiKeyCredential(tenantId, integrationId, data);

  // Update integration status
  await prisma.integration.update({
    where: { id: integrationId },
    data: { status: 'active' },
  });
}

/**
 * Stores Basic auth credentials for an integration
 */
export async function storeBasicAuth(
  tenantId: string,
  integrationId: string,
  data: {
    username: string;
    password: string;
  }
): Promise<void> {
  const integration = await prisma.integration.findFirst({
    where: { id: integrationId, tenantId },
  });

  if (!integration) {
    throw new AuthServiceError('INTEGRATION_NOT_FOUND', 'Integration not found', 404);
  }

  if (integration.authType !== AuthType.basic) {
    throw new AuthServiceError(
      'INVALID_AUTH_TYPE',
      'Integration does not use Basic authentication'
    );
  }

  await storeBasicCredential(tenantId, integrationId, data);

  await prisma.integration.update({
    where: { id: integrationId },
    data: { status: 'active' },
  });
}

/**
 * Stores Bearer token credentials for an integration
 */
export async function storeBearerToken(
  tenantId: string,
  integrationId: string,
  data: {
    token: string;
  }
): Promise<void> {
  const integration = await prisma.integration.findFirst({
    where: { id: integrationId, tenantId },
  });

  if (!integration) {
    throw new AuthServiceError('INTEGRATION_NOT_FOUND', 'Integration not found', 404);
  }

  if (integration.authType !== AuthType.bearer) {
    throw new AuthServiceError(
      'INVALID_AUTH_TYPE',
      'Integration does not use Bearer token authentication'
    );
  }

  await storeBearerCredential(tenantId, integrationId, data);

  await prisma.integration.update({
    where: { id: integrationId },
    data: { status: 'active' },
  });
}

// =============================================================================
// CREDENTIAL MANAGEMENT
// =============================================================================

/**
 * Disconnects an integration by revoking its credentials
 */
export async function disconnectIntegration(
  integrationId: string,
  tenantId: string
): Promise<{ disconnected: boolean; message: string }> {
  const credential = await findActiveCredentialForIntegration(integrationId, tenantId);

  if (!credential) {
    return { disconnected: false, message: 'Integration was not connected' };
  }

  await revokeCredentialService(credential.id, tenantId);

  await prisma.integration.update({
    where: { id: integrationId },
    data: { status: 'draft' },
  });

  return { disconnected: true, message: 'Integration disconnected successfully' };
}

/**
 * Gets comprehensive auth status for an integration
 */
export async function getIntegrationAuthStatus(
  integrationId: string,
  tenantId: string
): Promise<{
  integration: {
    id: string;
    name: string;
    authType: AuthType;
    status: string;
  };
  credentials: {
    hasCredentials: boolean;
    status?: string;
    credentialType?: string;
    expiresAt?: string | null;
    scopes?: string[];
  };
}> {
  const integration = await prisma.integration.findFirst({
    where: { id: integrationId, tenantId },
  });

  if (!integration) {
    throw new AuthServiceError('INTEGRATION_NOT_FOUND', 'Integration not found', 404);
  }

  const credentialStatus = await getCredentialStatus(integrationId, tenantId);

  return {
    integration: {
      id: integration.id,
      name: integration.name,
      authType: integration.authType,
      status: integration.status,
    },
    credentials: credentialStatus
      ? {
          hasCredentials: true,
          status: credentialStatus.status,
          credentialType: credentialStatus.credentialType,
          expiresAt: credentialStatus.expiresAt,
          scopes: credentialStatus.scopes,
        }
      : {
          hasCredentials: false,
        },
  };
}

/**
 * Gets all credential statuses for an integration (including revoked)
 */
export async function getIntegrationCredentialHistory(integrationId: string, tenantId: string) {
  return getCredentialStatuses(integrationId, tenantId);
}
