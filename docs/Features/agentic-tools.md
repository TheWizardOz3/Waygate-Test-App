# Feature: Agentic Tools (Embedded LLM Tools)

**Milestone:** V1.5 (AI Tool Factory - Agentic Tools)
**Status:** Planning
**Dependencies:** Composite Tools
**Priority:** P0

---

## 1. Overview

### 1.1 One-Line Summary

Agentic Tools embed configurable LLMs inside tools to handle complex operations through natural language interpretation, intelligent parameter resolution, and multi-step execution with specialized context.

### 1.2 User Story

> As an **AI application developer**, I want to **create tools with embedded LLMs that can interpret high-level natural language requests and handle complex multi-step operations**, so that **my parent agent can delegate complex tasks without needing to understand all the implementation details**.

### 1.3 Problem Statement

Composite Tools (V1.5 Phase 1) enable routing and operation selection, but still require the parent agent to:

1. **Understand complex API semantics** — e.g., knowing HubSpot's exact query syntax, field names, filter operators
2. **Construct precise parameters** — e.g., generating valid GraphQL queries, handling pagination, building search filters
3. **Handle multi-step flows** — e.g., search → enrich → update requires multiple tool calls and data passing
4. **Retry and error recovery** — e.g., fixing validation errors, handling rate limits, adjusting parameters

Real-world examples from DoubleO that demonstrate the need:

**Without Agentic Tool:**

```
Parent Agent: "Update all Acme Corp deals to Negotiation stage"
  ↓
Agent must:
1. Know HubSpot's deal search syntax
2. Generate search query with correct field names
3. Handle pagination
4. Parse results
5. Generate update requests for each deal
6. Handle errors individually
  ↓
Result: Complex, error-prone, low accuracy
```

**With Agentic Tool:**

```
Parent Agent: "Update all Acme Corp deals to Negotiation stage"
  ↓
CRM Agentic Tool (with embedded LLM):
1. Interprets task → understands "search + batch update"
2. Has HubSpot schema context → knows deal fields
3. Generates search: deals.company_name contains "Acme Corp"
4. Executes search, handles pagination
5. Plans batch update operations
6. Executes updates with error handling
7. Returns summary: "Updated 3 deals to Negotiation"
  ↓
Result: Simple, accurate, reliable
```

### 1.4 Business Value

- **User Impact:** Dramatically simplifies complex integrations; agents can use natural language instead of learning API specifics
- **Business Impact:** Industry-first intelligent tool capability; positions Waygate as AI-native vs traditional integration platforms
- **Technical Impact:** Foundation for sophisticated agentic workflows; enables DoubleO-style tool intelligence

### 1.5 Relationship to DoubleO Tool Levels

| Level                                         | Description                                         | Waygate Status             |
| --------------------------------------------- | --------------------------------------------------- | -------------------------- |
| **Level 1: Simple Operation Tools**           | Direct wrappers around specific operations          | ✅ Complete (V1.1)         |
| **Composite Tools**                           | Route to correct operation with deterministic logic | ✅ Complete (V1.5 Phase 1) |
| **Level 2: Intelligent Tools** (this feature) | Embed LLMs for complex reasoning and execution      | 🎯 This Feature            |

---

## 2. Scope & Requirements

### 2.1 Core Capabilities

#### 2.1.1 Embedded LLM Configuration

Each Agentic Tool has a configurable embedded LLM:

| Configuration         | Description                        | Options                                                   |
| --------------------- | ---------------------------------- | --------------------------------------------------------- |
| **Model**             | Which LLM to use                   | Claude Sonnet, Claude Opus, GPT-4, GPT-4o, Gemini 1.5 Pro |
| **System Prompt**     | Instructions for the embedded LLM  | User-editable template with placeholders                  |
| **Temperature**       | Creativity vs consistency          | 0.0 - 1.0 (default: 0.2 for deterministic)                |
| **Max Tokens**        | Output length limit                | 1000 - 8000                                               |
| **Tool Allocation**   | Which actions/operations available | Select from integrations or composite tools               |
| **Context Injection** | Additional context to provide      | Schemas, reference data, documentation                    |

#### 2.1.2 Two Execution Modes

**Deterministic Mode:**

- Embedded LLM interprets parameters and formats requests
- **No tool selection** — the LLM uses a fixed set of operations
- Useful for: Parameter interpretation, query generation, response formatting
- Example: CRM tool that always uses "search deals" → "update deals" but interprets natural language queries

**Agentic Mode:**

- Full reasoning with tool selection capability
- **LLM chooses which tools to use** from allocated tool set
- Can orchestrate multi-step operations
- Useful for: Complex workflows, conditional logic, error recovery
- Example: Research tool that decides whether to use web search, PDF extraction, or API calls based on the request

