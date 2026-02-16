/**
 * App Service
 *
 * Business logic for app management including CRUD, API key lifecycle,
 * and per-app integration config (OAuth client credentials).
 */

import { AppStatus, Prisma } from '@prisma/client';
import { generateAppApiKey } from '@/lib/modules/auth/api-key';
import { encrypt, decrypt } from '@/lib/modules/credentials/encryption';
import {
  createApp as repoCreateApp,
  findAppByIdAndTenant,
  findAppsByTenantId,
  isAppSlugTaken,
  updateApp as repoUpdateApp,
  updateAppApiKey as repoUpdateAppApiKey,
  deleteApp as repoDeleteApp,
  findIntegrationConfig,
  upsertIntegrationConfig,
  deleteIntegrationConfig as repoDeleteIntegrationConfig,
  type CreateAppDbInput,
  type UpdateAppDbInput,
  type AppPaginationOptions,
} from './app.repository';
import {
  CreateAppInputSchema,
  UpdateAppInputSchema,
  SetIntegrationConfigInputSchema,
  ListAppsQuerySchema,
  toAppResponse,
  toIntegrationConfigResponse,
  type CreateAppInput,
  type UpdateAppInput,
  type SetIntegrationConfigInput,
  type ListAppsQuery,
  type AppFilters,
  type AppResponse,
  type AppWithKeyResponse,
  type IntegrationConfigResponse,
  type ListAppsResponse,
} from './app.schemas';
import {
  AppError,
  AppNotFoundError,
  AppSlugConflictError,
  AppIntegrationConfigError,
} from './app.errors';

// =============================================================================
// App — Create
// =============================================================================

/**
 * Creates a new app with a generated API key.
 * The plaintext API key is returned only on creation — it cannot be retrieved later.
 */
export async function createApp(
  tenantId: string,
  input: CreateAppInput
): Promise<AppWithKeyResponse> {
  const parsed = CreateAppInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new AppError('INVALID_INPUT', `Invalid app data: ${parsed.error.message}`);
  }

  const data = parsed.data;

  const slugExists = await isAppSlugTaken(tenantId, data.slug);
  if (slugExists) {
    throw new AppSlugConflictError(data.slug);
  }

  const { key, hash, index } = await generateAppApiKey();

  const dbInput: CreateAppDbInput = {
    tenantId,
    name: data.name,
    slug: data.slug,
    description: data.description,
    apiKeyHash: hash,
    apiKeyIndex: index,
    metadata: data.metadata as Prisma.InputJsonValue,
  };

  const app = await repoCreateApp(dbInput);

  return {
    ...toAppResponse(app),
    apiKey: key,
  };
}

// =============================================================================
// App — Read
// =============================================================================

/**
 * Gets an app by ID with tenant verification.
 */
export async function getApp(id: string, tenantId: string): Promise<AppResponse> {
  const app = await findAppByIdAndTenant(id, tenantId);
  if (!app) {
    throw new AppNotFoundError(id);
  }
  return toAppResponse(app);
}

/**
 * Lists apps with pagination and filters.
 */
export async function listApps(
  tenantId: string,
  query: Partial<ListAppsQuery> = {}
): Promise<ListAppsResponse> {
  const parsed = ListAppsQuerySchema.safeParse(query);
  if (!parsed.success) {
    throw new AppError('INVALID_INPUT', `Invalid query parameters: ${parsed.error.message}`);
  }

  const { cursor, limit, status, search } = parsed.data;
  const pagination: AppPaginationOptions = { cursor, limit };
  const filters: AppFilters = { status, search };

  const result = await findAppsByTenantId(tenantId, pagination, filters);

  return {
    apps: result.apps.map(toAppResponse),
    pagination: {
      cursor: result.nextCursor,
      hasMore: result.nextCursor !== null,
      totalCount: result.totalCount,
    },
  };
}

// =============================================================================
// App — Update
// =============================================================================

/**
 * Updates an app's mutable fields.
 */
