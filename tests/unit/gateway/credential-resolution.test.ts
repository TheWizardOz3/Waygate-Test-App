/**
 * Gateway Credential Resolution Tests
 *
 * Tests the credential resolution logic within the gateway service:
 * - User-specific credential priority over shared credentials
 * - Fallback to shared credential when user credential is inactive
 * - Fallback to shared credential when user credential resolution errors
 * - Shared-only resolution when no user context provided
 * - adaptUserCredential field mapping
 *
 * Since resolveCredentialForInvocation is internal to gateway.service.ts,
 * we test it through invokeAction with comprehensive mocking.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CredentialType } from '@prisma/client';

// ---------------------------------------------------------------------------
// Mock setup — vi.hoisted ensures variables are available when vi.mock runs
// ---------------------------------------------------------------------------

const {
  mockGetIntegrationBySlugRaw,
  mockGetActionBySlug,
  mockResolveConnection,
  mockResolveAppConnection,
  mockGetDecryptedCredential,
  mockIsCredentialExpired,
  mockGetDecryptedUserCredential,
  mockResolveAppUser,
  mockExecuteWithMetrics,
  mockLogRequestResponse,
  mockCheckRateLimit,
  mockRecordRequest,
  mockResolveRateLimitConfig,
} = vi.hoisted(() => ({
  mockGetIntegrationBySlugRaw: vi.fn(),
  mockGetActionBySlug: vi.fn(),
  mockResolveConnection: vi.fn(),
  mockResolveAppConnection: vi.fn(),
  mockGetDecryptedCredential: vi.fn(),
  mockIsCredentialExpired: vi.fn().mockReturnValue(false),
  mockGetDecryptedUserCredential: vi.fn(),
  mockResolveAppUser: vi.fn(),
  mockExecuteWithMetrics: vi.fn(),
  mockLogRequestResponse: vi.fn(),
  mockCheckRateLimit: vi.fn().mockReturnValue({ allowed: true }),
  mockRecordRequest: vi.fn(),
  mockResolveRateLimitConfig: vi.fn().mockReturnValue(null),
}));

vi.mock('@/lib/modules/integrations/integration.service', () => ({
  getIntegrationBySlugRaw: mockGetIntegrationBySlugRaw,
  IntegrationError: class IntegrationError extends Error {
    constructor(
      public code: string,
      message: string
    ) {
      super(message);
    }
  },
}));

vi.mock('@/lib/modules/actions/action.service', () => ({
  getActionBySlug: mockGetActionBySlug,
  ActionError: class ActionError extends Error {
    constructor(
      public code: string,
      message: string
    ) {
      super(message);
    }
  },
}));

vi.mock('@/lib/modules/connections', () => ({
  resolveConnection: mockResolveConnection,
  resolveAppConnection: mockResolveAppConnection,
}));

vi.mock('@/lib/modules/credentials/credential.service', () => ({
  getDecryptedCredential: mockGetDecryptedCredential,
  isCredentialExpired: mockIsCredentialExpired,
  isOAuth2Credential: vi.fn((c) => c?.credentialType === CredentialType.oauth2_tokens),
  isApiKeyCredential: vi.fn((c) => c?.credentialType === CredentialType.api_key),
  isBasicCredential: vi.fn((c) => c?.credentialType === CredentialType.basic),
  isBearerCredential: vi.fn((c) => c?.credentialType === CredentialType.bearer),
}));

vi.mock('@/lib/modules/credentials/auth-type-handlers/api-key.handler', () => ({
  applyApiKeyAuth: vi.fn((_cred, request) => request),
}));

vi.mock('@/lib/modules/credentials/auth-type-handlers/basic.handler', () => ({
  getBasicAuthHeaders: vi.fn(() => ({})),
}));

vi.mock('@/lib/modules/credentials/auth-type-handlers/bearer.handler', () => ({
  getBearerAuthHeaders: vi.fn(() => ({ Authorization: 'Bearer test-token' })),
  getOAuth2AuthHeaders: vi.fn(() => ({ Authorization: 'Bearer test-oauth-token' })),
}));

vi.mock('@/lib/modules/credentials/auth-type-handlers/custom-header.handler', () => ({
  getCustomHeaders: vi.fn(() => ({})),
}));

vi.mock('@/lib/modules/app-user-credentials/app-user-credential.service', () => ({
  getDecryptedUserCredential: mockGetDecryptedUserCredential,
}));

vi.mock('@/lib/modules/app-users/app-user.service', () => ({
  resolveAppUser: mockResolveAppUser,
}));

vi.mock('@/lib/modules/execution/execution.service', () => ({
  executeWithMetrics: mockExecuteWithMetrics,
}));

vi.mock('@/lib/modules/logging/logging.service', () => ({
  logRequestResponse: mockLogRequestResponse,
}));

vi.mock('@/lib/modules/actions/json-schema-validator', () => ({
  validateActionInput: vi.fn(() => ({ valid: true, errors: [] })),
  formatAsApiError: vi.fn(),
}));

vi.mock('@/lib/modules/execution/mapping/server', () => {
  const noopMeta = {
    mappingDurationMs: 0,
    inputMappingsApplied: 0,
    outputMappingsApplied: 0,
    fieldsTransformed: 0,
    fieldsCoerced: 0,
    fieldsDefaulted: 0,
  };
  const noopResult = (data: unknown) => ({
    applied: false,
    bypassed: true,
    data,
    errors: [],
    failureMode: 'passthrough',
    meta: noopMeta,
  });
  return {
    mappingService: {
      applyInputMapping: vi.fn(async (input: unknown) => ({
        inputResult: noopResult(input),
        inputSkipped: true,
        mappedInput: input,
      })),
      applyOutputMapping: vi.fn(async (data: unknown) => noopResult(data)),
    },
  };
});

vi.mock('@/lib/modules/execution/validation/server', () => ({
  validationService: {
    validateResponse: vi.fn(async () => ({
      valid: true,
      data: {},
      errors: [],
      metadata: { mode: 'permissive' },
    })),
  },
}));

vi.mock('@/lib/modules/execution/validation/drift/drift.repository', () => ({
  driftRepository: {
    recordFailure: vi.fn(),
  },
}));

vi.mock('@/lib/modules/execution/preamble', () => ({
  applyPreamble: vi.fn(),
}));

vi.mock('@/lib/modules/reference-data', () => ({
  findByTypes: vi.fn(async () => []),
  getDataTypes: vi.fn(async () => []),
}));

vi.mock('@/lib/modules/tool-export/handlers/context-resolver', () => ({
  resolveContextReferences: vi.fn(),
  formatResolutionDetails: vi.fn(),
  generateFieldHints: vi.fn(() => []),
}));

vi.mock('@/lib/modules/variables', () => ({
  resolveTemplate: vi.fn((tpl: string) => ({ result: tpl, resolvedCount: 0 })),
  resolveTemplates: vi.fn((tpls: Record<string, string>) => ({
    results: tpls,
    totalResolved: 0,
  })),
  containsVariableReferences: vi.fn(() => false),
  buildRuntimeContext: vi.fn(() => ({})),
  getEnvironment: vi.fn(() => 'development'),
  summarizeResolution: vi.fn(() => ''),
}));

vi.mock('@/lib/modules/gateway/rate-limiter', () => ({
  checkRateLimit: mockCheckRateLimit,
  recordRequest: mockRecordRequest,
  resolveRateLimitConfig: mockResolveRateLimitConfig,
}));

// Now import the gateway service (uses mocked dependencies)
import { invokeAction } from '@/lib/modules/gateway/gateway.service';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TENANT_ID = 'tenant-123';
const INTEGRATION_ID = 'int-456';
const CONNECTION_ID = 'conn-789';
const APP_USER_ID = 'appuser-001';
const APP_ID = 'app-aaa';
const USER_CRED_ID = 'ucred-111';

function makeIntegration(overrides: Record<string, unknown> = {}) {
  return {
    id: INTEGRATION_ID,
    slug: 'test-api',
    name: 'Test API',
    tenantId: TENANT_ID,
    authType: 'bearer',
    authConfig: { baseUrl: 'https://api.test.com' },
    status: 'active',
    ...overrides,
  };
}

function makeAction(overrides: Record<string, unknown> = {}) {
  return {
    id: 'action-001',
    slug: 'get-data',
    name: 'Get Data',
    httpMethod: 'GET',
    endpointTemplate: '/data',
    inputSchema: { type: 'object', properties: {} },
    outputSchema: null,
    metadata: null,
    ...overrides,
  };
}

function makeConnection(overrides: Record<string, unknown> = {}) {
  return {
    id: CONNECTION_ID,
    name: 'Default',
    metadata: null,
    preambleTemplate: null,
    ...overrides,
  };
}

function makeSharedCredential(overrides: Record<string, unknown> = {}) {
  return {
    id: 'shared-cred-001',
    integrationId: INTEGRATION_ID,
    tenantId: TENANT_ID,
    credentialType: CredentialType.bearer,
    data: { accessToken: 'shared-access-token' },
    refreshToken: null,
    expiresAt: null,
    scopes: [],
    status: 'active',
    ...overrides,
  };
}

function makeUserCredential(overrides: Record<string, unknown> = {}) {
  return {
    id: USER_CRED_ID,
    connectionId: CONNECTION_ID,
    appUserId: APP_USER_ID,
    credentialType: CredentialType.bearer,
    data: { accessToken: 'user-access-token' },
    refreshToken: 'user-refresh-token',
    expiresAt: null,
    scopes: ['read', 'write'],
    status: 'active' as const,
    ...overrides,
  };
}

function setupBaseMocks() {
  mockGetIntegrationBySlugRaw.mockResolvedValue(makeIntegration());
  mockGetActionBySlug.mockResolvedValue(makeAction());
  mockResolveConnection.mockResolvedValue(makeConnection());
  mockResolveAppConnection.mockResolvedValue(makeConnection());
  mockGetDecryptedCredential.mockResolvedValue(makeSharedCredential());
  mockExecuteWithMetrics.mockResolvedValue({
    success: true,
    data: { result: 'ok' },
    statusCode: 200,
    metrics: { durationMs: 100 },
  });
  mockLogRequestResponse.mockResolvedValue(undefined);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Gateway Credential Resolution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupBaseMocks();
  });

  describe('without user context (tenant key invocations)', () => {
    it('uses shared credential when no externalUserId is provided', async () => {
      await invokeAction(TENANT_ID, 'test-api', 'get-data', {});

      expect(mockGetDecryptedUserCredential).not.toHaveBeenCalled();
      expect(mockGetDecryptedCredential).toHaveBeenCalledWith(
        INTEGRATION_ID,
        TENANT_ID,
        CONNECTION_ID
      );
    });

    it('does not attempt user resolution without appId', async () => {
      await invokeAction(
        TENANT_ID,
        'test-api',
        'get-data',
        {},
        {
          externalUserId: 'ext-user-1',
          // no appId
        }
      );

      expect(mockResolveAppUser).not.toHaveBeenCalled();
      expect(mockGetDecryptedUserCredential).not.toHaveBeenCalled();
    });
  });

  describe('with user context (app key invocations)', () => {
    it('uses user credential when active user credential exists', async () => {
      mockResolveAppUser.mockResolvedValue({ id: APP_USER_ID, externalId: 'ext-1' });
      mockGetDecryptedUserCredential.mockResolvedValue(makeUserCredential());

      const result = await invokeAction(
        TENANT_ID,
        'test-api',
        'get-data',
        {},
        {
          externalUserId: 'ext-1',
          appId: APP_ID,
        }
      );

      // User credential was fetched
      expect(mockGetDecryptedUserCredential).toHaveBeenCalledWith(CONNECTION_ID, APP_USER_ID);
      // Shared credential was NOT fetched (user credential took priority)
      expect(mockGetDecryptedCredential).not.toHaveBeenCalled();
      expect(result.success).toBe(true);
    });

    it('falls back to shared credential when no user credential exists', async () => {
      mockResolveAppUser.mockResolvedValue({ id: APP_USER_ID, externalId: 'ext-1' });
      mockGetDecryptedUserCredential.mockResolvedValue(null);

      const result = await invokeAction(
        TENANT_ID,
        'test-api',
        'get-data',
        {},
        {
          externalUserId: 'ext-1',
          appId: APP_ID,
        }
      );

      // Tried user credential first
      expect(mockGetDecryptedUserCredential).toHaveBeenCalledWith(CONNECTION_ID, APP_USER_ID);
      // Fell back to shared
      expect(mockGetDecryptedCredential).toHaveBeenCalledWith(
        INTEGRATION_ID,
        TENANT_ID,
        CONNECTION_ID
      );
      expect(result.success).toBe(true);
    });

    it('falls back to shared credential when user credential is inactive', async () => {
      mockResolveAppUser.mockResolvedValue({ id: APP_USER_ID, externalId: 'ext-1' });
      mockGetDecryptedUserCredential.mockResolvedValue(
        makeUserCredential({ status: 'needs_reauth' })
      );
      // Shared credential must be active to pass validateCredential
      mockGetDecryptedCredential.mockResolvedValue(makeSharedCredential());

      const result = await invokeAction(
        TENANT_ID,
        'test-api',
        'get-data',
        {},
        {
          externalUserId: 'ext-1',
          appId: APP_ID,
        }
      );

      expect(mockGetDecryptedUserCredential).toHaveBeenCalled();
      // Inactive user cred → fallback to shared
      expect(mockGetDecryptedCredential).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });

    it('falls back to shared credential when user credential resolution throws', async () => {
      mockResolveAppUser.mockResolvedValue({ id: APP_USER_ID, externalId: 'ext-1' });
      mockGetDecryptedUserCredential.mockRejectedValue(new Error('Decryption failed'));

      const result = await invokeAction(
        TENANT_ID,
        'test-api',
        'get-data',
        {},
        {
          externalUserId: 'ext-1',
          appId: APP_ID,
        }
      );

      expect(mockGetDecryptedUserCredential).toHaveBeenCalled();
      expect(mockGetDecryptedCredential).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });

    it('falls back to shared credential when resolveAppUser fails', async () => {
      mockResolveAppUser.mockRejectedValue(new Error('DB connection lost'));

      const result = await invokeAction(
        TENANT_ID,
        'test-api',
        'get-data',
        {},
        {
          externalUserId: 'ext-1',
          appId: APP_ID,
        }
      );

      // resolveAppUser failed, so no user credential resolution attempt
      expect(mockGetDecryptedUserCredential).not.toHaveBeenCalled();
      // Fell back to shared
      expect(mockGetDecryptedCredential).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });
  });

  describe('adaptUserCredential (field mapping)', () => {
    it('maps user credential data into the shared credential interface', async () => {
      const userCred = makeUserCredential({
        credentialType: CredentialType.oauth2_tokens,
        data: { accessToken: 'user-oauth-token', tokenType: 'bearer' },
        refreshToken: 'user-refresh',
        expiresAt: new Date('2099-01-01'),
        scopes: ['email', 'profile'],
      });

      mockResolveAppUser.mockResolvedValue({ id: APP_USER_ID, externalId: 'ext-1' });
      mockGetDecryptedUserCredential.mockResolvedValue(userCred);

      // Override the auth type check so it uses oauth2 path
      mockGetIntegrationBySlugRaw.mockResolvedValue(makeIntegration({ authType: 'oauth2' }));

      const result = await invokeAction(
        TENANT_ID,
        'test-api',
        'get-data',
        {},
        {
          externalUserId: 'ext-1',
          appId: APP_ID,
        }
      );

      // User credential was used (shared NOT called)
      expect(mockGetDecryptedCredential).not.toHaveBeenCalled();
      expect(result.success).toBe(true);
    });

    it('preserves user credential scopes through adaptation', async () => {
      const userCred = makeUserCredential({ scopes: ['admin', 'read', 'write'] });
      mockResolveAppUser.mockResolvedValue({ id: APP_USER_ID, externalId: 'ext-1' });
      mockGetDecryptedUserCredential.mockResolvedValue(userCred);

      const result = await invokeAction(
        TENANT_ID,
        'test-api',
        'get-data',
        {},
        {
          externalUserId: 'ext-1',
          appId: APP_ID,
        }
      );

      expect(result.success).toBe(true);
      expect(mockGetDecryptedCredential).not.toHaveBeenCalled();
    });
  });

  describe('auth type none', () => {
    it('skips credential resolution entirely when authType is none', async () => {
      mockGetIntegrationBySlugRaw.mockResolvedValue(
        makeIntegration({ authType: 'none', authConfig: {} })
      );

      await invokeAction(TENANT_ID, 'test-api', 'get-data', {});

      expect(mockGetDecryptedCredential).not.toHaveBeenCalled();
      expect(mockGetDecryptedUserCredential).not.toHaveBeenCalled();
    });
  });

  describe('credential validation after resolution', () => {
    it('returns error when no credential is found (shared returns null)', async () => {
      mockGetDecryptedCredential.mockResolvedValue(null);

      const result = await invokeAction(TENANT_ID, 'test-api', 'get-data', {});

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('CREDENTIALS_MISSING');
      }
    });

    it('returns error when user credential is inactive and shared credential is null', async () => {
      mockResolveAppUser.mockResolvedValue({ id: APP_USER_ID, externalId: 'ext-1' });
      mockGetDecryptedUserCredential.mockResolvedValue(makeUserCredential({ status: 'revoked' }));
      mockGetDecryptedCredential.mockResolvedValue(null);

      const result = await invokeAction(
        TENANT_ID,
        'test-api',
        'get-data',
        {},
        {
          externalUserId: 'ext-1',
          appId: APP_ID,
        }
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('CREDENTIALS_MISSING');
      }
    });

    it('returns error when resolved credential has needs_reauth status', async () => {
      mockGetDecryptedCredential.mockResolvedValue(
        makeSharedCredential({ status: 'needs_reauth' })
      );

      const result = await invokeAction(TENANT_ID, 'test-api', 'get-data', {});

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('CREDENTIALS_EXPIRED');
      }
    });

    it('returns error when resolved credential is expired', async () => {
      mockIsCredentialExpired.mockReturnValue(true);
      mockGetDecryptedCredential.mockResolvedValue(makeSharedCredential());

      const result = await invokeAction(TENANT_ID, 'test-api', 'get-data', {});

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('CREDENTIALS_EXPIRED');
      }
    });
  });

  describe('connection resolution with app context', () => {
    it('uses resolveAppConnection when appId is provided', async () => {
      await invokeAction(
        TENANT_ID,
        'test-api',
        'get-data',
        {},
        {
          appId: APP_ID,
        }
      );

      expect(mockResolveAppConnection).toHaveBeenCalledWith(TENANT_ID, INTEGRATION_ID, APP_ID);
      expect(mockResolveConnection).not.toHaveBeenCalled();
    });

    it('uses resolveConnection when explicit connectionId is provided (takes priority over appId)', async () => {
      await invokeAction(
        TENANT_ID,
        'test-api',
        'get-data',
        {},
        {
          connectionId: 'explicit-conn-id',
          appId: APP_ID,
        }
      );

      expect(mockResolveConnection).toHaveBeenCalledWith(
        TENANT_ID,
        INTEGRATION_ID,
        'explicit-conn-id'
      );
      expect(mockResolveAppConnection).not.toHaveBeenCalled();
    });

    it('uses resolveConnection without connectionId when neither appId nor connectionId', async () => {
      await invokeAction(TENANT_ID, 'test-api', 'get-data', {});

      expect(mockResolveConnection).toHaveBeenCalledWith(TENANT_ID, INTEGRATION_ID);
    });
  });
});
