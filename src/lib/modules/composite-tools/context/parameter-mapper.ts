/**
 * Parameter Mapper
 *
 * Maps unified parameters from a composite tool invocation to
 * operation-specific parameters for the selected action.
 *
 * This module handles:
 * - Parameter name translation (unified → operation-specific)
 * - Parameter validation against the operation's schema
 * - Tracking of parameter mappings for transparency/debugging
 */

import type { Action } from '@prisma/client';
import type { CompositeToolOperation } from '@prisma/client';
import type { JSONSchema7 } from 'json-schema';
import type { UnifiedSchemaConfig } from '../composite-tool.schemas';
import { mapParametersToOperation as baseMappingFn } from '../routing/schema-merger';

// =============================================================================
// Types
// =============================================================================

/**
 * A single parameter mapping record
 */
export interface ParameterMappingRecord {
  /** The unified parameter name */
  unifiedName: string;
  /** The operation-specific parameter name */
  targetName: string;
  /** The value that was mapped */
  value: unknown;
  /** Whether this parameter was explicitly mapped or passed through */
  mapped: boolean;
}

/**
 * Result of parameter mapping
 */
export interface ParameterMappingResult {
  /** The mapped parameters ready for action invocation */
  mappedParams: Record<string, unknown>;
  /** Detailed mapping records for transparency */
  mappings: ParameterMappingRecord[];
  /** Parameters that were not mapped (passed through as-is) */
  unmappedParams: string[];
  /** Validation errors if any */
  validationErrors: string[];
  /** Whether the mapping was successful */
  success: boolean;
}

/**
 * Options for parameter mapping
 */
export interface ParameterMappingOptions {
  /** Skip validation against action schema */
  skipValidation?: boolean;
  /** Strip unknown parameters not in the action schema */
  stripUnknown?: boolean;
  /** Apply default values from action schema */
  applyDefaults?: boolean;
}

// =============================================================================
// Error Class
// =============================================================================

/**
 * Error thrown when parameter mapping fails
 */
export class ParameterMappingError extends Error {
  constructor(
    message: string,
    public readonly errors: string[],
    public readonly operationSlug: string
  ) {
    super(message);
    this.name = 'ParameterMappingError';
  }
}

// =============================================================================
// Main Mapping Functions
// =============================================================================

/**
 * Maps unified parameters to operation-specific parameters
 *
 * @param unifiedParams - Parameters from the composite tool invocation
 * @param operation - The selected operation
 * @param action - The underlying action
 * @param unifiedSchemaConfig - The unified schema configuration with mappings
 * @param options - Mapping options
 * @returns The mapping result with mapped parameters and metadata
 */
export function mapParameters(
  unifiedParams: Record<string, unknown>,
  operation: CompositeToolOperation,
  action: Action,
  unifiedSchemaConfig: UnifiedSchemaConfig | null,
  options: ParameterMappingOptions = {}
): ParameterMappingResult {
  const { skipValidation = false, stripUnknown = false, applyDefaults = true } = options;

  const mappings: ParameterMappingRecord[] = [];
  const unmappedParams: string[] = [];
  const validationErrors: string[] = [];

  // Use the base mapping function if we have a unified schema config
  let mappedParams: Record<string, unknown>;

  if (unifiedSchemaConfig && Object.keys(unifiedSchemaConfig.parameters).length > 0) {
    mappedParams = baseMappingFn(unifiedParams, operation, unifiedSchemaConfig);

    // Track what was mapped
    for (const [unifiedName, value] of Object.entries(unifiedParams)) {
      // Skip the operation parameter (used for agent-driven routing)
      if (unifiedName === 'operation' || unifiedName === 'operationSlug') {
        continue;
      }

      const paramConfig = unifiedSchemaConfig.parameters[unifiedName];
      const operationMapping = paramConfig?.operationMappings[operation.operationSlug];

      if (operationMapping) {
        mappings.push({
          unifiedName,
          targetName: operationMapping.targetParam,
          value,
          mapped: operationMapping.targetParam !== unifiedName,
        });
      } else {
        // Parameter passed through without mapping
        mappings.push({
          unifiedName,
          targetName: unifiedName,
          value,
          mapped: false,
        });
        unmappedParams.push(unifiedName);
      }
    }
  } else {
    // No unified schema config - apply operation-level mapping or pass through
    mappedParams = applyOperationMapping(unifiedParams, operation, mappings, unmappedParams);
  }

  // Apply defaults from action schema
  if (applyDefaults) {
    const inputSchema = action.inputSchema as JSONSchema7 | null;
    if (inputSchema?.properties) {
      for (const [propName, propDef] of Object.entries(inputSchema.properties)) {
        if (
          typeof propDef === 'object' &&
          propDef !== null &&
          'default' in propDef &&
          mappedParams[propName] === undefined
        ) {
          mappedParams[propName] = propDef.default;
        }
      }
    }
  }

  // Strip unknown parameters if requested
  if (stripUnknown) {
    const inputSchema = action.inputSchema as JSONSchema7 | null;
    if (inputSchema?.properties) {
      const knownParams = new Set(Object.keys(inputSchema.properties));
      for (const param of Object.keys(mappedParams)) {
        if (!knownParams.has(param)) {
          delete mappedParams[param];
        }
      }
    }
  }

  // Validate against action schema
  if (!skipValidation) {
    const errors = validateMappedParams(mappedParams, action);
    validationErrors.push(...errors);
  }

  return {
    mappedParams,
    mappings,
    unmappedParams,
    validationErrors,
    success: validationErrors.length === 0,
  };
}

