/**
 * JSONPath Utilities
 *
 * Provides JSONPath parsing and evaluation for field mapping.
 * Supports a subset of JSONPath for simplicity and reliability.
 *
 * Supported patterns:
 * - $.field         - Root-level field
 * - $.nested.field  - Nested field
 * - $[0]            - Array index
 * - $[*]            - All array items
 * - $.field[*].nested - Nested in array
 */

import { MAX_NESTING_DEPTH, MAX_ARRAY_ITEMS, type MappingError } from './mapping.schemas';

// =============================================================================
// Types
// =============================================================================

/**
 * Parsed path segment
 */
export interface PathSegment {
  /** Type of segment */
  type: 'property' | 'index' | 'wildcard';
  /** Property name or array index */
  value: string | number;
}

/**
 * Result of getting a value at a path
 */
export interface GetValueResult {
  /** Whether the value was found */
  found: boolean;
  /** The value at the path (undefined if not found) */
  value: unknown;
  /** Whether the path involved array wildcard expansion */
  isArray: boolean;
  /** Error if path is invalid or limits exceeded */
  error?: MappingError;
}

/**
 * Result of setting a value at a path
 */
export interface SetValueResult {
  /** Whether the value was set successfully */
  success: boolean;
  /** The modified object */
  data: unknown;
  /** Error if path is invalid */
  error?: MappingError;
}

// =============================================================================
// Path Parsing
// =============================================================================

/**
 * Validate a JSONPath string
 * @param path JSONPath string to validate
 * @returns True if valid, error message if invalid
 */
export function validatePath(path: string): { valid: true } | { valid: false; error: string } {
  // Must start with $
  if (!path.startsWith('$')) {
    return { valid: false, error: 'Path must start with $' };
  }

  // Empty path after $ is valid (refers to root)
  if (path === '$') {
    return { valid: true };
  }

  // Check for invalid characters
  const invalidChars = /[^a-zA-Z0-9_.\[\]\*]/;
  const pathWithoutRoot = path.substring(1);
  if (invalidChars.test(pathWithoutRoot)) {
    return { valid: false, error: 'Path contains invalid characters' };
  }

  // Check bracket matching
  const openBrackets = (path.match(/\[/g) || []).length;
  const closeBrackets = (path.match(/\]/g) || []).length;
  if (openBrackets !== closeBrackets) {
    return { valid: false, error: 'Mismatched brackets in path' };
  }

  // Parse and check depth
  const segments = parsePath(path);
  if (segments.length > MAX_NESTING_DEPTH) {
    return { valid: false, error: `Path exceeds maximum nesting depth of ${MAX_NESTING_DEPTH}` };
  }

  return { valid: true };
}

/**
 * Parse a JSONPath string into segments
 * @param path JSONPath string (e.g., "$.user.email" or "$.items[*].name")
 * @returns Array of path segments
 */
export function parsePath(path: string): PathSegment[] {
  const segments: PathSegment[] = [];

  // Remove leading $
  let remaining = path.startsWith('$') ? path.substring(1) : path;

  // Handle root reference
  if (remaining === '' || remaining === '.') {
    return segments;
  }

  // Remove leading dot if present
  if (remaining.startsWith('.')) {
    remaining = remaining.substring(1);
  }

  // Regex to match path parts
  // Matches: property names, [index], [*]
  const regex = /([a-zA-Z_][a-zA-Z0-9_]*)|(\[(\d+|\*)\])/g;
  let match;

  while ((match = regex.exec(remaining)) !== null) {
    if (match[1]) {
      // Property name
      segments.push({ type: 'property', value: match[1] });
    } else if (match[3] !== undefined) {
      // Array access
      if (match[3] === '*') {
        segments.push({ type: 'wildcard', value: '*' });
      } else {
        segments.push({ type: 'index', value: parseInt(match[3], 10) });
      }
    }
  }

  return segments;
}

/**
 * Compile a path for repeated use
 * @param path JSONPath string
 * @returns Compiled path segments or error
 */
export function compilePath(
  path: string
): { success: true; segments: PathSegment[] } | { success: false; error: string } {
  const validation = validatePath(path);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  return { success: true, segments: parsePath(path) };
}

// =============================================================================
// Value Getting
// =============================================================================

/**
 * Get a value from an object at a JSONPath
 * @param obj Object to get value from
 * @param path JSONPath string or pre-parsed segments
 * @returns GetValueResult with the value or error
 */
