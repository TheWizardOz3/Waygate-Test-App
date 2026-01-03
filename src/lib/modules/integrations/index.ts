/**
 * Integrations Module
 *
 * Manages integration definitions - configured connections to external APIs.
 * Provides CRUD operations with tenant isolation and validation.
 */

// =============================================================================
// Schemas & Types
// =============================================================================

export {
  // Enums
  AuthTypeSchema,
  IntegrationStatusSchema,
  // Config schemas
  OAuth2ConfigSchema,
  ApiKeyConfigSchema,
  BaseUrlConfigSchema,
  AuthConfigSchema,
  // CRUD schemas
  CreateIntegrationInputSchema,
  UpdateIntegrationInputSchema,
  // Query schemas
  IntegrationFiltersSchema,
  ListIntegrationsQuerySchema,
  // Response schemas
  IntegrationResponseSchema,
  ListIntegrationsResponseSchema,
  IntegrationSummarySchema,
  // Helper functions
  toIntegrationResponse,
  // Error codes
  IntegrationErrorCodes,
} from './integration.schemas';

export type {
  AuthType,
  IntegrationStatus,
  AuthConfig,
  CreateIntegrationInput,
  UpdateIntegrationInput,
  IntegrationFilters,
  ListIntegrationsQuery,
  IntegrationResponse,
  ListIntegrationsResponse,
  IntegrationSummary,
} from './integration.schemas';

// =============================================================================
// Repository (Data Access)
// =============================================================================

export {
  createIntegration as createIntegrationDb,
  findIntegrationById,
  findIntegrationByIdAndTenant,
  findIntegrationBySlug,
  findIntegrationBySlugWithCounts,
  findIntegrationsPaginated,
  findAllIntegrationsForTenant,
  findIntegrationsWithCounts,
  isSlugTaken,
  updateIntegration as updateIntegrationDb,
  updateIntegrationStatus,
  deleteIntegration as deleteIntegrationDb,
  disableIntegration as disableIntegrationDb,
  getIntegrationCountsByStatus,
} from './integration.repository';

export type {
  CreateIntegrationDbInput,
  UpdateIntegrationDbInput,
  IntegrationPaginationOptions,
  PaginatedIntegrations,
  IntegrationWithCounts,
} from './integration.repository';

// =============================================================================
// Service (Business Logic)
// =============================================================================

export {
  // Error class
  IntegrationError,
  // Create
  createIntegration,
  // Read
  getIntegrationById,
  getIntegrationBySlug,
  getIntegrationBySlugRaw,
  getIntegrationByIdRaw,
  listIntegrations,
  getAllIntegrations,
  getIntegrationsWithCounts,
  // Update
  updateIntegration,
  activateIntegration,
  markIntegrationError,
  // Delete
  deleteIntegration,
  disableIntegration,
  // Stats
  getIntegrationStats,
  // Health
  checkHealth,
} from './integration.service';
