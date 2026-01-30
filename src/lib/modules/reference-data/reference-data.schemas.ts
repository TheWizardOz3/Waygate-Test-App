/**
 * Reference Data Schemas
 *
 * Zod schemas for reference data validation, CRUD operations, and API responses.
 */

import { z } from 'zod';

// =============================================================================
// Enums
// =============================================================================

/**
 * Status of reference data items
 */
export const ReferenceDataStatusSchema = z.enum(['active', 'inactive', 'deleted']);
export type ReferenceDataStatus = z.infer<typeof ReferenceDataStatusSchema>;

/**
 * Status of sync jobs
 */
export const SyncJobStatusSchema = z.enum(['pending', 'syncing', 'completed', 'failed']);
export type SyncJobStatus = z.infer<typeof SyncJobStatusSchema>;

// =============================================================================
// Action Reference Data Config Schema
// =============================================================================

/**
 * Configuration for extracting reference data from an action's response
 * Stored in Action.metadata.referenceData
 */
export const ActionReferenceDataConfigSchema = z.object({
  dataType: z.string().min(1).max(100),
  syncable: z.boolean(),
  extractionPath: z.string().min(1),
  idField: z.string().min(1),
  nameField: z.string().min(1),
  metadataFields: z.array(z.string()).optional(),
  defaultTtlSeconds: z.number().int().positive().optional().default(3600),
});

export type ActionReferenceDataConfig = z.infer<typeof ActionReferenceDataConfigSchema>;

// =============================================================================
// Reference Data CRUD Schemas
// =============================================================================

/**
 * Input for creating reference data
 */
export const CreateReferenceDataInputSchema = z.object({
  tenantId: z.string().uuid(),
  integrationId: z.string().uuid(),
  connectionId: z.string().uuid().optional().nullable(),
  dataType: z.string().min(1).max(100),
  externalId: z.string().min(1).max(255),
  name: z.string().min(1).max(500),
  metadata: z.record(z.string(), z.unknown()).optional().default({}),
  syncedByActionId: z.string().uuid().optional().nullable(),
});

export type CreateReferenceDataInput = z.infer<typeof CreateReferenceDataInputSchema>;

/**
 * Input for updating reference data
 */
export const UpdateReferenceDataInputSchema = z.object({
  name: z.string().min(1).max(500).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  status: ReferenceDataStatusSchema.optional(),
  syncedByActionId: z.string().uuid().optional().nullable(),
});

export type UpdateReferenceDataInput = z.infer<typeof UpdateReferenceDataInputSchema>;

/**
 * Input for upserting reference data (create or update)
 */
export const UpsertReferenceDataInputSchema = z.object({
  tenantId: z.string().uuid(),
  integrationId: z.string().uuid(),
  connectionId: z.string().uuid().optional().nullable(),
  dataType: z.string().min(1).max(100),
  externalId: z.string().min(1).max(255),
  name: z.string().min(1).max(500),
  metadata: z.record(z.string(), z.unknown()).optional().default({}),
  syncedByActionId: z.string().uuid().optional().nullable(),
});

export type UpsertReferenceDataInput = z.infer<typeof UpsertReferenceDataInputSchema>;

// =============================================================================
// Sync Job CRUD Schemas
// =============================================================================

/**
 * Input for creating a sync job
 */
export const CreateSyncJobInputSchema = z.object({
  tenantId: z.string().uuid(),
  integrationId: z.string().uuid(),
  connectionId: z.string().uuid().optional().nullable(),
  dataType: z.string().min(1).max(100),
});

export type CreateSyncJobInput = z.infer<typeof CreateSyncJobInputSchema>;

/**
 * Input for updating a sync job
 */
export const UpdateSyncJobInputSchema = z.object({
  status: SyncJobStatusSchema.optional(),
  startedAt: z.date().optional().nullable(),
  completedAt: z.date().optional().nullable(),
  itemsFound: z.number().int().nonnegative().optional(),
  itemsCreated: z.number().int().nonnegative().optional(),
  itemsUpdated: z.number().int().nonnegative().optional(),
  itemsDeleted: z.number().int().nonnegative().optional(),
  itemsFailed: z.number().int().nonnegative().optional(),
  error: z.record(z.string(), z.unknown()).optional().nullable(),
});

