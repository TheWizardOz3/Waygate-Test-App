# Feature: AI Documentation Scraper

**Status:** Complete  
**Priority:** P0  
**Complexity:** HIGH  
**Dependencies:** Database Setup (completed)  
**Milestone:** MVP

---

## Overview

The AI Documentation Scraper is the entry point for creating new integrations. It accepts API documentation URLs, intelligently discovers and selects the most relevant pages using Firecrawl's map function and LLM-guided prioritization, then uses Google Gemini to extract structured API specifications including endpoints, authentication methods, request/response schemas, and rate limits.

This feature enables the core value proposition: **"Drop in documentation, get production-ready integrations."**

### Intelligent Crawling (v0.1.3+)

Instead of blindly crawling pages breadth-first, the system now:

1. **Maps the entire site** using Firecrawl's `/map` endpoint (discovers up to 5000 URLs in seconds)
2. **Pre-filters URLs** using regex patterns to exclude non-documentation pages
3. **LLM triages remaining URLs** - assigns priority scores and categories
4. **Selects the best pages** ensuring coverage of auth docs, wishlist matches, and API endpoints

---

## User Story

> As a developer, I want to provide an API documentation URL and a wishlist of desired actions, so that Waygate can automatically understand and map the API's capabilities.

---

## Requirements

### Functional Requirements

- [x] Accept documentation URL(s) as input
- [x] Optionally accept OpenAPI/Swagger spec files directly (bypass scraping)
- [x] Crawl and extract relevant pages from documentation sites
- [x] Detect authentication methods (OAuth2, API Key, Basic Auth, Bearer, Custom Headers)
- [x] Extract endpoint definitions (method, path, parameters, body schema)
- [x] Identify rate limit information from docs or headers
- [x] Generate structured API capability map
- [x] Allow user to provide a "wishlist" of desired actions to prioritize
- [x] Track scraping job status (pending, in_progress, completed, failed)
- [x] Cache scraped content to avoid repeated fetches

### Non-Functional Requirements

- Scraping timeout: 5 minutes maximum
- Support for JavaScript-rendered documentation sites (via Firecrawl)
- AI extraction must handle partial/incomplete documentation gracefully
- Results should be editable/correctable by users post-scrape

---

## Acceptance Criteria

1. **Given** a Slack API docs URL, **when** scraped, **then** system identifies OAuth2 auth and key endpoints like `chat.postMessage`, `users.list`
2. **Given** an OpenAPI spec file, **when** uploaded, **then** system parses it without needing to crawl
3. **Given** a wishlist of "send message, list users, create channel", **when** scraped, **then** those actions are prioritized in the generated registry
4. **Given** a scrape job is initiated, **when** checking status, **then** accurate progress is returned
5. **Given** documentation that was previously scraped, **when** re-scraping, **then** cached content can be reused
6. **Given** a documentation URL with hundreds of pages, **when** intelligent crawl is enabled, **then** system maps all URLs and selects the most relevant API documentation pages (including auth)

---

## Technical Design

### Architecture

```
User provides URL + Wishlist
         │
         ▼
┌─────────────────────────────┐
│   Scrape API Endpoint       │
│   POST /api/v1/scrape       │
└─────────────┬───────────────┘
              │
              ▼
┌─────────────────────────────┐
│   Scrape Job Service        │
│   Creates job, manages state│
└─────────────┬───────────────┘
              │
    ┌─────────┴─────────────────────┐
    ▼                               ▼
┌───────────────────────┐     ┌───────────┐
│  Intelligent Crawler  │     │  OpenAPI  │
│  (Default for URLs)   │     │  Parser   │
│  ┌─────────────────┐  │     │(for specs)│
│  │ 1. Firecrawl    │  │     └─────┬─────┘
│  │    Map Site     │  │           │
│  ├─────────────────┤  │           │
│  │ 2. LLM Triage   │  │           │
│  │    URLs         │  │           │
│  ├─────────────────┤  │           │
│  │ 3. Scrape Top   │  │           │
│  │    Priority     │  │           │
│  └─────────────────┘  │           │
└───────────┬───────────┘           │
            │                       │
            └───────────┬───────────┘
                        ▼
┌─────────────────────────────┐
│   AI Document Parser        │
│   (Google Gemini)           │
│   - Extract endpoints       │
│   - Detect auth methods     │
│   - Generate schemas        │
└─────────────┬───────────────┘
              │
              ▼
┌─────────────────────────────┐
│   Action Generator          │
│   - Create Action defs      │
│   - Apply wishlist priority │
└─────────────┬───────────────┘
              │
              ▼
┌─────────────────────────────┐
│   Store Results             │
│   - Cache in Supabase       │
│   - Return to user          │
└─────────────────────────────┘
```

