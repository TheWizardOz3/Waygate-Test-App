/**
 * Pipeline Orchestrator
 *
 * Main execution loop for pipeline invocations. Orchestrates sequential step
 * execution with state accumulation, safety checks, execution logging, and
 * output mapping.
 *
 * Flow:
 *   1. Validate pipeline is active and has steps
 *   2. Create PipelineExecution + StepExecution records
 *   3. Initialize pipeline state from input
 *   4. For each step:
 *      a. Check safety limits (cost, duration)
 *      b. Execute step (template resolution → tool invocation → reasoning)
 *      c. Record step result in state
 *      d. Update StepExecution record
 *      e. Handle step errors per onError policy
 *   5. Build final output from output mapping
 *   6. Update PipelineExecution with final state and output
 *   7. Return pipeline result
 */

import { PipelineExecutionStatus, StepExecutionStatus, StepOnError, Prisma } from '@prisma/client';
import type { Pipeline, PipelineStep } from '@prisma/client';

import {
  createPipelineExecution,
  updatePipelineExecution,
  createStepExecution,
  updateStepExecution,
} from '../pipeline.repository';
import type {
  CreatePipelineExecutionDbInput,
  CreateStepExecutionDbInput,
  UpdatePipelineExecutionDbInput,
  UpdateStepExecutionDbInput,
} from '../pipeline.repository';
import type { PipelineSafetyLimits, ReasoningConfig, OutputMapping } from '../pipeline.schemas';
import { PipelineErrorCodes } from '../pipeline.schemas';

import {
  createInitialState,
  recordStepResult,
  serializeState,
  getStepStatusCounts,
} from './state-manager';
import type { PipelineState, StepResultStatus } from './state-manager';
import { checkSafetyLimits } from './safety-enforcer';
import type { SafetyCheckResult } from './safety-enforcer';
import { executeStep } from './step-executor';
import { resolveOutputMapping } from './output-mapper';
import type { GatewayInvokeOptions } from '../../gateway/gateway.schemas';

// =============================================================================
// Types
// =============================================================================

export interface PipelineInvocationInput {
  /** The pipeline definition (with steps loaded) */
  pipeline: Pipeline;
  /** The pipeline steps in order */
  steps: PipelineStep[];
  /** Tenant ID */
  tenantId: string;
  /** Pipeline input parameters */
  params: Record<string, unknown>;
  /** Optional gateway options forwarded to each step (e.g., context) */
  gatewayOptions?: GatewayInvokeOptions;
}

export interface PipelineInvocationResult {
  /** Whether the pipeline completed successfully */
  success: boolean;
  /** Final output built from output mapping */
  data: unknown;
  /** Error info if pipeline failed */
  error?: {
    code: string;
    message: string;
    details?: {
      failedStep?: string;
      stepNumber?: number;
      partialResults?: unknown;
    };
  };
  /** Execution metadata */
  meta: {
    pipeline: string;
    executionId: string;
    totalSteps: number;
    completedSteps: number;
    totalCostUsd: number;
    totalTokens: number;
    durationMs: number;
    steps: Array<{
      name: string;
      slug: string;
      status: string;
      durationMs: number;
      costUsd: number;
    }>;
  };
}

export class PipelineExecutionError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number = 500
  ) {
    super(message);
    this.name = 'PipelineExecutionError';
  }
}

// =============================================================================
// Pipeline Orchestrator
// =============================================================================

/**
 * Executes a pipeline: runs all steps sequentially, manages state,
 * enforces safety limits, logs execution, and returns the final result.
 */
