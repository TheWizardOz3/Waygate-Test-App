/**
 * Variable Parser
 *
 * Parses template strings to extract ${...} variable references.
 * Supports built-in namespaces (current_user, connection, request) and user-defined variables (var).
 *
 * Syntax:
 * - ${var.name}              - User-defined variable
 * - ${current_user.id}       - Built-in: Current user context
 * - ${connection.name}       - Built-in: Connection context
 * - ${request.id}            - Built-in: Request context
 */

import type { ParsedVariableReference } from './types';

// =============================================================================
// Constants
// =============================================================================

/**
 * Valid namespaces for variable references
 */
export const VALID_NAMESPACES = ['var', 'current_user', 'connection', 'request'] as const;
export type ValidNamespace = (typeof VALID_NAMESPACES)[number];

/**
 * Regex pattern for matching ${...} variable references
 * Captures: namespace.key (e.g., "var.api_version", "current_user.id")
 */
const VARIABLE_PATTERN = /\$\{([a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)*)\}/g;

// =============================================================================
// Parser Functions
// =============================================================================

/**
 * Parses a template string and extracts all variable references
 *
 * @param template - The template string containing ${...} references
 * @returns Array of parsed variable references
 *
 * @example
 * ```ts
 * const refs = parseVariableReferences('/api/${var.api_version}/users/${current_user.id}');
 * // Returns:
 * // [
 * //   { fullMatch: '${var.api_version}', path: 'var.api_version', namespace: 'var', key: 'api_version', ... },
 * //   { fullMatch: '${current_user.id}', path: 'current_user.id', namespace: 'current_user', key: 'id', ... }
 * // ]
 * ```
 */
export function parseVariableReferences(template: string): ParsedVariableReference[] {
  const references: ParsedVariableReference[] = [];

  // Reset regex state for global matching
  VARIABLE_PATTERN.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = VARIABLE_PATTERN.exec(template)) !== null) {
    const fullMatch = match[0];
    const path = match[1];

    // Parse the path to extract namespace and key
    const parsed = parsePath(path);

    references.push({
      fullMatch,
      path,
      namespace: parsed.namespace,
      key: parsed.key,
      startIndex: match.index,
      endIndex: match.index + fullMatch.length,
    });
  }

  return references;
}

/**
 * Parses a variable path into namespace and key
 *
 * @param path - The variable path (e.g., "var.api_version", "current_user.id")
 * @returns Object with namespace and key
 *
 * @example
 * ```ts
 * parsePath('var.api_version')  // { namespace: 'var', key: 'api_version' }
 * parsePath('current_user.id')  // { namespace: 'current_user', key: 'id' }
 * parsePath('request.timestamp') // { namespace: 'request', key: 'timestamp' }
 * ```
 */
export function parsePath(path: string): { namespace: string; key: string } {
  const parts = path.split('.');

  if (parts.length < 2) {
    // Single identifier - treat as var namespace
    return { namespace: 'var', key: path };
  }

  // Check if the first part is a known namespace
  const firstPart = parts[0];

  // Handle multi-part namespaces like "current_user"
  if (firstPart === 'current_user' || firstPart === 'connection' || firstPart === 'request') {
    return {
      namespace: firstPart,
      key: parts.slice(1).join('.'),
    };
  }

  // For "var" namespace, the key is everything after "var."
  if (firstPart === 'var') {
    return {
      namespace: 'var',
      key: parts.slice(1).join('.'),
    };
  }

  // Unknown namespace - treat the entire path as a key in "var" namespace
  return { namespace: 'var', key: path };
}

/**
 * Validates that a variable reference uses a valid namespace
 *
 * @param ref - The parsed variable reference
 * @returns True if the namespace is valid
 */
export function isValidNamespace(ref: ParsedVariableReference): boolean {
  return VALID_NAMESPACES.includes(ref.namespace as ValidNamespace);
}

/**
 * Validates the syntax of a variable reference string
 *
 * @param ref - Variable reference string (without ${...} wrapper)
 * @returns Object with validity status and optional error message
 */
export function validateVariableSyntax(ref: string): { valid: boolean; error?: string } {
  // Check basic format
  if (!ref || ref.length === 0) {
    return { valid: false, error: 'Variable reference cannot be empty' };
  }

  // Check for valid identifier pattern
  const identifierPattern = /^[a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)*$/;
  if (!identifierPattern.test(ref)) {
    return {
      valid: false,
      error: 'Variable reference must use valid identifier format (letters, numbers, underscores)',
    };
  }

  // Parse and validate namespace
  const parsed = parsePath(ref);
  if (!VALID_NAMESPACES.includes(parsed.namespace as ValidNamespace)) {
    return {
      valid: false,
      error: `Unknown namespace "${parsed.namespace}". Valid namespaces: ${VALID_NAMESPACES.join(', ')}`,
    };
  }

  return { valid: true };
}

