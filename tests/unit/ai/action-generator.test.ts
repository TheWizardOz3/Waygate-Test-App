/**
 * Action Generator Unit Tests
 *
 * Tests for converting ParsedApiDoc endpoints into Action definitions.
 */

import { describe, it, expect } from 'vitest';
import {
  generateActions,
  generateSlug,
  extractAuthConfig,
  summarizeActions,
} from '@/lib/modules/ai/action-generator';
import type { ParsedApiDoc, ApiEndpoint, ApiAuthMethod } from '@/lib/modules/ai/scrape-job.schemas';

// =============================================================================
// Test Fixtures
// =============================================================================

const createEndpoint = (overrides: Partial<ApiEndpoint> = {}): ApiEndpoint => ({
  name: 'List Users',
  slug: 'list-users',
  description: 'Get a list of all users',
  method: 'GET',
  path: '/users',
  queryParameters: [
    { name: 'limit', type: 'integer', required: false, default: 10 },
    { name: 'offset', type: 'integer', required: false },
  ],
  responses: {
    '200': { description: 'Success', schema: { type: 'array' } },
  },
  ...overrides,
});

const createParsedDoc = (overrides: Partial<ParsedApiDoc> = {}): ParsedApiDoc => ({
  name: 'Test API',
  description: 'A test API for unit testing',
  baseUrl: 'https://api.example.com',
  version: '1.0.0',
  authMethods: [{ type: 'bearer', config: {}, location: 'header' }],
  endpoints: [createEndpoint()],
  ...overrides,
});

// =============================================================================
// generateSlug Tests
// =============================================================================

describe('generateSlug', () => {
  it('should convert name to lowercase kebab-case', () => {
    expect(generateSlug('List Users')).toBe('list-users');
    expect(generateSlug('Create New User')).toBe('create-new-user');
  });

  it('should remove special characters', () => {
    expect(generateSlug('Get User (by ID)')).toBe('get-user-by-id');
    expect(generateSlug('Users & Groups')).toBe('users-groups');
  });

  it('should handle multiple spaces and dashes', () => {
    expect(generateSlug('List   Users')).toBe('list-users');
    expect(generateSlug('list--users')).toBe('list-users');
  });

  it('should trim leading/trailing hyphens', () => {
    expect(generateSlug('-List Users-')).toBe('list-users');
    expect(generateSlug('  List Users  ')).toBe('list-users');
  });

  it('should truncate to 100 characters', () => {
    const longName = 'A'.repeat(150);
    expect(generateSlug(longName).length).toBeLessThanOrEqual(100);
  });

  it('should handle empty string', () => {
    expect(generateSlug('')).toBe('');
  });
});

// =============================================================================
// generateActions Tests - Basic Conversion
// =============================================================================

describe('generateActions - Basic Conversion', () => {
  it('should convert endpoints to action definitions', () => {
    const doc = createParsedDoc();
    const result = generateActions(doc);

    expect(result.actions).toHaveLength(1);
    expect(result.stats.generatedActions).toBe(1);
    expect(result.stats.totalEndpoints).toBe(1);
  });

  it('should map endpoint fields correctly', () => {
    const doc = createParsedDoc({
      endpoints: [
        createEndpoint({
          name: 'Get User',
          slug: 'get-user',
          description: 'Get a single user',
          method: 'GET',
          path: '/users/:userId',
        }),
      ],
    });

    const result = generateActions(doc);
    const action = result.actions[0];

    expect(action.name).toBe('Get User');
    expect(action.slug).toBe('get-user');
    expect(action.description).toBe('Get a single user');
    expect(action.httpMethod).toBe('GET');
  });

  it('should build endpoint template with base URL', () => {
    const doc = createParsedDoc({
      baseUrl: 'https://api.example.com/v1',
      endpoints: [createEndpoint({ path: '/users' })],
    });

    const result = generateActions(doc);
    expect(result.actions[0].endpointTemplate).toBe('https://api.example.com/v1/users');
  });

  it('should convert :param to {param} in templates', () => {
    const doc = createParsedDoc({
      endpoints: [createEndpoint({ path: '/users/:userId/posts/:postId' })],
    });

    const result = generateActions(doc);
    expect(result.actions[0].endpointTemplate).toContain('{userId}');
    expect(result.actions[0].endpointTemplate).toContain('{postId}');
  });
});

// =============================================================================
// generateActions Tests - Input Schema
// =============================================================================

