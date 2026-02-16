/**
 * ConnectSessions Module
 *
 * Short-lived sessions for the embeddable end-user OAuth connect flow.
 * The consuming app creates a session server-side, then redirects or embeds
 * the connect URL for the end-user to complete the OAuth flow.
 */

// Errors
export {
  ConnectSessionError,
  ConnectSessionNotFoundError,
  ConnectSessionExpiredError,
  ConnectSessionAlreadyCompletedError,
} from './connect-session.errors';

// Schemas & Types
export {
  ConnectSessionStatusSchema,
  CreateConnectSessionInputSchema,
  ConnectSessionResponseSchema,
  CreateConnectSessionResponseSchema,
  ConnectSessionErrorCodes,
  toConnectSessionResponse,
} from './connect-session.schemas';
export type {
  ConnectSessionStatus,
  CreateConnectSessionInput,
  ConnectSessionResponse,
  CreateConnectSessionResponse,
} from './connect-session.schemas';

// Repository
export {
  createConnectSession as repoCreateConnectSession,
  findConnectSessionByToken,
  findConnectSessionById,
  findConnectSessionByIdAndApp,
  markSessionCompleted,
  markSessionFailed,
  cleanupExpiredSessions as repoCleanupExpiredSessions,
} from './connect-session.repository';
export type {
  CreateConnectSessionDbInput,
  ConnectSessionWithRelations,
} from './connect-session.repository';

// Service
export {
  createConnectSession,
  validateSession,
  getSession,
  completeSession,
  failSession,
  cleanupExpiredSessions,
} from './connect-session.service';
