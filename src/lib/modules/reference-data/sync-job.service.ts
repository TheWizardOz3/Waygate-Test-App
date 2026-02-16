/**
 * Sync Job Service
 *
 * Orchestrates reference data synchronization from external APIs.
 * Handles:
 * - Finding actions configured for reference data sync
 * - Invoking actions to fetch reference data
 * - Extracting items from responses using JSONPath-like expressions
 * - Upserting reference data with soft delete detection
 * - Tracking sync job progress and status
 */

import type { Action, Connection, Integration } from '@prisma/client';
import { SyncJobStatus } from '@prisma/client';

import { invokeAction } from '../gateway/gateway.service';
import type { GatewaySuccessResponse } from '../gateway/gateway.schemas';
import { findActionsByIntegration } from '../actions/action.repository';
import { findAllConnectionsForIntegration } from '../connections/connection.repository';
import { findIntegrationById } from '../integrations/integration.repository';

import {
  createSyncJob,
  markSyncJobStarted,
  markSyncJobCompleted,
  markSyncJobFailed,
  bulkUpsertReferenceData,
  markStaleAsInactive,
  hasActiveSyncJob,
  getLatestSyncJob,
  findByIntegrationId as findReferenceDataByIntegration,
} from './reference-data.repository';
import type { UpsertReferenceDataDbInput } from './reference-data.repository';
import { ActionReferenceDataConfigSchema, ReferenceDataErrorCodes } from './reference-data.schemas';
import { extractReferenceItems } from './extraction';
import type { ActionReferenceDataConfig, ExtractedReferenceItem, SyncResult } from './types';

// Re-export for backwards compatibility
export { extractReferenceItems } from './extraction';

// =============================================================================
// Types
// =============================================================================

/**
 * Input for triggering a sync
 */
export interface TriggerSyncInput {
  tenantId: string;
  integrationId: string;
  connectionId?: string;
  appUserCredentialId?: string;
  dataType?: string;
  force?: boolean;
}

/**
 * Result of a sync trigger
 */
export interface TriggerSyncResult {
  success: boolean;
  jobs: Array<{
    jobId: string;
    dataType: string;
    actionSlug: string;
    status: SyncJobStatus;
    error?: string;
  }>;
  errors?: string[];
}

/**
 * Context for sync job execution
 */
interface SyncContext {
  tenantId: string;
  integration: Integration;
  connection: Connection;
  action: Action;
  referenceConfig: ActionReferenceDataConfig;
  appUserCredentialId?: string;
  jobId: string;
}

/**
 * Action with parsed reference data config
 */
interface SyncableAction {
  action: Action;
  referenceConfig: ActionReferenceDataConfig;
}

// =============================================================================
// Error Class
// =============================================================================

/**
 * Error thrown by sync operations
 */
export class SyncJobError extends Error {
  constructor(
    public code: string,
    message: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'SyncJobError';
  }
}

// =============================================================================
// Main Sync Service Functions
// =============================================================================

/**
 * Trigger a reference data sync for an integration
 *
 * This is the main entry point for manual sync triggers.
 * It finds all syncable actions and executes them.
 *
 * @param input - Sync trigger parameters
 * @returns Result with job statuses
 */
