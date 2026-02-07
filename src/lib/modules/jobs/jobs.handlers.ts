/**
 * Job Handler Registry
 *
 * Defines the handler interface and a registry that maps job types to their
 * handler functions. Downstream features (Batch Operations, Schema Drift, etc.)
 * register handlers here. The worker dispatches claimed jobs to the registered handler.
 */

import type { AsyncJob, AsyncJobItem } from '@prisma/client';
import type { Prisma } from '@prisma/client';

import { HandlerNotFoundError } from './jobs.errors';

// =============================================================================
// Types
// =============================================================================

/**
 * Context passed to a job handler, providing access to the job data
 * and helper methods for progress/item management.
 */
export interface JobHandlerContext {
  /** The claimed job (status already set to 'running') */
  job: AsyncJob & { items: AsyncJobItem[] };

  /** Update progress (0-100) with optional stage details */
  updateProgress: (progress: number, details?: Prisma.InputJsonValue) => Promise<void>;

  /** Get pending items for this job (for batch processing) */
  getPendingItems: (limit?: number) => Promise<AsyncJobItem[]>;

  /** Update a single item's status/output/error */
  updateItem: (
    itemId: string,
    update: {
      status?: string;
      output?: Prisma.InputJsonValue;
      error?: Prisma.InputJsonValue;
      completedAt?: Date | null;
    }
  ) => Promise<void>;

  /** Batch update multiple items at once */
  batchUpdateItems: (
    updates: {
      id: string;
      data: {
        status?: string;
        output?: Prisma.InputJsonValue;
        error?: Prisma.InputJsonValue;
        completedAt?: Date | null;
      };
    }[]
  ) => Promise<void>;
}

/**
 * A job handler function. Receives the context with the job data and helpers.
 * Returns optional output to be stored on the completed job.
 *
 * The handler should NOT call completeJob/failJob — the worker manages lifecycle.
 * If the handler throws, the worker records the failure and handles retries.
 */
export type JobHandler = (context: JobHandlerContext) => Promise<Prisma.InputJsonValue | void>;

/**
 * Configuration for a job type (optional limits/settings)
 */
export interface JobTypeConfig {
  /** Handler function for this job type */
  handler: JobHandler;

  /** Max concurrent running jobs of this type (0 = unlimited) */
  concurrencyLimit?: number;
}

// =============================================================================
// Registry
// =============================================================================

/** Internal handler registry: jobType → config */
const registry = new Map<string, JobTypeConfig>();

/**
 * Register a handler for a job type.
 * Called by downstream feature modules during initialization.
 */
export function registerJobHandler(jobType: string, config: JobTypeConfig): void {
  registry.set(jobType, config);
}

/**
 * Look up the config for a job type. Throws HandlerNotFoundError if not registered.
 */
export function getJobTypeConfig(jobType: string): JobTypeConfig {
  const config = registry.get(jobType);
  if (!config) {
    throw new HandlerNotFoundError(jobType);
  }
  return config;
}

/**
 * Check if a handler is registered for a job type.
 */
export function hasJobHandler(jobType: string): boolean {
  return registry.has(jobType);
}

/**
 * List all registered job types (for diagnostics/admin).
 */
export function getRegisteredJobTypes(): string[] {
  return Array.from(registry.keys());
}
