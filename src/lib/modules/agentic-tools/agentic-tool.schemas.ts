/**
 * Agentic Tool Schemas
 *
 * Zod schemas for agentic tool validation, CRUD operations, and API responses.
 * Agentic tools embed configurable LLMs for parameter interpretation or autonomous operation.
 */

import { z } from 'zod';

// =============================================================================
// Enums
// =============================================================================

/**
 * Execution mode for agentic tools
 */
export const AgenticToolExecutionModeSchema = z.enum(['parameter_interpreter', 'autonomous_agent']);
export type AgenticToolExecutionMode = z.infer<typeof AgenticToolExecutionModeSchema>;

/**
 * Agentic tool status
 */
export const AgenticToolStatusSchema = z.enum(['draft', 'active', 'disabled']);
export type AgenticToolStatus = z.infer<typeof AgenticToolStatusSchema>;

/**
 * Agentic tool execution status
 */
export const AgenticToolExecutionStatusSchema = z.enum(['success', 'error', 'timeout']);
export type AgenticToolExecutionStatus = z.infer<typeof AgenticToolExecutionStatusSchema>;

/**
 * LLM provider
 */
export const LLMProviderSchema = z.enum(['anthropic', 'google']);
export type LLMProvider = z.infer<typeof LLMProviderSchema>;

/**
 * Reasoning level (where supported)
 */
export const ReasoningLevelSchema = z.enum(['none', 'low', 'medium', 'high']);
export type ReasoningLevel = z.infer<typeof ReasoningLevelSchema>;

// =============================================================================
// Embedded LLM Configuration Schemas
// =============================================================================

/**
 * Embedded LLM configuration
 */
export const EmbeddedLLMConfigSchema = z.object({
  provider: LLMProviderSchema,
  model: z.string().min(1), // e.g., 'claude-opus-4.5', 'claude-sonnet-4.5', 'gemini-3'
  reasoningLevel: ReasoningLevelSchema.optional(),
  temperature: z.number().min(0).max(1).default(0.2),
  maxTokens: z.number().int().min(1000).max(8000).default(4000),
  topP: z.number().min(0).max(1).optional(),
});
export type EmbeddedLLMConfig = z.infer<typeof EmbeddedLLMConfigSchema>;

// =============================================================================
// Tool Allocation Schemas
// =============================================================================

/**
 * Target action for parameter interpreter mode
 */
export const TargetActionSchema = z.object({
  actionId: z.string().uuid(),
  actionSlug: z.string(),
});
export type TargetAction = z.infer<typeof TargetActionSchema>;

/**
 * Available tool for autonomous agent mode
 */
export const AvailableToolSchema = z.object({
  actionId: z.string().uuid(),
  actionSlug: z.string(),
  description: z.string(), // Tool description for LLM
});
export type AvailableTool = z.infer<typeof AvailableToolSchema>;

/**
 * Tool allocation configuration
 * Note: Empty arrays are allowed for draft tools. Validation of at least 1 tool
 * should happen at invocation time, not creation time.
 */
export const ToolAllocationSchema = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('parameter_interpreter'),
    targetActions: z.array(TargetActionSchema),
  }),
  z.object({
    mode: z.literal('autonomous_agent'),
    availableTools: z.array(AvailableToolSchema),
  }),
]);
export type ToolAllocation = z.infer<typeof ToolAllocationSchema>;

// =============================================================================
// Context Configuration Schemas
// =============================================================================

/**
 * Context variable configuration
 */
export const ContextVariableSchema = z.object({
  type: z.enum(['integration_schema', 'reference_data', 'custom']),
  source: z.string().optional(), // Integration ID or data source
  value: z.string().optional(), // For custom variables
});
export type ContextVariable = z.infer<typeof ContextVariableSchema>;

/**
 * Context configuration for variable injection
 */
export const ContextConfigSchema = z.object({
  variables: z.record(z.string(), ContextVariableSchema).default({}),
  autoInjectSchemas: z.boolean().default(true),
});
export type ContextConfig = z.infer<typeof ContextConfigSchema>;

// =============================================================================
// Safety Limits Schemas
// =============================================================================

/**
 * Safety limits for autonomous mode
 */
export const SafetyLimitsSchema = z.object({
  maxToolCalls: z.number().int().min(1).max(100).default(10),
  timeoutSeconds: z.number().int().min(30).max(600).default(300),
  maxTotalCost: z.number().min(0.01).max(10).default(1.0),
});
export type SafetyLimits = z.infer<typeof SafetyLimitsSchema>;

// =============================================================================
// Agentic Tool CRUD Schemas
// =============================================================================

/**
 * Input for creating a new agentic tool
 */
