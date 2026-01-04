/**
 * Logs Hooks
 *
 * React Query hooks for fetching and managing request logs.
 */

import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';

// =============================================================================
// Types
// =============================================================================

export interface LogEntry {
  id: string;
  integrationId: string;
  integrationName: string;
  integrationSlug: string;
  actionId: string;
  actionName: string;
  actionSlug: string;
  httpMethod: string;
  endpoint: string;
  status: 'success' | 'error' | 'timeout';
  statusCode: number;
  duration: number; // ms
  requestHeaders?: Record<string, string>;
  requestBody?: unknown;
  responseHeaders?: Record<string, string>;
  responseBody?: unknown;
  errorMessage?: string;
  errorCode?: string;
  timestamp: string;
  cached: boolean;
  retryCount: number;
}

export interface LogsQueryParams {
  integrationId?: string;
  actionId?: string;
  status?: 'success' | 'error' | 'timeout';
  startDate?: string;
  endDate?: string;
  search?: string;
  limit?: number;
  cursor?: string;
}

export interface LogsResponse {
  logs: LogEntry[];
  pagination: {
    cursor: string | null;
    hasMore: boolean;
    totalCount: number;
  };
}

// =============================================================================
// Query Keys
// =============================================================================

export const logKeys = {
  all: ['logs'] as const,
  lists: () => [...logKeys.all, 'list'] as const,
  list: (params?: LogsQueryParams) => [...logKeys.lists(), params] as const,
  details: () => [...logKeys.all, 'detail'] as const,
  detail: (id: string) => [...logKeys.details(), id] as const,
  stats: () => [...logKeys.all, 'stats'] as const,
};

// =============================================================================
// Hooks
// =============================================================================

/**
 * Hook to fetch paginated logs with filters
 */
export function useLogs(params?: LogsQueryParams) {
  return useQuery({
    queryKey: logKeys.list(params),
    queryFn: () =>
      apiClient.get<LogsResponse>('/logs', {
        ...params,
        limit: params?.limit ?? 50,
      } as Record<string, string | number | boolean | undefined>),
    staleTime: 10 * 1000, // 10 seconds
  });
}

/**
 * Hook to fetch logs with infinite scroll pagination
 */
export function useInfiniteLogs(params?: Omit<LogsQueryParams, 'cursor'>) {
  return useInfiniteQuery({
    queryKey: logKeys.list(params),
    queryFn: ({ pageParam }) =>
      apiClient.get<LogsResponse>('/logs', {
        ...params,
        cursor: pageParam,
        limit: params?.limit ?? 50,
      } as Record<string, string | number | boolean | undefined>),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) =>
      lastPage.pagination.hasMore ? lastPage.pagination.cursor : undefined,
    staleTime: 10 * 1000, // 10 seconds
  });
}

/**
 * Hook to fetch a single log entry
 */
export function useLogEntry(id: string | undefined) {
  return useQuery({
    queryKey: logKeys.detail(id!),
    queryFn: () => apiClient.get<LogEntry>(`/logs/${id}`),
    enabled: !!id,
    staleTime: 60 * 1000, // 1 minute
  });
}

export interface LogStats {
  totalRequests: number;
  successRate: number;
  averageLatency: number;
  errorCount: number;
  requestsByIntegration: { integrationId: string; integrationName: string; count: number }[];
  requestsByStatus: { status: string; count: number }[];
  latencyPercentiles: { p50: number; p90: number; p99: number };
}

/**
 * Hook to fetch log statistics
 */
export function useLogStats(params?: {
  startDate?: string;
  endDate?: string;
  integrationId?: string;
}) {
  return useQuery({
    queryKey: [...logKeys.stats(), params],
    queryFn: () =>
      apiClient.get<LogStats>(
        '/logs/stats',
        params as Record<string, string | number | boolean | undefined>
      ),
    staleTime: 30 * 1000, // 30 seconds
  });
}
