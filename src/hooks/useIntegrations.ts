/**
 * Integration Hooks
 *
 * React Query hooks for fetching and managing integrations.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import type {
  IntegrationResponse,
  IntegrationSummary,
  CreateIntegrationInput,
  UpdateIntegrationInput,
  IntegrationFilters,
} from '@/lib/modules/integrations/integration.schemas';

// =============================================================================
// Query Keys
// =============================================================================

export const integrationKeys = {
  all: ['integrations'] as const,
  lists: () => [...integrationKeys.all, 'list'] as const,
  list: (filters?: IntegrationFilters) => [...integrationKeys.lists(), filters] as const,
  details: () => [...integrationKeys.all, 'detail'] as const,
  detail: (id: string) => [...integrationKeys.details(), id] as const,
  health: (id: string) => [...integrationKeys.detail(id), 'health'] as const,
  credentials: (id: string) => [...integrationKeys.detail(id), 'credentials'] as const,
};

// =============================================================================
// Types
// =============================================================================

interface ListIntegrationsParams extends IntegrationFilters {
  cursor?: string;
  limit?: number;
}

interface ListIntegrationsResult {
  integrations: IntegrationSummary[];
  pagination: {
    cursor: string | null;
    hasMore: boolean;
    totalCount: number;
  };
}

interface IntegrationHealth {
  status: 'healthy' | 'unhealthy' | 'unknown';
  lastChecked: string | null;
  credentialStatus: 'active' | 'expired' | 'needs_reauth' | 'missing';
  message?: string;
}

export interface IntegrationCredentialsResponse {
  integration: {
    id: string;
    name: string;
    authType: string;
    status: string;
  };
  credentials: {
    hasCredentials: boolean;
    status?: string;
    credentialType?: string;
    expiresAt?: string | null;
    scopes?: string[];
  };
}

// =============================================================================
// API Functions
// =============================================================================

async function fetchIntegrations(params?: ListIntegrationsParams): Promise<ListIntegrationsResult> {
  return apiClient.get<ListIntegrationsResult>('/integrations', {
    cursor: params?.cursor,
    limit: params?.limit,
    status: params?.status,
    authType: params?.authType,
    tags: params?.tags?.join(','),
    search: params?.search,
  });
}

async function fetchIntegration(id: string): Promise<IntegrationResponse> {
  return apiClient.get<IntegrationResponse>(`/integrations/${id}`);
}

async function fetchIntegrationBySlug(slug: string): Promise<IntegrationResponse> {
  return apiClient.get<IntegrationResponse>(`/integrations/slug/${slug}`);
}

async function createIntegration(input: CreateIntegrationInput): Promise<IntegrationResponse> {
  return apiClient.post<IntegrationResponse>('/integrations', input);
}

async function updateIntegration({
  id,
  ...input
}: UpdateIntegrationInput & { id: string }): Promise<IntegrationResponse> {
  return apiClient.patch<IntegrationResponse>(`/integrations/${id}`, input);
}

async function deleteIntegration(id: string): Promise<void> {
  return apiClient.delete(`/integrations/${id}`);
}

async function fetchIntegrationHealth(id: string): Promise<IntegrationHealth> {
  return apiClient.get<IntegrationHealth>(`/integrations/${id}/health`);
}

async function fetchIntegrationCredentials(id: string): Promise<IntegrationCredentialsResponse> {
  return apiClient.get<IntegrationCredentialsResponse>(`/integrations/${id}/credentials`);
}

// =============================================================================
// Hooks
// =============================================================================

/**
 * Hook to fetch list of integrations with optional filters
 */
export function useIntegrations(params?: ListIntegrationsParams) {
  return useQuery({
    queryKey: integrationKeys.list(params),
    queryFn: () => fetchIntegrations(params),
    staleTime: 30 * 1000, // 30 seconds
  });
}

/**
 * Hook to fetch a single integration by ID
 */
export function useIntegration(id: string | undefined) {
  return useQuery({
    queryKey: integrationKeys.detail(id!),
    queryFn: () => fetchIntegration(id!),
    enabled: !!id,
    staleTime: 60 * 1000, // 1 minute
  });
}

/**
 * Hook to fetch a single integration by slug
 */
export function useIntegrationBySlug(slug: string | undefined) {
  return useQuery({
    queryKey: [...integrationKeys.all, 'slug', slug] as const,
    queryFn: () => fetchIntegrationBySlug(slug!),
    enabled: !!slug,
    staleTime: 60 * 1000,
  });
}

/**
 * Hook to fetch integration health status
 */
export function useIntegrationHealth(id: string | undefined) {
  return useQuery({
    queryKey: integrationKeys.health(id!),
    queryFn: () => fetchIntegrationHealth(id!),
    enabled: !!id,
    staleTime: 60 * 1000,
    refetchInterval: 5 * 60 * 1000, // Refetch every 5 minutes
  });
}

/**
 * Hook to fetch integration credentials status
 */
export function useIntegrationCredentials(id: string | undefined) {
  return useQuery({
    queryKey: integrationKeys.credentials(id!),
    queryFn: () => fetchIntegrationCredentials(id!),
    enabled: !!id,
    staleTime: 60 * 1000, // 1 minute
  });
}

/**
 * Hook to create a new integration
 */
export function useCreateIntegration() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createIntegration,
    onSuccess: () => {
      // Invalidate integrations list to refetch
      queryClient.invalidateQueries({ queryKey: integrationKeys.lists() });
    },
  });
}

/**
 * Hook to update an integration
 */
export function useUpdateIntegration() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateIntegration,
    onSuccess: (data) => {
      // Update the specific integration in cache
      queryClient.setQueryData(integrationKeys.detail(data.id), data);
      // Invalidate list to refetch
      queryClient.invalidateQueries({ queryKey: integrationKeys.lists() });
    },
  });
}

/**
 * Hook to delete an integration
 */
export function useDeleteIntegration() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteIntegration,
    onSuccess: (_, id) => {
      // Remove from cache
      queryClient.removeQueries({ queryKey: integrationKeys.detail(id) });
      // Invalidate list
      queryClient.invalidateQueries({ queryKey: integrationKeys.lists() });
      // Invalidate unified tools — actions were cascade-deleted and AI tools may now have invalid references
      queryClient.invalidateQueries({ queryKey: ['unified-tools'] });
    },
  });
}
