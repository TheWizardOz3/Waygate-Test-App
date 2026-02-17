# Product Specification: Waygate

> _"Open the gate. Connect the realms."_

## 1. Executive Summary

### 1.1 Product Vision Statement

Waygate is an AI-powered integration gateway that transforms API documentation into production-ready, maintainable integrations. Like a magical portal between realms, it serves as the universal foundation layer for building applications that need to connect to third-party services—eliminating the repetitive work of integration development while providing the flexibility and robustness required for production systems.

### 1.2 Problem Statement

Building integrations is one of the most tedious, error-prone, and repetitive aspects of software development:

1. **Documentation Comprehension**: Every API has different documentation styles, authentication methods, and conventions. Understanding what's possible requires hours of reading and experimentation.

2. **Repetitive Implementation**: The same integration patterns (OAuth flows, pagination, retries, error handling) get rebuilt from scratch for every new project.

3. **Maintenance Burden**: APIs change constantly. Keeping integrations working requires ongoing monitoring and updates that often get deprioritized until something breaks.

4. **Data Freshness vs. Performance**: Many applications repeatedly fetch data that rarely changes (user lists, schemas, metadata), wasting API calls and adding latency.

5. **Inconsistent Quality**: Without a standardized integration layer, each project handles edge cases differently, leading to inconsistent reliability.

Waygate solves these problems by providing an AI-powered system that can ingest any API's documentation, understand its capabilities, and generate robust, configurable integrations that are automatically maintained and exposed through a unified interface.

### 1.3 Target Audience / User Personas

| Persona                            | Description                                                                                                       | Primary Goals                                                                                              | Pain Points                                                                                       |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| **Solo Builder (Primary)**         | Technical founder or indie developer building multiple applications. Comfortable with code but values efficiency. | Build reliable integrations quickly; reuse integration work across projects; minimize maintenance overhead | Rebuilding the same integrations repeatedly; debugging OAuth flows; handling API changes          |
| **AI Application Developer**       | Developer building LLM-powered applications that need to take actions in external services                        | Create typed tool definitions for AI agents; ensure reliable execution of AI-initiated actions             | Converting API capabilities to LLM tool schemas; handling failures gracefully in agentic contexts |
| **Non-Technical Builder (Future)** | Product manager or ops person who needs to configure integrations without writing code                            | Set up and configure integrations visually; understand what's possible without reading API docs            | Technical barriers to integration setup; dependency on engineering resources                      |

### 1.4 Key Value Proposition

**"Drop in documentation, get production-ready integrations."**

Waygate differentiates from existing solutions through:

| Competitor      | Their Approach                                                   | Waygate Difference                                                           |
| --------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| **Merge.dev**   | Pre-built unified APIs for specific categories (HRIS, CRM, etc.) | AI-generated integrations for _any_ API, not limited to pre-built connectors |
| **Arcade.dev**  | MCP runtime layer for AI agent tool execution                    | Full integration lifecycle from discovery to maintenance, not just runtime   |
| **Zapier/Make** | Workflow automation between apps                                 | Developer-focused API gateway, not end-user automation                       |
| **Custom Code** | Build everything from scratch                                    | AI-accelerated development with automatic maintenance                        |

**Core Value Props:**

1. **AI-Powered Discovery**: Point to any API documentation and get a comprehensive understanding of available actions
2. **Typed Action Registry**: Every integration exposes a consistent, typed interface regardless of underlying API design
3. **Intelligent Caching**: Smart data layer that knows what to cache and when to refresh
4. **Automatic Resilience**: Built-in retry logic, rate limiting, and error handling
5. **Multi-Tenant Ready**: Each consuming application brings its own credentials while sharing integration logic

---

## 2. User Experience Guidelines

### 2.1 Design Principles

- **Progressive Disclosure**: Start simple, reveal complexity on demand. A new user should be able to create their first integration in minutes, while power users can access every configuration option.

- **Transparency Over Magic**: When AI makes decisions (field mappings, action groupings), show the reasoning and make it overridable. Users should never feel like they're fighting the system.

- **API-First, UI-Second**: Every capability must be accessible via API. The UI is a powerful client, not a gatekeeper. This ensures consuming apps can automate any workflow.

- **Fail Loudly, Recover Quietly**: Surface errors and warnings prominently, but handle transient failures automatically. Users should know when something needs attention without being overwhelmed by noise.

- **Configuration as Code**: All integration configurations should be exportable/importable as structured data (JSON/YAML), enabling version control and environment promotion.

### 2.2 Visual Design System

#### Color Palette

| Token                    | Value                   | Usage                                            |
| ------------------------ | ----------------------- | ------------------------------------------------ |
| `--color-primary`        | `#1E1B4B` (Indigo 950)  | Primary text, key UI elements                    |
| `--color-secondary`      | `#7C3AED` (Violet 600)  | Interactive elements, links, magical accents     |
| `--color-accent`         | `#10B981` (Emerald 500) | Success states, active connections ("enchanted") |
| `--color-accent-warn`    | `#F59E0B` (Amber 500)   | Warnings, pending states                         |
| `--color-accent-magic`   | `#A78BFA` (Violet 400)  | Highlights, special features, portal effects     |
| `--color-background`     | `#FAFAF9` (Stone 50)    | Page backgrounds (parchment-like)                |
| `--color-surface`        | `#FFFFFF`               | Cards, modals, elevated surfaces                 |
| `--color-surface-dark`   | `#1E1B4B` (Indigo 950)  | Dark mode surfaces, code blocks                  |
| `--color-text-primary`   | `#1C1917` (Stone 900)   | Body text                                        |
| `--color-text-secondary` | `#78716C` (Stone 500)   | Muted text, descriptions                         |
| `--color-error`          | `#DC2626` (Red 600)     | Error states, destructive actions                |
| `--color-success`        | `#059669` (Emerald 600) | Success states, healthy connections              |

#### Typography

| Element | Font Family    | Size | Weight | Line Height |
| ------- | -------------- | ---- | ------ | ----------- |
| H1      | Crimson Pro    | 36px | 700    | 1.2         |
| H2      | Crimson Pro    | 28px | 600    | 1.3         |
| H3      | Crimson Pro    | 20px | 600    | 1.4         |
| Body    | Inter          | 16px | 400    | 1.6         |
| Caption | Inter          | 14px | 400    | 1.5         |
| Code    | JetBrains Mono | 14px | 400    | 1.5         |

#### Iconography & Visual Language

- **Icon Style:** Lightly magical/fantasy-inspired rather than tech-focused (only use the magical replacements sparingly and retain commonly-accepted icon patterns like gears for settings). Think: spell books instead of documents, wands/staves for actions, runes for settings, crystals for data
- **Suggested Icon Sources:** Lucide (customized), custom SVG set, or fantasy-themed icon pack
- **Visual Motifs:** Subtle gradients suggesting portals/gateways, soft glows on active elements, parchment-like textures for cards
- **Integration Status Indicators:** Use magical states (e.g., "Enchanted" = connected, "Dormant" = inactive, "Cursed" = error)

#### Spacing & Layout

- Base unit: 4px
- Grid system: 12-column with 24px gutters
- Max content width: 1280px
- Breakpoints: 640px (sm), 768px (md), 1024px (lg), 1280px (xl)

### 2.3 Accessibility Standards

- **Compliance Level:** WCAG 2.1 AA
- **Keyboard Navigation:** Full keyboard support for all interactive elements
- **Screen Reader Support:** Semantic HTML, ARIA labels for complex components
- **Color Contrast Ratios:** Minimum 4.5:1 for body text, 3:1 for large text
- **Focus Indicators:** Visible 2px ring with offset for all focusable elements

### 2.4 Responsiveness Strategy

- **Approach:** Desktop-first (primary users are developers)
- **Breakpoints:**
  - Mobile: < 640px (read-only, limited configuration)
  - Tablet: 640px - 1024px (full functionality, adapted layout)
  - Desktop: > 1024px (optimal experience)

### 2.5 Interaction Patterns (V1.1+)

> **Note:** Detailed interaction design is deferred to V1.1. MVP through V1 will use sensible defaults from Shadcn/ui components.

**MVP Defaults:**

- **Loading States:** Simple spinners for actions, skeleton loaders where provided by Shadcn
- **Error Handling:** Toast notifications for errors, inline validation messages
- **Empty States:** Basic placeholder text with action buttons

**V1.1 Enhancements (Deferred):**

- Custom animations (150-300ms transitions, page fade/slide)
- Skeleton loaders for all content areas
- Modal confirmations for destructive actions
- Rich empty state illustrations with fantasy-themed artwork
- Micro-interactions on hover/focus for magical feel

---

## 3. Functional Requirements

### 3.1 Feature Overview Matrix

