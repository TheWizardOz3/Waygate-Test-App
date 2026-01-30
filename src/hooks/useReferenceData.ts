/**
 * Reference Data Hooks
 *
 * React Query hooks for fetching and managing reference data and sync jobs.
 * Reference data is cached contextual information (users, channels, etc.)
 * from external APIs that AI tools can use.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import type {
  ListReferenceDataResponse,
  ListSyncJobsResponse,
  SyncJobResponse,
  ReferenceDataSummary,
} from '@/lib/modules/reference-data';

// =============================================================================
// Query Keys
// =============================================================================

export const referenceDataKeys = {
  all: ['referenceData'] as const,
  lists: () => [...referenceDataKeys.all, 'list'] as const,
  list: (integrationId: string, filters?: ReferenceDataFilters) =>
    [...referenceDataKeys.lists(), integrationId, filters] as const,
  summary: (integrationId: string) => [...referenceDataKeys.all, 'summary', integrationId] as const,
  syncJobs: (integrationId: string, filters?: SyncJobFilters) =>
    [...referenceDataKeys.all, 'syncJobs', integrationId, filters] as const,
  syncStatus: (integrationId: string) =>
    [...referenceDataKeys.all, 'syncStatus', integrationId] as const,
};

// =============================================================================
// Types
// =============================================================================

interface ReferenceDataFilters {
  dataType?: string;
  status?: 'active' | 'inactive' | 'deleted';
  search?: string;
  connectionId?: string;
}

interface SyncJobFilters {
  status?: 'pending' | 'syncing' | 'completed' | 'failed';
  dataType?: string;
  connectionId?: string;
}

interface ListReferenceDataParams extends ReferenceDataFilters {
  cursor?: string;
  limit?: number;
}

interface ListSyncJobsParams extends SyncJobFilters {
  cursor?: string;
  limit?: number;
}

interface SyncStatus {
  lastSync: string | null;
  nextSync: string | null;
  summaryByType: ReferenceDataSummary[];
  recentJobs: SyncJobResponse[];
}

// =============================================================================
// API Functions
// =============================================================================

async function fetchReferenceData(
  integrationId: string,
  params?: ListReferenceDataParams
): Promise<ListReferenceDataResponse> {
  return apiClient.get<ListReferenceDataResponse>(`/integrations/${integrationId}/reference-data`, {
    cursor: params?.cursor,
    limit: params?.limit,
    dataType: params?.dataType,
    status: params?.status,
    search: params?.search,
    connectionId: params?.connectionId,
  });
}

async function fetchSyncJobs(
  integrationId: string,
  params?: ListSyncJobsParams
): Promise<ListSyncJobsResponse> {
  return apiClient.get<ListSyncJobsResponse>(
    `/integrations/${integrationId}/reference-data/sync/status`,
    {
      cursor: params?.cursor,
      limit: params?.limit,
      status: params?.status,
      dataType: params?.dataType,
      connectionId: params?.connectionId,
    }
  );
}

async function fetchSyncStatus(integrationId: string): Promise<SyncStatus> {
  return apiClient.get<SyncStatus>(`/integrations/${integrationId}/reference-data/sync/status`);
}

async function triggerSync(
  integrationId: string,
  options?: { connectionId?: string; dataType?: string }
): Promise<SyncJobResponse> {
  return apiClient.post<SyncJobResponse>(
    `/integrations/${integrationId}/reference-data/sync`,
    options || {}
  );
}

// =============================================================================
// Hooks
// =============================================================================

/**
 * Hook to fetch list of reference data for an integration
 */
export function useReferenceData(
  integrationId: string | undefined,
  params?: ListReferenceDataParams
) {
  return useQuery({
    queryKey: referenceDataKeys.list(integrationId!, params),
    queryFn: () => fetchReferenceData(integrationId!, params),
    enabled: !!integrationId,
    staleTime: 60 * 1000, // 1 minute
  });
}

/**
 * Hook to fetch sync jobs for an integration
 */
export function useSyncJobs(integrationId: string | undefined, params?: ListSyncJobsParams) {
  return useQuery({
    queryKey: referenceDataKeys.syncJobs(integrationId!, params),
    queryFn: () => fetchSyncJobs(integrationId!, params),
    enabled: !!integrationId,
    staleTime: 30 * 1000, // 30 seconds
  });
}

/**
 * Hook to fetch sync status summary for an integration
 */
export function useSyncStatus(integrationId: string | undefined) {
  return useQuery({
    queryKey: referenceDataKeys.syncStatus(integrationId!),
    queryFn: () => fetchSyncStatus(integrationId!),
    enabled: !!integrationId,
    staleTime: 30 * 1000, // 30 seconds
    refetchInterval: 60 * 1000, // Refetch every minute
  });
}

/**
 * Hook to trigger a manual sync
 */
export function useTriggerSync(integrationId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (options?: { connectionId?: string; dataType?: string }) =>
      triggerSync(integrationId, options),
    onSuccess: () => {
      // Invalidate all reference data queries for this integration
      queryClient.invalidateQueries({ queryKey: referenceDataKeys.list(integrationId) });
      queryClient.invalidateQueries({ queryKey: referenceDataKeys.syncJobs(integrationId) });
      queryClient.invalidateQueries({ queryKey: referenceDataKeys.syncStatus(integrationId) });
    },
  });
}

/**
 * Hook to invalidate reference data queries
 */
export function useInvalidateReferenceData() {
  const queryClient = useQueryClient();

  return (integrationId: string) => {
    queryClient.invalidateQueries({ queryKey: referenceDataKeys.list(integrationId) });
    queryClient.invalidateQueries({ queryKey: referenceDataKeys.syncJobs(integrationId) });
    queryClient.invalidateQueries({ queryKey: referenceDataKeys.syncStatus(integrationId) });
  };
}
