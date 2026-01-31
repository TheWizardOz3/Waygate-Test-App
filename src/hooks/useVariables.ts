/**
 * Variable Hooks
 *
 * React Query hooks for fetching and managing variables.
 * Supports both tenant-level and connection-level variables.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import type {
  VariableResponse,
  ListVariablesResponse,
  CreateVariableInput,
  UpdateVariableInput,
  VariableFilters,
} from '@/lib/modules/variables/variable.schemas';

// =============================================================================
// Query Keys
// =============================================================================

export const variableKeys = {
  all: ['variables'] as const,
  lists: () => [...variableKeys.all, 'list'] as const,
  list: (filters?: VariableFilters) => [...variableKeys.lists(), filters] as const,
  connectionLists: () => [...variableKeys.all, 'connection', 'list'] as const,
  connectionList: (connectionId: string, filters?: VariableFilters) =>
    [...variableKeys.connectionLists(), connectionId, filters] as const,
  details: () => [...variableKeys.all, 'detail'] as const,
  detail: (id: string) => [...variableKeys.details(), id] as const,
  builtIn: () => [...variableKeys.all, 'built-in'] as const,
};

// =============================================================================
// Types
// =============================================================================

interface ListVariablesParams extends VariableFilters {
  cursor?: string;
  limit?: number;
}

// =============================================================================
// API Functions
// =============================================================================

// Convert params to API-compatible format (filter out nulls)
function toQueryParams(
  params?: ListVariablesParams
): Record<string, string | number | boolean | undefined> | undefined {
  if (!params) return undefined;
  const result: Record<string, string | number | boolean | undefined> = {};
  for (const [key, value] of Object.entries(params)) {
    // Only include non-null values
    if (value !== null) {
      result[key] = value;
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

async function fetchVariables(params?: ListVariablesParams): Promise<ListVariablesResponse> {
  const response = await apiClient.get<{ success: boolean; data: ListVariablesResponse }>(
    '/variables',
    toQueryParams(params)
  );
  return response.data;
}

async function fetchConnectionVariables(
  connectionId: string,
  params?: ListVariablesParams
): Promise<ListVariablesResponse> {
  const response = await apiClient.get<{ success: boolean; data: ListVariablesResponse }>(
    `/connections/${connectionId}/variables`,
    toQueryParams(params)
  );
  return response.data;
}

async function fetchVariable(id: string): Promise<VariableResponse> {
  const response = await apiClient.get<{ success: boolean; data: VariableResponse }>(
    `/variables/${id}`
  );
  return response.data;
}

async function createVariable(input: CreateVariableInput): Promise<VariableResponse> {
  const response = await apiClient.post<{ success: boolean; data: VariableResponse }>(
    '/variables',
    input
  );
  return response.data;
}

async function createConnectionVariable(
  connectionId: string,
  input: CreateVariableInput
): Promise<VariableResponse> {
  const response = await apiClient.post<{ success: boolean; data: VariableResponse }>(
    `/connections/${connectionId}/variables`,
    input
  );
  return response.data;
}

async function updateVariable({
  id,
  ...input
}: UpdateVariableInput & { id: string }): Promise<VariableResponse> {
  const response = await apiClient.patch<{ success: boolean; data: VariableResponse }>(
    `/variables/${id}`,
    input
  );
  return response.data;
}

async function deleteVariable(id: string): Promise<void> {
  await apiClient.delete(`/variables/${id}`);
}

// =============================================================================
// Hooks
// =============================================================================

/**
 * Hook to fetch tenant-level variables
 */
export function useVariables(params?: ListVariablesParams) {
  return useQuery({
    queryKey: variableKeys.list(params),
    queryFn: () => fetchVariables(params),
    staleTime: 30 * 1000, // 30 seconds
  });
}

/**
 * Hook to fetch connection-level variables
 */
export function useConnectionVariables(
  connectionId: string | undefined,
  params?: ListVariablesParams
) {
  return useQuery({
    queryKey: variableKeys.connectionList(connectionId!, params),
    queryFn: () => fetchConnectionVariables(connectionId!, params),
    enabled: !!connectionId,
    staleTime: 30 * 1000, // 30 seconds
  });
}

/**
 * Hook to fetch a single variable by ID
 */
export function useVariable(id: string | undefined) {
  return useQuery({
    queryKey: variableKeys.detail(id!),
    queryFn: () => fetchVariable(id!),
    enabled: !!id,
    staleTime: 60 * 1000, // 1 minute
  });
}

/**
 * Hook to create a tenant-level variable
 */
export function useCreateVariable() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createVariable,
    onSuccess: () => {
      // Invalidate variables list
      queryClient.invalidateQueries({ queryKey: variableKeys.lists() });
    },
  });
}

/**
 * Hook to create a connection-level variable
 */
export function useCreateConnectionVariable(connectionId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateVariableInput) => createConnectionVariable(connectionId, input),
    onSuccess: () => {
      // Invalidate connection variables list
      queryClient.invalidateQueries({ queryKey: variableKeys.connectionList(connectionId) });
    },
  });
}

/**
 * Hook to update a variable
 */
export function useUpdateVariable(connectionId?: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateVariable,
    onSuccess: (data) => {
      // Update the specific variable in cache
      queryClient.setQueryData(variableKeys.detail(data.id), data);
      // Invalidate lists to refetch
      queryClient.invalidateQueries({ queryKey: variableKeys.lists() });
      if (connectionId) {
        queryClient.invalidateQueries({ queryKey: variableKeys.connectionList(connectionId) });
      }
    },
  });
}

/**
 * Hook to delete a variable
 */
export function useDeleteVariable(connectionId?: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteVariable,
    onSuccess: (_, id) => {
      // Remove from cache
      queryClient.removeQueries({ queryKey: variableKeys.detail(id) });
      // Invalidate lists
      queryClient.invalidateQueries({ queryKey: variableKeys.lists() });
      if (connectionId) {
        queryClient.invalidateQueries({ queryKey: variableKeys.connectionList(connectionId) });
      }
    },
  });
}

// =============================================================================
// Built-in Variables Reference
// =============================================================================

/**
 * Static list of built-in runtime variables for autocomplete
 */
export const BUILT_IN_VARIABLES = [
  // Current User context
  {
    path: 'current_user.id',
    description: 'ID of the end-user making the request',
    category: 'current_user',
  },
  { path: 'current_user.email', description: 'Email of the end-user', category: 'current_user' },
  { path: 'current_user.name', description: 'Name of the end-user', category: 'current_user' },
  // Connection context
  { path: 'connection.id', description: 'Connection ID', category: 'connection' },
  { path: 'connection.name', description: 'Connection display name', category: 'connection' },
  {
    path: 'connection.workspaceId',
    description: 'Workspace/team ID from OAuth',
    category: 'connection',
  },
  // Request context
  { path: 'request.id', description: 'Unique request ID', category: 'request' },
  { path: 'request.timestamp', description: 'ISO timestamp of the request', category: 'request' },
  {
    path: 'request.environment',
    description: 'Current environment (dev/staging/prod)',
    category: 'request',
  },
] as const;

export type BuiltInVariable = (typeof BUILT_IN_VARIABLES)[number];
