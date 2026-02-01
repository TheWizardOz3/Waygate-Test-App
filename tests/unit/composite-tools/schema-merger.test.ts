/**
 * Schema Merger Unit Tests
 *
 * Tests for merging input schemas from multiple operations into a unified schema.
 * Covers type conflict resolution, parameter mappings, and agent-driven schema building.
 */

import { describe, it, expect } from 'vitest';
import {
  mergeOperationSchemas,
  mapParametersToOperation,
  getOperationEnumValues,
  buildAgentDrivenSchema,
  validateUnifiedParams,
  type OperationWithAction,
} from '@/lib/modules/composite-tools/routing/schema-merger';
import type { Action, CompositeToolOperation } from '@prisma/client';

// =============================================================================
// Test Fixtures
// =============================================================================

function createMockAction(overrides: Partial<Action> = {}): Action {
  return {
    id: 'action-1',
    tenantId: 'tenant-1',
    integrationId: 'integration-1',
    name: 'Test Action',
    slug: 'test-action',
    description: 'Test action description',
    method: 'GET',
    path: '/test',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'The URL parameter' },
      },
      required: ['url'],
    },
    outputSchema: null,
    baseUrl: null,
    headers: null,
    queryParams: null,
    bodyTemplate: null,
    responseMapping: null,
    preamble: null,
    toolDescription: null,
    toolSuccessTemplate: null,
    toolErrorTemplate: null,
    status: 'active',
    version: 1,
    metadata: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    paginationConfig: null,
    referenceDataSyncConfig: null,
    variableBindings: null,
    ...overrides,
  } as Action;
}

function createMockOperation(
  overrides: Partial<CompositeToolOperation> = {}
): CompositeToolOperation {
  return {
    id: 'operation-1',
    compositeToolId: 'tool-1',
    actionId: 'action-1',
    operationSlug: 'test-operation',
    displayName: 'Test Operation',
    parameterMapping: {},
    priority: 0,
    createdAt: new Date(),
    ...overrides,
  };
}

// =============================================================================
// mergeOperationSchemas Tests
// =============================================================================

