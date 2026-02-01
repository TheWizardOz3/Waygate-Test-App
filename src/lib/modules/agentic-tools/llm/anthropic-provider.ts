/**
 * Anthropic Provider
 *
 * Claude integration for agentic tools.
 * Supports Claude Opus 4.5 and Sonnet 4.5 with extended thinking.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { EmbeddedLLMConfig } from '../agentic-tool.schemas';
import type { ILLMProvider, LLMCallRequest, LLMCallResponse, LLMToolCall } from './llm-client';
import { calculateCost } from './cost-calculator';

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_MAX_TOKENS = 4096;
const DEFAULT_TIMEOUT_MS = 120000; // 2 minutes

// =============================================================================
// Provider Implementation
// =============================================================================

/**
 * Anthropic LLM Provider for Agentic Tools
 */
export class AnthropicProvider implements ILLMProvider {
  private client: Anthropic;
  private config: EmbeddedLLMConfig;

  constructor(config: EmbeddedLLMConfig) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY environment variable is required');
    }

    this.client = new Anthropic({ apiKey });
    this.config = config;
  }

  /**
   * Make a single LLM call
   */
  async call(request: LLMCallRequest): Promise<LLMCallResponse> {
    const startTime = Date.now();

    try {
      // Build messages
      const messages: Anthropic.MessageParam[] = [
        {
          role: 'user',
          content: request.prompt,
        },
      ];

      // Build request parameters
      const params: Anthropic.MessageCreateParams = {
        model: this.config.model,
        max_tokens: request.maxTokens ?? this.config.maxTokens ?? DEFAULT_MAX_TOKENS,
        temperature: request.temperature ?? this.config.temperature,
        messages,
      };

      // Add system prompt if provided
      if (request.systemPrompt) {
        params.system = request.systemPrompt;
      }

      // Add tools if provided (for autonomous agent mode)
      if (request.tools && request.tools.length > 0) {
        params.tools = request.tools.map((tool) => ({
          name: tool.name,
          description: tool.description,
          input_schema: tool.inputSchema as Anthropic.Tool.InputSchema,
        }));
      }

      // Add thinking configuration for extended thinking (if supported)
      if (this.config.reasoningLevel && this.config.reasoningLevel !== 'none') {
        // Map reasoning level to thinking budget
        const thinkingBudgetTokens = this.getThinkingBudget(this.config.reasoningLevel);
        (
          params as Anthropic.MessageCreateParams & {
            thinking?: { type: string; budget_tokens: number };
          }
        ).thinking = {
          type: 'enabled',
          budget_tokens: thinkingBudgetTokens,
        };
      }

      // Make API call
      const response = await this.client.messages.create(params, {
        timeout: DEFAULT_TIMEOUT_MS,
      });

      // Extract content
      const content = this.extractContent(response, request.responseFormat);

      // Extract tool calls (if any)
      const toolCalls = this.extractToolCalls(response);

      // Calculate cost
      const usage = {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        totalTokens: response.usage.input_tokens + response.usage.output_tokens,
      };
      const cost = calculateCost(
        'anthropic',
        this.config.model,
        usage.inputTokens,
        usage.outputTokens
      );

      return {
        content,
        rawText: this.getRawText(response),
        usage,
        cost,
        model: this.config.model,
        provider: 'anthropic',
        toolCalls,
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      // Handle Anthropic-specific errors
      if (error instanceof Anthropic.APIError) {
        throw new Error(`Anthropic API error (${error.status}): ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Get provider name
   */
  getProvider(): 'anthropic' {
    return 'anthropic';
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
   * Get thinking budget tokens based on reasoning level
   */
  private getThinkingBudget(level: string): number {
    switch (level) {
      case 'low':
        return 1000;
      case 'medium':
        return 5000;
      case 'high':
        return 10000;
      default:
        return 0;
    }
  }

  /**
   * Extract content from response
   */
  private extractContent(
    response: Anthropic.Message,
    responseFormat?: 'text' | 'json'
  ): string | Record<string, unknown> {
    // Find text content block
    const textBlock = response.content.find((block) => block.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      return '';
    }

    const text = textBlock.text;

    // Parse JSON if requested
    if (responseFormat === 'json') {
      try {
        return JSON.parse(text) as Record<string, unknown>;
      } catch {
        throw new Error('Failed to parse JSON response from Claude');
      }
    }

    return text;
  }

  /**
   * Extract tool calls from response
   */
  private extractToolCalls(response: Anthropic.Message): LLMToolCall[] | undefined {
    const toolCalls: LLMToolCall[] = [];

    for (const block of response.content) {
      if (block.type === 'tool_use') {
        toolCalls.push({
          id: block.id,
          name: block.name,
          input: block.input as Record<string, unknown>,
        });
      }
    }

    return toolCalls.length > 0 ? toolCalls : undefined;
  }

  /**
   * Get raw text from response (including all text blocks)
   */
  private getRawText(response: Anthropic.Message): string {
    return response.content
      .filter((block) => block.type === 'text')
      .map((block) => (block.type === 'text' ? block.text : ''))
      .join('\n');
  }
}
