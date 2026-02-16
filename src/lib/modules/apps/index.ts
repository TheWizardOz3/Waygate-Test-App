/**
 * Apps Module
 *
 * Consuming applications with their own API keys and per-integration
 * OAuth app registrations for end-user auth delegation.
 */

// Errors
export {
  AppError,
  AppNotFoundError,
  AppSlugConflictError,
  AppIntegrationConfigError,
} from './app.errors';

// Schemas & Types
export {
  AppStatusSchema,
  AppBrandingSchema,
  AppMetadataSchema,
  CreateAppInputSchema,
  UpdateAppInputSchema,
  SetIntegrationConfigInputSchema,
  ListAppsQuerySchema,
  AppResponseSchema,
  AppWithKeyResponseSchema,
  IntegrationConfigResponseSchema,
  ListAppsResponseSchema,
  AppErrorCodes,
  toAppResponse,
  toIntegrationConfigResponse,
} from './app.schemas';
export type {
  AppStatus,
  AppBranding,
  AppMetadata,
  CreateAppInput,
  UpdateAppInput,
  SetIntegrationConfigInput,
  ListAppsQuery,
  AppFilters,
  AppResponse,
  AppWithKeyResponse,
  IntegrationConfigResponse,
  ListAppsResponse,
} from './app.schemas';

// Repository
export {
  createApp as repoCreateApp,
  findAppById,
  findAppByIdAndTenant,
  findAppByApiKeyIndex,
  findAppsByTenantId,
  isAppSlugTaken,
  updateApp as repoUpdateApp,
  updateAppApiKey,
  deleteApp as repoDeleteApp,
  findIntegrationConfig,
  findIntegrationConfigsByAppId,
  upsertIntegrationConfig,
  deleteIntegrationConfig as repoDeleteIntegrationConfig,
} from './app.repository';
export type {
  CreateAppDbInput,
  UpdateAppDbInput,
  AppPaginationOptions,
  PaginatedApps,
} from './app.repository';

// Service
export {
  createApp,
  getApp,
  listApps,
  updateApp,
  deleteApp,
  regenerateAppKey,
  setIntegrationConfig,
  getIntegrationConfig,
  getDecryptedIntegrationConfig,
  deleteIntegrationConfig,
} from './app.service';
