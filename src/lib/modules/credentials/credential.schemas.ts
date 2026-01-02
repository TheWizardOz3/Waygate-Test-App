/**
 * Credential Schemas
 *
 * Zod schemas for credential data validation.
 * These define the structure of decrypted credential data for each auth type.
 */

import { z } from 'zod';

/**
 * OAuth2 credential data (decrypted)
 */
export const OAuth2CredentialSchema = z.object({
  accessToken: z.string().min(1, 'Access token is required'),
  refreshToken: z.string().optional(),
  tokenType: z.string().default('Bearer'),
  expiresAt: z.string().datetime().optional(), // ISO 8601 string
  scopes: z.array(z.string()).optional(),
});

export type OAuth2CredentialData = z.infer<typeof OAuth2CredentialSchema>;

/**
 * API Key credential data (decrypted)
 */
export const ApiKeyCredentialSchema = z.object({
  apiKey: z.string().min(1, 'API key is required'),
  placement: z.enum(['header', 'query', 'body']),
  paramName: z.string().min(1, 'Parameter name is required'),
});

export type ApiKeyCredentialData = z.infer<typeof ApiKeyCredentialSchema>;

/**
 * Basic Auth credential data (decrypted)
 */
export const BasicCredentialSchema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
});

export type BasicCredentialData = z.infer<typeof BasicCredentialSchema>;

/**
 * Bearer Token credential data (decrypted)
 */
export const BearerCredentialSchema = z.object({
  token: z.string().min(1, 'Token is required'),
});

export type BearerCredentialData = z.infer<typeof BearerCredentialSchema>;

/**
 * Custom Header credential data (decrypted)
 */
export const CustomHeaderCredentialSchema = z.object({
  headers: z.record(z.string(), z.string()).refine((headers) => Object.keys(headers).length > 0, {
    message: 'At least one header is required',
  }),
});

export type CustomHeaderCredentialData = z.infer<typeof CustomHeaderCredentialSchema>;

/**
 * Union of all credential data types
 */
export type CredentialData =
  | OAuth2CredentialData
  | ApiKeyCredentialData
  | BasicCredentialData
  | BearerCredentialData
  | CustomHeaderCredentialData;

/**
 * Schema map by credential type
 */
export const CredentialSchemaMap = {
  oauth2_tokens: OAuth2CredentialSchema,
  api_key: ApiKeyCredentialSchema,
  basic: BasicCredentialSchema,
  bearer: BearerCredentialSchema,
} as const;

/**
 * Input schema for storing OAuth2 credentials
 */
export const StoreOAuth2CredentialInputSchema = z.object({
  integrationId: z.string().uuid(),
  accessToken: z.string().min(1),
  refreshToken: z.string().optional(),
  tokenType: z.string().default('Bearer'),
  expiresIn: z.number().positive().optional(), // seconds until expiration
  scopes: z.array(z.string()).optional(),
});

export type StoreOAuth2CredentialInput = z.infer<typeof StoreOAuth2CredentialInputSchema>;

/**
 * Input schema for storing API Key credentials
 */
export const StoreApiKeyCredentialInputSchema = z.object({
  integrationId: z.string().uuid(),
  apiKey: z.string().min(1),
  placement: z.enum(['header', 'query', 'body']),
  paramName: z.string().min(1),
});

export type StoreApiKeyCredentialInput = z.infer<typeof StoreApiKeyCredentialInputSchema>;

/**
 * Input schema for storing Basic Auth credentials
 */
export const StoreBasicCredentialInputSchema = z.object({
  integrationId: z.string().uuid(),
  username: z.string().min(1),
  password: z.string().min(1),
});

export type StoreBasicCredentialInput = z.infer<typeof StoreBasicCredentialInputSchema>;

/**
 * Input schema for storing Bearer Token credentials
 */
export const StoreBearerCredentialInputSchema = z.object({
  integrationId: z.string().uuid(),
  token: z.string().min(1),
});

export type StoreBearerCredentialInput = z.infer<typeof StoreBearerCredentialInputSchema>;

/**
 * Input schema for storing Custom Header credentials
 */
export const StoreCustomHeaderCredentialInputSchema = z.object({
  integrationId: z.string().uuid(),
  headers: z.record(z.string(), z.string()),
});

export type StoreCustomHeaderCredentialInput = z.infer<
  typeof StoreCustomHeaderCredentialInputSchema
>;

/**
 * Credential status response (safe to return to client - no secrets)
 */
export const CredentialStatusSchema = z.object({
  id: z.string().uuid(),
  integrationId: z.string().uuid(),
  credentialType: z.enum(['oauth2_tokens', 'api_key', 'basic', 'bearer']),
  status: z.enum(['active', 'expired', 'revoked', 'needs_reauth']),
  expiresAt: z.string().datetime().nullable(),
  scopes: z.array(z.string()),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type CredentialStatus = z.infer<typeof CredentialStatusSchema>;
