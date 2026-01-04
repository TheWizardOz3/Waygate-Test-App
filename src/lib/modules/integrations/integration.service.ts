/**
 * Integration Service
 *
 * Business logic layer for integration management.
 * Handles CRUD operations with tenant verification and validation.
 *
 * All operations verify tenant ownership before accessing/modifying data.
 */

import { AuthType, IntegrationStatus, Prisma } from '@prisma/client';
import {
  createIntegration as repoCreateIntegration,
  findIntegrationByIdAndTenant,
  findIntegrationBySlug,
  findIntegrationsPaginated,
  findAllIntegrationsForTenant,
  findIntegrationsWithCounts,
  isSlugTaken,
  updateIntegration as repoUpdateIntegration,
  updateIntegrationStatus,
  deleteIntegration as repoDeleteIntegration,
  disableIntegration as repoDisableIntegration,
  getIntegrationCountsByStatus,
  type CreateIntegrationDbInput,
  type UpdateIntegrationDbInput,
  type IntegrationPaginationOptions,
} from './integration.repository';
import { getCredentialStatus, isCredentialExpired } from '../credentials/credential.service';
import { findActiveCredentialForIntegration } from '../credentials/credential.repository';
import { defaultCircuitBreaker } from '../execution';
import { getLastSuccessfulRequestTime } from '../logging/logging.service';
import type {
  HealthStatus,
  CircuitBreakerStatus,
  IntegrationHealthData,
} from '../gateway/gateway.schemas';
import {
  CreateIntegrationInputSchema,
  UpdateIntegrationInputSchema,
  ListIntegrationsQuerySchema,
  toIntegrationResponse,
  IntegrationErrorCodes,
  type CreateIntegrationInput,
  type UpdateIntegrationInput,
  type ListIntegrationsQuery,
  type IntegrationFilters,
  type IntegrationResponse,
  type ListIntegrationsResponse,
} from './integration.schemas';
import { createAction } from '../actions/action.service';
import type { JsonSchemaProperty, JsonSchema } from '../actions/action.schemas';

import type { Integration } from '@prisma/client';

// =============================================================================
// Error Class
// =============================================================================

/**
 * Error thrown when integration operations fail
 */
export class IntegrationError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number = 400
  ) {
    super(message);
    this.name = 'IntegrationError';
  }
}

// =============================================================================
// Create Operations
// =============================================================================

/**
 * Creates a new integration
 *
 * @param tenantId - The tenant creating the integration
 * @param input - Integration creation data
 * @returns The created integration
 */
