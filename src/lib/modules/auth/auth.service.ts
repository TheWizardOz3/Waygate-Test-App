/**
 * Auth Service
 *
 * Orchestrates authentication flows including OAuth.
 * Manages OAuth state and coordinates between providers and credential storage.
 */

import { prisma } from '@/lib/db/client';
import { AuthType } from '@prisma/client';
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

/**
 * In-memory OAuth state storage
 * For production, consider using Redis or database storage
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

/**
 * Initiates an OAuth connection for an integration
 *
 * @param integrationId - The integration to connect
 * @param tenantId - The tenant initiating the connection
 * @param redirectAfterAuth - Optional URL to redirect to after auth completes
 * @param connectionId - Optional connection ID for multi-app connections
 * @returns The authorization URL to redirect the user to
 */
export async function initiateOAuthConnection(
  integrationId: string,
  tenantId: string,
  redirectAfterAuth?: string,
  connectionId?: string
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

  // Parse the auth config
  const authConfig = integration.authConfig as unknown as OAuthIntegrationConfig;

  if (!authConfig.authorizationUrl || !authConfig.tokenUrl) {
    throw new AuthServiceError(
      'INVALID_AUTH_CONFIG',
      'Integration OAuth configuration is incomplete'
    );
  }

  if (!authConfig.clientId || !authConfig.clientSecret) {
    throw new AuthServiceError(
      'MISSING_CREDENTIALS',
      'OAuth client credentials are not configured'
    );
  }

  // Build the redirect URI
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const redirectUri = `${appUrl}/api/v1/auth/callback/oauth2`;

  // Create the provider
  const provider = createGenericProvider(
    authConfig,
    authConfig.clientId,
    authConfig.clientSecret,
    redirectUri
  );

  // Generate authorization URL (with optional connectionId for multi-app support)
  const { url, state } = provider.getAuthorizationUrl(
    integrationId,
    tenantId,
    redirectAfterAuth,
    connectionId
  );

  // Store the state for callback validation
  oauthStateStore.set(state.state, state);

  return {
    authorizationUrl: url,
    state: state.state,
  };
}

/**
 * Handles the OAuth callback after user authorization
 */
export async function handleOAuthCallback(
  code: string,
  stateParam: string
): Promise<{
  integrationId: string;
  tenantId: string;
  connectionId?: string;
  redirectUrl?: string;
}> {
  // Retrieve and validate the stored state
  const storedState = oauthStateStore.get(stateParam);

  if (!storedState) {
    throw new AuthServiceError(
      'INVALID_STATE',
      'OAuth state not found or expired. Please try again.',
      400
    );
  }

  // Check if state is expired
  if (isStateExpired(storedState)) {
    oauthStateStore.delete(stateParam);
    throw new AuthServiceError('STATE_EXPIRED', 'OAuth session expired. Please try again.', 400);
  }

  // Remove the state (single use)
  oauthStateStore.delete(stateParam);

  // Get the integration
  const integration = await prisma.integration.findFirst({
    where: {
      id: storedState.integrationId,
      tenantId: storedState.tenantId,
    },
  });

  if (!integration) {
    throw new AuthServiceError('INTEGRATION_NOT_FOUND', 'Integration not found', 404);
  }

  const authConfig = integration.authConfig as unknown as OAuthIntegrationConfig;

  // Build the redirect URI (must match what was used in authorization)
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const redirectUri = `${appUrl}/api/v1/auth/callback/oauth2`;

  // Create the provider
  const provider = createGenericProvider(
    authConfig,
    authConfig.clientId,
    authConfig.clientSecret,
    redirectUri
  );

  // Exchange the code for tokens
  let tokens: OAuthTokenResponse;
  try {
    tokens = await provider.exchangeCode(code, storedState);
  } catch (error) {
    if (error instanceof OAuthError) {
      throw new AuthServiceError(
        'TOKEN_EXCHANGE_FAILED',
        `Failed to exchange authorization code: ${error.message}`,
        400
      );
    }
    throw error;
  }

  // Store the credentials (with optional connectionId for multi-app support)
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
    storedState.connectionId
  );

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

  return {
    integrationId: storedState.integrationId,
    tenantId: storedState.tenantId,
    connectionId: storedState.connectionId,
    redirectUrl: storedState.redirectAfterAuth,
  };
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
