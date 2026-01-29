# Feature: Continuous Integration Testing

**Milestone:** V0.75
**Priority:** P1
**Status:** ✅ Complete
**Created:** 2026-01-25
**Completed:** 2026-01-25

---

## Overview

Continuous Integration Testing provides scheduled health checks for all active connections, enabling early detection of API changes, credential issues, and integration failures. Instead of discovering problems when a consuming app tries to invoke an action, Waygate proactively tests connections and alerts users to issues before they impact production workflows.

### User Story

> As a developer, I want Waygate to automatically monitor my integration credentials, so that I can fix expiring tokens before they cause production failures.

> As a developer, I want to periodically scan my integrations for API breaking changes, so that I can update my configurations before they cause errors in my applications.

### Problem Statement

Currently, integration health is only checked on-demand when:

- A user manually triggers a health check from the dashboard
- A consuming app invokes an action and encounters an error
- A credential refresh fails

This reactive approach means:

- **Credential expiration** is discovered only when an action fails (most common failure mode)
- **API breaking changes** aren't detected until production use causes errors
- There's no visibility into the reliability of integrations over time
- Users discover integration problems only when their applications break

### Solution

Implement a **tiered health check system** that balances comprehensive monitoring with minimal API consumption:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     TIERED HEALTH CHECK MODEL                            │
│                                                                          │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │   TIER 1: CREDENTIAL CHECK (Every 15 min) — NO API CALLS        │   │
│   │                                                                  │   │
│   │   • Token expiration monitoring                                  │   │
│   │   • Refresh token validity                                       │   │
│   │   • Credential status (active, expiring, expired, missing)       │   │
│   │                                                                  │   │
│   │   → Zero external API cost                                       │   │
│   │   → Catches most common failure mode (credential expiration)     │   │
│   └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │   TIER 2: CONNECTIVITY CHECK (Every 6-12 hours) — 1 API CALL    │   │
│   │                                                                  │   │
│   │   • Execute lightweight test action (GET /me, /ping, etc.)       │   │
│   │   • Verify actual API reachability                               │   │
│   │   • Record latency and response status                           │   │
│   │                                                                  │   │
│   │   → Minimal cost (1 call per connection per interval)            │   │
│   │   → Validates connection actually works                          │   │
│   │   → Configurable interval (default: 12 hours)                    │   │
│   └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │   TIER 3: FULL ACTION SCAN (Manual/Monthly) — MULTIPLE CALLS    │   │
│   │                                                                  │   │
│   │   • Test all (or critical) actions with sample payloads          │   │
│   │   • Detect breaking API changes and schema drift                 │   │
│   │   • Compare responses against expected schemas                   │   │
│   │                                                                  │   │
│   │   → Higher cost, run infrequently                                │   │
│   │   → Most comprehensive for detecting API changes                 │   │
│   │   → Triggered manually or on monthly schedule                    │   │
│   └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │                    HEALTH STATUS & ALERTING                      │   │
│   │                                                                  │   │
│   │   • Connection status badges (Healthy/Degraded/Unhealthy)        │   │
│   │   • Dashboard notifications for health state changes             │   │
│   │   • Historical health data and uptime tracking                   │   │
│   │   • Email alerts for persistent failures (future: V1.1)          │   │
│   └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

**Primary Focus:**

- **Credential expiration detection** (Tier 1) - catches the most common failure mode
- **API breaking changes** (Tier 3) - comprehensive but infrequent scanning

---

## Requirements

### Functional Requirements

**Tier 1 - Credential Checks (Every 15 min, no API calls):**

- [ ] **FR-1**: Cron job checks credential status every 15 minutes
- [ ] **FR-2**: Detect token expiration status (active, expiring within 1hr, expired)
- [ ] **FR-3**: Detect missing or revoked credentials
- [ ] **FR-4**: No external API calls for Tier 1 checks

**Tier 2 - Connectivity Checks (Every 6-12 hours, 1 API call):**

- [ ] **FR-5**: Execute lightweight test action to verify connectivity
- [ ] **FR-6**: Configurable interval per integration (default: 12 hours)
- [ ] **FR-7**: Configurable test action per integration (defaults to first safe GET action)
- [ ] **FR-8**: Record latency and HTTP status code

