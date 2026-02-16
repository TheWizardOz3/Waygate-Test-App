/**
 * Token Refresh Service
 *
 * Proactive token refresh system that monitors token expiration and refreshes
 * credentials before they expire, ensuring uninterrupted API access.
 *
 * Features:
 * - Automatic refresh of expiring OAuth2 tokens
 * - Retry logic with exponential backoff
 * - Concurrent refresh prevention via advisory locks
 * - Refresh token rotation handling
 * - Structured logging without sensitive data
 */

import {
  findExpiringOAuth2Credentials,
  tryAcquireRefreshLock,
  releaseRefreshLock,
  type CredentialWithIntegration,
} from './credential.repository';
import {
  updateOAuth2Tokens,
  flagCredentialForReauth,
  getDecryptedCredentialById,
} from './credential.service';
import {
  createGenericProvider,
  OAuthError,
  type OAuthTokenResponse,
} from '../auth/oauth-providers';
import {
  findExpiringCredentialsWithRelations,
  type UserCredentialWithRelations,
} from '../app-user-credentials/app-user-credential.repository';
import {
  getDecryptedUserCredentialById,
  refreshUserCredential,
  flagUserCredentialForReauth,
} from '../app-user-credentials/app-user-credential.service';
import { getDecryptedIntegrationConfig } from '../apps/app.service';

// =============================================================================
// CONFIGURATION
// =============================================================================

/** Default buffer time in minutes - refresh tokens expiring within this window */
export const DEFAULT_BUFFER_MINUTES = 10;

/** Maximum number of retry attempts for a single refresh */
export const MAX_RETRY_ATTEMPTS = 3;

/** Base delay for exponential backoff in milliseconds */
export const BASE_BACKOFF_MS = 1000;

// =============================================================================
// TYPES
// =============================================================================

/**
 * Result of a single credential refresh attempt
 */
export interface RefreshResult {
  credentialId: string;
  integrationId: string;
  tenantId: string;
  connectionId?: string | null; // For multi-app connection tracking
  appUserId?: string | null; // For end-user credential tracking
  credentialKind: 'integration' | 'user'; // Distinguishes IntegrationCredential vs AppUserCredential
  success: boolean;
  rotatedRefreshToken: boolean;
  retryCount: number;
  error?: {
    code: string;
    message: string;
  };
}

/**
 * Summary of a batch token refresh operation
 */
export interface RefreshBatchResult {
  startedAt: Date;
  completedAt: Date;
  totalProcessed: number;
  successful: number;
  failed: number;
  skipped: number;
  results: RefreshResult[];
}

/**
 * Token refresh event for logging
 */
export interface TokenRefreshEvent {
  event: 'TOKEN_REFRESH';
  credentialId: string;
  integrationId: string;
  tenantId: string;
  connectionId?: string | null; // For multi-app connection tracking
  appUserId?: string | null; // For end-user credential tracking
  credentialKind: 'integration' | 'user';
  status: 'success' | 'failed' | 'skipped';
  retryCount: number;
  rotatedRefreshToken: boolean;
  durationMs: number;
  error?: {
    code: string;
    message: string;
  };
}

// =============================================================================
// LOGGING
// =============================================================================

/**
 * Structured log entry for token refresh operations
 * Compatible with log aggregation systems (Vercel Logs, Axiom, etc.)
 */
interface StructuredLogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  message: string;
  event: string;
  context: Record<string, unknown>;
}

/**
 * Creates a structured log entry
 * Formats logs as JSON for production log aggregation
 */
function createStructuredLog(
  level: 'info' | 'warn' | 'error',
  message: string,
  event: string,
  context: Record<string, unknown>
): StructuredLogEntry {
  return {
    timestamp: new Date().toISOString(),
    level,
    message,
    event,
    context,
  };
}

/**
 * Logs a token refresh event
 * Never logs actual tokens or sensitive data
 *
 * Output format is JSON-structured for production log aggregation systems.
 * In development, also outputs a human-readable message.
 */
