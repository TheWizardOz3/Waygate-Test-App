# Feature Spec: Schema Drift Detection

## 1. Overview

### 1.1 One-Line Summary

Detect when external APIs change their response schemas by analyzing patterns in runtime validation failures, creating structured drift reports that the Auto-Maintenance System can act on.

### 1.2 User Story

> As a **developer using Waygate integrations in production**, I want **systematic schema changes to be automatically detected and reported from runtime behavior**, so that **the Auto-Maintenance System can propose fixes and my integrations stay healthy without manual monitoring**.

### 1.3 Problem Statement

External APIs change constantly — fields get deprecated, response structures evolve, types shift. Waygate's response validation already catches these mismatches at runtime and records them in `ValidationFailure` records. But today, those records are just raw data — nobody looks at them, and there's no distinction between a one-off glitch and a systematic schema change.

**What already exists:**

- `ValidationFailure` model tracks per-field validation mismatches with `issueCode`, `fieldPath`, `expectedType`, `receivedType`, `failureCount`, `driftAlertSent`
- Response validation populates `ValidationFailure` records during live action invocations
- Async job system with worker infrastructure for background processing

**What's missing:**

- Aggregation logic to distinguish one-off errors from systematic schema drift
- Structured `DriftReport` model with severity, status lifecycle, and dedup
- A periodic background job to run the analysis
- API endpoints so the Auto-Maintenance System (next feature) can query drift reports and act on them
- Minimal UI to surface drift status on integrations

### 1.4 Business Value

- **User Impact:** Integrations self-report when they're drifting. Users see a badge, not a mystery failure.
- **Business Impact:** Foundation for self-healing integrations (Auto-Maintenance). Without structured drift reports, auto-maintenance has nothing to act on.
- **Technical Impact:** Zero additional external API calls or Firecrawl credits — purely analyzing data already being collected.

---

## 2. Scope & Requirements

### 2.1 Functional Requirements

| ID    | Requirement                                                                | Priority | Notes                                                                |
| ----- | -------------------------------------------------------------------------- | -------- | -------------------------------------------------------------------- |
| FR-1  | Aggregate `ValidationFailure` records to detect systematic drift patterns  | MUST     | Threshold-based: same field fails N+ times = likely drift            |
| FR-2  | `DriftReport` model with severity, status lifecycle, and fingerprint dedup | MUST     | No duplicate reports for the same ongoing change                     |
| FR-3  | Severity classification: breaking, warning, info                           | MUST     | Based on change type (field removed vs. new optional field)          |
| FR-4  | Report lifecycle: detected → acknowledged → resolved/dismissed             | MUST     | Auto-maintenance will transition reports to "resolved" after fixing  |
| FR-5  | Periodic background job to run passive analysis                            | MUST     | Via existing async job system, every 6 hours                         |
| FR-6  | API endpoints for listing/querying drift reports and updating status       | MUST     | Auto-maintenance system consumes these                               |
| FR-7  | Per-integration drift summary (count of unresolved reports by severity)    | MUST     | Powers UI badge and auto-maintenance prioritization                  |
| FR-8  | Configurable sensitivity threshold per integration                         | SHOULD   | Low/medium/high controls how many failures trigger a report          |
| FR-9  | UI: drift count badge on integration cards                                 | SHOULD   | Visual indicator that drift exists                                   |
| FR-10 | UI: simple drift reports list for an integration                           | SHOULD   | Table showing what drifted, severity, status — no diff viewer needed |

### 2.2 Non-Functional Requirements

| Requirement | Target                                                   | Measurement                          |
| ----------- | -------------------------------------------------------- | ------------------------------------ |
| Performance | Passive analysis completes in < 30s for all integrations | Job duration tracking                |
| Reliability | No duplicate drift reports for the same schema change    | Deduplication via change fingerprint |
| Cost        | Zero external API calls or Firecrawl credits             | Purely DB-driven analysis            |

