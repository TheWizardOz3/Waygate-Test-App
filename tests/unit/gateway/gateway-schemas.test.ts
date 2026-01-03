/**
 * Gateway Schemas Tests
 *
 * Tests Zod schema validation for Gateway API request/response structures.
 */

import { describe, it, expect, vi } from 'vitest';

// Mock Prisma before any imports that might use it
vi.mock('@/lib/db/client', () => ({
  prisma: {},
}));

import {
  GatewayInvokeRequestSchema,
  GatewayInvokeOptionsSchema,
  GatewaySuccessResponseSchema,
  GatewayErrorResponseSchema,
  IntegrationHealthResponseSchema,
  HealthStatusSchema,
  CircuitBreakerStatusSchema,
  GatewayErrorCodes,
} from '@/lib/modules/gateway';

describe('Gateway Schemas', () => {
  describe('GatewayInvokeRequestSchema', () => {
    it('should accept valid input object', () => {
      const result = GatewayInvokeRequestSchema.safeParse({
        channel: '#general',
        message: 'Hello world',
      });
      expect(result.success).toBe(true);
    });

    it('should accept empty object', () => {
      const result = GatewayInvokeRequestSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('should accept nested objects', () => {
      const result = GatewayInvokeRequestSchema.safeParse({
        user: {
          name: 'John',
          email: 'john@example.com',
        },
        options: {
          notify: true,
        },
      });
      expect(result.success).toBe(true);
    });

    it('should accept arrays', () => {
      const result = GatewayInvokeRequestSchema.safeParse({
        ids: [1, 2, 3],
        tags: ['a', 'b'],
      });
      expect(result.success).toBe(true);
    });

    it('should reject non-object types', () => {
      expect(GatewayInvokeRequestSchema.safeParse('string').success).toBe(false);
      expect(GatewayInvokeRequestSchema.safeParse(123).success).toBe(false);
      expect(GatewayInvokeRequestSchema.safeParse(null).success).toBe(false);
    });
  });

  describe('GatewayInvokeOptionsSchema', () => {
    it('should accept empty options', () => {
      const result = GatewayInvokeOptionsSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('should accept valid timeout', () => {
      const result = GatewayInvokeOptionsSchema.safeParse({ timeoutMs: 5000 });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.timeoutMs).toBe(5000);
      }
    });

    it('should accept skipValidation flag', () => {
      const result = GatewayInvokeOptionsSchema.safeParse({ skipValidation: true });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.skipValidation).toBe(true);
      }
    });

    it('should accept idempotencyKey', () => {
      const result = GatewayInvokeOptionsSchema.safeParse({
        idempotencyKey: 'my-unique-key-123',
      });
      expect(result.success).toBe(true);
    });

    it('should accept all options together', () => {
      const result = GatewayInvokeOptionsSchema.safeParse({
        timeoutMs: 10000,
        skipValidation: false,
        idempotencyKey: 'key-abc',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('GatewaySuccessResponseSchema', () => {
    it('should validate a complete success response', () => {
      const response = {
        success: true,
        data: { result: 'ok', id: '123' },
        meta: {
          requestId: 'req_12345',
          timestamp: '2026-01-02T10:00:00.000Z',
          execution: {
            latencyMs: 150,
            retryCount: 0,
            cached: false,
          },
        },
      };

      const result = GatewaySuccessResponseSchema.safeParse(response);
      expect(result.success).toBe(true);
    });

    it('should accept null data', () => {
      const response = {
        success: true,
        data: null,
        meta: {
          requestId: 'req_12345',
          timestamp: '2026-01-02T10:00:00.000Z',
          execution: {
            latencyMs: 150,
            retryCount: 0,
            cached: false,
          },
        },
      };

      const result = GatewaySuccessResponseSchema.safeParse(response);
      expect(result.success).toBe(true);
    });

    it('should require all meta fields', () => {
      const response = {
        success: true,
        data: {},
        meta: {
          requestId: 'req_12345',
          // Missing timestamp and execution
        },
      };

      const result = GatewaySuccessResponseSchema.safeParse(response);
      expect(result.success).toBe(false);
    });

    it('should validate execution metrics', () => {
      const response = {
        success: true,
        data: {},
        meta: {
          requestId: 'req_12345',
          timestamp: '2026-01-02T10:00:00.000Z',
          execution: {
            latencyMs: 150,
            retryCount: 2,
            cached: true,
            externalLatencyMs: 120,
          },
        },
      };

      const result = GatewaySuccessResponseSchema.safeParse(response);
      expect(result.success).toBe(true);
    });
  });

  describe('GatewayErrorResponseSchema', () => {
    it('should validate a complete error response', () => {
      const response = {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Input validation failed',
          requestId: 'req_12345',
          suggestedResolution: {
            action: 'RETRY_WITH_MODIFIED_INPUT',
            description: 'Fix the input fields',
            retryable: true,
          },
        },
      };

      const result = GatewayErrorResponseSchema.safeParse(response);
      expect(result.success).toBe(true);
    });

    it('should accept error with details', () => {
      const response = {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Input validation failed',
          details: {
            field: 'email',
            error: 'Invalid format',
          },
          requestId: 'req_12345',
          suggestedResolution: {
            action: 'RETRY_WITH_MODIFIED_INPUT',
            description: 'Check your email format',
            retryable: true,
          },
        },
      };

      const result = GatewayErrorResponseSchema.safeParse(response);
      expect(result.success).toBe(true);
    });

    it('should accept optional retryAfterMs', () => {
      const response = {
        success: false,
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many requests',
          requestId: 'req_12345',
          suggestedResolution: {
            action: 'RETRY_AFTER_DELAY', // Valid enum value
            description: 'Wait before retrying',
            retryable: true,
            retryAfterMs: 5000,
          },
        },
      };

      const result = GatewayErrorResponseSchema.safeParse(response);
      expect(result.success).toBe(true);
    });

    it('should require success: false', () => {
      const response = {
        success: true, // Wrong!
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Error',
          requestId: 'req_12345',
          suggestedResolution: {
            action: 'RETRY',
            description: 'Retry',
            retryable: true,
          },
        },
      };

      const result = GatewayErrorResponseSchema.safeParse(response);
      expect(result.success).toBe(false);
    });
  });

  describe('HealthStatusSchema', () => {
    it('should accept healthy status', () => {
      expect(HealthStatusSchema.safeParse('healthy').success).toBe(true);
    });

    it('should accept degraded status', () => {
      expect(HealthStatusSchema.safeParse('degraded').success).toBe(true);
    });

    it('should accept unhealthy status', () => {
      expect(HealthStatusSchema.safeParse('unhealthy').success).toBe(true);
    });

    it('should reject invalid status', () => {
      expect(HealthStatusSchema.safeParse('good').success).toBe(false);
      expect(HealthStatusSchema.safeParse('bad').success).toBe(false);
    });
  });

  describe('CircuitBreakerStatusSchema', () => {
    it('should accept closed status', () => {
      expect(CircuitBreakerStatusSchema.safeParse('closed').success).toBe(true);
    });

    it('should accept open status', () => {
      expect(CircuitBreakerStatusSchema.safeParse('open').success).toBe(true);
    });

    it('should accept half_open status', () => {
      expect(CircuitBreakerStatusSchema.safeParse('half_open').success).toBe(true);
    });

    it('should reject invalid status', () => {
      expect(CircuitBreakerStatusSchema.safeParse('active').success).toBe(false);
    });
  });

  describe('IntegrationHealthResponseSchema', () => {
    it('should validate a healthy integration response', () => {
      const response = {
        success: true,
        data: {
          status: 'healthy',
          credentials: {
            status: 'active',
            expiresAt: '2026-01-10T00:00:00.000Z',
            needsRefresh: false,
          },
          circuitBreaker: {
            status: 'closed',
            failureCount: 0,
          },
          lastSuccessfulRequest: '2026-01-02T09:15:00.000Z',
        },
      };

      const result = IntegrationHealthResponseSchema.safeParse(response);
      expect(result.success).toBe(true);
    });

    it('should validate an unhealthy integration response', () => {
      const response = {
        success: true,
        data: {
          status: 'unhealthy',
          credentials: {
            status: 'expired',
            expiresAt: '2025-12-31T00:00:00.000Z',
            needsRefresh: true,
          },
          circuitBreaker: {
            status: 'open',
            failureCount: 5,
          },
          lastSuccessfulRequest: null,
        },
      };

      const result = IntegrationHealthResponseSchema.safeParse(response);
      expect(result.success).toBe(true);
    });

    it('should allow null lastSuccessfulRequest', () => {
      const response = {
        success: true,
        data: {
          status: 'healthy',
          credentials: {
            status: 'active',
            expiresAt: null, // Required field, can be null
            needsRefresh: false,
          },
          circuitBreaker: {
            status: 'closed',
            failureCount: 0,
          },
          lastSuccessfulRequest: null,
        },
      };

      const result = IntegrationHealthResponseSchema.safeParse(response);
      expect(result.success).toBe(true);
    });
  });

  describe('GatewayErrorCodes', () => {
    it('should have INTEGRATION_NOT_FOUND with 404 status', () => {
      expect(GatewayErrorCodes.INTEGRATION_NOT_FOUND.httpStatus).toBe(404);
      expect(GatewayErrorCodes.INTEGRATION_NOT_FOUND.code).toBe('INTEGRATION_NOT_FOUND');
    });

    it('should have VALIDATION_ERROR with 400 status', () => {
      expect(GatewayErrorCodes.VALIDATION_ERROR.httpStatus).toBe(400);
      expect(GatewayErrorCodes.VALIDATION_ERROR.retryable).toBe(true);
    });

    it('should have CREDENTIALS_MISSING with 401 status', () => {
      expect(GatewayErrorCodes.CREDENTIALS_MISSING.httpStatus).toBe(401);
    });

    it('should have CIRCUIT_OPEN with 503 status', () => {
      expect(GatewayErrorCodes.CIRCUIT_OPEN.httpStatus).toBe(503);
      expect(GatewayErrorCodes.CIRCUIT_OPEN.retryable).toBe(true);
    });

    it('should have RATE_LIMITED with 429 status', () => {
      expect(GatewayErrorCodes.RATE_LIMITED.httpStatus).toBe(429);
      expect(GatewayErrorCodes.RATE_LIMITED.retryable).toBe(true);
    });

    it('should have INTERNAL_ERROR with 500 status', () => {
      expect(GatewayErrorCodes.INTERNAL_ERROR.httpStatus).toBe(500);
      expect(GatewayErrorCodes.INTERNAL_ERROR.retryable).toBe(false);
    });

    it('should have suggested actions for all error codes', () => {
      for (const [, value] of Object.entries(GatewayErrorCodes)) {
        expect(value.suggestedAction).toBeDefined();
        expect(typeof value.suggestedAction).toBe('string');
        expect(value.suggestedAction.length).toBeGreaterThan(0);
      }
    });
  });
});