export function getValue(obj: unknown, path: string | PathSegment[]): GetValueResult {
  const segments = typeof path === 'string' ? parsePath(path) : path;

  // Root reference
  if (segments.length === 0) {
    return { found: true, value: obj, isArray: false };
  }

  let current: unknown = obj;
  let isArray = false;

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];

    if (current === null || current === undefined) {
      return { found: false, value: undefined, isArray };
    }

    if (segment.type === 'property') {
      // Property access
      if (typeof current !== 'object' || current === null) {
        return { found: false, value: undefined, isArray };
      }
      current = (current as Record<string, unknown>)[segment.value as string];
    } else if (segment.type === 'index') {
      // Array index access
      if (!Array.isArray(current)) {
        return { found: false, value: undefined, isArray };
      }
      const index = segment.value as number;
      if (index < 0 || index >= current.length) {
        return { found: false, value: undefined, isArray };
      }
      current = current[index];
    } else if (segment.type === 'wildcard') {
      // Array wildcard - get all items
      if (!Array.isArray(current)) {
        return { found: false, value: undefined, isArray: true };
      }

      // Check array size limit
      if (current.length > MAX_ARRAY_ITEMS) {
        return {
          found: false,
          value: undefined,
          isArray: true,
          error: {
            path: typeof path === 'string' ? path : segmentsToPath(segments.slice(0, i + 1)),
            code: 'ARRAY_LIMIT_EXCEEDED',
            message: `Array has ${current.length} items, exceeds limit of ${MAX_ARRAY_ITEMS}`,
          },
        };
      }

      isArray = true;

      // If there are more segments, apply them to each array item
      const remainingSegments = segments.slice(i + 1);
      if (remainingSegments.length > 0) {
        const results: unknown[] = [];
        for (const item of current) {
          const result = getValue(item, remainingSegments);
          if (result.found) {
            if (result.isArray && Array.isArray(result.value)) {
              // Flatten nested arrays from wildcards
              results.push(...result.value);
            } else {
              results.push(result.value);
            }
          }
        }
        return { found: true, value: results, isArray: true };
      }

      return { found: true, value: current, isArray: true };
    }
  }

  return { found: current !== undefined, value: current, isArray };
}

// =============================================================================
// Value Setting
// =============================================================================

/**
 * Set a value in an object at a JSONPath
 * Creates intermediate objects/arrays as needed
 * @param obj Object to modify (will be cloned)
 * @param path JSONPath string or pre-parsed segments
 * @param value Value to set
 * @returns SetValueResult with the modified object or error
 */
export function setValue(
  obj: unknown,
  path: string | PathSegment[],
  value: unknown
): SetValueResult {
  const segments = typeof path === 'string' ? parsePath(path) : path;

  // Root reference - replace entire object
  if (segments.length === 0) {
    return { success: true, data: value };
  }

  // Deep clone the object to avoid mutations
  const result = deepClone(obj);

  // Navigate to the parent of the target
  let current: unknown = result;

  for (let i = 0; i < segments.length - 1; i++) {
    const segment = segments[i];
    const nextSegment = segments[i + 1];

    if (segment.type === 'wildcard') {
      // Setting values with wildcard in the middle is complex
      // For now, we'll handle the simple case where wildcard is at the end
      return {
        success: false,
        data: obj,
        error: {
          path: typeof path === 'string' ? path : segmentsToPath(segments),
          code: 'INVALID_PATH',
          message: 'Wildcard in the middle of a set path is not supported',
        },
      };
    }

    if (segment.type === 'property') {
      if (current === null || typeof current !== 'object') {
        current = {};
      }
      const key = segment.value as string;
      const currentObj = current as Record<string, unknown>;

      // Create intermediate object/array if needed
      if (currentObj[key] === undefined || currentObj[key] === null) {
        currentObj[key] = nextSegment.type === 'index' || nextSegment.type === 'wildcard' ? [] : {};
      }
      current = currentObj[key];
    } else if (segment.type === 'index') {
      if (!Array.isArray(current)) {
        return {
          success: false,
          data: obj,
          error: {
            path: typeof path === 'string' ? path : segmentsToPath(segments.slice(0, i + 1)),
            code: 'INVALID_PATH',
            message: 'Cannot index into non-array',
          },
        };
      }
      const index = segment.value as number;
      // Extend array if needed
      while (current.length <= index) {
        current.push(undefined);
      }
      // Create intermediate object/array if needed
      if (current[index] === undefined || current[index] === null) {
        current[index] = nextSegment.type === 'index' || nextSegment.type === 'wildcard' ? [] : {};
      }
      current = current[index];
    }
  }

  // Set the final value
  const lastSegment = segments[segments.length - 1];

  if (lastSegment.type === 'property') {
    if (current === null || typeof current !== 'object') {
      return {
        success: false,
        data: obj,
        error: {
          path: typeof path === 'string' ? path : segmentsToPath(segments),
          code: 'INVALID_PATH',
          message: 'Cannot set property on non-object',
        },
      };
    }
    (current as Record<string, unknown>)[lastSegment.value as string] = value;
  } else if (lastSegment.type === 'index') {
    if (!Array.isArray(current)) {
      return {
        success: false,
        data: obj,
        error: {
          path: typeof path === 'string' ? path : segmentsToPath(segments),
          code: 'INVALID_PATH',
          message: 'Cannot index into non-array',
        },
      };
    }
    const index = lastSegment.value as number;
    // Extend array if needed
    while (current.length <= index) {
      current.push(undefined);
    }
    current[index] = value;
  } else if (lastSegment.type === 'wildcard') {
    // Setting with wildcard at the end - set all items
    if (!Array.isArray(current)) {
      return {
        success: false,
        data: obj,
        error: {
          path: typeof path === 'string' ? path : segmentsToPath(segments),
          code: 'INVALID_PATH',
          message: 'Cannot use wildcard on non-array',
        },
      };
    }
    // If value is an array, replace the array contents
    if (Array.isArray(value)) {
      current.length = 0;
      current.push(...value);
    } else {
      // Otherwise, set all items to the same value
      for (let i = 0; i < current.length; i++) {
        current[i] = value;
      }
    }
  }

  return { success: true, data: result };
}

