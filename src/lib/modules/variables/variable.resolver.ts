/**
 * Variable Resolver
 *
 * Resolves variable references in templates using a priority-based resolution order:
 * 1. Request context (passed with tool invocation) - Highest priority
 * 2. Connection-level variables (specific to connection)
 * 3. Tenant-level variables (shared across connections)
 * 4. Built-in runtime variables (system-provided)
 * 5. Default value (if specified)
 * 6. Error or null (if required/optional)
 */

import type {
  RuntimeContext,
  ParsedVariableReference,
  ResolvedVariable,
  VariableResolutionOptions,
  VariableResolutionResult,
  VariableMap,
  ScopedVariables,
} from './types';
import { REDACTED_VALUE } from './variable.schemas';
import {
  parseVariableReferences,
  replaceVariableReferences,
  valueToString,
} from './variable.parser';
import { buildRuntimeContext, getContextValue, type RuntimeContextInput } from './runtime-context';
import { getScopedVariables } from './variable.repository';
import { getVariableCache } from './variable.cache';

// =============================================================================
// Types
// =============================================================================

/**
 * Extended options for variable resolution (internal use)
 */
interface InternalResolutionOptions extends VariableResolutionOptions {
  /** Pre-loaded scoped variables (skip DB/cache lookup) */
  scopedVariables?: ScopedVariables;
  /** Pre-built runtime context */
  builtRuntimeContext?: RuntimeContext;
}

/**
 * Result of resolving a single variable
 */
interface SingleVariableResult {
  value: unknown;
  source: ResolvedVariable['source'];
  found: boolean;
  sensitive: boolean;
}

// =============================================================================
// Main Resolver Functions
// =============================================================================

/**
 * Resolves all variable references in a template string
 *
 * Resolution priority order:
 * 1. Request context (highest)
 * 2. Connection-level variables
 * 3. Tenant-level variables
 * 4. Runtime context (current_user, connection, request)
 * 5. Default value (if provided)
 *
 * @param template - Template string with ${...} references
 * @param options - Resolution options
 * @returns Resolution result with resolved string and metadata
 *
 * @example
 * ```ts
 * const result = await resolveTemplate(
 *   '/api/${var.api_version}/users/${current_user.id}',
 *   {
 *     tenantId: 'tenant_123',
 *     connectionId: 'conn_456',
 *     runtimeContext: { current_user: { id: 'user_789' } }
 *   }
 * );
 * // result.resolved === '/api/v2/users/user_789'
 * ```
 */
export async function resolveTemplate(
  template: string,
  options: VariableResolutionOptions
): Promise<VariableResolutionResult> {
  // Parse all variable references
  const references = parseVariableReferences(template);

  if (references.length === 0) {
    return {
      resolved: template,
      variables: [],
      allFound: true,
      missing: [],
    };
  }

  // Load required data
  const { scopedVariables, runtimeContext } = await loadResolutionData(options);

  // Resolve each variable
  const resolvedVariables: ResolvedVariable[] = [];
  const valueMap: Record<string, unknown> = {};

  for (const ref of references) {
    const result = resolveVariable(ref, {
      ...options,
      scopedVariables,
      builtRuntimeContext: runtimeContext,
    });

    resolvedVariables.push({
      reference: ref,
      ...result,
    });

    if (result.found) {
      valueMap[ref.path] = result.value;
    }
  }

  // Replace references in template
  const resolved = replaceVariableReferences(template, valueMap, {
    missingValue: options.defaultValue !== undefined ? valueToString(options.defaultValue) : '',
    keepMissing: false,
  });

  // Determine missing variables
  const missing = resolvedVariables.filter((v) => !v.found).map((v) => v.reference);

  // Throw if required and missing
  if (options.throwOnMissing && missing.length > 0) {
    const missingPaths = missing.map((m) => m.path).join(', ');
    throw new VariableResolutionError(`Missing required variables: ${missingPaths}`, missing);
  }

  return {
    resolved,
    variables: resolvedVariables,
    allFound: missing.length === 0,
    missing,
  };
}

/**
 * Resolves a single variable value by path
 *
 * @param path - Variable path (e.g., "var.api_version", "current_user.id")
 * @param options - Resolution options
 * @returns The resolved value or undefined if not found
 */
