# Feature: Multi-App Connections

**Milestone:** V0.75  
**Priority:** P1  
**Status:** In Progress  
**Created:** 2026-01-25

---

## Overview

Multi-App Connections enables multiple consuming applications to connect to the same integration with separate credentials, base URLs, and configurations. This is the foundation for multi-tenancy and enables scenarios where different apps (staging vs production, App A vs App B) need isolated access to the same external service.

### User Story

> As a developer, I want to connect multiple consuming apps to the same integration with different credentials, so that my staging and production environments (or different projects) can each have isolated access without sharing tokens or rate limits.

### Problem Statement

Currently, Waygate has a 1:1 relationship between Integration and IntegrationCredential. This means:

- Only one set of credentials per integration
- No isolation between consuming apps
- Staging and production must share credentials
- Rate limits are shared across all consumers
- Credential rotation affects all consumers simultaneously

### Solution

Introduce a **Connection** entity that links a consuming app to an integration with its own credential set:

```
Integration (Slack API template)
    │
    ├── Connection (App A - Production)
    │       └── Credential (OAuth token for prod)
    │
    ├── Connection (App A - Staging)
    │       └── Credential (OAuth token for staging)
    │
    └── Connection (App B)
            └── Credential (Different workspace)
```

---

## Requirements

### Functional Requirements

- [ ] **FR-1**: Create new Connection entity linking consuming apps to integrations
- [ ] **FR-2**: Each Connection has its own credential set (OAuth tokens, API keys)
- [ ] **FR-3**: Connections can have unique base URLs (e.g., different API environments)
- [ ] **FR-4**: Gateway API routes requests to the correct Connection based on context
- [ ] **FR-5**: Connection-level health status and metrics
- [ ] **FR-6**: Support multiple Connections per tenant per integration
- [ ] **FR-7**: Backward compatible - existing integrations auto-create a default Connection
- [ ] **FR-8**: Connection naming/labeling for identification (e.g., "Production", "Staging")

### Non-Functional Requirements

- [ ] **NFR-1**: No performance regression for existing single-connection use case
- [ ] **NFR-2**: Database queries remain O(1) for credential lookup
- [ ] **NFR-3**: Maintain RLS isolation between tenants

---

## Data Model Changes

### New Entity: `Connection`

```typescript
Connection: {
  id: uuid,
  tenantId: uuid -> Tenant,
  integrationId: uuid -> Integration,
  name: string,                    // "Production", "Staging", "App B"
  slug: string,                    // URL-safe identifier within tenant+integration
  baseUrl: string | null,          // Override integration's default base URL
  status: enum,                    // active, error, disabled
  metadata: jsonb,                 // Custom config, notes
  createdAt: timestamp,
  updatedAt: timestamp,

  // Constraints
  UNIQUE(tenantId, integrationId, slug)
}
```

### Modified Entity: `IntegrationCredential`

```typescript
IntegrationCredential: {
  ...existing fields...
  connectionId: uuid -> Connection,  // NEW: Links to specific connection
  // Remove direct integrationId link (get it via Connection)
}
```

### Database Migration Strategy

1. Create `connections` table
2. Add `connection_id` column to `integration_credentials` (nullable initially)
3. Data migration: For each existing credential, create a default Connection named "Default"
4. Update foreign key constraints
5. Make `connection_id` required

---

## API Design

### New Endpoints

| Method | Endpoint                               | Purpose                          |
| ------ | -------------------------------------- | -------------------------------- |
| GET    | `/api/v1/integrations/:id/connections` | List connections for integration |
| POST   | `/api/v1/integrations/:id/connections` | Create new connection            |
| GET    | `/api/v1/connections/:id`              | Get connection details           |
| PATCH  | `/api/v1/connections/:id`              | Update connection                |
| DELETE | `/api/v1/connections/:id`              | Delete connection                |
| POST   | `/api/v1/connections/:id/connect`      | Initiate OAuth for connection    |
| POST   | `/api/v1/connections/:id/disconnect`   | Revoke connection credentials    |
| GET    | `/api/v1/connections/:id/health`       | Check connection health          |

### Modified Endpoints

| Endpoint                                    | Change                                                                    |
| ------------------------------------------- | ------------------------------------------------------------------------- |
| `POST /api/v1/actions/:integration/:action` | Accept optional `connectionId` header/param to target specific connection |
| `GET /api/v1/integrations/:id/health`       | Aggregate health across all connections                                   |

### Request Examples

**Create Connection:**

```json
POST /api/v1/integrations/slack-abc123/connections
{
  "name": "Production",
  "slug": "production",
  "baseUrl": null
}
```

**Invoke Action with Connection:**

```json
POST /api/v1/actions/slack/send-message
X-Waygate-Connection: production

{
  "channel": "#general",
  "text": "Hello!"
}
```

---

## UI Design

### Integration Detail Page Changes

Add "Connections" tab showing:

- List of connections with status badges
- "Add Connection" button
- Per-connection actions (edit, delete, test, view logs)

### Connection Detail Panel

- Connection name and slug
- Base URL override (optional)
- Credential status and management
- Connection-specific logs
- Health metrics

### Wizard Updates

- After integration setup, create default connection automatically
- Add step to configure additional connections (optional)

---

## Implementation Tasks

### Task 1: Database Schema & Migration (45 min)

**Files:** `prisma/schema.prisma`, new migration file

