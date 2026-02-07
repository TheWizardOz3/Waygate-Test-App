/**
 * Step Condition Evaluator
 *
 * Evaluates step skip conditions against pipeline state. Conditions use
 * template expressions that resolve to truthy/falsy values, determining
 * whether a step should be skipped.
 *
 * Condition Format:
 *   {
 *     type: 'expression',
 *     expression: '{{steps.search.output.results.length}}',
 *     skipWhen: 'falsy'  // Skip when expression resolves to falsy
 *   }
 *
 * Examples:
 *   - Skip if search returned no results:
 *     { expression: '{{steps.search.output.results.length}}', skipWhen: 'falsy' }
 *   - Skip if previous step failed:
 *     { expression: '{{steps.enrich.status}}', skipWhen: 'falsy' }
 */

import type { StepCondition } from '../pipeline.schemas';
import type { PipelineState } from './state-manager';
import { resolveTemplateString, TemplateResolutionError } from './template-resolver';

// =============================================================================
// Types
// =============================================================================

export interface ConditionEvaluationResult {
  shouldSkip: boolean;
  reason?: string;
  resolvedValue?: unknown;
}

// =============================================================================
// Condition Evaluation
// =============================================================================

/**
 * Evaluates whether a step should be skipped based on its condition.
 *
 * @param condition  The step's skip condition (nullable — no condition means never skip)
 * @param state      The current pipeline state
 * @returns          Result indicating whether to skip and why
 */
export function evaluateCondition(
  condition: StepCondition | null | undefined,
  state: PipelineState
): ConditionEvaluationResult {
  // No condition means the step always executes
  if (!condition) {
    return { shouldSkip: false };
  }

  try {
    const resolvedValue = resolveTemplateString(condition.expression, state);
    const isTruthy = toBoolean(resolvedValue);

    const shouldSkip =
      (condition.skipWhen === 'truthy' && isTruthy) ||
      (condition.skipWhen === 'falsy' && !isTruthy);

    return {
      shouldSkip,
      reason: shouldSkip
        ? `Condition '${condition.expression}' resolved to ${JSON.stringify(resolvedValue)} ` +
          `(${isTruthy ? 'truthy' : 'falsy'}), skipWhen: '${condition.skipWhen}'`
        : undefined,
      resolvedValue,
    };
  } catch (err) {
    if (err instanceof TemplateResolutionError) {
      // If the expression can't be resolved (e.g., referenced step hasn't run),
      // treat it as falsy rather than failing the pipeline
      return {
        shouldSkip: condition.skipWhen === 'falsy',
        reason:
          `Condition expression '${condition.expression}' could not be resolved: ${err.message}. ` +
          `Treating as falsy.`,
        resolvedValue: undefined,
      };
    }
    throw err;
  }
}

/**
 * Converts a resolved template value to a boolean for condition evaluation.
 *
 * Truthy: non-zero numbers, non-empty strings, non-empty arrays, non-empty objects, true
 * Falsy: 0, '', null, undefined, false, empty arrays, empty objects, 'false', 'completed' is truthy
 */
function toBoolean(value: unknown): boolean {
  if (value === null || value === undefined) {
    return false;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    return value !== 0;
  }

  if (typeof value === 'string') {
    // Empty string and the literal 'false' are falsy
    return value !== '' && value !== 'false';
  }

  if (Array.isArray(value)) {
    return value.length > 0;
  }

  if (typeof value === 'object') {
    return Object.keys(value).length > 0;
  }

  return Boolean(value);
}