function logRefreshEvent(event: TokenRefreshEvent): void {
  const level = event.status === 'failed' ? 'error' : 'info';
  const message = `Token refresh ${event.status} for credential ${event.credentialId}`;

  // Create structured log context (excluding any sensitive data)
  const context: Record<string, unknown> = {
    credentialId: event.credentialId,
    integrationId: event.integrationId,
    tenantId: event.tenantId,
    credentialKind: event.credentialKind,
    status: event.status,
    retryCount: event.retryCount,
    rotatedRefreshToken: event.rotatedRefreshToken,
    durationMs: event.durationMs,
  };

  // Include connectionId if present (for multi-app tracking)
  if (event.connectionId) {
    context.connectionId = event.connectionId;
  }

  // Include appUserId if present (for end-user tracking)
  if (event.appUserId) {
    context.appUserId = event.appUserId;
  }

  // Include error details if present (already sanitized)
  if (event.error) {
    context.errorCode = event.error.code;
    context.errorMessage = event.error.message;
  }

  const structuredLog = createStructuredLog(level, message, 'TOKEN_REFRESH', context);

  // Human-readable message for development/debugging
  const connectionSuffix = event.connectionId ? ` connection=${event.connectionId}` : '';
  const userSuffix = event.appUserId ? ` appUser=${event.appUserId}` : '';
  const kindSuffix = event.credentialKind === 'user' ? ' [user-credential]' : '';
  const humanMessage = `[TOKEN_REFRESH] ${event.status.toUpperCase()} - credential=${event.credentialId} integration=${event.integrationId}${connectionSuffix}${userSuffix}${kindSuffix} retries=${event.retryCount} duration=${event.durationMs}ms${event.rotatedRefreshToken ? ' (refresh token rotated)' : ''}${event.error ? ` error=${event.error.code}` : ''}`;

  // Log based on level
  if (level === 'error') {
    console.error(humanMessage);
    console.error(JSON.stringify(structuredLog));
  } else {
    console.info(humanMessage);
    // Only output structured JSON in production to reduce log noise in development
    if (process.env.NODE_ENV === 'production') {
      console.info(JSON.stringify(structuredLog));
    }
  }
}

/**
 * Logs a batch refresh operation summary
 */
export function logBatchRefreshSummary(result: RefreshBatchResult): void {
  const durationMs = result.completedAt.getTime() - result.startedAt.getTime();
  const level = result.failed > 0 ? 'warn' : 'info';
  const message = `Token refresh batch completed: ${result.successful}/${result.totalProcessed} successful`;

  const context: Record<string, unknown> = {
    totalProcessed: result.totalProcessed,
    successful: result.successful,
    failed: result.failed,
    skipped: result.skipped,
    durationMs,
    startedAt: result.startedAt.toISOString(),
    completedAt: result.completedAt.toISOString(),
  };

  const structuredLog = createStructuredLog(level, message, 'TOKEN_REFRESH_BATCH', context);

  const humanMessage = `[TOKEN_REFRESH_BATCH] ${result.successful}/${result.totalProcessed} successful, ${result.failed} failed, ${result.skipped} skipped in ${durationMs}ms`;

  if (level === 'warn') {
    console.warn(humanMessage);
    console.warn(JSON.stringify(structuredLog));
  } else {
    console.info(humanMessage);
    if (process.env.NODE_ENV === 'production') {
      console.info(JSON.stringify(structuredLog));
    }
  }
}

// =============================================================================
// MAIN ORCHESTRATION
// =============================================================================

/**
 * Refreshes all expiring OAuth2 tokens (both IntegrationCredentials and AppUserCredentials)
 *
 * This is the main entry point called by the background job.
 * It finds all credentials expiring within the buffer window and
 * refreshes them with proper locking and retry logic.
 *
 * @param bufferMinutes - Minutes before expiration to consider "expiring"
 * @returns Summary of the refresh operation
 */
