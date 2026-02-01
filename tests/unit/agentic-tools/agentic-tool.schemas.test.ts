/**
 * Agentic Tool Schemas Unit Tests
 *
 * Tests for Zod schemas used in agentic tool validation.
 * Covers input validation, response formatting, and error handling.
 */

import { describe, it, expect } from 'vitest';
import {
  AgenticToolExecutionModeSchema,
  AgenticToolStatusSchema,
  AgenticToolExecutionStatusSchema,
  LLMProviderSchema,
  ReasoningLevelSchema,
  EmbeddedLLMConfigSchema,
  TargetActionSchema,
  AvailableToolSchema,
  ToolAllocationSchema,
  ContextVariableSchema,
  ContextConfigSchema,
  SafetyLimitsSchema,
  CreateAgenticToolInputSchema,
  UpdateAgenticToolInputSchema,
  ListAgenticToolsQuerySchema,
  toAgenticToolResponse,
  toAgenticToolExecutionResponse,
  AgenticToolErrorCodes,
} from '@/lib/modules/agentic-tools/agentic-tool.schemas';

// Valid UUIDs for testing (v4 format)
const VALID_UUID_1 = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
const VALID_UUID_2 = 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e';
const VALID_UUID_3 = 'c3d4e5f6-a7b8-4c9d-0e1f-2a3b4c5d6e7f';

// =============================================================================
// Enum Schema Tests
// =============================================================================

describe('AgenticToolExecutionModeSchema', () => {
  it('should accept valid execution modes', () => {
    expect(AgenticToolExecutionModeSchema.parse('parameter_interpreter')).toBe(
      'parameter_interpreter'
    );
    expect(AgenticToolExecutionModeSchema.parse('autonomous_agent')).toBe('autonomous_agent');
  });

  it('should reject invalid execution modes', () => {
    expect(() => AgenticToolExecutionModeSchema.parse('invalid')).toThrow();
    expect(() => AgenticToolExecutionModeSchema.parse('sequential')).toThrow();
  });
});

describe('AgenticToolStatusSchema', () => {
  it('should accept valid statuses', () => {
    expect(AgenticToolStatusSchema.parse('draft')).toBe('draft');
    expect(AgenticToolStatusSchema.parse('active')).toBe('active');
    expect(AgenticToolStatusSchema.parse('disabled')).toBe('disabled');
  });

  it('should reject invalid statuses', () => {
    expect(() => AgenticToolStatusSchema.parse('invalid')).toThrow();
    expect(() => AgenticToolStatusSchema.parse('pending')).toThrow();
  });
});

describe('AgenticToolExecutionStatusSchema', () => {
  it('should accept valid execution statuses', () => {
    expect(AgenticToolExecutionStatusSchema.parse('success')).toBe('success');
    expect(AgenticToolExecutionStatusSchema.parse('error')).toBe('error');
    expect(AgenticToolExecutionStatusSchema.parse('timeout')).toBe('timeout');
  });

  it('should reject invalid execution statuses', () => {
    expect(() => AgenticToolExecutionStatusSchema.parse('pending')).toThrow();
    expect(() => AgenticToolExecutionStatusSchema.parse('running')).toThrow();
  });
});

describe('LLMProviderSchema', () => {
  it('should accept valid LLM providers', () => {
    expect(LLMProviderSchema.parse('anthropic')).toBe('anthropic');
    expect(LLMProviderSchema.parse('google')).toBe('google');
  });

  it('should reject invalid providers', () => {
    expect(() => LLMProviderSchema.parse('openai')).toThrow();
    expect(() => LLMProviderSchema.parse('invalid')).toThrow();
  });
});

describe('ReasoningLevelSchema', () => {
  it('should accept valid reasoning levels', () => {
    expect(ReasoningLevelSchema.parse('none')).toBe('none');
    expect(ReasoningLevelSchema.parse('low')).toBe('low');
    expect(ReasoningLevelSchema.parse('medium')).toBe('medium');
    expect(ReasoningLevelSchema.parse('high')).toBe('high');
  });

  it('should reject invalid reasoning levels', () => {
    expect(() => ReasoningLevelSchema.parse('extreme')).toThrow();
    expect(() => ReasoningLevelSchema.parse('invalid')).toThrow();
  });
});

