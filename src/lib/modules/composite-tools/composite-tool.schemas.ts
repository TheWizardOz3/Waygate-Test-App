/**
 * Composite Tool Schemas
 *
 * Zod schemas for composite tool validation, CRUD operations, and API responses.
 * Composite tools aggregate multiple actions with configurable routing logic.
 */

import { z } from 'zod';

// =============================================================================
// Enums
// =============================================================================

/**
 * Routing mode for composite tools
 */
export const CompositeToolRoutingModeSchema = z.enum(['rule_based', 'agent_driven']);
export type CompositeToolRoutingMode = z.infer<typeof CompositeToolRoutingModeSchema>;

/**
 * Composite tool status
 */
export const CompositeToolStatusSchema = z.enum(['draft', 'active', 'disabled']);
export type CompositeToolStatus = z.infer<typeof CompositeToolStatusSchema>;

/**
 * Routing condition types
 */
export const RoutingConditionTypeSchema = z.enum([
  'contains',
  'equals',
  'matches',
  'starts_with',
  'ends_with',
]);
export type RoutingConditionType = z.infer<typeof RoutingConditionTypeSchema>;

// =============================================================================
// Routing Condition Schemas
// =============================================================================

/**
 * A single routing condition for rule-based routing
 */
export const RoutingConditionSchema = z.object({
  type: RoutingConditionTypeSchema,
  field: z.string().min(1).max(100),
  value: z.string().min(1),
  caseSensitive: z.boolean().optional().default(false),
});
export type RoutingCondition = z.infer<typeof RoutingConditionSchema>;

// =============================================================================
// Parameter Mapping Schemas
// =============================================================================

/**
 * Mapping from unified param to operation-specific param
 */
export const OperationParameterMappingSchema = z.object({
  targetParam: z.string().min(1),
  transform: z.string().optional(), // For future use
});

/**
 * Unified schema configuration
 */
export const UnifiedSchemaConfigSchema = z.object({
  parameters: z.record(
    z.string(),
    z.object({
      type: z.string(),
      description: z.string().optional(),
      required: z.boolean().optional().default(false),
      operationMappings: z.record(z.string(), OperationParameterMappingSchema),
    })
  ),
});
export type UnifiedSchemaConfig = z.infer<typeof UnifiedSchemaConfigSchema>;

// =============================================================================
// Operation Schemas
// =============================================================================

/**
 * Input for creating an operation within a composite tool
 */
export const CreateCompositeToolOperationInputSchema = z.object({
  actionId: z.string().uuid(),
  operationSlug: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9-]+$/, 'Operation slug must be lowercase alphanumeric with hyphens'),
  displayName: z.string().min(1).max(255),
  parameterMapping: z.record(z.string(), z.unknown()).optional().default({}),
  priority: z.number().int().min(0).optional().default(0),
});
export type CreateCompositeToolOperationInput = z.infer<
  typeof CreateCompositeToolOperationInputSchema
>;

/**
 * Input for updating an operation
 */
export const UpdateCompositeToolOperationInputSchema = z.object({
  operationSlug: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9-]+$/, 'Operation slug must be lowercase alphanumeric with hyphens')
    .optional(),
  displayName: z.string().min(1).max(255).optional(),
  parameterMapping: z.record(z.string(), z.unknown()).optional(),
  priority: z.number().int().min(0).optional(),
});
export type UpdateCompositeToolOperationInput = z.infer<
  typeof UpdateCompositeToolOperationInputSchema
>;

// =============================================================================
// Routing Rule Schemas
// =============================================================================

/**
 * Input for creating a routing rule
 */
export const CreateRoutingRuleInputSchema = z.object({
  operationId: z.string().uuid(),
  conditionType: RoutingConditionTypeSchema,
  conditionField: z.string().min(1).max(100),
  conditionValue: z.string().min(1),
  caseSensitive: z.boolean().optional().default(false),
  priority: z.number().int().min(0).optional().default(0),
});
export type CreateRoutingRuleInput = z.infer<typeof CreateRoutingRuleInputSchema>;

/**
 * Input for updating a routing rule
 */
export const UpdateRoutingRuleInputSchema = z.object({
  operationId: z.string().uuid().optional(),
  conditionType: RoutingConditionTypeSchema.optional(),
  conditionField: z.string().min(1).max(100).optional(),
  conditionValue: z.string().min(1).optional(),
  caseSensitive: z.boolean().optional(),
  priority: z.number().int().min(0).optional(),
});
export type UpdateRoutingRuleInput = z.infer<typeof UpdateRoutingRuleInputSchema>;

// =============================================================================
// Composite Tool CRUD Schemas
// =============================================================================

/**
 * Input for creating a new composite tool
 */
