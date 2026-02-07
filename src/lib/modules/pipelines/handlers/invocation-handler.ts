/**
 * Pipeline Invocation Handler
 *
 * Main entry point for invoking pipeline tools. Resolves the pipeline,
 * validates status, delegates to the orchestrator, and returns a
 * standardized result.
 *
 * This handler:
 * 1. Resolves the pipeline by ID or slug (with steps loaded)
 * 2. Validates pipeline status (must be active)
 * 3. Delegates to the pipeline orchestrator
 * 4. Returns standardized response with execution metadata
 */

import type { Pipeline, PipelineStep } from '@prisma/client';

import {
  findPipelineWithSteps,
  findPipelineBySlugWithSteps,
  type PipelineWithSteps,
} from '../pipeline.repository';
import { validatePipelineActive, PipelineError } from '../pipeline.service';
import { PipelineErrorCodes } from '../pipeline.schemas';
import { executePipeline, PipelineExecutionError } from '../orchestrator/pipeline-orchestrator';
import type { PipelineInvocationResult } from '../orchestrator/pipeline-orchestrator';
import type { GatewayInvokeOptions } from '../../gateway/gateway.schemas';

// =============================================================================
// Types
// =============================================================================

/**
 * Input for invoking a pipeline
 */
export interface InvokePipelineInput {
  /** Pipeline ID (UUID) or slug */
  pipelineIdentifier: string;
  /** Tenant ID */
  tenantId: string;
  /** Pipeline input parameters */
  params: Record<string, unknown>;
  /** Optional request ID for tracing */
  requestId?: string;
  /** Optional gateway options forwarded to each step (e.g., context for name→ID resolution) */
  gatewayOptions?: GatewayInvokeOptions;
}

/**
 * Result of pipeline invocation
 */
export interface InvokePipelineResult {
  /** Whether the pipeline completed successfully */
  success: boolean;
  /** Final output from output mapping */
  data?: unknown;
  /** Error details (if failed) */
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
  /** Execution metadata */
  metadata: {
    /** Pipeline ID */
    pipelineId: string;
    /** Pipeline slug */
    pipelineSlug: string;
    /** Execution ID */
    executionId: string;
    /** Total steps in pipeline */
    totalSteps: number;
    /** Number of completed steps */
    completedSteps: number;
    /** Total cost in USD */
    totalCostUsd: number;
    /** Total tokens used across all reasoning */
    totalTokens: number;
    /** Total duration in milliseconds */
    durationMs: number;
    /** Request ID for tracing */
    requestId?: string;
    /** Per-step execution summary */
    steps: Array<{
      name: string;
      slug: string;
      status: string;
      durationMs: number;
      costUsd: number;
    }>;
  };
}

// =============================================================================
// Main Invocation Handler
// =============================================================================

/**
 * Invoke a pipeline tool
 *
 * This is the main entry point for executing pipelines. It:
 * 1. Resolves the pipeline by ID or slug
 * 2. Validates pipeline is active
 * 3. Delegates to the orchestrator
 * 4. Returns standardized result
 *
 * @param input - Invocation input
 * @returns Invocation result with metadata
 */
export async function invokePipeline(input: InvokePipelineInput): Promise<InvokePipelineResult> {
  const { pipelineIdentifier, tenantId, params, requestId, gatewayOptions } = input;

  try {
    // Step 1: Resolve pipeline by ID or slug (with steps loaded)
    const pipelineWithSteps = await resolvePipeline(tenantId, pipelineIdentifier);

    // Step 2: Validate pipeline is active
    validatePipelineActive(pipelineWithSteps as Pipeline);

    // Step 3: Delegate to orchestrator
    const result = await executePipeline({
      pipeline: pipelineWithSteps as Pipeline,
      steps: pipelineWithSteps.steps as PipelineStep[],
      tenantId,
      params,
      gatewayOptions,
    });

    // Step 4: Return standardized result
    return toInvocationResult(pipelineWithSteps, result, requestId);
  } catch (error) {
    // Handle known pipeline errors
    if (error instanceof PipelineInvocationError) {
      return {
        success: false,
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
        },
        metadata: emptyMetadata(requestId),
      };
    }

    if (error instanceof PipelineError) {
      return {
        success: false,
        error: {
          code: error.code,
          message: error.message,
        },
        metadata: emptyMetadata(requestId),
      };
    }

    if (error instanceof PipelineExecutionError) {
      return {
        success: false,
        error: {
          code: error.code,
          message: error.message,
        },
        metadata: emptyMetadata(requestId),
      };
    }

    // Unknown error
    return {
      success: false,
      error: {
        code: 'UNKNOWN_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error occurred',
      },
      metadata: emptyMetadata(requestId),
    };
  }
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Resolve pipeline by ID or slug, loading steps in order
 */
async function resolvePipeline(tenantId: string, identifier: string): Promise<PipelineWithSteps> {
  // Check if identifier is a UUID
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(identifier);

  let pipeline: PipelineWithSteps | null = null;

  if (isUuid) {
    pipeline = await findPipelineWithSteps(identifier, tenantId);
  } else {
    pipeline = await findPipelineBySlugWithSteps(tenantId, identifier);
  }

  if (!pipeline) {
    throw new PipelineInvocationError(
      PipelineErrorCodes.PIPELINE_NOT_FOUND,
      `Pipeline not found: ${identifier}`
    );
  }

  return pipeline;
}

/**
 * Convert orchestrator result to invocation result format
 */
function toInvocationResult(
  pipeline: PipelineWithSteps,
  result: PipelineInvocationResult,
  requestId?: string
): InvokePipelineResult {
  return {
    success: result.success,
    data: result.data,
    error: result.error
      ? {
          code: result.error.code,
          message: result.error.message,
          details: result.error.details as Record<string, unknown> | undefined,
        }
      : undefined,
    metadata: {
      pipelineId: pipeline.id,
      pipelineSlug: pipeline.slug,
      executionId: result.meta.executionId,
      totalSteps: result.meta.totalSteps,
      completedSteps: result.meta.completedSteps,
      totalCostUsd: result.meta.totalCostUsd,
      totalTokens: result.meta.totalTokens,
      durationMs: result.meta.durationMs,
      requestId,
      steps: result.meta.steps,
    },
  };
}

/**
 * Create empty metadata for error responses (before pipeline is resolved)
 */
function emptyMetadata(requestId?: string): InvokePipelineResult['metadata'] {
  return {
    pipelineId: '',
    pipelineSlug: '',
    executionId: '',
    totalSteps: 0,
    completedSteps: 0,
    totalCostUsd: 0,
    totalTokens: 0,
    durationMs: 0,
    requestId,
    steps: [],
  };
}

// =============================================================================
// Error Class
// =============================================================================

/**
 * Error thrown during pipeline invocation
 */
export class PipelineInvocationError extends Error {
  constructor(
    public code: string,
    message: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'PipelineInvocationError';
  }
}