// =============================================================================
// Embedded LLM Configuration Tests
// =============================================================================

describe('EmbeddedLLMConfigSchema', () => {
  it('should accept valid configuration', () => {
    const config = {
      provider: 'anthropic' as const,
      model: 'claude-sonnet-4.5',
      reasoningLevel: 'medium' as const,
      temperature: 0.5,
      maxTokens: 4000,
      topP: 0.9,
    };

    const parsed = EmbeddedLLMConfigSchema.parse(config);
    expect(parsed).toEqual(config);
  });

  it('should apply default values', () => {
    const config = {
      provider: 'anthropic' as const,
      model: 'claude-opus-4.5',
    };

    const parsed = EmbeddedLLMConfigSchema.parse(config);
    expect(parsed.temperature).toBe(0.2);
    expect(parsed.maxTokens).toBe(4000);
  });

  it('should reject temperature out of range', () => {
    const config = {
      provider: 'anthropic' as const,
      model: 'claude-sonnet-4.5',
      temperature: 1.5,
    };

    expect(() => EmbeddedLLMConfigSchema.parse(config)).toThrow();
  });

  it('should reject maxTokens out of range', () => {
    const config = {
      provider: 'anthropic' as const,
      model: 'claude-sonnet-4.5',
      maxTokens: 500, // Below min of 1000
    };

    expect(() => EmbeddedLLMConfigSchema.parse(config)).toThrow();
  });

  it('should reject missing required fields', () => {
    expect(() => EmbeddedLLMConfigSchema.parse({ provider: 'anthropic' })).toThrow();
    expect(() => EmbeddedLLMConfigSchema.parse({ model: 'claude-opus-4.5' })).toThrow();
  });
});

// =============================================================================
// Tool Allocation Tests
// =============================================================================

describe('TargetActionSchema', () => {
  it('should accept valid target action', () => {
    const action = {
      actionId: VALID_UUID_1,
      actionSlug: 'postgres-execute-query',
    };

    const parsed = TargetActionSchema.parse(action);
    expect(parsed).toEqual(action);
  });

  it('should reject invalid UUID', () => {
    const action = {
      actionId: 'not-a-uuid',
      actionSlug: 'postgres-execute-query',
    };

    expect(() => TargetActionSchema.parse(action)).toThrow();
  });
});

describe('AvailableToolSchema', () => {
  it('should accept valid available tool', () => {
    const tool = {
      actionId: VALID_UUID_1,
      actionSlug: 'google-search',
      description: 'Search the web using Google',
    };

    const parsed = AvailableToolSchema.parse(tool);
    expect(parsed).toEqual(tool);
  });

  it('should reject missing description', () => {
    const tool = {
      actionId: VALID_UUID_1,
      actionSlug: 'google-search',
    };

    expect(() => AvailableToolSchema.parse(tool)).toThrow();
  });
});

describe('ToolAllocationSchema', () => {
  it('should accept parameter_interpreter mode', () => {
    const allocation = {
      mode: 'parameter_interpreter' as const,
      targetActions: [
        {
          actionId: VALID_UUID_1,
          actionSlug: 'postgres-execute-query',
        },
      ],
    };

    const parsed = ToolAllocationSchema.parse(allocation);
    expect(parsed).toEqual(allocation);
  });

  it('should accept autonomous_agent mode', () => {
    const allocation = {
      mode: 'autonomous_agent' as const,
      availableTools: [
        {
          actionId: VALID_UUID_1,
          actionSlug: 'google-search',
          description: 'Search the web',
        },
      ],
    };

    const parsed = ToolAllocationSchema.parse(allocation);
    expect(parsed).toEqual(allocation);
  });

  it('should require at least one target action for parameter_interpreter', () => {
    const allocation = {
      mode: 'parameter_interpreter' as const,
      targetActions: [],
    };

    expect(() => ToolAllocationSchema.parse(allocation)).toThrow();
  });

  it('should require at least one available tool for autonomous_agent', () => {
    const allocation = {
      mode: 'autonomous_agent' as const,
      availableTools: [],
    };

    expect(() => ToolAllocationSchema.parse(allocation)).toThrow();
  });

  it('should reject mismatched mode and fields', () => {
    const allocation = {
      mode: 'parameter_interpreter' as const,
      availableTools: [
        {
          actionId: VALID_UUID_1,
          actionSlug: 'google-search',
          description: 'Search the web',
        },
      ],
    };

    expect(() => ToolAllocationSchema.parse(allocation)).toThrow();
  });
});

