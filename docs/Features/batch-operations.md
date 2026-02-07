# Feature Spec: Batch Operations

## 1. Overview

### 1.1 One-Line Summary

Collect high-volume action invocations targeting the same integration/action, pace them with proactive rate limit awareness, and — where supported — route them through the external API's bulk endpoint instead of making individual calls.

### 1.2 User Story

> As a **developer using Waygate for agentic workflows**, I want to **submit many actions against the same integration (e.g., 500 Salesforce record updates) and have Waygate process them efficiently — pacing requests to respect rate limits and using bulk APIs where available**, so that **my agents can perform high-volume operations without hitting rate limits or managing batch logic themselves**.

### 1.3 Problem Statement

AI agents using Waygate tools fire many action invocations in rapid succession. When an agent decides to update 500 Salesforce records, it triggers 500 individual `salesforce.updateRecord` calls through the gateway. This creates two problems:

1. **Rate limits:** External APIs enforce request rate limits (e.g., Salesforce REST API: ~100 req/15s). The current reactive handling (detect 429 → exponential backoff → retry) works but is wasteful — requests are made, rejected, and retried repeatedly.

2. **Missed optimization:** Many external APIs offer bulk/batch endpoints (Salesforce Bulk API, HubSpot batch, Google Sheets batchUpdate) that can process hundreds or thousands of records in a single API call. Currently, Waygate always routes through the individual action endpoint even when a more efficient bulk path exists.

**What already exists:**

- Reactive rate limit handling: 429 detection, Retry-After parsing, exponential backoff, circuit breaker
- Rate limit header extraction (`X-RateLimit-Remaining`, etc.) — but the data isn't persisted or used proactively
- Async job system with `AsyncJobItem` model, `batch_operation` type, worker infrastructure

**What's missing:**

- Proactive rate limit pacing (track quota, pace requests to avoid 429s)
- Explicit batch submission endpoint
- Batch handler that processes items with rate-aware pacing
- Bulk action definitions (mapping individual actions to their bulk API equivalents)
- Bulk dispatcher (transform N individual payloads → 1 bulk API call)

### 1.4 Business Value

- **User Impact:** Agents can perform high-volume operations reliably. No rate limit failures, no wasted retries, no manual batching logic.
- **Business Impact:** Unlocks the agentic use case at scale — the primary differentiator for AI application developers who need Waygate to handle hundreds of actions per agent run.
- **Technical Impact:** Establishes proactive rate limit management and bulk routing patterns reusable across the platform. Rate limit tracking benefits all gateway calls, not just batches.

---

## 2. Scope & Requirements

### 2.1 Functional Requirements

| ID    | Requirement                                                                               | Priority | Notes                                                       |
| ----- | ----------------------------------------------------------------------------------------- | -------- | ----------------------------------------------------------- |
| FR-1  | Per-action `batchEnabled` toggle to control which actions expose batch capability         | MUST     | Boolean on Action model, default false                      |
| FR-2  | Per-action `batchConfig` for batch behavior (max items, default concurrency, description) | MUST     | JSONB on Action model, only relevant when batchEnabled=true |
| FR-3  | Tool export generates batch variant for actions with `batchEnabled: true`                 | MUST     | `batch_{tool_name}` in Universal/LangChain/MCP exports      |
| FR-4  | Accept batch requests via API with integration slug, action slug, and items array         | MUST     | POST /api/v1/batch                                          |
| FR-5  | Reject batch requests for actions where `batchEnabled` is false                           | MUST     | 400 error: "Batch not enabled for this action"              |
| FR-6  | Validate all items against action input schema before enqueuing                           | MUST     | Fail fast on invalid items                                  |
| FR-7  | Create batch job with AsyncJobItems via existing job queue                                | MUST     | Use `jobQueue.enqueueWithItems()`                           |
| FR-8  | Proactively pace item processing using rate limit budget from response headers            | MUST     | Track `X-RateLimit-Remaining` / `X-RateLimit-Reset`         |
| FR-9  | Process items via gateway `invokeAction()` by default (individual call path)              | MUST     | Full request pipeline per item                              |
| FR-10 | Support bulk action definitions on Action model (optional bulk endpoint config)           | MUST     | `bulkConfig` JSONB field (separate from batchConfig)        |
| FR-11 | When bulk config exists, route batch through bulk endpoint instead of N calls             | MUST     | Bulk dispatcher transforms payloads, makes single API call  |
| FR-12 | Track per-item success/failure with output/error on AsyncJobItem                          | MUST     | Map bulk response back to individual items                  |
| FR-13 | Report overall job progress as items complete                                             | MUST     | 0-100 progress + progressDetails                            |
| FR-14 | Continue processing remaining items when individual items fail                            | MUST     | Item failure ≠ job failure                                  |
| FR-15 | Return batch results summary on completion (succeeded/failed/skipped counts)              | MUST     | Stored in job.output                                        |
| FR-16 | Allow cancellation and retry of batch jobs                                                | MUST     | Existing job cancel/retry endpoints                         |
| FR-17 | Fall back to paced individual calls when no bulk config exists                            | MUST     | Graceful degradation                                        |
| FR-18 | UI for configuring batch settings per action (enable/disable, config, bulk config)        | SHOULD   | In action detail/edit view                                  |
| FR-19 | UI for submitting and monitoring batch operations                                         | SHOULD   | Form for submission, enhanced progress card                 |

