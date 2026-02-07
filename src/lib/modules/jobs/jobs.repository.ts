/**
 * Async Jobs Repository
 *
 * Data access layer for AsyncJob and AsyncJobItem models.
 * Handles CRUD operations, filtering, pagination, and queue-specific queries
 * (claiming jobs, timeout detection, batch item counts).
 *
 * Jobs may be tenant-scoped or system-level (tenantId is nullable).
 */

import { prisma } from '@/lib/db/client';
import { Prisma } from '@prisma/client';

import type { AsyncJob, AsyncJobItem } from '@prisma/client';
import type { AsyncJobFilters } from './jobs.schemas';

// =============================================================================
// Types
// =============================================================================

/**
 * Input for creating a new async job (repository layer)
 */
export interface CreateAsyncJobDbInput {
  tenantId?: string | null;
  type: string;
  input?: Prisma.InputJsonValue;
  maxAttempts?: number;
  timeoutSeconds?: number;
}

/**
 * Input for creating a batch job with items (repository layer)
 */
export interface CreateBatchJobDbInput extends CreateAsyncJobDbInput {
  items: { input?: Prisma.InputJsonValue }[];
}

/**
 * Input for updating an async job (repository layer)
 */
export interface UpdateAsyncJobDbInput {
  status?: string;
  output?: Prisma.InputJsonValue;
  error?: Prisma.InputJsonValue;
  progress?: number;
  progressDetails?: Prisma.InputJsonValue;
  attempts?: number;
  nextRunAt?: Date | null;
  startedAt?: Date | null;
  completedAt?: Date | null;
}

/**
 * Input for updating an async job item (repository layer)
 */
export interface UpdateAsyncJobItemDbInput {
  status?: string;
  output?: Prisma.InputJsonValue;
  error?: Prisma.InputJsonValue;
  attempts?: number;
  completedAt?: Date | null;
}

/**
 * Pagination options
 */
export interface JobPaginationOptions {
  cursor?: string;
  limit?: number;
}

/**
 * Paginated result for async jobs
 */
export interface PaginatedAsyncJobs {
  jobs: AsyncJob[];
  nextCursor: string | null;
  totalCount: number;
}

/**
 * Paginated result for async job items
 */
export interface PaginatedAsyncJobItems {
  items: AsyncJobItem[];
  nextCursor: string | null;
  totalCount: number;
}

/**
 * Item status counts for a batch job
 */
export interface JobItemCounts {
  total: number;
  pending: number;
  running: number;
  completed: number;
  failed: number;
  skipped: number;
}

// =============================================================================
// AsyncJob - Create Operations
// =============================================================================

/**
 * Creates a new async job
 */
export async function createAsyncJob(input: CreateAsyncJobDbInput): Promise<AsyncJob> {
  return prisma.asyncJob.create({
    data: {
      tenantId: input.tenantId ?? null,
      type: input.type,
      input: input.input ?? Prisma.JsonNull,
      maxAttempts: input.maxAttempts ?? 3,
      timeoutSeconds: input.timeoutSeconds ?? 300,
    },
  });
}

/**
 * Creates a batch job (parent + child items) in a single transaction
 */
export async function createBatchJob(
  input: CreateBatchJobDbInput
): Promise<AsyncJob & { items: AsyncJobItem[] }> {
  return prisma.$transaction(async (tx) => {
    const job = await tx.asyncJob.create({
      data: {
        tenantId: input.tenantId ?? null,
        type: input.type,
        input: input.input ?? Prisma.JsonNull,
        maxAttempts: input.maxAttempts ?? 3,
        timeoutSeconds: input.timeoutSeconds ?? 300,
      },
    });

    const itemData = input.items.map((item) => ({
      jobId: job.id,
      input: item.input ?? Prisma.JsonNull,
    }));

    await tx.asyncJobItem.createMany({ data: itemData });

    const items = await tx.asyncJobItem.findMany({
      where: { jobId: job.id },
      orderBy: { createdAt: 'asc' },
    });

    return { ...job, items };
  });
}

// =============================================================================
// AsyncJob - Read Operations
// =============================================================================

/**
 * Finds an async job by ID
 */
export async function findAsyncJobById(id: string): Promise<AsyncJob | null> {
  return prisma.asyncJob.findUnique({
    where: { id },
  });
}

