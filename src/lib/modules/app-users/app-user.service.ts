/**
 * AppUser Service
 *
 * Business logic for end-user identity management within consuming apps.
 * AppUsers are lazily created — first reference to an externalId creates the record.
 * Waygate does not authenticate end-users; the consuming app owns identity.
 */

import { Prisma } from '@prisma/client';
import { findAppByIdAndTenant } from '@/lib/modules/apps/app.repository';
import { AppNotFoundError } from '@/lib/modules/apps/app.errors';
import {
  findOrCreateAppUser,
  findAppUserByIdAndApp,
  findAppUserByExternalId,
  findAppUsersByAppId,
  updateAppUser as repoUpdateAppUser,
  deleteAppUser as repoDeleteAppUser,
  type AppUserPaginationOptions,
  type AppUserFilters,
} from './app-user.repository';
import {
  UpdateAppUserSchema,
  ListAppUsersParamsSchema,
  toAppUserResponse,
  type UpdateAppUserInput,
  type ListAppUsersParams,
  type AppUserResponse,
  type ListAppUsersResponse,
} from './app-user.schemas';
import { AppUserError, AppUserNotFoundError } from './app-user.errors';

// =============================================================================
// AppUser — Resolve (Find-or-Create)
// =============================================================================

/**
 * Resolves an AppUser by externalId within an app.
 * Creates the AppUser if it doesn't exist (lazy creation).
 * Updates displayName/email if provided and the record exists.
 *
 * This is the primary entry point used by connect sessions and action invocations.
 * The app is assumed to be already verified by the caller.
 */
export async function resolveAppUser(
  appId: string,
  externalId: string,
  userData?: { displayName?: string; email?: string }
): Promise<AppUserResponse> {
  const appUser = await findOrCreateAppUser({
    appId,
    externalId,
    displayName: userData?.displayName,
    email: userData?.email,
  });

  return toAppUserResponse(appUser);
}

// =============================================================================
// AppUser — Read
// =============================================================================

/**
 * Gets an AppUser by ID with app and tenant verification.
 */
export async function getAppUser(
  id: string,
  appId: string,
  tenantId: string
): Promise<AppUserResponse> {
  const app = await findAppByIdAndTenant(appId, tenantId);
  if (!app) {
    throw new AppNotFoundError(appId);
  }

  const appUser = await findAppUserByIdAndApp(id, appId);
  if (!appUser) {
    throw new AppUserNotFoundError(id);
  }

  return toAppUserResponse(appUser);
}

/**
 * Gets an AppUser by externalId with app and tenant verification.
 */
export async function getAppUserByExternalId(
  appId: string,
  externalId: string,
  tenantId: string
): Promise<AppUserResponse> {
  const app = await findAppByIdAndTenant(appId, tenantId);
  if (!app) {
    throw new AppNotFoundError(appId);
  }

  const appUser = await findAppUserByExternalId(appId, externalId);
  if (!appUser) {
    throw new AppUserNotFoundError(externalId);
  }

  return toAppUserResponse(appUser);
}

/**
 * Lists AppUsers for an app with pagination and search.
 */
export async function listAppUsers(
  appId: string,
  tenantId: string,
  query: Partial<ListAppUsersParams> = {}
): Promise<ListAppUsersResponse> {
  const app = await findAppByIdAndTenant(appId, tenantId);
  if (!app) {
    throw new AppNotFoundError(appId);
  }

  const parsed = ListAppUsersParamsSchema.safeParse(query);
  if (!parsed.success) {
    throw new AppUserError('INVALID_INPUT', `Invalid query parameters: ${parsed.error.message}`);
  }

  const { cursor, limit, search } = parsed.data;
  const pagination: AppUserPaginationOptions = { cursor, limit };
  const filters: AppUserFilters = { search };

  const result = await findAppUsersByAppId(appId, pagination, filters);

  return {
    appUsers: result.appUsers.map(toAppUserResponse),
    pagination: {
      cursor: result.nextCursor,
      hasMore: result.nextCursor !== null,
      totalCount: result.totalCount,
    },
  };
}

// =============================================================================
// AppUser — Update
// =============================================================================

/**
 * Updates an AppUser's mutable fields.
 */
export async function updateAppUser(
  id: string,
  appId: string,
  tenantId: string,
  input: UpdateAppUserInput
): Promise<AppUserResponse> {
  const parsed = UpdateAppUserSchema.safeParse(input);
  if (!parsed.success) {
    throw new AppUserError('INVALID_INPUT', `Invalid update data: ${parsed.error.message}`);
  }

  const app = await findAppByIdAndTenant(appId, tenantId);
  if (!app) {
    throw new AppNotFoundError(appId);
  }

  const existing = await findAppUserByIdAndApp(id, appId);
  if (!existing) {
    throw new AppUserNotFoundError(id);
  }

  const data = parsed.data;
  const updated = await repoUpdateAppUser(id, {
    displayName: data.displayName,
    email: data.email,
    metadata: data.metadata as Prisma.InputJsonValue | undefined,
  });

  return toAppUserResponse(updated);
}

// =============================================================================
// AppUser — Delete
// =============================================================================

/**
 * Deletes an AppUser and all associated credentials (cascading).
 */
export async function deleteAppUser(id: string, appId: string, tenantId: string): Promise<void> {
  const app = await findAppByIdAndTenant(appId, tenantId);
  if (!app) {
    throw new AppNotFoundError(appId);
  }

  const existing = await findAppUserByIdAndApp(id, appId);
  if (!existing) {
    throw new AppUserNotFoundError(id);
  }

  await repoDeleteAppUser(id);
}
