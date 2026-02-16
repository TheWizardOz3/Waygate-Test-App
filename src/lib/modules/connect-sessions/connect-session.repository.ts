/**
 * ConnectSession Repository
 *
 * Data access layer for ConnectSession model.
 * Handles create, lookup, status transitions, and cleanup.
 */

import { prisma } from '@/lib/db/client';
import { ConnectSessionStatus, Prisma } from '@prisma/client';

import type { ConnectSession } from '@prisma/client';

// =============================================================================
// Types
// =============================================================================

export interface CreateConnectSessionDbInput {
  appId: string;
  appUserId: string;
  integrationId: string;
  connectionId?: string;
  token: string;
  redirectUrl?: string;
  expiresAt: Date;
  metadata?: Prisma.InputJsonValue;
}

/** Include config for loading session relations */
const sessionWithRelationsInclude = {
  app: { select: { id: true, tenantId: true, name: true, slug: true, metadata: true } },
  appUser: { select: { id: true, externalId: true, displayName: true } },
  integration: { select: { id: true, name: true, slug: true, logoUrl: true, authType: true } },
  connection: { select: { id: true, name: true, slug: true } },
} as const;

/** ConnectSession with loaded relations for validation responses */
export type ConnectSessionWithRelations = Prisma.ConnectSessionGetPayload<{
  include: typeof sessionWithRelationsInclude;
}>;

// =============================================================================
// Create
// =============================================================================

export async function createConnectSession(
  input: CreateConnectSessionDbInput
): Promise<ConnectSession> {
  return prisma.connectSession.create({
    data: {
      appId: input.appId,
      appUserId: input.appUserId,
      integrationId: input.integrationId,
      connectionId: input.connectionId ?? null,
      token: input.token,
      redirectUrl: input.redirectUrl ?? null,
      status: ConnectSessionStatus.pending,
      expiresAt: input.expiresAt,
      metadata: input.metadata ?? {},
    },
  });
}

// =============================================================================
// Read
// =============================================================================

export async function findConnectSessionByToken(
  token: string
): Promise<ConnectSessionWithRelations | null> {
  return prisma.connectSession.findUnique({
    where: { token },
    include: sessionWithRelationsInclude,
  });
}

export async function findConnectSessionById(id: string): Promise<ConnectSession | null> {
  return prisma.connectSession.findUnique({ where: { id } });
}

export async function findConnectSessionByIdAndApp(
  id: string,
  appId: string
): Promise<ConnectSessionWithRelations | null> {
  return prisma.connectSession.findFirst({
    where: { id, appId },
    include: sessionWithRelationsInclude,
  });
}

// =============================================================================
// Status Transitions
// =============================================================================

export async function markSessionCompleted(
  id: string,
  connectionId: string
): Promise<ConnectSession> {
  return prisma.connectSession.update({
    where: { id },
    data: {
      status: ConnectSessionStatus.completed,
      connectionId,
      completedAt: new Date(),
    },
  });
}

export async function markSessionFailed(id: string, errorMessage: string): Promise<ConnectSession> {
  return prisma.connectSession.update({
    where: { id },
    data: {
      status: ConnectSessionStatus.failed,
      errorMessage,
    },
  });
}

// =============================================================================
// Cleanup
// =============================================================================

/**
 * Marks all pending sessions past their expiration as expired.
 * Returns the count of sessions that were updated.
 */
export async function cleanupExpiredSessions(): Promise<number> {
  const result = await prisma.connectSession.updateMany({
    where: {
      status: ConnectSessionStatus.pending,
      expiresAt: { lt: new Date() },
    },
    data: {
      status: ConnectSessionStatus.expired,
    },
  });
  return result.count;
}
