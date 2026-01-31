/**
 * Variable Repository
 *
 * Data access layer for the Variable model.
 * Handles CRUD operations for tenant-level and connection-level variables.
 *
 * Sensitive Variable Handling:
 * - When storing, sensitive values are encrypted by the service layer
 * - When reading for resolution, this repository decrypts encrypted values
 * - The `value` field contains a placeholder for sensitive vars; real value is in `encryptedValue`
 */

import { prisma } from '@/lib/db/client';
import { VariableType, Prisma } from '@prisma/client';

import type { Variable } from '@prisma/client';
import type { VariableMap, ScopedVariables } from './types';
import { decryptVariableValue, VariableEncryptionError } from './variable.encryption';

// =============================================================================
// Types
// =============================================================================

/**
 * Input for creating a variable (repository layer)
 */
export interface CreateVariableDbInput {
  tenantId: string;
  connectionId?: string | null;
  key: string;
  value: Prisma.InputJsonValue;
  valueType: VariableType;
  sensitive?: boolean;
  encryptedValue?: Buffer | Uint8Array | null;
  environment?: string | null;
  description?: string | null;
}

/**
 * Input for updating a variable (repository layer)
 */
export interface UpdateVariableDbInput {
  value?: Prisma.InputJsonValue;
  valueType?: VariableType;
  sensitive?: boolean;
  encryptedValue?: Buffer | Uint8Array | null;
  environment?: string | null;
  description?: string | null;
}

/**
 * Filters for variable queries
 */
export interface VariableFilters {
  connectionId?: string | null;
  environment?: string | null;
  sensitive?: boolean;
  search?: string;
}

/**
 * Pagination options for queries
 */
export interface PaginationOptions {
  cursor?: string;
  limit?: number;
}

/**
 * Paginated result for variables
 */
export interface PaginatedVariables {
  data: Variable[];
  nextCursor: string | null;
  totalCount: number;
}

// =============================================================================
// Create Operations
// =============================================================================

/**
 * Creates a new variable
 */
export async function createVariable(input: CreateVariableDbInput): Promise<Variable> {
  return prisma.variable.create({
    data: {
      tenantId: input.tenantId,
      connectionId: input.connectionId ?? null,
      key: input.key,
      value: input.value,
      valueType: input.valueType,
      sensitive: input.sensitive ?? false,
      encryptedValue: input.encryptedValue ? new Uint8Array(input.encryptedValue) : null,
      environment: input.environment ?? null,
      description: input.description ?? null,
    },
  });
}

/**
 * Creates multiple variables in a transaction
 */
export async function createManyVariables(
  inputs: CreateVariableDbInput[]
): Promise<{ count: number }> {
  return prisma.variable.createMany({
    data: inputs.map((input) => ({
      tenantId: input.tenantId,
      connectionId: input.connectionId ?? null,
      key: input.key,
      value: input.value,
      valueType: input.valueType,
      sensitive: input.sensitive ?? false,
      encryptedValue: input.encryptedValue ? new Uint8Array(input.encryptedValue) : null,
      environment: input.environment ?? null,
      description: input.description ?? null,
    })),
    skipDuplicates: true,
  });
}

// =============================================================================
// Read Operations
// =============================================================================

/**
 * Finds a variable by ID
 */
export async function findVariableById(id: string): Promise<Variable | null> {
  return prisma.variable.findUnique({
    where: { id },
  });
}

/**
 * Finds a variable by ID with tenant verification
 */
export async function findVariableByIdAndTenant(
  id: string,
  tenantId: string
): Promise<Variable | null> {
  return prisma.variable.findFirst({
    where: { id, tenantId },
  });
}

/**
 * Finds a variable by unique composite key
 */
export async function findVariableByKey(params: {
  tenantId: string;
  connectionId: string | null;
  key: string;
  environment: string | null;
}): Promise<Variable | null> {
  return prisma.variable.findFirst({
    where: {
      tenantId: params.tenantId,
      connectionId: params.connectionId,
      key: params.key,
      environment: params.environment,
    },
  });
}

/**
 * Finds all tenant-level variables (connectionId = null)
 */
export async function findTenantVariables(
  tenantId: string,
  environment?: string | null
): Promise<Variable[]> {
  const where: Prisma.VariableWhereInput = {
    tenantId,
    connectionId: null,
  };

  // Include variables for all environments (null) or the specific environment
  if (environment !== undefined) {
    where.OR = [{ environment: null }, { environment }];
  }

  return prisma.variable.findMany({
    where,
    orderBy: { key: 'asc' },
  });
}

