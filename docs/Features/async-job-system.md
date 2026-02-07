# Feature: Async Job System

**Milestone:** V2 (Deploy & Scale)
**Status:** Complete
**Dependencies:** TypeScript Error Fixes (V2, Done)
**Priority:** P0
**Downstream Dependents:** Batch Operations, Schema Drift Detection, Auto-Maintenance System

---

## 1. Overview

### 1.1 One-Line Summary

A database-backed job queue with a worker service that provides the infrastructure for batch operations, schema drift detection, and other async work — without adding external dependencies.

### 1.2 User Story

> As a **platform developer**, I want **a generic job queue with retry logic, progress tracking, and status management**, so that **I can build batch operations, schema drift detection, and other async features on a consistent foundation**.

### 1.3 Problem Statement

Waygate needs to support new V2 features that require background processing:

1. **Batch Operations** — Collect high-volume write actions (e.g., 1000 Salesforce record updates), intelligently group them, and dispatch via provider batch APIs or rate-limited individual calls
2. **Schema Drift Detection** — Periodically re-scrape API docs and compare against stored schemas
3. **Auto-Maintenance** — Detect API changes and propose integration config updates

There's currently no generic job queue to build these on. Each would require inventing its own status tracking, retry logic, and failure handling — duplicating patterns that should be shared infrastructure.

**What this feature is NOT:** This is not a migration of existing background work. The current Vercel Cron tasks (token refresh, health checks, reference sync) work fine and stay as-is. This feature builds **new** infrastructure specifically to enable the downstream V2 features.

### 1.4 Business Value

- **User Impact:** Enables batch operations with progress tracking and retry — users can fire off bulk operations and monitor progress
- **Business Impact:** Unblocks the next three V2 features (Batch Operations, Schema Drift Detection, Auto-Maintenance) which all need a job queue
- **Technical Impact:** Zero new external dependencies. DB-backed approach uses existing PostgreSQL and Vercel Cron. Designed with a clean interface that can be swapped to Trigger.dev or similar if scale demands it later.

---

## 2. Scope & Requirements

### 2.1 Functional Requirements

| ID    | Requirement                                                          | Priority | Notes                                                         |
| ----- | -------------------------------------------------------------------- | -------- | ------------------------------------------------------------- |
| FR-1  | Generic AsyncJob database model for job tracking                     | MUST     | Unified status/history across all job types                   |
| FR-2  | Job queue service with enqueue, claim, complete, fail operations     | MUST     | Abstract interface for future swap-ability                    |
| FR-3  | Worker service that polls for queued jobs and dispatches to handlers | MUST     | Vercel Cron-triggered, processes in chunks                    |
| FR-4  | Configurable retry with exponential backoff per job type             | MUST     | Max attempts, backoff multiplier                              |
| FR-5  | Job progress tracking (0-100% with stage details)                    | MUST     | For batch ops visibility                                      |
| FR-6  | Support batch job pattern (parent job with child items)              | MUST     | Parent tracks overall progress, children are individual items |
| FR-7  | Job timeout detection (mark stuck jobs as failed)                    | MUST     | Configurable per job type, checked by worker                  |
| FR-8  | Concurrency limits per job type                                      | SHOULD   | Prevent overwhelming external APIs                            |
| FR-9  | Job management API (list, get details, cancel, retry)                | MUST     | REST endpoints under /api/v1/jobs                             |
| FR-10 | Jobs monitoring UI page                                              | MUST     | Dashboard with filtering, status, history                     |

### 2.2 Non-Functional Requirements

| Requirement   | Target                                   | Measurement                |
| ------------- | ---------------------------------------- | -------------------------- |
| Reliability   | Failed jobs retry automatically          | AsyncJob attempt tracking  |
| Latency       | < 60s from enqueue to first processing   | Worker polls every minute  |
| Observability | All job runs visible in UI with status   | Jobs monitoring page       |
| Portability   | Queue interface swappable to Trigger.dev | Clean abstraction boundary |

### 2.3 Acceptance Criteria

- [ ] **Given** a job is enqueued, **when** the worker runs, **then** the job is claimed and dispatched to the appropriate handler within 60 seconds
- [ ] **Given** a job handler fails, **when** attempts remain, **then** the job is re-queued with exponential backoff delay
- [ ] **Given** a job handler fails, **when** max attempts exhausted, **then** the job is marked failed with error details
- [ ] **Given** a batch parent job with 100 child items, **when** processing, **then** parent progress reflects child completion percentage
- [ ] **Given** a job has been running longer than its timeout, **when** the worker detects it, **then** it's marked as failed with a timeout error
- [ ] **Given** the jobs API, **when** listing jobs with filters, **then** results include pagination, status filtering, and type filtering
- [ ] **Given** a failed job, **when** retried via API or UI, **then** it's re-enqueued and processed

