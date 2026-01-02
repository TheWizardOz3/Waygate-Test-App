/**
 * Scrape Job Repository
 *
 * Data access layer for ScrapeJob model.
 * Handles CRUD operations for documentation scraping jobs.
 */

import { prisma } from '@/lib/db/client';
import { ScrapeJobStatus } from '@prisma/client';

import type { ScrapeJob, Prisma } from '@prisma/client';

// =============================================================================
// Types
// =============================================================================

/**
 * Input for creating a new scrape job
 */
export interface CreateScrapeJobInput {
  tenantId: string;
  documentationUrl: string;
  wishlist?: string[];
}

/**
 * Input for updating a scrape job
 */
export interface UpdateScrapeJobInput {
  status?: ScrapeJobStatus;
  progress?: number;
  result?: Prisma.InputJsonValue;
  error?: Prisma.InputJsonValue;
  cachedContentKey?: string | null;
  completedAt?: Date | null;
}

/**
 * Filters for querying scrape jobs
 */
export interface ScrapeJobFilters {
  tenantId?: string;
  status?: ScrapeJobStatus;
  statusIn?: ScrapeJobStatus[];
}

// =============================================================================
// Create Operations
// =============================================================================

/**
 * Creates a new scrape job with PENDING status
 */
export async function createScrapeJob(input: CreateScrapeJobInput): Promise<ScrapeJob> {
  return prisma.scrapeJob.create({
    data: {
      tenantId: input.tenantId,
      documentationUrl: input.documentationUrl,
      wishlist: input.wishlist ?? [],
      status: ScrapeJobStatus.PENDING,
      progress: 0,
    },
  });
}

// =============================================================================
// Read Operations
// =============================================================================

/**
 * Finds a scrape job by ID
 */
export async function findScrapeJobById(id: string): Promise<ScrapeJob | null> {
  return prisma.scrapeJob.findUnique({
    where: { id },
  });
}

/**
 * Finds a scrape job by ID with tenant verification
 * Returns null if job doesn't belong to tenant (security check)
 */
export async function findScrapeJobByIdAndTenant(
  id: string,
  tenantId: string
): Promise<ScrapeJob | null> {
  return prisma.scrapeJob.findFirst({
    where: {
      id,
      tenantId,
    },
  });
}

/**
 * Finds all scrape jobs for a tenant
 */
export async function findScrapeJobsByTenant(
  tenantId: string,
  filters?: Pick<ScrapeJobFilters, 'status' | 'statusIn'>
): Promise<ScrapeJob[]> {
  const where: Prisma.ScrapeJobWhereInput = {
    tenantId,
  };

  if (filters?.status) {
    where.status = filters.status;
  }

  if (filters?.statusIn) {
    where.status = { in: filters.statusIn };
  }

  return prisma.scrapeJob.findMany({
    where,
    orderBy: {
      createdAt: 'desc',
    },
  });
}

/**
 * Finds recent scrape jobs for a tenant
 */
