# Feature: Variable/Context System

**Milestone:** V1.1 (AI Tool Foundations)
**Status:** In Progress
**Dependencies:** Simple Tool Export, Reference Data Sync
**Priority:** P0

---

## Overview

The Variable/Context System enables dynamic context injection for runtime variables in AI tools. While Reference Data Sync handles cached entity data (users, channels) and Context Resolution handles name-to-ID mapping, this feature adds support for **developer-defined variables** that can be injected at runtime and referenced in action configurations.

### Why This Matters

When AI tools invoke Waygate actions, they often need contextual values beyond reference data:

- **Current User Context**: "Post as the logged-in user" - Tool needs current_user.id
- **Environment-Specific Values**: Different API base URLs, feature flags, or settings per environment
- **Tenant Configuration**: Custom field names, default channels, or workspace-specific settings
- **Session Context**: Request ID, correlation ID, or trace context for observability
- **Dynamic Defaults**: Values that should be auto-injected if not provided by the AI agent

Currently, developers must:

1. Hardcode values in action configurations
2. Pass all context manually with every tool invocation
3. Build custom wrapper functions to inject common values

The Variable/Context System solves this by:

1. Allowing developers to **define variables** at tenant/connection level
2. Enabling **variable references** in action templates (endpoints, headers, defaults)
3. Providing **automatic injection** of runtime context
4. Supporting **environment-specific overrides**

---

## User Stories

**As an AI application developer**, I want to define custom variables for my tenant, so that I can configure values once and have them automatically injected into all tool invocations.

**As a developer building multi-environment apps**, I want to define different variable values for dev/staging/production, so that my AI tools work correctly in each environment.

**As a developer configuring actions**, I want to reference variables in endpoint templates and default values, so that actions are dynamically configured without hardcoding.

**As an AI agent**, I want common context (like current_user) automatically injected into tool invocations, so that I don't need to pass it with every request.

---

## Requirements

### Functional Requirements

| ID    | Requirement                                                              | Priority | Notes                                  |
| ----- | ------------------------------------------------------------------------ | -------- | -------------------------------------- |
| FR-1  | Define tenant-level variables (key/value pairs)                          | MUST     | Shared across all connections          |
| FR-2  | Define connection-level variables (override tenant values)               | MUST     | Connection-specific overrides          |
| FR-3  | Support variable types: string, number, boolean, JSON object             | MUST     | Type-safe variable storage             |
| FR-4  | Reference variables in action endpoint templates using ${var.name}       | MUST     | Dynamic URL construction               |
| FR-5  | Reference variables in action header configurations                      | MUST     | Dynamic header injection               |
| FR-6  | Reference variables in action default parameter values                   | SHOULD   | Auto-populated defaults                |
| FR-7  | Support built-in runtime variables (current_user, request_id, timestamp) | MUST     | System-provided context                |
| FR-8  | Pass custom variables via tool invocation context                        | MUST     | Per-request overrides                  |
| FR-9  | Environment variable overrides (dev/staging/prod)                        | SHOULD   | Environment-aware configuration        |
| FR-10 | UI to manage tenant and connection variables                             | MUST     | CRUD interface for variable management |
| FR-11 | Validate variable references in action configurations                    | SHOULD   | Catch missing variables at config time |
| FR-12 | Support sensitive variables (encrypted storage, masked in logs)          | SHOULD   | Secure variable handling               |

### Non-Functional Requirements

| Requirement | Target                                     | Measurement                 |
| ----------- | ------------------------------------------ | --------------------------- |
| Performance | Variable resolution < 10ms                 | Latency added to invocation |
| Size        | Max 100 variables per tenant/connection    | Database constraint         |
| Caching     | Variables cached with 60s TTL              | Redis cache hit rate        |
| Security    | Sensitive variables never logged plaintext | Security audit              |

### Acceptance Criteria

- [ ] **Given** a tenant variable `api_version: "v2"`, **when** action endpoint is `/${var.api_version}/users`, **then** resolved URL is `/v2/users`
- [ ] **Given** a connection variable overriding tenant variable, **when** resolved, **then** connection value takes precedence
- [ ] **Given** a built-in variable `${current_user.id}`, **when** invoked, **then** value is injected from request context
- [ ] **Given** a missing variable reference, **when** action configured, **then** validation warning is shown
- [ ] **Given** a sensitive variable, **when** logged, **then** value is masked as `[REDACTED]`

### Out of Scope

