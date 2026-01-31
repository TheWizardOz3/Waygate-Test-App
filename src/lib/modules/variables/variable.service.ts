/**
 * Variable Service
 *
 * Business logic layer for variable management.
 * Handles tenant-level and connection-level variable CRUD operations.
 *
 * Sensitive Variable Handling:
 * - When `sensitive=true`, values are encrypted using AES-256-GCM
 * - Encrypted data is stored in `encryptedValue` field
 * - The `value` field stores a placeholder (null) for sensitive vars
 * - API responses mask sensitive values as [REDACTED]
 * - Decryption only happens during variable resolution (runtime)
 */

import { VariableType, Prisma } from '@prisma/client';

import {
  createVariable,
  findVariableByIdAndTenant,
  findByTenantId,
  updateVariable as updateVariableDb,
  deleteVariableByIdAndTenant,
  variableKeyExists,
  countByTenantId,
  type CreateVariableDbInput,
  type UpdateVariableDbInput,
  type PaginationOptions,
} from './variable.repository';
import {
  CreateVariableInputSchema,
  UpdateVariableInputSchema,
  ListVariablesQuerySchema,
  VariableErrorCodes,
  MAX_VARIABLES_PER_SCOPE,
  toVariableResponse,
  toListVariablesResponse,
  type CreateVariableInput,
  type UpdateVariableInput,
  type ListVariablesQuery,
  type VariableResponse,
  type ListVariablesResponse,
} from './variable.schemas';
import { invalidateVariableCache } from './variable.cache';
import { findConnectionByIdAndTenant } from '../connections';
import {
  encryptVariableValue,
  VariableEncryptionError,
  SENSITIVE_VALUE_PLACEHOLDER,
} from './variable.encryption';

// =============================================================================
// Error Classes
// =============================================================================

/**
 * Custom error class for variable operations
 */
export class VariableError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number = 400
  ) {
    super(message);
    this.name = 'VariableError';
  }
}

// =============================================================================
// List Variables
// =============================================================================

/**
 * Lists variables for a tenant with optional filtering and pagination
 */
export async function listVariables(
  tenantId: string,
  query: Partial<ListVariablesQuery> = {}
): Promise<ListVariablesResponse> {
  const validated = ListVariablesQuerySchema.parse(query);

  const pagination: PaginationOptions = {
    cursor: validated.cursor,
    limit: validated.limit,
  };

  const filters = {
    connectionId: validated.connectionId ?? null,
    environment: validated.environment ?? null,
    sensitive: validated.sensitive,
    search: validated.search,
  };

  const result = await findByTenantId(tenantId, pagination, filters);

  return toListVariablesResponse(result.data, result.nextCursor, result.totalCount);
}

/**
 * Lists tenant-level variables only (connectionId = null)
 */
export async function listTenantVariables(
  tenantId: string,
  query: Partial<ListVariablesQuery> = {}
): Promise<ListVariablesResponse> {
  return listVariables(tenantId, { ...query, connectionId: undefined });
}

/**
 * Lists connection-level variables
 */
export async function listConnectionVariables(
  tenantId: string,
  connectionId: string,
  query: Partial<ListVariablesQuery> = {}
): Promise<ListVariablesResponse> {
  // Verify connection belongs to tenant
  const connection = await findConnectionByIdAndTenant(connectionId, tenantId);
  if (!connection) {
    throw new VariableError(VariableErrorCodes.CONNECTION_NOT_FOUND, 'Connection not found', 404);
  }

  return listVariables(tenantId, { ...query, connectionId });
}

// =============================================================================
// Get Variable
// =============================================================================

/**
 * Gets a single variable by ID
 */
export async function getVariableById(
  tenantId: string,
  variableId: string
): Promise<VariableResponse> {
  const variable = await findVariableByIdAndTenant(variableId, tenantId);

  if (!variable) {
    throw new VariableError(VariableErrorCodes.VARIABLE_NOT_FOUND, 'Variable not found', 404);
  }

  return toVariableResponse(variable);
}

// =============================================================================
// Create Variable
// =============================================================================

/**
 * Creates a tenant-level variable
 */
