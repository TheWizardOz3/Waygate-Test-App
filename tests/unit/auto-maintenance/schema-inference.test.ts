/**
 * Schema Inference Engine Unit Tests
 *
 * Tests for the core logic that infers schema updates from drift reports
 * and validation failure data. Covers both input and output schemas,
 * all change types, field navigation, type inference, and description generation.
 */

import { describe, it, expect, vi } from 'vitest';

// Mock Prisma to prevent initialization errors
vi.mock('@/lib/db/client', () => ({
  default: {},
}));

import {
  applyFieldChange,
  inferFieldType,
  generateChangeDescription,
  generateOverallReasoning,
} from '@/lib/modules/auto-maintenance/schema-inference';
import type {
  ProposalChange,
  ChangeType,
} from '@/lib/modules/auto-maintenance/auto-maintenance.schemas';
import type { ValidationFailure } from '@prisma/client';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Test schemas need dynamic property access
type AnySchema = any;

// =============================================================================
// applyFieldChange Tests
// =============================================================================

describe('applyFieldChange', () => {
  describe('make_nullable', () => {
    it('should make a string field nullable', () => {
      const schema = {
        type: 'object',
        properties: {
          email: { type: 'string' },
        },
      };
      applyFieldChange(schema, 'email', 'make_nullable');
      expect(schema.properties!.email.type).toEqual(['string', 'null']);
    });

    it('should not duplicate null if already nullable', () => {
      const schema = {
        type: 'object',
        properties: {
          email: { type: ['string', 'null'] as string[] },
        },
      };
      applyFieldChange(schema, 'email', 'make_nullable');
      expect(schema.properties!.email.type).toEqual(['string', 'null']);
    });

    it('should handle nested field path', () => {
      const schema = {
        type: 'object',
        properties: {
          user: {
            type: 'object',
            properties: {
              profile: {
                type: 'object',
                properties: {
                  email: { type: 'string' },
                },
              },
            },
          },
        },
      };
      applyFieldChange(schema, 'user.profile.email', 'make_nullable');
      expect(schema.properties!.user.properties!.profile.properties!.email.type).toEqual([
        'string',
        'null',
      ]);
    });

    it('should not throw if field does not exist (no-op)', () => {
      const schema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
        },
      };
      // Should not throw even if 'email' doesn't exist
      expect(() => applyFieldChange(schema, 'email', 'make_nullable')).not.toThrow();
    });
  });

  describe('change_type', () => {
    it('should change field type', () => {
      const schema = {
        type: 'object',
        properties: {
          count: { type: 'string' },
        },
      };
      applyFieldChange(schema, 'count', 'change_type', 'number');
      expect(schema.properties!.count.type).toBe('number');
    });

    it('should not change type if value is not provided', () => {
      const schema = {
        type: 'object',
        properties: {
          count: { type: 'string' },
        },
      };
      applyFieldChange(schema, 'count', 'change_type');
      // Should remain unchanged without a value
      expect(schema.properties!.count.type).toBe('string');
    });
  });

  describe('add_optional', () => {
    it('should add a new optional field', () => {
      const schema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
        } as AnySchema,
        required: ['name'],
      };
      applyFieldChange(schema, 'avatar_url', 'add_optional', 'string');
      expect(schema.properties.avatar_url).toEqual({ type: 'string' });
      expect(schema.required).not.toContain('avatar_url');
    });

    it('should not overwrite existing field', () => {
      const schema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
        },
      };
      applyFieldChange(schema, 'name', 'add_optional', 'number');
      // Should not overwrite existing field
      expect(schema.properties!.name.type).toBe('string');
    });

    it('should remove field from required if already there', () => {
      const schema = {
        type: 'object',
        properties: {},
        required: ['avatar_url'],
      };
      applyFieldChange(schema, 'avatar_url', 'add_optional', 'string');
      expect(schema.required).not.toContain('avatar_url');
    });

    it('should default type to string if not specified', () => {
      const schema: AnySchema = { type: 'object', properties: {} };
      applyFieldChange(schema, 'newField', 'add_optional');
      expect(schema.properties.newField).toEqual({ type: 'string' });
    });
  });

  describe('make_optional', () => {
    it('should remove field from required array', () => {
      const schema = {
        type: 'object',
        properties: {
          email: { type: 'string' },
          name: { type: 'string' },
        },
        required: ['email', 'name'],
      };
      applyFieldChange(schema, 'email', 'make_optional');
      expect(schema.required).toEqual(['name']);
    });

    it('should delete required array when empty', () => {
      const schema = {
        type: 'object',
        properties: {
          email: { type: 'string' },
        },
        required: ['email'] as string[],
      };
      applyFieldChange(schema, 'email', 'make_optional');
      expect(schema.required).toBeUndefined();
    });

    it('should handle field not in required array', () => {
      const schema = {
        type: 'object',
        properties: {
          email: { type: 'string' },
        },
        required: ['name'],
      };
      applyFieldChange(schema, 'email', 'make_optional');
      expect(schema.required).toEqual(['name']);
    });
  });

  describe('add_enum_value', () => {
    it('should add new enum value', () => {
      const schema = {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['active', 'inactive'] },
        },
      };
      applyFieldChange(schema, 'status', 'add_enum_value', 'suspended');
      expect(schema.properties!.status.enum).toEqual(['active', 'inactive', 'suspended']);
    });

    it('should not add duplicate enum value', () => {
      const schema = {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['active', 'inactive'] },
        },
      };
      applyFieldChange(schema, 'status', 'add_enum_value', 'active');
      expect(schema.properties!.status.enum).toEqual(['active', 'inactive']);
    });

    it('should do nothing if field has no enum', () => {
      const schema = {
        type: 'object',
        properties: {
          status: { type: 'string' } as AnySchema,
        },
      };
      applyFieldChange(schema, 'status', 'add_enum_value', 'new_value');
      expect(schema.properties.status.enum).toBeUndefined();
    });
  });

  describe('add_required', () => {
    it('should add new required field', () => {
      const schema = {
        type: 'object',
        properties: {} as AnySchema,
        required: [] as string[],
      };
      applyFieldChange(schema, 'api_key', 'add_required', 'string');
      expect(schema.properties.api_key).toEqual({ type: 'string' });
      expect(schema.required).toContain('api_key');
    });

    it('should create required array if not present', () => {
      const schema = {
        type: 'object',
        properties: {},
      };
      applyFieldChange(schema, 'api_key', 'add_required', 'string');
      expect((schema as { required?: string[] }).required).toContain('api_key');
    });

    it('should not duplicate in required array', () => {
      const schema = {
        type: 'object',
        properties: {
          api_key: { type: 'string' },
        },
        required: ['api_key'],
      };
      applyFieldChange(schema, 'api_key', 'add_required', 'string');
      expect(schema.required.filter((r) => r === 'api_key')).toHaveLength(1);
    });
  });

  describe('nested path navigation', () => {
    it('should create intermediate objects for missing path segments', () => {
      const schema = {
        type: 'object',
        properties: {} as AnySchema,
      };
      applyFieldChange(schema, 'data.user.email', 'add_optional', 'string');
      const data = schema.properties.data;
      expect(data.properties.user.properties.email).toEqual({
        type: 'string',
      });
    });

    it('should navigate through array items', () => {
      const schema = {
        type: 'object',
        properties: {
          users: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                email: { type: 'string' },
              },
            },
          },
        },
      };
      applyFieldChange(schema, 'users.email', 'make_nullable');
      expect(schema.properties!.users.items!.properties!.email.type).toEqual(['string', 'null']);
    });
  });
});