- Expression/formula evaluation (e.g., `${var.count + 1}`)
- Cross-tenant variable sharing
- Variable versioning/history
- Secret management integration (Vault, AWS Secrets Manager)
- Complex conditional logic in variable references

---

## Technical Design

### Variable Types

```typescript
// Variable definition stored in database
interface Variable {
  id: string;
  tenantId: string;
  connectionId: string | null; // null = tenant-level, otherwise connection-specific

  key: string; // Variable name (e.g., "api_version", "default_channel")
  value: unknown; // The actual value (typed based on valueType)
  valueType: 'string' | 'number' | 'boolean' | 'json';

  sensitive: boolean; // If true, encrypt and mask in logs
  environment: string | null; // null = all environments, or "development", "staging", "production"

  description: string | null; // Human-readable description

  createdAt: Date;
  updatedAt: Date;
}

// Built-in runtime variables (system-provided)
interface RuntimeContext {
  current_user: {
    id: string | null; // ID of end-user making the request
    email: string | null;
    name: string | null;
  };
  connection: {
    id: string;
    name: string;
    workspaceId: string | null; // From OAuth/connection metadata
  };
  request: {
    id: string; // Unique request ID
    timestamp: string; // ISO timestamp
    environment: string; // Current environment
  };
}
```

### Database Schema

```prisma
// New model: Variable storage
model Variable {
  id            String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId      String   @map("tenant_id") @db.Uuid
  connectionId  String?  @map("connection_id") @db.Uuid  // null = tenant-level

  key           String                                   // Variable name
  value         Json                                     // Stored value (any type)
  valueType     VariableType @default(string)           // string, number, boolean, json

  sensitive     Boolean  @default(false)                 // Encrypt if true
  encryptedValue Bytes?  @map("encrypted_value")        // For sensitive vars
  environment   String?                                  // null = all, or specific env

  description   String?

  createdAt     DateTime @default(now()) @map("created_at")
  updatedAt     DateTime @updatedAt @map("updated_at")

  // Relations
  tenant        Tenant      @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  connection    Connection? @relation(fields: [connectionId], references: [id], onDelete: Cascade)

  // Constraints
  @@unique([tenantId, connectionId, key, environment])  // Unique per scope+key+env
  @@index([tenantId])
  @@index([connectionId])

  @@map("variables")
}

enum VariableType {
  string
  number
  boolean
  json
}
```

### Variable Reference Syntax

Variables are referenced using `${...}` syntax in action configurations:

```
${var.name}              - User-defined variable
${var.api_version}       - Example: "v2"
${var.default_channel}   - Example: "C123ABC"

${current_user.id}       - Built-in: Current user ID
${current_user.email}    - Built-in: Current user email
${current_user.name}     - Built-in: Current user name

${connection.id}         - Built-in: Connection ID
${connection.name}       - Built-in: Connection display name
${connection.workspaceId} - Built-in: Workspace/team ID from OAuth

${request.id}            - Built-in: Unique request ID
${request.timestamp}     - Built-in: ISO timestamp
${request.environment}   - Built-in: Current environment (dev/staging/prod)
```

### Variable Resolution Order

When resolving a variable reference, the system checks sources in priority order:

```
1. Request context (passed with tool invocation) - Highest priority
     ↓
2. Connection-level variables (specific to connection)
     ↓
3. Tenant-level variables (shared across connections)
     ↓
4. Built-in runtime variables (system-provided)
     ↓
5. Default value (if specified in action config)
     ↓
6. Error or null (if required/optional)
```

### Module Structure

```
src/lib/modules/variables/
├── index.ts                        # Module exports
├── variable.service.ts             # Business logic
├── variable.repository.ts          # Data access
├── variable.schemas.ts             # Zod schemas
├── variable.resolver.ts            # Variable resolution logic
├── variable.parser.ts              # Parse ${...} references from templates
├── runtime-context.ts              # Build runtime context (current_user, etc.)
└── types.ts                        # TypeScript types
```

### Variable Resolution Flow

```
┌─────────────────────────────────────────────────────────────┐
│ Action Configuration                                         │
│ endpoint: "/api/${var.api_version}/users/${current_user.id}" │
│ headers: { "X-Workspace": "${connection.workspaceId}" }      │
│ defaults: { "channel": "${var.default_channel}" }            │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ Variable Parser                                              │
│ 1. Extract all ${...} references                             │
│ 2. Categorize: var.*, current_user.*, connection.*, etc.     │
│ 3. Return list of required variables                         │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ Variable Resolver                                            │
│ 1. Build runtime context (current_user, connection, request) │
│ 2. Fetch tenant variables from cache/DB                      │
│ 3. Fetch connection variables from cache/DB                  │
│ 4. Merge with request context (override priority)            │
│ 5. Resolve each reference                                    │
│ 6. Replace ${...} with resolved values                       │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ Resolved Configuration                                       │
│ endpoint: "/api/v2/users/U123ABC"                            │
│ headers: { "X-Workspace": "T456DEF" }                        │
│ defaults: { "channel": "C789GHI" }                           │
└─────────────────────────────────────────────────────────────┘
```