#### 2.1.3 Specialized Context

Agentic Tools have access to specialized context that simple tools don't:

- **Integration Schemas** — Full API schemas, field definitions, valid values
- **Reference Data** — Users, channels, custom fields (from Reference Data Sync)
- **Historical Patterns** — Successful query patterns, common parameters (future)
- **Documentation** — API docs, examples, constraints (embedded in system prompt)

### 2.2 Functional Requirements

| ID    | Requirement                                                             | Priority | Mode          |
| ----- | ----------------------------------------------------------------------- | -------- | ------------- |
| FR-1  | Configure embedded LLM (model, prompt, temperature, tokens)             | MUST     | Both          |
| FR-2  | Allocate tools/actions available to embedded LLM                        | MUST     | Both          |
| FR-3  | Deterministic mode: Fixed operation sequence with LLM interpretation    | MUST     | Deterministic |
| FR-4  | Agentic mode: LLM selects tools and orchestrates steps                  | MUST     | Agentic       |
| FR-5  | Inject integration schemas as context                                   | MUST     | Both          |
| FR-6  | Inject reference data as context                                        | MUST     | Both          |
| FR-7  | System prompt templating with placeholders                              | MUST     | Both          |
| FR-8  | Editable system prompt with AI-generated defaults                       | MUST     | Both          |
| FR-9  | Track execution: parent request → embedded LLM calls → tool invocations | MUST     | Both          |
| FR-10 | Detailed logging of embedded LLM reasoning                              | SHOULD   | Agentic       |
| FR-11 | Cost tracking for embedded LLM calls                                    | SHOULD   | Both          |
| FR-12 | Timeout and max-steps limits for safety                                 | MUST     | Agentic       |
| FR-13 | Export agentic tools in all formats (Universal, LangChain, MCP)         | MUST     | Both          |
| FR-14 | Error recovery prompts for embedded LLM                                 | SHOULD   | Agentic       |
| FR-15 | Schema drift detection (API changes break embedded context)             | SHOULD   | Both          |

### 2.3 Non-Functional Requirements

| Requirement | Target                                                      | Measurement                  |
| ----------- | ----------------------------------------------------------- | ---------------------------- |
| Latency     | Agentic tool invocation overhead < 2s (excluding LLM calls) | Orchestration time           |
| Cost        | Track and report embedded LLM token usage per invocation    | Token counter                |
| Safety      | Max 10 steps or 5 minutes before timeout                    | Circuit breaker              |
| Reliability | Embedded LLM error rate < 5%                                | Success vs total invocations |

### 2.4 Acceptance Criteria

- [ ] **Given** an agentic CRM tool in deterministic mode, **when** invoked with "Update all Acme Corp deals to Negotiation", **then** embedded LLM generates correct HubSpot search query and executes batch update
- [ ] **Given** an agentic research tool in agentic mode, **when** invoked with "Find competitor pricing", **then** LLM autonomously decides to use web search + scraping and returns aggregated results
- [ ] **Given** an agentic tool with integration schema context, **when** embedded LLM generates a query, **then** it uses correct field names and valid values from schema
- [ ] **Given** an agentic tool invocation, **when** viewing execution logs, **then** see full trace: parent request → embedded LLM reasoning → each tool call → final response
- [ ] **Given** an agentic tool with cost tracking, **when** invoked, **then** logs show embedded LLM tokens used and estimated cost

### 2.5 Out of Scope

- **Multi-tenant embedded LLM fine-tuning** — Using tenant-specific training data (V2+)
- **Embedded memory/state** — LLM remembering previous invocations (V2+)
- **Human-in-the-loop approvals** — Requiring user approval mid-execution (V2+)
- **Streaming responses** — Real-time output from embedded LLM (V2+)

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
   Name & Description → Select Execution Mode (Deterministic | Agentic)
        ↓
   Configure Embedded LLM:
   - Select Model (Claude Sonnet, GPT-4, etc.)
   - Edit System Prompt (with AI-generated default)
   - Set Temperature, Max Tokens
        ↓
   Allocate Tools:
   - Deterministic: Select operation sequence
   - Agentic: Select available tools for LLM to choose from
        ↓
   Configure Context Injection:
   - Integration schemas (auto-loaded for selected tools)
   - Reference data sources
   - Additional documentation/constraints
        ↓
   Define Input Parameters → Generate AI Description → Preview → Save