- [ ] Define Connection model in Prisma schema
- [ ] Add connectionId to IntegrationCredential
- [ ] Create migration with data migration script
- [ ] Update seed data

### Task 2: Connection Repository & Service (45 min)

**Files:** `src/lib/modules/connections/`

- [ ] Create connection.repository.ts with CRUD operations
- [ ] Create connection.service.ts with business logic
- [ ] Create connection.schemas.ts with Zod validation
- [ ] Export module via index.ts

### Task 3: Connection API Routes (45 min) ✅

**Files:** `src/app/api/v1/integrations/[id]/connections/`, `src/app/api/v1/connections/[id]/`

- [x] Implement GET /integrations/:id/connections
- [x] Implement POST /integrations/:id/connections
- [x] Implement GET /connections/:id
- [x] Implement PATCH /connections/:id
- [x] Implement DELETE /connections/:id

### Task 4: OAuth Flow Updates (60 min) ✅

**Files:** `src/lib/modules/auth/`, `src/app/api/v1/connections/[id]/connect/`

- [x] Update OAuth initiation to work with Connection context
- [x] Update callback handler to store credentials against Connection
- [x] Implement POST /connections/:id/connect
- [x] Implement POST /connections/:id/disconnect

### Task 5: Gateway Integration (45 min) ✅

**Files:** `src/lib/modules/gateway/`, `src/app/api/v1/actions/`

- [x] Update action invocation to accept connectionId
- [x] Default to first/primary connection if not specified
- [x] Update credential resolution to go through Connection
- [x] Update request logging to include connectionId

### Task 6: Credential Service Updates (30 min) ✅

**Files:** `src/lib/modules/credentials/`

- [x] Update credential repository for Connection foreign key
- [x] Update token refresh to work with Connection context
- [x] Update encryption/decryption flow (already connection-aware from Task 4)

### Task 7: Connection UI - List & Create (60 min) ✅

**Files:** `src/components/features/connections/`, `src/app/(dashboard)/integrations/[id]/`

- [x] Create ConnectionList component
- [x] Create ConnectionCard component
- [x] Create CreateConnectionDialog
- [x] Add Connections tab to Integration detail page
- [x] Wire up to API via hooks (useConnections.ts)

### Task 8: Connection UI - Detail & Manage (45 min) ✅

**Files:** `src/components/features/connections/`

- [x] Create ConnectionDetail panel/page (slide-out sheet)
- [x] Create ConnectionCredentialPanel
- [x] Create ConnectionHealthBadge
- [x] Implement connection edit/delete flows (EditConnectionDialog)

### Task 9: Backward Compatibility & Migration UI (30 min) ✅

**Files:** Various

- [x] Auto-create default Connection on first access to legacy integrations (via `getDefaultConnection` / `createDefaultConnectionIfNeeded`)
- [x] Handle API calls without connectionId (use default via `resolveConnection`)
- [x] Add migration banner/notice in UI if needed (ConnectionInfoBanner)

---

## Test Plan

### Unit Tests

- Connection service: create, update, delete, list operations
- Connection repository: database queries
- Schema validation: connection create/update schemas
- Credential resolution: connection-based lookup

### Integration Tests

- API: Create connection → Get connection → Update → Delete
- API: OAuth flow creates credential linked to connection
- API: Action invocation with explicit connectionId
- API: Action invocation with default connection fallback

### E2E Tests

- Create integration → Add second connection → Configure credentials → Invoke action targeting each connection

---

## Acceptance Criteria

- [ ] Can create multiple connections for a single integration
- [ ] Each connection can have separate OAuth credentials
- [ ] Action invocations can target specific connections
- [ ] Existing integrations continue to work without changes (backward compatible)
- [ ] UI shows and manages connections per integration
- [ ] Request logs include connectionId
- [ ] Health checks work per-connection

---

## Technical Notes

### Connection Resolution Strategy

When invoking an action, determine the target connection:

1. **Explicit**: `X-Waygate-Connection` header or `connectionId` param specifies exact connection
2. **Default**: If not specified, use the tenant's first/primary connection for that integration
3. **Error**: If no connections exist, return clear error

### Caching Considerations

- Connection config can be cached (low-change frequency)
- Credential lookup should check Connection status (avoid using disabled connections)
- Cache invalidation on connection update/delete

### Rate Limiting

- Rate limits apply per-connection (each connection has separate credentials/rate allocation)
- Platform-wide rate limits (V0.75 Feature #2) will need Connection awareness

---

## Dependencies

- V0.5 complete ✅ (basic credential management exists)

## Blocks

- Hybrid Auth Model (V0.75 Feature #2) - will build on Connection entity for platform connectors
- Per-App Custom Mappings (V0.75 Feature #4) - will link mappings to connections

---

## Open Questions

| Question                                                              | Decision                     | Date       |
| --------------------------------------------------------------------- | ---------------------------- | ---------- |
| Should connections be soft-deleted or hard-deleted?                   | TBD                          | —          |
| Should we support "connection groups" for logical organization?       | Out of scope for V0.75       | 2026-01-25 |
| Default connection selection strategy (first created? explicit flag?) | Use `isPrimary` boolean flag | 2026-01-25 |

---

## References

- Product Spec: Section 3.2 - Multi-App Connections feature
- Architecture Doc: Section 4 - Data Model
- Product Spec: Section 5.3 - V0.75 Milestone definition