| Feature                               | Priority | Milestone | Complexity | Dependencies          |
| ------------------------------------- | -------- | --------- | ---------- | --------------------- |
| AI Documentation Scraper              | P0       | MVP       | HIGH       | None                  |
| Action Registry & Schema              | P0       | MVP       | HIGH       | Doc Scraper           |
| Authentication Framework (Multi-type) | P0       | MVP       | HIGH       | None                  |
| Token Refresh Management              | P0       | MVP       | MED        | Auth Framework        |
| Retry Logic & Error Handling          | P0       | MVP       | MED        | None                  |
| Gateway API                           | P0       | MVP       | MED        | All above             |
| Basic Configuration UI                | P0       | MVP       | MED        | Gateway API           |
| Basic Field Mapping                   | P1       | V0.5      | MED        | Action Registry       |
| Pagination Handler                    | P1       | V0.5      | MED        | Action Registry       |
| Response Validation                   | P1       | V0.5      | MED        | Action Registry       |
| Integration Tagging System            | P2       | V0.5      | LOW        | None                  |
| Multi-App Connections                 | P0       | V0.75     | HIGH       | V0.5                  |
| Hybrid Auth Model                     | P0       | V0.75     | HIGH       | Multi-App Connections |
| Continuous Integration Testing        | P0       | V0.75     | MED        | Gateway API           |
| Per-App Custom Mappings               | P1       | V0.75     | MED        | Field Mapping         |
| UI & Stability Cleanup                | P0       | V1        | MED        | V0.75                 |
| Smart Data Caching Layer              | P0       | V1.1      | HIGH       | V1                    |
| Async Job System                      | P0       | V1.1      | HIGH       | Caching Layer         |
| Complex Nested Data Handling          | P1       | V1.1      | MED        | Action Registry       |
| Batch Operations Support              | P1       | V1.1      | MED        | Async Jobs            |
| Enhanced Logging & Monitoring         | P1       | V1.1      | MED        | Gateway API           |
| Schema Drift Detection                | P1       | V2        | MED        | Versioning            |
| Auto-Maintenance System               | P0       | V2        | HIGH       | Schema Drift          |
| Versioning & Rollbacks                | P0       | V2.1      | HIGH       | V2                    |
| Just-in-Time Auth                     | P1       | V2.1      | HIGH       | Auth Framework        |
| Auto-generated Typed SDK              | P0       | V2.1      | HIGH       | Action Registry       |
| Copy-paste Code Generation            | P1       | V2.1      | MED        | Action Registry       |
| Intent-based Action Layer             | P0       | V2.1      | HIGH       | Typed SDK             |
| Sandbox/Production Environments       | P1       | V2.2      | MED        | V2.1                  |
| Full No-Code UI (Wizards)             | P1       | V2.2      | HIGH       | V2.1                  |
| RBAC & Team Management                | P1       | V2.2      | MED        | Auth Framework        |
| Webhook Ingestion                     | P1       | V2.3      | MED        | V2.2                  |
| LLM Tool Wrapping                     | P1       | V2.3      | MED        | Action Registry       |

### 3.2 Detailed Feature Specifications

---

#### Feature: AI Documentation Scraper

**User Story:**

> As a developer, I want to provide an API documentation URL and a wishlist of desired actions, so that Waygate can automatically understand and map the API's capabilities.

**Description:**  
The AI Documentation Scraper is the entry point for creating new integrations. It accepts a documentation URL (or set of URLs), crawls the relevant pages, extracts API specifications, and generates a structured understanding of available endpoints, authentication methods, request/response schemas, and rate limits.

**Requirements:**

- [ ] Accept documentation URL(s) as input
- [ ] Optionally accept OpenAPI/Swagger spec files directly
- [ ] Crawl and extract relevant pages from documentation sites
- [ ] Detect authentication methods (OAuth2, API Key, Basic Auth, Custom Headers)
- [ ] Extract endpoint definitions (method, path, parameters, body schema)
- [ ] Identify rate limit information from docs or headers
- [ ] Generate structured API capability map
- [ ] Allow user to provide a "wishlist" of desired actions to prioritize
- [ ] Support incremental re-scraping to detect changes

**Acceptance Criteria:**

- [ ] Given a Slack API docs URL, when scraped, then system identifies OAuth2 auth and key endpoints like `chat.postMessage`, `users.list`
- [ ] Given an OpenAPI spec file, when uploaded, then system parses it without needing to crawl
- [ ] Given a wishlist of "send message, list users, create channel", when scraped, then those actions are prioritized in the generated registry

**UI/UX Notes:**

- Wizard-style flow: URL input → Crawl progress → Review detected capabilities → Confirm actions
- Show AI confidence levels for detected capabilities
- Allow manual correction of any AI-inferred values

**Edge Cases:**

- **Docs behind authentication**: Prompt user for credentials or allow manual paste of content
- **Incomplete documentation**: Flag gaps, allow manual specification of missing details
- **Multiple API versions**: Detect and allow user to select target version

**Technical Notes:**

- Use Firecrawl for scraping (handles JS rendering, anti-bot, rate limits)
- Cache scraped content in Supabase Storage to avoid repeated fetches
- Use structured extraction prompts with Gemini 3 Pro optimized for API documentation patterns
- Support direct OpenAPI/Swagger spec upload as alternative to scraping

---

#### Feature: Action Registry & Schema

**User Story:**

> As a developer, I want each integration to expose a consistent, typed set of actions, so that I can interact with any API through a unified interface.

**Description:**  
The Action Registry is the core data model that normalizes diverse APIs into a consistent schema. Each integration exposes typed "Actions" (e.g., `slack.sendMessage`, `github.createIssue`) with defined inputs, outputs, and metadata.

**Requirements:**

- [ ] Define Action schema: `{ id, name, description, inputSchema, outputSchema, metadata }`
- [ ] Input/Output schemas use JSON Schema for type definitions
- [ ] Support required vs optional parameters
- [ ] Support parameter validation rules (min/max, patterns, enums)
- [ ] Include metadata: rate limits, idempotency, side effects
- [ ] Auto-generate action IDs following convention: `{integration}.{actionName}`
- [ ] Support action grouping/categorization within an integration
- [ ] Expose action discovery endpoint for consuming apps

**Acceptance Criteria:**

- [ ] Given a configured Slack integration, when listing actions, then returns typed actions like `slack.sendMessage` with full input/output schemas
- [ ] Given an action input that violates schema, when invoked, then returns validation error before making external call
- [ ] Given an action registry, when exported, then produces valid JSON Schema definitions

**UI/UX Notes:**

- Action browser with search and filter
- Schema visualization with example values
- "Try it" panel to test actions with sample data

**Edge Cases:**

- **Polymorphic responses**: Define union types or mark as `any` with documentation
- **File uploads**: Special handling for binary data parameters
- **Streaming responses**: Flag actions that return streams vs. complete responses

**Technical Notes:**

- Store schemas in PostgreSQL JSONB columns for flexibility
- Generate TypeScript types from JSON Schema for SDK generation
- Index action names and descriptions for search

---

#### Feature: Authentication Framework (Multi-type)

**User Story:**

> As a developer, I want Waygate to handle various authentication methods, so that I can connect to any API regardless of its auth requirements.

**Description:**  
A pluggable authentication system that supports multiple authentication types and manages credentials securely. Each integration defines its auth requirements, and consuming apps provide credentials that are securely stored and used for requests.

**Requirements:**

- [ ] Support OAuth2 (Authorization Code, Client Credentials, PKCE)
- [ ] Support API Key authentication (header, query param, or body)
- [ ] Support Basic Authentication
- [ ] Support Custom Header authentication
- [ ] Support Bearer Token authentication
- [ ] Securely store credentials (encrypted at rest)
- [ ] Per-tenant credential storage (consuming apps own their credentials)
- [ ] Credential validation on save
- [ ] Support multiple credential sets per integration (e.g., sandbox vs production)
- [ ] Support additional secret configuration (App IDs, signing secrets, environment flags)

**Acceptance Criteria:**

- [ ] Given an OAuth2 integration, when user initiates connection, then redirect flow completes and tokens are stored
- [ ] Given stored credentials, when retrieved for request, then they are decrypted only in memory
- [ ] Given invalid credentials, when tested, then clear error message is returned

**UI/UX Notes:**

- Guided connection flows per auth type
- Clear status indicators (connected, expired, error)
- Easy credential rotation interface

**Edge Cases:**

- **Multi-step OAuth**: Some providers require additional consent screens
- **Scope changes**: Handling re-authorization when required scopes change
- **Rate-limited auth endpoints**: Queue auth requests appropriately

**Technical Notes:**

- Use Supabase Vault or similar for credential encryption
- Never log credentials, even in error messages
- Implement credential refresh as background job

---

#### Feature: Token Refresh Management

**User Story:**

> As a developer, I want OAuth tokens to be automatically refreshed, so that my integrations don't break when tokens expire.

**Description:**  
Proactive token refresh system that monitors token expiration and refreshes credentials before they expire, ensuring uninterrupted API access.

**Requirements:**

