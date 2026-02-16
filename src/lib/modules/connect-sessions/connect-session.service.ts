/**
 * ConnectSession Service
 *
 * Business logic for the end-user OAuth connect flow.
 * Creates short-lived sessions that power the hosted connect page,
 * validates sessions, and manages status transitions.
 */

import { prisma } from '@/lib/db/client';
import { ConnectionStatus } from '@prisma/client';
import { generateConnectSessionToken } from '@/lib/modules/auth/api-key';
import { findIntegrationBySlug } from '@/lib/modules/integrations/integration.repository';
import { findOrCreateAppUser } from '@/lib/modules/app-users/app-user.repository';
import {
  createConnectSession as repoCreateSession,
  findConnectSessionByToken,
  findConnectSessionByIdAndApp,
  markSessionCompleted as repoMarkCompleted,
  markSessionFailed as repoMarkFailed,
  cleanupExpiredSessions as repoCleanupExpired,
  type ConnectSessionWithRelations,
} from './connect-session.repository';
import {
  CreateConnectSessionInputSchema,
  toConnectSessionResponse,
  type CreateConnectSessionInput,
  type CreateConnectSessionResponse,
  type ConnectSessionResponse,
} from './connect-session.schemas';
import {
  ConnectSessionError,
  ConnectSessionNotFoundError,
  ConnectSessionExpiredError,
  ConnectSessionAlreadyCompletedError,
} from './connect-session.errors';

const SESSION_EXPIRY_MINUTES = 30;

// =============================================================================
// Create
// =============================================================================

/**
 * Creates a connect session for an end-user to authenticate with an integration.
 *
 * Steps:
 * 1. Resolve integration by slug
 * 2. Find-or-create AppUser from externalUserId
 * 3. Find (or create) the App's Connection for this integration
 * 4. Generate wg_cs_ token
 * 5. Create ConnectSession record (expires in 30 min)
 * 6. Build connectUrl
 * 7. Return { sessionId, connectUrl, token, expiresAt }
 */
export async function createConnectSession(
  appId: string,
  tenantId: string,
  input: CreateConnectSessionInput
): Promise<CreateConnectSessionResponse> {
  const parsed = CreateConnectSessionInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new ConnectSessionError('INVALID_INPUT', `Invalid session data: ${parsed.error.message}`);
  }

  const data = parsed.data;

  // 1. Resolve integration by slug
  const integration = await findIntegrationBySlug(tenantId, data.integrationSlug);
  if (!integration) {
    throw new ConnectSessionError(
      'INTEGRATION_NOT_FOUND',
      `Integration '${data.integrationSlug}' not found`,
      404
    );
  }

  // 2. Find-or-create AppUser
  const appUser = await findOrCreateAppUser({
    appId,
    externalId: data.externalUserId,
    displayName: data.user?.displayName,
    email: data.user?.email,
  });

  // 3. Find (or create) the App's Connection for this integration
  const connection = await findOrCreateAppConnection(tenantId, appId, integration.id);

  // 4. Generate token
  const token = generateConnectSessionToken();

  // 5. Create session (expires in 30 min)
  const expiresAt = new Date(Date.now() + SESSION_EXPIRY_MINUTES * 60 * 1000);

  const session = await repoCreateSession({
    appId,
    appUserId: appUser.id,
    integrationId: integration.id,
    connectionId: connection.id,
    token,
    redirectUrl: data.redirectUrl,
    expiresAt,
  });

  // 6. Build connectUrl
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const connectUrl = `${appUrl}/connect/${token}`;

  // 7. Return response
  return {
    sessionId: session.id,
    connectUrl,
    token,
    expiresAt: expiresAt.toISOString(),
  };
}

// =============================================================================
// Validate
// =============================================================================

/**
 * Validates a connect session token.
 * Checks that the session exists, is still pending, and hasn't expired.
 * Returns the session with all relations loaded for the hosted connect page.
 */