### Integration with Gateway Pipeline

The variable system integrates at **Step 1.5** of the gateway pipeline (before input mapping):

```
Step 1: Resolve integration/action
  ↓
Step 1.5: Resolve variables in action config (NEW)
  - Parse ${...} references in endpoint, headers, defaults
  - Resolve variables from context + stored variables
  - Apply resolved values to action configuration
  ↓
Step 2a: Apply INPUT mapping
  ↓
Step 2b: Apply CONTEXT resolution (reference data)
  ↓
Step 3: Validate input
  ↓
... (rest of pipeline unchanged)
```

### API Endpoints

| Method | Endpoint                            | Purpose                     |
| ------ | ----------------------------------- | --------------------------- |
| GET    | `/api/v1/variables`                 | List tenant variables       |
| POST   | `/api/v1/variables`                 | Create tenant variable      |
| PATCH  | `/api/v1/variables/:id`             | Update variable             |
| DELETE | `/api/v1/variables/:id`             | Delete variable             |
| GET    | `/api/v1/connections/:id/variables` | List connection variables   |
| POST   | `/api/v1/connections/:id/variables` | Create connection variable  |
| GET    | `/api/v1/variables/resolve`         | Preview variable resolution |

### Tool Invocation with Custom Context

Extend the existing tool invoke endpoint to accept custom variable overrides:

```typescript
// POST /api/v1/tools/invoke
{
  tool: "slack_send_message",
  params: {
    channel: "#general",
    text: "Hello from ${current_user.name}!"
  },
  context: {
    // Reference data (existing)
    channels: [{ id: "C123", name: "general" }],
    users: [{ id: "U456", name: "sarah" }]
  },
  variables: {
    // Runtime variables (NEW)
    current_user: {
      id: "user_123",
      email: "john@example.com",
      name: "John Doe"
    },
    custom_var: "custom_value"
  }
}
```

---

## Implementation Tasks

### Phase 1: Database & Core Models (~2 hours)

| #   | Task                                    | Estimate |
| --- | --------------------------------------- | -------- |
| 1.1 | Add Prisma schema for Variable model    | 20 min   |
| 1.2 | Create and run migration                | 15 min   |
| 1.3 | Create variables module structure       | 15 min   |
| 1.4 | Implement variable.repository.ts (CRUD) | 45 min   |
| 1.5 | Implement variable.schemas.ts (Zod)     | 30 min   |

### Phase 2: Variable Parser & Resolver (~2-3 hours)

| #   | Task                                                   | Estimate |
| --- | ------------------------------------------------------ | -------- |
| 2.1 | Implement variable.parser.ts (extract ${...} refs)     | 45 min   |
| 2.2 | Implement runtime-context.ts (build built-in context)  | 30 min   |
| 2.3 | Implement variable.resolver.ts (resolve with priority) | 60 min   |
| 2.4 | Add caching layer for variable lookups                 | 30 min   |

### Phase 3: Gateway Integration (~1-2 hours)

| #   | Task                                             | Estimate |
| --- | ------------------------------------------------ | -------- |
| 3.1 | Add variable resolution step to gateway pipeline | 45 min   |
| 3.2 | Resolve variables in endpoint templates          | 20 min   |
| 3.3 | Resolve variables in header configurations       | 20 min   |
| 3.4 | Resolve variables in default parameter values    | 20 min   |

### Phase 4: Tool Invoke Integration (~1 hour)

| #   | Task                                                  | Estimate |
| --- | ----------------------------------------------------- | -------- |
| 4.1 | Extend invoke endpoint to accept variables parameter  | 30 min   |
| 4.2 | Merge request variables with stored/runtime variables | 30 min   |

### Phase 5: API Endpoints (~1-2 hours)

| #   | Task                                              | Estimate |
| --- | ------------------------------------------------- | -------- |
| 5.1 | Create GET/POST/PATCH/DELETE /variables endpoints | 45 min   |
| 5.2 | Create connection-level variable endpoints        | 30 min   |
| 5.3 | Create variable resolution preview endpoint       | 30 min   |

