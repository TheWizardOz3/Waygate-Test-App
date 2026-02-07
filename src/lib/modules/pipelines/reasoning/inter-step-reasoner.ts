/**
 * Inter-Step Reasoner
 *
 * Executes inter-step LLM reasoning calls between pipeline steps.
 * After a step's tool invocation completes, the reasoner interprets the output
 * and produces structured JSON that subsequent steps can reference via templates.
 *
 * Uses the existing LLM client infrastructure from the agentic tools module.
 * Tracks cost and token usage for pipeline-level accumulation.
 *
 * Key design: The LLM is a reasoner/interpreter, NOT an agent with tools.
 * It outputs structured JSON — it does not make tool calls.
 */

import { createLLMClient, validateLLMConfig } from '../../agentic-tools/llm/llm-client';
import type { LLMCallResponse } from '../../agentic-tools/llm/llm-client';
import type { EmbeddedLLMConfig } from '../../agentic-tools/agentic-tool.schemas';
import type { ReasoningConfig } from '../pipeline.schemas';
import type { PipelineState } from '../orchestrator/state-manager';
import { buildReasoningPrompt } from './reasoning-prompt-builder';

// =============================================================================
// Types
// =============================================================================

export interface ReasoningRequest {
  /** The step's reasoning prompt (user-defined instructions) */
  reasoningPrompt: string;
  /** The current step's tool output (null for reasoning-only steps) */
  stepOutput: unknown;
  /** The accumulated pipeline state */
  pipelineState: PipelineState;
  /** The current step's name */
  stepName: string;
  /** The current step's slug */
  stepSlug: string;
  /** The current step number (1-based) */
  stepNumber: number;
  /** Total number of steps in the pipeline */
  totalSteps: number;
  /** Step-level reasoning config (overrides pipeline default) */
  stepReasoningConfig?: ReasoningConfig | null;
  /** Pipeline-level default reasoning config */
  pipelineReasoningConfig?: ReasoningConfig;
}

export interface ReasoningResult {
  /** The structured JSON output from the LLM */
  output: Record<string, unknown>;
  /** Cost in USD for this reasoning call */
  costUsd: number;
  /** Token usage */
  tokensUsed: number;
  /** Duration in milliseconds */
  durationMs: number;
  /** Model used */
  model: string;
  /** Provider used */
  provider: 'anthropic' | 'google';
}

export class ReasoningError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly stepSlug: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = 'ReasoningError';
  }
}

// =============================================================================
// Inter-Step Reasoner
// =============================================================================

/**
 * Executes an inter-step reasoning LLM call.
 *
 * Resolves the effective LLM config (step-level overrides pipeline-level),
 * builds the prompt, calls the LLM, and returns the structured JSON result
 * with cost/token tracking.
 */
export async function executeReasoning(request: ReasoningRequest): Promise<ReasoningResult> {
  // Resolve effective config: step-level overrides pipeline-level
  const config = resolveReasoningConfig(
    request.stepReasoningConfig,
    request.pipelineReasoningConfig
  );

  if (!config) {
    throw new ReasoningError(
      'No reasoning configuration available. Configure reasoning at the pipeline or step level.',
      'REASONING_CONFIG_MISSING',
      request.stepSlug
    );
  }

  // Validate the LLM config (checks API keys, model, etc.)
  const embeddedConfig = toEmbeddedLLMConfig(config);
  validateLLMConfig(embeddedConfig);

  // Build prompts
  const { systemPrompt, userPrompt } = buildReasoningPrompt({
    reasoningPrompt: request.reasoningPrompt,
    stepOutput: request.stepOutput,
    pipelineState: request.pipelineState,
    stepName: request.stepName,
    stepSlug: request.stepSlug,
    stepNumber: request.stepNumber,
    totalSteps: request.totalSteps,
    outputSchema: config.outputSchema,
  });

  // Create LLM client and make the call
  const client = createLLMClient(embeddedConfig);

  let response: LLMCallResponse;
  try {
    response = await client.call({
      prompt: userPrompt,
      systemPrompt,
      temperature: config.temperature,
      maxTokens: config.maxTokens,
      responseFormat: 'json',
      jsonSchema: config.outputSchema,
    });
  } catch (error) {
    throw new ReasoningError(
      `LLM reasoning call failed for step "${request.stepSlug}": ${error instanceof Error ? error.message : String(error)}`,
      'REASONING_LLM_CALL_FAILED',
      request.stepSlug,
      error
    );
  }

  // Parse the response content into structured JSON
  const output = parseReasoningOutput(response, request.stepSlug);

  return {
    output,
    costUsd: response.cost,
    tokensUsed: response.usage.totalTokens,
    durationMs: response.durationMs,
    model: response.model,
    provider: response.provider,
  };
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Resolves the effective reasoning config. Step-level config takes precedence
 * over pipeline-level config.
 */
function resolveReasoningConfig(
  stepConfig?: ReasoningConfig | null,
  pipelineConfig?: ReasoningConfig
): ReasoningConfig | undefined {
  if (stepConfig) {
    return stepConfig;
  }
  return pipelineConfig;
}

/**
 * Converts a ReasoningConfig to an EmbeddedLLMConfig for the LLM client.
 */
function toEmbeddedLLMConfig(config: ReasoningConfig): EmbeddedLLMConfig {
  return {
    provider: config.provider,
    model: config.model,
    reasoningLevel: config.reasoningLevel,
    temperature: config.temperature,
    maxTokens: config.maxTokens,
  };
}

/**
 * Parses the LLM response content into a structured JSON object.
 * Handles both pre-parsed JSON (from providers with native JSON support)
 * and raw text that needs parsing.
 */
function parseReasoningOutput(
  response: LLMCallResponse,
  stepSlug: string
): Record<string, unknown> {
  const { content } = response;

  // If the provider already parsed the JSON
  if (typeof content === 'object' && content !== null) {
    return content as Record<string, unknown>;
  }

  // Try to parse raw text as JSON
  if (typeof content === 'string') {
    try {
      const parsed = JSON.parse(content);
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
      // Wrap non-object JSON (arrays, primitives) in a result envelope
      return { result: parsed };
    } catch {
      throw new ReasoningError(
        `LLM reasoning for step "${stepSlug}" returned invalid JSON: ${content.slice(0, 200)}`,
        'REASONING_INVALID_JSON',
        stepSlug
      );
    }
  }

  throw new ReasoningError(
    `LLM reasoning for step "${stepSlug}" returned unexpected content type`,
    'REASONING_UNEXPECTED_CONTENT',
    stepSlug
  );
}
