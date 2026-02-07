/**
 * Step Executor
 *
 * Executes a single pipeline step: resolves input templates, invokes the
 * appropriate tool (simple/composite/agentic), runs optional inter-step
 * LLM reasoning, and handles per-step error policies including retries.
 *
 * This is the workhorse called by the pipeline orchestrator for each step.
 * It delegates to existing invocation handlers based on the step's toolType.
 */

import type { PipelineStep } from '@prisma/client';
import type { GatewayInvokeOptions } from '../../gateway/gateway.schemas';
import type { PipelineState } from './state-manager';
import type { ReasoningConfig, RetryConfig, StepCondition } from '../pipeline.schemas';
import { resolveTemplates, TemplateResolutionError } from './template-resolver';
import { evaluateCondition } from './condition-evaluator';
import { executeReasoning, ReasoningError } from '../reasoning/inter-step-reasoner';

// Tool invocation imports
import { invokeAction } from '../../gateway/gateway.service';
import { invokeCompositeTool } from '../../composite-tools/handlers/invocation-handler';
import { invokeAgenticTool } from '../../agentic-tools/handlers/invocation-handler';

// =============================================================================
// Types
// =============================================================================

export interface StepExecutorInput {
  /** The pipeline step definition */
  step: PipelineStep;
  /** Current pipeline state (for template resolution) */
  pipelineState: PipelineState;
  /** Tenant ID for tool invocation */
  tenantId: string;
  /** Total steps in the pipeline (for reasoning context) */
  totalSteps: number;
  /** Pipeline-level default reasoning config */
  pipelineReasoningConfig?: ReasoningConfig;
  /** Optional gateway invocation options (e.g., context for name→ID resolution) */
  gatewayOptions?: GatewayInvokeOptions;
}

export interface StepExecutorResult {
  /** Whether the step executed successfully */
  success: boolean;
  /** The step's status */
  status: 'completed' | 'failed' | 'skipped';
  /** Resolved input after template resolution */
  resolvedInput: Record<string, unknown> | null;
  /** Raw output from tool invocation (null for reasoning-only steps) */
  toolOutput: unknown;
  /** Output from inter-step LLM reasoning (null if reasoning not enabled) */
  reasoningOutput: Record<string, unknown> | null;
  /** Error details if the step failed */
  error: StepError | null;
  /** Number of retry attempts made */
  retryCount: number;
  /** Cost in USD for this step (tool + reasoning) */
  costUsd: number;
  /** Tokens used for reasoning in this step */
  tokensUsed: number;
  /** Duration in milliseconds */
  durationMs: number;
  /** Skip reason (if step was skipped due to condition) */
  skipReason?: string;
}

export interface StepError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

// =============================================================================
// Step Executor
// =============================================================================

/**
 * Executes a single pipeline step.
 *
 * Flow:
 *   1. Evaluate skip condition → skip if met
 *   2. Resolve input templates against pipeline state
 *   3. Invoke tool (simple/composite/agentic) — or skip for reasoning-only steps
 *   4. Run inter-step LLM reasoning (if enabled)
 *   5. Handle errors per step's onError policy
 *   6. Return result with cost/token tracking
 */