- [ ] Track token expiration times
- [ ] Proactively refresh tokens before expiration (configurable buffer, default 5 min)
- [ ] Handle refresh token rotation (some providers issue new refresh tokens)
- [ ] Queue refresh operations to avoid race conditions
- [ ] Gracefully handle refresh failures with retry logic
- [ ] Alert on persistent refresh failures
- [ ] Support manual token refresh trigger

**Acceptance Criteria:**

- [ ] Given a token expiring in 5 minutes, when background job runs, then token is refreshed automatically
- [ ] Given a refresh token that was rotated, when refresh completes, then new refresh token is stored
- [ ] Given a refresh failure, when retries exhausted, then alert is generated and integration marked unhealthy

**UI/UX Notes:**

- Token health indicator on integration status
- Manual refresh button for debugging
- Expiration timeline visualization

**Edge Cases:**

- **Concurrent refresh attempts**: Use locking to prevent duplicate refreshes
- **Expired refresh token**: Require user re-authentication
- **Provider outage**: Exponential backoff with alerts

**Technical Notes:**

- Implement as periodic background job (every minute)
- Use database-level locking for refresh operations
- Log refresh events for debugging (without sensitive data)

---

#### Feature: Retry Logic & Error Handling

**User Story:**

> As a developer, I want Waygate to automatically handle transient failures, so that my applications are resilient without custom error handling code.

**Description:**  
Intelligent retry system with exponential backoff, rate limit detection, and circuit breaker patterns to ensure reliable API interactions.

**Requirements:**

- [ ] Configurable retry policies per integration/action
- [ ] Exponential backoff with jitter
- [ ] Detect rate limit responses (429, Retry-After headers)
- [ ] Implement circuit breaker pattern for persistent failures
- [ ] Pass-through option for errors (some apps want raw errors)
- [ ] Configurable error code mappings to unified codes
- [ ] Detailed error logging with request context
- [ ] Support idempotency keys for safe retries on write operations

**Acceptance Criteria:**

- [ ] Given a 429 response with Retry-After header, when received, then request is queued and retried after specified delay
- [ ] Given 5 consecutive failures, when circuit breaker threshold reached, then circuit opens and requests fail fast
- [ ] Given an idempotent action with idempotency key, when retried, then provider receives same key

**UI/UX Notes:**

- Retry policy configuration panel
- Real-time circuit breaker status
- Error log viewer with filtering

**Edge Cases:**

- **Non-standard rate limit headers**: Configurable header detection
- **Partial failures in batch operations**: Handle item-level vs request-level errors
- **Timeout vs failure**: Distinguish between timeouts and explicit errors

**Technical Notes:**

- Default retry policy: 3 attempts, exponential backoff starting at 1s
- Circuit breaker: Open after 5 failures in 30s, half-open after 60s
- Store retry metrics for observability

---

#### Feature: Pagination Handler

**User Story:**

> As a developer, I want Waygate to handle API pagination transparently, so that I can retrieve complete datasets without managing pagination logic.

**Description:**  
Automatic pagination handling that detects and handles different pagination strategies (cursor, offset, page number) to retrieve complete datasets.

**Requirements:**

- [ ] Support cursor-based pagination
- [ ] Support offset/limit pagination
- [ ] Support page number pagination
- [ ] Support Link header pagination (RFC 5988)
- [ ] Auto-detect pagination strategy from response
- [ ] Configurable max pages/items limit (safety guard)
- [ ] Option to stream pages vs. aggregate all results
- [ ] Respect rate limits during pagination

**Acceptance Criteria:**

- [ ] Given an action that returns paginated data, when invoked with `fetchAll: true`, then all pages are retrieved and combined
- [ ] Given pagination with cursor, when iterating, then cursor is automatically extracted and used for next request
- [ ] Given max items limit of 1000, when exceeded, then iteration stops and returns partial results with continuation token

**UI/UX Notes:**

- Pagination strategy selector in action configuration
- Preview of detected pagination fields
- Test pagination with sample requests

**Edge Cases:**

- **Inconsistent page sizes**: Handle APIs that return variable page sizes
- **Deleted items during pagination**: Note potential for duplicates/gaps
- **Circular pagination bugs**: Detect infinite loops

**Technical Notes:**

- Store pagination configuration per action
- Default max: 10 pages or 1000 items
- Support async iteration for memory efficiency

---

#### Feature: Response Validation

**User Story:**

> As a developer, I want API responses to be validated against expected schemas, so that malformed data doesn't crash my applications.

**Description:**  
Response validation layer that checks API responses against expected schemas and handles discrepancies gracefully.

**Requirements:**

- [ ] Validate responses against defined output schemas
- [ ] Configurable validation modes: strict, warn, lenient
- [ ] Handle unexpected null values gracefully
- [ ] Handle unexpected additional fields (ignore vs preserve)
- [ ] Detect type mismatches (string vs number, etc.)
- [ ] Generate validation error reports
- [ ] Support schema evolution (new optional fields)
- [ ] Detect schema drift (distinguish systematic failures from one-off errors)

**Acceptance Criteria:**

- [ ] Given a response missing a required field, when in strict mode, then validation error is returned
- [ ] Given a response with extra fields, when configured to preserve, then fields are included in output
- [ ] Given a type mismatch, when detected, then clear error message identifies the field and expected type
- [ ] Given consistent validation failures, when threshold reached, then alert suggests potential schema change

**UI/UX Notes:**

- Validation mode toggle per integration
- Validation error highlighting in response viewer
- Schema diff viewer for detecting API changes

**Edge Cases:**

- **Polymorphic responses**: Validate against appropriate sub-schema
- **Large responses**: Efficient validation without loading entire response
- **Binary data**: Skip validation for non-JSON responses

**Technical Notes:**

- Use Zod or similar for runtime validation
- Cache compiled validators for performance
- Log validation warnings for schema drift detection

---

#### Feature: Gateway API

**User Story:**

> As a developer, I want a unified API to invoke any configured action, so that I have a consistent interface regardless of which integration I'm using.

**Description:**  
The Gateway API is the primary interface for consuming applications. It provides a unified way to invoke actions, manage configurations, and monitor integration health.

**Requirements:**

- [ ] RESTful API design with consistent patterns
- [ ] POST `/actions/{integrationId}/{actionId}` - Invoke action
- [ ] GET `/integrations` - List configured integrations
- [ ] GET `/integrations/{id}/actions` - List available actions
- [ ] GET `/integrations/{id}/health` - Check integration health
- [ ] Support request/response in JSON format
- [ ] API key authentication for consuming apps
- [ ] Per-tenant request isolation
- [ ] Request logging and metrics

**Acceptance Criteria:**

- [ ] Given a valid action invocation, when processed, then external API is called and response returned in unified format
- [ ] Given an invalid integration ID, when invoked, then 404 with clear error message
- [ ] Given missing required parameters, when invoked, then 400 with validation errors

**UI/UX Notes:**

- Interactive API documentation (Swagger/OpenAPI)
- Request builder in UI for testing
- Copy-paste code snippets in multiple languages

**Edge Cases:**

- **Long-running requests**: Support async invocation with polling
- **Large payloads**: Streaming support for big responses
- **Concurrent requests**: Handle rate limits across parallel requests

**Technical Notes:**

- Implement as Next.js API routes initially
- Generate OpenAPI spec from route definitions
- Use middleware for auth, logging, rate limiting

---

#### Feature: Basic Configuration UI

**User Story:**

> As a developer, I want a web interface to configure and test integrations, so that I can set up and debug without writing code.

**Description:**  
Web-based dashboard for managing integrations, configuring actions, testing connections, and monitoring health.

**Requirements:**

- [ ] Integration list view with status indicators
- [ ] Integration detail view with configuration panels
- [ ] Action browser with search and documentation
- [ ] Connection setup wizards per auth type
- [ ] Field mapping configuration interface
- [ ] Action testing panel ("Try it")
- [ ] Request/response log viewer
- [ ] Basic health metrics dashboard

**Acceptance Criteria:**

- [ ] Given a new user, when accessing dashboard, then guided to create first integration
- [ ] Given an integration, when viewing actions, then full documentation and schemas displayed
- [ ] Given an action, when testing, then request is sent and response displayed with timing

**UI/UX Notes:**

- Clean, dev-tool aesthetic (think Supabase, Linear)
- Dark mode support
- Keyboard shortcuts for power users

**Edge Cases:**

- **Large action lists**: Virtual scrolling for performance
- **Complex schemas**: Collapsible nested schema display
- **Sensitive data**: Mask credentials in UI

**Technical Notes:**

- Next.js App Router with server components
- Shadcn/ui component library
- React Query for data fetching

---

#### Feature: Integration Tagging System

**User Story:**

> As a developer, I want to tag and organize my integrations, so that I can find and group them easily as my collection grows.

**Description:**  
Lightweight tagging system for categorizing integrations without imposing a rigid taxonomy.

