# Feature: Composite Tools

**Milestone:** V1.5 (AI Tool Factory - Agentic Tools)
**Status:** Planning
**Dependencies:** Simple Tool Export (V1.1)
**Priority:** P0

---

## 1. Overview

### 1.1 One-Line Summary

Composite Tools allow users to combine multiple simple tool operations (across one or more integrations) into a single unified tool with configurable routing logic.

### 1.2 User Story

> As an **AI application developer**, I want to **create a single "Scrape" tool that intelligently routes to the correct specialized scraper based on the URL**, so that **my AI agents don't need to know which specific integration to use for each website**.

### 1.3 Problem Statement

After implementing Simple Tool Export (V1.1), developers can export individual actions as AI tools. However, real-world use cases often require:

1. **Multiple operations that serve the same purpose** — e.g., Firecrawl generic scraper, plus specialized scrapers for LinkedIn, Reddit, and Yelp (each potentially a different integration or action)
2. **Smart routing logic** — The AI agent shouldn't need to decide which scraper to use; the tool should figure it out based on the input
3. **Unified interface** — A single "Scrape" tool is cleaner than exposing 4 separate scraping tools to the agent

Currently, developers must either:

- Expose all individual tools and hope the agent picks the right one
- Build custom wrapper logic outside of Waygate
- Embed complex routing instructions in tool descriptions

Composite Tools solve this by letting users define aggregate tools that wrap multiple operations with configurable routing logic.

### 1.4 Business Value

- **User Impact:** Cleaner agent tool interfaces, reduced agent decision complexity, higher action success rates
- **Business Impact:** Differentiated feature that positions Waygate as an AI-native tool factory (not just an integration gateway)
- **Technical Impact:** Foundation for Intelligent/Agentic Tools (V1.5 next phase); enables tool composition patterns

### 1.5 Relationship to DoubleO Tool Levels

From the DoubleO Tools Playbook:

| Level                               | Description                                             | Waygate Status                        |
| ----------------------------------- | ------------------------------------------------------- | ------------------------------------- |
| **Level 1: Simple Operation Tools** | Direct wrappers around specific operations              | ✅ Complete (V1.1 Simple Tool Export) |
| **Composite Tools** (this feature)  | Single tools that wrap multiple operations with routing | 🎯 This Feature                       |
| **Level 2: Intelligent Tools**      | Tools with embedded LLMs for complex reasoning          | ⏳ Next (V1.5 Agentic Tools)          |

Composite Tools bridge the gap between simple operation tools and intelligent tools by providing **deterministic composition** without requiring embedded LLMs.

---

## 2. Scope & Requirements

### 2.1 Functional Requirements

| ID    | Requirement                                                       | Priority | Notes                                     |
| ----- | ----------------------------------------------------------------- | -------- | ----------------------------------------- |
| FR-1  | Create composite tools that wrap multiple actions                 | MUST     | Core feature                              |
| FR-2  | Actions can span multiple integrations                            | MUST     | e.g., Firecrawl + RapidAPI LinkedIn       |
| FR-3  | Support rule-based routing (deterministic)                        | MUST     | e.g., "URL contains linkedin.com"         |
| FR-4  | Support agent-driven operation selection                          | MUST     | Operation as an enum argument             |
| FR-5  | Unified input schema across all wrapped operations                | MUST     | Single interface to the composite tool    |
| FR-6  | Track associations: composite tool ↔ simple tools                 | MUST     | For management and visibility             |
| FR-7  | Export composite tools in all formats (Universal, LangChain, MCP) | MUST     | Same as simple tools                      |
| FR-8  | Show composite tool usage on integration/action detail pages      | MUST     | "Used by: Scrape composite tool"          |
| FR-9  | UI to create and manage composite tools                           | MUST     | Unified "AI Tools" area in sidebar        |
| FR-10 | Support fallback routing (default operation)                      | SHOULD   | If no rules match                         |
| FR-11 | Support conditional parameter mapping per operation               | SHOULD   | Different params for different operations |
| FR-12 | Composite tool execution logs show which operation was selected   | SHOULD   | For debugging/transparency                |
| FR-13 | LLM-generated tool descriptions aggregated from sub-operations    | MUST     | Mini-prompt format with all params        |
| FR-14 | Load context (auth, reference data) for selected sub-operation    | MUST     | At invocation time                        |
| FR-15 | Editable tool configuration after creation                        | MUST     | Iterate on tools post-creation            |

### 2.2 Non-Functional Requirements

