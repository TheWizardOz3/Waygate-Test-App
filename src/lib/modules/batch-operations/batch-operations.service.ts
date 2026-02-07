/**
 * Batch Operations Service
 *
 * Core service: validates input, enforces the batchEnabled gate,
 * validates items against the action's input schema, and creates
 * a batch job via the async job queue.
 */

import type { Prisma } from '@prisma/client';

import { jobQueue } from '@/lib/modules/jobs/jobs.queue';
import { getActionBySlug } from '@/lib/modules/actions/action.service';
import { validateActionInput } from '@/lib/modules/actions/json-schema-validator';
import {
  BatchConfigSchema,
  BulkConfigSchema,
  BatchOperationInputSchema,
  type BatchOperationInput,
  type BatchOperationResponse,
  type BatchConfig,
  type BulkConfig,
  type BatchItemValidationError,
} from './batch-operations.schemas';
import {
  BatchNotEnabledError,
  BatchValidationError,
  BatchItemLimitExceededError,
} from './batch-operations.errors';

// =============================================================================
// Submit Batch Operation
// =============================================================================

/**
 * Submit a new batch operation.
 *
 * 1. Resolve integration + action by slug (verifies tenant access)
 * 2. Check batchEnabled gate
 * 3. Check item count against maxItems
 * 4. Validate each item against action's input schema
 * 5. Create batch job via job queue
 */
export async function submitBatchOperation(
  tenantId: string,
  rawInput: unknown
): Promise<BatchOperationResponse> {
  // Parse and validate request body
  const parsed = BatchOperationInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new BatchValidationError(
      parsed.error.issues.map((issue) => ({
        index: 0,
        errors: [issue.message],
      })),
      0,
      1
    );
  }

  const input = parsed.data;

  // Resolve action (throws if not found or tenant mismatch)
  const action = await getActionBySlug(tenantId, input.integrationSlug, input.actionSlug);

  // Gate: batchEnabled must be true
  if (!action.batchEnabled) {
    throw new BatchNotEnabledError(input.actionSlug);
  }

  // Parse batch config with defaults
  const batchConfig = parseBatchConfig(action.batchConfig);

  // Check item count limit
  if (input.items.length > batchConfig.maxItems) {
    throw new BatchItemLimitExceededError(input.items.length, batchConfig.maxItems);
  }

  // Check for bulk config
  const bulkConfig = parseBulkConfig(action.bulkConfig);
  const hasBulkRoute = bulkConfig !== null;

  // Validate each item against the action's input schema
  const { validItems, itemErrors } = validateBatchItems(
    input.items,
    action.inputSchema as Record<string, unknown>
  );

  const skipInvalid = input.config?.skipInvalidItems ?? false;

  if (itemErrors.length > 0 && !skipInvalid) {
    throw new BatchValidationError(itemErrors, validItems.length, itemErrors.length);
  }

  const itemsToEnqueue = skipInvalid ? validItems : input.items;

  if (itemsToEnqueue.length === 0) {
    throw new BatchValidationError(itemErrors, 0, itemErrors.length);
  }

  // Merge config: request overrides win, capped at action limits
  const mergedConfig = mergeConfig(batchConfig, input.config);

  // Create batch job via job queue
  const job = await jobQueue.enqueueWithItems({
    type: 'batch_operation',
    tenantId,
    input: {
      integrationSlug: input.integrationSlug,
      actionSlug: input.actionSlug,
      integrationId: action.integration.id,
      config: mergedConfig,
      hasBulkRoute,
      bulkConfig: bulkConfig ?? undefined,
    },
    maxAttempts: 1, // Batch jobs don't retry at job level; items are tracked individually
    timeoutSeconds: Math.max(300, itemsToEnqueue.length * 10), // 10s per item floor
    items: itemsToEnqueue.map((item) => ({
      input: item.input as unknown as Prisma.InputJsonValue,
    })),
  });

  return {
    jobId: job.id,
    status: 'queued',
    itemCount: job.items.length,
    hasBulkRoute,
  };
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Parse and validate batchConfig from Action model (JSONB).
 * Returns defaults if null/undefined.
 */
function parseBatchConfig(raw: unknown): BatchConfig {
  if (!raw || typeof raw !== 'object') {
    return {
      maxItems: 1000,
      defaultConcurrency: 5,
      defaultDelayMs: 0,
    };
  }
  const result = BatchConfigSchema.safeParse(raw);
  return result.success
    ? result.data
    : { maxItems: 1000, defaultConcurrency: 5, defaultDelayMs: 0 };
}

/**
 * Parse and validate bulkConfig from Action model (JSONB).
 * Returns null if not configured.
 */
function parseBulkConfig(raw: unknown): BulkConfig | null {
  if (!raw || typeof raw !== 'object') return null;
  const result = BulkConfigSchema.safeParse(raw);
  return result.success ? result.data : null;
}

/**
 * Validate each batch item against the action's input schema.
 */
function validateBatchItems(
  items: BatchOperationInput['items'],
  inputSchema: Record<string, unknown>
): {
  validItems: BatchOperationInput['items'];
  itemErrors: BatchItemValidationError[];
} {
  const validItems: BatchOperationInput['items'] = [];
  const itemErrors: BatchItemValidationError[] = [];

  // If no input schema, all items are valid
  if (!inputSchema || Object.keys(inputSchema).length === 0) {
    return { validItems: items, itemErrors: [] };
  }

  for (let i = 0; i < items.length; i++) {
    const result = validateActionInput(inputSchema, items[i].input);
    if (result.valid) {
      validItems.push(items[i]);
    } else {
      itemErrors.push({
        index: i,
        errors: result.errors?.map((e) => e.message) ?? ['Validation failed'],
      });
    }
  }

  return { validItems, itemErrors };
}

/**
 * Merge request config overrides with action's batchConfig defaults.
 * Request overrides win but are capped at action-level limits.
 */
function mergeConfig(
  batchConfig: BatchConfig,
  requestConfig?: BatchOperationInput['config']
): { concurrency: number; delayMs: number; timeoutSeconds: number } {
  return {
    concurrency: Math.min(requestConfig?.concurrency ?? batchConfig.defaultConcurrency, 20),
    delayMs: Math.min(requestConfig?.delayMs ?? batchConfig.defaultDelayMs, 5000),
    timeoutSeconds: requestConfig?.timeoutSeconds ?? 300,
  };
}
