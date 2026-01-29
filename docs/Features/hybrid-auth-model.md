# Feature: Hybrid Auth Model

**Milestone:** V0.75
**Priority:** P1
**Status:** ✅ Complete
**Created:** 2026-01-25
**Completed:** 2026-01-25

---

## Overview

The Hybrid Auth Model enables Waygate to act as an OAuth broker for major providers, offering "one-click connect" experiences while still supporting users who need to bring their own OAuth app credentials. This creates a seamless onboarding experience for most users while accommodating enterprise compliance requirements.

### User Story

> As a developer, I want to connect my integrations using Waygate's pre-registered OAuth apps, so that I can get started quickly without registering my own OAuth applications with each provider.

> As an enterprise developer, I want the option to use my own OAuth app credentials, so that I can meet our compliance requirements and have dedicated rate limits.

### Problem Statement

Currently, every Waygate user must:

- Register their own OAuth applications with each provider (Slack, Google, etc.)
- Navigate complex verification processes (CASA for Google, app reviews for Slack)
- Manage their own client secrets and compliance certifications
- Wait days/weeks for app approvals before their integration works

This creates significant friction for new users and makes the "time to working integration" much longer than necessary.

### Solution

Introduce a **Platform Connector** model where Waygate registers and maintains verified OAuth apps with major providers:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          HYBRID AUTH MODEL                               │
│                                                                          │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │                    PLATFORM CONNECTORS                           │   │
│   │   ┌─────────────┐   ┌─────────────┐   ┌─────────────┐           │   │
│   │   │   Slack     │   │   Google    │   │  Microsoft  │   ...     │   │
│   │   │  (Waygate   │   │  (Waygate   │   │  (Waygate   │           │   │
│   │   │   OAuth)    │   │   OAuth)    │   │   OAuth)    │           │   │
│   │   └─────────────┘   └─────────────┘   └─────────────┘           │   │
│   │        ✓ CASA         ✓ Verified       ✓ Verified               │   │
│   │        ✓ Reviewed     ✓ Published      ✓ Published              │   │
│   │                                                                  │   │
│   │   → One-click connect for users                                  │   │
│   │   → Rate limits shared across Waygate tenants                    │   │
│   └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │                    CUSTOM CREDENTIALS                            │   │
│   │                                                                  │   │
│   │   → Users bring their own OAuth app credentials                  │   │
│   │   → Full control over scopes and permissions                     │   │
│   │   → Dedicated rate limits                                        │   │
│   │   → Required for some enterprise security policies               │   │
│   └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Requirements

### Functional Requirements

- [x] **FR-1**: Create PlatformConnector entity for Waygate-owned OAuth apps
- [x] **FR-2**: Platform connectors store encrypted client credentials
- [x] **FR-3**: Connections can be "platform" (use Waygate's OAuth) or "custom" (user's own)
- [x] **FR-4**: OAuth flow dynamically uses platform or custom credentials
- [x] **FR-5**: Track credential source on stored tokens (platform vs user_owned)
- [x] **FR-6**: "One-click connect" UI for available platform connectors
- [x] **FR-7**: Users can choose between platform and custom connector for each connection
- [x] **FR-8**: Platform connectors track certification status (CASA, publisher verification)
- [x] **FR-9**: At least one platform connector available (Slack) for MVP

### Non-Functional Requirements

- [x] **NFR-1**: Platform connector credentials never exposed to users
- [x] **NFR-2**: Credential source clearly displayed in UI (transparency)
- [x] **NFR-3**: Platform connections work without additional user configuration
- [x] **NFR-4**: Custom credential option always available as fallback

---

## Data Model Changes

### New Entity: `PlatformConnector`

```typescript
PlatformConnector: {
  id: uuid,
  providerSlug: string,           // 'slack', 'google-workspace', 'microsoft-365'
  displayName: string,            // 'Slack', 'Google Workspace'
  description: string,            // Brief description
  logoUrl: string,                // Provider logo URL
  authType: enum,                 // oauth2, etc.
  encryptedClientId: bytea,       // Encrypted OAuth client ID
  encryptedClientSecret: bytea,   // Encrypted OAuth client secret
  authorizationUrl: string,       // OAuth authorization endpoint
  tokenUrl: string,               // OAuth token endpoint
  defaultScopes: string[],        // Default scopes Waygate requests
  callbackPath: string,           // OAuth callback path for this provider
  certifications: jsonb,          // { casa: { status: 'active', expiresAt: '...' }, ... }
  rateLimits: jsonb,              // { requestsPerMinute: 1000, shared: true }
  status: enum,                   // active, suspended, deprecated
  metadata: jsonb,                // Additional config
  createdAt: timestamp,
  updatedAt: timestamp,

  // Constraints
  UNIQUE(providerSlug)
}
```