**Requirements:**

- [ ] Free-form tags (user-defined)
- [ ] Suggested tags based on integration type (e.g., "communication", "crm", "storage")
- [ ] Filter integrations by tag
- [ ] Bulk tag management
- [ ] Tag-based access control (future consideration)

**Acceptance Criteria:**

- [ ] Given a new integration, when created, then AI suggests relevant tags
- [ ] Given multiple integrations, when filtered by tag, then only matching integrations shown
- [ ] Given a tag rename, when applied, then all integrations updated

**UI/UX Notes:**

- Tag autocomplete with existing tags
- Color-coded tags for visual distinction
- Tag cloud or filter sidebar

**Edge Cases:**

- **Tag cleanup**: Merge or delete unused tags
- **Tag limits**: Reasonable max tags per integration (e.g., 10)

**Technical Notes:**

- Simple many-to-many relationship in database
- Index tags for efficient filtering

---

## 4. User Flows

### 4.1 Integration Creation Flow

**Trigger:** User wants to add a new integration  
**Actor:** Solo Builder  
**Goal:** Create a working integration from API documentation

```
Landing/Dashboard → "New Integration" → Enter Doc URL & Wishlist
        ↓
   AI Scrapes Docs → Review Detected Capabilities → Select Actions
        ↓
   Configure Auth → Test Connection → Verify Actions
        ↓
   Customize Field Mappings (optional) → Save & Activate
```

**Steps:**

1. User clicks "New Integration" from dashboard
2. User enters API documentation URL(s) and optional wishlist of desired actions
3. System crawls documentation and displays progress
4. System presents detected capabilities with confidence indicators
5. User reviews and confirms which actions to include
6. User configures authentication (guided by detected auth type)
7. System tests connection and validates credentials
8. User optionally customizes field mappings
9. Integration is saved and activated

**Success State:** Integration appears in dashboard with "Healthy" status, actions are invocable via API  
**Failure States:** Scraping fails (manual entry fallback), Auth fails (retry with guidance), Validation fails (correct configuration)

---

### 4.2 Action Invocation Flow

**Trigger:** Consuming app needs to perform an action  
**Actor:** Consuming Application (via API)  
**Goal:** Execute action and receive response

```
API Request → Auth Check → Input Validation → Build Request
        ↓
   Execute (with retries) → Response Validation → Return Result
        ↓
   [On Error] → Retry Logic → Circuit Breaker → Error Response
```

**Steps:**

1. Consuming app sends POST to `/actions/{integration}/{action}`
2. Gateway validates API key and tenant context
3. Gateway validates input against action schema
4. Gateway builds request using integration configuration
5. Gateway executes request with retry logic
6. Gateway validates response against schema
7. Gateway returns normalized response

**Success State:** Consuming app receives expected response format  
**Failure States:** Auth error (401), Validation error (400), External API error (502), Rate limited (429)

---

### 4.3 Connection Setup Flow (OAuth2)

**Trigger:** User needs to connect OAuth2 integration  
**Actor:** Solo Builder (or end user in future)  
**Goal:** Establish authenticated connection to external service

```
Integration Config → "Connect" → Redirect to Provider
        ↓
   User Authorizes → Callback with Code → Exchange for Tokens
        ↓
   Store Tokens → Verify with Test Call → Connection Active
```

**Steps:**

1. User clicks "Connect" on integration requiring OAuth2
2. System generates OAuth URL with appropriate scopes
3. User is redirected to provider's authorization page
4. User grants authorization to Waygate
5. Provider redirects back with authorization code
6. System exchanges code for access/refresh tokens
7. System stores encrypted tokens
8. System makes test API call to verify
9. Connection status updated to "Active"

**Success State:** Integration shows "Connected" status, tokens stored securely  
**Failure States:** User denies authorization, Token exchange fails, Test call fails

---

### 4.4 Critical User Journeys

| Journey             | Entry Point        | Key Steps                                        | Success Metric                       |
| ------------------- | ------------------ | ------------------------------------------------ | ------------------------------------ |
| First Integration   | Onboarding wizard  | Enter docs URL → Review actions → Connect → Test | Integration active in < 10 minutes   |
| Action Invocation   | API call           | Send request → Receive response                  | < 500ms p95 latency overhead         |
| Debug Failed Action | Error notification | View logs → Identify issue → Test fix            | Root cause identified in < 5 minutes |
| Add Field Mapping   | Action config      | Select fields → Map → Test → Save                | Mapping active immediately           |

---

## 5. Milestones

### 5.1 MVP (Minimum Viable Product)

**Functionality Summary:** Create AI-powered integrations from API documentation with core execution infrastructure. Developer can input any API documentation, generate typed actions, configure authentication, and invoke actions through a unified API. Focus on getting the core loop working end-to-end.

**User Goals:**

- Create a working integration from any API documentation
- Invoke actions with proper authentication
- See what's happening when things work or fail

**Features Included:**
| Feature | Description | Acceptance Criteria |
|---------|-------------|---------------------|
| AI Documentation Scraper | Crawl and parse API docs to extract capabilities | Given any API docs URL, system identifies endpoints and auth methods |
| Action Registry | Store typed action definitions with schemas | All actions have validated input/output schemas |
| Multi-type Auth Framework | Support OAuth2, API Key, Basic Auth, Custom Headers | Can connect to any major API's auth requirements |
| Token Refresh | Automatic OAuth token refresh | Tokens refresh before expiration, no manual intervention |
| Retry & Error Handling | Exponential backoff, rate limit detection | Transient failures auto-retry, rate limits respected |
| Gateway API | Unified REST API for action invocation | Single endpoint pattern for all integrations |
| Basic Configuration UI | Web dashboard for setup and testing | Can create, configure, and test integrations in browser |

**Technical Scope:**

- Next.js 14 application with App Router
- Supabase for database (PostgreSQL) and authentication
- Firecrawl for documentation scraping
- LangChain with Google Gemini 3 Pro for AI document processing
- Tailwind CSS + Shadcn/ui for interface
- Zod for runtime validation
- Basic request logging to database

**Definition of Done:**

- Can create integration from Slack API documentation
- Actions invoke successfully with proper auth
- Basic retry logic handles transient failures
- Basic UI allows setup and testing workflow

---

### 5.2 V0.5 (Polish & Robustness) ✅ COMPLETE

**Functionality Summary:** Add the robustness features that make integrations production-ready. Pagination, response validation, field mapping, and organization features.

**User Goals:**

- Retrieve complete paginated datasets automatically
- Trust that responses are valid before using them
- Customize how data flows between Waygate and consuming apps
- Organize integrations as the collection grows

**Features Included:**
| Feature | Description | Acceptance Criteria |
|---------|-------------|---------------------|
| Pagination Handler | Auto-handle cursor, offset, page pagination | Full datasets retrievable without pagination code |
| Response Validation | Validate responses against schemas | Malformed responses caught before reaching app |
| Basic Field Mapping | Configure field transformations | Can rename/transform fields between API and consumer |
| Integration Tagging | Lightweight categorization | Can tag and filter integrations |

**Technical Scope:**

- Pagination detection and handling logic
- Zod-based response validation
- Field mapping configuration storage and runtime application
- Tag CRUD and filtering

**Definition of Done:**

- Can retrieve full paginated user list from Slack
- Invalid API responses caught and reported clearly
- Can map `user.email` → `emailAddress` in consuming app
- Can filter dashboard by integration tags

---

### 5.3 V0.75 (Multi-Tenancy & Expanded Capabilities)

**Functionality Summary:** Expand platform capabilities for multi-app support, streamlined authentication, continuous testing, and per-app configuration flexibility. Enable multiple consuming apps per integration with separate credentials, and introduce platform-owned OAuth apps for major providers.

**User Goals:**

- Connect multiple apps to the same integration with separate credentials
- Use platform-managed OAuth for major providers (one-click connect)
- Know immediately when integrations break via health checks
- Configure different field mappings for different consuming apps

**Features Included:**
| Feature | Description | Acceptance Criteria |
|---------|-------------|---------------------|
| Multi-App Connections | Multiple consuming apps per integration with separate credentials/baseUrls | Can connect App A and App B to same Slack integration |
| Hybrid Auth Model | Platform-owned OAuth apps for major providers + bring-your-own-app option | One-click connect for supported providers |
| Continuous Integration Testing | Scheduled health checks on all integrations | Early detection of API changes/failures |
| Per-App Custom Mappings | Consuming apps can define their own field mappings | Different apps need different data shapes |

**Technical Scope:**

