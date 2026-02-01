# Decision Log: Waygate

> Architectural Decision Records (ADRs) — the "Why" behind architectural choices. For setup-related ADRs (001-003), see `docs/archive/decision-log-setup.md`.

---

## Quick Reference

| ID      | Category | Summary                                                           |
| ------- | -------- | ----------------------------------------------------------------- |
| ADR-004 | arch     | Dual encryption: bcrypt for API keys, AES-256-GCM for credentials |
| ADR-005 | arch     | In-memory circuit breaker with per-circuit tracking               |
| ADR-006 | arch     | Result pattern for execution service                              |
| ADR-007 | arch     | LLM abstraction layer for multi-model support                     |
| ADR-008 | arch     | JSON Schema validation with Ajv and caching                       |
| ADR-009 | arch     | PostgreSQL advisory locks for token refresh                       |
| ADR-010 | api      | Unified dynamic gateway endpoint                                  |
| ADR-011 | ui       | CSS variable-based design system                                  |
| ADR-012 | ui       | Zustand for wizard state, React Query for server                  |
| ADR-013 | arch     | Gemini 3.0 default, crawl-first scraping                          |
| ADR-014 | arch     | Dual scraping modes: auto-discover vs specific                    |
| ADR-015 | arch     | Hybrid auth: platform + user-owned credentials                    |
| ADR-016 | arch     | Wishlist-aware cache validation                                   |
| ADR-017 | arch     | Template auto-detection for schema-driven APIs                    |
| ADR-018 | arch     | Per-credential baseUrl for user-specific APIs                     |
| ADR-019 | arch     | LLM-friendly pagination with token-aware limits                   |
| ADR-020 | arch     | Response validation with three-mode strategy                      |
| ADR-021 | ui       | Hash-based tag colors                                             |
| ADR-022 | api      | Enriched log responses with names                                 |
| ADR-023 | arch     | Simplified flat-schema prompts for Gemini                         |
| ADR-024 | arch     | Multi-App Connections with Connection entity                      |
| ADR-025 | arch     | Tiered health check system                                        |
| ADR-026 | arch     | Per-app custom mappings with inheritance                          |
| ADR-027 | arch     | LLM response preamble as optional wrapper                         |
| ADR-028 | arch     | Service layer exports over repository for public modules          |

---

## Active ADRs

### ADR-004: Dual Encryption Strategy

**Decision:** Waygate API keys use bcrypt (one-way hashing). Integration credentials use AES-256-GCM (reversible encryption).

**Rationale:** API keys only need validation, not retrieval. Credentials must be sent to external APIs, requiring reversible encryption.

**AI Instructions:**

- NEVER log decrypted credentials
- Use `encryptJson()`/`decryptJson()` for credentials, `generateApiKey()`/`validateApiKey()` for API keys
- API key format: `wg_live_<32-char-hex>`

---

### ADR-005: In-Memory Circuit Breaker

**Decision:** Per-circuit tracking using `Map<string, CircuitState>`. States: closed → open (5 failures in 30s) → half-open (60s) → closed.

**AI Instructions:**

- Always use `circuitBreakerId` option for related requests
- Check `isCircuitOpen(result)` to handle gracefully
- Accept that cold starts reset circuit state (Redis planned for V1+)

---

### ADR-006: Result Pattern for Execution

**Decision:** `ExecutionResult<T>` with `success`, `data`, `error`, `attempts`, `totalDurationMs`. Never throws for expected failures.

**AI Instructions:**

- Use `isSuccess()`/`isFailure()` for type narrowing
- Use `unwrap()` when you want to throw on failure
- Check `error.code` for specific handling (RATE_LIMITED, CIRCUIT_OPEN, etc.)

---

### ADR-007: LLM Abstraction Layer

**Decision:** `LLMProvider` interface with `generateContent<T>()` and `generateStructured<T>()`. Model registry with capability flags.

**AI Instructions:**

- Do NOT import directly from `@google/generative-ai` — use `@/lib/modules/ai/llm`
- Use `generateStructured()` for reliable JSON extraction
- Use capability-based model selection, not specific provider names

---

### ADR-008: JSON Schema Validation with Ajv

**Decision:** Ajv with draft-07 for runtime validation of dynamic schemas. Validators cached by schema content hash.

**AI Instructions:**

- Use `validateInput()` for action input validation
- Use `formatErrorsForLLM()` to transform errors for AI consumption
- Prefer Zod for TypeScript-defined schemas; Ajv only for dynamic/stored JSON Schemas

---

### ADR-009: PostgreSQL Advisory Locks for Token Refresh

**Decision:** Non-blocking `pg_try_advisory_lock()` per credential. UUID converted to 64-bit lock key. Lock released in finally block.

**AI Instructions:**

- ALWAYS use `tryAcquireRefreshLock()` before refresh
- If lock not acquired, skip credential (another process is refreshing)
- Do NOT use blocking `pg_advisory_lock()` — causes job timeouts

---

### ADR-010: Unified Dynamic Gateway Endpoint

**Decision:** Single `POST /api/v1/actions/{integration}/{action}` handler for all action invocations.

**Rationale:** Actions are AI-generated dynamically. Dedicated routes per action would require code generation and deployment for each new action.

**AI Instructions:**

- ALL action invocations go through the unified endpoint
- Error responses ALWAYS include `suggestedResolution`
- Use `invokeAction()` from gateway service for programmatic invocation

---

### ADR-011: CSS Variable-Based Design System