export async function resolveValue(
  path: string,
  options: VariableResolutionOptions
): Promise<unknown> {
  // Create a temporary reference
  const ref: ParsedVariableReference = {
    fullMatch: `\${${path}}`,
    path,
    namespace: path.split('.')[0],
    key: path.split('.').slice(1).join('.'),
    startIndex: 0,
    endIndex: path.length + 3,
  };

  const { scopedVariables, runtimeContext } = await loadResolutionData(options);

  const result = resolveVariable(ref, {
    ...options,
    scopedVariables,
    builtRuntimeContext: runtimeContext,
  });

  return result.found ? result.value : options.defaultValue;
}

/**
 * Resolves multiple templates in batch (more efficient than calling resolveTemplate multiple times)
 */
export async function resolveTemplates(
  templates: Record<string, string>,
  options: VariableResolutionOptions
): Promise<Record<string, VariableResolutionResult>> {
  // Load data once
  const { scopedVariables, runtimeContext } = await loadResolutionData(options);

  const results: Record<string, VariableResolutionResult> = {};

  for (const [key, template] of Object.entries(templates)) {
    const references = parseVariableReferences(template);

    if (references.length === 0) {
      results[key] = {
        resolved: template,
        variables: [],
        allFound: true,
        missing: [],
      };
      continue;
    }

    const resolvedVariables: ResolvedVariable[] = [];
    const valueMap: Record<string, unknown> = {};

    for (const ref of references) {
      const result = resolveVariable(ref, {
        ...options,
        scopedVariables,
        builtRuntimeContext: runtimeContext,
      });

      resolvedVariables.push({
        reference: ref,
        ...result,
      });

      if (result.found) {
        valueMap[ref.path] = result.value;
      }
    }

    const resolved = replaceVariableReferences(template, valueMap, {
      missingValue: options.defaultValue !== undefined ? valueToString(options.defaultValue) : '',
      keepMissing: false,
    });

    const missing = resolvedVariables.filter((v) => !v.found).map((v) => v.reference);

    results[key] = {
      resolved,
      variables: resolvedVariables,
      allFound: missing.length === 0,
      missing,
    };
  }

  return results;
}

// =============================================================================
// Internal Resolution Logic
// =============================================================================

/**
 * Loads all data required for resolution
 */
async function loadResolutionData(options: VariableResolutionOptions): Promise<{
  scopedVariables: ScopedVariables;
  runtimeContext: RuntimeContext;
}> {
  // Build runtime context
  const runtimeContext = buildRuntimeContext({
    currentUser: options.runtimeContext?.current_user,
    connection: options.runtimeContext?.connection
      ? {
          id: options.runtimeContext.connection.id,
          name: options.runtimeContext.connection.name,
          workspaceId: options.runtimeContext.connection.workspaceId,
        }
      : undefined,
    request: options.runtimeContext?.request,
  } as RuntimeContextInput);

  // Get scoped variables (from cache or DB)
  const cache = getVariableCache();
  let scopedVariables: ScopedVariables;

  const cached = cache.get(options.tenantId, options.connectionId ?? null, options.environment);

  if (cached) {
    scopedVariables = cached;
  } else {
    scopedVariables = await getScopedVariables({
      tenantId: options.tenantId,
      connectionId: options.connectionId,
      environment: options.environment,
    });

    cache.set(options.tenantId, options.connectionId ?? null, options.environment, scopedVariables);
  }

  return { scopedVariables, runtimeContext };
}

/**
 * Resolves a single variable reference using priority order
 */
function resolveVariable(
  ref: ParsedVariableReference,
  options: InternalResolutionOptions
): SingleVariableResult {
  const { scopedVariables, builtRuntimeContext, requestVariables } = options;

  // 1. Check request context (highest priority)
  if (requestVariables) {
    const requestValue = getNestedValue(requestVariables, ref.path);
    if (requestValue !== undefined) {
      return {
        value: requestValue,
        source: 'request_context',
        found: true,
        sensitive: false,
      };
    }

    // Also check by just the key for var namespace
    if (ref.namespace === 'var') {
      const keyValue = requestVariables[ref.key];
      if (keyValue !== undefined) {
        return {
          value: keyValue,
          source: 'request_context',
          found: true,
          sensitive: false,
        };
      }
    }
  }

  // 2. Check connection-level variables
  if (scopedVariables && ref.namespace === 'var') {
    const connVar = scopedVariables.connection[ref.key];
    if (connVar !== undefined) {
      const value = getVariableValue(connVar);
      return {
        value,
        source: 'connection_variable',
        found: true,
        sensitive: connVar.sensitive,
      };
    }
  }

  // 3. Check tenant-level variables
  if (scopedVariables && ref.namespace === 'var') {
    const tenantVar = scopedVariables.tenant[ref.key];
    if (tenantVar !== undefined) {
      const value = getVariableValue(tenantVar);
      return {
        value,
        source: 'tenant_variable',
        found: true,
        sensitive: tenantVar.sensitive,
      };
    }
  }

  // 4. Check runtime context
  if (builtRuntimeContext) {
    const runtimeValue = getContextValue(builtRuntimeContext, ref.namespace, ref.key);
    if (runtimeValue !== undefined) {
      return {
        value: runtimeValue,
        source: 'runtime',
        found: true,
        sensitive: false,
      };
    }
  }

  // 5. Use default value if provided
  if (options.defaultValue !== undefined) {
    return {
      value: options.defaultValue,
      source: 'default',
      found: true,
      sensitive: false,
    };
  }

  // 6. Not found
  return {
    value: undefined,
    source: 'not_found',
    found: false,
    sensitive: false,
  };
}

