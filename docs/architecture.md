# Technical Architecture: Waygate

> **Purpose:** This is the Engineering Design Document (EDD) — the "How" of implementation. It serves as the technical reference for AI coding assistants and human developers alike. For product requirements and the "What," see `product_spec.md`.

---

## 1. Tech Stack Definition

### 1.1 Frontend Stack

| Layer             | Technology         | Version       | Package Name            | Rationale                                             |
| ----------------- | ------------------ | ------------- | ----------------------- | ----------------------------------------------------- |
| Framework         | Next.js            | 14.x          | `next`                  | App Router, Server Components, API routes unified     |
| Language          | TypeScript         | 5.x           | `typescript`            | Type safety, better DX, self-documenting              |
| State Management  | Zustand            | 4.x           | `zustand`               | Lightweight, simple API, works with Server Components |
| Data Fetching     | TanStack Query     | 5.x           | `@tanstack/react-query` | Caching, deduplication, optimistic updates            |
| Routing           | Next.js App Router | 14.x          | (built-in)              | File-based routing, layouts, loading states           |
| Styling           | Tailwind CSS       | 3.x           | `tailwindcss`           | Utility-first, matches Shadcn, fast iteration         |
| Component Library | Shadcn/ui          | Latest        | (copy-paste)            | High-quality, customizable, accessible                |
| Form Handling     | React Hook Form    | 7.x           | `react-hook-form`       | Performant, minimal re-renders                        |
| Validation        | Zod                | 3.x           | `zod`                   | Runtime validation, TypeScript inference              |
| Build Tool        | Turbopack          | (via Next.js) | (built-in)              | Fast builds, HMR                                      |
| Package Manager   | pnpm               | 8.x           | —                       | Fast, disk-efficient, strict                          |

### 1.2 Backend Stack

| Layer            | Technology         | Version  | Package Name            | Rationale                                     |
| ---------------- | ------------------ | -------- | ----------------------- | --------------------------------------------- |
| Runtime          | Node.js            | 20.x LTS | —                       | Native fetch, stable, wide ecosystem          |
| Language         | TypeScript         | 5.x      | `typescript`            | Shared types with frontend                    |
| Framework        | Next.js API Routes | 14.x     | `next`                  | Unified deployment, no separate backend       |
| API Style        | REST               | —        | —                       | Simple, well-understood, fits gateway pattern |
| ORM / Data Layer | Prisma             | 5.x      | `prisma`                | Type-safe queries, migrations, great DX       |
| Validation       | Zod                | 3.x      | `zod`                   | Shared validation schemas frontend/backend    |
| Authentication   | Supabase Auth      | Latest   | `@supabase/supabase-js` | Built-in, handles OAuth flows                 |
| Job Queue        | Trigger.dev        | 3.x      | `@trigger.dev/sdk`      | Serverless-native, Vercel-compatible (V1)     |
| AI/LLM           | LangChain          | Latest   | `langchain`             | Flexible LLM orchestration                    |

### 1.3 Database & Storage

| Component        | Technology       | Version/Tier | Hosted By | Rationale                                 |
| ---------------- | ---------------- | ------------ | --------- | ----------------------------------------- |
| Primary Database | PostgreSQL       | 15.x         | Supabase  | Managed, RLS built-in, real-time          |
| Cache Layer      | Upstash Redis    | Serverless   | Upstash   | Serverless Redis, Vercel-compatible (V1+) |
| File Storage     | Supabase Storage | —            | Supabase  | Integrated, simple API                    |
| Vector Database  | —                | —            | —         | Not needed for MVP                        |

### 1.4 Infrastructure & DevOps

| Component          | Technology                   | Tier/Plan     | Rationale                                               |
| ------------------ | ---------------------------- | ------------- | ------------------------------------------------------- |
| Hosting            | Vercel                       | Pro           | Integrated with Next.js, edge functions, zero-config    |
| Database           | Supabase                     | Pro           | Managed Postgres, auth, storage in one                  |
| AI Models          | Google Gemini                | Pay-as-you-go | Cost-effective, good for structured extraction          |
| Web Scraping       | Firecrawl                    | Pay-as-you-go | Handles JS rendering, anti-bot, existing LangChain tool |
| CI/CD              | Vercel + GitHub Actions      | Free tier     | Auto-deploy on push, PR previews                        |
| DNS                | Vercel                       | (included)    | Automatic SSL, simple                                   |
| Secrets Management | Vercel Environment Variables | (included)    | Simple for MVP, no extra accounts                       |

### 1.5 Observability & Monitoring

| Component         | Technology        | Tier/Plan  | Purpose                                |
| ----------------- | ----------------- | ---------- | -------------------------------------- |
| Error Tracking    | Vercel (built-in) | (included) | Basic error visibility (MVP)           |
| APM / Tracing     | —                 | —          | Defer to V1 (Sentry or similar)        |
| Log Aggregation   | Vercel Logs       | (included) | Basic logs for MVP                     |
| Uptime Monitoring | —                 | —          | Defer to V1 (Better Uptime or similar) |
| Analytics         | Vercel Analytics  | (included) | Core Web Vitals, basic usage           |

### 1.6 Development Tools

| Tool                  | Purpose             | Configuration File           |
| --------------------- | ------------------- | ---------------------------- |
| Linter                | ESLint              | `eslint.config.mjs`          |
| Formatter             | Prettier            | `.prettierrc`                |
| Type Checker          | TypeScript          | `tsconfig.json`              |
| Test Runner           | Vitest              | `vitest.config.ts`           |
| Git Hooks             | Husky + lint-staged | `.husky/`, `package.json`    |
| Environment Variables | dotenv              | `.env.local`, `.env.example` |

---

## 2. System Architecture

### 2.1 Architecture Pattern

**Pattern:** MODULAR_MONOLITH

**Description:**  
Single Next.js application with clearly separated internal modules. This enables rapid MVP development while maintaining clean boundaries for future service extraction. The architecture prioritizes:

1. **Module isolation** — Each domain (integrations, execution, AI) is self-contained
2. **Clear interfaces** — Modules communicate through well-defined TypeScript interfaces
3. **Extraction-ready** — Any module can become a separate service without rewriting

**Future Evolution Path:**

- MVP → V1: Add Redis for state persistence, background jobs via Trigger.dev
- V1 → V2: Extract Execution Engine to dedicated service if latency/scale requires

### 2.2 High-Level Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           CONSUMING APPLICATIONS                             │
│            (Your apps that use Waygate to access integrations)               │
└─────────────────────────────────────────────────────────────────────────────┘
                                       │
                                       │ Waygate API Key
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              WAYGATE PLATFORM                                │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                         EDGE / API LAYER                               │  │
│  │   ┌─────────────┐   ┌─────────────┐   ┌─────────────────────────┐     │  │
│  │   │   Gateway   │   │   Config    │   │      OAuth Callback     │     │  │
│  │   │  Endpoints  │   │     API     │   │        Handler          │     │  │
│  │   │ (Edge Fn)   │   │  (Node.js)  │   │       (Node.js)         │     │  │
│  │   └──────┬──────┘   └──────┬──────┘   └───────────┬─────────────┘     │  │
│  └──────────┼─────────────────┼──────────────────────┼───────────────────┘  │
│             │                 │                      │                       │
│  ┌──────────┼─────────────────┼──────────────────────┼───────────────────┐  │
│  │          ▼                 ▼                      ▼                   │  │
│  │                        CORE MODULES                                   │  │
│  │   ┌─────────────────────────────────────────────────────────────┐    │  │
│  │   │                    REQUEST PIPELINE                          │    │  │
│  │   │  Auth → Validate → Transform → Execute → Validate → Return   │    │  │
│  │   └─────────────────────────────────────────────────────────────┘    │  │
│  │                                                                       │  │
│  │   ┌───────────────┐   ┌───────────────┐   ┌───────────────┐          │  │
│  │   │  Integration  │   │   Execution   │   │      AI       │          │  │
│  │   │    Engine     │   │    Engine     │   │   Service     │          │  │
│  │   │               │   │               │   │               │          │  │
│  │   │ • CRUD ops    │   │ • HTTP client │   │ • Doc scraper │          │  │
│  │   │ • Schema mgmt │   │ • Retry logic │   │ • Schema gen  │          │  │
│  │   │ • Action reg  │   │ • Circuit brk │   │ • Action map  │          │  │
│  │   └───────────────┘   └───────────────┘   └───────────────┘          │  │
│  │                                                                       │  │
│  │   ┌───────────────┐   ┌───────────────┐   ┌───────────────┐          │  │
│  │   │  Credential   │   │    Auth       │   │    Logging    │          │  │
│  │   │    Vault      │   │   Service     │   │   Service     │          │  │
│  │   │               │   │               │   │               │          │  │
│  │   │ • Encrypt/dec │   │ • OAuth flows │   │ • Request log │          │  │
│  │   │ • Token store │   │ • Token refr  │   │ • Audit trail │          │  │
│  │   │ • Rotation    │   │ • API key val │   │ • Metrics     │          │  │
│  │   └───────────────┘   └───────────────┘   └───────────────┘          │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                       │                                      │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                           DATA LAYER                                   │  │
│  │   ┌───────────────┐   ┌───────────────┐   ┌───────────────┐          │  │
│  │   │   PostgreSQL  │   │    Redis      │   │   Supabase    │          │  │
│  │   │   (Supabase)  │   │  (Upstash)    │   │   Storage     │          │  │
│  │   │               │   │    [V1+]      │   │               │          │  │
│  │   │ • Integrations│   │ • Cache       │   │ • Scraped docs│          │  │
│  │   │ • Actions     │   │ • Rate limits │   │ • Exports     │          │  │
│  │   │ • Credentials │   │ • Circuit st  │   │               │          │  │
│  │   │ • Logs        │   │               │   │               │          │  │
│  │   └───────────────┘   └───────────────┘   └───────────────┘          │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
                                       │
                                       │ Integration Credentials
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            EXTERNAL APIs                                     │
│         (Slack, Google Workspace, Stripe, GitHub, Salesforce, etc.)          │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.3 Service Boundaries & Responsibilities

