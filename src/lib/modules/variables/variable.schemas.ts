/**
 * Variable Schemas
 *
 * Zod schemas for variable validation, CRUD operations, and API responses.
 */

import { z } from 'zod';

// =============================================================================
// Enums
// =============================================================================

/**
 * Variable value types
 */
export const VariableTypeSchema = z.enum(['string', 'number', 'boolean', 'json']);
export type VariableTypeValue = z.infer<typeof VariableTypeSchema>;

/**
 * Valid environment values
 */
export const EnvironmentSchema = z.enum(['development', 'staging', 'production']);
export type Environment = z.infer<typeof EnvironmentSchema>;

/**
 * Variable scope (tenant-level or connection-level)
 */
export const VariableScopeSchema = z.enum(['tenant', 'connection']);
export type VariableScope = z.infer<typeof VariableScopeSchema>;

// =============================================================================
// Variable Key Validation
// =============================================================================

/**
 * Reserved variable namespaces (cannot be used as variable keys)
 */
export const RESERVED_NAMESPACES = ['current_user', 'connection', 'request', 'var'] as const;

/**
 * Variable key format: alphanumeric, underscores, starting with letter
 */
export const VariableKeySchema = z
  .string()
  .min(1, 'Variable key is required')
  .max(100, 'Variable key must be 100 characters or less')
  .regex(
    /^[a-zA-Z][a-zA-Z0-9_]*$/,
    'Variable key must start with a letter and contain only letters, numbers, and underscores'
  )
  .refine(
    (key) => !RESERVED_NAMESPACES.includes(key as (typeof RESERVED_NAMESPACES)[number]),
    'Variable key cannot use reserved names: current_user, connection, request, var'
  );

// =============================================================================
// Variable Value Validation
// =============================================================================

/**
 * Validates variable value matches the declared type
 */
export const VariableValueSchema = z
  .unknown()
  .refine((val) => val !== undefined, 'Variable value is required');

/**
 * Type-specific value validators
 */
export const StringValueSchema = z.string();
export const NumberValueSchema = z.number();
export const BooleanValueSchema = z.boolean();
export const JsonValueSchema = z.record(z.string(), z.unknown());

/**
 * Validates that value matches the declared valueType
 */
export function validateValueMatchesType(value: unknown, valueType: VariableTypeValue): boolean {
  switch (valueType) {
    case 'string':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number' && !isNaN(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'json':
      return typeof value === 'object' && value !== null && !Array.isArray(value);
    default:
      return false;
  }
}

// =============================================================================
// CRUD Schemas
// =============================================================================

/**
 * Input for creating a variable
 */
export const CreateVariableInputSchema = z
  .object({
    key: VariableKeySchema,
    value: VariableValueSchema,
    valueType: VariableTypeSchema,
    connectionId: z.string().uuid().optional().nullable(),
    sensitive: z.boolean().optional().default(false),
    environment: EnvironmentSchema.optional().nullable(),
    description: z.string().max(500).optional().nullable(),
  })
  .refine((data) => validateValueMatchesType(data.value, data.valueType), {
    message: 'Variable value does not match the declared valueType',
    path: ['value'],
  });

export type CreateVariableInput = z.infer<typeof CreateVariableInputSchema>;

/**
 * Input for updating a variable
 */
export const UpdateVariableInputSchema = z
  .object({
    value: VariableValueSchema.optional(),
    valueType: VariableTypeSchema.optional(),
    sensitive: z.boolean().optional(),
    environment: EnvironmentSchema.optional().nullable(),
    description: z.string().max(500).optional().nullable(),
  })
  .refine(
    (data) => {
      // If both value and valueType are provided, validate they match
      if (data.value !== undefined && data.valueType !== undefined) {
        return validateValueMatchesType(data.value, data.valueType);
      }
      return true;
    },
    {
      message: 'Variable value does not match the declared valueType',
      path: ['value'],
    }
  );

export type UpdateVariableInput = z.infer<typeof UpdateVariableInputSchema>;

// =============================================================================
// Query Schemas
// =============================================================================

/**
 * Filters for querying variables
 */
export const VariableFiltersSchema = z.object({
  connectionId: z.string().uuid().optional().nullable(),
  environment: EnvironmentSchema.optional().nullable(),
  sensitive: z.boolean().optional(),
  search: z.string().optional(),
});

export type VariableFilters = z.infer<typeof VariableFiltersSchema>;

/**
 * Query parameters for listing variables (API)
 */
