# End-User Auth Delegation

**Status:** Not Started
**Milestone:** V2
**Dependencies:** Multi-App Connections (V0.75, complete), Hybrid Auth Model (V0.75, complete)

---

## Context

A Waygate developer builds consuming applications (e.g., "DerekApp"), each a standalone product with its own users. Those end-users need to connect their own accounts (personal Gmail, their company's Slack workspace) through the developer's app, without ever touching Waygate directly.

**How OAuth apps work in the real world:**

1. The developer registers an OAuth app with Slack (or Google, etc.) — gets a `client_id` and `client_secret`, goes through CASA security review
2. End-users authorize _that app_ — the consent screen says "DerekApp wants to access your Slack"
3. Each end-user gets their own token, issued _under_ the developer's registered app
4. All user tokens share the app's rate limits, security certification, and compliance status

This means the relationship is inherently **nested**: the app registration is the parent, and individual user tokens are children of it.

**Current gaps:**

- No App grouping — all connections mixed under one tenant
- No per-app OAuth credentials — `authConfig` lives at the Integration level, so all connections share the same app registration
- Single API key — one `waygateApiKey` per tenant, no way to scope per-app
- No end-user identity — Waygate has no concept of "who" within a consuming app is connecting
- No per-user credentials under a connection — each user would need their own Connection, which pollutes the admin UI
- No embeddable connect flow — no way for end-users to OAuth without touching Waygate UI
- No rate limit fairness — if all end-users share one app's rate limits, one heavy user can starve others

**What this enables:**

- Developer creates Apps in Waygate, each with its own API key and OAuth app registration
- Each App has Connections (what developers see in the UI today) that represent the app-level link to an integration
- End-users connect their own accounts through an embeddable flow — their tokens are stored _under_ the app's Connection
- Supports both org-level connections (admin connects for everyone) and user-level credentials (each person connects their own)
- Rate limits from the external provider are fairly distributed across end-users
- Consuming app invokes actions on behalf of specific users with automatic credential resolution

---

## Data Model: The Corrected Hierarchy

The key insight: **Connection stays at the app level** (what developers manage in the UI). End-user tokens are a new child concept underneath it.

```
Tenant (the Waygate developer account)
└── App (DerekApp — a consuming application)
    ├── API Key: wg_app_abc123...
    │
    ├── AppIntegrationConfig (DerekApp's registered Slack App)
    │   ├── client_id / client_secret (encrypted)
    │   ├── CASA certification status
    │   └── scopes
    │
    └── Connection: "DerekApp Slack" (what you see in the UI)
        ├── Health checks, field mappings, variables, reference data
        ├── Shared credential (bot token — optional, for org-wide actions)
        │
        └── End-User Credentials (nested under this connection)
            ├── Sarah's Slack token (issued under DerekApp's Slack App)
            ├── Mike's Slack token (issued under DerekApp's Slack App)
            └── Jane's Slack token (issued under DerekApp's Slack App)
```

### Why This Structure

| Design choice                           | Reason                                                                           |
| --------------------------------------- | -------------------------------------------------------------------------------- |
| Connection = app-level                  | Keeps the UI clean. Developers manage connections, not thousands of user entries |
| End-user tokens nested under Connection | Reflects real-world OAuth: all tokens issued under one app registration          |
| Health checks stay on Connection        | App-level health (is the API reachable?) applies to all users                    |
| Field mappings stay on Connection       | All users share the same data transformation rules                               |
| Rate limits tracked at Connection level | The external provider limits the _app_, not individual users                     |
| Separate AppIntegrationConfig           | Multiple connections could share the same OAuth app (e.g., staging + production) |

---

## Connection Ownership Model

Connections support two credential levels:

| Level            | Who Connects        | Credential Lives In                              | Example                                           |
| ---------------- | ------------------- | ------------------------------------------------ | ------------------------------------------------- |
| **Shared (org)** | App admin           | `IntegrationCredential` on Connection (existing) | IT admin connects company Slack bot for all users |
| **Per-user**     | Individual end-user | `AppUserCredential` under Connection (new)       | Sarah connects her personal Gmail                 |

When invoking an action:

1. If `externalUserId` provided → look for that user's `AppUserCredential` under the Connection
2. If no user credential found → fall back to the Connection's shared credential (bot token)
3. If no shared credential → error

---

## New & Updated Data Models

### New: App

A consuming application with its own API key.

```prisma
enum AppStatus {
  active
  disabled
}

model App {
  id          String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId    String    @map("tenant_id") @db.Uuid
  name        String    @db.VarChar(255)
  slug        String    @db.VarChar(100)
  description String?   @db.Text
  apiKeyHash  String    @unique @map("api_key_hash") @db.VarChar(255)
  apiKeyIndex String    @unique @map("api_key_index") @db.VarChar(64)
  status      AppStatus @default(active)
  metadata    Json      @default("{}")
  createdAt   DateTime  @default(now()) @map("created_at")
  updatedAt   DateTime  @updatedAt @map("updated_at")

  tenant                Tenant                  @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  integrationConfigs    AppIntegrationConfig[]
  connections           Connection[]            @relation("AppConnections")
  appUsers              AppUser[]
  connectSessions       ConnectSession[]

  @@unique([tenantId, slug])
  @@index([tenantId])
  @@map("apps")
}
```

`metadata` supports branding for the hosted connect page:

- `metadata.branding.logoUrl` — shown on the connect page
- `metadata.branding.appName` — "Connect to Slack for {appName}"
- `metadata.branding.accentColor` — primary button color
- `metadata.branding.privacyUrl` — link shown on connect page

### New: AppIntegrationConfig

Per-app OAuth app registration for each integration. This is where the developer's registered app credentials live (the `client_id`/`client_secret` that went through CASA review).

```prisma
model AppIntegrationConfig {
  id                    String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  appId                 String   @map("app_id") @db.Uuid
  integrationId         String   @map("integration_id") @db.Uuid
  encryptedClientId     Bytes?   @map("encrypted_client_id")
  encryptedClientSecret Bytes?   @map("encrypted_client_secret")
  scopes                String[] @default([])
  metadata              Json     @default("{}")
  createdAt             DateTime @default(now()) @map("created_at")
  updatedAt             DateTime @updatedAt @map("updated_at")

  app         App         @relation(fields: [appId], references: [id], onDelete: Cascade)
  integration Integration @relation(fields: [integrationId], references: [id], onDelete: Cascade)

  @@unique([appId, integrationId])
  @@index([appId])
  @@map("app_integration_configs")
}
```

### New: AppUser

Represents an end-user within a consuming app. Waygate does **not** authenticate end-users — the consuming app owns that. Waygate simply tracks user identity for credential scoping.

```prisma
model AppUser {
  id          String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  appId       String   @map("app_id") @db.Uuid
  externalId  String   @map("external_id") @db.VarChar(255)
  displayName String?  @map("display_name") @db.VarChar(255)
  email       String?  @db.VarChar(255)
  metadata    Json     @default("{}")
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")

  app                 App                 @relation(fields: [appId], references: [id], onDelete: Cascade)
  userCredentials     AppUserCredential[]
  connectSessions     ConnectSession[]

  @@unique([appId, externalId])
  @@index([appId])
  @@map("app_users")
}
```

Key design choices:

- `externalId` is the consuming app's user ID (string to accommodate UUIDs, integers, emails, etc.)
- AppUsers are created lazily — first time a connect session references a new `externalId`, the record is created
- No password/auth — Waygate trusts the consuming app's `wg_app_` key as proof of user identity

### New: AppUserCredential

**The core addition.** End-user tokens stored as children of a Connection. This is what makes the hierarchy work — the Connection is the app-level parent, and these are the per-user tokens issued under the app's OAuth registration.

```prisma
model AppUserCredential {
  id                    String           @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  connectionId          String           @map("connection_id") @db.Uuid
  appUserId             String           @map("app_user_id") @db.Uuid
  credentialType        CredentialType   @map("credential_type")
  encryptedData         Bytes            @map("encrypted_data")
  expiresAt             DateTime?        @map("expires_at")
  encryptedRefreshToken Bytes?           @map("encrypted_refresh_token")
  scopes                String[]         @default([])
  status                CredentialStatus @default(active)
  createdAt             DateTime         @default(now()) @map("created_at")
  updatedAt             DateTime         @updatedAt @map("updated_at")

  connection Connection @relation(fields: [connectionId], references: [id], onDelete: Cascade)
  appUser    AppUser    @relation(fields: [appUserId], references: [id], onDelete: Cascade)

  // Reference data synced using this credential
  referenceData     ReferenceData[]
  referenceSyncJobs ReferenceSyncJob[]

  @@unique([connectionId, appUserId])
  @@index([connectionId])
  @@index([appUserId])
  @@index([expiresAt])
  @@index([status])
  @@map("app_user_credentials")
}
```

Key design choices:

- One credential per user per connection (unique constraint on `connectionId + appUserId`)
- Same encryption as `IntegrationCredential` (AES-256-GCM)
- Same status lifecycle (`active`, `expired`, `revoked`, `needs_reauth`)
- Cascading delete — if the Connection is deleted, all user credentials under it are deleted
- If the AppUser is deleted, their credentials are deleted

### New: ConnectSession

Short-lived session for the embeddable connect flow. The consuming app creates one server-side, then redirects or embeds the connect URL for the end-user.

```prisma
enum ConnectSessionStatus {
  pending
  completed
  expired
  failed
}

model ConnectSession {
  id              String               @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  appId           String               @map("app_id") @db.Uuid
  appUserId       String               @map("app_user_id") @db.Uuid
  integrationId   String               @map("integration_id") @db.Uuid
  connectionId    String?              @map("connection_id") @db.Uuid
  token           String               @unique @db.VarChar(255)
  redirectUrl     String?              @map("redirect_url") @db.Text
  status          ConnectSessionStatus @default(pending)
  expiresAt       DateTime             @map("expires_at")
  completedAt     DateTime?            @map("completed_at")
  errorMessage    String?              @map("error_message") @db.Text
  metadata        Json                 @default("{}")
  createdAt       DateTime             @default(now()) @map("created_at")

  app         App         @relation(fields: [appId], references: [id], onDelete: Cascade)
  appUser     AppUser     @relation(fields: [appUserId], references: [id], onDelete: Cascade)
  integration Integration @relation(fields: [integrationId], references: [id], onDelete: Cascade)
  connection  Connection? @relation(fields: [connectionId], references: [id])

  @@index([token])
  @@index([appId])
  @@index([expiresAt])
  @@map("connect_sessions")
}
```

Key design choices:

- `token` is a cryptographic random string (`wg_cs_<32 hex chars>`) — short-lived (30 min default), single-use
- `connectionId` is set on completion — links to the Connection the credential was stored under
- Sessions are DB-backed (not in-memory) for multi-instance safety

### Updated: Connection

Add optional `appId` to scope connections to an App. Connection stays as the app-level entity — no `appUserId` here (that lives on `AppUserCredential`).

```prisma
// Add to Connection model:
appId       String?  @map("app_id") @db.Uuid

app              App?                @relation("AppConnections", fields: [appId], references: [id], onDelete: SetNull)
userCredentials  AppUserCredential[]
connectSessions  ConnectSession[]
```

### Updated: RequestLog

Add app and user context for audit trails.

```prisma
// Add to RequestLog model:
appId       String?  @map("app_id") @db.Uuid
appUserId   String?  @map("app_user_id") @db.Uuid
```

### Updated: Tenant

Add `waygateApiKeyIndex` for O(1) lookup (same pattern as App).

```prisma
// Add to Tenant model:
waygateApiKeyIndex String? @unique @map("waygate_api_key_index") @db.VarChar(64)
apps               App[]
```

### Updated: ReferenceData

Add optional `appUserCredentialId` to scope synced data to a specific end-user's credential. Configuration (what to sync) stays at Connection level; actual data is per-credential.

```prisma
// Add to ReferenceData model:
appUserCredentialId String? @map("app_user_credential_id") @db.Uuid

appUserCredential AppUserCredential? @relation(fields: [appUserCredentialId], references: [id], onDelete: Cascade)

// Update unique constraint:
// FROM: @@unique([integrationId, connectionId, dataType, externalId])
// TO:   @@unique([integrationId, connectionId, appUserCredentialId, dataType, externalId])
```

### Updated: ReferenceSyncJob

Add optional `appUserCredentialId` so sync jobs run per-credential.

```prisma
// Add to ReferenceSyncJob model:
appUserCredentialId String? @map("app_user_credential_id") @db.Uuid

appUserCredential AppUserCredential? @relation(fields: [appUserCredentialId], references: [id], onDelete: Cascade)
```

### Updated: Integration

Add relations to new models.

```prisma
// Add to Integration model:
appIntegrationConfigs AppIntegrationConfig[]
connectSessions       ConnectSession[]
```

Apply with `prisma db push`.

---

## End-to-End Flows

### Flow 1: Developer Setup

```
Developer "Derek" (Waygate Tenant, authenticated with wg_live_ key)

1. Create App "DerekApp"
   POST /api/v1/apps
   { "name": "DerekApp", "slug": "derek-app" }
   → { "app": { ... }, "apiKey": "wg_app_abc123..." }   ← shown once

2. Register DerekApp's Slack App credentials
   PUT /api/v1/apps/{appId}/integrations/{slackId}/config
   { "clientId": "derek-app-slack-client", "clientSecret": "...", "scopes": ["chat:write", "users:read"] }

3. Ensure a Connection exists for this app + integration
   (auto-created or manually via POST /api/v1/integrations/{slackId}/connections)
   The Connection is linked to the App via appId.

4. Share wg_app_abc123... with DerekApp's backend
```

### Flow 2: End-User Connects (Personal Account)

```
End-user "Sarah" using DerekApp, wants to connect her Slack

1. DerekApp backend creates a connect session:
   POST /api/v1/connect/sessions
   Authorization: Bearer wg_app_abc123...
   {
     "externalUserId": "user_sarah_123",
     "integrationSlug": "slack",
     "redirectUrl": "https://derek-app.com/settings/connected",
     "user": { "displayName": "Sarah Smith", "email": "sarah@example.com" }
   }
   → {
       "sessionId": "...",
       "connectUrl": "https://waygate.dev/connect/wg_cs_abc...",
       "token": "wg_cs_abc...",
       "expiresAt": "..."
     }

2. DerekApp frontend redirects Sarah (or opens popup):
   window.open(connectUrl, 'waygate-connect', 'width=600,height=700')

3. Waygate hosted page at /connect/wg_cs_abc...
   → Shows: "DerekApp wants to connect your Slack account"
   → Shows: requested scopes in plain language
   → Sarah clicks "Connect" → redirected to Slack OAuth
   → Consent screen says "DerekApp wants to access your Slack" (using DerekApp's registered app)
   → Sarah approves → callback to Waygate

4. Waygate stores Sarah's token:
   → Finds the App's Connection for this integration
   → Creates AppUserCredential(connectionId, appUserId=sarah, encryptedData=sarah's token)
   → Marks ConnectSession as completed
   → Redirects to: https://derek-app.com/settings/connected?session_id=xxx&status=success

5. DerekApp backend verifies:
   GET /api/v1/connect/sessions/{sessionId}
   → { "status": "completed", "connectionId": "..." }
```

### Flow 3: Admin Connects Shared Account (Org-Wide)

```
Admin "Bob" wants to connect a shared Slack bot for all DerekApp users

1. Bob connects via the Connection UI (or programmatically):
   POST /api/v1/connections/{connectionId}/connect
   → Standard OAuth flow
   → Token stored as IntegrationCredential on the Connection (existing model)
   → This is the "shared credential" — used when no user-specific credential exists

2. Any DerekApp user's action invocations can fall back to this shared credential
```

### Flow 4: Action Invocation with User Context

```
DerekApp backend sends a Slack message on behalf of Sarah:

POST /api/v1/tools/invoke
Authorization: Bearer wg_app_abc123...
{
  "tool": "slack/send-message",
  "input": { "channel": "#general", "text": "Hello from Sarah" },
  "options": { "externalUserId": "user_sarah_123" }
}

Resolution chain:
1. wg_app_ key → resolve App "DerekApp" + Tenant
2. Find App's Connection for this integration (Slack)
3. externalUserId → resolve AppUser "sarah"
4. Look for AppUserCredential(connectionId, appUserId=sarah)
5. Found → decrypt Sarah's personal Slack token
6. Invoke Slack API with Sarah's token

If Sarah has no personal credential:
4. No AppUserCredential found for sarah
5. Fall back to Connection's shared IntegrationCredential (bot token)
6. Invoke Slack API with bot token
```

### Flow 5: Credential Resolution Priority

```
resolveCredential(tenantId, integrationId, connectionId?, appId?, externalUserId?)

Priority:
1. Explicit connectionId + externalUserId → AppUserCredential for that user under that connection
2. Explicit connectionId, no user          → Connection's shared IntegrationCredential
3. appId + externalUserId                  → Find app's connection, then user's credential
4. appId, no user                          → Find app's connection, then shared credential
5. No app context                          → Tenant default connection + shared credential (legacy)

This preserves full backward compatibility with existing wg_live_ key flows.
```

---

## Rate Limit Fairness

**The problem:** When all end-users share DerekApp's registered Slack App, they share the same rate limits from Slack (e.g., 1000 requests/minute for the app). One heavy user could consume the entire budget and starve everyone else.

**Where rate limits apply:**

- External providers (Slack, Google, etc.) impose rate limits per OAuth app (`client_id`)
- These limits apply to the _app registration_, not to individual user tokens
- This naturally maps to the Connection level (one Connection = one app's link to an integration)

**Approach: Per-user fair share with burst allowance**

Track request counts per `(connectionId, appUserId)` using a sliding window. Each user gets a _fair share_ of the Connection's total rate budget, with unused capacity available for burst:

| Concept          | How it works                                                                          |
| ---------------- | ------------------------------------------------------------------------------------- |
| **Total budget** | The Connection's rate limit from the provider (e.g., 1000 req/min)                    |
| **Fair share**   | Total budget / number of active users in the current window                           |
| **Burst**        | If other users are idle, a single user can use their unused capacity                  |
| **Throttling**   | When a user exceeds fair share AND the total budget is near capacity, queue or reject |

**Example:**

- Connection rate limit: 1000 req/min
- 10 active users → each gets ~100 req/min as fair share
- If only 2 users are active → each can burst up to ~500 req/min
- If User A is at 400 req/min and User B needs capacity → User A gets throttled back to fair share

**Implementation:** Track per-user sliding window counters (Redis or in-memory for MVP). The gateway service checks before executing and returns a `429` with `Retry-After` header if the user's share is exhausted.

**What developers see:** Rate limit status per-connection in the UI, with a breakdown showing which users are consuming the most. Alerts when the connection approaches its total limit.

---

## Embeddable Connect Experience

### Tier 1: Hosted Connect Page (V2 — this feature)

Waygate hosts a connect page at `/connect/[token]` that handles the full OAuth flow. Developers redirect users there or open it in a popup.

**Page behavior:**

- Validates token, shows integration name + icon + requested scopes
- "Connect" button initiates OAuth using the App's credentials (from `AppIntegrationConfig`)
- On success: redirects to `redirectUrl` with `?session_id=xxx&status=success`
- On failure: redirects with `?session_id=xxx&status=failed&error=description`
- Expired tokens show a clear "session expired" message

**Customization via App metadata:**

- `app.metadata.branding.logoUrl` — shown on the connect page
- `app.metadata.branding.appName` — displayed as "Connect to {integration} for {appName}"
- `app.metadata.branding.accentColor` — primary button color
- `app.metadata.branding.privacyUrl` — link shown on connect page

### Tier 2: JavaScript SDK (V2.5 — future)

```typescript
// React
import { WaygateConnect } from '@waygate/react';

<WaygateConnect
  token={connectSessionToken}
  onSuccess={(result) => { /* { connectionId, integrationSlug } */ }}
  onError={(error) => { /* { code, message } */ }}
  onClose={() => { /* user closed without connecting */ }}
  appearance={{ theme: 'light', accentColor: '#7C3AED' }}
/>

// Vanilla JS
const wg = WaygateConnect.init({ token, onSuccess, onError });
wg.open(); // popup
```

### Tier 3: Pre-Built Integration Management Component (V3 — future)

```typescript
import { WaygateIntegrations } from '@waygate/react';

<WaygateIntegrations
  appKey="wg_app_abc..."
  userId="user_sarah_123"
  integrations={['gsuite', 'slack', 'github']}
  onConnect={(integration, connection) => { ... }}
  onDisconnect={(integration) => { ... }}
/>
```

Shows connected status, connect/disconnect buttons, last sync time, re-auth prompts. Not in scope for V2 but influences API design.

---

## API Endpoints

### Developer-Facing (authenticated with `wg_live_` tenant key)

| Method | Endpoint                                              | Purpose                                        |
| ------ | ----------------------------------------------------- | ---------------------------------------------- |
| POST   | `/api/v1/apps`                                        | Create app (returns `wg_app_` key once)        |
| GET    | `/api/v1/apps`                                        | List apps                                      |
| GET    | `/api/v1/apps/:id`                                    | Get app details                                |
| PATCH  | `/api/v1/apps/:id`                                    | Update app                                     |
| DELETE | `/api/v1/apps/:id`                                    | Delete app                                     |
| POST   | `/api/v1/apps/:id/api-key/regenerate`                 | Regenerate app key                             |
| GET    | `/api/v1/apps/:id/integrations/:integrationId/config` | Get integration config                         |
| PUT    | `/api/v1/apps/:id/integrations/:integrationId/config` | Set integration config (OAuth app credentials) |
| DELETE | `/api/v1/apps/:id/integrations/:integrationId/config` | Remove integration config                      |

### App-Facing (authenticated with `wg_app_` app key)

| Method | Endpoint                                                                    | Purpose                                       |
| ------ | --------------------------------------------------------------------------- | --------------------------------------------- |
| POST   | `/api/v1/connect/sessions`                                                  | Create a connect session for an end-user      |
| GET    | `/api/v1/connect/sessions/:id`                                              | Check connect session status                  |
| GET    | `/api/v1/connect/users/:externalUserId/connections`                         | List a user's active connections              |
| DELETE | `/api/v1/connect/users/:externalUserId/connections/:connectionId`           | Disconnect (revoke user's credential)         |
| POST   | `/api/v1/connect/users/:externalUserId/connections/:connectionId/reconnect` | Create re-auth session for expired credential |

### Hosted Page (public, token-validated)

| Method | Endpoint          | Purpose                                               |
| ------ | ----------------- | ----------------------------------------------------- |
| GET    | `/connect/:token` | Hosted connect page (Next.js page, no API key needed) |

---

## Downstream Impact on Existing Features

### Gateway Service — MUST UPDATE

The gateway is the critical path. Changes needed:

- **Credential resolution**: After resolving a Connection, check for `AppUserCredential` if `externalUserId` is provided. Fall back to Connection's shared `IntegrationCredential` if no user credential exists.
- **Auth context**: The `wg_app_` key resolves to `{ tenant, app, keyType: 'app' }`. The `externalUserId` from options resolves to an `AppUser`.
- **Request logging**: Include `appId` and `appUserId` in `RequestLog` for user-scoped audit trails.
- **Existing behavior preserved**: `wg_live_` key flows work exactly as before. `connectionId` parameter still wins if explicitly provided.

### Health Checks — MUST UPDATE

- **Connection-level checks stay the same**: Connectivity checks (is the API reachable?) and full scans (do all actions work?) remain at the Connection level. These test the integration itself, not individual user tokens.
- **Credential checks need a new tier**: Add a "user credential" health check tier that monitors `AppUserCredential.expiresAt` and flags credentials approaching expiration. This runs as a batch job scanning for `expiresAt < now + buffer`.
- **Aggregation**: Connection health status reflects the _worst_ status across its shared credential and user credentials. If 5 out of 100 user tokens have expired, the Connection is `degraded`, not `unhealthy`.

### Token Refresh — MUST UPDATE

- Must refresh `AppUserCredential` tokens in addition to `IntegrationCredential` tokens.
- Same mechanism: background job checks `expiresAt`, refreshes before expiry using the app's `client_secret` from `AppIntegrationConfig`.
- If refresh fails, mark the `AppUserCredential` as `needs_reauth` (the user will need to go through the connect flow again).

### Credential Service — MUST UPDATE

- New functions: `getDecryptedUserCredential(connectionId, appUserId)`, `storeUserCredential(connectionId, appUserId, data)`, `revokeUserCredential(id)`.
- Same encryption/decryption as existing `IntegrationCredential`.
- Token refresh uses the same `updateOAuth2Tokens` pattern.

### Field Mappings — NO CHANGE

Field mappings stay at the Connection level. All end-users under a Connection share the same data transformation rules. This is correct — field mappings are about the API schema, not about who's calling.

### Reference Data — MUST UPDATE

Reference data sync has two layers that must be separated:

1. **Sync configuration** (what to sync, how often, which data types) stays at the **Connection level**. The developer configures this once — "sync users and channels every 6 hours."

2. **Synced data** must be scoped to the **credential that fetched it**. Each end-user may be in a different workspace with different channels, users, teams, etc.

```
Connection: "DerekApp Slack"
├── Sync Config: [users, channels] every 6 hours      ← Connection level
│
├── Sarah's credential → Sarah's workspace
│   ├── Users: [Alice, Bob, Carol]                     ← scoped to Sarah's credential
│   └── Channels: [#sales, #marketing]
│
├── Ken's credential → Ken's workspace
│   ├── Users: [Charlie, Diana, Eve]                   ← scoped to Ken's credential
│   └── Channels: [#engineering, #ops]
│
└── Shared bot credential → DerekApp's own workspace
    ├── Users: [Waygate Bot]                           ← scoped to shared credential
    └── Channels: [#notifications]
```

**Model changes:**

- Add optional `appUserCredentialId` to `ReferenceData` and `ReferenceSyncJob`
- Unique constraint becomes: `(integrationId, connectionId, appUserCredentialId, dataType, externalId)`
- When `appUserCredentialId` is null: data belongs to the Connection's shared credential (existing behavior)
- When set: data belongs to that specific end-user's credential

**Sync execution:**

- Sync jobs run per-credential (one job per user credential + one for the shared credential)
- Each job uses the appropriate token to fetch data from the external API
- The `buildReferenceDataContext()` function in the gateway resolves reference data using the same credential that will execute the action — if invoking as Sarah, use Sarah's reference data

**Scale consideration:** If 1000 users each need a reference data sync, that's 1000 sync jobs. Sync scheduling should stagger these to avoid overwhelming the external API's rate limits. The rate limit fairness system (Phase D) applies here too.

### Variables — NO CHANGE (for now)

Variables stay at the Connection level. Could add `appUserId` scoping in the future for per-user defaults, but not needed for V2.

### Auto-Maintenance — NO CHANGE

Maintenance proposals are per-integration. End-user auth doesn't affect schema or action definitions.

### Schema Drift Detection — NO CHANGE

Drift detection is per-integration. Different users don't cause different schemas.

### Pipelines — MINOR UPDATE

Pipeline step invocation could optionally pass `externalUserId` through to the gateway. This would allow a pipeline to run actions "as" a specific end-user. Not blocking for V2 — pipelines currently use the Connection's shared credential, which continues to work.

### Agentic Tools / Composite Tools — MINOR UPDATE

Both already support `connectionId` passthrough. Adding `externalUserId` passthrough follows the same pattern — thread it through options to the gateway. Not blocking for V2.

---

## Re-Auth Notification (Future Enhancement)

When an end-user's token expires and can't be refreshed, the consuming app needs to know so it can prompt the user to reconnect. Two approaches:

**Option A: Webhook (recommended for V2.5)**

```
App.metadata.webhookUrl → POST with:
{
  "event": "credential.needs_reauth",
  "connectionId": "...",
  "appUserId": "...",
  "externalUserId": "user_sarah_123",
  "integrationSlug": "slack",
  "reason": "refresh_token_expired"
}
```

**Option B: Polling (available immediately)**

```
GET /api/v1/connect/users/user_sarah_123/connections
→ Returns connection status including credential health
→ Consuming app polls periodically and prompts users with expired credentials
```

The V2 implementation supports Option B. Option A (webhooks) is a natural follow-up.

---

## Backward Compatibility

- `wg_live_` tenant keys work exactly as before
- Connections without `appId` resolve via existing tenant-level defaults
- OAuth flow without app context uses Integration-level `authConfig` as before
- No migration of existing data required — all new fields are nullable/additive
- Existing API endpoints unchanged — new endpoints are additive
- `options.externalUserId` is optional in tool invocation — omitting it uses the existing resolution chain
- The Connection UI developers see today continues to work identically

---

## Implementation Tasks

### Phase A: Foundation — App Entity & Multi-Key Auth

#### Task 1: Database Schema

**Files:** `prisma/schema.prisma`

- Add `AppStatus` enum
- Add `App` model with all fields, indexes, and relations
- Add `AppIntegrationConfig` model
- Add `AppUser` model
- Add `AppUserCredential` model with `connectionId` + `appUserId` unique constraint
- Add `ConnectSession` model with `ConnectSessionStatus` enum
- Add `appId` to `Connection` model with relation
- Add `appId`, `appUserId` to `RequestLog` model
- Add `waygateApiKeyIndex` to `Tenant` model
- Add relation additions to `Integration`
- Run `prisma db push` and `prisma generate`

#### Task 2: API Key Module — Dual Prefix Support

**Files:** `src/lib/modules/auth/api-key.ts`

- Add `APP_KEY_PREFIX = 'wg_app_'` alongside existing `KEY_PREFIX = 'wg_live_'`
- Add `CONNECT_SESSION_PREFIX = 'wg_cs_'`
- Add `computeKeyIndex(key: string): string` — SHA-256 hex for O(1) DB lookup
- Add `generateAppApiKey(): Promise<{ key: string; hash: string; index: string }>`
- Add `generateConnectSessionToken(): string` — cryptographic random with `wg_cs_` prefix
- Add `getKeyType(key: string): 'tenant' | 'app' | null`
- Update `isValidKeyFormat()` and `maskApiKey()` for both prefixes

#### Task 3: Apps Module — Errors, Schemas, Repository, Service

**Files:** `src/lib/modules/apps/`

- **Errors:** `AppError`, `AppNotFoundError`, `AppSlugConflictError`, `AppIntegrationConfigError`
- **Schemas:** Zod schemas for create/update app, integration config CRUD, list params, response types
- **Repository:** `createApp()`, `findById()`, `findByTenantId()`, `updateApp()`, `deleteApp()`, `findAppByApiKeyIndex()`, integration config CRUD
- **Service:** `createApp()` (generates key, stores hash+index, returns `{ app, apiKey }`), `listApps()`, `getApp()`, `updateApp()`, `deleteApp()`, `regenerateAppKey()`, `setIntegrationConfig()`, `getIntegrationConfig()`, `deleteIntegrationConfig()`

#### Task 4: Auth Middleware — Dual Key Resolution

**Files:** `src/lib/api/middleware/auth.ts`

- Extend `AuthContext` with optional `app` and `keyType` fields
- Replace `findTenantByApiKey()` with `resolveAuthContext()`:
  - `wg_app_` prefix: O(1) lookup via `findAppByApiKeyIndex`, bcrypt verify, return `{ tenant: app.tenant, app, keyType: 'app' }`
  - `wg_live_` prefix: O(1) via `waygateApiKeyIndex` if populated, else existing fallback, return `{ tenant, keyType: 'tenant' }`
- Backward compatible — existing handlers that destructure `{ tenant }` still work

### Phase B: End-User Identity & Connect Flow

#### Task 5: AppUser Module

**Files:** `src/lib/modules/app-users/`

- **Schemas:** `CreateAppUserSchema`, `AppUserResponseSchema`, `ListAppUsersParamsSchema`
- **Repository:** `findOrCreate(appId, externalId, displayName?, email?)`, `findByExternalId(appId, externalId)`, `findById()`, `listByAppId()`, `updateAppUser()`, `deleteAppUser()`
- **Service:** `resolveAppUser(appId, externalId, userData?)` — find-or-create pattern (lazy creation), `listAppUsers()`, `getAppUser()`, `deleteAppUser()`

#### Task 6: AppUserCredential Module

**Files:** `src/lib/modules/app-user-credentials/`

- **Schemas:** `AppUserCredentialResponseSchema`, `ListUserCredentialsParamsSchema`
- **Repository:** `findByConnectionAndUser(connectionId, appUserId)`, `create(connectionId, appUserId, data)`, `update(id, data)`, `revoke(id)`, `findExpiringCredentials(bufferMinutes)`
- **Service:** `storeUserCredential(connectionId, appUserId, tokenData)`, `getDecryptedUserCredential(connectionId, appUserId)`, `revokeUserCredential(id)`, `refreshUserCredential(id)`
- Same encryption as existing `IntegrationCredential` (AES-256-GCM)

#### Task 7: Connect Session Module

**Files:** `src/lib/modules/connect-sessions/`

- **Schemas:** `CreateConnectSessionSchema` (validates: `externalUserId`, `integrationSlug`, `redirectUrl?`, `user?: { displayName?, email? }`), `ConnectSessionResponseSchema`
- **Repository:** `create()`, `findByToken()`, `findById()`, `markCompleted(id, connectionId)`, `markFailed(id, errorMessage)`, `cleanupExpired()`
- **Service:**
  - `createConnectSession(appId, tenantId, input)`:
    1. Resolve integration by slug
    2. Find-or-create AppUser from `externalUserId` + optional user data
    3. Find (or create) the App's Connection for this integration
    4. Generate `wg_cs_` token
    5. Create ConnectSession record (expires in 30 min)
    6. Build `connectUrl = ${APP_URL}/connect/${token}`
    7. Return `{ sessionId, connectUrl, token, expiresAt }`
  - `validateSession(token)`: Find by token, check not expired/used, return session with relations
  - `completeSession(token, connectionId)`: Mark completed, set connectionId
  - `failSession(token, error)`: Mark failed with error message

#### Task 8: OAuth Flow — App-Scoped Credentials

**Files:** `src/lib/modules/auth/auth.service.ts`

- In `initiateOAuthConnection()`:
  - Accept optional `appId` and `connectSessionToken` parameters
  - When `appId` is provided: look up `AppIntegrationConfig(appId, integrationId)`, decrypt and use the app's OAuth client credentials
  - Fall back to Integration-level `authConfig` if no App config
  - Store `appId`, `appUserId`, `connectSessionToken` in OAuth state
- In `handleOAuthCallback()`:
  - Retrieve app context from stored state
  - Use same credential selection logic for token exchange (app's client_secret)
  - If `appUserId` present: store as `AppUserCredential` under the Connection
  - If no `appUserId`: store as `IntegrationCredential` on the Connection (shared/org credential)
  - If `connectSessionToken` present: call `completeSession()` to mark the connect session done
- **Migrate OAuth state to DB**: Current in-memory `oauthStateStore` breaks in multi-instance deployments. The ConnectSession record can double as state storage for the connect flow.

### Phase C: Gateway & Credential Resolution Updates

#### Task 9: Credential Resolution — User-Aware

**Files:** `src/lib/modules/gateway/gateway.service.ts`, `src/lib/modules/credentials/credential.service.ts`

- Add `resolveCredential()` function with the priority chain:
  1. `externalUserId` + resolved Connection → `AppUserCredential` lookup
  2. No user context → Connection's shared `IntegrationCredential` (existing behavior)
- Update `invokeAction()` to accept `externalUserId` in options
- When `wg_app_` key is used: resolve App, find App's Connection for the integration, then resolve credential with user context
- Update request logging to include `appId` and `appUserId`

#### Task 10: Token Refresh — User Credentials

**Files:** `src/lib/modules/credentials/token-refresh.service.ts`

- Extend background refresh job to also scan `AppUserCredential` records
- Same logic: find credentials with `expiresAt < now + buffer`, refresh using the app's `client_secret` from `AppIntegrationConfig`
- On refresh failure: mark `AppUserCredential` as `needs_reauth`

#### Task 11: Health Checks — User Credential Tier

**Files:** `src/lib/modules/health-checks/`

- Add credential health scan for `AppUserCredential` records (check `expiresAt`, `status`)
- Aggregate into Connection health: if >10% of user credentials are expired/needs_reauth, Connection is `degraded`
- Existing connectivity and full-scan checks unchanged (they test the API, not individual users)

#### Task 12: Reference Data — Per-Credential Scoping

**Files:** `src/lib/modules/reference-data/`

- Update `ReferenceData` and `ReferenceSyncJob` models with optional `appUserCredentialId`
- Update unique constraint on `ReferenceData` to include `appUserCredentialId`
- Update sync job creation: when syncing for a user credential, pass the credential ID so the job uses the user's token and stores data scoped to that credential
- Update `buildReferenceDataContext()` in the gateway: when resolving reference data for an action, use the same credential scope that will execute the action (if invoking as Sarah, return Sarah's reference data)
- Sync scheduling: stagger per-user sync jobs to respect the Connection's rate limits. Don't sync all 1000 users simultaneously
- When `appUserCredentialId` is null: existing behavior (data belongs to the Connection's shared credential)

### Phase D: Rate Limit Fairness

#### Task 13: Per-User Rate Tracking

**Files:** `src/lib/modules/gateway/rate-limiter.ts` (new)

- Track per-user request counts using sliding window counters (in-memory for MVP, Redis for production)
- Before executing an action: check user's count against fair share of Connection's rate budget
- If exceeded and total budget near capacity: return 429 with `Retry-After` header
- If total budget has spare capacity: allow burst
- Rate budget per Connection stored in `Connection.metadata.rateLimits` or derived from `AppIntegrationConfig`

### Phase E: API Routes

#### Task 14: App Management Routes (Developer-Facing)

**Files:** `src/app/api/v1/apps/`

- `POST /api/v1/apps` — Create app (returns key once)
- `GET /api/v1/apps` — List apps
- `GET /api/v1/apps/:id` — Get app
- `PATCH /api/v1/apps/:id` — Update app
- `DELETE /api/v1/apps/:id` — Delete app
- `POST /api/v1/apps/:id/api-key/regenerate` — Regenerate key
- `GET /api/v1/apps/:id/integrations/:integrationId/config` — Get integration config
- `PUT /api/v1/apps/:id/integrations/:integrationId/config` — Set integration config
- `DELETE /api/v1/apps/:id/integrations/:integrationId/config` — Remove integration config

All protected by `withApiAuth`. Guard: only `keyType === 'tenant'` (`wg_live_`) can manage apps.

#### Task 15: Connect Session & End-User Routes (App-Facing)

**Files:** `src/app/api/v1/connect/`

- `POST /api/v1/connect/sessions` — Create connect session (wg*app* auth)
- `GET /api/v1/connect/sessions/:id` — Get session status (wg*app* auth)
- `GET /api/v1/connect/users/:externalUserId/connections` — List user's connections (wg*app* auth)
- `DELETE /api/v1/connect/users/:externalUserId/connections/:connectionId` — Disconnect / revoke user credential (wg*app* auth)
- `POST /api/v1/connect/users/:externalUserId/connections/:connectionId/reconnect` — Create re-auth session (wg*app* auth)

Guard: only `keyType === 'app'` (`wg_app_`) can use these endpoints.

### Phase F: Hosted Connect Page & Developer UI

#### Task 16: Connect Page — UI & Flow

**Files:** `src/app/connect/[token]/page.tsx`, supporting components

- Next.js page at `/connect/[token]` (public route, no API key needed)
- On load: validate token via `validateSession(token)`
- Display:
  - App branding (logo, name) from `app.metadata.branding`
  - Integration name + icon
  - Requested scopes in plain language
  - "Connect" button
  - Privacy policy link if configured
- "Connect" click: initiates OAuth flow with app's credentials + session context
- Error states: expired session, already completed, invalid token, OAuth failure
- Success: redirect to `session.redirectUrl` with query params

#### Task 17: Apps Section in Settings

**Files:** `src/components/features/settings/`

- Add `'apps'` to `SettingsSection` type and nav
- `AppsSection`: table/card list of apps with status badges, create button
- `CreateAppDialog`: form (name, slug, description), shows API key once on success with copy + warning
- `AppDetailPanel`: app details, key management (regenerate with confirm), integration configs, user credential stats
- `AppIntegrationConfigForm`: per-integration OAuth client ID, client secret (masked), scopes
- `src/hooks/useApps.ts`: query/mutation hooks following existing pattern

#### Task 18: End-User Credential Visibility

**Files:** `src/components/features/settings/`

- In `AppDetailPanel`: tab showing end-user credential stats per integration
  - Total users connected, active, expired, needs re-auth
  - Not individual user details (those are managed via API by the consuming app)
- Connection detail panel: summary of end-user credentials under this connection
  - Count of active / expired / needs_reauth
  - "Export" button for consuming app developers to audit

---

## Test Plan

| Test File                                                     | Coverage                                                                                                         |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `tests/unit/auth/api-key.test.ts`                             | Dual prefix parsing, `getKeyType()`, `computeKeyIndex()`, `generateAppApiKey()`, `generateConnectSessionToken()` |
| `tests/unit/apps/app-service.test.ts`                         | CRUD, key regeneration, integration config encryption/decryption                                                 |
| `tests/unit/apps/app-schemas.test.ts`                         | Schema validation for all input/response types                                                                   |
| `tests/unit/app-users/app-user-service.test.ts`               | Find-or-create, CRUD, external ID uniqueness                                                                     |
| `tests/unit/app-user-credentials/credential-service.test.ts`  | Store, retrieve, decrypt, revoke, refresh user credentials                                                       |
| `tests/unit/connect-sessions/connect-session-service.test.ts` | Create, validate, complete, fail, expiration                                                                     |
| `tests/unit/gateway/credential-resolution.test.ts`            | User credential → shared credential → tenant default fallback chain                                              |
| `tests/unit/gateway/rate-limiter.test.ts`                     | Fair share calculation, burst allowance, throttling                                                              |
| `tests/unit/reference-data/user-scoped-sync.test.ts`          | Per-credential sync job creation, scoped data retrieval, `buildReferenceDataContext` with user credential        |
| `tests/unit/auth/auth-middleware.test.ts`                     | Dual key detection, app key auth, tenant key backward compat                                                     |
| `tests/unit/auth/oauth-connect-flow.test.ts`                  | App-scoped OAuth credential selection, user credential storage                                                   |
| `tests/integration/api/apps.test.ts`                          | Full CRUD, integration config management, key regeneration                                                       |
| `tests/integration/api/connect-sessions.test.ts`              | Create session → hosted page → OAuth → credential stored under connection                                        |
| `tests/integration/api/connect-users.test.ts`                 | List/disconnect/reconnect user connections                                                                       |

---

## Verification Checklist

### Phase A: App Entity

- [ ] `prisma db push` + `prisma generate` succeed
- [ ] Create App via API → receive `wg_app_` key
- [ ] Set integration config on App (OAuth client credentials)
- [ ] Existing `wg_live_` key flows unchanged
- [ ] `wg_app_` key cannot access app management endpoints (403)
- [ ] `wg_live_` key cannot access connect endpoints (403)

### Phase B: End-User Connect

- [ ] Create connect session → receive `connectUrl` + `token`
- [ ] Hosted page renders correctly with app branding
- [ ] OAuth flow uses App's credentials (from `AppIntegrationConfig`), not Integration's
- [ ] User credential stored as `AppUserCredential` under the Connection (not as a new Connection)
- [ ] Session marked completed with `connectionId`
- [ ] Redirect to `redirectUrl` with correct query params
- [ ] Expired session shows clear error on hosted page
- [ ] Re-connect for same user updates existing `AppUserCredential`

### Phase C: Gateway Resolution

- [ ] Invoke with `externalUserId` → resolves user's `AppUserCredential`
- [ ] Invoke without `externalUserId` → resolves Connection's shared credential
- [ ] Invoke with explicit `connectionId` → explicit ID wins regardless of user context
- [ ] Fallback chain: user credential → shared credential → tenant default
- [ ] Token refresh works for `AppUserCredential` records
- [ ] Health checks detect expiring user credentials

### Phase C (continued): Reference Data

- [ ] Reference data sync runs per-user-credential (not just per-connection)
- [ ] `buildReferenceDataContext()` returns data scoped to the invoking user's credential
- [ ] Shared credential reference data still works when no user context provided
- [ ] Sync jobs for multiple users are staggered to respect rate limits

### Phase D: Rate Limiting

- [ ] Per-user request counts tracked correctly
- [ ] Fair share enforced when total budget near capacity
- [ ] Burst allowed when other users are idle
- [ ] 429 response includes `Retry-After` header

### Phase E-F: API & UI

- [ ] All app management endpoints work with `wg_live_` key
- [ ] All connect endpoints work with `wg_app_` key
- [ ] User connections list/disconnect/reconnect work
- [ ] Apps section visible in settings UI
- [ ] `npm run test` passes
- [ ] `npm run build` passes
