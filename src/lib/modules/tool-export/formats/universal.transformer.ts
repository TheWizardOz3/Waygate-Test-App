/**
 * Universal Tool Transformer
 *
 * Transforms Waygate actions into LLM-agnostic tool definitions that work
 * with all major LLMs (OpenAI, Anthropic, Gemini) and tool frameworks.
 *
 * Key responsibilities:
 * - Flatten JSON Schema (resolve $ref, oneOf, anyOf, allOf)
 * - Add explicit type and description to every property
 * - Generate LLM-optimized tool descriptions (mini-prompt format)
 * - Handle edge cases (empty schemas, complex nested types)
 */

import type { ActionResponse, JsonSchema } from '../../actions';
import type {
  InputJsonSchema,
  InputJsonSchemaProperty,
  UniversalTool,
  UniversalToolParameters,
  UniversalToolProperty,
} from '../tool-export.schemas';
import { generateToolName } from '../tool-export.schemas';
import {
  buildToolDescription,
  buildSimpleDescription,
  type DescriptionBuilderOptions,
} from '../descriptions';

// =============================================================================
// Types
// =============================================================================

/**
 * Options for transforming an action to a universal tool
 */
export interface TransformOptions {
  /** Include action metadata in description */
  includeMetadata?: boolean;
  /** Maximum description length (truncate if exceeded) */
  maxDescriptionLength?: number;
  /** Include context type declarations */
  includeContextTypes?: boolean;
  /** Integration name for building descriptions */
  integrationName?: string;
  /** Use simple description format (shorter, no mini-prompt structure) */
  useSimpleDescription?: boolean;
}

/**
 * Result of transforming an action to a universal tool
 */
export interface TransformResult {
  success: true;
  tool: UniversalTool;
}

/**
 * Failed transformation result
 */
export interface TransformError {
  success: false;
  error: string;
  actionSlug: string;
}

// =============================================================================
// Main Transformer
// =============================================================================

/**
 * Transform a Waygate action into a universal tool definition.
 *
 * @param action - The action to transform
 * @param integrationSlug - The integration's slug for naming
 * @param options - Transform options
 * @returns Universal tool or error
 */
export function transformActionToUniversalTool(
  action: ActionResponse,
  integrationSlug: string,
  options: TransformOptions = {}
): TransformResult | TransformError {
  const {
    maxDescriptionLength = 2000,
    includeContextTypes = true,
    integrationName,
    useSimpleDescription = false,
  } = options;

  try {
    // Generate tool name from integration and action slugs
    const toolName = generateToolName(integrationSlug, action.slug);

    // Transform input schema to universal parameters
    let parameters = transformInputSchemaToParameters(action.inputSchema);

    // If schema has no properties, try to enrich from endpointTemplate and toolDescription
    if (Object.keys(parameters.properties).length === 0) {
      parameters = enrichEmptyParameters(action, parameters);
    }

    // Determine context types from action metadata
    const contextTypes = includeContextTypes ? extractContextTypes(action) : undefined;

    // Use stored LLM-generated description if available, otherwise fall back to template-based
    let description: string;

    if (action.toolDescription && !useSimpleDescription) {
      // Use the LLM-generated description stored with the action
      description = action.toolDescription;
    } else {
      // Fall back to template-based description generation
      const descriptionOptions: DescriptionBuilderOptions = {
        maxLength: maxDescriptionLength,
        includeContextInfo: includeContextTypes && (contextTypes?.length ?? 0) > 0,
        includeOutputInfo: !useSimpleDescription,
        integrationName: integrationName || formatIntegrationName(integrationSlug),
        contextTypes: contextTypes || [],
      };

      description = useSimpleDescription
        ? buildSimpleDescription(action, descriptionOptions.integrationName)
        : buildToolDescription(action, parameters, descriptionOptions);
    }

    const tool: UniversalTool = {
      name: toolName,
      description,
      parameters,
      ...(contextTypes && contextTypes.length > 0 ? { contextTypes } : {}),
    };

    return { success: true, tool };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown transformation error';
    return {
      success: false,
      error: errorMessage,
      actionSlug: action.slug,
    };
  }
}