| Requirement | Target                                         | Measurement                  |
| ----------- | ---------------------------------------------- | ---------------------------- |
| Performance | Composite tool invocation overhead < 50ms      | Routing + delegation latency |
| Scalability | Support up to 20 operations per composite tool | UI/UX limit                  |
| Reliability | Routing rules evaluated deterministically      | No flaky behavior            |

### 2.3 Acceptance Criteria

- [ ] **Given** a composite "Scrape" tool with 4 operations, **when** invoked with a LinkedIn URL, **then** the LinkedIn scraper operation is automatically selected and executed
- [ ] **Given** a composite tool in agent-driven mode, **when** exported, **then** the tool schema includes an `operation` enum parameter listing all available operations
- [ ] **Given** an action that's part of a composite tool, **when** viewing that action's detail page, **then** a "Used in Composite Tools" section shows the composite tool(s)
- [ ] **Given** a composite tool, **when** exported as MCP/LangChain/Universal, **then** it exports as a single tool with proper routing
- [ ] **Given** rule-based routing with no matching rule, **when** invoked, **then** the default/fallback operation is used (or error if none configured)

### 2.4 Out of Scope

- **Sequential/pipeline execution** — Running multiple operations in sequence (deferred to Multi-Agent Pipelines)
- **Parallel execution** — Running multiple operations simultaneously
- **LLM-based routing** — Using an embedded LLM to decide routing (deferred to Agentic Tools)
- **Inter-operation data passing** — Using output of one operation as input to another (deferred to Multi-Agent Pipelines)
- **Composite tools containing other composite tools** — No nesting

---

## 3. User Experience

### 3.1 Unified "AI Tools" Management Area

The main sidebar should have an **"AI Tools"** section (not "Composite Tools") that serves as the central hub for managing all tool types. This unified approach:

- Provides a single place to view/manage all exported tools
- Supports filtering by tool type (Simple, Composite, Agentic)
- Uses a consistent creation/editing experience that extends to Agentic Tools
- Treats Composite and Agentic as "flavors" of intelligent tools, not discrete workflows

**Sidebar Structure:**

```
Dashboard
Integrations
AI Tools              ← NEW unified section
  ├─ All Tools        (filterable list: Simple | Composite | Agentic)
  ├─ Create Tool      (unified creation flow)
  └─ Export           (bulk export options)
Settings
```

### 3.2 User Flow: Creating a Composite Tool

```
Dashboard → AI Tools → "Create Tool" → Select "Composite Tool"
        ↓
   Name & Description → Select Operations (from any integration)
        ↓
   Configure Routing Mode:
   - Rule-Based: Define routing rules (conditions → operation)
   - Agent-Driven: Operations exposed as enum argument
        ↓
   Configure Unified Schema (map parameters across operations)
        ↓
   Generate AI Description → Preview Tool Definition → Save
```

**Happy Path:**

1. User navigates to "AI Tools" in the dashboard sidebar
2. User clicks "Create Tool" and selects "Composite Tool" (vs future "Agentic Tool")
3. User names the tool (e.g., "Smart Scraper") and adds base description
4. User selects operations to include (can search/filter across all integrations)
5. User configures routing:
   - **Rule-Based:** Define rules like "If `url` contains `linkedin.com` → use `linkedin-scraper`"
   - **Agent-Driven:** Operations listed as enum, agent picks which one
6. User maps unified input parameters to operation-specific parameters
7. System generates LLM description aggregating from sub-operation descriptions
8. User previews the exported tool definition and can edit description
9. User saves the composite tool

### 3.3 User Flow: Editing Tools

Users can edit and iterate on tools after creation:

1. User navigates to AI Tools list
2. User clicks on a tool to view detail
3. User can modify: name, description, operations, routing rules, parameter mappings
4. User can regenerate AI description after changes
5. Changes take effect immediately (or on explicit save)

### 3.4 User Flow: Viewing Composite Tool Usage

**From Integration/Action Detail:**

1. User views an Action detail page
2. "Used in AI Tools" section shows linked composite/agentic tools
3. User clicks a tool name → navigates to tool detail in AI Tools area

**From AI Tools Detail:**

1. User views tool detail page
2. "Operations" section shows all included operations
3. Each operation links back to its source integration/action

### 3.5 UI Locations

