## Decision Log: {{PROJECT_NAME}}

> **Purpose:** This is the Architectural Decision Record (ADR) — the "Why" behind architectural changes, error resolutions, and pattern evolutions. It serves as institutional memory for AI assistants and developers to understand context, avoid repeating mistakes, and maintain consistency.

**Related Documents:**

- `architecture.md` — Technical implementation details (the "How")
- `product_spec.md` — Product requirements (the "What")
- `changelog.md` — Version history and release notes

---

## Quick Reference Index

| ID      | Date       | Category | Status  | Summary                                                 |
| ------- | ---------- | -------- | ------- | ------------------------------------------------------- |
| ADR-001 | 2026-01-01 | infra    | active  | Prisma 7 requires pg adapter instead of URL in schema   |
| ADR-002 | 2026-01-02 | infra    | active  | Prisma 7 config file requires explicit env loading      |
| ADR-003 | 2026-01-02 | infra    | active  | Environment variable file strategy for secrets          |
| ADR-004 | 2026-01-01 | arch     | active  | Dual encryption strategy for credentials                |
| ADR-005 | 2026-01-02 | arch     | active  | In-memory circuit breaker with per-circuit tracking     |
| ADR-006 | 2026-01-02 | arch     | active  | Result pattern for execution service                    |
| ADR-007 | 2026-01-02 | arch     | active  | LLM abstraction layer for future multi-model support    |
| ADR-008 | 2026-01-02 | arch     | active  | JSON Schema validation with Ajv and caching             |
| ADR-009 | 2026-01-02 | arch     | active  | PostgreSQL advisory locks for token refresh             |
| ADR-010 | 2026-01-02 | api      | active  | Unified dynamic gateway endpoint over per-action routes |
| ADR-011 | 2026-01-02 | ui       | active  | CSS variable-based design system for global theming     |
| ADR-012 | 2026-01-02 | ui       | active  | Zustand for wizard state, React Query for server state  |
| ADR-013 | 2026-01-02 | arch     | active  | Gemini 3.0 as default LLM, crawl-first scraping         |
| ADR-014 | 2026-01-03 | arch     | active  | Dual scraping modes: auto-discover vs specific pages    |
| ADR-015 | 2026-01-03 | arch     | planned | Hybrid auth model: platform-owned + user-owned creds    |
| ADR-016 | 2026-01-03 | arch     | active  | Wishlist-aware cache validation for scrape jobs         |
| ADR-017 | 2026-01-03 | arch     | active  | Template auto-detection for schema-driven APIs          |
| ADR-018 | 2026-01-03 | arch     | active  | Per-credential baseUrl for user-specific APIs           |
| ADR-019 | 2026-01-03 | arch     | active  | LLM-friendly pagination with token-aware limits         |
| ADR-020 | 2026-01-03 | arch     | active  | Response validation with Zod and three-mode strategy    |
| ADR-021 | 2026-01-04 | ui       | active  | Hash-based tag colors for consistent categorization     |
| ADR-022 | 2026-01-04 | api      | active  | Enriched log responses with integration/action names    |

**Categories:** `arch` | `data` | `api` | `ui` | `test` | `infra` | `error`

**Statuses:** `active` | `superseded` | `reverted` | `planned`

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

### ADR-018: Per-Credential Base URL for User-Specific APIs

**Date:** 2026-01-03 | **Category:** arch | **Status:** active

#### Trigger

User asked "Will that base URL get applied when I connect a project to one of these integrations?" when setting up Supabase. This revealed a fundamental architecture gap:

- `baseUrl` was stored at the **Integration** level (in `authConfig`)
- This meant ALL consuming apps using an integration share the SAME base URL
- **Problem**: User-specific APIs like Supabase have different endpoints per user (e.g., `https://project-a.supabase.co` vs `https://project-b.supabase.co`)

#### Decision

Moved `baseUrl` from integration-level to **credential-level** storage:

1. **Schema Update**: Added `baseUrl?: string` to `ApiKeyCredentialSchema` and `BearerCredentialSchema`
2. **Gateway Resolution**: `buildRequest()` now checks credential.data.baseUrl FIRST, then falls back to authConfig.baseUrl
3. **UI Flow**: Added base URL input field in credential forms when `requiresBaseUrl` is detected (Supabase, Airtable)
4. **Context Detection**: Forms auto-detect integration type and show appropriate hints

```typescript
// Gateway request building - credential URL takes priority
const credentialData = credential?.data as Record<string, unknown> | null;
const authConfig = integration.authConfig as Record<string, unknown> | null;
const baseUrl = (credentialData?.baseUrl as string) || (authConfig?.baseUrl as string) || '';
```

#### Rationale

- **Multi-tenancy**: Each consuming app can have its own endpoint configuration
- **Template reusability**: One "Supabase PostgREST" integration works for all users
- **Backward compatible**: Falls back to integration-level baseUrl if no credential baseUrl
- **Security**: Each credential is encrypted separately, so per-user URLs are also secured

Architecture after:

```
Integration: "Supabase PostgREST"
├── authConfig: { headerName: "apikey" }  ← No baseUrl here!
└── actions: [query, insert, update, ...]

Credentials (per-connection):
├── App A: { apiKey: "...", baseUrl: "https://project-a.supabase.co" }
└── App B: { apiKey: "...", baseUrl: "https://project-b.supabase.co" }
```

#### Supersedes

N/A (enhancement to existing credential storage)

#### Migration