### 2.2 Non-Functional Requirements

| Requirement | Target                                             | Measurement                         |
| ----------- | -------------------------------------------------- | ----------------------------------- |
| Performance | 10x fewer API calls when bulk route available      | Compare batch vs N individual calls |
| Performance | Zero 429 errors during paced individual processing | Rate limit error count              |
| Scalability | Support batch jobs up to 10,000 items              | Schema max validation               |
| Reliability | No item processed more than once per attempt       | Idempotent item claim               |
| Security    | Tenant isolation enforced on all batch operations  | RLS + service checks                |

### 2.3 Acceptance Criteria

- [ ] **Given** an action with `batchEnabled: false`, **when** a batch request targets it, **then** a 400 error is returned: "Batch not enabled for this action"
- [ ] **Given** an action with `batchEnabled: true`, **when** tools are exported, **then** the export includes a `batch_{tool_name}` variant with items-array input schema and batch-specific description
- [ ] **Given** an action with `batchEnabled: false`, **when** tools are exported, **then** no batch variant is included
- [ ] **Given** a valid batch request with 100 items targeting a batch-enabled action, **when** submitted via POST /api/v1/batch, **then** a batch job is created with 100 AsyncJobItems and a 202 response with job ID is returned
- [ ] **Given** a batch targeting an action WITH `bulkConfig`, **when** the handler processes the batch, **then** items are combined into a single bulk API call to the bulk endpoint, and the bulk response is mapped back to individual item results
- [ ] **Given** a batch targeting an action WITHOUT `bulkConfig`, **when** the handler processes the batch, **then** items are processed individually via `invokeAction()`, paced to respect the external API's rate limit headers
- [ ] **Given** a batch of 500 items against an API with 100 req/min rate limit, **when** processed individually (no bulk config), **then** the handler paces at ~100 req/min and produces zero 429 errors
- [ ] **Given** a batch where 5 of 50 items fail, **when** the job completes, **then** output contains `{ succeeded: 45, failed: 5, skipped: 0 }` with per-item error details
- [ ] **Given** a running batch, **when** cancelled, **then** remaining pending items are marked `skipped` and the job completes with partial results
- [ ] **Given** a completed batch with failed items, **when** retried, **then** only failed items are reprocessed
- [ ] **Given** an action's batch settings are modified in the UI, **when** saved, **then** `batchEnabled`, `batchConfig`, and `bulkConfig` are persisted and tool exports reflect the change

### 2.4 Out of Scope

- **Cross-integration batches** — Each batch targets a single integration/action pair. Cross-integration orchestration is a pipeline concern.
- **Automatic request coalescing** — Waygate does not silently buffer individual gateway calls and merge them into batches. Batching is explicit via the batch endpoint. (This could be a future enhancement.)
- **Scheduled/recurring batches** — Batch jobs are one-shot.
- **Bulk config auto-detection** — Bulk action configurations are defined manually when scraping/configuring integrations. AI-powered bulk endpoint detection is a future enhancement.
- **Per-item retry within a batch run** — Failed items are tracked but not auto-retried within the same run. Use job retry to reprocess failures.

---

## 3. User Experience

### 3.1 User Flow

**API Flow (Primary — agentic use case):**

