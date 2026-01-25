import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CredentialType, CredentialStatus } from '@prisma/client';

// Mock Prisma before importing modules that use it
vi.mock('@/lib/db/client', () => ({
  prisma: {
    integrationCredential: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
  },
}));

// Mock encryption module
vi.mock('@/lib/modules/credentials/encryption', () => ({
  encryptJson: vi.fn((data) => Buffer.from(JSON.stringify(data))),
  decryptJson: vi.fn((buffer) => JSON.parse(buffer.toString())),
}));

// Mock repository functions
vi.mock('@/lib/modules/credentials/credential.repository', () => ({
  createCredential: vi.fn(),
  findActiveCredentialForIntegration: vi.fn(),
  findCredentialByIdAndTenant: vi.fn(),
  findCredentialsByIntegration: vi.fn(),
  updateCredential: vi.fn(),
  revokeCredential: vi.fn(),
  markCredentialNeedsReauth: vi.fn(),
}));

import { encryptJson, decryptJson } from '@/lib/modules/credentials/encryption';
import {
  createCredential,
  findActiveCredentialForIntegration,
  findCredentialByIdAndTenant,
  revokeCredential as repoRevokeCredential,
} from '@/lib/modules/credentials/credential.repository';
import {
  storeOAuth2Credential,
  storeApiKeyCredential,
  storeBasicCredential,
  storeBearerCredential,
  getDecryptedCredential,
  getCredentialStatus,
  revokeCredential,
  isCredentialExpired,
  needsRefresh,
} from '@/lib/modules/credentials/credential.service';

