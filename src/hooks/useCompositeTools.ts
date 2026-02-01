/**
 * Composite Tools Hooks
 *
 * React Query hooks for fetching and managing composite tools.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import type {
  CompositeToolDetailResponse,
  CreateCompositeToolInput,
  UpdateCompositeToolInput,
  CompositeToolFilters,
  ListCompositeToolsResponse,
  CreateCompositeToolOperationInput,
  UpdateCompositeToolOperationInput,
  CompositeToolOperationResponse,
  CreateRoutingRuleInput,
  UpdateRoutingRuleInput,
  RoutingRuleResponse,
} from '@/lib/modules/composite-tools/composite-tool.schemas';

// =============================================================================
// Query Keys
// =============================================================================

export const compositeToolKeys = {
  all: ['composite-tools'] as const,
  lists: () => [...compositeToolKeys.all, 'list'] as const,
  list: (filters?: CompositeToolFilters) => [...compositeToolKeys.lists(), filters] as const,
  details: () => [...compositeToolKeys.all, 'detail'] as const,
  detail: (id: string) => [...compositeToolKeys.details(), id] as const,
  operations: (toolId: string) => [...compositeToolKeys.detail(toolId), 'operations'] as const,
  routingRules: (toolId: string) => [...compositeToolKeys.detail(toolId), 'routing-rules'] as const,
  exports: (toolId: string) => [...compositeToolKeys.detail(toolId), 'exports'] as const,
  byAction: (actionId: string) => [...compositeToolKeys.all, 'by-action', actionId] as const,
  byIntegration: (integrationId: string) =>
    [...compositeToolKeys.all, 'by-integration', integrationId] as const,
};

// =============================================================================
// Types
// =============================================================================

interface ListCompositeToolsParams extends CompositeToolFilters {
  cursor?: string;
  limit?: number;
}

// =============================================================================
// API Functions
// =============================================================================

async function fetchCompositeTools(
  params?: ListCompositeToolsParams
): Promise<ListCompositeToolsResponse> {
  return apiClient.get<ListCompositeToolsResponse>('/composite-tools', {
    cursor: params?.cursor,
    limit: params?.limit,
    status: params?.status,
    routingMode: params?.routingMode,
    search: params?.search,
  });
}

async function fetchCompositeTool(id: string): Promise<CompositeToolDetailResponse> {
  return apiClient.get<CompositeToolDetailResponse>(`/composite-tools/${id}`);
}

async function createCompositeTool(
  input: CreateCompositeToolInput
): Promise<CompositeToolDetailResponse> {
  return apiClient.post<CompositeToolDetailResponse>('/composite-tools', input);
}

async function updateCompositeTool({
  id,
  ...input
}: UpdateCompositeToolInput & { id: string }): Promise<CompositeToolDetailResponse> {
  return apiClient.patch<CompositeToolDetailResponse>(`/composite-tools/${id}`, input);
}

async function deleteCompositeTool(id: string): Promise<void> {
  return apiClient.delete(`/composite-tools/${id}`);
}

async function regenerateDescription(id: string): Promise<{
  toolDescription: string;
  toolSuccessTemplate: string;
  toolErrorTemplate: string;
}> {
  return apiClient.post<{
    toolDescription: string;
    toolSuccessTemplate: string;
    toolErrorTemplate: string;
  }>(`/composite-tools/${id}/regenerate-description`);
}

// Operation API functions
async function createOperation(
  toolId: string,
  input: CreateCompositeToolOperationInput
): Promise<CompositeToolOperationResponse> {
  return apiClient.post<CompositeToolOperationResponse>(
    `/composite-tools/${toolId}/operations`,
    input
  );
}

async function updateOperation(
  toolId: string,
  operationId: string,
  input: UpdateCompositeToolOperationInput
): Promise<CompositeToolOperationResponse> {
  return apiClient.patch<CompositeToolOperationResponse>(
    `/composite-tools/${toolId}/operations/${operationId}`,
    input
  );
}

async function deleteOperation(toolId: string, operationId: string): Promise<void> {
  return apiClient.delete(`/composite-tools/${toolId}/operations/${operationId}`);
}

// Routing rule API functions
async function createRoutingRule(
  toolId: string,
  input: CreateRoutingRuleInput
): Promise<RoutingRuleResponse> {
  return apiClient.post<RoutingRuleResponse>(`/composite-tools/${toolId}/routing-rules`, input);
}

async function updateRoutingRule(
  toolId: string,
  ruleId: string,
  input: UpdateRoutingRuleInput
): Promise<RoutingRuleResponse> {
  return apiClient.patch<RoutingRuleResponse>(
    `/composite-tools/${toolId}/routing-rules/${ruleId}`,
    input
  );
}

async function deleteRoutingRule(toolId: string, ruleId: string): Promise<void> {
  return apiClient.delete(`/composite-tools/${toolId}/routing-rules/${ruleId}`);
}

// Export API functions
async function fetchUniversalExport(toolId: string): Promise<{ tool: unknown }> {
  return apiClient.get<{ tool: unknown }>(`/composite-tools/${toolId}/tools/universal`);
}

async function fetchLangChainExport(toolId: string): Promise<{ tool: unknown }> {
  return apiClient.get<{ tool: unknown }>(`/composite-tools/${toolId}/tools/langchain`);
}

async function fetchMCPExport(toolId: string): Promise<{ tool: unknown }> {
  return apiClient.get<{ tool: unknown }>(`/composite-tools/${toolId}/tools/mcp`);
}

// API functions for cross-reference queries
interface CompositeToolsByActionResponse {
  compositeTools: CompositeToolDetailResponse[];
}

async function fetchCompositeToolsByAction(
  actionId: string
): Promise<CompositeToolsByActionResponse> {
  return apiClient.get<CompositeToolsByActionResponse>(
    `/actions/by-id/${actionId}/composite-tools`
  );
}

async function fetchCompositeToolsByIntegration(
  integrationId: string
): Promise<CompositeToolsByActionResponse> {
  return apiClient.get<CompositeToolsByActionResponse>(
    `/integrations/${integrationId}/composite-tools`
  );
}

// =============================================================================
// Hooks - Composite Tools
// =============================================================================

/**
 * Hook to fetch list of composite tools with optional filters
 */
