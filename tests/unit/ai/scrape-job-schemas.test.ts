/**
 * Scrape Job Schemas Unit Tests
 *
 * Tests for Zod schemas and validation helpers for scrape jobs.
 */

import { describe, it, expect } from 'vitest';
import {
  // Status helpers
  ScrapeJobStatusSchema,
  isJobInProgress,
  isJobComplete,
  // Parsed API schemas
  ParsedApiDocSchema,
  ApiEndpointSchema,
  ApiAuthMethodSchema,
  ApiParameterSchema,
  // Input schemas
  CreateScrapeJobInputSchema,
  // Validation helpers
  validateParsedApiDoc,
  safeParseParsedApiDoc,
} from '@/lib/modules/ai/scrape-job.schemas';

// =============================================================================
// ScrapeJobStatusSchema Tests
// =============================================================================

describe('ScrapeJobStatusSchema', () => {
  it('should accept valid status values', () => {
    expect(ScrapeJobStatusSchema.parse('PENDING')).toBe('PENDING');
    expect(ScrapeJobStatusSchema.parse('CRAWLING')).toBe('CRAWLING');
    expect(ScrapeJobStatusSchema.parse('PARSING')).toBe('PARSING');
    expect(ScrapeJobStatusSchema.parse('GENERATING')).toBe('GENERATING');
    expect(ScrapeJobStatusSchema.parse('COMPLETED')).toBe('COMPLETED');
    expect(ScrapeJobStatusSchema.parse('FAILED')).toBe('FAILED');
  });

  it('should reject invalid status values', () => {
    expect(() => ScrapeJobStatusSchema.parse('INVALID')).toThrow();
    expect(() => ScrapeJobStatusSchema.parse('')).toThrow();
    expect(() => ScrapeJobStatusSchema.parse('pending')).toThrow(); // lowercase
  });
});

// =============================================================================
// isJobInProgress Tests
// =============================================================================

describe('isJobInProgress', () => {
  it('should return true for in-progress statuses', () => {
    expect(isJobInProgress('PENDING')).toBe(true);
    expect(isJobInProgress('CRAWLING')).toBe(true);
    expect(isJobInProgress('PARSING')).toBe(true);
    expect(isJobInProgress('GENERATING')).toBe(true);
  });

  it('should return false for terminal statuses', () => {
    expect(isJobInProgress('COMPLETED')).toBe(false);
    expect(isJobInProgress('FAILED')).toBe(false);
  });
});

// =============================================================================
// isJobComplete Tests
// =============================================================================

describe('isJobComplete', () => {
  it('should return true for terminal statuses', () => {
    expect(isJobComplete('COMPLETED')).toBe(true);
    expect(isJobComplete('FAILED')).toBe(true);
  });

  it('should return false for in-progress statuses', () => {
    expect(isJobComplete('PENDING')).toBe(false);
    expect(isJobComplete('CRAWLING')).toBe(false);
    expect(isJobComplete('PARSING')).toBe(false);
    expect(isJobComplete('GENERATING')).toBe(false);
  });
});

// =============================================================================
// ApiParameterSchema Tests
// =============================================================================

describe('ApiParameterSchema', () => {
  it('should validate valid parameter', () => {
    const param = {
      name: 'userId',
      type: 'string',
      required: true,
      description: 'User identifier',
    };

    expect(ApiParameterSchema.parse(param)).toEqual(param);
  });

  it('should accept optional fields', () => {
    const param = {
      name: 'limit',
      type: 'integer',
      required: false,
      default: 10,
      enum: ['10', '20', '50'],
    };

    const result = ApiParameterSchema.parse(param);
    expect(result.default).toBe(10);
    expect(result.enum).toEqual(['10', '20', '50']);
  });

  it('should require name, type, and required', () => {
    expect(() => ApiParameterSchema.parse({ name: 'test' })).toThrow();
    expect(() => ApiParameterSchema.parse({ type: 'string' })).toThrow();
    expect(() => ApiParameterSchema.parse({ required: true })).toThrow();
  });
});

// =============================================================================
// ApiAuthMethodSchema Tests
// =============================================================================

