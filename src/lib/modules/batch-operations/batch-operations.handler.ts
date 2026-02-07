/**
 * Batch Operations Handler
 *
 * Job handler for batch_operation jobs. Implements dual processing path:
 * - Bulk path: When bulkConfig exists, uses bulk dispatcher for single API calls
 * - Individual path: Otherwise, processes items one-by-one via invokeAction() with pacing
 *
 * Registered via registerJobHandler('batch_operation', ...) in the module index.
 */

import type { Prisma } from '@prisma/client';

import type { JobHandlerContext } from '@/lib/modules/jobs/jobs.handlers';
import { invokeAction } from '@/lib/modules/gateway/gateway.service';
import * as jobRepo from '@/lib/modules/jobs/jobs.repository';
import { dispatchBulk, type BulkItem } from './bulk-dispatcher';
import {
  BulkConfigSchema,
  type BatchResultSummary,
  type BulkConfig,
} from './batch-operations.schemas';
import { getDecryptedCredential } from '@/lib/modules/credentials/credential.service';
import { prisma } from '@/lib/db/client';

// =============================================================================
// Constants
// =============================================================================

const ITEM_FETCH_CHUNK_SIZE = 50;

// =============================================================================
// Handler
// =============================================================================

/**
 * Batch operation job handler.
 * Called by the worker when a batch_operation job is claimed.
 */
export async function batchOperationHandler(
  context: JobHandlerContext
): Promise<Prisma.InputJsonValue> {
  const { job, updateProgress } = context;
  const jobInput = job.input as Record<string, unknown>;

  const integrationSlug = jobInput.integrationSlug as string;
  const actionSlug = jobInput.actionSlug as string;
  const integrationId = jobInput.integrationId as string;
  const hasBulkRoute = jobInput.hasBulkRoute as boolean;
  const config = jobInput.config as {
    concurrency: number;
    delayMs: number;
    timeoutSeconds: number;
  };

  const summary: BatchResultSummary = {
    succeeded: 0,
    failed: 0,
    skipped: 0,
    bulkCallsMade: 0,
    individualCallsMade: 0,
  };

  const totalItems = job.items.length;

  await updateProgress(5, { stage: 'starting', totalItems });

  try {
    if (hasBulkRoute) {
      await processBulkPath(context, jobInput, summary);
    } else {
      await processIndividualPath(
        context,
        integrationSlug,
        actionSlug,
        integrationId,
        config,
        summary
      );
    }
  } catch (error) {
    // Mark remaining pending items as skipped
    const remaining = await context.getPendingItems(10000);
    if (remaining.length > 0) {
      await context.batchUpdateItems(
        remaining.map((item) => ({
          id: item.id,
          data: { status: 'skipped', completedAt: new Date() },
        }))
      );
      summary.skipped += remaining.length;
    }

    console.error('[BATCH_HANDLER] Error during processing:', error);
  }

  await updateProgress(100, {
    stage: 'completed',
    ...summary,
  });

  return summary as unknown as Prisma.InputJsonValue;
}

// =============================================================================
// Bulk Path
// =============================================================================

async function processBulkPath(
  context: JobHandlerContext,
  jobInput: Record<string, unknown>,
  summary: BatchResultSummary
): Promise<void> {
  const { job, updateProgress } = context;
  const integrationId = jobInput.integrationId as string;
  const rawBulkConfig = jobInput.bulkConfig;

  const parsedBulkConfig = BulkConfigSchema.safeParse(rawBulkConfig);
  if (!parsedBulkConfig.success) {
    // Fall back to individual path if bulk config is invalid
    console.warn('[BATCH_HANDLER] Invalid bulk config, falling back to individual path');
    const config = jobInput.config as {
      concurrency: number;
      delayMs: number;
      timeoutSeconds: number;
    };
    const integrationSlug = jobInput.integrationSlug as string;
    const actionSlug = jobInput.actionSlug as string;
    await processIndividualPath(
      context,
      integrationSlug,
      actionSlug,
      integrationId,
      config,
      summary
    );
    return;
  }

  const bulkConfig: BulkConfig = parsedBulkConfig.data;

  // Resolve credentials for bulk API call
  const bulkContext = await resolveBulkContext(integrationId);

  // Get all pending items
  const allPendingItems: BulkItem[] = job.items
    .filter((item) => item.status === 'pending')
    .map((item) => ({
      itemId: item.id,
      input: (item.input as Record<string, unknown>) ?? {},
    }));

  await updateProgress(10, { stage: 'bulk_dispatch', itemCount: allPendingItems.length });

  // Dispatch via bulk API
  const results = await dispatchBulk(allPendingItems, bulkConfig, bulkContext);
  summary.bulkCallsMade = Math.ceil(allPendingItems.length / (bulkConfig.maxItemsPerCall ?? 200));

  // Update items based on results
  const itemUpdates = results.map((result) => ({
    id: result.itemId,
    data: {
      status: result.success ? 'completed' : 'failed',
      output: result.output as Prisma.InputJsonValue,
      error: result.error ? ({ message: result.error } as Prisma.InputJsonValue) : undefined,
      completedAt: new Date(),
    },
  }));

  await context.batchUpdateItems(itemUpdates);

  for (const result of results) {
    if (result.success) {
      summary.succeeded += 1;
    } else {
      summary.failed += 1;
    }
  }
}

