import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  buildCurrentUserContext,
  buildConnectionContext,
  buildRequestContext,
  buildRuntimeContext,
  getContextValue,
  flattenRuntimeContext,
  getRuntimeContextPaths,
  validateRuntimeContext,
  getEnvironment,
  isEnvironment,
  ENVIRONMENTS,
} from '@/lib/modules/variables/runtime-context';

describe('Runtime Context', () => {
  describe('buildCurrentUserContext', () => {
    it('should build context from complete input', () => {
      const result = buildCurrentUserContext({
        id: 'user_123',
        email: 'john@example.com',
        name: 'John Doe',
      });

      expect(result.id).toBe('user_123');
      expect(result.email).toBe('john@example.com');
      expect(result.name).toBe('John Doe');
    });

    it('should handle partial input with null defaults', () => {
      const result = buildCurrentUserContext({ id: 'user_123' });

      expect(result.id).toBe('user_123');
      expect(result.email).toBeNull();
      expect(result.name).toBeNull();
    });

    it('should handle null input', () => {
      const result = buildCurrentUserContext(null);

      expect(result.id).toBeNull();
      expect(result.email).toBeNull();
      expect(result.name).toBeNull();
    });

    it('should handle undefined input', () => {
      const result = buildCurrentUserContext(undefined);

      expect(result.id).toBeNull();
      expect(result.email).toBeNull();
      expect(result.name).toBeNull();
    });
  });

  describe('buildConnectionContext', () => {
    it('should build context from complete input', () => {
      const result = buildConnectionContext({
        id: 'conn_123',
        name: 'My Slack Connection',
        workspaceId: 'T123456',
      });

      expect(result.id).toBe('conn_123');
      expect(result.name).toBe('My Slack Connection');
      expect(result.workspaceId).toBe('T123456');
    });

    it('should handle null workspaceId', () => {
      const result = buildConnectionContext({
        id: 'conn_123',
        name: 'Connection',
      });

      expect(result.workspaceId).toBeNull();
    });

    it('should extract workspaceId from metadata', () => {
      const result = buildConnectionContext({
        id: 'conn_123',
        name: 'Connection',
        metadata: { workspaceId: 'W123' },
      });

      expect(result.workspaceId).toBe('W123');
    });

    it('should extract teamId from metadata', () => {
      const result = buildConnectionContext({
        id: 'conn_123',
        name: 'Connection',
        metadata: { team_id: 'T456' },
      });

      expect(result.workspaceId).toBe('T456');
    });

    it('should prefer direct workspaceId over metadata', () => {
      const result = buildConnectionContext({
        id: 'conn_123',
        name: 'Connection',
        workspaceId: 'W_DIRECT',
        metadata: { workspaceId: 'W_META' },
      });

      expect(result.workspaceId).toBe('W_DIRECT');
    });

    it('should return empty context for null input', () => {
      const result = buildConnectionContext(null);

      expect(result.id).toBe('');
      expect(result.name).toBe('');
      expect(result.workspaceId).toBeNull();
    });
  });

  describe('buildRequestContext', () => {
    it('should generate id and timestamp when not provided', () => {
      const result = buildRequestContext();

      expect(result.id).toBeDefined();
      expect(result.id).toMatch(/^[0-9a-f-]{36}$/); // UUID format
      expect(result.timestamp).toBeDefined();
      expect(new Date(result.timestamp).toISOString()).toBe(result.timestamp);
    });

    it('should use provided values', () => {
      const result = buildRequestContext({
        id: 'custom_req_123',
        timestamp: '2024-01-01T00:00:00.000Z',
        environment: 'production',
      });

      expect(result.id).toBe('custom_req_123');
      expect(result.timestamp).toBe('2024-01-01T00:00:00.000Z');
      expect(result.environment).toBe('production');
    });

    it('should default environment to development', () => {
      const result = buildRequestContext();

      expect(result.environment).toBe('test'); // Set by vitest
    });
  });

  describe('buildRuntimeContext', () => {
    it('should build complete runtime context', () => {
      const result = buildRuntimeContext({
        currentUser: { id: 'user_123', name: 'John' },
        connection: { id: 'conn_456', name: 'Slack' },
        request: { id: 'req_789' },
      });

      expect(result.current_user.id).toBe('user_123');
      expect(result.connection.id).toBe('conn_456');
      expect(result.request.id).toBe('req_789');
    });

    it('should build context with defaults for missing input', () => {
      const result = buildRuntimeContext();

      expect(result.current_user.id).toBeNull();
      expect(result.connection.id).toBe('');
      expect(result.request.id).toBeDefined(); // Generated
    });
  });

  describe('getContextValue', () => {
    const context = buildRuntimeContext({
      currentUser: { id: 'user_123', email: 'john@example.com', name: 'John' },
      connection: { id: 'conn_456', name: 'Slack', workspaceId: 'W789' },
      request: { id: 'req_abc', timestamp: '2024-01-01T00:00:00.000Z', environment: 'production' },
    });

    it('should get current_user values', () => {
      expect(getContextValue(context, 'current_user', 'id')).toBe('user_123');
      expect(getContextValue(context, 'current_user', 'email')).toBe('john@example.com');
      expect(getContextValue(context, 'current_user', 'name')).toBe('John');
    });

    it('should get connection values', () => {
      expect(getContextValue(context, 'connection', 'id')).toBe('conn_456');
      expect(getContextValue(context, 'connection', 'name')).toBe('Slack');
      expect(getContextValue(context, 'connection', 'workspaceId')).toBe('W789');
    });

    it('should get request values', () => {
      expect(getContextValue(context, 'request', 'id')).toBe('req_abc');
      expect(getContextValue(context, 'request', 'timestamp')).toBe('2024-01-01T00:00:00.000Z');
      expect(getContextValue(context, 'request', 'environment')).toBe('production');
    });

    it('should return undefined for unknown namespace', () => {
      expect(getContextValue(context, 'unknown', 'id')).toBeUndefined();
    });

    it('should return undefined for unknown key', () => {
      expect(getContextValue(context, 'current_user', 'unknown')).toBeUndefined();
    });
  });

  describe('flattenRuntimeContext', () => {
    it('should flatten context to key-value map', () => {
      const context = buildRuntimeContext({
        currentUser: { id: 'user_123', email: 'john@example.com', name: 'John' },
        connection: { id: 'conn_456', name: 'Slack', workspaceId: 'W789' },
        request: { id: 'req_abc', timestamp: '2024-01-01T00:00:00.000Z', environment: 'prod' },
      });

      const flattened = flattenRuntimeContext(context);

      expect(flattened['current_user.id']).toBe('user_123');
      expect(flattened['current_user.email']).toBe('john@example.com');
      expect(flattened['current_user.name']).toBe('John');
      expect(flattened['connection.id']).toBe('conn_456');
      expect(flattened['connection.name']).toBe('Slack');
      expect(flattened['connection.workspaceId']).toBe('W789');
      expect(flattened['request.id']).toBe('req_abc');
      expect(flattened['request.timestamp']).toBe('2024-01-01T00:00:00.000Z');
      expect(flattened['request.environment']).toBe('prod');
    });
  });

  describe('getRuntimeContextPaths', () => {
    it('should return all runtime context paths', () => {
      const paths = getRuntimeContextPaths();

      expect(paths).toContain('current_user.id');
      expect(paths).toContain('current_user.email');
      expect(paths).toContain('current_user.name');
      expect(paths).toContain('connection.id');
      expect(paths).toContain('connection.name');
      expect(paths).toContain('connection.workspaceId');
      expect(paths).toContain('request.id');
      expect(paths).toContain('request.timestamp');
      expect(paths).toContain('request.environment');
      expect(paths).toHaveLength(9);
    });
  });

  describe('validateRuntimeContext', () => {
    it('should return valid for complete context', () => {
      const context = buildRuntimeContext({
        request: { id: 'req_123', timestamp: '2024-01-01T00:00:00.000Z', environment: 'prod' },
      });

      const result = validateRuntimeContext(context);

      expect(result.valid).toBe(true);
      expect(result.missing).toHaveLength(0);
    });

    it('should report missing request fields', () => {
      const context = {
        current_user: { id: null, email: null, name: null },
        connection: { id: '', name: '', workspaceId: null },
        request: { id: '', timestamp: '', environment: '' },
      };

      const result = validateRuntimeContext(context);

      expect(result.valid).toBe(false);
      expect(result.missing).toContain('request.id');
      expect(result.missing).toContain('request.timestamp');
      expect(result.missing).toContain('request.environment');
    });
  });

  describe('getEnvironment', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      vi.resetModules();
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should return NODE_ENV when set', () => {
      // NODE_ENV is already 'test' in vitest
      expect(getEnvironment()).toBe('test');
    });

    it('should return WAYGATE_ENVIRONMENT when set', () => {
      process.env.WAYGATE_ENVIRONMENT = 'production';
      expect(getEnvironment()).toBe('production');
    });

    it('should prioritize WAYGATE_ENVIRONMENT over NODE_ENV', () => {
      // Note: NODE_ENV is read-only in test environment
      // We test WAYGATE_ENVIRONMENT override which is the primary use case
      process.env.WAYGATE_ENVIRONMENT = 'staging';
      expect(getEnvironment()).toBe('staging');
    });
  });

  describe('isEnvironment', () => {
    it('should return true when environment matches', () => {
      // In test environment
      expect(isEnvironment('test')).toBe(true);
    });

    it('should return false when environment does not match', () => {
      expect(isEnvironment('production')).toBe(false);
    });
  });

  describe('ENVIRONMENTS', () => {
    it('should contain standard environment values', () => {
      expect(ENVIRONMENTS.DEVELOPMENT).toBe('development');
      expect(ENVIRONMENTS.STAGING).toBe('staging');
      expect(ENVIRONMENTS.PRODUCTION).toBe('production');
    });
  });
});
