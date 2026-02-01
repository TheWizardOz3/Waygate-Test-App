/**
 * Schema Merger
 *
 * Merges input schemas from multiple operations into a unified schema
 * for composite tools. Handles parameter mapping, type reconciliation,
 * and conflict resolution.
 *
 * The unified schema presents a single interface to the composite tool
 * while supporting different underlying parameter names per operation.
 */

import type { Action } from '@prisma/client';
import type { CompositeToolOperation } from '@prisma/client';
import type { JsonSchemaProperty } from '../../actions/action.schemas';
import type { UnifiedSchemaConfig } from '../composite-tool.schemas';

// =============================================================================
// Types
// =============================================================================

/**
 * Input schema structure from an Action
 */
export interface ActionInputSchema {
  type?: string;
  properties?: Record<string, JsonSchemaProperty>;
  required?: string[];
  additionalProperties?: boolean | JsonSchemaProperty;
  description?: string;
  title?: string;
}

/**
 * Operation with its associated action and schema
 */
export interface OperationWithAction {
  operation: CompositeToolOperation;
  action: Action;
}

/**
 * Merged parameter definition
 */
export interface MergedParameter {
  name: string;
  type: string;
  description: string;
  required: boolean;
  enum?: (string | number | boolean)[];
  default?: unknown;
  /** Which operations support this parameter */
  supportedByOperations: string[];
  /** Mapping from operation slug to target parameter name */
  operationMappings: Record<string, { targetParam: string; transform?: string }>;
  /** Original properties from source schemas (for reference) */
  sourceProperties: Record<string, JsonSchemaProperty>;
}

/**
 * Result of merging schemas
 */
export interface MergedSchemaResult {
  /** The unified input schema for the composite tool */
  unifiedSchema: {
    type: 'object';
    properties: Record<string, JsonSchemaProperty>;
    required: string[];
  };
  /** Detailed parameter configuration with mappings */
  parameterConfig: UnifiedSchemaConfig;
  /** Warnings about potential conflicts or issues */
  warnings: string[];
}

/**
 * Options for schema merging
 */
export interface SchemaMergeOptions {
  /** How to handle type conflicts between operations */
  typeConflictStrategy?: 'first' | 'most-common' | 'string';
  /** Whether a parameter is required if required in ANY operation or ALL operations */
  requiredStrategy?: 'any' | 'all';
  /** Whether to include operation-specific parameters not common to all */
  includeOperationSpecific?: boolean;
}

// =============================================================================
// Error Class
// =============================================================================

/**
 * Error thrown when schema merging fails
 */
export class SchemaMergeError extends Error {
  constructor(
    message: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'SchemaMergeError';
  }
}

// =============================================================================
// Main Merge Functions
// =============================================================================

/**
 * Merges input schemas from multiple operations into a unified schema
 *
 * @param operationsWithActions - Operations with their associated actions
 * @param options - Merge options
 * @returns Merged schema result with unified schema and parameter mappings
 */
