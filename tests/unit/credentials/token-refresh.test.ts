import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CredentialType, CredentialStatus, IntegrationCredential } from '@prisma/client';
import type { GenericOAuthProvider } from '@/lib/modules/auth/oauth-providers';

// Mock Prisma before importing modules that use it
vi.mock('@/lib/db/client', () => ({
  prisma: {
    integrationCredential: {
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    $queryRaw: vi.fn(),
  },
}));

// Mock encryption module
vi.mock('@/lib/modules/credentials/encryption', () => ({
  encryptJson: vi.fn((data) => Buffer.from(JSON.stringify(data))),
  decryptJson: vi.fn((buffer) => JSON.parse(buffer.toString())),
}));

// Mock repository functions
vi.mock('@/lib/modules/credentials/credential.repository', () => ({
  findExpiringOAuth2Credentials: vi.fn(),
  tryAcquireRefreshLock: vi.fn(),
  releaseRefreshLock: vi.fn(),
  findActiveCredentialForIntegration: vi.fn(),
  findCredentialById: vi.fn(),
  updateCredential: vi.fn(),
  markCredentialNeedsReauth: vi.fn(),
}));

// Mock credential service functions
vi.mock('@/lib/modules/credentials/credential.service', () => ({
  getDecryptedCredentialById: vi.fn(),
  updateOAuth2Tokens: vi.fn(),
  flagCredentialForReauth: vi.fn(),
}));

// Mock OAuth provider
vi.mock('@/lib/modules/auth/oauth-providers', () => ({
  createGenericProvider: vi.fn(),
  OAuthError: class OAuthError extends Error {
    constructor(
      public code: string,
      message: string,
      public statusCode: number = 400
    ) {
      super(message);
      this.name = 'OAuthError';
    }
  },
}));

import {
  findExpiringOAuth2Credentials,
  tryAcquireRefreshLock,
  releaseRefreshLock,
} from '@/lib/modules/credentials/credential.repository';
import {
  getDecryptedCredentialById,
  updateOAuth2Tokens,
  flagCredentialForReauth,
} from '@/lib/modules/credentials/credential.service';
import { createGenericProvider } from '@/lib/modules/auth/oauth-providers';
import {
  refreshExpiringTokens,
  refreshSingleCredential,
  getOAuthProviderForIntegration,
  handleRefreshResult,
  DEFAULT_BUFFER_MINUTES,
  MAX_RETRY_ATTEMPTS,
  BASE_BACKOFF_MS,
} from '@/lib/modules/credentials/token-refresh.service';
import type { CredentialWithIntegration } from '@/lib/modules/credentials/credential.repository';

describe('Token Refresh Service', () => {
  const mockTenantId = '00000000-0000-0000-0000-000000000001';
  const mockIntegrationId = '00000000-0000-0000-0000-000000000002';
  const mockCredentialId = '00000000-0000-0000-0000-000000000003';

  const createMockCredential = (
    overrides: Partial<CredentialWithIntegration> = {}
  ): CredentialWithIntegration => ({
    id: mockCredentialId,
    tenantId: mockTenantId,
    integrationId: mockIntegrationId,
    connectionId: null, // Added for multi-app connections support
    credentialType: CredentialType.oauth2_tokens,
    encryptedData: new Uint8Array(Buffer.from(JSON.stringify({ accessToken: 'old-token' }))),
    encryptedRefreshToken: new Uint8Array(
      Buffer.from(JSON.stringify({ refreshToken: 'refresh-token' }))
    ),
    status: CredentialStatus.active,
    expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes from now
    scopes: ['read', 'write'],
    createdAt: new Date(),
    updatedAt: new Date(),
    integration: {
      id: mockIntegrationId,
      name: 'Test Integration',
      slug: 'test-integration',
      authType: 'oauth2',
      authConfig: {
        clientId: 'client-id',
        clientSecret: 'client-secret',
        tokenUrl: 'https://example.com/oauth/token',
        authorizationUrl: 'https://example.com/oauth/authorize',
      },
    },
    ...overrides,
  });

  const mockRefreshToken = vi.fn();
  const mockOAuthProvider = {
    refreshToken: mockRefreshToken,
    getAuthorizationUrl: vi.fn(),
    exchangeCode: vi.fn(),
    validateToken: vi.fn(),
    revokeToken: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock implementations
    vi.mocked(tryAcquireRefreshLock).mockResolvedValue(true);
    vi.mocked(releaseRefreshLock).mockResolvedValue(true);
    vi.mocked(createGenericProvider).mockReturnValue(
      mockOAuthProvider as unknown as GenericOAuthProvider
    );
    mockRefreshToken.mockResolvedValue({
      accessToken: 'new-access-token',
      refreshToken: undefined, // No rotation by default
      tokenType: 'Bearer',
      expiresIn: 3600,
    });
    vi.mocked(updateOAuth2Tokens).mockResolvedValue({
      id: mockCredentialId,
      status: CredentialStatus.active,
    } as unknown as IntegrationCredential);
    vi.mocked(flagCredentialForReauth).mockResolvedValue({
      id: mockCredentialId,
      status: CredentialStatus.needs_reauth,
    } as unknown as IntegrationCredential);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('Configuration Constants', () => {
    it('should have correct default buffer minutes', () => {
      expect(DEFAULT_BUFFER_MINUTES).toBe(10);
    });

    it('should have correct max retry attempts', () => {
      expect(MAX_RETRY_ATTEMPTS).toBe(3);
    });

    it('should have correct base backoff milliseconds', () => {
      expect(BASE_BACKOFF_MS).toBe(1000);
    });
  });

  describe('refreshExpiringTokens', () => {
    it('should find and refresh expiring credentials', async () => {
      const mockCredential = createMockCredential();
      vi.mocked(findExpiringOAuth2Credentials).mockResolvedValue([mockCredential]);
      vi.mocked(getDecryptedCredentialById).mockResolvedValue({
        id: mockCredentialId,
        refreshToken: 'refresh-token',
        integrationId: mockIntegrationId,
        tenantId: mockTenantId,
        credentialType: CredentialType.oauth2_tokens,
        data: { accessToken: 'old-token', tokenType: 'Bearer' },
        status: CredentialStatus.active,
        expiresAt: new Date(),
        scopes: [],
      });

      const result = await refreshExpiringTokens(10);

      expect(findExpiringOAuth2Credentials).toHaveBeenCalledWith(10);
      expect(result.totalProcessed).toBe(1);
      expect(result.successful).toBe(1);
      expect(result.failed).toBe(0);
      expect(result.skipped).toBe(0);
    });

    it('should handle empty credentials list', async () => {
      vi.mocked(findExpiringOAuth2Credentials).mockResolvedValue([]);

      const result = await refreshExpiringTokens();

      expect(result.totalProcessed).toBe(0);
      expect(result.successful).toBe(0);
      expect(result.failed).toBe(0);
    });

    it('should skip credentials when lock cannot be acquired', async () => {
      const mockCredential = createMockCredential();
      vi.mocked(findExpiringOAuth2Credentials).mockResolvedValue([mockCredential]);
      vi.mocked(tryAcquireRefreshLock).mockResolvedValue(false);

      const result = await refreshExpiringTokens();

      expect(result.totalProcessed).toBe(1);
      expect(result.skipped).toBe(1);
      expect(result.successful).toBe(0);
    });

    it('should process multiple credentials independently', async () => {
      const credentials = [
        createMockCredential({ id: 'cred-1' }),
        createMockCredential({ id: 'cred-2' }),
        createMockCredential({ id: 'cred-3' }),
      ];
      vi.mocked(findExpiringOAuth2Credentials).mockResolvedValue(credentials);
      vi.mocked(getDecryptedCredentialById).mockResolvedValue({
        id: 'any',
        refreshToken: 'refresh-token',
        integrationId: mockIntegrationId,
        tenantId: mockTenantId,
        credentialType: CredentialType.oauth2_tokens,
        data: { accessToken: 'old-token', tokenType: 'Bearer' },
        status: CredentialStatus.active,
        expiresAt: new Date(),
        scopes: [],
      });

      const result = await refreshExpiringTokens();

      expect(result.totalProcessed).toBe(3);
      expect(tryAcquireRefreshLock).toHaveBeenCalledTimes(3);
      expect(releaseRefreshLock).toHaveBeenCalledTimes(3);
    });
  });

  describe('refreshSingleCredential', () => {
    it('should handle successful refresh', async () => {
      const mockCredential = createMockCredential();
      vi.mocked(getDecryptedCredentialById).mockResolvedValue({
        id: mockCredentialId,
        refreshToken: 'refresh-token',
        integrationId: mockIntegrationId,
        tenantId: mockTenantId,
        credentialType: CredentialType.oauth2_tokens,
        data: { accessToken: 'old-token', tokenType: 'Bearer' },
        status: CredentialStatus.active,
        expiresAt: new Date(),
        scopes: [],
      });

      const result = await refreshSingleCredential(mockCredential);

      expect(result.success).toBe(true);
      expect(result.credentialId).toBe(mockCredentialId);
      expect(mockRefreshToken).toHaveBeenCalledWith('refresh-token');
      expect(updateOAuth2Tokens).toHaveBeenCalledWith(
        mockCredentialId,
        expect.objectContaining({
          accessToken: 'new-access-token',
        })
      );
    });

    it('should fail when no refresh token available', async () => {
      const mockCredential = createMockCredential();
      vi.mocked(getDecryptedCredentialById).mockResolvedValue({
        id: mockCredentialId,
        refreshToken: undefined, // No refresh token
        integrationId: mockIntegrationId,
        tenantId: mockTenantId,
        credentialType: CredentialType.oauth2_tokens,
        data: { accessToken: 'old-token', tokenType: 'Bearer' },
        status: CredentialStatus.active,
        expiresAt: new Date(),
        scopes: [],
      });

      const result = await refreshSingleCredential(mockCredential);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('NO_REFRESH_TOKEN');
    });

    it('should fail when credential not found', async () => {
      const mockCredential = createMockCredential();
      vi.mocked(getDecryptedCredentialById).mockResolvedValue(null);

      const result = await refreshSingleCredential(mockCredential);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('NO_REFRESH_TOKEN');
    });

    it('should fail when integration auth config is invalid', async () => {
      const mockCredential = createMockCredential({
        integration: {
          id: mockIntegrationId,
          name: 'Test Integration',
          slug: 'test-integration',
          authType: 'oauth2',
          authConfig: {
            // Missing tokenUrl, clientId, clientSecret
          },
        },
      });
      vi.mocked(getDecryptedCredentialById).mockResolvedValue({
        id: mockCredentialId,
        refreshToken: 'refresh-token',
        integrationId: mockIntegrationId,
        tenantId: mockTenantId,
        credentialType: CredentialType.oauth2_tokens,
        data: { accessToken: 'old-token', tokenType: 'Bearer' },
        status: CredentialStatus.active,
        expiresAt: new Date(),
        scopes: [],
      });
      vi.mocked(createGenericProvider).mockReturnValue(null as unknown as GenericOAuthProvider);

      const result = await refreshSingleCredential(mockCredential);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('INVALID_AUTH_CONFIG');
    });

    it('should mark credential as needs_reauth after max retries', async () => {
      const mockCredential = createMockCredential();
      vi.mocked(getDecryptedCredentialById).mockResolvedValue({
        id: mockCredentialId,
        refreshToken: 'refresh-token',
        integrationId: mockIntegrationId,
        tenantId: mockTenantId,
        credentialType: CredentialType.oauth2_tokens,
        data: { accessToken: 'old-token', tokenType: 'Bearer' },
        status: CredentialStatus.active,
        expiresAt: new Date(),
        scopes: [],
      });
      // Fail all attempts
      mockRefreshToken.mockRejectedValue(new Error('Network error'));

      const result = await refreshSingleCredential(mockCredential);

      expect(result.success).toBe(false);
      expect(result.retryCount).toBeGreaterThan(0);
      expect(flagCredentialForReauth).toHaveBeenCalledWith(mockCredentialId);
    }, 15000); // Increase timeout for retries
  });

  describe('handleRefreshResult', () => {
    it('should update tokens without rotation', async () => {
      const tokenResponse = {
        accessToken: 'new-access-token',
        tokenType: 'Bearer',
        expiresIn: 3600,
      };

      const result = await handleRefreshResult(mockCredentialId, tokenResponse);

      expect(result.rotatedRefreshToken).toBe(false);
      expect(updateOAuth2Tokens).toHaveBeenCalledWith(
        mockCredentialId,
        expect.objectContaining({
          accessToken: 'new-access-token',
          expiresIn: 3600,
        })
      );
    });

    it('should handle refresh token rotation', async () => {
      const tokenResponse = {
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token', // Rotated!
        tokenType: 'Bearer',
        expiresIn: 3600,
      };

      const result = await handleRefreshResult(mockCredentialId, tokenResponse);

      expect(result.rotatedRefreshToken).toBe(true);
      expect(updateOAuth2Tokens).toHaveBeenCalledWith(
        mockCredentialId,
        expect.objectContaining({
          accessToken: 'new-access-token',
          refreshToken: 'new-refresh-token',
        })
      );
    });
  });

  describe('getOAuthProviderForIntegration', () => {
    it('should return null for non-OAuth2 integrations', () => {
      const integration = {
        id: mockIntegrationId,
        authType: 'api_key',
        authConfig: {},
      };

      const result = getOAuthProviderForIntegration(integration);

      expect(result).toBeNull();
    });

    it('should return null when tokenUrl is missing', () => {
      const integration = {
        id: mockIntegrationId,
        authType: 'oauth2',
        authConfig: {
          clientId: 'client-id',
          clientSecret: 'client-secret',
          // Missing tokenUrl
        },
      };

      const result = getOAuthProviderForIntegration(integration);

      expect(result).toBeNull();
    });

    it('should return null when client credentials are missing', () => {
      const integration = {
        id: mockIntegrationId,
        authType: 'oauth2',
        authConfig: {
          tokenUrl: 'https://example.com/oauth/token',
          // Missing clientId and clientSecret
        },
      };

      const result = getOAuthProviderForIntegration(integration);

      expect(result).toBeNull();
    });

    it('should create provider with valid config', () => {
      const integration = {
        id: mockIntegrationId,
        authType: 'oauth2',
        authConfig: {
          clientId: 'client-id',
          clientSecret: 'client-secret',
          tokenUrl: 'https://example.com/oauth/token',
          authorizationUrl: 'https://example.com/oauth/authorize',
          scopes: ['read', 'write'],
        },
      };

      const result = getOAuthProviderForIntegration(integration);

      expect(createGenericProvider).toHaveBeenCalledWith(
        expect.objectContaining({
          tokenUrl: 'https://example.com/oauth/token',
          scopes: ['read', 'write'],
        }),
        'client-id',
        'client-secret',
        expect.any(String) // redirectUri
      );
      expect(result).toBe(mockOAuthProvider);
    });
  });

  describe('Lock Management', () => {
    it('should always release lock after refresh (success)', async () => {
      const mockCredential = createMockCredential();
      vi.mocked(findExpiringOAuth2Credentials).mockResolvedValue([mockCredential]);
      vi.mocked(getDecryptedCredentialById).mockResolvedValue({
        id: mockCredentialId,
        refreshToken: 'refresh-token',
        integrationId: mockIntegrationId,
        tenantId: mockTenantId,
        credentialType: CredentialType.oauth2_tokens,
        data: { accessToken: 'old-token', tokenType: 'Bearer' },
        status: CredentialStatus.active,
        expiresAt: new Date(),
        scopes: [],
      });

      await refreshExpiringTokens();

      expect(tryAcquireRefreshLock).toHaveBeenCalledWith(mockCredentialId);
      expect(releaseRefreshLock).toHaveBeenCalledWith(mockCredentialId);
    });

    it('should always release lock after refresh (failure)', async () => {
      const mockCredential = createMockCredential();
      vi.mocked(findExpiringOAuth2Credentials).mockResolvedValue([mockCredential]);
      vi.mocked(getDecryptedCredentialById).mockResolvedValue({
        id: mockCredentialId,
        refreshToken: 'refresh-token',
        integrationId: mockIntegrationId,
        tenantId: mockTenantId,
        credentialType: CredentialType.oauth2_tokens,
        data: { accessToken: 'old-token', tokenType: 'Bearer' },
        status: CredentialStatus.active,
        expiresAt: new Date(),
        scopes: [],
      });
      mockRefreshToken.mockRejectedValue(new Error('Network error'));

      await refreshExpiringTokens();

      expect(releaseRefreshLock).toHaveBeenCalledWith(mockCredentialId);
    }, 15000);

    it('should not release lock if lock was not acquired', async () => {
      const mockCredential = createMockCredential();
      vi.mocked(findExpiringOAuth2Credentials).mockResolvedValue([mockCredential]);
      vi.mocked(tryAcquireRefreshLock).mockResolvedValue(false);

      await refreshExpiringTokens();

      expect(releaseRefreshLock).not.toHaveBeenCalled();
    });
  });

  describe('RefreshBatchResult', () => {
    it('should include timing information', async () => {
      vi.mocked(findExpiringOAuth2Credentials).mockResolvedValue([]);

      const result = await refreshExpiringTokens();

      expect(result.startedAt).toBeInstanceOf(Date);
      expect(result.completedAt).toBeInstanceOf(Date);
      expect(result.completedAt.getTime()).toBeGreaterThanOrEqual(result.startedAt.getTime());
    });

    it('should include individual results', async () => {
      const mockCredential = createMockCredential();
      vi.mocked(findExpiringOAuth2Credentials).mockResolvedValue([mockCredential]);
      vi.mocked(getDecryptedCredentialById).mockResolvedValue({
        id: mockCredentialId,
        refreshToken: 'refresh-token',
        integrationId: mockIntegrationId,
        tenantId: mockTenantId,
        credentialType: CredentialType.oauth2_tokens,
        data: { accessToken: 'old-token', tokenType: 'Bearer' },
        status: CredentialStatus.active,
        expiresAt: new Date(),
        scopes: [],
      });

      const result = await refreshExpiringTokens();

      expect(result.results).toHaveLength(1);
      expect(result.results[0]).toMatchObject({
        credentialId: mockCredentialId,
        integrationId: mockIntegrationId,
        tenantId: mockTenantId,
        success: true,
      });
    });
  });
});
