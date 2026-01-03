/**
 * Logging Service Tests
 *
 * Tests sanitization, truncation, and data preparation functions.
 */

import { describe, it, expect, vi } from 'vitest';

// Mock Prisma before any imports that might use it
vi.mock('@/lib/db/client', () => ({
  prisma: {},
}));

import {
  sanitizeHeaders,
  sanitizeBody,
  truncateBody,
  prepareRequestSummary,
  prepareResponseSummary,
  prepareError,
  MAX_BODY_SIZE,
  SENSITIVE_HEADERS,
  SENSITIVE_FIELDS,
} from '@/lib/modules/logging';

describe('Logging Service', () => {
  describe('sanitizeHeaders', () => {
    it('should return undefined for undefined input', () => {
      expect(sanitizeHeaders(undefined)).toBeUndefined();
    });

    it('should preserve non-sensitive headers', () => {
      const headers = {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-Custom-Header': 'value',
      };
      const result = sanitizeHeaders(headers);
      expect(result).toEqual(headers);
    });

    it('should redact authorization header', () => {
      const headers = {
        Authorization: 'Bearer secret-token-123',
        'Content-Type': 'application/json',
      };
      const result = sanitizeHeaders(headers);
      expect(result?.Authorization).toBe('[REDACTED]');
      expect(result?.['Content-Type']).toBe('application/json');
    });

    it('should redact x-api-key header', () => {
      const headers = {
        'X-Api-Key': 'my-api-key',
        Accept: 'application/json',
      };
      const result = sanitizeHeaders(headers);
      expect(result?.['X-Api-Key']).toBe('[REDACTED]');
    });

    it('should redact cookie headers', () => {
      const headers = {
        Cookie: 'session=abc123',
        'Set-Cookie': 'token=xyz789',
      };
      const result = sanitizeHeaders(headers);
      expect(result?.Cookie).toBe('[REDACTED]');
      expect(result?.['Set-Cookie']).toBe('[REDACTED]');
    });

    it('should be case-insensitive for sensitive headers', () => {
      const headers = {
        AUTHORIZATION: 'secret',
        'x-api-key': 'key',
      };
      const result = sanitizeHeaders(headers);
      expect(result?.AUTHORIZATION).toBe('[REDACTED]');
      expect(result?.['x-api-key']).toBe('[REDACTED]');
    });

    it('should redact headers containing sensitive keywords', () => {
      const headers = {
        'X-Custom-Authorization-Token': 'secret',
      };
      const result = sanitizeHeaders(headers);
      expect(result?.['X-Custom-Authorization-Token']).toBe('[REDACTED]');
    });
  });

  describe('sanitizeBody', () => {
    it('should return null/undefined as-is', () => {
      expect(sanitizeBody(null)).toBeNull();
      expect(sanitizeBody(undefined)).toBeUndefined();
    });

    it('should return primitive values as-is', () => {
      expect(sanitizeBody('string')).toBe('string');
      expect(sanitizeBody(123)).toBe(123);
      expect(sanitizeBody(true)).toBe(true);
    });

    it('should redact password field', () => {
      const body = { username: 'john', password: 'secret123' };
      const result = sanitizeBody(body);
      expect(result).toEqual({ username: 'john', password: '[REDACTED]' });
    });

    it('should redact token fields', () => {
      const body = {
        accessToken: 'abc123',
        access_token: 'xyz789',
        refreshToken: 'refresh123',
      };
      const result = sanitizeBody(body);
      expect(result).toEqual({
        accessToken: '[REDACTED]',
        access_token: '[REDACTED]',
        refreshToken: '[REDACTED]',
      });
    });

    it('should redact apiKey fields', () => {
      const body = {
        apiKey: 'key123',
        api_key: 'key456',
      };
      const result = sanitizeBody(body);
      expect(result).toEqual({
        apiKey: '[REDACTED]',
        api_key: '[REDACTED]',
      });
    });

    it('should redact nested sensitive fields', () => {
      const body = {
        user: {
          name: 'John',
          credentials: {
            password: 'secret',
            apiKey: 'key123',
          },
        },
      };
      const result = sanitizeBody(body);
      expect(result).toEqual({
        user: {
          name: 'John',
          credentials: '[REDACTED]', // 'credentials' itself is a sensitive field
        },
      });
    });

    it('should sanitize arrays', () => {
      const body = [
        { id: 1, token: 'abc' },
        { id: 2, token: 'xyz' },
      ];
      const result = sanitizeBody(body);
      expect(result).toEqual([
        { id: 1, token: '[REDACTED]' },
        { id: 2, token: '[REDACTED]' },
      ]);
    });

    it('should handle deeply nested objects', () => {
      const body = {
        level1: {
          level2: {
            level3: {
              secret: 'hidden',
              visible: 'shown',
            },
          },
        },
      };
      const result = sanitizeBody(body);
      expect(result).toEqual({
        level1: {
          level2: {
            level3: {
              secret: '[REDACTED]',
              visible: 'shown',
            },
          },
        },
      });
    });

    it('should prevent infinite recursion with MAX_DEPTH_EXCEEDED', () => {
      // Create a deeply nested object
      let obj: Record<string, unknown> = { value: 'bottom' };
      for (let i = 0; i < 15; i++) {
        obj = { nested: obj };
      }

      const result = sanitizeBody(obj) as Record<string, unknown>;
      // Should hit max depth and return [MAX_DEPTH_EXCEEDED]
      let current = result;
      let depth = 0;
      while (current && typeof current === 'object' && 'nested' in current) {
        current = current.nested as Record<string, unknown>;
        depth++;
      }
      // Should have stopped at some point
      expect(depth).toBeLessThan(15);
    });
  });

  describe('truncateBody', () => {
    it('should not truncate null/undefined', () => {
      expect(truncateBody(null)).toEqual({ body: null, truncated: false });
      expect(truncateBody(undefined)).toEqual({ body: undefined, truncated: false });
    });

    it('should not truncate small strings', () => {
      const small = 'Hello world';
      const result = truncateBody(small);
      expect(result.truncated).toBe(false);
      expect(result.body).toBe(small);
    });

    it('should not truncate small objects', () => {
      const obj = { name: 'John', email: 'john@example.com' };
      const result = truncateBody(obj);
      expect(result.truncated).toBe(false);
      expect(result.body).toEqual(obj);
    });

    it('should truncate large strings', () => {
      const large = 'x'.repeat(MAX_BODY_SIZE + 1000);
      const result = truncateBody(large);
      expect(result.truncated).toBe(true);
      expect(typeof result.body).toBe('string');
      expect((result.body as string).includes('[TRUNCATED]')).toBe(true);
    });

    it('should truncate large objects', () => {
      const large = {
        data: 'x'.repeat(MAX_BODY_SIZE + 1000),
      };
      const result = truncateBody(large);
      expect(result.truncated).toBe(true);
      expect((result.body as Record<string, unknown>)._truncated).toBe(true);
      expect((result.body as Record<string, unknown>)._originalSize).toBeGreaterThan(MAX_BODY_SIZE);
    });

    it('should include preview in truncated objects', () => {
      const large = {
        data: 'important_data_' + 'x'.repeat(MAX_BODY_SIZE),
      };
      const result = truncateBody(large);
      expect(result.truncated).toBe(true);
      expect((result.body as Record<string, unknown>)._preview).toBeDefined();
      expect(typeof (result.body as Record<string, unknown>)._preview).toBe('string');
    });
  });

  describe('prepareRequestSummary', () => {
    it('should prepare a basic request summary', () => {
      const request = {
        method: 'GET',
        url: 'https://api.example.com/users',
      };
      const result = prepareRequestSummary(request);
      expect(result.method).toBe('GET');
      expect(result.url).toBe('https://api.example.com/users');
      expect(result.headers).toBeUndefined();
      expect(result.body).toBeUndefined();
    });

    it('should sanitize headers in request', () => {
      const request = {
        method: 'POST',
        url: 'https://api.example.com/login',
        headers: {
          Authorization: 'Bearer token123',
          'Content-Type': 'application/json',
        },
      };
      const result = prepareRequestSummary(request);
      expect(result.headers?.Authorization).toBe('[REDACTED]');
      expect(result.headers?.['Content-Type']).toBe('application/json');
    });

    it('should sanitize body in request', () => {
      const request = {
        method: 'POST',
        url: 'https://api.example.com/login',
        body: {
          username: 'john',
          password: 'secret123',
        },
      };
      const result = prepareRequestSummary(request);
      expect((result.body as Record<string, unknown>).username).toBe('john');
      expect((result.body as Record<string, unknown>).password).toBe('[REDACTED]');
    });

    it('should set bodyTruncated flag for large bodies', () => {
      const request = {
        method: 'POST',
        url: 'https://api.example.com/data',
        body: { data: 'x'.repeat(MAX_BODY_SIZE + 1000) },
      };
      const result = prepareRequestSummary(request);
      expect(result.bodyTruncated).toBe(true);
    });
  });

  describe('prepareResponseSummary', () => {
    it('should prepare a basic response summary', () => {
      const response = {
        statusCode: 200,
        body: { success: true },
      };
      const result = prepareResponseSummary(response);
      expect(result.statusCode).toBe(200);
      expect(result.body).toEqual({ success: true });
    });

    it('should sanitize response headers', () => {
      const response = {
        statusCode: 200,
        headers: {
          'Set-Cookie': 'session=abc123',
          'Content-Type': 'application/json',
        },
      };
      const result = prepareResponseSummary(response);
      expect(result.headers?.['Set-Cookie']).toBe('[REDACTED]');
      expect(result.headers?.['Content-Type']).toBe('application/json');
    });

    it('should sanitize response body', () => {
      const response = {
        statusCode: 200,
        body: {
          userId: '123',
          accessToken: 'token-abc',
        },
      };
      const result = prepareResponseSummary(response);
      expect((result.body as Record<string, unknown>).userId).toBe('123');
      expect((result.body as Record<string, unknown>).accessToken).toBe('[REDACTED]');
    });
  });

  describe('prepareError', () => {
    it('should prepare an Error instance', () => {
      const error = new Error('Something went wrong');
      const result = prepareError(error);
      expect(result.code).toBe('UNKNOWN_ERROR');
      expect(result.message).toBe('Something went wrong');
    });

    it('should use error code if present on Error', () => {
      const error = new Error('Validation failed') as Error & { code: string };
      error.code = 'VALIDATION_ERROR';
      const result = prepareError(error);
      expect(result.code).toBe('VALIDATION_ERROR');
    });

    it('should prepare a plain error object', () => {
      const error = {
        code: 'CUSTOM_ERROR',
        message: 'Custom error occurred',
        details: { field: 'email' },
      };
      const result = prepareError(error);
      expect(result.code).toBe('CUSTOM_ERROR');
      expect(result.message).toBe('Custom error occurred');
      expect(result.details).toEqual({ field: 'email' });
    });

    it('should default code to UNKNOWN_ERROR for plain objects', () => {
      const error = { message: 'Unknown issue' };
      const result = prepareError(error);
      expect(result.code).toBe('UNKNOWN_ERROR');
    });
  });

  describe('SENSITIVE_HEADERS constant', () => {
    it('should include common sensitive header names', () => {
      expect(SENSITIVE_HEADERS).toContain('authorization');
      expect(SENSITIVE_HEADERS).toContain('x-api-key');
      expect(SENSITIVE_HEADERS).toContain('cookie');
      expect(SENSITIVE_HEADERS).toContain('set-cookie');
    });
  });

  describe('SENSITIVE_FIELDS constant', () => {
    it('should include common sensitive field names', () => {
      expect(SENSITIVE_FIELDS).toContain('password');
      expect(SENSITIVE_FIELDS).toContain('token');
      expect(SENSITIVE_FIELDS).toContain('accessToken');
      expect(SENSITIVE_FIELDS).toContain('refreshToken');
      expect(SENSITIVE_FIELDS).toContain('apiKey');
      expect(SENSITIVE_FIELDS).toContain('secret');
    });
  });

  describe('MAX_BODY_SIZE constant', () => {
    it('should be a reasonable size (10KB)', () => {
      expect(MAX_BODY_SIZE).toBe(10000);
    });
  });
});