// =============================================================================
// Context Configuration Tests
// =============================================================================

describe('ContextVariableSchema', () => {
  it('should accept integration_schema type', () => {
    const variable = {
      type: 'integration_schema' as const,
      source: VALID_UUID_1,
    };

    const parsed = ContextVariableSchema.parse(variable);
    expect(parsed).toEqual(variable);
  });

  it('should accept reference_data type', () => {
    const variable = {
      type: 'reference_data' as const,
      source: 'users',
    };

    const parsed = ContextVariableSchema.parse(variable);
    expect(parsed).toEqual(variable);
  });

  it('should accept custom type', () => {
    const variable = {
      type: 'custom' as const,
      value: 'Custom context value',
    };

    const parsed = ContextVariableSchema.parse(variable);
    expect(parsed).toEqual(variable);
  });

  it('should reject invalid type', () => {
    const variable = {
      type: 'invalid',
    };

    expect(() => ContextVariableSchema.parse(variable)).toThrow();
  });
});

describe('ContextConfigSchema', () => {
  it('should accept valid context config', () => {
    const config = {
      variables: {
        database_schema: {
          type: 'integration_schema' as const,
          source: VALID_UUID_1,
        },
        custom_note: {
          type: 'custom' as const,
          value: 'This is a note',
        },
      },
      autoInjectSchemas: true,
    };

    const parsed = ContextConfigSchema.parse(config);
    expect(parsed).toEqual(config);
  });

  it('should apply defaults', () => {
    const config = {};

    const parsed = ContextConfigSchema.parse(config);
    expect(parsed.variables).toEqual({});
    expect(parsed.autoInjectSchemas).toBe(true);
  });
});

// =============================================================================
// Safety Limits Tests
// =============================================================================

describe('SafetyLimitsSchema', () => {
  it('should accept valid safety limits', () => {
    const limits = {
      maxToolCalls: 5,
      timeoutSeconds: 120,
      maxTotalCost: 0.5,
    };

    const parsed = SafetyLimitsSchema.parse(limits);
    expect(parsed).toEqual(limits);
  });

  it('should apply defaults', () => {
    const limits = {};

    const parsed = SafetyLimitsSchema.parse(limits);
    expect(parsed.maxToolCalls).toBe(10);
    expect(parsed.timeoutSeconds).toBe(300);
    expect(parsed.maxTotalCost).toBe(1.0);
  });

  it('should reject maxToolCalls out of range', () => {
    expect(() => SafetyLimitsSchema.parse({ maxToolCalls: 0 })).toThrow();
    expect(() => SafetyLimitsSchema.parse({ maxToolCalls: 150 })).toThrow();
  });

  it('should reject timeoutSeconds out of range', () => {
    expect(() => SafetyLimitsSchema.parse({ timeoutSeconds: 10 })).toThrow();
    expect(() => SafetyLimitsSchema.parse({ timeoutSeconds: 700 })).toThrow();
  });

  it('should reject maxTotalCost out of range', () => {
    expect(() => SafetyLimitsSchema.parse({ maxTotalCost: 0.001 })).toThrow();
    expect(() => SafetyLimitsSchema.parse({ maxTotalCost: 15 })).toThrow();
  });
});

// =============================================================================
// CRUD Schema Tests
// =============================================================================

