/**
 * Prisma Seed Script for Waygate
 *
 * Creates development seed data:
 * - Test tenant with known API key
 * - Sample Slack integration
 * - Sample actions (sendMessage, listChannels, listUsers, etc.)
 * - Platform connectors (Slack, Google) for hybrid auth model
 *
 * Run with: npx prisma db seed
 */

import { config } from 'dotenv';
import path from 'node:path';
import { randomBytes, createCipheriv } from 'crypto';
import bcrypt from 'bcrypt';
import { PrismaClient, PlatformConnectorStatus, AuthType } from '@prisma/client';
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
// Encryption Helper (for Platform Connector credentials)
// =============================================================================

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;

/**
 * Encrypts a string using AES-256-GCM (same as main encryption module)
 * Used for seeding platform connector credentials
 * Returns Uint8Array for Prisma Bytes compatibility
 */
function encryptForSeed(plaintext: string): Uint8Array<ArrayBuffer> {
  const keyHex = process.env.ENCRYPTION_KEY;
  if (!keyHex || !/^[0-9a-fA-F]{64}$/.test(keyHex)) {
    throw new Error(
      'ENCRYPTION_KEY must be a 64-character hex string. Generate with: openssl rand -hex 32'
    );
  }

  const key = Buffer.from(keyHex, 'hex');
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // Format: IV (16) + AuthTag (16) + Ciphertext
  const result = Buffer.concat([iv, authTag, encrypted]);
  // Create a proper ArrayBuffer copy for Prisma compatibility
  const arrayBuffer = new ArrayBuffer(result.length);
  const uint8Array = new Uint8Array(arrayBuffer);
  uint8Array.set(result);
  return uint8Array;
}

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
  await prisma.platformConnector.deleteMany({});

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

  // ==========================================================================
  // Platform Connectors (Hybrid Auth Model)
  // ==========================================================================
  console.log('🔌 Creating platform connectors...');

  // Slack Platform Connector - Uses Waygate's registered Slack OAuth app
  const slackClientId = process.env.PLATFORM_SLACK_CLIENT_ID || 'placeholder-slack-client-id';
  const slackClientSecret =
    process.env.PLATFORM_SLACK_CLIENT_SECRET || 'placeholder-slack-client-secret';

  const slackPlatformConnector = await prisma.platformConnector.create({
    data: {
      providerSlug: 'slack',
      displayName: 'Slack',
      description:
        "Connect to Slack workspaces with one click. Waygate's verified Slack app handles authentication.",
      logoUrl: '/images/providers/slack.svg',
      authType: AuthType.oauth2,
      encryptedClientId: encryptForSeed(slackClientId),
      encryptedClientSecret: encryptForSeed(slackClientSecret),
      authorizationUrl: 'https://slack.com/oauth/v2/authorize',
      tokenUrl: 'https://slack.com/api/oauth.v2.access',
      defaultScopes: ['chat:write', 'channels:read', 'users:read', 'channels:history'],
      callbackPath: '/api/v1/auth/callback/slack',
      certifications: {
        appReview: {
          status: 'approved',
          approvedAt: '2026-01-01T00:00:00Z',
        },
      },
      rateLimits: {
        requestsPerMinute: 50, // Tier 3 methods
        shared: true,
      },
      status: PlatformConnectorStatus.active,
      metadata: {
        provider: 'Slack',
        apiVersion: 'v2',
        notes: "Waygate's verified Slack app for one-click OAuth.",
      },
    },
  });
  console.log(
    `   ✓ Platform Connector: ${slackPlatformConnector.displayName} (${slackPlatformConnector.providerSlug})`
  );

  // Google Platform Connector - For future use (suspended until CASA certification)
  const googleClientId = process.env.PLATFORM_GOOGLE_CLIENT_ID || 'placeholder-google-client-id';
  const googleClientSecret =
    process.env.PLATFORM_GOOGLE_CLIENT_SECRET || 'placeholder-google-client-secret';

  const googlePlatformConnector = await prisma.platformConnector.create({
    data: {
      providerSlug: 'google-workspace',
      displayName: 'Google Workspace',
      description:
        'Connect to Google Workspace APIs (Gmail, Calendar, Drive). CASA certification pending.',
      logoUrl: '/images/providers/google.svg',
      authType: AuthType.oauth2,
      encryptedClientId: encryptForSeed(googleClientId),
      encryptedClientSecret: encryptForSeed(googleClientSecret),
      authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenUrl: 'https://oauth2.googleapis.com/token',
      defaultScopes: [
        'https://www.googleapis.com/auth/gmail.readonly',
        'https://www.googleapis.com/auth/calendar.readonly',
      ],
      callbackPath: '/api/v1/auth/callback/google',
      certifications: {
        casa: {
          status: 'pending',
          tier: 2,
        },
      },
      rateLimits: {
        requestsPerMinute: 100,
        requestsPerDay: 10000,
        shared: true,
      },
      status: PlatformConnectorStatus.suspended, // Suspended until CASA is complete
      metadata: {
        provider: 'Google',
        notes: 'Suspended until CASA Tier 2 certification is complete.',
      },
    },
  });
  console.log(
    `   ✓ Platform Connector: ${googlePlatformConnector.displayName} (${googlePlatformConnector.providerSlug}) [suspended]`
  );

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
          referenceData: {
            dataType: 'channels',
            syncable: true,
            extractionPath: '$.channels[*]',
            idField: 'id',
            nameField: 'name',
            metadataFields: ['is_private', 'num_members', 'topic', 'purpose'],
            defaultTtlSeconds: 3600, // Sync every hour
          },
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
          referenceData: {
            dataType: 'users',
            syncable: true,
            extractionPath: '$.members[*]',
            idField: 'id',
            nameField: 'real_name',
            metadataFields: ['name', 'email', 'is_admin', 'is_bot', 'profile'],
            defaultTtlSeconds: 3600, // Sync every hour
          },
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
  console.log(`   - Platform Connectors: 2 (1 active, 1 suspended)`);
  console.log(`   - Integrations: 1`);
  console.log(`   - Connections: 1`);
  console.log(`   - Actions: ${actions.length}`);
  console.log('\n🔑 Test API Key: ' + TEST_API_KEY);
  console.log('   Use this key in the Authorization header:');
  console.log('   Authorization: Bearer ' + TEST_API_KEY);
  console.log('\n⚡ Platform Connectors:');
  console.log('   - Slack (active): One-click connect available');
  console.log('   - Google Workspace (suspended): Awaiting CASA certification');
  console.log('\n📝 To configure real OAuth credentials, set these environment variables:');
  console.log('   PLATFORM_SLACK_CLIENT_ID, PLATFORM_SLACK_CLIENT_SECRET');
  console.log('   PLATFORM_GOOGLE_CLIENT_ID, PLATFORM_GOOGLE_CLIENT_SECRET');
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
