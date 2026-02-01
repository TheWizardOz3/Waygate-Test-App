/**
 * Schema Loader
 *
 * Loads integration schemas and formats them for use in LLM prompts.
 * Provides schema information to agentic tools for parameter interpretation.
 */

import { prisma } from '@/lib/db/client';

// =============================================================================
// Types
// =============================================================================

/**
 * Schema information for a single action
 */
export interface ActionSchemaInfo {
  /** Action name */
  name: string;
  /** Action slug */
  slug: string;
  /** Action description */
  description: string | null;
  /** HTTP method */
  httpMethod: string;
  /** Endpoint template */
  endpointTemplate: string;
  /** Input schema (parameters) */
  inputSchema: unknown;
  /** Output schema (response) */
  outputSchema: unknown;
}

/**
 * Complete schema for an integration
 */
export interface IntegrationSchema {
  /** Integration ID */
  integrationId: string;
  /** Integration name */
  integrationName: string;
  /** Integration description */
  integrationDescription: string | null;
  /** All actions available in this integration */
  actions: ActionSchemaInfo[];
}

/**
 * Options for schema loading
 */
export interface SchemaLoadOptions {
  /** Tenant ID for validation */
  tenantId: string;
  /** Integration ID to load schema for */
  integrationId: string;
  /** Whether to include output schemas (default: false, only input schemas) */
  includeOutputSchemas?: boolean;
  /** Specific action IDs to load (if not provided, loads all) */
  actionIds?: string[];
}

// =============================================================================
// Schema Loading
// =============================================================================

/**
 * Load integration schema from database
 *
 * @param options - Schema loading options
 * @returns Integration schema with all actions
 */
export async function loadIntegrationSchema(
  options: SchemaLoadOptions
): Promise<IntegrationSchema> {
  const { tenantId, integrationId, actionIds } = options;

  // Load integration
  const integration = await prisma.integration.findFirst({
    where: {
      id: integrationId,
      tenantId,
    },
    select: {
      id: true,
      name: true,
      description: true,
    },
  });

  if (!integration) {
    throw new SchemaLoadError('INTEGRATION_NOT_FOUND', `Integration not found: ${integrationId}`);
  }

  // Load actions
  const actions = await prisma.action.findMany({
    where: {
      integrationId,
      ...(actionIds ? { id: { in: actionIds } } : {}),
    },
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      httpMethod: true,
      endpointTemplate: true,
      inputSchema: true,
      outputSchema: true,
    },
    orderBy: {
      name: 'asc',
    },
  });

  // Map actions to schema info
  const actionSchemas: ActionSchemaInfo[] = actions.map((action) => ({
    name: action.name,
    slug: action.slug,
    description: action.description,
    httpMethod: action.httpMethod,
    endpointTemplate: action.endpointTemplate,
    inputSchema: action.inputSchema,
    outputSchema: action.outputSchema,
  }));

  return {
    integrationId: integration.id,
    integrationName: integration.name,
    integrationDescription: integration.description,
    actions: actionSchemas,
  };
}

/**
 * Load schemas for multiple integrations in batch
 *
 * @param tenantId - Tenant ID
 * @param integrationIds - Array of integration IDs
 * @param includeOutputSchemas - Whether to include output schemas
 * @returns Map of integration ID to schema
 */
export async function loadIntegrationSchemas(
  tenantId: string,
  integrationIds: string[],
  includeOutputSchemas = false
): Promise<Record<string, IntegrationSchema>> {
  const schemas: Record<string, IntegrationSchema> = {};

  // Load all schemas in parallel
  const results = await Promise.allSettled(
    integrationIds.map((integrationId) =>
      loadIntegrationSchema({
        tenantId,
        integrationId,
        includeOutputSchemas,
      })
    )
  );

  // Map results
  integrationIds.forEach((integrationId, index) => {
    const result = results[index];
    if (result.status === 'fulfilled') {
      schemas[integrationId] = result.value;
    }
  });

  return schemas;
}

// =============================================================================
// Schema Formatting
// =============================================================================

/**
 * Format an integration schema as a readable string for LLM consumption
 *
 * @param schema - Integration schema
 * @param options - Formatting options
 * @returns Formatted schema string
 */
export function formatSchemaForPrompt(
  schema: IntegrationSchema,
  options: {
    includeOutputSchemas?: boolean;
    includeEndpoints?: boolean;
  } = {}
): string {
  const { includeOutputSchemas = false, includeEndpoints = false } = options;

  const lines: string[] = [];

  // Header
  lines.push(`# ${schema.integrationName} API Schema`);
  lines.push('');

  if (schema.integrationDescription) {
    lines.push(schema.integrationDescription);
    lines.push('');
  }

  lines.push(`## Available Actions (${schema.actions.length})`);
  lines.push('');

  // Format each action
  for (const action of schema.actions) {
    lines.push(`### ${action.name} (\`${action.slug}\`)`);
    lines.push('');

    if (action.description) {
      lines.push(action.description);
      lines.push('');
    }

    lines.push(`**Method:** ${action.httpMethod}`);
    lines.push('');

    if (includeEndpoints) {
      lines.push(`**Endpoint:** ${action.endpointTemplate}`);
      lines.push('');
    }

    // Input schema
    lines.push('**Input Parameters:**');
    lines.push('');
    lines.push('```json');
    lines.push(JSON.stringify(action.inputSchema, null, 2));
    lines.push('```');
    lines.push('');

    // Output schema (optional)
    if (includeOutputSchemas) {
      lines.push('**Response Schema:**');
      lines.push('');
      lines.push('```json');
      lines.push(JSON.stringify(action.outputSchema, null, 2));
      lines.push('```');
      lines.push('');
    }

    lines.push('---');
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Format multiple integration schemas as a single string
 *
 * @param schemas - Map of integration schemas
 * @param options - Formatting options
 * @returns Combined formatted schema string
 */
export function formatSchemasForPrompt(
  schemas: Record<string, IntegrationSchema>,
  options: {
    includeOutputSchemas?: boolean;
    includeEndpoints?: boolean;
  } = {}
): string {
  const integrationSchemas = Object.values(schemas);

  if (integrationSchemas.length === 0) {
    return 'No schemas available.';
  }

  if (integrationSchemas.length === 1) {
    return formatSchemaForPrompt(integrationSchemas[0], options);
  }

  // Multiple integrations
  const lines: string[] = [];

  for (const schema of integrationSchemas) {
    lines.push(formatSchemaForPrompt(schema, options));
    lines.push('');
    lines.push('═'.repeat(80));
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Format a compact schema summary (just action names and descriptions)
 *
 * @param schema - Integration schema
 * @returns Compact schema summary
 */
export function formatSchemaCompact(schema: IntegrationSchema): string {
  const lines: string[] = [];

  lines.push(`# ${schema.integrationName}`);
  lines.push('');

  for (const action of schema.actions) {
    const desc = action.description || 'No description';
    lines.push(`- **${action.name}** (\`${action.slug}\`): ${desc}`);
  }

  return lines.join('\n');
}

// =============================================================================
// Errors
// =============================================================================

/**
 * Error thrown when schema loading fails
 */
export class SchemaLoadError extends Error {
  constructor(
    public code: string,
    message: string
  ) {
    super(message);
    this.name = 'SchemaLoadError';
  }
}
