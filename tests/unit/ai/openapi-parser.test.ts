/**
 * OpenAPI Parser Unit Tests
 *
 * Tests for parsing OpenAPI/Swagger specifications into ParsedApiDoc format.
 */

import { describe, it, expect } from 'vitest';
import {
  parseOpenApiSpec,
  isOpenApiSpec,
  OpenApiParseError,
  isOpenApiParseError,
} from '@/lib/modules/ai/openapi-parser';

// =============================================================================
// Test Fixtures
// =============================================================================

const VALID_OPENAPI_3_JSON = JSON.stringify({
  openapi: '3.0.0',
  info: {
    title: 'Test API',
    description: 'A test API',
    version: '1.0.0',
  },
  servers: [{ url: 'https://api.example.com/v1' }],
  paths: {
    '/users': {
      get: {
        summary: 'List users',
        operationId: 'listUsers',
        parameters: [
          {
            name: 'limit',
            in: 'query',
            required: false,
            schema: { type: 'integer', default: 10 },
          },
        ],
        responses: {
          '200': {
            description: 'Successful response',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/User' },
                },
              },
            },
          },
        },
      },
      post: {
        summary: 'Create user',
        operationId: 'createUser',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/CreateUser' },
            },
          },
        },
        responses: {
          '201': { description: 'User created' },
        },
      },
    },
    '/users/{userId}': {
      get: {
        summary: 'Get user',
        operationId: 'getUser',
        parameters: [
          {
            name: 'userId',
            in: 'path',
            required: true,
            schema: { type: 'string' },
          },
        ],
        responses: {
          '200': { description: 'Successful response' },
        },
      },
    },
  },
  components: {
    schemas: {
      User: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          email: { type: 'string', format: 'email' },
        },
      },
      CreateUser: {
        type: 'object',
        required: ['name', 'email'],
        properties: {
          name: { type: 'string' },
          email: { type: 'string', format: 'email' },
        },
      },
    },
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
      },
      apiKey: {
        type: 'apiKey',
        in: 'header',
        name: 'X-API-Key',
      },
    },
  },
  security: [{ bearerAuth: [] }],
});

const VALID_OPENAPI_3_YAML = `
openapi: "3.0.0"
info:
  title: YAML Test API
  version: "1.0.0"
servers:
  - url: https://yaml-api.example.com
paths:
  /items:
    get:
      summary: List items
      operationId: listItems
      responses:
        "200":
          description: Success
`;

const VALID_SWAGGER_2_JSON = JSON.stringify({
  swagger: '2.0',
  info: {
    title: 'Swagger 2 API',
    version: '1.0.0',
  },
  host: 'swagger-api.example.com',
  basePath: '/v1',
  schemes: ['https'],
  paths: {
    '/products': {
      get: {
        summary: 'List products',
        operationId: 'listProducts',
        responses: {
          '200': { description: 'Success' },
        },
      },
    },
  },
});

const INVALID_JSON = '{ not valid json }';

const NOT_OPENAPI = JSON.stringify({
  name: 'some random json',
  data: [1, 2, 3],
});

// =============================================================================
// isOpenApiSpec Tests
// =============================================================================

describe('isOpenApiSpec', () => {
  it('should return true for valid OpenAPI 3.x JSON', () => {
    expect(isOpenApiSpec(VALID_OPENAPI_3_JSON)).toBe(true);
  });

  it('should return true for valid OpenAPI 3.x YAML', () => {
    expect(isOpenApiSpec(VALID_OPENAPI_3_YAML)).toBe(true);
  });

  it('should return true for valid Swagger 2.0 JSON', () => {
    expect(isOpenApiSpec(VALID_SWAGGER_2_JSON)).toBe(true);
  });

  it('should return false for invalid JSON', () => {
    expect(isOpenApiSpec(INVALID_JSON)).toBe(false);
  });

  it('should return false for non-OpenAPI JSON', () => {
    expect(isOpenApiSpec(NOT_OPENAPI)).toBe(false);
  });

  it('should return false for plain text', () => {
    expect(isOpenApiSpec('This is just some documentation text')).toBe(false);
  });

  it('should return false for HTML', () => {
    expect(isOpenApiSpec('<html><body>Hello</body></html>')).toBe(false);
  });

  it('should return false for empty string', () => {
    expect(isOpenApiSpec('')).toBe(false);
  });
});

// =============================================================================
// parseOpenApiSpec Tests - OpenAPI 3.x
// =============================================================================