export async function triggerSync(input: TriggerSyncInput): Promise<TriggerSyncResult> {
  const {
    tenantId,
    integrationId,
    connectionId,
    appUserCredentialId,
    dataType,
    force = false,
  } = input;

  const jobs: TriggerSyncResult['jobs'] = [];
  const errors: string[] = [];

  try {
    // Get integration
    const integration = await findIntegrationById(integrationId);
    if (!integration || integration.tenantId !== tenantId) {
      throw new SyncJobError(
        ReferenceDataErrorCodes.INTEGRATION_NOT_FOUND,
        `Integration ${integrationId} not found`
      );
    }

    // Get connections to sync (specific connection or all active connections)
    const connections = await getConnectionsToSync(tenantId, integrationId, connectionId);
    if (connections.length === 0) {
      throw new SyncJobError(
        ReferenceDataErrorCodes.CONNECTION_NOT_FOUND,
        'No active connections found for integration'
      );
    }

    // Get syncable actions
    const syncableActions = await getSyncableActions(integrationId, dataType);
    if (syncableActions.length === 0) {
      return {
        success: true,
        jobs: [],
        errors: ['No syncable actions found for this integration'],
      };
    }

    // Execute sync for each connection and action
    for (const connection of connections) {
      for (const { action, referenceConfig } of syncableActions) {
        try {
          // Check if sync is already in progress (unless forced)
          if (!force) {
            const hasActive = await hasActiveSyncJob({
              integrationId,
              connectionId: connection.id,
              appUserCredentialId: appUserCredentialId ?? null,
              dataType: referenceConfig.dataType,
            });

            if (hasActive) {
              jobs.push({
                jobId: '',
                dataType: referenceConfig.dataType,
                actionSlug: action.slug,
                status: SyncJobStatus.syncing,
                error: 'Sync already in progress',
              });
              continue;
            }
          }

          // Execute the sync
          const result = await executeSyncJob({
            tenantId,
            integration,
            connection,
            action,
            referenceConfig,
            appUserCredentialId,
          });

          jobs.push({
            jobId: result.jobId,
            dataType: referenceConfig.dataType,
            actionSlug: action.slug,
            status: result.success ? SyncJobStatus.completed : SyncJobStatus.failed,
            error: result.error,
          });
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : 'Unknown error';
          errors.push(
            `Failed to sync ${referenceConfig.dataType} via ${action.slug}: ${errorMessage}`
          );
        }
      }
    }

    return {
      success: errors.length === 0,
      jobs,
      errors: errors.length > 0 ? errors : undefined,
    };
  } catch (err) {
    if (err instanceof SyncJobError) {
      throw err;
    }
    throw new SyncJobError(
      ReferenceDataErrorCodes.SYNC_FAILED,
      err instanceof Error ? err.message : 'Unknown sync error'
    );
  }
}

/**
 * Execute a single sync job
 *
 * This handles the full sync lifecycle:
 * 1. Create sync job record
 * 2. Invoke the action to fetch data
 * 3. Extract reference items from response
 * 4. Upsert items and detect deletions
 * 5. Update job with results
 */
