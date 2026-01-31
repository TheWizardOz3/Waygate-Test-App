/**
 * Runtime Context Builder
 *
 * Builds the built-in runtime context for variable resolution.
 * Provides system-generated values for current_user, connection, and request namespaces.
 */

import { randomUUID } from 'crypto';
import type {
  RuntimeContext,
  CurrentUserContext,
  ConnectionContext,
  RequestContext,
} from './types';

// =============================================================================
// Types
// =============================================================================

/**
 * Input for building current user context
 */
export interface CurrentUserInput {
  id?: string | null;
  email?: string | null;
  name?: string | null;
}

/**
 * Input for building connection context
 */
export interface ConnectionInput {
  id: string;
  name: string;
  workspaceId?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Input for building request context
 */
export interface RequestInput {
  id?: string;
  timestamp?: string;
  environment?: string;
}

/**
 * Full input for building runtime context
 */
export interface RuntimeContextInput {
  currentUser?: CurrentUserInput | null;
  connection?: ConnectionInput | null;
  request?: RequestInput;
}

// =============================================================================
// Context Builders
// =============================================================================

/**
 * Builds the current_user context from input
 * Returns null values for missing fields
 */
export function buildCurrentUserContext(input?: CurrentUserInput | null): CurrentUserContext {
  return {
    id: input?.id ?? null,
    email: input?.email ?? null,
    name: input?.name ?? null,
  };
}

/**
 * Builds the connection context from a connection record
 */
export function buildConnectionContext(input?: ConnectionInput | null): ConnectionContext {
  if (!input) {
    return {
      id: '',
      name: '',
      workspaceId: null,
    };
  }

  // Try to extract workspaceId from connection metadata if not directly provided
  let workspaceId = input.workspaceId ?? null;
  if (!workspaceId && input.metadata) {
    // Common metadata keys that might contain workspace/team ID
    workspaceId =
      (input.metadata['workspaceId'] as string) ??
      (input.metadata['workspace_id'] as string) ??
      (input.metadata['teamId'] as string) ??
      (input.metadata['team_id'] as string) ??
      null;
  }

  return {
    id: input.id,
    name: input.name,
    workspaceId,
  };
}

/**
 * Builds the request context with system-generated values
 */
export function buildRequestContext(input?: RequestInput): RequestContext {
  return {
    id: input?.id ?? randomUUID(),
    timestamp: input?.timestamp ?? new Date().toISOString(),
    environment: input?.environment ?? getEnvironment(),
  };
}

/**
 * Builds the full runtime context from inputs
 *
 * @example
 * ```ts
 * const context = buildRuntimeContext({
 *   currentUser: { id: 'user_123', name: 'John Doe' },
 *   connection: { id: 'conn_456', name: 'Production Slack' },
 * });
 * // context.current_user.id === 'user_123'
 * // context.request.id === '<generated uuid>'
 * ```
 */
export function buildRuntimeContext(input?: RuntimeContextInput): RuntimeContext {
  return {
    current_user: buildCurrentUserContext(input?.currentUser),
    connection: buildConnectionContext(input?.connection),
    request: buildRequestContext(input?.request),
  };
}

// =============================================================================
// Context Extraction
// =============================================================================

/**
 * Extracts a value from the runtime context by path
 *
 * @param context - The runtime context
 * @param namespace - The namespace (current_user, connection, request)
 * @param key - The key within the namespace
 * @returns The value at the path, or undefined if not found
 *
 * @example
 * ```ts
 * getContextValue(context, 'current_user', 'id')  // Returns user ID
 * getContextValue(context, 'connection', 'name')  // Returns connection name
 * getContextValue(context, 'request', 'timestamp') // Returns ISO timestamp
 * ```
 */
export function getContextValue(context: RuntimeContext, namespace: string, key: string): unknown {
  switch (namespace) {
    case 'current_user': {
      const userContext = context.current_user;
      if (key === 'id') return userContext.id;
      if (key === 'email') return userContext.email;
      if (key === 'name') return userContext.name;
      return undefined;
    }

    case 'connection': {
      const connContext = context.connection;
      if (key === 'id') return connContext.id;
      if (key === 'name') return connContext.name;
      if (key === 'workspaceId') return connContext.workspaceId;
      return undefined;
    }

    case 'request': {
      const reqContext = context.request;
      if (key === 'id') return reqContext.id;
      if (key === 'timestamp') return reqContext.timestamp;
      if (key === 'environment') return reqContext.environment;
      return undefined;
    }

    default:
      return undefined;
  }
}

/**
 * Flattens runtime context into a key-value map for resolution
 *
 * @param context - The runtime context
 * @returns Map with paths as keys (e.g., "current_user.id" -> "user_123")
 */
export function flattenRuntimeContext(context: RuntimeContext): Record<string, unknown> {
  return {
    'current_user.id': context.current_user.id,
    'current_user.email': context.current_user.email,
    'current_user.name': context.current_user.name,
    'connection.id': context.connection.id,
    'connection.name': context.connection.name,
    'connection.workspaceId': context.connection.workspaceId,
    'request.id': context.request.id,
    'request.timestamp': context.request.timestamp,
    'request.environment': context.request.environment,
  };
}

/**
 * Lists all available runtime context paths
 */
export function getRuntimeContextPaths(): string[] {
  return [
    'current_user.id',
    'current_user.email',
    'current_user.name',
    'connection.id',
    'connection.name',
    'connection.workspaceId',
    'request.id',
    'request.timestamp',
    'request.environment',
  ];
}

/**
 * Validates that all required runtime context fields are present
 */
export function validateRuntimeContext(context: RuntimeContext): {
  valid: boolean;
  missing: string[];
} {
  const missing: string[] = [];

  // Request context should always be populated
  if (!context.request.id) missing.push('request.id');
  if (!context.request.timestamp) missing.push('request.timestamp');
  if (!context.request.environment) missing.push('request.environment');

  return {
    valid: missing.length === 0,
    missing,
  };
}

// =============================================================================
// Environment Detection
// =============================================================================

/**
 * Determines the current environment from environment variables
 */
export function getEnvironment(): string {
  return (
    process.env.WAYGATE_ENVIRONMENT ??
    process.env.NODE_ENV ??
    process.env.ENVIRONMENT ??
    'development'
  );
}

/**
 * Checks if the current environment matches the given value
 */
export function isEnvironment(env: string): boolean {
  return getEnvironment() === env;
}

/**
 * Standard environment values
 */
export const ENVIRONMENTS = {
  DEVELOPMENT: 'development',
  STAGING: 'staging',
  PRODUCTION: 'production',
} as const;
