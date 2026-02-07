/**
 * Pipeline Response Formatter
 *
 * Formats pipeline invocation results into agent-readable responses.
 * Follows the ToolSuccessResponse/ToolErrorResponse patterns from
 * tool-export/responses/ but adapted for pipeline-specific metadata.
 *
 * Design principles:
 * - Messages are markdown-formatted for readability
 * - Messages summarize what the pipeline accomplished (not step details)
 * - Next steps provide actionable guidance for follow-on actions
 * - Error responses include step-aware remediation
 * - Internal pipeline complexity is abstracted in the response
 */

import type { PipelineInvocationResult } from '../orchestrator/pipeline-orchestrator';

// =============================================================================
// Types
// =============================================================================

/**
 * Pipeline success response (agent-readable)
 */
export interface PipelineSuccessResponse {
  success: true;
  /** Human/agent-readable summary of what happened (markdown) */
  message: string;
  /** Final output data from the pipeline */
  data: unknown;
  /** Pipeline execution metadata */
  meta: PipelineResponseMeta;
  /** Context about resolved inputs */
  context: {
    resolvedInputs: Record<string, { original: string; resolved: string }>;
  };
  /** Follow-on instructions for the agent */
  nextSteps: string;
}

/**
 * Pipeline error response (agent-readable)
 */
export interface PipelineErrorResponse {
  success: false;
  /** What went wrong (markdown) */
  message: string;
  /** Structured error information */
  error: {
    code: string;
    details: {
      failedStep?: string;
      stepNumber?: number;
      partialResults?: unknown;
    };
  };
  /** Pipeline execution metadata */
  meta: PipelineResponseMeta;
  /** Context about what was attempted */
  context: {
    attemptedInputs: Record<string, unknown>;
  };
  /** How to fix + standard retry-and-fallback guidance */
  remediation: string;
}

/**
 * Pipeline-specific metadata
 */
export interface PipelineResponseMeta {
  pipeline: string;
  executionId: string;
  totalSteps: number;
  completedSteps: number;
  totalCostUsd: number;
  totalTokens: number;
  durationMs: number;
  steps: Array<{
    name: string;
    status: string;
    durationMs: number;
    costUsd: number;
  }>;
}

/**
 * Input for formatting pipeline responses
 */
export interface PipelineFormatterInput {
  /** Pipeline name (human-readable) */
  pipelineName: string;
  /** Pipeline slug */
  pipelineSlug: string;
  /** Invocation result from the orchestrator */
  result: PipelineInvocationResult;
  /** Original input parameters */
  originalInput: Record<string, unknown>;
  /** Custom success template (from Pipeline.toolSuccessTemplate) */
  storedSuccessTemplate?: string | null;
  /** Custom error template (from Pipeline.toolErrorTemplate) */
  storedErrorTemplate?: string | null;
}

// =============================================================================
// Success Formatter
// =============================================================================

/**
 * Format a successful pipeline invocation into an agent-readable response.
 */
export function formatPipelineSuccessResponse(
  input: PipelineFormatterInput
): PipelineSuccessResponse {
  const { pipelineName, result } = input;

  // Build message
  let message: string;

  if (input.storedSuccessTemplate) {
    message = interpolateTemplate(input.storedSuccessTemplate, buildTemplateVars(input));
  } else {
    message = buildSuccessMessage(pipelineName, result);
  }

  // Build next steps
  const nextSteps = buildNextSteps(pipelineName, result);

  // Map step meta (strip slug for agent-facing response)
  const stepsMeta = result.meta.steps.map((s) => ({
    name: s.name,
    status: s.status,
    durationMs: s.durationMs,
    costUsd: s.costUsd,
  }));

  return {
    success: true,
    message,
    data: result.data,
    meta: {
      pipeline: result.meta.pipeline,
      executionId: result.meta.executionId,
      totalSteps: result.meta.totalSteps,
      completedSteps: result.meta.completedSteps,
      totalCostUsd: result.meta.totalCostUsd,
      totalTokens: result.meta.totalTokens,
      durationMs: result.meta.durationMs,
      steps: stepsMeta,
    },
    context: {
      resolvedInputs: {},
    },
    nextSteps,
  };
}

/**
 * Build success message from pipeline result
 */