### Database Schema Additions

```prisma
model ScrapeJob {
  id              String          @id @default(uuid())
  tenantId        String          @map("tenant_id")
  status          ScrapeJobStatus @default(PENDING)
  documentationUrl String         @map("documentation_url")
  wishlist        String[]        @default([])
  progress        Int             @default(0)
  result          Json?           // Parsed API structure
  error           Json?           // Error details if failed
  cachedContentKey String?        @map("cached_content_key") // Supabase Storage key
  createdAt       DateTime        @default(now()) @map("created_at")
  updatedAt       DateTime        @updatedAt @map("updated_at")
  completedAt     DateTime?       @map("completed_at")

  tenant          Tenant          @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@map("scrape_jobs")
}

enum ScrapeJobStatus {
  PENDING
  CRAWLING
  PARSING
  GENERATING
  COMPLETED
  FAILED
}
```

### Key Files

| File                                          | Purpose                                                                |
| --------------------------------------------- | ---------------------------------------------------------------------- |
| `src/lib/modules/ai/index.ts`                 | Module exports                                                         |
| `src/lib/modules/ai/ai.service.ts`            | Main orchestrator for documentation processing to integration creation |
| `src/lib/modules/ai/intelligent-crawler.ts`   | **LLM-guided page selection: Map → Triage → Scrape (default mode)**    |
| `src/lib/modules/ai/doc-scraper.ts`           | Firecrawl integration for URL scraping and basic BFS crawling          |
| `src/lib/modules/ai/openapi-parser.ts`        | Direct OpenAPI/Swagger specification parsing                           |
| `src/lib/modules/ai/document-parser.ts`       | AI-powered content extraction using chunking and parallel processing   |
| `src/lib/modules/ai/action-generator.ts`      | Transforms ParsedApiDoc into ActionDefinitions with JSON Schema        |
| `src/lib/modules/ai/scrape-job.service.ts`    | Job lifecycle, async processing, and status management                 |
| `src/lib/modules/ai/scrape-job.repository.ts` | Database CRUD operations for ScrapeJob                                 |
| `src/lib/modules/ai/scrape-job.schemas.ts`    | Zod schemas for API validation and ParsedApiDoc structure              |
| `src/lib/modules/ai/prompts/extract-api.ts`   | Specialized prompts for endpoint, auth, and rate limit extraction      |
| `src/lib/modules/ai/storage.ts`               | Supabase Storage integration with gzip compression                     |
| `src/lib/modules/ai/llm/client.ts`            | Centralized LLM model management and provider factory                  |
| `src/lib/modules/ai/llm/providers/gemini.ts`  | Google Gemini client with structured output support                    |
| `src/lib/modules/ai/llm/types.ts`             | LLM provider interface for future extensibility                        |
| `src/app/api/v1/scrape/route.ts`              | POST /scrape (create job) + GET /scrape (list jobs)                    |
| `src/app/api/v1/scrape/[jobId]/route.ts`      | GET /scrape/:jobId (job status)                                        |
| `src/lib/modules/ai/templates/index.ts`       | **Template registry and exports (v0.1.7)**                             |
| `src/lib/modules/ai/templates/types.ts`       | **TypeScript types for templates (v0.1.7)**                            |
| `src/lib/modules/ai/templates/postgrest.ts`   | **PostgREST/Supabase template with 7 actions (v0.1.7)**                |
| `src/lib/modules/ai/templates/rest-crud.ts`   | **Generic REST CRUD template with 6 actions (v0.1.7)**                 |
| `src/lib/modules/ai/templates/detector.ts`    | **Auto-detection of template patterns from scraped content (v0.1.7)**  |
| `src/lib/modules/ai/templates/generator.ts`   | **Converts templates to ParsedApiDoc format (v0.1.7)**                 |

### API Endpoints

