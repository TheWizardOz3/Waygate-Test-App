/**
 * Gemini Provider
 *
 * Google Gemini implementation of the LLM provider interface.
 */

import {
  GoogleGenerativeAI,
  GenerativeModel,
  GenerationConfig,
  SchemaType,
} from '@google/generative-ai';
import type {
  LLMProvider,
  LLMGenerateOptions,
  LLMGenerateResult,
  LLMResponseSchema,
  LLMSchemaProperty,
} from '../types';
import { LLMError } from '../types';

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_TEMPERATURE = 0.7;
const DEFAULT_MAX_OUTPUT_TOKENS = 8192;
const DEFAULT_TOP_P = 0.95;
const DEFAULT_TIMEOUT_MS = 120000; // 2 minutes

// =============================================================================
// Schema Conversion
// =============================================================================

/**
 * Map type strings to Gemini SchemaType enum
 */
function getSchemaType(type: string): SchemaType {
  const typeMap: Record<string, SchemaType> = {
    object: SchemaType.OBJECT,
    array: SchemaType.ARRAY,
    string: SchemaType.STRING,
    number: SchemaType.NUMBER,
    integer: SchemaType.INTEGER,
    boolean: SchemaType.BOOLEAN,
  };
  return typeMap[type] || SchemaType.STRING;
}

/**
 * Internal schema structure for Gemini API
 */
interface GeminiSchemaInternal {
  type: SchemaType;
  description?: string;
  properties?: Record<string, GeminiSchemaInternal>;
  items?: GeminiSchemaInternal;
  required?: string[];
  enum?: string[];
  nullable?: boolean;
}

/**
 * Convert LLM schema to Gemini's schema format
 */
function convertToGeminiSchema(
  schema: LLMResponseSchema | LLMSchemaProperty
): GeminiSchemaInternal {
  const result: GeminiSchemaInternal = {
    type: getSchemaType(schema.type),
  };

  if (schema.description) {
    result.description = schema.description;
  }

  if ('properties' in schema && schema.properties) {
    result.properties = {};
    for (const [key, value] of Object.entries(schema.properties)) {
      result.properties[key] = convertToGeminiSchema(value);
    }
  }

  if ('items' in schema && schema.items) {
    result.items = convertToGeminiSchema(schema.items);
  }

  if ('required' in schema && schema.required) {
    result.required = schema.required;
  }

  if ('enum' in schema && schema.enum) {
    result.enum = schema.enum;
  }

  if ('nullable' in schema && schema.nullable !== undefined) {
    result.nullable = schema.nullable;
  }

  return result;
}

// =============================================================================
// Provider Implementation
// =============================================================================

/**
 * Gemini LLM Provider
 */
export class GeminiProvider implements LLMProvider {
  readonly type = 'gemini' as const;

  private client: GoogleGenerativeAI;
  private modelId: string;

  constructor(apiKey: string, modelId: string = 'gemini-3-pro-preview') {
    this.client = new GoogleGenerativeAI(apiKey);
    this.modelId = modelId;
  }

  /**
   * Generate content using Gemini
   */
  async generate<T = string>(
    prompt: string,
    options: LLMGenerateOptions = {}
  ): Promise<LLMGenerateResult<T>> {
    const timeout = options.timeout ?? DEFAULT_TIMEOUT_MS;
    const startTime = Date.now();

    // Build generation config
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const generationConfig: GenerationConfig & { responseSchema?: any } = {
      temperature: options.temperature ?? DEFAULT_TEMPERATURE,
      maxOutputTokens: options.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
      topP: options.topP ?? DEFAULT_TOP_P,
    };

    // Add JSON response format if schema provided
    if (options.responseSchema) {
      generationConfig.responseMimeType = 'application/json';
      generationConfig.responseSchema = convertToGeminiSchema(options.responseSchema);
    }

    // Get model with config
    const model: GenerativeModel = this.client.getGenerativeModel({
      model: this.modelId,
      generationConfig,
      systemInstruction: options.systemInstruction,
    });

    // Set up timeout
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(
          new LLMError('TIMEOUT', `Generation timed out after ${timeout}ms`, 'gemini', {
            retryable: true,
          })
        );
      }, timeout);
    });

    try {
      // Race between generation and timeout
      const result = await Promise.race([model.generateContent(prompt), timeoutPromise]);

      const durationMs = Date.now() - startTime;
      const response = result.response;
      const rawText = response.text();

      // Extract usage metadata if available
      const usageMetadata = response.usageMetadata;
      const usage = usageMetadata
        ? {
            promptTokens: usageMetadata.promptTokenCount,
            completionTokens: usageMetadata.candidatesTokenCount,
            totalTokens: usageMetadata.totalTokenCount,
          }
        : undefined;

      // Parse JSON if schema was provided
      let parsedContent: T;
      if (options.responseSchema) {
        try {
          parsedContent = JSON.parse(rawText) as T;
        } catch (parseError) {
          throw new LLMError('PARSE_ERROR', `Failed to parse JSON response: ${rawText}`, 'gemini', {
            retryable: false,
            cause: parseError,
          });
        }
      } else {
        parsedContent = rawText as T;
      }

      return {
        content: parsedContent,
        rawText,
        usage,
        durationMs,
        model: this.modelId,
        provider: 'gemini',
      };
    } catch (error) {
      // Re-throw LLMErrors
      if (error instanceof LLMError) {
        throw error;
      }

      // Handle Google API errors
      if (error instanceof Error) {
        const message = error.message.toLowerCase();

        // Rate limiting
        if (
          message.includes('rate limit') ||
          message.includes('429') ||
          message.includes('quota')
        ) {
          const isQuota = message.includes('quota');
          throw new LLMError(
            isQuota ? 'QUOTA_EXCEEDED' : 'RATE_LIMITED',
            isQuota ? 'API quota exceeded' : 'Rate limited by Gemini',
            'gemini',
            {
              retryable: !isQuota,
              retryAfterMs: isQuota ? undefined : 60000,
              cause: error,
            }
          );
        }

        // Content blocked (safety filters)
        if (
          message.includes('blocked') ||
          message.includes('safety') ||
          message.includes('harmful')
        ) {
          throw new LLMError('CONTENT_BLOCKED', 'Content blocked by safety filters', 'gemini', {
            retryable: false,
            cause: error,
          });
        }

        // Invalid request
        if (message.includes('invalid') || message.includes('400')) {
          throw new LLMError('INVALID_REQUEST', `Invalid request: ${error.message}`, 'gemini', {
            retryable: false,
            cause: error,
          });
        }
      }

      // Unknown error
      throw new LLMError(
        'UNKNOWN_ERROR',
        error instanceof Error ? error.message : 'Unknown generation error',
        'gemini',
        {
          retryable: false,
          cause: error,
        }
      );
    }
  }
}

/**
 * Create a Gemini provider instance
 *
 * @param modelId - Model to use (default: gemini-3-pro-preview)
 * @throws LLMError if GOOGLE_API_KEY is not set
 */
export function createGeminiProvider(modelId: string = 'gemini-3-pro-preview'): GeminiProvider {
  const apiKey = process.env.GOOGLE_API_KEY;

  if (!apiKey) {
    throw new LLMError(
      'CONFIGURATION_ERROR',
      'GOOGLE_API_KEY environment variable is not set',
      'gemini',
      { retryable: false }
    );
  }

  return new GeminiProvider(apiKey, modelId);
}