function buildSuccessMessage(pipelineName: string, result: PipelineInvocationResult): string {
  const lines: string[] = [];

  lines.push(`## ${pipelineName} completed successfully`);
  lines.push('');

  // Summarize what was accomplished
  const completedCount = result.meta.completedSteps;
  const totalCount = result.meta.totalSteps;

  if (completedCount === totalCount) {
    lines.push(`All ${totalCount} operations completed successfully.`);
  } else {
    lines.push(`${completedCount} of ${totalCount} operations completed.`);
  }

  // Include cost/duration if meaningful
  if (result.meta.totalCostUsd > 0) {
    lines.push(
      `Execution took ${formatDuration(result.meta.durationMs)} ` +
        `(cost: $${result.meta.totalCostUsd.toFixed(4)}).`
    );
  } else {
    lines.push(`Execution took ${formatDuration(result.meta.durationMs)}.`);
  }

  // Include data summary if available
  if (result.data && typeof result.data === 'object') {
    const dataObj = result.data as Record<string, unknown>;
    const dataKeys = Object.keys(dataObj);
    if (dataKeys.length > 0 && dataKeys.length <= 5) {
      lines.push('');
      lines.push('**Result fields:** ' + dataKeys.join(', '));
    }
  }

  return lines.join('\n');
}

/**
 * Build next steps guidance for successful pipeline completion
 */
function buildNextSteps(pipelineName: string, result: PipelineInvocationResult): string {
  const lines = ['## In your response:'];

  lines.push(`- Confirm that ${pipelineName} completed successfully`);
  lines.push('- Summarize the key results from the data');
  lines.push('- If this was part of a larger task, proceed with the next step');

  if (result.meta.totalCostUsd > 0.1) {
    lines.push(
      `- Note: This operation cost $${result.meta.totalCostUsd.toFixed(4)} — ` +
        'consider whether additional invocations are necessary'
    );
  }

  return lines.join('\n');
}

// =============================================================================
// Error Formatter
// =============================================================================

/**
 * Format a failed pipeline invocation into an agent-readable error response.
 */
export function formatPipelineErrorResponse(input: PipelineFormatterInput): PipelineErrorResponse {
  const { pipelineName, result } = input;

  // Build message
  let message: string;

  if (input.storedErrorTemplate) {
    message = interpolateTemplate(input.storedErrorTemplate, buildTemplateVars(input));
  } else {
    message = buildErrorMessage(pipelineName, result);
  }

  // Build remediation
  const remediation = buildRemediation(result);

  // Map step meta
  const stepsMeta = result.meta.steps.map((s) => ({
    name: s.name,
    status: s.status,
    durationMs: s.durationMs,
    costUsd: s.costUsd,
  }));

  return {
    success: false,
    message,
    error: {
      code: result.error?.code ?? 'PIPELINE_FAILED',
      details: {
        failedStep: result.error?.details?.failedStep,
        stepNumber: result.error?.details?.stepNumber,
        partialResults: result.error?.details?.partialResults,
      },
    },
    meta: {
      pipeline: result.meta.pipeline,
      executionId: result.meta.executionId,
      totalSteps: result.meta.totalSteps,
      completedSteps: result.meta.completedSteps,
      totalCostUsd: result.meta.totalCostUsd,
      totalTokens: result.meta.totalTokens,
      durationMs: result.meta.durationMs,
      steps: stepsMeta,
    },
    context: {
      attemptedInputs: input.originalInput,
    },
    remediation,
  };
}

/**
 * Build error message from pipeline result
 */
function buildErrorMessage(pipelineName: string, result: PipelineInvocationResult): string {
  const lines: string[] = [];
  const errorCode = result.error?.code ?? 'UNKNOWN';

  switch (errorCode) {
    case 'COST_LIMIT_EXCEEDED':
      lines.push(`## ${pipelineName} stopped: Cost limit exceeded`);
      lines.push('');
      lines.push(result.error?.message ?? 'The pipeline exceeded its cost limit.');
      lines.push(`Cost: $${result.meta.totalCostUsd.toFixed(4)}`);
      break;

    case 'DURATION_LIMIT_EXCEEDED':
      lines.push(`## ${pipelineName} timed out`);
      lines.push('');
      lines.push(result.error?.message ?? 'The pipeline exceeded its duration limit.');
      lines.push(`Duration: ${formatDuration(result.meta.durationMs)}`);
      break;

    case 'STEP_FAILED':
      lines.push(`## ${pipelineName} failed`);
      lines.push('');
      lines.push(result.error?.message ?? 'A step in the pipeline failed.');
      if (result.error?.details?.failedStep) {
        lines.push(`Failed at: ${result.error.details.failedStep}`);
      }
      break;

    default:
      lines.push(`## Error in ${pipelineName}`);
      lines.push('');
      lines.push(result.error?.message ?? 'An unexpected error occurred.');
  }

  // Note partial results
  if (result.meta.completedSteps > 0) {
    lines.push('');
    lines.push(
      `**Partial results available:** ${result.meta.completedSteps} of ` +
        `${result.meta.totalSteps} operations completed before failure.`
    );
  }

  return lines.join('\n');
}

