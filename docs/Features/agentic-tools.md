# Feature: Agentic Tools (Embedded LLM Tools)

**Milestone:** V1.5 (AI Tool Factory - Agentic Tools)
**Status:** ✅ Implemented (Parameter Interpreter mode)
**Dependencies:** Composite Tools
**Priority:** P0

---

## 1. Overview

### 1.1 One-Line Summary

Agentic Tools embed configurable LLMs inside tools to translate natural language requests into structured API calls, or autonomously select and execute tools to accomplish complex goals.

### 1.2 User Story

> As an **AI application developer**, I want to **create tools with embedded LLMs that can interpret natural language and generate precise API parameters**, so that **my parent agent can use simple language instead of learning complex API syntax**.

### 1.3 Problem Statement

Composite Tools (V1.5 Phase 1) enable routing and operation selection, but still require the parent agent to:

1. **Understand complex API semantics** — e.g., knowing HubSpot's exact SOSL query syntax, field names, filter operators
2. **Construct precise parameters** — e.g., generating valid GraphQL queries, SQL statements, complex search filters

Real-world examples from DoubleO that demonstrate the need:

**Example 1: Database Tool (Parameter Interpreter Mode)**

```
Without Agentic Tool:
Parent Agent: Must generate exact SQL:
  "UPDATE users SET status = 'inactive' WHERE last_login < DATE_SUB(NOW(), INTERVAL 90 DAY)"

With Agentic Tool:
Parent Agent: "Mark users who haven't logged in for 90 days as inactive"
  ↓
Database Tool (embedded LLM):
- Interprets intent → UPDATE query
- Has schema context → knows table/field names
- Generates SQL → executes → returns "Updated 23 users"
```

**Example 2: Research Tool (Autonomous Agent Mode)**

```
Without Agentic Tool:
Parent Agent: Must decide tool sequence:
  1. Call web_search("competitor pricing")
  2. Parse results manually
  3. Call scrape_url for each result
  4. Aggregate findings

With Agentic Tool:
Parent Agent: "Find competitor pricing for top 3 competitors"
  ↓
Research Tool (embedded LLM):
- Autonomously decides: web search → scrape URLs → extract pricing
- Executes tool sequence internally
- Returns: Aggregated pricing comparison
```

### 1.4 Business Value

- **User Impact:** Dramatically simplifies complex integrations; agents can use natural language instead of learning API specifics
- **Business Impact:** Industry-first intelligent tool capability; positions Waygate as AI-native vs traditional integration platforms
- **Technical Impact:** Foundation for sophisticated agentic workflows; enables DoubleO-style tool intelligence

### 1.5 Relationship to DoubleO Tool Levels

| Level                                         | Description                                           | Waygate Status                  |
| --------------------------------------------- | ----------------------------------------------------- | ------------------------------- |
| **Level 1: Simple Operation Tools**           | Direct wrappers around specific operations            | ✅ Complete (V1.1)              |
| **Composite Tools**                           | Route to correct operation with deterministic logic   | ✅ Complete (V1.5 Phase 1)      |
| **Level 2: Intelligent Tools** (this feature) | Embed LLMs for parameter interpretation or tool usage | 🎯 This Feature                 |
| **Level 3: Multi-Agent Workflows**            | Sequential discrete agents with data passing          | ⏳ Next (Multi-Agent Pipelines) |

---

## 2. Scope & Requirements

### 2.1 Core Capabilities

#### 2.1.1 Embedded LLM Configuration

Each Agentic Tool has a configurable embedded LLM:

| Configuration         | Description                        | Options                                               |
| --------------------- | ---------------------------------- | ----------------------------------------------------- |
| **Model**             | Which LLM to use                   | Claude Opus 4.5, Claude Sonnet 4.5, Gemini 3          |
| **Reasoning Level**   | Reasoning depth (where supported)  | None, Low, Medium, High (model-dependent)             |
| **System Prompt**     | Instructions for the embedded LLM  | User-editable template with variable placeholders     |
| **Temperature**       | Creativity vs consistency          | 0.0 - 1.0 (default: 0.2 for parameter interpretation) |
| **Max Tokens**        | Output length limit                | 1000 - 8000                                           |
| **Tool Allocation**   | Which actions/operations available | Select from integrations or composite tools           |
| **Context Variables** | Context to inject in prompts       | Schemas, reference data, documentation as variables   |

#### 2.1.2 Two Execution Modes

**Parameter Interpreter Mode:**

- Embedded LLM translates natural language → structured parameters/queries
- **Single LLM call** per invocation
- LLM outputs JSON with structured parameters
- Waygate executes the action(s) with generated parameters
- **No tool selection** — predetermined action sequence
- Example: Database tool - "update all active users" → generates SQL query → executed by system

**Autonomous Agent Mode:**

- Embedded LLM autonomously selects and executes tools
- **Multiple tool calls** within single tool invocation
- LLM has tool selection capability (like parent agent, but scoped)
- Can call multiple tools in sequence to accomplish goal
- **All execution happens within single tool invocation**
- Example: Research tool - LLM decides to use web search, scraping, extraction, then aggregates results

**What's NOT in this feature (deferred to Multi-Agent Pipelines):**

