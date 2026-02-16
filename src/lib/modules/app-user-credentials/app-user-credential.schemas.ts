/**
 * AppUserCredential Schemas
 *
 * Zod schemas for end-user credential validation and API response types.
 * Credentials are never exposed in responses — only safe metadata is returned.
 */

import { z } from 'zod';

// =============================================================================
// Query Schemas
// =============================================================================

export const ListUserCredentialsParamsSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['active', 'expired', 'revoked', 'needs_reauth']).optional(),
});
export type ListUserCredentialsParams = z.infer<typeof ListUserCredentialsParamsSchema>;

// =============================================================================
// API Response Schemas (no secrets)
// =============================================================================

export const AppUserCredentialResponseSchema = z.object({
  id: z.string().uuid(),
  connectionId: z.string().uuid(),
  appUserId: z.string().uuid(),
  credentialType: z.enum(['oauth2_tokens', 'api_key', 'basic', 'bearer']),
  status: z.enum(['active', 'expired', 'revoked', 'needs_reauth']),
  expiresAt: z.string().nullable(),
  scopes: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type AppUserCredentialResponse = z.infer<typeof AppUserCredentialResponseSchema>;

export const ListUserCredentialsResponseSchema = z.object({
  credentials: z.array(AppUserCredentialResponseSchema),
  pagination: z.object({
    cursor: z.string().nullable(),
    hasMore: z.boolean(),
    totalCount: z.number().int(),
  }),
});
export type ListUserCredentialsResponse = z.infer<typeof ListUserCredentialsResponseSchema>;

// =============================================================================
// Response Helpers
// =============================================================================

export function toAppUserCredentialResponse(credential: {
  id: string;
  connectionId: string;
  appUserId: string;
  credentialType: string;
  status: string;
  expiresAt: Date | null;
  scopes: string[];
  createdAt: Date;
  updatedAt: Date;
}): AppUserCredentialResponse {
  return {
    id: credential.id,
    connectionId: credential.connectionId,
    appUserId: credential.appUserId,
    credentialType: credential.credentialType as AppUserCredentialResponse['credentialType'],
    status: credential.status as AppUserCredentialResponse['status'],
    expiresAt: credential.expiresAt?.toISOString() ?? null,
    scopes: credential.scopes,
    createdAt: credential.createdAt.toISOString(),
    updatedAt: credential.updatedAt.toISOString(),
  };
}

// =============================================================================
// Error Codes
// =============================================================================

export const AppUserCredentialErrorCodes = {
  APP_USER_CREDENTIAL_NOT_FOUND: 'APP_USER_CREDENTIAL_NOT_FOUND',
  INVALID_INPUT: 'INVALID_INPUT',
  DECRYPTION_FAILED: 'DECRYPTION_FAILED',
  INVALID_CREDENTIAL_DATA: 'INVALID_CREDENTIAL_DATA',
} as const;
