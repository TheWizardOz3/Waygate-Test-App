/**
 * Variable Module Types
 *
 * TypeScript types for the Variable Context System.
 * Defines interfaces for variables, runtime context, and resolution.
 */

import type { VariableType } from '@prisma/client';

// =============================================================================
// Variable Types
// =============================================================================

/**
 * Variable definition as stored in database
 */
export interface Variable {
  id: string;
  tenantId: string;
  connectionId: string | null;
  key: string;
  value: unknown;
  valueType: VariableType;
  sensitive: boolean;
  encryptedValue: Uint8Array | null;
  environment: string | null;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Variable value types (matches VariableType enum in Prisma)
 */
export type VariableValueType = 'string' | 'number' | 'boolean' | 'json';

/**
 * Valid environment values
 */
export type VariableEnvironment = 'development' | 'staging' | 'production' | null;

// =============================================================================
// Runtime Context Types
// =============================================================================

/**
 * Current user context (provided at runtime)
 */
export interface CurrentUserContext {
  id: string | null;
  email: string | null;
  name: string | null;
}

/**
 * Connection context (from connection metadata)
 */
export interface ConnectionContext {
  id: string;
  name: string;
  workspaceId: string | null;
}

/**
 * Request context (system-generated)
 */
export interface RequestContext {
  id: string;
  timestamp: string;
  environment: string;
}

/**
 * Built-in runtime context (system-provided variables)
 */
export interface RuntimeContext {
  current_user: CurrentUserContext;
  connection: ConnectionContext;
  request: RequestContext;
}

// =============================================================================
// Variable Resolution Types
// =============================================================================

/**
 * A parsed variable reference from a template string
 */
export interface ParsedVariableReference {
  /** Full match including ${...} */
  fullMatch: string;
  /** The variable path (e.g., "var.api_version", "current_user.id") */
  path: string;
  /** The namespace (e.g., "var", "current_user", "connection", "request") */
  namespace: string;
  /** The key within the namespace (e.g., "api_version", "id") */
  key: string;
  /** Start index in the template string */
  startIndex: number;
  /** End index in the template string */
  endIndex: number;
}

/**
 * Result of resolving a single variable reference
 */
export interface ResolvedVariable {
  /** The original reference */
  reference: ParsedVariableReference;
  /** The resolved value */
  value: unknown;
  /** Source of the resolved value */
  source:
    | 'request_context'
    | 'connection_variable'
    | 'tenant_variable'
    | 'runtime'
    | 'default'
    | 'not_found';
  /** Whether the variable was found */
  found: boolean;
  /** Whether the value is sensitive (should be masked in logs) */
  sensitive: boolean;
}

/**
 * Options for variable resolution
 */
export interface VariableResolutionOptions {
  /** Tenant ID for variable lookup */
  tenantId: string;
  /** Connection ID for connection-level variables (optional) */
  connectionId?: string | null;
  /** Current environment (development, staging, production) */
  environment?: string;
  /** Runtime context (current_user, connection, request) */
  runtimeContext?: Partial<RuntimeContext>;
  /** Request-level variable overrides (highest priority) */
  requestVariables?: Record<string, unknown>;
  /** Whether to throw on missing required variables */
  throwOnMissing?: boolean;
  /** Default value to use when variable is not found */
  defaultValue?: unknown;
}

/**
 * Result of resolving all variables in a template
 */
export interface VariableResolutionResult {
  /** The resolved template string */
  resolved: string;
  /** All resolved variable references */
  variables: ResolvedVariable[];
  /** Whether all variables were found */
  allFound: boolean;
  /** List of missing variable references */
  missing: ParsedVariableReference[];
}

// =============================================================================
// Stored Variable Maps
// =============================================================================

/**
 * Map of variable keys to their values for quick lookup
 */
export interface VariableMap {
  [key: string]: {
    value: unknown;
    valueType: VariableType;
    sensitive: boolean;
  };
}

/**
 * Variables organized by scope for resolution
 */
export interface ScopedVariables {
  tenant: VariableMap;
  connection: VariableMap;
}