**POST `/api/v1/scrape`**

```typescript
// Request
{
  "documentationUrl": "https://api.slack.com/methods",
  "wishlist": ["send message", "list users", "create channel"],
  "crawl": true,           // Default: true (multi-page mode)
  "intelligentCrawl": true, // Default: true (LLM-guided page selection)
  "maxPages": 30           // Default: 30 (increased for better coverage)
}

// Response
{
  "success": true,
  "data": {
    "jobId": "job_abc123",
    "status": "PENDING",
    "estimatedDuration": 60000
  }
}
```

**Crawl Mode Options:**
| `crawl` | `intelligentCrawl` | Behavior |
|---------|-------------------|----------|
| `true` | `true` (default) | Map entire site → LLM prioritizes URLs → Scrape top pages |
| `true` | `false` | Basic breadth-first crawling (legacy mode) |
| `false` | N/A | Single page scrape only (fastest) |

**GET `/api/v1/scrape/:jobId`**

```typescript
// Response (in progress)
{
  "success": true,
  "data": {
    "jobId": "job_abc123",
    "status": "PARSING",
    "progress": 65,
    "currentStep": "Extracting endpoints from documentation..."
  }
}

// Response (completed)
{
  "success": true,
  "data": {
    "jobId": "job_abc123",
    "status": "COMPLETED",
    "progress": 100,
    "result": {
      "name": "Slack API",
      "baseUrl": "https://slack.com/api",
      "authMethods": [
        { "type": "oauth2", "config": { ... } },
        { "type": "bearer", "config": { ... } }
      ],
      "endpoints": [
        {
          "name": "Send Message",
          "method": "POST",
          "path": "/chat.postMessage",
          "description": "Sends a message to a channel",
          "parameters": [...],
          "requestBody": {...},
          "responses": {...}
        }
      ],
      "rateLimits": {
        "default": { "requests": 50, "window": 60 }
      }
    }
  }
}
```

### Parsed API Structure Schema

```typescript
interface ParsedApiDoc {
  name: string;
  description?: string;
  baseUrl: string;
  version?: string;

  authMethods: Array<{
    type: 'oauth2' | 'api_key' | 'basic' | 'bearer' | 'custom_header';
    config: Record<string, unknown>;
    location?: 'header' | 'query' | 'body';
    paramName?: string;
  }>;

  endpoints: Array<{
    name: string;
    slug: string;
    description?: string;
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    path: string;
    pathParameters?: Array<{
      name: string;
      type: string;
      required: boolean;
      description?: string;
    }>;
    queryParameters?: Array<{
      name: string;
      type: string;
      required: boolean;
      description?: string;
    }>;
    requestBody?: {
      contentType: string;
      schema: object; // JSON Schema
      required: boolean;
    };
    responses: Record<
      string,
      {
        description: string;
        schema?: object; // JSON Schema
      }
    >;
    tags?: string[];
    deprecated?: boolean;
  }>;

  rateLimits?: {
    default?: { requests: number; window: number };
    perEndpoint?: Record<string, { requests: number; window: number }>;
  };

  metadata?: {
    scrapedAt: string;
    sourceUrls: string[];
    aiConfidence: number; // 0-1 score
    warnings: string[];
  };
}
```

---

## Implementation Tasks

### Task 1: Firecrawl SDK Setup (~30 min)

**Files:** `package.json`, `.env.example`, `src/lib/modules/ai/doc-scraper.ts`

- Install Firecrawl SDK: `npm install @mendable/firecrawl-js`
- Add `FIRECRAWL_API_KEY` to environment variables
- Create basic Firecrawl client wrapper with initialization and error handling
- Export `scrapeUrl()` function that returns raw markdown content

### Task 2: Google Gemini Setup (~30 min)

**Files:** `package.json`, `.env.example`, `src/lib/modules/ai/gemini-client.ts`

- Install Google Generative AI SDK: `npm install @google/generative-ai`
- Add `GOOGLE_API_KEY` to environment variables
- Create Gemini client wrapper with model configuration (gemini-3.0-pro)
- Export `generateContent()` function with structured output support

### Task 3: Scrape Job Database Model (~30 min)

**Files:** `prisma/schema.prisma`, `src/lib/modules/ai/scrape-job.repository.ts`

