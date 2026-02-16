/**
 * Connections Module
 *
 * Manages connections - links between consuming apps and integrations.
 * Each connection has its own credentials and configuration.
 * Enables multi-app support with credential isolation.
 */

// =============================================================================
// Schemas & Types
// =============================================================================

export {
  // Enums
  ConnectionStatusSchema,
  ConnectorTypeSchema,
  // CRUD schemas
  CreateConnectionInputSchema,
  UpdateConnectionInputSchema,
  // Query schemas
  ConnectionFiltersSchema,
  ListConnectionsQuerySchema,
  // Response schemas
  ConnectionResponseSchema,
  ConnectionWithCredentialStatusSchema,
  ListConnectionsResponseSchema,
  // Helper functions
  toConnectionResponse,
  // Error codes
  ConnectionErrorCodes,
} from './connection.schemas';

export type {
  ConnectionStatus,
  ConnectorType,
  CreateConnectionInput,
  UpdateConnectionInput,
  ConnectionFilters,
  ListConnectionsQuery,
  ConnectionResponse,
  ConnectionWithCredentialStatus,
  ListConnectionsResponse,
} from './connection.schemas';

// =============================================================================
// Repository (Data Access)
// =============================================================================

export {
  createConnection as createConnectionDb,
  createDefaultConnectionIfNeeded,
  findConnectionById,
  findConnectionByIdAndTenant,
  findConnectionBySlug,
  findPrimaryConnection,
  findFirstActiveConnection,
  findActiveConnectionForApp,
  findConnectionsPaginated,
  findAllConnectionsForIntegration,
  findConnectionsWithCounts,
  isSlugTaken as isConnectionSlugTaken,
  countConnectionsForIntegration,
  updateConnection as updateConnectionDb,
  updateConnectionStatus,
  setConnectionAsPrimary as setConnectionAsPrimaryDb,
  deleteConnection as deleteConnectionDb,
  disableConnection as disableConnectionDb,
  getConnectionCountsByStatus,
} from './connection.repository';

export type {
  CreateConnectionDbInput,
  UpdateConnectionDbInput,
  ConnectionPaginationOptions,
  PaginatedConnections,
  ConnectionWithCounts,
} from './connection.repository';

// =============================================================================
// Service (Business Logic)
// =============================================================================

export {
  // Error class
  ConnectionError,
  // Create
  createConnection,
  ensureDefaultConnection,
  // Read
  getConnectionById,
  getConnectionByIdRaw,
  getConnectionBySlug,
  getPrimaryConnection,
  getDefaultConnection,
  resolveConnection,
  resolveAppConnection,
  listConnections,
  getAllConnections,
  getConnectionsWithCounts,
  // Update
  updateConnection,
  setAsPrimary,
  markConnectionError,
  // Delete
  deleteConnection,
  disableConnection,
  // Stats
  getConnectionStats,
} from './connection.service';