### Phase 6: UI (~2-3 hours)

| #   | Task                                                        | Estimate |
| --- | ----------------------------------------------------------- | -------- |
| 6.1 | Add Variables section to Tenant Settings page               | 60 min   |
| 6.2 | Add Variables section to Connection detail page             | 45 min   |
| 6.3 | Add variable reference autocomplete in action configuration | 45 min   |
| 6.4 | Add variable validation warnings for missing references     | 30 min   |

### Phase 7: Sensitive Variable Support (~1 hour)

| #   | Task                                         | Estimate |
| --- | -------------------------------------------- | -------- |
| 7.1 | Implement encryption for sensitive variables | 30 min   |
| 7.2 | Add masking in logs and API responses        | 20 min   |
| 7.3 | Add sensitive flag toggle in UI              | 15 min   |

---

## Test Plan

### Unit Tests

- Variable parser: Extract ${...} references from various templates
- Variable resolver: Priority order (request > connection > tenant > runtime)
- Runtime context: Built-in variables populated correctly
- Encryption/decryption of sensitive variables
- Variable validation for action configurations

### Integration Tests

- Full resolution flow: Template → Parser → Resolver → Resolved value
- Gateway pipeline with variable resolution
- API endpoint CRUD operations
- Connection-level override of tenant variables

### E2E Tests

- Define tenant variable, reference in action, verify resolution
- Define connection override, verify it takes precedence
- Use built-in ${current_user.id} in endpoint, verify substitution
- Sensitive variable handling (encrypted storage, masked output)

---

## Edge Cases & Error Handling

| Scenario                         | Handling                                             |
| -------------------------------- | ---------------------------------------------------- |
| Missing variable reference       | Log warning, use empty string or fail (configurable) |
| Circular variable references     | Detect cycles, throw error during resolution         |
| Variable value is null/undefined | Treat as empty string in templates                   |
| Invalid variable syntax          | Parse error, validation warning in UI                |
| Sensitive variable in logs       | Always mask as `[REDACTED]`                          |
| Large JSON variable              | Warn if > 10KB, enforce 100KB limit                  |
| Environment mismatch             | Skip variable, fall through to next priority         |
| Reserved variable names          | Reject: current_user, connection, request, var       |

---

## Security Considerations

- Sensitive variables stored with AES-256-GCM encryption (reuse existing encryption utils)
- Variable values never logged in plaintext (masked as `[REDACTED]`)
- Variable resolution happens server-side only (never exposed to client)
- Validation prevents variable references in user-controlled inputs (prevent injection)
- Rate limiting on variable resolution preview endpoint

---

## Future Enhancements (Out of Scope)

- Expression evaluation (`${var.count + 1}`)
- Conditional variable logic (`${var.flag ? "a" : "b"}`)
- Variable groups/namespaces
- Variable change webhooks
- Cross-tenant shared variables (system-level)
- Integration with external secret managers
- Variable interpolation in response templates

---

## Dependencies

**Uses Existing Infrastructure:**

- Encryption utilities (`src/lib/utils/crypto.ts`)
- Gateway service and pipeline
- Connection management
- Tenant settings
- Caching layer (in-memory for MVP, Redis for production)

**New Dependencies:**

- None (uses existing stack)

---

## Example Usage

### Define Tenant Variables

```typescript
// POST /api/v1/variables
{
  key: "api_version",
  value: "v2",
  valueType: "string",
  description: "API version for all integrations"
}

// POST /api/v1/variables
{
  key: "default_channel",
  value: "C0123456789",
  valueType: "string",
  description: "Default Slack channel for notifications"
}
```

### Define Connection Override

```typescript
// POST /api/v1/connections/:id/variables
{
  key: "default_channel",
  value: "C9876543210",  // Different channel for this connection
  valueType: "string",
  description: "Production channel override"
}
```

### Configure Action with Variables

```typescript
// Action configuration
{
  endpointTemplate: "/api/${var.api_version}/chat.postMessage",
  headers: {
    "X-Request-ID": "${request.id}",
    "X-User-ID": "${current_user.id}"
  },
  inputSchema: {
    properties: {
      channel: {
        type: "string",
        default: "${var.default_channel}"  // Auto-populated if not provided
      }
    }
  }
}
```

### Invoke with Runtime Context

