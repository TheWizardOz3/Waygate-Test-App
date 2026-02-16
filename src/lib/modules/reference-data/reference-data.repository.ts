/**
 * Reference Data Repository
 *
 * Data access layer for ReferenceData and ReferenceSyncJob models.
 * Handles CRUD operations and queries for cached reference data from external APIs.
 */

import { prisma } from '@/lib/db/client';
import { ReferenceDataStatus, SyncJobStatus, Prisma } from '@prisma/client';

import type { ReferenceData, ReferenceSyncJob } from '@prisma/client';

// =============================================================================
// Types
// =============================================================================

/**
 * Input for creating reference data (repository layer)
 */
export interface CreateReferenceDataDbInput {
  tenantId: string;
  integrationId: string;
  connectionId?: string | null;
  appUserCredentialId?: string | null;
  dataType: string;
  externalId: string;
  name: string;
  metadata?: Prisma.InputJsonValue;
  syncedByActionId?: string | null;
  lastSyncedAt?: Date;
}

/**
 * Input for updating reference data (repository layer)
 */
export interface UpdateReferenceDataDbInput {
  name?: string;
  metadata?: Prisma.InputJsonValue;
  status?: ReferenceDataStatus;
  syncedByActionId?: string | null;
  lastSyncedAt?: Date;
}

/**
 * Input for upserting reference data (repository layer)
 */
export interface UpsertReferenceDataDbInput {
  tenantId: string;
  integrationId: string;
  connectionId?: string | null;
  appUserCredentialId?: string | null;
  dataType: string;
  externalId: string;
  name: string;
  metadata?: Prisma.InputJsonValue;
  syncedByActionId?: string | null;
}

/**
 * Input for creating a sync job (repository layer)
 */
export interface CreateSyncJobDbInput {
  tenantId: string;
  integrationId: string;
  connectionId?: string | null;
  appUserCredentialId?: string | null;
  dataType: string;
}

/**
 * Input for updating a sync job (repository layer)
 */
export interface UpdateSyncJobDbInput {
  status?: SyncJobStatus;
  startedAt?: Date | null;
  completedAt?: Date | null;
  itemsFound?: number;
  itemsCreated?: number;
  itemsUpdated?: number;
  itemsDeleted?: number;
  itemsFailed?: number;
  error?: Prisma.InputJsonValue | null;
}

/**
 * Pagination options for queries
 */
export interface PaginationOptions {
  cursor?: string;
  limit?: number;
}

/**
 * Filters for reference data queries
 */
export interface ReferenceDataFilters {
  dataType?: string;
  status?: ReferenceDataStatus;
  search?: string;
  connectionId?: string;
  appUserCredentialId?: string | null;
}

/**
 * Filters for sync job queries
 */
export interface SyncJobFilters {
  status?: SyncJobStatus;
  dataType?: string;
  connectionId?: string;
  appUserCredentialId?: string | null;
  startDate?: Date;
  endDate?: Date;
}

/**
 * Paginated result for reference data
 */
export interface PaginatedReferenceData {
  data: ReferenceData[];
  nextCursor: string | null;
  totalCount: number;
}

/**
 * Paginated result for sync jobs
 */
export interface PaginatedSyncJobs {
  jobs: ReferenceSyncJob[];
  nextCursor: string | null;
  totalCount: number;
}

/**
 * Summary of reference data by type
 */
export interface ReferenceDataTypeSummary {
  dataType: string;
  totalCount: number;
  activeCount: number;
  lastSyncedAt: Date | null;
}

// =============================================================================
// Reference Data - Create Operations
// =============================================================================

/**
 * Creates a new reference data record
 */
export async function createReferenceData(
  input: CreateReferenceDataDbInput
): Promise<ReferenceData> {
  return prisma.referenceData.create({
    data: {
      tenantId: input.tenantId,
      integrationId: input.integrationId,
      connectionId: input.connectionId ?? null,
      appUserCredentialId: input.appUserCredentialId ?? null,
      dataType: input.dataType,
      externalId: input.externalId,
      name: input.name,
      metadata: input.metadata ?? {},
      syncedByActionId: input.syncedByActionId ?? null,
      lastSyncedAt: input.lastSyncedAt ?? new Date(),
      status: ReferenceDataStatus.active,
    },
  });
}

/**
 * Creates multiple reference data records in a transaction
 */