export const CreateCompositeToolInputSchema = z.object({
  name: z.string().min(1).max(255),
  slug: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens'),
  description: z.string().optional(),
  routingMode: CompositeToolRoutingModeSchema,
  unifiedInputSchema: z.record(z.string(), z.unknown()).optional().default({}),
  toolDescription: z.string().optional(),
  toolSuccessTemplate: z.string().optional(),
  toolErrorTemplate: z.string().optional(),
  status: CompositeToolStatusSchema.optional().default('draft'),
  metadata: z.record(z.string(), z.unknown()).optional().default({}),
  /** Operations to create along with the composite tool */
  operations: z.array(CreateCompositeToolOperationInputSchema).optional(),
  /** Routing rules to create (for rule_based mode) */
  routingRules: z.array(CreateRoutingRuleInputSchema).optional(),
  /** Default operation slug (must match one of the operations) */
  defaultOperationSlug: z.string().optional(),
});
export type CreateCompositeToolInput = z.infer<typeof CreateCompositeToolInputSchema>;

/**
 * Input for updating a composite tool
 */
export const UpdateCompositeToolInputSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  slug: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens')
    .optional(),
  description: z.string().nullable().optional(),
  routingMode: CompositeToolRoutingModeSchema.optional(),
  defaultOperationId: z.string().uuid().nullable().optional(),
  unifiedInputSchema: z.record(z.string(), z.unknown()).optional(),
  toolDescription: z.string().nullable().optional(),
  toolSuccessTemplate: z.string().nullable().optional(),
  toolErrorTemplate: z.string().nullable().optional(),
  status: CompositeToolStatusSchema.optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type UpdateCompositeToolInput = z.infer<typeof UpdateCompositeToolInputSchema>;

// =============================================================================
// Query Schemas
// =============================================================================

/**
 * Filters for querying composite tools
 */
export const CompositeToolFiltersSchema = z.object({
  status: CompositeToolStatusSchema.optional(),
  routingMode: CompositeToolRoutingModeSchema.optional(),
  search: z.string().optional(),
});
export type CompositeToolFilters = z.infer<typeof CompositeToolFiltersSchema>;

/**
 * Query parameters for listing composite tools (API)
 */
export const ListCompositeToolsQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: CompositeToolStatusSchema.optional(),
  routingMode: CompositeToolRoutingModeSchema.optional(),
  search: z.string().optional(),
});
export type ListCompositeToolsQuery = z.infer<typeof ListCompositeToolsQuerySchema>;

// =============================================================================
// API Response Schemas
// =============================================================================

/**
 * Action info for navigation links in operations
 */
export const OperationActionInfoSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  slug: z.string(),
  integrationId: z.string().uuid(),
  integration: z.object({
    id: z.string().uuid(),
    name: z.string(),
    slug: z.string(),
  }),
});
export type OperationActionInfo = z.infer<typeof OperationActionInfoSchema>;

/**
 * Operation as returned by the API
 */
export const CompositeToolOperationResponseSchema = z.object({
  id: z.string().uuid(),
  compositeToolId: z.string().uuid(),
  actionId: z.string().uuid(),
  operationSlug: z.string(),
  displayName: z.string(),
  parameterMapping: z.record(z.string(), z.unknown()),
  priority: z.number().int(),
  createdAt: z.string(),
  action: OperationActionInfoSchema.optional(),
});
export type CompositeToolOperationResponse = z.infer<typeof CompositeToolOperationResponseSchema>;

/**
 * Routing rule as returned by the API
 */
export const RoutingRuleResponseSchema = z.object({
  id: z.string().uuid(),
  compositeToolId: z.string().uuid(),
  operationId: z.string().uuid(),
  conditionType: RoutingConditionTypeSchema,
  conditionField: z.string(),
  conditionValue: z.string(),
  caseSensitive: z.boolean(),
  priority: z.number().int(),
  createdAt: z.string(),
});
export type RoutingRuleResponse = z.infer<typeof RoutingRuleResponseSchema>;

/**
 * Composite tool as returned by the API
 */
export const CompositeToolResponseSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  name: z.string(),
  slug: z.string(),
  description: z.string().nullable(),
  routingMode: CompositeToolRoutingModeSchema,
  defaultOperationId: z.string().uuid().nullable(),
  unifiedInputSchema: z.record(z.string(), z.unknown()),
  toolDescription: z.string().nullable(),
  toolSuccessTemplate: z.string().nullable(),
  toolErrorTemplate: z.string().nullable(),
  status: CompositeToolStatusSchema,
  metadata: z.record(z.string(), z.unknown()),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type CompositeToolResponse = z.infer<typeof CompositeToolResponseSchema>;

/**
 * Composite tool with operations and routing rules (detailed view)
 */
export const CompositeToolDetailResponseSchema = CompositeToolResponseSchema.extend({
  operations: z.array(CompositeToolOperationResponseSchema),
  routingRules: z.array(RoutingRuleResponseSchema),
});
export type CompositeToolDetailResponse = z.infer<typeof CompositeToolDetailResponseSchema>;

/**
 * Paginated list of composite tools
 */