```typescript
// POST /api/v1/tools/invoke
{
  tool: "slack_send_message",
  params: {
    text: "Hello from ${current_user.name}!"
  },
  variables: {
    current_user: {
      id: "user_123",
      name: "John Doe"
    }
  }
}

// Resolved request:
// endpoint: "/api/v2/chat.postMessage"
// headers: { "X-Request-ID": "req_abc123", "X-User-ID": "user_123" }
// params: { channel: "C9876543210", text: "Hello from John Doe!" }
```

---

## UI Wireframes

### Tenant Settings - Variables Section

```
┌─────────────────────────────────────────────────────────────┐
│ Settings > Variables                                         │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│ Tenant Variables                                             │
│ Define variables that apply to all connections.              │
│                                                              │
│ ┌───────────────────────────────────────────────────────┐   │
│ │ Key            │ Value         │ Type   │ Env    │ 🔒 │   │
│ ├───────────────────────────────────────────────────────┤   │
│ │ api_version    │ v2            │ string │ all    │    │   │
│ │ default_channel│ C0123456789   │ string │ all    │    │   │
│ │ api_secret     │ [REDACTED]    │ string │ prod   │ 🔒 │   │
│ └───────────────────────────────────────────────────────┘   │
│                                                              │
│ [+ Add Variable]                                             │
│                                                              │
│ ─────────────────────────────────────────────────────────── │
│                                                              │
│ Built-in Variables                                           │
│ These are automatically available in all actions.            │
│                                                              │
│ ${current_user.id}      - ID of end-user (if provided)      │
│ ${current_user.email}   - Email of end-user                 │
│ ${current_user.name}    - Name of end-user                  │
│ ${connection.id}        - Connection ID                     │
│ ${connection.name}      - Connection display name           │
│ ${request.id}           - Unique request ID                 │
│ ${request.timestamp}    - ISO timestamp                     │
│ ${request.environment}  - Current environment               │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Action Editor - Variable References

```
┌─────────────────────────────────────────────────────────────┐
│ Action: Send Message                                         │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│ Endpoint Template                                            │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ /api/${var.api_version}/chat.postMessage                │ │
│ └─────────────────────────────────────────────────────────┘ │
│   Variables: api_version ✓                                  │
│                                                              │
│ Default Values                                               │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ channel: ${var.default_channel}                         │ │
│ │   ↳ Resolved: C0123456789                               │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                              │
│ Variable Autocomplete                                        │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Type ${  to insert a variable reference                 │ │
│ │ ┌─────────────────────────────────────────────────────┐ │ │
│ │ │ var.api_version          - API version              │ │ │
│ │ │ var.default_channel      - Default channel          │ │ │
│ │ │ current_user.id          - Current user ID          │ │ │
│ │ │ current_user.name        - Current user name        │ │ │
│ │ │ connection.id            - Connection ID            │ │ │
│ │ └─────────────────────────────────────────────────────┘ │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Implementation Status

**Status:** ✅ Implemented

**Completed:** 2026-01-31

### Key Implementation Files

**Core Modules (`src/lib/modules/variables/`):**

- `variable.parser.ts` - Regex-based template parsing for `${...}` variable references
- `variable.resolver.ts` - Priority-based resolution (request > connection > tenant > runtime)
- `runtime-context.ts` - Built-in context builders (current_user, connection, request)
- `variable.cache.ts` - TTL-based in-memory cache with LRU eviction
- `variable.encryption.ts` - AES-256-GCM encryption for sensitive variables
- `variable.service.ts` - Business logic with cache invalidation
- `variable.repository.ts` - Data access with automatic decryption
- `variable.schemas.ts` - Zod validation schemas

**API Routes (`src/app/api/v1/`):**

- `variables/route.ts` - List and create tenant variables
- `variables/[id]/route.ts` - Get, update, delete single variable
- `variables/resolve/route.ts` - Preview variable resolution
- `connections/[id]/variables/route.ts` - Connection-level variable endpoints

**UI Components (`src/components/features/`):**

- `settings/VariablesSection.tsx` - Tenant variables management
- `settings/VariableDialog.tsx` - Create/edit variable modal
- `settings/DeleteVariableDialog.tsx` - Confirmation dialog
- `connections/ConnectionVariablesSection.tsx` - Connection overrides
- `actions/editor/VariableAutocomplete.tsx` - Inline variable suggestions
- `actions/editor/VariableValidation.tsx` - Missing variable warnings

**Hooks (`src/hooks/`):**

- `useVariables.ts` - React Query hooks for CRUD operations

### Test Coverage

- **117 unit tests** covering parser, resolver, runtime context, and cache
- All tests passing (`pnpm test` passes for variable module)
