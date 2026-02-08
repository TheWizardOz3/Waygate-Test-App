/**
 * Schema Drift Detection Hooks
 *
 * React Query hooks for fetching drift summaries, paginated drift reports,
 * and updating drift report status (acknowledge/resolve/dismiss).
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import type {
  DriftSummaryResponse,
  DriftReportResponse,
  ListDriftReportsResponse,
  DriftSeverity,
  DriftReportStatus,
} from '@/lib/modules/schema-drift/schema-drift.schemas';

// =============================================================================
// Types
// =============================================================================

export interface DriftReportsFilters {
  severity?: DriftSeverity;
  status?: DriftReportStatus;
  actionId?: string;
  cursor?: string;
  limit?: number;
}

// =============================================================================
// Query Keys
// =============================================================================

export const schemaDriftKeys = {
  all: ['schema-drift'] as const,
  summaries: () => [...schemaDriftKeys.all, 'summary'] as const,
  summary: (integrationId: string) => [...schemaDriftKeys.summaries(), integrationId] as const,
  reports: () => [...schemaDriftKeys.all, 'reports'] as const,
  reportList: (integrationId: string, filters?: DriftReportsFilters) =>
    [...schemaDriftKeys.reports(), integrationId, filters] as const,
  reportDetail: (reportId: string) => [...schemaDriftKeys.all, 'report', reportId] as const,
};

// =============================================================================
// Hooks
// =============================================================================

/**
 * Fetch unresolved drift report counts by severity for an integration.
 * Used by the DriftBadge component on integration cards.
 */
export function useDriftSummary(integrationId: string | undefined) {
  return useQuery({
    queryKey: schemaDriftKeys.summary(integrationId!),
    queryFn: () =>
      apiClient.get<DriftSummaryResponse>(`/integrations/${integrationId}/drift/summary`),
    enabled: !!integrationId,
    staleTime: 60 * 1000, // 1 minute
  });
}

/**
 * Fetch paginated drift reports for an integration with optional filters.
 * Used by the DriftReportsList component.
 */
export function useDriftReports(integrationId: string | undefined, filters?: DriftReportsFilters) {
  return useQuery({
    queryKey: schemaDriftKeys.reportList(integrationId!, filters),
    queryFn: () =>
      apiClient.get<ListDriftReportsResponse>(`/integrations/${integrationId}/drift/reports`, {
        cursor: filters?.cursor,
        limit: filters?.limit,
        severity: filters?.severity,
        status: filters?.status,
        actionId: filters?.actionId,
      } as Record<string, string | number | boolean | undefined>),
    enabled: !!integrationId,
    staleTime: 30 * 1000, // 30 seconds
  });
}

/**
 * Fetch a single drift report by ID.
 */
export function useDriftReport(integrationId: string | undefined, reportId: string | undefined) {
  return useQuery({
    queryKey: schemaDriftKeys.reportDetail(reportId!),
    queryFn: () =>
      apiClient.get<DriftReportResponse>(
        `/integrations/${integrationId}/drift/reports/${reportId}`
      ),
    enabled: !!integrationId && !!reportId,
    staleTime: 30 * 1000,
  });
}

/**
 * Mutation to update a drift report's status (acknowledge/resolve/dismiss).
 * Invalidates summary and report list queries on success.
 */
export function useUpdateDriftReportStatus(integrationId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      reportId,
      status,
    }: {
      reportId: string;
      status: 'acknowledged' | 'resolved' | 'dismissed';
    }) =>
      apiClient.patch<DriftReportResponse>(
        `/integrations/${integrationId}/drift/reports/${reportId}`,
        { status }
      ),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: schemaDriftKeys.summary(integrationId),
      });
      queryClient.invalidateQueries({
        queryKey: schemaDriftKeys.reports(),
      });
      queryClient.invalidateQueries({
        queryKey: schemaDriftKeys.reportDetail(variables.reportId),
      });
    },
  });
}
