## Changelog: Waygate

> **Purpose:** Development history tracking all notable changes. Follows [Keep a Changelog](https://keepachangelog.com/) conventions. For architectural decisions and rationale, see `decision_log.md`.

**Related Documents:**

- `decision_log.md` — Why changes were made
- `architecture.md` — Technical implementation details
- `product_spec.md` — Product requirements

---

## Version Index

| Version | Date       | Type       | Summary                                                  |
| ------- | ---------- | ---------- | -------------------------------------------------------- |
| 0.2.0   | 2026-01-02 | prerelease | AI Documentation Scraper complete                        |
| 0.1.0   | 2026-01-02 | prerelease | Core infrastructure (Auth + DB + Execution)              |
| 0.0.0   | 2026-01-01 | prerelease | Pre-build baseline with documentation and workflow setup |

**Types:** `major` | `minor` | `patch` | `prerelease`

---

## Entry Format

```
## [{{VERSION}}] - {{YYYY-MM-DD}}

### Added
- {{New feature or capability}}

### Changed
- {{Modification to existing functionality}}

### Fixed
- {{Bug fix — reference ERR-XXX from decision_log if applicable}}

### Removed
- {{Removed feature or deprecated code}}

### Breaking
- {{Breaking change — reference decision_log entry}}
- **Migration:** {{Brief migration instruction or link to decision_log}}

### Dependencies
- {{Package}}: {{old_version}} → {{new_version}}

### Security
- {{Security fix or update}}
```

---

## Releases

<!-- Add new versions below this line, newest first -->

## [Unreleased]

### Added

- **AI Documentation Scraper (Feature #5)** - Complete
  - Firecrawl SDK integration for web scraping (`@mendable/firecrawl-js`)
  - Google Generative AI SDK integration (`@google/generative-ai`)
  - OpenAPI Parser (`@readme/openapi-parser`) for direct Swagger/OpenAPI spec parsing
  - YAML support (`yaml`) for OpenAPI v3 specs
  - Extensible LLM abstraction layer with provider/model registry
  - GeminiProvider implementation with structured JSON output
  - ScrapeJob database model with status tracking (PENDING → CRAWLING → PARSING → GENERATING → COMPLETED/FAILED)
  - Scrape job repository with full CRUD operations and tenant isolation
  - RLS policies for scrape_jobs table
  - Doc scraper with single-page and multi-page crawling
  - AI extraction prompts with few-shot examples for endpoints, auth, rate limits
  - Document parser with chunking for large docs, deduplication, confidence scoring
  - OpenAPI parser for direct spec-to-ParsedApiDoc conversion
  - Scrape API endpoints (POST /api/v1/scrape, GET /api/v1/scrape/:jobId)
  - Async job processing with status updates at each stage
  - Supabase Storage integration for caching scraped content (gzip compressed)
  - Action definition generator transforming endpoints to typed Actions
  - JSON Schema generation for action input/output validation
  - Wishlist prioritization for matching actions to user requirements
  - Main orchestrator: `processDocumentation()` end-to-end URL → Integration workflow
  - Automatic Integration and Action creation from parsed docs

- **Retry Logic & Error Handling (Feature #4)** - Complete execution infrastructure with resilience patterns
  - Exponential backoff with configurable jitter (default: 1s base, 2x multiplier, 10% jitter)
  - Retry-After header parsing (both seconds and HTTP-date formats)
  - Circuit breaker pattern with in-memory state tracking per integration
  - State transitions: closed → open (5 failures in 30s) → half-open (60s) → closed
  - HTTP client wrapper with configurable timeouts and AbortController
  - Rate limit header extraction (X-RateLimit-\*, Retry-After)
  - Execution service orchestrating retry + circuit breaker + HTTP client
  - Passthrough mode for raw error forwarding
  - Request context in errors for debugging (requestId, attempts, duration)
  - Fluent RequestBuilder API for common patterns
  - Typed error classes: NetworkError, TimeoutError, RateLimitError, ServerError, ClientError, CircuitOpenError, MaxRetriesExceededError
  - Result type guards: isSuccess, isFailure, isRateLimited, isCircuitOpen, isTimeout
  - Convenience helpers: get, post, put, patch, del with automatic JSON handling
  - 113 new unit tests for execution module (252 total tests)

- **Authentication Framework (Feature #3)** - Complete multi-type authentication system
  - AES-256-GCM encryption module for secure credential storage
  - Waygate API key authentication middleware (bcrypt hashed)
  - Credential repository with CRUD operations for encrypted data
  - Credential service with encrypt-on-save, decrypt-on-retrieve pattern
  - OAuth2 provider base with authorization URL, code exchange, token refresh
  - Generic OAuth2 provider supporting standard OAuth2 flows
  - Auth type handlers for API Key, Basic, Bearer, OAuth2, Custom Headers
  - API endpoints: OAuth connect, callback, disconnect, credential status, test
  - Auth service orchestrating all authentication flows
  - Comprehensive Zod schemas for all auth types and API requests/responses
  - Unit tests for encryption, credential service, handlers (139 tests total)
  - Integration tests for OAuth flows with mocked external dependencies

- **Database Setup (Feature #2)** - Complete Prisma schema and Supabase configuration
  - 6 PostgreSQL enums: AuthType, IntegrationStatus, CredentialType, CredentialStatus, HttpMethod, MappingDirection
  - 6 Prisma models: Tenant, Integration, Action, IntegrationCredential, FieldMapping, RequestLog
  - All foreign key relationships with cascade deletes
  - Comprehensive indexes for query performance (tenant+slug, integration+slug, expires_at, created_at)
  - Encrypted credential storage using Bytes type (bytea)
  - Initial database migration (`20250102_initial_schema`)
  - Seed script with test tenant and sample Slack integration (5 actions)
  - Supabase client configuration (anon + service role)
  - 16 integration tests for database operations
  - Environment variable structure with `.env.example` template

- **Project Scaffolding (Feature #1)** - Complete foundation for Waygate development
  - Next.js 14 with App Router and TypeScript 5.x (strict mode)
  - Tailwind CSS with Waygate design system (custom colors, typography)
  - Shadcn/ui components (button, card, dialog, input, label, badge, separator, skeleton, sonner, dropdown-menu)
  - Prisma 7 with PostgreSQL adapter configured
  - TanStack Query provider with React Query Devtools
  - Zustand UI store for state management
  - Zod, React Hook Form with resolvers
  - ESLint + Prettier + Husky + lint-staged for code quality
  - Vitest + React Testing Library + MSW for testing (17 tests passing)
  - GitHub Actions CI workflow
  - Full directory structure per architecture.md
  - API response helpers and custom error classes
  - Health check endpoint at `/api/v1/health`

---

## [0.0.0] - 2026-01-01

### Added

- Complete project documentation suite (product spec, architecture, decision log)
- Vibe-coding workflow prompts for structured development process
- MCP configuration for Cursor integration
- Git repository structure and .cursorrules for AI assistant behavior

---
