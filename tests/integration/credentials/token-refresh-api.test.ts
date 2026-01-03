import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

// Mock Prisma
vi.mock('@/lib/db/client', () => ({
  prisma: {
    tenant: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
    integration: {
      findFirst: vi.fn(),
    },
    integrationCredential: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    $queryRaw: vi.fn(),
  },
}));

// Mock encryption
vi.mock('@/lib/modules/credentials/encryption', () => ({
  encryptJson: vi.fn((data) => Buffer.from(JSON.stringify(data))),
  decryptJson: vi.fn((buffer) => JSON.parse(buffer.toString())),
}));

// Mock bcrypt for API key validation
vi.mock('bcrypt', () => ({
  default: {
    compare: vi.fn().mockResolvedValue(true),
    hash: vi.fn().mockResolvedValue('hashed'),
  },
}));

// Mock the token refresh service
vi.mock('@/lib/modules/credentials/token-refresh.service', () => ({
  refreshExpiringTokens: vi.fn(),
  refreshCredentialManually: vi.fn(),
  DEFAULT_BUFFER_MINUTES: 10,
  logBatchRefreshSummary: vi.fn(),
}));

// Mock repository functions
vi.mock('@/lib/modules/credentials/credential.repository', () => ({
  findActiveCredentialForIntegration: vi.fn(),
  findExpiringOAuth2Credentials: vi.fn(),
  tryAcquireRefreshLock: vi.fn(),
  releaseRefreshLock: vi.fn(),
}));

import { prisma } from '@/lib/db/client';
import { findActiveCredentialForIntegration } from '@/lib/modules/credentials/credential.repository';
import { refreshExpiringTokens } from '@/lib/modules/credentials/token-refresh.service';
import type { Integration, IntegrationCredential } from '@prisma/client';
import {
  POST as cronHandler,
  GET as cronStatusHandler,
} from '@/app/api/v1/internal/token-refresh/route';
import {
  POST as manualRefreshHandler,
  GET as refreshInfoHandler,
} from '@/app/api/v1/integrations/[id]/refresh/route';