- **PlatformConnector entity** (stores Waygate's OAuth app registrations for Slack, Google, Microsoft, etc.)
- **Connection entity** (links Integration + Credential to consuming App, enables per-app credential isolation)
- Platform OAuth app registration with major providers
- Compliance certification tracking (CASA, publisher verification)
- Shared rate limit management for platform connectors
- UI for "one-click connect" vs "bring your own credentials"
- Cron-based health check scheduler
- Per-app field mapping configuration

**Definition of Done:**

- Can connect multiple apps to same integration with different credentials
- Platform OAuth works for at least one major provider (e.g., Slack)
- Health checks run daily, alerts on failures
- Consuming apps can override field mappings

---

### 5.4 V1 (UI & Stability Cleanup)

**Functionality Summary:** Comprehensive cleanup pass focusing on service integration, UI polish, and stability. Ensure all services are working together seamlessly and configuration screens are organized into a more usable format.

**User Goals:**

- Experience a polished, professional UI
- Navigate configuration screens easily and logically
- Trust that all features work reliably together
- Find what they need without confusion

**Features Included:**
| Feature | Description | Acceptance Criteria |
|---------|-------------|---------------------|
| Service Integration | Verify all services connect and communicate properly | End-to-end flows work without manual intervention |
| Configuration UI Cleanup | Reorganize config screens for better usability | Clear navigation, logical grouping |
| Stability Pass | Fix edge cases, improve error handling | No critical bugs or broken workflows |
| Polish | Loading states, empty states, responsive design | Consistent UI patterns across all screens |

**Technical Scope:**

- Audit and fix service-to-service communication
- Reorganize configuration screen layouts
- Implement consistent loading/error states
- Improve responsive design
- Fix edge cases and error handling

**Definition of Done:**

- All services working together without manual intervention
- Configuration screens reorganized with clear navigation
- No critical bugs or broken workflows
- Consistent UI patterns across all screens

---

### 5.5 V1.1 (Scale & Reliability)

**Functionality Summary:** Add intelligent data caching, asynchronous operations, and enhanced configuration flexibility. Building on V0.75's multi-app foundation, V1.1 makes the system suitable for production applications with moderate scale.

**User Goals:**

- Reduce API calls through intelligent caching
- Handle bulk operations efficiently
- Monitor system health with enhanced logging
- Process long-running operations in the background

**Features Added/Evolved:**
| Feature | Change from MVP | Rationale |
|---------|-----------------|-----------|
| Smart Data Caching Layer | NEW - Configurable caching for slow-changing data (user lists, schemas, metadata) | Reduce API calls, improve latency |
| Async Job System | NEW - Background processing for long operations, batch imports | Handle bulk operations, rate limits |
| Complex Nested Data Handling | ENHANCED - Better support for deeply nested API responses | Handle real-world API complexity |
| Batch Operations Support | NEW - Queue and batch high-volume write operations | Avoid rate limits on bulk actions |
| Enhanced Logging & Monitoring | ENHANCED - Structured logs, basic metrics dashboard | Production observability |

**Technical Scope:**

- Upstash Redis for caching layer
- Trigger.dev or BullMQ for background job queue
- Per-tenant configuration storage
- Basic metrics collection and display

**Definition of Done:**

- Can configure cacheable actions with TTL
- Bulk imports complete via background jobs
- High-volume writes batched automatically
- Basic metrics dashboard showing system health

---

### 5.6 V2 (Maintenance & Safety)

**Functionality Summary:** Automatic maintenance and proactive API health monitoring. Keep integrations healthy through schema drift detection and AI-powered auto-maintenance.

**User Goals:**

- Integrations maintain themselves automatically
- Know when APIs change unexpectedly
- Background jobs handle bulk and scheduled operations

**Features Added/Evolved:**
| Feature | Change from V1.1 | Rationale |
|---------|------------------|-----------|
| Schema Drift Detection | NEW - Alert when API responses change from documented schema | Proactive issue detection |
| Auto-Maintenance System | NEW - Detect API changes, auto-update with approval workflow | Reduce manual maintenance burden |
| Async Job System | NEW - Background processing for long operations, scheduled tasks | Handle bulk operations, rate limits |
| Batch Operations | NEW - Queue and batch high-volume write operations | Avoid rate limits on bulk actions |
| End-User Auth Delegation | NEW - Per-app API keys, per-app OAuth credentials, app-scoped connections | Enable consuming apps to manage their own end-user auth |

**Technical Scope:**

- Scheduled documentation re-scraping
- Schema comparison and drift alerts
- Background job queue (Trigger.dev/BullMQ)
- App entity with dual-key auth resolution

**Definition of Done:**

- Alerts trigger when API schemas change
- Auto-updates proposed with approval workflow
- Background job system running scheduled tasks
- Apps can manage their own credentials and connections

---

### 5.7 V2.1 (Developer Experience & Ease)

**Functionality Summary:** Make building on Waygate dramatically easier than calling APIs directly. Auto-generated typed SDKs, provider-flexible intent system, instant code scaffolding, and production safety through versioning. This is the milestone that transforms Waygate from "integration infrastructure" to "integration infrastructure that actively makes consuming code simpler."

**User Goals:**

- Get full autocomplete and type safety for every configured integration
- Copy-paste working code for any action without reading external API docs
- Define provider-flexible intents (e.g., "send notification" across Slack, email, Discord)
- Roll back integration changes when updates cause problems
- Enable end users to authenticate on-demand

**Features Added/Evolved:**
| Feature | Change from V2 | Rationale |
|---------|----------------|-----------|
| Versioning & Rollbacks | NEW - Track integration versions, per-app pinning, instant rollback | Production safety and stability |
| Just-in-Time Auth | NEW - On-demand OAuth flows for end users | Enable user-facing integrations |
| Auto-generated Typed SDK | NEW - `npx waygate generate` produces per-tenant typed client with autocomplete | Eliminate schema lookup, make consumption faster than raw API calls |
| Copy-paste Code Generation | NEW - Per-action ready-to-use code snippets in multiple languages | Zero-friction action adoption |
| Intent-based Action Layer | NEW - Semantic grouping of actions by intent across integrations with developer-defined mappings | Provider flexibility without full unified API normalization |

**Technical Scope:**

- Version history storage and diff computation
- OAuth broker for JIT auth
- Code generation pipeline from action registry schemas
- Per-tenant typed client generation (TypeScript, Python)
- Intent definition and mapping system with runtime provider selection
- Per-action snippet generation in multiple languages/frameworks

**Definition of Done:**

- Can roll back to any previous version of an integration
- End users can authenticate via JIT OAuth flow
- `npx waygate generate` produces a typed client with full autocomplete for all configured integrations
- Every action in the registry has copy-paste code snippets available
- Can define an intent (e.g., "send notification") that maps to multiple providers and invoke it with runtime provider selection

---

### 5.8 V2.2 (Self-Service & Governance)

**Functionality Summary:** Enable non-technical users, expand access control, and add environment management. Full no-code experience with team collaboration and safe deployment workflows.

**User Goals:**

- Non-technical team members can configure integrations
- Control who can access and modify integrations
- Test changes safely before deploying to production
- Manage teams and permissions effectively

**Features Added/Evolved:**
| Feature | Change from V2.1 | Rationale |
|---------|------------------|-----------|
| Sandbox/Production Environments | NEW - Separate testing and production configurations | Safe testing, confident deployments |
| Full No-Code UI | ENHANCED - Wizard flows, guided setup, visual configuration | Enable non-technical users |
| RBAC & Team Management | NEW - Role-based access control, team invitations | Multi-user collaboration |

**Technical Scope:**

- Environment isolation in database
- Enhanced wizard flows with visual builders
- Role and permission system in database
- Team invitation and management flows

**Definition of Done:**

- Can switch integrations between sandbox and production
- Complete integration setup possible without touching code
- Can assign roles (owner, admin, developer, viewer)
- Team management UI fully functional

---

### 5.9 V2.3 (Ecosystem & Extensibility)

**Functionality Summary:** Expand platform extensibility through real-time event handling and deeper AI agent integration.

**User Goals:**

- Receive real-time events from external services via webhooks
- AI agents can use integrations as richly-typed tools

**Features Added/Evolved:**
| Feature | Change from V2.2 | Rationale |
|---------|------------------|-----------|
| Webhook Ingestion | NEW - Receive and route webhooks from external services | Real-time event handling |
| LLM Tool Wrapping | NEW - Export actions as LangChain-compatible tools | Power AI agent applications |

**Technical Scope:**

- Webhook endpoint router and security (signature verification)
- LangChain tool factory

**Definition of Done:**

- Webhooks route to consuming apps reliably with signature verification
- Can export any action as a LangChain tool definition

---

### 5.10 Not In Scope (Explicit Exclusions)

**Rationale:** Maintaining focus on core integration gateway functionality. These items may be valuable but would dilute focus or are better handled by specialized tools.

| Item                               | Reason for Exclusion                                               | Potential Future Milestone    |
| ---------------------------------- | ------------------------------------------------------------------ | ----------------------------- |
| Workflow Automation (Zapier-style) | Different product category; focus is on gateway, not orchestration | Never (different product)     |
| Pre-built Connector Marketplace    | Focus is on AI-generated integrations, not maintaining catalog     | V3 (if demand emerges)        |
| End-User Facing Widget             | Focus on developer/builder experience first                        | V3                            |
| GraphQL Gateway                    | REST first; GraphQL adds complexity                                | V3 (if demand emerges)        |
| Multi-Region Deployment            | Complexity vs. value for initial scale                             | V3                            |
| SOC2/HIPAA Compliance              | Required investment doesn't match initial use case                 | V3 (if selling to enterprise) |
| Native Mobile App                  | Web-first; mobile dashboard low priority                           | Never (web sufficient)        |

**Boundaries:**

- We will NOT build workflow orchestration or automation features
- We will NOT maintain a curated catalog of pre-built integrations
- We will NOT build end-user facing components (embeddable widgets, etc.)
- We will NOT support GraphQL as a gateway protocol in initial versions
- We will NOT pursue compliance certifications before V3

---

## 6. Engineering Design Requirements

### 6.1 System Architecture

#### Architecture Overview

**Pattern:** Modular Monolith (evolving toward microservices)  
**Description:** Single deployable application with clearly separated internal modules/services. This allows rapid development initially while maintaining clean boundaries for future extraction.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           Consuming Applications                         │
└─────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                             WAYGATE GATEWAY                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │
│  │   Gateway   │  │   Config    │  │    Auth     │  │    Admin    │    │
│  │     API     │  │     UI      │  │   Service   │  │   Console   │    │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘    │
│         │                │                │                │            │
│         └────────────────┴────────────────┴────────────────┘            │
│                                   │                                      │
│  ┌────────────────────────────────┴────────────────────────────────┐    │
│  │                        CORE SERVICES                             │    │
│  │  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐        │    │
│  │  │  Integration  │  │     AI        │  │   Execution   │        │    │
│  │  │    Engine     │  │   Service     │  │    Engine     │        │    │
│  │  └───────────────┘  └───────────────┘  └───────────────┘        │    │
│  │  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐        │    │
│  │  │    Cache      │  │     Job       │  │   Credential  │        │    │
│  │  │   Service     │  │    Queue      │  │    Vault      │        │    │
│  │  └───────────────┘  └───────────────┘  └───────────────┘        │    │
│  └──────────────────────────────────────────────────────────────────┘    │
│                                   │                                      │
│  ┌────────────────────────────────┴────────────────────────────────┐    │
│  │                        DATA LAYER                                │    │
│  │  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐        │    │
│  │  │   PostgreSQL  │  │     Redis     │  │    Object     │        │    │
│  │  │   (Supabase)  │  │    (Cache)    │  │   Storage     │        │    │
│  │  └───────────────┘  └───────────────┘  └───────────────┘        │    │
│  └──────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                          External APIs                                   │
│        (Slack, Google, Stripe, Salesforce, GitHub, etc.)                │
└─────────────────────────────────────────────────────────────────────────┘
```

#### Component Breakdown

| Component          | Responsibility                       | Technology                           | Milestone |
| ------------------ | ------------------------------------ | ------------------------------------ | --------- |
| Gateway API        | Request routing, auth, rate limiting | Next.js API Routes                   | MVP       |
| Config UI          | Web dashboard for configuration      | Next.js + React + Shadcn             | MVP       |
| Auth Service       | OAuth flows, credential management   | Custom + Supabase Auth               | MVP       |
| Integration Engine | Integration CRUD, schema management  | Custom TypeScript                    | MVP       |
| AI Service         | Documentation scraping, parsing      | Firecrawl + LangChain + Gemini 3 Pro | MVP       |
| Execution Engine   | Action invocation, retry logic       | Custom TypeScript                    | MVP       |
| Credential Vault   | Secure credential storage            | Supabase + encryption                | MVP       |
| Health Monitor     | Continuous integration testing       | Custom + Cron                        | V0.75     |
| Cache Service      | Smart caching layer                  | Upstash Redis                        | V1.1      |
| Job Queue          | Background job processing            | Trigger.dev or BullMQ                | V1.1      |

### 6.2 Technology Stack

#### Frontend

| Layer            | Technology              | Version | Rationale                                                |
| ---------------- | ----------------------- | ------- | -------------------------------------------------------- |
| Framework        | Next.js                 | 14.x    | App Router, Server Components, API routes in one package |
| State Management | React Query (TanStack)  | 5.x     | Excellent for API-heavy applications, caching built-in   |
| Styling          | Tailwind CSS            | 3.x     | Utility-first, excellent DX, matches Shadcn              |
| Components       | Shadcn/ui               | Latest  | High-quality, customizable, accessible components        |
| Build Tool       | Turbopack (via Next.js) | Latest  | Fast builds, integrated with Next.js                     |
| Form Handling    | React Hook Form + Zod   | Latest  | Type-safe forms with validation                          |
| Icons            | Lucide React            | Latest  | Consistent, clean icon set                               |

#### Backend

| Layer          | Technology                      | Version  | Rationale                                                             |
| -------------- | ------------------------------- | -------- | --------------------------------------------------------------------- |
| Runtime        | Node.js                         | 20.x LTS | Native fetch, good performance, wide ecosystem                        |
| Framework      | Next.js API Routes              | 14.x     | Unified deployment, no separate backend needed                        |
| ORM/Data Layer | Prisma                          | 5.x      | Type-safe queries, migrations, excellent DX                           |
| Validation     | Zod                             | 3.x      | Runtime validation matching TypeScript types                          |
| AI/LLM         | LangChain + Google Gemini 3 Pro | Latest   | Flexible LLM orchestration, tool ecosystem                            |
| Web Scraping   | Firecrawl                       | Latest   | Managed scraping service, handles JS rendering, anti-bot, rate limits |

#### Infrastructure

| Component         | Technology                   | Rationale                                                      |
| ----------------- | ---------------------------- | -------------------------------------------------------------- |
| Hosting           | Vercel                       | Integrated with Next.js, excellent DX, edge functions          |
| Database          | Supabase (PostgreSQL)        | Managed Postgres, built-in auth, real-time, row-level security |
| Cache             | Upstash Redis                | Serverless Redis, works well with Vercel (V1.1+)               |
| Object Storage    | Supabase Storage             | Integrated with Supabase, simple API                           |
| AI Models         | Google Gemini 3 Pro          | Primary model for doc parsing and action generation            |
| Web Scraping      | Firecrawl                    | Managed scraping, handles JS/anti-bot/rate-limits              |
| CI/CD             | Vercel (automatic)           | Zero-config deployments on push to main                        |
| Monitoring        | Vercel Analytics             | Built-in basics, sufficient for MVP                            |
| Secret Management | Vercel Environment Variables | Platform-integrated, simple for MVP                            |

### 6.3 Data Architecture

#### Data Models

```typescript
// Core entities

Tenant: {
  id: uuid,
  name: string,
  waygateApiKey: string (hashed),  // API key for accessing Waygate Gateway API
  createdAt: timestamp,
  settings: jsonb
}

Integration: {
  id: uuid,
  tenantId: uuid -> Tenant,
  name: string,
  slug: string,
  description: string,
  documentationUrl: string,
  authType: enum (oauth2, api_key, basic, custom_header, bearer),
  authConfig: jsonb,  // Non-sensitive config (scopes, endpoints, etc.)
  status: enum (draft, active, error, disabled),
  tags: string[],
  metadata: jsonb,
  createdAt: timestamp,
  updatedAt: timestamp
}

Action: {
  id: uuid,
  integrationId: uuid -> Integration,
  name: string,
  slug: string,
  description: string,
  httpMethod: enum (GET, POST, PUT, PATCH, DELETE),
  endpoint: string,
  inputSchema: jsonb (JSON Schema),
  outputSchema: jsonb (JSON Schema),
  paginationConfig: jsonb,
  retryConfig: jsonb,
  cacheable: boolean,
  cacheTtl: integer,
  metadata: jsonb,
  createdAt: timestamp,
  updatedAt: timestamp
}

// IntegrationCredential stores the EXTERNAL API credentials (OAuth tokens, API keys for Slack/Google/etc.)
// This is separate from Tenant.waygateApiKey which is for accessing Waygate itself
IntegrationCredential: {
  id: uuid,
  integrationId: uuid -> Integration,
  tenantId: uuid -> Tenant,
  type: enum (oauth2_tokens, api_key, basic, custom),
  encryptedData: bytea,  // Encrypted: access_token, api_key, password, secrets map (app_id, signing_secret)
  expiresAt: timestamp,
  refreshToken: bytea (encrypted),
  scopes: string[],
  status: enum (active, expired, revoked),
  createdAt: timestamp,
  updatedAt: timestamp
}

FieldMapping: {
  id: uuid,
  actionId: uuid -> Action,
  tenantId: uuid -> Tenant (nullable for defaults),
  sourceField: string,
  targetField: string,
  transform: jsonb,
  createdAt: timestamp
}

RequestLog: {
  id: uuid,
  tenantId: uuid -> Tenant,
  integrationId: uuid -> Integration,
  actionId: uuid -> Action,
  requestData: jsonb (sanitized),
  responseData: jsonb (sanitized),
  statusCode: integer,
  latencyMs: integer,
  retryCount: integer,
  error: jsonb,
  createdAt: timestamp
}
```

#### Credential Model Clarification

There are **two distinct types of API keys** in Waygate:

1. **Waygate API Key** (`Tenant.waygateApiKey`): Used by consuming apps to authenticate with the Waygate Gateway API. This is what you include in the `Authorization` header when calling Waygate endpoints.

2. **Integration Credentials** (`IntegrationCredential`): The OAuth tokens, API keys, or other credentials for the _external_ services (Slack, Google, Stripe, etc.). These are stored encrypted and used by Waygate when making requests to external APIs on behalf of the tenant.

```
┌─────────────────────┐                    ┌─────────────────────┐
│   Consuming App     │                    │   External API      │
│   (Your App)        │                    │   (Slack, Google)   │
└─────────┬───────────┘                    └──────────▲──────────┘
          │                                           │
          │ Waygate API Key                           │ Integration Credential
          │ (Tenant.waygateApiKey)                    │ (OAuth token, API key)
          ▼                                           │
┌─────────────────────────────────────────────────────┴──────────┐
│                         WAYGATE                                 │
│   Authenticates consuming app, then uses stored integration     │
│   credentials to call external APIs                             │
└─────────────────────────────────────────────────────────────────┘
```

#### Database Schema Overview

| Table/Collection        | Purpose                                               | Key Fields                                   | Relationships                                  |
| ----------------------- | ----------------------------------------------------- | -------------------------------------------- | ---------------------------------------------- |
| tenants                 | Multi-tenant isolation                                | id, name, waygateApiKey                      | Has many integrations, integration_credentials |
| integrations            | Integration definitions                               | id, tenantId, name, authType                 | Belongs to tenant, has many actions            |
| actions                 | Action definitions with schemas                       | id, integrationId, inputSchema, outputSchema | Belongs to integration                         |
| integration_credentials | Encrypted OAuth/API credentials for external services | id, integrationId, encryptedData             | Belongs to integration and tenant              |
| field_mappings          | Custom field transformations                          | id, actionId, sourceField, targetField       | Belongs to action, optionally tenant           |
| request_logs            | Audit trail and debugging                             | id, requestData, responseData, latencyMs     | Belongs to tenant, integration, action         |
| tags                    | Integration categorization (V0.5)                     | id, name, color                              | Many-to-many with integrations                 |
| integration_tags        | Tag associations (V0.5)                               | integrationId, tagId                         | Join table                                     |

#### Data Flow

1. **Integration Creation**: User submits docs URL → AI Service scrapes → Integration Engine creates records → UI displays for review
2. **Action Invocation**: Gateway receives request → Validates input → Execution Engine calls external API → Response validated → Logged → Returned
3. **Token Refresh**: Background job checks expiring tokens → Auth Service refreshes → Credential updated in vault

### 6.4 API Design

#### API Style

**Type:** REST  
**Versioning Strategy:** URL Path (`/api/v1/...`)  
**Authentication:** API Key (Bearer token in header)

#### Key Endpoints/Operations

**Tenant Management:**
| Endpoint | Method | Purpose | Auth Required |
|----------|--------|---------|---------------|
| `/api/v1/tenants` | POST | Create new tenant | Admin |
| `/api/v1/tenants/:id` | GET | Get tenant details | Admin/Owner |

**Integration Management:**
| Endpoint | Method | Purpose | Auth Required |
|----------|--------|---------|---------------|
| `/api/v1/integrations` | GET | List integrations | Yes |
| `/api/v1/integrations` | POST | Create integration | Yes |
| `/api/v1/integrations/:id` | GET | Get integration details | Yes |
| `/api/v1/integrations/:id` | PATCH | Update integration | Yes |
| `/api/v1/integrations/:id` | DELETE | Delete integration | Yes |
| `/api/v1/integrations/:id/actions` | GET | List integration actions | Yes |
| `/api/v1/integrations/:id/health` | GET | Check integration health | Yes |
| `/api/v1/integrations/:id/connect` | POST | Initiate OAuth flow | Yes |
| `/api/v1/integrations/:id/disconnect` | POST | Revoke credentials | Yes |

**Action Invocation:**
| Endpoint | Method | Purpose | Auth Required |
|----------|--------|---------|---------------|
| `/api/v1/actions/:integrationSlug/:actionSlug` | POST | Invoke action | Yes |
| `/api/v1/actions/:integrationSlug/:actionSlug/schema` | GET | Get action schema | Yes |
| `/api/v1/actions/:integrationSlug/:actionSlug/test` | POST | Test action (dry run) | Yes |

**AI/Scraping:**
| Endpoint | Method | Purpose | Auth Required |
|----------|--------|---------|---------------|
| `/api/v1/scrape` | POST | Initiate doc scraping | Yes |
| `/api/v1/scrape/:jobId` | GET | Get scrape job status | Yes |

**Logs/Monitoring:**
| Endpoint | Method | Purpose | Auth Required |
|----------|--------|---------|---------------|
| `/api/v1/logs` | GET | Query request logs | Yes |
| `/api/v1/metrics` | GET | Get integration metrics | Yes |

#### Request/Response Standards

- **Format:** JSON
- **Error Format:**

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human-readable description",
    "details": { "field": "value", "reason": "specific issue" },
    "requestId": "uuid-for-debugging",
    "suggestedResolution": {
      "action": "RETRY_WITH_MODIFIED_INPUT",
      "description": "The 'channel' parameter must be a valid Slack channel ID starting with 'C'. Try using the slack.listChannels action to get valid channel IDs.",
      "retryable": true,
      "retryAfterMs": null
    }
  }
}
```

**Suggested Resolution Actions:**
| Action | Description | Retryable |
|--------|-------------|-----------|
| `RETRY_WITH_MODIFIED_INPUT` | Input validation failed; fix the specified fields | Yes |
| `RETRY_AFTER_DELAY` | Rate limited; wait and retry | Yes |
| `REFRESH_CREDENTIALS` | Auth expired; trigger re-authentication flow | Yes (after auth) |
| `CHECK_INTEGRATION_CONFIG` | Integration misconfigured; review settings in dashboard | No |
| `CONTACT_EXTERNAL_PROVIDER` | External API error not caused by Waygate | No |
| `ESCALATE_TO_ADMIN` | Internal Waygate error; needs investigation | No |

This format is designed to be **LLM-friendly** — an AI agent reading this error can determine whether to retry, how to modify inputs, or how to communicate the issue to a user.

- **Pagination:** Cursor-based

```json
{
  "data": [...],
  "pagination": {
    "cursor": "next_cursor_value",
    "hasMore": true,
    "totalCount": 100
  }
}
```

### 6.5 Authentication & Authorization

#### Authentication Strategy

- **Method:** API Key authentication for consuming apps; Supabase Auth (email/OAuth) for dashboard users
- **Session Management:** JWT tokens with extended expiry for dashboard, API keys are long-lived
- **Token Lifetime:**
  - Dashboard access token: 7 days
  - Dashboard refresh token: 30 days
  - Waygate API keys: No expiry (manually revocable)
- **Refresh Strategy:** Dashboard uses refresh tokens; Waygate API keys are static until revoked

#### Authorization Model (MVP)

- **Type:** Simple tenant isolation (single-user per tenant)
- **Permission Structure:**
  - All resources scoped to tenant
  - Row-Level Security (RLS) in Supabase for database-level enforcement
  - Single owner role with full access

#### Authorization Model (V2.1 - Deferred)

- **Type:** RBAC (Role-Based Access Control)
- **Roles (V2.1):**
  - `owner`: Full access to tenant resources
  - `admin`: Manage integrations and settings
  - `developer`: Invoke actions, view logs
  - `viewer`: Read-only access
- **Permission Structure (V2.1):**
  - Fine-grained permissions per integration
  - Team invitations and role assignment
  - Audit trail for permission changes

### 6.6 Third-Party Integrations

| Service             | Purpose                                   | Integration Method | Criticality       |
| ------------------- | ----------------------------------------- | ------------------ | ----------------- |
| Supabase            | Database, Auth, Storage                   | SDK                | CRITICAL          |
| Google Gemini 3 Pro | AI document processing, action generation | API                | CRITICAL          |
| Firecrawl           | Web scraping for API documentation        | API                | CRITICAL          |
| Vercel              | Hosting, Edge functions                   | Platform           | CRITICAL          |
| Upstash             | Redis caching (V1.1+)                     | SDK                | IMPORTANT (V1.1+) |
| Resend              | Transactional email (alerts)              | API                | NICE_TO_HAVE      |

### 6.7 Security Requirements

#### Security Measures

- [x] **Data Encryption:** BOTH - Supabase encrypts at rest; TLS 1.3 in transit
- [x] **Input Validation:** Zod schemas for all API inputs, sanitization for logs
- [x] **SQL Injection Prevention:** Prisma ORM with parameterized queries
- [x] **XSS Prevention:** React's built-in escaping, CSP headers
- [x] **CSRF Protection:** SameSite cookies, CSRF tokens for mutations
- [x] **Rate Limiting:** Per-tenant limits on Gateway API (100 req/min default)
- [x] **Resource Quotas:** Limits on concurrent scraping jobs and expensive operations
- [x] **Audit Logging:** All API invocations logged with tenant context

#### Sensitive Data Handling

| Data Type           | Classification | Storage                            | Access Control                        |
| ------------------- | -------------- | ---------------------------------- | ------------------------------------- |
| API Keys (tenant)   | SENSITIVE      | Hashed (bcrypt)                    | Only for authentication               |
| OAuth Tokens        | SENSITIVE      | Encrypted (AES-256)                | Decrypted only in-memory for requests |
| Integration Configs | INTERNAL       | Plain (no secrets)                 | Tenant-scoped RLS                     |
| Request Logs        | INTERNAL       | Sanitized (no auth headers/tokens) | Tenant-scoped RLS                     |
| User Passwords      | PII            | Handled by Supabase Auth           | Never stored directly                 |

### 6.8 Error Handling & Logging

#### Error Handling Strategy

- **Client Errors (4xx):** Return detailed error with field-level issues, don't retry
- **Server Errors (5xx):** Log full context, return generic message, alert if persistent
- **Network Errors:** Retry with exponential backoff (3 attempts, 1s/2s/4s)
- **Retry Logic:** Configurable per integration; default 3 attempts with exponential backoff and jitter

#### Logging Standards

| Log Level | When to Use                        | Example                                    |
| --------- | ---------------------------------- | ------------------------------------------ |
| ERROR     | Unrecoverable failures, exceptions | "OAuth token refresh failed after retries" |
| WARN      | Recoverable issues, deprecations   | "Rate limit approaching for integration X" |
| INFO      | Key business events                | "Action invoked: slack.sendMessage"        |
| DEBUG     | Detailed execution flow            | "Retry attempt 2 for request X"            |

#### Monitoring & Observability

- **APM Tool:** Vercel Analytics (basic), consider Sentry for V1.1+
- **Log Aggregation:** Vercel Logs (basic), consider Axiom for V1.1+
- **Alerting:** Email alerts for: integration health failures, auth failures, error rate spikes

### 6.9 Testing Strategy

| Test Type         | Coverage Target     | Tools                    | Responsibility |
| ----------------- | ------------------- | ------------------------ | -------------- |
| Unit Tests        | 80%+ for core logic | Vitest                   | Developer      |
| Integration Tests | Critical paths      | Vitest + MSW             | Developer      |
| E2E Tests         | Happy paths         | Playwright               | Developer      |
| API Tests         | All endpoints       | Thunder Client / Postman | Developer      |
| Performance Tests | Latency benchmarks  | k6 (V1.1+)               | Developer      |

### 6.10 DevOps & Deployment

#### Environments

| Environment | Purpose                | URL                 | Data                        |
| ----------- | ---------------------- | ------------------- | --------------------------- |
| Development | Local development      | localhost:3000      | Seed data                   |
| Preview     | PR previews            | \*.vercel.app       | Seed data                   |
| Staging     | Pre-production testing | staging.waygate.dev | Production copy (sanitized) |
| Production  | Live system            | app.waygate.dev     | LIVE                        |

#### Deployment Strategy

- **Method:** Rolling (Vercel default - instant, zero-downtime)
- **Rollback Plan:** Vercel instant rollback to previous deployment
- **Feature Flags:** Environment variables initially; consider LaunchDarkly for V2+

#### CI/CD Pipeline

```
Push to main → GitHub Actions (lint, type-check, test) → Vercel Build → Deploy Preview
                                    ↓
                         On merge: Deploy to Production
```

---

## 7. Non-Functional Requirements

### 7.1 Performance Requirements

| Metric                    | Target                        | Measurement Method                                        |
| ------------------------- | ----------------------------- | --------------------------------------------------------- |
| Gateway Overhead          | < 200ms p50, < 500ms p95      | Time from request received to external API call initiated |
| Page Load Time (LCP)      | < 2.5s                        | Vercel Analytics                                          |
| Time to Interactive (TTI) | < 3.5s                        | Vercel Analytics                                          |
| API Response Time (p50)   | < 200ms (excluding external)  | Custom metrics                                            |
| API Response Time (p99)   | < 1000ms (excluding external) | Custom metrics                                            |
| Database Query Time       | < 50ms p95                    | Prisma metrics                                            |

### 7.2 Scalability Requirements

| Dimension           | MVP Target | V1.1 Target | Scaling Strategy           |
| ------------------- | ---------- | ----------- | -------------------------- |
| Concurrent Users    | 10         | 100         | Vercel auto-scaling        |
| Integrations        | 20         | 100         | Database indexing          |
| Actions/Integration | 50         | 100         | Lazy loading, pagination   |
| Requests/Second     | 10         | 100         | Vercel Edge, caching       |
| Data Volume         | 1GB        | 10GB        | Supabase scaling, archival |

### 7.3 Reliability & Availability

- **Target Uptime:** 99.5% (allows ~3.6 hours downtime/month)
- **RTO (Recovery Time Objective):** 1 hour
- **RPO (Recovery Point Objective):** 1 hour (Supabase daily backups + WAL)
- **Backup Strategy:** Supabase automatic daily backups, point-in-time recovery
- **Disaster Recovery Plan:** Redeploy from Git + restore Supabase backup

### 7.4 Browser & Device Support

| Browser | Minimum Version | Priority |
| ------- | --------------- | -------- |
| Chrome  | Last 2 versions | P0       |
| Safari  | Last 2 versions | P1       |
| Edge    | Last 2 versions | P1       |

| Device Type | Support Level | Notes                     |
| ----------- | ------------- | ------------------------- |
| Desktop     | FULL          | Primary target            |
| Tablet      | FULL          | Responsive layout         |
| Mobile      | PARTIAL       | Read-only, limited config |

### 7.5 Internationalization & Localization

- **Supported Languages:** English only (MVP)
- **Default Language:** English
- **RTL Support:** No (future consideration)
- **Date/Time Formats:** ISO 8601 in API, locale-aware in UI
- **Currency Support:** N/A (not handling financial data)

---

## Appendix A: Glossary

| Term                       | UI Label      | Definition                                                                                          |
| -------------------------- | ------------- | --------------------------------------------------------------------------------------------------- |
| **Action**                 | Spell         | A single operation that can be performed through an integration (e.g., `sendMessage`, `listUsers`)  |
| **Consuming App**          | Summoner      | An application that uses Waygate's Gateway API to access integrations                               |
| **Integration**            | Portal        | A configured connection to an external API (e.g., Slack, Google Workspace)                          |
| **Tenant**                 | Realm         | An isolated account in Waygate, typically representing one user or organization                     |
| **Gateway**                | The Gate      | The unified API layer that consuming apps interact with                                             |
| **Field Mapping**          | Transmutation | Configuration that transforms data between Waygate's schema and the consuming app's expected format |
| **Action Registry**        | Grimoire      | The catalog of all available actions across all integrations                                        |
| **Integration Credential** | Binding       | The OAuth tokens or API keys that connect Waygate to an external service                            |
| **Connected Status**       | Enchanted     | An integration with valid, working credentials                                                      |
| **Error Status**           | Cursed        | An integration experiencing failures                                                                |
| **Inactive Status**        | Dormant       | An integration that is configured but not currently active                                          |

> **Note:** Fantasy-themed UI labels are optional flavor. API responses and technical documentation use standard terminology. The UI can toggle between "fantasy mode" and "standard mode" if needed.

## Appendix B: Open Questions

| Question                                                          | Context                                       | Decision Needed By |
| ----------------------------------------------------------------- | --------------------------------------------- | ------------------ |
| Should we support custom JavaScript transforms in field mappings? | More powerful but security risk               | V1.1 planning      |
| What's the strategy for handling webhooks from external APIs?     | Need endpoint management, security            | V2.2 planning      |
| Should rate limits be configurable per-tenant or fixed?           | Flexibility vs complexity                     | MVP finalization   |
| How do we handle integrations that require on-premise deployment? | Some enterprise APIs don't allow cloud access | V3 (if ever)       |

## Appendix C: References

- [Merge.dev](https://merge.dev) - Unified API platform for integrations
- [Arcade.dev](https://arcade.dev) - AI agent tool execution platform
- [OpenAPI Specification](https://swagger.io/specification/) - API documentation standard
- [JSON Schema](https://json-schema.org/) - Schema definition standard
- [LangChain](https://langchain.com/) - LLM application framework