- Add `ScrapeJob` model and `ScrapeJobStatus` enum to Prisma schema
- Run migration: `npx prisma migrate dev --name add_scrape_jobs`
- Create `scrapeJobRepository` with `create()`, `findById()`, `update()` methods
- Add RLS policies for tenant isolation

### Task 4: Scrape Job Service & Schemas (~45 min)

**Files:** `src/lib/modules/ai/scrape-job.service.ts`, `src/lib/modules/ai/scrape-job.schemas.ts`

- Create Zod schemas for scrape job creation and responses
- Implement `createScrapeJob()` - creates job with PENDING status
- Implement `getScrapeJob()` - retrieves job with status
- Implement `updateJobStatus()` - updates progress and status

### Task 5: Basic Doc Scraper Implementation (~45 min)

**Files:** `src/lib/modules/ai/doc-scraper.ts`

- Implement `scrapeDocumentation()` using Firecrawl
- Handle single URL scraping with proper error handling
- Return structured result: `{ url, content, contentType, scrapedAt }`
- Implement timeout handling (5 min max)

### Task 6: Multi-page Crawling (~45 min) ✅

**Files:** `src/lib/modules/ai/doc-scraper.ts`

- Extend `scrapeDocumentation()` with `crawlMode` option
- Implement depth-limited crawling (max 3 levels)
- Implement page limit (max 20 pages)
- Filter for relevant API documentation pages only
- Aggregate content from multiple pages

### Task 6b: Intelligent Crawling with LLM-Guided Page Selection (~2 hours) ✅ NEW

**Files:** `src/lib/modules/ai/intelligent-crawler.ts`

- **Firecrawl Map Integration**: `mapWebsite()` discovers all site URLs via `/map` endpoint (up to 5000 URLs)
- **URL Pattern Detection**: `detectUrlCategory()` classifies URLs into categories: `api_endpoint`, `api_reference`, `authentication`, `getting_started`, `rate_limits`, etc.
- **Pre-filtering**: `preFilterUrls()` excludes obvious non-doc pages (blog, pricing, careers, images) before LLM
- **LLM Triage**: `triageUrls()` uses Gemini to assign priority scores (0-100) with batching for large URL lists
- **Wishlist Awareness**: Boosts URLs matching wishlist items but doesn't exclude other valuable pages
- **Auth Priority**: Authentication pages always get high priority (95+)
- **Smart Selection**: `selectUrlsToScrape()` ensures balanced coverage of auth, endpoints, and reference
- **Organized Output**: Content aggregated by category (Auth → Overview → Endpoints) for better AI parsing
- **ProcessJobOptions**: Added `intelligentCrawl` option (defaults to `true`)

### Task 7: AI Extraction Prompts (~45 min)

**Files:** `src/lib/modules/ai/prompts/extract-api.ts`

- Create system prompt for API documentation extraction
- Create structured output prompt for endpoints extraction
- Create prompt for authentication method detection
- Create prompt for rate limit detection
- Include few-shot examples for better accuracy

### Task 8: AI Document Parser (~60 min)

**Files:** `src/lib/modules/ai/document-parser.ts`

- Implement `parseApiDocumentation(content: string)` using Gemini
- Parse scraped content to extract structured API data
- Use Gemini's structured output (JSON mode) for reliability
- Handle partial documentation gracefully (fill gaps with defaults)
- Return `ParsedApiDoc` structure
- Include confidence scores for AI-extracted data

### Task 9: OpenAPI Direct Parser (~45 min)

**Files:** `src/lib/modules/ai/openapi-parser.ts`

- Install OpenAPI parser: `npm install @readme/openapi-parser` or similar
- Implement `parseOpenApiSpec(content: string | object)`
- Support both JSON and YAML formats
- Convert OpenAPI structure to `ParsedApiDoc` format
- Handle OpenAPI 2.0 (Swagger) and OpenAPI 3.x
- No AI needed for this path

### Task 10: Scrape API Endpoints (~45 min)

**Files:** `src/app/api/v1/scrape/route.ts`, `src/app/api/v1/scrape/[jobId]/route.ts`

- Implement POST `/api/v1/scrape` - Initiate scraping job
- Implement GET `/api/v1/scrape/:jobId` - Get job status
- Add request validation using Zod schemas
- Use existing auth middleware
- Return standard API response format