export function mergeOperationSchemas(
  operationsWithActions: OperationWithAction[],
  options: SchemaMergeOptions = {}
): MergedSchemaResult {
  const {
    typeConflictStrategy = 'string',
    requiredStrategy = 'any',
    includeOperationSpecific = true,
  } = options;

  const warnings: string[] = [];

  // Collect all parameters from all operations
  const parametersByName = new Map<string, MergedParameter>();

  for (const { operation, action } of operationsWithActions) {
    const inputSchema = (action.inputSchema as ActionInputSchema) || {};
    const properties = inputSchema.properties || {};
    const required = new Set(inputSchema.required || []);

    // Check for explicit parameter mapping on the operation
    const parameterMapping = (operation.parameterMapping as Record<string, unknown>) || {};

    for (const [paramName, paramSchema] of Object.entries(properties)) {
      // Determine the unified parameter name
      // If there's a mapping that points to this param, use the unified name
      let unifiedName = paramName;
      for (const [unifiedKey, mapping] of Object.entries(parameterMapping)) {
        if (
          typeof mapping === 'object' &&
          mapping !== null &&
          'targetParam' in mapping &&
          mapping.targetParam === paramName
        ) {
          unifiedName = unifiedKey;
          break;
        }
      }

      const existingParam = parametersByName.get(unifiedName);

      if (existingParam) {
        // Merge with existing parameter
        const merged = mergeParameter(
          existingParam,
          unifiedName,
          paramSchema,
          operation.operationSlug,
          paramName,
          required.has(paramName),
          typeConflictStrategy,
          warnings
        );
        parametersByName.set(unifiedName, merged);
      } else {
        // Create new parameter entry
        parametersByName.set(unifiedName, {
          name: unifiedName,
          type: normalizeType(paramSchema.type),
          description: paramSchema.description || `Parameter: ${unifiedName}`,
          required: required.has(paramName),
          enum: paramSchema.enum,
          default: paramSchema.default,
          supportedByOperations: [operation.operationSlug],
          operationMappings: {
            [operation.operationSlug]: { targetParam: paramName },
          },
          sourceProperties: {
            [operation.operationSlug]: paramSchema,
          },
        });
      }
    }
  }

  // Filter parameters based on options
  let parameters = Array.from(parametersByName.values());
  if (!includeOperationSpecific) {
    // Only include parameters that are supported by all operations
    const operationCount = operationsWithActions.length;
    parameters = parameters.filter((p) => p.supportedByOperations.length === operationCount);
  }

  // Determine which parameters are required based on strategy
  for (const param of parameters) {
    if (requiredStrategy === 'all') {
      // Required only if required in ALL operations that support it
      param.required = param.supportedByOperations.every((opSlug) => {
        const op = operationsWithActions.find((o) => o.operation.operationSlug === opSlug);
        if (!op) return false;
        const schema = (op.action.inputSchema as ActionInputSchema) || {};
        return (schema.required || []).includes(param.operationMappings[opSlug].targetParam);
      });
    }
    // For 'any' strategy, we keep the initial required value (true if required in any)
  }

  // Build the unified schema
  const unifiedProperties: Record<string, JsonSchemaProperty> = {};
  const requiredParams: string[] = [];

  for (const param of parameters) {
    unifiedProperties[param.name] = {
      type: param.type as JsonSchemaProperty['type'],
      description: param.description,
      ...(param.enum && { enum: param.enum }),
      ...(param.default !== undefined && { default: param.default }),
    };

    if (param.required) {
      requiredParams.push(param.name);
    }
  }

  // Build the parameter config
  const parameterConfig: UnifiedSchemaConfig = {
    parameters: {},
  };

  for (const param of parameters) {
    parameterConfig.parameters[param.name] = {
      type: param.type,
      description: param.description,
      required: param.required,
      operationMappings: param.operationMappings,
    };
  }

  return {
    unifiedSchema: {
      type: 'object',
      properties: unifiedProperties,
      required: requiredParams,
    },
    parameterConfig,
    warnings,
  };
}

/**
 * Merges a new parameter into an existing merged parameter
 */
function mergeParameter(
  existing: MergedParameter,
  unifiedName: string,
  newSchema: JsonSchemaProperty,
  operationSlug: string,
  targetParam: string,
  isRequired: boolean,
  typeConflictStrategy: 'first' | 'most-common' | 'string',
  warnings: string[]
): MergedParameter {
  const newType = normalizeType(newSchema.type);

  // Check for type conflicts
  if (existing.type !== newType) {
    warnings.push(
      `Type conflict for parameter '${unifiedName}': ${existing.type} vs ${newType} (operation: ${operationSlug})`
    );

    // Resolve based on strategy
    if (typeConflictStrategy === 'string') {
      existing.type = 'string';
    } else if (typeConflictStrategy === 'most-common') {
      // Keep the existing type (already the most common so far)
    }
    // 'first' strategy keeps the existing type as-is
  }

  // Merge required status (any = true if any requires, all handled later)
  if (isRequired) {
    existing.required = true;
  }

  // Merge enum values
  if (newSchema.enum) {
    if (existing.enum) {
      // Combine enum values (unique)
      const combined = new Set([...existing.enum, ...newSchema.enum]);
      existing.enum = Array.from(combined);
    } else {
      existing.enum = [...newSchema.enum];
    }
  }

  // Merge description (use longer one or first non-empty)
  if (newSchema.description && newSchema.description.length > existing.description.length) {
    existing.description = newSchema.description;
  }

  // Add to supported operations
  if (!existing.supportedByOperations.includes(operationSlug)) {
    existing.supportedByOperations.push(operationSlug);
  }

  // Add operation mapping
  existing.operationMappings[operationSlug] = { targetParam };

  // Store source property
  existing.sourceProperties[operationSlug] = newSchema;

  return existing;
}

/**
 * Normalizes a JSON Schema type to a string
 */
function normalizeType(type: JsonSchemaProperty['type']): string {
  if (!type) return 'string';
  if (Array.isArray(type)) {
    // For union types, prefer the first non-null type
    const nonNull = type.filter((t) => t !== 'null');
    return nonNull[0] || 'string';
  }
  return type;
}

// =============================================================================
// Parameter Mapping Functions
// =============================================================================

