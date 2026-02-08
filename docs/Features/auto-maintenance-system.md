# Feature Spec: Auto-Maintenance System

## 1. Overview

### 1.1 One-Line Summary

Automatically detect API schema changes (both input and output), propose integration config updates based on drift reports, apply approved schema updates, suggest (not auto-apply) description updates for affected tools, and support lightweight revert — keeping integrations healthy with minimal manual intervention.

### 1.2 User Story

> As a **developer with Waygate integrations in production**, I want **the system to automatically propose fixes when API schemas change**, so that **my integrations stay healthy without me manually investigating and updating schemas every time an external API evolves**.

### 1.3 Problem Statement

Schema Drift Detection (now complete) identifies _when_ external API **responses** change by analyzing runtime validation failures. But detection alone isn't enough — today, when a drift report appears, the developer must:

1. Read the drift report to understand what changed
2. Manually investigate the new API behavior (check docs, make test calls)
3. Update the action's schema by hand
4. Resolve the drift report manually

And there's a second gap: **input schema drift is entirely invisible**. When an API changes its required parameters, those failures are thrown as gateway errors but never recorded or analyzed. The developer only discovers the issue when invocations start failing.

Beyond schema updates, a changed action affects the entire tool hierarchy. The action's `toolDescription`, any composite tool descriptions that aggregate it, and any agentic tool `toolAllocation` descriptions that snapshot it all become stale. However, users often heavily customize these descriptions, so auto-regenerating them would destroy intentional edits. Description updates need to be _proposed_, not forced.

The Auto-Maintenance System closes all of these loops:

- Tracking input validation failures (new) alongside existing output failures
- Generating schema update proposals for both input and output schemas
- Re-scraping specific documentation pages (not entire integrations) for higher-confidence fixes
- Proposing (not auto-applying) description updates for affected tools — users opt in per tool
- Presenting proposals for user review with a clear diff
- Supporting lightweight revert if an approved change causes problems
- Event-driven: triggered automatically when drift detection finds new reports (not a separate cron)

**What already exists:**

- `DriftReport` model with severity, status lifecycle, and dedup (Schema Drift Detection)
- `ValidationFailure` records with field-level mismatch data (output only today)
- `passiveDriftAnalyzer` running every 6 hours to create/update drift reports
- Async job system with worker infrastructure and handler registry
- AI service with Firecrawl doc scraping (including `specificUrls` mode for targeted page scraping)
- Gemini-powered schema generation pipeline
- `bulkResolveByAction()` in the drift repository for batch-resolving reports after fix
- `regenerateToolDescriptions(actionId)` for refreshing LLM-generated tool descriptions
- `generateCompositeToolDescriptions()` for refreshing composite tool descriptions

**What's missing:**

- Input validation failure tracking in `ValidationFailure` (direction field + recording in gateway)
- Schema update proposal generation logic (infer from failures + targeted doc re-scrape)
- `MaintenanceProposal` model to store proposed changes with approval state and revert data
- Approval workflow with _proposed_ description updates for affected tools (not auto-regeneration)
- Per-action source URL tracking for targeted re-scrapes
- Background job handler to generate proposals from drift reports (triggered by drift analyzer, not a separate cron)
- API endpoints for managing proposals (including revert and description suggestions)
- UI for reviewing proposals with schema diff visualization and per-tool description opt-in

### 1.4 Business Value

- **User Impact:** Integrations maintain themselves. Users review and approve proposed fixes instead of investigating and building fixes from scratch. Minutes instead of hours per schema change.
- **Business Impact:** Core differentiator for Waygate — "self-healing integrations" is the key V2 value prop. Without auto-maintenance, drift detection is just an alert system.
- **Technical Impact:** Completes the automated maintenance loop: Detection → Proposal → Approval → Application → Cascade → Resolution. Also fills the input drift blind spot. The last major feature before deployment.

---

## 2. Scope & Requirements

### 2.1 Functional Requirements

| ID    | Requirement                                                                         | Priority | Notes                                                                             |
| ----- | ----------------------------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------- |
| FR-1  | Generate schema update proposals from unresolved breaking/warning drift reports     | MUST     | Core value — propose the fix, not just the problem                                |
| FR-2  | `MaintenanceProposal` model with current/proposed schemas, reasoning, and status    | MUST     | Stores both inputSchema and outputSchema snapshots for revert                     |
| FR-3  | Proposal status lifecycle: `pending` → `approved`/`rejected`/`expired`/`reverted`   | MUST     | Clear state machine with revert path                                              |
| FR-4  | Infer schema updates from ValidationFailure patterns (no external calls)            | MUST     | Primary strategy — fast, free, handles most cases                                 |
| FR-5  | Targeted doc re-scrape using `specificUrls` mode for breaking changes               | SHOULD   | Re-scrape only the relevant page(s), not entire integration                       |
| FR-6  | Apply approved proposal: update action schemas + resolve drift reports              | MUST     | Updates both inputSchema and outputSchema as needed                               |
| FR-7  | Propose (not auto-apply) tool description updates for affected tools on approval    | MUST     | Generate suggested descriptions; user opts in per tool to avoid overwriting edits |
| FR-8  | Lightweight revert: restore previous schemas from proposal snapshot                 | MUST     | Undo an approved proposal without full versioning system                          |
| FR-9  | Track input validation failures in `ValidationFailure` with direction field         | MUST     | Enables input drift detection — currently a blind spot                            |
| FR-10 | Store per-action source URLs during initial scrape for targeted re-scraping         | MUST     | Know which doc page(s) to re-scrape for a specific action                         |
| FR-11 | Background job to generate proposals, triggered by drift analyzer (event-driven)    | MUST     | Drift handler enqueues auto_maintenance job when new reports found                |
| FR-12 | API endpoints for listing, reviewing, approving, rejecting, and reverting proposals | MUST     | Full CRUD for proposal management                                                 |
| FR-13 | UI: Maintenance proposals list with status filters                                  | MUST     | Review queue showing pending proposals                                            |
| FR-14 | UI: Schema diff viewer for reviewing proposed changes                               | MUST     | Side-by-side or inline diff of current vs proposed schema                         |
| FR-15 | UI: Approve/reject/revert actions with confirmation                                 | MUST     | Clear approval UX with impact summary                                             |
| FR-16 | Batch approve: approve all non-breaking proposals for an integration at once        | SHOULD   | Convenience for high-volume changes                                               |
| FR-17 | Proposal expiration: auto-expire proposals if underlying drift resolves naturally   | SHOULD   | Clean up stale proposals when API reverts its change                              |
| FR-18 | Per-integration auto-approve setting for info-level changes                         | COULD    | Skip approval for backward-compatible additions (new optional fields)             |