**Tier 3 - Full Action Scan (Manual/Monthly):**

- [ ] **FR-9**: Test all actions with sample payloads on demand
- [ ] **FR-10**: Compare responses against expected schemas (detect breaking changes)
- [ ] **FR-11**: Manual trigger from dashboard or optional monthly schedule

**General:**

- [ ] **FR-12**: Store health check results with tier, timestamp, status, and error details
- [ ] **FR-13**: Track connection health status (healthy, degraded, unhealthy)
- [ ] **FR-14**: Health check history viewable in dashboard
- [ ] **FR-15**: Connection list shows current health status badge
- [ ] **FR-16**: Manual trigger for any tier health check from dashboard

### Non-Functional Requirements

- [ ] **NFR-1**: Tier 1 check job completes within 2 minutes for 100 connections
- [ ] **NFR-2**: Health check results retained for 30 days (configurable)
- [ ] **NFR-3**: Tier 1 checks use zero external API calls
- [ ] **NFR-4**: Tier 2 checks use maximum 1 API call per connection
- [ ] **NFR-5**: No sensitive data (credentials, tokens) stored in health check results

---

## Data Model Changes

### New Entity: `HealthCheck`

```typescript
HealthCheck: {
  id: uuid,
  connectionId: uuid,               // FK → Connection
  tenantId: uuid,                   // FK → Tenant (denormalized for RLS)
  status: enum,                     // healthy, degraded, unhealthy
  checkTier: enum,                  // credential, connectivity, full_scan
  checkTrigger: enum,               // scheduled, manual

  // Credential check results (Tier 1+)
  credentialStatus: enum,           // active, expiring, expired, missing
  credentialExpiresAt: timestamp?,  // Token expiration time (if applicable)

  // Test action results (Tier 2+)
  testActionId: uuid?,              // FK → Action (if test action executed)
  testActionSuccess: boolean?,      // Whether test action succeeded
  testActionLatencyMs: integer?,    // Test action latency
  testActionStatusCode: integer?,   // HTTP status code from test action
  testActionError: jsonb?,          // Error details if failed

  // Full scan results (Tier 3 only)
  actionsScanned: integer?,         // Number of actions tested
  actionsPassed: integer?,          // Number of actions that passed
  actionsFailed: integer?,          // Number of actions that failed
  scanResults: jsonb?,              // Detailed per-action results

  // Circuit breaker status
  circuitBreakerStatus: enum,       // closed, open, half_open

  // Overall results
  durationMs: integer,              // Total health check duration
  error: jsonb?,                    // Overall error if check failed
  createdAt: timestamp,

  // Indexes for efficient queries
  @@index([connectionId, createdAt(sort: Desc)])
  @@index([tenantId, createdAt(sort: Desc)])
  @@index([checkTier])
}
```

### New Enum: `HealthCheckStatus`

```typescript
enum HealthCheckStatus {
  healthy    // All checks passed
  degraded   // Some issues (e.g., expiring credentials, elevated latency)
  unhealthy  // Critical issues (e.g., expired credentials, test action failed)
}
```

### New Enum: `HealthCheckTier`

```typescript
enum HealthCheckTier {
  credential     // Tier 1: Credential-only check (no API calls)
  connectivity   // Tier 2: Single test action (1 API call)
  full_scan      // Tier 3: All actions tested (multiple API calls)
}
```

### New Enum: `HealthCheckTrigger`

```typescript
enum HealthCheckTrigger {
  scheduled  // Triggered by cron job
  manual     // Triggered by user from dashboard
}
```

### Modified Entity: `Connection`

Add new fields to track health status:

```typescript
Connection: {
  ...existing fields...

  // Health tracking
  healthStatus: HealthCheckStatus,       // Current health status (default: healthy)
  lastCredentialCheckAt: timestamp?,     // Last Tier 1 check
  lastConnectivityCheckAt: timestamp?,   // Last Tier 2 check
  lastFullScanAt: timestamp?,            // Last Tier 3 check
  healthCheckTestActionId: uuid?,        // FK → Action (configurable test action for Tier 2)
}
```

