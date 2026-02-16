/**
 * AppUser Repository
 *
 * Data access layer for AppUser model.
 * Handles CRUD operations scoped to apps.
 */

import { prisma } from '@/lib/db/client';
import { Prisma } from '@prisma/client';

import type { AppUser } from '@prisma/client';

// =============================================================================
// Types
// =============================================================================

export interface CreateAppUserDbInput {
  appId: string;
  externalId: string;
  displayName?: string;
  email?: string;
  metadata?: Prisma.InputJsonValue;
}

export interface UpdateAppUserDbInput {
  displayName?: string | null;
  email?: string | null;
  metadata?: Prisma.InputJsonValue;
}

export interface AppUserPaginationOptions {
  cursor?: string;
  limit?: number;
}

export interface AppUserFilters {
  search?: string;
}

export interface PaginatedAppUsers {
  appUsers: AppUser[];
  nextCursor: string | null;
  totalCount: number;
}

// =============================================================================
// AppUser — FindOrCreate
// =============================================================================

/**
 * Finds an existing AppUser by appId + externalId, or creates one if not found.
 * Updates displayName/email if provided and the record already exists.
 */
export async function findOrCreateAppUser(input: CreateAppUserDbInput): Promise<AppUser> {
  const existing = await prisma.appUser.findFirst({
    where: {
      appId: input.appId,
      externalId: input.externalId,
    },
  });

  if (existing) {
    // Update displayName/email if new values are provided
    const needsUpdate =
      (input.displayName !== undefined && input.displayName !== existing.displayName) ||
      (input.email !== undefined && input.email !== existing.email);

    if (needsUpdate) {
      return prisma.appUser.update({
        where: { id: existing.id },
        data: {
          ...(input.displayName !== undefined && { displayName: input.displayName }),
          ...(input.email !== undefined && { email: input.email }),
        },
      });
    }

    return existing;
  }

  return prisma.appUser.create({
    data: {
      appId: input.appId,
      externalId: input.externalId,
      displayName: input.displayName,
      email: input.email,
      metadata: input.metadata ?? {},
    },
  });
}

// =============================================================================
// AppUser — Read
// =============================================================================

export async function findAppUserById(id: string): Promise<AppUser | null> {
  return prisma.appUser.findUnique({ where: { id } });
}

export async function findAppUserByIdAndApp(id: string, appId: string): Promise<AppUser | null> {
  return prisma.appUser.findFirst({
    where: { id, appId },
  });
}

export async function findAppUserByExternalId(
  appId: string,
  externalId: string
): Promise<AppUser | null> {
  return prisma.appUser.findFirst({
    where: { appId, externalId },
  });
}

export async function findAppUsersByAppId(
  appId: string,
  pagination: AppUserPaginationOptions = {},
  filters: AppUserFilters = {}
): Promise<PaginatedAppUsers> {
  const { cursor, limit = 20 } = pagination;

  const where: Prisma.AppUserWhereInput = { appId };

  if (filters.search) {
    where.OR = [
      { externalId: { contains: filters.search, mode: 'insensitive' } },
      { displayName: { contains: filters.search, mode: 'insensitive' } },
      { email: { contains: filters.search, mode: 'insensitive' } },
    ];
  }

  const totalCount = await prisma.appUser.count({ where });

  const appUsers = await prisma.appUser.findMany({
    where,
    take: limit + 1,
    orderBy: { createdAt: 'desc' },
    ...(cursor && {
      cursor: { id: cursor },
      skip: 1,
    }),
  });

  const hasMore = appUsers.length > limit;
  if (hasMore) {
    appUsers.pop();
  }

  const nextCursor = hasMore && appUsers.length > 0 ? appUsers[appUsers.length - 1].id : null;

  return { appUsers, nextCursor, totalCount };
}

// =============================================================================
// AppUser — Update
// =============================================================================

export async function updateAppUser(id: string, input: UpdateAppUserDbInput): Promise<AppUser> {
  const data: Prisma.AppUserUpdateInput = {};

  if (input.displayName !== undefined) data.displayName = input.displayName;
  if (input.email !== undefined) data.email = input.email;
  if (input.metadata !== undefined) data.metadata = input.metadata;

  return prisma.appUser.update({ where: { id }, data });
}

// =============================================================================
// AppUser — Delete
// =============================================================================

export async function deleteAppUser(id: string): Promise<AppUser> {
  return prisma.appUser.delete({ where: { id } });
}