export type UpdateSyncJobInput = z.infer<typeof UpdateSyncJobInputSchema>;

// =============================================================================
// Query Schemas
// =============================================================================

/**
 * Filters for querying reference data
 */
export const ReferenceDataFiltersSchema = z.object({
  dataType: z.string().optional(),
  status: ReferenceDataStatusSchema.optional(),
  search: z.string().optional(),
  connectionId: z.string().uuid().optional(),
});

export type ReferenceDataFilters = z.infer<typeof ReferenceDataFiltersSchema>;

/**
 * Query parameters for listing reference data (API)
 */
export const ListReferenceDataQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  dataType: z.string().optional(),
  status: ReferenceDataStatusSchema.optional(),
  search: z.string().optional(),
  connectionId: z.string().uuid().optional(),
});

export type ListReferenceDataQuery = z.infer<typeof ListReferenceDataQuerySchema>;

/**
 * Filters for querying sync jobs
 */
export const SyncJobFiltersSchema = z.object({
  status: SyncJobStatusSchema.optional(),
  dataType: z.string().optional(),
  connectionId: z.string().uuid().optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
});

export type SyncJobFilters = z.infer<typeof SyncJobFiltersSchema>;

/**
 * Query parameters for listing sync jobs (API)
 */
export const ListSyncJobsQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: SyncJobStatusSchema.optional(),
  dataType: z.string().optional(),
  connectionId: z.string().uuid().optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
});

export type ListSyncJobsQuery = z.infer<typeof ListSyncJobsQuerySchema>;

/**
 * Parameters for triggering a manual sync
 */
export const TriggerSyncInputSchema = z.object({
  integrationId: z.string().uuid(),
  connectionId: z.string().uuid().optional(),
  dataType: z.string().optional(),
});

export type TriggerSyncInput = z.infer<typeof TriggerSyncInputSchema>;

// =============================================================================
// API Response Schemas
// =============================================================================

/**
 * Reference data item as returned by the API
 */
export const ReferenceDataResponseSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  integrationId: z.string().uuid(),
  connectionId: z.string().uuid().nullable(),
  dataType: z.string(),
  externalId: z.string(),
  name: z.string(),
  metadata: z.record(z.string(), z.unknown()),
  status: ReferenceDataStatusSchema,
  lastSyncedAt: z.string().datetime(),
  syncedByActionId: z.string().uuid().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type ReferenceDataResponse = z.infer<typeof ReferenceDataResponseSchema>;

/**
 * Paginated list of reference data
 */
export const ListReferenceDataResponseSchema = z.object({
  data: z.array(ReferenceDataResponseSchema),
  pagination: z.object({
    cursor: z.string().nullable(),
    hasMore: z.boolean(),
    totalCount: z.number().int(),
  }),
});

export type ListReferenceDataResponse = z.infer<typeof ListReferenceDataResponseSchema>;

/**
 * Sync job as returned by the API
 */
export const SyncJobResponseSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  integrationId: z.string().uuid(),
  connectionId: z.string().uuid().nullable(),
  dataType: z.string(),
  status: SyncJobStatusSchema,
  startedAt: z.string().datetime().nullable(),
  completedAt: z.string().datetime().nullable(),
  itemsFound: z.number().int(),
  itemsCreated: z.number().int(),
  itemsUpdated: z.number().int(),
  itemsDeleted: z.number().int(),
  itemsFailed: z.number().int(),
  error: z.record(z.string(), z.unknown()).nullable(),
  createdAt: z.string().datetime(),
});

export type SyncJobResponse = z.infer<typeof SyncJobResponseSchema>;

/**
 * Paginated list of sync jobs
 */
export const ListSyncJobsResponseSchema = z.object({
  jobs: z.array(SyncJobResponseSchema),
  pagination: z.object({
    cursor: z.string().nullable(),
    hasMore: z.boolean(),
    totalCount: z.number().int(),
  }),
});

export type ListSyncJobsResponse = z.infer<typeof ListSyncJobsResponseSchema>;

/**
 * Summary of reference data by type
 */
export const ReferenceDataSummarySchema = z.object({
  dataType: z.string(),
  totalCount: z.number().int(),
  activeCount: z.number().int(),
  lastSyncedAt: z.string().datetime().nullable(),
});