### Modified Entity: `Integration`

Add health configuration:

```typescript
Integration: {
  ...existing fields...

  // Health check configuration
  healthCheckConfig: jsonb,
  // {
  //   enabled: boolean,                    // Enable health checks (default: true)
  //   credentialCheckMinutes: number,      // Tier 1 interval (default: 15)
  //   connectivityCheckHours: number,      // Tier 2 interval (default: 12)
  //   fullScanEnabled: boolean,            // Enable monthly Tier 3 (default: false)
  //   testActionId: string?                // Override test action for Tier 2
  // }
}
```

### Database Migration Strategy

1. Create `HealthCheckStatus`, `HealthCheckTier`, and `HealthCheckTrigger` enums
2. Create `health_checks` table with all fields and indexes
3. Add health tracking fields to `connections`
4. Add `health_check_config` to `integrations` with tiered defaults
5. Set initial `health_status` to 'healthy' for existing connections

---

## API Design

### New Endpoints

| Method | Endpoint                                       | Purpose                                    |
| ------ | ---------------------------------------------- | ------------------------------------------ |
| GET    | `/api/v1/connections/:id/health-checks`        | List health check history for connection   |
| POST   | `/api/v1/connections/:id/health-checks`        | Trigger manual health check (specify tier) |
| GET    | `/api/v1/connections/:id/health-checks/latest` | Get most recent health check               |
| GET    | `/api/v1/health-checks/summary`                | Get tenant-wide health summary             |
| POST   | `/api/v1/internal/health-checks/credential`    | Internal: Tier 1 cron (every 15 min)       |
| POST   | `/api/v1/internal/health-checks/connectivity`  | Internal: Tier 2 cron (every 6-12 hours)   |

### Modified Endpoints

| Endpoint                         | Change                                              |
| -------------------------------- | --------------------------------------------------- |
| `GET /api/v1/connections`        | Include `healthStatus` in response                  |
| `GET /api/v1/connections/:id`    | Include health check summary and last check details |
| `PATCH /api/v1/integrations/:id` | Accept `healthCheckConfig` updates                  |

### Request/Response Examples

**Trigger Manual Health Check:**

```json
POST /api/v1/connections/conn_abc123/health-checks
{
  "tier": "connectivity"  // "credential" | "connectivity" | "full_scan"
}

// Response:
{
  "success": true,
  "data": {
    "id": "hc_xyz790",
    "status": "healthy",
    "checkTier": "connectivity",
    "checkTrigger": "manual",
    "credentialStatus": "active",
    "testActionSuccess": true,
    "testActionLatencyMs": 132,
    "circuitBreakerStatus": "closed",
    "durationMs": 148,
    "createdAt": "2026-01-25T10:20:00Z"
  }
}
```

**Get Health Check History:**

```json
GET /api/v1/connections/conn_abc123/health-checks?tier=connectivity&limit=10

{
  "success": true,
  "data": [
    {
      "id": "hc_xyz789",
      "status": "healthy",
      "checkTier": "connectivity",
      "checkTrigger": "scheduled",
      "credentialStatus": "active",
      "testActionSuccess": true,
      "testActionLatencyMs": 145,
      "durationMs": 156,
      "createdAt": "2026-01-25T10:00:00Z"
    },
    {
      "id": "hc_xyz780",
      "status": "healthy",
      "checkTier": "credential",
      "checkTrigger": "scheduled",
      "credentialStatus": "active",
      "durationMs": 12,
      "createdAt": "2026-01-25T09:45:00Z"
    }
  ],
  "pagination": {
    "hasMore": true,
    "cursor": "eyJpZCI6ImhjX3h5ejc4MCJ9"
  }
}
```

**Full Scan Result (Tier 3):**