```
Agent/App → POST /api/v1/batch → 202 { jobId }
                                    ↓
                         Worker processes batch:
                         ├─ Bulk config? → Single bulk API call
                         └─ No bulk?    → Paced individual calls
                                    ↓
            Poll GET /api/v1/jobs/{id} → { progress, itemCounts }
                                    ↓
                         Job completed → Results summary
```

**Happy Path:**

1. Agent/app sends POST `/api/v1/batch` with integration slug, action slug, items array, and optional config
2. Waygate validates all items against the action's input schema
3. Waygate creates a batch job with AsyncJobItems
4. Returns 202 with job ID
5. Worker claims the batch job:
   - **Bulk path:** If action has `bulkConfig`, transforms N item payloads into 1 bulk API request, sends it, maps bulk response back to individual items
   - **Individual path:** If no `bulkConfig`, processes items one-by-one via `invokeAction()`, paced by rate limit tracking (reads `X-RateLimit-Remaining` from each response to adjust pacing)
6. App polls for progress/completion
7. On completion, job output contains `{ succeeded, failed, skipped }` with per-item results

**Alternate Paths:**

- **Validation failure:** 400 with per-item errors. Optional `skipInvalidItems: true` to enqueue only valid items.
- **Bulk API failure:** If bulk call fails, fall back to individual paced calls for remaining items.
- **All items fail:** Job completes (not marked `failed`). Output shows `{ succeeded: 0, failed: N }`. User can retry.

**UI Flow:**

```
Jobs page → "New Batch" → Select integration → Select action → Enter items → Submit
     ↓
  Monitor progress → View results → Retry failed items
```

---

## 4. Technical Approach

### 4.1 Architecture Fit

| Area              | Impact | Description                                                               |
| ----------------- | ------ | ------------------------------------------------------------------------- |
| Frontend          | NEW    | Batch config UI in action settings, batch submission form, progress card  |
| Backend           | NEW    | Batch module (service, handler, schemas, errors), rate limit tracker      |
| Backend           | MODIFY | Tool export system — batch variant generator at UniversalTool level       |
| Database          | MODIFY | Add `batchEnabled`, `batchConfig`, `bulkConfig` fields to `actions` table |
| External Services | NONE   | Uses existing gateway service + direct HTTP client for bulk calls         |

**Alignment with Existing Patterns:**

- Module structure: `src/lib/modules/batch-operations/`
- Reuses job queue: `jobQueue.enqueueWithItems()`
- Reuses gateway service: `invokeAction()` for individual call path
- Reuses HTTP client: `httpClient` for bulk call path (new endpoint, same client)
- Reuses tool export pipeline: Batch variant generated at UniversalTool level (post-transformation), same pattern as existing transformer chain
- Rate limit header data already extracted by `http-client.ts` — just needs to be tracked/persisted
- Handler registered via existing `registerJobHandler('batch_operation', ...)`

### 4.2 New & Modified Files

```
src/lib/modules/batch-operations/
├── batch-operations.schemas.ts    # Zod schemas for batch input/config/response + bulk config
├── batch-operations.service.ts    # Validation, job creation, bulk config resolution
├── batch-operations.handler.ts    # Job handler: bulk routing + paced individual fallback
├── batch-operations.errors.ts     # Custom error classes
├── rate-limit-tracker.ts          # Proactive rate limit budget tracking per integration
├── bulk-dispatcher.ts             # Transform N payloads → 1 bulk API call + response mapping
├── batch-tool-variant.ts          # Generate batch UniversalTool variants for export
└── index.ts                       # Module exports + handler registration

src/app/api/v1/batch/
└── route.ts                       # POST endpoint

src/components/features/batch/
├── BatchSubmitForm.tsx             # Submission form
├── BatchProgressCard.tsx           # Progress visualization
└── BatchActionConfig.tsx           # Per-action batch settings panel

src/hooks/
└── useBatchOperations.ts           # React Query hooks

# Modified files:
prisma/schema.prisma                # Add batchEnabled, batchConfig, bulkConfig to Action model
src/lib/modules/tool-export/tool-export.service.ts  # Integrate batch variant generation
```

### 4.3 Key Design Decisions

**Per-Action Opt-In Configuration:**
Batch capability is explicitly enabled per action via three fields on the Action model:

```typescript
// Action model additions:
batchEnabled: boolean     // Default false. Controls whether batch tool variant is exported
                          // and whether POST /api/v1/batch accepts this action.

batchConfig: {            // Controls batch behavior. Only relevant when batchEnabled=true.
  maxItems?: number,      // Max items per batch (default 1000, max 10000)
  defaultConcurrency?: number,  // Default parallel items for individual path (1-20, default 5)
  defaultDelayMs?: number,      // Default delay between items (0-5000, default 0)
  toolDescription?: string,     // Custom description for the batch tool variant
                                // Falls back to auto-generated: "Batch version of {action}..."
}

bulkConfig: {             // Optional. When present, enables the bulk API routing path.
  endpoint: string,       // Bulk API endpoint template
  httpMethod: string,     // Usually POST
  payloadTransform: string,  // How to combine items: 'array' | 'csv' | 'ndjson'
  wrapperKey?: string,    // e.g., 'records' for { records: [...items] }
  maxItemsPerCall?: number,  // Bulk API batch size limit (e.g., 200 for Salesforce)
  responseMapping: {
    itemIdField: string,  // Field in response that maps to individual items
    successField: string, // Field indicating per-item success
    errorField: string,   // Field containing per-item error details
  }
}
```

`batchEnabled` is the gate. If false, no batch tool variant is exported and the batch API rejects requests for this action. `batchConfig` controls behavior. `bulkConfig` is the optional optimization layer (bulk API routing).

**Tool Export Integration — Batch Variant Generation:**
The batch variant is generated as a post-processing step in the tool export pipeline, at the UniversalTool level. For each exported tool where the source action has `batchEnabled: true`:

1. Clone the UniversalTool
2. Rename: `batch_{original_name}` (e.g., `batch_salesforce_update_record`)
3. Wrap the original input parameters in an `items` array:
   ```typescript
   parameters: {
     type: 'object',
     properties: {
       items: {
         type: 'array',
         description: 'Array of items to process in batch',
         items: { type: 'object', properties: originalParameters.properties, required: originalParameters.required }
       },
       config: {  // Optional overrides
         type: 'object',
         properties: {
           concurrency: { type: 'integer', description: 'Parallel items (1-20)' },
           delayMs: { type: 'integer', description: 'Delay between items in ms' }
         }
       }
     },
     required: ['items']
   }
   ```
4. Set description: Use `batchConfig.toolDescription` if provided, otherwise auto-generate:
   `"Batch version of {original_description}. Submit multiple items for background processing. Use this instead of calling {original_name} individually when processing more than ~5 items. Returns a job ID for progress tracking."`
5. Include in tool export alongside the individual variant

The variant generator (`batch-tool-variant.ts`) hooks into `tool-export.service.ts` at the aggregation step — after all tools are transformed to UniversalTool, before format conversion.

**Two Processing Paths (Bulk vs Individual):**
The handler checks if the target action has a `bulkConfig`. If yes, it uses the bulk dispatcher to make a single API call. If no, it falls back to paced individual calls. This means every batch-enabled action works immediately (via pacing), and actions with bulk APIs get the extra optimization.

**Proactive Rate Limit Tracking:**
The rate limit tracker is a lightweight in-memory store (per-integration) that records `remaining` and `resetAt` from response headers. Before dispatching each item, the handler checks: "Do I have budget? If not, wait until reset." This avoids wasted 429s entirely. The tracker lives in-memory for MVP (sufficient since the worker is a single process); Redis-backed tracking is a future enhancement for multi-instance.

**Chunking for Large Batches:**
If a batch has 5000 items but the bulk API accepts max 200 per call, the bulk dispatcher makes 25 bulk API calls (chunked at `maxItemsPerCall`). Each chunk is paced by the rate limit tracker.

**Failure Semantics:**

- **Bulk path:** If the bulk API call fails entirely, mark all items in that chunk as `failed`. If partial success (per-item errors in response), map successes/failures individually.
- **Individual path:** Each item succeeds/fails independently.
- **Job-level:** Job completes when all items are processed (regardless of individual failures). Job only fails if the handler itself throws (infrastructure error).

---

## 5. Implementation Tasks

### Task 1: Database — Add Batch Fields to Action Model (~20 min)

Add batch configuration fields to the `actions` table.

**File:** `prisma/schema.prisma`

**Details:**

- Add `batchEnabled Boolean @default(false) @map("batch_enabled")`
- Add `batchConfig Json? @map("batch_config")` — batch behavior settings
- Add `bulkConfig Json? @map("bulk_config")` — optional bulk API routing config
- Run `prisma db push` (per project convention for schema drift)
- No data migration needed (new fields with safe defaults)

