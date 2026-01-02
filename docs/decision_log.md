## Decision Log: {{PROJECT_NAME}}

> **Purpose:** This is the Architectural Decision Record (ADR) — the "Why" behind architectural changes, error resolutions, and pattern evolutions. It serves as institutional memory for AI assistants and developers to understand context, avoid repeating mistakes, and maintain consistency.

**Related Documents:**

- `architecture.md` — Technical implementation details (the "How")
- `product_spec.md` — Product requirements (the "What")
- `changelog.md` — Version history and release notes

---

## Quick Reference Index

| ID      | Date       | Category | Status | Summary                                               |
| ------- | ---------- | -------- | ------ | ----------------------------------------------------- |
| ADR-001 | 2026-01-01 | infra    | active | Prisma 7 requires pg adapter instead of URL in schema |
| ADR-002 | 2026-01-02 | infra    | active | Prisma 7 config file requires explicit env loading    |
| ADR-003 | 2026-01-02 | infra    | active | Environment variable file strategy for secrets        |
| ADR-004 | 2026-01-01 | arch     | active | Dual encryption strategy for credentials              |
| ADR-005 | 2026-01-02 | arch     | active | In-memory circuit breaker with per-circuit tracking   |
| ADR-006 | 2026-01-02 | arch     | active | Result pattern for execution service                  |
| ADR-007 | 2026-01-02 | arch     | active | LLM abstraction layer for future multi-model support  |

**Categories:** `arch` | `data` | `api` | `ui` | `test` | `infra` | `error`

**Statuses:** `active` | `superseded` | `reverted`

---

## Entry Format

```
### {{ID}}: {{TITLE}}
**Date:** {{YYYY-MM-DD}} | **Category:** {{CATEGORY}} | **Status:** {{STATUS}}

#### Trigger
{{What prompted this change — error encountered, limitation hit, requirement change, performance issue, etc.}}

#### Decision
{{What changed — be specific about files, patterns, or configurations modified}}

#### Rationale
{{Why this approach was chosen over alternatives}}

#### Supersedes
{{Previous decision ID this replaces, or "N/A" if new}}

#### Migration
- **Affected files:** {{glob pattern or specific paths}}
- **Find:** {{exact code pattern, function name, or import to locate}}
- **Replace with:** {{new pattern or approach}}
- **Verify:** {{command to run or test to confirm migration complete}}

#### AI Instructions
{{Specific rules for AI when working in this area — what to do, what NOT to do}}
```

---

## Log Entries

<!-- Add new entries below this line, newest first -->

### ADR-001: Prisma 7 PostgreSQL Adapter Configuration

**Date:** 2026-01-01 | **Category:** infra | **Status:** active

#### Trigger

Prisma 7 changed how database connections are configured. The `url` property in `datasource db` is no longer supported in schema.prisma files.

#### Decision

- Removed `url = env("DATABASE_URL")` from `prisma/schema.prisma`
- Created `prisma/prisma.config.ts` with schema path configuration
- Updated `src/lib/db/client.ts` to use `@prisma/adapter-pg` with a `pg` connection pool
- Installed `@prisma/adapter-pg` and `pg` packages

#### Rationale

Prisma 7 introduces a new configuration model that separates schema definition from connection management. This provides more flexibility for different deployment environments and enables features like Prisma Accelerate.

#### Supersedes

N/A (new project)

#### Migration

- **Affected files:** `prisma/schema.prisma`, `src/lib/db/client.ts`
- **Find:** `url = env("DATABASE_URL")` in schema.prisma
- **Replace with:** Remove from schema, use adapter in client
- **Verify:** `npm run db:generate` succeeds

#### AI Instructions

When working with Prisma in this project:

- Do NOT add `url` property to datasource in schema.prisma
- Always use the pg adapter pattern in client.ts
- Ensure DATABASE_URL is available in environment for the adapter

---

### ADR-002: Prisma 7 Config File Requires Explicit Environment Loading

