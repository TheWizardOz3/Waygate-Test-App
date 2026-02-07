/**
 * Pipeline State Manager
 *
 * Manages the accumulated state of a pipeline execution. State grows as each
 * step completes, storing tool outputs, reasoning outputs, and step statuses.
 *
 * State is immutable per operation — each mutation returns a new state object
 * to prevent accidental cross-step contamination.
 *
 * State Structure:
 *   {
 *     input: { ... },         // Pipeline-level input parameters
 *     steps: {
 *       [stepSlug]: {
 *         output: unknown,    // Raw tool output
 *         reasoning?: unknown,// LLM reasoning output (if enabled)
 *         status: 'completed' | 'failed' | 'skipped',
 *         error?: string,     // Error message if step failed
 *       }
 *     }
 *   }
 */

// =============================================================================
// Types
// =============================================================================

export type StepResultStatus = 'completed' | 'failed' | 'skipped';

export interface StepResult {
  output: unknown;
  reasoning?: unknown;
  status: StepResultStatus;
  error?: string;
}

export interface PipelineState {
  input: Record<string, unknown>;
  steps: Record<string, StepResult>;
}

export interface StepCompletionData {
  stepSlug: string;
  output: unknown;
  reasoning?: unknown;
  status: StepResultStatus;
  error?: string;
}

// =============================================================================
// State Manager
// =============================================================================

/**
 * Creates the initial pipeline state from the pipeline input parameters.
 */
export function createInitialState(input: Record<string, unknown>): PipelineState {
  return {
    input: { ...input },
    steps: {},
  };
}

/**
 * Records a step's results into the pipeline state.
 * Returns a new state object (immutable).
 */
export function recordStepResult(state: PipelineState, data: StepCompletionData): PipelineState {
  const stepResult: StepResult = {
    output: data.output,
    status: data.status,
  };

  if (data.reasoning !== undefined) {
    stepResult.reasoning = data.reasoning;
  }

  if (data.error !== undefined) {
    stepResult.error = data.error;
  }

  return {
    input: state.input,
    steps: {
      ...state.steps,
      [data.stepSlug]: stepResult,
    },
  };
}

/**
 * Checks whether a step slug has already been recorded in state.
 */
export function hasStepResult(state: PipelineState, stepSlug: string): boolean {
  return stepSlug in state.steps;
}

/**
 * Gets a step's result from state, or undefined if not yet recorded.
 */
export function getStepResult(state: PipelineState, stepSlug: string): StepResult | undefined {
  return state.steps[stepSlug];
}

/**
 * Returns all step slugs that have completed successfully.
 */
export function getCompletedStepSlugs(state: PipelineState): string[] {
  return Object.entries(state.steps)
    .filter(([, result]) => result.status === 'completed')
    .map(([slug]) => slug);
}

/**
 * Returns all step slugs that have been recorded (any status).
 */
export function getRecordedStepSlugs(state: PipelineState): string[] {
  return Object.keys(state.steps);
}

/**
 * Returns the count of steps by status.
 */
export function getStepStatusCounts(state: PipelineState): Record<StepResultStatus, number> {
  const counts: Record<StepResultStatus, number> = {
    completed: 0,
    failed: 0,
    skipped: 0,
  };

  for (const result of Object.values(state.steps)) {
    counts[result.status]++;
  }

  return counts;
}

/**
 * Creates a summary of the pipeline state for use in LLM reasoning prompts.
 * Includes step statuses and a compact representation of outputs.
 */
export function createStateSummary(state: PipelineState): string {
  const parts: string[] = [];

  parts.push('## Pipeline Input');
  parts.push(JSON.stringify(state.input, null, 2));

  const stepEntries = Object.entries(state.steps);
  if (stepEntries.length > 0) {
    parts.push('\n## Step Results');
    for (const [slug, result] of stepEntries) {
      parts.push(`\n### Step: ${slug} (${result.status})`);

      if (result.error) {
        parts.push(`Error: ${result.error}`);
      }

      if (result.output !== undefined && result.output !== null) {
        const outputStr = JSON.stringify(result.output, null, 2);
        // Truncate very large outputs in summaries
        if (outputStr.length > 2000) {
          parts.push(`Output (truncated): ${outputStr.slice(0, 2000)}...`);
        } else {
          parts.push(`Output: ${outputStr}`);
        }
      }

      if (result.reasoning !== undefined && result.reasoning !== null) {
        const reasoningStr = JSON.stringify(result.reasoning, null, 2);
        if (reasoningStr.length > 2000) {
          parts.push(`Reasoning (truncated): ${reasoningStr.slice(0, 2000)}...`);
        } else {
          parts.push(`Reasoning: ${reasoningStr}`);
        }
      }
    }
  }

  return parts.join('\n');
}

/**
 * Serializes state to a plain JSON object for database persistence.
 * This is the format stored in PipelineExecution.state.
 */
export function serializeState(state: PipelineState): Record<string, unknown> {
  return {
    input: state.input,
    steps: state.steps,
  };
}

/**
 * Deserializes a plain JSON object back into a PipelineState.
 * Used when resuming or querying a pipeline execution.
 */
export function deserializeState(raw: Record<string, unknown>): PipelineState {
  return {
    input: (raw.input as Record<string, unknown>) ?? {},
    steps: (raw.steps as Record<string, StepResult>) ?? {},
  };
}
