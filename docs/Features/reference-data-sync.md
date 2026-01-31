# Feature: Reference Data Sync

**Milestone:** V1.1 (AI Tool Foundations)
**Status:** Complete
**Dependencies:** None (foundational)
**Priority:** P0

---

## Overview

Reference data sync provides a mechanism to periodically fetch and cache slow-changing reference data (users, channels, teams, workspaces, etc.) from external APIs. This cached data enables AI tools to have contextual awareness without repeatedly calling external APIs during tool execution.

### Why This Matters

When AI agents use Waygate actions, they often need contextual information:

- "Send a message to #general" - Agent needs to know channel IDs
- "Assign task to Sarah" - Agent needs to know user IDs and names
- "Create issue in frontend repo" - Agent needs repository context

Without reference data sync, every AI tool invocation would require:

1. Multiple API calls to fetch available options
2. Additional latency before the actual action
3. Risk of rate limiting from repeated list calls

Reference data sync solves this by pre-caching this information and making it available as context to AI tools.

---

## User Stories

**As an AI application developer**, I want Waygate to maintain fresh reference data from connected integrations, so that my AI agents can make informed decisions without additional API calls.

**As a developer configuring integrations**, I want to specify which reference data to sync and how frequently, so that I can balance freshness against API usage.

**As an AI agent**, I want access to contextual reference data (users, channels, etc.) when invoking actions, so that I can resolve human-friendly names to IDs automatically.

---

## Requirements

### Functional Requirements

1. **Reference Data Types**
   - [ ] Support multiple data types per integration (users, channels, teams, etc.)
   - [ ] Allow integrations to define which actions provide reference data
   - [ ] Store external IDs, names, and relevant metadata

2. **Sync Mechanism**
   - [ ] Background sync via Vercel Cron (reuse existing pattern)
   - [ ] Configurable sync frequency per data type
   - [ ] Incremental sync where APIs support it (delta updates)
   - [ ] Full sync as fallback

3. **Data Storage**
   - [ ] Store reference data with tenant isolation
   - [ ] Track sync status and timestamps
   - [ ] Support connection-specific data (different credentials = different data)

4. **Data Access**
   - [ ] API endpoint to query cached reference data
   - [ ] Integration with gateway preamble for AI context
   - [ ] Search/filter capabilities for large datasets

5. **Configuration**
   - [ ] Define sync-eligible actions in action metadata
   - [ ] Configure data extraction from action responses
   - [ ] Set freshness requirements (TTL)

### Non-Functional Requirements

- Sync jobs must complete within Vercel Cron timeout (60s per invocation)
- Support thousands of reference items per integration
- Graceful degradation if sync fails (use stale data)
- No impact on action invocation latency

---

## Technical Design

### Database Schema

```prisma
// New model: Reference data storage
model ReferenceData {
  id             String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId       String   @map("tenant_id") @db.Uuid
  integrationId  String   @map("integration_id") @db.Uuid
  connectionId   String?  @map("connection_id") @db.Uuid

  dataType       String   @map("data_type")       // 'users', 'channels', 'repos', etc.
  externalId     String   @map("external_id")      // ID from external system
  name           String                            // Display name
  metadata       Json     @default("{}")           // Flexible additional fields

  status         ReferenceDataStatus @default(active)
  lastSyncedAt   DateTime @map("last_synced_at")
  syncedByActionId String? @map("synced_by_action_id") @db.Uuid

  createdAt      DateTime @default(now()) @map("created_at")
  updatedAt      DateTime @updatedAt @map("updated_at")

  // Relations
  tenant         Tenant      @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  integration    Integration @relation(fields: [integrationId], references: [id], onDelete: Cascade)
  connection     Connection? @relation(fields: [connectionId], references: [id], onDelete: Cascade)
  syncedByAction Action?     @relation(fields: [syncedByActionId], references: [id])

  // Indexes
  @@unique([integrationId, connectionId, dataType, externalId])
  @@index([tenantId, dataType])
  @@index([integrationId, dataType])
  @@index([lastSyncedAt])

  @@map("reference_data")
}

enum ReferenceDataStatus {
  active
  inactive
  deleted
}

// New model: Sync job tracking
model ReferenceSyncJob {
  id             String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId       String   @map("tenant_id") @db.Uuid
  integrationId  String   @map("integration_id") @db.Uuid
  connectionId   String?  @map("connection_id") @db.Uuid
  dataType       String   @map("data_type")

  status         SyncJobStatus @default(pending)
  startedAt      DateTime? @map("started_at")
  completedAt    DateTime? @map("completed_at")

  itemsFound     Int      @default(0) @map("items_found")
  itemsCreated   Int      @default(0) @map("items_created")
  itemsUpdated   Int      @default(0) @map("items_updated")
  itemsDeleted   Int      @default(0) @map("items_deleted")
  itemsFailed    Int      @default(0) @map("items_failed")

  error          Json?                              // Error details if failed

  createdAt      DateTime @default(now()) @map("created_at")

  // Relations
  tenant         Tenant      @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  integration    Integration @relation(fields: [integrationId], references: [id], onDelete: Cascade)
  connection     Connection? @relation(fields: [connectionId], references: [id], onDelete: Cascade)

  // Indexes
  @@index([integrationId, status])
  @@index([tenantId, createdAt])

  @@map("reference_sync_jobs")
}

enum SyncJobStatus {
  pending
  syncing
  completed
  failed
}
```