**Date:** 2026-01-02 | **Category:** infra | **Status:** active

#### Trigger

When running Prisma CLI commands (`prisma migrate dev`, `prisma db seed`), the `prisma.config.ts` file was not automatically loading environment variables from `.env.local`, causing "DATABASE_URL not found" errors.

#### Decision

- Added `import 'dotenv/config';` at the top of `prisma/prisma.config.ts`
- Updated `prisma/seed.ts` to also explicitly load env vars using `dotenv` with explicit paths
- Use Prisma's `env()` helper in config for datasource URL

#### Rationale

Prisma 7's new config file (`prisma.config.ts`) is executed by the Prisma CLI in a TypeScript context that doesn't automatically load `.env` files. The `dotenv/config` import ensures environment variables are loaded before any config properties are accessed.

#### Supersedes

N/A (extends ADR-001)

#### Migration

- **Affected files:** `prisma/prisma.config.ts`, `prisma/seed.ts`
- **Find:** Files without `import 'dotenv/config'`
- **Replace with:** Add import at top of file
- **Verify:** `npx prisma migrate status` succeeds

#### AI Instructions

When creating or modifying Prisma-related TypeScript files that run via CLI:

- Always add `import 'dotenv/config';` at the very top
- For seed scripts, also add explicit path loading: `config({ path: path.join(__dirname, '..', '.env.local') })`
- Do NOT assume environment variables are automatically available

---

### ADR-003: Environment Variable File Strategy

**Date:** 2026-01-02 | **Category:** infra | **Status:** active

#### Trigger

Initial setup had secrets stored in `.env` which was not gitignored, creating a security risk.

#### Decision

Established three-file environment variable strategy:

1. **`.env.example`** - Template with placeholder values, committed to repo
2. **`.env.local`** - Actual secrets for local development, gitignored
3. **`.env`** - Non-sensitive defaults only (NODE_ENV), gitignored as extra precaution

Added both `.env` and `.env.local` to `.gitignore`.

#### Rationale

- `.env.example` serves as documentation for required variables
- `.env.local` is Next.js's standard for local secrets (automatically loaded)
- Gitignoring both `.env` and `.env.local` prevents accidental secret exposure
- This follows Next.js conventions and security best practices

#### Supersedes

N/A (new project)

#### Migration

- **Affected files:** `.env`, `.env.local`, `.env.example`, `.gitignore`
- **Find:** Secrets in `.env`
- **Replace with:** Move to `.env.local`
- **Verify:** `git status` shows no `.env` or `.env.local` files

#### AI Instructions

When working with environment variables:

- NEVER put secrets in `.env` - always use `.env.local`
- Update `.env.example` when adding new required variables
- Check `.gitignore` includes both `.env` and `.env.local`
- For Prisma CLI operations, ensure dotenv is loaded in config files

---

### ADR-006: Result Pattern for Execution Service

**Date:** 2026-01-02 | **Category:** arch | **Status:** active

#### Trigger

The execution service needs to handle both success and failure cases in a way that's predictable for consumers and compatible with TypeScript's type system.

#### Decision

Implemented a Result pattern for all execution operations:

```typescript
interface ExecutionResult<T> {
  success: boolean;
  data?: T; // Present when success=true
  error?: ExecutionErrorDetails; // Present when success=false
  attempts?: number;
  totalDurationMs?: number;
}
```

- `execute()` returns `ExecutionResult` - never throws
- `httpRequest()` throws typed errors - for use within retry/circuit breaker
- Helper functions (`isSuccess`, `isFailure`, `unwrap`, `unwrapOr`) for result handling
- Typed error codes as discriminated union for pattern matching

#### Rationale

- **Predictable control flow**: Consumers don't need try/catch for expected failures
- **Type safety**: TypeScript can narrow types based on `success` flag
- **Error context**: Rich error details (code, statusCode, retryable, details) preserved
- **Composable**: Results can be chained, mapped, and unwrapped
- **Consistent**: Same pattern across all execution helpers (get, post, etc.)