| Module                   | Responsibility                                             | Exposes        | Consumes                        |
| ------------------------ | ---------------------------------------------------------- | -------------- | ------------------------------- |
| **Gateway API**          | Request routing, tenant auth, rate limiting                | REST endpoints | All modules                     |
| **Integration Engine**   | Integration CRUD, action schema management                 | Internal API   | Database                        |
| **Execution Engine**     | HTTP requests, retry, circuit breaker, response validation | Internal API   | Credential Vault, External APIs |
| **AI Service**           | Doc scraping, schema generation, action mapping            | Internal API   | Firecrawl, Gemini               |
| **Credential Vault**     | Encrypt/decrypt credentials, token storage                 | Internal API   | Database                        |
| **Auth Service**         | OAuth flows, token refresh, API key validation             | Internal API   | Supabase Auth, Database         |
| **Logging Service**      | Request logging, audit trail, metrics collection           | Internal API   | Database                        |
| **Apps**                 | App CRUD, per-app API keys, integration config             | Internal API   | Auth Service, Database          |
| **App Users**            | End-user identity resolution, lazy creation                | Internal API   | Apps, Database                  |
| **App User Credentials** | Per-user OAuth credential storage, encryption              | Internal API   | Credential Vault, Database      |
| **Connect Sessions**     | Embeddable OAuth flow session management                   | Internal API   | Apps, Auth Service, Database    |
| **Rate Limiter**         | Per-user fair-share rate limiting within connections       | Internal API   | In-memory state                 |

### 2.4 Data Flow Patterns

#### Action Invocation Flow (Primary Path)

```
1. Consuming app sends POST /api/v1/actions/{integration}/{action}
2. Auth middleware validates API key → extracts tenant context
   - wg_live_ keys → tenant-scoped invocation
   - wg_app_ keys → app-scoped invocation (extracts appId)
3. Gateway resolves connection:
   - With appId → resolveAppConnection (app-scoped connection)
   - With connectionId → resolveConnection (explicit)
   - Otherwise → resolveConnection (tenant default)
4. Gateway resolves end-user identity (if externalUserId + appId provided):
   - Lazily creates AppUser record on first reference
5. Gateway validates request body against action's input schema (Zod)
6. Gateway resolves credentials (user-aware):
   a. If appUserId present → try AppUserCredential first
   b. If user credential active → adapt to DecryptedCredential, use it
   c. If user credential missing/inactive/error → fall back to shared IntegrationCredential
   d. If authType is 'none' → skip credential resolution entirely
7. Per-user rate limiting (if configured on connection):
   - Fair-share enforcement across active users
   - Reject with RATE_LIMITED if budget exceeded
8. Execution Engine builds external API request:
   a. Apply field mappings (input transformation)
   b. Inject auth headers/tokens from resolved credential
   c. Set timeout and retry configuration
9. Execution Engine sends request to external API:
   a. On transient failure → retry with exponential backoff
   b. On rate limit → respect Retry-After, queue request
   c. On circuit open → fail fast with clear error
10. Execution Engine validates response against output schema
11. Response transformed (field mapping) and returned to consuming app
12. Request logged (sanitized, with appId + appUserId) for debugging/audit
```

#### Integration Creation Flow

```
1. User provides API documentation URL + wishlist of desired actions
2. AI Service invokes Firecrawl LangChain tool to scrape docs
3. AI Service extracts: endpoints, auth methods, request/response schemas
4. AI Service generates Action definitions with JSON Schema
5. User reviews and confirms actions in Config UI
6. User configures authentication (guided by detected auth type)
7. Auth Service initiates OAuth flow or stores API key
8. Integration Engine saves integration + actions + credentials
9. Integration marked as "active" and available via Gateway API
```

#### Token Refresh Flow (Background)

```
1. Cron job (Vercel Cron or Trigger.dev) runs every 5 minutes
2. Query credentials expiring within next 10 minutes
3. For each expiring credential:
   a. Acquire lock (prevent concurrent refresh)
   b. Call provider's token refresh endpoint
   c. Store new tokens (encrypted)
   d. Update expiration timestamp
   e. Release lock
4. On refresh failure:
   a. Retry up to 3 times with backoff
   b. If exhausted, mark integration as "needs_reauth"
   c. Alert user (email or in-app notification)
```

### 2.5 Communication Patterns

| Pattern                | Used For                               | Implementation                       |
| ---------------------- | -------------------------------------- | ------------------------------------ |
| Synchronous HTTP       | Action invocation, Config API          | Next.js API Routes (Node.js runtime) |
| Edge Functions         | Gateway auth, rate limiting            | Next.js Edge Runtime                 |
| Background Jobs        | Token refresh, scraping, health checks | Vercel Cron (MVP), Trigger.dev (V1)  |
| Database Subscriptions | Real-time config updates (future)      | Supabase Realtime (V2)               |

---

## 3. Project Directory Structure

### 3.1 Monorepo vs Polyrepo

**Structure:** SINGLE_REPO  
**Tool:** None (simple enough for single Next.js app)

**Rationale:** MVP doesn't need monorepo complexity. If we extract services later, we can migrate to Turborepo.

### 3.2 Directory Tree

```
waygate/
├── .github/
│   └── workflows/
│       ├── ci.yml                    # Lint, type-check, test on PR
│       └── deploy.yml                # Production deployment (if not using Vercel auto)
├── .husky/                           # Git hooks
│   └── pre-commit
├── prisma/
│   ├── schema.prisma                 # Database schema
│   ├── migrations/                   # SQL migrations
│   └── seed.ts                       # Development seed data
├── public/
│   └── ...                           # Static assets
├── src/
│   ├── app/                          # Next.js App Router
│   │   ├── (auth)/                   # Auth-related pages (login, callback)
│   │   │   ├── login/
│   │   │   └── auth/callback/
│   │   ├── (dashboard)/              # Authenticated dashboard pages
│   │   │   ├── layout.tsx
│   │   │   ├── page.tsx              # Dashboard home
│   │   │   ├── integrations/
│   │   │   │   ├── page.tsx          # Integration list
│   │   │   │   ├── new/
│   │   │   │   │   └── page.tsx      # Create integration wizard
│   │   │   │   └── [id]/
│   │   │   │       ├── page.tsx      # Integration detail
│   │   │   │       └── actions/
│   │   │   │           └── page.tsx  # Action browser
│   │   │   ├── logs/
│   │   │   │   └── page.tsx          # Request log viewer
│   │   │   └── settings/
│   │   │       └── page.tsx          # Tenant settings, API keys
│   │   ├── api/                      # API Routes
│   │   │   └── v1/
│   │   │       ├── actions/
│   │   │       │   └── [integration]/
│   │   │       │       └── [action]/
│   │   │       │           └── route.ts    # Action invocation
│   │   │       ├── integrations/
│   │   │       │   ├── route.ts            # List/Create integrations
│   │   │       │   └── [id]/
│   │   │       │       ├── route.ts        # Get/Update/Delete integration
│   │   │       │       ├── actions/
│   │   │       │       │   └── route.ts    # List actions
│   │   │       │       ├── connect/
│   │   │       │       │   └── route.ts    # OAuth initiation
│   │   │       │       └── health/
│   │   │       │           └── route.ts    # Health check
│   │   │       ├── scrape/
│   │   │       │   └── route.ts            # Initiate doc scraping
│   │   │       ├── logs/
│   │   │       │   └── route.ts            # Query logs
│   │   │       └── auth/
│   │   │           └── callback/
│   │   │               └── [provider]/
│   │   │                   └── route.ts    # OAuth callbacks
│   │   ├── layout.tsx                # Root layout
│   │   ├── page.tsx                  # Landing page
│   │   └── globals.css               # Global styles
│   │
│   ├── components/                   # React components
│   │   ├── ui/                       # Shadcn/ui primitives
│   │   │   ├── button.tsx
│   │   │   ├── card.tsx
│   │   │   ├── dialog.tsx
│   │   │   └── ...
│   │   ├── features/                 # Feature-specific components
│   │   │   ├── integrations/
│   │   │   │   ├── IntegrationCard.tsx
│   │   │   │   ├── IntegrationList.tsx
│   │   │   │   ├── CreateIntegrationWizard.tsx
│   │   │   │   └── ActionBrowser.tsx
│   │   │   ├── auth/
│   │   │   │   ├── OAuthConnectButton.tsx
│   │   │   │   └── ApiKeyInput.tsx
│   │   │   └── logs/
│   │   │       ├── LogViewer.tsx
│   │   │       └── LogEntry.tsx
│   │   └── layouts/
│   │       ├── DashboardLayout.tsx
│   │       └── PublicLayout.tsx
│   │
│   ├── lib/                          # Core modules (business logic)
│   │   ├── modules/                  # Domain modules
│   │   │   ├── integrations/
│   │   │   │   ├── integration.service.ts
│   │   │   │   ├── integration.repository.ts
│   │   │   │   ├── integration.schemas.ts
│   │   │   │   └── index.ts
│   │   │   ├── actions/
│   │   │   │   ├── action.service.ts
│   │   │   │   ├── action.repository.ts
│   │   │   │   ├── action.schemas.ts
│   │   │   │   └── index.ts
│   │   │   ├── execution/
│   │   │   │   ├── execution.service.ts
│   │   │   │   ├── http-client.ts
│   │   │   │   ├── retry.ts
│   │   │   │   ├── circuit-breaker.ts
│   │   │   │   ├── request-pipeline.ts
│   │   │   │   └── index.ts
│   │   │   ├── credentials/
│   │   │   │   ├── credential.service.ts
│   │   │   │   ├── credential.repository.ts
│   │   │   │   ├── encryption.ts
│   │   │   │   ├── token-refresh.ts
│   │   │   │   └── index.ts
│   │   │   ├── auth/
│   │   │   │   ├── oauth-providers/        # For EXTERNAL API connections
│   │   │   │   │   ├── base.ts
│   │   │   │   │   ├── slack.ts            # Slack integration OAuth
│   │   │   │   │   ├── google-workspace.ts # Google Workspace integration OAuth
│   │   │   │   │   └── index.ts
│   │   │   │   ├── auth.service.ts
│   │   │   │   ├── api-key.ts
│   │   │   │   └── index.ts
│   │   │   ├── ai/
│   │   │   │   ├── ai.service.ts
│   │   │   │   ├── doc-scraper.ts
│   │   │   │   ├── schema-generator.ts
│   │   │   │   ├── prompts/
│   │   │   │   │   ├── extract-endpoints.ts
│   │   │   │   │   └── generate-schema.ts
│   │   │   │   └── index.ts
│   │   │   └── logging/
│   │   │       ├── logging.service.ts
│   │   │       ├── request-logger.ts
│   │   │       └── index.ts
│   │   │
│   │   ├── api/                      # API utilities
│   │   │   ├── middleware/
│   │   │   │   ├── auth.ts           # API key validation
│   │   │   │   ├── rate-limit.ts     # Rate limiting
│   │   │   │   ├── validate.ts       # Request validation
│   │   │   │   └── error-handler.ts  # Error formatting
│   │   │   ├── response.ts           # Standard response helpers
│   │   │   └── errors.ts             # Custom error classes
│   │   │
│   │   ├── db/                       # Database utilities
│   │   │   ├── client.ts             # Prisma client singleton
│   │   │   └── supabase.ts           # Supabase client
│   │   │
│   │   └── utils/                    # Shared utilities
│   │       ├── crypto.ts             # Encryption helpers
│   │       ├── json-schema.ts        # JSON Schema utilities
│   │       └── slug.ts               # Slug generation
│   │
│   ├── hooks/                        # React hooks
│   │   ├── useIntegrations.ts
│   │   ├── useActions.ts
│   │   └── useLogs.ts
│   │
│   ├── stores/                       # Zustand stores
│   │   └── ui.store.ts               # UI state (sidebar, modals)
│   │
│   └── types/                        # TypeScript types
│       ├── api.ts                    # API request/response types
│       ├── database.ts               # Database entity types (generated by Prisma)
│       └── index.ts                  # Re-exports
│
├── tests/
│   ├── unit/
│   │   └── lib/
│   │       └── modules/
│   ├── integration/
│   │   └── api/
│   └── e2e/
│       └── flows/
│
├── docs/
│   ├── architecture.md               # This file
│   ├── product_spec.md               # Product specification
│   ├── decision_log.md               # Architecture decisions
│   └── changelog.md                  # Version history
│
├── scripts/
│   ├── generate-api-key.ts           # Utility to generate tenant API keys
│   └── seed-demo.ts                  # Seed demo integration
│
├── .env.example                      # Environment variable template
├── .env.local                        # Local environment (gitignored)
├── .eslintrc.json
├── .prettierrc
├── next.config.js
├── package.json
├── pnpm-lock.yaml
├── postcss.config.js
├── tailwind.config.ts
├── tsconfig.json
└── README.md
```