describe('CreateAgenticToolInputSchema', () => {
  const validInput = {
    name: 'Database Manager',
    slug: 'database-manager',
    description: 'Manages database queries',
    executionMode: 'parameter_interpreter' as const,
    embeddedLLMConfig: {
      provider: 'anthropic' as const,
      model: 'claude-sonnet-4.5',
      temperature: 0.1,
      maxTokens: 4000,
    },
    systemPrompt: 'You are a database assistant...',
    toolAllocation: {
      mode: 'parameter_interpreter' as const,
      targetActions: [
        {
          actionId: VALID_UUID_1,
          actionSlug: 'postgres-execute-query',
        },
      ],
    },
  };

  it('should accept valid create input', () => {
    const parsed = CreateAgenticToolInputSchema.parse(validInput);
    expect(parsed.name).toBe('Database Manager');
    expect(parsed.slug).toBe('database-manager');
  });

  it('should apply default values', () => {
    const parsed = CreateAgenticToolInputSchema.parse(validInput);
    expect(parsed.status).toBe('draft');
    expect(parsed.metadata).toEqual({});
    expect(parsed.inputSchema).toEqual({});
  });

  it('should reject invalid slug format', () => {
    const input = { ...validInput, slug: 'Database Manager' }; // Spaces not allowed
    expect(() => CreateAgenticToolInputSchema.parse(input)).toThrow();
  });

  it('should reject slug with uppercase', () => {
    const input = { ...validInput, slug: 'Database-Manager' };
    expect(() => CreateAgenticToolInputSchema.parse(input)).toThrow();
  });

  it('should reject short system prompt', () => {
    const input = { ...validInput, systemPrompt: 'short' };
    expect(() => CreateAgenticToolInputSchema.parse(input)).toThrow();
  });

  it('should reject empty name', () => {
    const input = { ...validInput, name: '' };
    expect(() => CreateAgenticToolInputSchema.parse(input)).toThrow();
  });

  it('should reject name exceeding max length', () => {
    const input = { ...validInput, name: 'a'.repeat(300) };
    expect(() => CreateAgenticToolInputSchema.parse(input)).toThrow();
  });
});

describe('UpdateAgenticToolInputSchema', () => {
  it('should accept partial update', () => {
    const update = {
      name: 'Updated Name',
      status: 'active' as const,
    };

    const parsed = UpdateAgenticToolInputSchema.parse(update);
    expect(parsed.name).toBe('Updated Name');
    expect(parsed.status).toBe('active');
  });

  it('should allow nullable description', () => {
    const update = {
      description: null,
    };

    const parsed = UpdateAgenticToolInputSchema.parse(update);
    expect(parsed.description).toBeNull();
  });

  it('should accept empty object', () => {
    const update = {};
    const parsed = UpdateAgenticToolInputSchema.parse(update);
    expect(parsed).toEqual({});
  });

  it('should reject invalid fields', () => {
    const update = {
      slug: 'Invalid Slug', // Invalid format
    };

    expect(() => UpdateAgenticToolInputSchema.parse(update)).toThrow();
  });
});

// =============================================================================
// Query Schema Tests
// =============================================================================

describe('ListAgenticToolsQuerySchema', () => {
  it('should accept valid query parameters', () => {
    const query = {
      cursor: 'cursor-123',
      limit: 50,
      status: 'active' as const,
      executionMode: 'parameter_interpreter' as const,
      search: 'database',
    };

    const parsed = ListAgenticToolsQuerySchema.parse(query);
    expect(parsed).toEqual(query);
  });

  it('should apply defaults', () => {
    const query = {};
    const parsed = ListAgenticToolsQuerySchema.parse(query);
    expect(parsed.limit).toBe(20);
  });

  it('should coerce limit to number', () => {
    const query = { limit: '30' };
    const parsed = ListAgenticToolsQuerySchema.parse(query);
    expect(parsed.limit).toBe(30);
  });

  it('should reject limit out of range', () => {
    expect(() => ListAgenticToolsQuerySchema.parse({ limit: 0 })).toThrow();
    expect(() => ListAgenticToolsQuerySchema.parse({ limit: 150 })).toThrow();
  });
});

// =============================================================================
// Response Formatter Tests
// =============================================================================

