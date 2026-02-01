/**
 * Parameter Mapper Unit Tests
 *
 * Tests for mapping unified parameters to operation-specific parameters,
 * including validation, defaults, and tracking of parameter mappings.
 */

import { describe, it, expect } from 'vitest';
import {
  mapParameters,
  extractAndRemoveOperationSlug,
  summarizeMappingResult,
  createMappingErrorResponse,
  ParameterMappingError,
} from '@/lib/modules/composite-tools/context/parameter-mapper';
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
// mapParameters Tests
// =============================================================================

describe('mapParameters', () => {
  describe('with unified schema config', () => {
    it('should map parameters using unified config mappings', () => {
      const unifiedParams = { url: 'https://linkedin.com/in/user' };
      const operation = createMockOperation({ operationSlug: 'linkedin-scraper' });
      const action = createMockAction({
        inputSchema: {
          type: 'object',
          properties: {
            profile_url: { type: 'string' },
          },
          required: ['profile_url'],
        },
      });
      const unifiedSchemaConfig = {
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

      const result = mapParameters(unifiedParams, operation, action, unifiedSchemaConfig);

      expect(result.success).toBe(true);
      expect(result.mappedParams).toHaveProperty('profile_url', 'https://linkedin.com/in/user');
      expect(result.mappings).toHaveLength(1);
      expect(result.mappings[0].unifiedName).toBe('url');
      expect(result.mappings[0].targetName).toBe('profile_url');
      expect(result.mappings[0].mapped).toBe(true);
    });

    it('should track unmapped parameters', () => {
      const unifiedParams = { url: 'https://example.com', extra: 'value' };
      const operation = createMockOperation({ operationSlug: 'scraper' });
      const action = createMockAction();
      const unifiedSchemaConfig = {
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

      const result = mapParameters(unifiedParams, operation, action, unifiedSchemaConfig);

      expect(result.unmappedParams).toContain('extra');
    });

    it('should not track operation and operationSlug in mappings array', () => {
      const unifiedParams = {
        url: 'https://example.com',
        operation: 'scraper',
        operationSlug: 'scraper',
      };
      const operation = createMockOperation({ operationSlug: 'scraper' });
      const action = createMockAction();
      const unifiedSchemaConfig = {
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

      const result = mapParameters(unifiedParams, operation, action, unifiedSchemaConfig);

      // operation and operationSlug are not tracked in mappings array (they're routing params)
      expect(result.mappings.find((m) => m.unifiedName === 'operation')).toBeUndefined();
      expect(result.mappings.find((m) => m.unifiedName === 'operationSlug')).toBeUndefined();
      // URL should still be properly mapped
      expect(result.mappedParams).toHaveProperty('url', 'https://example.com');
    });
  });

  describe('without unified schema config', () => {
    it('should apply operation-level parameter mapping', () => {
      const unifiedParams = { url: 'https://example.com' };
      const operation = createMockOperation({
        operationSlug: 'scraper',
        parameterMapping: {
          url: { targetParam: 'target_url' },
        },
      });
      const action = createMockAction({
        inputSchema: {
          type: 'object',
          properties: {
            target_url: { type: 'string' },
          },
          required: ['target_url'],
        },
      });

      const result = mapParameters(unifiedParams, operation, action, null);

      expect(result.mappedParams).toHaveProperty('target_url', 'https://example.com');
      expect(result.mappings[0].mapped).toBe(true);
    });

    it('should pass through parameters without mapping', () => {
      const unifiedParams = { url: 'https://example.com', format: 'json' };
      const operation = createMockOperation({ operationSlug: 'scraper', parameterMapping: {} });
      const action = createMockAction();

      const result = mapParameters(unifiedParams, operation, action, null);

      expect(result.mappedParams).toHaveProperty('url', 'https://example.com');
      expect(result.mappedParams).toHaveProperty('format', 'json');
      expect(result.mappings.every((m) => !m.mapped)).toBe(true);
    });
  });

  describe('validation', () => {
    it('should validate required parameters', () => {
      const unifiedParams = { format: 'json' }; // Missing required 'url'
      const operation = createMockOperation({ operationSlug: 'scraper' });
      const action = createMockAction({
        inputSchema: {
          type: 'object',
          properties: {
            url: { type: 'string' },
            format: { type: 'string' },
          },
          required: ['url'],
        },
      });

      const result = mapParameters(unifiedParams, operation, action, null);

      expect(result.success).toBe(false);
      expect(result.validationErrors).toContain('Missing required parameter: url');
    });

    it('should skip validation when skipValidation is true', () => {
      const unifiedParams = {}; // Missing required param
      const operation = createMockOperation({ operationSlug: 'scraper' });
      const action = createMockAction({
        inputSchema: {
          type: 'object',
          properties: {
            url: { type: 'string' },
          },
          required: ['url'],
        },
      });

      const result = mapParameters(unifiedParams, operation, action, null, {
        skipValidation: true,
      });

      expect(result.success).toBe(true);
      expect(result.validationErrors).toHaveLength(0);
    });

    it('should validate parameter types', () => {
      const unifiedParams = { count: 'not a number' };
      const operation = createMockOperation({ operationSlug: 'op' });
      const action = createMockAction({
        inputSchema: {
          type: 'object',
          properties: {
            count: { type: 'integer' },
          },
        },
      });

      const result = mapParameters(unifiedParams, operation, action, null);

      expect(result.success).toBe(false);
      expect(result.validationErrors[0]).toContain('count');
      expect(result.validationErrors[0]).toContain('integer');
    });

    it('should validate enum values', () => {
      const unifiedParams = { format: 'invalid' };
      const operation = createMockOperation({ operationSlug: 'op' });
      const action = createMockAction({
        inputSchema: {
          type: 'object',
          properties: {
            format: { type: 'string', enum: ['json', 'xml'] },
          },
        },
      });

      const result = mapParameters(unifiedParams, operation, action, null);

      expect(result.success).toBe(false);
      expect(result.validationErrors[0]).toContain('format');
      expect(result.validationErrors[0]).toContain('allowed values');
    });
  });

  describe('defaults', () => {
    it('should apply default values from action schema', () => {
      const unifiedParams = { url: 'https://example.com' };
      const operation = createMockOperation({ operationSlug: 'op' });
      const action = createMockAction({
        inputSchema: {
          type: 'object',
          properties: {
            url: { type: 'string' },
            format: { type: 'string', default: 'markdown' },
          },
          required: ['url'],
        },
      });

      const result = mapParameters(unifiedParams, operation, action, null, { applyDefaults: true });

      expect(result.mappedParams).toHaveProperty('format', 'markdown');
    });

    it('should not override provided values with defaults', () => {
      const unifiedParams = { url: 'https://example.com', format: 'html' };
      const operation = createMockOperation({ operationSlug: 'op' });
      const action = createMockAction({
        inputSchema: {
          type: 'object',
          properties: {
            url: { type: 'string' },
            format: { type: 'string', default: 'markdown' },
          },
        },
      });

      const result = mapParameters(unifiedParams, operation, action, null, { applyDefaults: true });

      expect(result.mappedParams.format).toBe('html');
    });

    it('should skip defaults when applyDefaults is false', () => {
      const unifiedParams = { url: 'https://example.com' };
      const operation = createMockOperation({ operationSlug: 'op' });
      const action = createMockAction({
        inputSchema: {
          type: 'object',
          properties: {
            url: { type: 'string' },
            format: { type: 'string', default: 'markdown' },
          },
        },
      });

      const result = mapParameters(unifiedParams, operation, action, null, {
        applyDefaults: false,
      });

      expect(result.mappedParams).not.toHaveProperty('format');
    });
  });

  describe('stripUnknown', () => {
    it('should strip unknown parameters when stripUnknown is true', () => {
      const unifiedParams = { url: 'https://example.com', unknown: 'value' };
      const operation = createMockOperation({ operationSlug: 'op' });
      const action = createMockAction({
        inputSchema: {
          type: 'object',
          properties: {
            url: { type: 'string' },
          },
        },
      });

      const result = mapParameters(unifiedParams, operation, action, null, { stripUnknown: true });

      expect(result.mappedParams).toHaveProperty('url');
      expect(result.mappedParams).not.toHaveProperty('unknown');
    });

    it('should keep unknown parameters when stripUnknown is false', () => {
      const unifiedParams = { url: 'https://example.com', unknown: 'value' };
      const operation = createMockOperation({ operationSlug: 'op' });
      const action = createMockAction({
        inputSchema: {
          type: 'object',
          properties: {
            url: { type: 'string' },
          },
        },
      });

      const result = mapParameters(unifiedParams, operation, action, null, { stripUnknown: false });

      expect(result.mappedParams).toHaveProperty('unknown', 'value');
    });
  });
});

// =============================================================================
// extractAndRemoveOperationSlug Tests
// =============================================================================

describe('extractAndRemoveOperationSlug', () => {
  it('should extract operation from params', () => {
    const params = { url: 'https://example.com', operation: 'linkedin-scraper' };

    const { operationSlug, cleanedParams } = extractAndRemoveOperationSlug(params);

    expect(operationSlug).toBe('linkedin-scraper');
    expect(cleanedParams).not.toHaveProperty('operation');
    expect(cleanedParams).toHaveProperty('url', 'https://example.com');
  });

  it('should extract operationSlug from params', () => {
    const params = { url: 'https://example.com', operationSlug: 'reddit-scraper' };

    const { operationSlug, cleanedParams } = extractAndRemoveOperationSlug(params);

    expect(operationSlug).toBe('reddit-scraper');
    expect(cleanedParams).not.toHaveProperty('operationSlug');
  });

  it('should prefer operation over operationSlug', () => {
    const params = { operation: 'first', operationSlug: 'second' };

    const { operationSlug } = extractAndRemoveOperationSlug(params);

    expect(operationSlug).toBe('first');
  });

  it('should return undefined when no operation param exists', () => {
    const params = { url: 'https://example.com' };

    const { operationSlug, cleanedParams } = extractAndRemoveOperationSlug(params);

    expect(operationSlug).toBeUndefined();
    expect(cleanedParams).toEqual(params);
  });

  it('should remove both operation and operationSlug from cleaned params', () => {
    const params = { url: 'https://example.com', operation: 'op1', operationSlug: 'op2' };

    const { cleanedParams } = extractAndRemoveOperationSlug(params);

    expect(cleanedParams).not.toHaveProperty('operation');
    expect(cleanedParams).not.toHaveProperty('operationSlug');
    expect(cleanedParams).toHaveProperty('url');
  });
});

// =============================================================================
// summarizeMappingResult Tests
// =============================================================================

describe('summarizeMappingResult', () => {
  it('should summarize mapping result correctly', () => {
    const result = {
      mappedParams: { target_url: 'value' },
      mappings: [
        { unifiedName: 'url', targetName: 'target_url', value: 'value', mapped: true },
        { unifiedName: 'format', targetName: 'format', value: 'json', mapped: false },
      ],
      unmappedParams: ['format'],
      validationErrors: ['Error 1'],
      success: false,
    };

    const summary = summarizeMappingResult(result);

    expect(summary.totalParams).toBe(2);
    expect(summary.mappedCount).toBe(1);
    expect(summary.passedThroughCount).toBe(1);
    expect(summary.validationErrorCount).toBe(1);
  });

  it('should handle empty result', () => {
    const result = {
      mappedParams: {},
      mappings: [],
      unmappedParams: [],
      validationErrors: [],
      success: true,
    };

    const summary = summarizeMappingResult(result);

    expect(summary.totalParams).toBe(0);
    expect(summary.mappedCount).toBe(0);
    expect(summary.passedThroughCount).toBe(0);
    expect(summary.validationErrorCount).toBe(0);
  });
});

// =============================================================================
// createMappingErrorResponse Tests
// =============================================================================

describe('createMappingErrorResponse', () => {
  it('should create error with single validation error', () => {
    const error = createMappingErrorResponse('test-op', ['Missing required parameter: url']);

    expect(error).toBeInstanceOf(ParameterMappingError);
    expect(error.message).toBe('Missing required parameter: url');
    expect(error.errors).toHaveLength(1);
    expect(error.operationSlug).toBe('test-op');
  });

  it('should create error with multiple validation errors', () => {
    const errors = ['Error 1', 'Error 2', 'Error 3'];
    const error = createMappingErrorResponse('test-op', errors);

    expect(error.message).toBe('3 parameter validation errors');
    expect(error.errors).toEqual(errors);
  });

  it('should include all errors in errors array', () => {
    const errors = ['Error 1', 'Error 2'];
    const error = createMappingErrorResponse('test-op', errors);

    expect(error.errors).toContain('Error 1');
    expect(error.errors).toContain('Error 2');
  });
});