#### Supersedes

N/A (new feature)

#### Migration

- **Affected files:** All code that calls execution module
- **Find:** `try { await execute(...) } catch`
- **Replace with:** `const result = await execute(...); if (!result.success) { ... }`
- **Verify:** `npm run type-check` passes

#### AI Instructions

When working with execution module:

- Use `isSuccess(result)`/`isFailure(result)` for type narrowing
- Use `unwrap(result)` when you want to throw on failure
- Use `unwrapOr(result, defaultValue)` for safe defaults
- Check `error.code` for specific error handling (RATE_LIMITED, CIRCUIT_OPEN, etc.)
- The `httpRequest` function throws - only use directly when you need raw errors

---

### ADR-005: In-Memory Circuit Breaker with Per-Circuit Tracking

**Date:** 2026-01-02 | **Category:** arch | **Status:** active

#### Trigger

The execution engine needs to fail fast when external services are unhealthy, preventing cascade failures and wasted resources on requests that will likely fail.

#### Decision

Implemented in-memory circuit breaker with:

1. **Per-circuit tracking** using `Map<string, CircuitState>`
   - Circuit ID defaults to request URL, can be overridden (e.g., integration ID)
   - Enables granular failure isolation per integration/service

2. **State machine**:
   - `closed` → Normal operation, requests flow through
   - `open` → Fail fast, requests rejected with CircuitOpenError
   - `half-open` → Allow single test request to probe recovery

3. **Configuration** (per circuit, with defaults):
   - `failureThreshold`: 5 failures to open
   - `failureWindowMs`: 30s window for counting failures
   - `resetTimeoutMs`: 60s before trying half-open

4. **Failure window** - Only count recent failures, not total historical failures

#### Rationale

- **In-memory for MVP**: Simple, fast, no external dependencies. Acceptable trade-off that cold starts reset state.
- **Per-circuit**: Different integrations may have different reliability profiles
- **Failure window**: Prevents old failures from keeping circuit open indefinitely
- **Configurable**: Different services may need different thresholds
- **Redis-ready**: Map-based storage can be swapped for Redis in V1

#### Supersedes

N/A (new feature)

#### Migration

- **Affected files:** `src/lib/modules/execution/circuit-breaker.ts`
- **Find:** Direct usage of HTTP client without circuit breaker
- **Replace with:** Use `ExecutionService.execute()` which integrates circuit breaker
- **Verify:** Circuit state correctly tracked per circuitId

#### AI Instructions

When working with circuit breaker:

- Always use `circuitBreakerId` option for related requests (e.g., same integration)
- Check `isCircuitOpen(result)` to handle circuit open errors gracefully
- Use `getStatus(circuitId)` to inspect circuit state for debugging
- For MVP, accept that cold starts reset circuit state
- When migrating to Redis, implement same interface in `circuit-breaker.ts`

---

### ADR-007: LLM Abstraction Layer for Multi-Model Support

**Date:** 2026-01-02 | **Category:** arch | **Status:** active

#### Trigger

The AI Documentation Scraper requires LLM integration for extracting structured data from documentation. Future requirements include supporting multiple AI models (GPT-4, Claude, etc.) and providers, with easy switching between them.

#### Decision

Implemented an LLM abstraction layer in `src/lib/modules/ai/llm/`:

1. **LLMProvider interface** (`types.ts`)
   - `generateContent<T>()` - General text generation
   - `generateStructured<T>()` - JSON output with schema validation
   - Model and provider metadata properties

2. **Model registry** (`registry.ts`)
   - Central registry of available models with metadata
   - Default model selection per use case
   - Model capability flags (structured output, vision, etc.)

3. **GeminiProvider** (`gemini-provider.ts`)
   - Google Gemini implementation of LLMProvider
   - Handles structured JSON output via `responseMimeType: "application/json"`
   - Schema conversion for Gemini's strict type requirements