### Action Metadata Extension

Extend action metadata to indicate reference data capability:

```typescript
// In Action.metadata JSON field
interface ActionReferenceConfig {
  referenceData?: {
    dataType: string;              // 'users', 'channels', 'crm_schema', etc.
    syncable: boolean;             // Whether this action can be used for syncing
    syncType?: 'list' | 'object';  // 'list' for arrays, 'object' for full response
    extractionPath?: string;       // JSONPath to extract items (list sync only)
    idField?: string;              // Field name for external ID (list sync only)
    nameField?: string;            // Field name for display name (list sync only)
    lookupFields?: string[];       // Multiple fields to search for lookups
    fuzzyMatch?: boolean;          // Enable partial/case-insensitive matching
    metadataFields?: string[];     // Additional fields to capture
    defaultTtlSeconds?: number;    // How often to resync (default: 86400 = 1 day)
  };
}

// Example for Slack users.list action (list sync)
{
  "referenceData": {
    "dataType": "users",
    "syncable": true,
    "syncType": "list",
    "extractionPath": "$.members[*]",
    "idField": "id",
    "nameField": "real_name",
    "lookupFields": ["real_name", "name", "email"],
    "fuzzyMatch": true,
    "metadataFields": ["email", "is_admin", "is_bot"],
    "defaultTtlSeconds": 86400
  }
}

// Example for CRM schema action (object sync)
{
  "referenceData": {
    "dataType": "crm_schema",
    "syncable": true,
    "syncType": "object",
    "defaultTtlSeconds": 86400
  }
}
```

### Module Structure

```
src/lib/modules/reference-data/
├── index.ts                        # Module exports
├── reference-data.service.ts       # Business logic
├── reference-data.repository.ts    # Data access
├── reference-data.schemas.ts       # Zod schemas
├── sync-job.service.ts             # Sync orchestration
├── sync-job.repository.ts          # Job tracking
└── types.ts                        # TypeScript types
```

### Sync Job Flow

```
┌─────────────────┐
│  Vercel Cron    │ (every 15 min)
│  triggers sync  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Find stale data │ (where lastSyncedAt + TTL < now)
│ or pending jobs │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ For each sync:  │
│ 1. Create job   │
│ 2. Invoke action│ (uses existing gateway)
│ 3. Extract data │
│ 4. Upsert refs  │
│ 5. Mark deleted │
│ 6. Update job   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Return summary  │
└─────────────────┘
```

### API Endpoints

| Method | Endpoint                                              | Purpose                    |
| ------ | ----------------------------------------------------- | -------------------------- |
| GET    | `/api/v1/integrations/:id/reference-data`             | List cached reference data |
| GET    | `/api/v1/integrations/:id/reference-data/:type`       | Get data by type           |
| POST   | `/api/v1/integrations/:id/reference-data/sync`        | Trigger manual sync        |
| GET    | `/api/v1/integrations/:id/reference-data/sync/status` | Get sync status            |

### AI Context Integration

Enhance the existing preamble system in gateway service:

```typescript
// In gateway.service.ts - buildPreamble()
async function buildReferenceDataContext(
  integrationId: string,
  connectionId: string | null,
  dataTypes: string[]
): Promise<ReferenceContext> {
  const refData = await referenceDataRepository.findByTypes(integrationId, connectionId, dataTypes);

  return {
    users: refData
      .filter((r) => r.dataType === 'users')
      .map((r) => ({ id: r.externalId, name: r.name, ...r.metadata })),
    channels: refData
      .filter((r) => r.dataType === 'channels')
      .map((r) => ({ id: r.externalId, name: r.name, ...r.metadata })),
    // ... other types
  };
}
```

---

## Implementation Tasks

### Phase 1: Database & Core Models (~2-3 hours)

| #   | Task                                                     | Estimate |
| --- | -------------------------------------------------------- | -------- |
| 1.1 | Add Prisma schema for ReferenceData and ReferenceSyncJob | 30 min   |
| 1.2 | Create and run migration                                 | 15 min   |
| 1.3 | Create reference-data module structure                   | 15 min   |
| 1.4 | Implement reference-data.repository.ts (CRUD operations) | 45 min   |
| 1.5 | Implement reference-data.schemas.ts (Zod validation)     | 30 min   |

### Phase 2: Sync Service (~2-3 hours)

| #   | Task                                                           | Estimate |
| --- | -------------------------------------------------------------- | -------- |
| 2.1 | Implement sync-job.repository.ts                               | 30 min   |
| 2.2 | Implement sync-job.service.ts (orchestration logic)            | 60 min   |
| 2.3 | Add extraction logic (parse action response → reference items) | 45 min   |
| 2.4 | Add upsert logic with soft delete detection                    | 30 min   |

### Phase 3: Cron Job (~1-2 hours)

| #   | Task                                                   | Estimate |
| --- | ------------------------------------------------------ | -------- |
| 3.1 | Create `/api/v1/internal/reference-sync` cron endpoint | 45 min   |
| 3.2 | Add cron configuration to vercel.json                  | 15 min   |
| 3.3 | Implement batch processing with rate limiting          | 30 min   |

### Phase 4: API Endpoints (~1-2 hours)

| #   | Task                                  | Estimate |
| --- | ------------------------------------- | -------- |
| 4.1 | Implement GET reference-data endpoint | 30 min   |
| 4.2 | Implement POST sync trigger endpoint  | 30 min   |
| 4.3 | Implement GET sync status endpoint    | 30 min   |

### Phase 5: AI Context Integration (~1-2 hours)

| #   | Task                                                   | Estimate |
| --- | ------------------------------------------------------ | -------- |
| 5.1 | Extend gateway preamble to include reference data      | 45 min   |
| 5.2 | Add reference data context to action response          | 30 min   |
| 5.3 | Update action metadata schema for referenceData config | 15 min   |

### Phase 6: Integration Configuration (~1-2 hours)

| #   | Task                                                | Estimate |
| --- | --------------------------------------------------- | -------- |
| 6.1 | Seed example referenceData config for Slack actions | 30 min   |
| 6.2 | Add UI to Action Editor for reference data config   | 45 min   |
| 6.3 | Add UI to view sync status and cached data          | 30 min   |

---

## Test Plan

### Unit Tests

- Reference data repository CRUD operations
- Sync job service orchestration
- Data extraction from action responses
- Upsert and soft delete logic

### Integration Tests

- Full sync flow: cron trigger → action invoke → data stored
- API endpoints return correct data
- Preamble includes reference data context

### E2E Tests

- Configure Slack integration with reference data sync
- Verify users and channels are synced
- Verify AI context includes synced data

---

## Acceptance Criteria

1. **Sync Mechanism Works**
   - [ ] Cron job runs every 15 minutes
   - [ ] Stale data (past TTL) is re-synced automatically
   - [ ] Manual sync can be triggered via API

2. **Data Storage**
   - [ ] Reference data stored with tenant isolation
   - [ ] Sync jobs tracked with full audit trail
   - [ ] Soft delete marks removed items as inactive

3. **AI Context**
   - [ ] Action responses include reference data context
   - [ ] AI tools can resolve names to IDs using cached data