### 2.4 Out of Scope

- **Migrating existing Vercel Cron tasks** — Token refresh, health checks, and reference sync stay on Vercel Cron (they work fine)
- **Workflow orchestration / DAG execution** — No multi-step pipelines (that's the pipelines module)
- **Job priorities** — All jobs processed FIFO within their type; priority queues deferred
- **Real-time WebSocket updates** — Poll-based UI updates sufficient for V2
- **The batch operations logic itself** — This feature builds the queue infrastructure; the Batch Operations feature builds the smart batching/dispatch logic on top

---

## 3. User Experience

### 3.1 User Flow

**Monitoring (primary UI flow):**

```
Dashboard Sidebar → "Jobs" → Job List (filtered by type/status)
     ↓
  Click Job → Job Detail (progress, items, error, retry button)
```

**Happy Path:**

1. A downstream feature (batch ops, schema drift) enqueues a job
2. Job appears in Jobs page as "queued"
3. Worker picks it up, status moves to "running", progress updates
4. Job completes, results stored
5. User can view history, filter by type/status, inspect details

**Failure Path:**

1. Job handler fails → job re-queued with backoff delay
2. After max retries → job marked "failed" with error details
3. User sees failed job in UI → clicks retry → job re-enqueued

---

## 4. Technical Approach

### 4.1 Architecture Fit

| Area              | Impact | Description                                                  |
| ----------------- | ------ | ------------------------------------------------------------ |
| Frontend          | NEW    | Jobs monitoring page and job detail view                     |
| Backend           | NEW    | Job module (service, repository, schemas), worker endpoint   |
| Database          | NEW    | AsyncJob + AsyncJobItem models                               |
| External Services | NONE   | No new dependencies — uses existing PostgreSQL + Vercel Cron |

**Alignment with Existing Patterns:**

- Module pattern: `src/lib/modules/jobs/` with service, repository, schemas
- API routes: `/api/v1/jobs/` following existing REST conventions
- Worker endpoint: `/api/v1/internal/job-worker` following existing internal endpoint pattern
- Zod for all validation, repository pattern for DB access

### 4.2 Technology Choice: DB-Backed Queue

**Approach:** Use PostgreSQL as the job queue with a Vercel Cron worker that polls every minute.

**Why this over Trigger.dev/BullMQ:**

- Zero new external dependencies
- Uses existing infrastructure (PostgreSQL + Vercel Cron)
- Full control over behavior
- Current scale (10 concurrent users, 10 req/s) doesn't warrant a dedicated job queue service
- Simpler local dev — no external accounts or services to configure

**Tradeoff:** Limited by Vercel function timeout (60s per worker cycle). A batch of 500 items processed at ~20-30 per cycle completes in ~20 minutes rather than continuously. Acceptable for current scale.

**Migration path to Trigger.dev:** The job service exposes a clean `JobQueue` interface (enqueue, claim, complete, fail). If scale demands it later, replace the DB-backed implementation with a Trigger.dev adapter — no changes to downstream consumers (batch ops, schema drift, etc.).

### 4.3 Database Schema

```prisma
model AsyncJob {
  id              String         @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId        String?        @map("tenant_id") @db.Uuid
  type            String         // e.g., "batch_operation", "schema_drift", "scrape"
  status          String         @default("queued") // queued, running, completed, failed, cancelled
  input           Json?          // Job-specific input parameters (sanitized)
  output          Json?          // Job result on completion
  error           Json?          // Error details on failure
  progress        Int            @default(0) // 0-100
  progressDetails Json?          @map("progress_details") // Stage-specific details
  attempts        Int            @default(0)
  maxAttempts     Int            @default(3) @map("max_attempts")
  timeoutSeconds  Int            @default(300) @map("timeout_seconds") // Per-job-type timeout
  nextRunAt       DateTime?      @map("next_run_at") @db.Timestamptz // For retry backoff scheduling
  startedAt       DateTime?      @map("started_at") @db.Timestamptz
  completedAt     DateTime?      @map("completed_at") @db.Timestamptz
  createdAt       DateTime       @default(now()) @map("created_at") @db.Timestamptz
  updatedAt       DateTime       @updatedAt @map("updated_at") @db.Timestamptz

  tenant          Tenant?        @relation(fields: [tenantId], references: [id])
  items           AsyncJobItem[]

  @@index([tenantId, createdAt(sort: Desc)], map: "async_jobs_tenant_created_idx")
  @@index([type, status], map: "async_jobs_type_status_idx")
  @@index([status, nextRunAt], map: "async_jobs_status_next_run_idx")
  @@map("async_jobs")
}

model AsyncJobItem {
  id          String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  jobId       String    @map("job_id") @db.Uuid
  status      String    @default("pending") // pending, running, completed, failed, skipped
  input       Json?     // Item-specific input
  output      Json?     // Item result
  error       Json?     // Item error details
  attempts    Int       @default(0)
  createdAt   DateTime  @default(now()) @map("created_at") @db.Timestamptz
  completedAt DateTime? @map("completed_at") @db.Timestamptz

  job         AsyncJob  @relation(fields: [jobId], references: [id], onDelete: Cascade)

  @@index([jobId, status], map: "async_job_items_job_status_idx")
  @@map("async_job_items")
}
```

**Key design decisions:**

- `tenantId` is nullable — system-level jobs (e.g., schema drift scan across all tenants) don't belong to a specific tenant
- `AsyncJobItem` supports the batch pattern — a parent job has N child items, each tracked individually. This is how Batch Operations will work: the parent job represents "update 1000 Salesforce records", each item is one record
- `nextRunAt` enables retry backoff — failed jobs set this to `now() + backoff_delay`, worker only picks up jobs where `nextRunAt <= now()`
- `timeoutSeconds` is per-job — worker marks jobs as failed if `startedAt + timeoutSeconds < now()` and status is still "running"

### 4.4 Job Queue Interface (Swap-Friendly)

```typescript
// src/lib/modules/jobs/jobs.queue.ts
// Clean interface — can be re-implemented with Trigger.dev later

interface JobQueue {
  enqueue(params: EnqueueJobParams): Promise<AsyncJob>;
  enqueueWithItems(params: EnqueueBatchJobParams): Promise<AsyncJob>;
  claimNext(type?: string, limit?: number): Promise<AsyncJob[]>;
  updateProgress(jobId: string, progress: number, details?: Json): Promise<void>;
  completeJob(jobId: string, output?: Json): Promise<void>;
  failJob(jobId: string, error: Json): Promise<void>;
  cancelJob(jobId: string): Promise<void>;
  retryJob(jobId: string): Promise<void>;
  detectTimeouts(): Promise<number>; // Returns count of timed-out jobs
}
```

Downstream features (Batch Operations, Schema Drift) consume `JobQueue` — they never touch the database directly. If we swap to Trigger.dev, we replace the DB implementation of `JobQueue` with a Trigger.dev adapter.

### 4.5 Worker Architecture

```
Vercel Cron (every 1 min) → POST /api/v1/internal/job-worker
  → verifyCronSecret()
  → detectTimeouts()           // Mark stuck jobs as failed
  → claimNext(limit: 10)      // Claim up to 10 queued jobs
  → For each claimed job:
      → Look up handler by job.type (handler registry)
      → Execute handler with job context
      → On success: completeJob()
      → On failure: failJob() or re-queue with backoff
  → Return summary { processed, succeeded, failed, timedOut }
```

**Handler registry pattern:**

```typescript
const handlers: Record<string, JobHandler> = {
  batch_operation: batchOperationHandler,
  schema_drift: schemaDriftHandler,
  // Future types register here
};
```

Each handler receives the job and its items, and is responsible for the domain logic. The worker handles lifecycle (claim, complete, fail, retry).

### 4.6 Batch Job Pattern (for downstream Batch Operations)

The Async Job System provides the **primitives** for batch jobs. The Batch Operations feature will build the smart dispatch logic on top. Key design consideration:

**The job system does NOT assume 1 item = 1 API call.** When the Batch Operations feature creates a batch job with 1000 Salesforce record updates, the handler is free to:

- Detect that Salesforce has a bulk API
- Group the 1000 items into a single Salesforce Bulk API call
- Or group into chunks of 200 (Salesforce's limit per bulk request) = 5 API calls
- Or fall back to individual calls with rate limiting if no batch API exists

The job system just tracks: parent job status/progress, individual item status, overall completion. The batching strategy is a Batch Operations concern.

```
AsyncJob (type: "batch_operation")
  ├── status: running, progress: 45%
  ├── input: { integrationSlug: "salesforce", actionSlug: "updateRecord", strategy: "bulk_api" }
  ├── AsyncJobItem #1 (status: completed) — Record A
  ├── AsyncJobItem #2 (status: completed) — Record B
  ├── ...
  └── AsyncJobItem #1000 (status: pending) — Record ZZ
```

### 4.7 API Endpoints

| Method | Endpoint                  | Purpose                             | Auth    |
| ------ | ------------------------- | ----------------------------------- | ------- |
| GET    | `/api/v1/jobs`            | List jobs (paginated, filterable)   | API Key |
| GET    | `/api/v1/jobs/:id`        | Get job details (with item summary) | API Key |
| GET    | `/api/v1/jobs/:id/items`  | List items for a batch job          | API Key |
| POST   | `/api/v1/jobs/:id/cancel` | Cancel a queued or running job      | API Key |
| POST   | `/api/v1/jobs/:id/retry`  | Retry a failed job                  | API Key |

**Query parameters for GET /jobs:**

- `type` — Filter by job type
- `status` — Filter by status (queued, running, completed, failed, cancelled)
- `cursor` — Cursor-based pagination
- `limit` — Page size (default 20, max 100)

**Internal endpoint (Vercel Cron):**

| Method | Endpoint                      | Purpose           | Auth        |
| ------ | ----------------------------- | ----------------- | ----------- |
| POST   | `/api/v1/internal/job-worker` | Process job queue | CRON_SECRET |

### 4.8 Module Structure

```
src/lib/modules/jobs/
├── jobs.service.ts           # Enqueue, status management, progress
├── jobs.repository.ts        # AsyncJob + AsyncJobItem database access
├── jobs.schemas.ts           # Zod schemas for job types, API input/output
├── jobs.errors.ts            # JobNotFoundError, JobTimeoutError, etc.
├── jobs.queue.ts             # JobQueue interface + DB-backed implementation
├── jobs.worker.ts            # Worker logic (claim, dispatch, lifecycle)
├── jobs.handlers.ts          # Handler registry + handler interface
└── index.ts                  # Module exports
```

---

## 5. Implementation Tasks

Each task is ~30-60 minutes of focused work.

| #   | Task                                                                                                              | Est.   | Dependencies |
| --- | ----------------------------------------------------------------------------------------------------------------- | ------ | ------------ |
| 1   | Add AsyncJob + AsyncJobItem models to Prisma schema, run db push                                                  | 30 min | None         |
| 2   | Create jobs module: Zod schemas for job types, statuses, API input/output                                         | 30 min | None         |
| 3   | Create jobs repository (CRUD for AsyncJob + AsyncJobItem, filtering, pagination)                                  | 45 min | Tasks 1, 2   |
| 4   | Create JobQueue interface and DB-backed implementation (enqueue, claim, complete, fail, retry, timeout detection) | 60 min | Task 3       |
| 5   | Create worker service with handler registry and dispatch logic                                                    | 45 min | Task 4       |
| 6   | Create worker Vercel Cron endpoint (/api/v1/internal/job-worker) with cron secret auth                            | 30 min | Task 5       |
| 7   | Create job management API endpoints (list, get, get items, cancel, retry)                                         | 45 min | Task 3       |
| 8   | Create Jobs monitoring UI page with job list table and type/status filtering                                      | 60 min | Task 7       |
| 9   | Create Job detail view with progress bar, item summary, error details, retry/cancel controls                      | 45 min | Task 8       |
| 10  | Add job-worker cron entry to vercel.json, update .env.example                                                     | 15 min | Task 6       |

**Total estimate:** ~7 hours

---

## 6. Test Plan

### Unit Tests

- JobQueue: enqueue, claim (respects nextRunAt), complete, fail, retry (backoff calculation), timeout detection
- Job service: create job, create batch job with items, progress calculation from item statuses
- Job repository: CRUD, filtering by type/status, pagination, item counts
- Worker: handler dispatch, lifecycle management, error handling

### Integration Tests

- API endpoints: list/get/cancel/retry with auth, pagination, filtering
- Worker endpoint: cron secret validation, processes queued jobs, skips jobs with future nextRunAt
- Batch pattern: enqueue parent with 10 items, process items, verify parent progress updates

### E2E Tests

- Enqueue a test job → verify it appears in Jobs UI → verify worker processes it → verify completion shown

---

## 7. Risks & Mitigations

| Risk                                 | Impact                             | Mitigation                                                                                             |
| ------------------------------------ | ---------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Vercel 60s timeout limits throughput | Large batches take multiple cycles | Acceptable at current scale; Trigger.dev migration path documented                                     |
| Worker crashes mid-processing        | Job stuck in "running" state       | Timeout detection marks stuck jobs as failed; next worker cycle retries them                           |
| Concurrent workers claim same job    | Duplicate processing               | Use `UPDATE ... WHERE status = 'queued' RETURNING` for atomic claim (PostgreSQL row-level locking)     |
| Job table grows unbounded            | DB performance degrades            | Add retention policy — archive/delete completed jobs older than 30 days (same pattern as request_logs) |

---

## 8. Future Migration Path

If scale outgrows the DB-backed approach:

1. Install Trigger.dev v3 SDK
2. Create a `TriggerDevJobQueue` implementing the same `JobQueue` interface
3. Register Trigger.dev tasks that call existing handlers
4. Swap the implementation in the module's `index.ts`
5. Remove the Vercel Cron worker endpoint

No changes needed in downstream consumers (Batch Operations, Schema Drift, etc.) because they only depend on the `JobQueue` interface, not the DB-backed implementation.
