# Feature: Token Refresh Management

**Status:** ✅ Complete  
**Priority:** P0  
**Milestone:** MVP  
**Estimated Complexity:** MED  
**Dependencies:** Authentication Framework (✅ Complete)  
**Completion Date:** 2026-01-02

---

## 1. Overview

### User Story

> As a developer, I want OAuth tokens to be automatically refreshed, so that my integrations don't break when tokens expire.

### Description

Proactive token refresh system that monitors token expiration and refreshes credentials before they expire, ensuring uninterrupted API access. The system runs as a background job that periodically checks for expiring tokens and refreshes them automatically, with proper handling for refresh token rotation, concurrent refresh prevention, and failure recovery.

### Key Requirements

- [x] Track token expiration times
- [x] Proactively refresh tokens before expiration (configurable buffer, default 10 min)
- [x] Handle refresh token rotation (some providers issue new refresh tokens)
- [x] Queue refresh operations to avoid race conditions
- [x] Gracefully handle refresh failures with retry logic
- [x] Alert on persistent refresh failures (via structured logging)
- [x] Support manual token refresh trigger

### Acceptance Criteria

- [x] Given a token expiring within the buffer window, when background job runs, then token is refreshed automatically
- [x] Given a refresh token that was rotated, when refresh completes, then new refresh token is stored
- [x] Given a refresh failure, when retries exhausted, then credential is marked `needs_reauth` and error is logged

---

## 2. Technical Design

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    VERCEL CRON (every 5 min)                     │
│                              │                                   │
│                              ▼                                   │
│              POST /api/v1/internal/token-refresh                │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                     TOKEN REFRESH SERVICE                        │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  1. Query expiring credentials (next 10 min)              │  │
│  │  2. For each credential:                                   │  │
│  │     a. Acquire lock (database advisory lock)              │  │
│  │     b. Load OAuth provider for integration                │  │
│  │     c. Call provider.refreshToken(refreshToken)           │  │
│  │     d. Handle refresh token rotation                      │  │
│  │     e. Store new tokens (encrypted)                       │  │
│  │     f. Release lock                                       │  │
│  │  3. On failure: retry with backoff, mark needs_reauth     │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                      OAUTH PROVIDERS                             │
│            (Slack, Google, GitHub, Generic)                      │
│              provider.refreshToken(refreshToken)                 │
└─────────────────────────────────────────────────────────────────┘
```

### Data Flow

1. **Cron Trigger**: Vercel Cron calls internal API endpoint every 5 minutes
2. **Find Expiring**: Query credentials where `expiresAt < now() + 10 minutes` AND `status = 'active'`
3. **Lock & Refresh**: For each credential, acquire lock → refresh → update → release
4. **Handle Rotation**: If provider returns new refresh token, update stored token
5. **Retry on Failure**: Up to 3 retries with exponential backoff (1s, 2s, 4s)
6. **Mark Failed**: After exhausted retries, mark credential as `needs_reauth`

### Existing Infrastructure

The following already exists and will be leveraged:

| Component                      | Location                                            | What It Does                             |
| ------------------------------ | --------------------------------------------------- | ---------------------------------------- |
| `OAuthProvider.refreshToken()` | `src/lib/modules/auth/oauth-providers/base.ts`      | Calls provider's token endpoint          |
| `updateOAuth2Tokens()`         | `src/lib/modules/credentials/credential.service.ts` | Updates encrypted tokens                 |
| `needsRefresh()`               | `src/lib/modules/credentials/credential.service.ts` | Checks if token needs refresh            |
| `flagCredentialForReauth()`    | `src/lib/modules/credentials/credential.service.ts` | Marks credential as needs_reauth         |
| `CredentialStatus` enum        | `prisma/schema.prisma`                              | Includes `needs_reauth` status           |
| `credentials_expires_at_idx`   | `prisma/schema.prisma`                              | Index on expiresAt for efficient queries |

### New Components to Build

| Component             | Location                                               | Purpose                    |
| --------------------- | ------------------------------------------------------ | -------------------------- |
| Token Refresh Service | `src/lib/modules/credentials/token-refresh.service.ts` | Core refresh orchestration |
| Repository Methods    | `src/lib/modules/credentials/credential.repository.ts` | Query expiring credentials |
| Cron Handler          | `src/app/api/v1/internal/token-refresh/route.ts`       | Background job entry point |
| Manual Refresh API    | `src/app/api/v1/integrations/[id]/refresh/route.ts`    | Manual trigger endpoint    |
| Vercel Cron Config    | `vercel.json`                                          | Schedule configuration     |

### Locking Strategy

Use PostgreSQL advisory locks to prevent concurrent refresh of the same credential:

```typescript
// Acquire lock before refresh
await prisma.$executeRaw`SELECT pg_advisory_lock(${credentialId.hashCode()})`;

