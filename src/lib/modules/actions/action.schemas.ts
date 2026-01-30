/**
 * Action Schemas
 *
 * Zod schemas for action validation, CRUD operations, and API responses.
 * Defines the structure of action definitions, JSON Schema for input/output validation,
 * and API request/response types.
 */

import { z } from 'zod';
import { ValidationConfigSchema } from '../execution/validation';
import { ActionReferenceDataConfigSchema } from '../reference-data';

// =============================================================================
// Enums
// =============================================================================

/**
 * HTTP methods for action endpoints
 */
export const HttpMethodSchema = z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);
export type HttpMethod = z.infer<typeof HttpMethodSchema>;

/**
 * Pagination types for list endpoints
 */
export const PaginationTypeSchema = z.enum(['cursor', 'offset', 'page', 'link']);
export type PaginationType = z.infer<typeof PaginationTypeSchema>;

// =============================================================================
// JSON Schema Types (for input/output validation)
// =============================================================================

/**
 * JSON Schema property types
 */
export const JsonSchemaTypeSchema = z.enum([
  'object',
  'array',
  'string',
  'number',
  'integer',
  'boolean',
  'null',
]);

/**
 * JSON Schema property definition
 * Recursive structure to support nested objects and arrays
 */
export const JsonSchemaPropertySchema: z.ZodType<JsonSchemaProperty> = z.lazy(() =>
  z.object({
    type: z.union([JsonSchemaTypeSchema, z.array(JsonSchemaTypeSchema)]).optional(),
    description: z.string().optional(),
    default: z.unknown().optional(),
    enum: z.array(z.union([z.string(), z.number(), z.boolean()])).optional(),
    format: z.string().optional(),
    minimum: z.number().optional(),
    maximum: z.number().optional(),
    minLength: z.number().int().min(0).optional(),
    maxLength: z.number().int().min(0).optional(),
    pattern: z.string().optional(),
    items: z.lazy(() => JsonSchemaPropertySchema).optional(),
    properties: z
      .record(
        z.string(),
        z.lazy(() => JsonSchemaPropertySchema)
      )
      .optional(),
    required: z.array(z.string()).optional(),
    nullable: z.boolean().optional(),
    additionalProperties: z.union([z.boolean(), z.lazy(() => JsonSchemaPropertySchema)]).optional(),
    oneOf: z.array(z.lazy(() => JsonSchemaPropertySchema)).optional(),
    anyOf: z.array(z.lazy(() => JsonSchemaPropertySchema)).optional(),
    allOf: z.array(z.lazy(() => JsonSchemaPropertySchema)).optional(),
    $ref: z.string().optional(),
  })
);

export interface JsonSchemaProperty {
  type?: string | string[];
  description?: string;
  default?: unknown;
  enum?: (string | number | boolean)[];
  format?: string;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  items?: JsonSchemaProperty;
  properties?: Record<string, JsonSchemaProperty>;
  required?: string[];
  nullable?: boolean;
  additionalProperties?: boolean | JsonSchemaProperty;
  oneOf?: JsonSchemaProperty[];
  anyOf?: JsonSchemaProperty[];
  allOf?: JsonSchemaProperty[];
  $ref?: string;
}

/**
 * JSON Schema for action input/output validation
 */
export const JsonSchemaSchema = z.object({
  type: JsonSchemaTypeSchema,
  properties: z.record(z.string(), JsonSchemaPropertySchema).optional(),
  required: z.array(z.string()).optional(),
  items: JsonSchemaPropertySchema.optional(),
  additionalProperties: z.union([z.boolean(), JsonSchemaPropertySchema]).optional(),
  description: z.string().optional(),
  title: z.string().optional(),
});

export type JsonSchema = z.infer<typeof JsonSchemaSchema>;

// =============================================================================
// Pagination Configuration
// =============================================================================

/**
 * Pagination configuration for list endpoints
 */
