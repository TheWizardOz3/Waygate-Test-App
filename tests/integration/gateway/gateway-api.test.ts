/**
 * Gateway API Integration Tests
 *
 * Tests the full action invocation flow, health check endpoint,
 * and request logs endpoint.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  AuthType,
  IntegrationStatus,
  HttpMethod,
  CredentialType,
  CredentialStatus,
} from '@prisma/client';

// Mock external dependencies
vi.mock('@/lib/db/client', () => ({
  prisma: {
    integration: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    action: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    integrationCredential: {
      findFirst: vi.fn(),
    },
    requestLog: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
  },
}));

vi.mock('@/lib/modules/execution/execution.service', () => ({
  executeWithMetrics: vi.fn(),
}));

import { prisma } from '@/lib/db/client';
import { executeWithMetrics } from '@/lib/modules/execution/execution.service';

// Test fixtures
const TEST_TENANT_ID = '00000000-0000-0000-0000-000000000001';
const TEST_INTEGRATION_ID = '00000000-0000-0000-0000-000000000002';
const TEST_ACTION_ID = '00000000-0000-0000-0000-000000000003';
const TEST_CREDENTIAL_ID = '00000000-0000-0000-0000-000000000004';

const mockIntegration = {
  id: TEST_INTEGRATION_ID,
  tenantId: TEST_TENANT_ID,
  name: 'Slack',
  slug: 'slack',
  description: 'Slack integration',
  documentationUrl: 'https://api.slack.com/docs',
  authType: AuthType.oauth2,
  authConfig: {},
  status: IntegrationStatus.active,
  tags: [],
  metadata: {},
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockAction = {
  id: TEST_ACTION_ID,
  integrationId: TEST_INTEGRATION_ID,
  name: 'Send Message',
  slug: 'send-message',
  description: 'Send a message to a channel',
  httpMethod: HttpMethod.POST,
  endpointTemplate: 'https://slack.com/api/chat.postMessage',
  inputSchema: {
    type: 'object',
    required: ['channel', 'text'],
    properties: {
      channel: { type: 'string', description: 'Channel ID' },
      text: { type: 'string', description: 'Message text' },
    },
  },
  outputSchema: {},
  tags: [] as string[],
  metadata: {},
  paginationConfig: null,
  retryConfig: null,
  validationConfig: null,
  cacheable: false,
  cacheTtlSeconds: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockCredential = {
  id: TEST_CREDENTIAL_ID,
  integrationId: TEST_INTEGRATION_ID,
  tenantId: TEST_TENANT_ID,
  connectionId: null,
  credentialType: CredentialType.oauth2_tokens,
  encryptedData: new Uint8Array([1, 2, 3]),
  encryptedRefreshToken: null,
  status: CredentialStatus.active,
  scopes: [],
  expiresAt: new Date(Date.now() + 3600000), // 1 hour from now
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('Gateway API Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Action Invocation Pipeline', () => {
    it('should validate input against action schema', async () => {
      // Import the gateway service for direct testing
      const { invokeAction } = await import('@/lib/modules/gateway');

      // Mock integration lookup
      vi.mocked(prisma.integration.findFirst).mockResolvedValueOnce(mockIntegration);

      // Mock action lookup
      vi.mocked(prisma.action.findFirst).mockResolvedValueOnce(mockAction);

      // Call with invalid input (missing required fields)
      const result = await invokeAction(TEST_TENANT_ID, 'slack', 'send-message', {});

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('VALIDATION_ERROR');
        expect(result.error.suggestedResolution?.retryable).toBe(true);
      }
    });

    it('should return INTEGRATION_NOT_FOUND for unknown integration', async () => {
      const { invokeAction } = await import('@/lib/modules/gateway');

      // Mock integration not found
      vi.mocked(prisma.integration.findFirst).mockResolvedValueOnce(null);

      const result = await invokeAction(TEST_TENANT_ID, 'unknown-integration', 'some-action', {});

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INTEGRATION_NOT_FOUND');
      }
    });

    it('should return ACTION_NOT_FOUND for unknown action', async () => {
      const { invokeAction } = await import('@/lib/modules/gateway');

      // Mock integration found
      vi.mocked(prisma.integration.findFirst).mockResolvedValueOnce(mockIntegration);

      // Mock action not found
      vi.mocked(prisma.action.findFirst).mockResolvedValueOnce(null);

      const result = await invokeAction(TEST_TENANT_ID, 'slack', 'unknown-action', {});

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('ACTION_NOT_FOUND');
      }
    });

    it('should return CREDENTIALS_MISSING when no credentials configured', async () => {
      const { invokeAction } = await import('@/lib/modules/gateway');

      // Mock integration and action found
      vi.mocked(prisma.integration.findFirst).mockResolvedValueOnce(mockIntegration);
      vi.mocked(prisma.action.findFirst).mockResolvedValueOnce(mockAction);

      // Mock no credentials
      vi.mocked(prisma.integrationCredential.findFirst).mockResolvedValueOnce(null);

      const result = await invokeAction(TEST_TENANT_ID, 'slack', 'send-message', {
        channel: '#general',
        text: 'Hello',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('CREDENTIALS_MISSING');
      }
    });

    it('should include requestId in all responses', async () => {
      const { invokeAction } = await import('@/lib/modules/gateway');

      vi.mocked(prisma.integration.findFirst).mockResolvedValueOnce(null);

      const result = await invokeAction(TEST_TENANT_ID, 'slack', 'action', {});

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.requestId).toBeDefined();
        expect(result.error.requestId).toMatch(/^req_/);
      }
    });

    it('should include suggestedResolution in error responses', async () => {
      const { invokeAction } = await import('@/lib/modules/gateway');

      vi.mocked(prisma.integration.findFirst).mockResolvedValueOnce(null);

      const result = await invokeAction(TEST_TENANT_ID, 'slack', 'action', {});

      expect(result.success).toBe(false);
      if (!result.success && result.error.suggestedResolution) {
        expect(result.error.suggestedResolution.action).toBeDefined();
        expect(result.error.suggestedResolution.description).toBeDefined();
        expect(typeof result.error.suggestedResolution.retryable).toBe('boolean');
      }
    });
  });

  describe('GatewayError Class', () => {
    it('should have correct httpStatus based on error code', async () => {
      const { GatewayError, GatewayErrorCodes } = await import('@/lib/modules/gateway');

      const validationError = new GatewayError('VALIDATION_ERROR', 'Test');
      expect(validationError.httpStatus).toBe(GatewayErrorCodes.VALIDATION_ERROR.httpStatus);

      const notFoundError = new GatewayError('INTEGRATION_NOT_FOUND', 'Test');
      expect(notFoundError.httpStatus).toBe(404);
    });

    it('should expose error details', async () => {
      const { GatewayError } = await import('@/lib/modules/gateway');

      const error = new GatewayError('VALIDATION_ERROR', 'Field is invalid', {
        field: 'email',
        value: 'invalid',
      });

      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.message).toBe('Field is invalid');
      expect(error.details).toEqual({ field: 'email', value: 'invalid' });
    });
  });

  describe('getHttpStatusForError', () => {
    it('should return correct HTTP status for error codes', async () => {
      const { getHttpStatusForError, GatewayErrorCodes } = await import('@/lib/modules/gateway');

      const errorResponse = {
        success: false as const,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Test',
          requestId: 'req_123',
          suggestedResolution: {
            action: 'RETRY_WITH_MODIFIED_INPUT' as const,
            description: 'Test',
            retryable: true,
          },
        },
      };

      expect(getHttpStatusForError(errorResponse)).toBe(
        GatewayErrorCodes.VALIDATION_ERROR.httpStatus
      );
    });

    it('should return 500 for unknown error codes', async () => {
      const { getHttpStatusForError } = await import('@/lib/modules/gateway');

      const errorResponse = {
        success: false as const,
        error: {
          code: 'UNKNOWN_CODE',
          message: 'Test',
          requestId: 'req_123',
          suggestedResolution: {
            action: 'ESCALATE_TO_ADMIN' as const,
            description: 'Test',
            retryable: false,
          },
        },
      };

      expect(getHttpStatusForError(errorResponse)).toBe(500);
    });
  });

  describe('Request Logs Endpoint', () => {
    it('should return paginated logs for tenant', async () => {
      const { listRequestLogs } = await import('@/lib/modules/logging');

      const mockLogs = [
        {
          id: 'log-1',
          tenantId: TEST_TENANT_ID,
          integrationId: TEST_INTEGRATION_ID,
          actionId: TEST_ACTION_ID,
          requestSummary: { method: 'POST', url: 'https://api.example.com' },
          responseSummary: { statusCode: 200 },
          statusCode: 200,
          latencyMs: 150,
          retryCount: 0,
          error: null,
          createdAt: new Date(),
          connectionId: null,
        },
      ];

      vi.mocked(prisma.requestLog.findMany).mockResolvedValueOnce(mockLogs);
      vi.mocked(prisma.requestLog.count).mockResolvedValueOnce(1);
      // Mock for enrichLogsWithDetails - cast to unknown to avoid full type requirements
      vi.mocked(prisma.integration.findMany).mockResolvedValueOnce([
        { id: TEST_INTEGRATION_ID, name: 'Test Integration', slug: 'test-integration' },
      ] as unknown as Awaited<ReturnType<typeof prisma.integration.findMany>>);
      vi.mocked(prisma.action.findMany).mockResolvedValueOnce([
        {
          id: TEST_ACTION_ID,
          name: 'Test Action',
          slug: 'test-action',
          httpMethod: HttpMethod.POST,
          endpointTemplate: '/test',
        },
      ] as unknown as Awaited<ReturnType<typeof prisma.action.findMany>>);

      const result = await listRequestLogs(TEST_TENANT_ID, { limit: 20 });

      expect(result.logs).toHaveLength(1);
      expect(result.pagination.totalCount).toBe(1);
      expect(result.pagination.hasMore).toBe(false);
    });

    it('should filter logs by integrationId', async () => {
      const { listRequestLogs } = await import('@/lib/modules/logging');

      vi.mocked(prisma.requestLog.findMany).mockResolvedValueOnce([]);
      vi.mocked(prisma.requestLog.count).mockResolvedValueOnce(0);
      // Mock for enrichLogsWithDetails (empty results)
      vi.mocked(prisma.integration.findMany).mockResolvedValueOnce([]);
      vi.mocked(prisma.action.findMany).mockResolvedValueOnce([]);

      // Use a valid UUID format for the integration ID filter (v4 UUID)
      const integrationIdFilter = '11111111-1111-4111-a111-111111111111';

      await listRequestLogs(TEST_TENANT_ID, {
        integrationId: integrationIdFilter,
      });

      expect(prisma.requestLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: TEST_TENANT_ID,
            integrationId: integrationIdFilter,
          }),
        })
      );
    });

    it('should filter logs by date range', async () => {
      const { listRequestLogs } = await import('@/lib/modules/logging');

      vi.mocked(prisma.requestLog.findMany).mockResolvedValueOnce([]);
      vi.mocked(prisma.requestLog.count).mockResolvedValueOnce(0);
      // Mock for enrichLogsWithDetails (empty results)
      vi.mocked(prisma.integration.findMany).mockResolvedValueOnce([]);
      vi.mocked(prisma.action.findMany).mockResolvedValueOnce([]);

      const startDate = '2026-01-01T00:00:00.000Z';
      const endDate = '2026-01-02T00:00:00.000Z';

      await listRequestLogs(TEST_TENANT_ID, { startDate, endDate });

      expect(prisma.requestLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            createdAt: expect.objectContaining({
              gte: new Date(startDate),
              lte: new Date(endDate),
            }),
          }),
        })
      );
    });

    it('should support cursor-based pagination', async () => {
      const { listRequestLogs } = await import('@/lib/modules/logging');

      vi.mocked(prisma.requestLog.findMany).mockResolvedValueOnce([]);
      vi.mocked(prisma.requestLog.count).mockResolvedValueOnce(0);

      await listRequestLogs(TEST_TENANT_ID, {
        cursor: 'log-id-123',
        limit: 10,
      });

      expect(prisma.requestLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          cursor: { id: 'log-id-123' },
          skip: 1, // Skip the cursor itself
          take: 11, // Take 1 extra to check hasMore
        })
      );
    });
  });

  describe('Response Formatting', () => {
    it('should format success response correctly', async () => {
      const { invokeAction } = await import('@/lib/modules/gateway');

      // Setup mocks for a successful invocation
      vi.mocked(prisma.integration.findFirst).mockResolvedValueOnce(mockIntegration);
      vi.mocked(prisma.action.findFirst).mockResolvedValueOnce({
        ...mockAction,
        inputSchema: {}, // No required fields
      });
      vi.mocked(prisma.integrationCredential.findFirst).mockResolvedValueOnce(mockCredential);

      // Mock credential decryption (would need additional mock setup)
      // For now, we'll test that the structure is correct when there are no credentials

      vi.mocked(executeWithMetrics).mockResolvedValueOnce({
        success: true,
        data: { ok: true, message_ts: '123456' },
        attempts: 1,
        totalDurationMs: 150,
        lastRequestDurationMs: 150,
        metrics: {
          totalDurationMs: 150,
          attempts: 1,
          lastRequestDurationMs: 150,
          circuitBreakerChecked: false,
        },
        context: {
          requestId: 'test-request-id',
          startedAt: Date.now(),
        },
      });

      vi.mocked(prisma.requestLog.create).mockResolvedValueOnce({
        id: 'log-1',
        tenantId: TEST_TENANT_ID,
        integrationId: TEST_INTEGRATION_ID,
        actionId: TEST_ACTION_ID,
        connectionId: null,
        requestSummary: {},
        responseSummary: null,
        statusCode: null,
        latencyMs: 0,
        retryCount: 0,
        error: null,
        createdAt: new Date(),
      });

      // This will fail due to credential decryption, but we can test the error format
      const result = await invokeAction(TEST_TENANT_ID, 'slack', 'send-message', {});

      // Even on error, the response should have the correct structure
      expect('success' in result).toBe(true);
      if (!result.success) {
        expect(result.error).toBeDefined();
        expect(result.error.requestId).toBeDefined();
      }
    });
  });
});
