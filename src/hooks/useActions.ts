/**
 * Action Hooks
 *
 * React Query hooks for fetching and managing actions.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { client } from '@/lib/api/client';
import type {
  ListActionsQuery,
  CreateActionInput,
  UpdateActionInput,
} from '@/lib/modules/actions/action.schemas';

// =============================================================================
// Query Keys
// =============================================================================

export const actionKeys = {
  all: ['actions'] as const,
  lists: () => [...actionKeys.all, 'list'] as const,
  list: (integrationId: string, filters?: Partial<ListActionsQuery>) =>
    [...actionKeys.lists(), integrationId, filters] as const,
  details: () => [...actionKeys.all, 'detail'] as const,
  detail: (id: string) => [...actionKeys.details(), id] as const,
  cached: (integrationId: string) => [...actionKeys.all, 'cached', integrationId] as const,
};

// =============================================================================
// Hooks
// =============================================================================

/**
 * Hook to fetch list of actions for an integration
 */
export function useActions(integrationId: string | undefined, params?: Partial<ListActionsQuery>) {
  return useQuery({
    queryKey: actionKeys.list(integrationId!, params),
    queryFn: () => client.actions.list(integrationId!, params),
    enabled: !!integrationId,
    staleTime: 30 * 1000, // 30 seconds
  });
}

/**
 * Hook to fetch lightweight action summaries (id, name, slug only).
 * Much faster than useActions for dropdowns/selectors since it skips heavy JSON columns.
 */
export function useActionSummaries(integrationId: string | undefined) {
  return useQuery({
    queryKey: [...actionKeys.list(integrationId!), 'summaries'] as const,
    queryFn: () => client.actions.listSummaries(integrationId!, { limit: 100 }),
    enabled: !!integrationId,
    staleTime: 60 * 1000, // 1 minute
  });
}

/**
 * Hook to fetch a single action by ID
 * @param actionId - The ID of the action to fetch
 * @param integrationId - The ID of the integration the action belongs to
 */
export function useAction(actionId: string | undefined, integrationId?: string) {
  return useQuery({
    queryKey: actionKeys.detail(actionId!),
    queryFn: () => {
      if (!integrationId) {
        throw new Error('integrationId is required to fetch action');
      }
      return client.actions.getWithIntegration(actionId!, integrationId);
    },
    enabled: !!actionId && !!integrationId,
    staleTime: 60 * 1000, // 1 minute
  });
}

/**
 * Hook to create a new action
 */
export function useCreateAction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateActionInput) => client.actions.create(input),
    onSuccess: (data) => {
      // Invalidate actions list for this integration
      queryClient.invalidateQueries({
        queryKey: actionKeys.list(data.integrationId),
      });
      toast.success('Action created successfully');
    },
    onError: (error: Error) => {
      toast.error('Failed to create action', {
        description: error.message,
      });
    },
  });
}

/**
 * Hook to update an action
 */
export function useUpdateAction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      integrationId,
      ...input
    }: UpdateActionInput & { id: string; integrationId: string }) =>
      client.actions.update(id, input, integrationId),
    onSuccess: (data) => {
      // Update the specific action in cache
      queryClient.setQueryData(actionKeys.detail(data.id), data);
      // Invalidate list to refetch
      queryClient.invalidateQueries({
        queryKey: actionKeys.list(data.integrationId),
      });
      toast.success('Action updated successfully');
    },
    onError: (error: Error) => {
      toast.error('Failed to update action', {
        description: error.message,
      });
    },
  });
}

/**
 * Hook to delete an action
 */
export function useDeleteAction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, integrationId }: { id: string; integrationId: string }) =>
      client.actions.delete(id).then(() => integrationId),
    onSuccess: (integrationId, { id }) => {
      // Remove from cache
      queryClient.removeQueries({ queryKey: actionKeys.detail(id) });
      // Invalidate list
      queryClient.invalidateQueries({
        queryKey: actionKeys.list(integrationId),
      });
      toast.success('Action deleted successfully');
    },
    onError: (error: Error) => {
      toast.error('Failed to delete action', {
        description: error.message,
      });
    },
  });
}

/**
 * Hook to delete multiple actions
 */
export function useBulkDeleteActions() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ ids, integrationId }: { ids: string[]; integrationId: string }) => {
      // Delete all actions in parallel
      await Promise.all(ids.map((id) => client.actions.delete(id)));
      return integrationId;
    },
    onSuccess: (integrationId, { ids }) => {
      // Remove all from cache
      ids.forEach((id) => {
        queryClient.removeQueries({ queryKey: actionKeys.detail(id) });
      });
      // Invalidate list
      queryClient.invalidateQueries({
        queryKey: actionKeys.list(integrationId),
      });
      toast.success(`${ids.length} actions deleted successfully`);
    },
    onError: (error: Error) => {
      toast.error('Failed to delete actions', {
        description: error.message,
      });
    },
  });
}

/**
 * Hook to fetch cached actions from previous scrape results
 * Returns actions that are available but not yet added to the integration
 */
export function useCachedActions(integrationId: string | undefined) {
  return useQuery({
    queryKey: actionKeys.cached(integrationId!),
    queryFn: () => client.actions.getCached(integrationId!),
    enabled: !!integrationId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Hook to discover new actions using AI with a wishlist
 */
export function useDiscoverActions() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      integrationId,
      wishlist,
      specificUrls,
    }: {
      integrationId: string;
      wishlist: string[];
      specificUrls?: string[];
    }) => client.integrations.discoverActions(integrationId, wishlist, { specificUrls }),
    onSuccess: (data, { integrationId }) => {
      // Invalidate cached actions when discovery completes
      queryClient.invalidateQueries({ queryKey: actionKeys.cached(integrationId) });
      toast.success('Discovery started', {
        description: data.message,
      });
    },
    onError: (error: Error) => {
      toast.error('Failed to start discovery', {
        description: error.message,
      });
    },
  });
}

/**
 * Hook to regenerate AI tool descriptions for an action
 */
export function useRegenerateToolDescriptions() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ actionId, integrationId }: { actionId: string; integrationId: string }) =>
      client.actions.regenerateToolDescriptions(actionId, integrationId),
    onSuccess: (data, { actionId, integrationId }) => {
      // Update the action in cache with new descriptions
      queryClient.setQueryData(actionKeys.detail(actionId), (old: unknown) => {
        if (!old || typeof old !== 'object') return old;
        return {
          ...old,
          toolDescription: data.toolDescription,
          toolSuccessTemplate: data.toolSuccessTemplate,
          toolErrorTemplate: data.toolErrorTemplate,
        };
      });
      // Also invalidate the list in case it affects display
      queryClient.invalidateQueries({ queryKey: actionKeys.list(integrationId) });
      toast.success('Tool descriptions regenerated');
    },
    onError: (error: Error) => {
      toast.error('Failed to regenerate tool descriptions', {
        description: error.message,
      });
    },
  });
}
