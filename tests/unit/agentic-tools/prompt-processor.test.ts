/**
 * Prompt Processor Unit Tests
 *
 * Tests for prompt variable replacement and context building.
 * Validates template processing, variable extraction, and formatting.
 */

import { describe, it, expect } from 'vitest';
import {
  processPrompt,
  buildPromptContext,
  validatePromptVariables,
  extractVariableNames,
  type PromptContext,
} from '@/lib/modules/agentic-tools/llm/prompt-processor';
import type { ContextConfig } from '@/lib/modules/agentic-tools/agentic-tool.schemas';

// =============================================================================
// processPrompt Tests
// =============================================================================

describe('processPrompt', () => {
  it('should replace single variable', () => {
    const systemPrompt = 'Hello, {{name}}!';
    const context: PromptContext = { name: 'Alice' };

    const result = processPrompt(systemPrompt, context);

    expect(result.processedPrompt).toBe('Hello, Alice!');
    expect(result.replacedVariables).toEqual(['name']);
    expect(result.missingVariables).toEqual([]);
  });

  it('should replace multiple variables', () => {
    const systemPrompt = '{{greeting}}, {{name}}! You are {{age}} years old.';
    const context: PromptContext = {
      greeting: 'Hello',
      name: 'Bob',
      age: '25',
    };

    const result = processPrompt(systemPrompt, context);

    expect(result.processedPrompt).toBe('Hello, Bob! You are 25 years old.');
    expect(result.replacedVariables).toContain('greeting');
    expect(result.replacedVariables).toContain('name');
    expect(result.replacedVariables).toContain('age');
    expect(result.missingVariables).toEqual([]);
  });

  it('should handle missing variables', () => {
    const systemPrompt = 'Hello, {{name}}! Your role is {{role}}.';
    const context: PromptContext = { name: 'Alice' };

    const result = processPrompt(systemPrompt, context);

    expect(result.processedPrompt).toBe('Hello, Alice! Your role is .');
    expect(result.replacedVariables).toEqual(['name']);
    expect(result.missingVariables).toEqual(['role']);
  });

  it('should handle prompt with no variables', () => {
    const systemPrompt = 'This is a static prompt with no variables.';
    const context: PromptContext = {};

    const result = processPrompt(systemPrompt, context);

    expect(result.processedPrompt).toBe(systemPrompt);
    expect(result.replacedVariables).toEqual([]);
    expect(result.missingVariables).toEqual([]);
  });

  it('should replace duplicate variables only once in result arrays', () => {
    const systemPrompt = '{{name}} and {{name}} are {{name}}.';
    const context: PromptContext = { name: 'Alice' };

    const result = processPrompt(systemPrompt, context);

    expect(result.processedPrompt).toBe('Alice and Alice are Alice.');
    expect(result.replacedVariables).toEqual(['name']); // Deduplicated
  });

  it('should handle underscore and camelCase variable names', () => {
    const systemPrompt = '{{user_input}} - {{integrationSchema}} - {{database_schema_v2}}';
    const context: PromptContext = {
      user_input: 'Find users',
      integrationSchema: 'Schema here',
      database_schema_v2: 'DB v2',
    };

    const result = processPrompt(systemPrompt, context);

    expect(result.processedPrompt).toBe('Find users - Schema here - DB v2');
    expect(result.replacedVariables.length).toBe(3);
  });

  it('should not replace partial matches', () => {
    const systemPrompt = 'Value: {{value}}, not {{values}}';
    const context: PromptContext = { value: '42' };

    const result = processPrompt(systemPrompt, context);

    expect(result.processedPrompt).toBe('Value: 42, not ');
    expect(result.replacedVariables).toEqual(['value']);
    expect(result.missingVariables).toEqual(['values']);
  });

  it('should handle multiline prompts', () => {
    const systemPrompt = `You are a {{role}}.

# User Request:
{{user_input}}

# Schema:
{{database_schema}}`;

    const context: PromptContext = {
      role: 'database assistant',
      user_input: 'Find active users',
      database_schema: 'users(id, name, status)',
    };

    const result = processPrompt(systemPrompt, context);

    expect(result.processedPrompt).toContain('You are a database assistant.');
    expect(result.processedPrompt).toContain('Find active users');
    expect(result.processedPrompt).toContain('users(id, name, status)');
    expect(result.replacedVariables.length).toBe(3);
  });

  it('should handle empty string values', () => {
    const systemPrompt = 'Name: {{name}}, Role: {{role}}';
    const context: PromptContext = { name: '', role: 'admin' };

    const result = processPrompt(systemPrompt, context);

    expect(result.processedPrompt).toBe('Name: , Role: admin');
    expect(result.replacedVariables).toContain('name');
    expect(result.replacedVariables).toContain('role');
  });

  it('should replace variables with JSON strings', () => {
    const systemPrompt = 'Config: {{config}}';
    const config = JSON.stringify({ key: 'value', nested: { foo: 'bar' } });
    const context: PromptContext = { config };

    const result = processPrompt(systemPrompt, context);

    expect(result.processedPrompt).toContain(config);
    expect(result.replacedVariables).toEqual(['config']);
  });

  it('should handle variables with special characters in values', () => {
    const systemPrompt = 'Query: {{query}}';
    const context: PromptContext = {
      query: 'SELECT * FROM users WHERE email LIKE "%@example.com"',
    };

    const result = processPrompt(systemPrompt, context);

    expect(result.processedPrompt).toContain('SELECT * FROM users');
    expect(result.replacedVariables).toEqual(['query']);
  });
});