export async function refreshExpiringTokens(
  bufferMinutes: number = DEFAULT_BUFFER_MINUTES
): Promise<RefreshBatchResult> {
  const startedAt = new Date();
  const results: RefreshResult[] = [];
  let successful = 0;
  let failed = 0;
  let skipped = 0;

  // Find all integration credentials expiring within the buffer window
  const expiringCredentials = await findExpiringOAuth2Credentials(bufferMinutes);

  // Find all user credentials expiring within the buffer window
  const expiringUserCredentials = await findExpiringCredentialsWithRelations(bufferMinutes);

  const totalCount = expiringCredentials.length + expiringUserCredentials.length;

  console.info(
    `[TOKEN_REFRESH] Starting batch refresh: ${totalCount} credentials expiring within ${bufferMinutes} minutes (${expiringCredentials.length} integration, ${expiringUserCredentials.length} user)`
  );

  // Process integration credentials
  for (const credential of expiringCredentials) {
    const result = await refreshSingleCredentialWithLock(credential);
    results.push(result);

    if (result.success) {
      successful++;
    } else if (result.error?.code === 'LOCK_NOT_ACQUIRED') {
      skipped++;
    } else {
      failed++;
    }
  }

  // Process user credentials
  for (const userCredential of expiringUserCredentials) {
    const result = await refreshSingleUserCredentialWithLock(userCredential);
    results.push(result);

    if (result.success) {
      successful++;
    } else if (result.error?.code === 'LOCK_NOT_ACQUIRED') {
      skipped++;
    } else {
      failed++;
    }
  }

  const completedAt = new Date();

  const batchResult: RefreshBatchResult = {
    startedAt,
    completedAt,
    totalProcessed: totalCount,
    successful,
    failed,
    skipped,
    results,
  };

  // Log batch summary with structured logging
  logBatchRefreshSummary(batchResult);

  return batchResult;
}

/**
 * Refreshes a single credential with lock acquisition
 *
 * Acquires an advisory lock before refreshing to prevent concurrent
 * refresh attempts on the same credential.
 */
async function refreshSingleCredentialWithLock(
  credential: CredentialWithIntegration
): Promise<RefreshResult> {
  const startTime = Date.now();

  // Try to acquire lock
  const lockAcquired = await tryAcquireRefreshLock(credential.id);

  if (!lockAcquired) {
    const event: TokenRefreshEvent = {
      event: 'TOKEN_REFRESH',
      credentialId: credential.id,
      integrationId: credential.integrationId,
      tenantId: credential.tenantId,
      connectionId: credential.connectionId,
      credentialKind: 'integration',
      status: 'skipped',
      retryCount: 0,
      rotatedRefreshToken: false,
      durationMs: Date.now() - startTime,
      error: {
        code: 'LOCK_NOT_ACQUIRED',
        message: 'Another process is already refreshing this credential',
      },
    };
    logRefreshEvent(event);

    return {
      credentialId: credential.id,
      integrationId: credential.integrationId,
      tenantId: credential.tenantId,
      connectionId: credential.connectionId,
      credentialKind: 'integration',
      success: false,
      rotatedRefreshToken: false,
      retryCount: 0,
      error: event.error,
    };
  }

  try {
    // Perform refresh with retry
    return await refreshSingleCredential(credential);
  } finally {
    // Always release lock
    await releaseRefreshLock(credential.id);
  }
}

/**
 * Refreshes a single OAuth2 credential with retry logic
 *
 * @param credential - The credential to refresh, with integration info
 * @returns Result of the refresh operation
 */