export async function createIntegration(
  tenantId: string,
  input: CreateIntegrationInput
): Promise<IntegrationResponse> {
  // Validate input
  const parsed = CreateIntegrationInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new IntegrationError(
      IntegrationErrorCodes.INVALID_AUTH_CONFIG,
      `Invalid integration data: ${parsed.error.message}`
    );
  }

  const data = parsed.data;

  // Check for slug collision
  const slugExists = await isSlugTaken(tenantId, data.slug);
  if (slugExists) {
    throw new IntegrationError(
      IntegrationErrorCodes.DUPLICATE_SLUG,
      `An integration with slug '${data.slug}' already exists`
    );
  }

  // Create the integration
  const dbInput: CreateIntegrationDbInput = {
    tenantId,
    name: data.name,
    slug: data.slug,
    description: data.description,
    documentationUrl: data.documentationUrl,
    authType: data.authType as AuthType,
    authConfig: data.authConfig as Prisma.InputJsonValue,
    tags: data.tags,
    metadata: data.metadata as Prisma.InputJsonValue,
  };

  const integration = await repoCreateIntegration(dbInput);

  // Create actions if provided
  if (data.actions && data.actions.length > 0) {
    console.log(
      `[Integration Service] Creating ${data.actions.length} actions for integration ${integration.id}`
    );

    let createdCount = 0;
    let errorCount = 0;

    for (const actionDef of data.actions) {
      try {
        // Build input schema from path/query parameters
        const inputProperties: Record<string, JsonSchemaProperty> = {};
        const requiredFields: string[] = [];

        // Add path parameters to input schema
        if (actionDef.pathParameters?.length) {
          for (const param of actionDef.pathParameters) {
            inputProperties[param.name] = {
              type: (param.type || 'string') as JsonSchemaProperty['type'],
              description: param.description,
            };
            if (param.required) requiredFields.push(param.name);
          }
        }

        // Add query parameters to input schema
        if (actionDef.queryParameters?.length) {
          for (const param of actionDef.queryParameters) {
            inputProperties[param.name] = {
              type: (param.type || 'string') as JsonSchemaProperty['type'],
              description: param.description,
            };
            if (param.required) requiredFields.push(param.name);
          }
        }

        // Add request body to input schema
        if (actionDef.requestBody) {
          inputProperties['body'] = actionDef.requestBody as JsonSchemaProperty;
        }

        const inputSchema: JsonSchema = {
          type: 'object',
          properties: Object.keys(inputProperties).length > 0 ? inputProperties : undefined,
          required: requiredFields.length > 0 ? requiredFields : undefined,
        };

        // Build output schema from responses (use 200/201 response if available)
        const successResponse = actionDef.responses?.['200'] || actionDef.responses?.['201'];
        const outputSchema: JsonSchema = successResponse
          ? { type: 'object', ...successResponse }
          : { type: 'object' };

        await createAction(tenantId, {
          integrationId: integration.id,
          name: actionDef.name,
          slug: actionDef.slug,
          httpMethod: actionDef.method,
          endpointTemplate: actionDef.path,
          description: actionDef.description,
          inputSchema,
          outputSchema,
          cacheable: false,
          tags: actionDef.tags ?? [],
          metadata: actionDef.tags?.length ? { tags: actionDef.tags } : undefined,
        });
        createdCount++;
      } catch (error) {
        errorCount++;
        console.error(`[Integration Service] Failed to create action ${actionDef.slug}:`, error);
        // Continue with other actions even if one fails
      }
    }

    console.log(
      `[Integration Service] Created ${createdCount} actions (${errorCount} errors) for integration ${integration.id}`
    );
  }

  return toIntegrationResponse(integration);
}

// =============================================================================
// Read Operations
// =============================================================================

/**
 * Gets an integration by ID with tenant verification
 *
 * @param tenantId - The tenant requesting the integration
 * @param integrationId - The integration ID
 * @returns The integration
 * @throws IntegrationError if not found
 */
export async function getIntegrationById(
  tenantId: string,
  integrationId: string
): Promise<IntegrationResponse> {
  const integration = await findIntegrationByIdAndTenant(integrationId, tenantId);

  if (!integration) {
    throw new IntegrationError(
      IntegrationErrorCodes.INTEGRATION_NOT_FOUND,
      'Integration not found',
      404
    );
  }

  return toIntegrationResponse(integration);
}

/**
 * Gets an integration by slug with tenant verification
 *
 * @param tenantId - The tenant ID
 * @param slug - The integration slug
 * @returns The integration
 * @throws IntegrationError if not found
 */
export async function getIntegrationBySlug(
  tenantId: string,
  slug: string
): Promise<IntegrationResponse> {
  const integration = await findIntegrationBySlug(tenantId, slug);

  if (!integration) {
    throw new IntegrationError(
      IntegrationErrorCodes.INTEGRATION_NOT_FOUND,
      `Integration '${slug}' not found`,
      404
    );
  }

  return toIntegrationResponse(integration);
}

/**
 * Gets an integration by slug, returning the raw database model
 * Used internally by Gateway service
 *
 * @param tenantId - The tenant ID
 * @param slug - The integration slug
 * @returns The raw integration model
 * @throws IntegrationError if not found or disabled
 */