| Location                              | Content                                                               |
| ------------------------------------- | --------------------------------------------------------------------- |
| **Sidebar: AI Tools**                 | Unified management for all tool types (Simple, Composite, Agentic)    |
| **AI Tools List**                     | Filterable table showing all tools with type badges                   |
| **AI Tools → Create**                 | Unified creation flow with tool type selection                        |
| **Tool Detail**                       | Configuration, routing/logic, operations, AI description, export tabs |
| **Integration Detail → AI Tools tab** | Add "Used in AI Tools" section                                        |
| **Action Editor**                     | Add "Used in AI Tools" badge/section                                  |

---

## 4. Technical Approach

### 4.1 Architecture Fit

**Affected Areas:**

| Area              | Impact | Description                                               |
| ----------------- | ------ | --------------------------------------------------------- |
| Frontend          | NEW    | Composite tools management UI, routing rule builder       |
| Backend           | NEW    | Composite tool module, routing engine, schema merger      |
| Database          | NEW    | CompositeTool, CompositeToolOperation, RoutingRule tables |
| External Services | NONE   | Uses existing integration execution                       |

**Alignment with Existing Patterns:**

- Follows modular monolith structure (`src/lib/modules/composite-tools/`)
- Extends existing tool-export system for composite tool exports
- Uses existing action invocation pipeline (execution engine, response formatting)
- Follows Shadcn/ui patterns for UI components

### 4.2 Data Model

```typescript
// New entities

CompositeTool: {
  id: uuid PK,
  tenantId: uuid FK → Tenant,
  name: string,                    // "Smart Scraper"
  slug: string UK,                 // "smart-scraper"
  description: string,             // Tool description
  routingMode: enum,               // 'rule_based' | 'agent_driven'
  defaultOperationId: uuid FK,     // Fallback operation (optional)
  unifiedInputSchema: jsonb,       // Merged input schema
  toolDescription: text,           // LLM-optimized description (like Action)
  toolSuccessTemplate: text,
  toolErrorTemplate: text,
  status: enum,                    // 'draft' | 'active' | 'disabled'
  metadata: jsonb,
  createdAt: timestamp,
  updatedAt: timestamp
}

CompositeToolOperation: {
  id: uuid PK,
  compositeToolId: uuid FK → CompositeTool,
  actionId: uuid FK → Action,
  operationSlug: string,           // Unique within composite tool
  displayName: string,             // "LinkedIn Scraper"
  parameterMapping: jsonb,         // Map unified params → action params
  priority: integer,               // For rule ordering
  createdAt: timestamp
}

RoutingRule: {
  id: uuid PK,
  compositeToolId: uuid FK → CompositeTool,
  operationId: uuid FK → CompositeToolOperation,
  condition: jsonb,                // Routing condition (see below)
  priority: integer,               // Evaluation order (lower = first)
  createdAt: timestamp
}
```

### 4.3 Routing Condition Schema

```typescript
// Routing conditions for rule-based routing
interface RoutingCondition {
  type: 'contains' | 'equals' | 'matches' | 'starts_with' | 'ends_with';
  field: string;        // Input parameter to check, e.g., "url"
  value: string;        // Value to compare against
  caseSensitive?: boolean;
}

// Examples:
// URL contains "linkedin.com"
{ type: 'contains', field: 'url', value: 'linkedin.com', caseSensitive: false }

// URL matches regex pattern
{ type: 'matches', field: 'url', value: '^https://www\\.yelp\\.com/' }

// Domain equals exactly
{ type: 'equals', field: 'domain', value: 'reddit.com' }
```

### 4.4 Unified Schema Merging

When creating a composite tool, the system merges input schemas from all operations:

```typescript
interface UnifiedSchemaConfig {
  // Unified parameter → operation-specific mappings
  parameters: {
    [unifiedParam: string]: {
      type: string;
      description: string;
      required: boolean;
      operationMappings: {
        [operationSlug: string]: {
          targetParam: string;    // The operation's actual param name
          transform?: string;     // Optional transform (future)
        };
      };
    };
  };
}

// Example: Unified "url" parameter
{
  "url": {
    "type": "string",
    "description": "The URL to scrape",
    "required": true,
    "operationMappings": {
      "firecrawl-generic": { "targetParam": "url" },
      "linkedin-scraper": { "targetParam": "profile_url" },
      "reddit-scraper": { "targetParam": "reddit_url" }
    }
  }
}
```

### 4.5 LLM-Generated Tool Descriptions

Composite tools require AI-generated descriptions that aggregate information from all sub-operations. This follows the same pattern as Simple Tool Export but with additional complexity.

#### Description Generation Process

