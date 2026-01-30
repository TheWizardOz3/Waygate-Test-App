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
  /** JSONPath expression to extract items from action response */
  extractionPath: string;
  /** Field name containing the external ID within each item */
  idField: string;
  /** Field name containing the display name within each item */
  nameField: string;
  /** Additional fields to capture in metadata */
  metadataFields?: string[];
  /** How often to resync this data type (default: 3600 seconds = 1 hour) */
  defaultTtlSeconds?: number;
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