// =============================================================================
// inferFieldType Tests
// =============================================================================

describe('inferFieldType', () => {
  it('should map standard types correctly', () => {
    expect(inferFieldType('string')).toBe('string');
    expect(inferFieldType('number')).toBe('number');
    expect(inferFieldType('integer')).toBe('integer');
    expect(inferFieldType('boolean')).toBe('boolean');
    expect(inferFieldType('object')).toBe('object');
    expect(inferFieldType('array')).toBe('array');
    expect(inferFieldType('null')).toBe('null');
  });

  it('should map aliases correctly', () => {
    expect(inferFieldType('float')).toBe('number');
    expect(inferFieldType('int')).toBe('integer');
    expect(inferFieldType('bool')).toBe('boolean');
  });

  it('should be case-insensitive', () => {
    expect(inferFieldType('String')).toBe('string');
    expect(inferFieldType('NUMBER')).toBe('number');
    expect(inferFieldType('Boolean')).toBe('boolean');
  });

  it('should default to string for null or undefined', () => {
    expect(inferFieldType(null)).toBe('string');
    expect(inferFieldType(undefined)).toBe('string');
  });

  it('should default to string for unknown types', () => {
    expect(inferFieldType('date')).toBe('string');
    expect(inferFieldType('timestamp')).toBe('string');
    expect(inferFieldType('unknown_type')).toBe('string');
  });

  it('should trim whitespace', () => {
    expect(inferFieldType('  string  ')).toBe('string');
    expect(inferFieldType(' number ')).toBe('number');
  });
});

// =============================================================================
// generateChangeDescription Tests
// =============================================================================

