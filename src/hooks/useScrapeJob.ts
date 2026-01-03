/**
 * Scrape Job Hooks
 *
 * React Query hooks for starting and polling scrape jobs.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { client } from '@/lib/api/client';
import type { CreateScrapeJobInput, ScrapeJobResponse } from '@/lib/modules/ai/scrape-job.schemas';

/**
 * Options for starting a scrape job
 */
interface StartScrapeOptions {
  /** Force a new scrape even if cached result exists */
  force?: boolean;
}

/**
 * Hook to start a new scrape job
 */
export function useScrapeJob() {
  const mutation = useMutation({
    mutationFn: ({
      input,
      options,
    }: {
      input: CreateScrapeJobInput;
      options?: StartScrapeOptions;
    }) => client.scrape.create(input, options),
    onError: (error: Error) => {
      toast.error('Failed to start scraping', {
        description: error.message,
      });
    },
  });

  return {
    startScraping: (input: CreateScrapeJobInput, options?: StartScrapeOptions) =>
      mutation.mutateAsync({ input, options }),
    isPending: mutation.isPending,
    isError: mutation.isError,
    error: mutation.error,
  };
}

/**
 * Hook to re-analyze a completed scrape job
 * Re-runs AI extraction on cached content without re-scraping
 */
export function useReanalyzeScrapeJob() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (jobId: string) => client.scrape.reanalyze(jobId),
    onSuccess: (data, jobId) => {
      // Invalidate the job status cache to get fresh data
      queryClient.invalidateQueries({ queryKey: ['scrape-job', jobId] });

      if (data.status === 'COMPLETED') {
        toast.success('Re-analysis complete', {
          description: `Found ${data.endpointCount ?? 0} endpoints.`,
        });
      } else {
        toast.error('Re-analysis failed', {
          description: data.message,
        });
      }
    },
    onError: (error: Error) => {
      toast.error('Failed to re-analyze', {
        description: error.message,
      });
    },
  });

  return {
    reanalyze: mutation.mutateAsync,
    isPending: mutation.isPending,
    isError: mutation.isError,
    error: mutation.error,
  };
}

/**
 * Hook to poll scrape job status
 */
export function useScrapeJobStatus(
  jobId: string | null,
  options?: {
    enabled?: boolean;
    onSuccess?: (data: ScrapeJobResponse) => void;
    onError?: (error: Error) => void;
  }
) {
  return useQuery({
    queryKey: ['scrape-job', jobId],
    queryFn: () => {
      if (!jobId) throw new Error('Job ID is required');
      return client.scrape.getStatus(jobId);
    },
    enabled: !!jobId && (options?.enabled ?? true),
    refetchInterval: (query) => {
      // Stop polling if job is complete or failed
      const status = query.state.data?.status;
      if (status === 'COMPLETED' || status === 'FAILED') {
        return false;
      }
      // Poll every 2 seconds while in progress
      return 2000;
    },
    refetchIntervalInBackground: true,
  });
}

/**
 * Hook to cancel a running scrape job
 */
export function useCancelScrapeJob() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (jobId: string) => client.scrape.cancel(jobId),
    onSuccess: (data, jobId) => {
      // Invalidate the job status cache
      queryClient.invalidateQueries({ queryKey: ['scrape-job', jobId] });
      toast.success('Job cancelled', {
        description: 'The scraping job has been cancelled.',
      });
    },
    onError: (error: Error) => {
      toast.error('Failed to cancel job', {
        description: error.message,
      });
    },
  });

  return {
    cancel: mutation.mutateAsync,
    isPending: mutation.isPending,
    isError: mutation.isError,
    error: mutation.error,
  };
}

/**
 * Utility type for scrape job mutation
 */
export type ScrapeJobMutation = ReturnType<typeof useScrapeJob>;
