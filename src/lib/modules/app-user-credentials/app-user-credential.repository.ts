/**
 * AppUserCredential Repository
 *
 * Data access layer for AppUserCredential model.
 * Handles CRUD operations for encrypted end-user credential storage.
 *
 * Note: This repository stores/retrieves encrypted data as-is.
 * Encryption/decryption is handled by the service layer.
 */

import { prisma } from '@/lib/db/client';
import { CredentialStatus, CredentialType } from '@prisma/client';

import type { AppUserCredential, Prisma } from '@prisma/client';

/**
 * AppUserCredential with connection and integration info for token refresh.
 * The relation chain is: AppUserCredential → Connection → Integration
 * plus Connection → App (for AppIntegrationConfig lookup).
 */
export interface UserCredentialWithRelations extends AppUserCredential {
  connection: {
    id: string;
    tenantId: string;
    integrationId: string;
    appId: string | null;
    integration: {
      id: string;
      name: string;
      slug: string;
      authType: string;
      authConfig: Prisma.JsonValue;
    };
  };
}

// =============================================================================
// Types
// =============================================================================

export interface CreateAppUserCredentialInput {
  connectionId: string;
  appUserId: string;
  credentialType: CredentialType;
  encryptedData: Buffer | Uint8Array;
  encryptedRefreshToken?: Buffer | Uint8Array;
  expiresAt?: Date;
  scopes?: string[];
}

export interface UpdateAppUserCredentialInput {
  encryptedData?: Buffer | Uint8Array;
  encryptedRefreshToken?: Buffer | Uint8Array | null;
  expiresAt?: Date;
  scopes?: string[];
  status?: CredentialStatus;
}

export interface AppUserCredentialPaginationOptions {
  cursor?: string;
  limit?: number;
}

export interface AppUserCredentialFilters {
  status?: CredentialStatus;
}

export interface PaginatedAppUserCredentials {
  credentials: AppUserCredential[];
  nextCursor: string | null;
  totalCount: number;
}

// =============================================================================
// AppUserCredential — Create
// =============================================================================

/**
 * Creates a new end-user credential under a connection.
 * Uses upsert to handle the unique(connectionId, appUserId) constraint —
 * if a credential already exists for this user+connection, it is updated.
 */
export async function createAppUserCredential(
  input: CreateAppUserCredentialInput
): Promise<AppUserCredential> {
  return prisma.appUserCredential.upsert({
    where: {
      connectionId_appUserId: {
        connectionId: input.connectionId,
        appUserId: input.appUserId,
      },
    },
    create: {
      connectionId: input.connectionId,
      appUserId: input.appUserId,
      credentialType: input.credentialType,
      encryptedData: new Uint8Array(input.encryptedData),
      encryptedRefreshToken: input.encryptedRefreshToken
        ? new Uint8Array(input.encryptedRefreshToken)
        : null,
      expiresAt: input.expiresAt,
      scopes: input.scopes ?? [],
      status: CredentialStatus.active,
    },
    update: {
      credentialType: input.credentialType,
      encryptedData: new Uint8Array(input.encryptedData),
      encryptedRefreshToken: input.encryptedRefreshToken
        ? new Uint8Array(input.encryptedRefreshToken)
        : null,
      expiresAt: input.expiresAt,
      scopes: input.scopes ?? [],
      status: CredentialStatus.active,
    },
  });
}

// =============================================================================
// AppUserCredential — Read
// =============================================================================

/**
 * Finds a credential by connectionId + appUserId (unique constraint).
 */
export async function findByConnectionAndUser(
  connectionId: string,
  appUserId: string
): Promise<AppUserCredential | null> {
  return prisma.appUserCredential.findUnique({
    where: {
      connectionId_appUserId: {
        connectionId,
        appUserId,
      },
    },
  });
}

/**
 * Finds a credential by ID.
 */
export async function findAppUserCredentialById(id: string): Promise<AppUserCredential | null> {
  return prisma.appUserCredential.findUnique({ where: { id } });
}

/**
 * Finds all credentials for a connection with pagination and optional status filter.
 */