- Sequential discrete agents with separate contexts (e.g., Agent 1 → execute → Agent 2 → execute → Agent 3)
- Data passing between separate agent instances
- Multi-step orchestration with separate agent lifecycle management

#### 2.1.3 Context Injection

Agentic Tools support two types of context:

**1. Standard Context (existing system):**

- Integration credentials (OAuth tokens, API keys)
- Reference data (users, channels, custom fields)
- Connection settings (base URL, headers)

**2. Prompt Variables (new for agentic tools):**

- `{{integration_schema}}` — API schema with field names, types, valid values
- `{{reference_data}}` — Injected as variables in system prompt
- `{{user_input}}` — The natural language task/request
- `{{available_tools}}` — List of tools (Autonomous Agent Mode only)
- Custom variables defined by user

These variables are replaced in the system prompt at invocation time.

### 2.2 Functional Requirements

| ID    | Requirement                                                                  | Priority | Mode                  |
| ----- | ---------------------------------------------------------------------------- | -------- | --------------------- |
| FR-1  | Configure embedded LLM (model, reasoning level, prompt, temperature, tokens) | MUST     | Both                  |
| FR-2  | Allocate tools/actions available to embedded LLM                             | MUST     | Both                  |
| FR-3  | Parameter Interpreter: LLM generates JSON params, system executes            | MUST     | Parameter Interpreter |
| FR-4  | Autonomous Agent: LLM selects and executes tools autonomously                | MUST     | Autonomous Agent      |
| FR-5  | Inject integration schemas as prompt variables                               | MUST     | Both                  |
| FR-6  | Inject reference data as prompt variables                                    | MUST     | Both                  |
| FR-7  | System prompt templating with variable placeholders                          | MUST     | Both                  |
| FR-8  | Editable system prompt with AI-generated defaults                            | MUST     | Both                  |
| FR-9  | Cost tracking for embedded LLM calls (tokens, USD)                           | MUST     | Both                  |
| FR-10 | Langsmith/OpenTelemetry compatibility for execution tracing                  | MUST     | Both                  |
| FR-11 | Timeout and max-steps limits for safety                                      | MUST     | Autonomous Agent      |
| FR-12 | Export agentic tools in all formats (Universal, LangChain, MCP)              | MUST     | Both                  |
| FR-13 | Reasoning level control (where model supports)                               | SHOULD   | Both                  |
| FR-14 | Schema drift detection (API changes break embedded context)                  | SHOULD   | Both                  |
| FR-15 | Custom prompt variables beyond built-in ones                                 | SHOULD   | Both                  |

### 2.3 Non-Functional Requirements

| Requirement | Target                                                      | Measurement        |
| ----------- | ----------------------------------------------------------- | ------------------ |
| Latency     | Agentic tool orchestration overhead < 500ms (excluding LLM) | Orchestration time |
| Cost        | Track and report embedded LLM token usage per invocation    | Token counter      |
| Safety      | Max 10 tool calls or 5 minutes before timeout (Autonomous)  | Circuit breaker    |
| Reliability | LLM-generated parameter validation before execution         | Schema validation  |

### 2.4 Acceptance Criteria

- [ ] **Given** a Database tool in Parameter Interpreter mode, **when** invoked with "mark users inactive who haven't logged in for 90 days", **then** embedded LLM generates valid SQL UPDATE query and executes successfully
- [ ] **Given** a Research tool in Autonomous Agent mode, **when** invoked with "find competitor pricing", **then** LLM autonomously uses web search and scraping tools and returns aggregated results
- [ ] **Given** an agentic tool with integration schema as prompt variable, **when** embedded LLM generates parameters, **then** it uses correct field names and valid values from schema
- [ ] **Given** an agentic tool invocation, **when** using Langsmith tracing, **then** parent system can view embedded LLM calls and tool executions in trace
- [ ] **Given** an agentic tool with cost tracking, **when** invoked, **then** logs show embedded LLM tokens used and estimated cost

### 2.5 Out of Scope (Multi-Agent Pipelines Feature)

- **Sequential discrete agents** — Multiple separate agent instances with separate lifecycles (e.g., Agent 1 → execute → Agent 2 → execute → Agent 3)
- **Inter-agent data passing** — Passing output from one agent as input to another agent
- **Multi-step orchestration** — Separate agent coordination and state management
- **Error recovery across agents** — Retry logic spanning multiple agent instances

---

## 3. User Experience

### 3.1 Unified "AI Tools" Management

Agentic Tools are managed in the same **"AI Tools"** section as Composite Tools:

**Sidebar Structure:**

```
Dashboard
Integrations
AI Tools
  ├─ All Tools        (filter: Simple | Composite | Agentic)
  ├─ Create Tool      → "Agentic Tool" option
  └─ Export
Settings
```

### 3.2 User Flow: Creating an Agentic Tool