### Modified Entity: `Connection`

```typescript
Connection: {
  ...existing fields...
  connectorType: enum,            // 'platform' | 'custom' (default: 'custom')
  platformConnectorId: uuid,      // FK → PlatformConnector (nullable, only if connectorType='platform')
}
```

### Modified Entity: `IntegrationCredential`

```typescript
IntegrationCredential: {
  ...existing fields...
  credentialSource: enum,         // 'platform' | 'user_owned' (default: 'user_owned')
}
```

### Database Migration Strategy

1. Create `platform_connectors` table with encryption for secrets
2. Add `connector_type` enum column to `connections` (default: 'custom')
3. Add `platform_connector_id` foreign key to `connections` (nullable)
4. Add `credential_source` enum column to `integration_credentials` (default: 'user_owned')
5. Seed initial platform connector data (Slack)

---

## API Design

### New Endpoints

| Method | Endpoint                            | Purpose                            |
| ------ | ----------------------------------- | ---------------------------------- |
| GET    | `/api/v1/platform-connectors`       | List available platform connectors |
| GET    | `/api/v1/platform-connectors/:slug` | Get platform connector details     |

### Modified Endpoints

| Endpoint                                    | Change                                                 |
| ------------------------------------------- | ------------------------------------------------------ |
| `POST /api/v1/integrations/:id/connections` | Accept `connectorType` and `platformConnectorSlug`     |
| `POST /api/v1/connections/:id/connect`      | Use platform credentials when connectorType='platform' |

### Request Examples

**List Platform Connectors:**

```json
GET /api/v1/platform-connectors

{
  "success": true,
  "data": [
    {
      "slug": "slack",
      "displayName": "Slack",
      "description": "Connect to Slack workspaces",
      "logoUrl": "/images/providers/slack.svg",
      "status": "active",
      "certifications": {
        "appReview": { "status": "approved", "approvedAt": "2026-01-01" }
      }
    }
  ]
}
```

**Create Platform Connection:**

```json
POST /api/v1/integrations/int_abc123/connections
{
  "name": "Production Slack",
  "slug": "production",
  "connectorType": "platform",
  "platformConnectorSlug": "slack"
}
```

**Create Custom Connection (existing behavior):**

```json
POST /api/v1/integrations/int_abc123/connections
{
  "name": "Enterprise Slack",
  "slug": "enterprise",
  "connectorType": "custom"
}
```

---

## UI Design

### Connection Management UX

The Connections tab uses an inline layout for a consistent configuration experience:

1. **Connection Selector** - Dropdown at the top to switch between connections
   - Shows connection name, status, and health indicator
   - Highlights primary connection with star badge
   - Quick access to add new connections

2. **Inline Configuration** - All connection settings displayed directly in the tab
   - Credentials panel with connect/disconnect/refresh actions
   - Health status section
   - Field mappings per-action
   - Preamble template for LLM responses
   - Configuration details (base URL, connector type, timestamps)
   - Recent activity log

### Connection Creation Flow

Multi-step dialog with connector type selection:

1. **Step 1: Choose Connection Type**
   - "Use Waygate's App" (platform) - recommended, one-click
   - "Use Your Own Credentials" (custom) - advanced users

2. **Step 2: Platform Selection** (if platform type)
   - Show available platform connectors for the integration's provider
   - Display certification badges (verified, CASA-certified)
   - One-click "Connect" button

3. **Step 3: OAuth Flow**
   - Platform: Direct redirect to provider OAuth
   - Custom: Show credential input form first, then OAuth

### Connection Indicators

- **Connector Type Badge**: "Waygate App" (violet) vs "Custom App" (gray)
- **Health Status Dot**: Green (healthy), Yellow (degraded), Red (unhealthy)
- **Primary Badge**: Amber star for the default connection
- **Status Badge**: Active (emerald), Error (red), Disabled (gray)

### Platform Connector List (Settings)

New settings page section showing:

- Available platform connectors
- Their status and certifications
- Usage across tenant's connections

---

## Implementation Tasks

### Task 1: Database Schema & Migration (45 min) ✅

**Files:** `prisma/schema.prisma`, new migration file

- [x] Define PlatformConnector model in Prisma schema
- [x] Add connectorType enum (PLATFORM, CUSTOM)
- [x] Add platformConnectorId to Connection model
- [x] Add credentialSource enum to IntegrationCredential
- [x] Create migration with appropriate defaults
- [x] Update TypeScript types