export async function refreshSingleCredential(
  credential: CredentialWithIntegration
): Promise<RefreshResult> {
  const startTime = Date.now();
  let lastError: { code: string; message: string } | undefined;
  let retryCount = 0;
  let rotatedRefreshToken = false;

  // Get the decrypted refresh token
  const decrypted = await getDecryptedCredentialById(credential.id, credential.tenantId);
  if (!decrypted || !decrypted.refreshToken) {
    const event: TokenRefreshEvent = {
      event: 'TOKEN_REFRESH',
      credentialId: credential.id,
      integrationId: credential.integrationId,
      tenantId: credential.tenantId,
      connectionId: credential.connectionId,
      credentialKind: 'integration',
      status: 'failed',
      retryCount: 0,
      rotatedRefreshToken: false,
      durationMs: Date.now() - startTime,
      error: {
        code: 'NO_REFRESH_TOKEN',
        message: 'Credential does not have a refresh token',
      },
    };
    logRefreshEvent(event);

    return {
      credentialId: credential.id,
      integrationId: credential.integrationId,
      tenantId: credential.tenantId,
      connectionId: credential.connectionId,
      credentialKind: 'integration',
      success: false,
      rotatedRefreshToken: false,
      retryCount: 0,
      error: event.error,
    };
  }

  // Create OAuth provider for this integration
  const provider = getOAuthProviderForIntegration(credential.integration);
  if (!provider) {
    const event: TokenRefreshEvent = {
      event: 'TOKEN_REFRESH',
      credentialId: credential.id,
      integrationId: credential.integrationId,
      tenantId: credential.tenantId,
      connectionId: credential.connectionId,
      credentialKind: 'integration',
      status: 'failed',
      retryCount: 0,
      rotatedRefreshToken: false,
      durationMs: Date.now() - startTime,
      error: {
        code: 'INVALID_AUTH_CONFIG',
        message: 'Could not create OAuth provider from integration config',
      },
    };
    logRefreshEvent(event);

    return {
      credentialId: credential.id,
      integrationId: credential.integrationId,
      tenantId: credential.tenantId,
      connectionId: credential.connectionId,
      credentialKind: 'integration',
      success: false,
      rotatedRefreshToken: false,
      retryCount: 0,
      error: event.error,
    };
  }

  // Retry loop
  for (let attempt = 0; attempt < MAX_RETRY_ATTEMPTS; attempt++) {
    retryCount = attempt;

    try {
      // Call provider's refresh endpoint
      const tokenResponse = await provider.refreshToken(decrypted.refreshToken);

      // Handle refresh result (store new tokens)
      const handleResult = await handleRefreshResult(credential.id, tokenResponse);
      rotatedRefreshToken = handleResult.rotatedRefreshToken;

      // Success!
      const event: TokenRefreshEvent = {
        event: 'TOKEN_REFRESH',
        credentialId: credential.id,
        integrationId: credential.integrationId,
        tenantId: credential.tenantId,
        connectionId: credential.connectionId,
        credentialKind: 'integration',
        status: 'success',
        retryCount,
        rotatedRefreshToken,
        durationMs: Date.now() - startTime,
      };
      logRefreshEvent(event);

      return {
        credentialId: credential.id,
        integrationId: credential.integrationId,
        tenantId: credential.tenantId,
        connectionId: credential.connectionId,
        credentialKind: 'integration',
        success: true,
        rotatedRefreshToken,
        retryCount,
      };
    } catch (error) {
      lastError = extractErrorInfo(error);

      // Check if error is retryable
      if (!isRetryableError(error)) {
        break;
      }

      // Wait before retry (exponential backoff: 1s, 2s, 4s)
      if (attempt < MAX_RETRY_ATTEMPTS - 1) {
        const backoffMs = BASE_BACKOFF_MS * Math.pow(2, attempt);
        await sleep(backoffMs);
      }
    }
  }

  // All retries exhausted - mark credential as needing re-auth
  await flagCredentialForReauth(credential.id);

  const event: TokenRefreshEvent = {
    event: 'TOKEN_REFRESH',
    credentialId: credential.id,
    integrationId: credential.integrationId,
    tenantId: credential.tenantId,
    connectionId: credential.connectionId,
    credentialKind: 'integration',
    status: 'failed',
    retryCount,
    rotatedRefreshToken: false,
    durationMs: Date.now() - startTime,
    error: lastError,
  };
  logRefreshEvent(event);

  return {
    credentialId: credential.id,
    integrationId: credential.integrationId,
    tenantId: credential.tenantId,
    connectionId: credential.connectionId,
    credentialKind: 'integration',
    success: false,
    rotatedRefreshToken: false,
    retryCount,
    error: lastError,
  };
}