export async function createManyReferenceData(
  inputs: CreateReferenceDataDbInput[]
): Promise<{ count: number }> {
  const now = new Date();

  return prisma.referenceData.createMany({
    data: inputs.map((input) => ({
      tenantId: input.tenantId,
      integrationId: input.integrationId,
      connectionId: input.connectionId ?? null,
      appUserCredentialId: input.appUserCredentialId ?? null,
      dataType: input.dataType,
      externalId: input.externalId,
      name: input.name,
      metadata: input.metadata ?? {},
      syncedByActionId: input.syncedByActionId ?? null,
      lastSyncedAt: input.lastSyncedAt ?? now,
      status: ReferenceDataStatus.active,
    })),
    skipDuplicates: true,
  });
}

/**
 * Upserts reference data (creates if not exists, updates if exists)
 */
export async function upsertReferenceData(
  input: UpsertReferenceDataDbInput
): Promise<ReferenceData> {
  const now = new Date();
  const connectionId = input.connectionId ?? null;
  const appUserCredentialId = input.appUserCredentialId ?? null;

  // Find existing record using individual conditions (handles null connectionId/appUserCredentialId)
  const existing = await prisma.referenceData.findFirst({
    where: {
      integrationId: input.integrationId,
      connectionId,
      appUserCredentialId,
      dataType: input.dataType,
      externalId: input.externalId,
    },
    select: { id: true },
  });

  if (existing) {
    return prisma.referenceData.update({
      where: { id: existing.id },
      data: {
        name: input.name,
        metadata: input.metadata ?? {},
        syncedByActionId: input.syncedByActionId ?? null,
        lastSyncedAt: now,
        status: ReferenceDataStatus.active,
      },
    });
  }

  return prisma.referenceData.create({
    data: {
      tenantId: input.tenantId,
      integrationId: input.integrationId,
      connectionId,
      appUserCredentialId,
      dataType: input.dataType,
      externalId: input.externalId,
      name: input.name,
      metadata: input.metadata ?? {},
      syncedByActionId: input.syncedByActionId ?? null,
      lastSyncedAt: now,
      status: ReferenceDataStatus.active,
    },
  });
}

/**
 * Bulk upserts reference data items in a transaction
 * Returns counts of created, updated items
 */
export async function bulkUpsertReferenceData(
  inputs: UpsertReferenceDataDbInput[]
): Promise<{ created: number; updated: number }> {
  if (inputs.length === 0) {
    return { created: 0, updated: 0 };
  }

  const now = new Date();
  let created = 0;
  let updated = 0;

  // Process in batches of 100 to avoid hitting limits
  const batchSize = 100;
  for (let i = 0; i < inputs.length; i += batchSize) {
    const batch = inputs.slice(i, i + batchSize);

    await prisma.$transaction(async (tx) => {
      for (const input of batch) {
        const connectionId = input.connectionId ?? null;
        const appUserCredentialId = input.appUserCredentialId ?? null;

        // Use findFirst with individual conditions to handle null connectionId/appUserCredentialId
        const existing = await tx.referenceData.findFirst({
          where: {
            integrationId: input.integrationId,
            connectionId,
            appUserCredentialId,
            dataType: input.dataType,
            externalId: input.externalId,
          },
          select: { id: true },
        });

        if (existing) {
          await tx.referenceData.update({
            where: { id: existing.id },
            data: {
              name: input.name,
              metadata: input.metadata ?? {},
              syncedByActionId: input.syncedByActionId ?? null,
              lastSyncedAt: now,
              status: ReferenceDataStatus.active,
            },
          });
          updated++;
        } else {
          await tx.referenceData.create({
            data: {
              tenantId: input.tenantId,
              integrationId: input.integrationId,
              connectionId,
              appUserCredentialId,
              dataType: input.dataType,
              externalId: input.externalId,
              name: input.name,
              metadata: input.metadata ?? {},
              syncedByActionId: input.syncedByActionId ?? null,
              lastSyncedAt: now,
              status: ReferenceDataStatus.active,
            },
          });
          created++;
        }
      }
    });
  }

  return { created, updated };
}

// =============================================================================
// Reference Data - Read Operations
// =============================================================================

/**
 * Finds reference data by ID
 */
export async function findReferenceDataById(id: string): Promise<ReferenceData | null> {
  return prisma.referenceData.findUnique({
    where: { id },
  });
}

/**
 * Finds reference data by ID with tenant verification
 */