export const ListCompositeToolsResponseSchema = z.object({
  compositeTools: z.array(CompositeToolResponseSchema),
  pagination: z.object({
    cursor: z.string().nullable(),
    hasMore: z.boolean(),
    totalCount: z.number().int(),
  }),
});
export type ListCompositeToolsResponse = z.infer<typeof ListCompositeToolsResponseSchema>;

/**
 * Composite tool summary (for list views)
 */
export const CompositeToolSummarySchema = CompositeToolResponseSchema.extend({
  operationCount: z.number().int(),
});
export type CompositeToolSummary = z.infer<typeof CompositeToolSummarySchema>;

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Converts a database CompositeTool to API response format
 */
export function toCompositeToolResponse(tool: {
  id: string;
  tenantId: string;
  name: string;
  slug: string;
  description: string | null;
  routingMode: string;
  defaultOperationId: string | null;
  unifiedInputSchema: unknown;
  toolDescription: string | null;
  toolSuccessTemplate: string | null;
  toolErrorTemplate: string | null;
  status: string;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
}): CompositeToolResponse {
  return {
    id: tool.id,
    tenantId: tool.tenantId,
    name: tool.name,
    slug: tool.slug,
    description: tool.description,
    routingMode: tool.routingMode as CompositeToolRoutingMode,
    defaultOperationId: tool.defaultOperationId,
    unifiedInputSchema: (tool.unifiedInputSchema as Record<string, unknown>) ?? {},
    toolDescription: tool.toolDescription,
    toolSuccessTemplate: tool.toolSuccessTemplate,
    toolErrorTemplate: tool.toolErrorTemplate,
    status: tool.status as CompositeToolStatus,
    metadata: (tool.metadata as Record<string, unknown>) ?? {},
    createdAt: tool.createdAt.toISOString(),
    updatedAt: tool.updatedAt.toISOString(),
  };
}

/**
 * Converts a database CompositeToolOperation to API response format
 */
export function toOperationResponse(operation: {
  id: string;
  compositeToolId: string;
  actionId: string;
  operationSlug: string;
  displayName: string;
  parameterMapping: unknown;
  priority: number;
  createdAt: Date;
  action?: {
    id: string;
    name: string;
    slug: string;
    integrationId: string;
    integration: {
      id: string;
      name: string;
      slug: string;
    };
  };
}): CompositeToolOperationResponse {
  return {
    id: operation.id,
    compositeToolId: operation.compositeToolId,
    actionId: operation.actionId,
    operationSlug: operation.operationSlug,
    displayName: operation.displayName,
    parameterMapping: (operation.parameterMapping as Record<string, unknown>) ?? {},
    priority: operation.priority,
    createdAt: operation.createdAt.toISOString(),
    action: operation.action
      ? {
          id: operation.action.id,
          name: operation.action.name,
          slug: operation.action.slug,
          integrationId: operation.action.integrationId,
          integration: {
            id: operation.action.integration.id,
            name: operation.action.integration.name,
            slug: operation.action.integration.slug,
          },
        }
      : undefined,
  };
}

/**
 * Converts a database RoutingRule to API response format
 */
export function toRoutingRuleResponse(rule: {
  id: string;
  compositeToolId: string;
  operationId: string;
  conditionType: string;
  conditionField: string;
  conditionValue: string;
  caseSensitive: boolean;
  priority: number;
  createdAt: Date;
}): RoutingRuleResponse {
  return {
    id: rule.id,
    compositeToolId: rule.compositeToolId,
    operationId: rule.operationId,
    conditionType: rule.conditionType as RoutingConditionType,
    conditionField: rule.conditionField,
    conditionValue: rule.conditionValue,
    caseSensitive: rule.caseSensitive,
    priority: rule.priority,
    createdAt: rule.createdAt.toISOString(),
  };
}

// =============================================================================
// Error Codes
// =============================================================================

export const CompositeToolErrorCodes = {
  COMPOSITE_TOOL_NOT_FOUND: 'COMPOSITE_TOOL_NOT_FOUND',
  OPERATION_NOT_FOUND: 'OPERATION_NOT_FOUND',
  ROUTING_RULE_NOT_FOUND: 'ROUTING_RULE_NOT_FOUND',
  DUPLICATE_SLUG: 'DUPLICATE_SLUG',
  DUPLICATE_OPERATION_SLUG: 'DUPLICATE_OPERATION_SLUG',
  INVALID_INPUT: 'INVALID_INPUT',
  INVALID_STATUS: 'INVALID_STATUS',
  COMPOSITE_TOOL_DISABLED: 'COMPOSITE_TOOL_DISABLED',
  ACTION_NOT_FOUND: 'ACTION_NOT_FOUND',
  INVALID_DEFAULT_OPERATION: 'INVALID_DEFAULT_OPERATION',
  OPERATION_ALREADY_EXISTS: 'OPERATION_ALREADY_EXISTS',
  MAX_OPERATIONS_EXCEEDED: 'MAX_OPERATIONS_EXCEEDED',
} as const;