### 2.3 Acceptance Criteria

- [ ] **Given** 5+ `ValidationFailure` records for the same action/field with `issueCode: "type_mismatch"` in 24 hours, **when** passive analysis runs, **then** a `DriftReport` is created with severity "breaking" and status "detected"
- [ ] **Given** repeated `unexpected_field` validation failures for the same path, **when** passive analysis runs, **then** a `DriftReport` is created with severity "info" (new field appeared)
- [ ] **Given** an existing unresolved `DriftReport` with the same fingerprint, **when** passive analysis detects the same pattern again, **then** the existing report's `lastDetectedAt` and `scanCount` are updated (no duplicate)
- [ ] **Given** a `DriftReport` with status "detected", **when** a user or auto-maintenance system PATCHes it to "resolved", **then** the status transitions and `resolvedAt` is set
- [ ] **Given** an integration with unresolved drift reports, **when** the integration list is loaded, **then** a badge shows the count and highest severity
- [ ] **Given** no validation failures exceeding the threshold, **when** passive analysis runs, **then** no drift reports are created and the analysis completes cleanly

### 2.4 Out of Scope

- **Active doc re-scraping** — No periodic documentation crawling. Detection is purely from runtime behavior. Active scanning can be added later if needed.
- **Schema diff viewer** — Reports show what field drifted and the change type, but no side-by-side JSON Schema comparison UI.
- **Auto-remediation** — Drift detection creates reports. The Auto-Maintenance System (next feature) acts on them.
- **Email/Slack notifications** — In-app badges only for now.
- **Input schema drift** — Focus on output (response) schema drift only.
- **Per-integration config UI** — Sensitivity is a simple field on the integration; no dedicated config panel needed.

---

## 3. User Experience

### 3.1 User Flow

**Primary Flow (Automatic — invisible to user):**

```
Live invocations → Response validation → ValidationFailure records
       ↓
  Passive analyzer job (every 6h) → Aggregate failures by action/field
       ↓
  Threshold exceeded? ─── No → Done
       ↓ Yes
  Create/update DriftReport → User sees badge on integration card
       ↓
  (Auto-Maintenance reads reports → proposes fixes)
```

**User Interaction (Minimal):**

```
Integration list → See badge ("3 breaking") → Click into integration
       ↓
  Drift reports tab/section → Simple table of reports
       ↓
  Each row: action name, field path, change type, severity, status, date
       ↓
  User can acknowledge or dismiss (or auto-maintenance resolves automatically)
```

**Happy Path:**

1. Drift detection is enabled by default on all integrations (can be disabled)
2. Every 6 hours, the passive analyzer job runs automatically
3. It queries `ValidationFailure` records grouped by action + field + issue code
4. When patterns exceed the threshold, drift reports are created
5. A badge appears on the integration card showing unresolved drift count
6. Auto-Maintenance System (next feature) reads these reports and proposes schema updates
7. When fixed, reports are marked "resolved"

**Alternate Paths:**

