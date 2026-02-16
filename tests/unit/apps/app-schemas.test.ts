/**
 * App Schemas Unit Tests
 *
 * Tests for Zod schema validation in the apps module.
 */

import { describe, it, expect } from 'vitest';
import {
  AppStatusSchema,
  AppBrandingSchema,
  CreateAppInputSchema,
  UpdateAppInputSchema,
  SetIntegrationConfigInputSchema,
  ListAppsQuerySchema,
  AppResponseSchema,
  AppWithKeyResponseSchema,
  IntegrationConfigResponseSchema,
  toAppResponse,
  toIntegrationConfigResponse,
} from '@/lib/modules/apps/app.schemas';

describe('App Schemas', () => {
  // ===========================================================================
  // AppStatusSchema
  // ===========================================================================

  describe('AppStatusSchema', () => {
    it('should accept "active"', () => {
      expect(AppStatusSchema.parse('active')).toBe('active');
    });

    it('should accept "disabled"', () => {
      expect(AppStatusSchema.parse('disabled')).toBe('disabled');
    });

    it('should reject invalid statuses', () => {
      expect(() => AppStatusSchema.parse('inactive')).toThrow();
      expect(() => AppStatusSchema.parse('deleted')).toThrow();
      expect(() => AppStatusSchema.parse('')).toThrow();
      expect(() => AppStatusSchema.parse('ACTIVE')).toThrow();
    });
  });

  // ===========================================================================
  // AppBrandingSchema
  // ===========================================================================

  describe('AppBrandingSchema', () => {
    it('should accept valid branding with all fields', () => {
      const branding = {
        logoUrl: 'https://example.com/logo.png',
        appName: 'My App',
        accentColor: '#7C3AED',
        privacyUrl: 'https://example.com/privacy',
      };

      const result = AppBrandingSchema.parse(branding);

      expect(result.logoUrl).toBe('https://example.com/logo.png');
      expect(result.appName).toBe('My App');
      expect(result.accentColor).toBe('#7C3AED');
      expect(result.privacyUrl).toBe('https://example.com/privacy');
    });

    it('should accept empty object (all fields optional)', () => {
      const result = AppBrandingSchema.parse({});

      expect(result.logoUrl).toBeUndefined();
      expect(result.appName).toBeUndefined();
      expect(result.accentColor).toBeUndefined();
      expect(result.privacyUrl).toBeUndefined();
    });

    it('should reject invalid logoUrl', () => {
      expect(() => AppBrandingSchema.parse({ logoUrl: 'not-a-url' })).toThrow();
    });

    it('should reject invalid privacyUrl', () => {
      expect(() => AppBrandingSchema.parse({ privacyUrl: 'not-a-url' })).toThrow();
    });

    it('should reject invalid hex color format', () => {
      expect(() => AppBrandingSchema.parse({ accentColor: 'red' })).toThrow();
      expect(() => AppBrandingSchema.parse({ accentColor: '#GGG' })).toThrow();
      expect(() => AppBrandingSchema.parse({ accentColor: '#7C3AE' })).toThrow();
      expect(() => AppBrandingSchema.parse({ accentColor: '7C3AED' })).toThrow();
    });

    it('should accept valid hex colors (case-insensitive)', () => {
      expect(AppBrandingSchema.parse({ accentColor: '#ffffff' }).accentColor).toBe('#ffffff');
      expect(AppBrandingSchema.parse({ accentColor: '#FFFFFF' }).accentColor).toBe('#FFFFFF');
      expect(AppBrandingSchema.parse({ accentColor: '#000000' }).accentColor).toBe('#000000');
    });

    it('should enforce appName max length', () => {
      expect(() => AppBrandingSchema.parse({ appName: 'a'.repeat(256) })).toThrow();
    });

    it('should accept appName at max length', () => {
      const result = AppBrandingSchema.parse({ appName: 'a'.repeat(255) });
      expect(result.appName).toHaveLength(255);
    });
  });

  // ===========================================================================
  // CreateAppInputSchema
  // ===========================================================================

  describe('CreateAppInputSchema', () => {
    it('should accept valid input with all fields', () => {
      const input = {
        name: 'My Application',
        slug: 'my-application',
        description: 'A test application',
        metadata: {
          branding: {
            logoUrl: 'https://example.com/logo.png',
            accentColor: '#10B981',
          },
        },
      };

      const result = CreateAppInputSchema.parse(input);

      expect(result.name).toBe('My Application');
      expect(result.slug).toBe('my-application');
      expect(result.description).toBe('A test application');
      expect(result.metadata.branding?.logoUrl).toBe('https://example.com/logo.png');
      expect(result.metadata.branding?.accentColor).toBe('#10B981');
    });

    it('should accept minimal required fields', () => {
      const input = {
        name: 'My App',
        slug: 'my-app',
      };

      const result = CreateAppInputSchema.parse(input);

      expect(result.name).toBe('My App');
      expect(result.slug).toBe('my-app');
      expect(result.description).toBeUndefined();
      expect(result.metadata).toEqual({});
    });

    it('should default metadata to empty object', () => {
      const result = CreateAppInputSchema.parse({
        name: 'Test',
        slug: 'test',
      });

      expect(result.metadata).toEqual({});
    });

    it('should accept slugs with lowercase letters, numbers, and hyphens', () => {
      expect(CreateAppInputSchema.parse({ name: 'A', slug: 'abc' }).slug).toBe('abc');
      expect(CreateAppInputSchema.parse({ name: 'A', slug: 'a-b-c' }).slug).toBe('a-b-c');
      expect(CreateAppInputSchema.parse({ name: 'A', slug: '123' }).slug).toBe('123');
      expect(CreateAppInputSchema.parse({ name: 'A', slug: 'app-v2' }).slug).toBe('app-v2');
    });

    it('should reject slugs with uppercase letters', () => {
      expect(() => CreateAppInputSchema.parse({ name: 'Test', slug: 'MyApp' })).toThrow();
    });

    it('should reject slugs with spaces', () => {
      expect(() => CreateAppInputSchema.parse({ name: 'Test', slug: 'my app' })).toThrow();
    });

    it('should reject slugs with underscores', () => {
      expect(() => CreateAppInputSchema.parse({ name: 'Test', slug: 'my_app' })).toThrow();
    });

    it('should reject slugs with special characters', () => {
      expect(() => CreateAppInputSchema.parse({ name: 'Test', slug: 'my.app' })).toThrow();
      expect(() => CreateAppInputSchema.parse({ name: 'Test', slug: 'my@app' })).toThrow();
    });

    it('should reject empty name', () => {
      expect(() => CreateAppInputSchema.parse({ name: '', slug: 'test' })).toThrow();
    });

    it('should reject empty slug', () => {
      expect(() => CreateAppInputSchema.parse({ name: 'Test', slug: '' })).toThrow();
    });

    it('should reject missing required fields', () => {
      expect(() => CreateAppInputSchema.parse({})).toThrow();
      expect(() => CreateAppInputSchema.parse({ name: 'Test' })).toThrow();
      expect(() => CreateAppInputSchema.parse({ slug: 'test' })).toThrow();
    });

    it('should enforce name max length of 255', () => {
      expect(() => CreateAppInputSchema.parse({ name: 'a'.repeat(256), slug: 'test' })).toThrow();
    });

    it('should enforce slug max length of 100', () => {
      expect(() => CreateAppInputSchema.parse({ name: 'Test', slug: 'a'.repeat(101) })).toThrow();
    });

    it('should enforce description max length of 2000', () => {
      expect(() =>
        CreateAppInputSchema.parse({
          name: 'Test',
          slug: 'test',
          description: 'a'.repeat(2001),
        })
      ).toThrow();
    });

    it('should accept metadata with branding', () => {
      const input = {
        name: 'Test',
        slug: 'test',
        metadata: {
          branding: {
            appName: 'Branded Name',
            accentColor: '#1E1B4B',
          },
        },
      };

      const result = CreateAppInputSchema.parse(input);

      expect(result.metadata.branding?.appName).toBe('Branded Name');
      expect(result.metadata.branding?.accentColor).toBe('#1E1B4B');
    });
  });

  // ===========================================================================
  // UpdateAppInputSchema
  // ===========================================================================

  describe('UpdateAppInputSchema', () => {
    it('should accept partial updates with name only', () => {
      const result = UpdateAppInputSchema.parse({ name: 'Updated Name' });

      expect(result.name).toBe('Updated Name');
      expect(result.slug).toBeUndefined();
      expect(result.description).toBeUndefined();
      expect(result.status).toBeUndefined();
    });

    it('should accept partial updates with slug only', () => {
      const result = UpdateAppInputSchema.parse({ slug: 'updated-slug' });

      expect(result.slug).toBe('updated-slug');
    });

    it('should accept status update', () => {
      const result = UpdateAppInputSchema.parse({ status: 'disabled' });

      expect(result.status).toBe('disabled');
    });

    it('should accept nullable description (set to null)', () => {
      const result = UpdateAppInputSchema.parse({ description: null });

      expect(result.description).toBeNull();
    });

    it('should accept description as string', () => {
      const result = UpdateAppInputSchema.parse({ description: 'New description' });

      expect(result.description).toBe('New description');
    });

    it('should accept empty object', () => {
      const result = UpdateAppInputSchema.parse({});

      expect(Object.keys(result)).toHaveLength(0);
    });

    it('should accept metadata update', () => {
      const result = UpdateAppInputSchema.parse({
        metadata: {
          branding: { appName: 'Updated Branding' },
        },
      });

      expect(result.metadata?.branding?.appName).toBe('Updated Branding');
    });

    it('should reject invalid slug in update', () => {
      expect(() => UpdateAppInputSchema.parse({ slug: 'INVALID_Slug' })).toThrow();
    });

    it('should reject invalid status in update', () => {
      expect(() => UpdateAppInputSchema.parse({ status: 'archived' })).toThrow();
    });
  });

  // ===========================================================================
  // SetIntegrationConfigInputSchema
  // ===========================================================================

  describe('SetIntegrationConfigInputSchema', () => {
    it('should accept valid input with all fields', () => {
      const input = {
        clientId: 'client-id-12345',
        clientSecret: 'super-secret-value',
        scopes: ['read', 'write', 'admin'],
        metadata: { provider: 'google' },
      };

      const result = SetIntegrationConfigInputSchema.parse(input);

      expect(result.clientId).toBe('client-id-12345');
      expect(result.clientSecret).toBe('super-secret-value');
      expect(result.scopes).toEqual(['read', 'write', 'admin']);
      expect(result.metadata).toEqual({ provider: 'google' });
    });

    it('should default scopes to empty array', () => {
      const result = SetIntegrationConfigInputSchema.parse({
        clientId: 'client-id',
        clientSecret: 'secret',
      });

      expect(result.scopes).toEqual([]);
    });

    it('should default metadata to empty object', () => {
      const result = SetIntegrationConfigInputSchema.parse({
        clientId: 'client-id',
        clientSecret: 'secret',
      });

      expect(result.metadata).toEqual({});
    });

    it('should reject empty clientId', () => {
      expect(() =>
        SetIntegrationConfigInputSchema.parse({
          clientId: '',
          clientSecret: 'secret',
        })
      ).toThrow();
    });

    it('should reject empty clientSecret', () => {
      expect(() =>
        SetIntegrationConfigInputSchema.parse({
          clientId: 'client-id',
          clientSecret: '',
        })
      ).toThrow();
    });

    it('should reject missing required fields', () => {
      expect(() => SetIntegrationConfigInputSchema.parse({})).toThrow();
      expect(() => SetIntegrationConfigInputSchema.parse({ clientId: 'id' })).toThrow();
      expect(() => SetIntegrationConfigInputSchema.parse({ clientSecret: 'secret' })).toThrow();
    });

    it('should enforce clientId max length of 500', () => {
      expect(() =>
        SetIntegrationConfigInputSchema.parse({
          clientId: 'a'.repeat(501),
          clientSecret: 'secret',
        })
      ).toThrow();
    });

    it('should enforce clientSecret max length of 2000', () => {
      expect(() =>
        SetIntegrationConfigInputSchema.parse({
          clientId: 'client-id',
          clientSecret: 'a'.repeat(2001),
        })
      ).toThrow();
    });

    it('should reject empty strings in scopes array', () => {
      expect(() =>
        SetIntegrationConfigInputSchema.parse({
          clientId: 'client-id',
          clientSecret: 'secret',
          scopes: ['read', ''],
        })
      ).toThrow();
    });

    it('should accept metadata with arbitrary keys', () => {
      const result = SetIntegrationConfigInputSchema.parse({
        clientId: 'client-id',
        clientSecret: 'secret',
        metadata: { customKey: 'value', nested: { deep: true } },
      });

      expect(result.metadata).toEqual({ customKey: 'value', nested: { deep: true } });
    });
  });

  // ===========================================================================
  // ListAppsQuerySchema
  // ===========================================================================

  describe('ListAppsQuerySchema', () => {
    it('should apply default limit of 20', () => {
      const result = ListAppsQuerySchema.parse({});

      expect(result.limit).toBe(20);
    });

    it('should coerce limit from string to number', () => {
      const result = ListAppsQuerySchema.parse({ limit: '50' });

      expect(result.limit).toBe(50);
    });

    it('should accept status filter', () => {
      const result = ListAppsQuerySchema.parse({ status: 'active' });

      expect(result.status).toBe('active');
    });

    it('should accept search filter', () => {
      const result = ListAppsQuerySchema.parse({ search: 'my-app' });

      expect(result.search).toBe('my-app');
    });

    it('should accept cursor for pagination', () => {
      const result = ListAppsQuerySchema.parse({ cursor: 'abc123' });

      expect(result.cursor).toBe('abc123');
    });

    it('should accept all query parameters', () => {
      const input = {
        cursor: '123e4567-e89b-12d3-a456-426614174000',
        limit: '10',
        status: 'disabled',
        search: 'test',
      };

      const result = ListAppsQuerySchema.parse(input);

      expect(result.cursor).toBe('123e4567-e89b-12d3-a456-426614174000');
      expect(result.limit).toBe(10);
      expect(result.status).toBe('disabled');
      expect(result.search).toBe('test');
    });

    it('should enforce limit minimum of 1', () => {
      expect(() => ListAppsQuerySchema.parse({ limit: '0' })).toThrow();
    });

    it('should enforce limit maximum of 100', () => {
      expect(() => ListAppsQuerySchema.parse({ limit: '101' })).toThrow();
    });

    it('should reject invalid status', () => {
      expect(() => ListAppsQuerySchema.parse({ status: 'archived' })).toThrow();
    });
  });

  // ===========================================================================
  // AppResponseSchema
  // ===========================================================================

  describe('AppResponseSchema', () => {
    it('should validate a full response object', () => {
      const response = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        tenantId: '223e4567-e89b-12d3-a456-426614174000',
        name: 'My Application',
        slug: 'my-application',
        description: 'A test application',
        status: 'active',
        metadata: { branding: { appName: 'Branded' } },
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-15T12:00:00.000Z',
      };

      const result = AppResponseSchema.parse(response);

      expect(result.id).toBe('123e4567-e89b-12d3-a456-426614174000');
      expect(result.tenantId).toBe('223e4567-e89b-12d3-a456-426614174000');
      expect(result.name).toBe('My Application');
      expect(result.slug).toBe('my-application');
      expect(result.description).toBe('A test application');
      expect(result.status).toBe('active');
      expect(result.metadata).toEqual({ branding: { appName: 'Branded' } });
      expect(result.createdAt).toBe('2024-01-01T00:00:00.000Z');
      expect(result.updatedAt).toBe('2024-01-15T12:00:00.000Z');
    });

    it('should accept null description', () => {
      const response = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        tenantId: '223e4567-e89b-12d3-a456-426614174000',
        name: 'My App',
        slug: 'my-app',
        description: null,
        status: 'active',
        metadata: {},
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-15T12:00:00.000Z',
      };

      const result = AppResponseSchema.parse(response);

      expect(result.description).toBeNull();
    });

    it('should reject invalid UUID for id', () => {
      expect(() =>
        AppResponseSchema.parse({
          id: 'not-a-uuid',
          tenantId: '223e4567-e89b-12d3-a456-426614174000',
          name: 'App',
          slug: 'app',
          description: null,
          status: 'active',
          metadata: {},
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-15T12:00:00.000Z',
        })
      ).toThrow();
    });

    it('should reject invalid status in response', () => {
      expect(() =>
        AppResponseSchema.parse({
          id: '123e4567-e89b-12d3-a456-426614174000',
          tenantId: '223e4567-e89b-12d3-a456-426614174000',
          name: 'App',
          slug: 'app',
          description: null,
          status: 'unknown',
          metadata: {},
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-15T12:00:00.000Z',
        })
      ).toThrow();
    });

    it('should reject missing required fields', () => {
      expect(() =>
        AppResponseSchema.parse({ id: '123e4567-e89b-12d3-a456-426614174000' })
      ).toThrow();
    });
  });

  // ===========================================================================
  // AppWithKeyResponseSchema
  // ===========================================================================

  describe('AppWithKeyResponseSchema', () => {
    const baseResponse = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      tenantId: '223e4567-e89b-12d3-a456-426614174000',
      name: 'My Application',
      slug: 'my-application',
      description: null,
      status: 'active',
      metadata: {},
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-15T12:00:00.000Z',
    };

    it('should accept a response with apiKey', () => {
      const result = AppWithKeyResponseSchema.parse({
        ...baseResponse,
        apiKey: 'wg_app_abc123xyz',
      });

      expect(result.apiKey).toBe('wg_app_abc123xyz');
      expect(result.id).toBe('123e4567-e89b-12d3-a456-426614174000');
      expect(result.name).toBe('My Application');
    });

    it('should reject missing apiKey', () => {
      expect(() => AppWithKeyResponseSchema.parse(baseResponse)).toThrow();
    });

    it('should inherit all AppResponseSchema validations', () => {
      expect(() =>
        AppWithKeyResponseSchema.parse({
          id: 'not-a-uuid',
          tenantId: '223e4567-e89b-12d3-a456-426614174000',
          name: 'App',
          slug: 'app',
          description: null,
          status: 'active',
          metadata: {},
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-15T12:00:00.000Z',
          apiKey: 'wg_app_key',
        })
      ).toThrow();
    });
  });

  // ===========================================================================
  // IntegrationConfigResponseSchema
  // ===========================================================================

  describe('IntegrationConfigResponseSchema', () => {
    it('should validate a full response object', () => {
      const response = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        appId: '223e4567-e89b-12d3-a456-426614174000',
        integrationId: '323e4567-e89b-12d3-a456-426614174000',
        hasClientId: true,
        hasClientSecret: true,
        scopes: ['read', 'write'],
        metadata: { provider: 'slack' },
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-15T12:00:00.000Z',
      };

      const result = IntegrationConfigResponseSchema.parse(response);

      expect(result.id).toBe('123e4567-e89b-12d3-a456-426614174000');
      expect(result.appId).toBe('223e4567-e89b-12d3-a456-426614174000');
      expect(result.integrationId).toBe('323e4567-e89b-12d3-a456-426614174000');
      expect(result.hasClientId).toBe(true);
      expect(result.hasClientSecret).toBe(true);
      expect(result.scopes).toEqual(['read', 'write']);
      expect(result.metadata).toEqual({ provider: 'slack' });
    });

    it('should accept false for hasClientId and hasClientSecret', () => {
      const response = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        appId: '223e4567-e89b-12d3-a456-426614174000',
        integrationId: '323e4567-e89b-12d3-a456-426614174000',
        hasClientId: false,
        hasClientSecret: false,
        scopes: [],
        metadata: {},
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-15T12:00:00.000Z',
      };

      const result = IntegrationConfigResponseSchema.parse(response);

      expect(result.hasClientId).toBe(false);
      expect(result.hasClientSecret).toBe(false);
    });

    it('should reject invalid UUID for appId', () => {
      expect(() =>
        IntegrationConfigResponseSchema.parse({
          id: '123e4567-e89b-12d3-a456-426614174000',
          appId: 'not-a-uuid',
          integrationId: '323e4567-e89b-12d3-a456-426614174000',
          hasClientId: true,
          hasClientSecret: true,
          scopes: [],
          metadata: {},
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-15T12:00:00.000Z',
        })
      ).toThrow();
    });

    it('should reject non-boolean hasClientId', () => {
      expect(() =>
        IntegrationConfigResponseSchema.parse({
          id: '123e4567-e89b-12d3-a456-426614174000',
          appId: '223e4567-e89b-12d3-a456-426614174000',
          integrationId: '323e4567-e89b-12d3-a456-426614174000',
          hasClientId: 'yes',
          hasClientSecret: true,
          scopes: [],
          metadata: {},
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-15T12:00:00.000Z',
        })
      ).toThrow();
    });
  });

  // ===========================================================================
  // toAppResponse()
  // ===========================================================================

  describe('toAppResponse', () => {
    it('should convert a database object to API response format', () => {
      const dbApp = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        tenantId: '223e4567-e89b-12d3-a456-426614174000',
        name: 'My Application',
        slug: 'my-application',
        description: 'A test application',
        status: 'active',
        metadata: { branding: { appName: 'Branded' } },
        createdAt: new Date('2024-01-01T00:00:00Z'),
        updatedAt: new Date('2024-01-15T12:00:00Z'),
      };

      const result = toAppResponse(dbApp);

      expect(result.id).toBe('123e4567-e89b-12d3-a456-426614174000');
      expect(result.tenantId).toBe('223e4567-e89b-12d3-a456-426614174000');
      expect(result.name).toBe('My Application');
      expect(result.slug).toBe('my-application');
      expect(result.description).toBe('A test application');
      expect(result.status).toBe('active');
      expect(result.metadata).toEqual({ branding: { appName: 'Branded' } });
      expect(result.createdAt).toBe('2024-01-01T00:00:00.000Z');
      expect(result.updatedAt).toBe('2024-01-15T12:00:00.000Z');
    });

    it('should convert Date objects to ISO strings', () => {
      const dbApp = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        tenantId: '223e4567-e89b-12d3-a456-426614174000',
        name: 'App',
        slug: 'app',
        description: null,
        status: 'disabled',
        metadata: {},
        createdAt: new Date('2025-06-15T08:30:45.123Z'),
        updatedAt: new Date('2025-06-15T09:00:00.456Z'),
      };

      const result = toAppResponse(dbApp);

      expect(result.createdAt).toBe('2025-06-15T08:30:45.123Z');
      expect(result.updatedAt).toBe('2025-06-15T09:00:00.456Z');
    });

    it('should handle null description', () => {
      const dbApp = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        tenantId: '223e4567-e89b-12d3-a456-426614174000',
        name: 'App',
        slug: 'app',
        description: null,
        status: 'active',
        metadata: {},
        createdAt: new Date('2024-01-01T00:00:00Z'),
        updatedAt: new Date('2024-01-01T00:00:00Z'),
      };

      const result = toAppResponse(dbApp);

      expect(result.description).toBeNull();
    });

    it('should handle null metadata by defaulting to empty object', () => {
      const dbApp = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        tenantId: '223e4567-e89b-12d3-a456-426614174000',
        name: 'App',
        slug: 'app',
        description: null,
        status: 'active',
        metadata: null as unknown,
        createdAt: new Date('2024-01-01T00:00:00Z'),
        updatedAt: new Date('2024-01-01T00:00:00Z'),
      };

      const result = toAppResponse(dbApp);

      expect(result.metadata).toEqual({});
    });

    it('should produce output that validates against AppResponseSchema', () => {
      const dbApp = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        tenantId: '223e4567-e89b-12d3-a456-426614174000',
        name: 'Validated App',
        slug: 'validated-app',
        description: 'For schema validation',
        status: 'active',
        metadata: { key: 'value' },
        createdAt: new Date('2024-01-01T00:00:00Z'),
        updatedAt: new Date('2024-01-15T00:00:00Z'),
      };

      const result = toAppResponse(dbApp);

      expect(() => AppResponseSchema.parse(result)).not.toThrow();
    });
  });

  // ===========================================================================
  // toIntegrationConfigResponse()
  // ===========================================================================

  describe('toIntegrationConfigResponse', () => {
    it('should map encrypted fields to boolean flags when present', () => {
      const dbConfig = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        appId: '223e4567-e89b-12d3-a456-426614174000',
        integrationId: '323e4567-e89b-12d3-a456-426614174000',
        encryptedClientId: Buffer.from('encrypted-client-id'),
        encryptedClientSecret: Buffer.from('encrypted-client-secret'),
        scopes: ['read', 'write'],
        metadata: { provider: 'google' },
        createdAt: new Date('2024-01-01T00:00:00Z'),
        updatedAt: new Date('2024-01-15T12:00:00Z'),
      };

      const result = toIntegrationConfigResponse(dbConfig);

      expect(result.hasClientId).toBe(true);
      expect(result.hasClientSecret).toBe(true);
    });

    it('should map encrypted fields to boolean flags when null', () => {
      const dbConfig = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        appId: '223e4567-e89b-12d3-a456-426614174000',
        integrationId: '323e4567-e89b-12d3-a456-426614174000',
        encryptedClientId: null,
        encryptedClientSecret: null,
        scopes: [],
        metadata: {},
        createdAt: new Date('2024-01-01T00:00:00Z'),
        updatedAt: new Date('2024-01-15T12:00:00Z'),
      };

      const result = toIntegrationConfigResponse(dbConfig);

      expect(result.hasClientId).toBe(false);
      expect(result.hasClientSecret).toBe(false);
    });

    it('should convert dates to ISO strings', () => {
      const dbConfig = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        appId: '223e4567-e89b-12d3-a456-426614174000',
        integrationId: '323e4567-e89b-12d3-a456-426614174000',
        encryptedClientId: Buffer.from('data'),
        encryptedClientSecret: Buffer.from('data'),
        scopes: ['admin'],
        metadata: {},
        createdAt: new Date('2024-06-01T10:30:00Z'),
        updatedAt: new Date('2024-06-15T14:45:00Z'),
      };

      const result = toIntegrationConfigResponse(dbConfig);

      expect(result.createdAt).toBe('2024-06-01T10:30:00.000Z');
      expect(result.updatedAt).toBe('2024-06-15T14:45:00.000Z');
    });

    it('should pass through scopes and metadata', () => {
      const dbConfig = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        appId: '223e4567-e89b-12d3-a456-426614174000',
        integrationId: '323e4567-e89b-12d3-a456-426614174000',
        encryptedClientId: Buffer.from('data'),
        encryptedClientSecret: Buffer.from('data'),
        scopes: ['channels:read', 'chat:write'],
        metadata: { environment: 'production', version: 2 },
        createdAt: new Date('2024-01-01T00:00:00Z'),
        updatedAt: new Date('2024-01-01T00:00:00Z'),
      };

      const result = toIntegrationConfigResponse(dbConfig);

      expect(result.scopes).toEqual(['channels:read', 'chat:write']);
      expect(result.metadata).toEqual({ environment: 'production', version: 2 });
    });

    it('should handle null metadata by defaulting to empty object', () => {
      const dbConfig = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        appId: '223e4567-e89b-12d3-a456-426614174000',
        integrationId: '323e4567-e89b-12d3-a456-426614174000',
        encryptedClientId: null,
        encryptedClientSecret: null,
        scopes: [],
        metadata: null as unknown,
        createdAt: new Date('2024-01-01T00:00:00Z'),
        updatedAt: new Date('2024-01-01T00:00:00Z'),
      };

      const result = toIntegrationConfigResponse(dbConfig);

      expect(result.metadata).toEqual({});
    });

    it('should handle Uint8Array for encrypted fields', () => {
      const dbConfig = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        appId: '223e4567-e89b-12d3-a456-426614174000',
        integrationId: '323e4567-e89b-12d3-a456-426614174000',
        encryptedClientId: new Uint8Array([1, 2, 3]),
        encryptedClientSecret: new Uint8Array([4, 5, 6]),
        scopes: [],
        metadata: {},
        createdAt: new Date('2024-01-01T00:00:00Z'),
        updatedAt: new Date('2024-01-01T00:00:00Z'),
      };

      const result = toIntegrationConfigResponse(dbConfig);

      expect(result.hasClientId).toBe(true);
      expect(result.hasClientSecret).toBe(true);
    });

    it('should produce output that validates against IntegrationConfigResponseSchema', () => {
      const dbConfig = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        appId: '223e4567-e89b-12d3-a456-426614174000',
        integrationId: '323e4567-e89b-12d3-a456-426614174000',
        encryptedClientId: Buffer.from('data'),
        encryptedClientSecret: null,
        scopes: ['read'],
        metadata: { key: 'value' },
        createdAt: new Date('2024-01-01T00:00:00Z'),
        updatedAt: new Date('2024-01-15T00:00:00Z'),
      };

      const result = toIntegrationConfigResponse(dbConfig);

      expect(() => IntegrationConfigResponseSchema.parse(result)).not.toThrow();
    });
  });
});
