/**
 * ConnectSession Schemas
 *
 * Zod schemas for connect session validation, input/output types,
 * and API response helpers.
 */

import { z } from 'zod';

// =============================================================================
// Enums
// =============================================================================

export const ConnectSessionStatusSchema = z.enum(['pending', 'completed', 'expired', 'failed']);
export type ConnectSessionStatus = z.infer<typeof ConnectSessionStatusSchema>;

// =============================================================================
// Input Schemas
// =============================================================================

export const CreateConnectSessionInputSchema = z.object({
  externalUserId: z.string().min(1).max(255),
  integrationSlug: z.string().min(1).max(100),
  redirectUrl: z.string().url().optional(),
  user: z
    .object({
      displayName: z.string().max(255).optional(),
      email: z.string().email().max(255).optional(),
    })
    .optional(),
});
export type CreateConnectSessionInput = z.infer<typeof CreateConnectSessionInputSchema>;

// =============================================================================
// API Response Schemas
// =============================================================================

export const ConnectSessionResponseSchema = z.object({
  id: z.string().uuid(),
  appId: z.string().uuid(),
  appUserId: z.string().uuid(),
  integrationId: z.string().uuid(),
  connectionId: z.string().uuid().nullable(),
  status: ConnectSessionStatusSchema,
  redirectUrl: z.string().nullable(),
  expiresAt: z.string(),
  completedAt: z.string().nullable(),
  errorMessage: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()),
  createdAt: z.string(),
});
export type ConnectSessionResponse = z.infer<typeof ConnectSessionResponseSchema>;

export const CreateConnectSessionResponseSchema = z.object({
  sessionId: z.string().uuid(),
  connectUrl: z.string().url(),
  token: z.string(),
  expiresAt: z.string(),
});
export type CreateConnectSessionResponse = z.infer<typeof CreateConnectSessionResponseSchema>;

// =============================================================================
// Response Helpers
// =============================================================================

export function toConnectSessionResponse(session: {
  id: string;
  appId: string;
  appUserId: string;
  integrationId: string;
  connectionId: string | null;
  status: string;
  redirectUrl: string | null;
  expiresAt: Date;
  completedAt: Date | null;
  errorMessage: string | null;
  metadata: unknown;
  createdAt: Date;
}): ConnectSessionResponse {
  return {
    id: session.id,
    appId: session.appId,
    appUserId: session.appUserId,
    integrationId: session.integrationId,
    connectionId: session.connectionId,
    status: session.status as ConnectSessionStatus,
    redirectUrl: session.redirectUrl,
    expiresAt: session.expiresAt.toISOString(),
    completedAt: session.completedAt?.toISOString() ?? null,
    errorMessage: session.errorMessage,
    metadata: (session.metadata as Record<string, unknown>) ?? {},
    createdAt: session.createdAt.toISOString(),
  };
}

// =============================================================================
// Error Codes
// =============================================================================

export const ConnectSessionErrorCodes = {
  CONNECT_SESSION_NOT_FOUND: 'CONNECT_SESSION_NOT_FOUND',
  CONNECT_SESSION_EXPIRED: 'CONNECT_SESSION_EXPIRED',
  CONNECT_SESSION_ALREADY_COMPLETED: 'CONNECT_SESSION_ALREADY_COMPLETED',
  INTEGRATION_NOT_FOUND: 'INTEGRATION_NOT_FOUND',
  CONNECTION_NOT_FOUND: 'CONNECTION_NOT_FOUND',
  INVALID_INPUT: 'INVALID_INPUT',
} as const;
