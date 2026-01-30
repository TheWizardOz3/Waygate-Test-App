/**
 * Reference Data Module
 *
 * Provides functionality for syncing and caching reference data from external APIs.
 * This cached data enables AI tools to have contextual awareness (users, channels, etc.)
 * without repeatedly calling external APIs during tool execution.
 */

// Repository - Data access layer
export {
  // Types
  type CreateReferenceDataDbInput,
  type UpdateReferenceDataDbInput,
  type UpsertReferenceDataDbInput,
  type CreateSyncJobDbInput,
  type UpdateSyncJobDbInput,
  type PaginationOptions,
  type ReferenceDataFilters,
  type SyncJobFilters,
  type PaginatedReferenceData,
  type PaginatedSyncJobs,
  type ReferenceDataTypeSummary,
  // Reference Data functions
  createReferenceData,
  createManyReferenceData,
  upsertReferenceData,
  bulkUpsertReferenceData,
  findReferenceDataById,
  findReferenceDataByIdAndTenant,
  findReferenceDataByKey,
  findByIntegrationId,
  findByConnectionId,
  findByTypes,
  getDataTypes,
  getTypeSummary,
  updateReferenceData,
  markStaleAsInactive,
  deleteReferenceData,
  deleteByIntegrationId,
  deleteByConnectionId,
  deleteOldInactiveData,
  // Sync Job functions
  createSyncJob,
  findSyncJobById,
  findSyncJobByIdAndTenant,
  getLatestSyncJob,
  findSyncJobsByIntegrationId,
  hasActiveSyncJob,
  getStaleDataTypes,
  updateSyncJob,
  markSyncJobStarted,
  markSyncJobCompleted,
  markSyncJobFailed,
  deleteOldSyncJobs,
  deleteSyncJobsByIntegrationId,
} from './reference-data.repository';

// Schemas - Zod validation and API types
export {
  // Enums
  ReferenceDataStatusSchema,
  type ReferenceDataStatus,
  SyncJobStatusSchema,
  type SyncJobStatus,
  // Action config
  ActionReferenceDataConfigSchema,
  type ActionReferenceDataConfig,
  // CRUD schemas
  CreateReferenceDataInputSchema,
  type CreateReferenceDataInput,
  UpdateReferenceDataInputSchema,
  type UpdateReferenceDataInput,
  UpsertReferenceDataInputSchema,
  type UpsertReferenceDataInput,
  CreateSyncJobInputSchema,
  type CreateSyncJobInput,
  UpdateSyncJobInputSchema,
  type UpdateSyncJobInput,
  // Query schemas
  ReferenceDataFiltersSchema,
  ListReferenceDataQuerySchema,
  type ListReferenceDataQuery,
  SyncJobFiltersSchema,
  ListSyncJobsQuerySchema,
  type ListSyncJobsQuery,
  TriggerSyncInputSchema,
  type TriggerSyncInput,
  // Response schemas
  ReferenceDataResponseSchema,
  type ReferenceDataResponse,
  ListReferenceDataResponseSchema,
  type ListReferenceDataResponse,
  SyncJobResponseSchema,
  type SyncJobResponse,
  ListSyncJobsResponseSchema,
  type ListSyncJobsResponse,
  ReferenceDataSummarySchema,
  type ReferenceDataSummary,
  // Helper functions
  toReferenceDataResponse,
  toSyncJobResponse,
  toListReferenceDataResponse,
  toListSyncJobsResponse,
  // Error codes
  ReferenceDataErrorCodes,
  type ReferenceDataErrorCode,
} from './reference-data.schemas';

// Types - TypeScript interfaces (from types.ts, not schemas)
export type {
  ActionReferenceDataConfig as ActionReferenceDataConfigType,
  ExtractedReferenceItem,
  SyncResult,
} from './types';

// Sync Job Service - Orchestration logic
export {
  triggerSync,
  getSyncStatus,
  needsSync,
  extractReferenceItems,
  SyncJobError,
  // Cron job functions
  findSyncCandidates,
  runBatchSync,
  getSyncQueueSummary,
  type TriggerSyncInput as TriggerSyncServiceInput,
  type TriggerSyncResult,
  type SyncCandidate,
  type BatchSyncResult,
} from './sync-job.service';
