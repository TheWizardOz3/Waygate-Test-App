/**
 * AppUserCredential Service
 *
 * Business logic for end-user credential management.
 * Handles encryption on store, decryption on retrieve, and lifecycle management.
 *
 * Security: Credentials are encrypted with AES-256-GCM before storage
 * and decrypted only in memory. Never log decrypted credentials.
 */

import { CredentialStatus, CredentialType } from '@prisma/client';
import { encryptJson, decryptJson, EncryptionError } from '@/lib/modules/credentials/encryption';
import {
  OAuth2CredentialSchema,
  CredentialSchemaMap,
  type CredentialData,
} from '@/lib/modules/credentials/credential.schemas';
import {
  createAppUserCredential,
  findByConnectionAndUser,
  findAppUserCredentialById,
  updateAppUserCredential,
  revokeAppUserCredential as repoRevoke,
  markNeedsReauth,
  findByConnectionId,
  findExpiringCredentials as repoFindExpiring,
  countByStatusForConnection,
  countByStatusForApp,
  type AppUserCredentialPaginationOptions,
  type AppUserCredentialFilters,
  type AppCredentialStatsResult,
} from './app-user-credential.repository';
import {
  toAppUserCredentialResponse,
  ListUserCredentialsParamsSchema,
  type ListUserCredentialsParams,
  type AppUserCredentialResponse,
  type ListUserCredentialsResponse,
} from './app-user-credential.schemas';
import {
  AppUserCredentialError,
  AppUserCredentialNotFoundError,
} from './app-user-credential.errors';

import type { AppUserCredential } from '@prisma/client';

// =============================================================================
// Types
// =============================================================================

/**
 * Decrypted end-user credential with metadata (never log this).
 */
export interface DecryptedAppUserCredential<T extends CredentialData = CredentialData> {
  id: string;
  connectionId: string;
  appUserId: string;
  credentialType: CredentialType;
  data: T;
  refreshToken?: string;
  expiresAt: Date | null;
  scopes: string[];
  status: CredentialStatus;
}

// =============================================================================
// Store Credential (Encrypt on Save)
// =============================================================================

/**
 * Stores (or updates) an end-user's credential under a connection.
 * If a credential already exists for this user+connection, it is replaced.
 *
 * @param connectionId - The connection the credential belongs to
 * @param appUserId - The end-user who owns this credential
 * @param tokenData - The credential data to encrypt and store
 */
export async function storeUserCredential(
  connectionId: string,
  appUserId: string,
  tokenData: {
    credentialType: CredentialType;
    accessToken: string;
    refreshToken?: string;
    tokenType?: string;
    expiresIn?: number;
    scopes?: string[];
  }
): Promise<AppUserCredentialResponse> {
  // Validate credential data based on type
  if (tokenData.credentialType === CredentialType.oauth2_tokens) {
    const credentialData = {
      accessToken: tokenData.accessToken,
      tokenType: tokenData.tokenType ?? 'Bearer',
      scopes: tokenData.scopes,
    };

    const parsed = OAuth2CredentialSchema.safeParse(credentialData);
    if (!parsed.success) {
      throw new AppUserCredentialError(
        'INVALID_CREDENTIAL_DATA',
        `Invalid OAuth2 credential data: ${parsed.error.message}`
      );
    }

    const encryptedData = encryptJson(parsed.data);

    let encryptedRefreshToken: Buffer | undefined;
    if (tokenData.refreshToken) {
      encryptedRefreshToken = encryptJson({ refreshToken: tokenData.refreshToken });
    }

    let expiresAt: Date | undefined;
    if (tokenData.expiresIn) {
      expiresAt = new Date(Date.now() + tokenData.expiresIn * 1000);
    }

    const credential = await createAppUserCredential({
      connectionId,
      appUserId,
      credentialType: CredentialType.oauth2_tokens,
      encryptedData,
      encryptedRefreshToken,
      expiresAt,
      scopes: tokenData.scopes,
    });

    return toAppUserCredentialResponse(credential);
  }

  // For non-OAuth2 types, encrypt the raw data
  const encryptedData = encryptJson({ accessToken: tokenData.accessToken });

  const credential = await createAppUserCredential({
    connectionId,
    appUserId,
    credentialType: tokenData.credentialType,
    encryptedData,
    scopes: tokenData.scopes,
  });

  return toAppUserCredentialResponse(credential);
}

// =============================================================================
// Retrieve Credential (Decrypt on Retrieve)
// =============================================================================

/**
 * Gets the decrypted credential for a user under a specific connection.
 * Returns null if no credential exists or if it is revoked.
 */
export async function getDecryptedUserCredential(
  connectionId: string,
  appUserId: string
): Promise<DecryptedAppUserCredential | null> {
  const credential = await findByConnectionAndUser(connectionId, appUserId);

  if (!credential) {
    return null;
  }

  return decryptCredentialRecord(credential);
}

/**
 * Gets the decrypted credential by ID.
 */
export async function getDecryptedUserCredentialById(
  id: string
): Promise<DecryptedAppUserCredential | null> {
  const credential = await findAppUserCredentialById(id);

  if (!credential) {
    return null;
  }

  return decryptCredentialRecord(credential);
}

/**
 * Internal: Decrypts a credential record from the database.
 */