// =============================================================================
// OAUTH PROVIDER CREATION
// =============================================================================

/**
 * OAuth auth config structure stored in integration.authConfig
 */
interface StoredOAuthConfig {
  clientId?: string;
  clientSecret?: string;
  authorizationUrl?: string;
  tokenUrl: string;
  scopes?: string[];
  usePkce?: boolean;
  introspectionUrl?: string;
  revocationUrl?: string;
  userInfoUrl?: string;
  additionalAuthParams?: Record<string, string>;
  additionalTokenParams?: Record<string, string>;
}

/**
 * Creates an OAuth provider from integration auth config
 *
 * For token refresh, we only need the tokenUrl and client credentials.
 * The provider is created dynamically from the stored configuration.
 */
export function getOAuthProviderForIntegration(integration: {
  id: string;
  authType: string;
  authConfig: unknown;
}): ReturnType<typeof createGenericProvider> | null {
  // Only OAuth2 integrations can be refreshed
  if (integration.authType !== 'oauth2') {
    return null;
  }

  const authConfig = integration.authConfig as StoredOAuthConfig;

  // Validate required fields for refresh
  if (!authConfig.tokenUrl) {
    console.warn(`[TOKEN_REFRESH] Integration ${integration.id} missing tokenUrl in authConfig`);
    return null;
  }

  // Client credentials should be stored in authConfig for token refresh
  // (This is separate from the encrypted credential data which holds user tokens)
  if (!authConfig.clientId || !authConfig.clientSecret) {
    console.warn(
      `[TOKEN_REFRESH] Integration ${integration.id} missing clientId or clientSecret in authConfig`
    );
    return null;
  }

  // Create a generic OAuth provider
  // Note: redirectUri is not needed for refresh, but required by the constructor
  const redirectUri = process.env.NEXT_PUBLIC_APP_URL
    ? `${process.env.NEXT_PUBLIC_APP_URL}/api/v1/auth/callback/oauth`
    : 'http://localhost:3000/api/v1/auth/callback/oauth';

  return createGenericProvider(
    {
      authorizationUrl: authConfig.authorizationUrl ?? authConfig.tokenUrl, // fallback for refresh-only
      tokenUrl: authConfig.tokenUrl,
      scopes: authConfig.scopes,
      usePkce: authConfig.usePkce,
      introspectionUrl: authConfig.introspectionUrl,
      revocationUrl: authConfig.revocationUrl,
      userInfoUrl: authConfig.userInfoUrl,
      additionalAuthParams: authConfig.additionalAuthParams,
      additionalTokenParams: authConfig.additionalTokenParams,
    },
    authConfig.clientId,
    authConfig.clientSecret,
    redirectUri
  );
}

// =============================================================================
// RESULT HANDLING
// =============================================================================

/**
 * Result of handling a token refresh response
 */
interface HandleRefreshResultOutput {
  rotatedRefreshToken: boolean;
}

/**
 * Stores new tokens after a successful refresh
 *
 * Handles refresh token rotation - if the provider returns a new refresh token,
 * it's stored alongside the new access token.
 */
export async function handleRefreshResult(
  credentialId: string,
  tokenResponse: OAuthTokenResponse
): Promise<HandleRefreshResultOutput> {
  const rotatedRefreshToken = !!tokenResponse.refreshToken;

  await updateOAuth2Tokens(credentialId, {
    accessToken: tokenResponse.accessToken,
    refreshToken: tokenResponse.refreshToken, // May be undefined if not rotated
    expiresIn: tokenResponse.expiresIn,
  });

  if (rotatedRefreshToken) {
    console.info(`[TOKEN_REFRESH] Refresh token was rotated for credential ${credentialId}`);
  }

  return { rotatedRefreshToken };
}

// =============================================================================
// MANUAL REFRESH
// =============================================================================

/**
 * Manually refreshes a specific credential
 *
 * Used for debugging or user-initiated refresh.
 * Does not use locking since this is a targeted refresh.
 *
 * @param credentialId - The credential ID to refresh
 * @param tenantId - The tenant ID (for authorization)
 * @returns Result of the refresh operation
 */