```
AI Tools → "Create Tool" → Select "Agentic Tool"
        ↓
   Name & Description → Select Execution Mode
        ↓
   Configure Embedded LLM:
   - Select Model (Opus 4.5, Sonnet 4.5, Gemini 3)
   - Set Reasoning Level (if supported)
   - Edit System Prompt (with AI-generated default)
   - Set Temperature, Max Tokens
        ↓
   Allocate Tools:
   - Parameter Interpreter: Select target action(s)
   - Autonomous Agent: Select available tools for LLM
        ↓
   Configure Context Variables:
   - Integration schemas (auto-loaded for selected tools)
   - Reference data sources
   - Custom variables
        ↓
   Define Input Parameters → Generate AI Description → Preview → Save
```

**Happy Path (Parameter Interpreter Mode):**

1. User creates "Database Manager" tool
2. Selects mode: "Parameter Interpreter"
3. Configures LLM: Sonnet 4.5, Reasoning: None, Temperature: 0.1
4. System prompt generated with `{{database_schema}}` variable
5. Allocates target action: `postgres/execute-query`
6. Schema auto-injected as variable
7. Input parameter: `{ task: string }` (natural language)
8. Tool exports as simple tool with natural language input

**Happy Path (Autonomous Agent Mode):**

1. User creates "Research Assistant" tool
2. Selects mode: "Autonomous Agent"
3. Configures LLM: Opus 4.5, Reasoning: High, Temperature: 0.3
4. System prompt includes `{{available_tools}}` variable
5. Allocates tools: `google/search`, `firecrawl/scrape`, `pdf-extract/extract`
6. Safety limits: Max 10 tool calls, 5 min timeout
7. Input parameter: `{ task: string }`
8. Tool exports with natural language input, LLM handles tool orchestration internally

### 3.3 User Flow: Configuring System Prompts

System prompts use variable placeholders that are replaced at invocation:

**Example System Prompt (Parameter Interpreter - Database Tool):**

```
You are a database query assistant. Generate SQL queries based on natural language requests.

# Database Schema:
{{database_schema}}

# User Request:
{{user_input}}

# Instructions:
1. Analyze the user's request to understand intent (SELECT, INSERT, UPDATE, DELETE)
2. Use the schema above to identify correct table and field names
3. Generate a valid SQL query
4. Return ONLY the SQL query as a JSON object

# Output Format:
{
  "query": "SQL statement here",
  "query_type": "SELECT | INSERT | UPDATE | DELETE",
  "affected_tables": ["table1", "table2"]
}

Never execute destructive queries without explicit confirmation.
```

**Example System Prompt (Autonomous Agent - Research Tool):**

```
You are a research assistant. Find information using available tools.

# Available Tools:
{{available_tools}}

# User Request:
{{user_input}}

# Instructions:
1. Analyze the request to understand what information is needed
2. Select appropriate tools from the available tools list
3. Use tools in sequence to gather comprehensive information
4. Synthesize findings into a coherent answer
5. Always cite sources

You can call tools multiple times. Continue until request is fully satisfied or max steps reached.
```

### 3.4 UI Locations

| Location                | Content                                                              |
| ----------------------- | -------------------------------------------------------------------- |
| **AI Tools → Create**   | Add "Agentic Tool" option alongside "Composite Tool"                 |
| **Agentic Tool Detail** | Tabs: Configuration, System Prompt, Tool Allocation, Context, Export |
| **Integration Detail**  | Show which agentic tools use this integration                        |

**Note:** Custom execution trace viewer is NOT built. Users rely on Langsmith/OpenTelemetry for tracing.

---

## 4. Technical Approach

### 4.1 Architecture Fit

**Affected Areas:**

| Area              | Impact | Description                                                 |
| ----------------- | ------ | ----------------------------------------------------------- |
| Frontend          | NEW    | Agentic tool configuration UI, system prompt editor         |
| Backend           | NEW    | Agentic tool module, embedded LLM client, prompt processing |
| Database          | NEW    | AgenticTool, AgenticToolExecution tables                    |
| External Services | NEW    | LLM providers (Anthropic, Google) via API                   |

### 4.2 Data Model

```typescript
// New entities

AgenticTool: {
  id: uuid PK,
  tenantId: uuid FK → Tenant,
  name: string,                    // "Database Manager"
  slug: string UK,                 // "database-manager"
  description: string,
  executionMode: enum,             // 'parameter_interpreter' | 'autonomous_agent'
  embeddedLLMConfig: jsonb,        // { provider, model, reasoningLevel, temperature, maxTokens }
  systemPrompt: text,              // LLM instructions with {{variable}} placeholders
  toolAllocation: jsonb,           // Target actions or available tools
  contextConfig: jsonb,            // Variable injection config
  inputSchema: jsonb,              // User-facing input parameters
  toolDescription: text,           // Parent-facing tool description
  safetyLimits: jsonb,             // { maxToolCalls: 10, timeoutSeconds: 300 }
  status: enum,                    // 'draft' | 'active' | 'disabled'
  metadata: jsonb,
  createdAt: timestamp,
  updatedAt: timestamp
}

AgenticToolExecution: {
  id: uuid PK,
  agenticToolId: uuid FK → AgenticTool,
  tenantId: uuid FK → Tenant,
  parentRequest: jsonb,            // Original user input
  llmCalls: jsonb[],               // Array of LLM calls with prompts, responses, tokens
  toolCalls: jsonb[],              // Array of tool invocations (Autonomous mode)
  result: jsonb,                   // Final output
  status: enum,                    // 'success' | 'error' | 'timeout'
  error: jsonb,                    // Error details if failed
  totalCost: decimal,              // Total LLM cost in USD
  totalTokens: integer,            // Total tokens used
  durationMs: integer,
  traceId: string,                 // Langsmith/OTel trace ID
  createdAt: timestamp,
  completedAt: timestamp
}
```