export function useCompositeTools(params?: ListCompositeToolsParams) {
  return useQuery({
    queryKey: compositeToolKeys.list(params),
    queryFn: () => fetchCompositeTools(params),
    staleTime: 30 * 1000, // 30 seconds
  });
}

/**
 * Hook to fetch a single composite tool by ID (with operations and routing rules)
 */
export function useCompositeTool(id: string | undefined) {
  return useQuery({
    queryKey: compositeToolKeys.detail(id!),
    queryFn: () => fetchCompositeTool(id!),
    enabled: !!id,
    staleTime: 60 * 1000, // 1 minute
  });
}

/**
 * Hook to create a new composite tool
 */
export function useCreateCompositeTool() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createCompositeTool,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: compositeToolKeys.lists() });
    },
  });
}

/**
 * Hook to update a composite tool
 */
export function useUpdateCompositeTool() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateCompositeTool,
    onSuccess: (data) => {
      queryClient.setQueryData(compositeToolKeys.detail(data.id), data);
      queryClient.invalidateQueries({ queryKey: compositeToolKeys.lists() });
    },
  });
}

/**
 * Hook to delete a composite tool
 */
export function useDeleteCompositeTool() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteCompositeTool,
    onSuccess: (_, id) => {
      queryClient.removeQueries({ queryKey: compositeToolKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: compositeToolKeys.lists() });
    },
  });
}

/**
 * Hook to regenerate AI description for a composite tool
 */
export function useRegenerateDescription() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: regenerateDescription,
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: compositeToolKeys.detail(id) });
    },
  });
}

// =============================================================================
// Hooks - Operations
// =============================================================================

/**
 * Hook to create an operation within a composite tool
 */