### 3.3 Key Directory Explanations

| Directory                      | Purpose                        | Contents                                             |
| ------------------------------ | ------------------------------ | ---------------------------------------------------- |
| `src/app/api/v1/`              | Versioned REST API endpoints   | Route handlers using Next.js conventions             |
| `src/lib/modules/`             | Domain-driven business logic   | Self-contained modules with services, repos, schemas |
| `src/lib/modules/execution/`   | Action execution pipeline      | HTTP client, retry, circuit breaker, transformations |
| `src/lib/modules/credentials/` | Secure credential management   | Encryption, token storage, refresh logic             |
| `src/lib/api/middleware/`      | API middleware chain           | Auth, validation, rate limiting, error handling      |
| `src/components/features/`     | Feature-specific UI components | Grouped by domain (integrations, logs, etc.)         |

### 3.4 Business Logic Location

**Primary Location:** `src/lib/modules/`

**Guidelines:**

- All business rules live in `*.service.ts` files, never in API routes or components
- Database queries only occur in `*.repository.ts` files
- API routes are thin — validate input, call service, format response
- Validation schemas (Zod) are co-located with their module in `*.schemas.ts`
- Each module exports via `index.ts` for clean imports

### 3.5 File Naming Conventions

| Type         | Convention                           | Example                       |
| ------------ | ------------------------------------ | ----------------------------- |
| Components   | PascalCase                           | `IntegrationCard.tsx`         |
| Hooks        | camelCase with `use` prefix          | `useIntegrations.ts`          |
| Services     | kebab-case with `.service` suffix    | `integration.service.ts`      |
| Repositories | kebab-case with `.repository` suffix | `integration.repository.ts`   |
| Schemas      | kebab-case with `.schemas` suffix    | `integration.schemas.ts`      |
| Types        | kebab-case                           | `api.ts`                      |
| Tests        | Same as source with `.test` suffix   | `integration.service.test.ts` |
| Utilities    | kebab-case                           | `json-schema.ts`              |

---

## 4. Database Design

### 4.1 Database Selection Rationale

**Primary Database:** PostgreSQL (via Supabase)  
**Why:**

- Supabase provides managed Postgres with built-in Row-Level Security (RLS)
- RLS enables secure multi-tenant isolation without application-level checks
- JSONB columns support flexible schema storage (action schemas, configs)
- Supabase Auth integrates seamlessly for dashboard users
- Built-in encryption features (pgcrypto) for credential storage

### 4.2 Entity Relationship Diagram

```
erDiagram
    TENANT ||--o{ INTEGRATION : owns
    TENANT ||--o{ INTEGRATION_CREDENTIAL : owns
    TENANT ||--o{ REQUEST_LOG : generates
    TENANT ||--o{ APP : owns
    INTEGRATION ||--o{ ACTION : contains
    INTEGRATION ||--o{ INTEGRATION_CREDENTIAL : requires
    INTEGRATION ||--o{ REQUEST_LOG : logs
    ACTION ||--o{ FIELD_MAPPING : has
    ACTION ||--o{ REQUEST_LOG : logs
    APP ||--o{ APP_USER : has
    APP ||--o{ APP_INTEGRATION_CONFIG : configures
    APP ||--o{ CONNECT_SESSION : initiates
    APP ||--o{ CONNECTION : scopes
    APP_USER ||--o{ APP_USER_CREDENTIAL : owns
    APP_USER ||--o{ CONNECT_SESSION : authenticates
    CONNECTION ||--o{ APP_USER_CREDENTIAL : stores

    TENANT {
        uuid id PK
        string name
        string email UK
        string waygate_api_key_hash
        jsonb settings
        timestamp created_at
        timestamp updated_at
    }

    APP {
        uuid id PK
        uuid tenant_id FK
        string name
        string slug UK
        text description
        string api_key_hash UK
        string api_key_index UK
        enum status
        jsonb metadata
        timestamp created_at
        timestamp updated_at
    }

    APP_USER {
        uuid id PK
        uuid app_id FK
        string external_id
        string display_name
        string email
        jsonb metadata
        timestamp created_at
        timestamp updated_at
    }

    APP_USER_CREDENTIAL {
        uuid id PK
        uuid connection_id FK
        uuid app_user_id FK
        enum credential_type
        bytea encrypted_data
        timestamp expires_at
        bytea encrypted_refresh_token
        string[] scopes
        enum status
        timestamp created_at
        timestamp updated_at
    }

    APP_INTEGRATION_CONFIG {
        uuid id PK
        uuid app_id FK
        uuid integration_id FK
        bytea encrypted_client_id
        bytea encrypted_client_secret
        string[] scopes
        jsonb metadata
        timestamp created_at
        timestamp updated_at
    }

    CONNECT_SESSION {
        uuid id PK
        uuid app_id FK
        uuid app_user_id FK
        uuid integration_id FK
        uuid connection_id FK
        string token UK
        text redirect_url
        enum status
        timestamp expires_at
        timestamp completed_at
        text error_message
        jsonb metadata
        timestamp created_at
    }

    INTEGRATION {
        uuid id PK
        uuid tenant_id FK
        string name
        string slug UK
        text description
        string documentation_url
        enum auth_type
        jsonb auth_config
        enum status
        string[] tags
        jsonb metadata
        timestamp created_at
        timestamp updated_at
    }

    ACTION {
        uuid id PK
        uuid integration_id FK
        string name
        string slug
        text description
        enum http_method
        string endpoint_template
        jsonb input_schema
        jsonb output_schema
        jsonb pagination_config
        jsonb retry_config
        boolean cacheable
        integer cache_ttl_seconds
        jsonb metadata
        timestamp created_at
        timestamp updated_at
    }

    INTEGRATION_CREDENTIAL {
        uuid id PK
        uuid integration_id FK
        uuid tenant_id FK
        enum credential_type
        bytea encrypted_data
        timestamp expires_at
        bytea encrypted_refresh_token
        string[] scopes
        enum status
        timestamp created_at
        timestamp updated_at
    }

    FIELD_MAPPING {
        uuid id PK
        uuid action_id FK
        uuid tenant_id FK "nullable - null means default"
        string source_path
        string target_path
        jsonb transform_config
        enum direction
        timestamp created_at
    }

    REQUEST_LOG {
        uuid id PK
        uuid tenant_id FK
        uuid integration_id FK
        uuid action_id FK
        uuid app_id FK "nullable"
        uuid app_user_id FK "nullable"
        jsonb request_summary
        jsonb response_summary
        integer status_code
        integer latency_ms
        integer retry_count
        jsonb error
        timestamp created_at
    }
```

### 4.3 Schema Documentation

#### Table: `tenants`

**Purpose:** Multi-tenant isolation. Each tenant is an organization/user account.

| Column               | Type         | Nullable | Default           | Constraints | Description                         |
| -------------------- | ------------ | -------- | ----------------- | ----------- | ----------------------------------- |
| id                   | uuid         | NO       | gen_random_uuid() | PK          | Unique tenant identifier            |
| name                 | varchar(255) | NO       | —                 | —           | Organization/user name              |
| email                | varchar(255) | NO       | —                 | UK          | Primary contact email               |
| waygate_api_key_hash | varchar(255) | NO       | —                 | UK          | Bcrypt hash of Waygate API key      |
| settings             | jsonb        | NO       | '{}'              | —           | Tenant settings (rate limits, etc.) |
| created_at           | timestamptz  | NO       | now()             | —           | Creation timestamp                  |
| updated_at           | timestamptz  | NO       | now()             | —           | Last update timestamp               |

**Indexes:**

- `tenants_email_idx` UNIQUE on (`email`)
- `tenants_api_key_hash_idx` UNIQUE on (`waygate_api_key_hash`)

---

#### Table: `integrations`

**Purpose:** Stores integration definitions (configured connections to external APIs).

| Column            | Type         | Nullable | Default           | Constraints           | Description                                   |
| ----------------- | ------------ | -------- | ----------------- | --------------------- | --------------------------------------------- |
| id                | uuid         | NO       | gen_random_uuid() | PK                    | Unique integration identifier                 |
| tenant_id         | uuid         | NO       | —                 | FK → tenants          | Owning tenant                                 |
| name              | varchar(255) | NO       | —                 | —                     | Human-readable name                           |
| slug              | varchar(100) | NO       | —                 | UK (scoped to tenant) | URL-safe identifier                           |
| description       | text         | YES      | —                 | —                     | Integration description                       |
| documentation_url | text         | YES      | —                 | —                     | Source API documentation URL                  |
| auth_type         | enum         | NO       | —                 | —                     | oauth2, api_key, basic, bearer, custom_header |
| auth_config       | jsonb        | NO       | '{}'              | —                     | Non-sensitive auth config (scopes, endpoints) |
| status            | enum         | NO       | 'draft'           | —                     | draft, active, error, disabled                |
| tags              | text[]       | NO       | '{}'              | —                     | User-defined tags                             |
| metadata          | jsonb        | NO       | '{}'              | —                     | AI-generated metadata, notes                  |
| created_at        | timestamptz  | NO       | now()             | —                     | Creation timestamp                            |
| updated_at        | timestamptz  | NO       | now()             | —                     | Last update timestamp                         |

**Indexes:**

- `integrations_tenant_slug_idx` UNIQUE on (`tenant_id`, `slug`)
- `integrations_tenant_id_idx` on (`tenant_id`)
- `integrations_status_idx` on (`status`)
- `integrations_tags_idx` GIN on (`tags`)