export async function findReferenceDataByIdAndTenant(
  id: string,
  tenantId: string
): Promise<ReferenceData | null> {
  return prisma.referenceData.findFirst({
    where: { id, tenantId },
  });
}

/**
 * Finds reference data by unique composite key
 */
export async function findReferenceDataByKey(params: {
  integrationId: string;
  connectionId: string | null;
  appUserCredentialId?: string | null;
  dataType: string;
  externalId: string;
}): Promise<ReferenceData | null> {
  // Use findFirst with individual conditions to handle null connectionId/appUserCredentialId
  return prisma.referenceData.findFirst({
    where: {
      integrationId: params.integrationId,
      connectionId: params.connectionId,
      appUserCredentialId: params.appUserCredentialId ?? null,
      dataType: params.dataType,
      externalId: params.externalId,
    },
  });
}

/**
 * Finds reference data for an integration with filtering and pagination
 */
export async function findByIntegrationId(
  integrationId: string,
  pagination: PaginationOptions = {},
  filters: ReferenceDataFilters = {}
): Promise<PaginatedReferenceData> {
  const { cursor, limit = 100 } = pagination;

  // Build where clause
  const where: Prisma.ReferenceDataWhereInput = { integrationId };

  if (filters.dataType) {
    where.dataType = filters.dataType;
  }

  if (filters.status) {
    where.status = filters.status;
  }

  if (filters.connectionId) {
    where.connectionId = filters.connectionId;
  }

  if (filters.appUserCredentialId !== undefined) {
    where.appUserCredentialId = filters.appUserCredentialId;
  }

  if (filters.search) {
    where.OR = [
      { name: { contains: filters.search, mode: 'insensitive' } },
      { externalId: { contains: filters.search, mode: 'insensitive' } },
    ];
  }

  // Get total count
  const totalCount = await prisma.referenceData.count({ where });

  // Get data with cursor pagination
  const data = await prisma.referenceData.findMany({
    where,
    take: limit + 1,
    orderBy: [{ dataType: 'asc' }, { name: 'asc' }],
    ...(cursor && {
      cursor: { id: cursor },
      skip: 1,
    }),
  });

  // Determine if there are more results
  const hasMore = data.length > limit;
  if (hasMore) {
    data.pop();
  }

  const nextCursor = hasMore && data.length > 0 ? data[data.length - 1].id : null;

  return { data, nextCursor, totalCount };
}

/**
 * Finds reference data for a connection with filtering and pagination
 */
export async function findByConnectionId(
  connectionId: string,
  pagination: PaginationOptions = {},
  filters: ReferenceDataFilters = {}
): Promise<PaginatedReferenceData> {
  const { cursor, limit = 100 } = pagination;

  const where: Prisma.ReferenceDataWhereInput = { connectionId };

  if (filters.dataType) {
    where.dataType = filters.dataType;
  }

  if (filters.status) {
    where.status = filters.status;
  }

  if (filters.appUserCredentialId !== undefined) {
    where.appUserCredentialId = filters.appUserCredentialId;
  }

  if (filters.search) {
    where.OR = [
      { name: { contains: filters.search, mode: 'insensitive' } },
      { externalId: { contains: filters.search, mode: 'insensitive' } },
    ];
  }

  const totalCount = await prisma.referenceData.count({ where });

  const data = await prisma.referenceData.findMany({
    where,
    take: limit + 1,
    orderBy: [{ dataType: 'asc' }, { name: 'asc' }],
    ...(cursor && {
      cursor: { id: cursor },
      skip: 1,
    }),
  });

  const hasMore = data.length > limit;
  if (hasMore) {
    data.pop();
  }

  const nextCursor = hasMore && data.length > 0 ? data[data.length - 1].id : null;

  return { data, nextCursor, totalCount };
}

/**
 * Finds reference data by type for an integration
 * Optimized for AI context - returns only active items
 */
export async function findByTypes(
  integrationId: string,
  connectionId: string | null,
  dataTypes: string[],
  appUserCredentialId?: string | null
): Promise<ReferenceData[]> {
  return prisma.referenceData.findMany({
    where: {
      integrationId,
      connectionId: connectionId ?? null,
      appUserCredentialId: appUserCredentialId ?? null,
      dataType: { in: dataTypes },
      status: ReferenceDataStatus.active,
    },
    orderBy: { name: 'asc' },
  });
}