// =============================================================================
// Value Deletion
// =============================================================================

/**
 * Delete a value from an object at a JSONPath
 * @param obj Object to modify (will be cloned)
 * @param path JSONPath string or pre-parsed segments
 * @returns The modified object
 */
export function deleteValue(obj: unknown, path: string | PathSegment[]): unknown {
  const segments = typeof path === 'string' ? parsePath(path) : path;

  // Can't delete root
  if (segments.length === 0) {
    return obj;
  }

  // Deep clone the object
  const result = deepClone(obj);

  // Navigate to the parent
  let current: unknown = result;
  for (let i = 0; i < segments.length - 1; i++) {
    const segment = segments[i];

    if (current === null || current === undefined) {
      return result; // Path doesn't exist, nothing to delete
    }

    if (segment.type === 'property') {
      if (typeof current !== 'object' || current === null) {
        return result;
      }
      current = (current as Record<string, unknown>)[segment.value as string];
    } else if (segment.type === 'index') {
      if (!Array.isArray(current)) {
        return result;
      }
      current = current[segment.value as number];
    } else if (segment.type === 'wildcard') {
      // Can't delete with wildcard in path (too complex)
      return result;
    }
  }

  // Delete the final value
  const lastSegment = segments[segments.length - 1];

  if (current === null || current === undefined) {
    return result;
  }

  if (lastSegment.type === 'property') {
    if (typeof current === 'object' && current !== null) {
      delete (current as Record<string, unknown>)[lastSegment.value as string];
    }
  } else if (lastSegment.type === 'index') {
    if (Array.isArray(current)) {
      current.splice(lastSegment.value as number, 1);
    }
  }

  return result;
}

// =============================================================================
// Utilities
// =============================================================================

/**
 * Convert path segments back to a JSONPath string
 */
export function segmentsToPath(segments: PathSegment[]): string {
  if (segments.length === 0) {
    return '$';
  }

  let path = '$';
  for (const segment of segments) {
    if (segment.type === 'property') {
      path += `.${segment.value}`;
    } else if (segment.type === 'index') {
      path += `[${segment.value}]`;
    } else if (segment.type === 'wildcard') {
      path += '[*]';
    }
  }

  return path;
}

/**
 * Deep clone an object
 */
export function deepClone<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => deepClone(item)) as unknown as T;
  }

  const cloned: Record<string, unknown> = {};
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      cloned[key] = deepClone((obj as Record<string, unknown>)[key]);
    }
  }

  return cloned as T;
}

/**
 * Check if a value is empty (null, undefined, empty string, or empty array)
 */
export function isEmpty(value: unknown): boolean {
  if (value === null || value === undefined) {
    return true;
  }
  if (typeof value === 'string' && value.trim() === '') {
    return true;
  }
  if (Array.isArray(value) && value.length === 0) {
    return true;
  }
  return false;
}

/**
 * Check if a value is null or undefined
 */
export function isNullish(value: unknown): boolean {
  return value === null || value === undefined;
}

/**
 * Schema field information extracted from JSON Schema
 */
export interface SchemaFieldInfo {
  /** JSONPath to the field (e.g., "$.user.email") */
  path: string;
  /** Field name (e.g., "email") */
  name: string;
  /** Field type from schema */
  type: string;
  /** Whether the field is required */
  required: boolean;
  /** Field description from schema */
  description?: string;
}

