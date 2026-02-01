/**
 * Composite Tool Schemas Unit Tests
 *
 * Tests for Zod schemas used in composite tool validation.
 * Covers input validation, response formatting, and error handling.
 */

import { describe, it, expect } from 'vitest';
import {
  CompositeToolRoutingModeSchema,
  CompositeToolStatusSchema,
  RoutingConditionTypeSchema,
  RoutingConditionSchema,
  CreateCompositeToolInputSchema,
  UpdateCompositeToolInputSchema,
  CreateCompositeToolOperationInputSchema,
  CreateRoutingRuleInputSchema,
  ListCompositeToolsQuerySchema,
  toCompositeToolResponse,
  toOperationResponse,
  toRoutingRuleResponse,
} from '@/lib/modules/composite-tools/composite-tool.schemas';

// Valid UUIDs for testing (v4 format)
const VALID_UUID_1 = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
const VALID_UUID_2 = 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e';
const VALID_UUID_3 = 'c3d4e5f6-a7b8-4c9d-0e1f-2a3b4c5d6e7f';
const VALID_UUID_4 = 'd4e5f6a7-b8c9-4d0e-1f2a-3b4c5d6e7f8a';

// =============================================================================
// Enum Schema Tests
// =============================================================================

describe('CompositeToolRoutingModeSchema', () => {
  it('should accept valid routing modes', () => {
    expect(CompositeToolRoutingModeSchema.parse('rule_based')).toBe('rule_based');
    expect(CompositeToolRoutingModeSchema.parse('agent_driven')).toBe('agent_driven');
  });

  it('should reject invalid routing modes', () => {
    expect(() => CompositeToolRoutingModeSchema.parse('invalid')).toThrow();
    expect(() => CompositeToolRoutingModeSchema.parse('sequential')).toThrow();
  });
});

describe('CompositeToolStatusSchema', () => {
  it('should accept valid statuses', () => {
    expect(CompositeToolStatusSchema.parse('draft')).toBe('draft');
    expect(CompositeToolStatusSchema.parse('active')).toBe('active');
    expect(CompositeToolStatusSchema.parse('disabled')).toBe('disabled');
  });

  it('should reject invalid statuses', () => {
    expect(() => CompositeToolStatusSchema.parse('archived')).toThrow();
    expect(() => CompositeToolStatusSchema.parse('pending')).toThrow();
  });
});

describe('RoutingConditionTypeSchema', () => {
  it('should accept all valid condition types', () => {
    const validTypes = ['contains', 'equals', 'matches', 'starts_with', 'ends_with'];
    for (const type of validTypes) {
      expect(RoutingConditionTypeSchema.parse(type)).toBe(type);
    }
  });

  it('should reject invalid condition types', () => {
    expect(() => RoutingConditionTypeSchema.parse('regex')).toThrow();
    expect(() => RoutingConditionTypeSchema.parse('includes')).toThrow();
  });
});

// =============================================================================
// RoutingConditionSchema Tests
// =============================================================================

describe('RoutingConditionSchema', () => {
  it('should accept valid routing condition', () => {
    const condition = {
      type: 'contains',
      field: 'url',
      value: 'linkedin.com',
      caseSensitive: false,
    };

    const result = RoutingConditionSchema.parse(condition);

    expect(result.type).toBe('contains');
    expect(result.field).toBe('url');
    expect(result.value).toBe('linkedin.com');
    expect(result.caseSensitive).toBe(false);
  });

  it('should default caseSensitive to false', () => {
    const condition = {
      type: 'equals',
      field: 'domain',
      value: 'reddit.com',
    };

    const result = RoutingConditionSchema.parse(condition);

    expect(result.caseSensitive).toBe(false);
  });

  it('should reject empty field', () => {
    const condition = {
      type: 'contains',
      field: '',
      value: 'test',
    };

    expect(() => RoutingConditionSchema.parse(condition)).toThrow();
  });

  it('should reject empty value', () => {
    const condition = {
      type: 'contains',
      field: 'url',
      value: '',
    };

    expect(() => RoutingConditionSchema.parse(condition)).toThrow();
  });

  it('should reject field longer than 100 characters', () => {
    const condition = {
      type: 'contains',
      field: 'a'.repeat(101),
      value: 'test',
    };

    expect(() => RoutingConditionSchema.parse(condition)).toThrow();
  });
});

// =============================================================================
// CreateCompositeToolInputSchema Tests
// =============================================================================

