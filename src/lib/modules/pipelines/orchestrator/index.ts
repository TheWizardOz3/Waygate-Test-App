/**
 * Pipeline Orchestrator
 *
 * Phase 2: Template resolution, state management, condition evaluation, safety enforcement
 * Phase 4: Pipeline orchestrator, step executor, output mapping
 */

// Phase 2: Template Resolution & State Management
export {
  resolveTemplates,
  resolveTemplateString,
  resolveExpression,
  parsePath,
  resolvePathValue,
  extractTemplateExpressions,
  validateTemplateExpressions,
  TemplateResolutionError,
} from './template-resolver';

export {
  createInitialState,
  recordStepResult,
  hasStepResult,
  getStepResult,
  getCompletedStepSlugs,
  getRecordedStepSlugs,
  getStepStatusCounts,
  createStateSummary,
  serializeState,
  deserializeState,
} from './state-manager';
export type {
  PipelineState,
  StepResult,
  StepResultStatus,
  StepCompletionData,
} from './state-manager';

export { evaluateCondition } from './condition-evaluator';
export type { ConditionEvaluationResult } from './condition-evaluator';

export {
  checkSafetyLimits,
  resolveEffectiveLimits,
  getElapsedMs,
  DEFAULT_SAFETY_LIMITS,
} from './safety-enforcer';
export type { SafetyCheckResult, SafetyContext, SafetyViolationType } from './safety-enforcer';

// Phase 4: Pipeline Orchestrator & Step Executor
export { executeStep } from './step-executor';
export type { StepExecutorInput, StepExecutorResult, StepError } from './step-executor';

export { executePipeline, PipelineExecutionError } from './pipeline-orchestrator';
export type { PipelineInvocationInput, PipelineInvocationResult } from './pipeline-orchestrator';

export { resolveOutputMapping } from './output-mapper';
