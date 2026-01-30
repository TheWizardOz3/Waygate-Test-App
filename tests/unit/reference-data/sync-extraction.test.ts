/**
 * Sync Job Extraction Unit Tests
 *
 * Tests for the data extraction logic used in reference data syncing.
 * These functions parse action responses and extract reference items.
 */

import { describe, it, expect } from 'vitest';
import { extractReferenceItems } from '@/lib/modules/reference-data/extraction';
import type { ActionReferenceDataConfig } from '@/lib/modules/reference-data/types';

describe('Sync Job Extraction', () => {
  describe('extractReferenceItems', () => {
    const baseConfig: ActionReferenceDataConfig = {
      dataType: 'users',
      syncable: true,
      extractionPath: '$.members[*]',
      idField: 'id',
      nameField: 'name',
      defaultTtlSeconds: 3600,
    };

    describe('Basic Extraction', () => {
      it('should extract items from array at root level', () => {
        const data = {
          members: [
            { id: 'U1', name: 'Alice' },
            { id: 'U2', name: 'Bob' },
          ],
        };

        const result = extractReferenceItems(data, baseConfig);

        expect(result).toHaveLength(2);
        expect(result[0]).toEqual({
          externalId: 'U1',
          name: 'Alice',
          metadata: {},
        });
        expect(result[1]).toEqual({
          externalId: 'U2',
          name: 'Bob',
          metadata: {},
        });
      });

      it('should extract items from $.data[*] path', () => {
        const config: ActionReferenceDataConfig = {
          ...baseConfig,
          extractionPath: '$.data[*]',
        };

        const data = {
          data: [
            { id: 'C1', name: '#general' },
            { id: 'C2', name: '#random' },
          ],
        };

        const result = extractReferenceItems(data, config);

        expect(result).toHaveLength(2);
        expect(result[0].externalId).toBe('C1');
        expect(result[1].externalId).toBe('C2');
      });

      it('should handle root array with $ path', () => {
        const config: ActionReferenceDataConfig = {
          ...baseConfig,
          extractionPath: '$',
        };

        const data = [
          { id: 'U1', name: 'Alice' },
          { id: 'U2', name: 'Bob' },
        ];

        const result = extractReferenceItems(data, config);

        expect(result).toHaveLength(2);
        expect(result[0].externalId).toBe('U1');
        expect(result[1].externalId).toBe('U2');
      });

      it('should handle nested path like $.response.users[*]', () => {
        const config: ActionReferenceDataConfig = {
          ...baseConfig,
          extractionPath: '$.response.users[*]',
        };

        const data = {
          response: {
            users: [
              { id: 'U1', name: 'Alice' },
              { id: 'U2', name: 'Bob' },
            ],
          },
        };

        const result = extractReferenceItems(data, config);

        expect(result).toHaveLength(2);
        expect(result[0].externalId).toBe('U1');
      });
    });

    describe('Nested Field Access', () => {
      it('should access nested id field', () => {
        const config: ActionReferenceDataConfig = {
          ...baseConfig,
          idField: 'user.id',
          nameField: 'user.profile.displayName',
        };

        const data = {
          members: [
            { user: { id: 'U1', profile: { displayName: 'Alice' } } },
            { user: { id: 'U2', profile: { displayName: 'Bob' } } },
          ],
        };

        const result = extractReferenceItems(data, config);

        expect(result).toHaveLength(2);
        expect(result[0].externalId).toBe('U1');
        expect(result[0].name).toBe('Alice');
      });

      it('should use externalId as name when nameField is missing', () => {
        const data = {
          members: [
            { id: 'U1' }, // No name field
          ],
        };

        const result = extractReferenceItems(data, baseConfig);

        expect(result).toHaveLength(1);
        expect(result[0].externalId).toBe('U1');
        expect(result[0].name).toBe('U1');
      });
    });

    describe('Metadata Extraction', () => {
      it('should extract specified metadata fields', () => {
        const config: ActionReferenceDataConfig = {
          ...baseConfig,
          metadataFields: ['email', 'is_admin', 'timezone'],
        };

        const data = {
          members: [
            {
              id: 'U1',
              name: 'Alice',
              email: 'alice@example.com',
              is_admin: true,
              timezone: 'UTC',
              extraField: 'ignored',
            },
          ],
        };

        const result = extractReferenceItems(data, config);

        expect(result).toHaveLength(1);
        expect(result[0].metadata).toEqual({
          email: 'alice@example.com',
          is_admin: true,
          timezone: 'UTC',
        });
      });

      it('should omit undefined metadata fields', () => {
        const config: ActionReferenceDataConfig = {
          ...baseConfig,
          metadataFields: ['email', 'phone'],
        };

        const data = {
          members: [{ id: 'U1', name: 'Alice', email: 'alice@example.com' }],
        };

        const result = extractReferenceItems(data, config);

        expect(result[0].metadata).toEqual({
          email: 'alice@example.com',
        });
        expect(result[0].metadata).not.toHaveProperty('phone');
      });

      it('should handle nested metadata fields', () => {
        const config: ActionReferenceDataConfig = {
          ...baseConfig,
          metadataFields: ['profile.email', 'settings.notifications'],
        };

        const data = {
          members: [
            {
              id: 'U1',
              name: 'Alice',
              profile: { email: 'alice@example.com' },
              settings: { notifications: true },
            },
          ],
        };

        const result = extractReferenceItems(data, config);

        expect(result[0].metadata).toEqual({
          'profile.email': 'alice@example.com',
          'settings.notifications': true,
        });
      });
    });

    describe('Edge Cases', () => {
      it('should skip items without id field', () => {
        const data = {
          members: [
            { id: 'U1', name: 'Alice' },
            { name: 'Bob' }, // Missing id
            { id: 'U3', name: 'Charlie' },
          ],
        };

        const result = extractReferenceItems(data, baseConfig);

        expect(result).toHaveLength(2);
        expect(result.map((r) => r.externalId)).toEqual(['U1', 'U3']);
      });

      it('should skip null/undefined items', () => {
        const data = {
          members: [{ id: 'U1', name: 'Alice' }, null, undefined, { id: 'U2', name: 'Bob' }],
        };

        const result = extractReferenceItems(data, baseConfig);

        expect(result).toHaveLength(2);
      });

      it('should handle empty array', () => {
        const data = { members: [] };

        const result = extractReferenceItems(data, baseConfig);

        expect(result).toHaveLength(0);
      });

      it('should return empty array when path does not exist', () => {
        const data = { users: [] }; // Config expects 'members'

        const result = extractReferenceItems(data, baseConfig);

        expect(result).toHaveLength(0);
      });

      it('should return empty array when path resolves to non-array', () => {
        const data = { members: 'not an array' };

        const result = extractReferenceItems(data, baseConfig);

        expect(result).toHaveLength(0);
      });

      it('should convert numeric IDs to strings', () => {
        const data = {
          members: [
            { id: 12345, name: 'Alice' },
            { id: 67890, name: 'Bob' },
          ],
        };

        const result = extractReferenceItems(data, baseConfig);

        expect(result[0].externalId).toBe('12345');
        expect(result[1].externalId).toBe('67890');
      });

      it('should handle null id value', () => {
        const data = {
          members: [
            { id: null, name: 'No ID' },
            { id: 'U1', name: 'Valid' },
          ],
        };

        const result = extractReferenceItems(data, baseConfig);

        expect(result).toHaveLength(1);
        expect(result[0].externalId).toBe('U1');
      });
    });

    describe('Real-World API Response Examples', () => {
      it('should handle Slack users.list response format', () => {
        const config: ActionReferenceDataConfig = {
          dataType: 'users',
          syncable: true,
          extractionPath: '$.members[*]',
          idField: 'id',
          nameField: 'real_name',
          metadataFields: ['profile.email', 'is_admin', 'is_bot'],
          defaultTtlSeconds: 3600,
        };

        const data = {
          ok: true,
          members: [
            {
              id: 'U1234',
              name: 'alice',
              real_name: 'Alice Smith',
              is_admin: true,
              is_bot: false,
              profile: {
                email: 'alice@company.com',
                image_48: 'https://example.com/alice.png',
              },
            },
            {
              id: 'U5678',
              name: 'bob',
              real_name: 'Bob Jones',
              is_admin: false,
              is_bot: false,
              profile: {
                email: 'bob@company.com',
              },
            },
          ],
        };

        const result = extractReferenceItems(data, config);

        expect(result).toHaveLength(2);
        expect(result[0]).toEqual({
          externalId: 'U1234',
          name: 'Alice Smith',
          metadata: {
            'profile.email': 'alice@company.com',
            is_admin: true,
            is_bot: false,
          },
        });
      });

      it('should handle Slack channels.list response format', () => {
        const config: ActionReferenceDataConfig = {
          dataType: 'channels',
          syncable: true,
          extractionPath: '$.channels[*]',
          idField: 'id',
          nameField: 'name',
          metadataFields: ['is_private', 'num_members', 'topic.value'],
          defaultTtlSeconds: 3600,
        };

        const data = {
          ok: true,
          channels: [
            {
              id: 'C1234',
              name: 'general',
              is_private: false,
              num_members: 42,
              topic: { value: 'General discussion' },
            },
            {
              id: 'C5678',
              name: 'engineering',
              is_private: true,
              num_members: 15,
              topic: { value: 'Engineering team' },
            },
          ],
        };

        const result = extractReferenceItems(data, config);

        expect(result).toHaveLength(2);
        expect(result[0]).toEqual({
          externalId: 'C1234',
          name: 'general',
          metadata: {
            is_private: false,
            num_members: 42,
            'topic.value': 'General discussion',
          },
        });
      });

      it('should handle GitHub repositories response format', () => {
        const config: ActionReferenceDataConfig = {
          dataType: 'repositories',
          syncable: true,
          extractionPath: '$',
          idField: 'id',
          nameField: 'full_name',
          metadataFields: ['private', 'default_branch', 'language'],
          defaultTtlSeconds: 7200,
        };

        const data = [
          {
            id: 123456,
            name: 'waygate',
            full_name: 'company/waygate',
            private: false,
            default_branch: 'main',
            language: 'TypeScript',
          },
          {
            id: 789012,
            name: 'docs',
            full_name: 'company/docs',
            private: true,
            default_branch: 'main',
            language: 'Markdown',
          },
        ];

        const result = extractReferenceItems(data, config);

        expect(result).toHaveLength(2);
        expect(result[0]).toEqual({
          externalId: '123456',
          name: 'company/waygate',
          metadata: {
            private: false,
            default_branch: 'main',
            language: 'TypeScript',
          },
        });
      });
    });
  });
});