**RLS Policies:**

- SELECT: `tenant_id = auth.tenant_id()`
- INSERT: `tenant_id = auth.tenant_id()`
- UPDATE: `tenant_id = auth.tenant_id()`
- DELETE: `tenant_id = auth.tenant_id()`

---

#### Table: `actions`

**Purpose:** Stores action definitions with typed schemas.

| Column            | Type         | Nullable | Default           | Constraints                | Description                            |
| ----------------- | ------------ | -------- | ----------------- | -------------------------- | -------------------------------------- |
| id                | uuid         | NO       | gen_random_uuid() | PK                         | Unique action identifier               |
| integration_id    | uuid         | NO       | —                 | FK → integrations          | Parent integration                     |
| name              | varchar(255) | NO       | —                 | —                          | Human-readable name                    |
| slug              | varchar(100) | NO       | —                 | UK (scoped to integration) | URL-safe identifier                    |
| description       | text         | YES      | —                 | —                          | Action description                     |
| http_method       | enum         | NO       | —                 | —                          | GET, POST, PUT, PATCH, DELETE          |
| endpoint_template | text         | NO       | —                 | —                          | URL template with {param} placeholders |
| input_schema      | jsonb        | NO       | '{}'              | —                          | JSON Schema for input validation       |
| output_schema     | jsonb        | NO       | '{}'              | —                          | JSON Schema for response validation    |
| pagination_config | jsonb        | YES      | —                 | —                          | Pagination strategy and config         |
| retry_config      | jsonb        | YES      | —                 | —                          | Custom retry policy                    |
| cacheable         | boolean      | NO       | false             | —                          | Whether response can be cached         |
| cache_ttl_seconds | integer      | YES      | —                 | —                          | Cache TTL (if cacheable)               |
| metadata          | jsonb        | NO       | '{}'              | —                          | Additional metadata                    |
| created_at        | timestamptz  | NO       | now()             | —                          | Creation timestamp                     |
| updated_at        | timestamptz  | NO       | now()             | —                          | Last update timestamp                  |

**Indexes:**

- `actions_integration_slug_idx` UNIQUE on (`integration_id`, `slug`)
- `actions_integration_id_idx` on (`integration_id`)

---

#### Table: `integration_credentials`

**Purpose:** Securely stores encrypted OAuth tokens, API keys, etc. for external services.

| Column                  | Type        | Nullable | Default           | Constraints       | Description                            |
| ----------------------- | ----------- | -------- | ----------------- | ----------------- | -------------------------------------- |
| id                      | uuid        | NO       | gen_random_uuid() | PK                | Unique credential identifier           |
| integration_id          | uuid        | NO       | —                 | FK → integrations | Associated integration                 |
| tenant_id               | uuid        | NO       | —                 | FK → tenants      | Owning tenant (denormalized for RLS)   |
| credential_type         | enum        | NO       | —                 | —                 | oauth2_tokens, api_key, basic, bearer  |
| encrypted_data          | bytea       | NO       | —                 | —                 | Encrypted credential payload           |
| expires_at              | timestamptz | YES      | —                 | —                 | Token expiration (for OAuth)           |
| encrypted_refresh_token | bytea       | YES      | —                 | —                 | Encrypted refresh token                |
| scopes                  | text[]      | NO       | '{}'              | —                 | Granted OAuth scopes                   |
| status                  | enum        | NO       | 'active'          | —                 | active, expired, revoked, needs_reauth |
| created_at              | timestamptz | NO       | now()             | —                 | Creation timestamp                     |
| updated_at              | timestamptz | NO       | now()             | —                 | Last update timestamp                  |

**Indexes:**

- `credentials_integration_id_idx` on (`integration_id`)
- `credentials_tenant_id_idx` on (`tenant_id`)
- `credentials_expires_at_idx` on (`expires_at`) WHERE status = 'active'

**RLS Policies:**

- All operations: `tenant_id = auth.tenant_id()`

**Security Note:** `encrypted_data` contains AES-256-GCM encrypted JSON with the actual credentials. The encryption key is stored in Vercel environment variables, never in the database.

---

#### Table: `field_mappings`

**Purpose:** Custom field transformations between Waygate and consuming apps.

| Column           | Type         | Nullable | Default           | Constraints  | Description                             |
| ---------------- | ------------ | -------- | ----------------- | ------------ | --------------------------------------- |
| id               | uuid         | NO       | gen_random_uuid() | PK           | Unique mapping identifier               |
| action_id        | uuid         | NO       | —                 | FK → actions | Associated action                       |
| tenant_id        | uuid         | YES      | —                 | FK → tenants | Tenant override (null = default)        |
| source_path      | varchar(255) | NO       | —                 | —            | JSONPath in source                      |
| target_path      | varchar(255) | NO       | —                 | —            | JSONPath in target                      |
| transform_config | jsonb        | YES      | —                 | —            | Transform options (type coercion, etc.) |
| direction        | enum         | NO       | —                 | —            | input, output                           |
| created_at       | timestamptz  | NO       | now()             | —            | Creation timestamp                      |

**Indexes:**

- `mappings_action_tenant_idx` on (`action_id`, `tenant_id`)

---

#### Table: `request_logs`

**Purpose:** Audit trail and debugging for action invocations.

| Column           | Type        | Nullable | Default           | Constraints       | Description                             |
| ---------------- | ----------- | -------- | ----------------- | ----------------- | --------------------------------------- |
| id               | uuid        | NO       | gen_random_uuid() | PK                | Unique log identifier                   |
| tenant_id        | uuid        | NO       | —                 | FK → tenants      | Requesting tenant                       |
| integration_id   | uuid        | NO       | —                 | FK → integrations | Target integration                      |
| action_id        | uuid        | NO       | —                 | FK → actions      | Invoked action                          |
| app_id           | uuid        | YES      | —                 | —                 | App that made the request (if app key)  |
| app_user_id      | uuid        | YES      | —                 | —                 | End-user identity (if provided)         |
| request_summary  | jsonb       | NO       | —                 | —                 | Sanitized request (no secrets)          |
| response_summary | jsonb       | YES      | —                 | —                 | Sanitized response (truncated if large) |
| status_code      | integer     | YES      | —                 | —                 | HTTP status code                        |
| latency_ms       | integer     | NO       | —                 | —                 | Total request duration                  |
| retry_count      | integer     | NO       | 0                 | —                 | Number of retries performed             |
| error            | jsonb       | YES      | —                 | —                 | Error details (if failed)               |
| created_at       | timestamptz | NO       | now()             | —                 | Log timestamp                           |

**Indexes:**

- `logs_tenant_created_idx` on (`tenant_id`, `created_at` DESC)
- `logs_integration_created_idx` on (`integration_id`, `created_at` DESC)
- `logs_action_created_idx` on (`action_id`, `created_at` DESC)

**Retention:** Logs older than 30 days are automatically archived/deleted via scheduled job (V1+).

---

#### Table: `apps`

**Purpose:** Consuming applications with dedicated API keys and per-app OAuth registrations.

| Column        | Type         | Nullable | Default           | Constraints  | Description                       |
| ------------- | ------------ | -------- | ----------------- | ------------ | --------------------------------- |
| id            | uuid         | NO       | gen_random_uuid() | PK           | Unique app identifier             |
| tenant_id     | uuid         | NO       | —                 | FK → tenants | Owning tenant                     |
| name          | varchar(255) | NO       | —                 | —            | Human-readable app name           |
| slug          | varchar(100) | NO       | —                 | UK (tenant)  | URL-safe identifier               |
| description   | text         | YES      | —                 | —            | App description                   |
| api_key_hash  | varchar(255) | NO       | —                 | UK           | Bcrypt hash of wg*app* API key    |
| api_key_index | varchar(64)  | NO       | —                 | UK           | First 8 chars for fast key lookup |
| status        | enum         | NO       | 'active'          | —            | active, disabled                  |
| metadata      | jsonb        | NO       | '{}'              | —            | Branding, config, etc.            |
| created_at    | timestamptz  | NO       | now()             | —            | Creation timestamp                |
| updated_at    | timestamptz  | NO       | now()             | —            | Last update timestamp             |

**Indexes:**

- `apps_tenant_slug_idx` UNIQUE on (`tenant_id`, `slug`)
- `apps_tenant_id_idx` on (`tenant_id`)

---

#### Table: `app_integration_configs`

**Purpose:** Per-app OAuth app registration for each integration (client_id/client_secret).

| Column                  | Type        | Nullable | Default           | Constraints       | Description                   |
| ----------------------- | ----------- | -------- | ----------------- | ----------------- | ----------------------------- |
| id                      | uuid        | NO       | gen_random_uuid() | PK                | Unique config identifier      |
| app_id                  | uuid        | NO       | —                 | FK → apps         | Owning app                    |
| integration_id          | uuid        | NO       | —                 | FK → integrations | Target integration            |
| encrypted_client_id     | bytea       | YES      | —                 | —                 | Encrypted OAuth client ID     |
| encrypted_client_secret | bytea       | YES      | —                 | —                 | Encrypted OAuth client secret |
| scopes                  | text[]      | NO       | '{}'              | —                 | OAuth scopes for this app     |
| metadata                | jsonb       | NO       | '{}'              | —                 | Additional config             |
| created_at              | timestamptz | NO       | now()             | —                 | Creation timestamp            |
| updated_at              | timestamptz | NO       | now()             | —                 | Last update timestamp         |

**Indexes:**

- `app_integration_configs_app_integration_idx` UNIQUE on (`app_id`, `integration_id`)
- `app_integration_configs_app_id_idx` on (`app_id`)

---

#### Table: `app_users`

**Purpose:** End-user identity within a consuming app. Lazy-created on first gateway invocation with `externalUserId`.

| Column       | Type         | Nullable | Default           | Constraints | Description                |
| ------------ | ------------ | -------- | ----------------- | ----------- | -------------------------- |
| id           | uuid         | NO       | gen_random_uuid() | PK          | Unique app user identifier |
| app_id       | uuid         | NO       | —                 | FK → apps   | Parent app                 |
| external_id  | varchar(255) | NO       | —                 | —           | External user ID from app  |
| display_name | varchar(255) | YES      | —                 | —           | User display name          |
| email        | varchar(255) | YES      | —                 | —           | User email                 |
| metadata     | jsonb        | NO       | '{}'              | —           | Custom user attributes     |
| created_at   | timestamptz  | NO       | now()             | —           | Creation timestamp         |
| updated_at   | timestamptz  | NO       | now()             | —           | Last update timestamp      |

**Indexes:**

- `app_users_app_external_idx` UNIQUE on (`app_id`, `external_id`)
- `app_users_app_id_idx` on (`app_id`)

---

#### Table: `app_user_credentials`