/**
 * Extract field paths from a JSON Schema
 * Returns flat list of all fields with their JSONPath expressions
 *
 * @param schema JSON Schema object
 * @param maxDepth Maximum nesting depth to traverse (default: 5)
 * @returns Array of SchemaFieldInfo objects
 */
export function getSchemaFieldPaths(
  schema:
    | {
        type?: string;
        properties?: Record<
          string,
          {
            type?: string | string[];
            description?: string;
            properties?: Record<string, unknown>;
            items?: {
              type?: string | string[];
              properties?: Record<string, unknown>;
              required?: string[];
            };
            required?: string[];
          }
        >;
        required?: string[];
        items?: {
          type?: string | string[];
          properties?: Record<string, unknown>;
          required?: string[];
        };
      }
    | null
    | undefined,
  maxDepth: number = 5
): SchemaFieldInfo[] {
  if (!schema) {
    return [];
  }

  const fields: SchemaFieldInfo[] = [];

  // Type definition for property schemas
  type PropertySchema = {
    type?: string | string[];
    description?: string;
    properties?: Record<string, unknown>;
    items?: { type?: string | string[]; properties?: Record<string, unknown>; required?: string[] };
    required?: string[];
  };

  function traverse(
    properties: Record<string, PropertySchema>,
    parentPath: string,
    parentRequired: Set<string>,
    depth: number
  ) {
    if (depth > maxDepth) {
      return;
    }

    for (const [fieldName, fieldSchema] of Object.entries(properties)) {
      const fieldPath = parentPath ? `${parentPath}.${fieldName}` : `$.${fieldName}`;
      const fieldType = Array.isArray(fieldSchema.type)
        ? fieldSchema.type[0]
        : fieldSchema.type || 'unknown';

      fields.push({
        path: fieldPath,
        name: fieldName,
        type: fieldType,
        required: parentRequired.has(fieldName),
        description: fieldSchema.description,
      });

      // Handle nested objects
      if (fieldType === 'object' && fieldSchema.properties) {
        const nestedRequired = new Set(fieldSchema.required || []);
        traverse(
          fieldSchema.properties as Record<string, PropertySchema>,
          fieldPath,
          nestedRequired,
          depth + 1
        );
      }

      // Handle arrays with object items
      if (fieldType === 'array' && fieldSchema.items) {
        const itemsSchema = fieldSchema.items;
        const itemType = Array.isArray(itemsSchema.type) ? itemsSchema.type[0] : itemsSchema.type;

        if (itemType === 'object' && itemsSchema.properties) {
          const nestedRequired = new Set(itemsSchema.required || []);
          traverse(
            itemsSchema.properties as Record<string, PropertySchema>,
            `${fieldPath}[*]`,
            nestedRequired,
            depth + 1
          );
        }
      }
    }
  }

  // Handle root-level object with properties
  if (schema.properties) {
    const requiredFields = new Set(schema.required || []);
    traverse(schema.properties as Record<string, PropertySchema>, '', requiredFields, 0);
  }
  // Handle root-level array schema (e.g., { type: "array", items: { type: "object", properties: {...} } })
  else if (schema.type === 'array' && schema.items) {
    const itemsSchema = schema.items;
    const itemType = Array.isArray(itemsSchema.type) ? itemsSchema.type[0] : itemsSchema.type;

    if (itemType === 'object' && itemsSchema.properties) {
      const requiredFields = new Set(itemsSchema.required || []);
      traverse(itemsSchema.properties as Record<string, PropertySchema>, '$[*]', requiredFields, 0);
    }
  }

  return fields;
}

/**
 * Get all property paths from an object (for debugging/preview)
 */
export function getAllPaths(obj: unknown, maxDepth: number = MAX_NESTING_DEPTH): string[] {
  const paths: string[] = [];

  function traverse(current: unknown, currentPath: string, depth: number) {
    if (depth > maxDepth) {
      return;
    }

    if (current === null || current === undefined) {
      return;
    }

    if (Array.isArray(current)) {
      paths.push(currentPath + '[*]');
      if (current.length > 0) {
        traverse(current[0], currentPath + '[0]', depth + 1);
      }
    } else if (typeof current === 'object') {
      for (const key of Object.keys(current)) {
        const newPath = currentPath ? `${currentPath}.${key}` : `$.${key}`;
        paths.push(newPath);
        traverse((current as Record<string, unknown>)[key], newPath, depth + 1);
      }
    }
  }

  traverse(obj, '$', 0);
  return paths;
}
