/**
 * App Hooks
 *
 * React Query hooks for fetching and managing apps and integration configs.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import type {
  AppResponse,
  AppWithKeyResponse,
  ListAppsResponse,
  CreateAppInput,
  UpdateAppInput,
  IntegrationConfigResponse,
  SetIntegrationConfigInput,
} from '@/lib/modules/apps/app.schemas';

// =============================================================================
// Query Keys
// =============================================================================

export const appKeys = {
  all: ['apps'] as const,
  lists: () => [...appKeys.all, 'list'] as const,
  list: (filters?: AppListParams) => [...appKeys.lists(), filters] as const,
  details: () => [...appKeys.all, 'detail'] as const,
  detail: (id: string) => [...appKeys.details(), id] as const,
  connections: (appId: string) => [...appKeys.detail(appId), 'connections'] as const,
  integrationConfigs: (appId: string) => [...appKeys.detail(appId), 'integration-configs'] as const,
  integrationConfig: (appId: string, integrationId: string) =>
    [...appKeys.integrationConfigs(appId), integrationId] as const,
  credentialStats: (appId: string) => [...appKeys.detail(appId), 'credential-stats'] as const,
};

// =============================================================================
// Types
// =============================================================================

export interface AppListParams {
  cursor?: string;
  limit?: number;
  status?: string;
  search?: string;
}

// =============================================================================
// API Functions
// =============================================================================

function toQueryParams(
  params?: AppListParams
): Record<string, string | number | boolean | undefined> | undefined {
  if (!params) return undefined;
  const result: Record<string, string | number | boolean | undefined> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      result[key] = value;
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

async function fetchApps(params?: AppListParams): Promise<ListAppsResponse> {
  return apiClient.get<ListAppsResponse>('/apps', toQueryParams(params));
}

async function fetchApp(id: string): Promise<AppResponse> {
  return apiClient.get<AppResponse>(`/apps/${id}`);
}

async function createApp(input: CreateAppInput): Promise<AppWithKeyResponse> {
  return apiClient.post<AppWithKeyResponse>('/apps', input);
}

async function updateApp({ id, ...input }: UpdateAppInput & { id: string }): Promise<AppResponse> {
  return apiClient.patch<AppResponse>(`/apps/${id}`, input);
}

async function deleteApp(id: string): Promise<void> {
  await apiClient.delete(`/apps/${id}`);
}

async function regenerateAppKey(id: string): Promise<{ apiKey: string }> {
  return apiClient.post<{ apiKey: string }>(`/apps/${id}/api-key/regenerate`);
}

async function fetchIntegrationConfig(
  appId: string,
  integrationId: string
): Promise<IntegrationConfigResponse> {
  return apiClient.get<IntegrationConfigResponse>(
    `/apps/${appId}/integrations/${integrationId}/config`
  );
}

async function setIntegrationConfig({
  appId,
  integrationId,
  ...input
}: SetIntegrationConfigInput & {
  appId: string;
  integrationId: string;
}): Promise<IntegrationConfigResponse> {
  return apiClient.put<IntegrationConfigResponse>(
    `/apps/${appId}/integrations/${integrationId}/config`,
    input
  );
}

async function deleteIntegrationConfig(appId: string, integrationId: string): Promise<void> {
  await apiClient.delete(`/apps/${appId}/integrations/${integrationId}/config`);
}

// =============================================================================
// Hooks
// =============================================================================

/**
 * Hook to fetch list of apps
 */
export function useApps(params?: AppListParams) {
  return useQuery({
    queryKey: appKeys.list(params),
    queryFn: () => fetchApps(params),
    staleTime: 30 * 1000,
  });
}

/**
 * Hook to fetch a single app by ID
 */
export function useApp(id: string | undefined) {
  return useQuery({
    queryKey: appKeys.detail(id!),
    queryFn: () => fetchApp(id!),
    enabled: !!id,
    staleTime: 60 * 1000,
  });
}

/**
 * Hook to create a new app
 */
export function useCreateApp() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createApp,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: appKeys.lists() });
    },
  });
}

/**
 * Hook to update an app
 */
export function useUpdateApp() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateApp,
    onSuccess: (data) => {
      queryClient.setQueryData(appKeys.detail(data.id), data);
      queryClient.invalidateQueries({ queryKey: appKeys.lists() });
    },
  });
}

/**
 * Hook to delete an app
 */
