/**
 * AppUserCredential Schemas Unit Tests
 *
 * Tests for Zod schema validation and response helpers in the app-user-credentials module.
 */

import { describe, it, expect } from 'vitest';
import {
  ListUserCredentialsParamsSchema,
  AppUserCredentialResponseSchema,
  toAppUserCredentialResponse,
} from '@/lib/modules/app-user-credentials/app-user-credential.schemas';

// =============================================================================
// Test Data
// =============================================================================

const CREDENTIAL_ID = '11111111-aaaa-4bbb-8ccc-111111111111';
const CONNECTION_ID = '22222222-aaaa-4bbb-8ccc-222222222222';
const APP_USER_ID = '33333333-aaaa-4bbb-8ccc-333333333333';

function makeDbCredential(overrides: Record<string, unknown> = {}) {
  return {
    id: CREDENTIAL_ID,
    connectionId: CONNECTION_ID,
    appUserId: APP_USER_ID,
    credentialType: 'oauth2_tokens',
    status: 'active',
    expiresAt: new Date('2025-06-01T00:00:00Z'),
    scopes: ['read', 'write'],
    createdAt: new Date('2025-01-01T00:00:00Z'),
    updatedAt: new Date('2025-01-15T12:00:00Z'),
    ...overrides,
  };
}

// =============================================================================
// ListUserCredentialsParamsSchema
// =============================================================================

describe('ListUserCredentialsParamsSchema', () => {
  it('should apply default limit of 20 when no fields are provided', () => {
    const result = ListUserCredentialsParamsSchema.parse({});

    expect(result.limit).toBe(20);
    expect(result.cursor).toBeUndefined();
    expect(result.status).toBeUndefined();
  });

  it('should coerce a string limit to a number', () => {
    const result = ListUserCredentialsParamsSchema.parse({ limit: '50' });

    expect(result.limit).toBe(50);
    expect(typeof result.limit).toBe('number');
  });

  it('should accept a numeric limit', () => {
    const result = ListUserCredentialsParamsSchema.parse({ limit: 75 });

    expect(result.limit).toBe(75);
  });

  it('should reject limit below 1', () => {
    expect(() => ListUserCredentialsParamsSchema.parse({ limit: 0 })).toThrow();
    expect(() => ListUserCredentialsParamsSchema.parse({ limit: -5 })).toThrow();
  });

  it('should reject limit above 100', () => {
    expect(() => ListUserCredentialsParamsSchema.parse({ limit: 101 })).toThrow();
    expect(() => ListUserCredentialsParamsSchema.parse({ limit: 999 })).toThrow();
  });

  it('should accept limit at boundary values (1 and 100)', () => {
    expect(ListUserCredentialsParamsSchema.parse({ limit: 1 }).limit).toBe(1);
    expect(ListUserCredentialsParamsSchema.parse({ limit: 100 }).limit).toBe(100);
  });

  it('should reject non-integer limit', () => {
    expect(() => ListUserCredentialsParamsSchema.parse({ limit: 10.5 })).toThrow();
  });

  it('should accept an optional cursor string', () => {
    const result = ListUserCredentialsParamsSchema.parse({ cursor: 'some-cursor-token' });

    expect(result.cursor).toBe('some-cursor-token');
  });

  describe('status filter', () => {
    it('should accept "active"', () => {
      expect(ListUserCredentialsParamsSchema.parse({ status: 'active' }).status).toBe('active');
    });

    it('should accept "expired"', () => {
      expect(ListUserCredentialsParamsSchema.parse({ status: 'expired' }).status).toBe('expired');
    });

    it('should accept "revoked"', () => {
      expect(ListUserCredentialsParamsSchema.parse({ status: 'revoked' }).status).toBe('revoked');
    });

    it('should accept "needs_reauth"', () => {
      expect(ListUserCredentialsParamsSchema.parse({ status: 'needs_reauth' }).status).toBe(
        'needs_reauth'
      );
    });

    it('should reject invalid status values', () => {
      expect(() => ListUserCredentialsParamsSchema.parse({ status: 'invalid' })).toThrow();
      expect(() => ListUserCredentialsParamsSchema.parse({ status: '' })).toThrow();
      expect(() => ListUserCredentialsParamsSchema.parse({ status: 'ACTIVE' })).toThrow();
    });
  });

  it('should accept all fields together', () => {
    const result = ListUserCredentialsParamsSchema.parse({
      cursor: 'cursor-abc',
      limit: '30',
      status: 'expired',
    });

    expect(result.cursor).toBe('cursor-abc');
    expect(result.limit).toBe(30);
    expect(result.status).toBe('expired');
  });
});