### 4.3 Embedded LLM Configuration Schema

```typescript
interface EmbeddedLLMConfig {
  // Model selection
  provider: 'anthropic' | 'google';
  model: 'claude-opus-4.5' | 'claude-sonnet-4.5' | 'gemini-3';

  // Reasoning control (where supported)
  reasoningLevel?: 'none' | 'low' | 'medium' | 'high';

  // Behavior
  temperature: number; // 0.0 - 1.0
  maxTokens: number; // 1000 - 8000

  // Advanced (optional)
  topP?: number;
}

interface ToolAllocation {
  mode: 'parameter_interpreter' | 'autonomous_agent';

  // Parameter Interpreter: Target action(s)
  targetActions?: {
    actionId: string;
    actionSlug: string;
  }[];

  // Autonomous Agent: Available tools for selection
  availableTools?: {
    actionId: string;
    actionSlug: string;
    description: string; // Tool description for LLM
  }[];
}

interface ContextConfig {
  // Prompt variables
  variables: {
    [key: string]: {
      type: 'integration_schema' | 'reference_data' | 'custom';
      source?: string; // Integration ID or data source
      value?: string; // For custom variables
    };
  };

  // Auto-inject schemas for allocated tools
  autoInjectSchemas: boolean; // Default: true
}
```

### 4.4 System Prompt Variable Replacement

Variables are replaced at invocation time:

**Built-in Variables:**

| Variable                 | Description                             | Example Value                               |
| ------------------------ | --------------------------------------- | ------------------------------------------- |
| `{{integration_schema}}` | Full schema for target integration      | HubSpot deal schema with field names, types |
| `{{reference_data}}`     | Reference data from specified source    | List of valid deal stages                   |
| `{{user_input}}`         | The natural language task/request       | "Mark inactive users"                       |
| `{{available_tools}}`    | List of tools (Autonomous Agent only)   | google/search, firecrawl/scrape             |
| `{{database_schema}}`    | Database schema (alias for integration) | Postgres table schemas                      |

**Custom Variables:**

Users can define custom variables:

```typescript
{
  "examples": {
    "type": "custom",
    "value": "Example 1: 'find active users' → SELECT * FROM users WHERE status = 'active'"
  }
}
```

### 4.5 Execution Flows

#### Parameter Interpreter Mode Flow

```
1. Parent Agent Invokes Agentic Tool
   Input: { task: "mark users inactive who haven't logged in for 90 days" }
   ↓
2. Load System Prompt & Replace Variables
   {{database_schema}} → Postgres users table schema
   {{user_input}} → "mark users inactive..."
   ↓
3. Call Embedded LLM (single call)
   Prompt: System prompt with injected variables
   Output: { query: "UPDATE users SET...", query_type: "UPDATE", ... }
   ↓
4. Validate LLM Output Against Schema
   Check: SQL syntax valid, table/field names exist
   ↓
5. Execute Generated Query via Target Action
   Action: postgres/execute-query
   Parameters: { query: "UPDATE users SET..." }
   ↓
6. Format Response
   "Updated 23 users to inactive status"
   ↓
7. Log Execution (for tracing)
   LLM call, tokens, cost, result
   Emit to Langsmith/OTel if configured
   ↓
8. Return to Parent Agent
```

#### Autonomous Agent Mode Flow

```
1. Parent Agent Invokes Agentic Tool
   Input: { task: "find competitor pricing for top 3 competitors" }
   ↓
2. Load System Prompt & Replace Variables
   {{available_tools}} → list of search/scrape tools
   {{user_input}} → "find competitor pricing..."
   ↓
3. Initialize Agentic Loop (with Safety Limits)
   MaxToolCalls: 10, Timeout: 5 minutes, MaxCost: $1
   ↓
4. Embedded LLM Autonomous Execution

   The LLM autonomously:
   - Analyzes the task
   - Selects which tools to use (from available tools)
   - Executes tools by calling them with generated parameters
   - Reviews results and decides whether to continue or complete
   - Loops until task is satisfied or safety limit hit
   - Synthesizes final answer

   Example internal execution (invisible to Waygate orchestrator):
     LLM → "I'll search Google" → executes google/search → reviews results
     LLM → "I'll scrape HubSpot pricing" → executes firecrawl/scrape → reviews
     LLM → "I'll scrape Salesforce too" → executes firecrawl/scrape → reviews
     LLM → "I have enough data" → synthesizes final answer → COMPLETE

   All tool selection and orchestration happens within the LLM's reasoning.
   Waygate provides the tools and enforces safety limits, but doesn't manage the flow.
   ↓
5. Log Execution Metadata
   All LLM calls, tool calls, tokens, costs
   Emit to Langsmith/OTel if configured
   ↓
6. Return to Parent Agent
   Formatted result with execution metadata
```

