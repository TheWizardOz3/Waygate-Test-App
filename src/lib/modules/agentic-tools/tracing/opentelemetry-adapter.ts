/**
 * OpenTelemetry Tracing Adapter for Agentic Tools
 *
 * Enables OpenTelemetry compatibility for tracing LLM calls and tool executions.
 * Uses standard OpenTelemetry conventions for LLM observability.
 */

import type { LLMCallResponse } from '../llm/llm-client';

// =============================================================================
// Types
// =============================================================================

/**
 * OpenTelemetry tracing configuration
 */
export interface OpenTelemetryConfig {
  /** OTel endpoint (e.g., http://localhost:4318/v1/traces) */
  endpoint: string;
  /** Service name for telemetry */
  serviceName?: string;
  /** Additional headers (e.g., for authentication) */
  headers?: Record<string, string>;
}

/**
 * Span context for OpenTelemetry
 */
export interface SpanContext {
  /** Trace ID */
  traceId: string;
  /** Span ID */
  spanId: string;
  /** Parent span ID (optional) */
  parentSpanId?: string;
}

/**
 * Span attributes (OpenTelemetry conventions)
 */
interface SpanAttributes {
  [key: string]: string | number | boolean | undefined;
}

/**
 * Span event
 */
interface SpanEvent {
  /** Event name */
  name: string;
  /** Event timestamp (Unix epoch in nanoseconds) */
  timestamp: number;
  /** Event attributes */
  attributes?: SpanAttributes;
}

/**
 * Simplified span representation
 */
interface Span {
  /** Trace ID */
  traceId: string;
  /** Span ID */
  spanId: string;
  /** Parent span ID */
  parentSpanId?: string;
  /** Span name */
  name: string;
  /** Span kind */
  kind: 'INTERNAL' | 'CLIENT' | 'SERVER';
  /** Start time (Unix epoch in nanoseconds) */
  startTimeUnixNano: number;
  /** End time (Unix epoch in nanoseconds) */
  endTimeUnixNano: number;
  /** Span attributes */
  attributes: SpanAttributes;
  /** Span events */
  events?: SpanEvent[];
  /** Status code */
  statusCode: 'OK' | 'ERROR' | 'UNSET';
  /** Status message (for errors) */
  statusMessage?: string;
}

/**
 * LLM call trace context (same as Langsmith)
 */
export interface LLMCallTrace {
  id: string;
  purpose: string;
  prompt: string;
  systemPrompt?: string;
  response: LLMCallResponse;
  startTime: Date;
  endTime: Date;
}

/**
 * Tool call trace context (same as Langsmith)
 */
export interface ToolCallTrace {
  id: string;
  toolName: string;
  input: Record<string, unknown>;
  output?: Record<string, unknown>;
  error?: string;
  startTime: Date;
  endTime: Date;
}

// =============================================================================
// OpenTelemetry Adapter
// =============================================================================

/**
 * OpenTelemetry tracing adapter
 *
 * Follows OpenTelemetry Semantic Conventions for LLM observability
 * https://opentelemetry.io/docs/specs/semconv/gen-ai/
 */
export class OpenTelemetryAdapter {
  private config: OpenTelemetryConfig;
  private traceId: string;
  private serviceName: string;

  constructor(config: OpenTelemetryConfig, traceId?: string) {
    this.config = config;
    this.traceId = traceId || this.generateTraceId();
    this.serviceName = config.serviceName || 'waygate-agentic-tools';
  }

  /**
   * Log an LLM call as an OpenTelemetry span
   */
  async logLLMCall(trace: LLMCallTrace, parentSpanId?: string): Promise<void> {
    try {
      const span: Span = {
        traceId: this.traceId,
        spanId: this.generateSpanId(),
        parentSpanId,
        name: trace.purpose,
        kind: 'CLIENT',
        startTimeUnixNano: this.dateToNano(trace.startTime),
        endTimeUnixNano: this.dateToNano(trace.endTime),
        attributes: {
          // OpenTelemetry Semantic Conventions for Gen AI
          'gen_ai.system': trace.response.provider,
          'gen_ai.request.model': trace.response.model,
          'gen_ai.request.temperature': trace.response.cost > 0 ? undefined : 0.2, // Approximation
          'gen_ai.request.max_tokens': trace.response.usage.totalTokens,
          'gen_ai.response.finish_reason': 'stop',
          'gen_ai.usage.input_tokens': trace.response.usage.inputTokens,
          'gen_ai.usage.output_tokens': trace.response.usage.outputTokens,

          // Custom attributes
          'llm.prompt': this.truncate(trace.prompt, 1000),
          'llm.system_prompt': trace.systemPrompt
            ? this.truncate(trace.systemPrompt, 1000)
            : undefined,
          'llm.response': this.truncate(trace.response.rawText, 1000),
          'llm.cost_usd': trace.response.cost,
          'llm.duration_ms': trace.response.durationMs,
        },
        statusCode: 'OK',
      };

      await this.sendSpan(span);
    } catch (error) {
      console.error('[OpenTelemetryAdapter] Failed to log LLM call:', error);
    }
  }

  /**
   * Log a tool call as an OpenTelemetry span
   */
  async logToolCall(trace: ToolCallTrace, parentSpanId?: string): Promise<void> {
    try {
      const span: Span = {
        traceId: this.traceId,
        spanId: this.generateSpanId(),
        parentSpanId,
        name: `tool.${trace.toolName}`,
        kind: 'INTERNAL',
        startTimeUnixNano: this.dateToNano(trace.startTime),
        endTimeUnixNano: this.dateToNano(trace.endTime),
        attributes: {
          'tool.name': trace.toolName,
          'tool.input': JSON.stringify(trace.input),
          'tool.output': trace.output ? JSON.stringify(trace.output) : undefined,
        },
        statusCode: trace.error ? 'ERROR' : 'OK',
        statusMessage: trace.error,
      };

      await this.sendSpan(span);
    } catch (error) {
      console.error('[OpenTelemetryAdapter] Failed to log tool call:', error);
    }
  }