// =============================================================================
// buildPromptContext Tests
// =============================================================================

describe('buildPromptContext', () => {
  it('should build context with user input only', () => {
    const context = buildPromptContext(undefined, {
      userInput: 'Find all users',
    });

    expect(context.userInput).toBe('Find all users');
  });

  it('should build context with available tools', () => {
    const tools = [
      { name: 'google_search', description: 'Search the web' },
      { name: 'scrape_url', description: 'Scrape a webpage' },
    ];

    const context = buildPromptContext(undefined, { availableTools: tools });

    expect(context.availableTools).toContain('1. google_search: Search the web');
    expect(context.availableTools).toContain('2. scrape_url: Scrape a webpage');
  });

  it('should build context with integration schemas', () => {
    const contextConfig: ContextConfig = {
      variables: {
        database_schema: {
          type: 'integration_schema',
          source: 'postgres-integration',
        },
      },
      autoInjectSchemas: true,
    };

    const runtimeContext = {
      integrationSchemas: {
        'postgres-integration': 'users(id, name, email)',
      },
    };

    const context = buildPromptContext(contextConfig, runtimeContext);

    expect(context.database_schema).toBe('users(id, name, email)');
  });

  it('should build context with reference data', () => {
    const contextConfig: ContextConfig = {
      variables: {
        valid_statuses: {
          type: 'reference_data',
          source: 'user_statuses',
        },
      },
      autoInjectSchemas: true,
    };

    const runtimeContext = {
      referenceData: {
        user_statuses: 'active, inactive, pending',
      },
    };

    const context = buildPromptContext(contextConfig, runtimeContext);

    expect(context.valid_statuses).toBe('active, inactive, pending');
  });

  it('should build context with custom variables', () => {
    const contextConfig: ContextConfig = {
      variables: {
        custom_instruction: {
          type: 'custom',
          value: 'Always use transactions',
        },
      },
      autoInjectSchemas: true,
    };

    const context = buildPromptContext(contextConfig, {});

    expect(context.custom_instruction).toBe('Always use transactions');
  });

  it('should combine all context types', () => {
    const contextConfig: ContextConfig = {
      variables: {
        schema: {
          type: 'integration_schema',
          source: 'db',
        },
        statuses: {
          type: 'reference_data',
          source: 'status_list',
        },
        note: {
          type: 'custom',
          value: 'Be careful',
        },
      },
      autoInjectSchemas: true,
    };

    const runtimeContext = {
      userInput: 'Find users',
      integrationSchemas: { db: 'users(id)' },
      referenceData: { status_list: 'active,inactive' },
    };

    const context = buildPromptContext(contextConfig, runtimeContext);

    expect(context.userInput).toBe('Find users');
    expect(context.schema).toBe('users(id)');
    expect(context.statuses).toBe('active,inactive');
    expect(context.note).toBe('Be careful');
  });

  it('should create database_schema alias for integration_schema', () => {
    const contextConfig: ContextConfig = {
      variables: {
        integration_schema: {
          type: 'integration_schema',
          source: 'db',
        },
      },
      autoInjectSchemas: true,
    };

    const runtimeContext = {
      integrationSchemas: { db: 'schema content' },
    };

    const context = buildPromptContext(contextConfig, runtimeContext);

    expect(context.integration_schema).toBe('schema content');
    expect(context.databaseSchema).toBe('schema content');
  });

  it('should handle missing integration schemas gracefully', () => {
    const contextConfig: ContextConfig = {
      variables: {
        schema: {
          type: 'integration_schema',
          source: 'missing-source',
        },
      },
      autoInjectSchemas: true,
    };

    const context = buildPromptContext(contextConfig, {
      integrationSchemas: {},
    });

    expect(context.schema).toBeUndefined();
  });

  it('should handle empty available tools array', () => {
    const context = buildPromptContext(undefined, { availableTools: [] });

    expect(context.availableTools).toBeUndefined();
  });

  it('should handle undefined contextConfig', () => {
    const context = buildPromptContext(undefined, { userInput: 'Test' });

    expect(context.userInput).toBe('Test');
    expect(Object.keys(context).length).toBe(1);
  });
});