/**
 * Gets all distinct data types for an integration
 */
export async function getDataTypes(
  integrationId: string,
  connectionId?: string | null,
  appUserCredentialId?: string | null
): Promise<string[]> {
  const where: Prisma.ReferenceDataWhereInput = { integrationId };

  if (connectionId !== undefined) {
    where.connectionId = connectionId;
  }

  if (appUserCredentialId !== undefined) {
    where.appUserCredentialId = appUserCredentialId;
  }

  const result = await prisma.referenceData.findMany({
    where,
    distinct: ['dataType'],
    select: { dataType: true },
    orderBy: { dataType: 'asc' },
  });

  return result.map((r) => r.dataType);
}

/**
 * Gets summary of reference data by type for an integration
 */
export async function getTypeSummary(
  integrationId: string,
  connectionId?: string | null
): Promise<ReferenceDataTypeSummary[]> {
  const where: Prisma.ReferenceDataWhereInput = { integrationId };

  if (connectionId !== undefined) {
    where.connectionId = connectionId;
  }

  // Get counts grouped by data type and status
  const counts = await prisma.referenceData.groupBy({
    by: ['dataType', 'status'],
    where,
    _count: true,
  });

  // Get latest sync time per data type
  const latestSync = await prisma.referenceData.groupBy({
    by: ['dataType'],
    where,
    _max: { lastSyncedAt: true },
  });

  // Build summary map
  const summaryMap = new Map<string, ReferenceDataTypeSummary>();

  for (const item of counts) {
    let summary = summaryMap.get(item.dataType);
    if (!summary) {
      summary = {
        dataType: item.dataType,
        totalCount: 0,
        activeCount: 0,
        lastSyncedAt: null,
      };
      summaryMap.set(item.dataType, summary);
    }

    summary.totalCount += item._count;
    if (item.status === ReferenceDataStatus.active) {
      summary.activeCount = item._count;
    }
  }

  // Add last synced times
  for (const item of latestSync) {
    const summary = summaryMap.get(item.dataType);
    if (summary && item._max.lastSyncedAt) {
      summary.lastSyncedAt = item._max.lastSyncedAt;
    }
  }

  return Array.from(summaryMap.values()).sort((a, b) => a.dataType.localeCompare(b.dataType));
}

// =============================================================================
// Reference Data - Update Operations
// =============================================================================

/**
 * Updates reference data by ID
 */
export async function updateReferenceData(
  id: string,
  input: UpdateReferenceDataDbInput
): Promise<ReferenceData> {
  const data: Prisma.ReferenceDataUpdateInput = {};

  if (input.name !== undefined) {
    data.name = input.name;
  }

  if (input.metadata !== undefined) {
    data.metadata = input.metadata;
  }

  if (input.status !== undefined) {
    data.status = input.status;
  }

  if (input.syncedByActionId !== undefined) {
    if (input.syncedByActionId === null) {
      data.syncedByAction = { disconnect: true };
    } else {
      data.syncedByAction = { connect: { id: input.syncedByActionId } };
    }
  }

  if (input.lastSyncedAt !== undefined) {
    data.lastSyncedAt = input.lastSyncedAt;
  }

  return prisma.referenceData.update({
    where: { id },
    data,
  });
}

/**
 * Marks reference data items as inactive (soft delete) that were not seen in latest sync
 * Returns count of items marked inactive
 */
export async function markStaleAsInactive(params: {
  integrationId: string;
  connectionId: string | null;
  appUserCredentialId?: string | null;
  dataType: string;
  excludeExternalIds: string[];
  syncedBefore: Date;
}): Promise<number> {
  const result = await prisma.referenceData.updateMany({
    where: {
      integrationId: params.integrationId,
      connectionId: params.connectionId,
      appUserCredentialId: params.appUserCredentialId ?? null,
      dataType: params.dataType,
      externalId: { notIn: params.excludeExternalIds },
      lastSyncedAt: { lt: params.syncedBefore },
      status: ReferenceDataStatus.active,
    },
    data: {
      status: ReferenceDataStatus.inactive,
    },
  });

  return result.count;
}

// =============================================================================
// Reference Data - Delete Operations
// =============================================================================

/**
 * Deletes reference data by ID
 */
export async function deleteReferenceData(id: string): Promise<ReferenceData> {
  return prisma.referenceData.delete({
    where: { id },
  });
}

/**
 * Deletes all reference data for an integration
 */