### Task 11: Async Job Processing (~60 min)

**Files:** `src/lib/modules/ai/scrape-job.service.ts`, `src/app/api/v1/scrape/route.ts`

- Implement async job execution (non-blocking)
- Use `waitUntil` for Vercel background execution, OR
- Process synchronously for MVP (simpler, ~60s timeout)
- Update job status at each stage (CRAWLING → PARSING → GENERATING)
- Handle errors and update job with error details

### Task 12: Scraped Content Storage (~30 min)

**Files:** `src/lib/modules/ai/storage.ts`

- Create Supabase Storage bucket for scraped content
- Implement `storeScrapedContent(jobId, content)`
- Implement `getScrapedContent(storageKey)`
- Use for caching previously scraped documentation
- Set appropriate retention policy (30 days)

### Task 13: Action Definition Generator (~60 min)

**Files:** `src/lib/modules/ai/action-generator.ts`

- Implement `generateActions(parsedDoc: ParsedApiDoc, wishlist: string[])`
- Transform parsed endpoints into Action definitions
- Generate JSON Schema for input/output from extracted parameters
- Apply wishlist prioritization (matched actions first)
- Generate action slugs following convention

### Task 14: Integration Creation from Scrape (~45 min)

**Files:** `src/lib/modules/ai/ai.service.ts`, integration with `integrations` module

- Create main `processDocumentation(url, options)` orchestrator
- Connect scrape results to Integration creation flow
- Create integration + actions from parsed docs
- Update scrape job with resulting integration ID
- Handle partial failures (integration created but some actions failed)

---

## Edge Cases

| Scenario                   | Handling                                                             |
| -------------------------- | -------------------------------------------------------------------- |
| Docs behind authentication | Return error with message to use OpenAPI spec upload instead         |
| Incomplete documentation   | Extract what's available, add warnings to metadata                   |
| Multiple API versions      | Detect and include version info, let user select (future)            |
| Very large documentation   | **Intelligent crawl maps all URLs, LLM selects best 30 pages**       |
| Non-English documentation  | Attempt extraction, may have lower accuracy                          |
| Rate limited during scrape | Retry with backoff, respect Retry-After                              |
| Timeout during scrape      | Partial results with error, allow retry                              |
| Missing auth documentation | **Intelligent crawl prioritizes auth pages (score 95+)**             |
| Wishlist items not found   | **LLM searches for related pages, returns other valuable endpoints** |

---

## Success Metrics

- Can successfully scrape and parse 5+ different API documentation sites (Slack, GitHub, Stripe, etc.)
- OpenAPI spec upload works for valid specs
- Endpoint extraction accuracy > 80% on test documentation
- Auth method detection accuracy > 90%
- Scrape job completes in < 2 minutes for typical documentation
- **Intelligent Crawling (v0.1.3+):**
  - URL mapping discovers 90%+ of documentation pages
  - LLM triage correctly prioritizes API endpoint pages
  - Authentication documentation is always included
  - Wishlist items are found when present in documentation

---

## Future Enhancements (Out of Scope for MVP)

- Incremental re-scraping to detect API changes
- Custom selectors for complex documentation sites
- Multiple documentation source aggregation
- User corrections fed back to improve AI extraction
- Integration with documentation change monitoring
- ~~LLM-guided link prioritization~~ ✅ Implemented in v0.1.3
- ~~Wishlist-aware crawling~~ ✅ Implemented in v0.1.3
- ~~Smarter URL pattern detection~~ ✅ Implemented in v0.1.3
- ~~Template-based integration creation~~ ✅ Implemented in v0.1.7

---

## Template-Based Integration Creation (v0.1.7)

### Overview

Some APIs have dynamically-generated endpoints based on user schemas (database tables, collections, content types). These APIs can't be effectively scraped because endpoints are determined at runtime by the user's data model:

- **Supabase/PostgREST** - Endpoints based on database tables
- **Airtable** - Endpoints based on bases and tables
- **Notion** - Database endpoints based on workspace content
- **Firebase/Firestore** - Collection-based endpoints
- **Headless CMS** (Strapi, Contentful) - Content-type driven endpoints

For these APIs, Waygate offers **Template-Based Integration Creation**: pre-built action templates with parameterized resources.

### User Story