export async function executeStep(input: StepExecutorInput): Promise<StepExecutorResult> {
  const { step, pipelineState, tenantId, totalSteps, pipelineReasoningConfig, gatewayOptions } =
    input;
  const startTime = Date.now();

  // 1. Evaluate skip condition
  const condition = step.condition as StepCondition | null;
  const conditionResult = evaluateCondition(condition, pipelineState);

  if (conditionResult.shouldSkip) {
    return {
      success: true,
      status: 'skipped',
      resolvedInput: null,
      toolOutput: null,
      reasoningOutput: null,
      error: null,
      retryCount: 0,
      costUsd: 0,
      tokensUsed: 0,
      durationMs: Date.now() - startTime,
      skipReason: conditionResult.reason,
    };
  }

  // 2. Resolve input templates
  let resolvedInput: Record<string, unknown> = {};
  const inputMapping = step.inputMapping as Record<string, unknown>;

  try {
    if (inputMapping && Object.keys(inputMapping).length > 0) {
      resolvedInput = resolveTemplates(inputMapping, pipelineState);
    }
  } catch (err) {
    if (err instanceof TemplateResolutionError) {
      return buildFailedResult(startTime, {
        code: 'TEMPLATE_RESOLUTION_ERROR',
        message: err.message,
        details: { expression: err.expression },
      });
    }
    throw err;
  }

  // 3. Invoke tool (with retries)
  const retryConfig = (step.retryConfig as RetryConfig) ?? { maxRetries: 0, backoffMs: 1000 };
  const isReasoningOnly = !step.toolId;

  let toolOutput: unknown = null;
  let toolCostUsd = 0;
  let retryCount = 0;

  if (!isReasoningOnly) {
    const toolResult = await executeToolWithRetries(
      step,
      resolvedInput,
      tenantId,
      retryConfig,
      gatewayOptions
    );

    toolOutput = toolResult.output;
    toolCostUsd = toolResult.costUsd;
    retryCount = toolResult.retryCount;

    if (!toolResult.success) {
      return {
        success: false,
        status: 'failed',
        resolvedInput,
        toolOutput: toolResult.output,
        reasoningOutput: null,
        error: toolResult.error!,
        retryCount,
        costUsd: toolCostUsd,
        tokensUsed: 0,
        durationMs: Date.now() - startTime,
      };
    }
  }

  // 4. Run inter-step reasoning (if enabled)
  let reasoningOutput: Record<string, unknown> | null = null;
  let reasoningCostUsd = 0;
  let reasoningTokens = 0;

  if (step.reasoningEnabled && step.reasoningPrompt) {
    try {
      const reasoningResult = await executeReasoning({
        reasoningPrompt: step.reasoningPrompt,
        stepOutput: toolOutput,
        pipelineState,
        stepName: step.name,
        stepSlug: step.slug,
        stepNumber: step.stepNumber,
        totalSteps,
        stepReasoningConfig: step.reasoningConfig as ReasoningConfig | null,
        pipelineReasoningConfig,
      });

      reasoningOutput = reasoningResult.output;
      reasoningCostUsd = reasoningResult.costUsd;
      reasoningTokens = reasoningResult.tokensUsed;
    } catch (err) {
      if (err instanceof ReasoningError) {
        return {
          success: false,
          status: 'failed',
          resolvedInput,
          toolOutput,
          reasoningOutput: null,
          error: {
            code: err.code,
            message: err.message,
          },
          retryCount,
          costUsd: toolCostUsd,
          tokensUsed: 0,
          durationMs: Date.now() - startTime,
        };
      }
      throw err;
    }
  }

  // 5. Return successful result
  return {
    success: true,
    status: 'completed',
    resolvedInput,
    toolOutput,
    reasoningOutput,
    error: null,
    retryCount,
    costUsd: toolCostUsd + reasoningCostUsd,
    tokensUsed: reasoningTokens,
    durationMs: Date.now() - startTime,
  };
}

// =============================================================================
// Tool Invocation with Retries
// =============================================================================

interface ToolInvocationResult {
  success: boolean;
  output: unknown;
  costUsd: number;
  retryCount: number;
  error?: StepError;
}

/**
 * Executes a tool invocation with configurable retry logic.
 * Retries use exponential backoff based on the step's retryConfig.
 */
async function executeToolWithRetries(
  step: PipelineStep,
  resolvedInput: Record<string, unknown>,
  tenantId: string,
  retryConfig: RetryConfig,
  gatewayOptions?: GatewayInvokeOptions
): Promise<ToolInvocationResult> {
  const maxRetries = retryConfig.maxRetries ?? 0;
  const backoffMs = retryConfig.backoffMs ?? 1000;

  let lastError: StepError | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      // Exponential backoff
      const delay = backoffMs * Math.pow(2, attempt - 1);
      await sleep(delay);
    }

    try {
      const result = await invokeTool(step, resolvedInput, tenantId, gatewayOptions);
      return { ...result, retryCount: attempt };
    } catch (err) {
      lastError = {
        code: 'TOOL_INVOCATION_ERROR',
        message: err instanceof Error ? err.message : String(err),
        details: { attempt: attempt + 1, maxRetries: maxRetries + 1 },
      };
    }
  }

  return {
    success: false,
    output: null,
    costUsd: 0,
    retryCount: maxRetries,
    error: lastError,
  };
}

// =============================================================================
// Tool Delegation
// =============================================================================

/**
 * Delegates tool invocation to the appropriate handler based on the step's toolType.
 *
 * - 'simple' → Gateway action handler (invokeAction)
 * - 'composite' → Composite tool invocation handler (invokeCompositeTool)
 * - 'agentic' → Agentic tool invocation handler (invokeAgenticTool)
 */