  /**
   * Log an agentic tool execution as an OpenTelemetry span
   */
  async logAgenticToolExecution(
    id: string,
    name: string,
    inputs: Record<string, unknown>,
    outputs: Record<string, unknown> | undefined,
    startTime: Date,
    endTime: Date,
    error?: string
  ): Promise<string> {
    try {
      const spanId = this.generateSpanId();

      const span: Span = {
        traceId: this.traceId,
        spanId,
        name: `agentic_tool.${name}`,
        kind: 'SERVER',
        startTimeUnixNano: this.dateToNano(startTime),
        endTimeUnixNano: this.dateToNano(endTime),
        attributes: {
          'agentic_tool.name': name,
          'agentic_tool.execution_id': id,
          'agentic_tool.input': JSON.stringify(inputs),
          'agentic_tool.output': outputs ? JSON.stringify(outputs) : undefined,
        },
        statusCode: error ? 'ERROR' : 'OK',
        statusMessage: error,
      };

      await this.sendSpan(span);
      return spanId;
    } catch (error) {
      console.error('[OpenTelemetryAdapter] Failed to log agentic tool execution:', error);
      return '';
    }
  }

  /**
   * Get trace ID for this adapter instance
   */
  getTraceId(): string {
    return this.traceId;
  }

  /**
   * Send a span to the OpenTelemetry collector
   */
  private async sendSpan(span: Span): Promise<void> {
    // Simplified OTLP JSON format
    const payload = {
      resourceSpans: [
        {
          resource: {
            attributes: [{ key: 'service.name', value: { stringValue: this.serviceName } }],
          },
          scopeSpans: [
            {
              scope: {
                name: 'waygate-agentic-tools',
                version: '1.0.0',
              },
              spans: [
                {
                  traceId: span.traceId,
                  spanId: span.spanId,
                  parentSpanId: span.parentSpanId,
                  name: span.name,
                  kind: this.mapSpanKind(span.kind),
                  startTimeUnixNano: span.startTimeUnixNano.toString(),
                  endTimeUnixNano: span.endTimeUnixNano.toString(),
                  attributes: this.mapAttributes(span.attributes),
                  events: span.events,
                  status: {
                    code: this.mapStatusCode(span.statusCode),
                    message: span.statusMessage,
                  },
                },
              ],
            },
          ],
        },
      ],
    };

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...this.config.headers,
    };

    const response = await fetch(this.config.endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(
        `OpenTelemetry API request failed: ${response.status} ${response.statusText}`
      );
    }
  }

  /**
   * Generate a trace ID (16 bytes as hex)
   */
  private generateTraceId(): string {
    return Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  }

  /**
   * Generate a span ID (8 bytes as hex)
   */
  private generateSpanId(): string {
    return Array.from({ length: 16 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  }

  /**
   * Convert Date to Unix epoch nanoseconds
   */
  private dateToNano(date: Date): number {
    return date.getTime() * 1_000_000;
  }

  /**
   * Truncate string to max length
   */
  private truncate(str: string, maxLength: number): string {
    if (str.length <= maxLength) return str;
    return str.substring(0, maxLength) + '...';
  }

  /**
   * Map span kind to OTLP enum
   */
  private mapSpanKind(kind: string): number {
    const kinds: Record<string, number> = {
      INTERNAL: 1,
      SERVER: 2,
      CLIENT: 3,
    };
    return kinds[kind] || 0;
  }

  /**
   * Map status code to OTLP enum
   */
  private mapStatusCode(code: string): number {
    const codes: Record<string, number> = {
      UNSET: 0,
      OK: 1,
      ERROR: 2,
    };
    return codes[code] || 0;
  }

  /**
   * Map attributes to OTLP format
   */
  private mapAttributes(
    attributes: SpanAttributes
  ): Array<{
    key: string;
    value: { stringValue?: string; intValue?: number; boolValue?: boolean };
  }> {
    return Object.entries(attributes)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => {
        if (typeof value === 'string') {
          return { key, value: { stringValue: value } };
        } else if (typeof value === 'number') {
          return { key, value: { intValue: value } };
        } else if (typeof value === 'boolean') {
          return { key, value: { boolValue: value } };
        }
        return { key, value: { stringValue: String(value) } };
      });
  }
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Parse OpenTelemetry config from request headers
 */
export function parseOTelConfigFromHeaders(
  headers: Record<string, string | undefined>
): OpenTelemetryConfig | null {
  const endpoint = headers['x-trace-endpoint'];

  if (!endpoint) {
    return null;
  }

  const serviceName = headers['x-trace-service-name'];
  const authHeader = headers['x-trace-auth'];

  const config: OpenTelemetryConfig = {
    endpoint,
    serviceName,
    headers: authHeader ? { Authorization: authHeader } : undefined,
  };

  return config;
}

/**
 * Create an OpenTelemetry adapter from request headers
 */
export function createOTelAdapter(
  headers: Record<string, string | undefined>,
  traceId?: string
): OpenTelemetryAdapter | null {
  const config = parseOTelConfigFromHeaders(headers);
  if (!config) {
    return null;
  }

  return new OpenTelemetryAdapter(config, traceId);
}