export async function updateApp(
  id: string,
  tenantId: string,
  input: UpdateAppInput
): Promise<AppResponse> {
  const parsed = UpdateAppInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new AppError('INVALID_INPUT', `Invalid update data: ${parsed.error.message}`);
  }

  const data = parsed.data;

  const existing = await findAppByIdAndTenant(id, tenantId);
  if (!existing) {
    throw new AppNotFoundError(id);
  }

  if (data.slug && data.slug !== existing.slug) {
    const slugExists = await isAppSlugTaken(tenantId, data.slug, id);
    if (slugExists) {
      throw new AppSlugConflictError(data.slug);
    }
  }

  const dbInput: UpdateAppDbInput = {
    name: data.name,
    slug: data.slug,
    description: data.description,
    status: data.status as AppStatus | undefined,
    metadata: data.metadata as Prisma.InputJsonValue | undefined,
  };

  const updated = await repoUpdateApp(id, dbInput);
  return toAppResponse(updated);
}

// =============================================================================
// App — Delete
// =============================================================================

/**
 * Deletes an app and all associated data (cascading).
 */
export async function deleteApp(id: string, tenantId: string): Promise<void> {
  const existing = await findAppByIdAndTenant(id, tenantId);
  if (!existing) {
    throw new AppNotFoundError(id);
  }
  await repoDeleteApp(id);
}

// =============================================================================
// App — API Key Management
// =============================================================================

/**
 * Regenerates an app's API key. The old key is immediately invalidated.
 * Returns the new plaintext key (shown only once).
 */
export async function regenerateAppKey(id: string, tenantId: string): Promise<{ apiKey: string }> {
  const existing = await findAppByIdAndTenant(id, tenantId);
  if (!existing) {
    throw new AppNotFoundError(id);
  }

  const { key, hash, index } = await generateAppApiKey();
  await repoUpdateAppApiKey(id, hash, index);

  return { apiKey: key };
}

// =============================================================================
// Integration Config — CRUD
// =============================================================================

/**
 * Sets (creates or updates) an app's integration config with encrypted OAuth credentials.
 */
export async function setIntegrationConfig(
  appId: string,
  integrationId: string,
  tenantId: string,
  input: SetIntegrationConfigInput
): Promise<IntegrationConfigResponse> {
  const parsed = SetIntegrationConfigInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new AppIntegrationConfigError(`Invalid integration config: ${parsed.error.message}`);
  }

  const data = parsed.data;

  // Verify app belongs to tenant
  const app = await findAppByIdAndTenant(appId, tenantId);
  if (!app) {
    throw new AppNotFoundError(appId);
  }

  const encryptedClientId = encrypt(data.clientId);
  const encryptedClientSecret = encrypt(data.clientSecret);

  const config = await upsertIntegrationConfig({
    appId,
    integrationId,
    encryptedClientId,
    encryptedClientSecret,
    scopes: data.scopes,
    metadata: data.metadata as Prisma.InputJsonValue,
  });

  return toIntegrationConfigResponse(config);
}

/**
 * Gets an app's integration config (without decrypted secrets).
 */
export async function getIntegrationConfig(
  appId: string,
  integrationId: string,
  tenantId: string
): Promise<IntegrationConfigResponse> {
  const app = await findAppByIdAndTenant(appId, tenantId);
  if (!app) {
    throw new AppNotFoundError(appId);
  }

  const config = await findIntegrationConfig(appId, integrationId);
  if (!config) {
    throw new AppIntegrationConfigError(
      `No integration config found for app '${appId}' and integration '${integrationId}'`,
      404
    );
  }

  return toIntegrationConfigResponse(config);
}

/**
 * Decrypts and returns the OAuth client credentials from an app's integration config.
 * Used internally by the OAuth flow — never exposed via API.
 */
export async function getDecryptedIntegrationConfig(
  appId: string,
  integrationId: string
): Promise<{ clientId: string; clientSecret: string; scopes: string[] } | null> {
  const config = await findIntegrationConfig(appId, integrationId);
  if (!config || !config.encryptedClientId || !config.encryptedClientSecret) {
    return null;
  }

  const clientId = decrypt(Buffer.from(config.encryptedClientId));
  const clientSecret = decrypt(Buffer.from(config.encryptedClientSecret));

  return { clientId, clientSecret, scopes: config.scopes };
}

/**
 * Removes an app's integration config.
 */
export async function deleteIntegrationConfig(
  appId: string,
  integrationId: string,
  tenantId: string
): Promise<void> {
  const app = await findAppByIdAndTenant(appId, tenantId);
  if (!app) {
    throw new AppNotFoundError(appId);
  }

  const config = await findIntegrationConfig(appId, integrationId);
  if (!config) {
    throw new AppIntegrationConfigError(
      `No integration config found for app '${appId}' and integration '${integrationId}'`,
      404
    );
  }

  await repoDeleteIntegrationConfig(appId, integrationId);
}
