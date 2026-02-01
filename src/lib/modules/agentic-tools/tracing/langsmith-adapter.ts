/**
 * Langsmith Tracing Adapter for Agentic Tools
 *
 * Enables Langsmith compatibility for tracing LLM calls and tool executions.
 * Consuming applications can pass tracing configuration via headers to track
 * embedded LLM calls within Langsmith.
 */

import type { LLMCallResponse } from '../llm/llm-client';

// =============================================================================
// Types
// =============================================================================

/**
 * Langsmith tracing configuration (from consuming app headers)
 */
export interface LangsmithConfig {
  /** Langsmith API key */
  apiKey: string;
  /** Parent run ID (optional, for nesting traces) */
  parentRunId?: string;
  /** Custom trace name (optional) */
  traceName?: string;
  /** Langsmith API endpoint (default: https://api.smith.langchain.com) */
  endpoint?: string;
}

/**
 * Langsmith run event (simplified)
 */
interface LangsmithRun {
  /** Unique run ID */
  id: string;
  /** Parent run ID (for nesting) */
  parent_run_id?: string;
  /** Run name */
  name: string;
  /** Run type */
  run_type: 'llm' | 'tool' | 'chain';
  /** Start time (ISO 8601) */
  start_time: string;
  /** End time (ISO 8601) */
  end_time?: string;
  /** Inputs */
  inputs: Record<string, unknown>;
  /** Outputs */
  outputs?: Record<string, unknown>;
  /** Error (if failed) */
  error?: string;
  /** Metadata */
  extra?: Record<string, unknown>;
}

/**
 * LLM call trace context
 */
export interface LLMCallTrace {
  /** Unique ID for this LLM call */
  id: string;
  /** Purpose/name of this LLM call */
  purpose: string;
  /** Prompt sent to LLM */
  prompt: string;
  /** System prompt (optional) */
  systemPrompt?: string;
  /** LLM response */
  response: LLMCallResponse;
  /** Start timestamp */
  startTime: Date;
  /** End timestamp */
  endTime: Date;
}

/**
 * Tool call trace context
 */
export interface ToolCallTrace {
  /** Unique ID for this tool call */
  id: string;
  /** Tool name/slug */
  toolName: string;
  /** Tool input parameters */
  input: Record<string, unknown>;
  /** Tool output */
  output?: Record<string, unknown>;
  /** Error (if failed) */
  error?: string;
  /** Start timestamp */
  startTime: Date;
  /** End timestamp */
  endTime: Date;
}

// =============================================================================
// Langsmith Adapter
// =============================================================================

/**
 * Langsmith tracing adapter
 */
export class LangsmithAdapter {
  private config: LangsmithConfig;
  private endpoint: string;

  constructor(config: LangsmithConfig) {
    this.config = config;
    this.endpoint = config.endpoint ?? 'https://api.smith.langchain.com';
  }

  /**
   * Log an LLM call to Langsmith
   */
  async logLLMCall(trace: LLMCallTrace): Promise<void> {
    try {
      const run: LangsmithRun = {
        id: trace.id,
        parent_run_id: this.config.parentRunId,
        name: trace.purpose,
        run_type: 'llm',
        start_time: trace.startTime.toISOString(),
        end_time: trace.endTime.toISOString(),
        inputs: {
          prompt: trace.prompt,
          systemPrompt: trace.systemPrompt,
        },
        outputs: {
          content: trace.response.content,
          rawText: trace.response.rawText,
        },
        extra: {
          metadata: {
            model: trace.response.model,
            provider: trace.response.provider,
            tokens: {
              input: trace.response.usage.inputTokens,
              output: trace.response.usage.outputTokens,
              total: trace.response.usage.totalTokens,
            },
            cost: trace.response.cost,
            durationMs: trace.response.durationMs,
          },
        },
      };

      await this.sendRun(run);
    } catch (error) {
      // Log error but don't throw - tracing failures shouldn't break execution
      console.error('[LangsmithAdapter] Failed to log LLM call:', error);
    }
  }

  /**
   * Log a tool call to Langsmith
   */
  async logToolCall(trace: ToolCallTrace): Promise<void> {
    try {
      const run: LangsmithRun = {
        id: trace.id,
        parent_run_id: this.config.parentRunId,
        name: trace.toolName,
        run_type: 'tool',
        start_time: trace.startTime.toISOString(),
        end_time: trace.endTime.toISOString(),
        inputs: trace.input,
        outputs: trace.output ? { result: trace.output } : undefined,
        error: trace.error,
      };

      await this.sendRun(run);
    } catch (error) {
      console.error('[LangsmithAdapter] Failed to log tool call:', error);
    }
  }

  /**
   * Log a chain/sequence of operations to Langsmith
   */
  async logChain(
    id: string,
    name: string,
    inputs: Record<string, unknown>,
    outputs: Record<string, unknown> | undefined,
    startTime: Date,
    endTime: Date,
    error?: string
  ): Promise<void> {
    try {
      const run: LangsmithRun = {
        id,
        parent_run_id: this.config.parentRunId,
        name: name || this.config.traceName || 'agentic-tool-execution',
        run_type: 'chain',
        start_time: startTime.toISOString(),
        end_time: endTime.toISOString(),
        inputs,
        outputs,
        error,
      };

      await this.sendRun(run);
    } catch (error) {
      console.error('[LangsmithAdapter] Failed to log chain:', error);
    }
  }

  /**
   * Send a run to Langsmith API
   */
  private async sendRun(run: LangsmithRun): Promise<void> {
    const response = await fetch(`${this.endpoint}/runs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.config.apiKey,
      },
      body: JSON.stringify(run),
    });

    if (!response.ok) {
      throw new Error(`Langsmith API request failed: ${response.status} ${response.statusText}`);
    }
  }
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Parse Langsmith config from request headers
 */
export function parseLangsmithConfigFromHeaders(
  headers: Record<string, string | undefined>
): LangsmithConfig | null {
  const apiKey = headers['x-trace-api-key'];
  const parentRunId = headers['x-trace-run-id'];
  const traceName = headers['x-trace-name'];
  const endpoint = headers['x-trace-endpoint'];

  if (!apiKey) {
    return null;
  }

  return {
    apiKey,
    parentRunId,
    traceName,
    endpoint,
  };
}

/**
 * Create a Langsmith adapter from request headers
 */
export function createLangsmithAdapter(
  headers: Record<string, string | undefined>
): LangsmithAdapter | null {
  const config = parseLangsmithConfigFromHeaders(headers);
  if (!config) {
    return null;
  }

  return new LangsmithAdapter(config);
}

/**
 * Generate a unique run ID for Langsmith
 */
export function generateRunId(): string {
  return `run_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}