4. **Future-ready pattern**:
   - New providers implement `LLMProvider` interface
   - Register models in registry with capabilities
   - Consumers request by capability, not specific provider

#### Rationale

- **Interface-first**: Allows swapping providers without changing consumer code
- **Registry pattern**: Centralizes model configuration, enables A/B testing
- **Capability-based selection**: Consumer asks for "model with structured output" not "gemini-1.5-pro"
- **Gemini first**: Google offers generous free tier, good structured output support
- **Minimal overhead**: For MVP, direct function exports; full provider system adds one indirection layer

#### Supersedes

N/A (new feature)

#### Migration

- **Affected files:** All AI service code using LLM
- **Find:** Direct `@google/generative-ai` imports
- **Replace with:** Import from `@/lib/modules/ai/llm`
- **Verify:** LLM calls work through abstraction

#### AI Instructions

When working with LLM integration:

- Do NOT import directly from `@google/generative-ai` - use the abstraction layer
- When adding new models, implement `LLMProvider` interface and register in registry
- Use `generateStructured()` for reliable JSON extraction with schemas
- The Gemini provider handles schema conversion automatically
- For new capabilities, extend `LLMProvider` interface (all providers must implement)

---

### ADR-004: Dual Encryption Strategy for Authentication Credentials

**Date:** 2026-01-01 | **Category:** arch | **Status:** active

#### Trigger

The Authentication Framework requires secure storage for two distinct types of secrets:

1. Waygate API keys (for consuming apps authenticating with Waygate)
2. Integration credentials (OAuth tokens, API keys for external services)

Each has different security requirements and usage patterns.

#### Decision

Implemented a dual encryption strategy:

1. **Waygate API Keys** - Bcrypt hashing (one-way)
   - Keys are hashed with bcrypt before storage in `Tenant.waygateApiKey`
   - Original key is shown only once at generation time
   - Validation done via `bcrypt.compare()` - timing-safe comparison
   - Format: `wg_live_<32-char-hex>` for easy identification

2. **Integration Credentials** - AES-256-GCM encryption (reversible)
   - Stored in `IntegrationCredential.encryptedData` as `Bytes`
   - Format: `[IV (16 bytes)] + [AuthTag (16 bytes)] + [Ciphertext]`
   - Single 32-byte key in `ENCRYPTION_KEY` environment variable
   - Decrypted only in-memory at point of use, never persisted decrypted

#### Rationale

- **Bcrypt for API keys**: Keys don't need to be recovered, only validated. One-way hashing prevents exposure even if database is compromised.
- **AES-256-GCM for credentials**: OAuth tokens must be sent to external APIs, so reversible encryption is required. GCM mode provides both confidentiality and authenticity (tamper detection).
- **Separated storage**: API keys in Tenant table, credentials in dedicated IntegrationCredential table with credential type enum for polymorphic handling.

#### Supersedes

N/A (new feature)

#### Migration

- **Affected files:** `src/lib/modules/credentials/encryption.ts`, `src/lib/modules/auth/api-key.ts`
- **Find:** Direct storage of sensitive credentials
- **Replace with:** Use `encryptJson()`/`decryptJson()` for integration credentials, `generateApiKey()`/`validateApiKey()` for API keys
- **Verify:** All credentials in DB are encrypted buffers, not plaintext

#### AI Instructions

When working with credentials in this project:

- NEVER log decrypted credentials, even in error messages
- NEVER return actual secrets in API responses - use `getCredentialStatus()` for safe status info
- Always use `Buffer.from(uint8Array)` when converting Prisma `Uint8Array` to `Buffer` for decryption
- The encryption key must be exactly 64 hex characters (32 bytes)
- Use `encryptJson()`/`decryptJson()` for objects, `encrypt()`/`decrypt()` for strings
- API key validation is O(1) constant-time via bcrypt

---