**Purpose:** Per-user OAuth tokens stored under a Connection. Encrypted like IntegrationCredentials.

| Column                  | Type        | Nullable | Default           | Constraints      | Description                            |
| ----------------------- | ----------- | -------- | ----------------- | ---------------- | -------------------------------------- |
| id                      | uuid        | NO       | gen_random_uuid() | PK               | Unique credential identifier           |
| connection_id           | uuid        | NO       | —                 | FK → connections | Parent connection                      |
| app_user_id             | uuid        | NO       | —                 | FK → app_users   | Owning end-user                        |
| credential_type         | enum        | NO       | —                 | —                | oauth2_tokens, api_key, basic, bearer  |
| encrypted_data          | bytea       | NO       | —                 | —                | Encrypted credential payload           |
| expires_at              | timestamptz | YES      | —                 | —                | Token expiration                       |
| encrypted_refresh_token | bytea       | YES      | —                 | —                | Encrypted refresh token                |
| scopes                  | text[]      | NO       | '{}'              | —                | Granted OAuth scopes                   |
| status                  | enum        | NO       | 'active'          | —                | active, expired, revoked, needs_reauth |
| created_at              | timestamptz | NO       | now()             | —                | Creation timestamp                     |
| updated_at              | timestamptz | NO       | now()             | —                | Last update timestamp                  |

**Indexes:**

- `app_user_credentials_conn_user_idx` UNIQUE on (`connection_id`, `app_user_id`)
- `app_user_credentials_connection_id_idx` on (`connection_id`)
- `app_user_credentials_app_user_id_idx` on (`app_user_id`)
- `app_user_credentials_expires_at_idx` on (`expires_at`)
- `app_user_credentials_status_idx` on (`status`)

**Security Note:** Encrypted identically to `integration_credentials` — AES-256-GCM with the same encryption key.

---

#### Table: `connect_sessions`

**Purpose:** Short-lived sessions for the embeddable end-user OAuth connect flow.

| Column         | Type         | Nullable | Default           | Constraints       | Description                          |
| -------------- | ------------ | -------- | ----------------- | ----------------- | ------------------------------------ |
| id             | uuid         | NO       | gen_random_uuid() | PK                | Unique session identifier            |
| app_id         | uuid         | NO       | —                 | FK → apps         | Initiating app                       |
| app_user_id    | uuid         | NO       | —                 | FK → app_users    | End-user connecting                  |
| integration_id | uuid         | NO       | —                 | FK → integrations | Target integration                   |
| connection_id  | uuid         | YES      | —                 | FK → connections  | Resolved connection (after complete) |
| token          | varchar(255) | NO       | —                 | UK                | Session token for connect page       |
| redirect_url   | text         | YES      | —                 | —                 | Post-connect redirect URL            |
| status         | enum         | NO       | 'pending'         | —                 | pending, completed, expired, failed  |
| expires_at     | timestamptz  | NO       | —                 | —                 | Session expiration                   |
| completed_at   | timestamptz  | YES      | —                 | —                 | When connection completed            |
| error_message  | text         | YES      | —                 | —                 | Error details (if failed)            |
| metadata       | jsonb        | NO       | '{}'              | —                 | Additional session data              |
| created_at     | timestamptz  | NO       | now()             | —                 | Creation timestamp                   |

**Indexes:**

- `connect_sessions_token_idx` on (`token`)
- `connect_sessions_app_id_idx` on (`app_id`)
- `connect_sessions_expires_at_idx` on (`expires_at`)

---

### 4.4 Migration Strategy

**Tool:** Prisma Migrate

**Conventions:**

- Migration naming: Auto-generated by Prisma (timestamp + description)
- All migrations are forward-only in production
- Schema changes require PR review

**Commands:**

```bash
# Generate migration from schema changes
pnpm prisma migrate dev --name describe_change

# Apply migrations to production
pnpm prisma migrate deploy

# Reset development database
pnpm prisma migrate reset
```

### 4.5 Seeding Strategy

**Purpose:** Seed data for development and testing only.

| Category         | Purpose                          | Environment |
| ---------------- | -------------------------------- | ----------- |
| Reference Data   | Auth type enums, default configs | ALL         |
| Test Tenant      | Demo tenant with API key         | DEV, TEST   |
| Demo Integration | Sample Slack integration (mock)  | DEV         |

---

## 5. API Specification

### 5.1 API Design Philosophy

**Style:** REST  
**Versioning:** URL Path (`/api/v1/...`)  
**Base URL:** `https://{YOUR_DOMAIN}/api/v1` (production)

### 5.2 Authentication & Authorization

#### Authentication Methods

**Gateway API — Tenant Key (Platform Management):**

- Type: API Key (Bearer token)
- Prefix: `wg_live_`
- Header: `Authorization: Bearer wg_live_xxx...`
- Validation: Bcrypt compare against stored hash
- Scope: Full tenant access — manage integrations, connections, apps, and configuration

**Gateway API — App Key (End-User Context):**

- Type: API Key (Bearer token)
- Prefix: `wg_app_`
- Header: `Authorization: Bearer wg_app_xxx...`
- Validation: Bcrypt compare against stored hash
- Scope: App-scoped access — invoke actions with end-user credentials, manage connect sessions and user connections

**Connect Session Token (End-User OAuth):**

- Type: Short-lived session token
- Header: `x-connect-token: cst_xxx...`
- Validation: Token lookup, expiry check, one-time use
- Scope: Single OAuth authorization flow for an end-user
- Lifetime: 30 minutes, consumed on use

**Dashboard (Users):**

- Type: Supabase Auth (JWT)
- Flow: OAuth only (Google, GitHub)
- Session: HTTP-only cookies

#### Authorization Model

**Type:** Tenant isolation with app-scoped delegation

- All resources are scoped to tenant via Supabase RLS
- Single owner role with full access
- App keys inherit tenant scope but add app context (`appId`, `appUserId`)
- Credential resolution: user-specific credentials prioritized over shared connection credentials
- Per-user fair-share rate limiting distributes connection budgets across active app users

### 5.3 Endpoint Groups

#### Group: Integrations — `/api/v1/integrations`

| Method | Endpoint                       | Purpose                    | Auth    | Request Body      | Response        |
| ------ | ------------------------------ | -------------------------- | ------- | ----------------- | --------------- |
| GET    | `/integrations`                | List tenant's integrations | API Key | —                 | IntegrationList |
| POST   | `/integrations`                | Create integration         | API Key | CreateIntegration | Integration     |
| GET    | `/integrations/:id`            | Get integration details    | API Key | —                 | Integration     |
| PATCH  | `/integrations/:id`            | Update integration         | API Key | UpdateIntegration | Integration     |
| DELETE | `/integrations/:id`            | Delete integration         | API Key | —                 | —               |
| GET    | `/integrations/:id/actions`    | List integration's actions | API Key | —                 | ActionList      |
| GET    | `/integrations/:id/health`     | Check integration health   | API Key | —                 | HealthStatus    |
| POST   | `/integrations/:id/connect`    | Initiate OAuth flow        | Session | OAuthInit         | RedirectURL     |
| POST   | `/integrations/:id/disconnect` | Revoke credentials         | API Key | —                 | —               |

#### Group: Actions — `/api/v1/actions`

| Method | Endpoint                               | Purpose           | Auth    | Request Body | Response     |
| ------ | -------------------------------------- | ----------------- | ------- | ------------ | ------------ |
| POST   | `/actions/:integration/:action`        | Invoke action     | API Key | ActionInput  | ActionOutput |
| GET    | `/actions/:integration/:action/schema` | Get action schema | API Key | —            | ActionSchema |

#### Group: Scraping — `/api/v1/scrape`

| Method | Endpoint         | Purpose               | Auth    | Request Body  | Response        |
| ------ | ---------------- | --------------------- | ------- | ------------- | --------------- |
| POST   | `/scrape`        | Initiate doc scraping | Session | ScrapeRequest | ScrapeJob       |
| GET    | `/scrape/:jobId` | Get scrape job status | Session | —             | ScrapeJobStatus |

#### Group: Apps — `/api/v1/apps`

| Method | Endpoint                                       | Purpose                               | Auth       | Request Body      | Response             |
| ------ | ---------------------------------------------- | ------------------------------------- | ---------- | ----------------- | -------------------- |
| GET    | `/apps`                                        | List consuming apps                   | Tenant Key | —                 | AppList              |
| POST   | `/apps`                                        | Create consuming app                  | Tenant Key | CreateApp         | App (with API key)   |
| GET    | `/apps/:id`                                    | Get app details                       | Tenant Key | —                 | App                  |
| PATCH  | `/apps/:id`                                    | Update app                            | Tenant Key | UpdateApp         | App                  |
| DELETE | `/apps/:id`                                    | Delete app                            | Tenant Key | —                 | —                    |
| POST   | `/apps/:id/api-key/regenerate`                 | Regenerate app API key                | Tenant Key | —                 | App (with new key)   |
| GET    | `/apps/:id/connections`                        | List connections for app              | Tenant Key | —                 | Connection[]         |
| GET    | `/apps/:id/credential-stats`                   | Get end-user credential stats for app | Tenant Key | —                 | CredentialStats      |
| GET    | `/apps/:id/integrations/:integrationId/config` | Get per-app OAuth config              | Tenant Key | —                 | AppIntegrationConfig |
| PUT    | `/apps/:id/integrations/:integrationId/config` | Set per-app OAuth config              | Tenant Key | OAuthClientConfig | AppIntegrationConfig |
| DELETE | `/apps/:id/integrations/:integrationId/config` | Remove per-app OAuth config           | Tenant Key | —                 | —                    |

#### Group: Connect — `/api/v1/connect`

| Method | Endpoint                                                             | Purpose                          | Auth          | Request Body         | Response           |
| ------ | -------------------------------------------------------------------- | -------------------------------- | ------------- | -------------------- | ------------------ |
| POST   | `/connect/sessions`                                                  | Create connect session for OAuth | App Key       | CreateConnectSession | ConnectSession     |
| GET    | `/connect/sessions/:id`                                              | Check session status             | App Key       | —                    | ConnectSession     |
| POST   | `/connect/authorize`                                                 | Initiate OAuth flow              | Session Token | —                    | RedirectURL        |
| GET    | `/connect/users/:externalUserId/connections`                         | List end-user's connections      | App Key       | —                    | UserConnectionList |
| DELETE | `/connect/users/:externalUserId/connections/:connectionId`           | Revoke end-user credential       | App Key       | —                    | —                  |
| POST   | `/connect/users/:externalUserId/connections/:connectionId/reconnect` | Create session for re-auth       | App Key       | —                    | ConnectSession     |

#### Group: Connections (Extended) — `/api/v1/connections`

