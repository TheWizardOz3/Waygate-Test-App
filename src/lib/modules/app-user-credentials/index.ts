/**
 * AppUserCredentials Module
 *
 * End-user credential management for consuming apps. Stores per-user tokens
 * (OAuth2, API key, etc.) encrypted under a Connection, enabling the
 * "user connects their own account" flow.
 */

// Errors
export {
  AppUserCredentialError,
  AppUserCredentialNotFoundError,
} from './app-user-credential.errors';

// Schemas & Types
export {
  ListUserCredentialsParamsSchema,
  AppUserCredentialResponseSchema,
  ListUserCredentialsResponseSchema,
  AppUserCredentialErrorCodes,
  toAppUserCredentialResponse,
} from './app-user-credential.schemas';
export type {
  ListUserCredentialsParams,
  AppUserCredentialResponse,
  ListUserCredentialsResponse,
} from './app-user-credential.schemas';

// Repository
export {
  createAppUserCredential,
  findByConnectionAndUser,
  findAppUserCredentialById,
  findByConnectionId,
  findByAppUserId,
  findByAppUserIdWithConnections,
  updateAppUserCredential,
  revokeAppUserCredential,
  markNeedsReauth,
  findExpiringCredentials,
  countByStatusForConnection,
  countByStatusForApp,
  findExpiringCredentialsWithRelations,
} from './app-user-credential.repository';
export type {
  CreateAppUserCredentialInput,
  UpdateAppUserCredentialInput,
  AppUserCredentialPaginationOptions,
  AppUserCredentialFilters,
  PaginatedAppUserCredentials,
  UserCredentialWithRelations,
  UserCredentialWithConnectionInfo,
  AppCredentialStatsResult,
  AppCredentialStatsConnection,
} from './app-user-credential.repository';

// Service
export {
  storeUserCredential,
  getDecryptedUserCredential,
  getDecryptedUserCredentialById,
  listUserCredentials,
  revokeUserCredential,
  refreshUserCredential,
  flagUserCredentialForReauth,
  findExpiringUserCredentials,
  getUserCredentialStats,
  getAppCredentialStats,
} from './app-user-credential.service';
export type { DecryptedAppUserCredential } from './app-user-credential.service';