export const PaginationConfigSchema = z.object({
  type: PaginationTypeSchema,
  pageParam: z.string().optional(),
  limitParam: z.string().optional(),
  cursorParam: z.string().optional(),
  responsePagePath: z.string().optional(),
  responseTotalPath: z.string().optional(),
  responseNextCursorPath: z.string().optional(),
});

export type PaginationConfig = z.infer<typeof PaginationConfigSchema>;

// =============================================================================
// Retry Configuration
// =============================================================================

/**
 * Action-level retry configuration
 */
export const ActionRetryConfigSchema = z.object({
  maxRetries: z.number().int().min(0).max(10).optional(),
  retryableStatuses: z.array(z.number().int().min(100).max(599)).optional(),
  backoffMultiplier: z.number().min(1).max(5).optional(),
});

export type ActionRetryConfig = z.infer<typeof ActionRetryConfigSchema>;

// =============================================================================
// Action Metadata
// =============================================================================

/**
 * Rate limit configuration
 */
export const RateLimitSchema = z.object({
  requests: z.number().positive(),
  window: z.number().positive(), // seconds
});

export type RateLimit = z.infer<typeof RateLimitSchema>;

/**
 * Action metadata containing additional context
 */
export const ActionMetadataSchema = z.object({
  /** Original endpoint path from documentation */
  originalPath: z.string().optional(),
  /** Tags/categories for the action */
  tags: z.array(z.string()).optional(),
  /** Whether endpoint is deprecated */
  deprecated: z.boolean().optional(),
  /** AI confidence score for this action (0-1) */
  aiConfidence: z.number().min(0).max(1).optional(),
  /** Rate limit specific to this endpoint */
  rateLimit: RateLimitSchema.optional(),
  /** Source documentation URL */
  sourceUrl: z.string().url().optional(),
  /** Wishlist match score from AI generation */
  wishlistScore: z.number().min(0).max(1).optional(),
  /**
   * Reference data sync configuration.
   * When set, this action can be used to sync reference data (users, channels, etc.)
   * for AI context.
   */
  referenceData: ActionReferenceDataConfigSchema.optional(),
});

export type ActionMetadata = z.infer<typeof ActionMetadataSchema>;

// =============================================================================
// Action Definition Schemas
// =============================================================================

/**
 * Tag validation schema - alphanumeric + hyphens, 2-30 chars
 */
export const TagSchema = z
  .string()
  .min(2, 'Tag must be at least 2 characters')
  .max(30, 'Tag must be at most 30 characters')
  .regex(/^[a-z0-9-]+$/, 'Tag must be lowercase alphanumeric with hyphens only')
  .transform((s) => s.toLowerCase());

/**
 * Base action definition (shared fields)
 */
const ActionBaseSchema = z.object({
  name: z.string().min(1, 'Action name is required').max(255),
  slug: z.string().min(1, 'Action slug is required').max(100),
  description: z.string().max(2000).optional(),
  httpMethod: HttpMethodSchema,
  endpointTemplate: z.string().min(1, 'Endpoint template is required'),
  inputSchema: JsonSchemaSchema,
  outputSchema: JsonSchemaSchema,
  paginationConfig: PaginationConfigSchema.nullable().optional(),
  validationConfig: ValidationConfigSchema.nullable().optional(),
  retryConfig: ActionRetryConfigSchema.nullable().optional(),
  cacheable: z.boolean().default(false),
  cacheTtlSeconds: z.number().int().min(0).max(86400).nullable().optional(),
  tags: z.array(TagSchema).max(10, 'Maximum 10 tags allowed').default([]),
  metadata: ActionMetadataSchema.default({}),
});

/**
 * Action as stored in database (with ID and timestamps)
 */