```

**Happy Path:**

1. User navigates to "AI Tools" → "Create Tool" → "Agentic Tool"
2. User names tool (e.g., "HubSpot Deal Manager") and selects mode: "Deterministic"
3. User configures embedded LLM:
   - Model: Claude Sonnet 4
   - Temperature: 0.2 (deterministic)
   - System Prompt: AI generates default based on tool purpose
4. User allocates tools (Deterministic mode):
   - Step 1: `hubspot/search-deals`
   - Step 2: `hubspot/update-deal` (batch)
5. System auto-loads HubSpot schema as context for embedded LLM
6. User defines input: `{ task: string }` (natural language task description)
7. System generates tool description using embedded LLM's capabilities
8. User previews and saves

### 3.3 User Flow: Configuring System Prompts

System prompts are critical for embedded LLM behavior. The UI provides:

1. **AI-Generated Default** — Based on tool purpose, allocated tools, and mode
2. **Template Placeholders** — `{{integration_schema}}`, `{{reference_data}}`, `{{user_task}}`
3. **Inline Editing** — Rich text editor with syntax highlighting
4. **Regenerate Option** — Re-generate default if tool configuration changes
5. **Version History** — Track prompt changes (future)

**Example System Prompt (Deterministic CRM Tool):**

```
You are an embedded AI assistant for HubSpot deal management. Your job is to interpret natural language deal management tasks and execute them using the HubSpot API.

# Your Available Operations (use in this order):
1. hubspot/search-deals - Search for deals matching criteria
2. hubspot/update-deal - Update a single deal
3. hubspot/batch-update-deals - Update multiple deals at once

# Context You Have Access To:
## HubSpot Deal Schema:
{{integration_schema}}

## Available Deal Stages:
{{reference_data.deal_stages}}

# User's Task:
{{user_task}}

# Instructions:
1. Parse the user's task to understand what they want (search, update, create, etc.)
2. Generate the appropriate search query using correct HubSpot field names from the schema
3. Execute the search operation
4. Based on search results, plan the update operations
5. Execute batch updates if multiple deals need updating
6. Return a clear summary of what was done

# Response Format:
Always return results in this structure:
{
  "summary": "Human-readable summary of actions taken",
  "deals_affected": 3,
  "operations_executed": ["search-deals", "batch-update-deals"]
}

# Error Handling:
- If a field name is ambiguous, use the schema to find the correct field
- If a stage name doesn't match, suggest the closest valid stage from reference data
- If an operation fails, explain why and suggest how to fix it
```

### 3.4 User Flow: Viewing Execution Traces

Agentic tool invocations generate detailed execution traces:

**Execution Detail View:**

```
Agentic Tool: HubSpot Deal Manager
Parent Request: "Update all Acme Corp deals to Negotiation stage"
Status: Success ✓
Duration: 3.2s
Cost: $0.004

Execution Trace:
├─ [1] Embedded LLM Planning (Claude Sonnet 4)
│   ├─ Input: "Update all Acme Corp deals to Negotiation stage"
│   ├─ Reasoning: "Need to search for Acme Corp deals, then batch update"
│   ├─ Tokens: 1,234 (input: 800, output: 434)
│   └─ Cost: $0.002
│
├─ [2] Tool Call: hubspot/search-deals
│   ├─ Parameters: { company_name: { contains: "Acme Corp" } }
│   ├─ Result: 3 deals found
│   └─ Duration: 456ms
│
├─ [3] Embedded LLM Review Results
│   ├─ Input: Search results + task
│   ├─ Decision: "Batch update 3 deals to Negotiation stage"
│   ├─ Tokens: 956
│   └─ Cost: $0.001
│
└─ [4] Tool Call: hubspot/batch-update-deals
    ├─ Parameters: { deal_ids: [101, 102, 103], stage: "negotiation" }
    ├─ Result: 3 deals updated successfully
    ├─ Duration: 1.1s
    └─ Cost: $0.001

Final Response:
"Updated 3 deals for Acme Corp to Negotiation stage: Deal-101, Deal-102, Deal-103"
```

### 3.5 UI Locations

| Location                | Content                                                                    |
| ----------------------- | -------------------------------------------------------------------------- |
| **AI Tools → Create**   | Add "Agentic Tool" option alongside "Composite Tool"                       |
| **Agentic Tool Detail** | Tabs: Configuration, System Prompt, Tool Allocation, Context, Export, Logs |
| **Execution Logs**      | Detailed trace view with embedded LLM reasoning, tool calls, costs         |
| **Integration Detail**  | Show which agentic tools use this integration                              |

---

## 4. Technical Approach

### 4.1 Architecture Fit

**Affected Areas:**

| Area              | Impact | Description                                                                 |
| ----------------- | ------ | --------------------------------------------------------------------------- |
| Frontend          | NEW    | Agentic tool configuration UI, system prompt editor, execution trace viewer |
| Backend           | NEW    | Agentic tool module, embedded LLM orchestrator, context injector            |
| Database          | NEW    | AgenticTool, AgenticToolExecution, EmbeddedLLMCall tables                   |
| External Services | NEW    | LLM providers (Claude, GPT-4, Gemini) via API                               |

### 4.2 Data Model

```typescript
// New entities