### Task 2: Batch Operations Schemas (~30 min)

Zod schemas for batch input, configuration, bulk config, and responses.

**File:** `src/lib/modules/batch-operations/batch-operations.schemas.ts`

**Details:**

- `BatchConfigSchema`: maxItems (default 1000, max 10000), defaultConcurrency (1-20, default 5), defaultDelayMs (0-5000, default 0), toolDescription (optional string)
- `BulkConfigSchema`: endpoint, httpMethod, payloadTransform ('array'|'csv'|'ndjson'), wrapperKey, maxItemsPerCall, responseMapping (itemIdField, successField, errorField)
- `BatchOperationInput`: integrationSlug, actionSlug, items[] (each with input object), config overrides (concurrency, delayMs, timeoutSeconds, skipInvalidItems)
- `BatchOperationResponse`: jobId, status, itemCount, hasBulkRoute (boolean)
- `BatchResultSummary`: succeeded, failed, skipped, bulkCallsMade, individualCallsMade

### Task 3: Batch Operations Errors (~15 min)

Custom error classes.

**File:** `src/lib/modules/batch-operations/batch-operations.errors.ts`

**Details:**

- `BatchNotEnabledError`: Action does not have batch enabled (400)
- `BatchValidationError`: Items failed schema validation (per-item errors, 400)
- `BatchOperationError`: General batch failure
- `BatchItemLimitExceededError`: Too many items exceeds action's maxItems (400)
- `BulkDispatchError`: Bulk API call failed entirely

### Task 4: Rate Limit Tracker (~45 min)

Proactive rate limit budget tracking per integration.

**File:** `src/lib/modules/batch-operations/rate-limit-tracker.ts`

**Details:**

- In-memory store: Map of `integrationId → { remaining, limit, resetAt }`
- `updateFromHeaders(integrationId, rateLimitInfo)`: Update budget from response headers (already extracted by http-client.ts)
- `acquireBudget(integrationId): Promise<void>`: Wait if no budget available, resolve when budget opens (check remaining > 0, else sleep until resetAt)
- `hasBudget(integrationId): boolean`: Synchronous check
- Conservative defaults: If no rate limit info available yet (first request), allow requests freely; start pacing only after first response with rate limit headers
- Reset tracking when reset window expires

### Task 5: Bulk Dispatcher (~45 min)

Transform N individual payloads into bulk API call(s) and map response back.

**File:** `src/lib/modules/batch-operations/bulk-dispatcher.ts`

**Details:**

- `dispatchBulk(items, bulkConfig, credentials, httpClient)`: Main function
  1. Chunk items by `maxItemsPerCall`
  2. For each chunk: transform payloads per `payloadTransform` (array, CSV, NDJSON)
  3. Wrap in `wrapperKey` if configured (e.g., `{ records: [...] }`)
  4. Send HTTP request to bulk endpoint via existing httpClient
  5. Parse response using `responseMapping` to extract per-item results
  6. Return array of `{ itemId, success, output?, error? }`
- Handle partial success: Map response items back to input items
- Handle total failure: Return all items as failed with the bulk error

### Task 6: Batch Operations Service (~45 min)

Core service: validates input, enforces batch-enabled gate, creates batch job.

**File:** `src/lib/modules/batch-operations/batch-operations.service.ts`

**Details:**

- `submitBatchOperation(tenantId, input)`:
  1. Resolve integration + action by slug (verify tenant access)
  2. **Check `batchEnabled` — if false, throw `BatchNotEnabledError`**
  3. Check item count against `batchConfig.maxItems` limit
  4. Check if action has `bulkConfig` → sets `hasBulkRoute` flag
  5. Validate each item against action's input schema
  6. If `skipInvalidItems: false` and invalid items exist → throw `BatchValidationError`
  7. If `skipInvalidItems: true` → filter out invalid, include validation report
  8. Merge request config overrides with action's `batchConfig` defaults (request overrides win, capped at action limits)
  9. Create batch job via `jobQueue.enqueueWithItems()` with type `batch_operation`
  10. Store in job input: integrationSlug, actionSlug, mergedConfig, tenantId, hasBulkRoute, bulkConfig
  11. Return job response with `hasBulkRoute` indicator
