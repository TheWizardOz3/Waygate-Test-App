/**
 * Credential Service
 *
 * Business logic layer for credential management.
 * Handles encryption on save, decryption on retrieve, and validation.
 *
 * Security: Credentials are encrypted before storage and decrypted only in memory.
 * Never log decrypted credentials.
 */

import { CredentialStatus as CredentialStatusEnum, CredentialType } from '@prisma/client';
import { encryptJson, decryptJson, EncryptionError } from './encryption';
import {
  createCredential,
  findActiveCredentialForIntegration,
  findCredentialByIdAndTenant,
  findCredentialsByIntegration,
  updateCredential,
  revokeCredential as repoRevokeCredential,
  markCredentialNeedsReauth,
} from './credential.repository';
import {
  OAuth2CredentialSchema,
  ApiKeyCredentialSchema,
  BasicCredentialSchema,
  BearerCredentialSchema,
  CredentialSchemaMap,
  type OAuth2CredentialData,
  type ApiKeyCredentialData,
  type BasicCredentialData,
  type BearerCredentialData,
  type CustomHeaderCredentialData,
  type CredentialData,
  type CredentialStatus,
} from './credential.schemas';

import type { IntegrationCredential } from '@prisma/client';

/**
 * Error thrown when credential operations fail
 */
export class CredentialError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number = 400
  ) {
    super(message);
    this.name = 'CredentialError';
  }
}

/**
 * Decrypted credential with metadata
 */
export interface DecryptedCredential<T extends CredentialData = CredentialData> {
  id: string;
  integrationId: string;
  tenantId: string;
  credentialType: CredentialType;
  data: T;
  refreshToken?: string;
  expiresAt: Date | null;
  scopes: string[];
  status: CredentialStatusEnum;
}

// =============================================================================
// STORE CREDENTIALS (Encrypt on Save)
// =============================================================================

/**
 * Stores OAuth2 credentials (access token, refresh token, etc.)
 *
 * @param tenantId - The tenant ID
 * @param integrationId - The integration ID
 * @param data - OAuth2 credential data
 * @param connectionId - Optional connection ID for multi-app connections
 */
export async function storeOAuth2Credential(
  tenantId: string,
  integrationId: string,
  data: {
    accessToken: string;
    refreshToken?: string;
    tokenType?: string;
    expiresIn?: number; // seconds
    scopes?: string[];
  },
  connectionId?: string
): Promise<IntegrationCredential> {
  // Validate the credential data
  const credentialData: OAuth2CredentialData = {
    accessToken: data.accessToken,
    tokenType: data.tokenType ?? 'Bearer',
    scopes: data.scopes,
  };

  const parsed = OAuth2CredentialSchema.safeParse(credentialData);
  if (!parsed.success) {
    throw new CredentialError(
      'INVALID_CREDENTIAL_DATA',
      `Invalid OAuth2 credential data: ${parsed.error.message}`
    );
  }

  // Calculate expiration time
  let expiresAt: Date | undefined;
  if (data.expiresIn) {
    expiresAt = new Date(Date.now() + data.expiresIn * 1000);
  }

  // Encrypt the credential data
  const encryptedData = encryptJson(parsed.data);

  // Encrypt refresh token separately (for easier refresh without decrypting main data)
  let encryptedRefreshToken: Buffer | undefined;
  if (data.refreshToken) {
    encryptedRefreshToken = encryptJson({ refreshToken: data.refreshToken });
  }

  return createCredential({
    integrationId,
    tenantId,
    connectionId,
    credentialType: CredentialType.oauth2_tokens,
    encryptedData,
    encryptedRefreshToken,
    expiresAt,
    scopes: data.scopes,
  });
}

/**
 * Stores API Key credentials
 *
 * @param tenantId - The tenant ID
 * @param integrationId - The integration ID
 * @param data - API key credential data
 * @param connectionId - Optional connection ID for multi-app connections
 */
export async function storeApiKeyCredential(
  tenantId: string,
  integrationId: string,
  data: {
    apiKey: string;
    placement: 'header' | 'query' | 'body';
    paramName: string;
    prefix?: string; // e.g., "Bearer" - empty for Supabase
    baseUrl?: string; // Per-credential base URL (for user-specific APIs like Supabase)
  },
  connectionId?: string
): Promise<IntegrationCredential> {
  const parsed = ApiKeyCredentialSchema.safeParse(data);
  if (!parsed.success) {
    throw new CredentialError(
      'INVALID_CREDENTIAL_DATA',
      `Invalid API key credential data: ${parsed.error.message}`
    );
  }

  const encryptedData = encryptJson(parsed.data);

  return createCredential({
    integrationId,
    tenantId,
    connectionId,
    credentialType: CredentialType.api_key,
    encryptedData,
  });
}