export async function createTenantVariable(
  tenantId: string,
  input: CreateVariableInput
): Promise<VariableResponse> {
  // Validate input
  const validated = CreateVariableInputSchema.parse(input);

  // Check max variables limit for tenant-level
  const count = await countByTenantId(tenantId, { connectionId: null });
  if (count >= MAX_VARIABLES_PER_SCOPE) {
    throw new VariableError(
      VariableErrorCodes.MAX_VARIABLES_EXCEEDED,
      `Maximum ${MAX_VARIABLES_PER_SCOPE} tenant-level variables allowed`,
      400
    );
  }

  // Check for duplicate key
  const exists = await variableKeyExists({
    tenantId,
    connectionId: null,
    key: validated.key,
    environment: validated.environment ?? null,
  });

  if (exists) {
    throw new VariableError(
      VariableErrorCodes.VARIABLE_KEY_EXISTS,
      `Variable with key '${validated.key}' already exists for this scope and environment`,
      409
    );
  }

  // Create the variable
  const dbInput: CreateVariableDbInput = {
    tenantId,
    connectionId: null,
    key: validated.key,
    value: validated.value as Prisma.InputJsonValue,
    valueType: validated.valueType as VariableType,
    sensitive: validated.sensitive,
    environment: validated.environment ?? null,
    description: validated.description ?? null,
  };

  // Handle encryption for sensitive variables
  if (validated.sensitive) {
    try {
      const encryptedBuffer = encryptVariableValue(validated.value);
      dbInput.encryptedValue = encryptedBuffer;
      // Store placeholder in value field (real value is in encryptedValue)
      dbInput.value = SENSITIVE_VALUE_PLACEHOLDER;
    } catch (error) {
      if (error instanceof VariableEncryptionError) {
        throw new VariableError(
          VariableErrorCodes.ENCRYPTION_FAILED,
          'Failed to encrypt sensitive variable value',
          500
        );
      }
      throw error;
    }
  }

  const variable = await createVariable(dbInput);

  // Invalidate cache
  invalidateVariableCache({ tenantId });

  return toVariableResponse(variable);
}

/**
 * Creates a connection-level variable
 */
export async function createConnectionVariable(
  tenantId: string,
  connectionId: string,
  input: CreateVariableInput
): Promise<VariableResponse> {
  // Verify connection belongs to tenant
  const connection = await findConnectionByIdAndTenant(connectionId, tenantId);
  if (!connection) {
    throw new VariableError(VariableErrorCodes.CONNECTION_NOT_FOUND, 'Connection not found', 404);
  }

  // Validate input
  const validated = CreateVariableInputSchema.parse(input);

  // Check max variables limit for connection-level
  const count = await countByTenantId(tenantId, { connectionId });
  if (count >= MAX_VARIABLES_PER_SCOPE) {
    throw new VariableError(
      VariableErrorCodes.MAX_VARIABLES_EXCEEDED,
      `Maximum ${MAX_VARIABLES_PER_SCOPE} connection-level variables allowed`,
      400
    );
  }

  // Check for duplicate key
  const exists = await variableKeyExists({
    tenantId,
    connectionId,
    key: validated.key,
    environment: validated.environment ?? null,
  });

  if (exists) {
    throw new VariableError(
      VariableErrorCodes.VARIABLE_KEY_EXISTS,
      `Variable with key '${validated.key}' already exists for this connection and environment`,
      409
    );
  }

  // Create the variable
  const dbInput: CreateVariableDbInput = {
    tenantId,
    connectionId,
    key: validated.key,
    value: validated.value as Prisma.InputJsonValue,
    valueType: validated.valueType as VariableType,
    sensitive: validated.sensitive,
    environment: validated.environment ?? null,
    description: validated.description ?? null,
  };

  // Handle encryption for sensitive variables
  if (validated.sensitive) {
    try {
      const encryptedBuffer = encryptVariableValue(validated.value);
      dbInput.encryptedValue = encryptedBuffer;
      // Store placeholder in value field (real value is in encryptedValue)
      dbInput.value = SENSITIVE_VALUE_PLACEHOLDER;
    } catch (error) {
      if (error instanceof VariableEncryptionError) {
        throw new VariableError(
          VariableErrorCodes.ENCRYPTION_FAILED,
          'Failed to encrypt sensitive variable value',
          500
        );
      }
      throw error;
    }
  }

  const variable = await createVariable(dbInput);

  // Invalidate cache
  invalidateVariableCache({ tenantId, connectionId });

  return toVariableResponse(variable);
}

// =============================================================================
// Update Variable
// =============================================================================