export async function getIntegrationBySlugRaw(
  tenantId: string,
  slug: string
): Promise<Integration> {
  const integration = await findIntegrationBySlug(tenantId, slug);

  if (!integration) {
    throw new IntegrationError(
      IntegrationErrorCodes.INTEGRATION_NOT_FOUND,
      `Integration '${slug}' not found`,
      404
    );
  }

  if (integration.status === IntegrationStatus.disabled) {
    throw new IntegrationError(
      IntegrationErrorCodes.INTEGRATION_DISABLED,
      `Integration '${slug}' is disabled`,
      403
    );
  }

  return integration;
}

/**
 * Gets an integration by ID, returning the raw database model
 * Used internally
 *
 * @param tenantId - The tenant ID
 * @param integrationId - The integration ID
 * @returns The raw integration model
 * @throws IntegrationError if not found
 */
export async function getIntegrationByIdRaw(
  tenantId: string,
  integrationId: string
): Promise<Integration> {
  const integration = await findIntegrationByIdAndTenant(integrationId, tenantId);

  if (!integration) {
    throw new IntegrationError(
      IntegrationErrorCodes.INTEGRATION_NOT_FOUND,
      'Integration not found',
      404
    );
  }

  return integration;
}

/**
 * Lists integrations with filtering and pagination
 *
 * @param tenantId - The tenant ID
 * @param query - Query parameters
 * @returns Paginated list of integrations
 */
export async function listIntegrations(
  tenantId: string,
  query: Partial<ListIntegrationsQuery> = {}
): Promise<ListIntegrationsResponse> {
  // Validate query
  const parsed = ListIntegrationsQuerySchema.safeParse(query);
  if (!parsed.success) {
    throw new IntegrationError(
      IntegrationErrorCodes.INVALID_AUTH_CONFIG,
      `Invalid query parameters: ${parsed.error.message}`
    );
  }

  const { cursor, limit, status, authType, tags, search } = parsed.data;

  // Build filters
  const filters: IntegrationFilters = {};
  if (status) filters.status = status;
  if (authType) filters.authType = authType;
  if (tags) filters.tags = tags.split(',').map((t) => t.trim());
  if (search) filters.search = search;

  // Build pagination options
  const paginationOptions: IntegrationPaginationOptions = { limit };
  if (cursor) paginationOptions.cursor = cursor;

  // Query
  const result = await findIntegrationsPaginated(tenantId, paginationOptions, filters);

  return {
    integrations: result.integrations.map(toIntegrationResponse),
    pagination: {
      cursor: result.nextCursor,
      hasMore: result.nextCursor !== null,
      totalCount: result.totalCount,
    },
  };
}

/**
 * Gets all integrations for a tenant (no pagination)
 * Use sparingly - prefer paginated list
 */
export async function getAllIntegrations(tenantId: string): Promise<IntegrationResponse[]> {
  const integrations = await findAllIntegrationsForTenant(tenantId);
  return integrations.map(toIntegrationResponse);
}

/**
 * Gets integrations with action counts (for dashboard)
 */
export async function getIntegrationsWithCounts(
  tenantId: string,
  query: Partial<ListIntegrationsQuery> = {}
): Promise<{
  integrations: (IntegrationResponse & { actionCount: number })[];
  pagination: { cursor: string | null; hasMore: boolean; totalCount: number };
}> {
  const parsed = ListIntegrationsQuerySchema.safeParse(query);
  if (!parsed.success) {
    throw new IntegrationError(
      IntegrationErrorCodes.INVALID_AUTH_CONFIG,
      `Invalid query parameters: ${parsed.error.message}`
    );
  }

  const { cursor, limit } = parsed.data;

  const result = await findIntegrationsWithCounts(tenantId, { cursor, limit });

  return {
    integrations: result.integrations.map((int) => ({
      ...toIntegrationResponse(int),
      actionCount: int._count.actions,
    })),
    pagination: {
      cursor: result.nextCursor,
      hasMore: result.nextCursor !== null,
      totalCount: result.totalCount,
    },
  };
}

// =============================================================================
// Update Operations
// =============================================================================

/**
 * Updates an integration
 *
 * @param tenantId - The tenant making the update
 * @param integrationId - The integration ID to update
 * @param input - Update data
 * @returns The updated integration
 */