/**
 * Stores Basic Auth credentials
 *
 * @param tenantId - The tenant ID
 * @param integrationId - The integration ID
 * @param data - Basic auth credential data
 * @param connectionId - Optional connection ID for multi-app connections
 */
export async function storeBasicCredential(
  tenantId: string,
  integrationId: string,
  data: {
    username: string;
    password: string;
  },
  connectionId?: string
): Promise<IntegrationCredential> {
  const parsed = BasicCredentialSchema.safeParse(data);
  if (!parsed.success) {
    throw new CredentialError(
      'INVALID_CREDENTIAL_DATA',
      `Invalid Basic auth credential data: ${parsed.error.message}`
    );
  }

  const encryptedData = encryptJson(parsed.data);

  return createCredential({
    integrationId,
    tenantId,
    connectionId,
    credentialType: CredentialType.basic,
    encryptedData,
  });
}

/**
 * Stores Bearer Token credentials
 *
 * @param tenantId - The tenant ID
 * @param integrationId - The integration ID
 * @param data - Bearer token credential data
 * @param connectionId - Optional connection ID for multi-app connections
 */
export async function storeBearerCredential(
  tenantId: string,
  integrationId: string,
  data: {
    token: string;
    baseUrl?: string; // Per-credential base URL (for user-specific APIs)
  },
  connectionId?: string
): Promise<IntegrationCredential> {
  const parsed = BearerCredentialSchema.safeParse(data);
  if (!parsed.success) {
    throw new CredentialError(
      'INVALID_CREDENTIAL_DATA',
      `Invalid Bearer token credential data: ${parsed.error.message}`
    );
  }

  const encryptedData = encryptJson(parsed.data);

  return createCredential({
    integrationId,
    tenantId,
    connectionId,
    credentialType: CredentialType.bearer,
    encryptedData,
  });
}

// =============================================================================
// RETRIEVE CREDENTIALS (Decrypt on Retrieve)
// =============================================================================

/**
 * Gets the active credential for an integration, decrypted
 * Returns null if no active credential exists
 *
 * @param integrationId - The integration ID
 * @param tenantId - The tenant ID
 * @param connectionId - Optional connection ID for multi-app connections
 */
export async function getDecryptedCredential(
  integrationId: string,
  tenantId: string,
  connectionId?: string
): Promise<DecryptedCredential | null> {
  const credential = await findActiveCredentialForIntegration(
    integrationId,
    tenantId,
    connectionId
  );

  if (!credential) {
    return null;
  }

  return decryptCredentialRecord(credential);
}

/**
 * Gets a credential by ID with tenant verification, decrypted
 */
export async function getDecryptedCredentialById(
  credentialId: string,
  tenantId: string
): Promise<DecryptedCredential | null> {
  const credential = await findCredentialByIdAndTenant(credentialId, tenantId);

  if (!credential) {
    return null;
  }

  return decryptCredentialRecord(credential);
}

/**
 * Internal: Decrypts a credential record from the database
 */