export const CreateAgenticToolInputSchema = z.object({
  name: z.string().min(1).max(255),
  slug: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens'),
  description: z.string().optional(),
  executionMode: AgenticToolExecutionModeSchema,
  embeddedLLMConfig: EmbeddedLLMConfigSchema,
  systemPrompt: z.string().min(10),
  toolAllocation: ToolAllocationSchema,
  contextConfig: ContextConfigSchema.optional(),
  inputSchema: z.record(z.string(), z.unknown()).optional().default({}),
  toolDescription: z.string().optional(),
  safetyLimits: SafetyLimitsSchema.optional(),
  status: AgenticToolStatusSchema.optional().default('draft'),
  metadata: z.record(z.string(), z.unknown()).optional().default({}),
});
export type CreateAgenticToolInput = z.infer<typeof CreateAgenticToolInputSchema>;

/**
 * Input for updating an agentic tool
 */
export const UpdateAgenticToolInputSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  slug: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens')
    .optional(),
  description: z.string().nullable().optional(),
  executionMode: AgenticToolExecutionModeSchema.optional(),
  embeddedLLMConfig: EmbeddedLLMConfigSchema.optional(),
  systemPrompt: z.string().min(10).optional(),
  toolAllocation: ToolAllocationSchema.optional(),
  contextConfig: ContextConfigSchema.optional(),
  inputSchema: z.record(z.string(), z.unknown()).optional(),
  toolDescription: z.string().nullable().optional(),
  safetyLimits: SafetyLimitsSchema.optional(),
  status: AgenticToolStatusSchema.optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type UpdateAgenticToolInput = z.infer<typeof UpdateAgenticToolInputSchema>;

// =============================================================================
// Query Schemas
// =============================================================================

/**
 * Filters for querying agentic tools
 */
export const AgenticToolFiltersSchema = z.object({
  status: AgenticToolStatusSchema.optional(),
  executionMode: AgenticToolExecutionModeSchema.optional(),
  search: z.string().optional(),
});
export type AgenticToolFilters = z.infer<typeof AgenticToolFiltersSchema>;

/**
 * Query parameters for listing agentic tools (API)
 */
export const ListAgenticToolsQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: AgenticToolStatusSchema.optional(),
  executionMode: AgenticToolExecutionModeSchema.optional(),
  search: z.string().optional(),
});
export type ListAgenticToolsQuery = z.infer<typeof ListAgenticToolsQuerySchema>;

// =============================================================================
// API Response Schemas
// =============================================================================

/**
 * Agentic tool as returned by the API
 */
export const AgenticToolResponseSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  name: z.string(),
  slug: z.string(),
  description: z.string().nullable(),
  executionMode: AgenticToolExecutionModeSchema,
  embeddedLLMConfig: EmbeddedLLMConfigSchema,
  systemPrompt: z.string(),
  toolAllocation: z.record(z.string(), z.unknown()), // Stored as JSON
  contextConfig: z.record(z.string(), z.unknown()),
  inputSchema: z.record(z.string(), z.unknown()),
  toolDescription: z.string().nullable(),
  safetyLimits: z.record(z.string(), z.unknown()),
  status: AgenticToolStatusSchema,
  metadata: z.record(z.string(), z.unknown()),
  hasInvalidActions: z.boolean().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type AgenticToolResponse = z.infer<typeof AgenticToolResponseSchema>;

/**
 * Agentic tool summary (for list views)
 */
export const AgenticToolSummarySchema = AgenticToolResponseSchema.extend({
  executionCount: z.number().int(),
});
export type AgenticToolSummary = z.infer<typeof AgenticToolSummarySchema>;

/**
 * Paginated list of agentic tools
 */
export const ListAgenticToolsResponseSchema = z.object({
  agenticTools: z.array(AgenticToolResponseSchema),
  pagination: z.object({
    cursor: z.string().nullable(),
    hasMore: z.boolean(),
    totalCount: z.number().int(),
  }),
});
export type ListAgenticToolsResponse = z.infer<typeof ListAgenticToolsResponseSchema>;

/**
 * Agentic tool execution as returned by the API
 */
export const AgenticToolExecutionResponseSchema = z.object({
  id: z.string().uuid(),
  agenticToolId: z.string().uuid(),
  tenantId: z.string().uuid(),
  parentRequest: z.record(z.string(), z.unknown()),
  llmCalls: z.array(z.record(z.string(), z.unknown())),
  toolCalls: z.array(z.record(z.string(), z.unknown())),
  result: z.record(z.string(), z.unknown()).nullable(),
  status: AgenticToolExecutionStatusSchema,
  error: z.record(z.string(), z.unknown()).nullable(),
  totalCost: z.number(),
  totalTokens: z.number().int(),
  durationMs: z.number().int(),
  traceId: z.string().nullable(),
  createdAt: z.string(),
  completedAt: z.string().nullable(),
});
export type AgenticToolExecutionResponse = z.infer<typeof AgenticToolExecutionResponseSchema>;