AgenticTool: {
  id: uuid PK,
  tenantId: uuid FK → Tenant,
  name: string,                    // "HubSpot Deal Manager"
  slug: string UK,                 // "hubspot-deal-manager"
  description: string,
  executionMode: enum,             // 'deterministic' | 'agentic'
  embeddedLLMConfig: jsonb,        // { model, temperature, maxTokens }
  systemPrompt: text,              // LLM instructions with placeholders
  toolAllocation: jsonb,           // Tools/operations available to LLM
  contextConfig: jsonb,            // Schema/reference data injection config
  inputSchema: jsonb,              // User-facing input parameters
  toolDescription: text,           // Parent-facing tool description
  safetyLimits: jsonb,             // { maxSteps: 10, timeoutSeconds: 300 }
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
  executionPlan: jsonb,            // LLM's planned steps
  status: enum,                    // 'running' | 'success' | 'error' | 'timeout'
  result: jsonb,                   // Final output
  error: jsonb,                    // Error details if failed
  totalCost: decimal,              // Total LLM cost in USD
  totalTokens: integer,            // Total tokens used
  durationMs: integer,
  createdAt: timestamp,
  completedAt: timestamp
}

EmbeddedLLMCall: {
  id: uuid PK,
  executionId: uuid FK → AgenticToolExecution,
  callSequence: integer,           // Order within execution (1, 2, 3...)
  purpose: enum,                   // 'planning' | 'tool_selection' | 'result_review' | 'error_recovery'
  model: string,                   // 'claude-sonnet-4' | 'gpt-4o' | etc.
  prompt: text,                    // Full prompt sent to LLM
  response: text,                  // LLM's response
  reasoning: text,                 // Extracted reasoning (if provided)
  tokensInput: integer,
  tokensOutput: integer,
  cost: decimal,                   // Cost in USD
  latencyMs: integer,
  createdAt: timestamp
}

AgenticToolCall: {
  id: uuid PK,
  executionId: uuid FK → AgenticToolExecution,
  actionId: uuid FK → Action,      // Which action was called
  callSequence: integer,           // Order within execution
  parameters: jsonb,               // Parameters passed to action
  response: jsonb,                 // Action response
  status: enum,                    // 'success' | 'error'
  latencyMs: integer,
  createdAt: timestamp
}
```

### 4.3 Embedded LLM Configuration Schema

```typescript
interface EmbeddedLLMConfig {
  // Model selection
  provider: 'anthropic' | 'openai' | 'google';
  model: string; // 'claude-sonnet-4', 'gpt-4o', 'gemini-1.5-pro'

  // Behavior
  temperature: number; // 0.0 - 1.0
  maxTokens: number; // 1000 - 8000

  // Advanced (optional)
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
}

interface ToolAllocation {
  mode: 'deterministic' | 'agentic';

  // Deterministic: Fixed sequence
  sequence?: {
    step: number;
    actionId: string;
    actionSlug: string;
    purpose: string; // "Search for deals"
  }[];

  // Agentic: Available tools for selection
  availableTools?: {
    actionId: string;
    actionSlug: string;
    priority?: number; // Hint for LLM (higher = prefer)
  }[];
}

interface ContextConfig {
  // Auto-inject integration schemas
  includeSchemas: boolean; // Default: true

  // Reference data injection
  referenceData: {
    integrationId: string;
    dataTypes: string[]; // ['users', 'channels', 'deal_stages']
  }[];

  // Additional context
  documentation?: string; // Custom docs/constraints
  exampleQueries?: string[]; // Successful query examples
}
```

### 4.4 System Prompt Templating

System prompts support placeholders that are replaced at invocation time:

**Supported Placeholders:**

| Placeholder              | Description                                        | Example Value                               |
| ------------------------ | -------------------------------------------------- | ------------------------------------------- |
| `{{integration_schema}}` | Full schema for allocated tools' integrations      | HubSpot deal schema with field names, types |
| `{{reference_data}}`     | Reference data (users, channels, etc.)             | List of valid deal stages                   |
| `{{user_task}}`          | The user's input task/request                      | "Update all Acme Corp deals to Negotiation" |
| `{{available_tools}}`    | List of tools available to LLM                     | hubspot/search-deals, hubspot/update-deal   |
| `{{execution_history}}`  | Previous steps in current execution (agentic mode) | "Step 1: Searched deals, found 3 results"   |

**Example with Placeholders:**

```
You are managing HubSpot deals. Use the following schema:

{{integration_schema}}

Available stages: {{reference_data.deal_stages}}

User's request: {{user_task}}

Available tools: {{available_tools}}
```

### 4.5 Orchestration Flow

#### Deterministic Mode Flow

```
1. Parent Agent Invokes Agentic Tool
   ↓