describe('generateActions - Input Schema Generation', () => {
  it('should generate input schema from query parameters', () => {
    const doc = createParsedDoc({
      endpoints: [
        createEndpoint({
          queryParameters: [
            { name: 'limit', type: 'integer', required: false, default: 10 },
            { name: 'search', type: 'string', required: true },
          ],
        }),
      ],
    });

    const result = generateActions(doc);
    const inputSchema = result.actions[0].inputSchema;

    expect(inputSchema.type).toBe('object');
    expect(inputSchema.properties?.limit).toBeDefined();
    expect(inputSchema.properties?.search).toBeDefined();
    expect(inputSchema.required).toContain('search');
    expect(inputSchema.required).not.toContain('limit');
  });

  it('should generate input schema from path parameters', () => {
    const doc = createParsedDoc({
      endpoints: [
        createEndpoint({
          pathParameters: [{ name: 'userId', type: 'string', required: true }],
        }),
      ],
    });

    const result = generateActions(doc);
    const inputSchema = result.actions[0].inputSchema;

    expect(inputSchema.properties?.userId).toBeDefined();
    expect(inputSchema.required).toContain('userId');
  });

  it('should include request body properties in input schema', () => {
    const doc = createParsedDoc({
      endpoints: [
        createEndpoint({
          method: 'POST',
          requestBody: {
            contentType: 'application/json',
            required: true,
            schema: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                email: { type: 'string' },
              },
              required: ['name'],
            },
          },
        }),
      ],
    });

    const result = generateActions(doc);
    const inputSchema = result.actions[0].inputSchema;

    expect(inputSchema.properties?.name).toBeDefined();
    expect(inputSchema.properties?.email).toBeDefined();
  });

  it('should include enum values in schema properties', () => {
    const doc = createParsedDoc({
      endpoints: [
        createEndpoint({
          queryParameters: [
            {
              name: 'status',
              type: 'string',
              required: false,
              enum: ['active', 'inactive', 'pending'],
            },
          ],
        }),
      ],
    });

    const result = generateActions(doc);
    const statusProp = result.actions[0].inputSchema.properties?.status;

    expect(statusProp?.enum).toEqual(['active', 'inactive', 'pending']);
  });
});

// =============================================================================
// generateActions Tests - Output Schema
// =============================================================================

describe('generateActions - Output Schema Generation', () => {
  it('should generate output schema from 200 response', () => {
    const doc = createParsedDoc({
      endpoints: [
        createEndpoint({
          responses: {
            '200': {
              description: 'User list',
              schema: {
                type: 'array',
                items: { type: 'object' },
              },
            },
          },
        }),
      ],
    });

    const result = generateActions(doc);
    const outputSchema = result.actions[0].outputSchema;

    expect(outputSchema).toBeDefined();
    expect(outputSchema.type).toBe('array');
  });

  it('should use 201 response for POST endpoints', () => {
    const doc = createParsedDoc({
      endpoints: [
        createEndpoint({
          method: 'POST',
          responses: {
            '201': {
              description: 'Created',
              schema: { type: 'object', properties: { id: { type: 'string' } } },
            },
          },
        }),
      ],
    });

    const result = generateActions(doc);
    const outputSchema = result.actions[0].outputSchema;

    // Verify the output schema exists and has the expected type
    expect(outputSchema).toBeDefined();
    expect(outputSchema.type).toBe('object');
  });

  it('should default to generic object when no schema defined', () => {
    const doc = createParsedDoc({
      endpoints: [
        createEndpoint({
          responses: {
            '200': { description: 'Success' },
          },
        }),
      ],
    });

    const result = generateActions(doc);
    const outputSchema = result.actions[0].outputSchema;

    expect(outputSchema.type).toBe('object');
    expect(outputSchema.additionalProperties).toBe(true);
  });
});

// =============================================================================
// generateActions Tests - Cacheability
// =============================================================================

describe('generateActions - Cacheability', () => {
  it('should mark GET requests as cacheable', () => {
    const doc = createParsedDoc({
      endpoints: [createEndpoint({ method: 'GET' })],
    });

    const result = generateActions(doc);
    expect(result.actions[0].cacheable).toBe(true);
    expect(result.actions[0].cacheTtlSeconds).toBe(300); // Default 5 min
  });

  it('should mark POST requests as non-cacheable', () => {
    const doc = createParsedDoc({
      endpoints: [createEndpoint({ method: 'POST' })],
    });

    const result = generateActions(doc);
    expect(result.actions[0].cacheable).toBe(false);
    expect(result.actions[0].cacheTtlSeconds).toBeUndefined();
  });

  it('should use custom cache TTL when provided', () => {
    const doc = createParsedDoc({
      endpoints: [createEndpoint({ method: 'GET' })],
    });

    const result = generateActions(doc, { defaultCacheTtl: 600 });
    expect(result.actions[0].cacheTtlSeconds).toBe(600);
  });
});

