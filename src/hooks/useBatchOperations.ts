/**
 * Batch Operations Hooks
 *
 * React Query hooks for submitting and monitoring batch operations.
 * Reuses existing job hooks for detailed monitoring.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { jobKeys } from './useJobs';
import type { BatchOperationResponse } from '@/lib/modules/batch-operations/batch-operations.schemas';
import type { AsyncJobDetailResponse } from '@/lib/modules/jobs/jobs.schemas';

// =============================================================================
// Types
// =============================================================================

export interface SubmitBatchInput {
  integrationSlug: string;
  actionSlug: string;
  items: Array<{ input: Record<string, unknown> }>;
  config?: {
    concurrency?: number;
    delayMs?: number;
    timeoutSeconds?: number;
    skipInvalidItems?: boolean;
  };
}

// =============================================================================
// Query Keys
// =============================================================================

export const batchKeys = {
  all: ['batch'] as const,
  progress: (jobId: string) => [...batchKeys.all, 'progress', jobId] as const,
};

// =============================================================================
// Hooks
// =============================================================================

/**
 * Hook to submit a batch operation.
 * Returns the created job ID on success.
 */
export function useSubmitBatch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: SubmitBatchInput) =>
      apiClient.post<BatchOperationResponse>('/batch', input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: jobKeys.all });
    },
  });
}

/**
 * Hook to poll batch job progress.
 * Polls every 3 seconds while the job is running.
 */
export function useBatchProgress(jobId: string | undefined) {
  return useQuery({
    queryKey: batchKeys.progress(jobId!),
    queryFn: () => apiClient.get<AsyncJobDetailResponse>(`/jobs/${jobId}`),
    enabled: !!jobId,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      // Stop polling when job is terminal
      if (status === 'completed' || status === 'failed' || status === 'cancelled') {
        return false;
      }
      return 3000; // 3 seconds
    },
    staleTime: 2000,
  });
}