/**
 * Execution statistics
 */
export const AgenticToolExecutionStatsSchema = z.object({
  totalExecutions: z.number().int(),
  successCount: z.number().int(),
  errorCount: z.number().int(),
  timeoutCount: z.number().int(),
  avgDurationMs: z.number().int(),
  totalCost: z.number(),
  totalTokens: z.number().int(),
});
export type AgenticToolExecutionStats = z.infer<typeof AgenticToolExecutionStatsSchema>;

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Converts a database AgenticTool to API response format
 */
export function toAgenticToolResponse(tool: {
  id: string;
  tenantId: string;
  name: string;
  slug: string;
  description: string | null;
  executionMode: string;
  embeddedLLMConfig: unknown;
  systemPrompt: string;
  toolAllocation: unknown;
  contextConfig: unknown;
  inputSchema: unknown;
  toolDescription: string | null;
  safetyLimits: unknown;
  status: string;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
}): AgenticToolResponse {
  return {
    id: tool.id,
    tenantId: tool.tenantId,
    name: tool.name,
    slug: tool.slug,
    description: tool.description,
    executionMode: tool.executionMode as AgenticToolExecutionMode,
    embeddedLLMConfig: tool.embeddedLLMConfig as EmbeddedLLMConfig,
    systemPrompt: tool.systemPrompt,
    toolAllocation: (tool.toolAllocation as Record<string, unknown>) ?? {},
    contextConfig: (tool.contextConfig as Record<string, unknown>) ?? {},
    inputSchema: (tool.inputSchema as Record<string, unknown>) ?? {},
    toolDescription: tool.toolDescription,
    safetyLimits: (tool.safetyLimits as Record<string, unknown>) ?? {},
    status: tool.status as AgenticToolStatus,
    metadata: (tool.metadata as Record<string, unknown>) ?? {},
    createdAt: tool.createdAt.toISOString(),
    updatedAt: tool.updatedAt.toISOString(),
  };
}

/**
 * Converts a database AgenticToolExecution to API response format
 */
export function toAgenticToolExecutionResponse(execution: {
  id: string;
  agenticToolId: string;
  tenantId: string;
  parentRequest: unknown;
  llmCalls: unknown[];
  toolCalls: unknown[];
  result: unknown;
  status: string;
  error: unknown;
  totalCost: unknown;
  totalTokens: number;
  durationMs: number;
  traceId: string | null;
  createdAt: Date;
  completedAt: Date | null;
}): AgenticToolExecutionResponse {
  return {
    id: execution.id,
    agenticToolId: execution.agenticToolId,
    tenantId: execution.tenantId,
    parentRequest: (execution.parentRequest as Record<string, unknown>) ?? {},
    llmCalls: (execution.llmCalls as Record<string, unknown>[]) ?? [],
    toolCalls: (execution.toolCalls as Record<string, unknown>[]) ?? [],
    result: (execution.result as Record<string, unknown>) ?? null,
    status: execution.status as AgenticToolExecutionStatus,
    error: (execution.error as Record<string, unknown>) ?? null,
    totalCost: Number(execution.totalCost ?? 0),
    totalTokens: execution.totalTokens,
    durationMs: execution.durationMs,
    traceId: execution.traceId,
    createdAt: execution.createdAt.toISOString(),
    completedAt: execution.completedAt?.toISOString() ?? null,
  };
}

// =============================================================================
// Error Codes
// =============================================================================

export const AgenticToolErrorCodes = {
  AGENTIC_TOOL_NOT_FOUND: 'AGENTIC_TOOL_NOT_FOUND',
  EXECUTION_NOT_FOUND: 'EXECUTION_NOT_FOUND',
  DUPLICATE_SLUG: 'DUPLICATE_SLUG',
  INVALID_INPUT: 'INVALID_INPUT',
  INVALID_STATUS: 'INVALID_STATUS',
  AGENTIC_TOOL_DISABLED: 'AGENTIC_TOOL_DISABLED',
  ACTION_NOT_FOUND: 'ACTION_NOT_FOUND',
  INVALID_EXECUTION_MODE: 'INVALID_EXECUTION_MODE',
  INVALID_LLM_CONFIG: 'INVALID_LLM_CONFIG',
  INVALID_TOOL_ALLOCATION: 'INVALID_TOOL_ALLOCATION',
  SAFETY_LIMIT_EXCEEDED: 'SAFETY_LIMIT_EXCEEDED',
  LLM_PROVIDER_ERROR: 'LLM_PROVIDER_ERROR',
  TIMEOUT: 'TIMEOUT',
} as const;