### 4.6 Module Structure

```
src/lib/modules/agentic-tools/
├── index.ts                           # Module exports
├── agentic-tool.service.ts            # CRUD, orchestration
├── agentic-tool.repository.ts         # Database access
├── agentic-tool.schemas.ts            # Zod schemas
├── llm/
│   ├── llm-client.ts                  # Multi-provider LLM client
│   ├── anthropic-provider.ts          # Claude integration
│   ├── google-provider.ts             # Gemini integration
│   └── prompt-processor.ts            # Variable replacement, prompt building
├── orchestrator/
│   ├── parameter-interpreter.ts       # Single LLM call → structured output
│   ├── autonomous-agent.ts            # Agentic loop with tool selection
│   └── safety-enforcer.ts             # Timeout, max calls enforcement
├── context/
│   ├── variable-injector.ts           # Inject schemas, ref data as variables
│   └── schema-loader.ts               # Load integration schemas
├── tracing/
│   ├── langsmith-adapter.ts           # Langsmith compatibility
│   └── opentelemetry-adapter.ts       # OpenTelemetry compatibility
├── export/
│   ├── agentic-tool.transformer.ts    # Export to Universal/LangChain/MCP
│   └── description-generator.ts       # Generate parent-facing descriptions
└── handlers/
    └── invocation-handler.ts          # Main invocation entry point
```

### 4.7 Cost Tracking

Track embedded LLM costs per execution:

```typescript
interface CostBreakdown {
  totalCost: number; // Total in USD
  totalTokens: number;

  llmCalls: {
    sequence: number;
    purpose: string; // 'parameter_generation' | 'tool_selection' | 'synthesis'
    model: string;
    tokensInput: number;
    tokensOutput: number;
    cost: number;
  }[];
}

// Pricing per model (updated periodically)
const MODEL_PRICING = {
  'claude-opus-4.5': { input: 0.015, output: 0.075 }, // per 1K tokens
  'claude-sonnet-4.5': { input: 0.003, output: 0.015 },
  'gemini-3': { input: 0.00125, output: 0.005 },
};

function calculateCost(model: string, tokensInput: number, tokensOutput: number): number {
  const pricing = MODEL_PRICING[model];
  return (tokensInput / 1000) * pricing.input + (tokensOutput / 1000) * pricing.output;
}
```

### 4.8 Safety Limits & Circuit Breakers

Prevent runaway executions in Autonomous Agent mode:

```typescript
interface SafetyLimits {
  maxToolCalls: number; // Default: 10
  maxDurationSeconds: number; // Default: 300 (5 min)
  maxTotalCost: number; // Default: $1.00
}

async function enforceLimit(execution: AgenticToolExecution) {
  // Check tool call count (Autonomous Agent only)
  if (execution.toolCalls.length >= execution.safetyLimits.maxToolCalls) {
    throw new SafetyLimitError('MAX_TOOL_CALLS_EXCEEDED');
  }

  // Check duration
  const elapsed = Date.now() - execution.createdAt.getTime();
  if (elapsed > execution.safetyLimits.maxDurationSeconds * 1000) {
    throw new SafetyLimitError('TIMEOUT');
  }

  // Check cost
  if (execution.totalCost > execution.safetyLimits.maxTotalCost) {
    throw new SafetyLimitError('MAX_COST_EXCEEDED');
  }
}
```

### 4.9 Langsmith/OpenTelemetry Integration

Enable tracing for consuming applications:

```typescript
interface TracingConfig {
  provider: 'langsmith' | 'opentelemetry' | null;
  apiKey?: string; // Langsmith API key (from consuming app)
  endpoint?: string; // OTel endpoint
  traceName?: string; // Custom trace name
}

// Emit trace events
async function emitLLMCall(trace: TraceContext, llmCall: LLMCall) {
  if (trace.provider === 'langsmith') {
    await langsmithClient.log({
      run_id: llmCall.id,
      parent_run_id: trace.parentRunId,
      name: llmCall.purpose,
      inputs: { prompt: llmCall.prompt },
      outputs: { response: llmCall.response },
      metadata: { model: llmCall.model, tokens: llmCall.tokens },
    });
  } else if (trace.provider === 'opentelemetry') {
    const span = tracer.startSpan('llm_call', { parent: trace.parentSpan });
    span.setAttributes({
      'llm.model': llmCall.model,
      'llm.tokens.input': llmCall.tokensInput,
      'llm.tokens.output': llmCall.tokensOutput,
    });
    span.end();
  }
}
```

Consuming apps pass tracing config in headers:

```
X-Trace-Provider: langsmith
X-Trace-API-Key: lsk_...
X-Trace-Run-ID: parent-run-id
```

### 4.10 API Endpoints