### Task 2: PlatformConnector Repository & Service (45 min) ✅

**Files:** `src/lib/modules/platform-connectors/`

- [x] Create platform-connector.repository.ts with CRUD operations
- [x] Create platform-connector.service.ts with business logic
- [x] Create platform-connector.schemas.ts with Zod validation
- [x] Implement credential encryption/decryption for platform secrets
- [x] Export module via index.ts

### Task 3: PlatformConnector API Routes (30 min) ✅

**Files:** `src/app/api/v1/platform-connectors/`

- [x] Implement GET /platform-connectors (list active connectors)
- [x] Implement GET /platform-connectors/:slug (get details, no secrets)
- [x] Ensure secrets are never exposed in responses

### Task 4: Connection Platform Mode Integration (45 min) ✅

**Files:** `src/lib/modules/connections/`

- [x] Update connection.schemas.ts for connectorType and platformConnectorSlug
- [x] Update connection.service.ts to validate platform connector
- [x] Update connection.repository.ts for new fields
- [x] Logic to link Connection to PlatformConnector

### Task 5: OAuth Flow Updates for Platform Mode (60 min) ✅

**Files:** `src/lib/modules/auth/`, `src/app/api/v1/connections/[id]/connect/`

- [x] Update OAuth initiation to detect platform vs custom
- [x] Retrieve and decrypt platform connector credentials when needed
- [x] Use platform client_id/secret for OAuth flow
- [x] Store credentials with credentialSource='platform'
- [x] Update callback handler for platform connector context

### Task 6: One-Click Connect UI - Provider Selection (45 min) ✅

**Files:** `src/components/features/connections/`

- [x] Update CreateConnectionDialog with connector type step
- [x] Create PlatformConnectorSelect component
- [x] Show available platform connectors with status badges
- [x] Create usePlatformConnectors hook

### Task 7: One-Click Connect UI - OAuth Experience (45 min) ✅

**Files:** `src/components/features/connections/`

- [x] Streamlined OAuth button for platform connections
- [x] Platform vs Custom badge on ConnectionCard
- [x] Update ConnectionDetail to show credential source
- [x] Certification badge component

### Task 8: Seed Initial Platform Connector (30 min) ✅

**Files:** `prisma/seed.ts`, environment config

- [x] Add Slack platform connector to seed data
- [x] Configure with placeholder or real Waygate OAuth app credentials
- [x] Add environment variables for platform connector secrets
- [x] Document platform connector setup process

---

## Test Plan

### Unit Tests

- PlatformConnector service: list, get, credential decryption
- Connection service: create with platform type, validation
- OAuth flow: platform credential retrieval
- Schema validation: connector type, platform connector slug

### Integration Tests

- API: List platform connectors (no secrets exposed)
- API: Create connection with platform type
- API: OAuth initiation with platform credentials
- API: Credential stored with correct source

### E2E Tests

- One-click connect flow: Select platform → OAuth → Connected
- Custom credential flow: Still works as before
- View connection shows correct credential source badge

---

## Acceptance Criteria

- [x] PlatformConnector entity exists and can store provider OAuth apps
- [x] Connections can be created with connectorType='platform' or 'custom'
- [x] Platform OAuth flow uses Waygate's registered credentials
- [x] Custom OAuth flow continues to work as before
- [x] UI clearly shows platform vs custom connection type
- [x] At least one platform connector (Slack) is available
- [x] Platform connector secrets are never exposed to users

---

## Implementation Summary

### Files Created

| File                                                                   | Purpose                                        |
| ---------------------------------------------------------------------- | ---------------------------------------------- |
| `prisma/migrations/*_add_platform_connectors/`                         | Database migration for PlatformConnector model |
| `src/lib/modules/platform-connectors/platform-connector.schemas.ts`    | Zod validation schemas                         |
| `src/lib/modules/platform-connectors/platform-connector.repository.ts` | Data access layer                              |
| `src/lib/modules/platform-connectors/platform-connector.service.ts`    | Business logic with encryption                 |
| `src/lib/modules/platform-connectors/index.ts`                         | Module exports                                 |
| `src/app/api/v1/platform-connectors/route.ts`                          | List platform connectors API                   |
| `src/app/api/v1/platform-connectors/[slug]/route.ts`                   | Get platform connector API                     |
| `src/components/features/connections/PlatformConnectorSelect.tsx`      | Platform connector selection UI                |
| `src/components/features/connections/ConnectorTypeBadge.tsx`           | Badge components for connector type            |
| `src/components/features/connections/ConnectionSelector.tsx`           | Dropdown to switch between connections         |
| `src/components/features/connections/ConnectionDetailInline.tsx`       | Inline connection config (non-modal)           |
| `src/hooks/usePlatformConnectors.ts`                                   | React Query hooks                              |
| `tests/unit/platform-connectors/platform-connector-schemas.test.ts`    | Schema unit tests (27 tests)                   |
| `tests/unit/connections/connection-platform-mode.test.ts`              | Connection platform mode tests (16 tests)      |

