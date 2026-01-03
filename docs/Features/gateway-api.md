# Feature: Gateway API

> **Status:** Not Started  
> **Priority:** P0  
> **Estimated Complexity:** MEDIUM  
> **Dependencies:** Authentication Framework (#3), Retry Logic & Error Handling (#4), Action Registry & Schema (#6)

---

## 1. Overview

### 1.1 User Story

> As a developer, I want a unified API to invoke any configured action, so that I have a consistent interface regardless of which integration I'm using.

### 1.2 Description

The Gateway API is the **primary interface for consuming applications**. It provides a unified REST endpoint for invoking actions across any configured integration. This feature ties together all previously built modules (auth, execution, actions, credentials) into a cohesive action invocation pipeline.

### 1.3 Key Capabilities

- **Action Invocation**: `POST /api/v1/actions/{integrationSlug}/{actionSlug}` - Execute any action
- **Request Logging**: Full audit trail of all invocations for debugging
- **Integration Health**: `GET /api/v1/integrations/{id}/health` - Check integration status
- **Unified Response Format**: Consistent JSON responses with metrics and error details

---

## 2. What Already Exists

| Component                                              | Status       | Location                                                          |
| ------------------------------------------------------ | ------------ | ----------------------------------------------------------------- |
| API Key Auth Middleware                                | ✅ Complete  | `src/lib/api/middleware/auth.ts`                                  |
| Execution Engine (retry, circuit breaker, HTTP client) | ✅ Complete  | `src/lib/modules/execution/`                                      |
| Action Service (CRUD, getActionBySlug)                 | ✅ Complete  | `src/lib/modules/actions/action.service.ts`                       |
| JSON Schema Validator                                  | ✅ Complete  | `src/lib/modules/actions/json-schema-validator.ts`                |
| Credential Service (decrypt, store)                    | ✅ Complete  | `src/lib/modules/credentials/credential.service.ts`               |
| Auth Type Handlers (bearer, apikey, basic)             | ✅ Complete  | `src/lib/modules/credentials/auth-type-handlers/`                 |
| Schema Endpoint                                        | ✅ Complete  | `src/app/api/v1/actions/[integration]/[action]/schema/route.ts`   |
| Validate Endpoint                                      | ✅ Complete  | `src/app/api/v1/actions/[integration]/[action]/validate/route.ts` |
| Request Log DB Model                                   | ✅ Complete  | `prisma/schema.prisma` (RequestLog)                               |
| Logging Module                                         | ⚠️ Stub Only | `src/lib/modules/logging/index.ts`                                |
| Integration Module                                     | ⚠️ Stub Only | `src/lib/modules/integrations/index.ts`                           |

---

## 3. What Needs to Be Built

### 3.1 Core Action Invocation Pipeline

The main `POST /api/v1/actions/{integration}/{action}` endpoint that:

1. **Authenticates** - Validate API key, extract tenant context (existing middleware)
2. **Resolves** - Look up integration and action by slugs
3. **Validates** - Validate input against action's JSON Schema
4. **Authorizes** - Verify integration belongs to tenant and is active
5. **Credentials** - Retrieve and decrypt credentials for the integration
6. **Builds Request** - Construct HTTP request with auth headers, endpoint URL
7. **Executes** - Send request via execution engine (with retry, circuit breaker)
8. **Logs** - Record request/response in audit trail
9. **Returns** - Standardized response with data and metrics

### 3.2 Request Logging Service

Complete the logging module to store and retrieve request logs:

- `createRequestLog()` - Store sanitized request/response data
- `getRequestLogs()` - Query logs with filters (tenant, integration, action, date range)
- Automatic sanitization (remove auth headers, truncate large bodies)

### 3.3 Integration Service (Basic CRUD)

Complete the integration module for basic operations needed by Gateway:

- `getIntegrationBySlug()` - Look up integration by tenant + slug
- `getIntegrationById()` - Get integration details
- `listIntegrations()` - List tenant's integrations
- `checkIntegrationHealth()` - Validate credentials and test connection

### 3.4 Health Check Endpoint

`GET /api/v1/integrations/{id}/health`:

- Verify credentials are valid and not expired
- Optionally make a test request to external API
- Return health status with details

### 3.5 Gateway Response Schemas

Standardized response types for the Gateway API:

- `GatewaySuccessResponse` - Action result with execution metrics
- `GatewayErrorResponse` - LLM-friendly errors with resolution hints

---

## 4. Implementation Tasks

### Task 1: Logging Service & Repository (30-45 min) ✅

**Files to create/modify:**

- `src/lib/modules/logging/logging.schemas.ts` - Zod schemas for logs
- `src/lib/modules/logging/logging.repository.ts` - Database operations
- `src/lib/modules/logging/logging.service.ts` - Business logic
- `src/lib/modules/logging/index.ts` - Module exports

**Acceptance Criteria:**

- [x] `createRequestLog()` stores sanitized log entries ✅
- [x] Auth headers and tokens are stripped from stored data ✅
- [x] Large request/response bodies are truncated ✅
- [x] `getRequestLogs()` supports filtering by tenant, integration, action, date range ✅

---

### Task 2: Integration Service (Basic) (30-45 min) ✅

**Files to create/modify:**

- `src/lib/modules/integrations/integration.schemas.ts` - Zod schemas
- `src/lib/modules/integrations/integration.repository.ts` - Database operations
- `src/lib/modules/integrations/integration.service.ts` - Business logic
- `src/lib/modules/integrations/index.ts` - Module exports

**Acceptance Criteria:**

- [x] `getIntegrationBySlug()` returns integration with tenant verification ✅
- [x] `getIntegrationById()` returns integration with tenant verification ✅
- [x] `listIntegrations()` returns paginated list for a tenant ✅
- [x] Service throws appropriate errors for not found / unauthorized ✅

---

### Task 3: Gateway Schemas & Types (20-30 min) ✅

**Files to create/modify:**

- `src/lib/modules/gateway/gateway.schemas.ts` - Request/response schemas
- `src/lib/modules/gateway/gateway.types.ts` - TypeScript types
- `src/lib/modules/gateway/index.ts` - Module exports

**Acceptance Criteria:**

- [x] `GatewayInvokeRequestSchema` validates action invocation input ✅
- [x] `GatewaySuccessResponseSchema` defines success response format ✅
- [x] `GatewayErrorResponseSchema` defines LLM-friendly error format ✅
- [x] Types exported for use in routes and services ✅

---

### Task 4: Gateway Service (Core Pipeline) (45-60 min) ✅

**Files to create/modify:**

- `src/lib/modules/gateway/gateway.service.ts` - Main invocation logic

**Acceptance Criteria:**

- [x] `invokeAction()` orchestrates the full pipeline: ✅
  - Resolves integration and action by slugs
  - Validates input against action's JSON Schema
  - Retrieves and applies credentials
  - Builds HTTP request from action template
  - Executes via execution engine
  - Logs the request/response
  - Returns standardized response
- [x] Handles all credential types (OAuth2, API Key, Basic, Bearer) ✅
- [x] Supports path parameter substitution in endpoint templates ✅
- [x] Passes execution metrics in response ✅

---

### Task 5: Action Invocation Endpoint (30-45 min) ✅

**Files to create/modify:**

- `src/app/api/v1/actions/[integration]/[action]/route.ts` - POST handler

**Acceptance Criteria:**

- [x] `POST /api/v1/actions/{integration}/{action}` invokes actions ✅
- [x] Request body passed to action as input ✅
- [x] Returns `GatewaySuccessResponse` on success ✅
- [x] Returns `GatewayErrorResponse` on failure with LLM-friendly hints ✅
- [x] Includes execution metrics (latency, retry count) ✅
- [x] All errors have appropriate HTTP status codes ✅

---

### Task 6: Integration Health Endpoint (30-45 min) ✅

**Files to create/modify:**

- `src/app/api/v1/integrations/[id]/health/route.ts` - GET handler
- Add `checkHealth()` method to integration service

**Acceptance Criteria:**

- [x] `GET /api/v1/integrations/{id}/health` returns health status ✅
- [x] Checks credential validity (not expired, not revoked) ✅
- [x] Returns detailed health response with: ✅
  - Overall status (healthy, degraded, unhealthy)
  - Credential status
  - Last successful request time (if available)
  - Circuit breaker status for the integration
- [ ] Optionally performs test request to external API (deferred - not critical for MVP)

---

### Task 7: Request Logs Endpoint (20-30 min) ✅

**Files to create/modify:**

- `src/app/api/v1/logs/route.ts` - GET handler

**Acceptance Criteria:**

- [x] `GET /api/v1/logs` returns paginated request logs ✅
- [x] Supports query params: `integrationId`, `actionId`, `startDate`, `endDate`, `cursor`, `limit` ✅
- [x] Only returns logs for authenticated tenant ✅
- [x] Response follows standard pagination format ✅

---

## 5. API Specification

### 5.1 Action Invocation

```
POST /api/v1/actions/{integrationSlug}/{actionSlug}
Authorization: Bearer wg_live_xxx

Request Body:
{
  // Action input matching the action's inputSchema
  "channel": "C123456",
  "message": "Hello World"
}

Success Response (200):
{
  "success": true,
  "data": {
    // Response from external API
  },
  "meta": {
    "requestId": "req_abc123",
    "timestamp": "2026-01-02T10:30:00Z",
    "execution": {
      "latencyMs": 234,
      "retryCount": 0,
      "cached": false
    }
  }
}

Error Response (4xx/5xx):
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Input validation failed",
    "details": {
      "errors": [{ "path": "/channel", "message": "Missing required field 'channel'" }]
    },
    "requestId": "req_abc123",
    "suggestedResolution": {
      "action": "RETRY_WITH_MODIFIED_INPUT",
      "description": "Add the 'channel' parameter...",
      "retryable": true
    }
  }
}
```

### 5.2 Integration Health

```
GET /api/v1/integrations/{id}/health
Authorization: Bearer wg_live_xxx

Response (200):
{
  "success": true,
  "data": {
    "status": "healthy", // healthy | degraded | unhealthy
    "credentials": {
      "status": "active",
      "expiresAt": "2026-01-10T00:00:00Z",
      "needsRefresh": false
    },
    "circuitBreaker": {
      "status": "closed", // closed | open | half_open
      "failureCount": 0
    },
    "lastSuccessfulRequest": "2026-01-02T09:15:00Z"
  }
}
```

### 5.3 Request Logs

```
GET /api/v1/logs?integrationId=xxx&limit=20&cursor=xxx
Authorization: Bearer wg_live_xxx

Response (200):
{
  "success": true,
  "data": [
    {
      "id": "log_xxx",
      "integrationId": "xxx",
      "actionId": "xxx",
      "actionSlug": "sendMessage",
      "statusCode": 200,
      "latencyMs": 234,
      "retryCount": 0,
      "error": null,
      "createdAt": "2026-01-02T10:30:00Z"
    }
  ],
  "pagination": {
    "cursor": "next_cursor",
    "hasMore": true,
    "totalCount": 150
  }
}
```

---

## 6. Error Codes

| Code                    | HTTP Status | Description                    | Suggested Action          |
| ----------------------- | ----------- | ------------------------------ | ------------------------- |
| `INTEGRATION_NOT_FOUND` | 404         | Integration slug doesn't exist | Check integration slug    |
| `ACTION_NOT_FOUND`      | 404         | Action slug doesn't exist      | Check action slug         |
| `INTEGRATION_DISABLED`  | 403         | Integration is disabled        | Enable integration        |
| `CREDENTIALS_MISSING`   | 401         | No credentials configured      | Configure credentials     |
| `CREDENTIALS_EXPIRED`   | 401         | OAuth tokens expired           | Re-authenticate           |
| `VALIDATION_ERROR`      | 400         | Input doesn't match schema     | Fix input per errors      |
| `RATE_LIMITED`          | 429         | External API rate limit        | Retry after delay         |
| `CIRCUIT_OPEN`          | 503         | Circuit breaker open           | Wait for recovery         |
| `EXTERNAL_API_ERROR`    | 502         | External API returned error    | Check external service    |
| `TIMEOUT`               | 504         | Request timed out              | Retry or increase timeout |

---

## 7. Test Plan

### Unit Tests

- Gateway service: mock execution engine, test pipeline orchestration
- Logging service: test sanitization, truncation
- Integration service: test CRUD with tenant isolation

### Integration Tests

- Full action invocation flow with test database
- Error handling for each error code
- Request logging verification
- Health check endpoint

### E2E Tests (Optional for MVP)

- Invoke action via API with real HTTP client
- Verify response format matches spec

---

## 8. Files Summary

### New Files

```
src/lib/modules/gateway/
├── gateway.schemas.ts
├── gateway.service.ts
├── gateway.types.ts
└── index.ts

src/lib/modules/logging/
├── logging.schemas.ts
├── logging.repository.ts
├── logging.service.ts
└── index.ts

src/lib/modules/integrations/
├── integration.schemas.ts
├── integration.repository.ts
├── integration.service.ts
└── index.ts

src/app/api/v1/
├── actions/[integration]/[action]/route.ts  (new POST handler)
├── integrations/[id]/health/route.ts
└── logs/route.ts
```

### Modified Files

```
src/lib/api/response.ts  (add execution metrics to response)
```

---

## 9. Definition of Done

- [x] `POST /api/v1/actions/{integration}/{action}` successfully invokes actions ✅
- [x] Input is validated against action's JSON Schema before execution ✅
- [x] All credential types (OAuth2, API Key, Basic, Bearer) work correctly ✅
- [x] Requests are logged with sanitized data ✅
- [x] Health check endpoint returns accurate integration status ✅
- [x] Request logs endpoint returns paginated logs ✅
- [x] All error scenarios return LLM-friendly error responses ✅
- [x] Execution metrics included in all responses ✅
- [x] Unit and integration tests pass with ≥80% coverage for new code ✅

### Tests Added

- `tests/unit/gateway/gateway-schemas.test.ts` - 36 tests for Gateway schema validation
- `tests/unit/logging/logging-service.test.ts` - 36 tests for logging sanitization/truncation
- `tests/integration/gateway/gateway-api.test.ts` - 15 integration tests for endpoints

---

_Created: 2026-01-02_  
_Last Updated: 2026-01-02_
