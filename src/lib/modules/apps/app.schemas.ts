/**
 * App Schemas
 *
 * Zod schemas for app validation, CRUD operations, integration config management,
 * and API response types.
 */

import { z } from 'zod';

// =============================================================================
// Enums
// =============================================================================

export const AppStatusSchema = z.enum(['active', 'disabled']);
export type AppStatus = z.infer<typeof AppStatusSchema>;

// =============================================================================
// Branding Metadata Schema
// =============================================================================

export const AppBrandingSchema = z.object({
  logoUrl: z.string().url().optional(),
  appName: z.string().max(255).optional(),
  accentColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Must be a hex color (e.g. #7C3AED)')
    .optional(),
  privacyUrl: z.string().url().optional(),
});
export type AppBranding = z.infer<typeof AppBrandingSchema>;

export const AppMetadataSchema = z.object({
  branding: AppBrandingSchema.optional(),
});
export type AppMetadata = z.infer<typeof AppMetadataSchema>;

// =============================================================================
// App CRUD Schemas
// =============================================================================

export const CreateAppInputSchema = z.object({
  name: z.string().min(1).max(255),
  slug: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens'),
  description: z.string().max(2000).optional(),
  metadata: AppMetadataSchema.optional().default({}),
});
export type CreateAppInput = z.infer<typeof CreateAppInputSchema>;

export const UpdateAppInputSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  slug: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens')
    .optional(),
  description: z.string().max(2000).nullable().optional(),
  status: AppStatusSchema.optional(),
  metadata: AppMetadataSchema.optional(),
});
export type UpdateAppInput = z.infer<typeof UpdateAppInputSchema>;

// =============================================================================
// Integration Config Schemas
// =============================================================================

export const SetIntegrationConfigInputSchema = z.object({
  clientId: z.string().min(1).max(500),
  clientSecret: z.string().min(1).max(2000),
  scopes: z.array(z.string().min(1)).default([]),
  metadata: z.record(z.string(), z.unknown()).optional().default({}),
});
export type SetIntegrationConfigInput = z.infer<typeof SetIntegrationConfigInputSchema>;

// =============================================================================
// Query Schemas
// =============================================================================

export const ListAppsQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: AppStatusSchema.optional(),
  search: z.string().optional(),
});
export type ListAppsQuery = z.infer<typeof ListAppsQuerySchema>;

export interface AppFilters {
  status?: string;
  search?: string;
}

// =============================================================================
// API Response Schemas
// =============================================================================

export const AppResponseSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  name: z.string(),
  slug: z.string(),
  description: z.string().nullable(),
  status: AppStatusSchema,
  metadata: z.record(z.string(), z.unknown()),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type AppResponse = z.infer<typeof AppResponseSchema>;

export const AppWithKeyResponseSchema = AppResponseSchema.extend({
  apiKey: z.string(),
});
export type AppWithKeyResponse = z.infer<typeof AppWithKeyResponseSchema>;

export const IntegrationConfigResponseSchema = z.object({
  id: z.string().uuid(),
  appId: z.string().uuid(),
  integrationId: z.string().uuid(),
  hasClientId: z.boolean(),
  hasClientSecret: z.boolean(),
  scopes: z.array(z.string()),
  metadata: z.record(z.string(), z.unknown()),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type IntegrationConfigResponse = z.infer<typeof IntegrationConfigResponseSchema>;

export const ListAppsResponseSchema = z.object({
  apps: z.array(AppResponseSchema),
  pagination: z.object({
    cursor: z.string().nullable(),
    hasMore: z.boolean(),
    totalCount: z.number().int(),
  }),
});
export type ListAppsResponse = z.infer<typeof ListAppsResponseSchema>;

// =============================================================================
// Response Helpers
// =============================================================================

export function toAppResponse(app: {
  id: string;
  tenantId: string;
  name: string;
  slug: string;
  description: string | null;
  status: string;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
}): AppResponse {
  return {
    id: app.id,
    tenantId: app.tenantId,
    name: app.name,
    slug: app.slug,
    description: app.description,
    status: app.status as AppStatus,
    metadata: (app.metadata as Record<string, unknown>) ?? {},
    createdAt: app.createdAt.toISOString(),
    updatedAt: app.updatedAt.toISOString(),
  };
}

export function toIntegrationConfigResponse(config: {
  id: string;
  appId: string;
  integrationId: string;
  encryptedClientId: Buffer | Uint8Array | null;
  encryptedClientSecret: Buffer | Uint8Array | null;
  scopes: string[];
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
}): IntegrationConfigResponse {
  return {
    id: config.id,
    appId: config.appId,
    integrationId: config.integrationId,
    hasClientId: config.encryptedClientId !== null,
    hasClientSecret: config.encryptedClientSecret !== null,
    scopes: config.scopes,
    metadata: (config.metadata as Record<string, unknown>) ?? {},
    createdAt: config.createdAt.toISOString(),
    updatedAt: config.updatedAt.toISOString(),
  };
}

// =============================================================================
// Error Codes
// =============================================================================

export const AppErrorCodes = {
  APP_NOT_FOUND: 'APP_NOT_FOUND',
  APP_SLUG_CONFLICT: 'APP_SLUG_CONFLICT',
  APP_DISABLED: 'APP_DISABLED',
  APP_INTEGRATION_CONFIG_ERROR: 'APP_INTEGRATION_CONFIG_ERROR',
  INTEGRATION_CONFIG_NOT_FOUND: 'INTEGRATION_CONFIG_NOT_FOUND',
  INVALID_INPUT: 'INVALID_INPUT',
} as const;
