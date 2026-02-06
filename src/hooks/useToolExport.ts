/**
 * Tool Export Hooks
 *
 * React Query hooks for fetching AI tool export data in various formats
 * (Universal, LangChain, MCP).
 */

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import type { ToolExportResponse } from '@/lib/modules/tool-export/tool-export.schemas';
import type { LangChainExportResponse } from '@/lib/modules/tool-export/formats/langchain.transformer';
import type { MCPExportResponse } from '@/lib/modules/tool-export/formats/mcp.transformer';

// =============================================================================
// Query Keys
// =============================================================================

export const toolExportKeys = {
  all: ['toolExport'] as const,
  universal: (integrationId: string) =>
    [...toolExportKeys.all, 'universal', integrationId] as const,
  langchain: (integrationId: string) =>
    [...toolExportKeys.all, 'langchain', integrationId] as const,
  mcp: (integrationId: string) => [...toolExportKeys.all, 'mcp', integrationId] as const,
};

// =============================================================================
// Types
// =============================================================================

export type ExportFormat = 'universal' | 'langchain' | 'mcp';

export interface UniversalExportOptions {
  includeMetadata?: boolean;
  maxDescriptionLength?: number;
  includeContextTypes?: boolean;
}

export interface LangChainExportOptions {
  includeCodeSnippets?: boolean;
  apiBaseUrl?: string;
}

export interface MCPExportOptions {
  includeServerFile?: boolean;
  includeResources?: boolean;
  serverVersion?: string;
}

// =============================================================================
// API Functions
// =============================================================================

async function fetchUniversalExport(
  integrationId: string,
  options?: UniversalExportOptions
): Promise<ToolExportResponse> {
  const params: Record<string, string | number | boolean | undefined> = {};
  if (options?.includeMetadata !== undefined) params.includeMetadata = options.includeMetadata;
  if (options?.maxDescriptionLength !== undefined)
    params.maxDescriptionLength = options.maxDescriptionLength;
  if (options?.includeContextTypes !== undefined)
    params.includeContextTypes = options.includeContextTypes;

  return apiClient.get<ToolExportResponse>(
    `/integrations/${integrationId}/tools/universal`,
    params
  );
}

async function fetchLangChainExport(
  integrationId: string,
  options?: LangChainExportOptions
): Promise<LangChainExportResponse> {
  const params: Record<string, string | number | boolean | undefined> = {};
  if (options?.includeCodeSnippets !== undefined)
    params.includeCodeSnippets = options.includeCodeSnippets;
  if (options?.apiBaseUrl !== undefined) params.apiBaseUrl = options.apiBaseUrl;

  return apiClient.get<LangChainExportResponse>(
    `/integrations/${integrationId}/tools/langchain`,
    params
  );
}

async function fetchMCPExport(
  integrationId: string,
  options?: MCPExportOptions
): Promise<MCPExportResponse> {
  const params: Record<string, string | number | boolean | undefined> = {};
  if (options?.includeServerFile !== undefined)
    params.includeServerFile = options.includeServerFile;
  if (options?.includeResources !== undefined) params.includeResources = options.includeResources;
  if (options?.serverVersion !== undefined) params.serverVersion = options.serverVersion;

  return apiClient.get<MCPExportResponse>(`/integrations/${integrationId}/tools/mcp`, params);
}

// =============================================================================
// Hooks
// =============================================================================

/**
 * Hook to fetch tools exported in Universal (LLM-agnostic) format.
 * Works with OpenAI, Anthropic, Gemini, and LangChain.
 */
export function useUniversalExport(
  integrationId: string | undefined,
  options?: UniversalExportOptions
) {
  return useQuery({
    queryKey: toolExportKeys.universal(integrationId!),
    queryFn: () => fetchUniversalExport(integrationId!, options),
    enabled: !!integrationId,
    staleTime: 5 * 60 * 1000, // 5 minutes (matches API cache)
  });
}

/**
 * Hook to fetch tools exported in LangChain format with code snippets.
 */