export const ActionSchema = ActionBaseSchema.extend({
  id: z.string().uuid(),
  integrationId: z.string().uuid(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type Action = z.infer<typeof ActionSchema>;

/**
 * Action for API responses (dates as ISO strings)
 */
export const ActionResponseSchema = ActionBaseSchema.extend({
  id: z.string().uuid(),
  integrationId: z.string().uuid(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type ActionResponse = z.infer<typeof ActionResponseSchema>;

// =============================================================================
// API Input Schemas
// =============================================================================

/**
 * Input for creating a new action
 */
export const CreateActionInputSchema = ActionBaseSchema.omit({
  metadata: true,
  tags: true,
}).extend({
  integrationId: z.string().uuid('Invalid integration ID'),
  tags: z.array(TagSchema).max(10, 'Maximum 10 tags allowed').optional().default([]),
  metadata: ActionMetadataSchema.optional(),
});

export type CreateActionInput = z.infer<typeof CreateActionInputSchema>;

/**
 * Input for creating multiple actions (batch)
 */
export const BatchCreateActionsInputSchema = z.object({
  integrationId: z.string().uuid('Invalid integration ID'),
  actions: z.array(ActionBaseSchema).min(1, 'At least one action is required').max(100),
  /** Replace existing actions (delete all first) */
  replaceExisting: z.boolean().default(false),
});

export type BatchCreateActionsInput = z.infer<typeof BatchCreateActionsInputSchema>;

/**
 * Input for updating an action
 */
export const UpdateActionInputSchema = ActionBaseSchema.partial()
  .omit({
    inputSchema: true,
    outputSchema: true,
    validationConfig: true,
  })
  .extend({
    inputSchema: JsonSchemaSchema.optional(),
    outputSchema: JsonSchemaSchema.optional(),
    validationConfig: ValidationConfigSchema.nullable().optional(),
  });

export type UpdateActionInput = z.infer<typeof UpdateActionInputSchema>;

/**
 * Query parameters for listing actions
 */
export const ListActionsQuerySchema = z.object({
  /** Pagination cursor */
  cursor: z.string().optional(),
  /** Results per page (default: 50, max: 100) */
  limit: z.coerce.number().int().min(1).max(100).default(50),
  /** Search by name/description */
  search: z.string().max(100).optional(),
  /** Filter by tags (comma-separated) */
  tags: z.string().optional(),
  /** Filter by HTTP method */
  httpMethod: HttpMethodSchema.optional(),
  /** Filter by cacheable */
  cacheable: z
    .string()
    .transform((v) => v === 'true')
    .optional(),
});

export type ListActionsQuery = z.infer<typeof ListActionsQuerySchema>;

// =============================================================================
// API Response Schemas
// =============================================================================

/**
 * Pagination info in responses
 */
export const PaginationInfoSchema = z.object({
  cursor: z.string().nullable(),
  hasMore: z.boolean(),
  totalCount: z.number().int().min(0),
});

export type PaginationInfo = z.infer<typeof PaginationInfoSchema>;

/**
 * Response for list actions endpoint
 */
export const ListActionsResponseSchema = z.object({
  actions: z.array(ActionResponseSchema),
  pagination: PaginationInfoSchema,
});

export type ListActionsResponse = z.infer<typeof ListActionsResponseSchema>;

/**
 * Response for action schema endpoint
 */
export const ActionSchemaResponseSchema = z.object({
  actionId: z.string().describe('Full action ID: {integration}.{action}'),
  inputSchema: JsonSchemaSchema,
  outputSchema: JsonSchemaSchema,
  metadata: z.object({
    httpMethod: HttpMethodSchema,
    cacheable: z.boolean(),
    cacheTtlSeconds: z.number().nullable().optional(),
    rateLimit: RateLimitSchema.nullable().optional(),
    tags: z.array(z.string()).optional(),
    paginationConfig: PaginationConfigSchema.nullable().optional(),
  }),
});

export type ActionSchemaResponse = z.infer<typeof ActionSchemaResponseSchema>;

/**
 * Response for batch create actions
 */
export const BatchCreateActionsResponseSchema = z.object({
  created: z.number().int().min(0),
  deleted: z.number().int().min(0).optional(),
  actions: z.array(ActionResponseSchema),
  warnings: z.array(z.string()).optional(),
});

export type BatchCreateActionsResponse = z.infer<typeof BatchCreateActionsResponseSchema>;

// =============================================================================
// Validation Input Schema
// =============================================================================

/**
 * Input for validating action parameters
 */
export const ValidateActionInputSchema = z.object({
  /** The input data to validate against action schema */
  input: z.record(z.string(), z.unknown()),
});

export type ValidateActionInputRequest = z.infer<typeof ValidateActionInputSchema>;

/**
 * Validation error detail
 */
export const ValidationErrorDetailSchema = z.object({
  field: z.string(),
  message: z.string(),
  code: z.string(),
  expected: z.string().optional(),
  received: z.string().optional(),
});

export type ValidationErrorDetail = z.infer<typeof ValidationErrorDetailSchema>;

/**
 * Response for validation endpoint
 */
export const ValidationResultSchema = z.object({
  valid: z.boolean(),
  errors: z.array(ValidationErrorDetailSchema).optional(),
});

export type ValidationResult = z.infer<typeof ValidationResultSchema>;

// =============================================================================
// Action Error Codes
// =============================================================================

/**
 * Action-related error codes
 */
export const ActionErrorCodes = {
  ACTION_NOT_FOUND: 'ACTION_NOT_FOUND',
  INTEGRATION_NOT_FOUND: 'INTEGRATION_NOT_FOUND',
  DUPLICATE_SLUG: 'DUPLICATE_SLUG',
  INVALID_SCHEMA: 'INVALID_SCHEMA',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  BATCH_LIMIT_EXCEEDED: 'BATCH_LIMIT_EXCEEDED',
} as const;

export type ActionErrorCode = (typeof ActionErrorCodes)[keyof typeof ActionErrorCodes];

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Generate a URL-safe slug from a name
 */
export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-')
    .slice(0, 100);
}

/**
 * Generate full action ID from integration and action slugs
 */
export function generateActionId(integrationSlug: string, actionSlug: string): string {
  return `${integrationSlug}.${actionSlug}`;
}

/**
 * Parse full action ID into integration and action slugs
 */
export function parseActionId(
  actionId: string
): { integrationSlug: string; actionSlug: string } | null {
  const parts = actionId.split('.');
  if (parts.length !== 2) return null;
  return { integrationSlug: parts[0], actionSlug: parts[1] };
}

/**
 * Validate that a JSON Schema is well-formed
 */
export function isValidJsonSchema(schema: unknown): schema is JsonSchema {
  const result = JsonSchemaSchema.safeParse(schema);
  return result.success;
}

/**
 * Create a default empty JSON Schema for objects
 */
export function createEmptyObjectSchema(): JsonSchema {
  return {
    type: 'object',
    properties: {},
    additionalProperties: true,
  };
}

/**
 * Transform database action to API response format
 */
export function toActionResponse(action: {
  id: string;
  integrationId: string;
  name: string;
  slug: string;
  description: string | null;
  httpMethod: string;
  endpointTemplate: string;
  inputSchema: unknown;
  outputSchema: unknown;
  paginationConfig: unknown;
  validationConfig: unknown;
  retryConfig: unknown;
  cacheable: boolean;
  cacheTtlSeconds: number | null;
  tags: string[];
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
}): ActionResponse {
  return {
    id: action.id,
    integrationId: action.integrationId,
    name: action.name,
    slug: action.slug,
    description: action.description ?? undefined,
    httpMethod: action.httpMethod as HttpMethod,
    endpointTemplate: action.endpointTemplate,
    inputSchema: (action.inputSchema ?? createEmptyObjectSchema()) as JsonSchema,
    outputSchema: (action.outputSchema ?? createEmptyObjectSchema()) as JsonSchema,
    paginationConfig: action.paginationConfig as PaginationConfig | null,
    validationConfig: action.validationConfig as z.infer<typeof ValidationConfigSchema> | null,
    retryConfig: action.retryConfig as ActionRetryConfig | null,
    cacheable: action.cacheable,
    cacheTtlSeconds: action.cacheTtlSeconds,
    tags: action.tags ?? [],
    metadata: (action.metadata ?? {}) as ActionMetadata,
    createdAt: action.createdAt.toISOString(),
    updatedAt: action.updatedAt.toISOString(),
  };
}