describe('CreateCompositeToolInputSchema', () => {
  it('should accept valid minimal input', () => {
    const input = {
      name: 'Smart Scraper',
      slug: 'smart-scraper',
      routingMode: 'rule_based',
    };

    const result = CreateCompositeToolInputSchema.parse(input);

    expect(result.name).toBe('Smart Scraper');
    expect(result.slug).toBe('smart-scraper');
    expect(result.routingMode).toBe('rule_based');
    expect(result.status).toBe('draft'); // default
    expect(result.unifiedInputSchema).toEqual({}); // default
    expect(result.metadata).toEqual({}); // default
  });

  it('should accept input with operations', () => {
    const input = {
      name: 'Smart Scraper',
      slug: 'smart-scraper',
      routingMode: 'rule_based',
      operations: [
        {
          actionId: VALID_UUID_1,
          operationSlug: 'linkedin-scraper',
          displayName: 'LinkedIn Scraper',
        },
      ],
    };

    const result = CreateCompositeToolInputSchema.parse(input);

    expect(result.operations).toHaveLength(1);
    expect(result.operations![0].operationSlug).toBe('linkedin-scraper');
  });

  it('should accept input with routing rules', () => {
    const input = {
      name: 'Smart Scraper',
      slug: 'smart-scraper',
      routingMode: 'rule_based',
      routingRules: [
        {
          operationId: VALID_UUID_1,
          conditionType: 'contains',
          conditionField: 'url',
          conditionValue: 'linkedin.com',
        },
      ],
    };

    const result = CreateCompositeToolInputSchema.parse(input);

    expect(result.routingRules).toHaveLength(1);
    expect(result.routingRules![0].conditionType).toBe('contains');
  });

  it('should reject invalid slug format', () => {
    const input = {
      name: 'Test Tool',
      slug: 'Invalid_Slug!',
      routingMode: 'rule_based',
    };

    expect(() => CreateCompositeToolInputSchema.parse(input)).toThrow();
  });

  it('should reject slug with uppercase', () => {
    const input = {
      name: 'Test Tool',
      slug: 'InvalidSlug',
      routingMode: 'rule_based',
    };

    expect(() => CreateCompositeToolInputSchema.parse(input)).toThrow();
  });

  it('should accept slug with hyphens', () => {
    const input = {
      name: 'Test Tool',
      slug: 'my-test-tool-123',
      routingMode: 'rule_based',
    };

    const result = CreateCompositeToolInputSchema.parse(input);
    expect(result.slug).toBe('my-test-tool-123');
  });

  it('should reject empty name', () => {
    const input = {
      name: '',
      slug: 'test',
      routingMode: 'rule_based',
    };

    expect(() => CreateCompositeToolInputSchema.parse(input)).toThrow();
  });

  it('should reject name longer than 255 characters', () => {
    const input = {
      name: 'a'.repeat(256),
      slug: 'test',
      routingMode: 'rule_based',
    };

    expect(() => CreateCompositeToolInputSchema.parse(input)).toThrow();
  });
});

// =============================================================================
// UpdateCompositeToolInputSchema Tests
// =============================================================================

describe('UpdateCompositeToolInputSchema', () => {
  it('should accept empty update (all optional)', () => {
    const result = UpdateCompositeToolInputSchema.parse({});
    expect(result).toEqual({});
  });

  it('should accept partial update', () => {
    const input = {
      name: 'Updated Name',
      status: 'active',
    };

    const result = UpdateCompositeToolInputSchema.parse(input);

    expect(result.name).toBe('Updated Name');
    expect(result.status).toBe('active');
    expect(result.slug).toBeUndefined();
  });

  it('should accept null values for nullable fields', () => {
    const input = {
      description: null,
      toolDescription: null,
      defaultOperationId: null,
    };

    const result = UpdateCompositeToolInputSchema.parse(input);

    expect(result.description).toBeNull();
    expect(result.toolDescription).toBeNull();
    expect(result.defaultOperationId).toBeNull();
  });

  it('should validate slug format on update', () => {
    const input = { slug: 'Invalid_Slug' };
    expect(() => UpdateCompositeToolInputSchema.parse(input)).toThrow();
  });

  it('should validate defaultOperationId is UUID', () => {
    const input = { defaultOperationId: 'not-a-uuid' };
    expect(() => UpdateCompositeToolInputSchema.parse(input)).toThrow();
  });

  it('should accept valid UUID for defaultOperationId', () => {
    const input = { defaultOperationId: VALID_UUID_1 };
    const result = UpdateCompositeToolInputSchema.parse(input);
    expect(result.defaultOperationId).toBe(VALID_UUID_1);
  });
});

// =============================================================================
// CreateCompositeToolOperationInputSchema Tests
// =============================================================================