- **No validation failures:** Analysis completes with no reports — everything is healthy
- **Transient errors:** Below-threshold failures are ignored (one-off glitches don't trigger reports)
- **User dismisses report:** Report status changes to "dismissed", won't re-alert unless the fingerprint changes (different field/issue)

---

## 4. Technical Approach

### 4.1 Architecture Fit

| Area              | Impact | Description                                                           |
| ----------------- | ------ | --------------------------------------------------------------------- |
| Frontend          | NEW    | Drift badge component, simple reports list                            |
| Backend           | NEW    | Schema drift module (service, repository, schemas, analyzer, handler) |
| Database          | NEW    | `DriftReport` model                                                   |
| Database          | MODIFY | Add `driftConfig` to Integration model                                |
| External Services | NONE   | Purely DB-driven, no external calls                                   |

**Alignment with Existing Patterns:**

- Module structure: `src/lib/modules/schema-drift/`
- Reuses job queue: `jobQueue.enqueue()` for periodic analysis job
- Reuses `ValidationFailure` model as the data source
- Handler registered via existing `registerJobHandler('drift_passive_analysis', ...)`
- Repository pattern with cursor-based pagination
- Service pattern: Zod safeParse → tenant verify → business logic → repo call

### 4.2 New & Modified Files

```
src/lib/modules/schema-drift/
├── schema-drift.schemas.ts        # Zod schemas for config, report, responses
├── schema-drift.repository.ts     # CRUD for DriftReport
├── schema-drift.service.ts        # Report management, summary queries
├── schema-drift.errors.ts         # Custom error classes
├── passive-drift-analyzer.ts      # Core analysis: ValidationFailure → DriftReport
├── handlers/
│   └── drift-passive.handler.ts   # Job handler for periodic analysis
└── index.ts                       # Module exports + handler registration

src/app/api/v1/integrations/[id]/drift/
├── reports/
│   ├── route.ts                   # GET list reports
│   └── [reportId]/
│       └── route.ts               # GET detail / PATCH status
└── summary/
    └── route.ts                   # GET unresolved counts by severity

src/components/features/schema-drift/
├── DriftBadge.tsx                 # Integration card badge
└── DriftReportsList.tsx           # Simple table of reports

src/hooks/
└── useSchemaDrift.ts              # React Query hooks

# Modified files:
prisma/schema.prisma               # DriftReport model + driftConfig on Integration
src/components/features/integrations/IntegrationCard.tsx  # Add drift badge
```

### 4.3 Key Design Decisions

**Passive-Only Detection:**
All drift detection comes from analyzing existing `ValidationFailure` records — data that's already being collected during live invocations. No documentation re-scraping, no schema comparison engine, no Firecrawl calls. This means:

- Zero additional cost (no AI/scraping credits)
- Zero false positives from AI re-extraction variance
- Only catches drift that's actually affecting live traffic (which is what matters)
- Trade-off: doesn't detect changes _before_ they cause failures, but that's acceptable because (a) API docs rarely update before the API itself changes, and (b) auto-maintenance will fix issues quickly once detected

Active doc re-scraping can be added later as an enhancement if passive-only proves insufficient.

**Severity Classification (from ValidationFailure patterns):**

| ValidationFailure `issueCode` | Drift Severity | Rationale                                      |
| ----------------------------- | -------------- | ---------------------------------------------- |
| `type_mismatch`               | `breaking`     | Field type changed — consuming apps will break |
| `missing_required_field`      | `breaking`     | Required field removed from response           |
| `unexpected_field`            | `info`         | New field appeared — backward compatible       |
| `invalid_enum_value`          | `breaking`     | Enum value changed or removed                  |
| `schema_validation_error`     | `warning`      | General schema mismatch — needs investigation  |

**Change Fingerprint for Deduplication:**
Each drift report has a `fingerprint` — a hash of `actionId + issueCode + fieldPath`. When the analyzer detects a pattern matching an existing unresolved report's fingerprint, it updates `lastDetectedAt` and `scanCount` rather than creating a duplicate. This keeps the reports list clean.

**Threshold Sensitivity:**
The `driftConfig.sensitivity` setting on Integration controls how many failures trigger a report:

| Sensitivity | Threshold           | Best For                                 |
| ----------- | ------------------- | ---------------------------------------- |
| `high`      | 3+ failures in 24h  | Critical integrations, catch drift early |
| `medium`    | 5+ failures in 24h  | Default — good balance                   |
| `low`       | 10+ failures in 48h | Noisy integrations with known quirks     |

**No Separate DriftScan Model:**
Since there's no active scanning (no doc re-scraping), there's no need for a `DriftScan` tracking model. The passive analysis job runs, creates/updates reports, and that's it. The job system's own `AsyncJob` record tracks when analysis ran and whether it succeeded.

---

## 5. Implementation Tasks

### Task 1: Database — DriftReport Model & Integration Config (~30 min)

Add the drift report model and configuration field.

**File:** `prisma/schema.prisma`

**Details:**

- Add `driftConfig Json? @map("drift_config")` to Integration model
- Add `DriftReport` model:
  - `id` (UUID, `gen_random_uuid()`)
  - `integrationId` (FK → Integration)
  - `tenantId` (FK → Tenant)
  - `actionId` (FK → Action)
  - `fingerprint` (string — dedup key)
  - `issueCode` (string — from ValidationFailure)
  - `severity` (string: "info", "warning", "breaking")
  - `status` (string: "detected", "acknowledged", "resolved", "dismissed")
  - `fieldPath` (string — JSON path to affected field)
  - `expectedType` (string, nullable — what the schema says)
  - `currentType` (string, nullable — what the API actually returns)
  - `description` (string — human-readable: "Field 'user.email' type changed from string to null")
  - `failureCount` (int — total failures observed for this pattern)
  - `scanCount` (int, default 1 — how many analysis runs have seen this)
  - `firstDetectedAt`, `lastDetectedAt` (DateTime)
  - `acknowledgedAt`, `resolvedAt` (DateTime, nullable)
  - `createdAt`, `updatedAt` (DateTime)
  - Indexes: `[integrationId, fingerprint]` unique, `[integrationId, severity, status]`, `[tenantId, status]`, `[actionId]`
- Add relation from DriftReport → Integration, Tenant, Action
- Run `prisma db push`

### Task 2: Drift Detection Schemas (~25 min)

Zod schemas for configuration, report responses, and API inputs.

**File:** `src/lib/modules/schema-drift/schema-drift.schemas.ts`

**Details:**

- `DriftConfigSchema`: `enabled` (boolean, default true), `sensitivity` ("low" | "medium" | "high", default "medium"), `ignoreFieldPaths` (string[], default [])
- `DriftReportResponseSchema`: all DriftReport fields as response shape
- `DriftSummaryResponseSchema`: `{ breaking: number, warning: number, info: number, total: number }`
- `UpdateDriftReportStatusSchema`: `{ status: "acknowledged" | "resolved" | "dismissed" }`
- `ListDriftReportsQuerySchema`: pagination (cursor, limit), filters (severity, status, actionId)

### Task 3: Drift Detection Errors (~10 min)

Custom error classes.

**File:** `src/lib/modules/schema-drift/schema-drift.errors.ts`

**Details:**

- `DriftReportNotFoundError` (404)
- `InvalidDriftStatusTransitionError` (400) — e.g., can't resolve an already-dismissed report

### Task 4: Passive Drift Analyzer (~45 min)

Core analysis logic: queries ValidationFailure records, applies thresholds, creates/updates DriftReports.

**File:** `src/lib/modules/schema-drift/passive-drift-analyzer.ts`

**Details:**

- `analyzeIntegration(integrationId, tenantId, sensitivity)`:
  1. Load integration's `driftConfig` (get sensitivity, ignoreFieldPaths)
  2. Query `ValidationFailure` records for the integration's actions, grouped by `actionId + issueCode + fieldPath`
  3. Apply count and time-window thresholds based on sensitivity level
  4. For each group exceeding threshold:
     - Build fingerprint: hash of `actionId + issueCode + fieldPath`
     - Check if DriftReport with this fingerprint already exists and is unresolved
     - If exists: update `lastDetectedAt`, `scanCount`, `failureCount`
     - If not: create new DriftReport with severity from `classifySeverity(issueCode)`, status "detected"
  5. Return `{ reportsCreated: number, reportsUpdated: number, integrationId }`
- `classifySeverity(issueCode: string): Severity` — maps issue codes to breaking/warning/info
- `buildFingerprint(actionId, issueCode, fieldPath): string` — stable hash for dedup
- `buildDescription(issueCode, fieldPath, expectedType, currentType): string` — human-readable message
- Filter out field paths in `ignoreFieldPaths`

### Task 5: Drift Detection Repository (~30 min)

Data access layer for DriftReport.

**File:** `src/lib/modules/schema-drift/schema-drift.repository.ts`

**Details:**

- `upsertDriftReport(input)`: Create or update by fingerprint (upsert on `[integrationId, fingerprint]`)
- `findDriftReportById(id, tenantId)`: Get by ID with tenant verification
- `findDriftReportsByIntegration(integrationId, tenantId, pagination, filters)`: Paginated, filterable by severity/status/actionId
- `updateDriftReportStatus(id, tenantId, status)`: Lifecycle transition with timestamp
- `countUnresolvedByIntegration(integrationId)`: Returns `{ breaking, warning, info }` counts
- `countUnresolvedByTenant(tenantId)`: Cross-integration totals
- `bulkResolveByAction(actionId, tenantId)`: Resolve all reports for an action (used by auto-maintenance after fixing)

### Task 6: Drift Detection Service (~30 min)

Business logic layer: manages reports, provides summaries, validates transitions.

**File:** `src/lib/modules/schema-drift/schema-drift.service.ts`

**Details:**

- `listReports(tenantId, integrationId, pagination, filters)`: Paginated reports
- `getReport(tenantId, reportId)`: Single report with tenant verification
- `updateReportStatus(tenantId, reportId, newStatus)`: Validate transition (detected → acknowledged/dismissed, acknowledged → resolved), set timestamps
- `getIntegrationDriftSummary(tenantId, integrationId)`: Unresolved counts by severity
- `updateDriftConfig(tenantId, integrationId, config)`: Validate and save drift config on integration
- `resolveReportsForAction(tenantId, actionId)`: Bulk resolve (for auto-maintenance)

### Task 7: Passive Analysis Job Handler (~25 min)

Background job handler that runs the analyzer periodically.

**File:** `src/lib/modules/schema-drift/handlers/drift-passive.handler.ts`

**Details:**

- Register as `drift_passive_analysis` handler with concurrency limit of 1
- On claim:
  1. Query all integrations where `driftConfig.enabled` is true (or driftConfig is null — enabled by default)
  2. For each: call `passiveDriftAnalyzer.analyzeIntegration()`
  3. Track totals: integrations analyzed, reports created, reports updated
  4. Update progress based on integration count
- Return summary as job output

### Task 8: Cron Scheduler for Passive Analysis (~20 min)

Cron endpoint that enqueues the passive analysis job.

**File:** `src/app/api/v1/internal/drift-analyzer/route.ts`

**Details:**

- Vercel Cron: runs every 6 hours
- Logic:
  1. Check if a `drift_passive_analysis` job is already running (prevent overlap)
  2. If not: enqueue via `jobQueue.enqueue({ type: 'drift_passive_analysis' })`
- Protected by internal auth (Vercel Cron headers)
- Simple — just enqueues the job, the handler does the work

### Task 9: API Endpoints (~35 min)

REST endpoints for drift reports and summary.

**Files:**

- `src/app/api/v1/integrations/[id]/drift/reports/route.ts`:
  - `GET`: List drift reports for integration (paginated, filterable by severity/status)
- `src/app/api/v1/integrations/[id]/drift/reports/[reportId]/route.ts`:
  - `GET`: Get report detail
  - `PATCH`: Update status (acknowledge/resolve/dismiss)
- `src/app/api/v1/integrations/[id]/drift/summary/route.ts`:
  - `GET`: Unresolved counts by severity `{ breaking: 2, warning: 1, info: 0, total: 3 }`

All endpoints use `withApiAuth` middleware and tenant-scope verification.

### Task 10: Module Index & Handler Registration (~10 min)

Wire the module together.

**File:** `src/lib/modules/schema-drift/index.ts`

**Details:**

- Export service, repository, schemas, errors, analyzer
- Register `drift_passive_analysis` handler via `registerJobHandler()`
- Ensure handler registration runs on app init (side-effect import)

### Task 11: UI — Drift Badge (~20 min)

Drift status indicator on integration cards.

**File:** `src/components/features/schema-drift/DriftBadge.tsx` + modify `IntegrationCard.tsx`

**Details:**

- `DriftBadge` component: small badge showing unresolved count with severity color
  - Breaking (red), Warning (amber), Info (muted)
  - Only renders when count > 0
- Add to `IntegrationCard.tsx` conditionally
- Fetch via `useDriftSummary(integrationId)` hook

### Task 12: UI — Drift Reports List (~30 min)

Simple reports table within integration detail view.

**File:** `src/components/features/schema-drift/DriftReportsList.tsx`

**Details:**

- Table with columns: Action, Field Path, Change Type, Severity, Status, First Detected, Last Detected
- Severity badges (colored)
- Status badges with action buttons (Acknowledge, Dismiss, Resolve)
- Filter by severity and status
- Paginated with cursor-based "Load More"
- Integrate as a tab/section in the integration detail page

### Task 13: React Hooks (~15 min)

React Query hooks for drift data.

**File:** `src/hooks/useSchemaDrift.ts`

**Details:**

- `useDriftSummary(integrationId)`: Fetch unresolved counts (for badge)
- `useDriftReports(integrationId, filters)`: Paginated report list
- `useUpdateDriftReportStatus(reportId)`: Mutation for acknowledge/resolve/dismiss

---

## 6. Test Plan

### Unit Tests

- **Passive drift analyzer:** Threshold logic at each sensitivity level, fingerprint generation and dedup, severity classification per issue code, ignore paths filtering, below-threshold produces no reports, description generation
- **Service:** Report status transitions (valid and invalid), tenant isolation, summary counts, bulk resolve
- **Repository:** Upsert dedup (create vs. update), pagination, filtering, count queries
- **Schemas:** All Zod schemas validate correct/incorrect input, defaults applied, bounds enforced
- **Errors:** Correct codes and status codes

### Integration Tests

- **API endpoints:** List reports, get detail, update status — including auth failures, tenant isolation, 404 for unknowns
- **Job handler e2e:** Seed ValidationFailures → enqueue passive analysis → worker processes → verify DriftReports created with correct severity/fingerprint
- **Dedup:** Run analysis twice with same failures → verify single report with updated scanCount
- **Threshold edge:** Seed exactly N-1 failures → verify no report; add 1 more → verify report created

---

## 7. Dependencies

| Dependency          | Type    | Status | Notes                                                       |
| ------------------- | ------- | ------ | ----------------------------------------------------------- |
| Async Job System    | Feature | Done   | Job queue, worker, handler registration                     |
| ValidationFailure   | Model   | Done   | Already populated by response validation during invocations |
| Response Validation | Module  | Done   | The data source — populates ValidationFailure records       |

**No new external dependencies required.** Purely DB-driven analysis of existing data.

---

## 8. Future Enhancements

| Enhancement                            | Description                                                                 | Trigger                                    |
| -------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------ |
| **Auto-Maintenance System**            | Consume drift reports to auto-propose schema updates with approval workflow | Next V2 feature (depends on this)          |
| **Active doc re-scraping**             | Periodically re-crawl API docs and compare against stored schemas           | If passive detection proves insufficient   |
| **Email/Slack notifications**          | External notification channels for drift alerts                             | When notification system is built          |
| **Input schema drift**                 | Detect changes to API input requirements from input validation failures     | When input validation failures are tracked |
| **Cross-tenant drift signals**         | Aggregate drift across tenants for the same API provider                    | Multi-tenant scale                         |
| **Configurable thresholds per action** | Override sensitivity at the action level instead of just integration level  | If some actions are noisier than others    |
