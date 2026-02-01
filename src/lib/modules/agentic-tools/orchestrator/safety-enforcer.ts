/**
 * Safety Enforcer
 *
 * Enforces safety limits for agentic tool execution to prevent runaway costs,
 * infinite loops, and excessive execution times. Used in both Parameter Interpreter
 * and Autonomous Agent modes.
 *
 * Safety limits:
 * - Max tool calls (autonomous agent mode)
 * - Max execution time (timeout)
 * - Max total cost (LLM + action costs)
 */

import type { SafetyLimits } from '../agentic-tool.schemas';

// =============================================================================
// Safety Enforcer
// =============================================================================

/**
 * Safety limit enforcement for agentic tools
 *
 * Tracks execution state and throws errors when limits are exceeded.
 *
 * @example
 * ```typescript
 * const limits: SafetyLimits = {
 *   maxToolCalls: 10,
 *   timeoutSeconds: 300,
 *   maxTotalCost: 1.0,
 * };
 *
 * const enforcer = new SafetyEnforcer(limits, Date.now());
 *
 * // Before each tool call
 * enforcer.checkToolCallLimit(currentCallCount);
 *
 * // After each LLM call
 * enforcer.checkCostLimit(totalCost);
 *
 * // Periodically during execution
 * enforcer.checkTimeout();
 * ```
 */
export class SafetyEnforcer {
  private readonly limits: SafetyLimits;
  private readonly startTime: number;

  constructor(limits: SafetyLimits, startTime: number = Date.now()) {
    this.limits = limits;
    this.startTime = startTime;
  }

  /**
   * Check if tool call limit has been exceeded
   *
   * @param currentCallCount - Number of tool calls made so far
   * @throws SafetyLimitError if limit exceeded
   */
  checkToolCallLimit(currentCallCount: number): void {
    if (currentCallCount >= this.limits.maxToolCalls) {
      throw new SafetyLimitError(
        'MAX_TOOL_CALLS_EXCEEDED',
        `Maximum tool calls exceeded (limit: ${this.limits.maxToolCalls})`,
        this.limits.maxToolCalls,
        currentCallCount
      );
    }
  }

  /**
   * Check if timeout has been exceeded
   *
   * @throws SafetyLimitError if timeout exceeded
   */
  checkTimeout(): void {
    const elapsed = Date.now() - this.startTime;
    const timeoutMs = this.limits.timeoutSeconds * 1000;

    if (elapsed >= timeoutMs) {
      throw new SafetyLimitError(
        'TIMEOUT',
        `Execution timeout exceeded (limit: ${this.limits.timeoutSeconds}s)`,
        this.limits.timeoutSeconds,
        Math.floor(elapsed / 1000)
      );
    }
  }

  /**
   * Check if cost limit has been exceeded
   *
   * @param currentCost - Total cost in USD so far
   * @throws SafetyLimitError if cost limit exceeded
   */
  checkCostLimit(currentCost: number): void {
    if (currentCost >= this.limits.maxTotalCost) {
      throw new SafetyLimitError(
        'MAX_COST_EXCEEDED',
        `Maximum cost exceeded (limit: $${this.limits.maxTotalCost.toFixed(2)})`,
        this.limits.maxTotalCost,
        currentCost
      );
    }
  }

  /**
   * Get elapsed time since start
   *
   * @returns Elapsed time in milliseconds
   */
  getElapsedMs(): number {
    return Date.now() - this.startTime;
  }

  /**
   * Get elapsed time in seconds
   *
   * @returns Elapsed time in seconds
   */
  getElapsedSeconds(): number {
    return Math.floor(this.getElapsedMs() / 1000);
  }

