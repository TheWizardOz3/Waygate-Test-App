/**
 * Mapping Hooks
 *
 * React Query hooks for field mapping CRUD operations.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiClient } from '@/lib/api/client';
import type {
  FieldMapping,
  MappingConfig,
  CreateFieldMapping,
  UpdateFieldMapping,
  MappingPreviewRequest,
  MappingPreviewResponse,
} from '@/lib/modules/execution/mapping';

// =============================================================================
// Query Keys
// =============================================================================

export const mappingKeys = {
  all: ['mappings'] as const,
  lists: () => [...mappingKeys.all, 'list'] as const,
  list: (actionId: string) => [...mappingKeys.lists(), actionId] as const,
  config: (actionId: string) => [...mappingKeys.all, 'config', actionId] as const,
  detail: (mappingId: string) => [...mappingKeys.all, 'detail', mappingId] as const,
};

// =============================================================================
// Types
// =============================================================================

interface MappingsResponse {
  mappings: FieldMapping[];
  config?: MappingConfig;
}

// =============================================================================
// List Mappings
// =============================================================================

/**
 * Fetch all mappings for an action
 */
export function useMappings(actionId: string | undefined, integrationId: string | undefined) {
  return useQuery({
    queryKey: mappingKeys.list(actionId ?? ''),
    queryFn: async (): Promise<MappingsResponse> => {
      if (!actionId || !integrationId) {
        return { mappings: [] };
      }
      // apiClient already unwraps the `data` property from API responses
      return apiClient.get<MappingsResponse>(
        `/integrations/${integrationId}/actions/${actionId}/mappings?includeConfig=true`
      );
    },
    enabled: !!actionId && !!integrationId,
  });
}

// =============================================================================
// Get Mapping Config
// =============================================================================

/**
 * Fetch mapping configuration for an action
 */
export function useMappingConfig(actionId: string | undefined, integrationId: string | undefined) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: mappingKeys.config(actionId ?? ''),
    queryFn: async (): Promise<MappingConfig | undefined> => {
      if (!actionId || !integrationId) {
        return undefined;
      }
      // apiClient already unwraps the `data` property from API responses
      const response = await apiClient.get<MappingsResponse>(
        `/integrations/${integrationId}/actions/${actionId}/mappings?includeConfig=true`
      );
      return response.config;
    },
    enabled: !!actionId && !!integrationId,
  });

  const mutation = useMutation({
    mutationFn: async (config: Partial<MappingConfig>) => {
      if (!actionId || !integrationId) {
        throw new Error('Action ID and Integration ID required');
      }
      // apiClient already unwraps the `data` property from API responses
      return apiClient.patch<MappingConfig>(
        `/integrations/${integrationId}/actions/${actionId}/mappings`,
        config
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: mappingKeys.config(actionId ?? '') });
      queryClient.invalidateQueries({ queryKey: mappingKeys.list(actionId ?? '') });
    },
    onError: () => {
      toast.error('Failed to update mapping configuration');
    },
  });

  return {
    ...query,
    mutateAsync: mutation.mutateAsync,
    isPending: mutation.isPending,
  };
}

// =============================================================================
// Create Mapping
// =============================================================================

/**
 * Create a new mapping
 */
export function useCreateMapping(actionId: string | undefined, integrationId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (mapping: CreateFieldMapping) => {
      if (!actionId || !integrationId) {
        throw new Error('Action ID and Integration ID required');
      }
      // apiClient already unwraps the `data` property from API responses
      return apiClient.post<FieldMapping>(
        `/integrations/${integrationId}/actions/${actionId}/mappings`,
        mapping
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: mappingKeys.list(actionId ?? '') });
      queryClient.invalidateQueries({ queryKey: mappingKeys.config(actionId ?? '') });
    },
    onError: () => {
      toast.error('Failed to create mapping');
    },
  });
}

// =============================================================================
// Update Mapping
// =============================================================================

interface UpdateMappingInput {
  mappingId: string;
  data: UpdateFieldMapping;
}

/**
 * Update an existing mapping
 */
export function useUpdateMapping(actionId: string | undefined, integrationId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ mappingId, data }: UpdateMappingInput) => {
      if (!actionId || !integrationId) {
        throw new Error('Action ID and Integration ID required');
      }
      // apiClient already unwraps the `data` property from API responses
      return apiClient.patch<FieldMapping>(
        `/integrations/${integrationId}/actions/${actionId}/mappings/${mappingId}`,
        data
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: mappingKeys.list(actionId ?? '') });
    },
    onError: () => {
      toast.error('Failed to update mapping');
    },
  });
}

// =============================================================================
// Delete Mapping
// =============================================================================

/**
 * Delete a mapping
 */
export function useDeleteMapping(actionId: string | undefined, integrationId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (mappingId: string) => {
      if (!actionId || !integrationId) {
        throw new Error('Action ID and Integration ID required');
      }
      await apiClient.delete(
        `/integrations/${integrationId}/actions/${actionId}/mappings/${mappingId}`
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: mappingKeys.list(actionId ?? '') });
    },
    onError: () => {
      toast.error('Failed to delete mapping');
    },
  });
}

// =============================================================================
// Preview Mapping
// =============================================================================

/**
 * Preview mapping transformation
 */
export function usePreviewMapping(actionId: string | undefined, integrationId: string | undefined) {
  return useMutation({
    mutationFn: async (request: MappingPreviewRequest): Promise<MappingPreviewResponse> => {
      if (!actionId || !integrationId) {
        throw new Error('Action ID and Integration ID required');
      }
      // apiClient already unwraps the `data` property from API responses
      return apiClient.post<MappingPreviewResponse>(
        `/integrations/${integrationId}/actions/${actionId}/mappings/preview`,
        request
      );
    },
    onError: () => {
      toast.error('Failed to preview mapping');
    },
  });
}

// =============================================================================
// Bulk Mapping Operations
// =============================================================================

interface BulkMappingInput {
  mappings: FieldMapping[];
  replace?: boolean;
}

interface BulkMappingResult {
  mappings: FieldMapping[];
  created: number;
  updated: number;
  replaced: boolean;
}

/**
 * Bulk create/update mappings
 */
export function useBulkMappings(actionId: string | undefined, integrationId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ mappings, replace }: BulkMappingInput): Promise<BulkMappingResult> => {
      if (!actionId || !integrationId) {
        throw new Error('Action ID and Integration ID required');
      }
      // apiClient already unwraps the `data` property from API responses
      return apiClient.post<BulkMappingResult>(
        `/integrations/${integrationId}/actions/${actionId}/mappings/bulk`,
        { mappings, replace }
      );
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: mappingKeys.list(actionId ?? '') });
      toast.success(`Mappings saved: ${data.created} created, ${data.updated} updated`);
    },
    onError: () => {
      toast.error('Failed to save mappings');
    },
  });
}
