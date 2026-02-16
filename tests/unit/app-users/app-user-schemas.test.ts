/**
 * AppUser Schema Tests
 *
 * Tests for app user validation schemas and response helpers.
 */

import { describe, it, expect } from 'vitest';
import {
  CreateAppUserSchema,
  UpdateAppUserSchema,
  ListAppUsersParamsSchema,
  AppUserResponseSchema,
  toAppUserResponse,
} from '@/lib/modules/app-users/app-user.schemas';

// Reusable UUIDs for test data
const TEST_APP_USER_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
const TEST_APP_ID = 'b1ffcd00-ad1c-5f09-8c7e-7cc0ce491b22';

describe('AppUser Schema Validation', () => {
  // ===========================================================================
  // CreateAppUserSchema
  // ===========================================================================
  describe('CreateAppUserSchema', () => {
    it('should accept valid input with only externalId', () => {
      const result = CreateAppUserSchema.parse({
        externalId: 'user-123',
      });
      expect(result.externalId).toBe('user-123');
      expect(result.metadata).toEqual({});
    });

    it('should accept valid input with all fields', () => {
      const result = CreateAppUserSchema.parse({
        externalId: 'user-456',
        displayName: 'Jane Doe',
        email: 'jane@example.com',
        metadata: { role: 'admin', tier: 'premium' },
      });
      expect(result.externalId).toBe('user-456');
      expect(result.displayName).toBe('Jane Doe');
      expect(result.email).toBe('jane@example.com');
      expect(result.metadata).toEqual({ role: 'admin', tier: 'premium' });
    });

    it('should default metadata to empty object when not provided', () => {
      const result = CreateAppUserSchema.parse({
        externalId: 'user-789',
      });
      expect(result.metadata).toEqual({});
    });

    it('should accept optional displayName', () => {
      const result = CreateAppUserSchema.parse({
        externalId: 'user-100',
        displayName: 'Test User',
      });
      expect(result.displayName).toBe('Test User');
    });

    it('should accept optional email', () => {
      const result = CreateAppUserSchema.parse({
        externalId: 'user-200',
        email: 'test@example.com',
      });
      expect(result.email).toBe('test@example.com');
    });

    it('should reject empty externalId', () => {
      expect(() =>
        CreateAppUserSchema.parse({
          externalId: '',
        })
      ).toThrow();
    });

    it('should reject missing externalId', () => {
      expect(() => CreateAppUserSchema.parse({})).toThrow();
    });

    it('should reject externalId exceeding 255 characters', () => {
      expect(() =>
        CreateAppUserSchema.parse({
          externalId: 'x'.repeat(256),
        })
      ).toThrow();
    });

    it('should accept externalId at max length (255)', () => {
      const result = CreateAppUserSchema.parse({
        externalId: 'x'.repeat(255),
      });
      expect(result.externalId).toHaveLength(255);
    });

    it('should reject displayName exceeding 255 characters', () => {
      expect(() =>
        CreateAppUserSchema.parse({
          externalId: 'user-1',
          displayName: 'n'.repeat(256),
        })
      ).toThrow();
    });

    it('should reject invalid email format', () => {
      expect(() =>
        CreateAppUserSchema.parse({
          externalId: 'user-1',
          email: 'not-an-email',
        })
      ).toThrow();
    });

    it('should reject email exceeding 255 characters', () => {
      const longEmail = 'a'.repeat(250) + '@b.com';
      expect(() =>
        CreateAppUserSchema.parse({
          externalId: 'user-1',
          email: longEmail,
        })
      ).toThrow();
    });

    it('should accept metadata with mixed value types', () => {
      const result = CreateAppUserSchema.parse({
        externalId: 'user-1',
        metadata: {
          count: 42,
          active: true,
          tags: ['a', 'b'],
          nested: { key: 'value' },
        },
      });
      expect(result.metadata).toEqual({
        count: 42,
        active: true,
        tags: ['a', 'b'],
        nested: { key: 'value' },
      });
    });
  });

  // ===========================================================================
  // UpdateAppUserSchema
  // ===========================================================================
  describe('UpdateAppUserSchema', () => {
    it('should accept partial update with displayName only', () => {
      const result = UpdateAppUserSchema.parse({
        displayName: 'Updated Name',
      });
      expect(result.displayName).toBe('Updated Name');
      expect(result.email).toBeUndefined();
      expect(result.metadata).toBeUndefined();
    });

    it('should accept partial update with email only', () => {
      const result = UpdateAppUserSchema.parse({
        email: 'new@example.com',
      });
      expect(result.email).toBe('new@example.com');
      expect(result.displayName).toBeUndefined();
    });

    it('should accept partial update with metadata only', () => {
      const result = UpdateAppUserSchema.parse({
        metadata: { key: 'value' },
      });
      expect(result.metadata).toEqual({ key: 'value' });
    });

    it('should accept all fields together', () => {
      const result = UpdateAppUserSchema.parse({
        displayName: 'New Name',
        email: 'new@example.com',
        metadata: { updated: true },
      });
      expect(result.displayName).toBe('New Name');
      expect(result.email).toBe('new@example.com');
      expect(result.metadata).toEqual({ updated: true });
    });

    it('should accept empty object (no fields)', () => {
      const result = UpdateAppUserSchema.parse({});
      expect(result.displayName).toBeUndefined();
      expect(result.email).toBeUndefined();
      expect(result.metadata).toBeUndefined();
    });

    it('should accept null for displayName (nullable field)', () => {
      const result = UpdateAppUserSchema.parse({
        displayName: null,
      });
      expect(result.displayName).toBeNull();
    });

    it('should accept null for email (nullable field)', () => {
      const result = UpdateAppUserSchema.parse({
        email: null,
      });
      expect(result.email).toBeNull();
    });

    it('should reject invalid email format', () => {
      expect(() =>
        UpdateAppUserSchema.parse({
          email: 'bad-email',
        })
      ).toThrow();
    });

    it('should reject displayName exceeding 255 characters', () => {
      expect(() =>
        UpdateAppUserSchema.parse({
          displayName: 'n'.repeat(256),
        })
      ).toThrow();
    });

    it('should reject email exceeding 255 characters', () => {
      const longEmail = 'a'.repeat(250) + '@b.com';
      expect(() =>
        UpdateAppUserSchema.parse({
          email: longEmail,
        })
      ).toThrow();
    });
  });

  // ===========================================================================
  // ListAppUsersParamsSchema
  // ===========================================================================
  describe('ListAppUsersParamsSchema', () => {
    it('should apply default limit of 20 when not provided', () => {
      const result = ListAppUsersParamsSchema.parse({});
      expect(result.limit).toBe(20);
    });

    it('should accept valid cursor', () => {
      const result = ListAppUsersParamsSchema.parse({
        cursor: TEST_APP_USER_ID,
      });
      expect(result.cursor).toBe(TEST_APP_USER_ID);
    });

    it('should accept valid search string', () => {
      const result = ListAppUsersParamsSchema.parse({
        search: 'jane',
      });
      expect(result.search).toBe('jane');
    });

    it('should coerce string limit to number', () => {
      const result = ListAppUsersParamsSchema.parse({
        limit: '50',
      });
      expect(result.limit).toBe(50);
      expect(typeof result.limit).toBe('number');
    });

    it('should accept limit at minimum bound (1)', () => {
      const result = ListAppUsersParamsSchema.parse({
        limit: 1,
      });
      expect(result.limit).toBe(1);
    });

    it('should accept limit at maximum bound (100)', () => {
      const result = ListAppUsersParamsSchema.parse({
        limit: 100,
      });
      expect(result.limit).toBe(100);
    });

    it('should reject limit below minimum (0)', () => {
      expect(() => ListAppUsersParamsSchema.parse({ limit: 0 })).toThrow();
    });

    it('should reject limit above maximum (101)', () => {
      expect(() => ListAppUsersParamsSchema.parse({ limit: 101 })).toThrow();
    });

    it('should reject non-integer limit', () => {
      expect(() => ListAppUsersParamsSchema.parse({ limit: 10.5 })).toThrow();
    });

    it('should leave cursor and search undefined when not provided', () => {
      const result = ListAppUsersParamsSchema.parse({});
      expect(result.cursor).toBeUndefined();
      expect(result.search).toBeUndefined();
    });
  });

  // ===========================================================================
  // AppUserResponseSchema
  // ===========================================================================
  describe('AppUserResponseSchema', () => {
    const validResponse = {
      id: TEST_APP_USER_ID,
      appId: TEST_APP_ID,
      externalId: 'ext-user-1',
      displayName: 'Test User',
      email: 'test@example.com',
      metadata: { plan: 'pro' },
      createdAt: '2025-01-15T10:30:00.000Z',
      updatedAt: '2025-01-16T12:00:00.000Z',
    };

    it('should accept a valid response shape', () => {
      const result = AppUserResponseSchema.parse(validResponse);
      expect(result.id).toBe(TEST_APP_USER_ID);
      expect(result.appId).toBe(TEST_APP_ID);
      expect(result.externalId).toBe('ext-user-1');
      expect(result.displayName).toBe('Test User');
      expect(result.email).toBe('test@example.com');
      expect(result.metadata).toEqual({ plan: 'pro' });
      expect(result.createdAt).toBe('2025-01-15T10:30:00.000Z');
      expect(result.updatedAt).toBe('2025-01-16T12:00:00.000Z');
    });

    it('should accept null displayName', () => {
      const result = AppUserResponseSchema.parse({
        ...validResponse,
        displayName: null,
      });
      expect(result.displayName).toBeNull();
    });

    it('should accept null email', () => {
      const result = AppUserResponseSchema.parse({
        ...validResponse,
        email: null,
      });
      expect(result.email).toBeNull();
    });

    it('should accept empty metadata object', () => {
      const result = AppUserResponseSchema.parse({
        ...validResponse,
        metadata: {},
      });
      expect(result.metadata).toEqual({});
    });

    it('should reject non-UUID id', () => {
      expect(() =>
        AppUserResponseSchema.parse({
          ...validResponse,
          id: 'not-a-uuid',
        })
      ).toThrow();
    });

    it('should reject non-UUID appId', () => {
      expect(() =>
        AppUserResponseSchema.parse({
          ...validResponse,
          appId: 'not-a-uuid',
        })
      ).toThrow();
    });

    it('should reject missing required fields', () => {
      expect(() =>
        AppUserResponseSchema.parse({
          id: TEST_APP_USER_ID,
        })
      ).toThrow();
    });
  });

  // ===========================================================================
  // toAppUserResponse()
  // ===========================================================================
  describe('toAppUserResponse', () => {
    const now = new Date('2025-06-01T08:00:00.000Z');
    const later = new Date('2025-06-02T12:30:00.000Z');

    const dbAppUser = {
      id: TEST_APP_USER_ID,
      appId: TEST_APP_ID,
      externalId: 'ext-abc-123',
      displayName: 'Alice',
      email: 'alice@example.com',
      metadata: { org: 'acme', level: 3 },
      createdAt: now,
      updatedAt: later,
    };

    it('should convert a DB object to API response format', () => {
      const result = toAppUserResponse(dbAppUser);
      expect(result).toEqual({
        id: TEST_APP_USER_ID,
        appId: TEST_APP_ID,
        externalId: 'ext-abc-123',
        displayName: 'Alice',
        email: 'alice@example.com',
        metadata: { org: 'acme', level: 3 },
        createdAt: '2025-06-01T08:00:00.000Z',
        updatedAt: '2025-06-02T12:30:00.000Z',
      });
    });

    it('should convert Date fields to ISO strings', () => {
      const result = toAppUserResponse(dbAppUser);
      expect(typeof result.createdAt).toBe('string');
      expect(typeof result.updatedAt).toBe('string');
      expect(result.createdAt).toBe(now.toISOString());
      expect(result.updatedAt).toBe(later.toISOString());
    });

    it('should preserve null displayName', () => {
      const result = toAppUserResponse({
        ...dbAppUser,
        displayName: null,
      });
      expect(result.displayName).toBeNull();
    });

    it('should preserve null email', () => {
      const result = toAppUserResponse({
        ...dbAppUser,
        email: null,
      });
      expect(result.email).toBeNull();
    });

    it('should handle null metadata by defaulting to empty object', () => {
      const result = toAppUserResponse({
        ...dbAppUser,
        metadata: null,
      });
      expect(result.metadata).toEqual({});
    });

    it('should handle undefined metadata by defaulting to empty object', () => {
      const result = toAppUserResponse({
        ...dbAppUser,
        metadata: undefined,
      });
      expect(result.metadata).toEqual({});
    });

    it('should produce output that passes AppUserResponseSchema validation', () => {
      const result = toAppUserResponse(dbAppUser);
      const parsed = AppUserResponseSchema.safeParse(result);
      expect(parsed.success).toBe(true);
    });

    it('should handle metadata with nested structures', () => {
      const result = toAppUserResponse({
        ...dbAppUser,
        metadata: {
          preferences: { theme: 'dark', lang: 'en' },
          tags: ['vip', 'early-access'],
        },
      });
      expect(result.metadata).toEqual({
        preferences: { theme: 'dark', lang: 'en' },
        tags: ['vip', 'early-access'],
      });
    });
  });
});