2. Load Embedded LLM Config + System Prompt
   ↓
3. Inject Context (schemas, reference data)
   ↓
4. Embedded LLM Call: "Plan Execution"
   Input: User task + context + allocated tools (sequence)
   Output: Execution plan with parameters for each step
   ↓
5. Execute Tool Sequence:
   For each step in sequence:
     - Map parameters from plan
     - Load operation context (auth, reference data)
     - Execute action via existing pipeline
     - Collect result
   ↓
6. Embedded LLM Call: "Format Response"
   Input: All step results + user task
   Output: Formatted summary for parent agent
   ↓
7. Return to Parent Agent with execution trace
```

#### Agentic Mode Flow

```
1. Parent Agent Invokes Agentic Tool
   ↓
2. Load Embedded LLM Config + System Prompt
   ↓
3. Inject Context (schemas, reference data)
   ↓
4. Embedded LLM Call: "Plan & Select First Tool"
   Input: User task + context + available tools
   Output: { reasoning, tool_to_use, parameters }
   ↓
5. Execute Selected Tool
   - Load operation context
   - Execute action
   - Collect result
   ↓
6. Loop: Embedded LLM Reviews Result
   Input: Task + execution history + available tools + last result
   Decision:
     - CONTINUE: Select next tool + parameters
     - COMPLETE: Format final response
     - ERROR_RECOVERY: Retry with adjusted params
   ↓
7. Execute Next Tool (if CONTINUE)
   ↓
8. Repeat until COMPLETE or max steps reached
   ↓
9. Return to Parent Agent with full execution trace
```

### 4.6 Module Structure

```
src/lib/modules/agentic-tools/
├── index.ts                           # Module exports
├── agentic-tool.service.ts            # CRUD, orchestration
├── agentic-tool.repository.ts         # Database access
├── agentic-tool.schemas.ts            # Zod schemas
├── orchestrator/
│   ├── deterministic-orchestrator.ts  # Fixed sequence execution
│   ├── agentic-orchestrator.ts        # LLM-driven tool selection
│   ├── execution-tracker.ts           # Track steps, costs, logs
│   └── safety-limits.ts               # Timeout, max steps enforcement
├── llm/
│   ├── llm-client.ts                  # Multi-provider LLM client
│   ├── anthropic-provider.ts          # Claude integration
│   ├── openai-provider.ts             # GPT-4 integration
│   ├── google-provider.ts             # Gemini integration
│   └── prompt-builder.ts              # Inject context into prompts
├── context/
│   ├── schema-injector.ts             # Load integration schemas
│   ├── reference-data-injector.ts     # Load reference data
│   └── context-merger.ts              # Combine all context sources
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
    callId: string;
    purpose: string; // 'planning' | 'tool_selection' | etc.
    model: string;
    tokensInput: number;
    tokensOutput: number;
    cost: number;
  }[];

  actionCalls: {
    actionSlug: string;
    cost: number; // If action has usage-based pricing
  }[];
}

// Pricing per model (updated periodically)
const MODEL_PRICING = {
  'claude-sonnet-4': { input: 0.003, output: 0.015 }, // per 1K tokens
  'gpt-4o': { input: 0.005, output: 0.015 },
  'gemini-1.5-pro': { input: 0.00125, output: 0.005 },
};

function calculateCost(model: string, tokensInput: number, tokensOutput: number): number {
  const pricing = MODEL_PRICING[model];
  return (tokensInput / 1000) * pricing.input + (tokensOutput / 1000) * pricing.output;
}
```

### 4.8 Safety Limits & Circuit Breakers

Prevent runaway executions:

```typescript
interface SafetyLimits {
  maxSteps: number; // Default: 10
  maxDurationSeconds: number; // Default: 300 (5 min)
  maxTokensPerCall: number; // Default: 4000
  maxTotalCost: number; // Default: $1.00
}