**Decision:** CSS variables in `globals.css` as single source of truth. Tailwind references variables. Dark mode via `.dark` class.

**AI Instructions:**

- NEVER use hard-coded Tailwind colors (`bg-blue-500`)
- ALWAYS use semantic tokens (`bg-primary`, `text-foreground`)
- Test both light and dark modes

---

### ADR-012: State Management Split

**Decision:** Zustand for UI/client state (wizard flows, modals). React Query for server state (all API data).

**AI Instructions:**

- For server data, ALWAYS use React Query hooks
- For UI-only state, use Zustand or useState
- Do NOT mix server state into Zustand stores

---

### ADR-013: Gemini 3.0 and Crawl-First Scraping

**Decision:** Default LLM is `gemini-3-pro`. Default scraping uses crawl mode (maxPages=20, maxDepth=3).

**AI Instructions:**

- Use `gemini-3-pro` for critical tasks, `gemini-3-flash` for high-volume parsing
- Default to crawl mode unless user explicitly requests single-page

---

### ADR-015: Hybrid Authentication Model

**Decision:** Platform connectors (Waygate-registered OAuth apps) + user-owned credentials. `connectorType` on Connection, `credentialSource` on Credential.

**Rationale:** Platform connectors remove OAuth app registration friction for SMB users while preserving user-owned option for enterprise.

**AI Instructions:**

- Default connector type is 'custom' for backward compatibility
- Platform connector secrets are encrypted — NEVER log decrypted values
- API responses must NEVER include encrypted credential fields

---

### ADR-019: LLM-Friendly Pagination

**Decision:** Multi-strategy pagination (cursor, offset, page, link header) with LLM-aware limits: `maxCharacters` (100K default ~25K tokens), `maxPages` (5), `maxItems` (500).

**AI Instructions:**

- Check `paginationConfig.enabled` before assuming pagination support
- Default limits are conservative — increase mindfully
- Check `metadata.pagination.truncated` for incomplete data

---

### ADR-020: Response Validation Modes

**Decision:** Three modes: `strict` (fail on mismatch), `warn` (log but pass), `lenient` (auto-coerce types). Drift detection tracks failure rate.

**AI Instructions:**

- Default mode is `warn`
- Use lenient during prototyping, strict for production-critical data
- To bypass: `X-Waygate-Bypass-Validation: true` header

---

### ADR-023: Simplified Extraction Prompts

**Decision:** Endpoint extraction prompts match schema exactly (flat fields only). Use `thinkingLevel: 'low'` for extraction tasks. Sanitize null bytes before JSON parsing.

**AI Instructions:**

- When modifying extraction prompts, ALWAYS ensure instructions match schema fields
- Do NOT add complex nested extraction without updating schema
- For Gemini 3, use `thinkingLevel: 'low'` for extraction, `high` only for reasoning

---

### ADR-024: Multi-App Connections

**Decision:** `Connection` entity links consuming apps to integrations with separate credentials and baseUrl. Nullable `connectionId` on credentials for backward compatibility.

**AI Instructions:**

- Connection resolution happens in `gateway.service.ts` via `resolveConnection()`
- Never require `connectionId` — always provide fallback to default
- Use `ensureDefaultConnection()` for backward-compatible access

---

### ADR-025: Tiered Health Checks

**Decision:** Three tiers: Credential (every 15 min, no API calls), Connectivity (every 12h, one API call), Full Scan (manual, tests all GET actions).

**AI Instructions:**

- Tier 1 is free (no API calls) — ideal for credential monitoring
- Tier 2 makes exactly one API call — configure test actions thoughtfully
- `healthStatus` on Connection represents overall health from latest checks

---

### ADR-026: Per-App Custom Mappings

**Decision:** Mappings with `connectionId = null` are defaults; mappings with `connectionId` are overrides that take precedence. Unique constraint on `(actionId, connectionId, sourcePath, direction)`.

**AI Instructions:**

- `getResolvedMappings(actionId, connectionId)` returns merged defaults + overrides
- In gateway pipeline, pass `connectionId` to mapping functions
- Cache invalidation must propagate when defaults change

---

### ADR-027: LLM Response Preamble

**Decision:** Optional `preambleTemplate` on Connection. When set, responses include `context` field with interpolated template. Applied AFTER field mappings.

**AI Instructions:**

- Check `connection.preambleTemplate` — if set, wrap response with `context` field
- Use `interpolatePreamble()` for template processing
- Preamble logic should NEVER throw — invalid templates fail open

---

### ADR-028: Service Layer Exports Over Repository

**Decision:** Module index files export service functions (high-level operations) over repository functions when names conflict. Repository functions are exported only if they provide unique functionality not available in the service layer.

**Rationale:** Service layer provides business logic, validation, and proper error handling. Direct repository access bypasses these safeguards and creates inconsistent data access patterns across the codebase.

**AI Instructions:**

- In module `index.ts`, use named exports from repository instead of `export *` when conflicts exist
- Service layer functions take precedence: `createX`, `updateX`, `deleteX`, `disableX` from service, not repository
- Export repository functions that have no service equivalent (e.g., `findXByIdAndTenant`, `findAllXForTenant`)
- Pattern seen in [agentic-tools/index.ts](../src/lib/modules/agentic-tools/index.ts#L9-L18)

---

## Archive Reference

| Archive                              | Contents                                                      |
| ------------------------------------ | ------------------------------------------------------------- |
| `docs/archive/decision-log-setup.md` | ADR-001 to ADR-003 (Prisma config, dotenv, env file strategy) |
