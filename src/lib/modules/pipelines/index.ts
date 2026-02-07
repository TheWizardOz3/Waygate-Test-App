/**
 * Pipelines Module
 *
 * Multi-agent pipeline tools - multi-step orchestrated workflows that appear
 * as single tools to consuming agents. Each step can invoke any tool type
 * (simple, composite, agentic) with optional inter-step LLM reasoning.
 */

// Schemas & Types
export * from './pipeline.schemas';

// Repository (export non-conflicting items, alias where needed)
export {
  findPipelineById,
  findPipelineByIdAndTenant,
  findPipelineWithSteps,
  findPipelineBySlug,
  findPipelineBySlugWithSteps,
  findPipelinesPaginated,
  findAllPipelinesForTenant,
  isPipelineSlugTaken,
  updatePipelineStatus,
  // Step repository
  createPipelineStep as createPipelineStepDb,
  createPipelineStepsBatch,
  findPipelineStepById,
  findStepsByPipeline,
  findPipelineStepBySlug,
  isStepSlugTaken,
  countSteps,
  reorderPipelineSteps,
  renumberStepsAfterDeletion,
  // Execution repository
  createPipelineExecution as createPipelineExecutionDb,
  findPipelineExecutionById,
  findPipelineExecutionWithSteps,
  findExecutionsByPipeline,
  findExecutionsByTenant as findPipelineExecutionsByTenant,
  updatePipelineExecution as updatePipelineExecutionDb,
  createStepExecution as createStepExecutionDb,
  updateStepExecution as updateStepExecutionDb,
  // Statistics
  getPipelineCountsByStatus,
  getPipelineExecutionStats,
} from './pipeline.repository';

export type {
  CreatePipelineDbInput,
  UpdatePipelineDbInput,
  CreatePipelineStepDbInput,
  UpdatePipelineStepDbInput,
  CreatePipelineExecutionDbInput,
  UpdatePipelineExecutionDbInput,
  CreateStepExecutionDbInput,
  UpdateStepExecutionDbInput,
  PipelinePaginationOptions,
  PaginatedPipelines,
  PipelineWithStepCount,
  PipelineWithSteps,
  PipelineExecutionWithSteps,
} from './pipeline.repository';

// Service (business logic - main layer)
export * from './pipeline.service';

// Phase 2: Template Resolution & State Management
export * from './orchestrator';

// Phase 3: Inter-Step Reasoning
export * from './reasoning';

// Phase 5: Export, Description Generation & Response Formatting
export * from './export';

// Phase 7: Invocation Handler
export * from './handlers';
