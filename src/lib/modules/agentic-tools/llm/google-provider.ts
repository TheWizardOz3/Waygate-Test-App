/**
 * Google Provider
 *
 * Gemini integration for agentic tools.
 * Supports Gemini 3 with configurable thinking levels.
 */

import {
  GoogleGenerativeAI,
  GenerativeModel,
  GenerationConfig,
  SchemaType,
} from '@google/generative-ai';
import type { EmbeddedLLMConfig } from '../agentic-tool.schemas';
import type { ILLMProvider, LLMCallRequest, LLMCallResponse, LLMToolCall } from './llm-client';
import { calculateCost } from './cost-calculator';

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_MAX_OUTPUT_TOKENS = 4096;

// =============================================================================
// Provider Implementation
// =============================================================================

/**
 * Google LLM Provider for Agentic Tools
 */
export class GoogleProvider implements ILLMProvider {
  private client: GoogleGenerativeAI;
  private config: EmbeddedLLMConfig;

  constructor(config: EmbeddedLLMConfig) {
    const apiKey = process.env.GOOGLE_AI_API_KEY;
    if (!apiKey) {
      throw new Error('GOOGLE_AI_API_KEY environment variable is required');
    }

    this.client = new GoogleGenerativeAI(apiKey);
    this.config = config;
  }

  /**
   * Make a single LLM call
   */
  async call(request: LLMCallRequest): Promise<LLMCallResponse> {
    const startTime = Date.now();

    try {
      // Build generation config
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const generationConfig: GenerationConfig & { responseSchema?: any; thinkingConfig?: any } = {
        temperature: request.temperature ?? this.config.temperature,
        maxOutputTokens: request.maxTokens ?? this.config.maxTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
        topP: this.config.topP,
      };

      // Add thinking config for Gemini 3 (if reasoning level specified)
      if (this.config.reasoningLevel && this.config.reasoningLevel !== 'none') {
        generationConfig.thinkingConfig = {
          thinkingLevel: this.config.reasoningLevel.toUpperCase(),
        };
      }

      // Add JSON schema if requested
      if (request.responseFormat === 'json' && request.jsonSchema) {
        generationConfig.responseMimeType = 'application/json';
        generationConfig.responseSchema = this.convertToGeminiSchema(request.jsonSchema);
      }

      // Get model instance
      const model: GenerativeModel = this.client.getGenerativeModel({
        model: this.config.model,
        generationConfig,
        systemInstruction: request.systemPrompt,
      });

      // Add tools if provided (for autonomous agent mode)
      const tools =
        request.tools && request.tools.length > 0
          ? this.convertToGeminiTools(request.tools)
          : undefined;

      // Generate content
      const result = tools
        ? await model.generateContent({
            contents: [{ role: 'user', parts: [{ text: request.prompt }] }],
            tools,
          })
        : await model.generateContent(request.prompt);

      const response = result.response;

      // Extract content
      const content = this.extractContent(response, request.responseFormat);

      // Extract tool calls (if any)
      const toolCalls = this.extractToolCalls(response);

      // Get token usage
      const usage = {
        inputTokens: response.usageMetadata?.promptTokenCount ?? 0,
        outputTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
        totalTokens: response.usageMetadata?.totalTokenCount ?? 0,
      };

      // Calculate cost
      const cost = calculateCost(
        'google',
        this.config.model,
        usage.inputTokens,
        usage.outputTokens
      );

      return {
        content,
        rawText: response.text(),
        usage,
        cost,
        model: this.config.model,
        provider: 'google',
        toolCalls,
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      // Handle Google AI errors
      if (error instanceof Error) {
        throw new Error(`Google AI error: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Get provider name
   */
  getProvider(): 'google' {
    return 'google';
  }

  /**
   * Get model name
   */
  getModel(): string {
    return this.config.model;
  }

  // =============================================================================
  // Private Helpers
  // =============================================================================

  /**
   * Convert JSON schema to Gemini schema format
   */
  private convertToGeminiSchema(schema: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {
      type: this.getSchemaType(schema.type as string),
    };

    if (schema.description) {
      result.description = schema.description;
    }

    if (schema.properties) {
      result.properties = {};
      const props = schema.properties as Record<string, Record<string, unknown>>;
      for (const [key, value] of Object.entries(props)) {
        (result.properties as Record<string, unknown>)[key] = this.convertToGeminiSchema(value);
      }
    }

    if (schema.items) {
      result.items = this.convertToGeminiSchema(schema.items as Record<string, unknown>);
    }

    if (schema.required) {
      result.required = schema.required;
    }

    if (schema.enum) {
      result.enum = schema.enum;
    }

    return result;
  }

  /**
   * Map type strings to Gemini SchemaType enum
   */
  private getSchemaType(type: string): SchemaType {
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
   * Convert tools to Gemini function declarations
   */
  private convertToGeminiTools(
    tools: Array<{ name: string; description: string; inputSchema: Record<string, unknown> }>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): any[] {
    return [
      {
        functionDeclarations: tools.map((tool) => ({
          name: tool.name,
          description: tool.description,
          parameters: this.convertToGeminiFunctionSchema(tool.inputSchema),
        })),
      },
    ];
  }

  /**
   * Convert input schema to Gemini function parameter schema
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private convertToGeminiFunctionSchema(schema: Record<string, unknown>): any {
    return {
      type: SchemaType.OBJECT,
      properties: schema.properties,
      required: schema.required,
    };
  }

  /**
   * Extract content from response
   */
  private extractContent(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    response: any,
    responseFormat?: 'text' | 'json'
  ): string | Record<string, unknown> {
    const text = response.text();

    // Parse JSON if requested
    if (responseFormat === 'json') {
      try {
        return JSON.parse(text) as Record<string, unknown>;
      } catch {
        throw new Error('Failed to parse JSON response from Gemini');
      }
    }

    return text;
  }

  /**
   * Extract tool calls from response
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private extractToolCalls(response: any): LLMToolCall[] | undefined {
    const toolCalls: LLMToolCall[] = [];

    // Check if response has function calls
    const functionCalls = response.functionCalls?.();
    if (functionCalls && functionCalls.length > 0) {
      for (const call of functionCalls) {
        toolCalls.push({
          id: `gemini-${Date.now()}-${Math.random()}`,
          name: call.name,
          input: call.args as Record<string, unknown>,
        });
      }
    }

    return toolCalls.length > 0 ? toolCalls : undefined;
  }
}