| Method | Endpoint                                 | Purpose                                  | Auth       | Request Body | Response        |
| ------ | ---------------------------------------- | ---------------------------------------- | ---------- | ------------ | --------------- |
| GET    | `/connections/:id/user-credential-stats` | Get end-user credential counts by status | Tenant Key | —            | CredentialStats |

#### Group: Logs — `/api/v1/logs`

| Method | Endpoint | Purpose            | Auth    | Request Body     | Response |
| ------ | -------- | ------------------ | ------- | ---------------- | -------- |
| GET    | `/logs`  | Query request logs | API Key | — (query params) | LogList  |

### 5.4 Request/Response Standards

#### Standard Success Response

```typescript
{
  "success": true,
  "data": T,
  "meta": {
    "requestId": "req_abc123",
    "timestamp": "2024-01-15T10:30:00Z"
  }
}
```

#### Paginated Response

```typescript
{
  "success": true,
  "data": T[],
  "pagination": {
    "cursor": "eyJpZCI6IjEyMyJ9",
    "hasMore": true,
    "totalCount": 150
  },
  "meta": { ... }
}
```

#### Error Response (LLM-Friendly)

```typescript
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "The 'channel' parameter is required",
    "details": {
      "field": "channel",
      "reason": "missing_required_field"
    },
    "requestId": "req_abc123",
    "suggestedResolution": {
      "action": "RETRY_WITH_MODIFIED_INPUT",
      "description": "Add the 'channel' parameter with a valid Slack channel ID",
      "retryable": true,
      "retryAfterMs": null
    }
  }
}
```

#### HTTP Status Codes