```json
POST /api/v1/connections/conn_abc123/health-checks
{
  "tier": "full_scan"
}

// Response:
{
  "success": true,
  "data": {
    "id": "hc_xyz791",
    "status": "degraded",
    "checkTier": "full_scan",
    "checkTrigger": "manual",
    "credentialStatus": "active",
    "actionsScanned": 12,
    "actionsPassed": 11,
    "actionsFailed": 1,
    "scanResults": [
      { "actionId": "act_123", "actionSlug": "list-users", "success": true, "latencyMs": 234 },
      { "actionId": "act_456", "actionSlug": "get-user", "success": true, "latencyMs": 189 },
      { "actionId": "act_789", "actionSlug": "create-channel", "success": false, "error": "Schema mismatch: expected 'channel_id', got 'id'" }
    ],
    "durationMs": 4521,
    "createdAt": "2026-01-25T10:20:00Z"
  }
}
```

**Tenant Health Summary:**

```json
GET /api/v1/health-checks/summary

{
  "success": true,
  "data": {
    "totalConnections": 15,
    "healthy": 12,
    "degraded": 2,
    "unhealthy": 1,
    "lastCredentialCheckAt": "2026-01-25T10:15:00Z",
    "lastConnectivityCheckAt": "2026-01-25T06:00:00Z",
    "connections": [
      {
        "id": "conn_abc123",
        "name": "Production Slack",
        "integrationName": "Slack",
        "healthStatus": "healthy",
        "credentialStatus": "active",
        "lastCredentialCheckAt": "2026-01-25T10:15:00Z",
        "lastConnectivityCheckAt": "2026-01-25T06:00:00Z"
      },
      {
        "id": "conn_def456",
        "name": "Staging GitHub",
        "integrationName": "GitHub",
        "healthStatus": "unhealthy",
        "credentialStatus": "expired",
        "lastCredentialCheckAt": "2026-01-25T10:15:00Z",
        "error": "OAuth token expired 2 hours ago"
      }
    ]
  }
}
```

---

## UI Design

### Integration List Page ✅

- Health-aware status badge replaces simple "Active" status
- Shows aggregate connection health: "Healthy", "X Unhealthy", "Pending", "Draft", or "No Connections"
- Color coding: Green (healthy), Yellow (degraded), Red (unhealthy), Gray (pending/unknown)

### Integration Overview Page ✅

- Connection Health section showing aggregate health counts:
  - Healthy, Degraded, Unhealthy, Pending counts
  - Link to Connections tab for management
  - Empty state prompts connection creation

### Connection List Updates ✅

- Add health status badge to each connection card/row
- Color coding: Green (healthy), Yellow (degraded), Red (unhealthy)
- Show "Last checked: X minutes ago" timestamp
- Quick action button to trigger manual health check

### Connection Detail Page ✅

- New "Health" tab or section showing:
  - Current health status with detailed breakdown
  - Uptime percentage (last 24h, 7d)
  - Health check history timeline
  - Latency chart over time
  - Test action configuration

### Dashboard Overview

- Health summary widget showing:
  - Total connections by health status
  - Recent health state changes
  - Connections needing attention

### Health Check History View

- Table/timeline of recent health checks
- Filterable by status, date range
- Expandable rows showing full details
- Error messages with suggested resolutions

---

## Implementation Tasks

### Task 1: Database Schema & Migration (45 min) ✅

**Files:** `prisma/schema.prisma`, `prisma/migrations/20260125100000_add_health_checks/`

- [x] Define `HealthCheckStatus`, `HealthCheckTier`, and `HealthCheckTrigger` enums
- [x] Define `HealthCheck` model with tiered fields and indexes
- [x] Add health tracking fields to `Connection` model (per-tier timestamps)
- [x] Add `healthCheckConfig` to `Integration` model (tiered intervals)
- [x] Create migration with appropriate defaults
- [x] Update TypeScript types (Prisma generate)

### Task 2: HealthCheck Repository & Schemas (45 min) ✅

**Files:** `src/lib/modules/health-checks/`

- [x] Create `health-check.repository.ts` with CRUD operations
- [x] Create `health-check.schemas.ts` with Zod validation (tier-aware)
- [x] Implement `findByConnectionId` with tier filtering and pagination
- [x] Implement `getLatestByConnectionId` and `getLatestByTier`
- [x] Implement `createHealthCheck`
- [x] Export module via index.ts

