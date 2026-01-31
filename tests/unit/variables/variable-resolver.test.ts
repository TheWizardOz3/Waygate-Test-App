import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  resolveTemplate,
  resolveValue,
  resolveTemplates,
  maskSensitiveValues,
  summarizeResolution,
  previewResolution,
  VariableResolutionError,
} from '@/lib/modules/variables/variable.resolver';
import { resetVariableCache } from '@/lib/modules/variables/variable.cache';
import type {
  ScopedVariables,
  VariableResolutionResult,
  ParsedVariableReference,
} from '@/lib/modules/variables/types';

// Mock the repository and cache modules
vi.mock('@/lib/modules/variables/variable.repository', () => ({
  getScopedVariables: vi.fn(),
}));

vi.mock('@/lib/modules/variables/variable.cache', () => ({
  getVariableCache: vi.fn(() => ({
    get: vi.fn(() => null),
    set: vi.fn(),
  })),
  resetVariableCache: vi.fn(),
}));

import { getScopedVariables } from '@/lib/modules/variables/variable.repository';

describe('Variable Resolver', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetVariableCache();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Sample scoped variables for testing (tenant only - no connection overrides)
  const mockTenantOnlyVariables: ScopedVariables = {
    tenant: {
      api_version: { value: 'v2', valueType: 'string', sensitive: false },
      default_channel: { value: 'C123456', valueType: 'string', sensitive: false },
      api_key: { value: 'secret_key_123', valueType: 'string', sensitive: true },
    },
    connection: {},
  };

  // Sample scoped variables with connection overrides
  const mockScopedVariablesWithConnection: ScopedVariables = {
    tenant: {
      api_version: { value: 'v2', valueType: 'string', sensitive: false },
      default_channel: { value: 'C123456', valueType: 'string', sensitive: false },
      api_key: { value: 'secret_key_123', valueType: 'string', sensitive: true },
    },
    connection: {
      default_channel: { value: 'C789012', valueType: 'string', sensitive: false },
      workspace_id: { value: 'W456', valueType: 'string', sensitive: false },
    },
  };

  describe('resolveTemplate', () => {
    beforeEach(() => {
      // Default mock returns tenant-only variables
      vi.mocked(getScopedVariables).mockResolvedValue(mockTenantOnlyVariables);
    });

    it('should resolve user-defined variables', async () => {
      const result = await resolveTemplate('/api/${var.api_version}/users', {
        tenantId: 'tenant_123',
      });

      expect(result.resolved).toBe('/api/v2/users');
      expect(result.allFound).toBe(true);
      expect(result.missing).toHaveLength(0);
    });

    it('should return original template when no variables present', async () => {
      const result = await resolveTemplate('/api/v1/users', {
        tenantId: 'tenant_123',
      });

      expect(result.resolved).toBe('/api/v1/users');
      expect(result.variables).toHaveLength(0);
      expect(result.allFound).toBe(true);
    });

    it('should resolve multiple variables', async () => {
      const result = await resolveTemplate(
        '/api/${var.api_version}/channels/${var.default_channel}',
        { tenantId: 'tenant_123' }
      );

      expect(result.resolved).toBe('/api/v2/channels/C123456');
      expect(result.variables).toHaveLength(2);
    });

    it('should prioritize connection variables over tenant variables', async () => {
      // Use mock with connection overrides for this test
      vi.mocked(getScopedVariables).mockResolvedValue(mockScopedVariablesWithConnection);

      const result = await resolveTemplate('channel: ${var.default_channel}', {
        tenantId: 'tenant_123',
        connectionId: 'conn_456',
      });

      expect(result.resolved).toBe('channel: C789012');
      expect(result.variables[0].source).toBe('connection_variable');
    });

    it('should resolve built-in runtime variables', async () => {
      const result = await resolveTemplate('Request: ${request.id}', {
        tenantId: 'tenant_123',
        runtimeContext: {
          request: {
            id: 'req_abc123',
            timestamp: '2024-01-01T00:00:00.000Z',
            environment: 'test',
          },
        },
      });

      expect(result.resolved).toBe('Request: req_abc123');
      expect(result.variables[0].source).toBe('runtime');
    });

    it('should resolve current_user variables', async () => {
      const result = await resolveTemplate('User: ${current_user.name}', {
        tenantId: 'tenant_123',
        runtimeContext: {
          current_user: {
            id: 'user_123',
            name: 'John Doe',
            email: 'john@example.com',
          },
        },
      });

      expect(result.resolved).toBe('User: John Doe');
    });

    it('should resolve connection context variables', async () => {
      const result = await resolveTemplate('Connection: ${connection.name}', {
        tenantId: 'tenant_123',
        runtimeContext: {
          connection: {
            id: 'conn_456',
            name: 'My Slack',
            workspaceId: 'W789',
          },
        },
      });

      expect(result.resolved).toBe('Connection: My Slack');
    });

    it('should prioritize request variables over stored variables', async () => {
      const result = await resolveTemplate('Version: ${var.api_version}', {
        tenantId: 'tenant_123',
        requestVariables: {
          // Use flat key format (resolver checks ref.key for var namespace)
          api_version: 'v3', // Override the stored v2
        },
      });

      expect(result.resolved).toBe('Version: v3');
      expect(result.variables[0].source).toBe('request_context');
    });

    it('should use empty string for missing variables by default', async () => {
      const result = await resolveTemplate('Value: ${var.nonexistent}', {
        tenantId: 'tenant_123',
      });

      expect(result.resolved).toBe('Value: ');
      expect(result.allFound).toBe(false);
      expect(result.missing).toHaveLength(1);
    });

    it('should use default value when provided', async () => {
      const result = await resolveTemplate('Value: ${var.nonexistent}', {
        tenantId: 'tenant_123',
        defaultValue: 'DEFAULT',
      });

      expect(result.resolved).toBe('Value: DEFAULT');
    });

    it('should throw on missing variables when throwOnMissing is true', async () => {
      await expect(
        resolveTemplate('Value: ${var.nonexistent}', {
          tenantId: 'tenant_123',
          throwOnMissing: true,
        })
      ).rejects.toThrow(VariableResolutionError);
    });

    it('should track variable sources correctly', async () => {
      // Use mock with connection overrides for this test
      vi.mocked(getScopedVariables).mockResolvedValue(mockScopedVariablesWithConnection);

      const result = await resolveTemplate(
        '${var.api_version} ${var.default_channel} ${request.id}',
        {
          tenantId: 'tenant_123',
          connectionId: 'conn_456',
          runtimeContext: {
            request: { id: 'req_123', timestamp: '', environment: 'test' },
          },
        }
      );

      const sources = result.variables.map((v) => v.source);
      expect(sources).toContain('tenant_variable');
      expect(sources).toContain('connection_variable');
      expect(sources).toContain('runtime');
    });

    it('should mark sensitive variables', async () => {
      const result = await resolveTemplate('Key: ${var.api_key}', {
        tenantId: 'tenant_123',
      });

      expect(result.resolved).toBe('Key: secret_key_123');
      expect(result.variables[0].sensitive).toBe(true);
    });
  });

  describe('resolveValue', () => {
    beforeEach(() => {
      vi.mocked(getScopedVariables).mockResolvedValue(mockTenantOnlyVariables);
    });

    it('should resolve a single variable value', async () => {
      const value = await resolveValue('var.api_version', {
        tenantId: 'tenant_123',
      });

      expect(value).toBe('v2');
    });

    it('should return undefined for missing variable', async () => {
      const value = await resolveValue('var.nonexistent', {
        tenantId: 'tenant_123',
      });

      expect(value).toBeUndefined();
    });

    it('should return default value for missing variable', async () => {
      const value = await resolveValue('var.nonexistent', {
        tenantId: 'tenant_123',
        defaultValue: 'fallback',
      });

      expect(value).toBe('fallback');
    });
  });

  describe('resolveTemplates', () => {
    beforeEach(() => {
      vi.mocked(getScopedVariables).mockResolvedValue(mockTenantOnlyVariables);
    });

    it('should resolve multiple templates efficiently', async () => {
      const results = await resolveTemplates(
        {
          url: '/api/${var.api_version}/users',
          header: 'X-Channel: ${var.default_channel}',
          plain: 'no variables',
        },
        { tenantId: 'tenant_123' }
      );

      expect(results.url.resolved).toBe('/api/v2/users');
      expect(results.header.resolved).toBe('X-Channel: C123456');
      expect(results.plain.resolved).toBe('no variables');
    });

    it('should call getScopedVariables only once', async () => {
      await resolveTemplates(
        {
          a: '${var.api_version}',
          b: '${var.default_channel}',
        },
        { tenantId: 'tenant_123' }
      );

      expect(getScopedVariables).toHaveBeenCalledTimes(1);
    });
  });

  describe('maskSensitiveValues', () => {
    it('should mask sensitive values in result', () => {
      const result: VariableResolutionResult = {
        resolved: 'API Key: secret_key_123',
        variables: [
          {
            reference: {
              fullMatch: '${var.api_key}',
              path: 'var.api_key',
              namespace: 'var',
              key: 'api_key',
              startIndex: 9,
              endIndex: 24,
            },
            value: 'secret_key_123',
            source: 'tenant_variable',
            found: true,
            sensitive: true,
          },
        ],
        allFound: true,
        missing: [],
      };

      const masked = maskSensitiveValues(result);

      expect(masked.resolved).toBe('API Key: [REDACTED]');
      expect(masked.variables[0].value).toBe('[REDACTED]');
    });

    it('should not mask non-sensitive values', () => {
      const result: VariableResolutionResult = {
        resolved: 'Version: v2',
        variables: [
          {
            reference: {
              fullMatch: '${var.api_version}',
              path: 'var.api_version',
              namespace: 'var',
              key: 'api_version',
              startIndex: 9,
              endIndex: 27,
            },
            value: 'v2',
            source: 'tenant_variable',
            found: true,
            sensitive: false,
          },
        ],
        allFound: true,
        missing: [],
      };

      const masked = maskSensitiveValues(result);

      expect(masked.resolved).toBe('Version: v2');
      expect(masked.variables[0].value).toBe('v2');
    });
  });

  describe('summarizeResolution', () => {
    it('should summarize resolution results', () => {
      const mockRef: ParsedVariableReference = {
        fullMatch: '${var.test}',
        path: 'var.test',
        namespace: 'var',
        key: 'test',
        startIndex: 0,
        endIndex: 11,
      };

      const result: VariableResolutionResult = {
        resolved: 'test',
        variables: [
          {
            reference: mockRef,
            value: 'v1',
            source: 'tenant_variable',
            found: true,
            sensitive: false,
          },
          {
            reference: mockRef,
            value: 'c1',
            source: 'connection_variable',
            found: true,
            sensitive: false,
          },
          {
            reference: mockRef,
            value: undefined,
            source: 'not_found',
            found: false,
            sensitive: false,
          },
        ],
        allFound: false,
        missing: [mockRef],
      };

      const summary = summarizeResolution(result);

      expect(summary.totalVariables).toBe(3);
      expect(summary.found).toBe(2);
      expect(summary.missing).toBe(1);
      expect(summary.bySources['tenant_variable']).toBe(1);
      expect(summary.bySources['connection_variable']).toBe(1);
      expect(summary.bySources['not_found']).toBe(1);
    });
  });

  describe('previewResolution', () => {
    it('should preview template resolution with mock values', () => {
      const result = previewResolution('/api/${var.version}/users/${var.id}', {
        'var.version': 'v3',
      });

      expect(result.preview).toBe('/api/v3/users/${var.id}');
      expect(result.references).toHaveLength(2);
      expect(result.unresolvedRefs).toContain('var.id');
      expect(result.unresolvedRefs).not.toContain('var.version');
    });

    it('should handle templates with no mock values', () => {
      const result = previewResolution('${var.a} ${var.b}', {});

      expect(result.preview).toBe('${var.a} ${var.b}');
      expect(result.unresolvedRefs).toEqual(['var.a', 'var.b']);
    });

    it('should handle templates with all values provided', () => {
      const result = previewResolution('${var.a} ${var.b}', {
        'var.a': '1',
        'var.b': '2',
      });

      expect(result.preview).toBe('1 2');
      expect(result.unresolvedRefs).toHaveLength(0);
    });
  });

  describe('VariableResolutionError', () => {
    it('should have correct name and message', () => {
      const error = new VariableResolutionError('Missing vars', []);

      expect(error.name).toBe('VariableResolutionError');
      expect(error.message).toBe('Missing vars');
    });

    it('should include missing references', () => {
      const refs = [
        {
          fullMatch: '${var.a}',
          path: 'var.a',
          namespace: 'var',
          key: 'a',
          startIndex: 0,
          endIndex: 8,
        },
      ];
      const error = new VariableResolutionError('Missing', refs);

      expect(error.missingReferences).toEqual(refs);
    });
  });
});