/**
 * Updates an existing variable
 */
export async function updateVariableById(
  tenantId: string,
  variableId: string,
  input: UpdateVariableInput
): Promise<VariableResponse> {
  // Verify variable exists and belongs to tenant
  const existing = await findVariableByIdAndTenant(variableId, tenantId);
  if (!existing) {
    throw new VariableError(VariableErrorCodes.VARIABLE_NOT_FOUND, 'Variable not found', 404);
  }

  // Validate input
  const validated = UpdateVariableInputSchema.parse(input);

  // If changing value without changing type, validate against existing type
  if (validated.value !== undefined && validated.valueType === undefined) {
    const { validateValueMatchesType } = await import('./variable.schemas');
    if (!validateValueMatchesType(validated.value, existing.valueType)) {
      throw new VariableError(
        VariableErrorCodes.INVALID_VARIABLE_VALUE,
        `Value does not match existing type '${existing.valueType}'`,
        400
      );
    }
  }

  // Build update input
  const dbInput: UpdateVariableDbInput = {};

  // Determine the new sensitive state
  const willBeSensitive = validated.sensitive ?? existing.sensitive;
  const wasSensitive = existing.sensitive;
  const hasNewValue = validated.value !== undefined;

  // Handle encryption scenarios
  try {
    if (willBeSensitive && hasNewValue) {
      // Case 1: Sensitive with new value - encrypt the new value
      const encryptedBuffer = encryptVariableValue(validated.value);
      dbInput.encryptedValue = encryptedBuffer;
      dbInput.value = SENSITIVE_VALUE_PLACEHOLDER;
    } else if (willBeSensitive && !wasSensitive) {
      // Case 2: Transitioning TO sensitive without new value - encrypt existing value
      const encryptedBuffer = encryptVariableValue(existing.value);
      dbInput.encryptedValue = encryptedBuffer;
      dbInput.value = SENSITIVE_VALUE_PLACEHOLDER;
    } else if (!willBeSensitive && wasSensitive && hasNewValue) {
      // Case 3: Transitioning FROM sensitive with new value - store new value unencrypted
      dbInput.value = validated.value as Prisma.InputJsonValue;
      dbInput.encryptedValue = null;
    } else if (!willBeSensitive && wasSensitive && !hasNewValue) {
      // Case 4: Transitioning FROM sensitive without new value
      // Need to decrypt and store the existing value
      if (existing.encryptedValue) {
        const { decryptVariableValue } = await import('./variable.encryption');
        const decryptedValue = decryptVariableValue(existing.encryptedValue);
        dbInput.value = decryptedValue as Prisma.InputJsonValue;
      }
      dbInput.encryptedValue = null;
    } else if (!willBeSensitive && hasNewValue) {
      // Case 5: Not sensitive with new value - just update the value
      dbInput.value = validated.value as Prisma.InputJsonValue;
    }
    // Case 6: Sensitive with no new value and already sensitive - keep existing encryptedValue
  } catch (error) {
    if (error instanceof VariableEncryptionError) {
      throw new VariableError(
        VariableErrorCodes.ENCRYPTION_FAILED,
        'Failed to encrypt/decrypt sensitive variable value',
        500
      );
    }
    throw error;
  }

  if (validated.valueType !== undefined) {
    dbInput.valueType = validated.valueType as VariableType;
  }

  if (validated.sensitive !== undefined) {
    dbInput.sensitive = validated.sensitive;
  }

  if (validated.environment !== undefined) {
    dbInput.environment = validated.environment;
  }

  if (validated.description !== undefined) {
    dbInput.description = validated.description;
  }

  const variable = await updateVariableDb(variableId, dbInput);

  // Invalidate cache
  invalidateVariableCache({ tenantId, connectionId: existing.connectionId });

  return toVariableResponse(variable);
}

// =============================================================================
// Delete Variable
// =============================================================================

/**
 * Deletes a variable by ID
 */
export async function deleteVariableById(tenantId: string, variableId: string): Promise<void> {
  const variable = await deleteVariableByIdAndTenant(variableId, tenantId);

  if (!variable) {
    throw new VariableError(VariableErrorCodes.VARIABLE_NOT_FOUND, 'Variable not found', 404);
  }

  // Invalidate cache
  invalidateVariableCache({ tenantId, connectionId: variable.connectionId });
}