// =============================================================================
// Individual Path
// =============================================================================

async function processIndividualPath(
  context: JobHandlerContext,
  integrationSlug: string,
  actionSlug: string,
  integrationId: string,
  config: { concurrency: number; delayMs: number; timeoutSeconds: number },
  summary: BatchResultSummary
): Promise<void> {
  const { job, updateProgress } = context;
  const totalItems = job.items.length;
  let processedCount = 0;

  // Process in chunks
  while (true) {
    // Check for cancellation
    const currentJob = await jobRepo.findAsyncJobById(job.id);
    if (currentJob?.status === 'cancelled') {
      // Mark remaining items as skipped
      const remaining = await context.getPendingItems(10000);
      if (remaining.length > 0) {
        await context.batchUpdateItems(
          remaining.map((item) => ({
            id: item.id,
            data: { status: 'skipped', completedAt: new Date() },
          }))
        );
        summary.skipped += remaining.length;
      }
      break;
    }

    const pendingItems = await context.getPendingItems(ITEM_FETCH_CHUNK_SIZE);
    if (pendingItems.length === 0) break;

    // Process items with concurrency control
    const semaphore = new Semaphore(config.concurrency);

    const promises = pendingItems.map((item) =>
      semaphore.acquire().then(async () => {
        try {
          // Apply delay between items
          if (config.delayMs > 0 && processedCount > 0) {
            await sleep(config.delayMs);
          }

          // Invoke via gateway
          const input = (item.input as Record<string, unknown>) ?? {};
          const result = await invokeAction(job.tenantId!, integrationSlug, actionSlug, input);

          summary.individualCallsMade += 1;

          if (result.success) {
            await context.updateItem(item.id, {
              status: 'completed',
              output: { data: result.data } as Prisma.InputJsonValue,
              completedAt: new Date(),
            });
            summary.succeeded += 1;
          } else {
            await context.updateItem(item.id, {
              status: 'failed',
              error: {
                code: result.error.code,
                message: result.error.message,
              } as Prisma.InputJsonValue,
              completedAt: new Date(),
            });
            summary.failed += 1;
          }
        } catch (error) {
          await context.updateItem(item.id, {
            status: 'failed',
            error: {
              message: error instanceof Error ? error.message : 'Unknown error',
            } as Prisma.InputJsonValue,
            completedAt: new Date(),
          });
          summary.failed += 1;
        } finally {
          semaphore.release();
          processedCount += 1;
        }
      })
    );

    await Promise.all(promises);

    // Update progress
    const progress = Math.min(95, Math.round((processedCount / totalItems) * 100));
    await updateProgress(progress, {
      stage: 'processing',
      processed: processedCount,
      total: totalItems,
      ...summary,
    });
  }
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Resolve bulk dispatch context (credentials, base URL) for an integration.
 */
async function resolveBulkContext(integrationId: string) {
  const integration = await prisma.integration.findUnique({
    where: { id: integrationId },
    select: { id: true, tenantId: true },
  });

  if (!integration) {
    throw new Error(`Integration not found: ${integrationId}`);
  }

  // Get credentials for auth headers
  const authHeaders: Record<string, string> = {};
  try {
    const credential = await getDecryptedCredential(integration.tenantId, integrationId);
    if (credential) {
      const credData = credential.data as Record<string, unknown>;
      const credType = credential.credentialType;
      if (credType === 'api_key') {
        const headerName = (credData.headerName as string) ?? 'Authorization';
        const apiKey = (credData.apiKey as string) ?? '';
        authHeaders[headerName] = apiKey;
      } else if (credType === 'oauth2_tokens' || credType === 'bearer') {
        const accessToken = (credData.accessToken as string) ?? '';
        authHeaders['Authorization'] = `Bearer ${accessToken}`;
      }
    }
  } catch {
    // Proceed without auth — the bulk endpoint may not need it, or the error will surface
  }

  return {
    integrationId: integration.id,
    baseUrl: '', // Bulk config endpoint should be a full URL or path handled by the dispatcher
    authHeaders,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Simple counting semaphore for concurrency control.
 */
class Semaphore {
  private count: number;
  private waitQueue: Array<() => void> = [];

  constructor(max: number) {
    this.count = max;
  }

  async acquire(): Promise<void> {
    if (this.count > 0) {
      this.count -= 1;
      return;
    }
    return new Promise<void>((resolve) => {
      this.waitQueue.push(resolve);
    });
  }

  release(): void {
    const next = this.waitQueue.shift();
    if (next) {
      next();
    } else {
      this.count += 1;
    }
  }
}