function decryptCredentialRecord(credential: IntegrationCredential): DecryptedCredential {
  try {
    // Decrypt the main credential data (convert Uint8Array to Buffer)
    const data = decryptJson<CredentialData>(Buffer.from(credential.encryptedData));

    // Validate against the expected schema
    const schema = CredentialSchemaMap[credential.credentialType];
    if (schema) {
      const parsed = schema.safeParse(data);
      if (!parsed.success) {
        throw new CredentialError(
          'CORRUPTED_CREDENTIAL',
          'Stored credential data does not match expected schema'
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
      integrationId: credential.integrationId,
      tenantId: credential.tenantId,
      credentialType: credential.credentialType,
      data,
      refreshToken,
      expiresAt: credential.expiresAt,
      scopes: credential.scopes,
      status: credential.status,
    };
  } catch (error) {
    if (error instanceof EncryptionError) {
      throw new CredentialError('DECRYPTION_FAILED', 'Failed to decrypt credential data', 500);
    }
    throw error;
  }
}

// =============================================================================
// CREDENTIAL STATUS (Safe to return to clients)
// =============================================================================

/**
 * Gets credential status without secrets (safe for API responses)
 */
export async function getCredentialStatus(
  integrationId: string,
  tenantId: string
): Promise<CredentialStatus | null> {
  const credential = await findActiveCredentialForIntegration(integrationId, tenantId);

  if (!credential) {
    return null;
  }

  return toCredentialStatus(credential);
}

/**
 * Gets all credential statuses for an integration
 */
export async function getCredentialStatuses(
  integrationId: string,
  tenantId: string
): Promise<CredentialStatus[]> {
  const credentials = await findCredentialsByIntegration(integrationId, tenantId);
  return credentials.map(toCredentialStatus);
}

/**
 * Converts a credential record to a safe status object
 */
function toCredentialStatus(credential: IntegrationCredential): CredentialStatus {
  return {
    id: credential.id,
    integrationId: credential.integrationId,
    credentialType: credential.credentialType,
    status: credential.status,
    expiresAt: credential.expiresAt?.toISOString() ?? null,
    scopes: credential.scopes,
    createdAt: credential.createdAt.toISOString(),
    updatedAt: credential.updatedAt.toISOString(),
  };
}

// =============================================================================
// UPDATE CREDENTIALS
// =============================================================================

/**
 * Updates OAuth2 tokens after a refresh
 */
export async function updateOAuth2Tokens(
  credentialId: string,
  data: {
    accessToken: string;
    refreshToken?: string;
    expiresIn?: number;
  }
): Promise<IntegrationCredential> {
  const credentialData: OAuth2CredentialData = {
    accessToken: data.accessToken,
    tokenType: 'Bearer',
  };

  const parsed = OAuth2CredentialSchema.safeParse(credentialData);
  if (!parsed.success) {
    throw new CredentialError(
      'INVALID_CREDENTIAL_DATA',
      `Invalid OAuth2 credential data: ${parsed.error.message}`
    );
  }

  const encryptedData = encryptJson(parsed.data);

  let expiresAt: Date | undefined;
  if (data.expiresIn) {
    expiresAt = new Date(Date.now() + data.expiresIn * 1000);
  }

  let encryptedRefreshToken: Buffer | undefined;
  if (data.refreshToken) {
    encryptedRefreshToken = encryptJson({ refreshToken: data.refreshToken });
  }

  return updateCredential(credentialId, {
    encryptedData,
    encryptedRefreshToken,
    expiresAt,
    status: CredentialStatusEnum.active,
  });
}

// =============================================================================
// CREDENTIAL LIFECYCLE
// =============================================================================

/**
 * Revokes a credential (marks as revoked, keeps for audit)
 */
export async function revokeCredential(
  credentialId: string,
  tenantId: string
): Promise<IntegrationCredential | null> {
  // Verify ownership first
  const credential = await findCredentialByIdAndTenant(credentialId, tenantId);
  if (!credential) {
    return null;
  }

  return repoRevokeCredential(credentialId);
}

/**
 * Marks a credential as needing re-authentication
 * Called when refresh fails or user revokes access
 */
export async function flagCredentialForReauth(
  credentialId: string
): Promise<IntegrationCredential> {
  return markCredentialNeedsReauth(credentialId);
}

/**
 * Checks if a credential is expired or about to expire
 */
export function isCredentialExpired(
  credential: IntegrationCredential | DecryptedCredential,
  bufferSeconds: number = 300 // 5 minute buffer
): boolean {
  if (!credential.expiresAt) {
    return false; // No expiration = never expires
  }

  const expirationWithBuffer = new Date(credential.expiresAt.getTime() - bufferSeconds * 1000);

  return new Date() >= expirationWithBuffer;
}

/**
 * Checks if a credential needs refresh (for OAuth2 tokens)
 */
export function needsRefresh(
  credential: IntegrationCredential | DecryptedCredential,
  bufferSeconds: number = 300
): boolean {
  if (credential.credentialType !== CredentialType.oauth2_tokens) {
    return false; // Only OAuth2 tokens need refresh
  }

  return isCredentialExpired(credential, bufferSeconds);
}

// =============================================================================
// TYPE GUARDS
// =============================================================================

/**
 * Type guard for OAuth2 credentials
 */
export function isOAuth2Credential(
  credential: DecryptedCredential
): credential is DecryptedCredential<OAuth2CredentialData> {
  return credential.credentialType === CredentialType.oauth2_tokens;
}

/**
 * Type guard for API Key credentials
 */
export function isApiKeyCredential(
  credential: DecryptedCredential
): credential is DecryptedCredential<ApiKeyCredentialData> {
  return credential.credentialType === CredentialType.api_key;
}

/**
 * Type guard for Basic Auth credentials
 */
export function isBasicCredential(
  credential: DecryptedCredential
): credential is DecryptedCredential<BasicCredentialData> {
  return credential.credentialType === CredentialType.basic;
}

/**
 * Type guard for Bearer Token credentials
 */
export function isBearerCredential(
  credential: DecryptedCredential
): credential is DecryptedCredential<BearerCredentialData> {
  return credential.credentialType === CredentialType.bearer;
}

/**
 * Type guard for Custom Header credentials
 */
export function isCustomHeaderCredential(
  credential: DecryptedCredential
): credential is DecryptedCredential<CustomHeaderCredentialData> {
  // Note: Custom headers use a different mechanism, not stored as CredentialType
  return false;
}