/**
 * Gets the actual value from a variable map entry
 * Handles decryption of sensitive variables
 */
function getVariableValue(entry: VariableMap[string]): unknown {
  // For sensitive variables, the value in the map should already be decrypted
  // by the repository layer when needed. Here we just return the value.
  return entry.value;
}

/**
 * Gets a nested value from an object using dot notation
 */
function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = obj;

  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }
    if (typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }

  return current;
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Masks sensitive values in resolution results for logging/API responses
 *
 * This function:
 * - Masks the `value` field in the variables array
 * - Replaces sensitive values with [REDACTED] in the resolved string
 *
 * Use this when returning resolution results to external consumers
 * (API responses, logs) but NOT when using values for actual execution.
 */
export function maskSensitiveValues(result: VariableResolutionResult): VariableResolutionResult {
  // Build a masked resolved string by replacing sensitive values
  let maskedResolved = result.resolved;

  for (const v of result.variables) {
    if (v.sensitive && v.found && v.value !== undefined) {
      // Convert value to string for replacement
      const valueStr = valueToString(v.value);
      // Only replace if the value is actually in the resolved string
      // Use a safe replacement (escape regex special chars)
      if (valueStr && maskedResolved.includes(valueStr)) {
        maskedResolved = maskedResolved.split(valueStr).join(REDACTED_VALUE);
      }
    }
  }

  return {
    ...result,
    resolved: maskedResolved,
    variables: result.variables.map((v) => ({
      ...v,
      value: v.sensitive ? REDACTED_VALUE : v.value,
    })),
  };
}

/**
 * Creates a summary of resolution results for logging
 */
export function summarizeResolution(result: VariableResolutionResult): {
  totalVariables: number;
  found: number;
  missing: number;
  bySources: Record<string, number>;
} {
  const bySources: Record<string, number> = {};

  for (const v of result.variables) {
    bySources[v.source] = (bySources[v.source] || 0) + 1;
  }

  return {
    totalVariables: result.variables.length,
    found: result.variables.filter((v) => v.found).length,
    missing: result.missing.length,
    bySources,
  };
}

// =============================================================================
// Preview/Validation
// =============================================================================

/**
 * Previews variable resolution without actually resolving from DB
 * Useful for UI validation and autocomplete
 */
export function previewResolution(
  template: string,
  mockValues: Record<string, unknown> = {}
): {
  references: ParsedVariableReference[];
  preview: string;
  unresolvedRefs: string[];
} {
  const references = parseVariableReferences(template);

  const preview = replaceVariableReferences(template, mockValues, {
    keepMissing: true,
  });

  const unresolvedRefs = references
    .filter((ref) => mockValues[ref.path] === undefined)
    .map((ref) => ref.path);

  return {
    references,
    preview,
    unresolvedRefs,
  };
}

/**
 * Validates that all variable references in a template can be resolved
 */
export async function validateResolvability(
  template: string,
  options: VariableResolutionOptions
): Promise<{
  valid: boolean;
  resolvable: string[];
  unresolvable: string[];
}> {
  const result = await resolveTemplate(template, {
    ...options,
    throwOnMissing: false,
  });

  const resolvable = result.variables.filter((v) => v.found).map((v) => v.reference.path);

  const unresolvable = result.missing.map((m) => m.path);

  return {
    valid: unresolvable.length === 0,
    resolvable,
    unresolvable,
  };
}

// =============================================================================
// Errors
// =============================================================================

/**
 * Error thrown when variable resolution fails
 */
export class VariableResolutionError extends Error {
  constructor(
    message: string,
    public readonly missingReferences: ParsedVariableReference[]
  ) {
    super(message);
    this.name = 'VariableResolutionError';
  }
}