- **Affected files:**
  - `src/lib/modules/credentials/credential.schemas.ts`
  - `src/lib/modules/credentials/credential.service.ts`
  - `src/lib/modules/gateway/gateway.service.ts`
  - `src/components/features/auth/ApiKeyConnectForm.tsx`
  - `src/components/features/integrations/wizard/StepConfigureAuth.tsx`
  - `src/app/api/v1/integrations/[id]/credentials/route.ts`
- **Find:** `baseUrl` in `authConfig` for user-specific APIs
- **Replace with:** `baseUrl` in credential data

#### AI Instructions

- For user-specific APIs (Supabase, Airtable, user's own endpoints), ALWAYS collect baseUrl when connecting credentials
- Check `requiresBaseUrl` flag or detect by integration name
- Display helpful hints for where to find the base URL (e.g., Supabase Project Settings → API)
- When building gateway requests, credential.data.baseUrl takes priority over integration.authConfig.baseUrl
- If neither exists and path is relative, throw CONFIGURATION_ERROR with clear instructions

---

### ADR-017: Template Auto-Detection for Schema-Driven APIs

**Date:** 2026-01-03 | **Category:** arch | **Status:** active

#### Trigger

Some APIs have dynamically-generated endpoints based on user schemas (database tables, collections, content types). Examples: Supabase/PostgREST, Airtable, Notion databases, Headless CMS platforms. These APIs can't be effectively scraped because endpoints are determined at runtime by the user's data model.

Initial implementation required users to manually select "Use Template" mode upfront, but this was poor UX:

- Non-technical users don't know if an API follows PostgREST conventions
- Adds cognitive load before even starting
- Creates a "wrong path" anxiety

#### Decision

Implemented **auto-detection** of template patterns during AI parsing:

1. **Detection happens during scraping**: `detectTemplate()` runs in `finalizeDocument()` after AI parsing
2. **Pattern matching**: Checks URL patterns, content keywords, endpoint paths for known patterns
3. **Detection stored in metadata**: Results go in `metadata.detectedTemplate` with confidence score
4. **UI shows detection banner**: In Review Actions step, shows "PostgREST pattern detected" with option to add template actions
5. **Non-destructive**: Template actions are added alongside AI-extracted, not replacing them

```typescript
// Detection patterns check for:
// - Supabase URLs (*.supabase.co, /rest/v1/)
// - PostgREST keywords (RLS, apikey, .select(), etc.)
// - REST CRUD endpoint patterns (GET /{resource}, POST /{resource}/{id})

function detectTemplate(
  parsedDoc: ParsedApiDoc,
  scrapedContent: string,
  sourceUrls: string[]
): TemplateDetectionResult;
```

#### Rationale

- **AI does the work**: Users don't need to know if API is "templated"
- **Non-destructive**: Users see both AI-extracted AND template actions
- **Progressive disclosure**: Detection banner only appears when confident (>30%)
- **Visual distinction**: Template actions marked with purple border for clarity

#### Supersedes

Initial manual template selection mode (never released)

#### Migration

- **Affected files:** `src/lib/modules/ai/templates/detector.ts` (new), `src/lib/modules/ai/scrape-job.service.ts`
- **Find:** Template detection in `finalizeDocument()`
- **Verify:** Scrape a Supabase docs URL and verify detection banner appears

#### AI Instructions

- Template detection runs automatically during scraping - no user selection needed
- If user asks about "templated APIs" or "schema-driven APIs", explain auto-detection
- PostgREST template includes 7 actions: query, get, insert, update, upsert, delete, RPC
- Generic REST CRUD template includes 6 actions: list, get, create, update, patch, delete
- Detection confidence threshold is 30% minimum

---

### ADR-016: Wishlist-Aware Cache Validation for Scrape Jobs

**Date:** 2026-01-03 | **Category:** arch | **Status:** active

#### Trigger

Users reported that after deleting an integration and recreating it from scratch, the scrape job cache returned stale actions. The cache lookup only matched on `tenantId + documentationUrl + COMPLETED status` and didn't consider:

1. Whether the wishlist had changed
2. Whether cached results covered the new wishlist items
3. Whether users explicitly wanted a fresh scrape

This caused confusion: "I added new wishlist items but got the same cached actions."

#### Decision

Implemented smart cache validation with wishlist coverage checking:

1. **Wishlist Coverage Check**: New `getUncoveredWishlistItems()` helper compares new wishlist against cached endpoint names, slugs, paths, and descriptions using word-based matching

2. **Cache Decision Logic**:
   - Cache HIT only when: (a) enough endpoints exist AND (b) all wishlist items are covered
   - Cache MISS triggers fresh scrape when: wishlist has uncovered items OR fewer endpoints than threshold

3. **Force Fresh Option**: Added `force: true` option and UI checkbox to explicitly bypass cache

4. **Logging**: Added detailed logging showing cache decisions (used, skipped, uncovered items)

```typescript
function getUncoveredWishlistItems(
  cachedResult: ParsedApiDoc | null,
  newWishlist: string[] | undefined
): string[] {
  // Returns wishlist items not found in cached endpoints
}
```

#### Rationale

- **User expectation**: Different wishlist = different scrape intent
- **Progressive disclosure**: Smart defaults with explicit override option
- **Transparency**: Logging shows why cache was used/skipped
- **Non-breaking**: Existing behavior preserved when no wishlist provided

Trade-offs:

- Word-based matching is fuzzy (may false-negative on synonyms)
- Still uses cache if no wishlist provided, even after integration deletion

#### Supersedes

N/A (enhancement to existing cache logic)

#### Migration

- **Affected files:** `src/lib/modules/ai/scrape-job.service.ts`, `src/components/features/integrations/wizard/StepUrlInput.tsx`
- **No breaking changes**: Cache behavior is stricter but backward-compatible

#### AI Instructions

When working with scrape job caching:

- Cache is only used when wishlist items are covered by cached endpoints
- Use `force: true` to bypass cache entirely
- The coverage check uses word-based matching (words > 2 chars)
- Check server logs for cache decision explanations
- UI checkbox "Force fresh scrape" maps to `force: true` API option

---

### ADR-015: Hybrid Authentication Model (Platform-Owned + User-Owned Credentials)

**Date:** 2026-01-03 | **Category:** arch | **Status:** planned

#### Trigger

Analysis of the iPaaS market (Merge.dev, Arcade.dev) revealed a key architectural question: should Waygate absorb OAuth app registration and compliance burden (CASA, publisher verification) once, allowing all users to benefit? Or continue requiring users to bring their own OAuth credentials?

Current MVP requires users to bring their own OAuth app credentials for each integration they create. This creates friction for SMB users who:

1. Must register OAuth apps with each provider (Google, Slack, Microsoft)
2. Must complete security reviews (Google CASA is particularly onerous)
3. Must manage OAuth client credentials and renewals
4. Face long delays before connecting to providers with strict review processes

#### Decision

Planned for V2: Implement a **hybrid authentication model** that offers both:

1. **Platform-owned credentials** (new, default for supported providers)
   - Waygate registers as OAuth app with major providers (Slack, Google, Microsoft, etc.)
   - Waygate completes CASA, publisher verification, app directory reviews once
   - Users authenticate via Waygate's pre-registered OAuth apps ("one-click connect")
   - Tokens stored with `credentialSource: 'platform'`
   - Rate limits shared across all Waygate users (requires quota management)

2. **User-owned credentials** (existing, preserved for enterprise)
   - Enterprise customers bring their own OAuth app registrations
   - Required for: dedicated rate limits, custom scopes, compliance policies
   - Tokens stored with `credentialSource: 'user_owned'`
   - No changes to current MVP flow

Key architectural additions:

- `PlatformConnector` table for Waygate's OAuth registrations
- `connectorType` field on `Integration` (platform vs custom)
- Compliance certification tracking with expiration alerts
- Shared rate limit management (Redis-backed in V1+)

#### Rationale

**Business drivers:**

- Removes major adoption friction for SMB users
- Differentiates from "bring your own everything" platforms
- Enables instant connectivity without weeks of OAuth review delays
- Similar model proven by Merge.dev, Arcade.dev, Zapier

**Trade-offs accepted:**

- Waygate assumes compliance liability for platform connectors
- Ongoing certification maintenance (CASA is annual)
- Shared rate limits require careful quota management
- Some enterprise customers will still need user-owned option

**Why hybrid over platform-only:**

- Enterprise security policies often require their own OAuth app
- Some use cases need dedicated rate limits
- Provides escape hatch if platform connector hits issues
- Gradual rollout possible (add providers over time)

#### Supersedes

N/A - extends existing user-owned credential model without replacing it

#### Migration

**V2 Implementation Plan:**

Phase 1 - Database schema:

- Add `PlatformConnector` table
- Add `connectorType` to `Integration`
- Add `credentialSource` to `IntegrationCredential`
- Migrations backward-compatible (existing = 'custom'/'user_owned')

Phase 2 - Platform registration:

- Register Waygate OAuth apps with top providers
- Complete CASA for Google
- Complete publisher verification for Microsoft
- Complete Slack app directory review

Phase 3 - UI/UX:

- "One-click connect" buttons for platform connectors
- "Bring your own app" advanced option
- Compliance status indicators in dashboard

Phase 4 - Operations:

- Certification tracking and renewal alerts
- Shared rate limit monitoring dashboard
- Automatic fallback to user-owned if rate limited

**Affected files (future):**

- `prisma/schema.prisma` - new tables
- `src/lib/modules/credentials/` - dual credential sources
- `src/lib/modules/auth/oauth-providers/` - platform connector support
- `src/components/features/integrations/` - connection type selection UI

#### AI Instructions

When working on authentication-related features:

- MVP uses user-owned credentials only - do NOT add platform connector logic yet
- The hybrid model is planned for V2; keep current architecture clean
- When V2 work begins, ensure backward compatibility with existing user-owned credentials
- Platform connectors will need their own migration path and admin UI
- Rate limit management for platform connectors requires Redis (V1 dependency)
- Never hardcode Waygate's OAuth client secrets - use environment variables
- Compliance certifications should be tracked as structured data, not free-form

---

### ADR-014: Dual Scraping Modes - Auto-Discover vs Specific Pages

**Date:** 2026-01-03 | **Category:** arch | **Status:** active

#### Trigger

Users who knew exactly which documentation pages contained API details were frustrated by:

1. The mapping phase taking extra time and API calls
2. The LLM triage potentially selecting wrong pages
3. No way to bypass the intelligent crawl for known, specific URLs

#### Decision

Implemented dual scraping modes:

1. **Auto-discover** (default): Existing behavior with Firecrawl map + LLM triage
2. **Specific pages** (new): User provides exact URLs, system skips mapping entirely

Changes:

- Added `specificUrls` field to `ScrapeJob` model and `CreateScrapeJobInput` schema
- UI radio toggle in `StepUrlInput` component between modes
- `processJob` detects `specificUrls` array and scrapes those directly
- No mapping, no LLM triage when specific URLs provided

#### Rationale

- Respects user expertise: if they know the docs, don't second-guess them
- Faster execution: skips mapping API call and LLM triage costs
- Predictable results: user controls exactly what gets scraped
- Maintains flexibility: auto-discover still available for exploration

Alternatives considered:

- URL whitelist/blacklist: More complex, harder to use
- Always require exact URLs: Would hurt users exploring new APIs

#### Supersedes

N/A (new capability, doesn't replace existing)

#### Migration

- **Affected files:** `scrape-job.schemas.ts`, `scrape-job.service.ts`, `scrape-job.repository.ts`, `StepUrlInput.tsx`
- **Find:** `documentationUrl` only in scrape input
- **Replace with:** Either `documentationUrl` (auto-discover) or `specificUrls` array (direct scrape)
- **Verify:** `npm run test` - all 637 tests pass

#### AI Instructions

When implementing scraping features:

- Check if `specificUrls` is provided before triggering intelligent crawl
- Auto-discover mode should remain the default for exploratory use cases
- Specific pages mode should cap at 20 URLs to prevent abuse
- Always handle mixed scenarios gracefully (user might provide both - prefer specificUrls)

---

### ADR-013: Gemini 3.0 Default and Crawl-First Scraping Strategy

**Date:** 2026-01-02 | **Category:** arch | **Status:** active

#### Trigger

During MVP testing, two issues were identified:

1. The AI was using outdated Gemini 1.5 models, which provided suboptimal action extraction from API documentation
2. Default scraping behavior was single-page, causing the scraper to miss actions on sub-pages of API documentation sites

#### Decision

Made two significant changes to improve documentation processing:

1. **Upgraded default LLM to Gemini 3**
   - Changed `DEFAULT_MODEL` from `gemini-1.5-pro` to `gemini-3-pro` (maps to `gemini-3-pro-preview`)
   - Document parser now uses `gemini-3-flash` (maps to `gemini-3-flash-preview`)
   - Added Gemini 2.5 models (`gemini-2.5-flash`, `gemini-2.5-pro`) to registry
   - Model codes sourced from [Google AI documentation](https://ai.google.dev/gemini-api/docs/models)
   - Legacy models remain available for backward compatibility

2. **Changed default scraping mode to crawl**
   - `crawlMode` now defaults to `true` in all scrape-related services
   - API endpoint defaults: `crawl=true`, `maxPages=20`, `maxDepth=3`
   - Scraper now traverses from top-level docs page through linked sub-pages
   - Single-page mode still available via `crawl=false` for speed when appropriate

#### Rationale

- **Gemini 3**: Released November-December 2025, offers significantly improved reasoning capabilities and 1M token context window, leading to better endpoint extraction accuracy. Model codes are `gemini-3-pro-preview` and `gemini-3-flash-preview`
- **Crawl-first**: API documentation is typically spread across multiple pages (endpoints listed on index, details on sub-pages). Crawling ensures comprehensive action discovery rather than only parsing the landing page
- **Backward compatible**: Existing integrations continue working; new scrapes benefit from improved defaults

#### Supersedes

N/A (improvements to existing features)

#### Migration

- **Affected files:** `src/lib/modules/ai/llm/types.ts`, `client.ts`, `providers/gemini.ts`, `document-parser.ts`, `scrape-job.service.ts`, `ai.service.ts`, `src/app/api/v1/scrape/route.ts`
- **Find:** `crawlMode = false` or `gemini-1.5` references
- **Replace with:** New defaults are automatic, no changes needed for consuming code
- **Verify:** `npm run test -- --run tests/unit/ai` passes

#### AI Instructions

When working with documentation scraping:

- Default to crawl mode unless user explicitly requests single-page scraping
- Use `gemini-3-pro` for critical AI tasks, `gemini-3-flash` for high-volume parsing
- If scraping finds zero endpoints, suggest the user try with a different starting URL or increase `maxPages`
- Legacy models are deprecated but supported for compatibility; prefer Gemini 3 models for all new work
- Model codes follow the pattern `gemini-X-variant-preview` (e.g., `gemini-3-pro-preview`)

---

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

### ADR-008: JSON Schema Validation with Ajv and Caching

**Date:** 2026-01-02 | **Category:** arch | **Status:** active

#### Trigger

The Action Registry needed runtime validation of action inputs against dynamic JSON Schemas. Zod is great for compile-time TypeScript schemas but doesn't support validating against arbitrary JSON Schema definitions stored in the database.

#### Decision

Implemented JSON Schema validation using Ajv with the following approach:

1. **Ajv with draft-07**: Chose Ajv as the JSON Schema validator with draft-07 specification for broad compatibility
2. **Validator Caching**: Created `getOrCreateValidator()` that caches compiled validators keyed by schema hash (crypto.createHash)
3. **Validation Modes**: Support three modes - strict (default), lenient (with defaults/coercion), and passthrough (no validation)
4. **LLM-Friendly Errors**: Added `formatErrorsForLLM()` that transforms Ajv errors into actionable guidance with suggested fixes

#### Rationale

- **Ajv over alternatives**: Ajv is the most performant and widely-used JSON Schema validator for JavaScript
- **Caching strategy**: Compiling JSON Schema to validators is expensive; caching by content hash avoids recompilation for identical schemas
- **draft-07**: Provides good balance of features and compatibility with most API documentation tools
- **Validation modes**: Different consumers need different strictness - internal services want strict, AI agents benefit from coercion

#### Supersedes

N/A - new pattern

#### Migration

- **Affected files:** `src/lib/modules/actions/json-schema-validator.ts`
- **Dependencies added:** `ajv`, `ajv-formats`, `@types/json-schema`

#### AI Instructions

When working with JSON Schema validation:

- Use `validateInput()` for action input validation with cached validators
- Use `formatErrorsForLLM()` to transform validation errors into actionable AI guidance
- The validator cache is in-memory and resets on server restart - this is intentional for simplicity
- Schema hashing uses SHA-256 for collision resistance
- Always prefer Zod for TypeScript-defined schemas; use Ajv only for dynamic/stored JSON Schemas

---

### ADR-009: PostgreSQL Advisory Locks for Token Refresh

**Date:** 2026-01-02 | **Category:** arch | **Status:** active

#### Trigger

The Token Refresh Management feature needs to prevent concurrent refresh attempts on the same credential. Multiple cron invocations or manual refreshes could otherwise race, potentially causing token invalidation or duplicate requests to OAuth providers.

#### Decision

Implemented PostgreSQL advisory locks for credential refresh synchronization:

1. **Non-blocking advisory locks**: Use `pg_try_advisory_lock()` (non-blocking) instead of `pg_advisory_lock()` (blocking)
2. **UUID to integer conversion**: Convert UUID credential IDs to 64-bit lock keys using BigInt from first 16 hex chars
3. **Lock-per-credential**: Each credential gets its own lock, allowing parallel refresh of different credentials
4. **Always-release pattern**: Lock released in `finally` block regardless of refresh success/failure
5. **Skip on lock failure**: If lock can't be acquired, skip credential (another process is refreshing it)

```typescript
// Convert UUID to lock key
function uuidToLockKey(uuid: string): bigint {
  const cleanUuid = uuid.replace(/-/g, '');
  return BigInt('0x' + cleanUuid.substring(0, 16));
}

// Non-blocking lock acquisition
const result = await prisma.$queryRaw`SELECT pg_try_advisory_lock(${lockKey})`;
```

#### Rationale

- **Advisory locks over row locks**: Row locks would require database transactions spanning the entire refresh (including external HTTP calls), causing connection pool exhaustion
- **Non-blocking over blocking**: Prevents job timeouts waiting for locks; better to skip and retry next cycle
- **Session-level locks**: Advisory locks are session-scoped, automatically released if connection drops
- **In-database vs distributed lock**: PostgreSQL native, no Redis dependency needed for MVP
- **BigInt lock keys**: PostgreSQL advisory locks take `bigint` keys; truncating UUID to 64-bit provides sufficient uniqueness

#### Supersedes

N/A (new feature)

#### Migration

- **Affected files:** `src/lib/modules/credentials/credential.repository.ts`, `src/lib/modules/credentials/token-refresh.service.ts`
- **New functions:** `tryAcquireRefreshLock()`, `releaseRefreshLock()`, `uuidToLockKey()`
- **Pattern:** Always use in try/finally to ensure release

#### AI Instructions

When working with token refresh locking:

- ALWAYS use `tryAcquireRefreshLock()` before refresh, `releaseRefreshLock()` in finally block
- If lock not acquired, return `{ success: false, error: { code: 'LOCK_NOT_ACQUIRED' } }`
- Do NOT use blocking `pg_advisory_lock()` - it can cause job timeouts
- The lock is session-scoped; connection pool returns connections to pool with locks released
- For future scaling: can migrate to Redis-based distributed locks without changing service interface

---

### ADR-010: Unified Dynamic Gateway Endpoint

**Date:** 2026-01-02 | **Category:** api | **Status:** active

#### Trigger

Designing the Gateway API required choosing between two architectures:

1. **Unified dynamic endpoint**: Single `POST /api/v1/actions/{integrationSlug}/{actionSlug}` handler
2. **Per-action endpoints**: Generate dedicated route files for each action (e.g., `/api/v1/actions/slack/send-message`)

#### Decision

Implemented a unified dynamic endpoint at `POST /api/v1/actions/{integration}/{action}`:

```
src/app/api/v1/actions/[integration]/[action]/route.ts
```

The route handler:

1. Extracts integration and action slugs from URL path parameters
2. Calls `invokeAction()` service with tenant context from auth middleware
3. Returns standardized `GatewaySuccessResponse` or `GatewayErrorResponse`

#### Rationale

- **AI-generated actions**: Actions are dynamically created by AI from API documentation; generating route files per action adds complexity with no benefit
- **Simpler architecture**: Single handler, single code path for all action invocations
- **Instant new actions**: New actions work immediately without code generation or deployment
- **Consistent behavior**: Retry logic, circuit breakers, logging applied uniformly
- **LLM-friendly**: Universal endpoint easier for AI agents to discover and use

**Tradeoffs accepted:**

- Less REST-pure than dedicated endpoints
- No compile-time type checking per action (mitigated by JSON Schema validation at runtime)
- Single error format for all actions (acceptable for unified gateway pattern)

#### Supersedes

N/A (new feature)

#### Migration

- **New files:**
  - `src/app/api/v1/actions/[integration]/[action]/route.ts` - Main handler
  - `src/lib/modules/gateway/gateway.service.ts` - Pipeline orchestration
  - `src/lib/modules/gateway/gateway.schemas.ts` - Request/response schemas
  - `src/app/api/v1/integrations/[id]/health/route.ts` - Health endpoint
  - `src/app/api/v1/logs/route.ts` - Request logs endpoint

#### AI Instructions

When working with the Gateway API:

- ALL action invocations go through `POST /api/v1/actions/{integration}/{action}`
- Use `invokeAction()` from gateway service for programmatic invocation
- Error responses ALWAYS include `suggestedResolution` with `action`, `description`, `retryable`
- Request ID is generated for every request and included in all responses
- All requests are logged via the logging service with automatic sanitization

---

### ADR-011: CSS Variable-Based Design System for Global Theming

**Date:** 2026-01-02 | **Category:** ui | **Status:** active

#### Trigger

Building the Basic Configuration UI required a design system that allows easy global changes to colors, fonts, spacing, and component styles. The goal was to enable a complete rebrand or theme change by updating a single file, not touching individual components.

#### Decision

Implemented a layered design token architecture:

1. **CSS Variables (globals.css)** - Single source of truth for all design tokens
   - Colors: `--primary`, `--secondary`, `--accent`, `--destructive`, `--background`, `--foreground`, etc.
   - Typography: `--font-heading`, `--font-body`, `--font-mono`
   - Sizing: `--radius`, `--radius-sm`, `--radius-lg`
   - Dark mode: Override variables inside `.dark` class

2. **Tailwind Config** - References CSS variables
   - `colors: { primary: 'hsl(var(--primary))' }`
   - `fontFamily: { heading: ['var(--font-heading)'] }`
   - `borderRadius: { DEFAULT: 'var(--radius)' }`

3. **Shadcn/ui Components** - Use Tailwind semantic classes
   - `bg-primary`, `text-foreground`, `border-border`

4. **Feature Components** - Compose Shadcn + Tailwind
   - No hard-coded colors, always use semantic tokens

#### Rationale

- **Single source of truth**: Change `--primary` in one place, entire UI updates
- **Shadcn compatibility**: Shadcn/ui already uses this exact CSS variable pattern
- **Dark mode for free**: CSS variables + `.dark` class = automatic dark mode
- **Developer experience**: Tailwind autocomplete still works with semantic classes
- **Zero runtime overhead**: CSS variables are browser-native, no JS hydration needed

#### Supersedes

N/A (new UI)

#### Migration

- **Affected files:** `src/app/globals.css`, `tailwind.config.ts`, all components
- **Find:** Hard-coded colors like `bg-indigo-950`, `text-gray-500`
- **Replace with:** Semantic tokens like `bg-primary`, `text-muted-foreground`
- **Verify:** Theme toggle switches all colors correctly

#### AI Instructions

When working with UI components:

- NEVER use hard-coded Tailwind colors (`bg-blue-500`, `text-gray-700`)
- ALWAYS use semantic tokens (`bg-primary`, `text-foreground`, `border-border`)
- When adding new colors, define in `globals.css` first, then add to `tailwind.config.ts`
- Dark mode overrides go in `.dark` selector in `globals.css`
- Test both light and dark modes when making UI changes

---

### ADR-012: Zustand for Wizard State, React Query for Server State

**Date:** 2026-01-02 | **Category:** ui | **Status:** active

#### Trigger

The Create Integration Wizard required complex multi-step state management (current step, form data, detected actions, scrape job status), while other parts of the UI needed server state management (fetching integrations, actions, logs).

#### Decision

Implemented a dual state management strategy:

1. **Zustand** for UI/client state:
   - Wizard flow state (`wizard.store.ts`)
   - Current step, form data, detected actions
   - Modal/dialog open states
   - Lightweight, no boilerplate

2. **React Query (TanStack Query)** for server state:
   - All data fetching (integrations, actions, logs)
   - Caching, background refetching, optimistic updates
   - Hooks: `useIntegrations`, `useActions`, `useLogs`, etc.
   - Query invalidation for cache coherence

#### Rationale

- **Separation of concerns**: Server state (async, cached) vs UI state (synchronous, ephemeral) are fundamentally different
- **React Query strengths**: Built-in caching, deduplication, background refetch, devtools
- **Zustand strengths**: Simple API, no providers needed, TypeScript-first, tiny bundle
- **No Redux**: Overhead not justified for MVP scope
- **Wizard isolation**: Zustand store is local to wizard, doesn't pollute global state

#### Supersedes

N/A (new UI)

#### Migration

- **Affected files:** `src/stores/*.ts`, `src/hooks/use*.ts`
- **Pattern:** Use Zustand for ephemeral UI state, React Query for anything from the server

#### AI Instructions

When working with state management:

- For server data (API calls), ALWAYS use React Query hooks (`useQuery`, `useMutation`)
- For UI-only state (modals, wizards, filters), use Zustand or React useState
- Do NOT mix server state into Zustand stores - it defeats caching
- Use `queryClient.invalidateQueries()` after mutations to refresh related data
- Wizard stores should reset on unmount to avoid stale state

---

### ADR-019: LLM-Friendly Pagination with Token-Aware Limits

**Date:** 2026-01-03 | **Category:** arch | **Status:** active

#### Trigger

Implementing pagination for API responses required careful consideration of how LLM consumers would use the data. Traditional pagination limits (maxPages, maxItems) don't account for response size, which directly impacts LLM context window constraints and API costs.

#### Decision

Implemented a multi-strategy pagination handler with LLM-friendly defaults:

1. **Strategy Pattern Architecture:**
   - Abstract `BasePaginationStrategy` with implementations for cursor, offset, page-number, and Link header
   - Auto-detection via `PaginationDetector` that scores responses against all strategies
   - Strategies are stateless and reusable across requests

2. **LLM-Friendly Limits (alongside traditional limits):**
   - `maxCharacters`: 100,000 default (~25K tokens) - fits most LLM context windows
   - `maxPages`: 5 default - prevents runaway fetches
   - `maxItems`: 500 default - reasonable dataset size
   - `maxDurationMs`: 30,000ms default - timeout safety

3. **Token Estimation:**
   - ~4 characters per token (industry standard approximation)
   - `estimatedTokens` included in response metadata
   - Helps LLM consumers budget context window

4. **Presets for Common Use Cases:**
   - `LLM_OPTIMIZED`: Conservative limits for AI use (~25K tokens)
   - `QUICK_SAMPLE`: Single page for testing (1 page, 100 items)
   - `FULL_DATASET`: Larger limits for data sync (50 pages, 5K items)

5. **Request-Level Overrides:**
   - Per-request limits via `paginationOptions` in Gateway API
   - Allows consuming apps to customize per-call

#### Rationale

- **Safety First**: Unbounded pagination can timeout, OOM, exhaust rate limits, or exceed LLM context windows
- **LLM-Centric**: Waygate's primary consumers are AI systems with token constraints
- **Transparency**: Clear truncation signals (`truncationReason`, `hasMore`, `continuationToken`) help consumers understand incomplete data
- **Flexibility**: Action-level defaults + request-level overrides = fine-grained control
- **Strategy Pattern**: Clean separation allows adding new pagination strategies without modifying core logic

#### Alternatives Considered

1. **Only traditional limits (maxPages/maxItems)**: Rejected - doesn't account for variable response sizes
2. **Automatic unbounded fetching**: Rejected - dangerous without explicit opt-in
3. **Hard-coded limits**: Rejected - different APIs need different configurations
4. **Streaming pagination**: Deferred to V1 - added complexity not needed for MVP

#### Migration

- **Affected files:** `src/lib/modules/execution/pagination/`, `src/lib/modules/gateway/`
- **Breaking changes:** None - new functionality
- **API changes:** New `paginationOptions` field in Gateway request, new `pagination` metadata in response

#### AI Instructions

When working with pagination:

- ALWAYS check if an action has `paginationConfig.enabled` before assuming pagination support
- Use `fetchAll: true` with appropriate limits for paginated actions
- Default limits are conservative - increase if needed but be mindful of context windows
- Check `metadata.pagination.truncated` to know if data is incomplete
- Use `continuationToken` to resume pagination in follow-up requests
- For LLM use cases, prefer character limits over item limits
- Run `estimateTokens(characterCount)` to budget context window usage

---

### ADR-020: Response Validation with Zod and Three-Mode Strategy

**Date:** 2026-01-03 | **Category:** arch | **Status:** active

#### Trigger

External APIs can return unexpected data at any time - missing fields, type changes, schema drift, unexpected nulls, or malformed responses. Consuming apps (especially LLM-powered ones) need reliable, typed data to function correctly. Without validation, bad data silently propagates and causes hard-to-debug issues downstream.

#### Decision

Implemented a Response Validation layer with:

1. **Three Validation Modes:**
   - `strict`: Fail immediately if response doesn't match schema exactly
   - `warn`: Log issues but pass data through (default for most actions)
   - `lenient`: Auto-fix issues via coercion, use defaults for nulls

2. **Type Coercion in Lenient Mode:**
   - String → Number (e.g., "123" becomes 123)
   - String → Boolean (e.g., "true" becomes true)
   - Number → String (when schema expects string)
   - Null → Default value (when configured)

3. **Extra Field Handling:**
   - `strip`: Remove unknown fields from response (default for strict)
   - `preserve`: Keep unknown fields (default for warn/lenient)

4. **Schema Drift Detection:**
   - Track validation failures per action over rolling time window
   - Alert when failure rate exceeds configurable threshold (default: 5 failures in 60 minutes)
   - Helps distinguish systematic API changes from one-off errors

5. **Per-Action Configuration:**
   - `validationConfig` JSON field on `Action` model
   - UI controls in Action Editor for mode, coercion, null handling, drift detection
   - AI-generated actions get sensible defaults (enabled, warn mode)

6. **Request-Level Overrides:**
   - Headers: `X-Waygate-Validation-Mode`, `X-Waygate-Bypass-Validation`, etc.
   - Allows per-request control without changing action config

7. **LLM-Friendly Error Reporting:**
   - Structured `ValidationIssue` objects with JSONPath, expected/received types
   - `suggestedResolution` field helps LLMs understand how to fix issues

#### Rationale

- **Trust But Verify**: External APIs are a trust boundary - never blindly pass through their data
- **Progressive Strictness**: Default to `warn` for flexibility, opt into `strict` for critical data
- **Lenient for Prototyping**: Auto-fix common issues during development, tighten for production
- **Visibility**: Drift detection surfaces systematic API changes before they cause outages
- **Zod over Ajv**: Zod provides better TypeScript integration and transformation capabilities

#### Alternatives Considered

1. **Ajv (JSON Schema)**: Rejected - already have Ajv for input validation, but Zod provides better TypeScript integration and transformations
2. **No validation**: Rejected - too risky for production use, especially with LLM consumers
3. **Client-side only**: Rejected - validation should happen at the gateway before data reaches consumers
4. **Binary valid/invalid**: Rejected - three modes provide flexibility for different use cases

#### Migration

- **Affected files:** `src/lib/modules/execution/validation/`, `src/lib/modules/gateway/`, `src/components/features/actions/editor/`
- **Database:** New `validationConfig` field on `Action` model, new `ValidationFailure` model for drift detection
- **Breaking changes:** None - validation is opt-in with backwards-compatible defaults

#### AI Instructions

When working with validation:

- ALWAYS check `validationConfig.enabled` before assuming validation is active
- Default mode is `warn` - issues are logged but data passes through
- For strict validation, ensure output schema accurately reflects API response
- Use lenient mode during prototyping, strict mode for production-critical data
- Check `response.validation.issues` for any validation problems
- Drift detection alerts appear in logs when failure rate exceeds threshold
- To bypass validation for debugging: `X-Waygate-Bypass-Validation: true` header

---

### ADR-021: Hash-Based Tag Colors for Consistent Categorization

**Date:** 2026-01-04 | **Category:** ui | **Status:** active

#### Trigger

Users need to organize integrations and actions with tags for categorization. Tags should have consistent, visually distinct colors to aid quick recognition, but allowing full user customization adds complexity and potential for poor color choices.

#### Decision

Implemented hash-based tag coloring:

1. **Deterministic Colors:**
   - Tag name is hashed to select from a predefined 10-color palette
   - Same tag always gets the same color across all views
   - No user color configuration (simplifies UX)

2. **Color Palette:**
   - Blue, Purple, Green, Amber, Rose, Cyan, Indigo, Emerald, Teal, Orange
   - Each has light/dark mode variants for accessibility
   - Chosen for visual distinction and contrast

3. **Tag Validation:**
   - 2-30 characters length constraint
   - Lowercase alphanumeric with hyphens only (`/^[a-z0-9-]+$/`)
   - Maximum 10 tags per entity (prevents visual overload)
   - Normalized to lowercase on input for consistency

4. **Implementation:**
   - `src/lib/utils/tag-colors.ts` provides `getTagColor(tagName)` and `getTagClasses(tagName)`
   - TagBadge component uses dynamic variant with computed Tailwind classes
   - Case-insensitive hashing ensures "Payment" and "payment" get same color

#### Rationale

- **Cognitive Load**: Consistent colors create visual patterns users can learn
- **Simplicity**: No color picker UI reduces complexity
- **Accessibility**: Predefined palette ensures sufficient contrast
- **Performance**: Hash-based lookup is O(1), no database storage needed
- **Tenant Isolation**: Tags are per-tenant but colors are global (same tag = same color across all users)

#### Alternatives Considered

1. **User-defined colors**: Rejected - adds UI complexity, risk of poor choices, requires storage
2. **Random colors**: Rejected - inconsistent between views, hard to build recognition
3. **Category-based colors**: Rejected - requires predefined categories, limits flexibility
4. **Gradient/icon alternatives**: Deferred - colored badges are simpler MVP solution

#### AI Instructions

When working with tags:

- Tags must be lowercase alphanumeric with hyphens (validation rejects uppercase)
- Use `getTagColor(tag)` for consistent coloring, never hardcode colors
- Maximum 10 tags per integration/action - enforce in both schema and UI
- Tag autocomplete uses `useTags` hook to fetch tenant's existing tags
- TagFilter component shows all available tags with multi-select checkboxes

---

### ADR-022: Enriched Log Responses with Integration/Action Names

**Date:** 2026-01-04 | **Category:** api | **Status:** active

#### Trigger

Request logs stored raw integration/action IDs, requiring frontend to make additional requests to resolve names for display. This created N+1 query patterns and poor UX with loading states for log viewers.

#### Decision

Enriched log responses at the service layer:

1. **Server-Side Enrichment:**
   - `listRequestLogs` service fetches integration and action details in parallel
   - Single batch query for all unique IDs in result set
   - Returns denormalized data: `integrationName`, `integrationSlug`, `actionName`, `actionSlug`

2. **Computed Status Field:**
   - `status: 'success' | 'error' | 'timeout'` derived from statusCode and error presence
   - 2xx = success, error present = error, else = timeout
   - Frontend no longer needs status logic

3. **HTTP Method Extraction:**
   - `httpMethod` extracted from `requestSummary.method`
   - Simplified access for UI display and filtering

4. **Performance Optimization:**
   - Batch fetch: Single `findMany` for integrations, single for actions
   - Maps for O(1) lookup during enrichment
   - Acceptable trade-off: Slightly larger response vs. N+1 client queries

#### Rationale

- **User Experience**: Log viewer immediately shows human-readable names
- **Client Simplicity**: No need to resolve IDs, manage loading states, or handle missing data
- **Consistency**: Single source of truth for log formatting
- **Filtering**: Names available for client-side search without additional queries

#### Migration

- **Affected files:** `src/lib/modules/logging/logging.service.ts`, `src/hooks/useLogs.ts`
- **Schema changes:** `RequestLogResponseSchema` extended with new fields
- **Breaking changes:** None - existing fields preserved, new fields additive

#### AI Instructions

When working with logs:

- Always use enriched response fields (`integrationName`, `actionName`) for display
- `status` field is pre-computed - don't derive from statusCode in UI
- Log list responses include all necessary data for display without follow-up queries
- For log stats, use dedicated `/logs/stats` endpoint with aggregation

---
