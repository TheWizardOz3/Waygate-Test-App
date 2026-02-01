/**
 * Tracing Module for Agentic Tools
 *
 * Exports tracing adapters for Langsmith and OpenTelemetry.
 */

export {
  LangsmithAdapter,
  createLangsmithAdapter,
  generateRunId,
  parseLangsmithConfigFromHeaders,
  type LangsmithConfig,
  type LLMCallTrace as LangsmithLLMCallTrace,
  type ToolCallTrace as LangsmithToolCallTrace,
} from './langsmith-adapter';

export {
  OpenTelemetryAdapter,
  createOTelAdapter,
  parseOTelConfigFromHeaders,
  type OpenTelemetryConfig,
  type LLMCallTrace as OTelLLMCallTrace,
  type ToolCallTrace as OTelToolCallTrace,
  type SpanContext,
} from './opentelemetry-adapter';
