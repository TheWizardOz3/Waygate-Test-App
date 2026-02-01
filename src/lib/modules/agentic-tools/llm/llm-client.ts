/**
 * LLM Client for Agentic Tools
 *
 * Multi-provider LLM client specifically designed for agentic tools.
 * Supports Anthropic (Claude) and Google (Gemini) providers with
 * features like reasoning levels, tool calling, and token tracking.
 */

import type { EmbeddedLLMConfig } from '../agentic-tool.schemas';
import { AnthropicProvider } from './anthropic-provider';
import { GoogleProvider } from './google-provider';

// =============================================================================
// Types
// =============================================================================

/**
 * LLM call request
 */
export interface LLMCallRequest {
  /** The prompt/user message to send */
  prompt: string;
  /** System instructions */
  systemPrompt?: string;
  /** Temperature override (0-1) */
  temperature?: number;
  /** Max tokens override */
  maxTokens?: number;
  /** Expected response format */
  responseFormat?: 'text' | 'json';
  /** JSON schema for structured output (when responseFormat is 'json') */
  jsonSchema?: Record<string, unknown>;
  /** Tools available for tool calling (autonomous agent mode) */
  tools?: LLMTool[];
}

/**
 * Tool definition for LLM tool calling
 */
export interface LLMTool {
  /** Tool name/identifier */
  name: string;
  /** Description of what the tool does */
  description: string;
  /** Input parameters schema */
  inputSchema: Record<string, unknown>;
}

/**
 * LLM call response
 */
export interface LLMCallResponse {
  /** Generated content (string or parsed JSON) */
  content: string | Record<string, unknown>;
  /** Raw text response */
  rawText: string;
  /** Token usage */
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  /** Cost in USD */
  cost: number;
  /** Model used */
  model: string;
  /** Provider used */
  provider: 'anthropic' | 'google';
  /** Tool calls made (autonomous agent mode) */
  toolCalls?: LLMToolCall[];
  /** Duration in milliseconds */
  durationMs: number;
}

/**
 * Tool call made by the LLM
 */
export interface LLMToolCall {
  /** Tool call ID */
  id: string;
  /** Tool name */
  name: string;
  /** Tool input parameters */
  input: Record<string, unknown>;
}

/**
 * LLM provider interface
 */
export interface ILLMProvider {
  /**
   * Make a single LLM call
   */
  call(request: LLMCallRequest): Promise<LLMCallResponse>;

  /**
   * Get provider name
   */
  getProvider(): 'anthropic' | 'google';

  /**
   * Get model name
   */
  getModel(): string;
}

// =============================================================================
// LLM Client
// =============================================================================

/**
 * Create an LLM client from embedded LLM configuration
 */
export function createLLMClient(config: EmbeddedLLMConfig): ILLMProvider {
  switch (config.provider) {
    case 'anthropic':
      return new AnthropicProvider(config);
    case 'google':
      return new GoogleProvider(config);
    default:
      throw new Error(`Unsupported LLM provider: ${config.provider}`);
  }
}

/**
 * Validate LLM configuration
 */
export function validateLLMConfig(config: EmbeddedLLMConfig): void {
  // Check API keys exist
  if (config.provider === 'anthropic') {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY environment variable is required for Anthropic provider');
    }
  } else if (config.provider === 'google') {
    if (!process.env.GOOGLE_AI_API_KEY) {
      throw new Error('GOOGLE_AI_API_KEY environment variable is required for Google provider');
    }
  }

  // Validate model string
  if (!config.model || config.model.length === 0) {
    throw new Error('Model must be specified in LLM configuration');
  }

  // Validate temperature range
  if (config.temperature < 0 || config.temperature > 1) {
    throw new Error('Temperature must be between 0 and 1');
  }

  // Validate max tokens range
  if (config.maxTokens < 1000 || config.maxTokens > 8000) {
    throw new Error('Max tokens must be between 1000 and 8000');
  }
}