// =============================================================================
// generateActions Tests - Pagination Detection
// =============================================================================

describe('generateActions - Pagination Detection', () => {
  it('should detect cursor-based pagination', () => {
    const doc = createParsedDoc({
      endpoints: [
        createEndpoint({
          queryParameters: [
            { name: 'cursor', type: 'string', required: false },
            { name: 'limit', type: 'integer', required: false },
          ],
        }),
      ],
    });

    const result = generateActions(doc);
    const paginationConfig = result.actions[0].paginationConfig;

    expect(paginationConfig).toBeDefined();
    expect(paginationConfig?.type).toBe('cursor');
    expect(paginationConfig?.cursorParam).toBe('cursor');
  });

  it('should detect offset-based pagination', () => {
    const doc = createParsedDoc({
      endpoints: [
        createEndpoint({
          queryParameters: [
            { name: 'offset', type: 'integer', required: false },
            { name: 'limit', type: 'integer', required: false },
          ],
        }),
      ],
    });

    const result = generateActions(doc);
    const paginationConfig = result.actions[0].paginationConfig;

    expect(paginationConfig?.type).toBe('offset');
    expect(paginationConfig?.pageParam).toBe('offset');
  });

  it('should detect page-number pagination', () => {
    const doc = createParsedDoc({
      endpoints: [
        createEndpoint({
          queryParameters: [
            { name: 'page', type: 'integer', required: false },
            { name: 'per_page', type: 'integer', required: false },
          ],
        }),
      ],
    });

    const result = generateActions(doc);
    const paginationConfig = result.actions[0].paginationConfig;

    expect(paginationConfig?.type).toBe('page');
    expect(paginationConfig?.pageParam).toBe('page');
  });

  it('should not detect pagination for POST endpoints', () => {
    const doc = createParsedDoc({
      endpoints: [
        createEndpoint({
          method: 'POST',
          queryParameters: [{ name: 'page', type: 'integer', required: false }],
        }),
      ],
    });

    const result = generateActions(doc);
    expect(result.actions[0].paginationConfig).toBeUndefined();
  });
});

// =============================================================================
// generateActions Tests - Wishlist Prioritization
// =============================================================================

describe('generateActions - Wishlist Prioritization', () => {
  it('should prioritize actions matching wishlist', () => {
    const doc = createParsedDoc({
      endpoints: [
        createEndpoint({ name: 'List Users', slug: 'list-users' }),
        createEndpoint({ name: 'Send Message', slug: 'send-message' }),
        createEndpoint({ name: 'Get Profile', slug: 'get-profile' }),
      ],
    });

    const result = generateActions(doc, {
      wishlist: ['message', 'profile'],
    });

    // Matched actions should be first
    expect(result.matchedActions).toContain('send-message');
    expect(result.matchedActions).toContain('get-profile');
    expect(result.unmatchedActions).toContain('list-users');

    // First actions in result should be matched ones
    expect(result.actions[0].metadata.wishlistScore).toBeGreaterThan(0);
  });

  it('should match against name, slug, path, and description', () => {
    const doc = createParsedDoc({
      endpoints: [
        createEndpoint({
          name: 'Create Something',
          slug: 'create-something',
          path: '/api/messages',
          description: 'Creates a new item',
        }),
      ],
    });

    const result = generateActions(doc, { wishlist: ['messages'] });
    expect(result.matchedActions).toContain('create-something');
  });

  it('should return all as unmatched when no wishlist provided', () => {
    const doc = createParsedDoc({
      endpoints: [createEndpoint(), createEndpoint({ slug: 'another' })],
    });

    const result = generateActions(doc);
    expect(result.matchedActions).toHaveLength(0);
    expect(result.unmatchedActions).toHaveLength(2);
  });
});

// =============================================================================
// generateActions Tests - Duplicate Handling
// =============================================================================

describe('generateActions - Duplicate Handling', () => {
  it('should generate unique slugs for duplicate names', () => {
    const doc = createParsedDoc({
      endpoints: [
        createEndpoint({ name: 'Get Item', slug: 'get-item', method: 'GET' }),
        createEndpoint({ name: 'Get Item', slug: 'get-item', method: 'POST' }),
      ],
    });

    const result = generateActions(doc);
    const slugs = result.actions.map((a) => a.slug);

    expect(new Set(slugs).size).toBe(2); // All unique
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.stats.skippedDuplicates).toBe(1);
  });
});