/**
 * Finds all connection-level variables
 */
export async function findConnectionVariables(
  connectionId: string,
  environment?: string | null
): Promise<Variable[]> {
  const where: Prisma.VariableWhereInput = {
    connectionId,
  };

  // Include variables for all environments (null) or the specific environment
  if (environment !== undefined) {
    where.OR = [{ environment: null }, { environment }];
  }

  return prisma.variable.findMany({
    where,
    orderBy: { key: 'asc' },
  });
}

/**
 * Finds variables for a tenant with filtering and pagination
 */
export async function findByTenantId(
  tenantId: string,
  pagination: PaginationOptions = {},
  filters: VariableFilters = {}
): Promise<PaginatedVariables> {
  const { cursor, limit = 100 } = pagination;

  // Build where clause
  const where: Prisma.VariableWhereInput = { tenantId };

  if (filters.connectionId !== undefined) {
    where.connectionId = filters.connectionId;
  }

  if (filters.environment !== undefined) {
    where.environment = filters.environment;
  }

  if (filters.sensitive !== undefined) {
    where.sensitive = filters.sensitive;
  }

  if (filters.search) {
    where.OR = [
      { key: { contains: filters.search, mode: 'insensitive' } },
      { description: { contains: filters.search, mode: 'insensitive' } },
    ];
  }

  // Get total count
  const totalCount = await prisma.variable.count({ where });

  // Get data with cursor pagination
  const data = await prisma.variable.findMany({
    where,
    take: limit + 1,
    orderBy: [{ connectionId: 'asc' }, { key: 'asc' }],
    ...(cursor && {
      cursor: { id: cursor },
      skip: 1,
    }),
  });

  // Determine if there are more results
  const hasMore = data.length > limit;
  if (hasMore) {
    data.pop();
  }

  const nextCursor = hasMore && data.length > 0 ? data[data.length - 1].id : null;

  return { data, nextCursor, totalCount };
}

/**
 * Gets scoped variables for resolution (tenant + connection)
 * Returns variables organized by scope with environment filtering
 */
export async function getScopedVariables(params: {
  tenantId: string;
  connectionId?: string | null;
  environment?: string;
}): Promise<ScopedVariables> {
  const { tenantId, connectionId, environment } = params;

  // Build environment filter: include null (all envs) and specific environment
  const environmentFilter = environment
    ? { OR: [{ environment: null }, { environment }] }
    : { environment: null };

  // Fetch tenant-level variables
  const tenantVariables = await prisma.variable.findMany({
    where: {
      tenantId,
      connectionId: null,
      ...environmentFilter,
    },
    orderBy: { key: 'asc' },
  });

  // Fetch connection-level variables if connectionId is provided
  let connectionVariables: Variable[] = [];
  if (connectionId) {
    connectionVariables = await prisma.variable.findMany({
      where: {
        tenantId,
        connectionId,
        ...environmentFilter,
      },
      orderBy: { key: 'asc' },
    });
  }

  // Convert to variable maps with decryption for sensitive values
  const toVariableMap = (variables: Variable[]): VariableMap => {
    const map: VariableMap = {};
    for (const v of variables) {
      // If same key exists with different environment, prefer specific env over null
      const existing = map[v.key];
      if (existing && v.environment === null) {
        // Don't overwrite specific environment with null
        continue;
      }

      // Decrypt sensitive variable values
      // Type as unknown since decryptVariableValue returns unknown
      let resolvedValue: unknown = v.value;
      if (v.sensitive && v.encryptedValue) {
        try {
          resolvedValue = decryptVariableValue(v.encryptedValue);
        } catch (error) {
          // Log error but don't fail the entire resolution
          // The value will remain as the placeholder
          console.error(
            `[VARIABLE_REPOSITORY] Failed to decrypt sensitive variable ${v.key}:`,
            error instanceof VariableEncryptionError ? error.message : 'Unknown error'
          );
        }
      }

      map[v.key] = {
        value: resolvedValue,
        valueType: v.valueType,
        sensitive: v.sensitive,
      };
    }
    return map;
  };

  return {
    tenant: toVariableMap(tenantVariables),
    connection: toVariableMap(connectionVariables),
  };
}

/**
 * Checks if a variable key already exists in the given scope
 */