export function useCreateOperation(toolId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateCompositeToolOperationInput) => createOperation(toolId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: compositeToolKeys.detail(toolId) });
    },
  });
}

/**
 * Hook to update an operation
 */
export function useUpdateOperation(toolId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      operationId,
      ...input
    }: UpdateCompositeToolOperationInput & { operationId: string }) =>
      updateOperation(toolId, operationId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: compositeToolKeys.detail(toolId) });
    },
  });
}

/**
 * Hook to delete an operation
 */
export function useDeleteOperation(toolId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (operationId: string) => deleteOperation(toolId, operationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: compositeToolKeys.detail(toolId) });
    },
  });
}

// =============================================================================
// Hooks - Routing Rules
// =============================================================================

/**
 * Hook to create a routing rule
 */
export function useCreateRoutingRule(toolId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateRoutingRuleInput) => createRoutingRule(toolId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: compositeToolKeys.detail(toolId) });
    },
  });
}

/**
 * Hook to update a routing rule
 */
export function useUpdateRoutingRule(toolId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ ruleId, ...input }: UpdateRoutingRuleInput & { ruleId: string }) =>
      updateRoutingRule(toolId, ruleId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: compositeToolKeys.detail(toolId) });
    },
  });
}

/**
 * Hook to delete a routing rule
 */
export function useDeleteRoutingRule(toolId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (ruleId: string) => deleteRoutingRule(toolId, ruleId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: compositeToolKeys.detail(toolId) });
    },
  });
}

// =============================================================================
// Hooks - Exports
// =============================================================================

/**
 * Hook to fetch Universal export format
 */
export function useCompositeToolUniversalExport(toolId: string | undefined) {
  return useQuery({
    queryKey: [...compositeToolKeys.exports(toolId!), 'universal'],
    queryFn: () => fetchUniversalExport(toolId!),
    enabled: !!toolId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Hook to fetch LangChain export format
 */
export function useCompositeToolLangChainExport(toolId: string | undefined) {
  return useQuery({
    queryKey: [...compositeToolKeys.exports(toolId!), 'langchain'],
    queryFn: () => fetchLangChainExport(toolId!),
    enabled: !!toolId,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Hook to fetch MCP export format
 */
export function useCompositeToolMCPExport(toolId: string | undefined) {
  return useQuery({
    queryKey: [...compositeToolKeys.exports(toolId!), 'mcp'],
    queryFn: () => fetchMCPExport(toolId!),
    enabled: !!toolId,
    staleTime: 5 * 60 * 1000,
  });
}

// =============================================================================
// Hooks - Cross-Reference Queries
// =============================================================================

/**
 * Hook to fetch composite tools that use a specific action
 */
export function useCompositeToolsByAction(actionId: string | undefined) {
  return useQuery({
    queryKey: compositeToolKeys.byAction(actionId!),
    queryFn: () => fetchCompositeToolsByAction(actionId!),
    enabled: !!actionId,
    staleTime: 60 * 1000, // 1 minute
  });
}

/**
 * Hook to fetch composite tools that use any action from a specific integration
 */
export function useCompositeToolsByIntegration(integrationId: string | undefined) {
  return useQuery({
    queryKey: compositeToolKeys.byIntegration(integrationId!),
    queryFn: () => fetchCompositeToolsByIntegration(integrationId!),
    enabled: !!integrationId,
    staleTime: 60 * 1000, // 1 minute
  });
}

// =============================================================================
// Hooks - Counts
// =============================================================================

interface CompositeToolCountsResponse {
  counts: Record<string, number>;
}

async function fetchCompositeToolCounts(): Promise<CompositeToolCountsResponse> {
  return apiClient.get<CompositeToolCountsResponse>('/composite-tools/counts');
}

/**
 * Hook to fetch composite tool counts per integration
 */
export function useCompositeToolCounts() {
  return useQuery({
    queryKey: [...compositeToolKeys.all, 'counts'],
    queryFn: fetchCompositeToolCounts,
    staleTime: 60 * 1000, // 1 minute
  });
}