export function useDeleteApp() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteApp,
    onSuccess: (_, id) => {
      queryClient.removeQueries({ queryKey: appKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: appKeys.lists() });
    },
  });
}

/**
 * Hook to regenerate an app's API key
 */
export function useRegenerateAppKey() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: regenerateAppKey,
    onSuccess: (_, appId) => {
      queryClient.invalidateQueries({ queryKey: appKeys.detail(appId) });
    },
  });
}

/**
 * Hook to fetch an integration config for an app
 */
export function useIntegrationConfig(appId: string | undefined, integrationId: string | undefined) {
  return useQuery({
    queryKey: appKeys.integrationConfig(appId!, integrationId!),
    queryFn: () => fetchIntegrationConfig(appId!, integrationId!),
    enabled: !!appId && !!integrationId,
    staleTime: 60 * 1000,
  });
}

/**
 * Hook to set (create/update) an integration config
 */
export function useSetIntegrationConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: setIntegrationConfig,
    onSuccess: (data) => {
      queryClient.setQueryData(appKeys.integrationConfig(data.appId, data.integrationId), data);
      queryClient.invalidateQueries({
        queryKey: appKeys.integrationConfigs(data.appId),
      });
    },
  });
}

/**
 * Hook to delete an integration config
 */
export function useDeleteIntegrationConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ appId, integrationId }: { appId: string; integrationId: string }) =>
      deleteIntegrationConfig(appId, integrationId),
    onSuccess: (_, { appId, integrationId }) => {
      queryClient.removeQueries({
        queryKey: appKeys.integrationConfig(appId, integrationId),
      });
      queryClient.invalidateQueries({
        queryKey: appKeys.integrationConfigs(appId),
      });
    },
  });
}

// =============================================================================
// App Connections
// =============================================================================

import type { ConnectionResponse } from '@/lib/modules/connections/connection.schemas';

export interface AppConnectionResponse extends ConnectionResponse {
  integrationName: string;
  integrationSlug: string;
}

async function fetchAppConnections(
  appId: string
): Promise<{ connections: AppConnectionResponse[] }> {
  return apiClient.get<{ connections: AppConnectionResponse[] }>(`/apps/${appId}/connections`);
}

/**
 * Hook to fetch connections associated with an app
 */
export function useAppConnections(appId: string | undefined) {
  return useQuery({
    queryKey: appKeys.connections(appId!),
    queryFn: () => fetchAppConnections(appId!),
    enabled: !!appId,
    staleTime: 30 * 1000,
  });
}

// =============================================================================
// Credential Stats
// =============================================================================

export interface AppCredentialStatsResponse {
  total: number;
  byStatus: Record<string, number>;
  byConnection: Array<{
    connectionId: string;
    connectionName: string;
    integrationId: string;
    integrationName: string;
    integrationSlug: string;
    total: number;
    byStatus: Record<string, number>;
  }>;
}

async function fetchAppCredentialStats(appId: string): Promise<AppCredentialStatsResponse> {
  return apiClient.get<AppCredentialStatsResponse>(`/apps/${appId}/credential-stats`);
}

/**
 * Hook to fetch end-user credential stats for an app
 */
export function useAppCredentialStats(appId: string | undefined) {
  return useQuery({
    queryKey: appKeys.credentialStats(appId!),
    queryFn: () => fetchAppCredentialStats(appId!),
    enabled: !!appId,
    staleTime: 30 * 1000,
  });
}

// =============================================================================
// Connection Credential Stats
// =============================================================================

export interface ConnectionCredentialStatsResponse {
  connectionId: string;
  total: number;
  byStatus: Record<string, number>;
}

async function fetchConnectionCredentialStats(
  connectionId: string
): Promise<ConnectionCredentialStatsResponse> {
  return apiClient.get<ConnectionCredentialStatsResponse>(
    `/connections/${connectionId}/user-credential-stats`
  );
}

export const connectionCredentialStatsKeys = {
  all: ['connection-credential-stats'] as const,
  detail: (connectionId: string) => [...connectionCredentialStatsKeys.all, connectionId] as const,
};

/**
 * Hook to fetch end-user credential stats for a connection
 */
export function useConnectionCredentialStats(connectionId: string | undefined) {
  return useQuery({
    queryKey: connectionCredentialStatsKeys.detail(connectionId!),
    queryFn: () => fetchConnectionCredentialStats(connectionId!),
    enabled: !!connectionId,
    staleTime: 30 * 1000,
  });
}