describe('CreateCompositeToolOperationInputSchema', () => {
  it('should accept valid operation input', () => {
    const input = {
      actionId: VALID_UUID_1,
      operationSlug: 'linkedin-scraper',
      displayName: 'LinkedIn Scraper',
    };

    const result = CreateCompositeToolOperationInputSchema.parse(input);

    expect(result.actionId).toBe(VALID_UUID_1);
    expect(result.operationSlug).toBe('linkedin-scraper');
    expect(result.displayName).toBe('LinkedIn Scraper');
    expect(result.parameterMapping).toEqual({}); // default
    expect(result.priority).toBe(0); // default
  });

  it('should accept operation with parameter mapping', () => {
    const input = {
      actionId: VALID_UUID_1,
      operationSlug: 'linkedin-scraper',
      displayName: 'LinkedIn Scraper',
      parameterMapping: {
        url: { targetParam: 'profile_url' },
      },
    };

    const result = CreateCompositeToolOperationInputSchema.parse(input);

    expect(result.parameterMapping).toHaveProperty('url');
  });

  it('should reject invalid action ID', () => {
    const input = {
      actionId: 'not-a-uuid',
      operationSlug: 'test',
      displayName: 'Test',
    };

    expect(() => CreateCompositeToolOperationInputSchema.parse(input)).toThrow();
  });

  it('should reject invalid operation slug format', () => {
    const input = {
      actionId: VALID_UUID_1,
      operationSlug: 'Invalid Slug',
      displayName: 'Test',
    };

    expect(() => CreateCompositeToolOperationInputSchema.parse(input)).toThrow();
  });

  it('should reject negative priority', () => {
    const input = {
      actionId: VALID_UUID_1,
      operationSlug: 'test',
      displayName: 'Test',
      priority: -1,
    };

    expect(() => CreateCompositeToolOperationInputSchema.parse(input)).toThrow();
  });
});

// =============================================================================
// CreateRoutingRuleInputSchema Tests
// =============================================================================

describe('CreateRoutingRuleInputSchema', () => {
  it('should accept valid routing rule input', () => {
    const input = {
      operationId: VALID_UUID_1,
      conditionType: 'contains',
      conditionField: 'url',
      conditionValue: 'linkedin.com',
    };

    const result = CreateRoutingRuleInputSchema.parse(input);

    expect(result.operationId).toBe(VALID_UUID_1);
    expect(result.conditionType).toBe('contains');
    expect(result.caseSensitive).toBe(false); // default
    expect(result.priority).toBe(0); // default
  });

  it('should accept rule with all options', () => {
    const input = {
      operationId: VALID_UUID_1,
      conditionType: 'equals',
      conditionField: 'domain',
      conditionValue: 'reddit.com',
      caseSensitive: true,
      priority: 10,
    };

    const result = CreateRoutingRuleInputSchema.parse(input);

    expect(result.caseSensitive).toBe(true);
    expect(result.priority).toBe(10);
  });

  it('should reject invalid operation ID', () => {
    const input = {
      operationId: 'not-a-uuid',
      conditionType: 'contains',
      conditionField: 'url',
      conditionValue: 'test',
    };

    expect(() => CreateRoutingRuleInputSchema.parse(input)).toThrow();
  });

  it('should reject empty condition field', () => {
    const input = {
      operationId: VALID_UUID_1,
      conditionType: 'contains',
      conditionField: '',
      conditionValue: 'test',
    };

    expect(() => CreateRoutingRuleInputSchema.parse(input)).toThrow();
  });
});

// =============================================================================
// ListCompositeToolsQuerySchema Tests
// =============================================================================

describe('ListCompositeToolsQuerySchema', () => {
  it('should accept empty query with defaults', () => {
    const result = ListCompositeToolsQuerySchema.parse({});

    expect(result.limit).toBe(20); // default
    expect(result.cursor).toBeUndefined();
    expect(result.status).toBeUndefined();
  });

  it('should parse limit from string', () => {
    const result = ListCompositeToolsQuerySchema.parse({ limit: '50' });
    expect(result.limit).toBe(50);
  });

  it('should reject limit greater than 100', () => {
    expect(() => ListCompositeToolsQuerySchema.parse({ limit: '200' })).toThrow();
  });

  it('should reject limit less than 1', () => {
    expect(() => ListCompositeToolsQuerySchema.parse({ limit: '0' })).toThrow();
    expect(() => ListCompositeToolsQuerySchema.parse({ limit: '-5' })).toThrow();
  });

  it('should accept status filter', () => {
    const result = ListCompositeToolsQuerySchema.parse({ status: 'active' });
    expect(result.status).toBe('active');
  });

  it('should accept routingMode filter', () => {
    const result = ListCompositeToolsQuerySchema.parse({ routingMode: 'rule_based' });
    expect(result.routingMode).toBe('rule_based');
  });

  it('should accept search parameter', () => {
    const result = ListCompositeToolsQuerySchema.parse({ search: 'scraper' });
    expect(result.search).toBe('scraper');
  });
});