export async function findRecentScrapeJobs(
  tenantId: string,
  limit: number = 10
): Promise<ScrapeJob[]> {
  return prisma.scrapeJob.findMany({
    where: { tenantId },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}

/**
 * Finds scrape jobs that are still in progress
 * Used for monitoring/cleanup
 */
export async function findInProgressJobs(): Promise<ScrapeJob[]> {
  return prisma.scrapeJob.findMany({
    where: {
      status: {
        in: [
          ScrapeJobStatus.PENDING,
          ScrapeJobStatus.CRAWLING,
          ScrapeJobStatus.PARSING,
          ScrapeJobStatus.GENERATING,
        ],
      },
    },
    orderBy: {
      createdAt: 'asc',
    },
  });
}

/**
 * Finds a scrape job by documentation URL for a tenant
 * Used to check for existing/cached scrapes
 */
export async function findScrapeJobByUrl(
  tenantId: string,
  documentationUrl: string
): Promise<ScrapeJob | null> {
  return prisma.scrapeJob.findFirst({
    where: {
      tenantId,
      documentationUrl,
      status: ScrapeJobStatus.COMPLETED,
    },
    orderBy: {
      completedAt: 'desc',
    },
  });
}

// =============================================================================
// Update Operations
// =============================================================================

/**
 * Updates a scrape job
 */
export async function updateScrapeJob(id: string, input: UpdateScrapeJobInput): Promise<ScrapeJob> {
  return prisma.scrapeJob.update({
    where: { id },
    data: {
      ...(input.status !== undefined && { status: input.status }),
      ...(input.progress !== undefined && { progress: input.progress }),
      ...(input.result !== undefined && { result: input.result }),
      ...(input.error !== undefined && { error: input.error }),
      ...(input.cachedContentKey !== undefined && { cachedContentKey: input.cachedContentKey }),
      ...(input.completedAt !== undefined && { completedAt: input.completedAt }),
    },
  });
}

/**
 * Updates a scrape job with tenant verification
 * Returns null if job doesn't belong to tenant
 */
export async function updateScrapeJobForTenant(
  id: string,
  tenantId: string,
  input: UpdateScrapeJobInput
): Promise<ScrapeJob | null> {
  // First verify ownership
  const existing = await findScrapeJobByIdAndTenant(id, tenantId);
  if (!existing) {
    return null;
  }

  return updateScrapeJob(id, input);
}

/**
 * Updates the status of a scrape job
 * Convenience method for status transitions
 */
export async function updateScrapeJobStatus(
  id: string,
  status: ScrapeJobStatus,
  progress?: number
): Promise<ScrapeJob> {
  const data: Prisma.ScrapeJobUpdateInput = { status };

  if (progress !== undefined) {
    data.progress = progress;
  }

  // Auto-set completedAt for terminal states
  if (status === ScrapeJobStatus.COMPLETED || status === ScrapeJobStatus.FAILED) {
    data.completedAt = new Date();
    if (status === ScrapeJobStatus.COMPLETED) {
      data.progress = 100;
    }
  }

  return prisma.scrapeJob.update({
    where: { id },
    data,
  });
}

/**
 * Marks a scrape job as failed with error details
 */
export async function markScrapeJobFailed(
  id: string,
  error: Prisma.InputJsonValue
): Promise<ScrapeJob> {
  return prisma.scrapeJob.update({
    where: { id },
    data: {
      status: ScrapeJobStatus.FAILED,
      error,
      completedAt: new Date(),
    },
  });
}

/**
 * Marks a scrape job as completed with result
 */
export async function markScrapeJobCompleted(
  id: string,
  result: Prisma.InputJsonValue,
  cachedContentKey?: string
): Promise<ScrapeJob> {
  return prisma.scrapeJob.update({
    where: { id },
    data: {
      status: ScrapeJobStatus.COMPLETED,
      result,
      progress: 100,
      completedAt: new Date(),
      ...(cachedContentKey && { cachedContentKey }),
    },
  });
}

// =============================================================================
// Delete Operations
// =============================================================================

/**
 * Deletes a scrape job
 */
export async function deleteScrapeJob(id: string): Promise<void> {
  await prisma.scrapeJob.delete({
    where: { id },
  });
}

/**
 * Deletes a scrape job with tenant verification
 */
export async function deleteScrapeJobForTenant(id: string, tenantId: string): Promise<boolean> {
  const existing = await findScrapeJobByIdAndTenant(id, tenantId);
  if (!existing) {
    return false;
  }

  await deleteScrapeJob(id);
  return true;
}

/**
 * Deletes old completed/failed jobs (cleanup)
 * Jobs older than the specified days will be deleted
 */
export async function deleteOldScrapeJobs(olderThanDays: number = 30): Promise<number> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

  const result = await prisma.scrapeJob.deleteMany({
    where: {
      status: {
        in: [ScrapeJobStatus.COMPLETED, ScrapeJobStatus.FAILED],
      },
      completedAt: {
        lt: cutoffDate,
      },
    },
  });

  return result.count;
}

// =============================================================================
// Aggregation Operations
// =============================================================================

/**
 * Counts scrape jobs by status for a tenant
 */
export async function countScrapeJobsByStatus(
  tenantId: string
): Promise<Record<ScrapeJobStatus, number>> {
  const counts = await prisma.scrapeJob.groupBy({
    by: ['status'],
    where: { tenantId },
    _count: true,
  });

  // Initialize all statuses to 0
  const result: Record<ScrapeJobStatus, number> = {
    [ScrapeJobStatus.PENDING]: 0,
    [ScrapeJobStatus.CRAWLING]: 0,
    [ScrapeJobStatus.PARSING]: 0,
    [ScrapeJobStatus.GENERATING]: 0,
    [ScrapeJobStatus.COMPLETED]: 0,
    [ScrapeJobStatus.FAILED]: 0,
  };

  // Fill in actual counts
  for (const count of counts) {
    result[count.status] = count._count;
  }

  return result;
}