export async function updateIntegration(
  tenantId: string,
  integrationId: string,
  input: UpdateIntegrationInput
): Promise<IntegrationResponse> {
  // Validate input
  const parsed = UpdateIntegrationInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new IntegrationError(
      IntegrationErrorCodes.INVALID_AUTH_CONFIG,
      `Invalid integration data: ${parsed.error.message}`
    );
  }

  const data = parsed.data;

  // Verify integration exists and belongs to tenant
  const existing = await findIntegrationByIdAndTenant(integrationId, tenantId);
  if (!existing) {
    throw new IntegrationError(
      IntegrationErrorCodes.INTEGRATION_NOT_FOUND,
      'Integration not found',
      404
    );
  }

  // Check for slug collision if slug is being changed
  if (data.slug && data.slug !== existing.slug) {
    const slugExists = await isSlugTaken(tenantId, data.slug, integrationId);
    if (slugExists) {
      throw new IntegrationError(
        IntegrationErrorCodes.DUPLICATE_SLUG,
        `An integration with slug '${data.slug}' already exists`
      );
    }
  }

  // Build update input
  const updateInput: UpdateIntegrationDbInput = {};
  if (data.name !== undefined) updateInput.name = data.name;
  if (data.slug !== undefined) updateInput.slug = data.slug;
  if (data.description !== undefined) updateInput.description = data.description;
  if (data.documentationUrl !== undefined) updateInput.documentationUrl = data.documentationUrl;
  if (data.authType !== undefined) updateInput.authType = data.authType as AuthType;
  if (data.authConfig !== undefined)
    updateInput.authConfig = data.authConfig as Prisma.InputJsonValue;
  if (data.status !== undefined) updateInput.status = data.status as IntegrationStatus;
  if (data.tags !== undefined) updateInput.tags = data.tags;
  if (data.metadata !== undefined) updateInput.metadata = data.metadata as Prisma.InputJsonValue;

  const updated = await repoUpdateIntegration(integrationId, updateInput);

  return toIntegrationResponse(updated);
}

/**
 * Activates an integration (sets status to active)
 */
export async function activateIntegration(
  tenantId: string,
  integrationId: string
): Promise<IntegrationResponse> {
  // Verify integration exists and belongs to tenant
  const existing = await findIntegrationByIdAndTenant(integrationId, tenantId);
  if (!existing) {
    throw new IntegrationError(
      IntegrationErrorCodes.INTEGRATION_NOT_FOUND,
      'Integration not found',
      404
    );
  }

  const updated = await updateIntegrationStatus(integrationId, IntegrationStatus.active);

  return toIntegrationResponse(updated);
}

/**
 * Sets integration to error status
 */
export async function markIntegrationError(
  tenantId: string,
  integrationId: string
): Promise<IntegrationResponse> {
  const existing = await findIntegrationByIdAndTenant(integrationId, tenantId);
  if (!existing) {
    throw new IntegrationError(
      IntegrationErrorCodes.INTEGRATION_NOT_FOUND,
      'Integration not found',
      404
    );
  }

  const updated = await updateIntegrationStatus(integrationId, IntegrationStatus.error);

  return toIntegrationResponse(updated);
}

// =============================================================================
// Delete Operations
// =============================================================================

/**
 * Deletes an integration
 *
 * @param tenantId - The tenant making the deletion
 * @param integrationId - The integration ID to delete
 */
export async function deleteIntegration(tenantId: string, integrationId: string): Promise<void> {
  // Verify integration exists and belongs to tenant
  const existing = await findIntegrationByIdAndTenant(integrationId, tenantId);
  if (!existing) {
    throw new IntegrationError(
      IntegrationErrorCodes.INTEGRATION_NOT_FOUND,
      'Integration not found',
      404
    );
  }

  await repoDeleteIntegration(integrationId);
}

/**
 * Disables an integration (soft delete)
 */