describe('mergeOperationSchemas', () => {
  it('should merge schemas from a single operation', () => {
    const operations: OperationWithAction[] = [
      {
        operation: createMockOperation({ operationSlug: 'scraper' }),
        action: createMockAction({
          inputSchema: {
            type: 'object',
            properties: {
              url: { type: 'string', description: 'URL to scrape' },
            },
            required: ['url'],
          },
        }),
      },
    ];

    const result = mergeOperationSchemas(operations);

    expect(result.unifiedSchema.properties).toHaveProperty('url');
    expect(result.unifiedSchema.required).toContain('url');
    expect(result.parameterConfig.parameters.url).toBeDefined();
    expect(result.parameterConfig.parameters.url.operationMappings.scraper).toBeDefined();
  });

  it('should merge schemas from multiple operations with common parameters', () => {
    const operations: OperationWithAction[] = [
      {
        operation: createMockOperation({ operationSlug: 'linkedin-scraper' }),
        action: createMockAction({
          inputSchema: {
            type: 'object',
            properties: {
              url: { type: 'string', description: 'LinkedIn profile URL' },
            },
            required: ['url'],
          },
        }),
      },
      {
        operation: createMockOperation({ operationSlug: 'reddit-scraper' }),
        action: createMockAction({
          inputSchema: {
            type: 'object',
            properties: {
              url: { type: 'string', description: 'Reddit post URL' },
            },
            required: ['url'],
          },
        }),
      },
    ];

    const result = mergeOperationSchemas(operations);

    expect(result.unifiedSchema.properties).toHaveProperty('url');
    expect(result.parameterConfig.parameters.url.operationMappings).toHaveProperty(
      'linkedin-scraper'
    );
    expect(result.parameterConfig.parameters.url.operationMappings).toHaveProperty(
      'reddit-scraper'
    );
    // Verify both operations have mappings for the url parameter
    expect(Object.keys(result.parameterConfig.parameters.url.operationMappings)).toHaveLength(2);
  });

  it('should handle operations with different parameter names', () => {
    const operations: OperationWithAction[] = [
      {
        operation: createMockOperation({
          operationSlug: 'generic-scraper',
        }),
        action: createMockAction({
          inputSchema: {
            type: 'object',
            properties: {
              url: { type: 'string', description: 'URL to scrape' },
            },
            required: ['url'],
          },
        }),
      },
      {
        operation: createMockOperation({
          operationSlug: 'linkedin-scraper',
        }),
        action: createMockAction({
          inputSchema: {
            type: 'object',
            properties: {
              profile_url: { type: 'string', description: 'LinkedIn profile URL' },
            },
            required: ['profile_url'],
          },
        }),
      },
    ];

    const result = mergeOperationSchemas(operations);

    // Without explicit mapping, both params appear separately
    expect(result.unifiedSchema.properties).toHaveProperty('url');
    expect(result.unifiedSchema.properties).toHaveProperty('profile_url');
  });

  it('should handle parameter mapping to unify different parameter names', () => {
    const operations: OperationWithAction[] = [
      {
        operation: createMockOperation({
          operationSlug: 'generic-scraper',
        }),
        action: createMockAction({
          inputSchema: {
            type: 'object',
            properties: {
              url: { type: 'string', description: 'URL to scrape' },
            },
            required: ['url'],
          },
        }),
      },
      {
        operation: createMockOperation({
          operationSlug: 'linkedin-scraper',
          parameterMapping: {
            url: { targetParam: 'profile_url' },
          },
        }),
        action: createMockAction({
          inputSchema: {
            type: 'object',
            properties: {
              profile_url: { type: 'string', description: 'LinkedIn profile URL' },
            },
            required: ['profile_url'],
          },
        }),
      },
    ];

    const result = mergeOperationSchemas(operations);

    // The mapped parameter should appear as 'url'
    expect(result.unifiedSchema.properties).toHaveProperty('url');
    expect(result.parameterConfig.parameters.url.operationMappings).toHaveProperty(
      'generic-scraper'
    );
    expect(result.parameterConfig.parameters.url.operationMappings).toHaveProperty(
      'linkedin-scraper'
    );
    expect(
      result.parameterConfig.parameters.url.operationMappings['linkedin-scraper'].targetParam
    ).toBe('profile_url');
  });

  it('should generate warnings for type conflicts', () => {
    const operations: OperationWithAction[] = [
      {
        operation: createMockOperation({ operationSlug: 'op1' }),
        action: createMockAction({
          inputSchema: {
            type: 'object',
            properties: {
              limit: { type: 'number', description: 'Limit' },
            },
          },
        }),
      },
      {
        operation: createMockOperation({ operationSlug: 'op2' }),
        action: createMockAction({
          inputSchema: {
            type: 'object',
            properties: {
              limit: { type: 'string', description: 'Limit as string' },
            },
          },
        }),
      },
    ];

    const result = mergeOperationSchemas(operations, { typeConflictStrategy: 'string' });

    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('Type conflict');
    expect(result.unifiedSchema.properties.limit.type).toBe('string');
  });

  it('should respect requiredStrategy "any"', () => {
    const operations: OperationWithAction[] = [
      {
        operation: createMockOperation({ operationSlug: 'op1' }),
        action: createMockAction({
          inputSchema: {
            type: 'object',
            properties: {
              url: { type: 'string' },
            },
            required: ['url'],
          },
        }),
      },
      {
        operation: createMockOperation({ operationSlug: 'op2' }),
        action: createMockAction({
          inputSchema: {
            type: 'object',
            properties: {
              url: { type: 'string' },
            },
            required: [], // Not required here
          },
        }),
      },
    ];

    const result = mergeOperationSchemas(operations, { requiredStrategy: 'any' });

    // Required in ANY = required in unified
    expect(result.unifiedSchema.required).toContain('url');
  });

  it('should respect requiredStrategy "all"', () => {
    const operations: OperationWithAction[] = [
      {
        operation: createMockOperation({ operationSlug: 'op1' }),
        action: createMockAction({
          inputSchema: {
            type: 'object',
            properties: {
              url: { type: 'string' },
            },
            required: ['url'],
          },
        }),
      },
      {
        operation: createMockOperation({ operationSlug: 'op2' }),
        action: createMockAction({
          inputSchema: {
            type: 'object',
            properties: {
              url: { type: 'string' },
            },
            required: [], // Not required here
          },
        }),
      },
    ];

    const result = mergeOperationSchemas(operations, { requiredStrategy: 'all' });

    // Required in ALL = not required since op2 doesn't require it
    expect(result.unifiedSchema.required).not.toContain('url');
  });

  it('should merge enum values from multiple operations', () => {
    const operations: OperationWithAction[] = [
      {
        operation: createMockOperation({ operationSlug: 'op1' }),
        action: createMockAction({
          inputSchema: {
            type: 'object',
            properties: {
              format: { type: 'string', enum: ['json', 'xml'] },
            },
          },
        }),
      },
      {
        operation: createMockOperation({ operationSlug: 'op2' }),
        action: createMockAction({
          inputSchema: {
            type: 'object',
            properties: {
              format: { type: 'string', enum: ['json', 'html'] },
            },
          },
        }),
      },
    ];

    const result = mergeOperationSchemas(operations);

    // Enum should be merged (unique values)
    expect(result.unifiedSchema.properties.format.enum).toContain('json');
    expect(result.unifiedSchema.properties.format.enum).toContain('xml');
    expect(result.unifiedSchema.properties.format.enum).toContain('html');
  });

  it('should handle empty input schemas', () => {
    const operations: OperationWithAction[] = [
      {
        operation: createMockOperation({ operationSlug: 'op1' }),
        action: createMockAction({
          inputSchema: null,
        }),
      },
    ];

    const result = mergeOperationSchemas(operations);

    expect(result.unifiedSchema.properties).toEqual({});
    expect(result.unifiedSchema.required).toEqual([]);
  });

  it('should use longest description when merging', () => {
    const operations: OperationWithAction[] = [
      {
        operation: createMockOperation({ operationSlug: 'op1' }),
        action: createMockAction({
          inputSchema: {
            type: 'object',
            properties: {
              url: { type: 'string', description: 'URL' },
            },
          },
        }),
      },
      {
        operation: createMockOperation({ operationSlug: 'op2' }),
        action: createMockAction({
          inputSchema: {
            type: 'object',
            properties: {
              url: {
                type: 'string',
                description: 'The full URL to the target resource including protocol',
              },
            },
          },
        }),
      },
    ];

    const result = mergeOperationSchemas(operations);

    // Should use the longer description
    expect(result.unifiedSchema.properties.url.description).toContain('full URL');
  });
});

