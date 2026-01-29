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
  IntegrationConnectionHealthSummarySchema,
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
  IntegrationConnectionHealthSummary,
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
  findIntegrationsWithCountsAndHealth,
  getIntegrationConnectionHealthSummary,
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
  IntegrationWithCountsAndHealth,
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
  getIntegrationsWithCountsAndHealth,
  getIntegrationHealthSummary,
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
