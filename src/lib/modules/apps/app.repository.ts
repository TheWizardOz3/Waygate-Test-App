/**
 * App Repository
 *
 * Data access layer for App and AppIntegrationConfig models.
 * Handles CRUD operations scoped to tenants.
 */

import { prisma } from '@/lib/db/client';
import { AppStatus, Prisma } from '@prisma/client';

import type { App, AppIntegrationConfig } from '@prisma/client';
import type { AppFilters } from './app.schemas';

// =============================================================================
// Types
// =============================================================================

export interface CreateAppDbInput {
  tenantId: string;
  name: string;
  slug: string;
  description?: string;
  apiKeyHash: string;
  apiKeyIndex: string;
  status?: AppStatus;
  metadata?: Prisma.InputJsonValue;
}

export interface UpdateAppDbInput {
  name?: string;
  slug?: string;
  description?: string | null;
  status?: AppStatus;
  metadata?: Prisma.InputJsonValue;
}

export interface AppPaginationOptions {
  cursor?: string;
  limit?: number;
}

export interface PaginatedApps {
  apps: App[];
  nextCursor: string | null;
  totalCount: number;
}

// =============================================================================
// App — Create
// =============================================================================

export async function createApp(input: CreateAppDbInput): Promise<App> {
  return prisma.app.create({
    data: {
      tenantId: input.tenantId,
      name: input.name,
      slug: input.slug,
      description: input.description,
      apiKeyHash: input.apiKeyHash,
      apiKeyIndex: input.apiKeyIndex,
      status: input.status ?? AppStatus.active,
      metadata: input.metadata ?? {},
    },
  });
}

// =============================================================================
// App — Read
// =============================================================================

export async function findAppById(id: string): Promise<App | null> {
  return prisma.app.findUnique({ where: { id } });
}

export async function findAppByIdAndTenant(id: string, tenantId: string): Promise<App | null> {
  return prisma.app.findFirst({
    where: { id, tenantId },
  });
}

export async function findAppByApiKeyIndex(apiKeyIndex: string): Promise<
  | (App & {
      tenant: { id: string; name: string; waygateApiKeyHash: string };
    })
  | null
> {
  return prisma.app.findUnique({
    where: { apiKeyIndex },
    include: {
      tenant: {
        select: { id: true, name: true, waygateApiKeyHash: true },
      },
    },
  });
}

export async function findAppsByTenantId(
  tenantId: string,
  pagination: AppPaginationOptions = {},
  filters: AppFilters = {}
): Promise<PaginatedApps> {
  const { cursor, limit = 20 } = pagination;

  const where: Prisma.AppWhereInput = { tenantId };

  if (filters.status) {
    where.status = filters.status as AppStatus;
  }

  if (filters.search) {
    where.OR = [
      { name: { contains: filters.search, mode: 'insensitive' } },
      { slug: { contains: filters.search, mode: 'insensitive' } },
      { description: { contains: filters.search, mode: 'insensitive' } },
    ];
  }

  const totalCount = await prisma.app.count({ where });

  const apps = await prisma.app.findMany({
    where,
    take: limit + 1,
    orderBy: { createdAt: 'desc' },
    ...(cursor && {
      cursor: { id: cursor },
      skip: 1,
    }),
  });

  const hasMore = apps.length > limit;
  if (hasMore) {
    apps.pop();
  }

  const nextCursor = hasMore && apps.length > 0 ? apps[apps.length - 1].id : null;

  return { apps, nextCursor, totalCount };
}

export async function isAppSlugTaken(
  tenantId: string,
  slug: string,
  excludeId?: string
): Promise<boolean> {
  const existing = await prisma.app.findFirst({
    where: {
      tenantId,
      slug,
      ...(excludeId && { id: { not: excludeId } }),
    },
    select: { id: true },
  });
  return existing !== null;
}

// =============================================================================
// App — Update
// =============================================================================

export async function updateApp(id: string, input: UpdateAppDbInput): Promise<App> {
  const data: Prisma.AppUpdateInput = {};

  if (input.name !== undefined) data.name = input.name;
  if (input.slug !== undefined) data.slug = input.slug;
  if (input.description !== undefined) data.description = input.description;
  if (input.status !== undefined) data.status = input.status;
  if (input.metadata !== undefined) data.metadata = input.metadata;

  return prisma.app.update({ where: { id }, data });
}

export async function updateAppApiKey(
  id: string,
  apiKeyHash: string,
  apiKeyIndex: string
): Promise<App> {
  return prisma.app.update({
    where: { id },
    data: { apiKeyHash, apiKeyIndex },
  });
}

// =============================================================================
// App — Delete
// =============================================================================

export async function deleteApp(id: string): Promise<App> {
  return prisma.app.delete({ where: { id } });
}

// =============================================================================
// AppIntegrationConfig — CRUD
// =============================================================================

export async function findIntegrationConfig(
  appId: string,
  integrationId: string
): Promise<AppIntegrationConfig | null> {
  return prisma.appIntegrationConfig.findUnique({
    where: { appId_integrationId: { appId, integrationId } },
  });
}

export async function findIntegrationConfigsByAppId(
  appId: string
): Promise<AppIntegrationConfig[]> {
  return prisma.appIntegrationConfig.findMany({
    where: { appId },
    orderBy: { createdAt: 'desc' },
  });
}

export async function upsertIntegrationConfig(input: {
  appId: string;
  integrationId: string;
  encryptedClientId: Buffer | null;
  encryptedClientSecret: Buffer | null;
  scopes: string[];
  metadata?: Prisma.InputJsonValue;
}): Promise<AppIntegrationConfig> {
  return prisma.appIntegrationConfig.upsert({
    where: {
      appId_integrationId: {
        appId: input.appId,
        integrationId: input.integrationId,
      },
    },
    create: {
      appId: input.appId,
      integrationId: input.integrationId,
      encryptedClientId: input.encryptedClientId ? new Uint8Array(input.encryptedClientId) : null,
      encryptedClientSecret: input.encryptedClientSecret
        ? new Uint8Array(input.encryptedClientSecret)
        : null,
      scopes: input.scopes,
      metadata: input.metadata ?? {},
    },
    update: {
      encryptedClientId: input.encryptedClientId ? new Uint8Array(input.encryptedClientId) : null,
      encryptedClientSecret: input.encryptedClientSecret
        ? new Uint8Array(input.encryptedClientSecret)
        : null,
      scopes: input.scopes,
      metadata: input.metadata ?? {},
    },
  });
}

export async function deleteIntegrationConfig(
  appId: string,
  integrationId: string
): Promise<AppIntegrationConfig> {
  return prisma.appIntegrationConfig.delete({
    where: { appId_integrationId: { appId, integrationId } },
  });
}
