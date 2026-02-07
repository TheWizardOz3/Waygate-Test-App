/**
 * Pipeline Hooks
 *
 * React Query hooks for fetching and managing pipelines, steps, and exports.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { unifiedToolKeys } from './useUnifiedTools';
import type {
  PipelineDetailResponse,
  PipelineStepResponse,
  CreatePipelineInput,
  UpdatePipelineInput,
  CreatePipelineStepInput,
  UpdatePipelineStepInput,
  ReorderStepsInput,
  ListPipelinesResponse,
  PipelineFilters,
  PipelineExecutionResponse,
  PipelineExecutionDetailResponse,
} from '@/lib/modules/pipelines/pipeline.schemas';

// =============================================================================
// Query Keys
// =============================================================================

export const pipelineKeys = {
  all: ['pipelines'] as const,
  lists: () => [...pipelineKeys.all, 'list'] as const,
  list: (filters?: PipelineFilters) => [...pipelineKeys.lists(), filters] as const,
  details: () => [...pipelineKeys.all, 'detail'] as const,
  detail: (id: string) => [...pipelineKeys.details(), id] as const,
  steps: (pipelineId: string) => [...pipelineKeys.detail(pipelineId), 'steps'] as const,
  executions: (pipelineId: string) => [...pipelineKeys.detail(pipelineId), 'executions'] as const,
  executionDetail: (executionId: string) =>
    [...pipelineKeys.all, 'execution', executionId] as const,
  exports: (pipelineId: string) => [...pipelineKeys.detail(pipelineId), 'exports'] as const,
};

// =============================================================================
// Types
// =============================================================================

interface ListPipelinesParams extends PipelineFilters {
  cursor?: string;
  limit?: number;
}

// =============================================================================
// API Functions
// =============================================================================

async function fetchPipelines(params?: ListPipelinesParams): Promise<ListPipelinesResponse> {
  return apiClient.get<ListPipelinesResponse>('/pipelines', {
    cursor: params?.cursor,
    limit: params?.limit,
    status: params?.status,
    search: params?.search,
  });
}

async function fetchPipeline(id: string): Promise<PipelineDetailResponse> {
  return apiClient.get<PipelineDetailResponse>(`/pipelines/${id}`);
}

async function createPipeline(input: CreatePipelineInput): Promise<PipelineDetailResponse> {
  return apiClient.post<PipelineDetailResponse>('/pipelines', input);
}

async function updatePipeline({
  id,
  ...input
}: UpdatePipelineInput & { id: string }): Promise<PipelineDetailResponse> {
  return apiClient.patch<PipelineDetailResponse>(`/pipelines/${id}`, input);
}

async function deletePipeline(id: string): Promise<void> {
  await apiClient.delete(`/pipelines/${id}`);
}

// Step API Functions

async function addStep({
  pipelineId,
  ...input
}: CreatePipelineStepInput & { pipelineId: string }): Promise<PipelineStepResponse> {
  return apiClient.post<PipelineStepResponse>(`/pipelines/${pipelineId}/steps`, input);
}

async function updateStep({
  pipelineId,
  stepId,
  ...input
}: UpdatePipelineStepInput & {
  pipelineId: string;
  stepId: string;
}): Promise<PipelineStepResponse> {
  return apiClient.patch<PipelineStepResponse>(`/pipelines/${pipelineId}/steps/${stepId}`, input);
}

async function deleteStep({
  pipelineId,
  stepId,
}: {
  pipelineId: string;
  stepId: string;
}): Promise<void> {
  await apiClient.delete(`/pipelines/${pipelineId}/steps/${stepId}`);
}

async function reorderSteps({
  pipelineId,
  ...input
}: ReorderStepsInput & { pipelineId: string }): Promise<PipelineStepResponse[]> {
  return apiClient.put<PipelineStepResponse[]>(`/pipelines/${pipelineId}/steps/reorder`, input);
}

// =============================================================================
// Query Hooks
// =============================================================================

/**
 * Fetch a list of pipelines with optional filters
 */
export function usePipelines(params?: ListPipelinesParams) {
  return useQuery({
    queryKey: pipelineKeys.list(params),
    queryFn: () => fetchPipelines(params),
    staleTime: 30_000,
  });
}

/**
 * Fetch a single pipeline with steps
 */
export function usePipeline(id: string | undefined) {
  return useQuery({
    queryKey: pipelineKeys.detail(id ?? ''),
    queryFn: () => fetchPipeline(id!),
    enabled: !!id,
    staleTime: 60_000,
  });
}

// =============================================================================
// Mutation Hooks
// =============================================================================

/**
 * Create a new pipeline
 */
export function useCreatePipeline() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createPipeline,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: pipelineKeys.lists() });
      queryClient.invalidateQueries({ queryKey: unifiedToolKeys.lists() });
    },
  });
}

/**
 * Update an existing pipeline
 */