- `retryBatchOperation(tenantId, jobId)`: Reset failed items to pending, re-enqueue

### Task 7: Batch Operations Handler (~60 min)

Job handler — the core processing logic with dual path (bulk vs paced individual).

**File:** `src/lib/modules/batch-operations/batch-operations.handler.ts`

**Details:**

- Register as `batch_operation` handler with concurrency limit of 3 (max simultaneous batch jobs)
- On claim, read job input for config, integration, action, bulk config
- **Bulk path** (when `bulkConfig` exists):
  1. Fetch all pending items
  2. Call `bulkDispatcher.dispatchBulk()` — handles chunking internally
  3. Map results back to AsyncJobItems (success/failure per item)
  4. Update progress after each bulk chunk
- **Individual path** (no bulk config):
  1. Fetch pending items in chunks
  2. For each item: `rateLimitTracker.acquireBudget()` → `invokeAction()` → update item
  3. After each response: `rateLimitTracker.updateFromHeaders()` with rate limit info
  4. Update progress after each chunk
- **Common:**
  - Check for job cancellation between chunks
  - On completion: set job output with `BatchResultSummary`
  - On bulk failure: fall back to individual path for remaining items

### Task 8: Batch Tool Variant Generator (~45 min)

Generate batch UniversalTool variants for the tool export pipeline.

**File:** `src/lib/modules/batch-operations/batch-tool-variant.ts`

**Details:**

- `generateBatchVariant(tool: UniversalTool, action: Action): UniversalTool | null`
  - Returns null if `action.batchEnabled` is false
  - Clones tool, renames to `batch_{original_name}`
  - Wraps original parameters in `items[]` array schema
  - Adds optional `config` parameter (concurrency, delayMs overrides)
  - Sets description from `batchConfig.toolDescription` or auto-generates
- `generateBatchVariants(tools: UniversalTool[], actions: Action[]): UniversalTool[]`
  - Batch helper: generates variants for all batch-enabled actions
  - Returns only the variants (caller concatenates with originals)

### Task 9: Tool Export Integration (~30 min)

Wire batch variant generation into the existing tool export service.

**File:** `src/lib/modules/tool-export/tool-export.service.ts` (modify)

**Details:**

- In `exportAllToolsUniversal()` (and LangChain/MCP equivalents):
  - After transforming simple action tools to UniversalTool
  - Call `generateBatchVariants(actionTools, actions)` to get batch variants
  - Append batch variants to the tools array
  - Update summary counts to include batch variant count
- Only affects simple action tools (not composite/agentic/pipeline — those have their own batching patterns if needed)

### Task 10: Batch API Endpoint (~30 min)

REST endpoint for batch submission.

**File:** `src/app/api/v1/batch/route.ts`

**Details:**

- `POST /api/v1/batch`: Validate → `batchOperationsService.submitBatchOperation()` → 202
- Uses `withApiAuth` middleware
- Response: `{ success: true, data: { jobId, status, itemCount, hasBulkRoute } }`
- Errors: 400 for batch-not-enabled, 400 for validation (per-item detail), 404 for unknown integration/action

### Task 11: Module Index & Handler Registration (~15 min)

Wire module together.

**File:** `src/lib/modules/batch-operations/index.ts`

**Details:**

- Export service, schemas, errors, batch variant generator
- Register `batch_operation` handler via `registerJobHandler()`
- Side-effect import in worker or app init to ensure registration

### Task 12: Batch Operations React Hook (~30 min)

React Query hooks.

**File:** `src/hooks/useBatchOperations.ts`

**Details:**

- `useSubmitBatch()`: Mutation calling POST /api/v1/batch
- `useBatchProgress(jobId)`: Polls job detail at 3s intervals while running
- Reuses existing `useJob()` and `useJobItems()` for detailed monitoring

### Task 13: Batch Action Config UI (~45 min)

Per-action configuration panel for batch settings.

**File:** `src/components/features/batch/BatchActionConfig.tsx`

**Details:**

- Toggle: `batchEnabled` on/off
- When enabled, show `batchConfig` form:
  - Max items (number input, 1-10000)
  - Default concurrency (slider, 1-20)
  - Default delay (number input, 0-5000ms)
  - Tool description override (textarea, optional)
- Collapsible "Bulk API Configuration" section for `bulkConfig`:
  - Endpoint template, HTTP method, payload transform dropdown
  - Wrapper key, max items per call
  - Response mapping fields (item ID, success, error)