/**
 * Build remediation guidance based on error type
 */
function buildRemediation(result: PipelineInvocationResult): string {
  const lines = ['## How to fix:'];
  const errorCode = result.error?.code ?? 'UNKNOWN';

  switch (errorCode) {
    case 'COST_LIMIT_EXCEEDED':
      lines.push('1. The pipeline exceeded its configured cost limit');
      lines.push('2. Partial results from completed steps are available in the data field');
      lines.push('3. Consider simplifying the request or asking the user to adjust cost limits');
      break;

    case 'DURATION_LIMIT_EXCEEDED':
      lines.push('1. The pipeline timed out before completing all operations');
      lines.push('2. Partial results from completed steps are available in the data field');
      lines.push('3. Consider breaking the request into smaller, more focused operations');
      break;

    case 'STEP_FAILED':
      lines.push('1. One of the internal operations failed');
      lines.push('2. Check the error details for specific failure information');
      lines.push('3. You can retry the pipeline with the same or modified input');
      if (result.meta.completedSteps > 0) {
        lines.push('4. Partial results from earlier operations are available in the data field');
      }
      break;

    default:
      lines.push('1. An unexpected error occurred during pipeline execution');
      lines.push('2. You can retry the pipeline once');
      lines.push('3. If the error persists, inform the user');
      lines.push(`4. Execution ID for debugging: ${result.meta.executionId}`);
  }

  lines.push('');
  lines.push(
    'If you have already retried with a different approach and are still encountering this error, ' +
      'skip this step and proceed to your next task.'
  );

  return lines.join('\n');
}

// =============================================================================
// Combined Formatter
// =============================================================================

/**
 * Format a pipeline invocation result into the appropriate response type.
 * Dispatches to success or error formatter based on result.
 */
export function formatPipelineResponse(
  input: PipelineFormatterInput
): PipelineSuccessResponse | PipelineErrorResponse {
  if (input.result.success) {
    return formatPipelineSuccessResponse(input);
  }
  return formatPipelineErrorResponse(input);
}

/**
 * Format a pipeline response for direct use in LLM responses.
 * Combines the message and next steps / remediation into a single string.
 */
export function formatPipelineResponseForLLM(
  response: PipelineSuccessResponse | PipelineErrorResponse
): string {
  if (response.success) {
    return `${response.message}\n\n${response.nextSteps}`;
  }
  return `${response.message}\n\n${response.remediation}`;
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Format duration in milliseconds to human-readable string
 */
function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  const seconds = ms / 1000;
  if (seconds < 60) {
    return `${seconds.toFixed(1)}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60);
  return `${minutes}m ${remainingSeconds}s`;
}

/**
 * Build template variables for template interpolation
 */
function buildTemplateVars(input: PipelineFormatterInput): Record<string, string> {
  const { pipelineName, result } = input;
  return {
    pipeline_name: pipelineName,
    pipeline_slug: input.pipelineSlug,
    execution_id: result.meta.executionId,
    total_steps: String(result.meta.totalSteps),
    completed_steps: String(result.meta.completedSteps),
    total_cost: result.meta.totalCostUsd.toFixed(4),
    duration: formatDuration(result.meta.durationMs),
    error_code: result.error?.code ?? '',
    error_message: result.error?.message ?? '',
    failed_step: result.error?.details?.failedStep ?? '',
  };
}

/**
 * Interpolate template with variables.
 * Replaces {{variable_name}} with actual values.
 */
function interpolateTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return vars[key] !== undefined ? vars[key] : match;
  });
}
