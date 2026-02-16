/**
 * API Authentication Middleware
 *
 * Validates Waygate API keys and extracts tenant/app context for downstream handlers.
 * Supports two key types:
 * - wg_live_ (tenant key): Full platform access for managing integrations, connections, apps
 * - wg_app_ (app key): Scoped access for invoking actions on behalf of end-users
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import {
  extractApiKey,
  validateApiKey,
  maskApiKey,
  getKeyType,
  computeKeyIndex,
} from '@/lib/modules/auth/api-key';
import { findAppByApiKeyIndex } from '@/lib/modules/apps/app.repository';

import type { Tenant, App } from '@prisma/client';
import type { KeyType } from '@/lib/modules/auth/api-key';

/**
 * Auth context passed to authenticated route handlers.
 *
 * - `tenant` is always present (both key types resolve to a tenant)
 * - `app` is present only when authenticated with a wg_app_ key
 * - `keyType` indicates which key type was used
 */
export interface AuthContext {
  tenant: Tenant;
  app?: App;
  keyType: KeyType;
  apiKeyMasked: string;
}

/**
 * Type for authenticated route handlers
 */
export type AuthenticatedHandler = (
  request: NextRequest,
  context: AuthContext
) => Promise<NextResponse> | NextResponse;

/**
 * Error response for authentication failures
 */
function authErrorResponse(
  code: string,
  message: string,
  status: number,
  suggestedAction?: string,
  suggestedDescription?: string
) {
  return NextResponse.json(
    {
      success: false,
      error: {
        code,
        message,
        suggestedResolution: suggestedAction
          ? {
              action: suggestedAction,
              description: suggestedDescription || '',
              retryable: false,
            }
          : undefined,
      },
    },
    { status }
  );
}

/**
 * Higher-order function that wraps a route handler with API key authentication
 *
 * Validates the Waygate API key from the Authorization header and injects
 * the tenant (and optionally app) context into the handler.
 *
 * Supports both key types:
 * - wg_live_ → tenant context only (keyType: 'tenant')
 * - wg_app_ → tenant + app context (keyType: 'app')
 *
 * @param handler - The route handler to wrap
 * @returns Wrapped handler that validates API key before calling the original
 *
 * @example
 * ```ts
 * // Tenant key usage (existing pattern — fully backward compatible)
 * export const GET = withApiAuth(async (request, { tenant }) => {
 *   const integrations = await getIntegrations(tenant.id);
 *   return NextResponse.json({ data: integrations });
 * });
 *
 * // App key usage
 * export const POST = withApiAuth(async (request, { tenant, app, keyType }) => {
 *   if (keyType !== 'app') return forbiddenResponse();
 *   // app is guaranteed present when keyType === 'app'
 * });
 * ```
 */
export function withApiAuth(handler: AuthenticatedHandler) {
  return async (request: NextRequest): Promise<NextResponse> => {
    const authHeader = request.headers.get('Authorization');
    const apiKey = extractApiKey(authHeader);

    // Missing or invalid format
    if (!apiKey) {
      return authErrorResponse(
        'MISSING_API_KEY',
        'Authorization header is required with a valid Waygate API key',
        401,
        'REFRESH_CREDENTIALS',
        'Include your Waygate API key in the Authorization header: "Bearer wg_live_..." or "Bearer wg_app_..."'
      );
    }

    try {
      const authContext = await resolveAuthContext(apiKey);

      if (!authContext) {
        return authErrorResponse(
          'INVALID_API_KEY',
          'The provided Waygate API key is invalid or has been revoked',
          401,
          'REFRESH_CREDENTIALS',
          'Generate a new API key from the Waygate dashboard'
        );
      }

      // Call the wrapped handler with auth context
      return handler(request, authContext);
    } catch (error) {
      // Log internal errors but don't expose details
      console.error('Auth middleware error:', error);

      return authErrorResponse(
        'AUTH_ERROR',
        'An error occurred during authentication',
        500,
        'ESCALATE_TO_ADMIN',
        'Contact support if this error persists'
      );
    }
  };
}

