/**
 * Routing Rule Evaluator
 *
 * Evaluates routing conditions against input parameters to determine
 * if a rule matches. Supports multiple condition types: contains, equals,
 * matches (regex), starts_with, and ends_with.
 *
 * All evaluations are deterministic and execute server-side for security.
 */

import type { RoutingRule } from '@prisma/client';
import type { RoutingConditionType } from '../composite-tool.schemas';

// =============================================================================
// Types
// =============================================================================

/**
 * Result of evaluating a routing rule
 */
export interface RuleEvaluationResult {
  /** Whether the rule matched */
  matched: boolean;
  /** The rule that was evaluated */
  rule: RoutingRule;
  /** Reason for the match/non-match (for debugging/logging) */
  reason: string;
}

/**
 * Input parameters for routing evaluation
 */
export type RoutingParams = Record<string, unknown>;

// =============================================================================
// Error Class
// =============================================================================

/**
 * Error thrown when rule evaluation fails
 */
export class RuleEvaluationError extends Error {
  constructor(
    message: string,
    public readonly ruleId: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'RuleEvaluationError';
  }
}

// =============================================================================
// Condition Evaluators
// =============================================================================

/**
 * Evaluates a "contains" condition
 * Checks if the field value contains the condition value as a substring
 */
function evaluateContains(
  fieldValue: string,
  conditionValue: string,
  caseSensitive: boolean
): boolean {
  const normalizedField = caseSensitive ? fieldValue : fieldValue.toLowerCase();
  const normalizedCondition = caseSensitive ? conditionValue : conditionValue.toLowerCase();
  return normalizedField.includes(normalizedCondition);
}

/**
 * Evaluates an "equals" condition
 * Checks if the field value exactly matches the condition value
 */
function evaluateEquals(
  fieldValue: string,
  conditionValue: string,
  caseSensitive: boolean
): boolean {
  if (caseSensitive) {
    return fieldValue === conditionValue;
  }
  return fieldValue.toLowerCase() === conditionValue.toLowerCase();
}

/**
 * Evaluates a "matches" condition (regex)
 * Checks if the field value matches the regex pattern
 *
 * Note: Regex patterns are evaluated safely with error handling
 */
function evaluateMatches(
  fieldValue: string,
  conditionValue: string,
  caseSensitive: boolean
): boolean {
  try {
    const flags = caseSensitive ? '' : 'i';
    const regex = new RegExp(conditionValue, flags);
    return regex.test(fieldValue);
  } catch {
    // Invalid regex pattern - treat as non-match
    return false;
  }
}

/**
 * Evaluates a "starts_with" condition
 * Checks if the field value starts with the condition value
 */
function evaluateStartsWith(
  fieldValue: string,
  conditionValue: string,
  caseSensitive: boolean
): boolean {
  const normalizedField = caseSensitive ? fieldValue : fieldValue.toLowerCase();
  const normalizedCondition = caseSensitive ? conditionValue : conditionValue.toLowerCase();
  return normalizedField.startsWith(normalizedCondition);
}

/**
 * Evaluates an "ends_with" condition
 * Checks if the field value ends with the condition value
 */
function evaluateEndsWith(
  fieldValue: string,
  conditionValue: string,
  caseSensitive: boolean
): boolean {
  const normalizedField = caseSensitive ? fieldValue : fieldValue.toLowerCase();
  const normalizedCondition = caseSensitive ? conditionValue : conditionValue.toLowerCase();
  return normalizedField.endsWith(normalizedCondition);
}

// =============================================================================
// Main Evaluation Functions
// =============================================================================

/**
 * Extracts a field value from the input parameters
 * Supports nested field access using dot notation (e.g., "data.url")
 */
export function extractFieldValue(params: RoutingParams, field: string): string | null {
  const parts = field.split('.');
  let current: unknown = params;

  for (const part of parts) {
    if (current === null || current === undefined) {
      return null;
    }
    if (typeof current !== 'object') {
      return null;
    }
    current = (current as Record<string, unknown>)[part];
  }

  // Convert to string for comparison
  if (current === null || current === undefined) {
    return null;
  }

  if (typeof current === 'string') {
    return current;
  }

  if (typeof current === 'number' || typeof current === 'boolean') {
    return String(current);
  }

  // For objects/arrays, stringify them
  return JSON.stringify(current);
}

/**
 * Evaluates a single condition against a field value
 */
export function evaluateCondition(
  conditionType: RoutingConditionType,
  fieldValue: string,
  conditionValue: string,
  caseSensitive: boolean
): boolean {
  switch (conditionType) {
    case 'contains':
      return evaluateContains(fieldValue, conditionValue, caseSensitive);
    case 'equals':
      return evaluateEquals(fieldValue, conditionValue, caseSensitive);
    case 'matches':
      return evaluateMatches(fieldValue, conditionValue, caseSensitive);
    case 'starts_with':
      return evaluateStartsWith(fieldValue, conditionValue, caseSensitive);
    case 'ends_with':
      return evaluateEndsWith(fieldValue, conditionValue, caseSensitive);
    default:
      // Unknown condition type - treat as non-match
      return false;
  }
}

/**
 * Evaluates a routing rule against input parameters
 *
 * @param rule - The routing rule to evaluate
 * @param params - Input parameters from the composite tool invocation
 * @returns Evaluation result with match status and reason
 */
export function evaluateRule(rule: RoutingRule, params: RoutingParams): RuleEvaluationResult {
  // Extract the field value from params
  const fieldValue = extractFieldValue(params, rule.conditionField);

  // If the field doesn't exist or is null, the rule doesn't match
  if (fieldValue === null) {
    return {
      matched: false,
      rule,
      reason: `Field '${rule.conditionField}' not found or is null`,
    };
  }

  // Evaluate the condition
  const matched = evaluateCondition(
    rule.conditionType as RoutingConditionType,
    fieldValue,
    rule.conditionValue,
    rule.caseSensitive
  );

  const reason = matched
    ? `Field '${rule.conditionField}' ${rule.conditionType} '${rule.conditionValue}'`
    : `Field '${rule.conditionField}' does not ${rule.conditionType} '${rule.conditionValue}'`;

  return {
    matched,
    rule,
    reason,
  };
}

/**
 * Evaluates multiple routing rules in priority order and returns the first match
 *
 * Rules are evaluated in the order provided (should be pre-sorted by priority).
 * Returns the first rule that matches, or null if none match.
 *
 * @param rules - Routing rules sorted by priority (ascending)
 * @param params - Input parameters from the composite tool invocation
 * @returns The first matching rule evaluation, or null if none match
 */
export function evaluateRulesInOrder(
  rules: RoutingRule[],
  params: RoutingParams
): RuleEvaluationResult | null {
  for (const rule of rules) {
    const result = evaluateRule(rule, params);
    if (result.matched) {
      return result;
    }
  }
  return null;
}

/**
 * Evaluates all routing rules and returns all results
 * Useful for debugging and testing rule configurations
 *
 * @param rules - Routing rules to evaluate
 * @param params - Input parameters from the composite tool invocation
 * @returns Array of all evaluation results
 */
export function evaluateAllRules(
  rules: RoutingRule[],
  params: RoutingParams
): RuleEvaluationResult[] {
  return rules.map((rule) => evaluateRule(rule, params));
}
