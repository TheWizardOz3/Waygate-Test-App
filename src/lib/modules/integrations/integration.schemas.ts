/**
 * Integration Schemas
 *
 * Zod schemas for integration validation, CRUD operations, and API responses.
 * Defines the structure of integration definitions for external API connections.
 */

import { z } from 'zod';

// =============================================================================
// Enums
// =============================================================================

/**
 * Authentication types supported by integrations
 */
export const AuthTypeSchema = z.enum([
  'none',
  'oauth2',
  'api_key',
  'basic',
  'bearer',
  'custom_header',
]);
export type AuthType = z.infer<typeof AuthTypeSchema>;

/**
 * Integration status
 */
export const IntegrationStatusSchema = z.enum(['draft', 'active', 'error', 'disabled']);
export type IntegrationStatus = z.infer<typeof IntegrationStatusSchema>;

// =============================================================================
// Auth Config Schemas
// =============================================================================

/**
 * OAuth2 configuration (non-sensitive parts)
 */
export const OAuth2ConfigSchema = z.object({
  authorizationUrl: z.string().url().optional(),
  tokenUrl: z.string().url().optional(),
  scopes: z.array(z.string()).optional(),
  clientId: z.string().optional(), // May be stored here if not secret
  additionalAuthParams: z.record(z.string(), z.string()).optional(),
  additionalTokenParams: z.record(z.string(), z.string()).optional(),
});

/**
 * API Key configuration
 */
export const ApiKeyConfigSchema = z.object({
  placement: z.enum(['header', 'query', 'body']).optional(),
  paramName: z.string().optional(),
});

/**
 * Base URL configuration
 * Uses transform to convert empty strings to undefined before URL validation
 */
export const BaseUrlConfigSchema = z.object({
  baseUrl: z
    .string()
    .optional()
    .transform((val) => (val?.trim() === '' ? undefined : val))
    .pipe(z.string().url().optional()),
});

/**
 * Combined auth config (union of all types)
 * Uses transform to convert empty strings to undefined before URL validation
 */
export const AuthConfigSchema = z
  .object({
    baseUrl: z
      .string()
      .optional()
      .transform((val) => (val?.trim() === '' ? undefined : val))
      .pipe(z.string().url().optional()),
  })
  .merge(OAuth2ConfigSchema.partial())
  .merge(ApiKeyConfigSchema.partial())
  .passthrough();

export type AuthConfig = z.infer<typeof AuthConfigSchema>;

// =============================================================================
// Integration CRUD Schemas
// =============================================================================

/**
 * Action definition for bulk creation during integration setup
 */
export const ActionDefinitionSchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
  path: z.string().min(1),
  description: z.string().optional(),
  pathParameters: z.array(z.any()).optional(),
  queryParameters: z.array(z.any()).optional(),
  requestBody: z.any().optional(),
  responses: z.record(z.string(), z.any()).optional(),
  tags: z.array(z.string()).optional(),
});

export type ActionDefinition = z.infer<typeof ActionDefinitionSchema>;

/**
 * Input for creating a new integration
 */
export const CreateIntegrationInputSchema = z.object({
  name: z.string().min(1).max(255),
  slug: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens'),
  description: z.string().optional(),
  documentationUrl: z.string().url().optional(),
  authType: AuthTypeSchema,
  authConfig: AuthConfigSchema.optional().default({}),
  tags: z.array(z.string()).optional().default([]),
  metadata: z.record(z.string(), z.unknown()).optional().default({}),
  /** Optional actions to create along with the integration */
  actions: z.array(ActionDefinitionSchema).optional(),
});

export type CreateIntegrationInput = z.infer<typeof CreateIntegrationInputSchema>;

/**
 * Input for updating an integration
 */
export const UpdateIntegrationInputSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  slug: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens')
    .optional(),
  description: z.string().nullable().optional(),
  documentationUrl: z.string().url().nullable().optional(),
  authType: AuthTypeSchema.optional(),
  authConfig: AuthConfigSchema.optional(),
  status: IntegrationStatusSchema.optional(),
  tags: z.array(z.string()).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type UpdateIntegrationInput = z.infer<typeof UpdateIntegrationInputSchema>;

// =============================================================================
// Query Schemas
// =============================================================================

/**
 * Filters for querying integrations
 */
export const IntegrationFiltersSchema = z.object({
  status: IntegrationStatusSchema.optional(),
  authType: AuthTypeSchema.optional(),
  tags: z.array(z.string()).optional(),
  search: z.string().optional(),
});

export type IntegrationFilters = z.infer<typeof IntegrationFiltersSchema>;

/**
 * Query parameters for listing integrations (API)
 */
export const ListIntegrationsQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: IntegrationStatusSchema.optional(),
  authType: AuthTypeSchema.optional(),
  tags: z.string().optional(), // Comma-separated
  search: z.string().optional(),
});

export type ListIntegrationsQuery = z.infer<typeof ListIntegrationsQuerySchema>;

// =============================================================================
// API Response Schemas
// =============================================================================

/**
 * Integration as returned by the API
 */
export const IntegrationResponseSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  name: z.string(),
  slug: z.string(),
  description: z.string().nullable(),
  documentationUrl: z.string().nullable(),
  authType: AuthTypeSchema,
  authConfig: AuthConfigSchema,
  status: IntegrationStatusSchema,
  tags: z.array(z.string()),
  metadata: z.record(z.string(), z.unknown()),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type IntegrationResponse = z.infer<typeof IntegrationResponseSchema>;

/**
 * Paginated list of integrations
 */
export const ListIntegrationsResponseSchema = z.object({
  integrations: z.array(IntegrationResponseSchema),
  pagination: z.object({
    cursor: z.string().nullable(),
    hasMore: z.boolean(),
    totalCount: z.number().int(),
  }),
});

export type ListIntegrationsResponse = z.infer<typeof ListIntegrationsResponseSchema>;

/**
 * Integration with action count (for list views)
 */
export const IntegrationSummarySchema = IntegrationResponseSchema.extend({
  actionCount: z.number().int(),
});

export type IntegrationSummary = z.infer<typeof IntegrationSummarySchema>;

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Converts a database Integration to API response format
 */
export function toIntegrationResponse(integration: {
  id: string;
  tenantId: string;
  name: string;
  slug: string;
  description: string | null;
  documentationUrl: string | null;
  authType: string;
  authConfig: unknown;
  status: string;
  tags: string[];
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
}): IntegrationResponse {
  return {
    id: integration.id,
    tenantId: integration.tenantId,
    name: integration.name,
    slug: integration.slug,
    description: integration.description,
    documentationUrl: integration.documentationUrl,
    authType: integration.authType as AuthType,
    authConfig: (integration.authConfig as AuthConfig) ?? {},
    status: integration.status as IntegrationStatus,
    tags: integration.tags,
    metadata: (integration.metadata as Record<string, unknown>) ?? {},
    createdAt: integration.createdAt.toISOString(),
    updatedAt: integration.updatedAt.toISOString(),
  };
}

// =============================================================================
// Error Codes
// =============================================================================

export const IntegrationErrorCodes = {
  INTEGRATION_NOT_FOUND: 'INTEGRATION_NOT_FOUND',
  DUPLICATE_SLUG: 'DUPLICATE_SLUG',
  INVALID_STATUS: 'INVALID_STATUS',
  INTEGRATION_DISABLED: 'INTEGRATION_DISABLED',
  INVALID_AUTH_CONFIG: 'INVALID_AUTH_CONFIG',
} as const;