| Code | Usage                                                |
| ---- | ---------------------------------------------------- |
| 200  | Successful GET, PATCH, DELETE                        |
| 201  | Successful POST (resource created)                   |
| 400  | Invalid request body or parameters                   |
| 401  | Missing or invalid authentication                    |
| 403  | Valid auth but insufficient permissions              |
| 404  | Resource not found                                   |
| 422  | Request validation failed (schema mismatch)          |
| 429  | Rate limit exceeded                                  |
| 500  | Internal server error                                |
| 502  | External API error (Waygate couldn't reach provider) |

### 5.5 Rate Limiting

| Endpoint Group    | Limit | Window   | Scope       |
| ----------------- | ----- | -------- | ----------- |
| Action Invocation | 100   | 1 minute | Per API Key |
| Config API        | 60    | 1 minute | Per API Key |
| Scraping          | 5     | 1 hour   | Per Tenant  |

**Implementation:** In-memory rate limiting for MVP (Vercel Edge), Redis-backed for V1.

**Per-User Fair-Share Rate Limiting:** When actions are invoked with app keys (`wg_app_`), the connection's rate budget is distributed fairly across active end-users. Each user gets `floor(connectionLimit / activeUsers)` with a minimum guarantee of 1 request per window. Inactive user slots are reclaimed after a configurable inactivity period.

---

## 6. External Integrations

### 6.1 Third-Party Services

| Service       | Purpose                 | Integration Type    | Criticality | MVP Required |
| ------------- | ----------------------- | ------------------- | ----------- | ------------ |
| Supabase      | Database, Auth, Storage | SDK                 | CRITICAL    | Yes          |
| Google Gemini | AI document processing  | API (via LangChain) | CRITICAL    | Yes          |
| Firecrawl     | Web scraping            | REST API            | CRITICAL    | Yes          |
| Vercel        | Hosting, Edge functions | Platform            | CRITICAL    | Yes          |
| Upstash Redis | Caching, rate limits    | SDK                 | IMPORTANT   | No (V1)      |

### 6.2 Integration Details

#### Integration: Supabase

**Purpose:** Primary database, user authentication, file storage

**Configuration:**

```bash
# Required environment variables
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ... # Server-side only
DATABASE_URL=postgresql://... # For Prisma
```

**Implementation Location:** `src/lib/db/supabase.ts`

**Error Handling:**

- Connection failures: Retry with exponential backoff
- Auth failures: Clear session, redirect to login
- RLS violations: Log and return 403

---

#### Integration: Google Gemini (via LangChain)

**Purpose:** AI-powered document analysis, schema generation

**Configuration:**

```bash
GOOGLE_API_KEY=xxx
```

**Implementation Location:** `src/lib/modules/ai/`

**Error Handling:**

- Rate limits: Queue requests, respect Retry-After
- Model errors: Fall back to simpler prompts, retry once
- Timeout: 60s timeout, fail gracefully with partial results

---

#### Integration: Firecrawl

**Purpose:** Scrape and parse API documentation sites

**Configuration:**

```bash
FIRECRAWL_API_KEY=xxx
```

**Implementation Location:** `src/lib/modules/ai/doc-scraper.ts`

**Integration Pattern:** REST API (native Firecrawl SDK)

**Error Handling:**

- Scrape failures: Return partial results with error details
- Anti-bot blocks: Report to user, suggest manual input
- Timeout: 5 minute timeout for full scrapes

**Future Enhancement:** Can wrap with LangChain tool for more sophisticated orchestration if needed.

---

### 6.3 Environment Variable Template

```bash
# ===========================================
# WAYGATE ENVIRONMENT CONFIGURATION
# ===========================================

# ─────────────────────────────────────────
# SUPABASE (Database, Auth, Storage)
# ─────────────────────────────────────────
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
DATABASE_URL=postgresql://postgres:password@db.xxx.supabase.co:5432/postgres

# ─────────────────────────────────────────
# AI SERVICES
# ─────────────────────────────────────────
GOOGLE_API_KEY=your-gemini-api-key
FIRECRAWL_API_KEY=your-firecrawl-api-key

# ─────────────────────────────────────────
# SECURITY
# ─────────────────────────────────────────
# 32-byte hex string for credential encryption
ENCRYPTION_KEY=your-32-byte-hex-encryption-key

# ─────────────────────────────────────────
# APPLICATION
# ─────────────────────────────────────────
NEXT_PUBLIC_APP_URL=http://localhost:3000
NODE_ENV=development

# ─────────────────────────────────────────
# PLATFORM CONNECTORS (Hybrid Auth Model)
# ─────────────────────────────────────────
# Waygate's registered OAuth apps for "one-click connect"
# Leave empty or use placeholders for development

# Slack Platform Connector
PLATFORM_SLACK_CLIENT_ID=your-slack-client-id
PLATFORM_SLACK_CLIENT_SECRET=your-slack-client-secret

# Google Platform Connector (requires CASA certification)
PLATFORM_GOOGLE_CLIENT_ID=your-google-client-id
PLATFORM_GOOGLE_CLIENT_SECRET=your-google-client-secret

# ─────────────────────────────────────────
# OPTIONAL (V1+)
# ─────────────────────────────────────────
# UPSTASH_REDIS_REST_URL=https://xxx.upstash.io
# UPSTASH_REDIS_REST_TOKEN=xxx
# TRIGGER_API_KEY=xxx
# RESEND_API_KEY=xxx
```

---

## 7. Code Patterns & Conventions

### 7.1 Architectural Patterns

| Pattern            | Where Used         | Implementation                                           |
| ------------------ | ------------------ | -------------------------------------------------------- |
| Repository Pattern | Data access        | `*.repository.ts` files abstract Prisma queries          |
| Service Layer      | Business logic     | `*.service.ts` files contain all business rules          |
| Pipeline Pattern   | Request execution  | Chain of handlers: auth → validate → transform → execute |
| Factory Pattern    | OAuth providers    | `oauth-providers/` with common interface                 |
| Circuit Breaker    | External API calls | In-memory state tracking failures per integration        |

### 7.2 Code Style Guidelines

**Language Style Guide:** TypeScript with strict mode enabled

**Key Conventions:**

- Use `async/await` over Promise chains
- Prefer named exports over default exports
- Use Zod for all runtime validation (inputs, configs, API responses)
- Errors are thrown, not returned — use try/catch
- All public functions have JSDoc comments
- No `any` types — use `unknown` and type guards when needed

### 7.3 Error Handling Patterns

**Backend API Routes:**

```typescript
// src/app/api/v1/integrations/route.ts
import { withApiAuth } from '@/lib/api/middleware/auth';
import { handleApiError } from '@/lib/api/middleware/error-handler';
import { integrationService } from '@/lib/modules/integrations';

export const GET = withApiAuth(async (req, { tenant }) => {
  try {
    const integrations = await integrationService.listByTenant(tenant.id);
    return Response.json({
      success: true,
      data: integrations,
    });
  } catch (error) {
    return handleApiError(error);
  }
});
```

**Service Layer:**

```typescript
// src/lib/modules/integrations/integration.service.ts
import { IntegrationNotFoundError, ValidationError } from '@/lib/api/errors';

export async function getIntegration(id: string, tenantId: string) {
  const integration = await integrationRepository.findById(id);

  if (!integration) {
    throw new IntegrationNotFoundError(id);
  }

  if (integration.tenantId !== tenantId) {
    throw new IntegrationNotFoundError(id); // Don't leak existence
  }

  return integration;
}
```

### 7.4 State Management Patterns

**Server State (TanStack Query):**

```typescript
// src/hooks/useIntegrations.ts
export function useIntegrations() {
  return useQuery({
    queryKey: ['integrations'],
    queryFn: () => api.integrations.list(),
    staleTime: 30_000, // Consider fresh for 30s
  });
}
```

**UI State (Zustand):**

```typescript
// src/stores/ui.store.ts
export const useUIStore = create<UIState>((set) => ({
  sidebarOpen: true,
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
}));
```

### 7.5 Component Patterns

**Component Structure:**

```typescript
// src/components/features/integrations/IntegrationCard.tsx
import { type Integration } from '@/types';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface IntegrationCardProps {
  integration: Integration;
  onSelect?: (id: string) => void;
}

export function IntegrationCard({ integration, onSelect }: IntegrationCardProps) {
  return (
    <Card
      className="cursor-pointer hover:shadow-md transition-shadow"
      onClick={() => onSelect?.(integration.id)}
    >
      {/* Component content */}
    </Card>
  );
}
```

---

## 8. Security Architecture

### 8.1 Security Layers

```
┌─────────────────────────────────────────┐
│           Edge Security                  │
│     (Vercel Edge, TLS termination)      │
├─────────────────────────────────────────┤
│         Transport Security               │
│         (TLS 1.3 enforced)              │
├─────────────────────────────────────────┤
│        Application Security              │
│  (API key auth, RLS, rate limiting,     │
│   input validation, CORS)               │
├─────────────────────────────────────────┤
│          Data Security                   │
│  (Credential encryption, log sanitization│
│   minimal data retention)               │
└─────────────────────────────────────────┘
```

### 8.2 Security Measures

| Threat            | Mitigation            | Implementation                                |
| ----------------- | --------------------- | --------------------------------------------- |
| SQL Injection     | Parameterized queries | Prisma ORM (never raw SQL with user input)    |
| XSS               | Output encoding       | React's built-in escaping, CSP headers        |
| CSRF              | SameSite cookies      | Supabase Auth cookies are SameSite=Lax        |
| Credential Theft  | Encryption at rest    | AES-256-GCM for all stored credentials        |
| API Key Exposure  | Key hashing           | Bcrypt hash stored, plaintext never persisted |
| Data Leakage      | Log sanitization      | Auth headers/tokens stripped from logs        |
| Rate Limit Bypass | Per-key limiting      | API key identified before rate check          |
| Tenant Isolation  | Row-Level Security    | Supabase RLS policies on all tables           |

### 8.3 Sensitive Data Handling

| Data Type            | Classification | Storage           | Encryption          | Retention             |
| -------------------- | -------------- | ----------------- | ------------------- | --------------------- |
| Waygate API Keys     | SENSITIVE      | Hashed (bcrypt)   | N/A (one-way)       | Until revoked         |
| OAuth Access Tokens  | SENSITIVE      | Encrypted column  | AES-256-GCM         | Until expired/revoked |
| OAuth Refresh Tokens | SENSITIVE      | Encrypted column  | AES-256-GCM         | Until revoked         |
| External API Keys    | SENSITIVE      | Encrypted column  | AES-256-GCM         | Until deleted         |
| Request Logs         | INTERNAL       | Plain (sanitized) | N/A                 | 30 days               |
| User Emails          | PII            | Plain             | N/A (Supabase Auth) | Until account deleted |

### 8.4 Credential Encryption

**Algorithm:** AES-256-GCM  
**Key Management:**

- Single encryption key stored in Vercel environment variable
- Key is 32 bytes (256 bits) of cryptographically random data
- Key rotation requires re-encrypting all credentials (manual process for MVP)

**Implementation:**

```typescript
// src/lib/utils/crypto.ts
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

export function encrypt(plaintext: string): Buffer {
  const key = Buffer.from(process.env.ENCRYPTION_KEY!, 'hex');
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);

  const authTag = cipher.getAuthTag();

  // Format: IV (16) + AuthTag (16) + Ciphertext
  return Buffer.concat([iv, authTag, encrypted]);
}

export function decrypt(data: Buffer): string {
  const key = Buffer.from(process.env.ENCRYPTION_KEY!, 'hex');
  const iv = data.subarray(0, IV_LENGTH);
  const authTag = data.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = data.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  return decipher.update(ciphertext) + decipher.final('utf8');
}
```

---

## 9. Testing Architecture

### 9.1 Testing Pyramid

```
        ┌─────────┐
        │   E2E   │  ← 5-10 critical flows
        ├─────────┤
        │ Integr. │  ← API routes, database
        ├─────────┤
        │  Unit   │  ← Services, utilities
        └─────────┘
```

### 9.2 Testing Strategy by Layer

| Layer      | Test Type   | Tools                    | Coverage Target  |
| ---------- | ----------- | ------------------------ | ---------------- |
| Services   | Unit        | Vitest                   | 80%              |
| Utilities  | Unit        | Vitest                   | 90%              |
| API Routes | Integration | Vitest + Supertest       | Critical paths   |
| Components | Component   | Vitest + Testing Library | Key interactions |
| Full Flows | E2E         | Playwright               | Happy paths only |

### 9.3 Test File Organization

```
tests/
├── unit/
│   └── lib/
│       └── modules/
│           ├── execution/
│           │   ├── retry.test.ts
│           │   └── circuit-breaker.test.ts
│           └── credentials/
│               └── encryption.test.ts
├── integration/
│   └── api/
│       ├── integrations.test.ts
│       └── actions.test.ts
├── e2e/
│   └── flows/
│       ├── create-integration.spec.ts
│       └── invoke-action.spec.ts
├── fixtures/
│   ├── integrations.ts
│   └── actions.ts
└── helpers/
    ├── db.ts          # Test database setup/teardown
    └── mocks.ts       # External service mocks
```

### 9.4 Test Data Strategy

**Approach:** Factories + MSW (Mock Service Worker)

- **Database:** Test database reset between test suites via Prisma
- **External APIs:** MSW intercepts HTTP requests, returns fixtures
- **Credentials:** Test encryption key in test environment

---

## 10. Deployment Architecture

### 10.1 Environments

| Environment | Purpose          | URL                     | Branch          | Data                |
| ----------- | ---------------- | ----------------------- | --------------- | ------------------- |
| Local       | Development      | `localhost:3000`        | —               | Seed data           |
| Preview     | PR previews      | `*.vercel.app`          | PR branch       | Seed data           |
| Staging     | Pre-prod testing | `staging.{YOUR_DOMAIN}` | `main`          | Sanitized prod copy |
| Production  | Live system      | `app.{YOUR_DOMAIN}`     | `main` (manual) | Live                |

### 10.2 CI/CD Pipeline

```
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│   Push   │───▶│  Lint &  │───▶│   Test   │───▶│  Deploy  │
│   to PR  │    │  Type    │    │  Suite   │    │  Preview │
└──────────┘    └──────────┘    └──────────┘    └──────────┘
                                                      │
                                                      ▼
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│   Prod   │◀───│  Manual  │◀───│  Staging │◀───│  Merge   │
│  Deploy  │    │  Approve │    │  Deploy  │    │  to Main │
└──────────┘    └──────────┘    └──────────┘    └──────────┘
```

**GitHub Actions Workflow:**

```yaml
# .github/workflows/ci.yml
name: CI
on: [push, pull_request]

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'pnpm'
      - run: pnpm install
      - run: pnpm lint
      - run: pnpm type-check
      - run: pnpm test
```

### 10.3 Deployment Strategy

**Method:** Rolling (Vercel default — instant, zero-downtime)

**Rollback Process:**

1. Navigate to Vercel dashboard
2. Select previous deployment
3. Click "Promote to Production"
4. Instant rollback (< 30 seconds)

**Database Migrations:**

- Run `prisma migrate deploy` as part of Vercel build
- Migrations must be backwards-compatible (expand-contract pattern)

---

## 11. Performance Considerations

### 11.1 Frontend Performance

| Metric      | Target            | Strategy                                |
| ----------- | ----------------- | --------------------------------------- |
| LCP         | < 2.5s            | Server components, image optimization   |
| INP         | < 200ms           | Client-side caching, optimistic updates |
| CLS         | < 0.1             | Reserved space for dynamic content      |
| Bundle Size | < 200KB (initial) | Code splitting, tree shaking            |

### 11.2 Backend Performance

| Metric                 | Target  | Strategy                           |
| ---------------------- | ------- | ---------------------------------- |
| Gateway Overhead (p50) | < 100ms | Edge functions, connection pooling |
| Gateway Overhead (p95) | < 300ms | Warm functions, efficient queries  |
| Database Query (p95)   | < 50ms  | Indexes, query optimization        |

### 11.3 Caching Strategy (V1+)

| Layer    | Cache Type             | TTL          | Invalidation             |
| -------- | ---------------------- | ------------ | ------------------------ |
| CDN      | Static assets          | 1 year       | Content hash in filename |
| API      | Response cache (Redis) | Configurable | Manual or time-based     |
| Database | Query cache (Redis)    | 5 minutes    | On write                 |
| Client   | TanStack Query         | 30 seconds   | Manual invalidation      |

---

## 12. Scalability Architecture

### 12.1 Current Capacity (MVP Targets)

| Dimension               | MVP Target | Headroom Strategy   |
| ----------------------- | ---------- | ------------------- |
| Concurrent Users        | 10         | Vercel auto-scaling |
| Integrations per Tenant | 20         | Database indexes    |
| Actions per Integration | 50         | Pagination          |
| Requests/Second         | 10         | Edge functions      |
| Database Size           | 1 GB       | Supabase Pro tier   |

### 12.2 Scaling Strategy

| Component        | Scaling Type       | Trigger               | Action                        |
| ---------------- | ------------------ | --------------------- | ----------------------------- |
| API Functions    | Horizontal (auto)  | Traffic               | Vercel handles                |
| Database         | Vertical           | 80% connections       | Upgrade Supabase tier         |
| Background Jobs  | Horizontal         | Queue depth           | Add Trigger.dev workers (V1)  |
| Execution Engine | Extract to service | > 100 req/s sustained | Dedicated Fly.io service (V2) |

### 12.3 Bottleneck Identification

| Potential Bottleneck  | Mitigation                                       | Priority |
| --------------------- | ------------------------------------------------ | -------- |
| Database connections  | Connection pooling (PgBouncer via Supabase)      | P0       |
| Cold starts           | Edge Runtime for gateway endpoints               | P1       |
| AI rate limits        | Request queuing, model fallback                  | P1       |
| Credential decryption | In-memory caching of decrypted creds (short TTL) | P2       |

---

## 13. Disaster Recovery

### 13.1 Backup Strategy

| Data Type       | Frequency    | Retention | Storage  | Recovery Time |
| --------------- | ------------ | --------- | -------- | ------------- |
| Database        | Daily (auto) | 7 days    | Supabase | < 1 hour      |
| Database (PITR) | Continuous   | 7 days    | Supabase | < 15 minutes  |
| File Storage    | Daily (auto) | 7 days    | Supabase | < 1 hour      |
| Code            | Every push   | Infinite  | GitHub   | Instant       |

### 13.2 Recovery Procedures

**Database Recovery:**

1. Navigate to Supabase dashboard
2. Database → Backups
3. Select point-in-time or daily backup
4. Initiate restore
5. Update DATABASE_URL if new instance

**Application Recovery:**

1. `git checkout` to known-good commit
2. Push to trigger Vercel deployment
3. Or: Promote previous Vercel deployment

### 13.3 Incident Response

**Escalation Path:**

1. Automated alerts (Vercel) → Check logs
2. Manual triage → Identify root cause
3. Hotfix or rollback → Restore service
4. Post-mortem → Document and prevent

---

## 14. AI/LLM Integration Guidelines

> This section provides context for AI coding assistants working on this codebase.

### 14.1 Code Generation Preferences

**Preferred Patterns:**

- Use Zod schemas for all validation (never trust input)
- Throw errors, don't return them (use typed error classes)
- Prefer composition over inheritance
- Use dependency injection for testability
- Keep API routes thin — delegate to services

**Avoid:**

- `any` types — use `unknown` with type guards
- Default exports — use named exports
- Barrel files (`index.ts` re-exports) except for module roots
- Magic strings — use constants or enums
- Direct database access in API routes — use repositories

### 14.2 File Organization Rules

| New...       | Goes in...                                        |
| ------------ | ------------------------------------------------- |
| Component    | `src/components/features/{domain}/`               |
| API route    | `src/app/api/v1/{resource}/`                      |
| Service      | `src/lib/modules/{module}/{module}.service.ts`    |
| Repository   | `src/lib/modules/{module}/{module}.repository.ts` |
| Schema (Zod) | `src/lib/modules/{module}/{module}.schemas.ts`    |
| Types        | `src/types/` or co-located with module            |
| Hook         | `src/hooks/use{Name}.ts`                          |
| Utility      | `src/lib/utils/{name}.ts`                         |

### 14.3 Import Conventions

**Path Aliases:**

```typescript
// tsconfig.json paths
{
  "@/*": ["./src/*"]
}
```

**Import Order:**

1. React/Next.js imports
2. External packages
3. Internal absolute imports (`@/lib/...`)
4. Relative imports (`./`, `../`)
5. Type imports (with `type` keyword)

### 14.4 Common Tasks Reference

| Task                       | Files to Modify                                                         |
| -------------------------- | ----------------------------------------------------------------------- |
| Add new API endpoint       | `src/app/api/v1/{resource}/route.ts`, add to OpenAPI spec               |
| Add new integration module | Create folder in `src/lib/modules/`, add service + repository + schemas |
| Add new UI page            | `src/app/(dashboard)/{page}/page.tsx`                                   |
| Add new component          | `src/components/features/{domain}/{Component}.tsx`                      |
| Add database table         | `prisma/schema.prisma`, run `pnpm prisma migrate dev`                   |
| Add environment variable   | `.env.example`, `src/lib/config.ts`                                     |

### 14.5 Testing Requirements

- Unit tests required for: Services, utilities, complex logic
- Integration tests required for: API endpoints
- Test file naming: `{source}.test.ts` (unit), `{resource}.test.ts` (integration)
- Run tests: `pnpm test`

---

## Appendix A: Future Architecture - Hybrid Authentication Model (V2)

> This section documents planned architectural changes for V2's hybrid authentication model, where Waygate can act as an OAuth broker for major providers while still supporting user-owned credentials.

### A.1 Overview

The current MVP architecture requires users to bring their own OAuth app credentials for each integration. V2 will introduce a **hybrid model** similar to Merge.dev and Arcade.dev:

1. **Platform-owned credentials** - Waygate registers OAuth apps with major providers (Google, Slack, Microsoft, etc.), completes their security reviews (CASA, publisher verification), and users authenticate through Waygate's registered apps
2. **User-owned credentials** - Enterprise customers who require their own OAuth app registration for compliance or rate limit reasons can still bring their own credentials

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              V2 HYBRID AUTH MODEL                            │
│                                                                              │
│   ┌───────────────────────────────────────────────────────────────────────┐  │
│   │                     PLATFORM CONNECTORS                                │  │
│   │   ┌─────────────┐   ┌─────────────┐   ┌─────────────┐                 │  │
│   │   │   Slack     │   │   Google    │   │  Microsoft  │  ...            │  │
│   │   │  (Waygate   │   │  (Waygate   │   │  (Waygate   │                 │  │
│   │   │   OAuth)    │   │   OAuth)    │   │   OAuth)    │                 │  │
│   │   └──────┬──────┘   └──────┬──────┘   └──────┬──────┘                 │  │
│   │          │   CASA ✓        │  Verified ✓     │  Verified ✓            │  │
│   │          └─────────────────┴─────────────────┘                        │  │
│   │                            │                                           │  │
│   │                   Shared across all tenants                            │  │
│   │                   (rate limits pooled)                                 │  │
│   └───────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│   ┌───────────────────────────────────────────────────────────────────────┐  │
│   │                     USER-OWNED CREDENTIALS                             │  │
│   │   ┌─────────────────────────────────────────────────────────────────┐ │  │
│   │   │  Enterprise customers bring their own OAuth app registrations   │ │  │
│   │   │  - Full control over scopes and permissions                     │ │  │
│   │   │  - Dedicated rate limits                                        │ │  │
│   │   │  - Required for some enterprise security policies               │ │  │
│   │   └─────────────────────────────────────────────────────────────────┘ │  │
│   └───────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

### A.2 New Database Entities

```typescript
// New table: Platform-registered OAuth connectors
PlatformConnector: {
  id: uuid,
  providerSlug: string,           // 'slack', 'google-workspace', 'microsoft-365'
  displayName: string,            // 'Slack', 'Google Workspace'
  authType: enum,                 // oauth2, etc.
  oauthClientId: string,          // Waygate's OAuth client ID
  encryptedClientSecret: bytea,   // Encrypted client secret
  scopes: string[],               // Default scopes Waygate requests
  certifications: jsonb,          // { casa: { status: 'active', expiresAt: '2026-12-01' } }
  rateLimits: jsonb,              // { requestsPerMinute: 1000, shared: true }
  status: enum,                   // active, suspended, deprecated
  createdAt: timestamp,
  updatedAt: timestamp
}

// Modified: Integration now supports connector type
Integration: {
  ...existing fields...
  connectorType: enum,            // 'platform' | 'custom' (default: 'custom' for backward compat)
  platformConnectorId: uuid,      // FK → PlatformConnector (nullable, only if connectorType='platform')
}

// Modified: IntegrationCredential gains source tracking
IntegrationCredential: {
  ...existing fields...
  credentialSource: enum,         // 'platform' | 'user_owned' (default: 'user_owned')
}
```

### A.3 Auth Flow Changes

**Platform-owned flow (new):**

1. User clicks "Connect with Slack" using Waygate's pre-built connector
2. OAuth redirect uses Waygate's registered client_id
3. User authorizes Waygate's app (already CASA-verified)
4. Tokens stored with `credentialSource: 'platform'`
5. Rate limits are shared across all Waygate users for that provider

**User-owned flow (existing, unchanged):**

1. User configures their own OAuth app credentials
2. OAuth redirect uses their client_id
3. Tokens stored with `credentialSource: 'user_owned'`
4. Rate limits are dedicated to their OAuth app

### A.4 Compliance Management

Waygate will maintain certifications for platform connectors:

| Provider  | Certification Required | Renewal Cycle | Status Tracking            |
| --------- | ---------------------- | ------------- | -------------------------- |
| Google    | CASA (Tier 2)          | Annual        | `certifications.casa`      |
| Microsoft | Publisher Verification | One-time      | `certifications.publisher` |
| Slack     | App Directory Review   | One-time      | `certifications.appReview` |

Background jobs will alert when certifications approach expiration.

### A.5 Rate Limit Architecture

Platform connectors share rate limits across all tenants:

```typescript
// Rate limit tracking for platform connectors
PlatformRateLimit: {
  platformConnectorId: uuid,
  windowStart: timestamp,
  requestCount: integer,
  // Distributed counter via Redis (V1+ dependency)
}
```

Mitigation strategies:

- Request queuing with fair distribution across tenants
- Priority tiers for paid plans
- Automatic fallback to user-owned credentials if rate limited

### A.6 Migration Path

The hybrid model will be **additive** - existing user-owned credential flows remain unchanged:

1. **Phase 1**: Add `PlatformConnector` table and `connectorType` field
2. **Phase 2**: Register Waygate OAuth apps with top 5 providers
3. **Phase 3**: Build UI for "one-click connect" vs "bring your own"
4. **Phase 4**: Add compliance tracking dashboard
5. **Phase 5**: Implement shared rate limit management

---

## Appendix B: Decision Log Reference

For architecture decisions and their rationale, see `decision_log.md`.

Key decisions affecting this architecture:

- **ADR-001:** Modular monolith over microservices (simplicity for MVP)
- **ADR-002:** Supabase over Firebase (PostgreSQL, RLS, Prisma compatibility)
- **ADR-003:** Application-level encryption over Vault (fewer dependencies)
- **ADR-004:** Next.js API Routes over separate backend (unified deployment)
- **ADR-005:** Google/GitHub OAuth only for dashboard (no magic links)
- **ADR-006:** Native Firecrawl SDK initially, LangChain wrapper if needed later
- **ADR-015:** Hybrid auth model planned for V2 (platform-owned + user-owned credentials)

---

## Appendix C: Glossary

| Term                       | Definition                                                                                  |
| -------------------------- | ------------------------------------------------------------------------------------------- |
| **Action**                 | A single operation that can be performed through an integration (e.g., `slack.sendMessage`) |
| **Consuming App**          | An application that uses Waygate's Gateway API to access integrations                       |
| **Integration**            | A configured connection to an external API (e.g., Slack, Google)                            |
| **Tenant**                 | An isolated account in Waygate (organization or user)                                       |
| **Gateway API**            | The unified REST API that consuming apps call to invoke actions                             |
| **Waygate API Key**        | The API key consuming apps use to authenticate with Waygate                                 |
| **Integration Credential** | OAuth tokens or API keys for external services (stored encrypted)                           |
| **Request Pipeline**       | The chain of middleware that processes action invocations                                   |
| **Circuit Breaker**        | Pattern that fails fast when an external API is unhealthy                                   |

---

## Appendix D: Related Documentation

| Document     | Purpose             | Location                      |
| ------------ | ------------------- | ----------------------------- |
| Product Spec | What we're building | `product_spec.md`             |
| Decision Log | Why we chose things | `decision_log.md`             |
| Changelog    | What changed        | `changelog.md`                |
| API Docs     | API reference       | Generated from code (OpenAPI) |

---

## Appendix E: MVP vs Future Scope

| Capability          | MVP              | V0.5       | V1                | V2           |
| ------------------- | ---------------- | ---------- | ----------------- | ------------ |
| AI Doc Scraping     | ✅               | —          | —                 | —            |
| Action Registry     | ✅               | —          | —                 | —            |
| OAuth2/API Key Auth | ✅               | —          | —                 | —            |
| Token Refresh       | ✅               | —          | —                 | —            |
| Retry Logic         | ✅               | —          | —                 | —            |
| Circuit Breaker     | ✅ (in-memory)   | —          | Persisted (Redis) | —            |
| Gateway API         | ✅               | —          | —                 | —            |
| Config UI           | ✅ (basic)       | —          | Enhanced          | Full no-code |
| Pagination Handler  | —                | ✅         | —                 | —            |
| Response Validation | —                | ✅         | —                 | —            |
| Field Mapping       | —                | ✅ (basic) | Per-app custom    | —            |
| Integration Tagging | —                | ✅         | —                 | —            |
| Smart Caching       | —                | —          | ✅ (Redis)        | —            |
| Background Jobs     | ✅ (Vercel Cron) | —          | ✅ (Trigger.dev)  | —            |
| Health Checks       | —                | —          | ✅                | —            |
| Auto-Maintenance    | —                | —          | —                 | ✅           |
| Versioning/Rollback | —                | —          | —                 | ✅           |
| Webhook Ingestion   | —                | —          | —                 | ✅           |
| LLM Tool Wrapping   | —                | —          | —                 | ✅           |
| RBAC/Teams          | —                | —          | —                 | ✅           |
