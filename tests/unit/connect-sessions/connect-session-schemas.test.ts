/**
 * ConnectSession Schemas Unit Tests
 *
 * Tests for Zod schema validation in the connect sessions module.
 */

import { describe, it, expect } from 'vitest';
import {
  ConnectSessionStatusSchema,
  CreateConnectSessionInputSchema,
  ConnectSessionResponseSchema,
  CreateConnectSessionResponseSchema,
  toConnectSessionResponse,
} from '@/lib/modules/connect-sessions/connect-session.schemas';

describe('ConnectSession Schemas', () => {
  describe('ConnectSessionStatusSchema', () => {
    it('should accept valid statuses', () => {
      expect(ConnectSessionStatusSchema.parse('pending')).toBe('pending');
      expect(ConnectSessionStatusSchema.parse('completed')).toBe('completed');
      expect(ConnectSessionStatusSchema.parse('expired')).toBe('expired');
      expect(ConnectSessionStatusSchema.parse('failed')).toBe('failed');
    });

    it('should reject invalid statuses', () => {
      expect(() => ConnectSessionStatusSchema.parse('active')).toThrow();
      expect(() => ConnectSessionStatusSchema.parse('cancelled')).toThrow();
      expect(() => ConnectSessionStatusSchema.parse('')).toThrow();
      expect(() => ConnectSessionStatusSchema.parse(123)).toThrow();
    });
  });

  describe('CreateConnectSessionInputSchema', () => {
    it('should accept valid input with required fields only', () => {
      const input = {
        externalUserId: 'user-abc-123',
        integrationSlug: 'slack',
      };

      const result = CreateConnectSessionInputSchema.parse(input);

      expect(result.externalUserId).toBe('user-abc-123');
      expect(result.integrationSlug).toBe('slack');
      expect(result.redirectUrl).toBeUndefined();
      expect(result.user).toBeUndefined();
    });

    it('should accept valid input with all optional fields', () => {
      const input = {
        externalUserId: 'user-abc-123',
        integrationSlug: 'google-calendar',
        redirectUrl: 'https://myapp.com/callback',
        user: {
          displayName: 'John Doe',
          email: 'john@example.com',
        },
      };

      const result = CreateConnectSessionInputSchema.parse(input);

      expect(result.externalUserId).toBe('user-abc-123');
      expect(result.integrationSlug).toBe('google-calendar');
      expect(result.redirectUrl).toBe('https://myapp.com/callback');
      expect(result.user?.displayName).toBe('John Doe');
      expect(result.user?.email).toBe('john@example.com');
    });

    it('should accept user object with only displayName', () => {
      const input = {
        externalUserId: 'user-1',
        integrationSlug: 'slack',
        user: { displayName: 'Jane Doe' },
      };

      const result = CreateConnectSessionInputSchema.parse(input);

      expect(result.user?.displayName).toBe('Jane Doe');
      expect(result.user?.email).toBeUndefined();
    });

    it('should accept user object with only email', () => {
      const input = {
        externalUserId: 'user-1',
        integrationSlug: 'slack',
        user: { email: 'jane@example.com' },
      };

      const result = CreateConnectSessionInputSchema.parse(input);

      expect(result.user?.email).toBe('jane@example.com');
      expect(result.user?.displayName).toBeUndefined();
    });

    it('should reject missing externalUserId', () => {
      const input = {
        integrationSlug: 'slack',
      };

      expect(() => CreateConnectSessionInputSchema.parse(input)).toThrow();
    });

    it('should reject missing integrationSlug', () => {
      const input = {
        externalUserId: 'user-abc-123',
      };

      expect(() => CreateConnectSessionInputSchema.parse(input)).toThrow();
    });

    it('should reject empty externalUserId', () => {
      const input = {
        externalUserId: '',
        integrationSlug: 'slack',
      };

      expect(() => CreateConnectSessionInputSchema.parse(input)).toThrow();
    });

    it('should reject empty integrationSlug', () => {
      const input = {
        externalUserId: 'user-1',
        integrationSlug: '',
      };

      expect(() => CreateConnectSessionInputSchema.parse(input)).toThrow();
    });

    it('should reject externalUserId exceeding max length', () => {
      const input = {
        externalUserId: 'x'.repeat(256),
        integrationSlug: 'slack',
      };

      expect(() => CreateConnectSessionInputSchema.parse(input)).toThrow();
    });

    it('should reject integrationSlug exceeding max length', () => {
      const input = {
        externalUserId: 'user-1',
        integrationSlug: 'x'.repeat(101),
      };

      expect(() => CreateConnectSessionInputSchema.parse(input)).toThrow();
    });

    it('should reject invalid redirectUrl', () => {
      const input = {
        externalUserId: 'user-1',
        integrationSlug: 'slack',
        redirectUrl: 'not-a-url',
      };

      expect(() => CreateConnectSessionInputSchema.parse(input)).toThrow();
    });

    it('should accept valid URL for redirectUrl', () => {
      const input = {
        externalUserId: 'user-1',
        integrationSlug: 'slack',
        redirectUrl: 'https://example.com/auth/callback?state=abc',
      };

      const result = CreateConnectSessionInputSchema.parse(input);

      expect(result.redirectUrl).toBe('https://example.com/auth/callback?state=abc');
    });

    it('should reject invalid email in user object', () => {
      const input = {
        externalUserId: 'user-1',
        integrationSlug: 'slack',
        user: { email: 'not-an-email' },
      };

      expect(() => CreateConnectSessionInputSchema.parse(input)).toThrow();
    });

    it('should reject displayName exceeding max length', () => {
      const input = {
        externalUserId: 'user-1',
        integrationSlug: 'slack',
        user: { displayName: 'x'.repeat(256) },
      };

      expect(() => CreateConnectSessionInputSchema.parse(input)).toThrow();
    });

    it('should reject email exceeding max length', () => {
      const input = {
        externalUserId: 'user-1',
        integrationSlug: 'slack',
        user: { email: 'a'.repeat(250) + '@b.com' },
      };

      expect(() => CreateConnectSessionInputSchema.parse(input)).toThrow();
    });
  });

  describe('ConnectSessionResponseSchema', () => {
    const validResponse = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      appId: '223e4567-e89b-12d3-a456-426614174000',
      appUserId: '323e4567-e89b-12d3-a456-426614174000',
      integrationId: '423e4567-e89b-12d3-a456-426614174000',
      connectionId: '523e4567-e89b-12d3-a456-426614174000',
      status: 'pending',
      redirectUrl: 'https://myapp.com/callback',
      expiresAt: '2024-01-15T12:00:00.000Z',
      completedAt: '2024-01-15T12:05:00.000Z',
      errorMessage: null,
      metadata: { source: 'web' },
      createdAt: '2024-01-15T11:00:00.000Z',
    };

    it('should accept a valid full response', () => {
      const result = ConnectSessionResponseSchema.parse(validResponse);

      expect(result.id).toBe(validResponse.id);
      expect(result.appId).toBe(validResponse.appId);
      expect(result.appUserId).toBe(validResponse.appUserId);
      expect(result.integrationId).toBe(validResponse.integrationId);
      expect(result.connectionId).toBe(validResponse.connectionId);
      expect(result.status).toBe('pending');
      expect(result.redirectUrl).toBe('https://myapp.com/callback');
      expect(result.expiresAt).toBe('2024-01-15T12:00:00.000Z');
      expect(result.completedAt).toBe('2024-01-15T12:05:00.000Z');
      expect(result.errorMessage).toBeNull();
      expect(result.metadata).toEqual({ source: 'web' });
      expect(result.createdAt).toBe('2024-01-15T11:00:00.000Z');
    });

    it('should accept null connectionId', () => {
      const response = { ...validResponse, connectionId: null };

      const result = ConnectSessionResponseSchema.parse(response);

      expect(result.connectionId).toBeNull();
    });

    it('should accept null completedAt', () => {
      const response = { ...validResponse, completedAt: null };

      const result = ConnectSessionResponseSchema.parse(response);

      expect(result.completedAt).toBeNull();
    });

    it('should accept errorMessage string', () => {
      const response = {
        ...validResponse,
        status: 'failed',
        errorMessage: 'OAuth callback failed: invalid grant',
      };

      const result = ConnectSessionResponseSchema.parse(response);

      expect(result.errorMessage).toBe('OAuth callback failed: invalid grant');
    });

    it('should accept null errorMessage', () => {
      const result = ConnectSessionResponseSchema.parse(validResponse);

      expect(result.errorMessage).toBeNull();
    });

    it('should accept null redirectUrl', () => {
      const response = { ...validResponse, redirectUrl: null };

      const result = ConnectSessionResponseSchema.parse(response);

      expect(result.redirectUrl).toBeNull();
    });

    it('should reject non-UUID id fields', () => {
      expect(() =>
        ConnectSessionResponseSchema.parse({ ...validResponse, id: 'not-a-uuid' })
      ).toThrow();
      expect(() =>
        ConnectSessionResponseSchema.parse({ ...validResponse, appId: 'not-a-uuid' })
      ).toThrow();
      expect(() =>
        ConnectSessionResponseSchema.parse({ ...validResponse, appUserId: 'not-a-uuid' })
      ).toThrow();
      expect(() =>
        ConnectSessionResponseSchema.parse({ ...validResponse, integrationId: 'not-a-uuid' })
      ).toThrow();
    });

    it('should reject invalid status in response', () => {
      expect(() =>
        ConnectSessionResponseSchema.parse({ ...validResponse, status: 'unknown' })
      ).toThrow();
    });

    it('should accept all valid status values in response', () => {
      for (const status of ['pending', 'completed', 'expired', 'failed']) {
        const result = ConnectSessionResponseSchema.parse({ ...validResponse, status });
        expect(result.status).toBe(status);
      }
    });
  });

  describe('CreateConnectSessionResponseSchema', () => {
    it('should accept a valid creation response', () => {
      const response = {
        sessionId: '123e4567-e89b-12d3-a456-426614174000',
        connectUrl: 'https://waygate.app/connect/abc123',
        token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test-token',
        expiresAt: '2024-01-15T12:30:00.000Z',
      };

      const result = CreateConnectSessionResponseSchema.parse(response);

      expect(result.sessionId).toBe(response.sessionId);
      expect(result.connectUrl).toBe(response.connectUrl);
      expect(result.token).toBe(response.token);
      expect(result.expiresAt).toBe(response.expiresAt);
    });

    it('should reject non-UUID sessionId', () => {
      const response = {
        sessionId: 'not-a-uuid',
        connectUrl: 'https://waygate.app/connect/abc123',
        token: 'some-token',
        expiresAt: '2024-01-15T12:30:00.000Z',
      };

      expect(() => CreateConnectSessionResponseSchema.parse(response)).toThrow();
    });

    it('should reject invalid connectUrl', () => {
      const response = {
        sessionId: '123e4567-e89b-12d3-a456-426614174000',
        connectUrl: 'not-a-url',
        token: 'some-token',
        expiresAt: '2024-01-15T12:30:00.000Z',
      };

      expect(() => CreateConnectSessionResponseSchema.parse(response)).toThrow();
    });

    it('should reject missing token', () => {
      const response = {
        sessionId: '123e4567-e89b-12d3-a456-426614174000',
        connectUrl: 'https://waygate.app/connect/abc123',
        expiresAt: '2024-01-15T12:30:00.000Z',
      };

      expect(() => CreateConnectSessionResponseSchema.parse(response)).toThrow();
    });

    it('should reject missing expiresAt', () => {
      const response = {
        sessionId: '123e4567-e89b-12d3-a456-426614174000',
        connectUrl: 'https://waygate.app/connect/abc123',
        token: 'some-token',
      };

      expect(() => CreateConnectSessionResponseSchema.parse(response)).toThrow();
    });
  });

  describe('toConnectSessionResponse', () => {
    it('should convert a database object to API response format', () => {
      const dbSession = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        appId: '223e4567-e89b-12d3-a456-426614174000',
        appUserId: '323e4567-e89b-12d3-a456-426614174000',
        integrationId: '423e4567-e89b-12d3-a456-426614174000',
        connectionId: '523e4567-e89b-12d3-a456-426614174000',
        status: 'completed',
        redirectUrl: 'https://myapp.com/callback',
        expiresAt: new Date('2024-01-15T12:00:00Z'),
        completedAt: new Date('2024-01-15T12:05:00Z'),
        errorMessage: null,
        metadata: { source: 'web', integration: 'slack' },
        createdAt: new Date('2024-01-15T11:00:00Z'),
      };

      const result = toConnectSessionResponse(dbSession);

      expect(result.id).toBe(dbSession.id);
      expect(result.appId).toBe(dbSession.appId);
      expect(result.appUserId).toBe(dbSession.appUserId);
      expect(result.integrationId).toBe(dbSession.integrationId);
      expect(result.connectionId).toBe(dbSession.connectionId);
      expect(result.status).toBe('completed');
      expect(result.redirectUrl).toBe('https://myapp.com/callback');
      expect(result.expiresAt).toBe('2024-01-15T12:00:00.000Z');
      expect(result.completedAt).toBe('2024-01-15T12:05:00.000Z');
      expect(result.errorMessage).toBeNull();
      expect(result.metadata).toEqual({ source: 'web', integration: 'slack' });
      expect(result.createdAt).toBe('2024-01-15T11:00:00.000Z');
    });

    it('should convert Date fields to ISO strings', () => {
      const now = new Date('2024-06-15T09:30:00Z');
      const later = new Date('2024-06-15T10:00:00Z');

      const dbSession = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        appId: '223e4567-e89b-12d3-a456-426614174000',
        appUserId: '323e4567-e89b-12d3-a456-426614174000',
        integrationId: '423e4567-e89b-12d3-a456-426614174000',
        connectionId: null,
        status: 'pending',
        redirectUrl: null,
        expiresAt: later,
        completedAt: null,
        errorMessage: null,
        metadata: {},
        createdAt: now,
      };

      const result = toConnectSessionResponse(dbSession);

      expect(result.expiresAt).toBe('2024-06-15T10:00:00.000Z');
      expect(result.createdAt).toBe('2024-06-15T09:30:00.000Z');
    });

    it('should handle null connectionId', () => {
      const dbSession = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        appId: '223e4567-e89b-12d3-a456-426614174000',
        appUserId: '323e4567-e89b-12d3-a456-426614174000',
        integrationId: '423e4567-e89b-12d3-a456-426614174000',
        connectionId: null,
        status: 'pending',
        redirectUrl: null,
        expiresAt: new Date('2024-01-15T12:00:00Z'),
        completedAt: null,
        errorMessage: null,
        metadata: {},
        createdAt: new Date('2024-01-15T11:00:00Z'),
      };

      const result = toConnectSessionResponse(dbSession);

      expect(result.connectionId).toBeNull();
    });

    it('should handle null completedAt', () => {
      const dbSession = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        appId: '223e4567-e89b-12d3-a456-426614174000',
        appUserId: '323e4567-e89b-12d3-a456-426614174000',
        integrationId: '423e4567-e89b-12d3-a456-426614174000',
        connectionId: null,
        status: 'pending',
        redirectUrl: null,
        expiresAt: new Date('2024-01-15T12:00:00Z'),
        completedAt: null,
        errorMessage: null,
        metadata: {},
        createdAt: new Date('2024-01-15T11:00:00Z'),
      };

      const result = toConnectSessionResponse(dbSession);

      expect(result.completedAt).toBeNull();
    });

    it('should handle null errorMessage', () => {
      const dbSession = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        appId: '223e4567-e89b-12d3-a456-426614174000',
        appUserId: '323e4567-e89b-12d3-a456-426614174000',
        integrationId: '423e4567-e89b-12d3-a456-426614174000',
        connectionId: null,
        status: 'completed',
        redirectUrl: null,
        expiresAt: new Date('2024-01-15T12:00:00Z'),
        completedAt: new Date('2024-01-15T12:05:00Z'),
        errorMessage: null,
        metadata: {},
        createdAt: new Date('2024-01-15T11:00:00Z'),
      };

      const result = toConnectSessionResponse(dbSession);

      expect(result.errorMessage).toBeNull();
    });

    it('should preserve errorMessage when present', () => {
      const dbSession = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        appId: '223e4567-e89b-12d3-a456-426614174000',
        appUserId: '323e4567-e89b-12d3-a456-426614174000',
        integrationId: '423e4567-e89b-12d3-a456-426614174000',
        connectionId: null,
        status: 'failed',
        redirectUrl: null,
        expiresAt: new Date('2024-01-15T12:00:00Z'),
        completedAt: null,
        errorMessage: 'OAuth callback failed: invalid_grant',
        metadata: {},
        createdAt: new Date('2024-01-15T11:00:00Z'),
      };

      const result = toConnectSessionResponse(dbSession);

      expect(result.errorMessage).toBe('OAuth callback failed: invalid_grant');
    });

    it('should handle null redirectUrl', () => {
      const dbSession = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        appId: '223e4567-e89b-12d3-a456-426614174000',
        appUserId: '323e4567-e89b-12d3-a456-426614174000',
        integrationId: '423e4567-e89b-12d3-a456-426614174000',
        connectionId: null,
        status: 'pending',
        redirectUrl: null,
        expiresAt: new Date('2024-01-15T12:00:00Z'),
        completedAt: null,
        errorMessage: null,
        metadata: {},
        createdAt: new Date('2024-01-15T11:00:00Z'),
      };

      const result = toConnectSessionResponse(dbSession);

      expect(result.redirectUrl).toBeNull();
    });

    it('should default metadata to empty object when null', () => {
      const dbSession = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        appId: '223e4567-e89b-12d3-a456-426614174000',
        appUserId: '323e4567-e89b-12d3-a456-426614174000',
        integrationId: '423e4567-e89b-12d3-a456-426614174000',
        connectionId: null,
        status: 'pending',
        redirectUrl: null,
        expiresAt: new Date('2024-01-15T12:00:00Z'),
        completedAt: null,
        errorMessage: null,
        metadata: null,
        createdAt: new Date('2024-01-15T11:00:00Z'),
      };

      const result = toConnectSessionResponse(dbSession);

      expect(result.metadata).toEqual({});
    });

    it('should produce a result that passes ConnectSessionResponseSchema validation', () => {
      const dbSession = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        appId: '223e4567-e89b-12d3-a456-426614174000',
        appUserId: '323e4567-e89b-12d3-a456-426614174000',
        integrationId: '423e4567-e89b-12d3-a456-426614174000',
        connectionId: '523e4567-e89b-12d3-a456-426614174000',
        status: 'completed',
        redirectUrl: 'https://myapp.com/done',
        expiresAt: new Date('2024-01-15T12:00:00Z'),
        completedAt: new Date('2024-01-15T12:05:00Z'),
        errorMessage: null,
        metadata: { key: 'value' },
        createdAt: new Date('2024-01-15T11:00:00Z'),
      };

      const result = toConnectSessionResponse(dbSession);

      expect(() => ConnectSessionResponseSchema.parse(result)).not.toThrow();
    });
  });
});
