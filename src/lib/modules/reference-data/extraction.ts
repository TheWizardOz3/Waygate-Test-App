/**
 * Reference Data Extraction Utilities
 *
 * Pure functions for extracting reference data from action responses.
 * These are separated from the sync service to enable unit testing
 * without Prisma dependencies.
 */

import { ReferenceDataErrorCodes } from './reference-data.schemas';
import type { ActionReferenceDataConfig, ExtractedReferenceItem } from './types';

/**
 * Error thrown by extraction operations
 */
export class ExtractionError extends Error {
  constructor(
    public code: string,
    message: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'ExtractionError';
  }
}

/**
 * Extract reference items from an action response using the extraction config
 *
 * Supports simple JSONPath-like expressions:
 * - $.members[*] - get all items from root.members array
 * - $.data[*] - get all items from root.data array
 * - $.users - get root.users (direct property access)
 * - $ - use root object directly (if response is an array)
 */
export function extractReferenceItems(
  data: unknown,
  config: ActionReferenceDataConfig
): ExtractedReferenceItem[] {
  const { extractionPath, idField, nameField, metadataFields = [] } = config;

  try {
    // Extract the array of items using the path
    const items = extractByPath(data, extractionPath);

    if (!Array.isArray(items)) {
      console.warn(`[SYNC] Extraction path ${extractionPath} did not return an array`);
      return [];
    }

    // Map to ExtractedReferenceItem format
    const extracted: ExtractedReferenceItem[] = [];

    for (const item of items) {
      if (!item || typeof item !== 'object') {
        continue;
      }

      const record = item as Record<string, unknown>;
      const externalId = getNestedValue(record, idField);
      const name = getNestedValue(record, nameField);

      // Skip items without required fields
      if (externalId === undefined || externalId === null) {
        console.warn(`[SYNC] Skipping item without ${idField}:`, item);
        continue;
      }

      // Build metadata from configured fields
      const metadata: Record<string, unknown> = {};
      for (const field of metadataFields) {
        const value = getNestedValue(record, field);
        if (value !== undefined) {
          metadata[field] = value;
        }
      }

      extracted.push({
        externalId: String(externalId),
        name: name ? String(name) : String(externalId),
        metadata,
      });
    }

    return extracted;
  } catch (err) {
    throw new ExtractionError(
      ReferenceDataErrorCodes.EXTRACTION_FAILED,
      `Failed to extract reference items: ${err instanceof Error ? err.message : 'Unknown error'}`,
      { extractionPath, idField, nameField }
    );
  }
}

/**
 * Extract value from data using a simple JSONPath-like expression
 *
 * Supports:
 * - $ - root object
 * - $.property - direct property access
 * - $.property[*] - get all items from array property
 * - $.nested.property - nested property access
 * - $.nested.array[*] - nested array access
 */
export function extractByPath(data: unknown, path: string): unknown {
  if (!path || path === '$') {
    return data;
  }

  // Remove leading $. if present
  const normalizedPath = path.startsWith('$.')
    ? path.slice(2)
    : path.startsWith('$')
      ? path.slice(1)
      : path;

  if (!normalizedPath) {
    return data;
  }

  // Split path into segments, handling [*] notation
  const segments = normalizedPath.split(/\.(?![^\[]*\])/);
  let current: unknown = data;

  for (const segment of segments) {
    if (current === null || current === undefined) {
      return undefined;
    }

    // Check for array notation like "members[*]" or "data[0]"
    const arrayMatch = segment.match(/^([^[]+)\[([*\d]+)\]$/);

    if (arrayMatch) {
      const [, propName, indexOrStar] = arrayMatch;

      // Get the property
      if (typeof current !== 'object') {
        return undefined;
      }

      current = (current as Record<string, unknown>)[propName];

      // Handle array access
      if (!Array.isArray(current)) {
        return undefined;
      }

      if (indexOrStar === '*') {
        // Return the entire array for [*]
        return current;
      } else {
        // Return specific index
        const index = parseInt(indexOrStar, 10);
        current = current[index];
      }
    } else {
      // Simple property access
      if (typeof current !== 'object') {
        return undefined;
      }

      current = (current as Record<string, unknown>)[segment];
    }
  }

  return current;
}

/**
 * Get a nested value from an object using dot notation
 */
export function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const segments = path.split('.');
  let current: unknown = obj;

  for (const segment of segments) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }

  return current;
}