> As a developer, I want to create an integration for a schema-driven API like Supabase by selecting a template and providing my base URL, so that I can quickly set up parameterized actions without needing AI to scrape non-existent documentation.

### How It Works

1. **User enters documentation URL as normal** (no special selection required)
2. **AI scrapes and parses the documentation**
3. **During parsing, AI auto-detects if API matches a known template pattern** (e.g., PostgREST/Supabase)
4. **If template detected → shows banner in Review Actions step** offering to add template actions
5. **User can accept template actions** which are added alongside AI-extracted actions
6. **Template actions are visually marked** with a purple border for easy identification

### Available Templates

#### PostgREST Template (Supabase-compatible)

For APIs following the PostgREST convention (auto-generated REST from PostgreSQL):

| Action            | Method | Path                             | Parameters                                                                     |
| ----------------- | ------ | -------------------------------- | ------------------------------------------------------------------------------ |
| `query-resource`  | GET    | `/rest/v1/{resource}`            | `resource` (string), `select` (string, optional), `filters` (object, optional) |
| `get-by-id`       | GET    | `/rest/v1/{resource}?id=eq.{id}` | `resource`, `id`                                                               |
| `insert-resource` | POST   | `/rest/v1/{resource}`            | `resource`, `data` (object)                                                    |
| `update-resource` | PATCH  | `/rest/v1/{resource}?id=eq.{id}` | `resource`, `id`, `data` (object)                                              |
| `upsert-resource` | POST   | `/rest/v1/{resource}`            | `resource`, `data` (object), headers: `Prefer: resolution=merge-duplicates`    |
| `delete-resource` | DELETE | `/rest/v1/{resource}?id=eq.{id}` | `resource`, `id`                                                               |
| `call-rpc`        | POST   | `/rest/v1/rpc/{function}`        | `function`, `args` (object)                                                    |

#### Generic REST CRUD Template

For standard REST APIs with resource-based endpoints:

| Action            | Method | Path               | Parameters                                          |
| ----------------- | ------ | ------------------ | --------------------------------------------------- |
| `list-resources`  | GET    | `/{resource}`      | `resource`, `limit` (optional), `offset` (optional) |
| `get-resource`    | GET    | `/{resource}/{id}` | `resource`, `id`                                    |
| `create-resource` | POST   | `/{resource}`      | `resource`, `data` (object)                         |
| `update-resource` | PUT    | `/{resource}/{id}` | `resource`, `id`, `data` (object)                   |
| `patch-resource`  | PATCH  | `/{resource}/{id}` | `resource`, `id`, `data` (object)                   |
| `delete-resource` | DELETE | `/{resource}/{id}` | `resource`, `id`                                    |

### Implementation Tasks

#### Task 15: Template Definitions & Schema (~45 min) ✅

**Files:** `src/lib/modules/ai/templates/index.ts`, `src/lib/modules/ai/templates/types.ts`, `src/lib/modules/ai/templates/postgrest.ts`, `src/lib/modules/ai/templates/rest-crud.ts`

- Create TypeScript types for action templates
- Define PostgREST template with all 7 actions
- Define Generic REST CRUD template with 6 actions
- Include JSON Schema definitions for each action's input/output
- Export template registry with metadata (name, description, icon, auth hints)

#### Task 16: Template Auto-Detection (~45 min) ✅

**Files:** `src/lib/modules/ai/templates/detector.ts`, `src/lib/modules/ai/scrape-job.service.ts`

- Implement `detectTemplate(parsedDoc, scrapedContent, sourceUrls)` function
- Pattern matching for PostgREST (Supabase URLs, `/rest/v1/` paths, PostgREST keywords)
- Pattern matching for Generic REST CRUD (standard resource patterns)
- Return confidence score and detection signals
- Integrate into `finalizeDocument()` in scrape job processing

#### Task 17: Template-to-Actions Generator (~45 min) ✅

**Files:** `src/lib/modules/ai/templates/generator.ts`

- Implement `generateFromTemplate(templateId, baseUrl, options)`
- Transform template definitions into proper ActionDefinition objects
- Generate unique slugs per integration
- Apply base URL to all action paths
- Return ParsedApiDoc-compatible structure

#### Task 18: Review Actions Template Banner (~30 min) ✅