export async function disableIntegration(
  tenantId: string,
  integrationId: string
): Promise<IntegrationResponse> {
  const existing = await findIntegrationByIdAndTenant(integrationId, tenantId);
  if (!existing) {
    throw new IntegrationError(
      IntegrationErrorCodes.INTEGRATION_NOT_FOUND,
      'Integration not found',
      404
    );
  }

  const updated = await repoDisableIntegration(integrationId);

  return toIntegrationResponse(updated);
}

// =============================================================================
// Statistics
// =============================================================================

/**
 * Gets integration statistics for a tenant
 */
export async function getIntegrationStats(tenantId: string): Promise<{
  total: number;
  byStatus: Record<string, number>;
}> {
  const byStatus = await getIntegrationCountsByStatus(tenantId);
  const total = Object.values(byStatus).reduce((sum, count) => sum + count, 0);

  return {
    total,
    byStatus,
  };
}

// =============================================================================
// Health Check
// =============================================================================

/**
 * Checks the health of an integration
 *
 * Evaluates:
 * - Credential status (valid, expired, needs reauth)
 * - Circuit breaker status (closed, open, half-open)
 * - Last successful request time
 *
 * @param tenantId - The tenant ID
 * @param integrationId - The integration ID
 * @returns Health data including overall status, credential info, and circuit breaker state
 */
export async function checkHealth(
  tenantId: string,
  integrationId: string
): Promise<IntegrationHealthData> {
  // Verify integration exists and belongs to tenant
  const integration = await findIntegrationByIdAndTenant(integrationId, tenantId);
  if (!integration) {
    throw new IntegrationError(
      IntegrationErrorCodes.INTEGRATION_NOT_FOUND,
      'Integration not found',
      404
    );
  }

  // Get credential status
  const credentialStatus = await getCredentialStatus(integrationId, tenantId);
  const credential = await findActiveCredentialForIntegration(integrationId, tenantId);

  // Determine if credential needs refresh
  let needsRefresh = false;
  if (credential) {
    needsRefresh = isCredentialExpired(credential, 300); // 5 minute buffer
  }

  // Get circuit breaker status
  const circuitStatus = defaultCircuitBreaker.getStatus(integrationId);
  const circuitBreakerStatus: CircuitBreakerStatus =
    circuitStatus.state === 'half-open' ? 'half_open' : circuitStatus.state;

  // Get last successful request time
  const lastSuccessfulRequest = await getLastSuccessfulRequestTime(tenantId, integrationId);

  // Determine overall health status
  const healthStatus = determineHealthStatus(
    integration.status,
    credentialStatus,
    needsRefresh,
    circuitStatus.state
  );

  return {
    status: healthStatus,
    credentials: credentialStatus
      ? {
          status: credentialStatus.status,
          expiresAt: credentialStatus.expiresAt,
          needsRefresh,
        }
      : null,
    circuitBreaker: {
      status: circuitBreakerStatus,
      failureCount: circuitStatus.failureCount,
    },
    lastSuccessfulRequest: lastSuccessfulRequest?.toISOString() ?? null,
  };
}

/**
 * Determines the overall health status based on integration state
 */
function determineHealthStatus(
  integrationStatus: IntegrationStatus,
  credentialStatus: { status: string } | null,
  needsRefresh: boolean,
  circuitState: 'closed' | 'open' | 'half-open'
): HealthStatus {
  // Unhealthy conditions
  if (integrationStatus === IntegrationStatus.disabled) {
    return 'unhealthy';
  }
  if (integrationStatus === IntegrationStatus.error) {
    return 'unhealthy';
  }
  if (circuitState === 'open') {
    return 'unhealthy';
  }
  if (!credentialStatus) {
    return 'unhealthy'; // No credentials configured
  }
  if (credentialStatus.status === 'revoked' || credentialStatus.status === 'needs_reauth') {
    return 'unhealthy';
  }

  // Degraded conditions
  if (circuitState === 'half-open') {
    return 'degraded';
  }
  if (needsRefresh) {
    return 'degraded'; // Credentials expiring soon
  }
  if (credentialStatus.status === 'expired') {
    return 'degraded';
  }

  // Healthy
  return 'healthy';
}
