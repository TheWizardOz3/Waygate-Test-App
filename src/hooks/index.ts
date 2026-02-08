// Custom React hooks

// Integration hooks
export {
  useIntegrations,
  useIntegration,
  useIntegrationBySlug,
  useIntegrationHealth,
  useIntegrationCredentials,
  useCreateIntegration,
  useUpdateIntegration,
  useDeleteIntegration,
  integrationKeys,
  type IntegrationCredentialsResponse,
} from './useIntegrations';

// Scrape job hooks
export { useScrapeJob, useScrapeJobStatus } from './useScrapeJob';

// Action hooks
export {
  useActions,
  useAction,
  useCreateAction,
  useUpdateAction,
  useDeleteAction,
  useBulkDeleteActions,
  useCachedActions,
  useDiscoverActions,
  useRegenerateToolDescriptions,
  actionKeys,
} from './useActions';

// Log hooks
export {
  useLogs,
  useInfiniteLogs,
  useLogEntry,
  useLogStats,
  logKeys,
  type LogEntry,
  type LogsQueryParams,
  type LogsResponse,
} from './useLogs';

// Mapping hooks
export {
  useMappings,
  useMappingConfig,
  useCreateMapping,
  useUpdateMapping,
  useDeleteMapping,
  usePreviewMapping,
  useBulkMappings,
  mappingKeys,
} from './useMappings';

// Connection mapping hooks (per-app custom mappings)
export {
  useConnectionMappings,
  useCreateConnectionOverride,
  useUpdateConnectionOverride,
  useDeleteConnectionOverride,
  useResetConnectionMappings,
  useCopyDefaultsToConnection,
  usePreviewConnectionMapping,
  useConnectionOverrideCount,
  connectionMappingKeys,
  type ConnectionMappingsResponse,
  type CreateOverrideInput,
  type UpdateOverrideInput,
  type DeleteOverrideInput,
  type ResetMappingsInput,
  type CopyDefaultsInput,
  type PreviewInput,
} from './useConnectionMappings';

// Tag hooks
export { useTags, useIntegrationTags, useActionTags, tagKeys } from './useTags';

// Connection hooks
export {
  useConnections,
  useConnection,
  useCreateConnection,
  useUpdateConnection,
  useDeleteConnection,
  useConnectConnection,
  useDisconnectConnection,
  connectionKeys,
} from './useConnections';

// Platform connector hooks
export {
  usePlatformConnectors,
  usePlatformConnector,
  useActivePlatformConnectors,
  platformConnectorKeys,
} from './usePlatformConnectors';

// Health check hooks
export {
  useHealthChecks,
  useLatestHealthCheck,
  useHealthSummary,
  useTriggerHealthCheck,
  useInvalidateHealthChecks,
  healthCheckKeys,
} from './useHealthChecks';

// Reference data hooks
export {
  useReferenceData,
  useSyncJobs,
  useSyncStatus,
  useTriggerSync,
  useInvalidateReferenceData,
  referenceDataKeys,
} from './useReferenceData';

// Tool export hooks
export {
  useUniversalExport,
  useLangChainExport,
  useMCPExport,
  toolExportKeys,
  type ExportFormat,
} from './useToolExport';

// Variable hooks
export {
  useVariables,
  useConnectionVariables,
  useVariable,
  useCreateVariable,
  useCreateConnectionVariable,
  useUpdateVariable,
  useDeleteVariable,
  variableKeys,
  BUILT_IN_VARIABLES,
  type BuiltInVariable,
} from './useVariables';

// Job hooks
export {
  useJobs,
  useJob,
  useJobItems,
  useCancelJob,
  useRetryJob,
  jobKeys,
  type JobsQueryParams,
  type JobsResponse,
  type JobItemsResponse,
} from './useJobs';

// Batch operations hooks
export {
  useSubmitBatch,
  useBatchProgress,
  batchKeys,
  type SubmitBatchInput,
} from './useBatchOperations';

// Schema drift hooks
export {
  useDriftSummary,
  useDriftReports,
  useDriftReport,
  useUpdateDriftReportStatus,
  schemaDriftKeys,
  type DriftReportsFilters,
} from './useSchemaDrift';