// =============================================================================
// generateActions Tests - Deprecated Endpoints
// =============================================================================

describe('generateActions - Deprecated Endpoints', () => {
  it('should skip deprecated endpoints by default', () => {
    const doc = createParsedDoc({
      endpoints: [
        createEndpoint({ deprecated: true }),
        createEndpoint({ slug: 'active-endpoint' }),
      ],
    });

    const result = generateActions(doc);
    expect(result.actions).toHaveLength(1);
    expect(result.stats.skippedDeprecated).toBe(1);
  });

  it('should include deprecated endpoints when option set', () => {
    const doc = createParsedDoc({
      endpoints: [
        createEndpoint({ deprecated: true }),
        createEndpoint({ slug: 'active-endpoint' }),
      ],
    });

    const result = generateActions(doc, { includeDeprecated: true });
    expect(result.actions).toHaveLength(2);
    expect(result.stats.skippedDeprecated).toBe(0);
  });

  it('should mark deprecated actions in metadata', () => {
    const doc = createParsedDoc({
      endpoints: [createEndpoint({ deprecated: true })],
    });

    const result = generateActions(doc, { includeDeprecated: true });
    expect(result.actions[0].metadata.deprecated).toBe(true);
  });
});

// =============================================================================
// generateActions Tests - Metadata
// =============================================================================

describe('generateActions - Metadata', () => {
  it('should include original path in metadata', () => {
    const doc = createParsedDoc({
      endpoints: [createEndpoint({ path: '/api/v1/users' })],
    });

    const result = generateActions(doc);
    expect(result.actions[0].metadata.originalPath).toBe('/api/v1/users');
  });

  it('should include tags in metadata', () => {
    const doc = createParsedDoc({
      endpoints: [createEndpoint({ tags: ['users', 'admin'] })],
    });

    const result = generateActions(doc);
    expect(result.actions[0].metadata.tags).toEqual(['users', 'admin']);
  });

  it('should include AI confidence when provided', () => {
    const doc = createParsedDoc();
    const result = generateActions(doc, { aiConfidence: 0.85 });

    expect(result.actions[0].metadata.aiConfidence).toBe(0.85);
  });

  it('should include source URL when provided', () => {
    const doc = createParsedDoc();
    const result = generateActions(doc, { sourceUrl: 'https://docs.example.com' });

    expect(result.actions[0].metadata.sourceUrl).toBe('https://docs.example.com');
  });

  it('should include rate limit from parsed doc', () => {
    const doc = createParsedDoc({
      rateLimits: {
        default: { requests: 100, window: 60 },
      },
    });

    const result = generateActions(doc);
    expect(result.actions[0].metadata.rateLimit).toEqual({ requests: 100, window: 60 });
  });
});

// =============================================================================
// extractAuthConfig Tests
// =============================================================================

describe('extractAuthConfig', () => {
  it('should extract primary auth method', () => {
    const authMethods: ApiAuthMethod[] = [
      { type: 'bearer', config: { scheme: 'bearer' } },
      { type: 'api_key', config: { name: 'X-API-Key' } },
    ];

    const result = extractAuthConfig(authMethods);
    expect(result.primaryAuth?.type).toBe('bearer');
    expect(result.supportedAuthTypes).toEqual(['bearer', 'api_key']);
  });

  it('should handle empty auth methods', () => {
    const result = extractAuthConfig([]);
    expect(result.primaryAuth).toBeUndefined();
    expect(result.supportedAuthTypes).toEqual([]);
  });
});

// =============================================================================
// summarizeActions Tests
// =============================================================================

describe('summarizeActions', () => {
  it('should generate summary string', () => {
    const doc = createParsedDoc({
      endpoints: [createEndpoint(), createEndpoint({ slug: 'endpoint-2' })],
    });

    const result = generateActions(doc);
    const summary = summarizeActions(result);

    expect(summary).toContain('Generated 2 actions from 2 endpoints');
  });

  it('should include skipped deprecated count', () => {
    const doc = createParsedDoc({
      endpoints: [createEndpoint({ deprecated: true }), createEndpoint({ slug: 'active' })],
    });

    const result = generateActions(doc);
    const summary = summarizeActions(result);

    expect(summary).toContain('Skipped 1 deprecated');
  });

  it('should include wishlist match count', () => {
    const doc = createParsedDoc({
      endpoints: [createEndpoint({ name: 'Send Message' }), createEndpoint({ slug: 'other' })],
    });

    const result = generateActions(doc, { wishlist: ['message'] });
    const summary = summarizeActions(result);

    expect(summary).toContain('matched wishlist');
  });
});