export async function refreshCredentialManually(
  credentialId: string,
  tenantId: string
): Promise<RefreshResult> {
  // Get the credential with integration info
  const decrypted = await getDecryptedCredentialById(credentialId, tenantId);
  if (!decrypted) {
    return {
      credentialId,
      integrationId: '',
      tenantId,
      credentialKind: 'integration',
      success: false,
      rotatedRefreshToken: false,
      retryCount: 0,
      error: {
        code: 'CREDENTIAL_NOT_FOUND',
        message: 'Credential not found or does not belong to tenant',
      },
    };
  }

  // Get the full credential with integration
  const credentials = await findExpiringOAuth2Credentials(Infinity);
  const credential = credentials.find((c) => c.id === credentialId);

  if (!credential) {
    return {
      credentialId,
      integrationId: decrypted.integrationId,
      tenantId,
      credentialKind: 'integration',
      success: false,
      rotatedRefreshToken: false,
      retryCount: 0,
      error: {
        code: 'NOT_OAUTH2_CREDENTIAL',
        message: 'Credential is not an OAuth2 credential or has no refresh token',
      },
    };
  }

  // Refresh with lock to prevent concurrent refreshes
  return refreshSingleCredentialWithLock(credential);
}

// =============================================================================
// USER CREDENTIAL REFRESH
// =============================================================================

/**
 * Refreshes a single user credential with lock acquisition.
 * Uses the same advisory lock pattern as IntegrationCredential refresh.
 */
async function refreshSingleUserCredentialWithLock(
  credential: UserCredentialWithRelations
): Promise<RefreshResult> {
  const startTime = Date.now();
  const { connection } = credential;

  // Try to acquire lock (reuse same advisory lock mechanism)
  const lockAcquired = await tryAcquireRefreshLock(credential.id);

  if (!lockAcquired) {
    const event: TokenRefreshEvent = {
      event: 'TOKEN_REFRESH',
      credentialId: credential.id,
      integrationId: connection.integrationId,
      tenantId: connection.tenantId,
      connectionId: connection.id,
      appUserId: credential.appUserId,
      credentialKind: 'user',
      status: 'skipped',
      retryCount: 0,
      rotatedRefreshToken: false,
      durationMs: Date.now() - startTime,
      error: {
        code: 'LOCK_NOT_ACQUIRED',
        message: 'Another process is already refreshing this credential',
      },
    };
    logRefreshEvent(event);

    return {
      credentialId: credential.id,
      integrationId: connection.integrationId,
      tenantId: connection.tenantId,
      connectionId: connection.id,
      appUserId: credential.appUserId,
      credentialKind: 'user',
      success: false,
      rotatedRefreshToken: false,
      retryCount: 0,
      error: event.error,
    };
  }

  try {
    return await refreshSingleUserCredential(credential);
  } finally {
    await releaseRefreshLock(credential.id);
  }
}

/**
 * Refreshes a single user credential with retry logic.
 *
 * Resolves the OAuth provider using this priority:
 * 1. App's own credentials from AppIntegrationConfig (if Connection has appId)
 * 2. Integration-level authConfig (fallback)
 */