export async function executePipeline(
  input: PipelineInvocationInput
): Promise<PipelineInvocationResult> {
  const { pipeline, steps, tenantId, params, gatewayOptions } = input;
  const startTime = Date.now();

  // Validate pipeline has steps
  if (steps.length === 0) {
    throw new PipelineExecutionError(
      PipelineErrorCodes.EMPTY_PIPELINE,
      `Pipeline "${pipeline.slug}" has no steps`,
      400
    );
  }

  // Create pipeline execution record
  const executionInput: CreatePipelineExecutionDbInput = {
    pipelineId: pipeline.id,
    tenantId,
    input: params as Prisma.InputJsonValue,
    totalSteps: steps.length,
    status: PipelineExecutionStatus.running,
  };
  const execution = await createPipelineExecution(executionInput);

  // Create step execution records (all start as pending)
  const stepExecutionIds: Record<number, string> = {};
  for (const step of steps) {
    const stepExecInput: CreateStepExecutionDbInput = {
      pipelineExecutionId: execution.id,
      pipelineStepId: step.id,
      stepNumber: step.stepNumber,
      status: StepExecutionStatus.pending,
    };
    const stepExec = await createStepExecution(stepExecInput);
    stepExecutionIds[step.stepNumber] = stepExec.id;
  }

  // Initialize state
  let state: PipelineState = createInitialState(params);
  const safetyLimits = pipeline.safetyLimits as PipelineSafetyLimits | null;
  const pipelineReasoningConfig = pipeline.reasoningConfig as ReasoningConfig | undefined;
  const outputMapping = pipeline.outputMapping as OutputMapping | null;

  // Track execution metrics
  let totalCostUsd = 0;
  let totalTokens = 0;
  const stepMeta: PipelineInvocationResult['meta']['steps'] = [];
  let failedStep: { name: string; slug: string; stepNumber: number } | null = null;
  let pipelineStopped = false;
  let safetyViolation: SafetyCheckResult | null = null;

  // Execute steps sequentially
  for (const step of steps) {
    if (pipelineStopped) {
      // Mark remaining steps as skipped
      stepMeta.push({
        name: step.name,
        slug: step.slug,
        status: 'skipped',
        durationMs: 0,
        costUsd: 0,
      });

      await updateStepExecution(stepExecutionIds[step.stepNumber], {
        status: StepExecutionStatus.skipped,
        completedAt: new Date(),
      });
      continue;
    }

    // Check safety limits before each step
    const safetyCheck = checkSafetyLimits(safetyLimits, {
      totalCostUsd,
      startedAt: execution.startedAt,
      currentStepNumber: step.stepNumber,
      totalSteps: steps.length,
    });

    if (!safetyCheck.safe) {
      safetyViolation = safetyCheck;
      pipelineStopped = true;

      // Mark this and remaining steps as skipped
      stepMeta.push({
        name: step.name,
        slug: step.slug,
        status: 'skipped',
        durationMs: 0,
        costUsd: 0,
      });

      await updateStepExecution(stepExecutionIds[step.stepNumber], {
        status: StepExecutionStatus.skipped,
        error: {
          code: safetyCheck.violation!.type.toUpperCase(),
          message: safetyCheck.violation!.message,
        },
        completedAt: new Date(),
      });
      continue;
    }

    // Mark step as running
    await updateStepExecution(stepExecutionIds[step.stepNumber], {
      status: StepExecutionStatus.running,
      startedAt: new Date(),
    });

    // Update pipeline execution current step
    await updatePipelineExecution(execution.id, {
      currentStepNumber: step.stepNumber,
      state: serializeState(state) as Prisma.InputJsonValue,
      totalCostUsd,
      totalTokens,
    });

    // Execute the step
    const stepResult = await executeStep({
      step,
      pipelineState: state,
      tenantId,
      totalSteps: steps.length,
      pipelineReasoningConfig,
      gatewayOptions,
    });

    // Track cost and tokens
    totalCostUsd += stepResult.costUsd;
    totalTokens += stepResult.tokensUsed;

    // Record step metadata
    stepMeta.push({
      name: step.name,
      slug: step.slug,
      status: stepResult.status,
      durationMs: stepResult.durationMs,
      costUsd: stepResult.costUsd,
    });

    // Update step execution record
    const stepExecUpdate: UpdateStepExecutionDbInput = {
      status: toStepExecutionStatus(stepResult.status),
      resolvedInput: (stepResult.resolvedInput ?? undefined) as Prisma.InputJsonValue | undefined,
      toolOutput:
        stepResult.toolOutput != null
          ? (stepResult.toolOutput as Prisma.InputJsonValue)
          : undefined,
      reasoningOutput: (stepResult.reasoningOutput ?? undefined) as
        | Prisma.InputJsonValue
        | undefined,
      retryCount: stepResult.retryCount,
      costUsd: stepResult.costUsd,
      tokensUsed: stepResult.tokensUsed,
      durationMs: stepResult.durationMs,
      completedAt: new Date(),
    };

    if (stepResult.error) {
      stepExecUpdate.error = stepResult.error as unknown as Prisma.InputJsonValue;
    }

    await updateStepExecution(stepExecutionIds[step.stepNumber], stepExecUpdate);

    // Record step result in pipeline state
    state = recordStepResult(state, {
      stepSlug: step.slug,
      output: stepResult.toolOutput,
      reasoning: stepResult.reasoningOutput ?? undefined,
      status: stepResult.status as StepResultStatus,
      error: stepResult.error?.message,
    });

    // Handle step failure based on onError policy
    if (!stepResult.success && stepResult.status === 'failed') {
      failedStep = { name: step.name, slug: step.slug, stepNumber: step.stepNumber };

      switch (step.onError) {
        case StepOnError.fail_pipeline:
          pipelineStopped = true;
          break;

        case StepOnError.skip_remaining:
          pipelineStopped = true;
          break;

        case StepOnError.continue:
          // Continue to next step
          break;

        default:
          pipelineStopped = true;
          break;
      }
    }
  }

  // Build final output
  const durationMs = Date.now() - startTime;
  const statusCounts = getStepStatusCounts(state);
  const completedSteps = statusCounts.completed;

  // Determine pipeline final status
  let finalStatus: PipelineExecutionStatus;
  let finalOutput: unknown = null;

  if (safetyViolation) {
    finalStatus =
      safetyViolation.violation?.type === 'duration_limit_exceeded'
        ? PipelineExecutionStatus.timeout
        : PipelineExecutionStatus.failed;
  } else if (failedStep && pipelineStopped) {
    finalStatus = PipelineExecutionStatus.failed;
  } else {
    finalStatus = PipelineExecutionStatus.completed;
  }

  // Build output from output mapping
  if (outputMapping && typeof outputMapping === 'object' && 'fields' in outputMapping) {
    finalOutput = resolveOutputMapping(outputMapping as OutputMapping, state);
  } else {
    // Default: return the last completed step's output/reasoning
    const lastCompletedStep = [...stepMeta].reverse().find((s) => s.status === 'completed');
    if (lastCompletedStep) {
      const lastResult = state.steps[lastCompletedStep.slug];
      finalOutput = lastResult?.reasoning ?? lastResult?.output ?? null;
    }
  }

  // Update pipeline execution record
  const executionUpdate: UpdatePipelineExecutionDbInput = {
    status: finalStatus,
    state: serializeState(state) as Prisma.InputJsonValue,
    output: finalOutput != null ? (finalOutput as Prisma.InputJsonValue) : undefined,
    currentStepNumber: steps.length,
    totalCostUsd,
    totalTokens,
    completedAt: new Date(),
  };

  if (safetyViolation?.violation) {
    executionUpdate.error = {
      code: safetyViolation.violation.type.toUpperCase(),
      message: safetyViolation.violation.message,
    };
  } else if (failedStep && pipelineStopped) {
    executionUpdate.error = {
      code: PipelineErrorCodes.STEP_FAILED,
      message: `Pipeline failed at step ${failedStep.stepNumber} ("${failedStep.name}")`,
      failedStep: failedStep.slug,
      stepNumber: failedStep.stepNumber,
    };
  }

  await updatePipelineExecution(execution.id, executionUpdate);

  // Build result
  const meta: PipelineInvocationResult['meta'] = {
    pipeline: pipeline.slug,
    executionId: execution.id,
    totalSteps: steps.length,
    completedSteps,
    totalCostUsd,
    totalTokens,
    durationMs,
    steps: stepMeta,
  };

  if (finalStatus === PipelineExecutionStatus.completed) {
    return {
      success: true,
      data: finalOutput,
      meta,
    };
  }

  // Pipeline failed or timed out
  const errorCode =
    safetyViolation?.violation?.type.toUpperCase() ?? PipelineErrorCodes.STEP_FAILED;
  const errorMessage =
    safetyViolation?.violation?.message ??
    `Pipeline failed at step ${failedStep?.stepNumber} ("${failedStep?.name}")`;

  return {
    success: false,
    data: finalOutput, // Include partial results
    error: {
      code: errorCode,
      message: errorMessage,
      details: {
        failedStep: failedStep?.slug,
        stepNumber: failedStep?.stepNumber,
        partialResults: finalOutput,
      },
    },
    meta,
  };
}

// =============================================================================
// Helpers
// =============================================================================

function toStepExecutionStatus(status: string): StepExecutionStatus {
  switch (status) {
    case 'completed':
      return StepExecutionStatus.completed;
    case 'failed':
      return StepExecutionStatus.failed;
    case 'skipped':
      return StepExecutionStatus.skipped;
    default:
      return StepExecutionStatus.failed;
  }
}