- Integrate into existing action detail/edit view

### Task 14: Batch Submit Form UI (~45 min)

Dashboard form for creating batch operations.

**File:** `src/components/features/batch/BatchSubmitForm.tsx`

**Details:**

- Integration selector dropdown (active integrations)
- Action selector (filtered to `batchEnabled: true` actions only)
- "Bulk route available" indicator when action has `bulkConfig`
- Items input: JSON textarea (array of objects)
- Config overrides: concurrency slider, delay input, skip-invalid toggle
- Validation preview before submit
- Submit → redirect to job detail

### Task 15: Batch Progress Card UI (~30 min)

Enhanced progress visualization for batch jobs.

**File:** `src/components/features/batch/BatchProgressCard.tsx`

**Details:**

- Stacked progress bar (succeeded/failed/pending/skipped)
- Processing mode indicator: "Bulk API" vs "Individual (paced)"
- Item counts with live update
- Rate info: current pacing rate, estimated time remaining
- Failed items table with error details
- Integrate into existing `JobDetail.tsx` for batch-type jobs

---

## 6. Test Plan

### Unit Tests

- **Schemas:** Validate all Zod schemas (batchConfig bounds, bulkConfig structure, batch input, config defaults/overrides)
- **Rate limit tracker:** Budget acquisition, waiting behavior, header updates, reset window expiry, no-data-yet passthrough
- **Bulk dispatcher:** Payload transformation (array, CSV, NDJSON), chunking at maxItemsPerCall, response mapping (full success, partial success, total failure), wrapperKey
- **Service:** submitBatchOperation with valid/invalid items, batchEnabled gate (reject when false), skipInvalidItems flag, config merge (request overrides vs action defaults), maxItems enforcement, tenant isolation
- **Handler:** Dual-path routing (bulk vs individual), progress updates, cancellation, fallback from bulk to individual on failure
- **Batch tool variant:** Generates variant only when batchEnabled=true, correct name/schema/description, respects toolDescription override, null when batchEnabled=false
- **Errors:** Correct codes and status codes for all error classes

### Integration Tests

- **API endpoint:** POST /api/v1/batch — valid batch, batch-not-enabled action (400), invalid items, unknown integration, auth failures
- **Tool export:** Export tools with mix of batch-enabled and non-batch actions → verify batch variants present only for enabled actions, correct schema structure
- **End-to-end:** Submit batch → worker processes → poll for completion → verify item results (mocked external API)
- **Bulk path e2e:** Submit batch for action with bulkConfig → verify single bulk API call made → verify per-item results mapped correctly

---

## 7. Dependencies

| Dependency       | Type    | Status | Notes                                           |
| ---------------- | ------- | ------ | ----------------------------------------------- |
| Async Job System | Feature | Done   | Job queue, worker, AsyncJobItem model, UI       |
| Gateway Service  | Module  | Done   | `invokeAction()` for individual call path       |
| HTTP Client      | Module  | Done   | Rate limit header extraction, request execution |

**No new external dependencies required.** Concurrency control uses a simple semaphore pattern (~15 lines). Rate limit tracking is in-memory.

---

## 8. Future Enhancements

| Enhancement                            | Description                                                                        | Trigger                                                |
| -------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------ |
| **AI bulk config detection**           | When scraping API docs, detect bulk/batch endpoints and auto-populate `bulkConfig` | After initial integrations prove the pattern           |
| **Automatic request coalescing**       | Transparently buffer individual gateway calls and merge into batches               | If agentic patterns show consistent high-volume bursts |
| **Redis-backed rate limit tracking**   | Distributed rate limit state for multi-instance deployments                        | When scaling to multiple worker instances              |
| **Webhook/SSE progress notifications** | Push progress updates instead of polling                                           | When real-time UX becomes a priority                   |
| **CSV/file upload**                    | Parse CSV files into batch items in the UI                                         | UI convenience enhancement                             |

---

## 9. Implementation Summary

**Status:** Complete (2026-02-07)

All 15 tasks implemented. The batch operations system supports both bulk API routing (single API call for N items) and paced individual calls with proactive rate limit awareness. Tool exports automatically generate `batch_*` variants for batch-enabled actions. Unit tests cover schemas, errors, rate limit tracker, tool variant generation, and config parsing (93 tests, 4 files).