async function refreshSingleUserCredential(
  credential: UserCredentialWithRelations
): Promise<RefreshResult> {
  const startTime = Date.now();
  const { connection } = credential;
  let lastError: { code: string; message: string } | undefined;
  let retryCount = 0;
  let rotatedRefreshToken = false;

  // Get the decrypted refresh token
  const decrypted = await getDecryptedUserCredentialById(credential.id);
  if (!decrypted || !decrypted.refreshToken) {
    const event: TokenRefreshEvent = {
      event: 'TOKEN_REFRESH',
      credentialId: credential.id,
      integrationId: connection.integrationId,
      tenantId: connection.tenantId,
      connectionId: connection.id,
      appUserId: credential.appUserId,
      credentialKind: 'user',
      status: 'failed',
      retryCount: 0,
      rotatedRefreshToken: false,
      durationMs: Date.now() - startTime,
      error: {
        code: 'NO_REFRESH_TOKEN',
        message: 'User credential does not have a refresh token',
      },
    };
    logRefreshEvent(event);

    return {
      credentialId: credential.id,
      integrationId: connection.integrationId,
      tenantId: connection.tenantId,
      connectionId: connection.id,
      appUserId: credential.appUserId,
      credentialKind: 'user',
      success: false,
      rotatedRefreshToken: false,
      retryCount: 0,
      error: event.error,
    };
  }

  // Resolve the OAuth provider — prefer app credentials, fall back to integration config
  const provider = await resolveOAuthProviderForUserCredential(credential);
  if (!provider) {
    const event: TokenRefreshEvent = {
      event: 'TOKEN_REFRESH',
      credentialId: credential.id,
      integrationId: connection.integrationId,
      tenantId: connection.tenantId,
      connectionId: connection.id,
      appUserId: credential.appUserId,
      credentialKind: 'user',
      status: 'failed',
      retryCount: 0,
      rotatedRefreshToken: false,
      durationMs: Date.now() - startTime,
      error: {
        code: 'INVALID_AUTH_CONFIG',
        message: 'Could not create OAuth provider for user credential refresh',
      },
    };
    logRefreshEvent(event);

    return {
      credentialId: credential.id,
      integrationId: connection.integrationId,
      tenantId: connection.tenantId,
      connectionId: connection.id,
      appUserId: credential.appUserId,
      credentialKind: 'user',
      success: false,
      rotatedRefreshToken: false,
      retryCount: 0,
      error: event.error,
    };
  }

  // Retry loop
  for (let attempt = 0; attempt < MAX_RETRY_ATTEMPTS; attempt++) {
    retryCount = attempt;

    try {
      const tokenResponse = await provider.refreshToken(decrypted.refreshToken);

      // Store new tokens via user credential service
      const handleResult = await handleUserCredentialRefreshResult(credential.id, tokenResponse);
      rotatedRefreshToken = handleResult.rotatedRefreshToken;

      const event: TokenRefreshEvent = {
        event: 'TOKEN_REFRESH',
        credentialId: credential.id,
        integrationId: connection.integrationId,
        tenantId: connection.tenantId,
        connectionId: connection.id,
        appUserId: credential.appUserId,
        credentialKind: 'user',
        status: 'success',
        retryCount,
        rotatedRefreshToken,
        durationMs: Date.now() - startTime,
      };
      logRefreshEvent(event);

      return {
        credentialId: credential.id,
        integrationId: connection.integrationId,
        tenantId: connection.tenantId,
        connectionId: connection.id,
        appUserId: credential.appUserId,
        credentialKind: 'user',
        success: true,
        rotatedRefreshToken,
        retryCount,
      };
    } catch (error) {
      lastError = extractErrorInfo(error);

      if (!isRetryableError(error)) {
        break;
      }

      if (attempt < MAX_RETRY_ATTEMPTS - 1) {
        const backoffMs = BASE_BACKOFF_MS * Math.pow(2, attempt);
        await sleep(backoffMs);
      }
    }
  }

  // All retries exhausted — mark user credential as needs_reauth
  await flagUserCredentialForReauth(credential.id);

  const event: TokenRefreshEvent = {
    event: 'TOKEN_REFRESH',
    credentialId: credential.id,
    integrationId: connection.integrationId,
    tenantId: connection.tenantId,
    connectionId: connection.id,
    appUserId: credential.appUserId,
    credentialKind: 'user',
    status: 'failed',
    retryCount,
    rotatedRefreshToken: false,
    durationMs: Date.now() - startTime,
    error: lastError,
  };
  logRefreshEvent(event);

  return {
    credentialId: credential.id,
    integrationId: connection.integrationId,
    tenantId: connection.tenantId,
    connectionId: connection.id,
    appUserId: credential.appUserId,
    credentialKind: 'user',
    success: false,
    rotatedRefreshToken: false,
    retryCount,
    error: lastError,
  };
}