1. **Collect sub-operation descriptions** — Gather `toolDescription` from each Action in the composite tool
2. **Merge parameter documentation** — Combine required/optional inputs from all operations, noting which params apply to which operations
3. **Generate unified description** — Use LLM to create a coherent mini-prompt that covers all operations
4. **Store with composite tool** — Save `toolDescription`, `toolSuccessTemplate`, `toolErrorTemplate`

#### Description Format (DoubleO Mini-Prompt Style)

```
Use this tool to {what the composite tool does}.

# Required inputs (always include these):
- {param}: {description with type, constraints, what to include}

# Optional inputs (include based on {condition}):
- {param}: {description with when to use}

# What the tool outputs:
{Description of output format, key fields, and how to use the result}
```

#### Example: Smart Scraper Generated Description

```
Use this tool to scrape content from any URL. Automatically selects the best scraper based on the URL domain (LinkedIn, Reddit, Yelp, or generic web).

# Required inputs (always include these):
- url: The full URL to scrape. Must be a valid HTTP/HTTPS URL. The tool will automatically route to the appropriate scraper based on the domain.

# Optional inputs (include for customization):
- format: Output format preference. Options: "markdown" (default), "html", "text". Not all scrapers support all formats.
- include_metadata: Boolean (true/false). Whether to include page metadata (title, description, images). Default: true.
- max_length: Maximum content length in characters. Use for large pages to limit output size.

# What the tool outputs:
Returns scraped content with the following structure:
- content: The main page content in the requested format
- metadata: Page title, description, images (if include_metadata=true)
- source_url: The original URL that was scraped
- scraper_used: Which underlying scraper was selected (for transparency)

Use the content for summarization, data extraction, or further processing. The scraper_used field helps debug routing behavior.
```

### 4.6 Context Loading for Sub-Operations

When a composite tool is invoked, the system must load the appropriate context (auth tokens, reference data, connection settings) for the selected sub-operation.

#### Context Loading Flow

```
Composite Tool Invocation
        ↓
    Route to Operation (determine which sub-operation)
        ↓
    Load Operation's Integration Context:
    - Auth credentials (OAuth tokens, API keys)
    - Reference data (if configured)
    - Connection settings (base URL, etc.)
        ↓
    Map Parameters (unified → operation-specific)
        ↓
    Execute via Existing Action Invocation Pipeline
```

#### Implementation Approach

Context is loaded **at invocation time** after routing determines which operation to use. This is more efficient than pre-loading all contexts:

```typescript
async function invokeCompositeTool(
  compositeTool: CompositeTool,
  params: Record<string, unknown>,
  tenantContext: TenantContext
): Promise<ToolResponse> {
  // 1. Route to the correct operation
  const operation = await routeToOperation(compositeTool, params);

  // 2. Load context for that specific operation's integration
  const operationContext = await loadOperationContext(operation.action, tenantContext);
  // operationContext includes:
  // - credentials (decrypted auth tokens)
  // - referenceData (users, channels, etc.)
  // - connectionSettings (base URL, custom headers)

  // 3. Map unified params to operation-specific params
  const mappedParams = mapParameters(params, operation.parameterMapping);

  // 4. Execute via existing action invocation pipeline
  const result = await executeAction(operation.action, mappedParams, operationContext);

  // 5. Format response with composite tool metadata
  return formatCompositeToolResponse(compositeTool, operation, result);
}
```

#### Reference Data Handling

If a sub-operation has Reference Data Sync configured, that data is loaded and made available for context resolution (e.g., resolving `#general` → `C0123456`):

- Reference data is loaded from the cache for the selected operation's integration
- Context resolution happens using the operation's reference data, not a merged set
- This ensures each operation sees the context it expects

### 4.7 Module Structure

```
src/lib/modules/composite-tools/
├── index.ts                           # Module exports
├── composite-tool.service.ts          # CRUD, routing logic
├── composite-tool.repository.ts       # Database access
├── composite-tool.schemas.ts          # Zod schemas
├── routing/
│   ├── router.ts                      # Route request → operation
│   ├── rule-evaluator.ts              # Evaluate routing conditions
│   └── schema-merger.ts               # Merge operation schemas
├── context/
│   ├── context-loader.ts              # Load auth, reference data for operation
│   └── parameter-mapper.ts            # Map unified → operation params
├── export/
│   ├── composite-tool.transformer.ts  # Export to Universal/LangChain/MCP
│   └── description-generator.ts       # LLM-powered description generation
└── handlers/
    └── invocation-handler.ts          # Execute composite tool invocations
```