describe('Token Refresh API Endpoints', () => {
  const mockTenantId = '00000000-0000-0000-0000-000000000001';
  const mockIntegrationId = '00000000-0000-0000-0000-000000000002';
  const mockCredentialId = '00000000-0000-0000-0000-000000000003';

  const mockTenant = {
    id: mockTenantId,
    name: 'Test Tenant',
    email: 'test@example.com',
    waygateApiKeyHash: 'hashed-key',
    settings: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockIntegration = {
    id: mockIntegrationId,
    tenantId: mockTenantId,
    name: 'Test Integration',
    slug: 'test-integration',
    authType: 'oauth2',
    authConfig: {
      clientId: 'client-id',
      clientSecret: 'client-secret',
      tokenUrl: 'https://example.com/oauth/token',
    },
    status: 'active',
    tags: [],
    metadata: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockCredential = {
    id: mockCredentialId,
    tenantId: mockTenantId,
    integrationId: mockIntegrationId,
    credentialType: 'oauth2_tokens',
    encryptedData: Buffer.from('encrypted'),
    encryptedRefreshToken: Buffer.from('encrypted-refresh'),
    status: 'active',
    expiresAt: new Date(Date.now() + 300000), // 5 min from now
    scopes: ['read'],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock implementations
    vi.mocked(prisma.tenant.findMany).mockResolvedValue([mockTenant]);
    vi.mocked(prisma.integration.findFirst).mockResolvedValue(
      mockIntegration as unknown as Integration
    );
    vi.mocked(findActiveCredentialForIntegration).mockResolvedValue(
      mockCredential as unknown as IntegrationCredential
    );
  });

  describe('POST /api/v1/internal/token-refresh (Cron Handler)', () => {
    const createCronRequest = (secret?: string, bufferMinutes?: number) => {
      const url = bufferMinutes
        ? `http://localhost:3000/api/v1/internal/token-refresh?bufferMinutes=${bufferMinutes}`
        : 'http://localhost:3000/api/v1/internal/token-refresh';

      const headers = new Headers();
      if (secret) {
        headers.set('Authorization', `Bearer ${secret}`);
      }

      return new NextRequest(url, {
        method: 'POST',
        headers,
      });
    };

    it('should reject requests without cron secret in production', async () => {
      // Set production mode using vi.stubEnv
      vi.stubEnv('NODE_ENV', 'production');
      vi.stubEnv('CRON_SECRET', 'test-secret');

      const request = createCronRequest(); // No secret

      const response = await cronHandler(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('UNAUTHORIZED');

      vi.unstubAllEnvs();
    });

    it('should reject requests with invalid cron secret', async () => {
      process.env.CRON_SECRET = 'correct-secret';

      const request = createCronRequest('wrong-secret');

      const response = await cronHandler(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.success).toBe(false);
    });

    it('should accept requests with valid cron secret', async () => {
      process.env.CRON_SECRET = 'test-secret';

      vi.mocked(refreshExpiringTokens).mockResolvedValue({
        startedAt: new Date(),
        completedAt: new Date(),
        totalProcessed: 2,
        successful: 2,
        failed: 0,
        skipped: 0,
        results: [],
      });

      const request = createCronRequest('test-secret');

      const response = await cronHandler(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.summary.totalProcessed).toBe(2);
      expect(data.data.summary.successful).toBe(2);
    });

    it('should use custom buffer minutes from query param', async () => {
      process.env.CRON_SECRET = 'test-secret';

      vi.mocked(refreshExpiringTokens).mockResolvedValue({
        startedAt: new Date(),
        completedAt: new Date(),
        totalProcessed: 0,
        successful: 0,
        failed: 0,
        skipped: 0,
        results: [],
      });

      const request = createCronRequest('test-secret', 30);

      await cronHandler(request);

      expect(refreshExpiringTokens).toHaveBeenCalledWith(30);
    });

    it('should return error details when refresh fails', async () => {
      process.env.CRON_SECRET = 'test-secret';

      vi.mocked(refreshExpiringTokens).mockResolvedValue({
        startedAt: new Date(),
        completedAt: new Date(),
        totalProcessed: 1,
        successful: 0,
        failed: 1,
        skipped: 0,
        results: [
          {
            credentialId: mockCredentialId,
            integrationId: mockIntegrationId,
            tenantId: mockTenantId,
            success: false,
            rotatedRefreshToken: false,
            retryCount: 3,
            error: {
              code: 'TOKEN_REFRESH_FAILED',
              message: 'Invalid refresh token',
            },
          },
        ],
      });

      const request = createCronRequest('test-secret');

      const response = await cronHandler(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data.summary.failed).toBe(1);
      expect(data.data.results[0].error.code).toBe('TOKEN_REFRESH_FAILED');
    });

    it('should allow requests in development without CRON_SECRET', async () => {
      vi.stubEnv('NODE_ENV', 'development');
      vi.stubEnv('CRON_SECRET', ''); // Empty CRON_SECRET

      vi.mocked(refreshExpiringTokens).mockResolvedValue({
        startedAt: new Date(),
        completedAt: new Date(),
        totalProcessed: 0,
        successful: 0,
        failed: 0,
        skipped: 0,
        results: [],
      });

      const request = createCronRequest(); // No secret

      const response = await cronHandler(request);

      expect(response.status).toBe(200);

      vi.unstubAllEnvs();
    });
  });

  describe('GET /api/v1/internal/token-refresh (Status)', () => {
    it('should return job configuration', async () => {
      process.env.CRON_SECRET = 'test-secret';

      const request = new NextRequest('http://localhost:3000/api/v1/internal/token-refresh', {
        method: 'GET',
        headers: {
          Authorization: 'Bearer test-secret',
        },
      });

      const response = await cronStatusHandler(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.endpoint).toBe('/api/v1/internal/token-refresh');
      expect(data.data.schedule).toBe('*/5 * * * *');
      expect(data.data.configuration.bufferMinutes).toBe(10);
    });
  });

  // Note: Manual refresh and info endpoints require proper auth middleware setup
  // which is complex to mock in integration tests. These tests verify the route
  // handlers exist and handle authentication requirements.
  // Full integration testing should be done with a test database and real auth flow.

  describe('POST /api/v1/integrations/:id/refresh (Manual Refresh)', () => {
    const createManualRefreshRequest = (integrationId: string, apiKey?: string) => {
      const headers = new Headers();
      if (apiKey) {
        headers.set('Authorization', `Bearer ${apiKey}`);
      }

      return new NextRequest(`http://localhost:3000/api/v1/integrations/${integrationId}/refresh`, {
        method: 'POST',
        headers,
      });
    };

    it('should require authentication', async () => {
      const request = createManualRefreshRequest(mockIntegrationId);

      const response = await manualRefreshHandler(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.success).toBe(false);
    });

    it('should reject requests without valid API key', async () => {
      // Reset bcrypt mock to return false for invalid key
      const bcrypt = await import('bcrypt');
      vi.mocked(bcrypt.default.compare).mockResolvedValueOnce(false as never);

      const request = createManualRefreshRequest(mockIntegrationId, 'invalid_key');

      const response = await manualRefreshHandler(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.success).toBe(false);
    });
  });

  describe('GET /api/v1/integrations/:id/refresh (Refresh Info)', () => {
    it('should require authentication', async () => {
      const request = new NextRequest(
        `http://localhost:3000/api/v1/integrations/${mockIntegrationId}/refresh`,
        { method: 'GET' }
      );

      const response = await refreshInfoHandler(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.success).toBe(false);
    });
  });
});