export const ListVariablesQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  connectionId: z.string().uuid().optional(),
  environment: EnvironmentSchema.optional(),
  sensitive: z
    .string()
    .optional()
    .transform((val) => (val === 'true' ? true : val === 'false' ? false : undefined)),
  search: z.string().optional(),
});

export type ListVariablesQuery = z.infer<typeof ListVariablesQuerySchema>;

// =============================================================================
// API Response Schemas
// =============================================================================

/**
 * Variable as returned by the API (value masked if sensitive)
 */
export const VariableResponseSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  connectionId: z.string().uuid().nullable(),
  key: z.string(),
  value: z.unknown(),
  valueType: VariableTypeSchema,
  sensitive: z.boolean(),
  environment: EnvironmentSchema.nullable(),
  description: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type VariableResponse = z.infer<typeof VariableResponseSchema>;

/**
 * Paginated list of variables
 */
export const ListVariablesResponseSchema = z.object({
  data: z.array(VariableResponseSchema),
  pagination: z.object({
    cursor: z.string().nullable(),
    hasMore: z.boolean(),
    totalCount: z.number().int(),
  }),
});

export type ListVariablesResponse = z.infer<typeof ListVariablesResponseSchema>;

// =============================================================================
// Runtime Context Schemas
// =============================================================================

/**
 * Current user context provided at runtime
 */
export const CurrentUserContextSchema = z.object({
  id: z.string().nullable().optional(),
  email: z.string().email().nullable().optional(),
  name: z.string().nullable().optional(),
});

export type CurrentUserContextInput = z.infer<typeof CurrentUserContextSchema>;

/**
 * Variables passed with tool invocation
 */
export const InvokeVariablesSchema = z
  .object({
    current_user: CurrentUserContextSchema.optional(),
  })
  .catchall(z.unknown());

export type InvokeVariables = z.infer<typeof InvokeVariablesSchema>;

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Masks sensitive value for display/logging
 */
export const REDACTED_VALUE = '[REDACTED]';

/**
 * Converts a database Variable to API response format
 * Masks sensitive values
 */
export function toVariableResponse(data: {
  id: string;
  tenantId: string;
  connectionId: string | null;
  key: string;
  value: unknown;
  valueType: string;
  sensitive: boolean;
  environment: string | null;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
}): VariableResponse {
  return {
    id: data.id,
    tenantId: data.tenantId,
    connectionId: data.connectionId,
    key: data.key,
    // Mask sensitive values in responses
    value: data.sensitive ? REDACTED_VALUE : data.value,
    valueType: data.valueType as VariableTypeValue,
    sensitive: data.sensitive,
    environment: data.environment as Environment | null,
    description: data.description,
    createdAt: data.createdAt.toISOString(),
    updatedAt: data.updatedAt.toISOString(),
  };
}

/**
 * Converts a list of database variables to paginated API response
 */
export function toListVariablesResponse(
  data: Array<Parameters<typeof toVariableResponse>[0]>,
  nextCursor: string | null,
  totalCount: number
): ListVariablesResponse {
  return {
    data: data.map(toVariableResponse),
    pagination: {
      cursor: nextCursor,
      hasMore: nextCursor !== null,
      totalCount,
    },
  };
}

// =============================================================================
// Error Codes
// =============================================================================

export const VariableErrorCodes = {
  VARIABLE_NOT_FOUND: 'VARIABLE_NOT_FOUND',
  VARIABLE_KEY_EXISTS: 'VARIABLE_KEY_EXISTS',
  INVALID_VARIABLE_VALUE: 'INVALID_VARIABLE_VALUE',
  INVALID_VARIABLE_KEY: 'INVALID_VARIABLE_KEY',
  RESERVED_VARIABLE_KEY: 'RESERVED_VARIABLE_KEY',
  CONNECTION_NOT_FOUND: 'CONNECTION_NOT_FOUND',
  MAX_VARIABLES_EXCEEDED: 'MAX_VARIABLES_EXCEEDED',
  ENCRYPTION_FAILED: 'ENCRYPTION_FAILED',
  DECRYPTION_FAILED: 'DECRYPTION_FAILED',
} as const;

export type VariableErrorCode = (typeof VariableErrorCodes)[keyof typeof VariableErrorCodes];

// =============================================================================
// Constants
// =============================================================================

/**
 * Maximum number of variables allowed per tenant/connection
 */
export const MAX_VARIABLES_PER_SCOPE = 100;

/**
 * Maximum size for JSON variable values (in bytes)
 */
export const MAX_JSON_VALUE_SIZE = 100 * 1024; // 100KB
