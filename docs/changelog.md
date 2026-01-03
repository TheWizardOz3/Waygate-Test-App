## Changelog: Waygate

> **Purpose:** Development history tracking all notable changes. Follows [Keep a Changelog](https://keepachangelog.com/) conventions. For architectural decisions and rationale, see `decision_log.md`.

**Related Documents:**

- `decision_log.md` — Why changes were made
- `architecture.md` — Technical implementation details
- `product_spec.md` — Product requirements

---

## Version Index

| Version | Date       | Type       | Summary                                                         |
| ------- | ---------- | ---------- | --------------------------------------------------------------- |
| 0.1.4   | 2026-01-03 | patch      | UI polish, specific pages mode, action saves fix                |
| 0.1.3   | 2026-01-03 | patch      | Intelligent crawling with LLM-guided page selection             |
| 0.1.2   | 2026-01-03 | patch      | UX improvements: clickable logo, cards, copy buttons            |
| 0.1.1   | 2026-01-02 | patch      | Upgrade to Gemini 3.0, improve scraping with default crawl mode |
| 0.1.0   | 2026-01-02 | minor      | **MVP Complete!** Basic Configuration UI complete               |
| 0.0.8   | 2026-01-02 | prerelease | Gateway API complete                                            |
| 0.0.7   | 2026-01-02 | prerelease | Token Refresh Management complete                               |
| 0.0.6   | 2026-01-02 | prerelease | Action Registry & Schema complete                               |
| 0.2.0   | 2026-01-02 | prerelease | AI Documentation Scraper complete                               |
| 0.0.1   | 2026-01-02 | prerelease | Core infrastructure (Auth + DB + Execution)                     |
| 0.0.0   | 2026-01-01 | prerelease | Pre-build baseline with documentation and workflow setup        |

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

## [0.1.4] - 2026-01-03

### Added

- **Specific Pages Mode for Scraping**
  - New UI option to provide exact documentation URLs instead of auto-discovery
  - Radio toggle between "Auto-discover" (existing behavior) and "Specific pages" (new)
  - Accepts up to 20 URLs, one per line, in a textarea
  - Skips site mapping entirely — directly scrapes provided URLs
  - Much faster for users who know exactly which pages contain API documentation
  - Database schema updated with `specific_urls` field on `scrape_jobs` table
  - Added `shadcn/ui radio-group` component

- **Job Cancellation Support**
  - New "Cancel Job" button appears while scraping is in progress
  - API endpoint: `POST /api/v1/scrape/{jobId}/cancel`
  - Jobs are marked as `FAILED` with `JOB_CANCELLED` error code
  - Cancel hook: `useCancelScrapeJob()` in React Query

- **Improved Error UI**
  - Specific error messages displayed with error codes
  - Contextual suggestions for rate limits and API key issues
  - "Re-analyze" button for retryable errors when cached content exists

### Fixed

- **Actions Not Saving from Wizard**
  - Actions detected during scraping now correctly save when integration is created
  - Updated `CreateIntegrationInputSchema` to accept `actions` array
  - Integration service maps wizard action format to database format
  - Input/output schemas properly constructed from path/query parameters

- **CredentialsPanel Using Mock Data**
  - Replaced hardcoded mock credential status with real API calls
  - Now fetches from `/integrations/{id}/credentials` endpoint
  - Correctly maps API response structure to UI state

- **ActionTester and QuickTestModal Wrong Endpoint**
  - Fixed both components to call correct Gateway API path
  - Changed from non-existent `/gateway/invoke` to `/actions/{integration}/{action}`

- **Integration Detail View Improvements**
  - "Actions" tab is now the default view (was "Overview")
  - Tab order reordered: Actions → Overview → Logs
  - Action names link to detailed action view
  - Removed "Manual" badge from actions (not useful)
  - Description column has more space and shows 2 lines with tooltip
  - Copy button copies full endpoint (`METHOD /path`)

- **Dashboard Cleanup**
  - Removed "Quick Actions" panel from dashboard home

- **Integrations List Improvements**
  - List view now uses compact tabular format (`IntegrationTable` component)
  - Card view simplified: removed action count, auth type badges, actions button
  - Both views focus on essential metadata: name, slug, description, status

### Changed

- **URL Triage Optimization**
  - Dynamic URL truncation based on character count (200k chars) instead of fixed URL count
  - Simplified LLM triage to single call returning URL array (faster, less token usage)
  - Wishlist items now more prominent in triage prompt
  - URL normalization: strips query params and fragments, deduplicates

- **LLM Model Upgrades**
  - URL triage now uses `gemini-3-pro` (was `gemini-3-flash`)
  - Endpoint extraction uses `gemini-3-pro` with 32k output tokens
  - Better reasoning and longer outputs for complex documentation

- **Extraction Prompt Improvements**
  - Prompts now explicitly skip deprecated endpoints
  - Focus on core functionality (CRUD, main features)
  - Quality over quantity guidance (aim for 30-50 important endpoints)
  - Wishlist passed to extraction phase for targeted discovery

### Dependencies

- Added `@radix-ui/react-radio-group` (via shadcn/ui radio-group)

### Database Migrations

- `20260103072943_add_specific_urls_to_scrape_job`: Added `specific_urls` column

### Technical Notes

- All 637 tests pass
- Zero lint errors, zero TypeScript errors
- New components: `IntegrationTable`, enhanced `StepUrlInput` with mode selector
- Updated test fixtures to include `specificUrls` field

---

## [0.1.3] - 2026-01-03

### Added

- **Intelligent Crawling with LLM-Guided Page Selection**
  - Complete rewrite of the documentation scraping approach for dramatically better results
  - **Firecrawl Map Integration**: Uses Firecrawl's `/map` endpoint to discover ALL URLs on a documentation site in seconds (up to 5000 URLs)
  - **LLM-Guided URL Triage**: An LLM analyzes discovered URLs and assigns priority scores (0-100) based on relevance to API documentation
  - **URL Category Detection**: Automatic classification into categories: `api_endpoint`, `api_reference`, `authentication`, `getting_started`, `rate_limits`, `sdk_library`, etc.
  - **Smart Pattern Detection**: Regex-based pre-filtering excludes obvious non-doc pages (blog, pricing, careers, images) before LLM triage
  - **Wishlist-Aware Prioritization**: User-provided wishlist items (e.g., "send_message", "list_channels") boost matching URLs but don't exclude other valuable pages
  - **Authentication Priority**: Auth documentation pages are ALWAYS included (critical for integration setup)
  - **Balanced Page Selection**: Selection algorithm ensures a good mix of auth docs, wishlist matches, API endpoints, and reference pages
  - **Organized Content Output**: Aggregated content is organized by category (Authentication first, then Overview, then Endpoints) for better AI parsing

### Changed

- **Default Scraping Mode**: `intelligentCrawl: true` is now the default (was basic breadth-first crawling)
- **Default Max Pages**: Increased from 20 to 30 pages for better coverage
- **ProcessJobOptions**: Added `intelligentCrawl` option (defaults to `true`); setting to `false` falls back to basic BFS crawling

### Technical Notes

- New module: `src/lib/modules/ai/intelligent-crawler.ts` with:
  - `mapWebsite()` - Firecrawl map API wrapper
  - `triageUrls()` - LLM-based URL prioritization with batching
  - `detectUrlCategory()` - Pattern-based URL classification
  - `preFilterUrls()` - Fast exclusion of non-doc URLs
  - `intelligentCrawl()` - Main orchestrator function
- Triage uses `gemini-3-flash` for speed (100 URLs per batch)
- URL patterns cover major API documentation conventions
- All exports added to module index for external use
- Unit tests added for URL category detection and pre-filtering

---

## [0.1.2] - 2026-01-03

### Changed

- **UX Improvements: Navigation & Copyability**
  - **Clickable Logo**: Waygate logo in sidebar now navigates to dashboard home
  - **Clickable Integration Cards**: Entire integration card is now clickable (not just the title), with hover arrow indicator
  - **Copy Buttons for Endpoints**: Added copy-to-clipboard buttons for API endpoints throughout the UI:
    - Action table endpoint column
    - Action tester header
    - Log detail dialog endpoint display
    - Request/Response viewer URL display
  - **Clickable Wizard Steps**: Completed wizard steps in Create Integration flow are now clickable to navigate back
    - Visual feedback on hover (scale + ring effect)
    - "Scraping" and "Success" steps remain non-clickable as intended
    - Proper history management when navigating backwards
  - **Reusable CopyButton Component**: New `src/components/ui/copy-button.tsx` with:
    - Tooltip support
    - Visual feedback (checkmark on success)
    - Toast notifications
    - CopyableText variant for inline copy functionality

### Fixed

- Fixed Tailwind CSS compilation error with `border-border` utility in globals.css
- Fixed Integration Actions tab showing placeholder instead of actual ActionTable with actions

### Technical Notes

- All 592 tests continue to pass
- Zero lint errors, zero TypeScript errors
- CopyButton component follows existing shadcn/ui patterns

---

## [0.1.1] - 2026-01-02

### Changed

- **LLM Model Upgrade**: Updated default LLM from Gemini 1.5 to Gemini 3 for better API documentation analysis
  - `gemini-3-pro` (model: `gemini-3-pro-preview`) is now the default model for all AI operations
  - `gemini-3-flash` (model: `gemini-3-flash-preview`) used for faster parsing tasks
  - Added Gemini 2.5 models (`gemini-2.5-flash`, `gemini-2.5-pro`) to the registry
  - Legacy models (1.5-pro, 1.5-flash, 2.0-flash) remain available for backward compatibility
  - Model codes sourced from [Google AI documentation](https://ai.google.dev/gemini-api/docs/models)

- **Scraping Behavior Improvement**: Changed default scraping behavior from single-page to multi-page crawling
  - `crawl=true` is now the default in the scrape API endpoint
  - Crawling starts from the provided URL and traverses linked pages (up to 20 pages, depth 3)
  - This dramatically improves action discovery for API docs spread across multiple pages
  - Single-page scraping still available via `crawl=false` for faster results when appropriate
  - Tested with Claude API docs - successfully discovered 10+ endpoint pages from a single URL

### Technical Notes

- All 127 AI-related tests continue to pass
- No breaking changes to the API - existing integrations work unchanged
- Improved action extraction accuracy expected with Gemini 3's enhanced reasoning

---

## [0.1.0] - 2026-01-02 - 🎉 MVP Complete!

### Added

- **Basic Configuration UI (Feature #9)** - Complete web dashboard for Waygate

  **Design System Foundation**
  - CSS variable-based theming system (single source of truth in `globals.css`)
  - Tailwind CSS extended to reference CSS variables for global theme changes
  - Crimson Pro, Inter, and JetBrains Mono fonts via `next/font`
  - Dark/Light mode with `next-themes` and theme toggle component
  - Shadcn/ui component library integration with consistent styling

  **Dashboard Layout**
  - Collapsible sidebar navigation with responsive behavior
  - Global header with search, notifications, and user menu
  - Dashboard home with stats cards, recent activity, and quick actions

  **Integration Management**
  - Integration list with grid/list views, search, and status/type filters
  - Integration detail view with tabbed layout (Overview, Actions, Logs)
  - Integration status badges with semantic color coding
  - Delete integration dialog with slug confirmation

  **Create Integration Wizard**
  - 5-step multi-step wizard with Zustand state management
  - Step 1: URL input with optional action wishlist and example URLs
  - Step 2: Real-time scraping progress with status polling
  - Step 3: Review AI-detected actions with confidence indicators
  - Step 4: Configure OAuth2 or API Key authentication
  - Step 5: Success confirmation with confetti animation

  **Action Table & Management**
  - TanStack Table with sorting, filtering, pagination
  - Bulk selection with bulk delete/export actions
  - Method badges (GET/POST/PUT/DELETE) with semantic colors
  - Source indicator (AI-generated vs manual)
  - Quick test modal for inline action testing

  **Action Editor**
  - Full-page editor for creating/editing actions
  - Basic info section (name, slug, description, method, endpoint)
  - Visual schema builder with tabular field editing
  - JSON Schema toggle for advanced editing
  - Advanced settings (caching, retry configuration)
  - Client-side Zod validation

  **Action Testing ("Try It")**
  - Dynamic form generation from JSON Schema
  - Request/Response viewer with syntax highlighting
  - Test history with localStorage persistence
  - Quick re-execution of previous tests

  **Connection Wizards**
  - OAuth2 connect button with popup flow
  - API Key form with secure input and test connection
  - Connection status display with refresh/disconnect options

  **Request Logs**
  - Filterable log viewer with search, integration, status, date range filters
  - Log entry rows with timestamp, integration, action, status, latency
  - Log detail dialog with full request/response bodies

  **Settings & API Keys**
  - Settings page with tabs (General, API Keys, Notifications, Appearance)
  - Masked API key display with copy-to-clipboard
  - Regenerate API key with confirmation dialog
  - API usage examples with curl commands

  **Polish & Refinement**
  - Error boundary component for graceful error handling
  - Toast notifications via Sonner for CRUD operations
  - Skeleton loaders for all data-fetching states
  - Empty states with helpful CTAs
  - Responsive sidebar (collapsible on smaller screens)

### Dependencies

- `@tanstack/react-query`: Server state management and caching
- `@tanstack/react-table`: Data table with sorting/filtering/pagination
- `zustand`: Lightweight state management for wizard flows
- `next-themes`: Dark/light mode theming
- `sonner`: Toast notifications
- `react-syntax-highlighter`: JSON syntax highlighting
- `date-fns`: Date formatting and relative time
- `recharts`: Charts for dashboard stats
- `js-confetti`: Success animations
- `tailwindcss-animate`: Animation utilities

### Technical Notes

- All 592 existing tests continue to pass
- Zero lint errors, zero TypeScript errors
- Design tokens allow single-file theme changes via CSS variables
- React Query provides caching, optimistic updates, and automatic refetching
- UI is production-ready, pending backend API integration

---

## [Unreleased]

### Added

- **Gateway API (Feature #8)** - Tasks 1-7 Complete
  - **Task 1: Logging Service & Repository**
    - Request log schemas (`RequestSummary`, `ResponseSummary`, `LogError`)
    - Log repository with paginated queries, filtering, and stats
    - Logging service with automatic sanitization (headers, body fields)
    - Body truncation for large payloads (configurable max size)
    - Retention management for old logs
  - **Task 2: Integration Service (Basic)**
    - Integration schemas and repository layer
    - Service layer with tenant verification
    - CRUD operations, slug-based lookups
    - Status management (active, disabled, error)
  - **Task 3: Gateway Schemas & Types**
    - `GatewayInvokeRequestSchema` for action input
    - `GatewaySuccessResponseSchema` with execution metrics
    - `GatewayErrorResponseSchema` with LLM-friendly suggested resolutions
    - Error codes mapped to HTTP statuses and suggested actions
    - Health check schemas for integration status
    - Type-safe response builders and helpers
  - **Task 4: Gateway Service (Core Pipeline)**
    - `invokeAction()` orchestrates full invocation pipeline:
      - Resolves integration and action by slugs
      - Validates input against action's JSON Schema (Ajv)
      - Retrieves and applies credentials (OAuth2, API Key, Basic, Bearer)
      - Builds HTTP request with path parameter substitution
      - Executes via execution engine (retry + circuit breaker)
      - Logs request/response with sanitization
      - Returns standardized success/error response
    - `GatewayError` class with error code mapping
    - Support for all credential types in request building
    - `getHttpStatusForError()` helper for API routes
  - **Task 5: Action Invocation Endpoint**
    - `POST /api/v1/actions/{integration}/{action}` - Main Gateway API endpoint
    - Extracts integration and action slugs from URL path
    - Parses JSON body as action input (validates object format)
    - Optional invocation headers: `X-Waygate-Skip-Validation`, `X-Waygate-Timeout`, `X-Idempotency-Key`
    - Returns `GatewaySuccessResponse` (200) or `GatewayErrorResponse` with mapped HTTP status
    - Execution metrics included in response (latency, retry count, cached flag)
  - **Task 6: Integration Health Endpoint**
    - `GET /api/v1/integrations/{id}/health` - Returns integration health status
    - `checkHealth()` method added to integration service
    - Health status levels: `healthy`, `degraded`, `unhealthy`
    - Checks credential validity (not expired, not revoked, needs refresh)
    - Returns circuit breaker status (closed, open, half_open) with failure count
    - Includes last successful request time from request logs
    - `determineHealthStatus()` logic evaluates all health factors
  - **Task 7: Request Logs Endpoint**
    - `GET /api/v1/logs` - Paginated request logs for tenant
    - Query filters: `integrationId`, `actionId`, `startDate`, `endDate`, `cursor`, `limit`
    - Tenant-scoped - only returns logs for authenticated tenant
    - Standard pagination format with `cursor`, `hasMore`, `totalCount`
  - **Feature Tests Added (87 new tests)**
    - `tests/unit/gateway/gateway-schemas.test.ts` - 36 tests for schema validation
    - `tests/unit/logging/logging-service.test.ts` - 36 tests for sanitization/truncation
    - `tests/integration/gateway/gateway-api.test.ts` - 15 integration tests

### Technical Notes

- Path parameters: `{param}` syntax in endpoint templates substituted from input
- Credentials applied based on type: headers (OAuth2, Bearer, Basic), query/body (API Key)
- All responses include request ID for debugging and suggested resolution for errors
- 505 tests passing

---

## [0.0.7] - 2026-01-02

### Added

- **Token Refresh Management (Feature #7)** - Complete
  - Proactive background token refresh system for OAuth2 credentials
  - Repository methods for finding expiring credentials with configurable buffer window
  - PostgreSQL advisory locks (`pg_try_advisory_lock`/`pg_advisory_unlock`) for concurrent refresh prevention
  - Token refresh service with retry logic (3 attempts) and exponential backoff (1s, 2s, 4s)
  - Refresh token rotation handling (stores new refresh token if provider rotates)
  - Dynamic OAuth provider creation from integration `authConfig`
  - Structured JSON logging for refresh events (credential ID, integration ID, tenant ID, status, duration)
  - Internal cron endpoint: `POST /api/v1/internal/token-refresh` (protected by `CRON_SECRET`)
  - Cron status endpoint: `GET /api/v1/internal/token-refresh` (returns job configuration)
  - Manual refresh endpoint: `POST /api/v1/integrations/:id/refresh` (API key authenticated)
  - Refresh info endpoint: `GET /api/v1/integrations/:id/refresh` (token expiration status)
  - Vercel Cron configuration (`vercel.json`) with 5-minute schedule
  - Credentials marked `needs_reauth` after max retries exhausted
  - 17 new unit tests for token refresh service
  - 12 new integration tests for token refresh API endpoints
  - 505 total tests passing

### Technical Notes

- Buffer time: 10 minutes (configurable via query param)
- Cron frequency: Every 5 minutes via Vercel Cron
- Max retries: 3 attempts with exponential backoff
- Locking: PostgreSQL advisory locks (non-blocking `pg_try_advisory_lock`)
- Error handling: Non-retryable errors (invalid_grant, invalid_token) immediately mark `needs_reauth`

---

## [0.0.6] - 2026-01-02

### Added

- **Action Registry & Schema (Feature #6)** - Complete
  - Action Zod schemas for type-safe CRUD operations, queries, and API responses
  - Action repository with Prisma-based CRUD, batch operations, pagination, and filtering
  - Action service with business logic, tenant isolation, and slug conflict resolution
  - JSON Schema validator using Ajv with draft-07 support and validator caching
  - Persist actions function connecting AI scraper output to database
  - API endpoint: `GET /api/v1/integrations/:id/actions` - list actions with pagination/filters
  - API endpoint: `GET /api/v1/actions/:integration/:action/schema` - get action schema by slugs
  - API endpoint: `POST /api/v1/actions/:integration/:action/validate` - pre-execution input validation
  - LLM-friendly error formatting for AI agent consumption
  - 93 new tests (75 unit + 18 integration) for action registry components

### Dependencies

- `ajv`: Added for JSON Schema validation (draft-07)
- `ajv-formats`: Added for format validation (email, uri, date-time, etc.)
- `@types/json-schema`: Added for TypeScript JSON Schema types

---

## [0.2.0] - 2026-01-02

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
