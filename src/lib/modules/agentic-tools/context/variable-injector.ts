/**
 * Variable Injector
 *
 * Coordinates loading and injecting context variables for agentic tool prompts.
 * Loads integration schemas, reference data, and builds the runtime context.
 */

import type { ContextConfig } from '../agentic-tool.schemas';
import type { PromptContext } from '../llm/prompt-processor';
import { loadIntegrationSchemas, formatSchemaForPrompt } from './schema-loader';
import { prisma } from '@/lib/db/client';
import { buildPromptContext } from '../llm/prompt-processor';

// =============================================================================
// Types
// =============================================================================

/**
 * Options for building context
 */
export interface BuildContextOptions {
  /** Tenant ID for data access */
  tenantId: string;
  /** User's natural language input */
  userInput: string;
  /** Context configuration from agentic tool */
  contextConfig?: ContextConfig;
  /** Available tools (for autonomous agent mode) */
  availableTools?: Array<{
    actionId: string;
    actionSlug: string;
    description: string;
  }>;
  /** Integration IDs to load schemas for (if auto-inject enabled) */
  integrationIds?: string[];
}

/**
 * Loaded runtime context data
 */
export interface LoadedRuntimeContext {
  /** User input */
  userInput: string;
  /** Loaded integration schemas (formatted as strings) */
  integrationSchemas?: Record<string, string>;
  /** Loaded reference data (formatted as strings) */
  referenceData?: Record<string, string>;
  /** Available tools list */
  availableTools?: Array<{ name: string; description: string }>;
}

// =============================================================================
// Main Context Builder
// =============================================================================

/**
 * Build complete prompt context by loading all required data
 *
 * This function:
 * 1. Loads integration schemas (if configured)
 * 2. Loads reference data (if configured)
 * 3. Formats data as strings for LLM consumption
 * 4. Builds the final PromptContext object
 *
 * @param options - Context building options
 * @returns Complete prompt context ready for variable replacement
 */
export async function buildContext(options: BuildContextOptions): Promise<PromptContext> {
  const { tenantId, userInput, contextConfig, availableTools, integrationIds } = options;

  // Build runtime context by loading all data
  const runtimeContext: LoadedRuntimeContext = {
    userInput,
  };

  // Load integration schemas if configured
  if (contextConfig?.autoInjectSchemas && integrationIds && integrationIds.length > 0) {
    runtimeContext.integrationSchemas = await loadSchemas(tenantId, integrationIds);
  }

  // Load configured variables
  if (contextConfig?.variables) {
    const { schemas, referenceData } = await loadConfiguredVariables(
      tenantId,
      contextConfig.variables
    );

    // Merge loaded schemas
    if (schemas && Object.keys(schemas).length > 0) {
      runtimeContext.integrationSchemas = {
        ...runtimeContext.integrationSchemas,
        ...schemas,
      };
    }

    // Add reference data
    if (referenceData && Object.keys(referenceData).length > 0) {
      runtimeContext.referenceData = referenceData;
    }
  }

  // Add available tools (for autonomous agent mode)
  if (availableTools && availableTools.length > 0) {
    runtimeContext.availableTools = availableTools.map((tool) => ({
      name: tool.actionSlug,
      description: tool.description,
    }));
  }

  // Build final prompt context using the prompt processor
  return buildPromptContext(contextConfig, runtimeContext);
}

// =============================================================================
// Schema Loading
// =============================================================================

/**
 * Load and format integration schemas
 *
 * @param tenantId - Tenant ID
 * @param integrationIds - Integration IDs to load
 * @returns Map of integration ID to formatted schema string
 */
async function loadSchemas(
  tenantId: string,
  integrationIds: string[]
): Promise<Record<string, string>> {
  // Load raw schemas
  const rawSchemas = await loadIntegrationSchemas(tenantId, integrationIds, false);

  // Format each schema as a string
  const formattedSchemas: Record<string, string> = {};

  for (const [integrationId, schema] of Object.entries(rawSchemas)) {
    formattedSchemas[integrationId] = formatSchemaForPrompt(schema, {
      includeOutputSchemas: false,
      includeEndpoints: false,
    });
  }

  return formattedSchemas;
}

// =============================================================================
// Variable Loading
// =============================================================================

/**
 * Load configured variables from context config
 *
 * @param tenantId - Tenant ID
 * @param variablesConfig - Variables configuration
 * @returns Loaded schemas and reference data
 */