### 4.8 Routing Algorithm

```typescript
async function routeCompositeToolInvocation(
  compositeTool: CompositeTool,
  params: Record<string, unknown>
): Promise<CompositeToolOperation> {
  if (compositeTool.routingMode === 'agent_driven') {
    // Agent explicitly selected the operation
    const operationSlug = params.operation as string;
    return findOperationBySlug(compositeTool.id, operationSlug);
  }

  // Rule-based routing: evaluate rules in priority order
  const rules = await getRoutingRules(compositeTool.id);

  for (const rule of rules.sort((a, b) => a.priority - b.priority)) {
    if (evaluateCondition(rule.condition, params)) {
      return rule.operation;
    }
  }

  // No rule matched: use default or error
  if (compositeTool.defaultOperationId) {
    return findOperationById(compositeTool.defaultOperationId);
  }

  throw new RoutingError('No routing rule matched and no default operation configured');
}
```

### 4.9 API Endpoints

| Method | Endpoint                                       | Purpose                                |
| ------ | ---------------------------------------------- | -------------------------------------- |
| GET    | `/api/v1/ai-tools`                             | List all AI tools (filterable by type) |
| GET    | `/api/v1/composite-tools`                      | List tenant's composite tools          |
| POST   | `/api/v1/composite-tools`                      | Create composite tool                  |
| GET    | `/api/v1/composite-tools/:id`                  | Get composite tool detail              |
| PATCH  | `/api/v1/composite-tools/:id`                  | Update composite tool                  |
| DELETE | `/api/v1/composite-tools/:id`                  | Delete composite tool                  |
| POST   | `/api/v1/composite-tools/:id/operations`       | Add operation to composite tool        |
| DELETE | `/api/v1/composite-tools/:id/operations/:opId` | Remove operation                       |
| GET    | `/api/v1/composite-tools/:id/tools/universal`  | Export as universal tool               |
| GET    | `/api/v1/composite-tools/:id/tools/langchain`  | Export as LangChain tool               |
| GET    | `/api/v1/composite-tools/:id/tools/mcp`        | Export as MCP tool                     |
| POST   | `/api/v1/composite-tools/invoke`               | Invoke composite tool                  |

### 4.10 Tool Export Format

Tool descriptions follow the DoubleO mini-prompt format with required inputs, optional inputs, and output description — all within the description field itself. This provides maximum context to the LLM.

#### Rule-Based Routing (Routing is Internal)

When exported, routing logic is hidden from the agent — it just sees a unified tool:

```json
{
  "name": "smart_scraper",
  "description": "Use this tool to scrape content from any URL. Automatically selects the best scraper based on the URL domain (LinkedIn, Reddit, Yelp, or generic web).\n\n# Required inputs (always include these):\n- url: The full URL to scrape. Must be a valid HTTP/HTTPS URL. The tool will automatically route to the appropriate scraper based on the domain.\n\n# Optional inputs (include for customization):\n- format: Output format preference. Options: \"markdown\" (default), \"html\", \"text\". Not all scrapers support all formats.\n- include_metadata: Boolean (true/false). Whether to include page metadata (title, description, images). Default: true.\n- max_length: Maximum content length in characters. Use for large pages to limit output size.\n\n# What the tool outputs:\nReturns scraped content with: content (main page content), metadata (title, description, images if requested), source_url (original URL), scraper_used (which scraper was selected).",
  "parameters": {
    "type": "object",
    "properties": {
      "url": {
        "type": "string",
        "description": "The full URL to scrape. Must be a valid HTTP/HTTPS URL."
      },
      "format": {
        "type": "string",
        "enum": ["markdown", "html", "text"],
        "description": "Output format preference. Default: markdown."
      },
      "include_metadata": {
        "type": "boolean",
        "description": "Whether to include page metadata. Default: true."
      },
      "max_length": {
        "type": "integer",
        "description": "Maximum content length in characters."
      }
    },
    "required": ["url"]
  }
}
```

#### Agent-Driven Mode (Operation as Argument)

When the agent should choose the operation, it's exposed as an enum:

```json
{
  "name": "smart_scraper",
  "description": "Use this tool to scrape content using a specific scraper operation.\n\n# Required inputs (always include these):\n- operation: The scraper to use. Must be one of: firecrawl-generic, linkedin-scraper, reddit-scraper, yelp-scraper. Choose based on the URL domain — use linkedin-scraper for LinkedIn URLs, reddit-scraper for Reddit, etc. Use firecrawl-generic for general websites.\n- url: The full URL to scrape. Must be a valid HTTP/HTTPS URL matching the selected operation's expected domain.\n\n# Optional inputs (include for customization):\n- format: Output format preference. Options: \"markdown\" (default), \"html\", \"text\". Not all scrapers support all formats.\n- include_metadata: Boolean (true/false). Whether to include page metadata. Default: true.\n\n# What the tool outputs:\nReturns scraped content with: content (main page content), metadata (if requested), source_url (original URL), operation_used (confirms which scraper ran).",
  "parameters": {
    "type": "object",
    "properties": {
      "operation": {
        "type": "string",
        "enum": ["firecrawl-generic", "linkedin-scraper", "reddit-scraper", "yelp-scraper"],
        "description": "The scraper to use. Choose based on URL domain."
      },
      "url": {
        "type": "string",
        "description": "The full URL to scrape."
      },
      "format": {
        "type": "string",
        "enum": ["markdown", "html", "text"],
        "description": "Output format preference. Default: markdown."
      },
      "include_metadata": {
        "type": "boolean",
        "description": "Whether to include page metadata. Default: true."
      }
    },
    "required": ["operation", "url"]
  }
}
```

#### Success/Error Response Templates

Composite tools also have customizable success/error templates that aggregate context from the selected operation:

**Success Template:**

```
## Scraped {{source_url}} using {{scraper_used}}:

{{content_preview}}

## In your response:
- If asked to scrape a URL, share the key content or a summary.
- If this was part of a larger task, use the scraped content as instructed.
- The full content is available in the data.content field.
```

**Error Template:**

```
## Failed to scrape {{url}} using {{scraper_used}}:

{{error_message}}

## How to fix:
- Verify the URL is accessible and correctly formatted
- Check that the URL domain matches the selected scraper
- If the site requires authentication, this scraper may not support it

If retrying doesn't help, skip this step and proceed with your next task.
```

---

## 5. Implementation Tasks

### Phase 1: Database & Core Module (~3-4 hours)

| #   | Task                                                                        | Estimate |
| --- | --------------------------------------------------------------------------- | -------- |
| 1.1 | Create Prisma schema for CompositeTool, CompositeToolOperation, RoutingRule | 30 min   |
| 1.2 | Run migration                                                               | 10 min   |
| 1.3 | Create composite-tools module structure                                     | 15 min   |
| 1.4 | Implement composite-tool.repository.ts (CRUD)                               | 45 min   |
| 1.5 | Implement composite-tool.schemas.ts (Zod validation)                        | 30 min   |
| 1.6 | Implement composite-tool.service.ts (basic CRUD)                            | 45 min   |

### Phase 2: Routing Engine (~2-3 hours)

| #   | Task                                                 | Estimate |
| --- | ---------------------------------------------------- | -------- |
| 2.1 | Implement rule-evaluator.ts (condition evaluation)   | 45 min   |
| 2.2 | Implement router.ts (route invocation → operation)   | 45 min   |
| 2.3 | Implement schema-merger.ts (merge operation schemas) | 45 min   |
| 2.4 | Add routing tests (rule matching, edge cases)        | 30 min   |

### Phase 3: Context Loading & Invocation Handler (~3 hours)

| #   | Task                                                                        | Estimate |
| --- | --------------------------------------------------------------------------- | -------- |
| 3.1 | Implement context-loader.ts (load auth, reference data for operation)       | 45 min   |
| 3.2 | Implement parameter-mapper.ts (unified → operation-specific params)         | 30 min   |
| 3.3 | Implement invocation-handler.ts (orchestrate routing + context + execution) | 45 min   |
| 3.4 | Integrate with existing action execution engine                             | 30 min   |
| 3.5 | Add composite-specific response formatting (include routing metadata)       | 30 min   |

### Phase 4: LLM Description Generation & Export (~3 hours)

| #   | Task                                                                        | Estimate |
| --- | --------------------------------------------------------------------------- | -------- |
| 4.1 | Implement description-generator.ts (aggregate sub-operation descriptions)   | 45 min   |
| 4.2 | Generate unified description with required/optional inputs (DoubleO format) | 30 min   |
| 4.3 | Generate success/error templates aggregated from operations                 | 30 min   |
| 4.4 | Implement composite-tool.transformer.ts (Universal format)                  | 30 min   |
| 4.5 | Add LangChain export support                                                | 20 min   |
| 4.6 | Add MCP export support                                                      | 20 min   |
| 4.7 | Add regenerate description endpoint                                         | 15 min   |

