/**
 * Template Resolver
 *
 * Parses and resolves {{expression}} template strings within pipeline
 * step input mappings. Supports dot notation for nested property access
 * and array indexing via [n].
 *
 * Template expressions reference the pipeline state:
 *   {{input.query}}                      - Pipeline input parameter
 *   {{steps.search.output}}              - Full output of a step
 *   {{steps.search.output.results[0].url}} - Nested property + array index
 *   {{steps.search.reasoning}}           - LLM reasoning output of a step
 *   {{steps.search.status}}              - Status of a step
 */

import type { PipelineState } from './state-manager';

// =============================================================================
// Types
// =============================================================================

export class TemplateResolutionError extends Error {
  public readonly code = 'TEMPLATE_RESOLUTION_ERROR';
  public readonly expression: string;

  constructor(expression: string, message: string) {
    super(`Template resolution error for '${expression}': ${message}`);
    this.name = 'TemplateResolutionError';
    this.expression = expression;
  }
}

// =============================================================================
// Template Expression Parsing
// =============================================================================

/** Regex to match {{expression}} patterns (non-greedy) */
const TEMPLATE_PATTERN = /\{\{([^}]+)\}\}/g;

/** Regex to parse a single path segment — property name or array access */
const PATH_SEGMENT_PATTERN = /^([a-zA-Z_$][a-zA-Z0-9_$]*)(?:\[(\d+)\])?$/;

/**
 * Parses a dot-notation path with optional array indices into segments.
 *
 * Examples:
 *   "input.query" → ['input', 'query']
 *   "steps.search.output.results[0].url" → ['steps', 'search', 'output', 'results', 0, 'url']
 */
export function parsePath(path: string): (string | number)[] {
  const rawSegments = path.trim().split('.');
  const result: (string | number)[] = [];

  for (const rawSegment of rawSegments) {
    if (!rawSegment) {
      throw new TemplateResolutionError(
        path,
        'Empty path segment (double dots or leading/trailing dot)'
      );
    }

    const match = PATH_SEGMENT_PATTERN.exec(rawSegment);
    if (!match) {
      throw new TemplateResolutionError(path, `Invalid path segment: '${rawSegment}'`);
    }

    result.push(match[1]);
    if (match[2] !== undefined) {
      result.push(parseInt(match[2], 10));
    }
  }

  return result;
}

/**
 * Resolves a parsed path against the pipeline state.
 * Returns the value at the path, or undefined if not found.
 */
export function resolvePathValue(state: PipelineState, segments: (string | number)[]): unknown {
  let current: unknown = state;

  for (const segment of segments) {
    if (current === null || current === undefined) {
      return undefined;
    }

    if (typeof segment === 'number') {
      if (!Array.isArray(current)) {
        return undefined;
      }
      current = current[segment];
    } else {
      if (typeof current !== 'object') {
        return undefined;
      }
      current = (current as Record<string, unknown>)[segment];
    }
  }

  return current;
}

/**
 * Resolves a single {{expression}} string against pipeline state.
 * Validates that referenced steps exist in state.
 */
export function resolveExpression(expression: string, state: PipelineState): unknown {
  const trimmed = expression.trim();
  const segments = parsePath(trimmed);

  // Validate that step references point to completed/failed/skipped steps
  if (segments[0] === 'steps' && typeof segments[1] === 'string') {
    const stepSlug = segments[1];
    if (!state.steps[stepSlug]) {
      throw new TemplateResolutionError(
        trimmed,
        `Step '${stepSlug}' referenced in template but hasn't executed yet`
      );
    }
  }

  return resolvePathValue(state, segments);
}

// =============================================================================
// Template Resolution
// =============================================================================

/**
 * Resolves a string that may contain one or more {{expression}} patterns.
 *
 * - If the string is EXACTLY one template (e.g., "{{steps.search.output}}"),
 *   returns the raw resolved value (preserving type: object, array, number, etc.)
 * - If the string contains templates mixed with literal text (e.g., "Hello {{input.name}}"),
 *   returns a string with templates replaced by their string representations
 */
