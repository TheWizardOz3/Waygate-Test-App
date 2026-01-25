/**
 * Prisma Seed Script for Waygate
 *
 * Creates development seed data:
 * - Test tenant with known API key
 * - Sample Slack integration
 * - Sample actions (sendMessage, listChannels, listUsers, etc.)
 *
 * Run with: npx prisma db seed
 */

import { config } from 'dotenv';
import path from 'node:path';
import { randomBytes } from 'crypto';
import bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

// Load environment variables
config({ path: path.join(__dirname, '..', '.env.local') });
config({ path: path.join(__dirname, '..', '.env') });

// Create Prisma client with adapter (Prisma 7 requirement)
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL environment variable is required');
}

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// =============================================================================
// Test Credentials
// =============================================================================
// These are for DEVELOPMENT ONLY. Never use in production.

// Generate a proper API key format: wg_live_<32 hex chars>
const API_KEY_PREFIX = 'wg_live_';
const generateTestApiKey = () => {
  const randomPart = randomBytes(16).toString('hex');
  return `${API_KEY_PREFIX}${randomPart}`;
};

// Generate the test API key and its bcrypt hash
let TEST_API_KEY: string;
let TEST_API_KEY_HASH: string;

// =============================================================================
// Seed Data
// =============================================================================

async function main() {
  console.log('🌱 Starting database seed...\n');

  // Generate API key with proper format
  TEST_API_KEY = generateTestApiKey();
  TEST_API_KEY_HASH = await bcrypt.hash(TEST_API_KEY, 12);

  // Clean existing data (in reverse dependency order)
  console.log('🧹 Cleaning existing seed data...');
  await prisma.requestLog.deleteMany({});
  await prisma.fieldMapping.deleteMany({});
  await prisma.integrationCredential.deleteMany({});
  await prisma.connection.deleteMany({});
  await prisma.action.deleteMany({});
  await prisma.integration.deleteMany({});
  await prisma.tenant.deleteMany({});

  // Create test tenant
  console.log('👤 Creating test tenant...');
  const tenant = await prisma.tenant.create({
    data: {
      name: 'Test Developer',
      email: 'dev@waygate.local',
      waygateApiKeyHash: TEST_API_KEY_HASH,
      settings: {
        rateLimit: 100,
        timezone: 'UTC',
      },
    },
  });
  console.log(`   ✓ Tenant created: ${tenant.name} (${tenant.id})`);

  // Create sample Slack integration
  console.log('🔌 Creating sample Slack integration...');
  const slackIntegration = await prisma.integration.create({
    data: {
      tenantId: tenant.id,
      name: 'Slack (Mock)',
      slug: 'slack',
      description: 'Sample Slack integration for development and testing. Uses mock endpoints.',
      documentationUrl: 'https://api.slack.com/docs',
      authType: 'oauth2',
      authConfig: {
        authorizationUrl: 'https://slack.com/oauth/v2/authorize',
        tokenUrl: 'https://slack.com/api/oauth.v2.access',
        scopes: ['chat:write', 'channels:read', 'users:read'],
      },
      status: 'active',
      tags: ['communication', 'messaging', 'team'],
      metadata: {
        provider: 'Slack',
        apiVersion: 'v2',
        baseUrl: 'https://slack.com/api',
      },
    },
  });
  console.log(`   ✓ Integration created: ${slackIntegration.name} (${slackIntegration.slug})`);

  // Create default connection for the integration
  console.log('🔗 Creating default connection...');
  const defaultConnection = await prisma.connection.create({
    data: {
      tenantId: tenant.id,
      integrationId: slackIntegration.id,
      name: 'Default',
      slug: 'default',
      isPrimary: true,
      status: 'active',
      metadata: {
        description: 'Default connection created during seed',
      },
    },
  });
  console.log(`   ✓ Connection created: ${defaultConnection.name} (${defaultConnection.slug})`);

  // Create sample actions
  console.log('⚡ Creating sample actions...');

  const actions = await Promise.all([
    // Action 1: Send Message
    prisma.action.create({
      data: {
        integrationId: slackIntegration.id,
        name: 'Send Message',
        slug: 'sendMessage',
        description: 'Send a message to a Slack channel',
        httpMethod: 'POST',
        endpointTemplate: '/chat.postMessage',
        inputSchema: {
          type: 'object',
          required: ['channel', 'text'],
          properties: {
            channel: {
              type: 'string',
              description: 'Channel ID or name (e.g., C1234567890 or #general)',
            },
            text: {
              type: 'string',
              description: 'Message text to send',
            },
            thread_ts: {
              type: 'string',
              description: 'Thread timestamp to reply to (optional)',
            },
          },
        },
        outputSchema: {
          type: 'object',
          properties: {
            ok: { type: 'boolean' },
            channel: { type: 'string' },
            ts: { type: 'string', description: 'Message timestamp' },
            message: { type: 'object' },
          },
        },
        metadata: {
          category: 'messaging',
          idempotent: false,
        },
      },
    }),

    // Action 2: List Channels
    prisma.action.create({
      data: {
        integrationId: slackIntegration.id,
        name: 'List Channels',
        slug: 'listChannels',
        description: 'Get a list of all channels in the workspace',
        httpMethod: 'GET',
        endpointTemplate: '/conversations.list',
        inputSchema: {
          type: 'object',
          properties: {
            types: {
              type: 'string',
              description: 'Channel types to include (public_channel, private_channel)',
              default: 'public_channel',
            },
            limit: {
              type: 'integer',
              description: 'Maximum number of channels to return',
              minimum: 1,
              maximum: 1000,
              default: 100,
            },
            cursor: {
              type: 'string',
              description: 'Pagination cursor for next page',
            },
          },
        },
        outputSchema: {
          type: 'object',
          properties: {
            ok: { type: 'boolean' },
            channels: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  name: { type: 'string' },
                  is_private: { type: 'boolean' },
                  num_members: { type: 'integer' },
                },
              },
            },
            response_metadata: {
              type: 'object',
              properties: {
                next_cursor: { type: 'string' },
              },
            },
          },
        },
        paginationConfig: {
          type: 'cursor',
          cursorParam: 'cursor',
          cursorPath: 'response_metadata.next_cursor',
          itemsPath: 'channels',
        },
        cacheable: true,
        cacheTtlSeconds: 300,
        metadata: {
          category: 'channels',
          idempotent: true,
        },
      },
    }),

    // Action 3: List Users
    prisma.action.create({
      data: {
        integrationId: slackIntegration.id,
        name: 'List Users',
        slug: 'listUsers',
        description: 'Get a list of all users in the workspace',
        httpMethod: 'GET',
        endpointTemplate: '/users.list',
        inputSchema: {
          type: 'object',
          properties: {
            limit: {
              type: 'integer',
              description: 'Maximum number of users to return',
              minimum: 1,
              maximum: 1000,
              default: 100,
            },
            cursor: {
              type: 'string',
              description: 'Pagination cursor for next page',
            },
          },
        },
        outputSchema: {
          type: 'object',
          properties: {
            ok: { type: 'boolean' },
            members: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  name: { type: 'string' },
                  real_name: { type: 'string' },
                  is_admin: { type: 'boolean' },
                  is_bot: { type: 'boolean' },
                },
              },
            },
            response_metadata: {
              type: 'object',
              properties: {
                next_cursor: { type: 'string' },
              },
            },
          },
        },
        paginationConfig: {
          type: 'cursor',
          cursorParam: 'cursor',
          cursorPath: 'response_metadata.next_cursor',
          itemsPath: 'members',
        },
        cacheable: true,
        cacheTtlSeconds: 600,
        metadata: {
          category: 'users',
          idempotent: true,
        },
      },
    }),

    // Action 4: Get User Info
    prisma.action.create({
      data: {
        integrationId: slackIntegration.id,
        name: 'Get User Info',
        slug: 'getUserInfo',
        description: 'Get detailed information about a specific user',
        httpMethod: 'GET',
        endpointTemplate: '/users.info',
        inputSchema: {
          type: 'object',
          required: ['user'],
          properties: {
            user: {
              type: 'string',
              description: 'User ID (e.g., U1234567890)',
            },
          },
        },
        outputSchema: {
          type: 'object',
          properties: {
            ok: { type: 'boolean' },
            user: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                name: { type: 'string' },
                real_name: { type: 'string' },
                profile: {
                  type: 'object',
                  properties: {
                    email: { type: 'string' },
                    display_name: { type: 'string' },
                    image_72: { type: 'string' },
                  },
                },
              },
            },
          },
        },
        cacheable: true,
        cacheTtlSeconds: 300,
        metadata: {
          category: 'users',
          idempotent: true,
        },
      },
    }),

    // Action 5: Create Channel
    prisma.action.create({
      data: {
        integrationId: slackIntegration.id,
        name: 'Create Channel',
        slug: 'createChannel',
        description: 'Create a new public or private channel',
        httpMethod: 'POST',
        endpointTemplate: '/conversations.create',
        inputSchema: {
          type: 'object',
          required: ['name'],
          properties: {
            name: {
              type: 'string',
              description: 'Channel name (lowercase, no spaces)',
              pattern: '^[a-z0-9-_]+$',
              maxLength: 80,
            },
            is_private: {
              type: 'boolean',
              description: 'Whether to create a private channel',
              default: false,
            },
          },
        },
        outputSchema: {
          type: 'object',
          properties: {
            ok: { type: 'boolean' },
            channel: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                name: { type: 'string' },
                is_private: { type: 'boolean' },
                created: { type: 'integer' },
              },
            },
          },
        },
        metadata: {
          category: 'channels',
          idempotent: false,
        },
      },
    }),
  ]);

  console.log(`   ✓ Created ${actions.length} actions:`);
  actions.forEach((action) => {
    console.log(`     - ${action.name} (${action.slug})`);
  });

  // Summary
  console.log('\n✅ Seed completed successfully!\n');
  console.log('📋 Summary:');
  console.log(`   - Tenants: 1`);
  console.log(`   - Integrations: 1`);
  console.log(`   - Connections: 1`);
  console.log(`   - Actions: ${actions.length}`);
  console.log('\n🔑 Test API Key: ' + TEST_API_KEY);
  console.log('   Use this key in the Authorization header:');
  console.log('   Authorization: Bearer ' + TEST_API_KEY);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error('❌ Seed failed:', e);
    await prisma.$disconnect();
    process.exit(1);
  });