**Files:** `src/stores/wizard.store.ts`, `src/components/features/integrations/wizard/StepReviewActions.tsx`

- Add `detectedTemplate` to wizard state (auto-populated from scrape result)
- Show template detection banner when pattern is found
- "Add template actions" button merges template actions with AI-extracted ones
- Template actions marked with purple border and "Template" badge

### Template Schema

```typescript
interface ActionTemplate {
  id: string;
  name: string;
  description: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  pathTemplate: string; // e.g., "/rest/v1/{resource}"
  pathParameters: ParameterDef[];
  queryParameters?: ParameterDef[];
  requestBody?: {
    contentType: string;
    schema: JSONSchema;
  };
  responseSchema?: JSONSchema;
  headers?: Record<string, string>;
}

interface IntegrationTemplate {
  id: string;
  name: string;
  description: string;
  icon: string; // Lucide icon name
  suggestedAuthType: AuthType;
  suggestedAuthConfig?: Partial<AuthConfig>;
  baseUrlPlaceholder: string; // e.g., "https://YOUR-PROJECT.supabase.co"
  baseUrlHint: string;
  actions: ActionTemplate[];
}
```

### Test Cases

| Component                | Test Cases                                                                                   |
| ------------------------ | -------------------------------------------------------------------------------------------- |
| **Template Registry**    | Templates load correctly; All templates have required fields; Actions have valid JSON Schema |
| **Template Generator**   | Generates correct action count; Applies base URL correctly; Creates valid slugs              |
| **Wizard Template Mode** | Template selection shows cards; Skips scraping; Creates integration successfully             |

---

## Test Plan

### Unit Tests

| Component               | Test Cases                                                                                                                                                                          |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Firecrawl Client**    | Successful scrape returns markdown; Timeout handling; Error response handling; Rate limit handling                                                                                  |
| **Gemini Client**       | Successful generation; Structured output parsing; Error handling; Token limit handling                                                                                              |
| **OpenAPI Parser**      | Valid OpenAPI 3.x parsing; Valid Swagger 2.0 parsing; YAML format support; Invalid spec handling; Conversion to ParsedApiDoc                                                        |
| **Document Parser**     | Endpoint extraction from markdown; Auth method detection; Rate limit extraction; Partial doc handling; Confidence scoring                                                           |
| **Action Generator**    | Endpoint to Action conversion; JSON Schema generation; Wishlist prioritization; Slug generation                                                                                     |
| **Scrape Job Service**  | Job creation; Status transitions (PENDING → CRAWLING → PARSING → GENERATING → COMPLETED); Error state handling; Progress updates                                                    |
| **Intelligent Crawler** | URL category detection (api_endpoint, authentication, etc.); Pre-filter excludes non-doc URLs; Pattern matching for exclusions; Host filtering; Auth page prioritization (45 tests) |

### Integration Tests

| Endpoint                      | Test Cases                                                                                                                    |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| **POST /api/v1/scrape**       | Valid request creates job; Invalid URL rejected; Missing auth returns 401; Wishlist validation; Options validation            |
| **GET /api/v1/scrape/:jobId** | Returns job status; 404 for invalid jobId; Tenant isolation (can't access other tenant's jobs); Completed job includes result |

### E2E Test Scenarios

| Scenario                        | Description                                                                        |
| ------------------------------- | ---------------------------------------------------------------------------------- |
| **Happy Path - URL Scrape**     | Submit URL → Job created → Poll status → Job completes → Result contains endpoints |
| **Happy Path - OpenAPI Upload** | Submit OpenAPI spec → Immediate parsing → Actions generated                        |
| **Error Recovery**              | Submit invalid URL → Job fails → Error details returned                            |
| **Wishlist Prioritization**     | Submit with wishlist → Matched actions appear first in results                     |

### Mock Requirements

- **Firecrawl**: Mock API responses with sample documentation HTML/markdown
- **Google Gemini**: Mock structured output responses with sample parsed data
- **Supabase Storage**: Mock storage operations for content caching

---

## References

- [Firecrawl Documentation](https://docs.firecrawl.dev/)
- [Google Gemini API](https://ai.google.dev/docs)
- [OpenAPI Specification](https://swagger.io/specification/)
- [Product Spec - AI Documentation Scraper](../product_spec.md#feature-ai-documentation-scraper)