export type ReferenceDataSummary = z.infer<typeof ReferenceDataSummarySchema>;

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Converts a database ReferenceData to API response format
 */
export function toReferenceDataResponse(data: {
  id: string;
  tenantId: string;
  integrationId: string;
  connectionId: string | null;
  dataType: string;
  externalId: string;
  name: string;
  metadata: unknown;
  status: string;
  lastSyncedAt: Date;
  syncedByActionId: string | null;
  createdAt: Date;
  updatedAt: Date;
}): ReferenceDataResponse {
  return {
    id: data.id,
    tenantId: data.tenantId,
    integrationId: data.integrationId,
    connectionId: data.connectionId,
    dataType: data.dataType,
    externalId: data.externalId,
    name: data.name,
    metadata: data.metadata as Record<string, unknown>,
    status: data.status as ReferenceDataStatus,
    lastSyncedAt: data.lastSyncedAt.toISOString(),
    syncedByActionId: data.syncedByActionId,
    createdAt: data.createdAt.toISOString(),
    updatedAt: data.updatedAt.toISOString(),
  };
}

/**
 * Converts a database ReferenceSyncJob to API response format
 */
export function toSyncJobResponse(job: {
  id: string;
  tenantId: string;
  integrationId: string;
  connectionId: string | null;
  dataType: string;
  status: string;
  startedAt: Date | null;
  completedAt: Date | null;
  itemsFound: number;
  itemsCreated: number;
  itemsUpdated: number;
  itemsDeleted: number;
  itemsFailed: number;
  error: unknown;
  createdAt: Date;
}): SyncJobResponse {
  return {
    id: job.id,
    tenantId: job.tenantId,
    integrationId: job.integrationId,
    connectionId: job.connectionId,
    dataType: job.dataType,
    status: job.status as SyncJobStatus,
    startedAt: job.startedAt?.toISOString() ?? null,
    completedAt: job.completedAt?.toISOString() ?? null,
    itemsFound: job.itemsFound,
    itemsCreated: job.itemsCreated,
    itemsUpdated: job.itemsUpdated,
    itemsDeleted: job.itemsDeleted,
    itemsFailed: job.itemsFailed,
    error: job.error as Record<string, unknown> | null,
    createdAt: job.createdAt.toISOString(),
  };
}

/**
 * Converts a list of database reference data to paginated API response
 */
export function toListReferenceDataResponse(
  data: Array<Parameters<typeof toReferenceDataResponse>[0]>,
  nextCursor: string | null,
  totalCount: number
): ListReferenceDataResponse {
  return {
    data: data.map(toReferenceDataResponse),
    pagination: {
      cursor: nextCursor,
      hasMore: nextCursor !== null,
      totalCount,
    },
  };
}

/**
 * Converts a list of database sync jobs to paginated API response
 */
export function toListSyncJobsResponse(
  jobs: Array<Parameters<typeof toSyncJobResponse>[0]>,
  nextCursor: string | null,
  totalCount: number
): ListSyncJobsResponse {
  return {
    jobs: jobs.map(toSyncJobResponse),
    pagination: {
      cursor: nextCursor,
      hasMore: nextCursor !== null,
      totalCount,
    },
  };
}

// =============================================================================
// Error Codes
// =============================================================================

export const ReferenceDataErrorCodes = {
  REFERENCE_DATA_NOT_FOUND: 'REFERENCE_DATA_NOT_FOUND',
  SYNC_JOB_NOT_FOUND: 'SYNC_JOB_NOT_FOUND',
  INTEGRATION_NOT_FOUND: 'INTEGRATION_NOT_FOUND',
  CONNECTION_NOT_FOUND: 'CONNECTION_NOT_FOUND',
  ACTION_NOT_SYNCABLE: 'ACTION_NOT_SYNCABLE',
  SYNC_ALREADY_IN_PROGRESS: 'SYNC_ALREADY_IN_PROGRESS',
  SYNC_FAILED: 'SYNC_FAILED',
  EXTRACTION_FAILED: 'EXTRACTION_FAILED',
  INVALID_EXTRACTION_PATH: 'INVALID_EXTRACTION_PATH',
} as const;

export type ReferenceDataErrorCode =
  (typeof ReferenceDataErrorCodes)[keyof typeof ReferenceDataErrorCodes];
