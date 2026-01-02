/**
 * LLM Types
 *
 * Provider-agnostic types for LLM interactions.
 * These types are used across all LLM providers.
 */

// =============================================================================
// Generation Types
// =============================================================================

/**
 * Options for content generation
 */
export interface LLMGenerateOptions {
  /** System instruction/prompt */
  systemInstruction?: string;
  /** Temperature for response randomness (0-2, default varies by provider) */
  temperature?: number;
  /** Maximum tokens to generate */
  maxOutputTokens?: number;
  /** Top-P sampling */
  topP?: number;
  /** JSON schema for structured output */
  responseSchema?: LLMResponseSchema;
  /** Request timeout in milliseconds */
  timeout?: number;
}

/**
 * JSON Schema for structured output
 * Provider-agnostic format that gets converted per-provider
 */
export interface LLMResponseSchema {
  type: 'object' | 'array' | 'string' | 'number' | 'boolean';
  properties?: Record<string, LLMSchemaProperty>;
  items?: LLMSchemaProperty;
  required?: string[];
  description?: string;
}

/**
 * Property definition for response schema
 */
export interface LLMSchemaProperty {
  type: 'object' | 'array' | 'string' | 'number' | 'boolean' | 'integer';
  description?: string;
  properties?: Record<string, LLMSchemaProperty>;
  items?: LLMSchemaProperty;
  required?: string[];
  enum?: string[];
  nullable?: boolean;
}

/**
 * Result of content generation
 */
export interface LLMGenerateResult<T = unknown> {
  /** Generated content (parsed JSON if schema provided, otherwise string) */
  content: T;
  /** Raw text response */
  rawText: string;
  /** Token usage information */
  usage?: LLMUsage;
  /** Generation duration in milliseconds */
  durationMs: number;
  /** Model that was used */
  model: string;
  /** Provider that was used */
  provider: LLMProviderType;
}

/**
 * Token usage information
 */
export interface LLMUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

// =============================================================================
// Provider Types
// =============================================================================

/**
 * Supported LLM providers
 */
export type LLMProviderType = 'gemini' | 'openai' | 'anthropic';

/**
 * Model identifiers by provider
 */
export interface LLMModelConfig {
  provider: LLMProviderType;
  model: string;
  /** Optional display name */
  displayName?: string;
}

/**
 * Available models registry
 */
export const LLM_MODELS: Record<string, LLMModelConfig> = {
  // Gemini models
  'gemini-1.5-pro': {
    provider: 'gemini',
    model: 'gemini-1.5-pro',
    displayName: 'Gemini 1.5 Pro',
  },
  'gemini-1.5-flash': {
    provider: 'gemini',
    model: 'gemini-1.5-flash',
    displayName: 'Gemini 1.5 Flash',
  },
  'gemini-2.0-flash': {
    provider: 'gemini',
    model: 'gemini-2.0-flash-exp',
    displayName: 'Gemini 2.0 Flash',
  },
  // Future: OpenAI models
  // 'gpt-4o': { provider: 'openai', model: 'gpt-4o', displayName: 'GPT-4o' },
  // Future: Anthropic models
  // 'claude-3-5-sonnet': { provider: 'anthropic', model: 'claude-3-5-sonnet-20241022', displayName: 'Claude 3.5 Sonnet' },
};

/**
 * Valid model IDs
 */
export type LLMModelId = 'gemini-1.5-pro' | 'gemini-1.5-flash' | 'gemini-2.0-flash';

// =============================================================================
// Error Types
// =============================================================================

/**
 * Error codes for LLM failures (provider-agnostic)
 */
export type LLMErrorCode =
  | 'CONFIGURATION_ERROR'
  | 'RATE_LIMITED'
  | 'QUOTA_EXCEEDED'
  | 'INVALID_REQUEST'
  | 'CONTENT_BLOCKED'
  | 'GENERATION_FAILED'
  | 'PARSE_ERROR'
  | 'TIMEOUT'
  | 'PROVIDER_ERROR'
  | 'UNKNOWN_ERROR';

/**
 * Error thrown when LLM operations fail
 */
export class LLMError extends Error {
  public readonly code: LLMErrorCode;
  public readonly provider: LLMProviderType;
  public readonly retryable: boolean;
  public readonly retryAfterMs?: number;

  constructor(
    code: LLMErrorCode,
    message: string,
    provider: LLMProviderType,
    options?: {
      retryable?: boolean;
      retryAfterMs?: number;
      cause?: unknown;
    }
  ) {
    super(message, { cause: options?.cause });
    this.name = 'LLMError';
    this.code = code;
    this.provider = provider;
    this.retryable = options?.retryable ?? false;
    this.retryAfterMs = options?.retryAfterMs;
  }
}

// =============================================================================
// Provider Interface
// =============================================================================

/**
 * Interface that all LLM providers must implement
 */
export interface LLMProvider {
  /** Provider identifier */
  readonly type: LLMProviderType;

  /**
   * Generate content (text or structured)
   */
  generate<T = string>(prompt: string, options?: LLMGenerateOptions): Promise<LLMGenerateResult<T>>;
}
