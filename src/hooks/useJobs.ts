/**
 * Jobs Hooks
 *
 * React Query hooks for fetching and managing async jobs.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import type {
  AsyncJobResponse,
  AsyncJobDetailResponse,
  AsyncJobItemResponse,
} from '@/lib/modules/jobs/jobs.schemas';

// =============================================================================
// Types
// =============================================================================

export interface JobsQueryParams {
  type?: string;
  status?: string;
  limit?: number;
  cursor?: string;
}

export interface JobsResponse {
  jobs: AsyncJobResponse[];
  pagination: {
    cursor: string | null;
    hasMore: boolean;
    totalCount: number;
  };
}

export interface JobItemsResponse {
  items: AsyncJobItemResponse[];
  pagination: {
    cursor: string | null;
    hasMore: boolean;
    totalCount: number;
  };
}

// =============================================================================
// Query Keys
// =============================================================================

export const jobKeys = {
  all: ['jobs'] as const,
  lists: () => [...jobKeys.all, 'list'] as const,
  list: (params?: JobsQueryParams) => [...jobKeys.lists(), params] as const,
  details: () => [...jobKeys.all, 'detail'] as const,
  detail: (id: string) => [...jobKeys.details(), id] as const,
  items: (jobId: string, params?: { status?: string; cursor?: string; limit?: number }) =>
    [...jobKeys.all, 'items', jobId, params] as const,
};

// =============================================================================
// Hooks
// =============================================================================

/**
 * Hook to fetch paginated jobs with filters
 */
export function useJobs(params?: JobsQueryParams) {
  return useQuery({
    queryKey: jobKeys.list(params),
    queryFn: () =>
      apiClient.get<JobsResponse>('/jobs', {
        ...params,
        limit: params?.limit ?? 20,
      } as Record<string, string | number | boolean | undefined>),
    staleTime: 10 * 1000, // 10 seconds
  });
}

/**
 * Hook to fetch a single job with item counts
 */
export function useJob(id: string | undefined) {
  return useQuery({
    queryKey: jobKeys.detail(id!),
    queryFn: () => apiClient.get<AsyncJobDetailResponse>(`/jobs/${id}`),
    enabled: !!id,
    staleTime: 5 * 1000, // 5 seconds — jobs update frequently
  });
}

/**
 * Hook to fetch items for a batch job
 */
export function useJobItems(
  jobId: string | undefined,
  params?: { status?: string; cursor?: string; limit?: number }
) {
  return useQuery({
    queryKey: jobKeys.items(jobId!, params),
    queryFn: () =>
      apiClient.get<JobItemsResponse>(`/jobs/${jobId}/items`, {
        ...params,
      } as Record<string, string | number | boolean | undefined>),
    enabled: !!jobId,
    staleTime: 5 * 1000,
  });
}

/**
 * Hook to cancel a job
 */
export function useCancelJob() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (jobId: string) => apiClient.post<AsyncJobResponse>(`/jobs/${jobId}/cancel`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: jobKeys.all });
    },
  });
}

/**
 * Hook to retry a failed job
 */
export function useRetryJob() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (jobId: string) => apiClient.post<AsyncJobResponse>(`/jobs/${jobId}/retry`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: jobKeys.all });
    },
  });
}