async function enforceLimit(execution: AgenticToolExecution) {
  // Check step count
  if (execution.currentStep > execution.safetyLimits.maxSteps) {
    throw new SafetyLimitError('MAX_STEPS_EXCEEDED');
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

### 4.9 API Endpoints

| Method | Endpoint                                       | Purpose                              |
| ------ | ---------------------------------------------- | ------------------------------------ |
| GET    | `/api/v1/ai-tools`                             | List all AI tools (includes agentic) |
| GET    | `/api/v1/agentic-tools`                        | List agentic tools                   |
| POST   | `/api/v1/agentic-tools`                        | Create agentic tool                  |
| GET    | `/api/v1/agentic-tools/:id`                    | Get agentic tool detail              |
| PATCH  | `/api/v1/agentic-tools/:id`                    | Update configuration                 |
| DELETE | `/api/v1/agentic-tools/:id`                    | Delete agentic tool                  |
| POST   | `/api/v1/agentic-tools/:id/test-prompt`        | Test system prompt with sample input |
| POST   | `/api/v1/agentic-tools/:id/regenerate-prompt`  | Re-generate default system prompt    |
| GET    | `/api/v1/agentic-tools/:id/executions`         | List execution history               |
| GET    | `/api/v1/agentic-tools/:id/executions/:execId` | Get execution trace detail           |
| POST   | `/api/v1/agentic-tools/invoke`                 | Invoke agentic tool                  |
| GET    | `/api/v1/agentic-tools/:id/tools/universal`    | Export as universal tool             |
| GET    | `/api/v1/agentic-tools/:id/tools/langchain`    | Export as LangChain tool             |
| GET    | `/api/v1/agentic-tools/:id/tools/mcp`          | Export as MCP tool                   |

### 4.10 Tool Export Format

Agentic tools are exported as simple tools from the parent agent's perspective — the embedded LLM complexity is hidden:

```json
{
  "name": "hubspot_deal_manager",
  "description": "Use this tool to manage HubSpot deals using natural language commands. You can search, update, create, and batch-modify deals.\n\n# Required inputs (always include these):\n- task: Natural language description of what to do with deals. Examples: \"Update all Acme Corp deals to Negotiation\", \"Find deals closing this quarter over $50k\", \"Create a new deal for TechCo worth $100k\".\n\n# What the tool outputs:\nReturns a summary of actions taken, including the number of deals affected, operations executed, and any errors encountered. The embedded AI handles all the complex HubSpot API interactions for you.",
  "parameters": {
    "type": "object",
    "properties": {
      "task": {
        "type": "string",
        "description": "Natural language description of the deal management task to perform."
      }
    },
    "required": ["task"]
  }
}
```

The parent agent just provides a task description. The embedded LLM handles:

- Parsing the task
- Generating HubSpot queries
- Executing operations
- Formatting results

---

## 5. Implementation Tasks

### Phase 1: Database & Core Module (~4 hours)

| #   | Task                                                                                         | Estimate |
| --- | -------------------------------------------------------------------------------------------- | -------- |
| 1.1 | Create Prisma schema for AgenticTool, AgenticToolExecution, EmbeddedLLMCall, AgenticToolCall | 45 min   |
| 1.2 | Run migration                                                                                | 10 min   |
| 1.3 | Create agentic-tools module structure                                                        | 20 min   |
| 1.4 | Implement agentic-tool.repository.ts (CRUD)                                                  | 60 min   |
| 1.5 | Implement agentic-tool.schemas.ts (Zod validation)                                           | 45 min   |
| 1.6 | Implement agentic-tool.service.ts (basic CRUD)                                               | 60 min   |

### Phase 2: LLM Client Infrastructure (~4 hours)

| #   | Task                                                 | Estimate |
| --- | ---------------------------------------------------- | -------- |
| 2.1 | Implement llm-client.ts (multi-provider abstraction) | 45 min   |
| 2.2 | Implement anthropic-provider.ts (Claude integration) | 45 min   |
| 2.3 | Implement openai-provider.ts (GPT-4 integration)     | 45 min   |
| 2.4 | Implement google-provider.ts (Gemini integration)    | 45 min   |
| 2.5 | Implement prompt-builder.ts (context injection)      | 45 min   |
| 2.6 | Add token counting and cost calculation              | 30 min   |

### Phase 3: Context Injection System (~3 hours)

| #   | Task                                                       | Estimate |
| --- | ---------------------------------------------------------- | -------- |
| 3.1 | Implement schema-injector.ts (load integration schemas)    | 45 min   |
| 3.2 | Implement reference-data-injector.ts (load reference data) | 45 min   |
| 3.3 | Implement context-merger.ts (combine all context sources)  | 45 min   |
| 3.4 | Add placeholder replacement in system prompts              | 45 min   |

### Phase 4: Deterministic Orchestrator (~4 hours)

| #   | Task                                                               | Estimate |
| --- | ------------------------------------------------------------------ | -------- |
| 4.1 | Implement deterministic-orchestrator.ts (fixed sequence execution) | 60 min   |
| 4.2 | Implement execution-tracker.ts (track steps, costs)                | 45 min   |
| 4.3 | Implement safety-limits.ts (timeout, max steps)                    | 45 min   |
| 4.4 | Integrate with existing action execution pipeline                  | 60 min   |

### Phase 5: Agentic Orchestrator (~5 hours)

| #   | Task                                                                 | Estimate |
| --- | -------------------------------------------------------------------- | -------- |
| 5.1 | Implement agentic-orchestrator.ts (LLM-driven tool selection loop)   | 90 min   |
| 5.2 | Implement tool selection logic (LLM chooses next tool)               | 60 min   |
| 5.3 | Implement result review and decision logic (continue/complete/retry) | 60 min   |
| 5.4 | Add error recovery with retry prompts                                | 45 min   |

### Phase 6: Export & Description Generation (~3 hours)

| #   | Task                                                            | Estimate |
| --- | --------------------------------------------------------------- | -------- |
| 6.1 | Implement agentic-tool.transformer.ts (Universal format)        | 45 min   |
| 6.2 | Add LangChain export support                                    | 30 min   |
| 6.3 | Add MCP export support                                          | 30 min   |
| 6.4 | Implement description-generator.ts (parent-facing descriptions) | 45 min   |
| 6.5 | Add system prompt generation (AI-generated defaults)            | 45 min   |

### Phase 7: API Endpoints (~3 hours)

| #   | Task                                           | Estimate |
| --- | ---------------------------------------------- | -------- |
| 7.1 | Create CRUD endpoints for agentic tools        | 60 min   |
| 7.2 | Create system prompt test/regenerate endpoints | 30 min   |
| 7.3 | Create execution history endpoints             | 30 min   |
| 7.4 | Create agentic tool invoke endpoint            | 45 min   |
| 7.5 | Create export endpoints                        | 20 min   |

### Phase 8: UI - Agentic Tool Management (~7 hours)

| #   | Task                                                                          | Estimate |
| --- | ----------------------------------------------------------------------------- | -------- |
| 8.1 | Add "Agentic Tool" to unified "Create Tool" flow                              | 30 min   |
| 8.2 | Create execution mode selector (Deterministic vs Agentic)                     | 30 min   |
| 8.3 | Create embedded LLM config form (model, temperature, tokens)                  | 60 min   |
| 8.4 | Create system prompt editor with placeholders                                 | 90 min   |
| 8.5 | Create tool allocation UI (deterministic: sequence, agentic: available tools) | 90 min   |
| 8.6 | Create context config UI (schemas, reference data, docs)                      | 60 min   |
| 8.7 | Create agentic tool detail/edit page                                          | 60 min   |
| 8.8 | Add "Test Prompt" feature (test with sample input)                            | 45 min   |
| 8.9 | Add "Regenerate Prompt" button                                                | 15 min   |

### Phase 9: UI - Execution Trace Viewer (~4 hours)

| #   | Task                                                    | Estimate |
| --- | ------------------------------------------------------- | -------- |
| 9.1 | Create execution list view                              | 45 min   |
| 9.2 | Create execution trace detail view                      | 90 min   |
| 9.3 | Add embedded LLM call details (reasoning, tokens, cost) | 60 min   |
| 9.4 | Add tool call timeline visualization                    | 60 min   |
| 9.5 | Add cost breakdown display                              | 30 min   |

---

## 6. Test Plan

### Unit Tests

- LLM client: Multi-provider calls, error handling, token counting
- Prompt builder: Context injection, placeholder replacement
- Context injectors: Schema loading, reference data loading
- Orchestrators: Deterministic sequence, agentic loop, safety limits
- Cost tracking: Accurate calculation per model
- Safety limits: Timeout, max steps, max cost enforcement

### Integration Tests

- Full agentic tool CRUD
- Deterministic mode execution end-to-end
- Agentic mode execution with tool selection
- Context injection from integrations
- LLM calls with real providers (or mocked)
- Export agentic tools in all formats
- Execution trace generation
- Cost calculation accuracy

### E2E Tests

- Create a deterministic CRM tool, invoke with natural language task
- Create an agentic research tool, invoke and verify autonomous tool selection
- View execution trace with LLM reasoning and tool calls
- Edit agentic tool after creation (change model, update prompt)
- Test prompt with sample input before saving
- Regenerate system prompt after modifying tool allocation

---

## 7. Edge Cases & Error Handling

| Scenario                                    | Handling                                                                        |
| ------------------------------------------- | ------------------------------------------------------------------------------- |
| LLM times out or errors                     | Retry with exponential backoff (up to 3 times), log error, return clear message |
| LLM generates invalid tool parameters       | Validate against schema, retry with error prompt, fall back to error response   |
| Max steps exceeded                          | Stop execution, return partial results + warning                                |
| Max cost exceeded                           | Stop execution, return cost limit error                                         |
| No valid tools available in agentic mode    | Return error explaining no tools match task                                     |
| Schema drift (API changed)                  | Detect mismatch, log warning, attempt best-effort execution                     |
| Embedded LLM selects tool not in allocation | Reject, retry with clarification prompt                                         |

---

## 8. Security Considerations

- LLM provider API keys stored in environment variables (never in database)
- System prompts validated (no code injection)
- Tool allocation enforced server-side (LLM can't call unauthorized tools)
- Cost limits prevent runaway spending
- Execution logs sanitize sensitive data (no credentials, PII)
- Agentic tools inherit tenant isolation from underlying actions

---

## 9. Future Enhancements (Out of Scope)

- **Memory/State** — Embedded LLM remembering previous executions (V2)
- **Fine-tuning** — Tenant-specific LLM fine-tuning (V2)
- **Human-in-the-loop** — Approval gates mid-execution (V2)
- **Streaming** — Real-time output from embedded LLM (V2)
- **Multi-agent collaboration** — Multiple agentic tools working together (Multi-Agent Pipelines)
- **Learning from feedback** — Improving prompts based on success/failure patterns (V3)

---

## 10. Example Usage

### Creating a Deterministic HubSpot Deal Manager

**Configuration:**

- Mode: Deterministic
- Model: Claude Sonnet 4
- Temperature: 0.2
- Tool Sequence:
  1. `hubspot/search-deals`
  2. `hubspot/batch-update-deals`
- Context: HubSpot schema, deal stages reference data

**System Prompt (AI-generated):**

```
You are a HubSpot deal management assistant. Execute deal management tasks using these operations:

1. hubspot/search-deals - Find deals matching criteria
2. hubspot/batch-update-deals - Update multiple deals

Schema: {{integration_schema}}
Valid stages: {{reference_data.deal_stages}}

User task: {{user_task}}

Instructions:
1. Parse task to understand intent
2. Generate search query with correct field names
3. Execute search
4. Plan batch update with found deal IDs
5. Execute update
6. Return summary

Format: { summary: string, deals_affected: number }
```

**Invocation:**

```typescript
const result = await fetch('/api/v1/agentic-tools/invoke', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${WAYGATE_API_KEY}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    tool: 'hubspot-deal-manager',
    params: {
      task: 'Update all Acme Corp deals to Negotiation stage'
    }
  })
});

// Response includes execution trace
{
  success: true,
  data: {
    summary: "Updated 3 deals for Acme Corp to Negotiation stage",
    deals_affected: 3,
    operations_executed: ["search-deals", "batch-update-deals"]
  },
  meta: {
    agenticTool: "hubspot-deal-manager",
    executionId: "exec_abc123",
    mode: "deterministic",
    totalCost: 0.004,
    totalTokens: 2190,
    durationMs: 3200,
    trace: {
      steps: [
        { type: "llm_call", purpose: "planning", tokens: 1234, cost: 0.002 },
        { type: "tool_call", action: "hubspot/search-deals", latencyMs: 456 },
        { type: "llm_call", purpose: "result_review", tokens: 956, cost: 0.001 },
        { type: "tool_call", action: "hubspot/batch-update-deals", latencyMs: 1100 }
      ]
    }
  }
}
```

### Creating an Agentic Research Tool

**Configuration:**

- Mode: Agentic
- Model: GPT-4o
- Temperature: 0.3
- Available Tools:
  - `google/search`
  - `firecrawl/scrape`
  - `pdf-extract/extract`
- Context: Tool descriptions, examples

**System Prompt (AI-generated):**

```
You are a research assistant. Find information requested by the user using these tools:

- google/search: Search the web for information
- firecrawl/scrape: Scrape content from a URL
- pdf-extract/extract: Extract text from PDF files

User request: {{user_task}}

Previous steps: {{execution_history}}

Instructions:
1. Analyze the request to understand what information is needed
2. Select the most appropriate tool to gather information
3. Execute the tool with proper parameters
4. Review results and decide if more information is needed
5. Continue until request is satisfied or max steps reached
6. Format final answer with sources

Always cite sources and explain your reasoning.
```

**Invocation:**

```typescript
const result = await fetch('/api/v1/agentic-tools/invoke', {
  method: 'POST',
  body: JSON.stringify({
    tool: 'research-assistant',
    params: {
      task: 'Find the top 3 competitors to Waygate and their pricing',
    },
  }),
});

// The agentic tool autonomously:
// 1. Searches Google for "Waygate competitors"
// 2. Scrapes top results
// 3. Searches for pricing pages
// 4. Aggregates findings
// 5. Returns formatted report with sources
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

- Anthropic SDK (Claude)
- OpenAI SDK (GPT-4)
- Google AI SDK (Gemini)

---

## 12. Success Metrics

| Metric                            | Target                   | Measurement                     |
| --------------------------------- | ------------------------ | ------------------------------- |
| Agentic tools created per tenant  | 2+ within first month    | Database query                  |
| Agentic tool success rate         | > 90%                    | Successful vs failed executions |
| Average cost per invocation       | < $0.05                  | Cost tracking logs              |
| Time to create agentic tool       | < 10 minutes             | User testing                    |
| Parent agent accuracy improvement | +30% vs direct API calls | A/B testing                     |