describe('toAgenticToolResponse', () => {
  it('should convert database model to API response', () => {
    const dbTool = {
      id: VALID_UUID_1,
      tenantId: VALID_UUID_2,
      name: 'Database Manager',
      slug: 'database-manager',
      description: 'Manages database queries',
      executionMode: 'parameter_interpreter',
      embeddedLLMConfig: {
        provider: 'anthropic',
        model: 'claude-sonnet-4.5',
        temperature: 0.1,
        maxTokens: 4000,
      },
      systemPrompt: 'You are a database assistant',
      toolAllocation: {
        mode: 'parameter_interpreter',
        targetActions: [],
      },
      contextConfig: {
        variables: {},
        autoInjectSchemas: true,
      },
      inputSchema: {},
      toolDescription: 'Database tool',
      safetyLimits: {
        maxToolCalls: 10,
        timeoutSeconds: 300,
        maxTotalCost: 1.0,
      },
      status: 'active',
      metadata: {},
      createdAt: new Date('2024-01-01T00:00:00Z'),
      updatedAt: new Date('2024-01-02T00:00:00Z'),
    };

    const response = toAgenticToolResponse(dbTool);

    expect(response.id).toBe(VALID_UUID_1);
    expect(response.name).toBe('Database Manager');
    expect(response.createdAt).toBe('2024-01-01T00:00:00.000Z');
    expect(response.updatedAt).toBe('2024-01-02T00:00:00.000Z');
  });

  it('should handle null description', () => {
    const dbTool = {
      id: VALID_UUID_1,
      tenantId: VALID_UUID_2,
      name: 'Tool',
      slug: 'tool',
      description: null,
      executionMode: 'parameter_interpreter',
      embeddedLLMConfig: {},
      systemPrompt: 'Prompt',
      toolAllocation: {},
      contextConfig: {},
      inputSchema: {},
      toolDescription: null,
      safetyLimits: {},
      status: 'draft',
      metadata: {},
      createdAt: new Date('2024-01-01T00:00:00Z'),
      updatedAt: new Date('2024-01-02T00:00:00Z'),
    };

    const response = toAgenticToolResponse(dbTool);
    expect(response.description).toBeNull();
    expect(response.toolDescription).toBeNull();
  });
});

describe('toAgenticToolExecutionResponse', () => {
  it('should convert database execution to API response', () => {
    const dbExecution = {
      id: VALID_UUID_1,
      agenticToolId: VALID_UUID_2,
      tenantId: VALID_UUID_3,
      parentRequest: { task: 'Find users' },
      llmCalls: [{ prompt: 'System prompt', response: 'Query' }],
      toolCalls: [],
      result: { affected_rows: 23 },
      status: 'success',
      error: null,
      totalCost: 0.002,
      totalTokens: 456,
      durationMs: 1200,
      traceId: 'trace-123',
      createdAt: new Date('2024-01-01T00:00:00Z'),
      completedAt: new Date('2024-01-01T00:00:05Z'),
    };

    const response = toAgenticToolExecutionResponse(dbExecution);

    expect(response.id).toBe(VALID_UUID_1);
    expect(response.status).toBe('success');
    expect(response.totalCost).toBe(0.002);
    expect(response.totalTokens).toBe(456);
    expect(response.createdAt).toBe('2024-01-01T00:00:00.000Z');
    expect(response.completedAt).toBe('2024-01-01T00:00:05.000Z');
  });

  it('should handle null completedAt', () => {
    const dbExecution = {
      id: VALID_UUID_1,
      agenticToolId: VALID_UUID_2,
      tenantId: VALID_UUID_3,
      parentRequest: {},
      llmCalls: [],
      toolCalls: [],
      result: null,
      status: 'error',
      error: { code: 'TIMEOUT' },
      totalCost: 0,
      totalTokens: 0,
      durationMs: 5000,
      traceId: null,
      createdAt: new Date('2024-01-01T00:00:00Z'),
      completedAt: null,
    };

    const response = toAgenticToolExecutionResponse(dbExecution);
    expect(response.completedAt).toBeNull();
    expect(response.traceId).toBeNull();
  });
});

// =============================================================================
// Error Codes Tests
// =============================================================================

describe('AgenticToolErrorCodes', () => {
  it('should have all expected error codes', () => {
    expect(AgenticToolErrorCodes.AGENTIC_TOOL_NOT_FOUND).toBe('AGENTIC_TOOL_NOT_FOUND');
    expect(AgenticToolErrorCodes.DUPLICATE_SLUG).toBe('DUPLICATE_SLUG');
    expect(AgenticToolErrorCodes.INVALID_INPUT).toBe('INVALID_INPUT');
    expect(AgenticToolErrorCodes.AGENTIC_TOOL_DISABLED).toBe('AGENTIC_TOOL_DISABLED');
    expect(AgenticToolErrorCodes.SAFETY_LIMIT_EXCEEDED).toBe('SAFETY_LIMIT_EXCEEDED');
    expect(AgenticToolErrorCodes.LLM_PROVIDER_ERROR).toBe('LLM_PROVIDER_ERROR');
    expect(AgenticToolErrorCodes.TIMEOUT).toBe('TIMEOUT');
  });
});