// =============================================================================
// AppUserCredentialResponseSchema
// =============================================================================

describe('AppUserCredentialResponseSchema', () => {
  it('should validate a full, well-formed response object', () => {
    const response = {
      id: CREDENTIAL_ID,
      connectionId: CONNECTION_ID,
      appUserId: APP_USER_ID,
      credentialType: 'oauth2_tokens',
      status: 'active',
      expiresAt: '2025-06-01T00:00:00.000Z',
      scopes: ['read', 'write'],
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-15T12:00:00.000Z',
    };

    const result = AppUserCredentialResponseSchema.parse(response);

    expect(result.id).toBe(CREDENTIAL_ID);
    expect(result.connectionId).toBe(CONNECTION_ID);
    expect(result.appUserId).toBe(APP_USER_ID);
    expect(result.credentialType).toBe('oauth2_tokens');
    expect(result.status).toBe('active');
    expect(result.expiresAt).toBe('2025-06-01T00:00:00.000Z');
    expect(result.scopes).toEqual(['read', 'write']);
    expect(result.createdAt).toBe('2025-01-01T00:00:00.000Z');
    expect(result.updatedAt).toBe('2025-01-15T12:00:00.000Z');
  });

  it('should accept null expiresAt', () => {
    const response = {
      id: CREDENTIAL_ID,
      connectionId: CONNECTION_ID,
      appUserId: APP_USER_ID,
      credentialType: 'api_key',
      status: 'active',
      expiresAt: null,
      scopes: [],
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
    };

    const result = AppUserCredentialResponseSchema.parse(response);

    expect(result.expiresAt).toBeNull();
  });

  it('should accept an empty scopes array', () => {
    const response = {
      id: CREDENTIAL_ID,
      connectionId: CONNECTION_ID,
      appUserId: APP_USER_ID,
      credentialType: 'bearer',
      status: 'active',
      expiresAt: null,
      scopes: [],
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
    };

    const result = AppUserCredentialResponseSchema.parse(response);

    expect(result.scopes).toEqual([]);
  });

  describe('credentialType values', () => {
    const validTypes = ['oauth2_tokens', 'api_key', 'basic', 'bearer'] as const;

    for (const credentialType of validTypes) {
      it(`should accept credentialType "${credentialType}"`, () => {
        const response = {
          id: CREDENTIAL_ID,
          connectionId: CONNECTION_ID,
          appUserId: APP_USER_ID,
          credentialType,
          status: 'active',
          expiresAt: null,
          scopes: [],
          createdAt: '2025-01-01T00:00:00.000Z',
          updatedAt: '2025-01-01T00:00:00.000Z',
        };

        expect(AppUserCredentialResponseSchema.parse(response).credentialType).toBe(credentialType);
      });
    }

    it('should reject an invalid credentialType', () => {
      const response = {
        id: CREDENTIAL_ID,
        connectionId: CONNECTION_ID,
        appUserId: APP_USER_ID,
        credentialType: 'password',
        status: 'active',
        expiresAt: null,
        scopes: [],
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
      };

      expect(() => AppUserCredentialResponseSchema.parse(response)).toThrow();
    });
  });

  describe('status values', () => {
    const validStatuses = ['active', 'expired', 'revoked', 'needs_reauth'] as const;

    for (const status of validStatuses) {
      it(`should accept status "${status}"`, () => {
        const response = {
          id: CREDENTIAL_ID,
          connectionId: CONNECTION_ID,
          appUserId: APP_USER_ID,
          credentialType: 'oauth2_tokens',
          status,
          expiresAt: null,
          scopes: [],
          createdAt: '2025-01-01T00:00:00.000Z',
          updatedAt: '2025-01-01T00:00:00.000Z',
        };

        expect(AppUserCredentialResponseSchema.parse(response).status).toBe(status);
      });
    }

    it('should reject an invalid status', () => {
      const response = {
        id: CREDENTIAL_ID,
        connectionId: CONNECTION_ID,
        appUserId: APP_USER_ID,
        credentialType: 'oauth2_tokens',
        status: 'disabled',
        expiresAt: null,
        scopes: [],
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
      };

      expect(() => AppUserCredentialResponseSchema.parse(response)).toThrow();
    });
  });

  it('should reject non-UUID id fields', () => {
    const response = {
      id: 'not-a-uuid',
      connectionId: CONNECTION_ID,
      appUserId: APP_USER_ID,
      credentialType: 'oauth2_tokens',
      status: 'active',
      expiresAt: null,
      scopes: [],
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
    };

    expect(() => AppUserCredentialResponseSchema.parse(response)).toThrow();
  });

  it('should reject missing required fields', () => {
    expect(() => AppUserCredentialResponseSchema.parse({})).toThrow();
    expect(() =>
      AppUserCredentialResponseSchema.parse({
        id: CREDENTIAL_ID,
        // missing other fields
      })
    ).toThrow();
  });
});