export async function deleteByIntegrationId(integrationId: string): Promise<number> {
  const result = await prisma.referenceData.deleteMany({
    where: { integrationId },
  });
  return result.count;
}

/**
 * Deletes all reference data for a connection
 */
export async function deleteByConnectionId(connectionId: string): Promise<number> {
  const result = await prisma.referenceData.deleteMany({
    where: { connectionId },
  });
  return result.count;
}

/**
 * Deletes old inactive reference data (for cleanup)
 */
export async function deleteOldInactiveData(olderThan: Date): Promise<number> {
  const result = await prisma.referenceData.deleteMany({
    where: {
      status: ReferenceDataStatus.inactive,
      updatedAt: { lt: olderThan },
    },
  });
  return result.count;
}

// =============================================================================
// Sync Jobs - Create Operations
// =============================================================================

/**
 * Creates a new sync job
 */
export async function createSyncJob(input: CreateSyncJobDbInput): Promise<ReferenceSyncJob> {
  return prisma.referenceSyncJob.create({
    data: {
      tenantId: input.tenantId,
      integrationId: input.integrationId,
      connectionId: input.connectionId ?? null,
      appUserCredentialId: input.appUserCredentialId ?? null,
      dataType: input.dataType,
      status: SyncJobStatus.pending,
    },
  });
}

// =============================================================================
// Sync Jobs - Read Operations
// =============================================================================

/**
 * Finds a sync job by ID
 */
export async function findSyncJobById(id: string): Promise<ReferenceSyncJob | null> {
  return prisma.referenceSyncJob.findUnique({
    where: { id },
  });
}

/**
 * Finds a sync job by ID with tenant verification
 */
export async function findSyncJobByIdAndTenant(
  id: string,
  tenantId: string
): Promise<ReferenceSyncJob | null> {
  return prisma.referenceSyncJob.findFirst({
    where: { id, tenantId },
  });
}

/**
 * Gets the latest sync job for an integration/connection/dataType
 */