describe('Credential Service', () => {
  const mockTenantId = '00000000-0000-0000-0000-000000000001';
  const mockIntegrationId = '00000000-0000-0000-0000-000000000002';
  const mockCredentialId = '00000000-0000-0000-0000-000000000003';

  const mockCredentialRecord = {
    id: mockCredentialId,
    tenantId: mockTenantId,
    integrationId: mockIntegrationId,
    connectionId: null, // Added for multi-app connections support
    credentialType: CredentialType.oauth2_tokens,
    encryptedData: Buffer.from('encrypted'),
    encryptedRefreshToken: null,
    status: CredentialStatus.active,
    expiresAt: new Date(Date.now() + 3600 * 1000),
    scopes: ['read', 'write'],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('storeOAuth2Credential', () => {
    it('should encrypt and store OAuth2 credentials', async () => {
      const mockCreate = vi.mocked(createCredential);
      mockCreate.mockResolvedValue(mockCredentialRecord);

      const oauth2Data = {
        accessToken: 'access-token-123',
        refreshToken: 'refresh-token-456',
        tokenType: 'Bearer',
        expiresIn: 3600,
        scopes: ['read', 'write'],
      };

      const result = await storeOAuth2Credential(mockTenantId, mockIntegrationId, oauth2Data);

      expect(encryptJson).toHaveBeenCalled();
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: mockTenantId,
          integrationId: mockIntegrationId,
          credentialType: CredentialType.oauth2_tokens,
          scopes: ['read', 'write'],
        })
      );
      expect(result.id).toBe(mockCredentialId);
    });

    it('should calculate expiration time correctly', async () => {
      const mockCreate = vi.mocked(createCredential);
      mockCreate.mockResolvedValue(mockCredentialRecord);

      const oauth2Data = {
        accessToken: 'access-token-123',
        expiresIn: 3600, // 1 hour
      };

      await storeOAuth2Credential(mockTenantId, mockIntegrationId, oauth2Data);

      const createCall = mockCreate.mock.calls[0][0];
      expect(createCall.expiresAt).toBeDefined();
      // Should be approximately 1 hour from now
      const expiresAt = createCall.expiresAt as Date;
      const hourFromNow = Date.now() + 3600 * 1000;
      expect(Math.abs(expiresAt.getTime() - hourFromNow)).toBeLessThan(1000);
    });
  });

  describe('storeApiKeyCredential', () => {
    it('should encrypt and store API key credentials', async () => {
      const mockCreate = vi.mocked(createCredential);
      mockCreate.mockResolvedValue({
        ...mockCredentialRecord,
        credentialType: CredentialType.api_key,
      });

      const apiKeyData = {
        apiKey: 'sk-1234567890',
        placement: 'header' as const,
        paramName: 'X-API-Key',
      };

      const result = await storeApiKeyCredential(mockTenantId, mockIntegrationId, apiKeyData);

      expect(encryptJson).toHaveBeenCalledWith(apiKeyData);
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          credentialType: CredentialType.api_key,
        })
      );
      expect(result.id).toBe(mockCredentialId);
    });
  });

  describe('storeBasicCredential', () => {
    it('should encrypt and store Basic auth credentials', async () => {
      const mockCreate = vi.mocked(createCredential);
      mockCreate.mockResolvedValue({
        ...mockCredentialRecord,
        credentialType: CredentialType.basic,
      });

      const basicData = {
        username: 'user@example.com',
        password: 'secret-password',
      };

      const result = await storeBasicCredential(mockTenantId, mockIntegrationId, basicData);

      expect(encryptJson).toHaveBeenCalledWith(basicData);
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          credentialType: CredentialType.basic,
        })
      );
      expect(result.id).toBe(mockCredentialId);
    });
  });

  describe('storeBearerCredential', () => {
    it('should encrypt and store Bearer token credentials', async () => {
      const mockCreate = vi.mocked(createCredential);
      mockCreate.mockResolvedValue({
        ...mockCredentialRecord,
        credentialType: CredentialType.bearer,
      });

      const bearerData = {
        token: 'bearer-token-xyz',
      };

      const result = await storeBearerCredential(mockTenantId, mockIntegrationId, bearerData);

      expect(encryptJson).toHaveBeenCalledWith(bearerData);
      expect(result.id).toBe(mockCredentialId);
    });
  });

  describe('getDecryptedCredential', () => {
    it('should return decrypted OAuth2 credentials', async () => {
      const mockFindActive = vi.mocked(findActiveCredentialForIntegration);
      const oauthData = {
        accessToken: 'access-token',
        tokenType: 'Bearer',
      };

      mockFindActive.mockResolvedValue({
        ...mockCredentialRecord,
        encryptedData: Buffer.from(JSON.stringify(oauthData)),
      });

      const result = await getDecryptedCredential(mockIntegrationId, mockTenantId);

      expect(mockFindActive).toHaveBeenCalledWith(mockIntegrationId, mockTenantId, undefined);
      expect(decryptJson).toHaveBeenCalled();
      expect(result).toBeDefined();
      expect(result!.data).toEqual(oauthData);
    });

    it('should return null when no credential found', async () => {
      const mockFindActive = vi.mocked(findActiveCredentialForIntegration);
      mockFindActive.mockResolvedValue(null);

      const result = await getDecryptedCredential(mockIntegrationId, mockTenantId);

      expect(result).toBeNull();
    });
  });

  describe('getCredentialStatus', () => {
    it('should return credential status without secrets', async () => {
      const mockFindActive = vi.mocked(findActiveCredentialForIntegration);
      mockFindActive.mockResolvedValue(mockCredentialRecord);

      const result = await getCredentialStatus(mockIntegrationId, mockTenantId);

      expect(result).toBeDefined();
      expect(result!.status).toBe('active');
      expect(result!.credentialType).toBe('oauth2_tokens');
      expect(result!.scopes).toEqual(['read', 'write']);
      // Should NOT contain encrypted data or actual secrets
      expect(result).not.toHaveProperty('encryptedData');
      expect(result).not.toHaveProperty('accessToken');
    });

    it('should return null when no credential found', async () => {
      const mockFindActive = vi.mocked(findActiveCredentialForIntegration);
      mockFindActive.mockResolvedValue(null);

      const result = await getCredentialStatus(mockIntegrationId, mockTenantId);

      expect(result).toBeNull();
    });
  });

  describe('revokeCredential', () => {
    it('should revoke credential after verifying ownership', async () => {
      const mockFindById = vi.mocked(findCredentialByIdAndTenant);
      const mockRepoRevoke = vi.mocked(repoRevokeCredential);

      mockFindById.mockResolvedValue(mockCredentialRecord);
      mockRepoRevoke.mockResolvedValue({
        ...mockCredentialRecord,
        status: CredentialStatus.revoked,
      });

      const result = await revokeCredential(mockCredentialId, mockTenantId);

      expect(mockFindById).toHaveBeenCalledWith(mockCredentialId, mockTenantId);
      expect(mockRepoRevoke).toHaveBeenCalledWith(mockCredentialId);
      expect(result!.status).toBe(CredentialStatus.revoked);
    });

    it('should return null if credential not found', async () => {
      const mockFindById = vi.mocked(findCredentialByIdAndTenant);
      mockFindById.mockResolvedValue(null);

      const result = await revokeCredential(mockCredentialId, mockTenantId);

      expect(result).toBeNull();
    });
  });

  describe('isCredentialExpired', () => {
    it('should return false for credential without expiration', () => {
      const credential = {
        ...mockCredentialRecord,
        expiresAt: null,
      };

      expect(isCredentialExpired(credential)).toBe(false);
    });

    it('should return false for credential not yet expired', () => {
      const credential = {
        ...mockCredentialRecord,
        expiresAt: new Date(Date.now() + 3600 * 1000), // 1 hour from now
      };

      expect(isCredentialExpired(credential)).toBe(false);
    });

    it('should return true for expired credential', () => {
      const credential = {
        ...mockCredentialRecord,
        expiresAt: new Date(Date.now() - 1000), // 1 second ago
      };

      expect(isCredentialExpired(credential)).toBe(true);
    });

    it('should return true when within buffer period', () => {
      const credential = {
        ...mockCredentialRecord,
        expiresAt: new Date(Date.now() + 60 * 1000), // 1 minute from now
      };

      // With 5 minute buffer, should be considered expired
      expect(isCredentialExpired(credential, 300)).toBe(true);
    });
  });

  describe('needsRefresh', () => {
    it('should return false for non-OAuth2 credentials', () => {
      const credential = {
        ...mockCredentialRecord,
        credentialType: CredentialType.api_key,
        expiresAt: new Date(Date.now() - 1000), // Expired
      };

      expect(needsRefresh(credential)).toBe(false);
    });

    it('should return true for expired OAuth2 credential', () => {
      const credential = {
        ...mockCredentialRecord,
        credentialType: CredentialType.oauth2_tokens,
        expiresAt: new Date(Date.now() - 1000),
      };

      expect(needsRefresh(credential)).toBe(true);
    });

    it('should return false for OAuth2 credential not yet expiring', () => {
      const credential = {
        ...mockCredentialRecord,
        credentialType: CredentialType.oauth2_tokens,
        expiresAt: new Date(Date.now() + 3600 * 1000),
      };

      expect(needsRefresh(credential)).toBe(false);
    });
  });
});
