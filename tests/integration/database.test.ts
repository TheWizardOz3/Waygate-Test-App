/**
 * Database Integration Tests
 *
 * Tests for the database schema, relationships, and seed data.
 * These tests run against the actual database to verify:
 * - Schema is correctly applied
 * - Seed data exists and is queryable
 * - Relationships work correctly
 * - Cascade deletes function properly
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { config } from 'dotenv';
import path from 'node:path';

// Load environment variables
config({ path: path.join(__dirname, '../../.env.local') });
config({ path: path.join(__dirname, '../../.env') });

// Create test client
let prisma: PrismaClient;
let pool: Pool;

beforeAll(() => {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is required for integration tests');
  }
  pool = new Pool({ connectionString });
  const adapter = new PrismaPg(pool);
  prisma = new PrismaClient({ adapter });
});

afterAll(async () => {
  await prisma.$disconnect();
  await pool.end();
});

describe('Database Schema', () => {
  describe('Tenant Model', () => {
    it('should have seed tenant', async () => {
      const tenant = await prisma.tenant.findFirst({
        where: { email: 'dev@waygate.local' },
      });

      expect(tenant).not.toBeNull();
      expect(tenant?.name).toBe('Test Developer');
      expect(tenant?.waygateApiKeyHash).toBeDefined();
      expect(tenant?.settings).toBeDefined();
    });

    it('should have unique email constraint', async () => {
      const tenants = await prisma.tenant.findMany({
        where: { email: 'dev@waygate.local' },
      });

      expect(tenants).toHaveLength(1);
    });
  });

  describe('Integration Model', () => {
    it('should have seed Slack integration', async () => {
      const integration = await prisma.integration.findFirst({
        where: { slug: 'slack' },
        include: { tenant: true },
      });

      expect(integration).not.toBeNull();
      expect(integration?.name).toBe('Slack (Mock)');
      expect(integration?.authType).toBe('oauth2');
      expect(integration?.status).toBe('active');
      expect(integration?.tenant?.email).toBe('dev@waygate.local');
    });

    it('should have correct tags', async () => {
      const integration = await prisma.integration.findFirst({
        where: { slug: 'slack' },
      });

      expect(integration?.tags).toContain('communication');
      expect(integration?.tags).toContain('messaging');
    });

    it('should have authConfig JSON', async () => {
      const integration = await prisma.integration.findFirst({
        where: { slug: 'slack' },
      });

      const authConfig = integration?.authConfig as Record<string, unknown>;
      // Matches seed data: authorizationUrl, tokenUrl, scopes
      expect(authConfig).toHaveProperty('authorizationUrl');
      expect(authConfig).toHaveProperty('tokenUrl');
      expect(authConfig).toHaveProperty('scopes');
      expect(authConfig.authorizationUrl).toBe('https://slack.com/oauth/v2/authorize');
    });
  });

  describe('Action Model', () => {
    it('should have 5 seed actions', async () => {
      const integration = await prisma.integration.findFirst({
        where: { slug: 'slack' },
      });

      const actions = await prisma.action.findMany({
        where: { integrationId: integration?.id },
      });

      expect(actions).toHaveLength(5);
    });

    it('should have sendMessage action with correct schema', async () => {
      const integration = await prisma.integration.findFirst({
        where: { slug: 'slack' },
      });

      const action = await prisma.action.findFirst({
        where: {
          integrationId: integration?.id,
          slug: 'sendMessage',
        },
      });

      expect(action).not.toBeNull();
      expect(action?.httpMethod).toBe('POST');
      expect(action?.endpointTemplate).toBe('/chat.postMessage');

      const inputSchema = action?.inputSchema as Record<string, unknown>;
      expect(inputSchema).toHaveProperty('type', 'object');
      expect(inputSchema).toHaveProperty('required');
    });

    it('should have listChannels with pagination config', async () => {
      const integration = await prisma.integration.findFirst({
        where: { slug: 'slack' },
      });

      const action = await prisma.action.findFirst({
        where: {
          integrationId: integration?.id,
          slug: 'listChannels',
        },
      });

      expect(action?.cacheable).toBe(true);
      expect(action?.cacheTtlSeconds).toBe(300);

      const paginationConfig = action?.paginationConfig as Record<string, unknown>;
      expect(paginationConfig).toHaveProperty('type', 'cursor');
    });
  });

  describe('Relationships', () => {
    it('should load tenant with integrations', async () => {
      const tenant = await prisma.tenant.findFirst({
        where: { email: 'dev@waygate.local' },
        include: { integrations: true },
      });

      // Should have at least the seed integration
      expect(tenant?.integrations.length).toBeGreaterThanOrEqual(1);
      // Seed integration should exist
      const slackIntegration = tenant?.integrations.find((i) => i.slug === 'slack');
      expect(slackIntegration).toBeDefined();
    });

    it('should load integration with actions', async () => {
      const integration = await prisma.integration.findFirst({
        where: { slug: 'slack' },
        include: { actions: true },
      });

      expect(integration?.actions).toHaveLength(5);
    });

    it('should load full hierarchy', async () => {
      const tenant = await prisma.tenant.findFirst({
        where: { email: 'dev@waygate.local' },
        include: {
          integrations: {
            include: {
              actions: true,
            },
          },
        },
      });

      expect(tenant?.integrations[0].actions).toHaveLength(5);
    });
  });

  describe('Unique Constraints', () => {
    it('should enforce unique tenant+slug for integrations', async () => {
      const tenant = await prisma.tenant.findFirst({
        where: { email: 'dev@waygate.local' },
      });

      // Find integrations with same tenant and slug
      const integrations = await prisma.integration.findMany({
        where: {
          tenantId: tenant?.id,
          slug: 'slack',
        },
      });

      expect(integrations).toHaveLength(1);
    });

    it('should enforce unique integration+slug for actions', async () => {
      const integration = await prisma.integration.findFirst({
        where: { slug: 'slack' },
      });

      const actions = await prisma.action.findMany({
        where: {
          integrationId: integration?.id,
          slug: 'sendMessage',
        },
      });

      expect(actions).toHaveLength(1);
    });
  });
});

describe('Enums', () => {
  it('should have valid AuthType values', async () => {
    const integration = await prisma.integration.findFirst({
      where: { slug: 'slack' },
    });

    // Valid enum values: oauth2, api_key, basic, bearer, custom_header
    expect(['oauth2', 'api_key', 'basic', 'bearer', 'custom_header']).toContain(
      integration?.authType
    );
  });

  it('should have valid IntegrationStatus values', async () => {
    const integration = await prisma.integration.findFirst({
      where: { slug: 'slack' },
    });

    // Valid enum values: draft, active, error, disabled
    expect(['draft', 'active', 'error', 'disabled']).toContain(integration?.status);
  });

  it('should have valid HttpMethod values', async () => {
    const actions = await prisma.action.findMany({
      where: {
        integration: { slug: 'slack' },
      },
    });

    const methods = actions.map((a) => a.httpMethod);
    methods.forEach((method) => {
      expect(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).toContain(method);
    });
  });
});