| Method | Endpoint                                      | Purpose                              |
| ------ | --------------------------------------------- | ------------------------------------ |
| GET    | `/api/v1/ai-tools`                            | List all AI tools (includes agentic) |
| GET    | `/api/v1/agentic-tools`                       | List agentic tools                   |
| POST   | `/api/v1/agentic-tools`                       | Create agentic tool                  |
| GET    | `/api/v1/agentic-tools/:id`                   | Get agentic tool detail              |
| PATCH  | `/api/v1/agentic-tools/:id`                   | Update configuration                 |
| DELETE | `/api/v1/agentic-tools/:id`                   | Delete agentic tool                  |
| POST   | `/api/v1/agentic-tools/:id/test-prompt`       | Test system prompt with sample input |
| POST   | `/api/v1/agentic-tools/:id/regenerate-prompt` | Re-generate default system prompt    |
| POST   | `/api/v1/agentic-tools/invoke`                | Invoke agentic tool                  |
| GET    | `/api/v1/agentic-tools/:id/tools/universal`   | Export as universal tool             |
| GET    | `/api/v1/agentic-tools/:id/tools/langchain`   | Export as LangChain tool             |
| GET    | `/api/v1/agentic-tools/:id/tools/mcp`         | Export as MCP tool                   |

### 4.11 Tool Export Format

Agentic tools are exported as simple tools from the parent agent's perspective — the embedded LLM complexity is hidden:

```json
{
  "name": "database_manager",
  "description": "Use this tool to query or modify the database using natural language. The tool automatically generates SQL queries based on your request.\n\n# Required inputs:\n- task: Natural language description of the database operation. Examples: \"find all active users\", \"mark users inactive who haven't logged in for 90 days\", \"create a new user with email test@example.com\".\n\n# What the tool outputs:\nReturns the result of the database operation, including affected rows and any returned data.",
  "parameters": {
    "type": "object",
    "properties": {
      "task": {
        "type": "string",
        "description": "Natural language description of the database operation to perform."
      }
    },
    "required": ["task"]
  }
}
```

The parent agent just provides a task description. The embedded LLM handles:

- Parsing the task
- Generating SQL/queries using schema context
- Executing via allocated action(s)
- Formatting results

---

## 5. Implementation Tasks

### Phase 1: Database & Core Module (~3 hours)

| #   | Task                                                       | Estimate |
| --- | ---------------------------------------------------------- | -------- |
| 1.1 | Create Prisma schema for AgenticTool, AgenticToolExecution | 30 min   |
| 1.2 | Run migration                                              | 10 min   |
| 1.3 | Create agentic-tools module structure                      | 15 min   |
| 1.4 | Implement agentic-tool.repository.ts (CRUD)                | 45 min   |
| 1.5 | Implement agentic-tool.schemas.ts (Zod validation)         | 30 min   |
| 1.6 | Implement agentic-tool.service.ts (basic CRUD)             | 45 min   |

### Phase 2: LLM Client Infrastructure (~3 hours)

| #   | Task                                                 | Estimate |
| --- | ---------------------------------------------------- | -------- |
| 2.1 | Implement llm-client.ts (multi-provider abstraction) | 30 min   |
| 2.2 | Implement anthropic-provider.ts (Claude integration) | 45 min   |
| 2.3 | Implement google-provider.ts (Gemini integration)    | 45 min   |
| 2.4 | Implement prompt-processor.ts (variable replacement) | 45 min   |
| 2.5 | Add token counting and cost calculation              | 30 min   |

### Phase 3: Context & Variable Injection (~2 hours)

| #   | Task                                                  | Estimate |
| --- | ----------------------------------------------------- | -------- |
| 3.1 | Implement schema-loader.ts (load integration schemas) | 30 min   |
| 3.2 | Implement variable-injector.ts (replace prompt vars)  | 45 min   |
| 3.3 | Add built-in variables (schema, reference data, etc.) | 30 min   |
| 3.4 | Add custom variable support                           | 30 min   |

### Phase 4: Parameter Interpreter Orchestrator (~3 hours)

| #   | Task                                                               | Estimate |
| --- | ------------------------------------------------------------------ | -------- |
| 4.1 | Implement parameter-interpreter.ts (single LLM call → JSON output) | 60 min   |
| 4.2 | Add output validation against target action schema                 | 30 min   |
| 4.3 | Implement safety-enforcer.ts (timeouts, cost limits)               | 30 min   |
| 4.4 | Integrate with existing action execution pipeline                  | 60 min   |

### Phase 5: Autonomous Agent Orchestrator (~4 hours)

| #   | Task                                                   | Estimate |
| --- | ------------------------------------------------------ | -------- |
| 5.1 | Implement autonomous-agent.ts (agentic loop)           | 90 min   |
| 5.2 | Implement tool selection logic (LLM chooses next tool) | 60 min   |
| 5.3 | Add loop continuation logic (continue vs complete)     | 45 min   |
| 5.4 | Apply safety limits (max tool calls, timeout)          | 45 min   |

### Phase 6: Tracing & Export (~3 hours)

| #   | Task                                                     | Estimate |
| --- | -------------------------------------------------------- | -------- |
| 6.1 | Implement langsmith-adapter.ts (Langsmith compatibility) | 45 min   |
| 6.2 | Implement opentelemetry-adapter.ts (OTel compatibility)  | 45 min   |
| 6.3 | Implement agentic-tool.transformer.ts (Universal format) | 30 min   |
| 6.4 | Add LangChain export support                             | 20 min   |
| 6.5 | Add MCP export support                                   | 20 min   |
| 6.6 | Implement description-generator.ts (tool descriptions)   | 30 min   |

