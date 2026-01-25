/**
 * Connection Hooks
 *
 * React Query hooks for fetching and managing connections.
 * Connections link consuming apps to integrations with separate credentials.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import type {
  ConnectionResponse,
  CreateConnectionInput,
  UpdateConnectionInput,
  ListConnectionsResponse,
} from '@/lib/modules/connections/connection.schemas';

// =============================================================================
// Query Keys
// =============================================================================

export const connectionKeys = {
  all: ['connections'] as const,
  lists: () => [...connectionKeys.all, 'list'] as const,
  list: (integrationId: string, filters?: ConnectionFilters) =>
    [...connectionKeys.lists(), integrationId, filters] as const,
  details: () => [...connectionKeys.all, 'detail'] as const,
  detail: (id: string) => [...connectionKeys.details(), id] as const,
};

// =============================================================================
// Types
// =============================================================================

interface ConnectionFilters {
  status?: 'active' | 'error' | 'disabled';
  isPrimary?: boolean;
  search?: string;
}

interface ListConnectionsParams extends ConnectionFilters {
  cursor?: string;
  limit?: number;
}

// =============================================================================
// API Functions
// =============================================================================

async function fetchConnections(
  integrationId: string,
  params?: ListConnectionsParams
): Promise<ListConnectionsResponse> {
  return apiClient.get<ListConnectionsResponse>(`/integrations/${integrationId}/connections`, {
    cursor: params?.cursor,
    limit: params?.limit,
    status: params?.status,
    isPrimary: params?.isPrimary,
    search: params?.search,
  });
}

async function fetchConnection(connectionId: string): Promise<ConnectionResponse> {
  return apiClient.get<ConnectionResponse>(`/connections/${connectionId}`);
}

async function createConnection(
  integrationId: string,
  input: CreateConnectionInput
): Promise<ConnectionResponse> {
  return apiClient.post<ConnectionResponse>(`/integrations/${integrationId}/connections`, input);
}

async function updateConnection({
  id,
  ...input
}: UpdateConnectionInput & { id: string }): Promise<ConnectionResponse> {
  return apiClient.patch<ConnectionResponse>(`/connections/${id}`, input);
}

async function deleteConnection(id: string): Promise<void> {
  return apiClient.delete(`/connections/${id}`);
}

async function connectConnection(connectionId: string): Promise<{ authorizationUrl: string }> {
  return apiClient.post<{ authorizationUrl: string }>(`/connections/${connectionId}/connect`, {});
}

async function disconnectConnection(
  connectionId: string
): Promise<{ message: string; credentialsRevoked: number }> {
  return apiClient.post<{ message: string; credentialsRevoked: number }>(
    `/connections/${connectionId}/disconnect`,
    {}
  );
}

// =============================================================================
// Hooks
// =============================================================================

/**
 * Hook to fetch list of connections for an integration
 */
export function useConnections(integrationId: string | undefined, params?: ListConnectionsParams) {
  return useQuery({
    queryKey: connectionKeys.list(integrationId!, params),
    queryFn: () => fetchConnections(integrationId!, params),
    enabled: !!integrationId,
    staleTime: 30 * 1000, // 30 seconds
  });
}

/**
 * Hook to fetch a single connection by ID
 */
export function useConnection(connectionId: string | undefined) {
  return useQuery({
    queryKey: connectionKeys.detail(connectionId!),
    queryFn: () => fetchConnection(connectionId!),
    enabled: !!connectionId,
    staleTime: 60 * 1000, // 1 minute
  });
}

/**
 * Hook to create a new connection
 */
export function useCreateConnection(integrationId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateConnectionInput) => createConnection(integrationId, input),
    onSuccess: () => {
      // Invalidate connections list for this integration
      queryClient.invalidateQueries({ queryKey: connectionKeys.list(integrationId) });
    },
  });
}

/**
 * Hook to update a connection
 */
export function useUpdateConnection(integrationId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateConnection,
    onSuccess: (data) => {
      // Update the specific connection in cache
      queryClient.setQueryData(connectionKeys.detail(data.id), data);
      // Invalidate list to refetch
      queryClient.invalidateQueries({ queryKey: connectionKeys.list(integrationId) });
    },
  });
}

/**
 * Hook to delete a connection
 */
export function useDeleteConnection(integrationId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteConnection,
    onSuccess: (_, id) => {
      // Remove from cache
      queryClient.removeQueries({ queryKey: connectionKeys.detail(id) });
      // Invalidate list
      queryClient.invalidateQueries({ queryKey: connectionKeys.list(integrationId) });
    },
  });
}

/**
 * Hook to initiate OAuth connection for a connection
 */
export function useConnectConnection(integrationId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: connectConnection,
    onSuccess: (_, connectionId) => {
      // Invalidate to refetch status after redirect
      queryClient.invalidateQueries({ queryKey: connectionKeys.detail(connectionId) });
      queryClient.invalidateQueries({ queryKey: connectionKeys.list(integrationId) });
    },
  });
}

/**
 * Hook to disconnect a connection (revoke credentials)
 */
export function useDisconnectConnection(integrationId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: disconnectConnection,
    onSuccess: (_, connectionId) => {
      // Invalidate to refetch status
      queryClient.invalidateQueries({ queryKey: connectionKeys.detail(connectionId) });
      queryClient.invalidateQueries({ queryKey: connectionKeys.list(integrationId) });
    },
  });
}
