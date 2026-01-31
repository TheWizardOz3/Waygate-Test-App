/**
 * Reference Data Types
 *
 * TypeScript types for reference data sync feature.
 * These types define the configuration for how actions produce reference data.
 */

/**
 * Configuration for extracting reference data from an action's response
 * Stored in Action.metadata.referenceData
 */
export interface ActionReferenceDataConfig {
  /** The type of data this action provides (e.g., 'users', 'channels', 'repos') */
  dataType: string;
  /** Whether this action can be used for syncing reference data */
  syncable: boolean;
  /** Type of sync: 'list' for arrays of items, 'object' for full response caching */
  syncType: 'list' | 'object';
  /** JSONPath expression to extract items from action response (for list sync) */
  extractionPath?: string;
  /** Field name containing the external ID within each item (for list sync) */
  idField?: string;
  /** Field name containing the display name within each item (for list sync) */
  nameField?: string;
  /** Multiple fields to search when looking up items (for list sync) */
  lookupFields?: string[];
  /** Whether to use fuzzy/partial matching for lookups */
  fuzzyMatch: boolean;
  /** Additional fields to capture in metadata */
  metadataFields?: string[];
  /** How often to resync this data type (default: 86400 seconds = 1 day) */
  defaultTtlSeconds: number;
}

/**
 * A single extracted reference data item before storage
 */
export interface ExtractedReferenceItem {
  externalId: string;
  name: string;
  metadata: Record<string, unknown>;
}

/**
 * Result of a sync operation
 */
export interface SyncResult {
  itemsFound: number;
  itemsCreated: number;
  itemsUpdated: number;
  itemsDeleted: number;
  itemsFailed: number;
  errors?: Array<{
    externalId: string;
    error: string;
  }>;
}