export function useUpdatePipeline() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updatePipeline,
    onSuccess: (data) => {
      queryClient.setQueryData(pipelineKeys.detail(data.id), data);
      queryClient.invalidateQueries({ queryKey: pipelineKeys.lists() });
      queryClient.invalidateQueries({ queryKey: unifiedToolKeys.lists() });
    },
  });
}

/**
 * Delete a pipeline
 */
export function useDeletePipeline() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deletePipeline,
    onSuccess: (_data, id) => {
      queryClient.removeQueries({ queryKey: pipelineKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: pipelineKeys.lists() });
      queryClient.invalidateQueries({ queryKey: unifiedToolKeys.lists() });
    },
  });
}

// =============================================================================
// Step Mutation Hooks
// =============================================================================

/**
 * Add a step to a pipeline
 */
export function useAddStep() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: addStep,
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: pipelineKeys.detail(variables.pipelineId),
      });
    },
  });
}

/**
 * Update a pipeline step
 */
export function useUpdateStep() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateStep,
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: pipelineKeys.detail(variables.pipelineId),
      });
    },
  });
}

/**
 * Delete a pipeline step
 */
export function useDeleteStep() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteStep,
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: pipelineKeys.detail(variables.pipelineId),
      });
    },
  });
}

/**
 * Reorder pipeline steps
 */
export function useReorderSteps() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: reorderSteps,
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: pipelineKeys.detail(variables.pipelineId),
      });
    },
  });
}

// =============================================================================
// Execution API Functions
// =============================================================================

interface ListExecutionsParams {
  cursor?: string;
  limit?: number;
  pipelineId?: string;
}

interface ListExecutionsResponse {
  executions: PipelineExecutionResponse[];
  pagination: {
    cursor: string | null;
    hasMore: boolean;
    totalCount: number;
  };
}

async function fetchExecutions(params?: ListExecutionsParams): Promise<ListExecutionsResponse> {
  return apiClient.get<ListExecutionsResponse>('/pipelines/executions', {
    cursor: params?.cursor,
    limit: params?.limit,
    pipelineId: params?.pipelineId,
  });
}

async function fetchExecutionDetail(id: string): Promise<PipelineExecutionDetailResponse> {
  return apiClient.get<PipelineExecutionDetailResponse>(`/pipelines/executions/${id}`);
}

async function cancelExecution(id: string): Promise<PipelineExecutionResponse> {
  return apiClient.post<PipelineExecutionResponse>(`/pipelines/executions/${id}/cancel`, {});
}

// =============================================================================
// Execution Query Hooks
// =============================================================================

/**
 * Fetch a list of pipeline executions with optional filters
 */
export function usePipelineExecutions(params?: ListExecutionsParams) {
  return useQuery({
    queryKey: params?.pipelineId
      ? pipelineKeys.executions(params.pipelineId)
      : [...pipelineKeys.all, 'executions', params],
    queryFn: () => fetchExecutions(params),
    staleTime: 10_000,
  });
}

/**
 * Fetch a single pipeline execution with step executions
 */
export function usePipelineExecution(executionId: string | undefined) {
  return useQuery({
    queryKey: pipelineKeys.executionDetail(executionId ?? ''),
    queryFn: () => fetchExecutionDetail(executionId!),
    enabled: !!executionId,
    staleTime: 5_000,
  });
}

/**
 * Cancel a running pipeline execution
 */
export function useCancelExecution() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: cancelExecution,
    onSuccess: (data) => {
      queryClient.setQueryData(pipelineKeys.executionDetail(data.id), data);
      queryClient.invalidateQueries({ queryKey: pipelineKeys.all });
    },
  });
}

// =============================================================================
// Export Hooks
// =============================================================================

/**
 * Fetch Universal export for a pipeline
 */
export function usePipelineUniversalExport(pipelineId: string | undefined) {
  return useQuery({
    queryKey: [...pipelineKeys.exports(pipelineId ?? ''), 'universal'] as const,
    queryFn: () => apiClient.get(`/pipelines/${pipelineId}/tools/universal`),
    enabled: !!pipelineId,
    staleTime: 5 * 60_000,
  });
}

/**
 * Fetch LangChain export for a pipeline
 */
export function usePipelineLangChainExport(pipelineId: string | undefined) {
  return useQuery({
    queryKey: [...pipelineKeys.exports(pipelineId ?? ''), 'langchain'] as const,
    queryFn: () => apiClient.get(`/pipelines/${pipelineId}/tools/langchain`),
    enabled: !!pipelineId,
    staleTime: 5 * 60_000,
  });
}

/**
 * Fetch MCP export for a pipeline
 */
export function usePipelineMCPExport(pipelineId: string | undefined) {
  return useQuery({
    queryKey: [...pipelineKeys.exports(pipelineId ?? ''), 'mcp'] as const,
    queryFn: () => apiClient.get(`/pipelines/${pipelineId}/tools/mcp`),
    enabled: !!pipelineId,
    staleTime: 5 * 60_000,
  });
}