/**
 * Format integration slug into a human-readable name.
 * e.g., "slack-bot" -> "Slack Bot", "github" -> "GitHub"
 */
function formatIntegrationName(slug: string): string {
  // Handle common capitalizations
  const specialCases: Record<string, string> = {
    github: 'GitHub',
    gitlab: 'GitLab',
    linkedin: 'LinkedIn',
    youtube: 'YouTube',
    hubspot: 'HubSpot',
    mailchimp: 'Mailchimp',
    salesforce: 'Salesforce',
    zendesk: 'Zendesk',
    shopify: 'Shopify',
    twilio: 'Twilio',
    sendgrid: 'SendGrid',
    stripe: 'Stripe',
    notion: 'Notion',
    asana: 'Asana',
    jira: 'Jira',
    trello: 'Trello',
    airtable: 'Airtable',
    dropbox: 'Dropbox',
    google: 'Google',
    microsoft: 'Microsoft',
    aws: 'AWS',
    gcp: 'GCP',
    azure: 'Azure',
  };

  const lowerSlug = slug.toLowerCase();
  if (specialCases[lowerSlug]) {
    return specialCases[lowerSlug];
  }

  // Default: capitalize each word
  return slug
    .split(/[-_]/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Transform multiple actions to universal tools.
 *
 * @param actions - Actions to transform
 * @param integrationSlug - The integration's slug
 * @param options - Transform options
 * @returns Array of tools and any errors
 */
export function transformActionsToUniversalTools(
  actions: ActionResponse[],
  integrationSlug: string,
  options: TransformOptions = {}
): {
  tools: UniversalTool[];
  errors: TransformError[];
} {
  const tools: UniversalTool[] = [];
  const errors: TransformError[] = [];

  for (const action of actions) {
    const result = transformActionToUniversalTool(action, integrationSlug, options);
    if (result.success) {
      tools.push(result.tool);
    } else {
      errors.push(result);
    }
  }

  return { tools, errors };
}

// =============================================================================
// Schema Transformation
// =============================================================================

/**
 * Transform an action's input schema to universal tool parameters.
 * Handles flattening of $ref, oneOf, anyOf, and allOf.
 */
export function transformInputSchemaToParameters(inputSchema: JsonSchema): UniversalToolParameters {
  const schema = inputSchema as InputJsonSchema;

  // Handle empty or non-object schemas
  if (!schema || schema.type !== 'object' || !schema.properties) {
    return {
      type: 'object',
      properties: {},
      required: [],
    };
  }

  // Get definitions for $ref resolution
  const definitions = schema.definitions || schema.$defs || {};

  // Transform each property
  const properties: Record<string, UniversalToolProperty> = {};
  for (const [propName, propSchema] of Object.entries(schema.properties)) {
    const flattenedProp = flattenSchemaProperty(propSchema, definitions, propName);
    if (flattenedProp) {
      properties[propName] = flattenedProp;
    }
  }

  return {
    type: 'object',
    properties,
    required: schema.required || [],
  };
}

/**
 * Flatten a single schema property, resolving $ref and composite types.
 */
export function flattenSchemaProperty(
  prop: InputJsonSchemaProperty,
  definitions: Record<string, InputJsonSchemaProperty>,
  propName: string,
  depth: number = 0
): UniversalToolProperty | null {
  // Prevent infinite recursion
  if (depth > 10) {
    return {
      type: 'object',
      description: `${propName} (complex nested structure)`,
    };
  }

  // Resolve $ref first
  let resolvedProp = prop;
  if (prop.$ref) {
    resolvedProp = resolveRef(prop.$ref, definitions) || prop;
  }

  // Handle allOf by merging all schemas
  if (resolvedProp.allOf && resolvedProp.allOf.length > 0) {
    resolvedProp = mergeAllOf(resolvedProp.allOf, definitions);
  }

  // Handle oneOf/anyOf by taking the first option and noting alternatives
  if (resolvedProp.oneOf && resolvedProp.oneOf.length > 0) {
    resolvedProp = flattenOneOfAnyOf(resolvedProp.oneOf, definitions, propName);
  } else if (resolvedProp.anyOf && resolvedProp.anyOf.length > 0) {
    resolvedProp = flattenOneOfAnyOf(resolvedProp.anyOf, definitions, propName);
  }

  // Determine the type
  const type = normalizeType(resolvedProp.type);

  // Build description with constraints
  const description = buildPropertyDescription(resolvedProp, propName);

  // Build the universal property
  const universalProp: UniversalToolProperty = {
    type,
    description,
  };

  // Add enum if present
  if (resolvedProp.enum && resolvedProp.enum.length > 0) {
    universalProp.enum = resolvedProp.enum;
  }

  // Add default if present
  if (resolvedProp.default !== undefined) {
    universalProp.default = resolvedProp.default;
  }

  // Handle array items
  if (type === 'array' && resolvedProp.items) {
    const itemsProp = flattenSchemaProperty(
      resolvedProp.items,
      definitions,
      `${propName} item`,
      depth + 1
    );
    if (itemsProp) {
      // Items type doesn't support 'array' (nested arrays uncommon in tool params)
      const itemsType = itemsProp.type === 'array' ? 'object' : itemsProp.type;
      universalProp.items = {
        type: itemsType,
        description: itemsProp.description,
      };
    }
  }

  // Handle nested objects
  if (type === 'object' && resolvedProp.properties) {
    const nestedProps: Record<string, UniversalToolProperty> = {};
    for (const [nestedName, nestedSchema] of Object.entries(resolvedProp.properties)) {
      const flattenedNested = flattenSchemaProperty(
        nestedSchema,
        definitions,
        nestedName,
        depth + 1
      );
      if (flattenedNested) {
        nestedProps[nestedName] = flattenedNested;
      }
    }
    if (Object.keys(nestedProps).length > 0) {
      universalProp.properties = nestedProps;
      if (resolvedProp.required) {
        universalProp.required = resolvedProp.required;
      }
    }
  }

  return universalProp;
}

// =============================================================================
// Reference Resolution
// =============================================================================

/**
 * Resolve a $ref to its definition.
 */
function resolveRef(
  ref: string,
  definitions: Record<string, InputJsonSchemaProperty>
): InputJsonSchemaProperty | null {
  // Handle local definitions (#/definitions/Name or #/$defs/Name)
  const localMatch = ref.match(/^#\/(?:definitions|\$defs)\/(.+)$/);
  if (localMatch) {
    const defName = localMatch[1];
    return definitions[defName] || null;
  }

  // For external refs, return null (can't resolve without fetching)
  return null;
}

/**
 * Merge multiple schemas from an allOf construct.
 */
function mergeAllOf(
  schemas: InputJsonSchemaProperty[],
  definitions: Record<string, InputJsonSchemaProperty>
): InputJsonSchemaProperty {
  const merged: InputJsonSchemaProperty = {
    type: 'object',
    properties: {},
    required: [],
  };

  for (const schema of schemas) {
    // Resolve $ref in allOf items
    let resolved = schema;
    if (schema.$ref) {
      resolved = resolveRef(schema.$ref, definitions) || schema;
    }

    // Merge type (prefer object)
    if (resolved.type && !merged.type) {
      merged.type = resolved.type;
    }

    // Merge properties
    if (resolved.properties) {
      merged.properties = { ...merged.properties, ...resolved.properties };
    }

    // Merge required arrays
    if (resolved.required) {
      merged.required = [...(merged.required || []), ...resolved.required];
    }

    // Merge description (concatenate)
    if (resolved.description) {
      merged.description = merged.description
        ? `${merged.description} ${resolved.description}`
        : resolved.description;
    }
  }

  // Dedupe required
  if (merged.required) {
    merged.required = Array.from(new Set(merged.required));
  }

  return merged;
}

/**
 * Flatten oneOf/anyOf by merging all options into a single schema.
 * For LLM compatibility, we merge all possible properties and note alternatives.
 */
function flattenOneOfAnyOf(
  schemas: InputJsonSchemaProperty[],
  definitions: Record<string, InputJsonSchemaProperty>,
  propName: string
): InputJsonSchemaProperty {
  // Resolve all refs first
  const resolved = schemas.map((s) => (s.$ref ? resolveRef(s.$ref, definitions) || s : s));

  // If all schemas are simple types, create a union description
  const simpleTypes = resolved
    .filter((s) => s.type && typeof s.type === 'string')
    .map((s) => s.type as string);

  if (simpleTypes.length === resolved.length && resolved.every((s) => !s.properties)) {
    // All simple types - pick the first non-null, add description about alternatives
    const primaryType = simpleTypes.find((t) => t !== 'null') || simpleTypes[0];
    return {
      type: primaryType,
      description: `Can be one of: ${simpleTypes.join(', ')}`,
    };
  }

  // Complex schemas - merge all properties
  const merged: InputJsonSchemaProperty = {
    type: 'object',
    properties: {},
    description: `${propName} - accepts multiple formats`,
  };

  for (const schema of resolved) {
    if (schema.properties) {
      merged.properties = { ...merged.properties, ...schema.properties };
    }
    // Take first non-null type
    if (schema.type && !merged.type) {
      merged.type = schema.type;
    }
  }

  return merged;
}

// =============================================================================
// Type Normalization
// =============================================================================

/**
 * Normalize JSON Schema type to a single LLM-compatible type.
 */
function normalizeType(
  schemaType: string | string[] | undefined
): 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object' {
  if (!schemaType) {
    return 'object';
  }

  // Handle array of types (e.g., ["string", "null"])
  if (Array.isArray(schemaType)) {
    // Filter out null and take the first type
    const nonNullTypes = schemaType.filter((t) => t !== 'null');
    if (nonNullTypes.length > 0) {
      return normalizeType(nonNullTypes[0]);
    }
    return 'string'; // Default if only null
  }

  // Map to valid universal types
  switch (schemaType) {
    case 'string':
    case 'number':
    case 'integer':
    case 'boolean':
    case 'array':
    case 'object':
      return schemaType;
    case 'null':
      return 'string'; // Treat null as optional string
    default:
      return 'object';
  }
}

// =============================================================================
// Description Building
// =============================================================================

/**
 * Build a property description including constraints and format hints.
 */
function buildPropertyDescription(prop: InputJsonSchemaProperty, propName: string): string {
  const parts: string[] = [];

  // Start with existing description or generate from name
  if (prop.description) {
    parts.push(prop.description);
  } else {
    // Convert camelCase/snake_case to readable format
    const readable = propName
      .replace(/([A-Z])/g, ' $1')
      .replace(/_/g, ' ')
      .trim()
      .toLowerCase();
    parts.push(`The ${readable}`);
  }

  // Add format hint
  if (prop.format) {
    parts.push(`(format: ${prop.format})`);
  }

  // Add constraints
  const constraints: string[] = [];
  if (prop.minimum !== undefined) {
    constraints.push(`min: ${prop.minimum}`);
  }
  if (prop.maximum !== undefined) {
    constraints.push(`max: ${prop.maximum}`);
  }
  if (prop.minLength !== undefined) {
    constraints.push(`min length: ${prop.minLength}`);
  }
  if (prop.maxLength !== undefined) {
    constraints.push(`max length: ${prop.maxLength}`);
  }
  if (prop.pattern) {
    constraints.push(`pattern: ${prop.pattern}`);
  }

  if (constraints.length > 0) {
    parts.push(`[${constraints.join(', ')}]`);
  }

  // Add enum values hint
  if (prop.enum && prop.enum.length > 0 && prop.enum.length <= 5) {
    parts.push(`Allowed values: ${prop.enum.join(', ')}`);
  } else if (prop.enum && prop.enum.length > 5) {
    parts.push(
      `Allowed values: ${prop.enum.slice(0, 3).join(', ')}... (${prop.enum.length} options)`
    );
  }

  // Add default hint
  if (prop.default !== undefined) {
    parts.push(`Default: ${JSON.stringify(prop.default)}`);
  }

  // Add nullable hint
  if (prop.nullable) {
    parts.push('Can be null');
  }

  return parts.join('. ').replace(/\.\./g, '.').trim();
}

/**
 * Extract context types from action metadata.
 * Context types indicate what reference data the tool can use.
 */
function extractContextTypes(action: ActionResponse): string[] {
  const contextTypes: string[] = [];

  // Check if action has reference data configuration
  if (action.metadata?.referenceData) {
    const refDataConfig = action.metadata.referenceData;
    if (refDataConfig.dataType) {
      contextTypes.push(refDataConfig.dataType);
    }
  }

  // Check tags for common context indicators
  if (action.tags) {
    for (const tag of action.tags) {
      const lowerTag = tag.toLowerCase();
      if (lowerTag.includes('user') && !contextTypes.includes('users')) {
        contextTypes.push('users');
      }
      if (lowerTag.includes('channel') && !contextTypes.includes('channels')) {
        contextTypes.push('channels');
      }
      if (lowerTag.includes('team') && !contextTypes.includes('teams')) {
        contextTypes.push('teams');
      }
    }
  }

  return contextTypes;
}

// =============================================================================
// Schema Enrichment (for empty inputSchemas)
// =============================================================================

/**
 * Extract path parameters from an endpoint template like "/v1/charges/{charge}/capture"
 */
function extractPathParams(endpointTemplate: string): string[] {
  const matches = endpointTemplate.match(/\{([^}]+)\}/g);
  if (!matches) return [];
  return matches.map((m) => m.slice(1, -1)); // Remove { and }
}

/**
 * Parse toolDescription to extract parameter hints.
 * Looks for patterns like "- param_name: description" in Required/Optional inputs sections.
 */
function extractParamsFromToolDescription(
  toolDescription: string | null
): Array<{ name: string; description: string; required: boolean }> {
  if (!toolDescription) return [];

  const params: Array<{ name: string; description: string; required: boolean }> = [];
  const lines = toolDescription.split('\n');
  let inRequired = false;
  let inOptional = false;

  for (const line of lines) {
    const lowerLine = line.toLowerCase();
    if (lowerLine.includes('required input')) {
      inRequired = true;
      inOptional = false;
      continue;
    }
    if (lowerLine.includes('optional input')) {
      inRequired = false;
      inOptional = true;
      continue;
    }
    if (line.startsWith('#') || line.startsWith('Use this tool')) {
      inRequired = false;
      inOptional = false;
      continue;
    }

    // Look for "- param_name: description" pattern
    const paramMatch = line.match(/^[\s-]*([a-z_][a-z0-9_]*)\s*[:\-]\s*(.+)/i);
    if (paramMatch && (inRequired || inOptional)) {
      params.push({
        name: paramMatch[1],
        description: paramMatch[2].trim(),
        required: inRequired,
      });
    }
  }

  return params;
}

/**
 * Enrich empty parameters by extracting info from endpointTemplate and toolDescription.
 */
function enrichEmptyParameters(
  action: ActionResponse,
  emptyParams: UniversalToolParameters
): UniversalToolParameters {
  const properties: Record<string, UniversalToolProperty> = {};
  const required: string[] = [];

  // Extract path parameters from endpoint template
  if (action.endpointTemplate) {
    const pathParams = extractPathParams(action.endpointTemplate);
    for (const param of pathParams) {
      properties[param] = {
        type: 'string',
        description: `The ${param.replace(/_/g, ' ')} identifier`,
      };
      required.push(param);
    }
  }

  // Extract parameters from toolDescription
  if (action.toolDescription) {
    const descParams = extractParamsFromToolDescription(action.toolDescription);
    for (const param of descParams) {
      if (!properties[param.name]) {
        properties[param.name] = {
          type: 'string',
          description: param.description,
        };
        if (param.required && !required.includes(param.name)) {
          required.push(param.name);
        }
      } else if (param.description.length > (properties[param.name].description?.length || 0)) {
        // Update with better description
        properties[param.name].description = param.description;
      }
    }
  }

  // If still no properties, return original
  if (Object.keys(properties).length === 0) {
    return emptyParams;
  }

  return {
    type: 'object',
    properties,
    required,
  };
}

// =============================================================================
// Exports
// =============================================================================

export { normalizeType, buildPropertyDescription, resolveRef, mergeAllOf, flattenOneOfAnyOf };