/**
 * Finds an async job by ID with tenant verification
 */
export async function findAsyncJobByIdAndTenant(
  id: string,
  tenantId: string
): Promise<AsyncJob | null> {
  return prisma.asyncJob.findFirst({
    where: { id, tenantId },
  });
}

/**
 * Queries async jobs with filters and cursor-based pagination
 */
export async function findAsyncJobsPaginated(
  pagination: JobPaginationOptions = {},
  filters: AsyncJobFilters = {}
): Promise<PaginatedAsyncJobs> {
  const { cursor, limit = 20 } = pagination;

  const where: Prisma.AsyncJobWhereInput = {};

  if (filters.tenantId) {
    where.tenantId = filters.tenantId;
  }

  if (filters.type) {
    where.type = filters.type;
  }

  if (filters.status) {
    where.status = filters.status;
  }

  const totalCount = await prisma.asyncJob.count({ where });

  const jobs = await prisma.asyncJob.findMany({
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

  return {
    jobs,
    nextCursor,
    totalCount,
  };
}

// =============================================================================
// AsyncJob - Update Operations
// =============================================================================

/**
 * Updates an async job
 */
export async function updateAsyncJob(id: string, input: UpdateAsyncJobDbInput): Promise<AsyncJob> {
  const data: Prisma.AsyncJobUpdateInput = {};

  if (input.status !== undefined) data.status = input.status;
  if (input.output !== undefined) data.output = input.output;
  if (input.error !== undefined) data.error = input.error;
  if (input.progress !== undefined) data.progress = input.progress;
  if (input.progressDetails !== undefined) data.progressDetails = input.progressDetails;
  if (input.attempts !== undefined) data.attempts = input.attempts;
  if (input.nextRunAt !== undefined) data.nextRunAt = input.nextRunAt;
  if (input.startedAt !== undefined) data.startedAt = input.startedAt;
  if (input.completedAt !== undefined) data.completedAt = input.completedAt;

  return prisma.asyncJob.update({
    where: { id },
    data,
  });
}

// =============================================================================
// AsyncJob - Delete Operations
// =============================================================================

/**
 * Deletes an async job (cascades to items)
 */
export async function deleteAsyncJob(id: string): Promise<AsyncJob> {
  return prisma.asyncJob.delete({
    where: { id },
  });
}

// =============================================================================
// AsyncJobItem - Read Operations
// =============================================================================

/**
 * Finds an async job item by ID
 */
export async function findAsyncJobItemById(id: string): Promise<AsyncJobItem | null> {
  return prisma.asyncJobItem.findUnique({
    where: { id },
  });
}

/**
 * Queries items for a specific job with optional status filter and pagination
 */
export async function findAsyncJobItemsPaginated(
  jobId: string,
  pagination: JobPaginationOptions = {},
  statusFilter?: string
): Promise<PaginatedAsyncJobItems> {
  const { cursor, limit = 20 } = pagination;

  const where: Prisma.AsyncJobItemWhereInput = { jobId };

  if (statusFilter) {
    where.status = statusFilter;
  }

  const totalCount = await prisma.asyncJobItem.count({ where });

  const items = await prisma.asyncJobItem.findMany({
    where,
    take: limit + 1,
    orderBy: { createdAt: 'asc' },
    ...(cursor && {
      cursor: { id: cursor },
      skip: 1,
    }),
  });

  const hasMore = items.length > limit;
  if (hasMore) {
    items.pop();
  }

  const nextCursor = hasMore && items.length > 0 ? items[items.length - 1].id : null;

  return {
    items,
    nextCursor,
    totalCount,
  };
}

// =============================================================================
// AsyncJobItem - Update Operations
// =============================================================================

/**
 * Updates an async job item
 */
export async function updateAsyncJobItem(
  id: string,
  input: UpdateAsyncJobItemDbInput
): Promise<AsyncJobItem> {
  const data: Prisma.AsyncJobItemUpdateInput = {};

  if (input.status !== undefined) data.status = input.status;
  if (input.output !== undefined) data.output = input.output;
  if (input.error !== undefined) data.error = input.error;
  if (input.attempts !== undefined) data.attempts = input.attempts;
  if (input.completedAt !== undefined) data.completedAt = input.completedAt;

  return prisma.asyncJobItem.update({
    where: { id },
    data,
  });
}

// =============================================================================
// Queue-Specific Operations
// =============================================================================

/**
 * Atomically claims the next queued jobs for processing.
 * Uses raw SQL with UPDATE ... WHERE for atomic claim to prevent
 * concurrent workers from claiming the same job.
 *
 * Only claims jobs where:
 * - status is 'queued'
 * - nextRunAt is null or in the past (respects retry backoff)
 *
 * Optionally filters by job type for type-specific workers.
 */
export async function claimNextJobs(options: {
  limit?: number;
  type?: string;
}): Promise<AsyncJob[]> {
  const { limit = 10, type } = options;

  const typeFilter = type ? Prisma.sql`AND type = ${type}` : Prisma.empty;

  const claimedIds = await prisma.$queryRaw<{ id: string }[]>`
    UPDATE async_jobs
    SET status = 'running',
        started_at = NOW(),
        attempts = attempts + 1,
        updated_at = NOW()
    WHERE id IN (
      SELECT id FROM async_jobs
      WHERE status = 'queued'
        AND (next_run_at IS NULL OR next_run_at <= NOW())
        ${typeFilter}
      ORDER BY created_at ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id
  `;

  if (claimedIds.length === 0) {
    return [];
  }

  return prisma.asyncJob.findMany({
    where: { id: { in: claimedIds.map((row) => row.id) } },
    include: { items: true },
    orderBy: { createdAt: 'asc' },
  });
}

/**
 * Detects timed-out jobs and marks them as failed.
 * A job is timed out if it's been running longer than its timeoutSeconds.
 * Returns the count of jobs that were timed out.
 */
export async function detectAndFailTimedOutJobs(): Promise<number> {
  const result = await prisma.$executeRaw`
    UPDATE async_jobs
    SET status = 'failed',
        error = jsonb_build_object(
          'code', 'JOB_TIMEOUT',
          'message', 'Job timed out while running'
        ),
        completed_at = NOW(),
        updated_at = NOW()
    WHERE status = 'running'
      AND started_at IS NOT NULL
      AND started_at + (timeout_seconds * interval '1 second') < NOW()
  `;

  return result;
}

/**
 * Gets item status counts for a batch job
 */
export async function getJobItemCounts(jobId: string): Promise<JobItemCounts> {
  const counts = await prisma.asyncJobItem.groupBy({
    by: ['status'],
    where: { jobId },
    _count: true,
  });

  const result: JobItemCounts = {
    total: 0,
    pending: 0,
    running: 0,
    completed: 0,
    failed: 0,
    skipped: 0,
  };

  for (const item of counts) {
    const count = item._count;
    result.total += count;
    if (item.status in result) {
      result[item.status as keyof Omit<JobItemCounts, 'total'>] = count;
    }
  }

  return result;
}

/**
 * Counts running jobs by type (for concurrency limiting)
 */
export async function countRunningJobsByType(type: string): Promise<number> {
  return prisma.asyncJob.count({
    where: { type, status: 'running' },
  });
}

/**
 * Batch updates items for a job (used by handlers processing batch items)
 */
export async function batchUpdateJobItems(
  updates: { id: string; data: UpdateAsyncJobItemDbInput }[]
): Promise<void> {
  await prisma.$transaction(
    updates.map(({ id, data }) => {
      const updateData: Prisma.AsyncJobItemUpdateInput = {};
      if (data.status !== undefined) updateData.status = data.status;
      if (data.output !== undefined) updateData.output = data.output;
      if (data.error !== undefined) updateData.error = data.error;
      if (data.attempts !== undefined) updateData.attempts = data.attempts;
      if (data.completedAt !== undefined) updateData.completedAt = data.completedAt;

      return prisma.asyncJobItem.update({ where: { id }, data: updateData });
    })
  );
}

/**
 * Gets pending items for a job (for handler processing)
 */
export async function findPendingItemsForJob(
  jobId: string,
  limit: number = 100
): Promise<AsyncJobItem[]> {
  return prisma.asyncJobItem.findMany({
    where: { jobId, status: 'pending' },
    take: limit,
    orderBy: { createdAt: 'asc' },
  });
}