### Files Modified

| File                                                                | Changes                                                             |
| ------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `prisma/schema.prisma`                                              | Added PlatformConnector model, ConnectorType/CredentialSource enums |
| `prisma/seed.ts`                                                    | Seeds Slack and Google platform connectors                          |
| `src/lib/modules/connections/connection.schemas.ts`                 | Added connectorType, platformConnectorSlug                          |
| `src/lib/modules/connections/connection.repository.ts`              | New fields in CRUD operations                                       |
| `src/lib/modules/connections/connection.service.ts`                 | Platform connector validation                                       |
| `src/lib/modules/credentials/credential.repository.ts`              | credentialSource field                                              |
| `src/lib/modules/credentials/credential.service.ts`                 | Store credential source                                             |
| `src/lib/modules/auth/oauth-providers/base.ts`                      | OAuthState with platform context                                    |
| `src/lib/modules/auth/auth.service.ts`                              | Platform credential retrieval in OAuth flow                         |
| `src/components/features/connections/CreateConnectionDialog.tsx`    | Multi-step flow with type selection, onSuccess callback             |
| `src/components/features/connections/ConnectionCard.tsx`            | ConnectorTypeBadge display                                          |
| `src/components/features/connections/ConnectionDetail.tsx`          | Connector type section (kept for backwards compatibility)           |
| `src/components/features/connections/ConnectionList.tsx`            | Inline layout with selector instead of grid + sheet                 |
| `src/components/features/connections/ConnectionCredentialPanel.tsx` | Streamlined platform connect button                                 |
| `src/components/features/connections/index.ts`                      | Export new components                                               |
| `docs/architecture.md`                                              | Platform connector environment variables                            |

### Test Coverage

- **43 new unit tests** covering schema validation, response formatting, and connector type logic
- All existing 879 tests continue to pass
- TypeScript and ESLint validation passing

---

## Technical Notes

### Credential Security

Platform connector credentials are highly sensitive:

- Encrypted at rest using same AES-256-GCM as user credentials
- Stored in environment variables for seed, encrypted in DB after
- Never returned in API responses
- Only decrypted in-memory during OAuth flow

### Rate Limit Considerations

Platform connections share Waygate's OAuth app rate limits:

- All tenants using Slack platform connector share Slack's rate allocation
- Future: Implement fair queuing to prevent single tenant monopolizing
- Custom connections have dedicated rate limits (user's own app)

### Certification Tracking

Store certification status in jsonb for flexibility:

```json
{
  "casa": {
    "status": "active",
    "tier": 2,
    "expiresAt": "2026-12-01T00:00:00Z"
  },
  "appReview": {
    "status": "approved",
    "approvedAt": "2026-01-01T00:00:00Z"
  }
}
```

Future: Background job to alert on certification expiry.

### Default Connector Selection

When creating a platform connection:

1. Validate platformConnectorSlug exists and is active
2. Validate platform connector supports the integration's provider
3. Link Connection to PlatformConnector

---

## Dependencies

- Multi-App Connections (V0.75 Feature #1) ✅ - Connection entity exists

## Blocks

- Per-App Custom Mappings (V0.75 Feature #4) - unrelated, can proceed in parallel
- Continuous Integration Testing (V0.75 Feature #3) - may want to health-check platform connections

---

## Open Questions

| Question                                                       | Decision                        | Date       |
| -------------------------------------------------------------- | ------------------------------- | ---------- |
| Should platform connectors be admin-only managed?              | Yes, for V0.75                  | 2026-01-25 |
| Should we support multiple scopes sets per platform connector? | No, use default scopes for now  | 2026-01-25 |
| How to handle platform connector deprecation?                  | Defer to future milestone       | 2026-01-25 |
| Should rate limits be enforced at platform connector level?    | Yes, but implementation in V1.1 | 2026-01-25 |

---

## References

- Product Spec: Section 3.2 - Hybrid Auth Model feature
- Architecture Doc: Appendix A - Future Architecture - Hybrid Authentication Model
- Product Spec: Section 5.3 - V0.75 Milestone definition
