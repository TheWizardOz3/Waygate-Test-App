/**
 * Connection Schemas
 *
 * Zod schemas for connection validation, CRUD operations, and API responses.
 * Connections link consuming apps to integrations with separate credentials.
 */

import { z } from 'zod';

// =============================================================================
// Enums
// =============================================================================

/**
 * Connection status
 */
export const ConnectionStatusSchema = z.enum(['active', 'error', 'disabled']);
export type ConnectionStatus = z.infer<typeof ConnectionStatusSchema>;

/**
 * Health check status - overall health of the connection
 */
export const HealthCheckStatusSchema = z.enum(['healthy', 'degraded', 'unhealthy']);
export type HealthCheckStatus = z.infer<typeof HealthCheckStatusSchema>;

/**
 * Connector type - determines whether connection uses Waygate's OAuth app or custom credentials
 * - platform: Uses Waygate's registered OAuth app (one-click connect)
 * - custom: User provides their own OAuth app credentials
 */
export const ConnectorTypeSchema = z.enum(['platform', 'custom']);
export type ConnectorType = z.infer<typeof ConnectorTypeSchema>;

// =============================================================================
// Connection CRUD Schemas
// =============================================================================

/**
 * Input for creating a new connection
 */
export const CreateConnectionInputSchema = z
  .object({
    name: z.string().min(1).max(255),
    slug: z
      .string()
      .min(1)
      .max(100)
      .regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens'),
    appId: z.string().uuid().optional().nullable(),
    baseUrl: z.string().url().optional().nullable(),
    isPrimary: z.boolean().optional().default(false),
    connectorType: ConnectorTypeSchema.optional().default('custom'),
    platformConnectorSlug: z.string().min(1).max(100).optional(),
    metadata: z.record(z.string(), z.unknown()).optional().default({}),
  })
  .refine(
    (data) => {
      // If connectorType is 'platform', platformConnectorSlug is required
      if (data.connectorType === 'platform' && !data.platformConnectorSlug) {
        return false;
      }
      return true;
    },
    {
      message: "platformConnectorSlug is required when connectorType is 'platform'",
      path: ['platformConnectorSlug'],
    }
  )
  .refine(
    (data) => {
      // If connectorType is 'custom', platformConnectorSlug should not be provided
      if (data.connectorType === 'custom' && data.platformConnectorSlug) {
        return false;
      }
      return true;
    },
    {
      message: "platformConnectorSlug should not be provided when connectorType is 'custom'",
      path: ['platformConnectorSlug'],
    }
  );

export type CreateConnectionInput = z.infer<typeof CreateConnectionInputSchema>;

/**
 * Input for updating a connection
 */
export const UpdateConnectionInputSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  slug: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens')
    .optional(),
  baseUrl: z.string().url().nullable().optional(),
  isPrimary: z.boolean().optional(),
  status: ConnectionStatusSchema.optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  // LLM Response Preamble
  preambleTemplate: z.string().max(500).nullable().optional(),
});

export type UpdateConnectionInput = z.infer<typeof UpdateConnectionInputSchema>;

// =============================================================================
// Query Schemas
// =============================================================================

/**
 * Filters for querying connections
 */
export const ConnectionFiltersSchema = z.object({
  status: ConnectionStatusSchema.optional(),
  isPrimary: z.boolean().optional(),
  search: z.string().optional(),
});

export type ConnectionFilters = z.infer<typeof ConnectionFiltersSchema>;

/**
 * Query parameters for listing connections (API)
 */
export const ListConnectionsQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: ConnectionStatusSchema.optional(),
  isPrimary: z
    .string()
    .optional()
    .transform((val) => (val === 'true' ? true : val === 'false' ? false : undefined)),
  search: z.string().optional(),
});

export type ListConnectionsQuery = z.infer<typeof ListConnectionsQuerySchema>;

// =============================================================================
// API Response Schemas
// =============================================================================

/**
 * Health summary for a connection
 */
export const ConnectionHealthSummarySchema = z.object({
  status: HealthCheckStatusSchema,
  lastCredentialCheckAt: z.string().nullable(),
  lastConnectivityCheckAt: z.string().nullable(),
  lastFullScanAt: z.string().nullable(),
});

export type ConnectionHealthSummary = z.infer<typeof ConnectionHealthSummarySchema>;

/**
 * Connection as returned by the API
 */