// =============================================================================
// mapParametersToOperation Tests
// =============================================================================

describe('mapParametersToOperation', () => {
  it('should map parameters using unified config', () => {
    const unifiedParams = { url: 'https://linkedin.com/in/user' };
    const operation = createMockOperation({ operationSlug: 'linkedin-scraper' });
    const config = {
      parameters: {
        url: {
          type: 'string',
          required: true,
          operationMappings: {
            'linkedin-scraper': { targetParam: 'profile_url' },
          },
        },
      },
    };

    const result = mapParametersToOperation(unifiedParams, operation, config);

    expect(result).toHaveProperty('profile_url', 'https://linkedin.com/in/user');
    expect(result).not.toHaveProperty('url');
  });

  it('should pass through unmapped parameters', () => {
    const unifiedParams = { url: 'https://example.com', extra: 'value' };
    const operation = createMockOperation({ operationSlug: 'scraper' });
    const config = {
      parameters: {
        url: {
          type: 'string',
          required: true,
          operationMappings: {
            scraper: { targetParam: 'url' },
          },
        },
      },
    };

    const result = mapParametersToOperation(unifiedParams, operation, config);

    expect(result).toHaveProperty('url', 'https://example.com');
    expect(result).toHaveProperty('extra', 'value');
  });

  it('should handle operation-level parameter mapping overrides', () => {
    const unifiedParams = { url: 'https://example.com' };
    const operation = createMockOperation({
      operationSlug: 'scraper',
      parameterMapping: {
        url: { targetParam: 'target_url' },
      },
    });
    const config = {
      parameters: {
        url: {
          type: 'string',
          required: true,
          operationMappings: {
            scraper: { targetParam: 'url' },
          },
        },
      },
    };

    const result = mapParametersToOperation(unifiedParams, operation, config);

    // Operation mapping should override unified config
    expect(result).toHaveProperty('target_url', 'https://example.com');
  });

  it('should handle empty parameter config', () => {
    const unifiedParams = { url: 'https://example.com' };
    const operation = createMockOperation({ operationSlug: 'scraper' });
    const config = { parameters: {} };

    const result = mapParametersToOperation(unifiedParams, operation, config);

    // Should pass through as-is
    expect(result).toHaveProperty('url', 'https://example.com');
  });
});

// =============================================================================
// getOperationEnumValues Tests
// =============================================================================

describe('getOperationEnumValues', () => {
  it('should return array of operation slugs', () => {
    const operations = [
      createMockOperation({ operationSlug: 'linkedin-scraper' }),
      createMockOperation({ operationSlug: 'reddit-scraper' }),
      createMockOperation({ operationSlug: 'generic-scraper' }),
    ];

    const result = getOperationEnumValues(operations);

    expect(result).toEqual(['linkedin-scraper', 'reddit-scraper', 'generic-scraper']);
  });

  it('should return empty array for empty operations', () => {
    const result = getOperationEnumValues([]);
    expect(result).toEqual([]);
  });
});