export async function getLatestSyncJob(params: {
  integrationId: string;
  connectionId?: string | null;
  appUserCredentialId?: string | null;
  dataType: string;
}): Promise<ReferenceSyncJob | null> {
  const where: Prisma.ReferenceSyncJobWhereInput = {
    integrationId: params.integrationId,
    dataType: params.dataType,
  };

  if (params.connectionId !== undefined) {
    where.connectionId = params.connectionId;
  }

  if (params.appUserCredentialId !== undefined) {
    where.appUserCredentialId = params.appUserCredentialId;
  }

  return prisma.referenceSyncJob.findFirst({
    where,
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Finds sync jobs for an integration with filtering and pagination
 */
export async function findSyncJobsByIntegrationId(
  integrationId: string,
  pagination: PaginationOptions = {},
  filters: SyncJobFilters = {}
): Promise<PaginatedSyncJobs> {
  const { cursor, limit = 20 } = pagination;

  const where: Prisma.ReferenceSyncJobWhereInput = { integrationId };

  if (filters.status) {
    where.status = filters.status;
  }

  if (filters.dataType) {
    where.dataType = filters.dataType;
  }

  if (filters.connectionId) {
    where.connectionId = filters.connectionId;
  }

  if (filters.appUserCredentialId !== undefined) {
    where.appUserCredentialId = filters.appUserCredentialId;
  }

  if (filters.startDate || filters.endDate) {
    where.createdAt = {};
    if (filters.startDate) {
      where.createdAt.gte = filters.startDate;
    }
    if (filters.endDate) {
      where.createdAt.lte = filters.endDate;
    }
  }

  const totalCount = await prisma.referenceSyncJob.count({ where });

  const jobs = await prisma.referenceSyncJob.findMany({
    where,
    take: limit + 1,
    orderBy: { createdAt: 'desc' },
    ...(cursor && {
      cursor: { id: cursor },
      skip: 1,
    }),
  });

  const hasMore = jobs.length > limit;
  if (hasMore) {
    jobs.pop();
  }

  const nextCursor = hasMore && jobs.length > 0 ? jobs[jobs.length - 1].id : null;

  return { jobs, nextCursor, totalCount };
}

/**
 * Checks if there's an active sync job for the given parameters
 */
export async function hasActiveSyncJob(params: {
  integrationId: string;
  connectionId?: string | null;
  appUserCredentialId?: string | null;
  dataType: string;
}): Promise<boolean> {
  const where: Prisma.ReferenceSyncJobWhereInput = {
    integrationId: params.integrationId,
    dataType: params.dataType,
    status: { in: [SyncJobStatus.pending, SyncJobStatus.syncing] },
  };

  if (params.connectionId !== undefined) {
    where.connectionId = params.connectionId;
  }

  if (params.appUserCredentialId !== undefined) {
    where.appUserCredentialId = params.appUserCredentialId;
  }

  const count = await prisma.referenceSyncJob.count({ where });
  return count > 0;
}

/**
 * Gets sync jobs that need to run (stale data based on TTL)
 */
export async function getStaleDataTypes(params: {
  integrationId: string;
  connectionId?: string | null;
  ttlSeconds: number;
}): Promise<string[]> {
  const staleThreshold = new Date(Date.now() - params.ttlSeconds * 1000);

  const where: Prisma.ReferenceDataWhereInput = {
    integrationId: params.integrationId,
    lastSyncedAt: { lt: staleThreshold },
  };

  if (params.connectionId !== undefined) {
    where.connectionId = params.connectionId;
  }

  const result = await prisma.referenceData.findMany({
    where,
    distinct: ['dataType'],
    select: { dataType: true },
  });

  return result.map((r) => r.dataType);
}

// =============================================================================
// Sync Jobs - Update Operations
// =============================================================================

/**
 * Updates a sync job by ID
 */
export async function updateSyncJob(
  id: string,
  input: UpdateSyncJobDbInput
): Promise<ReferenceSyncJob> {
  const data: Prisma.ReferenceSyncJobUpdateInput = {};

  if (input.status !== undefined) {
    data.status = input.status;
  }

  if (input.startedAt !== undefined) {
    data.startedAt = input.startedAt;
  }

  if (input.completedAt !== undefined) {
    data.completedAt = input.completedAt;
  }

  if (input.itemsFound !== undefined) {
    data.itemsFound = input.itemsFound;
  }

  if (input.itemsCreated !== undefined) {
    data.itemsCreated = input.itemsCreated;
  }

  if (input.itemsUpdated !== undefined) {
    data.itemsUpdated = input.itemsUpdated;
  }

  if (input.itemsDeleted !== undefined) {
    data.itemsDeleted = input.itemsDeleted;
  }

  if (input.itemsFailed !== undefined) {
    data.itemsFailed = input.itemsFailed;
  }

  if (input.error !== undefined) {
    data.error = input.error ?? Prisma.JsonNull;
  }

  return prisma.referenceSyncJob.update({
    where: { id },
    data,
  });
}

/**
 * Marks a sync job as started
 */
export async function markSyncJobStarted(id: string): Promise<ReferenceSyncJob> {
  return prisma.referenceSyncJob.update({
    where: { id },
    data: {
      status: SyncJobStatus.syncing,
      startedAt: new Date(),
    },
  });
}

/**
 * Marks a sync job as completed with results
 */
export async function markSyncJobCompleted(
  id: string,
  results: {
    itemsFound: number;
    itemsCreated: number;
    itemsUpdated: number;
    itemsDeleted: number;
    itemsFailed: number;
  }
): Promise<ReferenceSyncJob> {
  return prisma.referenceSyncJob.update({
    where: { id },
    data: {
      status: SyncJobStatus.completed,
      completedAt: new Date(),
      ...results,
    },
  });
}

/**
 * Marks a sync job as failed with error
 */
export async function markSyncJobFailed(
  id: string,
  error: Prisma.InputJsonValue
): Promise<ReferenceSyncJob> {
  return prisma.referenceSyncJob.update({
    where: { id },
    data: {
      status: SyncJobStatus.failed,
      completedAt: new Date(),
      error,
    },
  });
}

// =============================================================================
// Sync Jobs - Delete Operations
// =============================================================================

/**
 * Deletes old sync job records (for cleanup/retention)
 */
export async function deleteOldSyncJobs(olderThan: Date): Promise<number> {
  const result = await prisma.referenceSyncJob.deleteMany({
    where: {
      createdAt: { lt: olderThan },
    },
  });
  return result.count;
}

/**
 * Deletes all sync jobs for an integration
 */
export async function deleteSyncJobsByIntegrationId(integrationId: string): Promise<number> {
  const result = await prisma.referenceSyncJob.deleteMany({
    where: { integrationId },
  });
  return result.count;
}