async function invokeTool(
  step: PipelineStep,
  resolvedInput: Record<string, unknown>,
  tenantId: string,
  gatewayOptions?: GatewayInvokeOptions
): Promise<Omit<ToolInvocationResult, 'retryCount'>> {
  const toolType = step.toolType;
  const toolSlug = step.toolSlug;

  if (!toolType || !toolSlug) {
    return {
      success: false,
      output: null,
      costUsd: 0,
      error: {
        code: 'TOOL_NOT_CONFIGURED',
        message: `Step "${step.name}" has no tool configured but is not a reasoning-only step`,
      },
    };
  }

  switch (toolType) {
    case 'simple':
      return invokeSimpleTool(toolSlug, resolvedInput, tenantId, gatewayOptions);

    case 'composite':
      return invokeComposite(toolSlug, resolvedInput, tenantId, gatewayOptions);

    case 'agentic':
      return invokeAgentic(toolSlug, resolvedInput, tenantId);

    default:
      return {
        success: false,
        output: null,
        costUsd: 0,
        error: {
          code: 'UNKNOWN_TOOL_TYPE',
          message: `Unknown tool type: ${toolType}`,
        },
      };
  }
}

/**
 * Invokes a simple tool (gateway action).
 * toolSlug format: "integrationSlug/actionSlug"
 */
async function invokeSimpleTool(
  toolSlug: string,
  resolvedInput: Record<string, unknown>,
  tenantId: string,
  gatewayOptions?: GatewayInvokeOptions
): Promise<Omit<ToolInvocationResult, 'retryCount'>> {
  // Parse integration/action from toolSlug
  const slashIndex = toolSlug.indexOf('/');
  if (slashIndex === -1) {
    return {
      success: false,
      output: null,
      costUsd: 0,
      error: {
        code: 'INVALID_TOOL_SLUG',
        message: `Simple tool slug must be in "integration/action" format, got: "${toolSlug}"`,
      },
    };
  }

  const integrationSlug = toolSlug.substring(0, slashIndex);
  const actionSlug = toolSlug.substring(slashIndex + 1);

  const result = await invokeAction(tenantId, integrationSlug, actionSlug, resolvedInput, {
    ...gatewayOptions,
    timeoutMs: gatewayOptions?.timeoutMs,
  });

  if (result.success) {
    return {
      success: true,
      output: result.data,
      costUsd: 0, // Simple tools don't have LLM cost
    };
  }

  return {
    success: false,
    output: result.error,
    costUsd: 0,
    error: {
      code: result.error?.code ?? 'ACTION_FAILED',
      message: result.error?.message ?? 'Action invocation failed',
      details: result.error?.details as Record<string, unknown> | undefined,
    },
  };
}

/**
 * Invokes a composite tool.
 */
async function invokeComposite(
  toolSlug: string,
  resolvedInput: Record<string, unknown>,
  tenantId: string,
  gatewayOptions?: GatewayInvokeOptions
): Promise<Omit<ToolInvocationResult, 'retryCount'>> {
  const result = await invokeCompositeTool(tenantId, {
    toolSlug,
    params: resolvedInput,
    options: gatewayOptions,
  });

  if (result.success) {
    return {
      success: true,
      output: result.data,
      costUsd: 0,
    };
  }

  return {
    success: false,
    output: result.error,
    costUsd: 0,
    error: {
      code: (result as { error?: { code?: string } }).error?.code ?? 'COMPOSITE_TOOL_FAILED',
      message:
        (result as { error?: { message?: string } }).error?.message ??
        'Composite tool invocation failed',
    },
  };
}

/**
 * Invokes an agentic tool.
 */
async function invokeAgentic(
  toolSlug: string,
  resolvedInput: Record<string, unknown>,
  tenantId: string
): Promise<Omit<ToolInvocationResult, 'retryCount'>> {
  const task = (resolvedInput.task as string) ?? JSON.stringify(resolvedInput);

  const result = await invokeAgenticTool({
    toolIdentifier: toolSlug,
    tenantId,
    task,
    requestId: crypto.randomUUID(),
    logExecution: false, // Pipeline has its own execution logging
  });

  if (result.success) {
    return {
      success: true,
      output: result.data,
      costUsd: result.metadata.totalCost ?? 0,
    };
  }

  return {
    success: false,
    output: result.error,
    costUsd: result.metadata.totalCost ?? 0,
    error: {
      code: result.error?.code ?? 'AGENTIC_TOOL_FAILED',
      message: result.error?.message ?? 'Agentic tool invocation failed',
      details: result.error?.details,
    },
  };
}

// =============================================================================
// Helpers
// =============================================================================

function buildFailedResult(startTime: number, error: StepError): StepExecutorResult {
  return {
    success: false,
    status: 'failed',
    resolvedInput: null,
    toolOutput: null,
    reasoningOutput: null,
    error,
    retryCount: 0,
    costUsd: 0,
    tokensUsed: 0,
    durationMs: Date.now() - startTime,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
