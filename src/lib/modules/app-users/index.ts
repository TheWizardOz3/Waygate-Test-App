/**
 * AppUsers Module
 *
 * End-user identity within consuming apps. AppUsers are lazily created
 * when a connect session or action invocation references a new externalId.
 * Waygate does not authenticate end-users — the consuming app owns identity.
 */

// Errors
export { AppUserError, AppUserNotFoundError } from './app-user.errors';

// Schemas & Types
export {
  CreateAppUserSchema,
  UpdateAppUserSchema,
  ListAppUsersParamsSchema,
  AppUserResponseSchema,
  ListAppUsersResponseSchema,
  AppUserErrorCodes,
  toAppUserResponse,
} from './app-user.schemas';
export type {
  CreateAppUserInput,
  UpdateAppUserInput,
  ListAppUsersParams,
  AppUserResponse,
  ListAppUsersResponse,
} from './app-user.schemas';

// Repository
export {
  findOrCreateAppUser,
  findAppUserById,
  findAppUserByIdAndApp,
  findAppUserByExternalId,
  findAppUsersByAppId,
  updateAppUser as repoUpdateAppUser,
  deleteAppUser as repoDeleteAppUser,
} from './app-user.repository';
export type {
  CreateAppUserDbInput,
  UpdateAppUserDbInput,
  AppUserPaginationOptions,
  AppUserFilters,
  PaginatedAppUsers,
} from './app-user.repository';

// Service
export {
  resolveAppUser,
  getAppUser,
  getAppUserByExternalId,
  listAppUsers,
  updateAppUser,
  deleteAppUser,
} from './app-user.service';