/**
 * Resolves full auth context from an API key.
 *
 * - wg_app_ keys: O(1) lookup via SHA-256 index → bcrypt verify → { tenant, app, keyType: 'app' }
 * - wg_live_ keys: O(1) via waygateApiKeyIndex if populated, else scan fallback → { tenant, keyType: 'tenant' }
 *
 * @param apiKey - The plaintext API key to resolve
 * @returns AuthContext or null if no match
 */
async function resolveAuthContext(apiKey: string): Promise<AuthContext | null> {
  const keyType = getKeyType(apiKey);
  if (!keyType) return null;

  if (keyType === 'app') {
    return resolveAppKey(apiKey);
  }

  return resolveTenantKey(apiKey);
}

/**
 * Resolves a wg_app_ key to tenant + app context via O(1) index lookup.
 */
async function resolveAppKey(apiKey: string): Promise<AuthContext | null> {
  const index = computeKeyIndex(apiKey);
  const appWithTenant = await findAppByApiKeyIndex(index);

  if (!appWithTenant) return null;

  // Verify the key against the stored bcrypt hash
  const isValid = await validateApiKey(apiKey, appWithTenant.apiKeyHash);
  if (!isValid) return null;

  // Check the app is active
  if (appWithTenant.status !== 'active') return null;

  // Fetch the full tenant record (the repository only selects partial fields)
  const tenant = await prisma.tenant.findUnique({
    where: { id: appWithTenant.tenant.id },
  });
  if (!tenant) return null;

  // Strip the tenant relation from the app to get a clean App object
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { tenant: _rel, ...app } = appWithTenant;

  return {
    tenant,
    app: app as App,
    keyType: 'app',
    apiKeyMasked: maskApiKey(apiKey),
  };
}

/**
 * Resolves a wg_live_ tenant key.
 *
 * Uses O(1) lookup via waygateApiKeyIndex when available,
 * with a scan fallback for tenants that haven't been indexed yet.
 */
async function resolveTenantKey(apiKey: string): Promise<AuthContext | null> {
  // Try O(1) lookup via SHA-256 index first
  const index = computeKeyIndex(apiKey);
  const tenantByIndex = await prisma.tenant.findUnique({
    where: { waygateApiKeyIndex: index },
  });

  if (tenantByIndex) {
    const isValid = await validateApiKey(apiKey, tenantByIndex.waygateApiKeyHash);
    if (isValid) {
      return {
        tenant: tenantByIndex,
        keyType: 'tenant',
        apiKeyMasked: maskApiKey(apiKey),
      };
    }
    // Index collision (extremely unlikely with SHA-256) — fall through to scan
  }

  // Fallback: scan all tenants (for keys created before indexing was added)
  const tenants = await prisma.tenant.findMany({
    where: { waygateApiKeyIndex: null },
  });

  for (const tenant of tenants) {
    const isValid = await validateApiKey(apiKey, tenant.waygateApiKeyHash);
    if (isValid) {
      // Backfill the index for O(1) lookups on future requests
      await prisma.tenant
        .update({
          where: { id: tenant.id },
          data: { waygateApiKeyIndex: index },
        })
        .catch((err) => {
          // Non-critical — log and continue
          console.warn('Failed to backfill tenant key index:', err);
        });

      return {
        tenant,
        keyType: 'tenant',
        apiKeyMasked: maskApiKey(apiKey),
      };
    }
  }

  return null;
}

/**
 * Validates an API key without returning tenant details
 * Useful for quick validation checks
 *
 * @param apiKey - The API key to validate
 * @returns True if the key is valid
 */
export async function isApiKeyValid(apiKey: string): Promise<boolean> {
  const context = await resolveAuthContext(apiKey);
  return context !== null;
}

/**
 * Gets tenant by ID (for internal use after authentication)
 *
 * @param tenantId - The tenant's UUID
 * @returns The tenant or null if not found
 */
export async function getTenantById(tenantId: string): Promise<Tenant | null> {
  return prisma.tenant.findUnique({
    where: { id: tenantId },
  });
}