describe('ApiAuthMethodSchema', () => {
  it('should validate bearer auth', () => {
    const auth = {
      type: 'bearer',
      config: { scheme: 'bearer' },
      location: 'header',
    };

    expect(ApiAuthMethodSchema.parse(auth)).toMatchObject({ type: 'bearer' });
  });

  it('should validate api_key auth', () => {
    const auth = {
      type: 'api_key',
      config: { name: 'X-API-Key' },
      location: 'header',
      paramName: 'X-API-Key',
    };

    expect(ApiAuthMethodSchema.parse(auth)).toMatchObject({ type: 'api_key' });
  });

  it('should validate oauth2 auth', () => {
    const auth = {
      type: 'oauth2',
      config: {
        authorizationUrl: 'https://example.com/oauth/authorize',
        tokenUrl: 'https://example.com/oauth/token',
      },
    };

    expect(ApiAuthMethodSchema.parse(auth)).toMatchObject({ type: 'oauth2' });
  });

  it('should reject invalid auth types', () => {
    const auth = {
      type: 'invalid_type',
      config: {},
    };

    expect(() => ApiAuthMethodSchema.parse(auth)).toThrow();
  });

  it('should require type and config', () => {
    expect(() => ApiAuthMethodSchema.parse({ type: 'bearer' })).toThrow();
    expect(() => ApiAuthMethodSchema.parse({ config: {} })).toThrow();
  });
});

// =============================================================================
// ApiEndpointSchema Tests
// =============================================================================

describe('ApiEndpointSchema', () => {
  it('should validate valid endpoint', () => {
    const endpoint = {
      name: 'List Users',
      slug: 'list-users',
      method: 'GET',
      path: '/users',
      responses: {
        '200': { description: 'Success' },
      },
    };

    expect(ApiEndpointSchema.parse(endpoint)).toMatchObject({
      name: 'List Users',
      slug: 'list-users',
    });
  });

  it('should validate all HTTP methods', () => {
    const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

    for (const method of methods) {
      const endpoint = {
        name: 'Test',
        slug: 'test',
        method,
        path: '/test',
        responses: { '200': { description: 'OK' } },
      };

      expect(ApiEndpointSchema.parse(endpoint).method).toBe(method);
    }
  });

  it('should accept optional parameters', () => {
    const endpoint = {
      name: 'Get User',
      slug: 'get-user',
      method: 'GET',
      path: '/users/{id}',
      description: 'Get a single user',
      pathParameters: [{ name: 'id', type: 'string', required: true }],
      queryParameters: [{ name: 'fields', type: 'string', required: false }],
      responses: { '200': { description: 'Success' } },
      tags: ['users'],
      deprecated: false,
    };

    const result = ApiEndpointSchema.parse(endpoint);
    expect(result.pathParameters).toHaveLength(1);
    expect(result.queryParameters).toHaveLength(1);
    expect(result.tags).toEqual(['users']);
  });

  it('should reject invalid HTTP methods', () => {
    const endpoint = {
      name: 'Test',
      slug: 'test',
      method: 'INVALID',
      path: '/test',
      responses: {},
    };

    expect(() => ApiEndpointSchema.parse(endpoint)).toThrow();
  });
});

// =============================================================================
// ParsedApiDocSchema Tests
// =============================================================================