/**
 * Checks if a string contains any variable references
 *
 * @param str - The string to check
 * @returns True if the string contains ${...} references
 */
export function containsVariableReferences(str: string): boolean {
  VARIABLE_PATTERN.lastIndex = 0;
  return VARIABLE_PATTERN.test(str);
}

/**
 * Extracts unique variable keys from a template
 *
 * @param template - The template string
 * @returns Set of unique variable paths
 */
export function extractUniqueVariables(template: string): Set<string> {
  const refs = parseVariableReferences(template);
  return new Set(refs.map((r) => r.path));
}

/**
 * Categorizes variable references by namespace
 *
 * @param refs - Array of parsed variable references
 * @returns Object mapping namespaces to their variable references
 */
export function categorizeByNamespace(
  refs: ParsedVariableReference[]
): Record<ValidNamespace, ParsedVariableReference[]> {
  const result: Record<ValidNamespace, ParsedVariableReference[]> = {
    var: [],
    current_user: [],
    connection: [],
    request: [],
  };

  for (const ref of refs) {
    const namespace = ref.namespace as ValidNamespace;
    if (result[namespace]) {
      result[namespace].push(ref);
    }
  }

  return result;
}

/**
 * Replaces all variable references in a template with resolved values
 *
 * @param template - The template string with ${...} references
 * @param values - Map of variable paths to their resolved values
 * @param options - Replacement options
 * @returns The template with all references replaced
 *
 * @example
 * ```ts
 * const result = replaceVariableReferences(
 *   '/api/${var.api_version}/users/${current_user.id}',
 *   { 'var.api_version': 'v2', 'current_user.id': 'U123' }
 * );
 * // Returns: '/api/v2/users/U123'
 * ```
 */
export function replaceVariableReferences(
  template: string,
  values: Record<string, unknown>,
  options: {
    /** Value to use when a variable is not found */
    missingValue?: string;
    /** Whether to keep original reference when value is not found */
    keepMissing?: boolean;
  } = {}
): string {
  const { missingValue = '', keepMissing = false } = options;

  const refs = parseVariableReferences(template);

  // Replace from end to start to maintain correct indices
  let result = template;
  for (let i = refs.length - 1; i >= 0; i--) {
    const ref = refs[i];
    const value = values[ref.path];

    let replacement: string;
    if (value !== undefined) {
      replacement = valueToString(value);
    } else if (keepMissing) {
      replacement = ref.fullMatch;
    } else {
      replacement = missingValue;
    }

    result = result.slice(0, ref.startIndex) + replacement + result.slice(ref.endIndex);
  }

  return result;
}

/**
 * Converts a value to its string representation for template substitution
 */
export function valueToString(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (typeof value === 'object') {
    return JSON.stringify(value);
  }

  return String(value);
}

// =============================================================================
// Template Validation
// =============================================================================

/**
 * Result of validating a template's variable references
 */
export interface TemplateValidationResult {
  /** Whether all variable references are valid */
  valid: boolean;
  /** List of parsed variable references */
  references: ParsedVariableReference[];
  /** List of validation errors */
  errors: Array<{
    reference: ParsedVariableReference;
    error: string;
  }>;
  /** List of warnings (e.g., unknown variables) */
  warnings: Array<{
    reference: ParsedVariableReference;
    message: string;
  }>;
}

/**
 * Validates all variable references in a template
 *
 * @param template - The template string to validate
 * @param knownVariables - Optional set of known variable paths for validation
 * @returns Validation result with errors and warnings
 */
export function validateTemplate(
  template: string,
  knownVariables?: Set<string>
): TemplateValidationResult {
  const references = parseVariableReferences(template);
  const errors: TemplateValidationResult['errors'] = [];
  const warnings: TemplateValidationResult['warnings'] = [];

  for (const ref of references) {
    // Check for valid namespace
    if (!isValidNamespace(ref)) {
      errors.push({
        reference: ref,
        error: `Unknown namespace "${ref.namespace}". Valid namespaces: ${VALID_NAMESPACES.join(', ')}`,
      });
      continue;
    }

    // Check if variable is known (if known variables provided)
    if (knownVariables && !knownVariables.has(ref.path)) {
      // For user-defined variables, warn about unknown keys
      if (ref.namespace === 'var') {
        warnings.push({
          reference: ref,
          message: `Variable "${ref.key}" is not defined. It may need to be created or passed at runtime.`,
        });
      }
    }
  }

  return {
    valid: errors.length === 0,
    references,
    errors,
    warnings,
  };
}