export const ConnectionResponseSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  integrationId: z.string().uuid(),
  appId: z.string().uuid().nullable().optional(),
  name: z.string(),
  slug: z.string(),
  baseUrl: z.string().nullable(),
  isPrimary: z.boolean(),
  connectorType: ConnectorTypeSchema,
  platformConnectorId: z.string().uuid().nullable(),
  status: ConnectionStatusSchema,
  metadata: z.record(z.string(), z.unknown()),
  createdAt: z.string(),
  updatedAt: z.string(),
  // Health status fields (optional for backward compatibility)
  healthStatus: HealthCheckStatusSchema.optional(),
  health: ConnectionHealthSummarySchema.optional(),
  // LLM Response Preamble
  preambleTemplate: z.string().nullable().optional(),
});

export type ConnectionResponse = z.infer<typeof ConnectionResponseSchema>;

/**
 * Connection with credential status
 */
export const ConnectionWithCredentialStatusSchema = ConnectionResponseSchema.extend({
  hasCredentials: z.boolean(),
  credentialStatus: z.enum(['active', 'expired', 'revoked', 'needs_reauth']).nullable(),
});

export type ConnectionWithCredentialStatus = z.infer<typeof ConnectionWithCredentialStatusSchema>;

/**
 * Paginated list of connections
 */
export const ListConnectionsResponseSchema = z.object({
  connections: z.array(ConnectionResponseSchema),
  pagination: z.object({
    cursor: z.string().nullable(),
    hasMore: z.boolean(),
    totalCount: z.number().int(),
  }),
});

export type ListConnectionsResponse = z.infer<typeof ListConnectionsResponseSchema>;

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Database connection type with optional health fields
 */
interface DbConnection {
  id: string;
  tenantId: string;
  integrationId: string;
  appId?: string | null;
  name: string;
  slug: string;
  baseUrl: string | null;
  isPrimary: boolean;
  connectorType: string | null;
  platformConnectorId: string | null;
  status: string;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
  // Health fields (from new schema)
  healthStatus?: string | null;
  lastCredentialCheckAt?: Date | null;
  lastConnectivityCheckAt?: Date | null;
  lastFullScanAt?: Date | null;
  // LLM Response Preamble
  preambleTemplate?: string | null;
}

/**
 * Options for connection response formatting
 */
interface ToConnectionResponseOptions {
  /** Include health summary in response (default: true) */
  includeHealth?: boolean;
}

/**
 * Converts a database Connection to API response format
 */
export function toConnectionResponse(
  connection: DbConnection,
  options: ToConnectionResponseOptions = {}
): ConnectionResponse {
  const { includeHealth = true } = options;

  const response: ConnectionResponse = {
    id: connection.id,
    tenantId: connection.tenantId,
    integrationId: connection.integrationId,
    appId: connection.appId ?? null,
    name: connection.name,
    slug: connection.slug,
    baseUrl: connection.baseUrl,
    isPrimary: connection.isPrimary,
    connectorType: (connection.connectorType as ConnectorType) ?? 'custom',
    platformConnectorId: connection.platformConnectorId,
    status: connection.status as ConnectionStatus,
    metadata: (connection.metadata as Record<string, unknown>) ?? {},
    createdAt: connection.createdAt.toISOString(),
    updatedAt: connection.updatedAt.toISOString(),
  };

  // Add health fields if available and requested
  if (includeHealth && connection.healthStatus) {
    response.healthStatus = connection.healthStatus as HealthCheckStatus;
    response.health = {
      status: connection.healthStatus as HealthCheckStatus,
      lastCredentialCheckAt: connection.lastCredentialCheckAt?.toISOString() ?? null,
      lastConnectivityCheckAt: connection.lastConnectivityCheckAt?.toISOString() ?? null,
      lastFullScanAt: connection.lastFullScanAt?.toISOString() ?? null,
    };
  }

  // Add preamble template if present
  if (connection.preambleTemplate !== undefined) {
    response.preambleTemplate = connection.preambleTemplate;
  }

  return response;
}

// =============================================================================
// Error Codes
// =============================================================================

export const ConnectionErrorCodes = {
  CONNECTION_NOT_FOUND: 'CONNECTION_NOT_FOUND',
  DUPLICATE_SLUG: 'DUPLICATE_SLUG',
  INVALID_STATUS: 'INVALID_STATUS',
  CONNECTION_DISABLED: 'CONNECTION_DISABLED',
  NO_CONNECTIONS: 'NO_CONNECTIONS',
  CANNOT_DELETE_PRIMARY: 'CANNOT_DELETE_PRIMARY',
  INTEGRATION_NOT_FOUND: 'INTEGRATION_NOT_FOUND',
  PLATFORM_CONNECTOR_NOT_FOUND: 'PLATFORM_CONNECTOR_NOT_FOUND',
  PLATFORM_CONNECTOR_NOT_ACTIVE: 'PLATFORM_CONNECTOR_NOT_ACTIVE',
  INVALID_CONNECTOR_TYPE: 'INVALID_CONNECTOR_TYPE',
} as const;