/**
 * Maps unified parameters to operation-specific parameters
 *
 * @param unifiedParams - Parameters from the composite tool invocation
 * @param operation - The selected operation
 * @param parameterConfig - The unified schema configuration
 * @returns Parameters mapped for the specific operation
 */
export function mapParametersToOperation(
  unifiedParams: Record<string, unknown>,
  operation: CompositeToolOperation,
  parameterConfig: UnifiedSchemaConfig
): Record<string, unknown> {
  const mappedParams: Record<string, unknown> = {};
  const operationSlug = operation.operationSlug;

  // First, apply mappings from the unified config
  for (const [unifiedName, value] of Object.entries(unifiedParams)) {
    const paramConfig = parameterConfig.parameters[unifiedName];

    if (paramConfig && paramConfig.operationMappings[operationSlug]) {
      // Use the mapped target parameter name
      const { targetParam } = paramConfig.operationMappings[operationSlug];
      mappedParams[targetParam] = value;
    } else {
      // No mapping found - pass through as-is
      mappedParams[unifiedName] = value;
    }
  }

  // Then, apply any operation-level parameter mapping overrides
  const operationMapping = (operation.parameterMapping as Record<string, unknown>) || {};

  for (const [unifiedName, mapping] of Object.entries(operationMapping)) {
    if (
      typeof mapping === 'object' &&
      mapping !== null &&
      'targetParam' in mapping &&
      unifiedParams[unifiedName] !== undefined
    ) {
      const targetParam = (mapping as { targetParam: string }).targetParam;
      mappedParams[targetParam] = unifiedParams[unifiedName];
      // Remove the unified name if it's different
      if (targetParam !== unifiedName) {
        delete mappedParams[unifiedName];
      }
    }
  }

  return mappedParams;
}

/**
 * Extracts the operation enum values for agent-driven mode
 *
 * @param operations - The operations in the composite tool
 * @returns Array of operation slugs for the enum
 */
export function getOperationEnumValues(operations: CompositeToolOperation[]): string[] {
  return operations.map((op) => op.operationSlug);
}

/**
 * Builds the schema for agent-driven mode with operation enum
 *
 * @param unifiedSchema - The base unified schema
 * @param operations - The operations in the composite tool
 * @returns Schema with operation parameter added
 */
export function buildAgentDrivenSchema(
  unifiedSchema: {
    type: 'object';
    properties: Record<string, JsonSchemaProperty>;
    required: string[];
  },
  operations: CompositeToolOperation[]
): {
  type: 'object';
  properties: Record<string, JsonSchemaProperty>;
  required: string[];
} {
  const operationEnum = getOperationEnumValues(operations);

  return {
    type: 'object',
    properties: {
      operation: {
        type: 'string',
        description: `The operation to use. Choose based on the input context and requirements.`,
        enum: operationEnum,
      },
      ...unifiedSchema.properties,
    },
    required: ['operation', ...unifiedSchema.required],
  };
}

// =============================================================================
// Schema Validation
// =============================================================================

/**
 * Validates that unified parameters match the schema requirements
 *
 * @param params - Parameters to validate
 * @param unifiedSchema - The unified schema
 * @returns Validation result with any errors
 */
export function validateUnifiedParams(
  params: Record<string, unknown>,
  unifiedSchema: {
    type: 'object';
    properties: Record<string, JsonSchemaProperty>;
    required: string[];
  }
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check required parameters
  for (const required of unifiedSchema.required) {
    if (params[required] === undefined || params[required] === null) {
      errors.push(`Missing required parameter: ${required}`);
    }
  }

  // Basic type validation for provided parameters
  for (const [paramName, value] of Object.entries(params)) {
    const schema = unifiedSchema.properties[paramName];
    if (!schema) continue; // Unknown parameter, skip validation

    const expectedType = normalizeType(schema.type);
    const actualType = getValueType(value);

    if (expectedType !== actualType && actualType !== 'null') {
      // Allow null for optional params, string coercion for numbers
      if (!(expectedType === 'string' && actualType === 'number')) {
        errors.push(`Parameter '${paramName}' expected ${expectedType} but got ${actualType}`);
      }
    }

    // Enum validation
    if (schema.enum && !schema.enum.includes(value as string | number | boolean)) {
      errors.push(
        `Parameter '${paramName}' value '${value}' not in allowed values: ${schema.enum.join(', ')}`
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Gets the type of a value as a JSON Schema type string
 */
function getValueType(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  const type = typeof value;
  if (type === 'number') {
    return Number.isInteger(value) ? 'integer' : 'number';
  }
  return type;
}
