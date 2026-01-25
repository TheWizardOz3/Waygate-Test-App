/**
 * Credential Repository
 *
 * Data access layer for IntegrationCredential model.
 * Handles CRUD operations for encrypted credential storage.
 *
 * Note: This repository stores/retrieves encrypted data as-is.
 * Encryption/decryption is handled by the credential service layer.
 */

import { prisma } from '@/lib/db/client';
import { CredentialStatus, CredentialType, IntegrationStatus } from '@prisma/client';

import type { IntegrationCredential, Prisma } from '@prisma/client';

/**
 * Input for creating a new credential
 */
export interface CreateCredentialInput {
  integrationId: string;
  tenantId: string;
  connectionId?: string; // Optional for multi-app connections
  credentialType: CredentialType;
  encryptedData: Buffer | Uint8Array;
  encryptedRefreshToken?: Buffer | Uint8Array;
  expiresAt?: Date;
  scopes?: string[];
}

/**
 * Input for updating an existing credential
 */
export interface UpdateCredentialInput {
  encryptedData?: Buffer | Uint8Array;
  encryptedRefreshToken?: Buffer | Uint8Array;
  expiresAt?: Date;
  scopes?: string[];
  status?: CredentialStatus;
}

/**
 * Filters for querying credentials
 */
export interface CredentialFilters {
  integrationId?: string;
  tenantId?: string;
  credentialType?: CredentialType;
  status?: CredentialStatus;
  expiringBefore?: Date;
}

/**
 * Creates a new integration credential
 *
 * Note: When credentials are successfully stored, the integration status
 * is automatically promoted to 'active' if it was in 'draft' status.
 */