async function loadConfiguredVariables(
  tenantId: string,
  variablesConfig: ContextConfig['variables']
): Promise<{
  schemas: Record<string, string>;
  referenceData: Record<string, string>;
}> {
  const schemas: Record<string, string> = {};
  const referenceData: Record<string, string> = {};

  if (!variablesConfig) {
    return { schemas, referenceData };
  }

  // Process each configured variable
  for (const [variableName, variableConfig] of Object.entries(variablesConfig)) {
    if (variableConfig.type === 'integration_schema' && variableConfig.source) {
      // Load integration schema
      const schemaData = await loadSchemas(tenantId, [variableConfig.source]);
      schemas[variableName] = schemaData[variableConfig.source] || '';
    } else if (variableConfig.type === 'reference_data' && variableConfig.source) {
      // Load reference data
      const refData = await loadReferenceData(tenantId, variableConfig.source);
      referenceData[variableName] = refData;
    }
    // Custom variables are handled by buildPromptContext
  }

  return { schemas, referenceData };
}

/**
 * Load reference data for a data type
 *
 * @param tenantId - Tenant ID
 * @param dataType - Reference data type (e.g., 'users', 'channels')
 * @returns Formatted reference data string
 */
async function loadReferenceData(tenantId: string, dataType: string): Promise<string> {
  // Load reference data from database
  const referenceItems = await prisma.referenceData.findMany({
    where: {
      tenantId,
      dataType,
      status: 'active',
    },
    select: {
      externalId: true,
      name: true,
      metadata: true,
    },
    orderBy: {
      name: 'asc',
    },
    take: 500, // Limit to prevent excessive context
  });

  if (referenceItems.length === 0) {
    return `No ${dataType} data available.`;
  }

  // Format as a readable list
  return formatReferenceData(dataType, referenceItems);
}

/**
 * Format reference data as a readable string for LLM
 *
 * @param dataType - Data type name
 * @param items - Reference data items
 * @returns Formatted string
 */
function formatReferenceData(
  dataType: string,
  items: Array<{
    externalId: string;
    name: string;
    metadata: unknown;
  }>
): string {
  const lines: string[] = [];

  lines.push(`# ${capitalizeFirst(dataType)}`);
  lines.push('');
  lines.push(`Available ${dataType}: ${items.length} items`);
  lines.push('');

  // Format each item
  for (const item of items) {
    lines.push(`- **${item.name}** (ID: \`${item.externalId}\`)`);

    // Include relevant metadata if present
    if (item.metadata && typeof item.metadata === 'object') {
      const metadata = item.metadata as Record<string, unknown>;
      const relevantFields = ['email', 'type', 'status', 'role', 'department'];

      for (const field of relevantFields) {
        if (metadata[field]) {
          lines.push(`  - ${capitalizeFirst(field)}: ${metadata[field]}`);
        }
      }
    }
  }

  return lines.join('\n');
}

/**
 * Capitalize first letter of a string
 */
function capitalizeFirst(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// =============================================================================
// Validation
// =============================================================================

/**
 * Validate that all required variables can be loaded
 *
 * @param tenantId - Tenant ID
 * @param contextConfig - Context configuration
 * @returns Validation result with missing variables
 */
export async function validateContextConfig(
  tenantId: string,
  contextConfig: ContextConfig
): Promise<{
  valid: boolean;
  missingIntegrations: string[];
  missingDataTypes: string[];
}> {
  const missingIntegrations: string[] = [];
  const missingDataTypes: string[] = [];

  if (!contextConfig.variables) {
    return { valid: true, missingIntegrations, missingDataTypes };
  }

  // Check each configured variable
  for (const [variableName, variableConfig] of Object.entries(contextConfig.variables)) {
    if (variableConfig.type === 'integration_schema' && variableConfig.source) {
      // Check if integration exists
      const integration = await prisma.integration.findFirst({
        where: {
          id: variableConfig.source,
          tenantId,
        },
        select: { id: true },
      });

      if (!integration) {
        missingIntegrations.push(variableName);
      }
    } else if (variableConfig.type === 'reference_data' && variableConfig.source) {
      // Check if reference data exists
      const refDataCount = await prisma.referenceData.count({
        where: {
          tenantId,
          dataType: variableConfig.source,
          status: 'active',
        },
      });

      if (refDataCount === 0) {
        missingDataTypes.push(variableName);
      }
    }
  }

  return {
    valid: missingIntegrations.length === 0 && missingDataTypes.length === 0,
    missingIntegrations,
    missingDataTypes,
  };
}

// =============================================================================
// Exports
// =============================================================================

export { type PromptContext } from '../llm/prompt-processor';