### Phase 5: API Endpoints (~2 hours)

| #   | Task                                      | Estimate |
| --- | ----------------------------------------- | -------- |
| 5.1 | Create CRUD endpoints for composite tools | 45 min   |
| 5.2 | Create operation management endpoints     | 30 min   |
| 5.3 | Create composite tool export endpoints    | 20 min   |
| 5.4 | Create composite tool invoke endpoint     | 30 min   |

### Phase 6: UI - Unified "AI Tools" Area (~5-6 hours)

| #    | Task                                                                    | Estimate |
| ---- | ----------------------------------------------------------------------- | -------- |
| 6.1  | Add "AI Tools" section to sidebar navigation                            | 15 min   |
| 6.2  | Create AI Tools list page with type filter (Simple, Composite, Agentic) | 60 min   |
| 6.3  | Create unified "Create Tool" flow with tool type selection              | 30 min   |
| 6.4  | Create Composite Tool creation wizard (name, description)               | 30 min   |
| 6.5  | Create operation selector (search across integrations)                  | 45 min   |
| 6.6  | Create routing mode selector (rule-based vs agent-driven)               | 30 min   |
| 6.7  | Create routing rule builder UI                                          | 60 min   |
| 6.8  | Create parameter mapping UI                                             | 45 min   |
| 6.9  | Create tool detail/edit page (supports editing after creation)          | 45 min   |
| 6.10 | Add AI description section with generate/edit/regenerate                | 30 min   |
| 6.11 | Add export tabs to tool detail                                          | 20 min   |

### Phase 7: UI - Integration/Action Cross-References (~1-2 hours)

| #   | Task                                                            | Estimate |
| --- | --------------------------------------------------------------- | -------- |
| 7.1 | Add "Used in AI Tools" section to Action editor                 | 30 min   |
| 7.2 | Add "Used in AI Tools" section to Integration AI Tools tab      | 30 min   |
| 7.3 | Add AI tool count badge to integration list                     | 15 min   |
| 7.4 | Add navigation links between AI tools and underlying operations | 15 min   |

---

## 6. Test Plan

### Unit Tests

- Routing rule evaluation (contains, equals, matches, starts_with, ends_with)
- Case sensitivity handling
- Priority ordering
- Default operation fallback
- Schema merging across operations
- Parameter mapping (unified → operation-specific)
- Context loading (correct auth/reference data for selected operation)
- LLM description aggregation from sub-operations

### Integration Tests

- Full composite tool CRUD
- Composite tool invocation with rule-based routing
- Composite tool invocation with agent-driven routing
- Context loading for operations across different integrations
- Reference data resolution using operation's integration context
- Export composite tool in all formats (Universal, LangChain, MCP)
- LLM description generation and regeneration
- Cross-reference queries (actions → composite tools)

### E2E Tests

- Create a "Smart Scraper" composite tool with 3 operations
- Invoke with LinkedIn URL → correct operation selected with correct auth context
- Export as Universal tool and validate schema includes proper description format
- Verify "Used in AI Tools" displays on Action page
- Edit composite tool after creation (add operation, modify rules)
- Regenerate AI description after modifying operations

---

## 7. Edge Cases & Error Handling