export function useLangChainExport(
  integrationId: string | undefined,
  options?: LangChainExportOptions
) {
  return useQuery({
    queryKey: toolExportKeys.langchain(integrationId!),
    queryFn: () => fetchLangChainExport(integrationId!, options),
    enabled: !!integrationId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Hook to fetch tools exported in MCP format with server file generation.
 */
export function useMCPExport(integrationId: string | undefined, options?: MCPExportOptions) {
  return useQuery({
    queryKey: toolExportKeys.mcp(integrationId!),
    queryFn: () => fetchMCPExport(integrationId!, options),
    enabled: !!integrationId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

// =============================================================================
// All Tools Export (Aggregated across all integrations)
// =============================================================================

export const allToolsExportKeys = {
  all: ['allToolsExport'] as const,
  universal: () => [...allToolsExportKeys.all, 'universal'] as const,
  langchain: () => [...allToolsExportKeys.all, 'langchain'] as const,
  mcp: () => [...allToolsExportKeys.all, 'mcp'] as const,
};

// Types for aggregated export responses
export interface AggregatedUniversalExportResponse {
  tools: Array<{
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, unknown>;
      required: string[];
    };
    contextTypes?: string[];
  }>;
  summary: {
    total: number;
    simple: number;
    composite: number;
    agentic: number;
  };
  contextTypes: string[];
  format: {
    name: 'universal';
    version: '1.0';
    compatibleWith: string[];
  };
}

export interface AggregatedLangChainExportResponse {
  tools: Array<{
    name: string;
    description: string;
    schema: {
      type: 'object';
      properties: Record<string, unknown>;
      required: string[];
      additionalProperties?: boolean;
    };
    contextTypes?: string[];
  }>;
  summary: {
    total: number;
    simple: number;
    composite: number;
    agentic: number;
  };
  contextTypes: string[];
  format: {
    name: 'langchain';
    version: '1.0';
    compatibleWith: string[];
  };
  codeSnippets: {
    typescript: string;
    python: string;
  };
}

export interface AggregatedMCPExportResponse {
  server: {
    name: string;
    version: string;
    capabilities: {
      tools: Record<string, never>;
      resources?: Record<string, never>;
    };
    tools: Array<{
      name: string;
      description: string;
      inputSchema: {
        type: 'object';
        properties: Record<string, unknown>;
        required: string[];
      };
    }>;
    resources: Array<{
      uri: string;
      name: string;
      description: string;
      mimeType: string;
    }>;
  };
  summary: {
    total: number;
    simple: number;
    composite: number;
    agentic: number;
  };
  format: {
    name: 'mcp';
    version: '1.0';
    compatibleWith: string[];
  };
  serverFile: {
    typescript: string;
    packageJson: string;
    claudeDesktopConfig: string;
  };
}

// API Functions for all tools export
async function fetchAllToolsUniversalExport(
  options?: UniversalExportOptions
): Promise<AggregatedUniversalExportResponse> {
  const params: Record<string, string | number | boolean | undefined> = {};
  if (options?.includeMetadata !== undefined) params.includeMetadata = options.includeMetadata;
  if (options?.maxDescriptionLength !== undefined)
    params.maxDescriptionLength = options.maxDescriptionLength;
  if (options?.includeContextTypes !== undefined)
    params.includeContextTypes = options.includeContextTypes;

  // apiClient.get already extracts the data field from the response
  return apiClient.get<AggregatedUniversalExportResponse>('/tools/export/universal', params);
}

async function fetchAllToolsLangChainExport(
  options?: LangChainExportOptions
): Promise<AggregatedLangChainExportResponse> {
  const params: Record<string, string | number | boolean | undefined> = {};
  if (options?.includeCodeSnippets !== undefined)
    params.includeCodeSnippets = options.includeCodeSnippets;
  if (options?.apiBaseUrl !== undefined) params.apiBaseUrl = options.apiBaseUrl;

  // apiClient.get already extracts the data field from the response
  return apiClient.get<AggregatedLangChainExportResponse>('/tools/export/langchain', params);
}

async function fetchAllToolsMCPExport(
  options?: MCPExportOptions
): Promise<AggregatedMCPExportResponse> {
  const params: Record<string, string | number | boolean | undefined> = {};
  if (options?.includeServerFile !== undefined)
    params.includeServerFile = options.includeServerFile;
  if (options?.includeResources !== undefined) params.includeResources = options.includeResources;
  if (options?.serverVersion !== undefined) params.serverVersion = options.serverVersion;

  // apiClient.get already extracts the data field from the response
  return apiClient.get<AggregatedMCPExportResponse>('/tools/export/mcp', params);
}

/**
 * Hook to fetch all tools exported in Universal (LLM-agnostic) format.
 * Includes simple, composite, and agentic tools across all integrations.
 */
export function useAllToolsUniversalExport(options?: UniversalExportOptions) {
  return useQuery({
    queryKey: allToolsExportKeys.universal(),
    queryFn: () => fetchAllToolsUniversalExport(options),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Hook to fetch all tools exported in LangChain format with code snippets.
 * Includes simple, composite, and agentic tools across all integrations.
 */
export function useAllToolsLangChainExport(options?: LangChainExportOptions) {
  return useQuery({
    queryKey: allToolsExportKeys.langchain(),
    queryFn: () => fetchAllToolsLangChainExport(options),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Hook to fetch all tools exported in MCP format with server file generation.
 * Includes simple, composite, and agentic tools across all integrations.
 */
export function useAllToolsMCPExport(options?: MCPExportOptions) {
  return useQuery({
    queryKey: allToolsExportKeys.mcp(),
    queryFn: () => fetchAllToolsMCPExport(options),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}