// ... perform refresh ...

// Release lock after refresh
await prisma.$executeRaw`SELECT pg_advisory_unlock(${credentialId.hashCode()})`;
```

Alternative: Use `updatedAt` as an optimistic lock - only update if `updatedAt` matches expected value.

---

## 3. Implementation Tasks

### Task 1: Add Repository Methods for Expiring Credentials (~30 min)

**File:** `src/lib/modules/credentials/credential.repository.ts`

**What to Build:**

- `findExpiringCredentials(bufferMinutes: number)` - Find OAuth2 credentials expiring within buffer
- `acquireRefreshLock(credentialId: string)` - Acquire advisory lock
- `releaseRefreshLock(credentialId: string)` - Release advisory lock
- `updateCredentialWithLock(credentialId: string, data, expectedUpdatedAt: Date)` - Optimistic lock update

**Tests:**

- Unit test for query building
- Integration test for lock acquisition/release

---

### Task 2: Create Token Refresh Service (~45 min)

**File:** `src/lib/modules/credentials/token-refresh.service.ts`

**What to Build:**

- `refreshExpiringTokens()` - Main orchestration function
- `refreshSingleCredential(credentialId: string)` - Refresh one credential with retry
- `getOAuthProviderForIntegration(integrationId: string)` - Load correct OAuth provider
- `handleRefreshResult(credentialId: string, result: OAuthTokenResponse)` - Store new tokens

**Business Logic:**

- Buffer time: 10 minutes (configurable)
- Max retries: 3
- Backoff: 1s, 2s, 4s (exponential)
- On success: Update tokens, update `expiresAt`, log event
- On failure after retries: Mark `needs_reauth`, log error

**Tests:**

- Unit tests with mocked OAuth provider
- Test retry behavior
- Test refresh token rotation handling

---

### Task 3: Create Background Job API Route (~30 min)

**File:** `src/app/api/v1/internal/token-refresh/route.ts`

**What to Build:**

- POST handler that triggers token refresh
- Verify request is from Vercel Cron (check `Authorization` header or secret)
- Return summary of refreshed/failed credentials

**Security:**

- Internal endpoint protected by secret token
- Not exposed through public API

---

### Task 4: Configure Vercel Cron (~15 min)

**File:** `vercel.json`

**What to Build:**

- Add cron configuration to run every 5 minutes
- Set appropriate timeout for the job

**Configuration:**

```json
{
  "crons": [
    {
      "path": "/api/v1/internal/token-refresh",
      "schedule": "*/5 * * * *"
    }
  ]
}
```

---

### Task 5: Add Manual Refresh API Endpoint (~30 min)

**File:** `src/app/api/v1/integrations/[id]/refresh/route.ts`

**What to Build:**

- POST endpoint to manually trigger token refresh for an integration
- Validate tenant owns the integration
- Return refresh result (success/failure)

**Use Cases:**

- Debugging token issues
- User-initiated refresh after re-authentication

---

### Task 6: Add Refresh Event Logging (~30 min)

**File:** `src/lib/modules/credentials/token-refresh.service.ts` (enhance)

**What to Build:**

- Log successful refreshes (INFO level)
- Log failed refreshes (ERROR level)
- Log refresh token rotations (INFO level)
- Include: credentialId, integrationId, tenantId, success/failure, retry count
- Never log actual tokens or secrets

**Structured Log Format:**

```typescript
{
  event: 'TOKEN_REFRESH',
  credentialId: 'xxx',
  integrationId: 'xxx',
  tenantId: 'xxx',
  status: 'success' | 'failed',
  retryCount: 0,
  rotatedRefreshToken: false,
  error?: { code: string, message: string }
}
```

---

### Task 7: Write Unit Tests (~45 min)

**File:** `tests/unit/credentials/token-refresh.test.ts`

**Test Cases:**

- `refreshExpiringTokens()` finds and refreshes expiring credentials
- `refreshSingleCredential()` handles successful refresh
- `refreshSingleCredential()` retries on transient failure
- `refreshSingleCredential()` marks needs_reauth after max retries
- Refresh token rotation is handled correctly
- Concurrent refresh prevention (lock behavior)
- No refresh attempted for non-OAuth2 credentials

---

### Task 8: Write Integration Tests (~30 min)

**File:** `tests/integration/credentials/token-refresh.test.ts`

**Test Cases:**

- Full refresh flow with mocked OAuth provider
- Database state updated correctly after refresh
- Cron endpoint returns correct summary
- Manual refresh endpoint works

---

## 4. Edge Cases

| Edge Case                            | Handling                                                          |
| ------------------------------------ | ----------------------------------------------------------------- |
| Concurrent refresh attempts          | Use database locking to prevent duplicate refreshes               |
| Expired refresh token                | Mark credential as `needs_reauth`, require user re-authentication |
| Provider outage                      | Exponential backoff with max retries, then mark `needs_reauth`    |
| No refresh token stored              | Skip credential (some OAuth flows don't provide refresh tokens)   |
| Integration deleted during refresh   | Lock acquisition fails or update fails gracefully                 |
| Multiple credentials per integration | Each credential refreshed independently                           |

---

## 5. UI/UX Notes (Future)

> **Note:** UI components are part of "Basic Configuration UI" feature, not this feature.

**Future UI Elements:**

- Token health indicator on integration status
- Manual refresh button for debugging
- Expiration timeline visualization
- Alert notification for persistent refresh failures

---

## 6. Technical Notes

- **Cron Frequency:** Every 5 minutes (Vercel Cron)
- **Buffer Time:** 10 minutes (refresh tokens expiring in next 10 min)
- **Retry Policy:** 3 attempts with exponential backoff (1s, 2s, 4s)
- **Locking:** PostgreSQL advisory locks or optimistic locking via `updatedAt`
- **Logging:** Structured JSON logs without sensitive data

---

## 7. Definition of Done

- [x] Background job runs every 5 minutes via Vercel Cron
- [x] Expiring OAuth2 tokens are automatically refreshed
- [x] Refresh token rotation is handled correctly
- [x] Failed refreshes are retried with exponential backoff (1s, 2s, 4s)
- [x] Credentials marked `needs_reauth` after max retries (3 attempts)
- [x] Manual refresh endpoint available (`POST /api/v1/integrations/:id/refresh`)
- [x] Refresh events are logged (structured JSON, no sensitive data)
- [x] Unit tests pass (17 new tests in `token-refresh.test.ts`)
- [x] Integration tests pass (12 new tests in `token-refresh-api.test.ts`)
- [x] Documentation updated

---

## 8. Related Files

| File                                                   | Purpose                            |
| ------------------------------------------------------ | ---------------------------------- |
| `src/lib/modules/credentials/credential.service.ts`    | Existing credential service        |
| `src/lib/modules/credentials/credential.repository.ts` | Existing repository                |
| `src/lib/modules/auth/oauth-providers/base.ts`         | OAuth provider with refreshToken() |
| `prisma/schema.prisma`                                 | Database schema                    |
| `vercel.json`                                          | Cron configuration                 |

---

## 9. Task Summary

| #   | Task                         | Est. Time | Dependencies |
| --- | ---------------------------- | --------- | ------------ |
| 1   | Add Repository Methods       | 30 min    | None         |
| 2   | Create Token Refresh Service | 45 min    | Task 1       |
| 3   | Create Background Job Route  | 30 min    | Task 2       |
| 4   | Configure Vercel Cron        | 15 min    | Task 3       |
| 5   | Add Manual Refresh Endpoint  | 30 min    | Task 2       |
| 6   | Add Refresh Event Logging    | 30 min    | Task 2       |
| 7   | Write Unit Tests             | 45 min    | Tasks 1-2    |
| 8   | Write Integration Tests      | 30 min    | Tasks 1-5    |

**Total Estimated Time:** ~4.5 hours

---

_Created: 2026-01-02_