/**
 * Applies operation-level parameter mapping
 */
function applyOperationMapping(
  unifiedParams: Record<string, unknown>,
  operation: CompositeToolOperation,
  mappings: ParameterMappingRecord[],
  unmappedParams: string[]
): Record<string, unknown> {
  const mappedParams: Record<string, unknown> = {};
  const operationMapping = (operation.parameterMapping as Record<string, unknown>) || {};

  for (const [unifiedName, value] of Object.entries(unifiedParams)) {
    // Skip the operation parameter
    if (unifiedName === 'operation' || unifiedName === 'operationSlug') {
      continue;
    }

    const mapping = operationMapping[unifiedName];

    if (typeof mapping === 'object' && mapping !== null && 'targetParam' in mapping) {
      const targetParam = (mapping as { targetParam: string }).targetParam;
      mappedParams[targetParam] = value;
      mappings.push({
        unifiedName,
        targetName: targetParam,
        value,
        mapped: targetParam !== unifiedName,
      });
    } else {
      // Pass through as-is
      mappedParams[unifiedName] = value;
      mappings.push({
        unifiedName,
        targetName: unifiedName,
        value,
        mapped: false,
      });
      unmappedParams.push(unifiedName);
    }
  }

  return mappedParams;
}

/**
 * Validates mapped parameters against the action's input schema
 */
function validateMappedParams(params: Record<string, unknown>, action: Action): string[] {
  const errors: string[] = [];
  const inputSchema = action.inputSchema as JSONSchema7 | null;

  if (!inputSchema) {
    return errors;
  }

  // Check required parameters
  if (inputSchema.required) {
    for (const required of inputSchema.required) {
      if (params[required] === undefined || params[required] === null) {
        errors.push(`Missing required parameter: ${required}`);
      }
    }
  }

  // Basic type validation for provided parameters
  if (inputSchema.properties) {
    for (const [paramName, value] of Object.entries(params)) {
      const schema = inputSchema.properties[paramName];
      if (!schema || typeof schema === 'boolean') continue;

      const expectedType = schema.type;
      const actualType = getValueType(value);

      if (expectedType && actualType !== 'null') {
        // Handle type arrays (e.g., ["string", "null"])
        const types = Array.isArray(expectedType) ? expectedType : [expectedType];
        const typesArray = types as string[];
        if (!typesArray.includes(actualType)) {
          // Allow string coercion for numbers
          if (!(typesArray.includes('string') && actualType === 'number')) {
            errors.push(
              `Parameter '${paramName}' expected type ${typesArray.join(' | ')} but got ${actualType}`
            );
          }
        }
      }

      // Enum validation
      if (schema.enum && !schema.enum.includes(value as never)) {
        errors.push(
          `Parameter '${paramName}' value '${value}' not in allowed values: ${schema.enum.join(', ')}`
        );
      }
    }
  }

  return errors;
}

/**
 * Gets the JSON Schema type of a value
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

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Extracts operation slug from params if present (for agent-driven mode)
 * Removes it from the params before mapping
 */
export function extractAndRemoveOperationSlug(params: Record<string, unknown>): {
  operationSlug: string | undefined;
  cleanedParams: Record<string, unknown>;
} {
  const { operation, operationSlug, ...cleanedParams } = params;

  const slug = (operation as string | undefined) ?? (operationSlug as string | undefined);

  return {
    operationSlug: slug,
    cleanedParams: cleanedParams as Record<string, unknown>,
  };
}

/**
 * Summarizes the mapping result for logging/debugging
 */
export function summarizeMappingResult(result: ParameterMappingResult): {
  totalParams: number;
  mappedCount: number;
  passedThroughCount: number;
  validationErrorCount: number;
} {
  return {
    totalParams: result.mappings.length,
    mappedCount: result.mappings.filter((m) => m.mapped).length,
    passedThroughCount: result.unmappedParams.length,
    validationErrorCount: result.validationErrors.length,
  };
}

/**
 * Creates an error response for parameter mapping failures
 */
export function createMappingErrorResponse(
  operationSlug: string,
  validationErrors: string[]
): ParameterMappingError {
  const errorMessage =
    validationErrors.length === 1
      ? validationErrors[0]
      : `${validationErrors.length} parameter validation errors`;

  return new ParameterMappingError(errorMessage, validationErrors, operationSlug);
}