4. **API Access**
   - [ ] GET endpoint returns cached reference data
   - [ ] Filtering by data type works
   - [ ] Sync status endpoint shows job history

5. **Configuration**
   - [ ] Actions can be configured as reference data sources
   - [ ] Extraction paths correctly parse responses
   - [ ] Custom TTL respected per data type

---

## Edge Cases & Error Handling

| Scenario                  | Handling                                |
| ------------------------- | --------------------------------------- |
| Action fails during sync  | Record error in job, retry on next cron |
| Pagination required       | Use existing pagination service         |
| API rate limited          | Respect circuit breaker, backoff        |
| Data extraction fails     | Log error, skip item, continue sync     |
| Connection revoked        | Skip sync, mark job as failed           |
| Duplicate external IDs    | Upsert based on unique constraint       |
| Items removed from source | Mark as inactive (soft delete)          |

---

## Security Considerations

- Reference data inherits tenant isolation via RLS
- No credentials stored in reference data
- Metadata should not contain sensitive user information
- Sync jobs authenticated via CRON_SECRET

---

## Future Enhancements (Out of Scope)

- Real-time sync via webhooks
- Selective sync (filter which items to cache)
- Cross-integration reference resolution
- Reference data search API
- Bulk reference data export/import

---

## Dependencies

**Uses Existing Infrastructure:**

- Vercel Cron (health check pattern)
- ExecutionService (retries, circuit breaker)
- Pagination service (multi-strategy)
- Gateway service (action invocation)
- Credential management
- Request logging

**New Dependencies:**

- None (uses existing stack)

---

## Implementation Summary

**Completed:** 2026-01-29
**Updated:** 2026-01-30

### What Was Built

1. **Database Layer**
   - `ReferenceData` model for storing cached reference items with tenant isolation
   - `ReferenceSyncJob` model for tracking sync operations
   - Prisma migration with indexes for efficient queries

2. **Service Layer** (`src/lib/modules/reference-data/`)
   - Repository with CRUD operations, bulk upsert, and soft delete detection
   - Sync job service with orchestration logic
   - Extraction utilities for JSONPath-like parsing of action responses
   - Comprehensive Zod schemas for validation

3. **API Endpoints**
   - `GET /api/v1/integrations/:id/reference-data` - List cached data with filtering
   - `POST /api/v1/integrations/:id/reference-data/sync` - Trigger manual sync
   - `GET /api/v1/integrations/:id/reference-data/sync/status` - View sync status
   - `POST /api/v1/internal/reference-sync` - Cron endpoint for background sync

4. **UI Components**
   - `AIToolsTab.tsx` - Dedicated "AI Tools" tab in Action editor with:
     - **Two sync types**: "List of items" (users, channels) vs "Complete object" (schemas, configs)
     - **Smart field selection**: Dropdowns populated from the action's output schema
     - **Multiple lookup fields**: Configure which fields AI searches when looking up items
     - **Fuzzy matching toggle**: Enable partial and case-insensitive matching (e.g., "Derek" matches "Derek Osgood")
     - Sync interval in days with clearer labels
     - Tool Description and Response Templates section
     - Collapsible advanced options for extra cached fields
     - Schema preview for debugging
   - `IntegrationReferenceDataTab.tsx` - Reference Data tab with three sub-tabs:
     - **Sync Configuration** - Overview of which actions are configured for sync
     - **Cached Data** - Table view of synced reference items with search/filter
     - **Sync History** - View past sync jobs with status and item counts
   - React Query hooks for data fetching

### Sync Types

**List Sync** (`syncType: 'list'`)

- For actions that return arrays of items (users, channels, projects, etc.)
- AI can look up items by name using configured lookup fields
- Supports fuzzy/partial matching

**Object Sync** (`syncType: 'object'`)

- For actions that return complete data structures (CRM schemas, configurations, etc.)
- Full response is cached and provided as AI context
- No lookup required - entire object available to AI

### Per-Consumer Sync Behavior

Reference data is synced **per end-user connection**. When multiple end-users connect to a consuming app:

- Each user's connection maintains its own cached reference data
- Data is isolated based on what each user has access to (e.g., different Slack workspaces see different channels)
- This ensures AI tools resolve names correctly for each user's context

### Testing

- 51 unit tests covering schemas and extraction logic
- All tests passing
