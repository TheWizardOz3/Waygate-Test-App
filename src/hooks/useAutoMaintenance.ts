/**
 * Auto-Maintenance Hooks
 *
 * React Query hooks for fetching maintenance proposals, summaries,
 * and performing mutations (approve, reject, revert, description decisions).
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import type {
  MaintenanceProposalResponse,
  ListProposalsResponse,
  ProposalSummaryResponse,
  ProposalStatus,
  ProposalSeverity,
  MaintenanceConfig,
  DescriptionDecisionInput,
} from '@/lib/modules/auto-maintenance/auto-maintenance.schemas';

// =============================================================================
// Types
// =============================================================================

export interface ProposalFilters {
  status?: ProposalStatus;
  severity?: ProposalSeverity;
  actionId?: string;
  cursor?: string;
  limit?: number;
}

// =============================================================================
// Query Keys
// =============================================================================

export const maintenanceKeys = {
  all: ['auto-maintenance'] as const,
  summaries: () => [...maintenanceKeys.all, 'summary'] as const,
  summary: (integrationId: string) => [...maintenanceKeys.summaries(), integrationId] as const,
  proposals: () => [...maintenanceKeys.all, 'proposals'] as const,
  proposalList: (integrationId: string, filters?: ProposalFilters) =>
    [...maintenanceKeys.proposals(), integrationId, filters] as const,
  proposalDetail: (proposalId: string) => [...maintenanceKeys.all, 'proposal', proposalId] as const,
  configs: () => [...maintenanceKeys.all, 'config'] as const,
  config: (integrationId: string) => [...maintenanceKeys.configs(), integrationId] as const,
};

// =============================================================================
// Query Hooks
// =============================================================================

/**
 * Fetch proposal counts by status for an integration.
 * Used by the MaintenanceBadge component on integration cards.
 */
export function useProposalSummary(integrationId: string | undefined) {
  return useQuery({
    queryKey: maintenanceKeys.summary(integrationId!),
    queryFn: () =>
      apiClient.get<ProposalSummaryResponse>(`/integrations/${integrationId}/maintenance/summary`),
    enabled: !!integrationId,
    staleTime: 60 * 1000,
  });
}

/**
 * Fetch paginated proposals for an integration with optional filters.
 */
export function useProposals(integrationId: string | undefined, filters?: ProposalFilters) {
  return useQuery({
    queryKey: maintenanceKeys.proposalList(integrationId!, filters),
    queryFn: () =>
      apiClient.get<ListProposalsResponse>(`/integrations/${integrationId}/maintenance/proposals`, {
        cursor: filters?.cursor,
        limit: filters?.limit,
        status: filters?.status,
        severity: filters?.severity,
        actionId: filters?.actionId,
      } as Record<string, string | number | boolean | undefined>),
    enabled: !!integrationId,
    staleTime: 30 * 1000,
  });
}

/**
 * Fetch a single proposal by ID.
 */
export function useProposal(integrationId: string | undefined, proposalId: string | undefined) {
  return useQuery({
    queryKey: maintenanceKeys.proposalDetail(proposalId!),
    queryFn: () =>
      apiClient.get<MaintenanceProposalResponse>(
        `/integrations/${integrationId}/maintenance/proposals/${proposalId}`
      ),
    enabled: !!integrationId && !!proposalId,
    staleTime: 30 * 1000,
  });
}

/**
 * Fetch maintenance config for an integration.
 */
export function useMaintenanceConfig(integrationId: string | undefined) {
  return useQuery({
    queryKey: maintenanceKeys.config(integrationId!),
    queryFn: () =>
      apiClient.get<MaintenanceConfig>(`/integrations/${integrationId}/maintenance/config`),
    enabled: !!integrationId,
    staleTime: 5 * 60 * 1000,
  });
}

// =============================================================================
// Mutation Hooks
// =============================================================================

/**
 * Approve a proposal — applies schema updates, resolves drift, generates description suggestions.
 */
export function useApproveProposal(integrationId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (proposalId: string) =>
      apiClient.post<MaintenanceProposalResponse>(
        `/integrations/${integrationId}/maintenance/proposals/${proposalId}/approve`
      ),
    onSuccess: (_data, proposalId) => {
      queryClient.invalidateQueries({ queryKey: maintenanceKeys.summary(integrationId) });
      queryClient.invalidateQueries({ queryKey: maintenanceKeys.proposals() });
      queryClient.invalidateQueries({
        queryKey: maintenanceKeys.proposalDetail(proposalId),
      });
    },
  });
}

/**
 * Reject a proposal.
 */
export function useRejectProposal(integrationId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (proposalId: string) =>
      apiClient.post<MaintenanceProposalResponse>(
        `/integrations/${integrationId}/maintenance/proposals/${proposalId}/reject`
      ),
    onSuccess: (_data, proposalId) => {
      queryClient.invalidateQueries({ queryKey: maintenanceKeys.summary(integrationId) });
      queryClient.invalidateQueries({ queryKey: maintenanceKeys.proposals() });
      queryClient.invalidateQueries({
        queryKey: maintenanceKeys.proposalDetail(proposalId),
      });
    },
  });
}

/**
 * Revert an approved proposal — restores schemas from snapshot.
 */
export function useRevertProposal(integrationId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (proposalId: string) =>
      apiClient.post<MaintenanceProposalResponse>(
        `/integrations/${integrationId}/maintenance/proposals/${proposalId}/revert`
      ),
    onSuccess: (_data, proposalId) => {
      queryClient.invalidateQueries({ queryKey: maintenanceKeys.summary(integrationId) });
      queryClient.invalidateQueries({ queryKey: maintenanceKeys.proposals() });
      queryClient.invalidateQueries({
        queryKey: maintenanceKeys.proposalDetail(proposalId),
      });
    },
  });
}

/**
 * Accept/skip description suggestions for an approved proposal.
 */
export function useApplyDescriptionDecisions(integrationId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      proposalId,
      decisions,
    }: {
      proposalId: string;
      decisions: DescriptionDecisionInput['decisions'];
    }) =>
      apiClient.post<MaintenanceProposalResponse>(
        `/integrations/${integrationId}/maintenance/proposals/${proposalId}/descriptions`,
        { decisions }
      ),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: maintenanceKeys.proposalDetail(variables.proposalId),
      });
    },
  });
}

/**
 * Batch approve all pending proposals up to a severity level.
 */
export function useBatchApprove(integrationId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (maxSeverity?: ProposalSeverity) =>
      apiClient.post<{ approved: number }>(`/integrations/${integrationId}/maintenance/proposals`, {
        action: 'batch_approve',
        maxSeverity,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: maintenanceKeys.summary(integrationId) });
      queryClient.invalidateQueries({ queryKey: maintenanceKeys.proposals() });
    },
  });
}

/**
 * Trigger manual proposal generation for an integration.
 */
export function useTriggerMaintenance(integrationId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () =>
      apiClient.post<{ proposalsCreated: number; actionsAffected: number }>(
        `/integrations/${integrationId}/maintenance/proposals`
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: maintenanceKeys.summary(integrationId) });
      queryClient.invalidateQueries({ queryKey: maintenanceKeys.proposals() });
    },
  });
}

/**
 * Update maintenance config for an integration.
 */
export function useUpdateMaintenanceConfig(integrationId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (config: Partial<MaintenanceConfig>) =>
      apiClient.put<MaintenanceConfig>(`/integrations/${integrationId}/maintenance/config`, config),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: maintenanceKeys.config(integrationId) });
    },
  });
}