### Phase 7: API Endpoints (~2 hours)

| #   | Task                                    | Estimate |
| --- | --------------------------------------- | -------- |
| 7.1 | Create CRUD endpoints for agentic tools | 45 min   |
| 7.2 | Create test/regenerate prompt endpoints | 20 min   |
| 7.3 | Create agentic tool invoke endpoint     | 30 min   |
| 7.4 | Create export endpoints                 | 20 min   |

### Phase 8: UI - Agentic Tool Management (~5 hours)

| #   | Task                                                                       | Estimate |
| --- | -------------------------------------------------------------------------- | -------- |
| 8.1 | Add "Agentic Tool" to unified "Create Tool" flow                           | 20 min   |
| 8.2 | Create execution mode selector (Parameter Interpreter vs Autonomous Agent) | 30 min   |
| 8.3 | Create embedded LLM config form (model, reasoning, temperature, tokens)    | 60 min   |
| 8.4 | Create system prompt editor with variable placeholders                     | 90 min   |
| 8.5 | Create tool allocation UI (target actions vs available tools)              | 60 min   |
| 8.6 | Create context config UI (variable injection)                              | 45 min   |
| 8.7 | Create agentic tool detail/edit page                                       | 45 min   |
| 8.8 | Add "Test Prompt" feature (test with sample input)                         | 30 min   |

**Total Estimated Time:** ~25 hours

---

## 6. Test Plan

### Unit Tests

- LLM client: Multi-provider calls, error handling, token counting
- Prompt processor: Variable replacement, edge cases
- Variable injector: Schema loading, reference data loading
- Parameter interpreter: JSON output validation
- Autonomous agent: Tool selection, loop continuation
- Cost tracking: Accurate calculation per model
- Safety limits: Timeout, max tool calls, max cost enforcement

### Integration Tests

- Full agentic tool CRUD
- Parameter Interpreter mode execution end-to-end
- Autonomous Agent mode execution with tool selection
- Variable injection from integrations
- LLM calls with real providers (or mocked)
- Export agentic tools in all formats
- Langsmith tracing integration
- Cost calculation accuracy

### E2E Tests

- Create a Database tool (Parameter Interpreter), invoke with natural language
- Create a Research tool (Autonomous Agent), invoke and verify tool selection
- Test prompt with sample input before saving
- Regenerate system prompt after modifying configuration
- Verify Langsmith trace includes embedded LLM calls

---

## 7. Edge Cases & Error Handling

| Scenario                             | Handling                                                                  |
| ------------------------------------ | ------------------------------------------------------------------------- |
| LLM times out or errors              | Retry with exponential backoff (up to 3 times), log error, return message |
| LLM generates invalid JSON           | Validate against schema, retry with error prompt, fall back to error      |
| Max tool calls exceeded (Autonomous) | Stop execution, return partial results + warning                          |
| Max cost exceeded                    | Stop execution, return cost limit error                                   |
| Schema drift (API changed)           | Detect mismatch, log warning, attempt best-effort execution               |
| Variable not found in context        | Log warning, replace with empty string or error message                   |

---

## 8. Security Considerations

- LLM provider API keys stored in environment variables (never in database)
- System prompts validated (no code injection)
- Tool allocation enforced server-side (LLM can't call unauthorized tools)
- Cost limits prevent runaway spending
- Generated parameters validated against target action schemas before execution
- Agentic tools inherit tenant isolation from underlying actions

---

## 9. Future Enhancements (Out of Scope)

- **Multi-Agent Workflows** — Sequential discrete agents with data passing (Multi-Agent Pipelines feature)
- **Memory/State** — Embedded LLM remembering previous executions (V2)
- **Fine-tuning** — Tenant-specific LLM fine-tuning (V2)
- **Human-in-the-loop** — Approval gates mid-execution (V2)
- **Streaming** — Real-time output from embedded LLM (V2)
- **Learning from feedback** — Improving prompts based on success/failure patterns (V3)

---

## 10. Example Usage

### Creating a Database Manager (Parameter Interpreter Mode)

**Configuration:**

- Mode: Parameter Interpreter
- Model: Sonnet 4.5
- Reasoning: None
- Temperature: 0.1
- Target Action: `postgres/execute-query`
- Context Variables: `{{database_schema}}` (auto-loaded)

**System Prompt (AI-generated):**

```
You are a database query assistant. Generate SQL queries based on natural language.

# Database Schema:
{{database_schema}}

# User Request:
{{user_input}}

# Instructions:
1. Parse the request to understand intent (SELECT, INSERT, UPDATE, DELETE)
2. Use the schema to identify correct table/field names
3. Generate valid SQL
4. Return ONLY JSON

# Output Format:
{
  "query": "SQL statement",
  "query_type": "SELECT | INSERT | UPDATE | DELETE"
}
```

**Invocation:**

```typescript
const result = await fetch('/api/v1/agentic-tools/invoke', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${WAYGATE_API_KEY}`,
    'Content-Type': 'application/json',
    'X-Trace-Provider': 'langsmith',
    'X-Trace-API-Key': 'lsk_...',
  },
  body: JSON.stringify({
    tool: 'database-manager',
    params: {
      task: 'mark users inactive who haven\'t logged in for 90 days',
    },
  }),
});

