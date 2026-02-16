/**
 * Auth Schemas
 *
 * Zod schemas for authentication-related API requests and responses.
 */

import { z } from 'zod';

// =============================================================================
// OAUTH CONFIGURATION SCHEMAS
// =============================================================================

/**
 * OAuth2 provider configuration (stored in Integration.authConfig)
 */
export const OAuthIntegrationConfigSchema = z.object({
  authorizationUrl: z.string().url({ message: 'Valid authorization URL is required' }),
  tokenUrl: z.string().url({ message: 'Valid token URL is required' }),
  clientId: z.string().min(1, 'Client ID is required'),
  clientSecret: z.string().min(1, 'Client secret is required'),
  scopes: z.array(z.string()).optional(),
  usePkce: z.boolean().default(false),
  revocationUrl: z.string().url().optional(),
  introspectionUrl: z.string().url().optional(),
  userInfoUrl: z.string().url().optional(),
  additionalAuthParams: z.record(z.string(), z.string()).optional(),
  additionalTokenParams: z.record(z.string(), z.string()).optional(),
});

export type OAuthIntegrationConfig = z.infer<typeof OAuthIntegrationConfigSchema>;

/**
 * API Key configuration (stored in Integration.authConfig)
 */
export const ApiKeyConfigSchema = z.object({
  placement: z.enum(['header', 'query', 'body']),
  paramName: z.string().min(1, 'Parameter name is required'),
});

export type ApiKeyConfig = z.infer<typeof ApiKeyConfigSchema>;

/**
 * Basic Auth configuration (stored in Integration.authConfig)
 * Note: credentials stored separately in IntegrationCredential
 */
export const BasicAuthConfigSchema = z.object({
  // Basic auth typically doesn't need config beyond credentials
  realm: z.string().optional(), // For documentation purposes
});

export type BasicAuthConfig = z.infer<typeof BasicAuthConfigSchema>;

/**
 * Bearer Token configuration (stored in Integration.authConfig)
 */
export const BearerTokenConfigSchema = z.object({
  // Bearer typically doesn't need config beyond the token
  prefix: z.string().default('Bearer'), // Some APIs use custom prefixes
});

export type BearerTokenConfig = z.infer<typeof BearerTokenConfigSchema>;

/**
 * Custom Header configuration (stored in Integration.authConfig)
 */
export const CustomHeaderConfigSchema = z.object({
  // Header names required (values stored in IntegrationCredential)
  headerNames: z.array(z.string().min(1)).min(1, 'At least one header name is required'),
});

export type CustomHeaderConfig = z.infer<typeof CustomHeaderConfigSchema>;

// =============================================================================
// API REQUEST SCHEMAS
// =============================================================================

/**
 * OAuth connect request body
 * POST /api/v1/integrations/:id/connect
 */
export const OAuthConnectRequestSchema = z.object({
  redirectAfterAuth: z.string().url('Must be a valid URL').optional(),
});

export type OAuthConnectRequest = z.infer<typeof OAuthConnectRequestSchema>;

/**
 * Store API Key credentials request
 * POST /api/v1/integrations/:id/credentials
 */
export const StoreApiKeyRequestSchema = z.object({
  type: z.literal('api_key'),
  apiKey: z.string().min(1, 'API key is required'),
  placement: z.enum(['header', 'query', 'body']).optional(),
  paramName: z.string().optional(),
});

export type StoreApiKeyRequest = z.infer<typeof StoreApiKeyRequestSchema>;

/**
 * Store Basic Auth credentials request
 */
export const StoreBasicAuthRequestSchema = z.object({
  type: z.literal('basic'),
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
});

export type StoreBasicAuthRequest = z.infer<typeof StoreBasicAuthRequestSchema>;

/**
 * Store Bearer Token credentials request
 */
export const StoreBearerTokenRequestSchema = z.object({
  type: z.literal('bearer'),
  token: z.string().min(1, 'Token is required'),
});

export type StoreBearerTokenRequest = z.infer<typeof StoreBearerTokenRequestSchema>;

/**
 * Store Custom Header credentials request
 */
export const StoreCustomHeaderRequestSchema = z.object({
  type: z.literal('custom_header'),
  headers: z
    .record(z.string().min(1), z.string())
    .refine((headers) => Object.keys(headers).length > 0, {
      message: 'At least one header is required',
    }),
});

export type StoreCustomHeaderRequest = z.infer<typeof StoreCustomHeaderRequestSchema>;

/**
 * Union of all store credential request types
 */
export const StoreCredentialRequestSchema = z.discriminatedUnion('type', [
  StoreApiKeyRequestSchema,
  StoreBasicAuthRequestSchema,
  StoreBearerTokenRequestSchema,
  StoreCustomHeaderRequestSchema,
]);

export type StoreCredentialRequest = z.infer<typeof StoreCredentialRequestSchema>;

// =============================================================================
// API RESPONSE SCHEMAS
// =============================================================================

/**
 * Base API response wrapper
 */