export async function createCredential(
  input: CreateCredentialInput
): Promise<IntegrationCredential> {
  // Use a transaction to atomically create credential and update integration status
  return prisma.$transaction(async (tx) => {
    const credential = await tx.integrationCredential.create({
      data: {
        integrationId: input.integrationId,
        tenantId: input.tenantId,
        connectionId: input.connectionId ?? null,
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

    // Promote integration to 'active' if it was in 'draft' status
    await tx.integration.updateMany({
      where: {
        id: input.integrationId,
        status: IntegrationStatus.draft,
      },
      data: {
        status: IntegrationStatus.active,
      },
    });

    return credential;
  });
}

/**
 * Finds a credential by ID
 */
export async function findCredentialById(id: string): Promise<IntegrationCredential | null> {
  return prisma.integrationCredential.findUnique({
    where: { id },
  });
}

/**
 * Finds a credential by ID with tenant verification
 * Returns null if credential doesn't belong to tenant (security check)
 */
export async function findCredentialByIdAndTenant(
  id: string,
  tenantId: string
): Promise<IntegrationCredential | null> {
  return prisma.integrationCredential.findFirst({
    where: {
      id,
      tenantId,
    },
  });
}

/**
 * Finds the active credential for an integration
 * Returns the most recently created active credential
 */
export async function findActiveCredentialForIntegration(
  integrationId: string,
  tenantId: string,
  connectionId?: string
): Promise<IntegrationCredential | null> {
  return prisma.integrationCredential.findFirst({
    where: {
      integrationId,
      tenantId,
      status: CredentialStatus.active,
      // If connectionId is provided, filter by it; otherwise get any active credential
      ...(connectionId !== undefined && { connectionId }),
    },
    orderBy: {
      createdAt: 'desc',
    },
  });
}

/**
 * Finds all credentials for an integration
 */
export async function findCredentialsByIntegration(
  integrationId: string,
  tenantId: string,
  connectionId?: string
): Promise<IntegrationCredential[]> {
  return prisma.integrationCredential.findMany({
    where: {
      integrationId,
      tenantId,
      // If connectionId is provided, filter by it
      ...(connectionId !== undefined && { connectionId }),
    },
    orderBy: {
      createdAt: 'desc',
    },
  });
}

/**
 * Finds all credentials for a tenant
 */
export async function findCredentialsByTenant(
  tenantId: string,
  filters?: Pick<CredentialFilters, 'status' | 'credentialType'>
): Promise<IntegrationCredential[]> {
  const where: Prisma.IntegrationCredentialWhereInput = {
    tenantId,
  };

  if (filters?.status) {
    where.status = filters.status;
  }

  if (filters?.credentialType) {
    where.credentialType = filters.credentialType;
  }

  return prisma.integrationCredential.findMany({
    where,
    orderBy: {
      createdAt: 'desc',
    },
  });
}

/**
 * Finds credentials that are expiring soon
 * Used by the token refresh background job
 */
export async function findExpiringCredentials(
  expiringBefore: Date
): Promise<IntegrationCredential[]> {
  return prisma.integrationCredential.findMany({
    where: {
      status: CredentialStatus.active,
      expiresAt: {
        lte: expiringBefore,
        not: null,
      },
    },
    orderBy: {
      expiresAt: 'asc',
    },
  });
}

/**
 * Credential with integration relationship for token refresh
 */
export interface CredentialWithIntegration extends IntegrationCredential {
  integration: {
    id: string;
    name: string;
    slug: string;
    authType: string;
    authConfig: Prisma.JsonValue;
  };
}

/**
 * Finds OAuth2 credentials that are expiring soon, with integration info
 * Used by the token refresh background job to know which provider to use
 *
 * @param bufferMinutes - Minutes before expiration to consider "expiring"
 * @returns Credentials expiring within the buffer, with their integration data
 */
export async function findExpiringOAuth2Credentials(
  bufferMinutes: number = 10
): Promise<CredentialWithIntegration[]> {
  const expiringBefore = new Date(Date.now() + bufferMinutes * 60 * 1000);

  return prisma.integrationCredential.findMany({
    where: {
      status: CredentialStatus.active,
      credentialType: CredentialType.oauth2_tokens,
      expiresAt: {
        lte: expiringBefore,
        not: null,
      },
      // Only include credentials that have a refresh token
      encryptedRefreshToken: {
        not: null,
      },
    },
    include: {
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
    orderBy: {
      expiresAt: 'asc',
    },
  });
}

// =============================================================================
// ADVISORY LOCKING FOR TOKEN REFRESH
// =============================================================================

/**
 * Converts a UUID string to a numeric hash for PostgreSQL advisory locks
 * Advisory locks require bigint keys, so we hash the UUID
 */
function uuidToLockKey(uuid: string): bigint {
  // Simple hash: sum character codes with position weighting
  let hash = BigInt(0);
  for (let i = 0; i < uuid.length; i++) {
    hash = (hash * BigInt(31) + BigInt(uuid.charCodeAt(i))) % BigInt(Number.MAX_SAFE_INTEGER);
  }
  return hash;
}

/**
 * Attempts to acquire an advisory lock for token refresh
 * Uses pg_try_advisory_lock to avoid blocking - returns immediately
 *
 * @param credentialId - The credential ID to lock
 * @returns true if lock acquired, false if already locked by another process
 */
export async function tryAcquireRefreshLock(credentialId: string): Promise<boolean> {
  const lockKey = uuidToLockKey(credentialId);

  const result = await prisma.$queryRaw<[{ pg_try_advisory_lock: boolean }]>`
    SELECT pg_try_advisory_lock(${lockKey})
  `;

  return result[0].pg_try_advisory_lock;
}

/**
 * Releases an advisory lock for token refresh
 *
 * @param credentialId - The credential ID to unlock
 * @returns true if lock was released, false if lock wasn't held
 */
export async function releaseRefreshLock(credentialId: string): Promise<boolean> {
  const lockKey = uuidToLockKey(credentialId);

  const result = await prisma.$queryRaw<[{ pg_advisory_unlock: boolean }]>`
    SELECT pg_advisory_unlock(${lockKey})
  `;

  return result[0].pg_advisory_unlock;
}

// =============================================================================
// OPTIMISTIC LOCKING FOR TOKEN REFRESH
// =============================================================================

/**
 * Result of an optimistic lock update attempt
 */
export interface OptimisticUpdateResult {
  success: boolean;
  credential: IntegrationCredential | null;
  reason?: 'not_found' | 'concurrent_modification';
}

/**
 * Updates a credential with optimistic locking
 * Only updates if the credential's updatedAt matches the expected value
 * This prevents race conditions when multiple processes try to refresh the same token
 *
 * @param credentialId - The credential ID to update
 * @param expectedUpdatedAt - The expected updatedAt timestamp (from when we read the credential)
 * @param input - The update data
 * @returns Result indicating success or failure reason
 */
export async function updateCredentialWithOptimisticLock(
  credentialId: string,
  expectedUpdatedAt: Date,
  input: UpdateCredentialInput
): Promise<OptimisticUpdateResult> {
  // Use updateMany with a condition on updatedAt - returns count of updated rows
  const updateData: Prisma.IntegrationCredentialUpdateManyMutationInput = {};

  if (input.encryptedData !== undefined) {
    updateData.encryptedData = new Uint8Array(input.encryptedData);
  }
  if (input.encryptedRefreshToken !== undefined) {
    updateData.encryptedRefreshToken = input.encryptedRefreshToken
      ? new Uint8Array(input.encryptedRefreshToken)
      : null;
  }
  if (input.expiresAt !== undefined) {
    updateData.expiresAt = input.expiresAt;
  }
  if (input.scopes !== undefined) {
    updateData.scopes = input.scopes;
  }
  if (input.status !== undefined) {
    updateData.status = input.status;
  }

  const result = await prisma.integrationCredential.updateMany({
    where: {
      id: credentialId,
      updatedAt: expectedUpdatedAt,
    },
    data: updateData,
  });

  if (result.count === 0) {
    // Check if credential exists to determine failure reason
    const existing = await findCredentialById(credentialId);
    if (!existing) {
      return { success: false, credential: null, reason: 'not_found' };
    }
    return { success: false, credential: existing, reason: 'concurrent_modification' };
  }

  // Fetch and return the updated credential
  const updated = await findCredentialById(credentialId);
  return { success: true, credential: updated };
}

/**
 * Updates a credential
 */
export async function updateCredential(
  id: string,
  input: UpdateCredentialInput
): Promise<IntegrationCredential> {
  return prisma.integrationCredential.update({
    where: { id },
    data: {
      ...(input.encryptedData !== undefined && {
        encryptedData: new Uint8Array(input.encryptedData),
      }),
      ...(input.encryptedRefreshToken !== undefined && {
        encryptedRefreshToken: input.encryptedRefreshToken
          ? new Uint8Array(input.encryptedRefreshToken)
          : null,
      }),
      ...(input.expiresAt !== undefined && { expiresAt: input.expiresAt }),
      ...(input.scopes !== undefined && { scopes: input.scopes }),
      ...(input.status !== undefined && { status: input.status }),
    },
  });
}

/**
 * Updates a credential with tenant verification
 * Returns null if credential doesn't belong to tenant
 */
export async function updateCredentialForTenant(
  id: string,
  tenantId: string,
  input: UpdateCredentialInput
): Promise<IntegrationCredential | null> {
  // First verify ownership
  const existing = await findCredentialByIdAndTenant(id, tenantId);
  if (!existing) {
    return null;
  }

  return updateCredential(id, input);
}

/**
 * Marks a credential as revoked
 */
export async function revokeCredential(id: string): Promise<IntegrationCredential> {
  return prisma.integrationCredential.update({
    where: { id },
    data: {
      status: CredentialStatus.revoked,
    },
  });
}

/**
 * Marks a credential as needing re-authentication
 */
export async function markCredentialNeedsReauth(id: string): Promise<IntegrationCredential> {
  return prisma.integrationCredential.update({
    where: { id },
    data: {
      status: CredentialStatus.needs_reauth,
    },
  });
}

/**
 * Marks a credential as expired
 */
export async function markCredentialExpired(id: string): Promise<IntegrationCredential> {
  return prisma.integrationCredential.update({
    where: { id },
    data: {
      status: CredentialStatus.expired,
    },
  });
}

/**
 * Deletes a credential (hard delete)
 * Use sparingly - prefer revokeCredential for audit trail
 */
export async function deleteCredential(id: string): Promise<void> {
  await prisma.integrationCredential.delete({
    where: { id },
  });
}

/**
 * Deletes all credentials for an integration
 * Used when deleting an integration
 */
export async function deleteCredentialsByIntegration(integrationId: string): Promise<number> {
  const result = await prisma.integrationCredential.deleteMany({
    where: { integrationId },
  });
  return result.count;
}

/**
 * Counts credentials by status for a tenant
 * Useful for dashboard statistics
 */
export async function countCredentialsByStatus(
  tenantId: string
): Promise<Record<CredentialStatus, number>> {
  const counts = await prisma.integrationCredential.groupBy({
    by: ['status'],
    where: { tenantId },
    _count: true,
  });

  // Initialize all statuses to 0
  const result: Record<CredentialStatus, number> = {
    [CredentialStatus.active]: 0,
    [CredentialStatus.expired]: 0,
    [CredentialStatus.revoked]: 0,
    [CredentialStatus.needs_reauth]: 0,
  };

  // Fill in actual counts
  for (const count of counts) {
    result[count.status] = count._count;
  }

  return result;
}