export async function validateSession(token: string): Promise<ConnectSessionWithRelations> {
  const session = await findConnectSessionByToken(token);
  if (!session) {
    throw new ConnectSessionNotFoundError(token);
  }

  if (session.status === 'completed') {
    throw new ConnectSessionAlreadyCompletedError(session.id);
  }

  if (session.status === 'failed') {
    throw new ConnectSessionError(
      'CONNECT_SESSION_FAILED',
      `Connect session has failed: ${session.errorMessage ?? 'unknown error'}`,
      410
    );
  }

  if (session.status === 'expired' || session.expiresAt < new Date()) {
    throw new ConnectSessionExpiredError(session.id);
  }

  return session;
}

// =============================================================================
// Get Session Status
// =============================================================================

/**
 * Gets a connect session by ID with app verification.
 * Used by consuming apps to check session status after redirect.
 */
export async function getSession(
  sessionId: string,
  appId: string
): Promise<ConnectSessionResponse> {
  const session = await findConnectSessionByIdAndApp(sessionId, appId);
  if (!session) {
    throw new ConnectSessionNotFoundError(sessionId);
  }
  return toConnectSessionResponse(session);
}

// =============================================================================
// Status Transitions
// =============================================================================

/**
 * Marks a connect session as completed.
 * Called after a successful OAuth flow stores the user's credential.
 */
export async function completeSession(
  token: string,
  connectionId: string
): Promise<ConnectSessionResponse> {
  const session = await findConnectSessionByToken(token);
  if (!session) {
    throw new ConnectSessionNotFoundError(token);
  }

  if (session.status !== 'pending') {
    throw new ConnectSessionError(
      'CONNECT_SESSION_INVALID_STATE',
      `Cannot complete session in '${session.status}' state`,
      409
    );
  }

  const updated = await repoMarkCompleted(session.id, connectionId);
  return toConnectSessionResponse(updated);
}

/**
 * Marks a connect session as failed.
 * Called when the OAuth flow encounters an error.
 */
export async function failSession(
  token: string,
  errorMessage: string
): Promise<ConnectSessionResponse> {
  const session = await findConnectSessionByToken(token);
  if (!session) {
    throw new ConnectSessionNotFoundError(token);
  }

  if (session.status !== 'pending') {
    throw new ConnectSessionError(
      'CONNECT_SESSION_INVALID_STATE',
      `Cannot fail session in '${session.status}' state`,
      409
    );
  }

  const updated = await repoMarkFailed(session.id, errorMessage);
  return toConnectSessionResponse(updated);
}

// =============================================================================
// Cleanup
// =============================================================================

/**
 * Marks all pending sessions past their expiration as expired.
 * Should be called periodically (e.g., via cron or background job).
 */
export async function cleanupExpiredSessions(): Promise<number> {
  return repoCleanupExpired();
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Finds the App's Connection for an integration, or creates one if none exists.
 * App-scoped connections are linked via the appId field on Connection.
 */
async function findOrCreateAppConnection(tenantId: string, appId: string, integrationId: string) {
  // Look for an existing connection scoped to this app + integration
  const existing = await prisma.connection.findFirst({
    where: {
      tenantId,
      integrationId,
      appId,
      status: ConnectionStatus.active,
    },
  });

  if (existing) {
    return existing;
  }

  // Look up integration name for the connection name
  const integration = await prisma.integration.findUnique({
    where: { id: integrationId },
    select: { name: true, slug: true, authType: true },
  });

  const integrationName = integration?.name ?? 'Integration';
  const integrationSlug = integration?.slug ?? 'integration';

  // Look up the app name for the connection name
  const app = await prisma.app.findUnique({
    where: { id: appId },
    select: { name: true, slug: true },
  });

  const appName = app?.name ?? 'App';
  const appSlug = app?.slug ?? 'app';

  return prisma.connection.create({
    data: {
      tenantId,
      integrationId,
      appId,
      name: `${appName} ${integrationName}`,
      slug: `${appSlug}-${integrationSlug}`,
      isPrimary: false,
      status: ConnectionStatus.active,
      metadata: {},
    },
  });
}
