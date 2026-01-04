/**
 * useTags Hook
 *
 * React Query hook for fetching all tags in the tenant.
 * Used for tag autocomplete in TagInput components.
 */

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';

// =============================================================================
// Types
// =============================================================================

export interface TagsResponse {
  tags: string[];
}

// =============================================================================
// Query Keys
// =============================================================================

export const tagKeys = {
  all: ['tags'] as const,
  list: (type?: string) => [...tagKeys.all, 'list', type] as const,
};

// =============================================================================
// API Functions
// =============================================================================

async function fetchTags(type?: 'integrations' | 'actions' | 'all'): Promise<TagsResponse> {
  const params = type && type !== 'all' ? `?type=${type}` : '';
  const response = await apiClient.get<{ success: boolean; data: TagsResponse }>(
    `/api/v1/tags${params}`
  );

  if (!response.success) {
    throw new Error('Failed to fetch tags');
  }

  return response.data;
}

// =============================================================================
// Hooks
// =============================================================================

/**
 * Hook to fetch all tags in the tenant
 *
 * @param type - Filter by 'integrations', 'actions', or 'all' (default)
 */
export function useTags(type?: 'integrations' | 'actions' | 'all') {
  return useQuery({
    queryKey: tagKeys.list(type),
    queryFn: () => fetchTags(type),
    staleTime: 30_000, // Consider fresh for 30 seconds
  });
}

/**
 * Hook to fetch only integration tags
 */
export function useIntegrationTags() {
  return useTags('integrations');
}

/**
 * Hook to fetch only action tags
 */
export function useActionTags() {
  return useTags('actions');
}