describe('generateChangeDescription', () => {
  const mockFailure = {
    failureCount: 47,
    expectedType: 'string',
    receivedType: 'null',
    fieldPath: 'user.email',
  } as ValidationFailure;

  it('should describe field_made_nullable', () => {
    const desc = generateChangeDescription(
      'field_made_nullable',
      'user.email',
      'output',
      mockFailure
    );
    expect(desc).toContain('Output');
    expect(desc).toContain('user.email');
    expect(desc).toContain('null');
    expect(desc).toContain('47');
    expect(desc).toContain('nullable');
  });

  it('should describe field_type_changed', () => {
    const failure = { ...mockFailure, receivedType: 'number' } as ValidationFailure;
    const desc = generateChangeDescription('field_type_changed', 'count', 'output', failure);
    expect(desc).toContain('Output');
    expect(desc).toContain('count');
    expect(desc).toContain('string');
    expect(desc).toContain('number');
  });

  it('should describe field_added', () => {
    const failure = { ...mockFailure, receivedType: 'string' } as ValidationFailure;
    const desc = generateChangeDescription('field_added', 'avatar_url', 'output', failure);
    expect(desc).toContain('Output');
    expect(desc).toContain('avatar_url');
    expect(desc).toContain('unexpectedly');
    expect(desc).toContain('optional');
  });

  it('should describe field_made_optional', () => {
    const desc = generateChangeDescription('field_made_optional', 'email', 'output', mockFailure);
    expect(desc).toContain('Output');
    expect(desc).toContain('email');
    expect(desc).toContain('missing');
    expect(desc).toContain('optional');
  });

  it('should describe enum_value_added', () => {
    const failure = { ...mockFailure, receivedType: 'suspended' } as ValidationFailure;
    const desc = generateChangeDescription('enum_value_added', 'status', 'output', failure);
    expect(desc).toContain('Output');
    expect(desc).toContain('status');
    expect(desc).toContain('suspended');
  });

  it('should describe field_added_required for input', () => {
    const failure = { ...mockFailure, expectedType: 'string' } as ValidationFailure;
    const desc = generateChangeDescription('field_added_required', 'api_key', 'input', failure);
    expect(desc).toContain('Input');
    expect(desc).toContain('api_key');
    expect(desc).toContain('required');
  });

  it('should use Input label for input direction', () => {
    const desc = generateChangeDescription('field_made_nullable', 'name', 'input', mockFailure);
    expect(desc).toContain('Input');
  });

  it('should handle unknown change type gracefully', () => {
    const desc = generateChangeDescription(
      'unknown_type' as ChangeType,
      'field',
      'output',
      mockFailure
    );
    expect(desc).toContain('Output');
    expect(desc).toContain('field');
  });
});

// =============================================================================
// generateOverallReasoning Tests
// =============================================================================

describe('generateOverallReasoning', () => {
  const UUID_1 = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
  const UUID_2 = 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e';

  it('should return empty string for no changes', () => {
    expect(generateOverallReasoning([], [])).toBe('');
  });

  it('should include drift report count', () => {
    const changes: ProposalChange[] = [
      {
        direction: 'output',
        fieldPath: 'email',
        changeType: 'field_made_nullable',
        description: 'test',
        driftReportId: UUID_1,
      },
    ];
    const reasoning = generateOverallReasoning(changes, [UUID_1]);
    expect(reasoning).toContain('1 drift report(s)');
    expect(reasoning).toContain('1 schema change(s)');
  });

  it('should separate output and input summaries', () => {
    const changes: ProposalChange[] = [
      {
        direction: 'output',
        fieldPath: 'email',
        changeType: 'field_made_nullable',
        description: 'test',
        driftReportId: UUID_1,
      },
      {
        direction: 'input',
        fieldPath: 'api_key',
        changeType: 'field_added_required',
        description: 'test',
        driftReportId: UUID_2,
      },
    ];
    const reasoning = generateOverallReasoning(changes, [UUID_1, UUID_2]);
    expect(reasoning).toContain('Output schema:');
    expect(reasoning).toContain('Input schema:');
    expect(reasoning).toContain('2 drift report(s)');
    expect(reasoning).toContain('2 schema change(s)');
  });

  it('should group change types in summary', () => {
    const changes: ProposalChange[] = [
      {
        direction: 'output',
        fieldPath: 'a',
        changeType: 'field_made_nullable',
        description: 'test',
        driftReportId: UUID_1,
      },
      {
        direction: 'output',
        fieldPath: 'b',
        changeType: 'field_made_nullable',
        description: 'test',
        driftReportId: UUID_2,
      },
      {
        direction: 'output',
        fieldPath: 'c',
        changeType: 'field_added',
        description: 'test',
        driftReportId: UUID_1,
      },
    ];
    const reasoning = generateOverallReasoning(changes, [UUID_1, UUID_2]);
    expect(reasoning).toContain('2 field made nullables');
    expect(reasoning).toContain('1 field added');
  });

  it('should only include Output section if no input changes', () => {
    const changes: ProposalChange[] = [
      {
        direction: 'output',
        fieldPath: 'email',
        changeType: 'field_made_nullable',
        description: 'test',
        driftReportId: UUID_1,
      },
    ];
    const reasoning = generateOverallReasoning(changes, [UUID_1]);
    expect(reasoning).toContain('Output schema:');
    expect(reasoning).not.toContain('Input schema:');
  });
});