export const ApiResponseSchema = <T extends z.ZodType>(dataSchema: T) =>
  z.object({
    success: z.boolean(),
    data: dataSchema.optional(),
    error: z
      .object({
        code: z.string(),
        message: z.string(),
        details: z.record(z.string(), z.unknown()).optional(),
        requestId: z.string().uuid().optional(),
        suggestedResolution: z
          .object({
            action: z.string(),
            description: z.string(),
            retryable: z.boolean(),
            retryAfterMs: z.number().nullable().optional(),
          })
          .optional(),
      })
      .optional(),
  });

/**
 * OAuth connect response
 */
export const OAuthConnectResponseSchema = z.object({
  authorizationUrl: z.string().url(),
  state: z.string(),
});

export type OAuthConnectResponse = z.infer<typeof OAuthConnectResponseSchema>;

/**
 * OAuth callback success result (internal).
 * Extended with connect session context for end-user auth delegation flows.
 */
export const OAuthCallbackResultSchema = z.object({
  integrationId: z.string().uuid(),
  tenantId: z.string().uuid(),
  connectionId: z.string().uuid().optional(),
  redirectUrl: z.string().url().optional(),
  connectSessionToken: z.string().optional(),
  appUserId: z.string().uuid().optional(),
});

export type OAuthCallbackResult = z.infer<typeof OAuthCallbackResultSchema>;

/**
 * Disconnect response
 */
export const DisconnectResponseSchema = z.object({
  message: z.string(),
  integrationId: z.string().uuid(),
});

export type DisconnectResponse = z.infer<typeof DisconnectResponseSchema>;

/**
 * Credential test response
 */
export const CredentialTestResponseSchema = z.object({
  valid: z.boolean(),
  message: z.string(),
  checkedAt: z.string().datetime(),
  details: z.record(z.string(), z.unknown()).optional(),
});

export type CredentialTestResponse = z.infer<typeof CredentialTestResponseSchema>;

/**
 * Integration auth status response
 */
export const IntegrationAuthStatusSchema = z.object({
  integration: z.object({
    id: z.string().uuid(),
    name: z.string(),
    authType: z.enum(['oauth2', 'api_key', 'basic', 'bearer', 'custom_header']),
    status: z.string(),
  }),
  credentials: z.object({
    hasCredentials: z.boolean(),
    status: z.string().optional(),
    credentialType: z.string().optional(),
    expiresAt: z.string().datetime().nullable().optional(),
    scopes: z.array(z.string()).optional(),
  }),
});

export type IntegrationAuthStatus = z.infer<typeof IntegrationAuthStatusSchema>;

// =============================================================================
// WAYGATE API KEY SCHEMAS
// =============================================================================

/**
 * Waygate API key format
 * Format: wg_live_<random> or wg_test_<random>
 */
export const WaygateApiKeySchema = z
  .string()
  .regex(/^wg_(live|test)_[a-zA-Z0-9]{32}$/, 'Invalid Waygate API key format');

export type WaygateApiKey = z.infer<typeof WaygateApiKeySchema>;

/**
 * API key generation result
 */
export const ApiKeyGenerationResultSchema = z.object({
  key: WaygateApiKeySchema,
  hash: z.string(),
  prefix: z.string(),
  maskedKey: z.string(),
});

export type ApiKeyGenerationResult = z.infer<typeof ApiKeyGenerationResultSchema>;

/**
 * Request headers containing Waygate API key
 */
export const WaygateAuthHeadersSchema = z.object({
  'x-api-key': WaygateApiKeySchema.optional(),
  authorization: z
    .string()
    .regex(/^Bearer wg_(live|test)_[a-zA-Z0-9]{32}$/)
    .optional(),
});

export type WaygateAuthHeaders = z.infer<typeof WaygateAuthHeadersSchema>;

// =============================================================================
// ERROR CODE ENUMS
// =============================================================================

/**
 * Auth-related error codes
 */
export const AuthErrorCodes = {
  // API Key errors
  MISSING_API_KEY: 'MISSING_API_KEY',
  INVALID_API_KEY: 'INVALID_API_KEY',
  EXPIRED_API_KEY: 'EXPIRED_API_KEY',

  // OAuth errors
  INVALID_STATE: 'INVALID_STATE',
  STATE_EXPIRED: 'STATE_EXPIRED',
  TOKEN_EXCHANGE_FAILED: 'TOKEN_EXCHANGE_FAILED',
  TOKEN_REFRESH_FAILED: 'TOKEN_REFRESH_FAILED',

  // Integration errors
  INTEGRATION_NOT_FOUND: 'INTEGRATION_NOT_FOUND',
  INVALID_AUTH_TYPE: 'INVALID_AUTH_TYPE',
  INVALID_AUTH_CONFIG: 'INVALID_AUTH_CONFIG',
  MISSING_CREDENTIALS: 'MISSING_CREDENTIALS',

  // Credential errors
  CREDENTIAL_NOT_FOUND: 'CREDENTIAL_NOT_FOUND',
  CREDENTIAL_EXPIRED: 'CREDENTIAL_EXPIRED',
  CREDENTIAL_REVOKED: 'CREDENTIAL_REVOKED',
  ENCRYPTION_ERROR: 'ENCRYPTION_ERROR',

  // General
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type AuthErrorCode = (typeof AuthErrorCodes)[keyof typeof AuthErrorCodes];