  /**
   * Check if execution should continue (all limits OK)
   *
   * @param currentToolCalls - Number of tool calls made
   * @param currentCost - Total cost so far
   * @returns true if can continue, false if any limit exceeded
   */
  canContinue(currentToolCalls: number, currentCost: number): boolean {
    try {
      this.checkToolCallLimit(currentToolCalls);
      this.checkTimeout();
      this.checkCostLimit(currentCost);
      return true;
    } catch (error) {
      if (error instanceof SafetyLimitError) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Get remaining capacity for each limit
   *
   * @param currentToolCalls - Current tool call count
   * @param currentCost - Current total cost
   * @returns Remaining capacity for each limit
   */
  getRemainingCapacity(
    currentToolCalls: number,
    currentCost: number
  ): {
    toolCalls: number;
    timeSeconds: number;
    cost: number;
  } {
    const elapsedSeconds = this.getElapsedSeconds();

    return {
      toolCalls: Math.max(0, this.limits.maxToolCalls - currentToolCalls),
      timeSeconds: Math.max(0, this.limits.timeoutSeconds - elapsedSeconds),
      cost: Math.max(0, this.limits.maxTotalCost - currentCost),
    };
  }

  /**
   * Get the safety limits being enforced
   *
   * @returns Safety limits configuration
   */
  getLimits(): SafetyLimits {
    return { ...this.limits };
  }
}

// =============================================================================
// Error Class
// =============================================================================

/**
 * Error thrown when a safety limit is exceeded
 */
export class SafetyLimitError extends Error {
  constructor(
    public code: 'MAX_TOOL_CALLS_EXCEEDED' | 'TIMEOUT' | 'MAX_COST_EXCEEDED',
    message: string,
    public limit: number,
    public actual: number
  ) {
    super(message);
    this.name = 'SafetyLimitError';
  }

  /**
   * Convert to API error format
   */
  toApiError(): {
    code: string;
    message: string;
    details: {
      limit: number;
      actual: number;
      exceeded: number;
    };
    retryable: boolean;
  } {
    return {
      code: this.code,
      message: this.message,
      details: {
        limit: this.limit,
        actual: this.actual,
        exceeded: this.actual - this.limit,
      },
      retryable: false, // Safety limit errors are not retryable
    };
  }
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get default safety limits
 *
 * @returns Default safety limits configuration
 */
export function getDefaultSafetyLimits(): SafetyLimits {
  return {
    maxToolCalls: 10,
    timeoutSeconds: 300, // 5 minutes
    maxTotalCost: 1.0, // $1.00
  };
}

/**
 * Merge user limits with defaults
 *
 * @param userLimits - User-provided limits (partial)
 * @returns Complete safety limits with defaults filled in
 */
export function mergeSafetyLimits(userLimits: Partial<SafetyLimits>): SafetyLimits {
  const defaults = getDefaultSafetyLimits();

  return {
    maxToolCalls: userLimits.maxToolCalls ?? defaults.maxToolCalls,
    timeoutSeconds: userLimits.timeoutSeconds ?? defaults.timeoutSeconds,
    maxTotalCost: userLimits.maxTotalCost ?? defaults.maxTotalCost,
  };
}

/**
 * Validate safety limits configuration
 *
 * @param limits - Safety limits to validate
 * @returns Validation result
 */
export function validateSafetyLimits(limits: SafetyLimits): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // Validate max tool calls
  if (limits.maxToolCalls < 1) {
    errors.push('maxToolCalls must be at least 1');
  }
  if (limits.maxToolCalls > 100) {
    errors.push('maxToolCalls cannot exceed 100');
  }

  // Validate timeout
  if (limits.timeoutSeconds < 30) {
    errors.push('timeoutSeconds must be at least 30');
  }
  if (limits.timeoutSeconds > 600) {
    errors.push('timeoutSeconds cannot exceed 600 (10 minutes)');
  }

  // Validate max cost
  if (limits.maxTotalCost < 0.01) {
    errors.push('maxTotalCost must be at least $0.01');
  }
  if (limits.maxTotalCost > 10) {
    errors.push('maxTotalCost cannot exceed $10.00');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