### Task 3: Tier 1 - Credential Check Service (45 min) ✅

**Files:** `src/lib/modules/health-checks/credential-check.service.ts`

- [x] Implement `runCredentialCheck(connectionId)` - no API calls
- [x] Check credential status (active, expiring, expired, missing)
- [x] Calculate expiration window (warn if < 1 hour)
- [x] Store health check result
- [x] Update connection health status

### Task 4: Tier 2 - Connectivity Check Service (45 min) ✅

**Files:** `src/lib/modules/health-checks/connectivity-check.service.ts`

- [x] Implement `runConnectivityCheck(connectionId)` - 1 API call
- [x] Select test action (configured or default safe GET)
- [x] Execute test action with timeout handling
- [x] Record latency and success/failure
- [x] Store health check result

### Task 5: Tier 3 - Full Scan Service (60 min) ✅

**Files:** `src/lib/modules/health-checks/full-scan.service.ts`

- [x] Implement `runFullScan(connectionId)` - multiple API calls
- [x] Test all actions (or critical subset) with sample payloads
- [x] Compare responses against schemas (detect breaking changes)
- [x] Aggregate results (passed/failed counts)
- [x] Store detailed scan results

### Task 6: Scheduled Cron Jobs (45 min) ✅

**Files:** `src/app/api/v1/internal/health-checks/`

- [x] Create `credential/route.ts` - Tier 1 cron (every 15 min)
- [x] Create `connectivity/route.ts` - Tier 2 cron (every 12 hours)
- [x] Both protected by CRON_SECRET
- [x] Respect configurable intervals per integration
- [x] Run in batches, log summaries
- [x] Add to vercel.json cron configuration

### Task 7: HealthCheck API Routes (45 min) ✅

**Files:** `src/app/api/v1/connections/[id]/health-checks/`, `src/app/api/v1/health-checks/`

- [x] Implement GET for health check history (with tier filter)
- [x] Implement POST for manual health check trigger (specify tier)
- [x] Implement GET `/latest` for most recent check
- [x] Implement GET `/api/v1/health-checks/summary` for tenant summary
- [x] Proper error handling and auth

### Task 8: Connection API Updates (30 min) ✅

**Files:** `src/app/api/v1/connections/`

- [x] Include `healthStatus` in connection list response
- [x] Include per-tier last check timestamps
- [x] Include health summary in connection detail response
- [x] Update Connection service to track health

### Task 9: Health Status Badges & UI Components (45 min) ✅

**Files:** `src/components/features/connections/`, `src/components/features/health/`

- [x] Create `HealthStatusBadge` component
- [x] Create `HealthCheckTimeline` component (show tier in timeline)
- [x] Create `HealthSummaryCard` component
- [x] Add `useHealthChecks` hook
- [x] Add badge to ConnectionCard and ConnectionList

### Task 10: Connection Detail Health Section (45 min) ✅

**Files:** `src/components/features/connections/`

- [x] Add Health section/tab to connection detail page
- [x] Display current health status breakdown by tier
- [x] Show health check history timeline
- [x] Add "Check Now" buttons (Tier 1, Tier 2, Full Scan)
- [x] Show health check configuration

---

## Test Plan

### Unit Tests

- HealthCheck service: `runHealthCheck` returns correct status for various scenarios
- Test action selection: Selects safe GET action by default
- Health status calculation: Correct status for different conditions
- Repository: CRUD operations, pagination

### Integration Tests

- API: List health checks with pagination
- API: Trigger manual health check
- API: Get tenant health summary
- Cron: Processes connections correctly
- Connection health status updates after check

### E2E Tests

- Dashboard shows health status badges
- Manual health check from UI
- Health history displays correctly

---

## Acceptance Criteria

- [x] Tier 1 (credential) checks run every 15 minutes with zero API calls
- [x] Tier 2 (connectivity) checks run every 12 hours (configurable 6-12h) with 1 API call
- [x] Tier 3 (full scan) can be triggered manually or monthly
- [x] Health check results are stored and viewable in dashboard
- [x] Connection list shows current health status badge
- [x] Manual health check can be triggered for any tier from dashboard
- [x] Credential expiration detected before tokens expire
- [x] API breaking changes detected via Tier 3 full scan
- [x] Unhealthy connections are clearly highlighted
- [x] Health check history is retained for at least 30 days
- [x] Cron jobs handle 100+ connections without timeout