async function executeSyncJob(
  context: Omit<SyncContext, 'jobId'>
): Promise<{ success: boolean; jobId: string; error?: string; result?: SyncResult }> {
  const { tenantId, integration, connection, action, referenceConfig, appUserCredentialId } =
    context;

  // Create the sync job
  const job = await createSyncJob({
    tenantId,
    integrationId: integration.id,
    connectionId: connection.id,
    appUserCredentialId: appUserCredentialId ?? null,
    dataType: referenceConfig.dataType,
  });

  const syncContext: SyncContext = { ...context, jobId: job.id };

  try {
    // Mark job as started
    await markSyncJobStarted(job.id);

    // Invoke the action to fetch reference data
    const response = await invokeAction(
      tenantId,
      integration.slug,
      action.slug,
      {},
      {
        connectionId: connection.id,
      }
    );

    if (!response.success) {
      const errorMsg = 'error' in response ? response.error.message : 'Action invocation failed';
      throw new SyncJobError(ReferenceDataErrorCodes.SYNC_FAILED, errorMsg);
    }

    // Extract items from response
    const items = extractReferenceItems((response as GatewaySuccessResponse).data, referenceConfig);

    // Upsert items and detect deletions
    const syncResult = await upsertAndDetectDeletions(syncContext, items);

    // Mark job as completed
    await markSyncJobCompleted(job.id, syncResult);

    return {
      success: true,
      jobId: job.id,
      result: syncResult,
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';

    // Mark job as failed
    await markSyncJobFailed(job.id, {
      code: err instanceof SyncJobError ? err.code : 'SYNC_FAILED',
      message: errorMessage,
      timestamp: new Date().toISOString(),
    });

    return {
      success: false,
      jobId: job.id,
      error: errorMessage,
    };
  }
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get connections to sync for an integration
 */
async function getConnectionsToSync(
  tenantId: string,
  integrationId: string,
  connectionId?: string
): Promise<Connection[]> {
  if (connectionId) {
    // Get specific connection
    const connections = await findAllConnectionsForIntegration(tenantId, integrationId);
    const connection = connections.find((c) => c.id === connectionId);
    return connection ? [connection] : [];
  }

  // Get all active connections for the integration
  const connections = await findAllConnectionsForIntegration(tenantId, integrationId);
  return connections.filter((c) => c.status === 'active');
}

/**
 * Get all syncable actions for an integration
 */
async function getSyncableActions(
  integrationId: string,
  dataType?: string
): Promise<SyncableAction[]> {
  const actions = await findActionsByIntegration(integrationId);
  const syncableActions: SyncableAction[] = [];

  for (const action of actions) {
    const metadata = action.metadata as Record<string, unknown> | null;
    const referenceData = metadata?.referenceData;

    if (!referenceData) {
      continue;
    }

    // Validate the reference data config
    const parsed = ActionReferenceDataConfigSchema.safeParse(referenceData);
    if (!parsed.success) {
      console.warn(
        `[SYNC] Invalid referenceData config for action ${action.slug}:`,
        parsed.error.issues
      );
      continue;
    }

    const config = parsed.data;

    // Check if syncable and matches dataType filter
    if (!config.syncable) {
      continue;
    }

    if (dataType && config.dataType !== dataType) {
      continue;
    }

    syncableActions.push({
      action,
      referenceConfig: config,
    });
  }

  return syncableActions;
}

/**
 * Upsert extracted items and detect deletions
 */
async function upsertAndDetectDeletions(
  context: SyncContext,
  items: ExtractedReferenceItem[]
): Promise<SyncResult> {
  const { tenantId, integration, connection, action, referenceConfig, appUserCredentialId } =
    context;
  const syncStartTime = new Date();

  // Build upsert inputs
  const upsertInputs: UpsertReferenceDataDbInput[] = items.map((item) => ({
    tenantId,
    integrationId: integration.id,
    connectionId: connection.id,
    appUserCredentialId: appUserCredentialId ?? null,
    dataType: referenceConfig.dataType,
    externalId: item.externalId,
    name: item.name,
    metadata: item.metadata as UpsertReferenceDataDbInput['metadata'],
    syncedByActionId: action.id,
  }));

  // Bulk upsert
  const { created, updated } = await bulkUpsertReferenceData(upsertInputs);

  // Mark items not in this sync as inactive (soft delete)
  const syncedExternalIds = items.map((item) => item.externalId);
  const deletedCount = await markStaleAsInactive({
    integrationId: integration.id,
    connectionId: connection.id,
    appUserCredentialId: appUserCredentialId ?? null,
    dataType: referenceConfig.dataType,
    excludeExternalIds: syncedExternalIds,
    syncedBefore: syncStartTime,
  });

  return {
    itemsFound: items.length,
    itemsCreated: created,
    itemsUpdated: updated,
    itemsDeleted: deletedCount,
    itemsFailed: 0,
  };
}

// =============================================================================
// Sync Status Functions
// =============================================================================

/**
 * Get sync status for an integration
 */
export async function getSyncStatus(
  tenantId: string,
  integrationId: string,
  connectionId?: string,
  dataType?: string
): Promise<{
  dataTypes: Array<{
    dataType: string;
    itemCount: number;
    lastSyncedAt: Date | null;
    lastJobStatus: SyncJobStatus | null;
  }>;
}> {
  // Get reference data summary
  const refData = await findReferenceDataByIntegration(
    integrationId,
    { limit: 1000 },
    {
      connectionId,
      dataType,
      status: 'active',
    }
  );

  // Group by data type
  const dataTypeMap = new Map<string, { count: number; lastSynced: Date | null }>();

  for (const item of refData.data) {
    const existing = dataTypeMap.get(item.dataType);
    if (!existing) {
      dataTypeMap.set(item.dataType, {
        count: 1,
        lastSynced: item.lastSyncedAt,
      });
    } else {
      existing.count++;
      if (!existing.lastSynced || item.lastSyncedAt > existing.lastSynced) {
        existing.lastSynced = item.lastSyncedAt;
      }
    }
  }

  // Get latest job status for each data type
  const dataTypes = await Promise.all(
    Array.from(dataTypeMap.entries()).map(async ([dt, info]) => {
      const latestJob = await getLatestSyncJob({
        integrationId,
        connectionId,
        dataType: dt,
      });

      return {
        dataType: dt,
        itemCount: info.count,
        lastSyncedAt: info.lastSynced,
        lastJobStatus: latestJob?.status ?? null,
      };
    })
  );

  return { dataTypes };
}

/**
 * Check if a data type needs syncing based on TTL
 */
export async function needsSync(
  integrationId: string,
  connectionId: string | undefined,
  dataType: string,
  ttlSeconds: number,
  appUserCredentialId?: string | null
): Promise<boolean> {
  const latestJob = await getLatestSyncJob({
    integrationId,
    connectionId,
    appUserCredentialId,
    dataType,
  });

  if (!latestJob) {
    return true;
  }

  // If job is currently running, don't need another sync
  if (latestJob.status === SyncJobStatus.pending || latestJob.status === SyncJobStatus.syncing) {
    return false;
  }

  // Check if completed job is older than TTL
  if (latestJob.completedAt) {
    const age = Date.now() - latestJob.completedAt.getTime();
    return age > ttlSeconds * 1000;
  }

  return true;
}

// =============================================================================
// Cron Job Functions
// =============================================================================

/**
 * Sync candidate representing a specific connection/action pair that needs syncing
 */
export interface SyncCandidate {
  tenantId: string;
  integrationId: string;
  integrationSlug: string;
  connectionId: string;
  appUserCredentialId?: string;
  actionId: string;
  actionSlug: string;
  dataType: string;
  referenceConfig: ActionReferenceDataConfig;
}

/**
 * Result of a batch sync operation
 */
export interface BatchSyncResult {
  totalCandidates: number;
  syncsAttempted: number;
  syncsSucceeded: number;
  syncsFailed: number;
  syncsSkipped: number;
  errors: Array<{
    integrationSlug: string;
    connectionId: string;
    dataType: string;
    error: string;
  }>;
}

/**
 * Find all sync candidates across all tenants
 *
 * This function finds connection/action pairs that need syncing based on TTL.
 * Used by the cron job to determine what needs to be synced.
 *
 * @param defaultTtlSeconds - Default TTL for actions without a configured TTL
 * @param limit - Maximum number of candidates to return
 * @returns Array of sync candidates
 */
export async function findSyncCandidates(
  defaultTtlSeconds: number = 3600,
  limit: number = 50
): Promise<SyncCandidate[]> {
  const { prisma } = await import('@/lib/db/client');
  const candidates: SyncCandidate[] = [];

  // Find all actions with referenceData config that are syncable
  const actionsWithRefData = await prisma.action.findMany({
    where: {
      metadata: {
        path: ['referenceData', 'syncable'],
        equals: true,
      },
    },
    include: {
      integration: {
        include: {
          connections: {
            where: {
              status: 'active',
            },
            include: {
              userCredentials: {
                where: {
                  status: 'active',
                },
                select: {
                  id: true,
                },
              },
            },
          },
        },
      },
    },
  });

  for (const action of actionsWithRefData) {
    const metadata = action.metadata as Record<string, unknown> | null;
    const referenceData = metadata?.referenceData;

    // Validate config
    const parsed = ActionReferenceDataConfigSchema.safeParse(referenceData);
    if (!parsed.success || !parsed.data.syncable) {
      continue;
    }

    const config = parsed.data;
    const ttlSeconds = config.defaultTtlSeconds ?? defaultTtlSeconds;

    // Check each connection for this integration
    for (const connection of action.integration.connections) {
      // Check if this connection's shared credential data needs syncing
      const needs = await needsSync(
        action.integrationId,
        connection.id,
        config.dataType,
        ttlSeconds,
        null // null = shared credential scope
      );

      if (needs) {
        candidates.push({
          tenantId: action.integration.tenantId,
          integrationId: action.integrationId,
          integrationSlug: action.integration.slug,
          connectionId: connection.id,
          actionId: action.id,
          actionSlug: action.slug,
          dataType: config.dataType,
          referenceConfig: config,
        });

        if (candidates.length >= limit) {
          return candidates;
        }
      }

      // Check per-user-credential sync candidates
      const userCredentials = (
        connection as typeof connection & { userCredentials: Array<{ id: string }> }
      ).userCredentials;
      for (const userCred of userCredentials) {
        const userNeedsSync = await needsSync(
          action.integrationId,
          connection.id,
          config.dataType,
          ttlSeconds,
          userCred.id
        );

        if (userNeedsSync) {
          candidates.push({
            tenantId: action.integration.tenantId,
            integrationId: action.integrationId,
            integrationSlug: action.integration.slug,
            connectionId: connection.id,
            appUserCredentialId: userCred.id,
            actionId: action.id,
            actionSlug: action.slug,
            dataType: config.dataType,
            referenceConfig: config,
          });

          if (candidates.length >= limit) {
            return candidates;
          }
        }
      }
    }
  }

  return candidates;
}

/**
 * Run a batch sync operation for the cron job
 *
 * This function processes a list of sync candidates, executing syncs
 * with rate limiting to avoid overwhelming external APIs.
 *
 * @param candidates - List of sync candidates to process
 * @param options - Batch processing options
 * @returns Summary of sync results
 */
export async function runBatchSync(
  candidates: SyncCandidate[],
  options: {
    concurrency?: number;
    delayBetweenSyncsMs?: number;
  } = {}
): Promise<BatchSyncResult> {
  const { delayBetweenSyncsMs = 500 } = options;

  const result: BatchSyncResult = {
    totalCandidates: candidates.length,
    syncsAttempted: 0,
    syncsSucceeded: 0,
    syncsFailed: 0,
    syncsSkipped: 0,
    errors: [],
  };

  // Process candidates sequentially with rate limiting
  for (const candidate of candidates) {
    try {
      // Check again if sync is needed (may have been synced by another process)
      const stillNeeds = await needsSync(
        candidate.integrationId,
        candidate.connectionId,
        candidate.dataType,
        candidate.referenceConfig.defaultTtlSeconds ?? 3600,
        candidate.appUserCredentialId ?? null
      );

      if (!stillNeeds) {
        result.syncsSkipped++;
        continue;
      }

      result.syncsAttempted++;

      // Trigger the sync
      const syncResult = await triggerSync({
        tenantId: candidate.tenantId,
        integrationId: candidate.integrationId,
        connectionId: candidate.connectionId,
        appUserCredentialId: candidate.appUserCredentialId,
        dataType: candidate.dataType,
        force: false, // Don't force to respect in-progress syncs
      });

      if (
        syncResult.success &&
        syncResult.jobs.every((j) => j.status === SyncJobStatus.completed)
      ) {
        result.syncsSucceeded++;
      } else {
        result.syncsFailed++;
        const failedJobs = syncResult.jobs.filter((j) => j.status === SyncJobStatus.failed);
        for (const job of failedJobs) {
          result.errors.push({
            integrationSlug: candidate.integrationSlug,
            connectionId: candidate.connectionId,
            dataType: candidate.dataType,
            error: job.error || 'Unknown error',
          });
        }
      }

      // Rate limiting delay between syncs — longer delay for per-user-credential syncs
      // to avoid overwhelming external API rate limits shared across the connection
      const effectiveDelay = candidate.appUserCredentialId
        ? Math.max(delayBetweenSyncsMs, 1000)
        : delayBetweenSyncsMs;
      if (effectiveDelay > 0) {
        await new Promise((resolve) => setTimeout(resolve, effectiveDelay));
      }
    } catch (err) {
      result.syncsFailed++;
      result.errors.push({
        integrationSlug: candidate.integrationSlug,
        connectionId: candidate.connectionId,
        dataType: candidate.dataType,
        error: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }

  return result;
}

/**
 * Get summary of pending sync work
 *
 * Returns counts of how many sync candidates exist without running syncs.
 * Useful for the GET endpoint to show cron status.
 */
export async function getSyncQueueSummary(defaultTtlSeconds: number = 3600): Promise<{
  pendingSyncs: number;
  dataTypeCounts: Record<string, number>;
}> {
  const candidates = await findSyncCandidates(defaultTtlSeconds, 1000);

  const dataTypeCounts: Record<string, number> = {};
  for (const candidate of candidates) {
    dataTypeCounts[candidate.dataType] = (dataTypeCounts[candidate.dataType] || 0) + 1;
  }

  return {
    pendingSyncs: candidates.length,
    dataTypeCounts,
  };
}