/**
 * Resolves the OAuth provider for refreshing a user credential.
 *
 * Priority:
 * 1. App's own credentials from AppIntegrationConfig (using the app's registered client_id/client_secret)
 * 2. Integration-level authConfig (fallback for non-app connections)
 */
async function resolveOAuthProviderForUserCredential(
  credential: UserCredentialWithRelations
): Promise<ReturnType<typeof createGenericProvider> | null> {
  const { connection } = credential;
  const integration = connection.integration;

  // If the connection belongs to an app, try the app's OAuth credentials first
  if (connection.appId) {
    const appConfig = await getDecryptedIntegrationConfig(
      connection.appId,
      connection.integrationId
    );

    if (appConfig) {
      // Build provider using the app's client credentials + integration's OAuth URLs
      const authConfig = integration.authConfig as unknown as StoredOAuthConfig;

      if (authConfig.tokenUrl) {
        const redirectUri = process.env.NEXT_PUBLIC_APP_URL
          ? `${process.env.NEXT_PUBLIC_APP_URL}/api/v1/auth/callback/oauth`
          : 'http://localhost:3000/api/v1/auth/callback/oauth';

        return createGenericProvider(
          {
            authorizationUrl: authConfig.authorizationUrl ?? authConfig.tokenUrl,
            tokenUrl: authConfig.tokenUrl,
            scopes: appConfig.scopes.length > 0 ? appConfig.scopes : authConfig.scopes,
            usePkce: authConfig.usePkce,
            introspectionUrl: authConfig.introspectionUrl,
            revocationUrl: authConfig.revocationUrl,
            userInfoUrl: authConfig.userInfoUrl,
            additionalAuthParams: authConfig.additionalAuthParams,
            additionalTokenParams: authConfig.additionalTokenParams,
          },
          appConfig.clientId,
          appConfig.clientSecret,
          redirectUri
        );
      }
    }
  }

  // Fall back to integration-level authConfig
  return getOAuthProviderForIntegration(integration);
}

/**
 * Stores new tokens after a successful user credential refresh.
 */
async function handleUserCredentialRefreshResult(
  credentialId: string,
  tokenResponse: OAuthTokenResponse
): Promise<HandleRefreshResultOutput> {
  const rotatedRefreshToken = !!tokenResponse.refreshToken;

  await refreshUserCredential(credentialId, {
    accessToken: tokenResponse.accessToken,
    refreshToken: tokenResponse.refreshToken,
    expiresIn: tokenResponse.expiresIn,
  });

  if (rotatedRefreshToken) {
    console.info(`[TOKEN_REFRESH] Refresh token was rotated for user credential ${credentialId}`);
  }

  return { rotatedRefreshToken };
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Extracts error information for logging
 * Never includes sensitive data in error messages
 */
function extractErrorInfo(error: unknown): { code: string; message: string } {
  if (error instanceof OAuthError) {
    return {
      code: error.code,
      message: error.message,
    };
  }

  if (error instanceof Error) {
    return {
      code: 'UNKNOWN_ERROR',
      message: error.message,
    };
  }

  return {
    code: 'UNKNOWN_ERROR',
    message: 'An unknown error occurred',
  };
}

/**
 * Determines if an error is retryable
 *
 * Network errors and server errors are retryable.
 * Auth errors (invalid_grant, etc.) are not retryable.
 */
function isRetryableError(error: unknown): boolean {
  if (error instanceof OAuthError) {
    // These error codes indicate the refresh token is invalid/revoked
    const nonRetryableCodes = [
      'invalid_grant',
      'invalid_token',
      'unauthorized_client',
      'access_denied',
    ];

    // Check if the error message contains non-retryable indicators
    const messageLower = error.message.toLowerCase();
    for (const code of nonRetryableCodes) {
      if (messageLower.includes(code)) {
        return false;
      }
    }
  }

  // Assume other errors are transient and retryable
  return true;
}

/**
 * Sleeps for the specified number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