| Scenario                                         | Handling                                                                 |
| ------------------------------------------------ | ------------------------------------------------------------------------ |
| No routing rule matches                          | Use default operation if configured, otherwise return clear error        |
| Operation's integration has no active connection | Return connection error with guidance to configure connection            |
| Parameter mapping fails                          | Return validation error with missing parameter details                   |
| Action deleted that's part of composite tool     | Mark composite tool as degraded, show warning in UI                      |
| Circular composite tool reference                | Prevent at creation time (composite tools can't contain composite tools) |
| All operations disabled                          | Mark composite tool as unavailable, prevent invocation                   |

---

## 8. Security Considerations

- Composite tools inherit tenant isolation from underlying actions
- Routing conditions are evaluated server-side (no code injection risk)
- Parameter mapping validated against operation schemas
- No credential exposure in composite tool definitions
- Export endpoints require valid Waygate API key

---

## 9. Future Enhancements (Out of Scope)

- **Sequential execution** — Run operations in sequence (Multi-Agent Pipelines)
- **Parallel execution** — Run multiple operations simultaneously
- **LLM-based routing** — Use embedded LLM for intelligent routing (Agentic Tools)
- **Conditional execution** — Run operation only if condition met
- **Result aggregation** — Combine results from multiple operations
- **Nested composite tools** — Composite tools containing other composite tools

### 9.1 Agentic Tools Extensibility

The UI and data model are designed to extend to Agentic Tools:

| Aspect             | Composite Tools                               | Agentic Tools (Future)                      |
| ------------------ | --------------------------------------------- | ------------------------------------------- |
| **Routing**        | Deterministic rules                           | LLM-based reasoning                         |
| **Data Model**     | `routingMode: 'rule_based' \| 'agent_driven'` | Add `routingMode: 'llm_routed'`             |
| **UI Creation**    | Same "Create Tool" flow                       | Add "Agentic" option in type selector       |
| **Configuration**  | Routing rules                                 | LLM prompt, context window, model selection |
| **AI Description** | Aggregated from operations                    | May include LLM reasoning guidance          |

The "AI Tools" unified area is designed so that Composite and Agentic tools share:

- The same list view with type filtering
- Similar creation wizard flow (select type → configure → generate description)
- Similar detail/edit pages
- Same export formats

---

## 10. Example Usage

### Creating a "Smart Scraper" Composite Tool

**Operations included:**

1. `firecrawl/scrape` (generic web scraping)
2. `rapidapi-linkedin/scrape-profile` (LinkedIn-specific)
3. `reddit-api/fetch-post` (Reddit-specific)
4. `yelp-api/fetch-business` (Yelp-specific)

**Routing rules (priority order):**

1. If `url` contains `linkedin.com` → `rapidapi-linkedin/scrape-profile`
2. If `url` contains `reddit.com` → `reddit-api/fetch-post`
3. If `url` contains `yelp.com` → `yelp-api/fetch-business`
4. Default → `firecrawl/scrape`

**Unified schema:**

```json
{
  "url": {
    "type": "string",
    "description": "The URL to scrape",
    "required": true
  }
}
```

**Invocation:**

```typescript
const result = await fetch('https://app.waygate.dev/api/v1/composite-tools/invoke', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${WAYGATE_API_KEY}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    tool: 'smart-scraper',
    params: {
      url: 'https://www.linkedin.com/in/johndoe',
    },
  }),
});

// Result shows which operation was selected and execution details
// {
//   success: true,
//   message: "## Scraped https://www.linkedin.com/in/johndoe using linkedin-scraper:\n\n[Profile content preview...]\n\n## In your response:\n- Share the key profile information or summary...",
//   data: {
//     content: "...",
//     metadata: { title: "John Doe - Software Engineer", ... },
//     source_url: "https://www.linkedin.com/in/johndoe",
//     scraper_used: "linkedin-scraper"
//   },
//   meta: {
//     compositeTool: "smart-scraper",
//     selectedOperation: "rapidapi-linkedin/scrape-profile",
//     routingReason: "URL contains 'linkedin.com'",
//     integration: "rapidapi-linkedin",
//     requestId: "req_abc123",
//     latencyMs: 1234
//   }
// }
```

Note: The system automatically loads the correct OAuth tokens/API keys for the RapidAPI LinkedIn integration when executing the selected operation.

### Agent-Driven Mode

```typescript
// Exported tool schema includes operation enum
{
  "name": "smart_scraper",
  "parameters": {
    "properties": {
      "operation": {
        "type": "string",
        "enum": ["firecrawl-generic", "linkedin-scraper", "reddit-scraper", "yelp-scraper"],
        "description": "Which scraper to use"
      },
      "url": { "type": "string", "description": "URL to scrape" }
    },
    "required": ["operation", "url"]
  }
}

// Agent explicitly chooses
const result = await invokeCompositeTool('smart-scraper', {
  operation: 'linkedin-scraper',
  url: 'https://www.linkedin.com/in/johndoe'
});
```

---

## 11. Dependencies

**Uses Existing Infrastructure:**

- Action service (operation metadata, schemas)
- Integration service (integration context)
- Tool export module (Universal, LangChain, MCP transformers)
- Execution engine (action invocation)
- Response formatters (success/error messages)
- API authentication middleware

**New Dependencies:**

- None (uses existing stack)

---

## 12. Success Metrics

| Metric                                       | Target                | Measurement          |
| -------------------------------------------- | --------------------- | -------------------- |
| Composite tools created per tenant           | 3+ within first month | Database query       |
| Composite tool invocation success rate       | > 95%                 | Logs                 |
| Routing accuracy (rule matched expectations) | > 99%                 | User feedback / logs |
| Time to create composite tool                | < 5 minutes           | User testing         |