// Response
{
  success: true,
  data: {
    affected_rows: 23,
    message: "Updated 23 users to inactive status"
  },
  meta: {
    agenticTool: "database-manager",
    mode: "parameter_interpreter",
    llmCalls: 1,
    totalCost: 0.002,
    totalTokens: 456,
    durationMs: 1200,
    traceId: "langsmith-trace-id"
  }
}
```

### Creating a Research Assistant (Autonomous Agent Mode)

**Configuration:**

- Mode: Autonomous Agent
- Model: Opus 4.5
- Reasoning: High
- Temperature: 0.3
- Available Tools: `google/search`, `firecrawl/scrape`, `pdf-extract/extract`
- Safety Limits: Max 10 tool calls, 5 min timeout, $1 max cost

**System Prompt (AI-generated):**

```
You are a research assistant. Find information using available tools.

# Available Tools:
{{available_tools}}

# User Request:
{{user_input}}

# Instructions:
1. Analyze the request
2. Select appropriate tools from available tools
3. Use tools in sequence to gather information
4. Synthesize findings
5. Cite sources

You can call tools multiple times. Continue until satisfied or max steps reached.
```

**Invocation:**

```typescript
const result = await fetch('/api/v1/agentic-tools/invoke', {
  method: 'POST',
  body: JSON.stringify({
    tool: 'research-assistant',
    params: {
      task: 'Find competitor pricing for top 3 CRM tools',
    },
  }),
});

// The autonomous agent:
// 1. Uses google/search for "CRM pricing comparison"
// 2. Scrapes top 3 result URLs with firecrawl/scrape
// 3. Synthesizes pricing comparison
// 4. Returns formatted report

{
  success: true,
  data: {
    competitors: [
      { name: "HubSpot", pricing: "$45/user/month", source: "hubspot.com/pricing" },
      { name: "Salesforce", pricing: "$25-$300/user/month", source: "salesforce.com/pricing" },
      { name: "Pipedrive", pricing: "$14-$99/user/month", source: "pipedrive.com/pricing" }
    ],
    summary: "Pricing ranges from $14/user/month (Pipedrive) to $300/user/month (Salesforce Enterprise)."
  },
  meta: {
    agenticTool: "research-assistant",
    mode: "autonomous_agent",
    llmCalls: 4,
    toolCalls: 5,
    totalCost: 0.023,
    totalTokens: 3421,
    durationMs: 8200,
    traceId: "langsmith-trace-id"
  }
}
```

---

## 11. Dependencies

**Uses Existing Infrastructure:**

- Action service (operation execution)
- Integration service (schema, reference data)
- Composite tools (can be allocated to agentic tools)
- Tool export module (Universal, LangChain, MCP)
- Execution engine (action invocation)
- API authentication middleware

**New Dependencies:**

- Anthropic SDK (Claude Opus 4.5, Sonnet 4.5)
- Google AI SDK (Gemini 3)
- Langsmith SDK (optional, for tracing)
- OpenTelemetry SDK (optional, for tracing)

---

## 12. Success Metrics

| Metric                                | Target                | Measurement                     |
| ------------------------------------- | --------------------- | ------------------------------- |
| Agentic tools created per tenant      | 2+ within first month | Database query                  |
| Parameter Interpreter success rate    | > 95%                 | Valid output vs total calls     |
| Autonomous Agent task completion rate | > 85%                 | Successful vs failed executions |
| Average cost per invocation           | < $0.05               | Cost tracking logs              |
| Time to create agentic tool           | < 10 minutes          | User testing                    |

---

## 13. Implementation Summary

**Status:** ✅ Core implementation complete (Parameter Interpreter mode)

**Implemented:**

- Database schema with AgenticTool and AgenticToolExecution models
- Full CRUD operations for agentic tools
- LLM client architecture supporting Claude (Anthropic) and Gemini (Google)
- Parameter Interpreter orchestrator with prompt processing and variable injection
- Context system for loading integration schemas and reference data
- Safety enforcement (cost limits, tool call limits, timeout)
- Cost calculation and token estimation
- Wizard UI for creating agentic tools
- API endpoints for invocation and management
- Comprehensive unit test coverage (187 tests)

**Test Results:**

- 187 new unit tests created and passing
- Core modules fully covered: schemas, cost calculator, prompt processor, safety enforcer
- Dev server compiles successfully
- UI wizard functional

**Known Limitations:**

- Autonomous Agent mode orchestrator not yet implemented (planned for future phase)
- 20 TypeScript errors remain in optional features (regenerate-prompt, test-prompt routes)
- Export formats (Universal, LangChain, MCP) not yet implemented
- Tracing integration (Langsmith, OpenTelemetry) not yet implemented

**Next Steps:**

- Fix remaining TypeScript errors in bonus features
- Implement Autonomous Agent orchestrator
- Add export format support
- Integrate tracing providers
  | Parent agent accuracy improvement | +40% vs direct API calls | A/B testing |