export async function findByConnectionId(
  connectionId: string,
  pagination: AppUserCredentialPaginationOptions = {},
  filters: AppUserCredentialFilters = {}
): Promise<PaginatedAppUserCredentials> {
  const { cursor, limit = 20 } = pagination;

  const where: Prisma.AppUserCredentialWhereInput = { connectionId };

  if (filters.status) {
    where.status = filters.status;
  }

  const totalCount = await prisma.appUserCredential.count({ where });

  const credentials = await prisma.appUserCredential.findMany({
    where,
    take: limit + 1,
    orderBy: { createdAt: 'desc' },
    ...(cursor && {
      cursor: { id: cursor },
      skip: 1,
    }),
  });

  const hasMore = credentials.length > limit;
  if (hasMore) {
    credentials.pop();
  }

  const nextCursor =
    hasMore && credentials.length > 0 ? credentials[credentials.length - 1].id : null;

  return { credentials, nextCursor, totalCount };
}

/**
 * Finds all credentials for an app user across all connections.
 */
export async function findByAppUserId(appUserId: string): Promise<AppUserCredential[]> {
  return prisma.appUserCredential.findMany({
    where: { appUserId },
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Credential with connection and integration info for user-facing connection listing.
 */
export interface UserCredentialWithConnectionInfo extends AppUserCredential {
  connection: {
    id: string;
    name: string;
    integrationId: string;
    integration: {
      id: string;
      name: string;
      slug: string;
    };
  };
}

/**
 * Finds all credentials for an app user with connection and integration details.
 * Used for listing a user's active connections via the connect API.
 */
export async function findByAppUserIdWithConnections(
  appUserId: string
): Promise<UserCredentialWithConnectionInfo[]> {
  return prisma.appUserCredential.findMany({
    where: { appUserId },
    include: {
      connection: {
        select: {
          id: true,
          name: true,
          integrationId: true,
          integration: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });
}

// =============================================================================
// AppUserCredential — Update
// =============================================================================

/**
 * Updates a credential's encrypted data, expiration, scopes, or status.
 */
export async function updateAppUserCredential(
  id: string,
  input: UpdateAppUserCredentialInput
): Promise<AppUserCredential> {
  const data: Prisma.AppUserCredentialUpdateInput = {};

  if (input.encryptedData !== undefined) {
    data.encryptedData = new Uint8Array(input.encryptedData);
  }
  if (input.encryptedRefreshToken !== undefined) {
    data.encryptedRefreshToken = input.encryptedRefreshToken
      ? new Uint8Array(input.encryptedRefreshToken)
      : null;
  }
  if (input.expiresAt !== undefined) {
    data.expiresAt = input.expiresAt;
  }
  if (input.scopes !== undefined) {
    data.scopes = input.scopes;
  }
  if (input.status !== undefined) {
    data.status = input.status;
  }

  return prisma.appUserCredential.update({ where: { id }, data });
}

// =============================================================================
// AppUserCredential — Revoke
// =============================================================================

/**
 * Marks a credential as revoked (soft delete for audit trail).
 */
export async function revokeAppUserCredential(id: string): Promise<AppUserCredential> {
  return prisma.appUserCredential.update({
    where: { id },
    data: { status: CredentialStatus.revoked },
  });
}

/**
 * Marks a credential as needing re-authentication.
 */
export async function markNeedsReauth(id: string): Promise<AppUserCredential> {
  return prisma.appUserCredential.update({
    where: { id },
    data: { status: CredentialStatus.needs_reauth },
  });
}

// =============================================================================
// AppUserCredential — Expiration Queries
// =============================================================================

/**
 * Finds active credentials expiring within the given buffer.
 * Used by the token refresh background job.
 */
export async function findExpiringCredentials(
  bufferMinutes: number = 10
): Promise<AppUserCredential[]> {
  const expiringBefore = new Date(Date.now() + bufferMinutes * 60 * 1000);

  return prisma.appUserCredential.findMany({
    where: {
      status: CredentialStatus.active,
      credentialType: CredentialType.oauth2_tokens,
      expiresAt: {
        lte: expiringBefore,
        not: null,
      },
      encryptedRefreshToken: {
        not: null,
      },
    },
    orderBy: { expiresAt: 'asc' },
  });
}

// =============================================================================
// AppUserCredential — Stats
// =============================================================================

/**
 * Counts credentials by status for a given connection.
 */
export async function countByStatusForConnection(
  connectionId: string
): Promise<Record<CredentialStatus, number>> {
  const counts = await prisma.appUserCredential.groupBy({
    by: ['status'],
    where: { connectionId },
    _count: true,
  });

  const result: Record<CredentialStatus, number> = {
    [CredentialStatus.active]: 0,
    [CredentialStatus.expired]: 0,
    [CredentialStatus.revoked]: 0,
    [CredentialStatus.needs_reauth]: 0,
  };

  for (const count of counts) {
    result[count.status] = count._count;
  }

  return result;
}

/**
 * Counts credentials by status for all connections belonging to an app.
 * Returns per-connection breakdown with integration info.
 */
export async function countByStatusForApp(appId: string): Promise<AppCredentialStatsResult> {
  // Get all connections for this app that have user credentials
  const connections = await prisma.connection.findMany({
    where: { appId },
    select: {
      id: true,
      name: true,
      integrationId: true,
      integration: {
        select: {
          id: true,
          name: true,
          slug: true,
        },
      },
      _count: {
        select: { userCredentials: true },
      },
      userCredentials: {
        select: { status: true },
      },
    },
  });

  const totals: Record<CredentialStatus, number> = {
    [CredentialStatus.active]: 0,
    [CredentialStatus.expired]: 0,
    [CredentialStatus.revoked]: 0,
    [CredentialStatus.needs_reauth]: 0,
  };

  const byConnection: AppCredentialStatsConnection[] = [];

  for (const conn of connections) {
    const connStatusCounts: Record<CredentialStatus, number> = {
      [CredentialStatus.active]: 0,
      [CredentialStatus.expired]: 0,
      [CredentialStatus.revoked]: 0,
      [CredentialStatus.needs_reauth]: 0,
    };

    for (const cred of conn.userCredentials) {
      connStatusCounts[cred.status]++;
      totals[cred.status]++;
    }

    byConnection.push({
      connectionId: conn.id,
      connectionName: conn.name,
      integrationId: conn.integration.id,
      integrationName: conn.integration.name,
      integrationSlug: conn.integration.slug,
      total: conn._count.userCredentials,
      byStatus: connStatusCounts,
    });
  }

  const total = Object.values(totals).reduce((a, b) => a + b, 0);

  return { total, byStatus: totals, byConnection };
}

export interface AppCredentialStatsConnection {
  connectionId: string;
  connectionName: string;
  integrationId: string;
  integrationName: string;
  integrationSlug: string;
  total: number;
  byStatus: Record<CredentialStatus, number>;
}

export interface AppCredentialStatsResult {
  total: number;
  byStatus: Record<CredentialStatus, number>;
  byConnection: AppCredentialStatsConnection[];
}

// =============================================================================
// AppUserCredential — Token Refresh Queries
// =============================================================================

/**
 * Finds expiring OAuth2 user credentials with connection and integration info.
 * Used by the token refresh service to know which OAuth provider to use.
 *
 * Includes the full relation chain: AppUserCredential → Connection → Integration
 * plus Connection.appId for AppIntegrationConfig lookup.
 */
export async function findExpiringCredentialsWithRelations(
  bufferMinutes: number = 10
): Promise<UserCredentialWithRelations[]> {
  const expiringBefore = new Date(Date.now() + bufferMinutes * 60 * 1000);

  return prisma.appUserCredential.findMany({
    where: {
      status: CredentialStatus.active,
      credentialType: CredentialType.oauth2_tokens,
      expiresAt: {
        lte: expiringBefore,
        not: null,
      },
      encryptedRefreshToken: {
        not: null,
      },
    },
    include: {
      connection: {
        select: {
          id: true,
          tenantId: true,
          integrationId: true,
          appId: true,
          integration: {
            select: {
              id: true,
              name: true,
              slug: true,
              authType: true,
              authConfig: true,
            },
          },
        },
      },
    },
    orderBy: { expiresAt: 'asc' },
  });
}