// =============================================================================
// validatePromptVariables Tests
// =============================================================================

describe('validatePromptVariables', () => {
  it('should return empty array when all variables present', () => {
    const systemPrompt = 'Hello {{name}}, you are {{age}} years old.';
    const context: PromptContext = { name: 'Alice', age: '25' };

    const missing = validatePromptVariables(systemPrompt, context);

    expect(missing).toEqual([]);
  });

  it('should return missing variable names', () => {
    const systemPrompt = 'User: {{user_input}}, Schema: {{database_schema}}';
    const context: PromptContext = { user_input: 'Find users' };

    const missing = validatePromptVariables(systemPrompt, context);

    expect(missing).toEqual(['database_schema']);
  });

  it('should return multiple missing variables', () => {
    const systemPrompt = 'A: {{a}}, B: {{b}}, C: {{c}}';
    const context: PromptContext = { a: 'A' };

    const missing = validatePromptVariables(systemPrompt, context);

    expect(missing).toContain('b');
    expect(missing).toContain('c');
    expect(missing.length).toBe(2);
  });

  it('should return empty array for prompt with no variables', () => {
    const systemPrompt = 'Static prompt with no variables';
    const context: PromptContext = {};

    const missing = validatePromptVariables(systemPrompt, context);

    expect(missing).toEqual([]);
  });

  it('should deduplicate missing variables', () => {
    const systemPrompt = '{{name}} {{name}} {{role}}';
    const context: PromptContext = {};

    const missing = validatePromptVariables(systemPrompt, context);

    expect(missing).toEqual(['name', 'role']);
  });
});

// =============================================================================
// extractVariableNames Tests
// =============================================================================

describe('extractVariableNames', () => {
  it('should extract single variable', () => {
    const systemPrompt = 'Hello {{name}}!';
    const variables = extractVariableNames(systemPrompt);

    expect(variables).toEqual(['name']);
  });

  it('should extract multiple variables', () => {
    const systemPrompt = '{{greeting}} {{name}}, you are {{age}} years old.';
    const variables = extractVariableNames(systemPrompt);

    expect(variables).toContain('greeting');
    expect(variables).toContain('name');
    expect(variables).toContain('age');
    expect(variables.length).toBe(3);
  });

  it('should extract variables from multiline prompts', () => {
    const systemPrompt = `# User Input:
{{user_input}}

# Database Schema:
{{database_schema}}

# Reference Data:
{{reference_data}}`;

    const variables = extractVariableNames(systemPrompt);

    expect(variables).toContain('user_input');
    expect(variables).toContain('database_schema');
    expect(variables).toContain('reference_data');
  });

  it('should return empty array for prompt with no variables', () => {
    const systemPrompt = 'This prompt has no variables.';
    const variables = extractVariableNames(systemPrompt);

    expect(variables).toEqual([]);
  });

  it('should deduplicate variable names', () => {
    const systemPrompt = '{{name}} and {{name}} are {{name}}';
    const variables = extractVariableNames(systemPrompt);

    expect(variables).toEqual(['name']);
  });

  it('should extract underscore and camelCase variables', () => {
    const systemPrompt = '{{user_input}} {{integrationSchema}} {{database_schema_v2}}';
    const variables = extractVariableNames(systemPrompt);

    expect(variables).toContain('user_input');
    expect(variables).toContain('integrationSchema');
    expect(variables).toContain('database_schema_v2');
  });

  it('should not extract invalid variable names', () => {
    const systemPrompt = '{{123invalid}} {{-invalid}} {{valid_name}}';
    const variables = extractVariableNames(systemPrompt);

    // Only valid_name should be extracted (starts with letter or underscore)
    expect(variables).toContain('valid_name');
    expect(variables.length).toBe(1);
  });

  it('should extract from complex prompt template', () => {
    const systemPrompt = `You are a {{role}}.

# Available Tools:
{{available_tools}}

# User Request:
{{user_input}}

# Context:
- Database: {{database_schema}}
- Constraints: {{constraints}}`;

    const variables = extractVariableNames(systemPrompt);

    expect(variables).toEqual([
      'role',
      'available_tools',
      'user_input',
      'database_schema',
      'constraints',
    ]);
  });
});