// =============================================================================
// Response Converter Tests
// =============================================================================

describe('toCompositeToolResponse', () => {
  it('should convert database model to response format', () => {
    const dbTool = {
      id: VALID_UUID_1,
      tenantId: VALID_UUID_2,
      name: 'Smart Scraper',
      slug: 'smart-scraper',
      description: 'A smart scraper tool',
      routingMode: 'rule_based',
      defaultOperationId: null,
      unifiedInputSchema: { parameters: {} },
      toolDescription: 'Use this tool to scrape',
      toolSuccessTemplate: null,
      toolErrorTemplate: null,
      status: 'active',
      metadata: { custom: 'value' },
      createdAt: new Date('2024-01-01T00:00:00Z'),
      updatedAt: new Date('2024-01-02T00:00:00Z'),
    };

    const result = toCompositeToolResponse(dbTool);

    expect(result.id).toBe(dbTool.id);
    expect(result.name).toBe(dbTool.name);
    expect(result.routingMode).toBe('rule_based');
    expect(result.status).toBe('active');
    expect(result.createdAt).toBe('2024-01-01T00:00:00.000Z');
    expect(result.updatedAt).toBe('2024-01-02T00:00:00.000Z');
    expect(result.metadata).toEqual({ custom: 'value' });
  });

  it('should handle null unifiedInputSchema', () => {
    const dbTool = {
      id: VALID_UUID_1,
      tenantId: VALID_UUID_2,
      name: 'Test',
      slug: 'test',
      description: null,
      routingMode: 'agent_driven',
      defaultOperationId: null,
      unifiedInputSchema: null,
      toolDescription: null,
      toolSuccessTemplate: null,
      toolErrorTemplate: null,
      status: 'draft',
      metadata: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = toCompositeToolResponse(dbTool);

    expect(result.unifiedInputSchema).toEqual({});
    expect(result.metadata).toEqual({});
  });
});

describe('toOperationResponse', () => {
  it('should convert database operation to response format', () => {
    const dbOperation = {
      id: VALID_UUID_1,
      compositeToolId: VALID_UUID_2,
      actionId: VALID_UUID_3,
      operationSlug: 'linkedin-scraper',
      displayName: 'LinkedIn Scraper',
      parameterMapping: { url: { targetParam: 'profile_url' } },
      priority: 0,
      createdAt: new Date('2024-01-01T00:00:00Z'),
    };

    const result = toOperationResponse(dbOperation);

    expect(result.id).toBe(dbOperation.id);
    expect(result.operationSlug).toBe('linkedin-scraper');
    expect(result.parameterMapping).toEqual({ url: { targetParam: 'profile_url' } });
    expect(result.createdAt).toBe('2024-01-01T00:00:00.000Z');
    expect(result.action).toBeUndefined();
  });

  it('should include action info when provided', () => {
    const dbOperation = {
      id: VALID_UUID_1,
      compositeToolId: VALID_UUID_2,
      actionId: VALID_UUID_3,
      operationSlug: 'linkedin-scraper',
      displayName: 'LinkedIn Scraper',
      parameterMapping: {},
      priority: 0,
      createdAt: new Date(),
      action: {
        id: VALID_UUID_3,
        name: 'Scrape Profile',
        slug: 'scrape-profile',
        integrationId: VALID_UUID_4,
        integration: {
          id: VALID_UUID_4,
          name: 'RapidAPI LinkedIn',
          slug: 'rapidapi-linkedin',
        },
      },
    };

    const result = toOperationResponse(dbOperation);

    expect(result.action).toBeDefined();
    expect(result.action!.name).toBe('Scrape Profile');
    expect(result.action!.integration.name).toBe('RapidAPI LinkedIn');
  });
});

describe('toRoutingRuleResponse', () => {
  it('should convert database rule to response format', () => {
    const dbRule = {
      id: VALID_UUID_1,
      compositeToolId: VALID_UUID_2,
      operationId: VALID_UUID_3,
      conditionType: 'contains',
      conditionField: 'url',
      conditionValue: 'linkedin.com',
      caseSensitive: false,
      priority: 0,
      createdAt: new Date('2024-01-01T00:00:00Z'),
    };

    const result = toRoutingRuleResponse(dbRule);

    expect(result.id).toBe(dbRule.id);
    expect(result.conditionType).toBe('contains');
    expect(result.conditionField).toBe('url');
    expect(result.conditionValue).toBe('linkedin.com');
    expect(result.caseSensitive).toBe(false);
    expect(result.createdAt).toBe('2024-01-01T00:00:00.000Z');
  });
});
