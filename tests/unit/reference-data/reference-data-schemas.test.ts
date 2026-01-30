/**
 * Reference Data Schemas Unit Tests
 *
 * Tests for Zod schema validation in the reference data module.
 */

import { describe, it, expect } from 'vitest';
import {
  ActionReferenceDataConfigSchema,
  CreateReferenceDataInputSchema,
  UpdateReferenceDataInputSchema,
  CreateSyncJobInputSchema,
  UpdateSyncJobInputSchema,
  ListReferenceDataQuerySchema,
  TriggerSyncInputSchema,
  ReferenceDataStatusSchema,
  SyncJobStatusSchema,
  toReferenceDataResponse,
  toSyncJobResponse,
} from '@/lib/modules/reference-data/reference-data.schemas';

describe('Reference Data Schemas', () => {
  describe('ReferenceDataStatusSchema', () => {
    it('should accept valid statuses', () => {
      expect(ReferenceDataStatusSchema.parse('active')).toBe('active');
      expect(ReferenceDataStatusSchema.parse('inactive')).toBe('inactive');
      expect(ReferenceDataStatusSchema.parse('deleted')).toBe('deleted');
    });

    it('should reject invalid statuses', () => {
      expect(() => ReferenceDataStatusSchema.parse('unknown')).toThrow();
      expect(() => ReferenceDataStatusSchema.parse('')).toThrow();
    });
  });

  describe('SyncJobStatusSchema', () => {
    it('should accept valid statuses', () => {
      expect(SyncJobStatusSchema.parse('pending')).toBe('pending');
      expect(SyncJobStatusSchema.parse('syncing')).toBe('syncing');
      expect(SyncJobStatusSchema.parse('completed')).toBe('completed');
      expect(SyncJobStatusSchema.parse('failed')).toBe('failed');
    });

    it('should reject invalid statuses', () => {
      expect(() => SyncJobStatusSchema.parse('running')).toThrow();
      expect(() => SyncJobStatusSchema.parse('')).toThrow();
    });
  });

  describe('ActionReferenceDataConfigSchema', () => {
    it('should accept valid config with all fields', () => {
      const config = {
        dataType: 'users',
        syncable: true,
        extractionPath: '$.members[*]',
        idField: 'id',
        nameField: 'real_name',
        metadataFields: ['email', 'is_admin'],
        defaultTtlSeconds: 7200,
      };

      const result = ActionReferenceDataConfigSchema.parse(config);

      expect(result.dataType).toBe('users');
      expect(result.syncable).toBe(true);
      expect(result.extractionPath).toBe('$.members[*]');
      expect(result.idField).toBe('id');
      expect(result.nameField).toBe('real_name');
      expect(result.metadataFields).toEqual(['email', 'is_admin']);
      expect(result.defaultTtlSeconds).toBe(7200);
    });

    it('should apply default TTL when not provided', () => {
      const config = {
        dataType: 'channels',
        syncable: true,
        extractionPath: '$.channels[*]',
        idField: 'id',
        nameField: 'name',
      };

      const result = ActionReferenceDataConfigSchema.parse(config);

      expect(result.defaultTtlSeconds).toBe(3600);
    });

    it('should reject empty dataType', () => {
      const config = {
        dataType: '',
        syncable: true,
        extractionPath: '$.members[*]',
        idField: 'id',
        nameField: 'real_name',
      };

      expect(() => ActionReferenceDataConfigSchema.parse(config)).toThrow();
    });

    it('should reject missing required fields', () => {
      expect(() =>
        ActionReferenceDataConfigSchema.parse({
          dataType: 'users',
          syncable: true,
        })
      ).toThrow();
    });

    it('should reject invalid TTL', () => {
      const config = {
        dataType: 'users',
        syncable: true,
        extractionPath: '$.members[*]',
        idField: 'id',
        nameField: 'real_name',
        defaultTtlSeconds: -1,
      };

      expect(() => ActionReferenceDataConfigSchema.parse(config)).toThrow();
    });
  });

  describe('CreateReferenceDataInputSchema', () => {
    it('should accept valid input', () => {
      const input = {
        tenantId: '123e4567-e89b-12d3-a456-426614174000',
        integrationId: '223e4567-e89b-12d3-a456-426614174000',
        dataType: 'users',
        externalId: 'U12345',
        name: 'John Doe',
      };

      const result = CreateReferenceDataInputSchema.parse(input);

      expect(result.tenantId).toBe(input.tenantId);
      expect(result.integrationId).toBe(input.integrationId);
      expect(result.dataType).toBe('users');
      expect(result.externalId).toBe('U12345');
      expect(result.name).toBe('John Doe');
      expect(result.metadata).toEqual({});
    });

    it('should accept optional connectionId', () => {
      const input = {
        tenantId: '123e4567-e89b-12d3-a456-426614174000',
        integrationId: '223e4567-e89b-12d3-a456-426614174000',
        connectionId: '323e4567-e89b-12d3-a456-426614174000',
        dataType: 'users',
        externalId: 'U12345',
        name: 'John Doe',
      };

      const result = CreateReferenceDataInputSchema.parse(input);

      expect(result.connectionId).toBe('323e4567-e89b-12d3-a456-426614174000');
    });

    it('should reject invalid UUID', () => {
      const input = {
        tenantId: 'not-a-uuid',
        integrationId: '223e4567-e89b-12d3-a456-426614174000',
        dataType: 'users',
        externalId: 'U12345',
        name: 'John Doe',
      };

      expect(() => CreateReferenceDataInputSchema.parse(input)).toThrow();
    });

    it('should accept metadata', () => {
      const input = {
        tenantId: '123e4567-e89b-12d3-a456-426614174000',
        integrationId: '223e4567-e89b-12d3-a456-426614174000',
        dataType: 'users',
        externalId: 'U12345',
        name: 'John Doe',
        metadata: { email: 'john@example.com', isAdmin: true },
      };

      const result = CreateReferenceDataInputSchema.parse(input);

      expect(result.metadata).toEqual({ email: 'john@example.com', isAdmin: true });
    });
  });

  describe('UpdateReferenceDataInputSchema', () => {
    it('should accept partial updates', () => {
      const input = { name: 'Jane Doe' };

      const result = UpdateReferenceDataInputSchema.parse(input);

      expect(result.name).toBe('Jane Doe');
      expect(result.metadata).toBeUndefined();
    });

    it('should accept status update', () => {
      const input = { status: 'inactive' };

      const result = UpdateReferenceDataInputSchema.parse(input);

      expect(result.status).toBe('inactive');
    });

    it('should accept empty object', () => {
      const result = UpdateReferenceDataInputSchema.parse({});

      expect(Object.keys(result)).toHaveLength(0);
    });
  });

  describe('CreateSyncJobInputSchema', () => {
    it('should accept valid input', () => {
      const input = {
        tenantId: '123e4567-e89b-12d3-a456-426614174000',
        integrationId: '223e4567-e89b-12d3-a456-426614174000',
        dataType: 'users',
      };

      const result = CreateSyncJobInputSchema.parse(input);

      expect(result.tenantId).toBe(input.tenantId);
      expect(result.integrationId).toBe(input.integrationId);
      expect(result.dataType).toBe('users');
    });
  });

  describe('UpdateSyncJobInputSchema', () => {
    it('should accept job result updates', () => {
      const input = {
        status: 'completed',
        completedAt: new Date('2024-01-15T12:00:00Z'),
        itemsFound: 100,
        itemsCreated: 50,
        itemsUpdated: 40,
        itemsDeleted: 10,
        itemsFailed: 0,
      };

      const result = UpdateSyncJobInputSchema.parse(input);

      expect(result.status).toBe('completed');
      expect(result.itemsFound).toBe(100);
      expect(result.itemsCreated).toBe(50);
    });

    it('should accept error', () => {
      const input = {
        status: 'failed',
        error: { code: 'SYNC_FAILED', message: 'Connection timeout' },
      };

      const result = UpdateSyncJobInputSchema.parse(input);

      expect(result.error).toEqual({ code: 'SYNC_FAILED', message: 'Connection timeout' });
    });

    it('should reject negative counts', () => {
      const input = { itemsFound: -1 };

      expect(() => UpdateSyncJobInputSchema.parse(input)).toThrow();
    });
  });

  describe('ListReferenceDataQuerySchema', () => {
    it('should apply defaults', () => {
      const result = ListReferenceDataQuerySchema.parse({});

      expect(result.limit).toBe(100);
    });

    it('should parse limit as number from string', () => {
      const result = ListReferenceDataQuerySchema.parse({ limit: '50' });

      expect(result.limit).toBe(50);
    });

    it('should accept all filters', () => {
      const input = {
        cursor: 'abc123',
        limit: '200',
        dataType: 'users',
        status: 'active',
        search: 'john',
        connectionId: '123e4567-e89b-12d3-a456-426614174000',
      };

      const result = ListReferenceDataQuerySchema.parse(input);

      expect(result.cursor).toBe('abc123');
      expect(result.limit).toBe(200);
      expect(result.dataType).toBe('users');
      expect(result.status).toBe('active');
      expect(result.search).toBe('john');
    });

    it('should enforce limit bounds', () => {
      expect(() => ListReferenceDataQuerySchema.parse({ limit: '0' })).toThrow();
      expect(() => ListReferenceDataQuerySchema.parse({ limit: '501' })).toThrow();
    });
  });

  describe('TriggerSyncInputSchema', () => {
    it('should accept integration ID only', () => {
      const input = {
        integrationId: '123e4567-e89b-12d3-a456-426614174000',
      };

      const result = TriggerSyncInputSchema.parse(input);

      expect(result.integrationId).toBe(input.integrationId);
      expect(result.connectionId).toBeUndefined();
      expect(result.dataType).toBeUndefined();
    });

    it('should accept all optional parameters', () => {
      const input = {
        integrationId: '123e4567-e89b-12d3-a456-426614174000',
        connectionId: '223e4567-e89b-12d3-a456-426614174000',
        dataType: 'users',
      };

      const result = TriggerSyncInputSchema.parse(input);

      expect(result.connectionId).toBe('223e4567-e89b-12d3-a456-426614174000');
      expect(result.dataType).toBe('users');
    });
  });

  describe('toReferenceDataResponse', () => {
    it('should convert database object to API response format', () => {
      const dbData = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        tenantId: '223e4567-e89b-12d3-a456-426614174000',
        integrationId: '323e4567-e89b-12d3-a456-426614174000',
        connectionId: null,
        dataType: 'users',
        externalId: 'U12345',
        name: 'John Doe',
        metadata: { email: 'john@example.com' },
        status: 'active',
        lastSyncedAt: new Date('2024-01-15T12:00:00Z'),
        syncedByActionId: null,
        createdAt: new Date('2024-01-01T00:00:00Z'),
        updatedAt: new Date('2024-01-15T12:00:00Z'),
      };

      const result = toReferenceDataResponse(dbData);

      expect(result.id).toBe(dbData.id);
      expect(result.dataType).toBe('users');
      expect(result.name).toBe('John Doe');
      expect(result.metadata).toEqual({ email: 'john@example.com' });
      expect(result.lastSyncedAt).toBe('2024-01-15T12:00:00.000Z');
      expect(result.createdAt).toBe('2024-01-01T00:00:00.000Z');
    });
  });

  describe('toSyncJobResponse', () => {
    it('should convert database object to API response format', () => {
      const dbJob = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        tenantId: '223e4567-e89b-12d3-a456-426614174000',
        integrationId: '323e4567-e89b-12d3-a456-426614174000',
        connectionId: '423e4567-e89b-12d3-a456-426614174000',
        dataType: 'users',
        status: 'completed',
        startedAt: new Date('2024-01-15T11:55:00Z'),
        completedAt: new Date('2024-01-15T12:00:00Z'),
        itemsFound: 100,
        itemsCreated: 50,
        itemsUpdated: 40,
        itemsDeleted: 10,
        itemsFailed: 0,
        error: null,
        createdAt: new Date('2024-01-15T11:55:00Z'),
      };

      const result = toSyncJobResponse(dbJob);

      expect(result.id).toBe(dbJob.id);
      expect(result.status).toBe('completed');
      expect(result.itemsFound).toBe(100);
      expect(result.itemsCreated).toBe(50);
      expect(result.startedAt).toBe('2024-01-15T11:55:00.000Z');
      expect(result.completedAt).toBe('2024-01-15T12:00:00.000Z');
      expect(result.error).toBeNull();
    });

    it('should handle null dates', () => {
      const dbJob = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        tenantId: '223e4567-e89b-12d3-a456-426614174000',
        integrationId: '323e4567-e89b-12d3-a456-426614174000',
        connectionId: null,
        dataType: 'users',
        status: 'pending',
        startedAt: null,
        completedAt: null,
        itemsFound: 0,
        itemsCreated: 0,
        itemsUpdated: 0,
        itemsDeleted: 0,
        itemsFailed: 0,
        error: null,
        createdAt: new Date('2024-01-15T11:55:00Z'),
      };

      const result = toSyncJobResponse(dbJob);

      expect(result.startedAt).toBeNull();
      expect(result.completedAt).toBeNull();
    });
  });
});