export async function variableKeyExists(params: {
  tenantId: string;
  connectionId: string | null;
  key: string;
  environment: string | null;
  excludeId?: string;
}): Promise<boolean> {
  const where: Prisma.VariableWhereInput = {
    tenantId: params.tenantId,
    connectionId: params.connectionId,
    key: params.key,
    environment: params.environment,
  };

  if (params.excludeId) {
    where.id = { not: params.excludeId };
  }

  const count = await prisma.variable.count({ where });
  return count > 0;
}

// =============================================================================
// Update Operations
// =============================================================================

/**
 * Updates a variable by ID
 */
export async function updateVariable(id: string, input: UpdateVariableDbInput): Promise<Variable> {
  const data: Prisma.VariableUpdateInput = {};

  if (input.value !== undefined) {
    data.value = input.value;
  }

  if (input.valueType !== undefined) {
    data.valueType = input.valueType;
  }

  if (input.sensitive !== undefined) {
    data.sensitive = input.sensitive;
  }

  if (input.encryptedValue !== undefined) {
    data.encryptedValue = input.encryptedValue ? new Uint8Array(input.encryptedValue) : null;
  }

  if (input.environment !== undefined) {
    data.environment = input.environment;
  }

  if (input.description !== undefined) {
    data.description = input.description;
  }

  return prisma.variable.update({
    where: { id },
    data,
  });
}

/**
 * Upserts a variable (creates if not exists, updates if exists)
 */
export async function upsertVariable(input: CreateVariableDbInput): Promise<Variable> {
  const connectionId = input.connectionId ?? null;
  const environment = input.environment ?? null;

  // Find existing record
  const existing = await prisma.variable.findFirst({
    where: {
      tenantId: input.tenantId,
      connectionId,
      key: input.key,
      environment,
    },
    select: { id: true },
  });

  if (existing) {
    return prisma.variable.update({
      where: { id: existing.id },
      data: {
        value: input.value,
        valueType: input.valueType,
        sensitive: input.sensitive ?? false,
        encryptedValue: input.encryptedValue ? new Uint8Array(input.encryptedValue) : null,
        description: input.description ?? null,
      },
    });
  }

  return prisma.variable.create({
    data: {
      tenantId: input.tenantId,
      connectionId,
      key: input.key,
      value: input.value,
      valueType: input.valueType,
      sensitive: input.sensitive ?? false,
      encryptedValue: input.encryptedValue ? new Uint8Array(input.encryptedValue) : null,
      environment,
      description: input.description ?? null,
    },
  });
}

// =============================================================================
// Delete Operations
// =============================================================================

/**
 * Deletes a variable by ID
 */
export async function deleteVariable(id: string): Promise<Variable> {
  return prisma.variable.delete({
    where: { id },
  });
}

/**
 * Deletes a variable by ID with tenant verification
 * Returns the deleted variable or null if not found/not authorized
 */
export async function deleteVariableByIdAndTenant(
  id: string,
  tenantId: string
): Promise<Variable | null> {
  // Verify the variable belongs to the tenant
  const variable = await findVariableByIdAndTenant(id, tenantId);
  if (!variable) {
    return null;
  }

  return prisma.variable.delete({
    where: { id },
  });
}

/**
 * Deletes all variables for a tenant
 */
export async function deleteByTenantId(tenantId: string): Promise<number> {
  const result = await prisma.variable.deleteMany({
    where: { tenantId },
  });
  return result.count;
}

/**
 * Deletes all variables for a connection
 */
export async function deleteByConnectionId(connectionId: string): Promise<number> {
  const result = await prisma.variable.deleteMany({
    where: { connectionId },
  });
  return result.count;
}

// =============================================================================
// Count Operations
// =============================================================================

/**
 * Counts variables for a tenant
 */
export async function countByTenantId(
  tenantId: string,
  filters: VariableFilters = {}
): Promise<number> {
  const where: Prisma.VariableWhereInput = { tenantId };

  if (filters.connectionId !== undefined) {
    where.connectionId = filters.connectionId;
  }

  if (filters.environment !== undefined) {
    where.environment = filters.environment;
  }

  if (filters.sensitive !== undefined) {
    where.sensitive = filters.sensitive;
  }

  return prisma.variable.count({ where });
}

/**
 * Gets variable count per connection for a tenant
 */
export async function getVariableCountsByConnection(
  tenantId: string
): Promise<{ connectionId: string | null; count: number }[]> {
  const result = await prisma.variable.groupBy({
    by: ['connectionId'],
    where: { tenantId },
    _count: true,
  });

  return result.map((r) => ({
    connectionId: r.connectionId,
    count: r._count,
  }));
}
