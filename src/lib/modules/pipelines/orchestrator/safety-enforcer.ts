/**
 * Pipeline Safety Enforcer
 *
 * Enforces cost and duration limits during pipeline execution.
 * Checked between steps to prevent runaway pipelines.
 *
 * Safety limits are configured per-pipeline:
 *   - maxCostUsd: Maximum accumulated cost across all steps and reasoning (default: $5)
 *   - maxDurationSeconds: Maximum total pipeline execution time (default: 1800s / 30 min)
 *
 * When a limit is exceeded, the pipeline completes the current step and then
 * stops — partial results from completed steps are preserved.
 */

import type { PipelineSafetyLimits } from '../pipeline.schemas';

// =============================================================================
// Types
// =============================================================================

export type SafetyViolationType = 'cost_limit_exceeded' | 'duration_limit_exceeded';

export interface SafetyCheckResult {
  safe: boolean;
  violation?: {
    type: SafetyViolationType;
    message: string;
    limit: number;
    current: number;
  };
}

export interface SafetyContext {
  /** Accumulated cost in USD across all completed steps */
  totalCostUsd: number;
  /** Pipeline execution start time */
  startedAt: Date;
  /** Current step number (1-based) */
  currentStepNumber: number;
  /** Total number of steps in the pipeline */
  totalSteps: number;
}

// =============================================================================
// Default Limits
// =============================================================================

export const DEFAULT_SAFETY_LIMITS: PipelineSafetyLimits = {
  maxCostUsd: 5,
  maxDurationSeconds: 1800,
};

// =============================================================================
// Safety Enforcement
// =============================================================================

/**
 * Checks whether the pipeline can safely continue to the next step.
 * Call this between steps (after one completes, before the next starts).
 *
 * @param limits   Pipeline safety limits (or defaults)
 * @param context  Current execution metrics
 * @returns        Result indicating whether it's safe to continue
 */
export function checkSafetyLimits(
  limits: PipelineSafetyLimits | null | undefined,
  context: SafetyContext
): SafetyCheckResult {
  const effectiveLimits = resolveEffectiveLimits(limits);

  // Check cost limit
  const costResult = checkCostLimit(effectiveLimits.maxCostUsd, context.totalCostUsd);
  if (!costResult.safe) {
    return costResult;
  }

  // Check duration limit
  const durationResult = checkDurationLimit(effectiveLimits.maxDurationSeconds, context.startedAt);
  if (!durationResult.safe) {
    return durationResult;
  }

  return { safe: true };
}

/**
 * Checks the cost limit.
 */
function checkCostLimit(maxCostUsd: number, totalCostUsd: number): SafetyCheckResult {
  if (totalCostUsd >= maxCostUsd) {
    return {
      safe: false,
      violation: {
        type: 'cost_limit_exceeded',
        message:
          `Pipeline cost limit exceeded: $${totalCostUsd.toFixed(4)} >= ` +
          `$${maxCostUsd.toFixed(2)} limit. Pipeline will stop after current step.`,
        limit: maxCostUsd,
        current: totalCostUsd,
      },
    };
  }
  return { safe: true };
}

/**
 * Checks the duration limit.
 */
function checkDurationLimit(maxDurationSeconds: number, startedAt: Date): SafetyCheckResult {
  const elapsedMs = Date.now() - startedAt.getTime();
  const elapsedSeconds = elapsedMs / 1000;

  if (elapsedSeconds >= maxDurationSeconds) {
    return {
      safe: false,
      violation: {
        type: 'duration_limit_exceeded',
        message:
          `Pipeline duration limit exceeded: ${elapsedSeconds.toFixed(1)}s >= ` +
          `${maxDurationSeconds}s limit. Pipeline will stop after current step.`,
        limit: maxDurationSeconds,
        current: elapsedSeconds,
      },
    };
  }
  return { safe: true };
}

/**
 * Merges user-configured limits with defaults.
 */
export function resolveEffectiveLimits(
  limits: PipelineSafetyLimits | null | undefined
): PipelineSafetyLimits {
  if (!limits) {
    return { ...DEFAULT_SAFETY_LIMITS };
  }
  return {
    maxCostUsd: limits.maxCostUsd ?? DEFAULT_SAFETY_LIMITS.maxCostUsd,
    maxDurationSeconds: limits.maxDurationSeconds ?? DEFAULT_SAFETY_LIMITS.maxDurationSeconds,
  };
}

/**
 * Calculates the elapsed duration in milliseconds since pipeline start.
 */
export function getElapsedMs(startedAt: Date): number {
  return Date.now() - startedAt.getTime();
}