### 2.2 Non-Functional Requirements

| Requirement | Target                                                                | Measurement                     |
| ----------- | --------------------------------------------------------------------- | ------------------------------- |
| Performance | Proposal generation completes in < 60s for all integrations           | Job duration tracking           |
| Reliability | Schema updates are atomic (all-or-nothing per action)                 | Transaction-wrapped application |
| Reliability | Description suggestions generated within 30s of approval              | Timing measurement              |
| Cost        | Inference-based proposals: zero Firecrawl cost                        | Job metrics                     |
| Cost        | Re-scrape proposals: 1 Firecrawl page scrape per drifted action (max) | Firecrawl usage tracking        |

### 2.3 Acceptance Criteria

- [ ] **Given** an unresolved breaking drift report for `user.email` type changing from `string` to `null`, **when** the maintenance job runs, **then** a `MaintenanceProposal` is created with the `outputSchema` updated to make `user.email` nullable, with reasoning explaining the change
- [ ] **Given** an unresolved info drift report for a new `user.avatar_url` field appearing, **when** the maintenance job runs, **then** a proposal adds `avatar_url: string` as an optional field to the output schema
- [ ] **Given** a pending proposal, **when** a user approves it via the API, **then** the action's schemas are updated, drift reports are resolved, the proposal status changes to `approved`, and description update suggestions are generated for affected tools (not auto-applied)
- [ ] **Given** an approved proposal that caused issues, **when** a user reverts it, **then** the action's schemas are restored from `currentInputSchema`/`currentOutputSchema` snapshots, tool descriptions are regenerated again, and the proposal status changes to `reverted`
- [ ] **Given** a pending proposal, **when** a user rejects it, **then** the proposal status changes to `rejected`, drift reports remain unresolved for future consideration
- [ ] **Given** a drift report that resolves naturally (failures stop, analyzer clears it), **when** a related pending proposal exists, **then** the proposal is expired automatically
- [ ] **Given** a breaking drift report with doc re-scrape enabled, **when** the maintenance job runs, **then** it re-scrapes the specific documentation page(s) for the affected action (using `specificUrls` mode and the action's stored `sourceUrls`) and uses the updated schema to generate a higher-confidence proposal
- [ ] **Given** an action invocation that fails input validation, **when** the gateway rejects it, **then** a `ValidationFailure` record is created with `direction: 'input'`, enabling future drift detection for input schema changes
- [ ] **Given** a composite tool that wraps a maintained action, **when** the action's proposal is approved, **then** a description update suggestion is generated showing the current vs proposed description, and the user can accept or skip it
- [ ] **Given** an agentic tool with the maintained action in its `toolAllocation`, **when** the action's proposal is approved, **then** a description update suggestion is generated for the `toolAllocation.availableTools[].description` entry, and the user can accept or skip it

### 2.4 Out of Scope

- **Full versioning system** — Lightweight revert via proposal snapshots, not a full versioning/rollback system (that's V2.1).
- **Automatic deployment of changes** — All proposals require approval (no fully autonomous updates in V2). Per-integration auto-approve for info-level changes is optional.
- **Cross-integration pattern matching** — Each integration's maintenance is independent. Cross-tenant or cross-integration intelligence deferred.
- **Email/Slack notifications for proposals** — In-app only. Notification channels deferred.
- **Pipeline step description updates** — Pipeline descriptions are abstract and don't directly embed action descriptions. They'll pick up changes naturally via live schema reads.

---

## 3. User Experience

### 3.1 User Flow

**Primary Flow (Event-driven proposal generation):**

```
DriftReport(s) detected (every 6h) → Drift handler enqueues auto_maintenance job
       ↓ (runs within ~1 min via existing job worker)
  Read unresolved breaking/warning drift reports
       ↓
  For each action with drift: infer schema update from ValidationFailure data
       ↓ (optional, for breaking changes with sourceUrls available)
  Re-scrape specific doc page(s) for this action via specificUrls mode
       ↓
  Create MaintenanceProposal (status: pending) with description suggestions
       ↓
  User sees proposal count badge → Reviews proposal with diff
       ↓
  Approve → Schema updated, drift resolved, description suggestions shown
  Reject → Proposal dismissed, drift stays for re-evaluation
  (Later) Revert → Schemas restored from snapshot
```

**User Interaction:**

```
Dashboard → Integration card shows "2 proposals" badge
       ↓
  Click integration → Maintenance tab
       ↓
  Proposals list: action name, change summary, severity, source, status
       ↓
  Click proposal → Schema diff viewer (current vs proposed, input + output)
       ↓
  Review reasoning + change details + affected tools list → Approve or Reject
       ↓
  On approve: schemas updated, drift resolved
       ↓
  Affected tools section: "These tools may have stale descriptions"
       ↓
  Per-tool: see current vs suggested description → Accept or Skip each
  On revert (if approved): schemas restored from snapshot
```

**Happy Path:**

1. Drift detection runs and creates breaking drift reports (e.g., Slack API changed `user.profile.email` from required string to nullable)
2. Drift handler enqueues an `auto_maintenance` job (event-driven — no separate cron)
3. Within ~1 minute, job worker picks up the maintenance job
4. System reads drift reports, infers that `user.profile.email` should be made nullable in the output schema
5. Creates a `MaintenanceProposal` showing the current vs proposed schema diff with reasoning
6. User sees a "1 proposal" badge on the Slack integration card
7. User clicks through, reviews the diff, sees the reasoning ("Field user.profile.email received null values 47 times in the last 24 hours, suggesting the API now allows null for this field")
8. User sees the affected tools section: "This action is used by 2 composite tools and 1 agentic tool"
9. User clicks "Approve" — schema is updated, drift reports resolved
10. Affected tools section now shows description update suggestions: current vs regenerated description for each tool
11. User reviews each suggestion — accepts the composite tool updates, skips the agentic tool update (they'd customized that description heavily)
12. Integration resumes healthy operation with the updated schema and selectively refreshed descriptions

**Alternate Paths:**

- **False positive / bad update:** User approves, but the change causes issues. User clicks "Revert" on the approved proposal — schemas restored from snapshot. Any description updates the user accepted are not automatically reverted (those are independent edits).
- **Multiple changes per action:** Multiple drift reports for the same action are grouped into a single proposal with all schema changes combined.
- **Doc re-scrape for confidence:** For breaking changes where the action has stored `sourceUrls`, system re-scrapes those specific pages (not the entire integration) using the existing `specificUrls` scrape mode to get the authoritative new schema.
- **Input drift detected:** A new required parameter starts causing gateway errors. The enhanced `ValidationFailure` tracking records these. Drift analyzer picks them up and creates input-direction drift reports. Maintenance proposes an `inputSchema` update.
- **No drift reports:** Maintenance job finds nothing to do and completes cleanly.

---

## 4. Technical Approach

### 4.1 Architecture Fit

| Area              | Impact | Description                                                                         |
| ----------------- | ------ | ----------------------------------------------------------------------------------- |
| Frontend          | NEW    | Maintenance proposals list, schema diff viewer, approve/reject/revert UI            |
| Backend           | NEW    | Auto-maintenance module (service, repository, schemas, inference, handler)          |
| Backend           | MODIFY | Gateway service: record input ValidationFailures                                    |
| Backend           | MODIFY | Generate description suggestions on approval (call existing regeneration functions) |
| Database          | NEW    | `MaintenanceProposal` model                                                         |
| Database          | MODIFY | Add `direction` to ValidationFailure, `maintenanceConfig` to Integration            |
| Database          | MODIFY | Store per-action `sourceUrls` in Action metadata during initial scrape              |
| External Services | MODIFY | Targeted Firecrawl re-scrape using existing `specificUrls` mode                     |

**Alignment with Existing Patterns:**

- Module structure: `src/lib/modules/auto-maintenance/`
- Reuses job queue: `jobQueue.enqueue()` for periodic proposal generation
- Reuses drift module: reads `DriftReport` records, calls `bulkResolveByAction()` after applying fixes
- Reuses AI service: targeted re-scrape via existing `specificUrls` mode in `scrape-job.service.ts`
- Reuses tool descriptions: `regenerateToolDescriptions(actionId)` and `generateCompositeToolDescriptions()` — for generating _suggestions_, not auto-applying
- Handler registered via existing `registerJobHandler('auto_maintenance', ...)`
- Event-driven: drift handler enqueues `auto_maintenance` job (no separate cron needed)
- Repository pattern with cursor-based pagination
- Service pattern: Zod safeParse → tenant verify → business logic → repo call

### 4.2 New & Modified Files

```
src/lib/modules/auto-maintenance/
├── auto-maintenance.schemas.ts       # Zod schemas for proposals, config, responses
├── auto-maintenance.repository.ts    # CRUD for MaintenanceProposal
├── auto-maintenance.service.ts       # Proposal management, approval workflow, cascade
├── auto-maintenance.errors.ts        # Custom error classes
├── schema-inference.ts               # Infer schema updates from drift/failure data
├── description-cascade.ts            # Generate description update suggestions for affected tools
├── handlers/
│   └── maintenance.handler.ts        # Job handler for proposal generation
└── index.ts                          # Module exports + handler registration

src/app/api/v1/integrations/[id]/maintenance/
├── proposals/
│   ├── route.ts                      # GET list / POST trigger manual generation
│   └── [proposalId]/
│       ├── route.ts                  # GET detail
│       ├── approve/
│       │   └── route.ts             # POST approve (apply schema update + cascade)
│       ├── reject/
│       │   └── route.ts             # POST reject
│       ├── revert/
│       │   └── route.ts             # POST revert (restore from snapshot)
│       └── descriptions/
│           └── route.ts             # POST accept/skip description suggestions
└── config/
    └── route.ts                      # GET/PATCH maintenance config

src/components/features/auto-maintenance/
├── MaintenanceProposalList.tsx        # Proposals table with filters
├── ProposalDetail.tsx                 # Full proposal view with diff + affected tools
├── SchemaDiffViewer.tsx              # Side-by-side schema diff component
├── AffectedToolsList.tsx             # Shows composite/agentic tools that will be updated
├── MaintenanceBadge.tsx              # Proposal count badge for integration cards
└── MaintenanceConfig.tsx             # Per-integration maintenance settings

src/hooks/
└── useAutoMaintenance.ts             # React Query hooks

# Modified files:
prisma/schema.prisma                  # MaintenanceProposal model, direction on ValidationFailure,
                                      # maintenanceConfig on Integration
src/lib/modules/gateway/gateway.service.ts       # Record input validation failures
src/lib/modules/ai/action-generator.ts           # Store per-action sourceUrls in metadata
src/lib/modules/schema-drift/passive-drift-analyzer.ts  # Handle direction field
src/components/features/integrations/IntegrationCard.tsx # Add maintenance badge
src/app/(dashboard)/integrations/[id]/page.tsx           # Add maintenance tab
```

### 4.3 Key Design Decisions

**Input + Output Schema Coverage:**
The current drift detection system only tracks output (response) schema drift. Auto-maintenance extends this by:

1. Adding a `direction` field (`'input' | 'output'`) to `ValidationFailure`
2. Recording input validation failures in the gateway service (currently these are thrown as errors and discarded)
3. Extending the passive drift analyzer to create drift reports for both directions
4. Proposals can update `inputSchema`, `outputSchema`, or both for a given action

This fills a critical blind spot — input schema changes (new required params, type changes) currently cause silent invocation failures with no drift detection.

**Description Suggestions (Not Auto-Cascade) on Approval:**
When a proposal is approved, updating the action's schema is only half the story. Affected tool descriptions may become stale. However, users often heavily customize descriptions — auto-regenerating would destroy intentional edits. Instead, the system _proposes_ description updates:

1. **On approval:** The system identifies all affected tools (composite, agentic) and generates _suggested_ new descriptions using the existing regeneration functions
2. **Description suggestions are stored** on the proposal as `descriptionSuggestions[]` — each entry has `toolType`, `toolId`, `toolName`, `currentDescription`, `suggestedDescription`, `status` (pending/accepted/skipped)
3. **UI shows per-tool opt-in:** After approving the schema change, the user sees each affected tool with current vs suggested description side-by-side, and can "Accept" or "Skip" each one
4. **Action-level `toolDescription`** is included in the suggestions too — even the action's own description may have been customized
5. **Pipelines:** No action needed — pipeline descriptions are abstract and don't embed action-level descriptions

This respects user customization while still surfacing that descriptions may be stale. The `description-cascade.ts` file generates suggestions and applies accepted ones.

**Targeted Doc Re-Scrape (Not Full Integration):**
The user correctly identified that re-scraping an entire integration's docs is problematic:

- Huge doc sites may exceed context windows
- Re-parsing the whole integration could break other actions that are working fine
- It's expensive in Firecrawl credits for a single action fix

Instead, we use the existing `specificUrls` scrape mode:

1. **During initial scrape:** Enhance `action-generator.ts` to store per-action source URLs in `Action.metadata.sourceUrls[]` — the specific page(s) where the AI found that endpoint
2. **During re-scrape:** Call `createScrapeJob()` with `specificUrls: action.metadata.sourceUrls` to scrape only the relevant pages
3. **Parse result:** Feed the targeted content through the existing AI parsing pipeline, extract only the matching endpoint, and use its updated schema for the proposal

This is fast (1-2 pages, not 20), cheap (minimal Firecrawl credits), and precise (no risk of breaking other actions). If `sourceUrls` aren't available (old actions pre-enhancement), fall back to inference-only.

**Inference-First, Re-scrape-Second:**
The primary proposal generation strategy infers schema updates from `ValidationFailure` data — the same data drift detection uses. This is:

- **Free:** No Firecrawl credits or AI calls for most proposals
- **Fast:** Pure DB queries and JSON manipulation
- **Accurate enough:** For most changes (nullable fields, new fields, type changes), the failure data tells us exactly what the new behavior is

For breaking changes (type mismatches, removed fields), the system can optionally re-scrape the action's specific documentation pages to get the authoritative new schema. This provides higher confidence.

| Change Type               | Inference Approach                                                    | Re-scrape?  |
| ------------------------- | --------------------------------------------------------------------- | ----------- |
| New output field          | Add as optional to schema from `unexpected_field` failures            | No          |
| Output field now nullable | Make field nullable from `type_mismatch` where receivedType is "null" | No          |
| Output type changed       | Update type based on `receivedType` from failures                     | Optional    |
| Output field removed      | Mark as optional from `missing_required_field` failures               | Recommended |
| Output enum value changed | Update enum from `invalid_enum_value` failures                        | Optional    |
| New input required param  | Infer from input `missing_required_field` failures                    | Recommended |
| Input type changed        | Update type based on input `type_mismatch` failures                   | Optional    |

**Grouping: One Proposal Per Action:**
Multiple drift reports for the same action are grouped into a single `MaintenanceProposal` containing all schema changes (input + output). This prevents the user from reviewing dozens of tiny proposals for the same action — they see one combined diff.

**Lightweight Revert (Not Full Versioning):**
The `MaintenanceProposal` stores `currentInputSchema` and `currentOutputSchema` snapshots taken at proposal creation time. If an approved proposal causes problems:

1. User clicks "Revert" on the approved proposal
2. System restores the action's schemas from the snapshots
3. Proposal status changes to `reverted`
4. Original drift reports are re-opened (status back to "detected")
5. Description updates the user previously accepted are **not** auto-reverted (those were independent, user-approved edits)

This is **not** a full versioning system (that's V2.1). It's a simple undo for the most recent schema change. If the user approves Proposal A, then Proposal B, reverting B restores to post-A state (B's snapshot), not pre-A state.

**Proposal Expiration:**
If the underlying drift reports are resolved (failures stop, analyzer clears them), related pending proposals are automatically expired. This prevents applying stale fixes for changes that were reverted.

**Approval Required (Default):**
All proposals require explicit approval before schema changes are applied. An optional per-integration `autoApproveInfoLevel` setting can skip approval for backward-compatible additions (new optional fields). Breaking changes always require approval.

**Atomic Application:**
When a proposal is approved, the schema update and drift report resolution happen in a single database transaction. Description suggestions are generated after the transaction succeeds (best-effort). If suggestion generation fails, the schema update still stands — the user just won't see description suggestions until the next attempt.

---

## 5. Implementation Tasks

### Task 1: Database — ValidationFailure Direction + Action Source URLs (~30 min)

Extend existing models to support input drift tracking and targeted re-scraping.

**Files:** `prisma/schema.prisma`, `src/lib/modules/gateway/gateway.service.ts`, `src/lib/modules/ai/action-generator.ts`

**Details:**

- Add `direction String @default("output") @map("direction")` to `ValidationFailure` model (values: "input", "output")
- Add index on `[actionId, direction, issueCode, fieldPath]`
- Modify gateway service `validateInput()`: on validation failure, record a `ValidationFailure` with `direction: 'input'` before throwing the error (non-blocking — failure recording should not prevent the error from being thrown)
- Modify `action-generator.ts`: during action generation, populate `metadata.sourceUrls` with the specific page URL(s) that documented each endpoint (using the `--- SOURCE: {url} ---` markers already present in scraped content)
- Run `prisma db push`

### Task 2: Database — MaintenanceProposal Model & Integration Config (~30 min)

Add the proposal model and maintenance configuration field.

**File:** `prisma/schema.prisma`

**Details:**

- Add `maintenanceConfig Json? @map("maintenance_config")` to Integration model
- Add `MaintenanceProposal` model:
  - `id` (UUID, `gen_random_uuid()`)
  - `integrationId` (FK → Integration)
  - `tenantId` (FK → Tenant)
  - `actionId` (FK → Action)
  - `status` (string: "pending", "approved", "rejected", "expired", "reverted")
  - `severity` (string: highest severity of included drift reports — "breaking", "warning", "info")
  - `currentInputSchema` (Json — snapshot of action's inputSchema at proposal time)
  - `currentOutputSchema` (Json — snapshot of action's outputSchema at proposal time)
  - `proposedInputSchema` (Json, nullable — updated inputSchema, null if no input changes)
  - `proposedOutputSchema` (Json, nullable — updated outputSchema, null if no output changes)
  - `changes` (Json — array of individual changes: `[{ direction, fieldPath, changeType, description, driftReportId }]`)
  - `reasoning` (string — human-readable explanation of why these changes are proposed)
  - `source` (string: "inference" | "rescrape" — how the proposal was generated)
  - `driftReportIds` (string[] — IDs of drift reports this proposal addresses)
  - `affectedTools` (Json — snapshot of affected composite/agentic tool IDs at proposal time, for UI display)
  - `descriptionSuggestions` (Json, nullable — array of `{ toolType, toolId, toolName, currentDescription, suggestedDescription, status: 'pending'|'accepted'|'skipped' }`, populated on approval)
  - `approvedAt`, `rejectedAt`, `expiredAt`, `revertedAt` (DateTime, nullable)
  - `appliedAt` (DateTime, nullable — when schema was actually updated)
  - `createdAt`, `updatedAt` (DateTime)
  - Indexes: `[integrationId, status]`, `[tenantId, status]`, `[actionId, status]`
- Add relation from MaintenanceProposal → Integration, Tenant, Action
- Run `prisma db push`

### Task 3: Auto-Maintenance Schemas (~25 min)

Zod schemas for configuration, proposal responses, and API inputs.

**File:** `src/lib/modules/auto-maintenance/auto-maintenance.schemas.ts`

**Details:**

- `MaintenanceConfigSchema`: `enabled` (boolean, default true), `autoApproveInfoLevel` (boolean, default false), `rescrapeOnBreaking` (boolean, default false)
- `MaintenanceProposalResponseSchema`: all proposal fields as response shape
- `ProposalChangeSchema`: `{ direction: 'input'|'output', fieldPath, changeType, description, driftReportId, beforeValue?, afterValue? }`
- `AffectedToolSchema`: `{ toolType: 'action'|'composite'|'agentic', toolId, toolName }`
- `DescriptionSuggestionSchema`: `{ toolType: 'action'|'composite'|'agentic', toolId, toolName, currentDescription, suggestedDescription, status: 'pending'|'accepted'|'skipped' }`
- `DescriptionDecisionInputSchema`: `{ decisions: [{ toolId, accept: boolean }] }`
- `ListProposalsQuerySchema`: pagination (cursor, limit), filters (status, severity, actionId)
- `ProposalSummaryResponseSchema`: `{ pending: number, approved: number, rejected: number, expired: number, reverted: number, total: number }`

### Task 4: Auto-Maintenance Errors (~10 min)

Custom error classes.

**File:** `src/lib/modules/auto-maintenance/auto-maintenance.errors.ts`

**Details:**

- `ProposalNotFoundError` (404)
- `InvalidProposalTransitionError` (400) — e.g., can't approve an already-rejected proposal
- `ProposalConflictError` (409) — pending proposal already exists for this action
- `SchemaApplicationError` (500) — failed to apply schema update
- `RevertError` (500) — failed to revert proposal

### Task 5: Schema Inference Engine (~60 min)

Core logic to infer schema updates from drift reports and validation failure data. Handles both input and output schemas.

**File:** `src/lib/modules/auto-maintenance/schema-inference.ts`

**Details:**

- `inferSchemaUpdates(actionId, driftReports, currentInputSchema, currentOutputSchema)`:
  1. Load `ValidationFailure` records for the action, matching the drift reports, grouped by `direction`
  2. For each drift report, determine the schema change needed:
     - **Output `type_mismatch`** where `receivedType` is "null" → make field nullable in outputSchema
     - **Output `type_mismatch`** where `receivedType` is different → update field type in outputSchema
     - **Output `unexpected_field`** → add field as optional with inferred type to outputSchema
     - **Output `missing_required_field`** → make field optional in outputSchema (remove from `required`)
     - **Output `invalid_enum_value`** → add new enum value in outputSchema
     - **Input `missing_required_field`** → add field as required to inputSchema
     - **Input `type_mismatch`** → update field type in inputSchema
  3. Deep-clone the current schemas and apply all changes
  4. Generate per-change descriptions and reasoning
  5. Return `{ proposedInputSchema, proposedOutputSchema, changes[], reasoning }`
- `applyFieldChange(schema, fieldPath, change)`: Navigate JSON Schema to the target field and apply modification
- `inferFieldType(receivedType)`: Map ValidationFailure `receivedType` strings to JSON Schema types
- `generateChangeDescription(change)`: Human-readable description per change
- `generateOverallReasoning(changes)`: Summary reasoning for the full proposal
- `findAffectedTools(actionId)`: Query composite tool operations and agentic tool allocations that reference this action, return list of `{ toolType, toolId, toolName }` for UI display

### Task 6: Description Suggestion Generator (~45 min)

Generates _suggested_ description updates for affected tools when an action's schema changes. Does NOT auto-apply — stores suggestions for user review.

**File:** `src/lib/modules/auto-maintenance/description-cascade.ts`

**Details:**

- `generateDescriptionSuggestions(actionId, tenantId)`:
  1. **Action level:** Call `regenerateToolDescriptions(actionId)` in "dry-run" mode (or regenerate to a temp variable) to get what the new `toolDescription` would be. Compare against current — if different, create suggestion.
  2. **Composite tools:** Query `CompositeToolOperation` records where `actionId` matches → get unique `compositeToolId`s → for each, call `generateCompositeToolDescriptions()` in dry-run to get suggested description. Compare against current.
  3. **Agentic tools:** Query all `AgenticTool` records for `tenantId` → filter those whose `toolAllocation` JSON contains this `actionId` → generate what the new `toolAllocation.availableTools[].description` would be.
  4. Return `DescriptionSuggestion[]`: `{ toolType: 'action'|'composite'|'agentic', toolId, toolName, currentDescription, suggestedDescription, status: 'pending' }`
- `applyDescriptionSuggestion(suggestion)`: Apply a single accepted suggestion — update the tool's description in the database. Uses existing regeneration functions.
- `applyDescriptionSuggestions(proposalId, decisions: { toolId, accept: boolean }[])`: Batch apply/skip decisions from the UI.
- Suggestions are stored on the proposal's `descriptionSuggestions` JSON field.
- Error handling: log failures but don't block the schema update.

### Task 7: Auto-Maintenance Repository (~30 min)

Data access layer for MaintenanceProposal.

**File:** `src/lib/modules/auto-maintenance/auto-maintenance.repository.ts`

**Details:**

- `createProposal(input)`: Create new proposal, check for existing pending proposal on same action
- `findProposalById(id, tenantId)`: Get by ID with tenant verification
- `findProposalsByIntegration(integrationId, tenantId, pagination, filters)`: Paginated, filterable by status/severity/actionId
- `updateProposalStatus(id, tenantId, status, timestamps)`: Status transition with appropriate timestamp
- `countByIntegrationAndStatus(integrationId)`: Returns `{ pending, approved, rejected, expired, reverted }` counts
- `findPendingByActionId(actionId)`: Check if pending proposal already exists for this action
- `expireProposalsForResolvedDrift(driftReportIds)`: Expire proposals whose drift reports have been resolved
- `findPendingByIntegration(integrationId, tenantId, severity?)`: Get all pending proposals, optionally filtered by severity (for batch approve)

### Task 8: Auto-Maintenance Service (~60 min)

Business logic layer: proposal management, approval workflow with cascade, revert.

**File:** `src/lib/modules/auto-maintenance/auto-maintenance.service.ts`

**Details:**

- `listProposals(tenantId, integrationId, pagination, filters)`: Paginated proposals
- `getProposal(tenantId, proposalId)`: Single proposal with tenant verification
- `getProposalSummary(tenantId, integrationId)`: Counts by status
- `approveProposal(tenantId, proposalId)`:
  1. Verify proposal is pending
  2. Begin transaction:
     a. Update action's `inputSchema` (if `proposedInputSchema` provided) and `outputSchema` (if `proposedOutputSchema` provided)
     b. Bulk-resolve drift reports via `bulkResolveByAction()`
     c. Update proposal status to "approved" with `approvedAt` and `appliedAt`
  3. Generate description suggestions: `generateDescriptionSuggestions(actionId, tenantId)` (best-effort, non-blocking)
  4. Store suggestions on proposal's `descriptionSuggestions` field
  5. Return updated proposal with description suggestions
- `applyDescriptionDecisions(tenantId, proposalId, decisions)`:
  1. Verify proposal is approved
  2. For each decision: if accepted, call `applyDescriptionSuggestion()` to update the tool's description
  3. Update suggestion statuses on the proposal (accepted/skipped)
- `revertProposal(tenantId, proposalId)`:
  1. Verify proposal is approved (only approved proposals can be reverted)
  2. Begin transaction:
     a. Restore action's `inputSchema` from `currentInputSchema` and `outputSchema` from `currentOutputSchema`
     b. Re-open related drift reports (status back to "detected")
     c. Update proposal status to "reverted" with `revertedAt`
  3. Return updated proposal (description updates the user accepted are NOT auto-reverted)
- `rejectProposal(tenantId, proposalId)`: Update status to "rejected" with `rejectedAt`
- `batchApproveByIntegration(tenantId, integrationId, maxSeverity?)`: Approve all pending proposals up to a severity level
- `generateProposalsForIntegration(integrationId, tenantId)`:
  1. Query unresolved drift reports (breaking + warning + input) that don't already have pending proposals
  2. Group by actionId
  3. For each action group: call `inferSchemaUpdates()` to build proposed schemas
  4. Determine affected tools via `findAffectedTools(actionId)`
  5. Create `MaintenanceProposal` for each action
  6. If `rescrapeOnBreaking` is enabled and breaking reports exist and action has `metadata.sourceUrls`, trigger targeted re-scrape
  7. Return `{ proposalsCreated, actionsAffected }`
- `generateProposalWithRescrape(actionId, tenantId)`:
  1. Load action's `metadata.sourceUrls`
  2. Call `createScrapeJob()` with `specificUrls: sourceUrls` and `wishlist: [action.slug]`
  3. Parse result, find the matching endpoint
  4. Build proposal from re-scraped schema (source: "rescrape")
- `updateMaintenanceConfig(tenantId, integrationId, config)`: Validate and save config
- `expireStaleProposals()`: Find proposals where all referenced drift reports are resolved, expire them

### Task 9: Maintenance Job Handler (~30 min)

Background job handler that generates proposals from drift reports. Triggered by drift analyzer (event-driven), not a separate cron.

**File:** `src/lib/modules/auto-maintenance/handlers/maintenance.handler.ts`

**Details:**

- Register as `auto_maintenance` handler with concurrency limit of 1
- On claim:
  1. Expire stale proposals first (cleanup)
  2. Query all integrations where `maintenanceConfig.enabled` is true (or null — enabled by default)
  3. For each integration with unresolved drift reports:
     - Call `generateProposalsForIntegration()`
     - If `autoApproveInfoLevel` is true, auto-approve info-level proposals (which triggers description suggestion generation)
  4. Track totals: integrations checked, proposals created, auto-approved
  5. Update progress based on integration count
- Return summary as job output

### Task 10: Wire Drift Analyzer → Auto-Maintenance (Event-Driven) (~15 min)

Modify the existing drift analyzer handler to enqueue an auto-maintenance job when it creates new drift reports.

**File:** `src/lib/modules/schema-drift/handlers/drift-passive.handler.ts`

**Details:**

- At the end of `driftPassiveAnalysisHandler`, after all integrations are analyzed:
  1. Check if `reportsCreated > 0` (new drift was found)
  2. If yes: check if an `auto_maintenance` job is already queued/running (prevent overlap)
  3. If not: enqueue via `jobQueue.enqueue({ type: 'auto_maintenance', input: { triggerSource: 'drift_analyzer' } })`
- This means auto-maintenance runs within ~1 minute of drift detection (next job worker cycle)
- No new cron entry in `vercel.json` needed
- Manual trigger still available via the POST endpoint (Task 11)

### Task 11: API Endpoints — Proposal CRUD, Revert & Descriptions (~50 min)

REST endpoints for proposal management including revert and description decisions.

**Files:**

- `src/app/api/v1/integrations/[id]/maintenance/proposals/route.ts`:
  - `GET`: List proposals for integration (paginated, filterable by status/severity)
  - `POST`: Trigger manual proposal generation for this integration
- `src/app/api/v1/integrations/[id]/maintenance/proposals/[proposalId]/route.ts`:
  - `GET`: Get proposal detail (includes full schemas, changes, affected tools, description suggestions)
- `src/app/api/v1/integrations/[id]/maintenance/proposals/[proposalId]/approve/route.ts`:
  - `POST`: Approve and apply proposal (generates description suggestions)
- `src/app/api/v1/integrations/[id]/maintenance/proposals/[proposalId]/reject/route.ts`:
  - `POST`: Reject proposal
- `src/app/api/v1/integrations/[id]/maintenance/proposals/[proposalId]/revert/route.ts`:
  - `POST`: Revert an approved proposal (restore schemas from snapshot)
- `src/app/api/v1/integrations/[id]/maintenance/proposals/[proposalId]/descriptions/route.ts`:
  - `POST`: Accept/skip description suggestions — body: `{ decisions: [{ toolId, accept: boolean }] }`

All endpoints use `withApiAuth` middleware and tenant-scope verification.

### Task 12: API Endpoints — Config & Summary (~20 min)

REST endpoints for maintenance config and summary.

**Files:**

- `src/app/api/v1/integrations/[id]/maintenance/config/route.ts`:
  - `GET`: Get current maintenance config
  - `PATCH`: Update maintenance config
- `src/app/api/v1/integrations/[id]/maintenance/summary/route.ts`:
  - `GET`: Proposal counts by status

### Task 13: Module Index & Handler Registration (~10 min)

Wire the module together.

**File:** `src/lib/modules/auto-maintenance/index.ts`

**Details:**

- Export service, repository, schemas, errors, inference engine, description cascade
- Register `auto_maintenance` handler via `registerJobHandler()`
- Ensure handler registration runs on app init (side-effect import)

### Task 14: Extend Drift Analyzer for Input Direction (~25 min)

Update the passive drift analyzer to handle the new `direction` field on ValidationFailure.

**File:** `src/lib/modules/schema-drift/passive-drift-analyzer.ts`

**Details:**

- Update `analyzeIntegration()` to query both `direction: 'input'` and `direction: 'output'` ValidationFailure records
- Include `direction` in the drift report fingerprint: hash of `actionId + direction + issueCode + fieldPath`
- Add `direction` field to `DriftReport` model (or encode in fingerprint — decision at implementation time)
- Severity classification for input drift: `missing_required_field` (input) = breaking, `type_mismatch` (input) = breaking

### Task 15: UI — Schema Diff Viewer Component (~45 min)

Reusable component for visualizing JSON Schema differences.

**File:** `src/components/features/auto-maintenance/SchemaDiffViewer.tsx`

**Details:**

- Takes `currentSchema` and `proposedSchema` as props, plus `direction` label ("Input Schema" / "Output Schema")
- Renders side-by-side or inline diff of the two JSON Schema objects
- Highlights added fields (green), removed fields (red), modified fields (amber)
- Collapsible nested objects for large schemas
- Shows change annotations from the `changes` array alongside the diff
- Use a simple recursive JSON diff algorithm (no external diff library needed — schemas are structured JSON)

### Task 16: UI — Affected Tools & Description Suggestions Component (~35 min)

Shows affected tools and, after approval, lets the user accept/skip description update suggestions per tool.

**File:** `src/components/features/auto-maintenance/AffectedToolsList.tsx`

**Details:**

- **Before approval (pending proposals):**
  - Takes `affectedTools` array from the proposal
  - Groups by tool type (action, composite, agentic)
  - Shows tool name, type badge, and link to the tool's config page
  - Message: "These tools may need description updates after approval"
  - If empty: "No other tools reference this action"
- **After approval (with description suggestions):**
  - Takes `descriptionSuggestions` array from the proposal
  - For each suggestion: shows tool name, type badge, current description, suggested description (side-by-side or toggle)
  - "Accept" / "Skip" button per suggestion
  - "Accept All" / "Skip All" bulk actions
  - Highlights differences between current and suggested descriptions
  - Submissions call the `POST .../descriptions` endpoint with decisions

### Task 17: UI — Maintenance Proposals List (~35 min)

Proposals table within integration detail view.

**File:** `src/components/features/auto-maintenance/MaintenanceProposalList.tsx`

**Details:**

- Table with columns: Action Name, Change Summary, Direction (Input/Output/Both), Severity, Source (Inference/Re-scrape), Status, Created Date
- Severity badges (colored: red/amber/muted)
- Status badges with appropriate colors (pending=blue, approved=green, rejected=gray, expired=muted, reverted=amber)
- Filter by status and severity
- Row click navigates to proposal detail
- "Batch Approve Info" button when multiple info-level proposals exist
- Paginated with cursor-based "Load More"
- Integrate as a "Maintenance" tab in the integration detail page

### Task 18: UI — Proposal Detail, Approval & Revert (~40 min)

Full proposal review page with diff, affected tools, and actions.

**File:** `src/components/features/auto-maintenance/ProposalDetail.tsx`

**Details:**

- Header: action name, severity badge, status badge, timestamps
- Changes list: each individual change with direction, description, and affected field path
- Reasoning section: the system's explanation of why it's proposing this change
- Schema diff viewers: one for input schema (if changed), one for output schema (if changed), using `SchemaDiffViewer`
- Affected tools section: embedded `AffectedToolsList` component
- Action buttons (context-dependent):
  - **Pending:** "Approve & Apply" (primary, green) with confirmation dialog, "Reject" (secondary, muted)
  - **Approved (with pending description suggestions):** Shows `AffectedToolsList` in suggestion mode — per-tool accept/skip. Plus "Revert" button (warning, amber) with confirmation dialog ("This will restore the previous schema. Description updates you've accepted will remain.")
  - **Approved (all suggestions resolved):** "Revert" button only
  - **Rejected/Expired/Reverted:** Read-only view, no actions
- Status timeline: shows key timestamps (created, approved/rejected, applied, reverted)

### Task 19: UI — Maintenance Badge & Integration (~20 min)

Badge on integration cards and tab in integration detail.

**Files:**

- `src/components/features/auto-maintenance/MaintenanceBadge.tsx`:
  - Small badge showing pending proposal count
  - Amber color to differentiate from drift badges (red)
  - Only renders when pending count > 0
- Modify `IntegrationCard.tsx`: Add `MaintenanceBadge` alongside existing `DriftBadge`
- Modify integration detail page: Add "Maintenance" tab showing `MaintenanceProposalList`

### Task 20: React Hooks (~15 min)

React Query hooks for maintenance data.

**File:** `src/hooks/useAutoMaintenance.ts`

**Details:**

- `useProposalSummary(integrationId)`: Fetch counts by status (for badge)
- `useProposals(integrationId, filters)`: Paginated proposal list
- `useProposal(proposalId)`: Single proposal detail
- `useApproveProposal()`: Mutation for approving (with optimistic update + invalidation)
- `useRejectProposal()`: Mutation for rejecting
- `useRevertProposal()`: Mutation for reverting an approved proposal
- `useApplyDescriptionDecisions()`: Mutation for accepting/skipping description suggestions
- `useBatchApprove(integrationId)`: Mutation for batch approval
- `useTriggerMaintenance(integrationId)`: Mutation for manual proposal generation

---

## 6. Test Plan

### Unit Tests

- **Schema inference engine:** Each change type for both input and output schemas (nullable, new field, type change, field removal, enum change), combined changes per action, direction handling, edge cases (deeply nested fields, arrays), invalid/missing failure data handling
- **Description suggestions:** Finds affected composite tools, finds affected agentic tools (JSON search), generates correct suggested descriptions, handles tools with no affected dependencies, handles regeneration failures gracefully, apply/skip logic works correctly
- **Service:** Proposal lifecycle transitions (valid and invalid), approval applies schemas + resolves drift + generates description suggestions (transaction), description accept/skip updates tool descriptions, revert restores schemas + re-opens drift (no auto-revert of descriptions), batch approve filters by severity, stale proposal expiration, tenant isolation
- **Repository:** Create with conflict detection, pagination, filtering, count queries, expiration queries
- **Schemas:** All Zod schemas validate correct/incorrect input, defaults applied
- **Errors:** Correct codes and status codes

### Integration Tests

- **API endpoints:** List proposals, get detail, approve, reject, revert — including auth failures, tenant isolation, 404 for unknowns, conflict when pending proposal exists
- **Full maintenance cycle:** Seed ValidationFailures (both input + output) → run drift analysis → verify auto-maintenance job enqueued → run maintenance → verify proposals created → approve → verify schemas updated, drift resolved, description suggestions generated → accept some descriptions → verify tools updated
- **Revert cycle:** Approve proposal → accept some description suggestions → revert → verify schema restored to snapshot, drift reports re-opened, accepted description edits NOT reverted
- **Description suggestions e2e:** Create action used by composite + agentic tool → approve proposal → verify suggestions generated for all three levels → accept composite, skip agentic → verify only composite description updated
- **Batch approve:** Multiple proposals at different severities → batch approve info-level → verify only info proposals applied
- **Expiration:** Create proposal → resolve underlying drift reports → run expiration → verify proposal expired
- **Targeted re-scrape:** Seed action with `sourceUrls` metadata → trigger re-scrape proposal → verify `specificUrls` scrape mode used
- **Event-driven trigger:** Run drift analyzer with new reports → verify `auto_maintenance` job enqueued → run drift analyzer with no new reports → verify no job enqueued

---

## 7. Dependencies

| Dependency                  | Type    | Status | Notes                                                                 |
| --------------------------- | ------- | ------ | --------------------------------------------------------------------- |
| Schema Drift Detection      | Feature | Done   | Drift reports, severity classification, bulk resolve                  |
| Async Job System            | Feature | Done   | Job queue, worker, handler registration                               |
| ValidationFailure model     | Model   | Done   | Field-level validation mismatch data (output only — input added here) |
| AI Service (Firecrawl)      | Module  | Done   | `specificUrls` scrape mode for targeted re-scraping                   |
| Response Validation         | Module  | Done   | Populates output ValidationFailure records                            |
| Tool Description Generator  | Module  | Done   | `regenerateToolDescriptions(actionId)` for action-level refresh       |
| Composite Tool Descriptions | Module  | Done   | `generateCompositeToolDescriptions()` for composite-level refresh     |

**No new external dependencies required.** The re-scrape feature uses existing Firecrawl integration via the `specificUrls` mode.

---

## 8. Future Enhancements

| Enhancement                          | Description                                                                 | Trigger                                     |
| ------------------------------------ | --------------------------------------------------------------------------- | ------------------------------------------- |
| **Full versioning & rollback**       | Track schema version history with arbitrary rollback (beyond single revert) | V2.1 versioning feature                     |
| **Active doc re-scraping**           | Proactively re-scrape docs on a schedule, not just reactively               | If passive inference proves insufficient    |
| **Email/Slack notification**         | Notify users when proposals are generated, especially breaking ones         | When notification system is built           |
| **AI-powered inference**             | Use LLM to analyze failure patterns and generate smarter schema proposals   | If rule-based inference handles < 80% cases |
| **Cross-tenant drift signals**       | Use drift patterns across tenants to proactively warn about API changes     | Multi-tenant scale                          |
| **Maintenance history dashboard**    | Timeline view of all maintenance actions taken per integration              | When usage grows                            |
| **Auto-sync agentic tool snapshots** | Periodically check for stale `toolAllocation` descriptions across all tools | If cascade misses edge cases                |