export function resolveTemplateString(template: string, state: PipelineState): unknown {
  // Check if the entire string is a single template expression
  const singleMatch = /^\{\{([^}]+)\}\}$/.exec(template);
  if (singleMatch) {
    return resolveExpression(singleMatch[1], state);
  }

  // Mixed template — resolve all expressions and interpolate as string
  return template.replace(TEMPLATE_PATTERN, (_match, expression: string) => {
    const value = resolveExpression(expression, state);
    if (value === undefined || value === null) {
      return '';
    }
    if (typeof value === 'object') {
      return JSON.stringify(value);
    }
    return String(value);
  });
}

/**
 * Deep-walks an object/array and resolves all {{expression}} template strings.
 * Non-string values are passed through unchanged.
 *
 * @param template  The template object (typically a step's inputMapping)
 * @param state     The current pipeline state
 * @returns         A new object with all templates resolved
 */
export function resolveTemplates(
  template: Record<string, unknown>,
  state: PipelineState
): Record<string, unknown> {
  return deepResolve(template, state) as Record<string, unknown>;
}

/**
 * Recursively resolves templates in any value.
 */
function deepResolve(value: unknown, state: PipelineState): unknown {
  if (typeof value === 'string') {
    // Only process strings that contain template patterns
    if (TEMPLATE_PATTERN.test(value)) {
      // Reset regex lastIndex since we used .test()
      TEMPLATE_PATTERN.lastIndex = 0;
      return resolveTemplateString(value, state);
    }
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => deepResolve(item, state));
  }

  if (value !== null && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      result[key] = deepResolve(val, state);
    }
    return result;
  }

  // Primitives (number, boolean, null, undefined) pass through
  return value;
}

/**
 * Extracts all template expression strings from a value (for validation/preview).
 */
export function extractTemplateExpressions(value: unknown): string[] {
  const expressions: string[] = [];

  function walk(v: unknown): void {
    if (typeof v === 'string') {
      TEMPLATE_PATTERN.lastIndex = 0;
      let match;
      while ((match = TEMPLATE_PATTERN.exec(v)) !== null) {
        expressions.push(match[1].trim());
      }
    } else if (Array.isArray(v)) {
      v.forEach(walk);
    } else if (v !== null && typeof v === 'object') {
      Object.values(v).forEach(walk);
    }
  }

  walk(value);
  return expressions;
}

/**
 * Validates that all template expressions in a value reference valid paths.
 * Returns an array of validation errors (empty if all valid).
 *
 * This is a lightweight check used at pipeline design time — it validates
 * that expressions start with 'input' or 'steps' and have valid path syntax.
 */
export function validateTemplateExpressions(
  value: unknown,
  availableStepSlugs: string[]
): string[] {
  const errors: string[] = [];
  const expressions = extractTemplateExpressions(value);

  for (const expr of expressions) {
    try {
      const segments = parsePath(expr);
      const root = segments[0];

      if (root !== 'input' && root !== 'steps') {
        errors.push(`Expression '${expr}' must start with 'input' or 'steps'`);
        continue;
      }

      if (root === 'steps') {
        if (segments.length < 2 || typeof segments[1] !== 'string') {
          errors.push(`Expression '${expr}' must reference a step slug after 'steps.'`);
          continue;
        }
        const stepSlug = segments[1];
        if (!availableStepSlugs.includes(stepSlug)) {
          errors.push(
            `Expression '${expr}' references step '${stepSlug}' which is not available. ` +
              `Available steps: ${availableStepSlugs.join(', ')}`
          );
        }
      }
    } catch (err) {
      errors.push(
        err instanceof TemplateResolutionError
          ? err.message
          : `Invalid expression '${expr}': ${String(err)}`
      );
    }
  }

  return errors;
}