// =============================================================================
// Edge Cases & Integration Tests
// =============================================================================

describe('Edge Cases', () => {
  it('should handle nested braces in variable values', () => {
    const systemPrompt = 'Config: {{json_config}}';
    const context: PromptContext = {
      json_config: '{"nested": {"key": "value"}}',
    };

    const result = processPrompt(systemPrompt, context);

    expect(result.processedPrompt).toContain('{"nested": {"key": "value"}}');
  });

  it('should handle very long variable values', () => {
    const systemPrompt = 'Schema: {{schema}}';
    const longSchema = 'CREATE TABLE users (' + 'column VARCHAR(255), '.repeat(100) + 'id INT)';
    const context: PromptContext = { schema: longSchema };

    const result = processPrompt(systemPrompt, context);

    expect(result.processedPrompt).toContain(longSchema);
    expect(result.replacedVariables).toEqual(['schema']);
  });

  it('should preserve whitespace in prompts', () => {
    const systemPrompt = `

    User: {{user_input}}

    Schema:
      {{schema}}
    `;

    const context: PromptContext = {
      user_input: 'Find users',
      schema: 'users(id, name)',
    };

    const result = processPrompt(systemPrompt, context);

    // Whitespace should be preserved
    expect(result.processedPrompt).toMatch(/\n\s+User: Find users/);
  });

  it('should handle prompt with only variable placeholders', () => {
    const systemPrompt = '{{user_input}}';
    const context: PromptContext = { user_input: 'Complete prompt text' };

    const result = processPrompt(systemPrompt, context);

    expect(result.processedPrompt).toBe('Complete prompt text');
  });

  it('should handle empty prompt', () => {
    const systemPrompt = '';
    const context: PromptContext = {};

    const result = processPrompt(systemPrompt, context);

    expect(result.processedPrompt).toBe('');
    expect(result.replacedVariables).toEqual([]);
    expect(result.missingVariables).toEqual([]);
  });
});

// =============================================================================
// Real-World Scenario Tests
// =============================================================================

describe('Real-World Scenarios', () => {
  it('should process database assistant prompt', () => {
    const systemPrompt = `You are a database query assistant.

# Database Schema:
{{database_schema}}

# User Request:
{{user_input}}

# Instructions:
Generate a SQL query based on the user's request.`;

    const context: PromptContext = {
      database_schema: 'users(id INT, name VARCHAR(100), email VARCHAR(255))',
      user_input: 'Find all users with gmail addresses',
    };

    const result = processPrompt(systemPrompt, context);

    expect(result.processedPrompt).toContain('users(id INT, name VARCHAR(100)');
    expect(result.processedPrompt).toContain('Find all users with gmail addresses');
    expect(result.missingVariables).toEqual([]);
  });

  it('should process autonomous agent prompt', () => {
    const systemPrompt = `You are a research assistant.

# Available Tools:
{{availableTools}}

# User Request:
{{userInput}}

Use tools to gather information and synthesize a comprehensive answer.`;

    const context = buildPromptContext(undefined, {
      userInput: 'Find competitor pricing for top 3 CRM tools',
      availableTools: [
        { name: 'google_search', description: 'Search the web' },
        { name: 'scrape_url', description: 'Extract content from URL' },
      ],
    });

    const result = processPrompt(systemPrompt, context);

    expect(result.processedPrompt).toContain('1. google_search: Search the web');
    expect(result.processedPrompt).toContain('2. scrape_url: Extract content from URL');
    expect(result.processedPrompt).toContain('Find competitor pricing for top 3 CRM tools');
    expect(result.missingVariables).toEqual([]);
  });

  it('should validate required variables before execution', () => {
    const systemPrompt = `Required:
- User input: {{user_input}}
- Schema: {{database_schema}}
- Reference: {{reference_data}}`;

    const context: PromptContext = {
      user_input: 'Test',
      database_schema: 'Schema',
      // reference_data is missing
    };

    const missing = validatePromptVariables(systemPrompt, context);

    expect(missing).toEqual(['reference_data']);
  });

  it('should extract all variables for validation UI', () => {
    const systemPrompt = `System: {{system_config}}
User: {{user_input}}
Schema: {{integration_schema}}
Tools: {{available_tools}}`;

    const variables = extractVariableNames(systemPrompt);

    expect(variables).toHaveLength(4);
    expect(variables).toContain('system_config');
    expect(variables).toContain('user_input');
    expect(variables).toContain('integration_schema');
    expect(variables).toContain('available_tools');
  });
});