function decryptCredentialRecord(credential: AppUserCredential): DecryptedAppUserCredential {
  try {
    const data = decryptJson<CredentialData>(Buffer.from(credential.encryptedData));

    // Validate against the expected schema
    const schema = CredentialSchemaMap[credential.credentialType];
    if (schema) {
      const parsed = schema.safeParse(data);
      if (!parsed.success) {
        throw new AppUserCredentialError(
          'DECRYPTION_FAILED',
          'Stored credential data does not match expected schema',
          500
        );
      }
    }

    // Decrypt refresh token if present
    let refreshToken: string | undefined;
    if (credential.encryptedRefreshToken) {
      const refreshData = decryptJson<{ refreshToken: string }>(
        Buffer.from(credential.encryptedRefreshToken)
      );
      refreshToken = refreshData.refreshToken;
    }

    return {
      id: credential.id,
      connectionId: credential.connectionId,
      appUserId: credential.appUserId,
      credentialType: credential.credentialType,
      data,
      refreshToken,
      expiresAt: credential.expiresAt,
      scopes: credential.scopes,
      status: credential.status,
    };
  } catch (error) {
    if (error instanceof EncryptionError) {
      throw new AppUserCredentialError(
        'DECRYPTION_FAILED',
        'Failed to decrypt user credential data',
        500
      );
    }
    throw error;
  }
}

// =============================================================================
// List Credentials (Safe — no secrets)
// =============================================================================

/**
 * Lists credentials for a connection with pagination and filtering.
 * Returns only safe metadata (no decrypted secrets).
 */
export async function listUserCredentials(
  connectionId: string,
  query: Partial<ListUserCredentialsParams> = {}
): Promise<ListUserCredentialsResponse> {
  const parsed = ListUserCredentialsParamsSchema.safeParse(query);
  if (!parsed.success) {
    throw new AppUserCredentialError(
      'INVALID_INPUT',
      `Invalid query parameters: ${parsed.error.message}`
    );
  }

  const { cursor, limit, status } = parsed.data;
  const pagination: AppUserCredentialPaginationOptions = { cursor, limit };
  const filters: AppUserCredentialFilters = {
    status: status as CredentialStatus | undefined,
  };

  const result = await findByConnectionId(connectionId, pagination, filters);

  return {
    credentials: result.credentials.map(toAppUserCredentialResponse),
    pagination: {
      cursor: result.nextCursor,
      hasMore: result.nextCursor !== null,
      totalCount: result.totalCount,
    },
  };
}

// =============================================================================
// Credential Lifecycle
// =============================================================================

/**
 * Revokes a user credential (marks as revoked for audit trail).
 */
export async function revokeUserCredential(id: string): Promise<AppUserCredentialResponse> {
  const credential = await findAppUserCredentialById(id);
  if (!credential) {
    throw new AppUserCredentialNotFoundError(id);
  }

  const revoked = await repoRevoke(id);
  return toAppUserCredentialResponse(revoked);
}

/**
 * Refreshes an OAuth2 user credential with new tokens.
 * Called by the token refresh background job.
 */
export async function refreshUserCredential(
  id: string,
  newTokens: {
    accessToken: string;
    refreshToken?: string;
    expiresIn?: number;
  }
): Promise<AppUserCredentialResponse> {
  const credential = await findAppUserCredentialById(id);
  if (!credential) {
    throw new AppUserCredentialNotFoundError(id);
  }

  if (credential.credentialType !== CredentialType.oauth2_tokens) {
    throw new AppUserCredentialError(
      'INVALID_CREDENTIAL_DATA',
      'Only OAuth2 credentials can be refreshed'
    );
  }

  const credentialData = {
    accessToken: newTokens.accessToken,
    tokenType: 'Bearer',
  };

  const parsed = OAuth2CredentialSchema.safeParse(credentialData);
  if (!parsed.success) {
    throw new AppUserCredentialError(
      'INVALID_CREDENTIAL_DATA',
      `Invalid OAuth2 credential data: ${parsed.error.message}`
    );
  }

  const encryptedData = encryptJson(parsed.data);

  let expiresAt: Date | undefined;
  if (newTokens.expiresIn) {
    expiresAt = new Date(Date.now() + newTokens.expiresIn * 1000);
  }

  let encryptedRefreshToken: Buffer | undefined;
  if (newTokens.refreshToken) {
    encryptedRefreshToken = encryptJson({ refreshToken: newTokens.refreshToken });
  }

  const updated = await updateAppUserCredential(id, {
    encryptedData,
    encryptedRefreshToken,
    expiresAt,
    status: CredentialStatus.active,
  });

  return toAppUserCredentialResponse(updated);
}

/**
 * Marks a credential as needing re-authentication.
 * Called when a token refresh fails.
 */
export async function flagUserCredentialForReauth(id: string): Promise<AppUserCredentialResponse> {
  const credential = await findAppUserCredentialById(id);
  if (!credential) {
    throw new AppUserCredentialNotFoundError(id);
  }

  const updated = await markNeedsReauth(id);
  return toAppUserCredentialResponse(updated);
}

/**
 * Finds credentials expiring soon (for the token refresh job).
 */
export async function findExpiringUserCredentials(
  bufferMinutes: number = 10
): Promise<AppUserCredential[]> {
  return repoFindExpiring(bufferMinutes);
}

/**
 * Gets credential status counts for a connection (for dashboard display).
 */
export async function getUserCredentialStats(
  connectionId: string
): Promise<Record<CredentialStatus, number>> {
  return countByStatusForConnection(connectionId);
}

/**
 * Gets aggregate credential stats for an app across all its connections.
 */
export async function getAppCredentialStats(appId: string): Promise<AppCredentialStatsResult> {
  return countByStatusForApp(appId);
}