describe('ParsedApiDocSchema', () => {
  it('should validate complete parsed doc', () => {
    const doc = {
      name: 'Test API',
      description: 'A test API',
      baseUrl: 'https://api.example.com',
      version: '1.0.0',
      authMethods: [{ type: 'bearer', config: {} }],
      endpoints: [
        {
          name: 'List Items',
          slug: 'list-items',
          method: 'GET',
          path: '/items',
          responses: { '200': { description: 'Success' } },
        },
      ],
    };

    expect(ParsedApiDocSchema.parse(doc)).toMatchObject({ name: 'Test API' });
  });

  it('should require name, baseUrl, authMethods, and endpoints', () => {
    expect(() => ParsedApiDocSchema.parse({})).toThrow();
    expect(() => ParsedApiDocSchema.parse({ name: 'Test' })).toThrow();
    expect(() =>
      ParsedApiDocSchema.parse({
        name: 'Test',
        baseUrl: 'https://api.example.com',
      })
    ).toThrow();
  });

  it('should validate baseUrl format', () => {
    const doc = {
      name: 'Test',
      baseUrl: 'not-a-url',
      authMethods: [],
      endpoints: [],
    };

    expect(() => ParsedApiDocSchema.parse(doc)).toThrow();
  });

  it('should accept empty authMethods and endpoints arrays', () => {
    const doc = {
      name: 'Test API',
      baseUrl: 'https://api.example.com',
      authMethods: [],
      endpoints: [],
    };

    expect(ParsedApiDocSchema.parse(doc).endpoints).toEqual([]);
  });

  it('should validate metadata if present', () => {
    const doc = {
      name: 'Test API',
      baseUrl: 'https://api.example.com',
      authMethods: [],
      endpoints: [],
      metadata: {
        scrapedAt: '2024-01-01T00:00:00.000Z',
        sourceUrls: ['https://docs.example.com'],
        aiConfidence: 0.85,
        warnings: ['Some warning'],
      },
    };

    const result = ParsedApiDocSchema.parse(doc);
    expect(result.metadata?.aiConfidence).toBe(0.85);
  });
});

// =============================================================================
// CreateScrapeJobInputSchema Tests
// =============================================================================

describe('CreateScrapeJobInputSchema', () => {
  it('should validate valid input', () => {
    const input = {
      documentationUrl: 'https://docs.example.com/api',
    };

    expect(CreateScrapeJobInputSchema.parse(input)).toMatchObject({
      documentationUrl: 'https://docs.example.com/api',
    });
  });

  it('should accept optional wishlist', () => {
    const input = {
      documentationUrl: 'https://docs.example.com',
      wishlist: ['send message', 'list users'],
    };

    const result = CreateScrapeJobInputSchema.parse(input);
    expect(result.wishlist).toEqual(['send message', 'list users']);
  });

  it('should require valid URL', () => {
    expect(() =>
      CreateScrapeJobInputSchema.parse({
        documentationUrl: 'not-a-url',
      })
    ).toThrow();
  });

  it('should require documentationUrl', () => {
    expect(() => CreateScrapeJobInputSchema.parse({})).toThrow();
    expect(() => CreateScrapeJobInputSchema.parse({ wishlist: [] })).toThrow();
  });

  it('should accept empty wishlist', () => {
    const input = {
      documentationUrl: 'https://docs.example.com',
      wishlist: [],
    };

    const result = CreateScrapeJobInputSchema.parse(input);
    expect(result.wishlist).toEqual([]);
  });
});

// =============================================================================
// validateParsedApiDoc Tests
// =============================================================================

describe('validateParsedApiDoc', () => {
  it('should return valid doc unchanged', () => {
    const doc = {
      name: 'Test',
      baseUrl: 'https://api.example.com',
      authMethods: [],
      endpoints: [],
    };

    expect(validateParsedApiDoc(doc)).toEqual(doc);
  });

  it('should throw on invalid doc', () => {
    expect(() => validateParsedApiDoc({})).toThrow();
    expect(() => validateParsedApiDoc(null)).toThrow();
    expect(() => validateParsedApiDoc('string')).toThrow();
  });
});

// =============================================================================
// safeParseParsedApiDoc Tests
// =============================================================================

describe('safeParseParsedApiDoc', () => {
  it('should return parsed doc for valid input', () => {
    const doc = {
      name: 'Test',
      baseUrl: 'https://api.example.com',
      authMethods: [],
      endpoints: [],
    };

    const result = safeParseParsedApiDoc(doc);
    expect(result).not.toBeNull();
    expect(result?.name).toBe('Test');
  });

  it('should return null for invalid doc', () => {
    const result = safeParseParsedApiDoc({});
    expect(result).toBeNull();
  });

  it('should not throw on invalid input', () => {
    expect(() => safeParseParsedApiDoc(null)).not.toThrow();
    expect(() => safeParseParsedApiDoc(undefined)).not.toThrow();
    expect(() => safeParseParsedApiDoc('invalid')).not.toThrow();
  });
});
