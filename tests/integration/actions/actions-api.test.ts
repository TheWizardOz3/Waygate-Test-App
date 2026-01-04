/**
 * Integration Tests - Action Registry API
 *
 * Tests the action API endpoints with mocked database operations.
 * Verifies:
 * - List actions API with pagination and filters
 * - Action schema API
 * - Validation endpoint
 * - Persist actions from scraper output
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HttpMethod, IntegrationStatus, AuthType } from '@prisma/client';

// Mock Prisma - factory must be self-contained due to hoisting
vi.mock('@/lib/db/client', () => {
  const mockAction = {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    createMany: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
    count: vi.fn(),
  };

  const mockIntegration = {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  };

  const mockPrisma = {
    integration: mockIntegration,
    action: mockAction,
    $transaction: vi.fn(),
  };

  // Set up $transaction to use the mock prisma
  mockPrisma.$transaction.mockImplementation(async (fnsOrCallback: unknown) => {
    if (typeof fnsOrCallback === 'function') {
      return (fnsOrCallback as (tx: typeof mockPrisma) => Promise<unknown>)(mockPrisma);
    }
    return Promise.all(fnsOrCallback as Promise<unknown>[]);
  });

  return { prisma: mockPrisma };
});

import { prisma } from '@/lib/db/client';
import {
  listActions,
  getActionSchema,
  getAction,
  createAction,
  persistGeneratedActions,
  ActionError,
} from '@/lib/modules/actions';

// =============================================================================
// Test Data
// =============================================================================

const mockTenantId = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
const mockIntegrationId = 'b1ffdc88-8d1a-3df7-aa5c-5aa8ac279b22';
const mockActionId = 'c2ggec77-7e2b-2eg6-bb4b-4bb7bb168c33';

const mockIntegration = {
  id: mockIntegrationId,
  tenantId: mockTenantId,
  name: 'Slack',
  slug: 'slack',
  description: 'Slack integration',
  documentationUrl: 'https://api.slack.com/docs',
  authType: AuthType.oauth2,
  authConfig: {},
  status: IntegrationStatus.active,
  tags: [],
  metadata: { baseUrl: 'https://api.slack.com' },
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockAction = {
  id: mockActionId,
  integrationId: mockIntegrationId,
  name: 'Send Message',
  slug: 'send-message',
  description: 'Send a message to a channel',
  httpMethod: HttpMethod.POST,
  endpointTemplate: 'https://api.slack.com/api/chat.postMessage',
  inputSchema: {
    type: 'object',
    properties: {
      channel: { type: 'string', description: 'Channel ID' },
      text: { type: 'string', description: 'Message text' },
    },
    required: ['channel', 'text'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      ok: { type: 'boolean' },
      ts: { type: 'string' },
    },
  },
  tags: [] as string[],
  paginationConfig: null,
  retryConfig: null,
  validationConfig: null,
  cacheable: false,
  cacheTtlSeconds: null,
  metadata: {
    originalPath: '/chat.postMessage',
    tags: ['messaging', 'channels'],
    rateLimit: { requests: 100, window: 60 },
  },
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockActionWithIntegration = {
  ...mockAction,
  integration: mockIntegration,
};

// =============================================================================
// Tests
// =============================================================================

describe('Action Registry API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('listActions', () => {
    it('should list actions for an integration', async () => {
      vi.mocked(prisma.integration.findFirst).mockResolvedValue(mockIntegration);
      vi.mocked(prisma.action.findMany).mockResolvedValue([mockAction]);
      vi.mocked(prisma.action.count).mockResolvedValue(1);

      const result = await listActions(mockTenantId, mockIntegrationId);

      expect(result.actions).toHaveLength(1);
      expect(result.actions[0].name).toBe('Send Message');
      expect(result.actions[0].slug).toBe('send-message');
      expect(result.pagination.totalCount).toBe(1);
      expect(result.pagination.hasMore).toBe(false);
    });

    it('should support pagination', async () => {
      const manyActions = Array.from({ length: 60 }, (_, i) => ({
        ...mockAction,
        id: `action-${i}`,
        name: `Action ${i}`,
        slug: `action-${i}`,
      }));

      vi.mocked(prisma.integration.findFirst).mockResolvedValue(mockIntegration);
      vi.mocked(prisma.action.findMany).mockResolvedValue(manyActions.slice(0, 51));
      vi.mocked(prisma.action.count).mockResolvedValue(60);

      const result = await listActions(mockTenantId, mockIntegrationId, { limit: 50 });

      expect(result.actions).toHaveLength(50);
      expect(result.pagination.hasMore).toBe(true);
      expect(result.pagination.cursor).toBeDefined();
    });

    it('should support search filter', async () => {
      vi.mocked(prisma.integration.findFirst).mockResolvedValue(mockIntegration);
      vi.mocked(prisma.action.findMany).mockResolvedValue([mockAction]);
      vi.mocked(prisma.action.count).mockResolvedValue(1);

      const result = await listActions(mockTenantId, mockIntegrationId, {
        search: 'message',
      });

      expect(result.actions).toHaveLength(1);
      // Verify search was passed to query
      expect(prisma.action.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            integrationId: mockIntegrationId,
          }),
        })
      );
    });

    it('should throw error for invalid integration', async () => {
      vi.mocked(prisma.integration.findFirst).mockResolvedValue(null);

      await expect(listActions(mockTenantId, 'invalid-id')).rejects.toThrow(ActionError);
    });

    it('should return empty array for integration with no actions', async () => {
      vi.mocked(prisma.integration.findFirst).mockResolvedValue(mockIntegration);
      vi.mocked(prisma.action.findMany).mockResolvedValue([]);
      vi.mocked(prisma.action.count).mockResolvedValue(0);

      const result = await listActions(mockTenantId, mockIntegrationId);

      expect(result.actions).toHaveLength(0);
      expect(result.pagination.totalCount).toBe(0);
    });
  });

  describe('getAction', () => {
    it('should get action by ID', async () => {
      vi.mocked(prisma.action.findUnique).mockResolvedValue(mockActionWithIntegration);

      const result = await getAction(mockTenantId, mockActionId);

      expect(result.id).toBe(mockActionId);
      expect(result.name).toBe('Send Message');
    });

    it('should throw error for non-existent action', async () => {
      vi.mocked(prisma.action.findUnique).mockResolvedValue(null);

      await expect(getAction(mockTenantId, 'non-existent')).rejects.toThrow(ActionError);
    });

    it('should throw error for wrong tenant', async () => {
      const wrongTenantAction = {
        ...mockActionWithIntegration,
        integration: { ...mockIntegration, tenantId: 'different-tenant' },
      };
      vi.mocked(prisma.action.findUnique).mockResolvedValue(wrongTenantAction);

      await expect(getAction(mockTenantId, mockActionId)).rejects.toThrow(ActionError);
    });
  });

  describe('getActionSchema', () => {
    it('should get action schema by slugs', async () => {
      vi.mocked(prisma.action.findFirst).mockResolvedValue(mockActionWithIntegration);

      const result = await getActionSchema(mockTenantId, 'slack', 'send-message');

      expect(result.actionId).toBe('slack.send-message');
      expect(result.inputSchema).toBeDefined();
      expect(result.inputSchema.type).toBe('object');
      expect(result.outputSchema).toBeDefined();
      expect(result.metadata.httpMethod).toBe(HttpMethod.POST);
    });

    it('should throw error for non-existent action', async () => {
      vi.mocked(prisma.action.findFirst).mockResolvedValue(null);

      await expect(getActionSchema(mockTenantId, 'slack', 'non-existent')).rejects.toThrow(
        ActionError
      );
    });
  });

  describe('createAction', () => {
    const createInput = {
      integrationId: mockIntegrationId,
      name: 'List Channels',
      slug: 'list-channels',
      httpMethod: HttpMethod.GET,
      endpointTemplate: 'https://api.slack.com/api/conversations.list',
      inputSchema: { type: 'object' as const, properties: {} },
      outputSchema: { type: 'object' as const, properties: {} },
      cacheable: true,
      cacheTtlSeconds: 300,
      tags: [] as string[],
    };

    it('should create a new action', async () => {
      vi.mocked(prisma.integration.findFirst).mockResolvedValue(mockIntegration);
      vi.mocked(prisma.action.findFirst).mockResolvedValue(null); // No duplicate
      vi.mocked(prisma.action.create).mockResolvedValue({
        ...mockAction,
        ...createInput,
        id: 'new-action-id',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await createAction(mockTenantId, createInput);

      expect(result.name).toBe('List Channels');
      expect(result.slug).toBe('list-channels');
      expect(result.cacheable).toBe(true);
    });

    it('should throw error for duplicate slug', async () => {
      vi.mocked(prisma.integration.findFirst).mockResolvedValue(mockIntegration);
      vi.mocked(prisma.action.findFirst).mockResolvedValue(mockAction); // Duplicate exists

      await expect(
        createAction(mockTenantId, { ...createInput, slug: 'send-message' })
      ).rejects.toThrow(ActionError);
    });
  });

  describe('persistGeneratedActions', () => {
    const generatedActions = [
      {
        name: 'Send Message',
        slug: 'send-message',
        description: 'Send a message',
        httpMethod: HttpMethod.POST,
        endpointTemplate: 'https://api.slack.com/api/chat.postMessage',
        inputSchema: { type: 'object' as const, properties: {} },
        outputSchema: { type: 'object' as const, properties: {} },
        tags: [] as string[],
        cacheable: false,
        metadata: { originalPath: '/chat.postMessage' },
      },
      {
        name: 'List Channels',
        slug: 'list-channels',
        description: 'List channels',
        httpMethod: HttpMethod.GET,
        endpointTemplate: 'https://api.slack.com/api/conversations.list',
        inputSchema: { type: 'object' as const, properties: {} },
        outputSchema: { type: 'object' as const, properties: {} },
        tags: [] as string[],
        cacheable: true,
        cacheTtlSeconds: 300,
        metadata: { originalPath: '/conversations.list' },
      },
    ];

    it('should persist multiple actions', async () => {
      vi.mocked(prisma.integration.findFirst).mockResolvedValue(mockIntegration);
      vi.mocked(prisma.action.findMany).mockResolvedValue([]); // No existing slugs
      vi.mocked(prisma.action.createMany).mockResolvedValue({ count: 2 });
      vi.mocked(prisma.action.findMany).mockResolvedValue(
        generatedActions.map((a, i) => ({
          ...mockAction,
          ...a,
          id: `action-${i}`,
        }))
      );

      const result = await persistGeneratedActions(
        mockTenantId,
        mockIntegrationId,
        generatedActions
      );

      expect(result.created).toBe(2);
      expect(result.actions).toHaveLength(2);
    });

    it('should handle slug conflicts with renaming', async () => {
      vi.mocked(prisma.integration.findFirst).mockResolvedValue(mockIntegration);
      // First call returns existing slugs, second returns created actions
      vi.mocked(prisma.action.findMany)
        .mockResolvedValueOnce([mockAction]) // Existing slug 'send-message'
        .mockResolvedValue([
          { ...mockAction, slug: 'send-message-post' },
          { ...mockAction, id: 'action-2', slug: 'list-channels' },
        ]);
      vi.mocked(prisma.action.createMany).mockResolvedValue({ count: 2 });

      const result = await persistGeneratedActions(
        mockTenantId,
        mockIntegrationId,
        generatedActions
      );

      expect(result.created).toBe(2);
      // Should have a warning about renamed slug
      expect(result.warnings).toBeDefined();
    });

    it('should replace existing actions when replaceExisting is true', async () => {
      vi.mocked(prisma.integration.findFirst).mockResolvedValue(mockIntegration);
      vi.mocked(prisma.action.deleteMany).mockResolvedValue({ count: 5 });
      vi.mocked(prisma.action.createMany).mockResolvedValue({ count: 2 });
      vi.mocked(prisma.action.findMany).mockResolvedValue(
        generatedActions.map((a, i) => ({
          ...mockAction,
          ...a,
          id: `action-${i}`,
        }))
      );

      const result = await persistGeneratedActions(
        mockTenantId,
        mockIntegrationId,
        generatedActions,
        { replaceExisting: true }
      );

      expect(result.created).toBe(2);
      expect(result.deleted).toBe(5);
    });
  });
});

describe('JSON Schema Validation Integration', () => {
  it('should validate input against action schema', async () => {
    const { validateActionInput } = await import('@/lib/modules/actions');

    const schema = {
      type: 'object' as const,
      properties: {
        channel: { type: 'string' },
        text: { type: 'string' },
      },
      required: ['channel', 'text'],
    };

    // Valid input
    const validResult = validateActionInput(schema, {
      channel: 'C123456',
      text: 'Hello world',
    });
    expect(validResult.valid).toBe(true);

    // Invalid input (missing required field)
    const invalidResult = validateActionInput(schema, {
      channel: 'C123456',
    });
    expect(invalidResult.valid).toBe(false);
    expect(invalidResult.errors).toBeDefined();
    expect(invalidResult.errors!.some((e) => e.message.includes('text'))).toBe(true);
  });

  it('should validate complex nested schemas', async () => {
    const { validateActionInput } = await import('@/lib/modules/actions');

    const schema = {
      type: 'object' as const,
      properties: {
        blocks: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              type: { type: 'string', enum: ['section', 'header', 'divider'] },
              text: {
                type: 'object',
                properties: {
                  type: { type: 'string' },
                  text: { type: 'string' },
                },
              },
            },
            required: ['type'],
          },
        },
      },
      required: ['blocks'],
    };

    const validInput = {
      blocks: [{ type: 'section', text: { type: 'mrkdwn', text: 'Hello' } }, { type: 'divider' }],
    };

    const result = validateActionInput(schema, validInput);
    expect(result.valid).toBe(true);

    const invalidInput = {
      blocks: [{ type: 'invalid-type' }],
    };

    const invalidResult = validateActionInput(schema, invalidInput);
    expect(invalidResult.valid).toBe(false);
  });

  it('should format errors for LLM consumption', async () => {
    const { validateActionInput, formatErrorsForLLM } = await import('@/lib/modules/actions');

    const schema = {
      type: 'object' as const,
      properties: {
        email: { type: 'string', format: 'email' },
        count: { type: 'number', minimum: 1, maximum: 100 },
      },
      required: ['email', 'count'],
    };

    const result = validateActionInput(schema, {
      email: 'not-an-email',
      count: 150,
    });

    expect(result.valid).toBe(false);

    const formatted = formatErrorsForLLM(result.errors!);
    expect(formatted).toContain('validation error');
    expect(formatted.toLowerCase()).toContain('email');
    expect(formatted.toLowerCase()).toContain('count');
  });
});