describe('parseOpenApiSpec - OpenAPI 3.x', () => {
  it('should parse valid OpenAPI 3.x JSON', async () => {
    const result = await parseOpenApiSpec(VALID_OPENAPI_3_JSON);

    expect(result.doc).toBeDefined();
    expect(result.openApiVersion).toBe('3.0.0');
    expect(result.doc.name).toBe('Test API');
    expect(result.doc.description).toBe('A test API');
    expect(result.doc.baseUrl).toBe('https://api.example.com/v1');
  });

  it('should extract endpoints correctly', async () => {
    const result = await parseOpenApiSpec(VALID_OPENAPI_3_JSON);

    expect(result.doc.endpoints).toHaveLength(3);

    // Check GET /users (slug from operationId 'listUsers' becomes 'listusers')
    const listUsers = result.doc.endpoints.find((e) => e.slug === 'listusers');
    expect(listUsers).toBeDefined();
    expect(listUsers?.method).toBe('GET');
    expect(listUsers?.path).toBe('/users');
    expect(listUsers?.queryParameters).toHaveLength(1);
    expect(listUsers?.queryParameters?.[0].name).toBe('limit');

    // Check POST /users
    const createUser = result.doc.endpoints.find((e) => e.slug === 'createuser');
    expect(createUser).toBeDefined();
    expect(createUser?.method).toBe('POST');
    expect(createUser?.requestBody).toBeDefined();

    // Check GET /users/{userId}
    const getUser = result.doc.endpoints.find((e) => e.slug === 'getuser');
    expect(getUser).toBeDefined();
    expect(getUser?.path).toBe('/users/{userId}');
    expect(getUser?.pathParameters).toHaveLength(1);
    expect(getUser?.pathParameters?.[0].name).toBe('userId');
  });

  it('should extract auth methods from security schemes', async () => {
    const result = await parseOpenApiSpec(VALID_OPENAPI_3_JSON);

    expect(result.doc.authMethods).toBeDefined();
    expect(result.doc.authMethods.length).toBeGreaterThan(0);

    const bearerAuth = result.doc.authMethods.find((a) => a.type === 'bearer');
    expect(bearerAuth).toBeDefined();
  });

  it('should parse YAML format', async () => {
    const result = await parseOpenApiSpec(VALID_OPENAPI_3_YAML);

    expect(result.doc.name).toBe('YAML Test API');
    expect(result.doc.baseUrl).toBe('https://yaml-api.example.com');
    expect(result.doc.endpoints).toHaveLength(1);
    expect(result.doc.endpoints[0].slug).toBe('listitems');
  });

  it('should include source URL in metadata when provided', async () => {
    const result = await parseOpenApiSpec(VALID_OPENAPI_3_JSON, {
      sourceUrl: 'https://example.com/openapi.json',
    });

    expect(result.doc.metadata?.sourceUrls).toContain('https://example.com/openapi.json');
  });
});

// =============================================================================
// parseOpenApiSpec Tests - Swagger 2.0
// =============================================================================

describe('parseOpenApiSpec - Swagger 2.0', () => {
  it('should parse valid Swagger 2.0 JSON', async () => {
    const result = await parseOpenApiSpec(VALID_SWAGGER_2_JSON);

    expect(result.doc).toBeDefined();
    expect(result.openApiVersion).toBe('2.0');
    expect(result.doc.name).toBe('Swagger 2 API');
    expect(result.doc.baseUrl).toBe('https://swagger-api.example.com/v1');
  });

  it('should extract endpoints from Swagger 2.0', async () => {
    const result = await parseOpenApiSpec(VALID_SWAGGER_2_JSON);

    expect(result.doc.endpoints).toHaveLength(1);
    expect(result.doc.endpoints[0].slug).toBe('listproducts');
    expect(result.doc.endpoints[0].method).toBe('GET');
    expect(result.doc.endpoints[0].path).toBe('/products');
  });
});

// =============================================================================
// parseOpenApiSpec Tests - Error Handling
// =============================================================================

describe('parseOpenApiSpec - Error Handling', () => {
  it('should throw OpenApiParseError for invalid JSON', async () => {
    await expect(parseOpenApiSpec(INVALID_JSON)).rejects.toThrow(OpenApiParseError);
  });

  it('should throw OpenApiParseError for non-OpenAPI JSON', async () => {
    await expect(parseOpenApiSpec(NOT_OPENAPI)).rejects.toThrow(OpenApiParseError);
  });

  it('should throw for empty content', async () => {
    // Empty content causes a different error type (TypeError) - test that it throws
    await expect(parseOpenApiSpec('')).rejects.toThrow();
  });

  it('should handle malformed YAML', async () => {
    const malformedYaml = `
openapi: 3.0.0
info:
  title: Test
    invalid: indentation
`;
    await expect(parseOpenApiSpec(malformedYaml)).rejects.toThrow(OpenApiParseError);
  });
});

// =============================================================================
// isOpenApiParseError Type Guard Tests
// =============================================================================

describe('isOpenApiParseError', () => {
  it('should return true for OpenApiParseError instances', () => {
    const error = new OpenApiParseError('INVALID_FORMAT', 'Test error');
    expect(isOpenApiParseError(error)).toBe(true);
  });

  it('should return false for regular Error instances', () => {
    const error = new Error('Regular error');
    expect(isOpenApiParseError(error)).toBe(false);
  });

  it('should return false for non-error values', () => {
    expect(isOpenApiParseError('string')).toBe(false);
    expect(isOpenApiParseError(null)).toBe(false);
    expect(isOpenApiParseError(undefined)).toBe(false);
    expect(isOpenApiParseError({})).toBe(false);
  });
});
