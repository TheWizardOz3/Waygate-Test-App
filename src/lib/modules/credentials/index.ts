// Credentials module - secure credential management
// Encryption, token storage, refresh logic

// Encryption utilities
export {
  encrypt,
  decrypt,
  encryptJson,
  decryptJson,
  generateEncryptionKey,
  EncryptionError,
} from './encryption';

// Repository (data access)
export {
  createCredential,
  findCredentialById,
  findCredentialByIdAndTenant,
  findActiveCredentialForIntegration,
  findCredentialsByIntegration,
  findCredentialsByTenant,
  findExpiringCredentials,
  findExpiringOAuth2Credentials,
  updateCredential,
  updateCredentialForTenant,
  updateCredentialWithOptimisticLock,
  revokeCredential,
  markCredentialNeedsReauth,
  markCredentialExpired,
  deleteCredential,
  deleteCredentialsByIntegration,
  countCredentialsByStatus,
  tryAcquireRefreshLock,
  releaseRefreshLock,
} from './credential.repository';

export type {
  CreateCredentialInput,
  UpdateCredentialInput,
  CredentialFilters,
  CredentialWithIntegration,
  OptimisticUpdateResult,
} from './credential.repository';

// Service (business logic)
export {
  CredentialError,
  storeOAuth2Credential,
  storeApiKeyCredential,
  storeBasicCredential,
  storeBearerCredential,
  getDecryptedCredential,
  getDecryptedCredentialById,
  getCredentialStatus,
  getCredentialStatuses,
  updateOAuth2Tokens,
  revokeCredential as revokeCredentialForTenant,
  flagCredentialForReauth,
  isCredentialExpired,
  needsRefresh,
  isOAuth2Credential,
  isApiKeyCredential,
  isBasicCredential,
  isBearerCredential,
  isCustomHeaderCredential,
} from './credential.service';

export type { DecryptedCredential } from './credential.service';

// Schemas
export {
  OAuth2CredentialSchema,
  ApiKeyCredentialSchema,
  BasicCredentialSchema,
  BearerCredentialSchema,
  CustomHeaderCredentialSchema,
  CredentialSchemaMap,
  CredentialStatusSchema,
  StoreOAuth2CredentialInputSchema,
  StoreApiKeyCredentialInputSchema,
  StoreBasicCredentialInputSchema,
  StoreBearerCredentialInputSchema,
  StoreCustomHeaderCredentialInputSchema,
} from './credential.schemas';

export type {
  OAuth2CredentialData,
  ApiKeyCredentialData,
  BasicCredentialData,
  BearerCredentialData,
  CustomHeaderCredentialData,
  CredentialData,
  CredentialStatus,
  StoreOAuth2CredentialInput,
  StoreApiKeyCredentialInput,
  StoreBasicCredentialInput,
  StoreBearerCredentialInput,
  StoreCustomHeaderCredentialInput,
} from './credential.schemas';

// Token Refresh Service
export {
  refreshExpiringTokens,
  refreshSingleCredential,
  refreshCredentialManually,
  getOAuthProviderForIntegration,
  handleRefreshResult,
  logBatchRefreshSummary,
  DEFAULT_BUFFER_MINUTES,
  MAX_RETRY_ATTEMPTS,
  BASE_BACKOFF_MS,
} from './token-refresh.service';

export type { RefreshResult, RefreshBatchResult, TokenRefreshEvent } from './token-refresh.service';