// =============================================================================
// toAppUserCredentialResponse
// =============================================================================

describe('toAppUserCredentialResponse', () => {
  it('should convert a DB object to API response format', () => {
    const dbCredential = makeDbCredential();
    const result = toAppUserCredentialResponse(dbCredential);

    expect(result.id).toBe(CREDENTIAL_ID);
    expect(result.connectionId).toBe(CONNECTION_ID);
    expect(result.appUserId).toBe(APP_USER_ID);
    expect(result.credentialType).toBe('oauth2_tokens');
    expect(result.status).toBe('active');
    expect(result.scopes).toEqual(['read', 'write']);
  });

  it('should convert Date fields to ISO strings', () => {
    const dbCredential = makeDbCredential({
      createdAt: new Date('2025-01-01T00:00:00Z'),
      updatedAt: new Date('2025-01-15T12:00:00Z'),
      expiresAt: new Date('2025-06-01T00:00:00Z'),
    });

    const result = toAppUserCredentialResponse(dbCredential);

    expect(result.createdAt).toBe('2025-01-01T00:00:00.000Z');
    expect(result.updatedAt).toBe('2025-01-15T12:00:00.000Z');
    expect(result.expiresAt).toBe('2025-06-01T00:00:00.000Z');
  });

  it('should convert null expiresAt to null (not a string)', () => {
    const dbCredential = makeDbCredential({ expiresAt: null });

    const result = toAppUserCredentialResponse(dbCredential);

    expect(result.expiresAt).toBeNull();
  });

  it('should produce a response that passes AppUserCredentialResponseSchema validation', () => {
    const dbCredential = makeDbCredential();
    const result = toAppUserCredentialResponse(dbCredential);

    expect(() => AppUserCredentialResponseSchema.parse(result)).not.toThrow();
  });

  it('should produce a valid response with null expiresAt', () => {
    const dbCredential = makeDbCredential({ expiresAt: null });
    const result = toAppUserCredentialResponse(dbCredential);

    expect(() => AppUserCredentialResponseSchema.parse(result)).not.toThrow();
  });

  it('should preserve all credential types through conversion', () => {
    const types = ['oauth2_tokens', 'api_key', 'basic', 'bearer'] as const;

    for (const credentialType of types) {
      const dbCredential = makeDbCredential({ credentialType });
      const result = toAppUserCredentialResponse(dbCredential);

      expect(result.credentialType).toBe(credentialType);
      expect(() => AppUserCredentialResponseSchema.parse(result)).not.toThrow();
    }
  });

  it('should preserve all status values through conversion', () => {
    const statuses = ['active', 'expired', 'revoked', 'needs_reauth'] as const;

    for (const status of statuses) {
      const dbCredential = makeDbCredential({ status });
      const result = toAppUserCredentialResponse(dbCredential);

      expect(result.status).toBe(status);
      expect(() => AppUserCredentialResponseSchema.parse(result)).not.toThrow();
    }
  });

  it('should handle empty scopes array', () => {
    const dbCredential = makeDbCredential({ scopes: [] });

    const result = toAppUserCredentialResponse(dbCredential);

    expect(result.scopes).toEqual([]);
  });

  it('should handle scopes with multiple entries', () => {
    const dbCredential = makeDbCredential({
      scopes: ['channels:read', 'channels:write', 'users:read', 'admin'],
    });

    const result = toAppUserCredentialResponse(dbCredential);

    expect(result.scopes).toEqual(['channels:read', 'channels:write', 'users:read', 'admin']);
  });
});
