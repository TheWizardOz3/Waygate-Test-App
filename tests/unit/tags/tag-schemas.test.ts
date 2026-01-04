/**
 * Tag Schema Tests
 *
 * Tests for tag validation schemas.
 */

import { describe, it, expect } from 'vitest';
import { TagSchema, CreateActionInputSchema } from '@/lib/modules/actions/action.schemas';

describe('Tag Schema Validation', () => {
  describe('TagSchema', () => {
    it('should accept valid lowercase alphanumeric tags', () => {
      expect(TagSchema.parse('payment')).toBe('payment');
      expect(TagSchema.parse('api-key')).toBe('api-key');
      expect(TagSchema.parse('v2-test')).toBe('v2-test');
      expect(TagSchema.parse('123')).toBe('123');
    });

    it('should require lowercase input (validation before transform)', () => {
      // Note: TagSchema validates lowercase BEFORE transforming
      // Users must provide lowercase tags
      expect(() => TagSchema.parse('PAYMENT')).toThrow();
      expect(() => TagSchema.parse('Api-Key')).toThrow();
      expect(() => TagSchema.parse('TestTag')).toThrow();
    });

    it('should reject tags shorter than 2 characters', () => {
      expect(() => TagSchema.parse('a')).toThrow();
      expect(() => TagSchema.parse('')).toThrow();
    });

    it('should reject tags longer than 30 characters', () => {
      const longTag = 'a'.repeat(31);
      expect(() => TagSchema.parse(longTag)).toThrow();
    });

    it('should accept tags at boundary lengths', () => {
      expect(TagSchema.parse('ab')).toBe('ab'); // 2 chars - min
      expect(TagSchema.parse('a'.repeat(30))).toBe('a'.repeat(30)); // 30 chars - max
    });

    it('should reject tags with special characters', () => {
      expect(() => TagSchema.parse('test@tag')).toThrow();
      expect(() => TagSchema.parse('test tag')).toThrow();
      expect(() => TagSchema.parse('test_tag')).toThrow();
      expect(() => TagSchema.parse('test.tag')).toThrow();
    });

    it('should accept tags with hyphens', () => {
      expect(TagSchema.parse('my-tag')).toBe('my-tag');
      expect(TagSchema.parse('a-b-c-d')).toBe('a-b-c-d');
    });
  });

  describe('CreateActionInputSchema - tags field', () => {
    // Use a valid v4 UUID format
    const validActionData = {
      integrationId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      name: 'test-action',
      slug: 'test-action',
      httpMethod: 'GET' as const,
      endpointTemplate: '/test',
      inputSchema: { type: 'object' as const },
      outputSchema: { type: 'object' as const },
    };

    it('should default to empty array when tags not provided', () => {
      const result = CreateActionInputSchema.parse(validActionData);
      expect(result.tags).toEqual([]);
    });

    it('should accept valid tags array', () => {
      const result = CreateActionInputSchema.parse({
        ...validActionData,
        tags: ['payment', 'api'],
      });
      expect(result.tags).toEqual(['payment', 'api']);
    });

    it('should accept empty tags array', () => {
      const result = CreateActionInputSchema.parse({
        ...validActionData,
        tags: [],
      });
      expect(result.tags).toEqual([]);
    });

    it('should require lowercase tags (validation before transform)', () => {
      // Tags must be provided in lowercase
      expect(() =>
        CreateActionInputSchema.parse({
          ...validActionData,
          tags: ['PAYMENT', 'API'],
        })
      ).toThrow();
    });

    it('should reject more than 10 tags', () => {
      const tooManyTags = Array.from({ length: 11 }, (_, i) => `tag-${i}`);
      expect(() =>
        CreateActionInputSchema.parse({
          ...validActionData,
          tags: tooManyTags,
        })
      ).toThrow();
    });

    it('should accept exactly 10 tags', () => {
      const tenTags = Array.from({ length: 10 }, (_, i) => `tag-${i}`);
      const result = CreateActionInputSchema.parse({
        ...validActionData,
        tags: tenTags,
      });
      expect(result.tags).toHaveLength(10);
    });

    it('should reject invalid tag formats', () => {
      expect(() =>
        CreateActionInputSchema.parse({
          ...validActionData,
          tags: ['invalid tag'],
        })
      ).toThrow();
    });
  });
});
