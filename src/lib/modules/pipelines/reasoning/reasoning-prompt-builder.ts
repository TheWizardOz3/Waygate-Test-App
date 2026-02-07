/**
 * Reasoning Prompt Builder
 *
 * Builds system and user prompts for inter-step LLM reasoning calls.
 * The LLM acts as a reasoner/interpreter — it receives the step's tool output
 * plus accumulated pipeline state, and produces structured JSON for subsequent steps.
 *
 * This is NOT agentic tool calling — the LLM outputs JSON, not tool calls.
 */

import type { PipelineState } from '../orchestrator/state-manager';
import { createStateSummary } from '../orchestrator/state-manager';

// =============================================================================
// Types
// =============================================================================

export interface ReasoningPromptContext {
  /** The step's reasoning prompt (user-defined instructions) */
  reasoningPrompt: string;
  /** The current step's tool output (null for reasoning-only steps) */
  stepOutput: unknown;
  /** The accumulated pipeline state (all previous step results) */
  pipelineState: PipelineState;
  /** The current step's name (for context) */
  stepName: string;
  /** The current step's slug */
  stepSlug: string;
  /** The current step number (1-based) */
  stepNumber: number;
  /** Total number of steps in the pipeline */
  totalSteps: number;
  /** Optional JSON schema for the expected output structure */
  outputSchema?: Record<string, unknown>;
}

export interface BuiltPrompt {
  /** System prompt with context and instructions */
  systemPrompt: string;
  /** User prompt with the reasoning task */
  userPrompt: string;
}

// =============================================================================
// Constants
// =============================================================================

const SYSTEM_PROMPT_TEMPLATE = `You are a data processing assistant within a multi-step pipeline.

Your role is to analyze the current step's output and the accumulated pipeline state, then produce structured JSON that will be used by subsequent steps.

# Rules:
1. Return ONLY valid JSON — no markdown, no code fences, no explanatory text.
2. Your output must be a single JSON object.
3. Analyze the data carefully and produce accurate, well-structured results.
4. If the data is ambiguous, make reasonable inferences and note them in your output.
5. Do not fabricate data that isn't present in the inputs.`;

// =============================================================================
// Prompt Builder
// =============================================================================

/**
 * Builds the system and user prompts for an inter-step reasoning LLM call.
 */
export function buildReasoningPrompt(context: ReasoningPromptContext): BuiltPrompt {
  const systemPrompt = buildSystemPrompt(context);
  const userPrompt = buildUserPrompt(context);

  return { systemPrompt, userPrompt };
}

/**
 * Builds the system prompt with pipeline context.
 */
function buildSystemPrompt(context: ReasoningPromptContext): string {
  const parts: string[] = [SYSTEM_PROMPT_TEMPLATE];

  if (context.outputSchema) {
    parts.push('\n# Expected Output Schema:');
    parts.push(JSON.stringify(context.outputSchema, null, 2));
    parts.push('\nYour output must conform to this JSON schema.');
  }

  return parts.join('\n');
}

/**
 * Builds the user prompt with step output, state, and reasoning instructions.
 */
function buildUserPrompt(context: ReasoningPromptContext): string {
  const parts: string[] = [];

  // Pipeline progress context
  parts.push(`# Pipeline Progress: Step ${context.stepNumber} of ${context.totalSteps}`);
  parts.push(`Step Name: ${context.stepName}`);

  // Current step output
  if (context.stepOutput !== undefined && context.stepOutput !== null) {
    parts.push('\n# Current Step Output:');
    const outputStr = formatForPrompt(context.stepOutput);
    parts.push(outputStr);
  } else {
    parts.push('\n# Current Step Output:');
    parts.push('(No tool output — this is a reasoning-only step)');
  }

  // Pipeline state summary (previous steps)
  const stateSummary = createStateSummary(context.pipelineState);
  parts.push('\n# Pipeline State So Far:');
  parts.push(stateSummary);

  // User-defined reasoning instructions
  parts.push('\n# Your Task:');
  parts.push(context.reasoningPrompt);

  parts.push('\n# Instructions:');
  parts.push('Analyze the step output and pipeline state above, then produce structured JSON.');
  parts.push('Your output will be stored and made available to subsequent pipeline steps.');
  parts.push('Return ONLY valid JSON — no other text.');

  return parts.join('\n');
}

/**
 * Formats a value for inclusion in the prompt. Truncates large payloads
 * to keep the prompt within reasonable token limits.
 */
function formatForPrompt(value: unknown, maxLength: number = 8000): string {
  const str = JSON.stringify(value, null, 2);
  if (str.length <= maxLength) {
    return str;
  }
  return str.slice(0, maxLength) + '\n... (truncated, showing first ' + maxLength + ' characters)';
}
