/**
 * Unified Tools Hooks
 *
 * React Query hooks for fetching unified tools (simple, composite, agentic).
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import type {
  ListUnifiedToolsResponse,
  ToolType,
  ToolStatus,
} from '@/lib/modules/tools/unified-tool.schemas';

// =============================================================================
// Query Keys
// =============================================================================

export const unifiedToolKeys = {
  all: ['unified-tools'] as const,
  lists: () => [...unifiedToolKeys.all, 'list'] as const,
  list: (filters?: UnifiedToolFilters) => [...unifiedToolKeys.lists(), filters] as const,
  details: () => [...unifiedToolKeys.all, 'detail'] as const,
  detail: (id: string, type: ToolType) => [...unifiedToolKeys.details(), id, type] as const,
};

// =============================================================================
// Types
// =============================================================================

export interface UnifiedToolFilters {
  types?: ToolType[];
  integrationId?: string;
  search?: string;
  status?: ToolStatus[];
  excludeIds?: string[];
}

interface ListUnifiedToolsParams extends UnifiedToolFilters {
  cursor?: string;
  limit?: number;
}

// =============================================================================
// API Functions
// =============================================================================

async function fetchUnifiedTools(
  params?: ListUnifiedToolsParams
): Promise<ListUnifiedToolsResponse> {
  const response = await apiClient.get<{ success: boolean; data: ListUnifiedToolsResponse }>(
    '/tools',
    {
      types: params?.types?.join(','),
      integrationId: params?.integrationId,
      search: params?.search,
      status: params?.status?.join(','),
      excludeIds: params?.excludeIds?.join(','),
      cursor: params?.cursor,
      limit: params?.limit,
    }
  );

  // Handle both wrapped and unwrapped response formats
  if ('success' in response && response.success && 'data' in response) {
    return response.data;
  }

  return response as unknown as ListUnifiedToolsResponse;
}

// =============================================================================
// Hooks
// =============================================================================

/**
 * Hook to fetch list of unified tools with optional filters
 */
export function useUnifiedTools(params?: ListUnifiedToolsParams) {
  return useQuery({
    queryKey: unifiedToolKeys.list(params),
    queryFn: () => fetchUnifiedTools(params),
    staleTime: 30 * 1000, // 30 seconds
  });
}

/**
 * Hook to invalidate unified tools queries (useful after mutations on specific tool types)
 */
export function useInvalidateUnifiedTools() {
  const queryClient = useQueryClient();

  return {
    invalidateAll: () => {
      queryClient.invalidateQueries({ queryKey: unifiedToolKeys.lists() });
    },
  };
}
