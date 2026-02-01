/**
 * Prompt Processor
 *
 * Handles variable replacement in system prompts for agentic tools.
 * Replaces placeholders like {{user_input}}, {{integration_schema}}, etc.
 */

import type { ContextConfig } from '../agentic-tool.schemas';

// =============================================================================
// Types
// =============================================================================

/**
 * Context variables for prompt replacement
 */
export interface PromptContext {
  /** User's natural language input/task */
  userInput?: string;
  /** Integration schema (tables, fields, types) */
  integrationSchema?: string;
  /** Reference data (valid values, options) */
  referenceData?: string;
  /** Available tools for autonomous agent mode */
  availableTools?: string;
  /** Database schema (alias for integration_schema) */
  databaseSchema?: string;
  /** Custom variables */
  [key: string]: string | undefined;
}

/**
 * Result of prompt processing
 */
export interface ProcessedPrompt {
  /** Prompt with variables replaced */
  processedPrompt: string;
  /** Variables that were replaced */
  replacedVariables: string[];
  /** Variables that were not found */
  missingVariables: string[];
}

// =============================================================================
// Prompt Processing
// =============================================================================

/**
 * Process a system prompt by replacing variable placeholders
 *
 * @param systemPrompt - System prompt template with {{variable}} placeholders
 * @param context - Context variables to inject
 * @returns Processed prompt with variables replaced
 */
export function processPrompt(systemPrompt: string, context: PromptContext): ProcessedPrompt {
  const replacedVariables: string[] = [];
  const missingVariables: string[] = [];

  // Find all variable placeholders: {{variable_name}}
  const variableRegex = /\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g;

  let processedPrompt = systemPrompt;
  let match: RegExpExecArray | null;

  // Reset regex state
  variableRegex.lastIndex = 0;

  while ((match = variableRegex.exec(systemPrompt)) !== null) {
    const fullMatch = match[0]; // {{variable_name}}
    const variableName = match[1]; // variable_name

    // Check if variable exists in context
    const variableValue = context[variableName];

    if (variableValue !== undefined && variableValue !== null) {
      // Replace the placeholder with the actual value
      processedPrompt = processedPrompt.replace(fullMatch, variableValue);
      replacedVariables.push(variableName);
    } else {
      // Variable not found - track it
      missingVariables.push(variableName);
      // Replace with empty string or keep placeholder
      processedPrompt = processedPrompt.replace(fullMatch, '');
    }
  }

  return {
    processedPrompt,
    replacedVariables: Array.from(new Set(replacedVariables)), // Remove duplicates
    missingVariables: Array.from(new Set(missingVariables)), // Remove duplicates
  };
}

/**
 * Build prompt context from configuration and runtime data
 *
 * @param contextConfig - Context configuration from agentic tool
 * @param runtimeContext - Runtime context (user input, loaded schemas, etc.)
 * @returns Prompt context ready for variable replacement
 */
export function buildPromptContext(
  contextConfig: ContextConfig | undefined,
  runtimeContext: {
    userInput?: string;
    integrationSchemas?: Record<string, string>;
    referenceData?: Record<string, string>;
    availableTools?: Array<{ name: string; description: string }>;
  }
): PromptContext {
  const context: PromptContext = {};

  // Add user input
  if (runtimeContext.userInput) {
    context.userInput = runtimeContext.userInput;
  }

  // Add available tools (for autonomous agent mode)
  if (runtimeContext.availableTools && runtimeContext.availableTools.length > 0) {
    context.availableTools = formatAvailableTools(runtimeContext.availableTools);
  }

  // Process configured variables
  if (contextConfig?.variables) {
    for (const [variableName, variableConfig] of Object.entries(contextConfig.variables)) {
      if (variableConfig.type === 'integration_schema') {
        // Load integration schema
        const schemaSource = variableConfig.source;
        if (schemaSource && runtimeContext.integrationSchemas?.[schemaSource]) {
          context[variableName] = runtimeContext.integrationSchemas[schemaSource];
        }
      } else if (variableConfig.type === 'reference_data') {
        // Load reference data
        const dataSource = variableConfig.source;
        if (dataSource && runtimeContext.referenceData?.[dataSource]) {
          context[variableName] = runtimeContext.referenceData[dataSource];
        }
      } else if (variableConfig.type === 'custom') {
        // Use custom value
        if (variableConfig.value) {
          context[variableName] = variableConfig.value;
        }
      }
    }
  }

  // Add common aliases
  if (context.integration_schema) {
    context.databaseSchema = context.integration_schema;
  }

  return context;
}

/**
 * Format available tools as a readable list for LLM
 */
function formatAvailableTools(tools: Array<{ name: string; description: string }>): string {
  return tools.map((tool, index) => `${index + 1}. ${tool.name}: ${tool.description}`).join('\n');
}

/**
 * Validate that all required variables are present in context
 *
 * @param systemPrompt - System prompt template
 * @param context - Prompt context
 * @returns Array of missing variable names
 */
export function validatePromptVariables(systemPrompt: string, context: PromptContext): string[] {
  const result = processPrompt(systemPrompt, context);
  return result.missingVariables;
}

/**
 * Extract all variable names from a prompt template
 *
 * @param systemPrompt - System prompt template
 * @returns Array of variable names found in the template
 */
export function extractVariableNames(systemPrompt: string): string[] {
  const variableRegex = /\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g;
  const variables: string[] = [];
  let match: RegExpExecArray | null;

  variableRegex.lastIndex = 0;

  while ((match = variableRegex.exec(systemPrompt)) !== null) {
    variables.push(match[1]);
  }

  return Array.from(new Set(variables)); // Remove duplicates
}
