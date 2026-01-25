import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock fetch for OAuth token exchange
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock Prisma
vi.mock('@/lib/db/client', () => ({
  prisma: {
    integration: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    integrationCredential: {
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    tenant: {
      findFirst: vi.fn(),
    },
  },
}));

// Mock encryption
vi.mock('@/lib/modules/credentials/encryption', () => ({
  encryptJson: vi.fn((data) => Buffer.from(JSON.stringify(data))),
  decryptJson: vi.fn((buffer) => JSON.parse(buffer.toString())),
}));

import { prisma } from '@/lib/db/client';
import { AuthType, CredentialType, CredentialStatus } from '@prisma/client';
import {
  initiateOAuthConnection,
  getOAuthConnectionStatus,
  AuthServiceError,
} from '@/lib/modules/auth/auth.service';
import {
  createGenericProvider,
  generateState,
  generatePkce,
  isStateExpired,
  type OAuthState,
} from '@/lib/modules/auth/oauth-providers';

describe('OAuth Flow Integration', () => {
  const mockTenantId = '00000000-0000-0000-0000-000000000001';
  const mockIntegrationId = '00000000-0000-0000-0000-000000000002';

  const mockOAuthConfig = {
    authorizationUrl: 'https://auth.example.com/authorize',
    tokenUrl: 'https://auth.example.com/token',
    clientId: 'test-client-id',
    clientSecret: 'test-client-secret',
    scopes: ['read', 'write'],
  };

  const mockIntegration = {
    id: mockIntegrationId,
    tenantId: mockTenantId,
    name: 'Test Integration',
    slug: 'test-integration',
    authType: AuthType.oauth2,
    authConfig: mockOAuthConfig,
    status: 'draft' as const,
    description: null,
    documentationUrl: null,
    tags: [],
    metadata: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';
    process.env.ENCRYPTION_KEY = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2';
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('OAuth Provider Utilities', () => {
    describe('generateState', () => {
      it('should generate a cryptographically random state', () => {
        const state = generateState();

        expect(state).toHaveLength(64); // 32 bytes as hex
        expect(/^[0-9a-f]{64}$/.test(state)).toBe(true);
      });

      it('should generate unique states', () => {
        const state1 = generateState();
        const state2 = generateState();

        expect(state1).not.toBe(state2);
      });
    });

    describe('generatePkce', () => {
      it('should generate PKCE code verifier and challenge', () => {
        const pkce = generatePkce();

        expect(pkce.codeVerifier).toBeDefined();
        expect(pkce.codeChallenge).toBeDefined();
        // Verifier should be 43-128 chars per spec
        expect(pkce.codeVerifier.length).toBeGreaterThanOrEqual(43);
        expect(pkce.codeVerifier.length).toBeLessThanOrEqual(128);
      });

      it('should generate different verifiers each time', () => {
        const pkce1 = generatePkce();
        const pkce2 = generatePkce();

        expect(pkce1.codeVerifier).not.toBe(pkce2.codeVerifier);
      });
    });

    describe('isStateExpired', () => {
      it('should return false for fresh state', () => {
        const state: OAuthState = {
          state: 'test-state',
          integrationId: mockIntegrationId,
          tenantId: mockTenantId,
          createdAt: new Date(),
        };

        expect(isStateExpired(state)).toBe(false);
      });

      it('should return true for expired state', () => {
        const state: OAuthState = {
          state: 'test-state',
          integrationId: mockIntegrationId,
          tenantId: mockTenantId,
          createdAt: new Date(Date.now() - 15 * 60 * 1000), // 15 minutes ago
        };

        expect(isStateExpired(state)).toBe(true);
      });
    });
  });

  describe('Generic OAuth Provider', () => {
    it('should create a valid authorization URL', () => {
      const provider = createGenericProvider(
        mockOAuthConfig,
        mockOAuthConfig.clientId,
        mockOAuthConfig.clientSecret,
        'http://localhost:3000/api/v1/auth/callback/oauth2'
      );

      const { url, state } = provider.getAuthorizationUrl(mockIntegrationId, mockTenantId);

      expect(url).toContain('https://auth.example.com/authorize');
      expect(url).toContain('client_id=test-client-id');
      expect(url).toContain('redirect_uri=');
      expect(url).toContain('response_type=code');
      expect(url).toContain('scope=read+write');
      expect(url).toContain('state=');
      expect(state.integrationId).toBe(mockIntegrationId);
      expect(state.tenantId).toBe(mockTenantId);
    });

    it('should exchange code for tokens', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'test-access-token',
          refresh_token: 'test-refresh-token',
          token_type: 'Bearer',
          expires_in: 3600,
          scope: 'read write',
        }),
      });

      const provider = createGenericProvider(
        mockOAuthConfig,
        mockOAuthConfig.clientId,
        mockOAuthConfig.clientSecret,
        'http://localhost:3000/api/v1/auth/callback/oauth2'
      );

      const state: OAuthState = {
        state: 'test-state',
        integrationId: mockIntegrationId,
        tenantId: mockTenantId,
        createdAt: new Date(),
      };

      const tokens = await provider.exchangeCode('test-auth-code', state);

      expect(tokens.accessToken).toBe('test-access-token');
      expect(tokens.refreshToken).toBe('test-refresh-token');
      expect(tokens.tokenType).toBe('Bearer');
      expect(tokens.expiresIn).toBe(3600);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://auth.example.com/token',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/x-www-form-urlencoded',
          }),
        })
      );
    });

    it('should refresh tokens', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'new-access-token',
          refresh_token: 'new-refresh-token',
          token_type: 'Bearer',
          expires_in: 3600,
        }),
      });

      const provider = createGenericProvider(
        mockOAuthConfig,
        mockOAuthConfig.clientId,
        mockOAuthConfig.clientSecret,
        'http://localhost:3000/api/v1/auth/callback/oauth2'
      );

      const tokens = await provider.refreshToken('old-refresh-token');

      expect(tokens.accessToken).toBe('new-access-token');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://auth.example.com/token',
        expect.objectContaining({
          method: 'POST',
        })
      );
    });
  });

  describe('initiateOAuthConnection', () => {
    it('should return authorization URL for valid OAuth integration', async () => {
      const mockFindFirst = vi.mocked(prisma.integration.findFirst);
      mockFindFirst.mockResolvedValue(mockIntegration);

      const result = await initiateOAuthConnection(mockIntegrationId, mockTenantId);

      expect(result.authorizationUrl).toContain('https://auth.example.com/authorize');
      expect(result.state).toBeDefined();
    });

    it('should throw error for non-existent integration', async () => {
      const mockFindFirst = vi.mocked(prisma.integration.findFirst);
      mockFindFirst.mockResolvedValue(null);

      await expect(initiateOAuthConnection(mockIntegrationId, mockTenantId)).rejects.toThrow(
        AuthServiceError
      );
    });

    it('should throw error for non-OAuth integration', async () => {
      const mockFindFirst = vi.mocked(prisma.integration.findFirst);
      mockFindFirst.mockResolvedValue({
        ...mockIntegration,
        authType: AuthType.api_key,
      });

      await expect(initiateOAuthConnection(mockIntegrationId, mockTenantId)).rejects.toThrow(
        'does not use OAuth2'
      );
    });
  });

  describe('getOAuthConnectionStatus', () => {
    it('should return connected=false when no credential exists', async () => {
      const mockFindFirst = vi.mocked(prisma.integrationCredential.findFirst);
      mockFindFirst.mockResolvedValue(null);

      const result = await getOAuthConnectionStatus(mockIntegrationId, mockTenantId);

      expect(result.connected).toBe(false);
    });

    it('should return connected=true for active credential', async () => {
      const mockFindFirst = vi.mocked(prisma.integrationCredential.findFirst);
      mockFindFirst.mockResolvedValue({
        id: '00000000-0000-0000-0000-000000000003',
        tenantId: mockTenantId,
        integrationId: mockIntegrationId,
        connectionId: null,
        credentialType: CredentialType.oauth2_tokens,
        encryptedData: new Uint8Array(Buffer.from('encrypted')),
        encryptedRefreshToken: null,
        status: CredentialStatus.active,
        expiresAt: new Date(Date.now() + 3600 * 1000),
        scopes: ['read', 'write'],
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await getOAuthConnectionStatus(mockIntegrationId, mockTenantId);

      expect(result.connected).toBe(true);
      expect(result.status).toBe('active');
    });

    it('should return connected=false for expired credential', async () => {
      const mockFindFirst = vi.mocked(prisma.integrationCredential.findFirst);
      mockFindFirst.mockResolvedValue({
        id: '00000000-0000-0000-0000-000000000003',
        tenantId: mockTenantId,
        integrationId: mockIntegrationId,
        connectionId: null,
        credentialType: CredentialType.oauth2_tokens,
        encryptedData: new Uint8Array(Buffer.from('encrypted')),
        encryptedRefreshToken: null,
        status: CredentialStatus.expired,
        expiresAt: new Date(Date.now() - 3600 * 1000),
        scopes: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await getOAuthConnectionStatus(mockIntegrationId, mockTenantId);

      expect(result.connected).toBe(false);
      expect(result.status).toBe('expired');
    });
  });
});
