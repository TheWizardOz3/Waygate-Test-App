/**
 * Unified Tool Schemas
 *
 * Zod schemas for unified tool API validation and responses.
 */

import { z } from 'zod';

// =============================================================================
// Enums
// =============================================================================

/**
 * Tool type discriminator
 */
export const ToolTypeSchema = z.enum(['simple', 'composite', 'agentic']);
export type ToolType = z.infer<typeof ToolTypeSchema>;

/**
 * Tool status
 */
export const ToolStatusSchema = z.enum(['active', 'draft', 'disabled']);
export type ToolStatus = z.infer<typeof ToolStatusSchema>;

// =============================================================================
// Query Schemas
// =============================================================================

/**
 * Query parameters for listing unified tools
 */
export const ListUnifiedToolsQuerySchema = z.object({
  /** Filter by tool types (comma-separated or array) */
  types: z
    .union([z.string().transform((s) => s.split(',').filter(Boolean)), z.array(z.string())])
    .pipe(z.array(ToolTypeSchema))
    .optional(),

  /** Filter by integration ID (for simple tools) */
  integrationId: z.string().uuid().optional(),

  /** Search query */
  search: z.string().optional(),

  /** Filter by status (comma-separated or array) */
  status: z
    .union([z.string().transform((s) => s.split(',').filter(Boolean)), z.array(z.string())])
    .pipe(z.array(ToolStatusSchema))
    .optional(),

  /** Exclude specific tool IDs (comma-separated or array) */
  excludeIds: z
    .union([z.string().transform((s) => s.split(',').filter(Boolean)), z.array(z.string())])
    .optional(),

  /** Pagination cursor */
  cursor: z.string().optional(),

  /** Page size (default 50) */
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type ListUnifiedToolsQuery = z.infer<typeof ListUnifiedToolsQuerySchema>;

// =============================================================================
// Response Schemas
// =============================================================================

/**
 * Unified tool as returned by the API
 */
export const UnifiedToolResponseSchema = z.object({
  id: z.string(),
  type: ToolTypeSchema,
  name: z.string(),
  slug: z.string(),
  description: z.string(),
  integrationId: z.string().uuid().optional(),
  integrationName: z.string().optional(),
  integrationSlug: z.string().optional(),
  inputSchema: z.record(z.string(), z.unknown()),
  outputSchema: z.record(z.string(), z.unknown()).optional(),
  actionId: z.string().uuid().optional(),
  actionSlug: z.string().optional(),
  childOperationIds: z.array(z.string().uuid()).optional(),
  executionMode: z.enum(['parameter_interpreter', 'autonomous_agent']).optional(),
  status: ToolStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type UnifiedToolResponse = z.infer<typeof UnifiedToolResponseSchema>;

/**
 * Paginated list of unified tools
 */
export const ListUnifiedToolsResponseSchema = z.object({
  tools: z.array(UnifiedToolResponseSchema),
  pagination: z.object({
    cursor: z.string().nullable(),
    hasMore: z.boolean(),
    totalCount: z.number().int(),
  }),
});
export type ListUnifiedToolsResponse = z.infer<typeof ListUnifiedToolsResponseSchema>;

// =============================================================================
// Tool Reference Schemas (for storage in composite/agentic tools)
// =============================================================================

/**
 * Tool reference stored in composite/agentic tool allocations
 */
export const ToolReferenceSchema = z.object({
  toolId: z.string(),
  toolType: ToolTypeSchema,
  toolSlug: z.string(),
});
export type ToolReference = z.infer<typeof ToolReferenceSchema>;

/**
 * Selected tool metadata for wizard use
 */
export const SelectedToolMetaSchema = z.object({
  toolId: z.string(),
  toolType: ToolTypeSchema,
  toolName: z.string(),
  toolSlug: z.string(),
  integrationId: z.string().uuid().optional(),
  integrationName: z.string().optional(),
  description: z.string(),
  inputSchema: z.record(z.string(), z.unknown()).optional(),
  outputSchema: z.record(z.string(), z.unknown()).optional(),
});
export type SelectedToolMeta = z.infer<typeof SelectedToolMetaSchema>;

// =============================================================================
// Error Codes
// =============================================================================

export const UnifiedToolErrorCodes = {
  TOOL_NOT_FOUND: 'TOOL_NOT_FOUND',
  INVALID_TOOL_TYPE: 'INVALID_TOOL_TYPE',
  CIRCULAR_REFERENCE: 'CIRCULAR_REFERENCE',
  TOOL_DISABLED: 'TOOL_DISABLED',
} as const;