// =============================================================================
// buildAgentDrivenSchema Tests
// =============================================================================

describe('buildAgentDrivenSchema', () => {
  it('should add operation parameter to schema', () => {
    const unifiedSchema = {
      type: 'object' as const,
      properties: {
        url: { type: 'string' as const, description: 'URL' },
      },
      required: ['url'],
    };
    const operations = [
      createMockOperation({ operationSlug: 'linkedin-scraper' }),
      createMockOperation({ operationSlug: 'generic-scraper' }),
    ];

    const result = buildAgentDrivenSchema(unifiedSchema, operations);

    expect(result.properties).toHaveProperty('operation');
    expect(result.properties.operation.enum).toEqual(['linkedin-scraper', 'generic-scraper']);
    expect(result.required).toContain('operation');
  });

  it('should make operation required', () => {
    const unifiedSchema = {
      type: 'object' as const,
      properties: {},
      required: [],
    };
    const operations = [createMockOperation({ operationSlug: 'test' })];

    const result = buildAgentDrivenSchema(unifiedSchema, operations);

    expect(result.required).toContain('operation');
  });

  it('should preserve existing required parameters', () => {
    const unifiedSchema = {
      type: 'object' as const,
      properties: {
        url: { type: 'string' as const },
        format: { type: 'string' as const },
      },
      required: ['url'],
    };
    const operations = [createMockOperation({ operationSlug: 'test' })];

    const result = buildAgentDrivenSchema(unifiedSchema, operations);

    expect(result.required).toContain('operation');
    expect(result.required).toContain('url');
  });
});

// =============================================================================
// validateUnifiedParams Tests
// =============================================================================

describe('validateUnifiedParams', () => {
  it('should pass validation for valid params', () => {
    const params = { url: 'https://example.com' };
    const schema = {
      type: 'object' as const,
      properties: {
        url: { type: 'string' as const },
      },
      required: ['url'],
    };

    const result = validateUnifiedParams(params, schema);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should fail validation for missing required params', () => {
    const params = {};
    const schema = {
      type: 'object' as const,
      properties: {
        url: { type: 'string' as const },
      },
      required: ['url'],
    };

    const result = validateUnifiedParams(params, schema);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Missing required parameter: url');
  });

  it('should fail validation for type mismatch', () => {
    const params = { count: 'not a number' };
    const schema = {
      type: 'object' as const,
      properties: {
        count: { type: 'number' as const },
      },
      required: [],
    };

    const result = validateUnifiedParams(params, schema);

    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('count');
    expect(result.errors[0]).toContain('number');
  });

  it('should fail validation for enum mismatch', () => {
    const params = { format: 'invalid' };
    const schema = {
      type: 'object' as const,
      properties: {
        format: { type: 'string' as const, enum: ['json', 'xml'] },
      },
      required: [],
    };

    const result = validateUnifiedParams(params, schema);

    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('format');
    expect(result.errors[0]).toContain('allowed values');
  });

  it('should allow string coercion for float numbers', () => {
    const params = { value: 42.5 };
    const schema = {
      type: 'object' as const,
      properties: {
        value: { type: 'string' as const },
      },
      required: [],
    };

    const result = validateUnifiedParams(params, schema);

    // Float numbers can be coerced to strings
    expect(result.valid).toBe(true);
  });

  it('should not allow integer coercion to string (strict type checking)', () => {
    const params = { value: 42 };
    const schema = {
      type: 'object' as const,
      properties: {
        value: { type: 'string' as const },
      },
      required: [],
    };

    const result = validateUnifiedParams(params, schema);

    // Integers are typed as 'integer' not 'number', so coercion doesn't apply
    expect(result.valid).toBe(false);
  });

  it('should allow null for optional params', () => {
    const params = { optional: null };
    const schema = {
      type: 'object' as const,
      properties: {
        optional: { type: 'string' as const },
      },
      required: [],
    };

    const result = validateUnifiedParams(params, schema);

    expect(result.valid).toBe(true);
  });

  it('should ignore unknown parameters', () => {
    const params = { url: 'https://example.com', unknown: 'value' };
    const schema = {
      type: 'object' as const,
      properties: {
        url: { type: 'string' as const },
      },
      required: ['url'],
    };

    const result = validateUnifiedParams(params, schema);

    expect(result.valid).toBe(true);
  });
});
