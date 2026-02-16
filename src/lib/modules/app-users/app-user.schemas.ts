/**
 * AppUser Schemas
 *
 * Zod schemas for app user validation, CRUD operations,
 * and API response types.
 */

import { z } from 'zod';

// =============================================================================
// Input Schemas
// =============================================================================

export const CreateAppUserSchema = z.object({
  externalId: z.string().min(1).max(255),
  displayName: z.string().max(255).optional(),
  email: z.string().email().max(255).optional(),
  metadata: z.record(z.string(), z.unknown()).optional().default({}),
});
export type CreateAppUserInput = z.infer<typeof CreateAppUserSchema>;

export const UpdateAppUserSchema = z.object({
  displayName: z.string().max(255).nullable().optional(),
  email: z.string().email().max(255).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type UpdateAppUserInput = z.infer<typeof UpdateAppUserSchema>;

// =============================================================================
// Query Schemas
// =============================================================================

export const ListAppUsersParamsSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
});
export type ListAppUsersParams = z.infer<typeof ListAppUsersParamsSchema>;

// =============================================================================
// API Response Schemas
// =============================================================================

export const AppUserResponseSchema = z.object({
  id: z.string().uuid(),
  appId: z.string().uuid(),
  externalId: z.string(),
  displayName: z.string().nullable(),
  email: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type AppUserResponse = z.infer<typeof AppUserResponseSchema>;

export const ListAppUsersResponseSchema = z.object({
  appUsers: z.array(AppUserResponseSchema),
  pagination: z.object({
    cursor: z.string().nullable(),
    hasMore: z.boolean(),
    totalCount: z.number().int(),
  }),
});
export type ListAppUsersResponse = z.infer<typeof ListAppUsersResponseSchema>;

// =============================================================================
// Response Helpers
// =============================================================================

export function toAppUserResponse(appUser: {
  id: string;
  appId: string;
  externalId: string;
  displayName: string | null;
  email: string | null;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
}): AppUserResponse {
  return {
    id: appUser.id,
    appId: appUser.appId,
    externalId: appUser.externalId,
    displayName: appUser.displayName,
    email: appUser.email,
    metadata: (appUser.metadata as Record<string, unknown>) ?? {},
    createdAt: appUser.createdAt.toISOString(),
    updatedAt: appUser.updatedAt.toISOString(),
  };
}

// =============================================================================
// Error Codes
// =============================================================================

export const AppUserErrorCodes = {
  APP_USER_NOT_FOUND: 'APP_USER_NOT_FOUND',
  INVALID_INPUT: 'INVALID_INPUT',
} as const;