---

## Technical Notes

### Health Status Determination

```
HEALTHY:
- Credential status = active (not expiring within 1 hour)
- Last connectivity check succeeded (if applicable)
- Circuit breaker = closed

DEGRADED:
- Credential status = expiring (within 1 hour)
- Last connectivity check had elevated latency (> 2000ms)
- Circuit breaker = half_open
- Last full scan had some action failures

UNHEALTHY:
- Credential status = expired/missing/needs_reauth
- Last connectivity check failed
- Circuit breaker = open
- Last full scan had critical failures
```

### Tiered Check Intervals

| Tier         | Default Interval | Configurable Range | API Calls       |
| ------------ | ---------------- | ------------------ | --------------- |
| Credential   | 15 min           | 5-60 min           | 0               |
| Connectivity | 12 hours         | 6-24 hours         | 1               |
| Full Scan    | Manual/Monthly   | Manual only        | N (all actions) |

### Cost Analysis

```
Example: 20 connections over 1 month

Tier 1 (Credential): 0 API calls
Tier 2 (Connectivity at 12h): 20 connections × 2/day × 30 days = 1,200 API calls/month
Tier 3 (Full Scan manual): Only when triggered

→ ~40 API calls/day for connectivity checks (very reasonable)
```

### Test Action Selection (Tier 2)

Default test action selection priority:

1. Explicitly configured `healthCheckTestActionId` on integration
2. Action tagged with `health-check` tag
3. First GET action with no required parameters
4. First GET action (will be skipped if has required params)
5. Skip connectivity check, credential check only

### Full Scan Behavior (Tier 3)

- Tests all actions that can be tested without side effects
- Prefers GET actions, skips destructive POST/PUT/DELETE unless explicitly marked safe
- Compares response schemas against expected schemas
- Detects: missing fields, type changes, new required fields
- Does NOT store response data, only pass/fail and error messages

### Data Retention

Health check results are retained for 30 days by default. A cleanup job (deferred to V1.1) will archive/delete older records.

### Security

- Health check results never contain sensitive data
- Test action responses are not stored (only success/failure, latency, status code)
- Cron endpoints protected by CRON_SECRET
- All health check APIs require tenant authentication
- Full scan results include error messages but no response payloads

---

## Dependencies

- Multi-App Connections (V0.75 Feature #1) ✅ - Connection entity exists
- Hybrid Auth Model (V0.75 Feature #2) ✅ - Platform/custom credentials

## Blocks

- Per-App Custom Mappings (V0.75 Feature #4) - unrelated, can proceed in parallel

---

## Open Questions

| Question                                         | Decision                                    | Date       |
| ------------------------------------------------ | ------------------------------------------- | ---------- |
| Should health checks run for draft integrations? | No, only active integrations                | 2026-01-25 |
| What's the Tier 1 (credential) check interval?   | 15 minutes (configurable 5-60 min)          | 2026-01-25 |
| What's the Tier 2 (connectivity) check interval? | 12 hours default (configurable 6-24h)       | 2026-01-25 |
| What's the Tier 3 (full scan) frequency?         | Manual trigger or optional monthly          | 2026-01-25 |
| Should users be able to disable health checks?   | Yes, per-integration config                 | 2026-01-25 |
| How long to retain health check history?         | 30 days (cleanup job in V1.1)               | 2026-01-25 |
| Email alerts for unhealthy connections?          | Defer to V1.1                               | 2026-01-25 |
| Primary failure modes to catch?                  | Credential expiration, API breaking changes | 2026-01-25 |

---

## References

- Product Spec: Section 3.2 - Continuous Integration Testing feature
- Architecture Doc: Section 2.4 - Token Refresh Flow (similar pattern)
- Existing: `/api/v1/integrations/:id/health` endpoint (current health check logic)
- Existing: `/api/v1/internal/token-refresh` (cron job pattern)
