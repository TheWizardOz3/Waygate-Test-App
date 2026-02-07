# Feature: Multi-Agent Pipelines

**Milestone:** V1.5 (AI Tool Factory - Agentic Tools)
**Status:** Complete (Phases 1-9 implemented, unit tests added)
**Dependencies:** Composite Tools (✅), Agentic Tools (✅)
**Priority:** P0

---

## 1. Overview

### 1.1 One-Line Summary

Multi-Agent Pipelines enable building **single tools** that internally execute multiple structured steps — each step producing structured JSON that triggers a server-side action, with optional inter-step LLM reasoning to interpret results before the next step.

### 1.2 User Story

> As an **AI application developer**, I want to **create intelligent tools that internally handle complex multi-step processes** (search → triage → act), so that **parent agents can invoke one tool and get a complete result without knowing the internal complexity**.

### 1.3 Problem Statement

Agentic Tools (V1.5 Phase 2) enable embedded LLMs within a single tool invocation, but many real-world tool behaviors require **multiple structured internal steps** where each step's LLM interprets results and produces structured JSON that drives the next action:

1. **Multi-step internal processes** — e.g., a CRM tool that searches for records, triages results to find the right ones, then performs the correct operation — all as one tool call
2. **Inter-step reasoning** — An LLM that interprets Step 1's output and decides what to pass to Step 2 (not just raw data forwarding)
3. **State accumulation** — Data builds up across steps; Step 3 might need output from both Step 1 and Step 2
4. **Step-level error handling** — Each step has its own timeout, retry policy, and error handling; a failure at Step 3 doesn't lose results from Steps 1-2
5. **Cost and execution monitoring** — Visibility into accumulated cost and step progress

**Important:** These are **tools, not workflows**. From the parent agent's perspective, it's calling one tool with one input and getting one response. The multi-step complexity is entirely internal, executed server-side by Waygate.

**Example: Intelligent CRM Tool**

```
Without Multi-Agent Pipeline:
Parent agent must:
  1. Understand the CRM data model (HubSpot/Salesforce)
  2. Figure out which API endpoints to call
  3. Generate search queries, handle pagination
  4. Parse results, decide what to update
  5. Format update requests, handle errors

  Result: Complex, error-prone, low accuracy

With Multi-Agent Pipeline (single tool):
Parent agent just says:
  crm_tool("Update all Acme Corp deals to Negotiation stage")

  Internally:
  Step 1: LLM interprets task → searches CRM for matching records
  Step 2: LLM triages search results → identifies relevant records
  Step 3: LLM chooses operation → executes updates on correct records

  Result: Simple, accurate, reliable
```

**Example: Research Tool**

```
Parent agent says:
  research_tool("Analyze competitor pricing strategies in the AI infrastructure market")

Internally:
  Step 1: LLM translates research problem → outputs structured research plan as JSON
         (which sources to query, what data to extract)
  Step 2: Research plan executed server-side (web scrape, search, data extraction)
  Step 3: LLM triages research results → produces structured report

Parent agent receives: Completed research report
```

### 1.4 Business Value

- **User Impact:** Enables building intelligent tools with complex internal processes (like the DoubleO CRM Tool and Research Tool patterns) without custom orchestration code
- **Business Impact:** Completes the V1.5 "AI Tool Factory" vision; Waygate tools can now handle multi-step operations that previously required custom agent architectures
- **Technical Impact:** Foundation for more advanced tool patterns (parallel steps, conditional branching) in future versions

### 1.5 Relationship to DoubleO Tool Levels

| Level                                             | Description                                           | Waygate Status             |
| ------------------------------------------------- | ----------------------------------------------------- | -------------------------- |
| **Level 1: Simple Operation Tools**               | Direct wrappers around specific operations            | ✅ Complete (V1.1)         |
| **Composite Tools**                               | Route to correct operation with deterministic logic   | ✅ Complete (V1.5 Phase 1) |
| **Level 2: Intelligent Tools**                    | Embed LLMs for parameter interpretation or tool usage | ✅ Complete (V1.5 Phase 2) |
| **Level 3: Multi-Agent Workflows** (this feature) | Sequential discrete agents with data passing          | 🎯 This Feature            |

---

## 2. Scope & Requirements

### 2.1 Core Concepts

| Concept                  | Definition                                                                                                                          |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| **Pipeline Tool**        | A single tool (from the parent agent's perspective) that internally executes a sequence of structured steps                         |
| **Step**                 | An individual operation: optional tool invocation + optional LLM reasoning. Can be tool+reasoning, tool-only, or **reasoning-only** |
| **Reasoning-Only Step**  | A step with no tool invocation — the LLM produces structured JSON from pipeline state (e.g., triage results, plan next action)      |
| **Pipeline Execution**   | A server-side running instance of a pipeline with accumulated state                                                                 |
| **Step Execution**       | A server-side running instance of a single step within a pipeline execution                                                         |
| **Pipeline State**       | Shared context that accumulates data as steps execute (JSON → action → JSON cycle)                                                  |
| **Inter-Step Reasoning** | Server-side LLM call that interprets step output and produces structured JSON — NOT agentic tool calling                            |
| **Data Mapping**         | Template expressions that reference previous step outputs in subsequent step inputs                                                 |

### 2.2 Functional Requirements

| ID    | Requirement                                                    | Priority | Notes                                        |
| ----- | -------------------------------------------------------------- | -------- | -------------------------------------------- |
| FR-1  | Define pipelines with ordered steps                            | MUST     | Core feature                                 |
| FR-2  | Each step invokes any tool type (simple, composite, agentic)   | MUST     | Uses unified tool abstraction                |
| FR-3  | Inter-step LLM reasoning (optional per step)                   | MUST     | Interpret results, prepare next input        |
| FR-4  | Pipeline state accumulation across steps                       | MUST     | Each step's output added to shared state     |
| FR-5  | Data mapping via template expressions                          | MUST     | `{{steps.search.output.results}}`            |
| FR-6  | Per-step error handling (continue vs fail pipeline)            | MUST     | Configurable per step                        |
| FR-7  | Per-step timeout and retry policy                              | MUST     | Independent of other steps                   |
| FR-8  | Pipeline execution monitoring (progress, current step, cost)   | MUST     | Real-time status                             |
| FR-9  | Pipeline execution logging (all steps, LLM calls, tool calls)  | MUST     | Full audit trail                             |
| FR-10 | Cost tracking (accumulated across all steps and LLM reasoning) | MUST     | Total pipeline cost                          |
| FR-11 | Export pipelines as single tools (Universal, LangChain, MCP)   | MUST     | Pipeline appears as one tool to parent agent |
| FR-12 | Pipeline creation/edit UI in AI Tools section                  | MUST     | Wizard flow                                  |
| FR-13 | Configurable LLM for inter-step reasoning                      | MUST     | Model, temperature, prompt                   |
| FR-14 | Step-level conditional execution (skip based on condition)     | SHOULD   | e.g., "skip if previous step returned empty" |
| FR-15 | Pipeline-level safety limits (max cost, max duration)          | MUST     | Prevent runaway pipelines                    |
| FR-16 | Manual step input override at invocation time                  | SHOULD   | Override specific step params                |
| FR-17 | Pipeline templates (pre-built pipeline patterns)               | COULD    | Future enhancement                           |

### 2.3 Non-Functional Requirements

| Requirement | Target                                                                          | Measurement        |
| ----------- | ------------------------------------------------------------------------------- | ------------------ |
| Performance | Pipeline orchestration overhead < 100ms per step (excluding tool/LLM execution) | Orchestration time |
| Scalability | Support up to 20 steps per pipeline                                             | UI/UX limit        |
| Reliability | Partial results preserved on pipeline failure                                   | State persistence  |
| Cost        | Track and report per-step and total pipeline cost                               | Cost accumulator   |
| Safety      | Max 30 minutes or $5 total cost before pipeline timeout                         | Circuit breaker    |

### 2.4 Acceptance Criteria

- [ ] **Given** a 3-step CRM tool pipeline, **when** invoked with "Update all Acme Corp deals to Negotiation stage", **then** each step executes sequentially (search → triage → execute) and a single aggregated result is returned
- [ ] **Given** a pipeline step with reasoning enabled, **when** the step's tool returns raw search results, **then** the server-side LLM triages results into structured JSON that drives the next step
- [ ] **Given** a reasoning-only step (no tool invocation), **when** executed, **then** the LLM produces structured JSON from pipeline state without making any tool call
- [ ] **Given** a pipeline where Step 2 fails, **when** configured with `onError: 'continue'`, **then** Step 3 executes with available state and the pipeline completes with partial results
- [ ] **Given** a running pipeline, **when** querying execution status, **then** response shows current step, completed steps with results, accumulated cost, and elapsed time
- [ ] **Given** a pipeline with cost limit of $1, **when** accumulated cost exceeds $1 mid-step, **then** pipeline stops after current step with a cost limit error and preserves partial results
- [ ] **Given** a completed pipeline, **when** exported as a Universal tool, **then** it appears as a **single tool** with the pipeline's input schema and mini-prompt description — internal step complexity is hidden

### 2.5 Out of Scope

- **Parallel step execution** — All steps execute sequentially (parallel branches deferred to V2)
- **Dynamic step generation** — Steps are defined at design time, not created dynamically at runtime
- **Human-in-the-loop gates** — Approval steps that pause for human input (deferred to V2)
- **Looping/iteration** — Repeating steps based on conditions (deferred to V2)
- **Pipeline versioning** — Version history and rollback (deferred to V2)
- **Webhook triggers** — Starting pipelines from external events (deferred to V2.2)
- **Nested pipelines** — Pipelines containing other pipelines

---

## 3. User Experience

### 3.1 Unified "AI Tools" Management

Pipelines are managed in the same **"AI Tools"** section:

**Sidebar Structure:**

```
Dashboard
Integrations
AI Tools
  ├─ All Tools        (filter: Simple | Composite | Agentic | Pipeline)
  ├─ Create Tool      → "Pipeline" option
  └─ Export
Settings
```

### 3.2 User Flow: Creating a Pipeline Tool

The pipeline configuration uses a **single-page dashboard** (not a wizard), similar to the Agentic Tool configuration page, where interrelated components are visible and editable together.

```
AI Tools → "Create Tool" → Select "Pipeline"
        ↓
   Single Configuration Dashboard:
   ┌──────────────────────────────────────────────────────────┐
   │ [Tool Identity]  Name, slug, description, input schema  │
   │                                                          │
   │ [Steps]          Visual step sequence (add/remove/reorder)│
   │  ├─ Step 1: Tool + Input Mapping + Reasoning Prompt     │
   │  ├─ Step 2: Tool + Input Mapping + Reasoning Prompt     │
   │  └─ Step 3: Tool + Input Mapping + Reasoning Prompt     │
   │                                                          │
   │ [Settings]       Safety limits, default LLM config,      │
   │                  output mapping, error handling           │
   │                                                          │
   │ [AI Description] Generate / edit tool description        │
   └──────────────────────────────────────────────────────────┘
```

**Happy Path:**

1. User navigates to "AI Tools" and clicks "Create Tool"
2. User selects "Pipeline" tool type → opens config dashboard
3. **Tool Identity:** User names the pipeline (e.g., "CRM Tool") and defines input parameters (e.g., `{ task: string }`)
4. **Steps:** User adds steps in sequence:
   - Step 1: Select tool (e.g., "HubSpot Search"), map inputs, write reasoning prompt ("Triage search results and identify relevant records...")
   - Step 2: Reasoning-only step (no tool — LLM plans the operation as JSON)
   - Step 3: Select tool (e.g., "HubSpot Batch Operation"), map inputs from previous step reasoning
5. **Settings:** User configures safety limits ($1 max cost, 5 min timeout), per-step error handling
6. **AI Description:** System generates tool description, user can edit
7. User saves — pipeline is immediately available as a tool

### 3.3 User Flow: Monitoring Pipeline Execution

```
AI Tools → Pipeline Detail → "Executions" Tab
        ↓
   Execution List (recent runs with status, duration, cost)
        ↓
   Execution Detail:
   ┌─────────────────────────────────────────────────┐
   │ Pipeline: Lead Generation Pipeline               │
   │ Status: Running (Step 2 of 3)                    │
   │ Duration: 12.3s | Cost: $0.04 | Steps: 1/3 ✅   │
   │                                                   │
   │ ┌─ Step 1: Google Search ────────── ✅ Complete  │
   │ │  Tool: google/search                            │
   │ │  Duration: 2.1s | Cost: $0.00                   │
   │ │  Output: 10 search results                      │
   │ │  Reasoning: Extracted 5 company URLs             │
   │ │                                                  │
   │ ├─ Step 2: Smart Scraper ────────── 🔄 Running   │
   │ │  Tool: smart-scraper (composite)                │
   │ │  Duration: 10.2s (running)                       │
   │ │                                                  │
   │ └─ Step 3: HubSpot Create ──────── ⏳ Pending    │
   │    Tool: hubspot/create-contact                    │
   └─────────────────────────────────────────────────┘
```

### 3.4 UI Locations

| Location                      | Content                                                                                           |
| ----------------------------- | ------------------------------------------------------------------------------------------------- |
| **AI Tools → Create**         | Add "Pipeline" option alongside Composite and Agentic                                             |
| **Pipeline Config Dashboard** | Single-page config with Tool Identity, Steps, Settings, AI Description sections                   |
| **Steps Section**             | Visual step sequence with drag-to-reorder, inline tool selection, data mapping, reasoning prompts |
| **Execution Detail**          | Step-by-step progress with outputs and reasoning                                                  |
| **Integration Detail**        | Show which pipelines use this integration's tools                                                 |

---

## 4. Technical Approach

### 4.1 Architecture Fit

**Affected Areas:**

| Area              | Impact | Description                                                     |
| ----------------- | ------ | --------------------------------------------------------------- |
| Frontend          | NEW    | Pipeline builder UI, execution monitor, step editor             |
| Backend           | NEW    | Pipeline module, orchestrator, state manager                    |
| Database          | NEW    | Pipeline, PipelineStep, PipelineExecution, StepExecution tables |
| External Services | NONE   | Uses existing tool invocation infrastructure                    |

**Alignment with Existing Patterns:**

- Follows modular monolith structure (`src/lib/modules/pipelines/`)
- Uses existing unified tool abstraction for step tool selection
- Reuses existing tool invocation handlers (composite invocation handler, agentic invocation handler, gateway action handler)
- Uses existing LLM client infrastructure from agentic tools for inter-step reasoning
- Follows Shadcn/ui patterns for pipeline builder UI
- Export follows existing tool-export module patterns

### 4.2 Data Model

```typescript
// New entities

Pipeline: {
  id: uuid PK,
  tenantId: uuid FK → Tenant,
  name: string,                    // "Lead Generation Pipeline"
  slug: string UK,                 // "lead-generation-pipeline"
  description: string,
  inputSchema: jsonb,              // Pipeline-level input parameters
  outputMapping: jsonb,            // How to build final output from step results
  toolDescription: text,           // LLM-optimized description (for export)
  toolSuccessTemplate: text,
  toolErrorTemplate: text,
  safetyLimits: jsonb,             // { maxCostUsd: 5, maxDurationSeconds: 1800 }
  reasoningConfig: jsonb,          // Default LLM config for inter-step reasoning
  status: enum,                    // 'draft' | 'active' | 'disabled'
  metadata: jsonb,
  createdAt: timestamp,
  updatedAt: timestamp
}

PipelineStep: {
  id: uuid PK,
  pipelineId: uuid FK → Pipeline,
  stepNumber: integer,             // Execution order (1-based)
  name: string,                    // "Search for Leads"
  slug: string,                    // "search-for-leads"
  toolId: string,                  // References Action.id, CompositeTool.id, or AgenticTool.id
  toolType: enum,                  // 'simple' | 'composite' | 'agentic'
  toolSlug: string,                // Denormalized for display
  inputMapping: jsonb,             // Template expressions mapping pipeline/step state → tool input
  onError: enum,                   // 'fail_pipeline' | 'continue' | 'skip_remaining'
  retryConfig: jsonb,              // { maxRetries: 2, backoffMs: 1000 }
  timeoutSeconds: integer,         // Per-step timeout (default: 300)
  condition: jsonb,                // Optional skip condition
  reasoningEnabled: boolean,       // Whether to run LLM after this step
  reasoningPrompt: text,           // Inter-step reasoning instructions
  reasoningConfig: jsonb,          // Override pipeline-level LLM config (nullable)
  metadata: jsonb,
  createdAt: timestamp,
  updatedAt: timestamp
}

PipelineExecution: {
  id: uuid PK,
  pipelineId: uuid FK → Pipeline,
  tenantId: uuid FK → Tenant,
  input: jsonb,                    // Pipeline input parameters
  state: jsonb,                    // Accumulated pipeline state
  output: jsonb,                   // Final pipeline output
  status: enum,                    // 'running' | 'completed' | 'failed' | 'timeout' | 'cancelled'
  currentStepNumber: integer,      // Which step is currently executing
  totalSteps: integer,
  totalCostUsd: decimal,           // Accumulated cost across all steps
  totalTokens: integer,            // Accumulated tokens across all reasoning
  error: jsonb,                    // Pipeline-level error (if failed)
  startedAt: timestamp,
  completedAt: timestamp,
  createdAt: timestamp
}

StepExecution: {
  id: uuid PK,
  pipelineExecutionId: uuid FK → PipelineExecution,
  pipelineStepId: uuid FK → PipelineStep,
  stepNumber: integer,
  status: enum,                    // 'pending' | 'running' | 'completed' | 'failed' | 'skipped'
  resolvedInput: jsonb,            // Input after template resolution
  toolOutput: jsonb,               // Raw output from tool invocation
  reasoningOutput: jsonb,          // Output from inter-step LLM reasoning
  error: jsonb,                    // Step-level error
  retryCount: integer,
  costUsd: decimal,                // Cost for this step (tool + reasoning)
  tokensUsed: integer,             // Tokens for reasoning in this step
  durationMs: integer,
  startedAt: timestamp,
  completedAt: timestamp,
  createdAt: timestamp
}
```

### 4.3 Pipeline State & Data Mapping

Pipeline state is a key-value store that accumulates data as steps execute. Template expressions allow steps to reference previous outputs.

#### State Structure

```typescript
interface PipelineState {
  // Pipeline-level input
  input: Record<string, unknown>;

  // Per-step results (keyed by step slug)
  steps: {
    [stepSlug: string]: {
      output: unknown; // Raw tool output
      reasoning?: unknown; // LLM reasoning output (if enabled)
      status: 'completed' | 'failed' | 'skipped';
      error?: string;
    };
  };
}
```

#### Template Expression Syntax

Steps reference pipeline state using double-brace template expressions:

| Expression                               | Resolves To                            |
| ---------------------------------------- | -------------------------------------- |
| `{{input.query}}`                        | Pipeline input parameter `query`       |
| `{{steps.search.output}}`                | Full output of step with slug "search" |
| `{{steps.search.output.results[0].url}}` | Nested property access                 |
| `{{steps.search.reasoning}}`             | LLM reasoning output of step "search"  |
| `{{steps.search.reasoning.urls}}`        | Specific field from reasoning output   |
| `{{steps.search.status}}`                | Status of step "search"                |

#### Template Resolution

```typescript
function resolveTemplates(
  template: Record<string, unknown>,
  state: PipelineState
): Record<string, unknown> {
  // Deep-walk the template object
  // Replace {{expression}} with resolved values from state
  // Support nested property access via dot notation
  // Support array indexing via [n]
  // Throw clear error if referenced step hasn't completed
}
```

### 4.4 Execution Model: Structured JSON → Server-Side Action

**Pipeline tools do NOT use agentic tool calling internally.** In LangChain and similar frameworks, tools can't call other tools through the agent's tool-calling loop. Instead, pipeline steps follow a structured pattern aligned with the DoubleO playbook:

```
Each step follows this cycle:
  1. LLM Reasoning: Interprets context → outputs structured JSON
  2. Server-Side Action: JSON triggers a Waygate tool invocation (HTTP, not LLM tool call)
  3. Action Response: Result stored in pipeline state → feeds into next step

Parent Agent                    Waygate (Server-Side)
    │                               │
    │── invoke crm_tool(task) ─────>│
    │                               ├── Step 1: LLM → JSON search plan
    │                               ├── Step 1: Execute search (server-side HTTP)
    │                               ├── Step 1: Store results in state
    │                               ├── Step 2: LLM → JSON triage results
    │                               ├── Step 2: (reasoning-only, no tool call)
    │                               ├── Step 3: LLM → JSON operation plan
    │                               ├── Step 3: Execute CRM update (server-side HTTP)
    │                               ├── Build final response
    │<── ToolSuccessResponse ───────┤
    │                               │
```

**Key distinctions:**

- The **parent agent** makes ONE tool call and receives ONE response
- All internal step execution happens **server-side** through Waygate's invocation handlers
- Inter-step LLMs are **reasoners/interpreters**, not agents with tools — they output JSON, not tool calls
- Steps can be **reasoning-only** (no tool invocation) — the LLM just transforms/triages data

### 4.5 Inter-Step LLM Reasoning

After each step (when enabled), a server-side LLM call interprets the step's output and produces structured JSON for the next step. The LLM does NOT call tools — it outputs structured data.

#### Reasoning Flow

```
Step N Action Completes → Tool Output Available
        ↓
Inter-Step LLM Reasoning (server-side):
  - System Prompt: Step's reasoning prompt + pipeline context
  - Input: Step output + accumulated pipeline state
  - Output: Structured JSON added to state as steps[slug].reasoning
  - NOT an agent — does not call tools, just produces JSON
        ↓
Step N+1 Input Mapping:
  - Can reference {{steps.step_n.reasoning.fieldName}}
  - JSON drives the next server-side action
```

#### Reasoning Prompt Template

Each step can define a reasoning prompt with variables:

```
You are a data processing assistant within a multi-step pipeline.

# Current Step Output:
{{step_output}}

# Pipeline State So Far:
{{pipeline_state_summary}}

# Your Task:
{{reasoning_instructions}}

# Instructions:
Analyze the step output and produce structured JSON.
Your output will be used by the next step in the pipeline.

# Output Format:
Return ONLY valid JSON matching the expected structure.
```

#### Reasoning Configuration

```typescript
interface ReasoningConfig {
  provider: 'anthropic' | 'google';
  model: string;
  temperature: number; // Default: 0.2
  maxTokens: number; // Default: 2000
  outputSchema?: jsonb; // Optional JSON Schema for structured output
}
```

### 4.6 Execution Flow (CRM Tool Example)

```
1. Parent Agent Invokes Pipeline Tool
   Input: { task: "Update all Acme Corp deals to Negotiation stage" }
   ↓
2. Create PipelineExecution Record (server-side)
   State: { input: { task: "..." }, steps: {} }
   ↓
3. Execute Step 1 ("Search Records")
   a. Resolve input templates: query → {{input.task}}
   b. Invoke hubspot/search tool (server-side HTTP call)
   c. Store output in state: steps.search.output = { results: [...] }
   d. Inter-step reasoning (server-side LLM call):
      - LLM triages search results → identifies 3 relevant Acme Corp deals
      - Output: { relevantRecords: [...], suggestedOperation: "update", ... }
      - Store: steps.search.reasoning = { relevantRecords: [...] }
   e. Create StepExecution record with cost/duration
   ↓
4. Check Safety Limits (cost, duration)
   ↓
5. Execute Step 2 ("Triage & Plan") — reasoning only, no tool call
   a. LLM receives accumulated state (search results + triage)
   b. Produces structured operation plan as JSON
   c. Store: steps.triage.reasoning = { operation: "update", recordIds: [...], updateFields: {...} }
   d. No tool invocation — this step is pure reasoning
   ↓
6. Check Safety Limits → Continue
   ↓
7. Execute Step 3 ("Execute Operation")
   a. Resolve input templates from steps.triage.reasoning
   b. Invoke hubspot/batch-operation tool (server-side HTTP call)
   c. Store output (no reasoning — final step)
   ↓
8. Build Final Output
   Apply outputMapping to construct ToolSuccessResponse from state
   ↓
9. Return Single Response to Parent Agent
   One ToolSuccessResponse with results, metadata, nextSteps
```

### 4.7 Error Handling Per Step

Each step has an `onError` policy:

| Policy           | Behavior                                                    |
| ---------------- | ----------------------------------------------------------- |
| `fail_pipeline`  | Stop pipeline, mark as failed, return partial results       |
| `continue`       | Log error, mark step as failed, proceed to next step        |
| `skip_remaining` | Log error, skip all remaining steps, return partial results |

When a step fails with `continue`, subsequent steps can check `{{steps.failed_step.status}}` to conditionally adjust their behavior.

### 4.8 Step Conditions

Steps can have optional skip conditions evaluated against pipeline state:

```typescript
interface StepCondition {
  type: 'expression';
  expression: string;          // Template expression that resolves to truthy/falsy
  skipWhen: 'truthy' | 'falsy'; // Skip when expression is truthy or falsy
}

// Examples:
// Skip step if search returned no results
{ type: 'expression', expression: '{{steps.search.output.results.length}}', skipWhen: 'falsy' }

// Skip step if previous step failed
{ type: 'expression', expression: '{{steps.enrich.status}}', skipWhen: 'falsy' }
```

### 4.9 Module Structure

```
src/lib/modules/pipelines/
├── index.ts                           # Module exports
├── pipeline.service.ts                # CRUD, orchestration entry point
├── pipeline.repository.ts             # Database access
├── pipeline.schemas.ts                # Zod schemas
├── orchestrator/
│   ├── pipeline-orchestrator.ts       # Main execution loop
│   ├── step-executor.ts              # Execute individual step (tool + reasoning)
│   ├── state-manager.ts              # Pipeline state accumulation
│   ├── template-resolver.ts          # Resolve {{expression}} templates
│   ├── condition-evaluator.ts        # Evaluate step skip conditions
│   └── safety-enforcer.ts            # Cost/duration limits
├── reasoning/
│   ├── inter-step-reasoner.ts        # LLM call between steps
│   └── reasoning-prompt-builder.ts   # Build reasoning prompts with context
├── export/
│   ├── pipeline.transformer.ts       # Export as Universal/LangChain/MCP tool
│   └── description-generator.ts      # Generate pipeline tool description
└── handlers/
    └── invocation-handler.ts          # API-level invocation entry point
```

### 4.10 Tool Invocation Delegation

Steps delegate to existing invocation handlers based on tool type. **Context (reference data) is forwarded** from the pipeline invocation to each step's underlying tool, enabling name→ID resolution (e.g., `#general` → `C0123456`) at the step level via the same context resolver used by Simple Tool Export.

```typescript
async function executeStepTool(
  step: PipelineStep,
  resolvedInput: Record<string, unknown>,
  tenantContext: TenantContext,
  pipelineContext?: ToolContext // Reference data forwarded from pipeline invocation
): Promise<ToolInvocationResult> {
  switch (step.toolType) {
    case 'simple':
      // Delegate to existing gateway action handler with context injection
      return await invokeAction(step.toolSlug, resolvedInput, tenantContext, {
        context: pipelineContext,
      });

    case 'composite':
      // Delegate to existing composite tool invocation handler
      return await invokeCompositeTool({
        toolIdentifier: step.toolSlug,
        tenantId: tenantContext.tenantId,
        params: resolvedInput,
        context: pipelineContext,
      });

    case 'agentic':
      // Delegate to existing agentic tool invocation handler
      return await invokeAgenticTool({
        toolIdentifier: step.toolSlug,
        tenantId: tenantContext.tenantId,
        task: resolvedInput.task as string,
        requestId: crypto.randomUUID(),
        context: pipelineContext,
      });
  }
}
```

**Context Flow:**

```
Pipeline Invocation (with context: { channels: [...], users: [...] })
  ↓ context forwarded to each step
Step 1: google/search → context available for resolution
  ↓
Step 2: smart-scraper → context available for resolution
  ↓
Step 3: hubspot/create-contact → context resolves "#general" → "C0123456"
```

### 4.11 API Endpoints

| Method | Endpoint                                  | Purpose                                   |
| ------ | ----------------------------------------- | ----------------------------------------- |
| GET    | `/api/v1/ai-tools`                        | List all AI tools (includes pipelines)    |
| GET    | `/api/v1/pipelines`                       | List tenant's pipelines                   |
| POST   | `/api/v1/pipelines`                       | Create pipeline                           |
| GET    | `/api/v1/pipelines/:id`                   | Get pipeline detail (includes steps)      |
| PATCH  | `/api/v1/pipelines/:id`                   | Update pipeline                           |
| DELETE | `/api/v1/pipelines/:id`                   | Delete pipeline                           |
| POST   | `/api/v1/pipelines/:id/steps`             | Add step to pipeline                      |
| PATCH  | `/api/v1/pipelines/:id/steps/:stepId`     | Update step                               |
| DELETE | `/api/v1/pipelines/:id/steps/:stepId`     | Remove step                               |
| PUT    | `/api/v1/pipelines/:id/steps/reorder`     | Reorder steps                             |
| POST   | `/api/v1/pipelines/invoke`                | Invoke pipeline (synchronous)             |
| GET    | `/api/v1/pipelines/executions`            | List pipeline executions                  |
| GET    | `/api/v1/pipelines/executions/:id`        | Get execution detail (steps, state, cost) |
| POST   | `/api/v1/pipelines/executions/:id/cancel` | Cancel running execution                  |
| GET    | `/api/v1/pipelines/:id/tools/universal`   | Export as universal tool                  |
| GET    | `/api/v1/pipelines/:id/tools/langchain`   | Export as LangChain tool                  |
| GET    | `/api/v1/pipelines/:id/tools/mcp`         | Export as MCP tool                        |

### 4.12 Tool Export Format

Pipelines are exported as single tools — the multi-step complexity is hidden from the parent agent. The export uses the **same transformer infrastructure** from the `tool-export` module (`universal.transformer.ts`, `langchain.transformer.ts`, `mcp.transformer.ts`).

**Integration with Aggregated Export:**

Pipelines are automatically included in the aggregated export endpoints alongside simple, composite, and agentic tools:

- `GET /api/v1/tools/export/universal` — includes pipelines as `type: "pipeline"`
- `GET /api/v1/tools/export/langchain` — includes pipelines with LangChain wrapper
- `GET /api/v1/tools/export/mcp` — includes pipelines as MCP tool definitions

The `pipeline.transformer.ts` module follows the same interface as existing transformers, and `unified-tool.service.ts` is extended to aggregate pipeline tools.

**Example Exported Tool (CRM Tool):**

```json
{
  "name": "crm_tool",
  "description": "Use this tool to perform CRM operations including searching, reading, creating, and updating records in the user's connected CRM.\n\n# Required inputs (always include these):\n- task: Natural language description of what CRM operation to perform. Example: \"Find all Acme Corp deals and update to Negotiation stage\".\n\n# What the tool is going to output:\nReturns a summary of actions taken including records found, operations performed, and relevant record IDs.",
  "parameters": {
    "type": "object",
    "properties": {
      "task": {
        "type": "string",
        "description": "Natural language description of the CRM operation to perform."
      }
    },
    "required": ["task"]
  }
}
```

### 4.13 Output Mapping

The pipeline's final output is constructed from the accumulated state using an output mapping:

```typescript
interface OutputMapping {
  // Map state paths to output fields
  fields: {
    [outputField: string]: {
      source: string;          // Template expression: {{steps.create.output.created}}
      description?: string;    // For documentation
    };
  };

  // Optional: include full pipeline metadata
  includeMeta: boolean;        // Include step statuses, costs, durations
}

// Example:
{
  fields: {
    contacts: { source: "{{steps.create_leads.output.created}}" },
    companiesFound: { source: "{{steps.search.reasoning.companies.length}}" },
    leadsCreated: { source: "{{steps.create_leads.output.created.length}}" }
  },
  includeMeta: true
}
```

### 4.14 Pipeline Response Format

Pipeline invocation responses follow the **same `ToolSuccessResponse`/`ToolErrorResponse` format** established by Simple Tool Export. This ensures pipelines are agent-readable when exported as tools and consumed by parent agents.

#### Success Response

Per the DoubleO playbook, success messages must include: (1) **what happened** with metadata, (2) the **content** of what was produced/retrieved, and (3) **what to do next** accounting for both direct instructions and complex multi-step contexts.

```typescript
interface PipelineSuccessResponse {
  success: true;
  message: string; // "## {action taken with metadata}:\n{content summary}\n## In your response:\n{guidance for both simple and complex request contexts}"
  data: unknown; // Final output from outputMapping
  meta: {
    pipeline: string; // Pipeline slug
    executionId: string;
    totalSteps: number;
    completedSteps: number;
    totalCostUsd: number;
    totalTokens: number;
    durationMs: number;
    steps: Array<{
      name: string;
      status: string;
      durationMs: number;
      costUsd: number;
    }>;
  };
  context: {
    resolvedInputs: Record<string, { original: string; resolved: string }>;
  };
  nextSteps: string; // Follow-on instructions for the agent
}
```

#### Error Response

```typescript
interface PipelineErrorResponse {
  success: false;
  message: string; // What went wrong (with metadata: which step, what was attempted)
  error: {
    code: string; // e.g., "STEP_FAILED", "COST_LIMIT_EXCEEDED"
    details: {
      failedStep?: string;
      stepNumber?: number;
      partialResults?: unknown; // Results from completed steps
    };
  };
  meta: {
    pipeline: string;
    executionId: string;
    completedSteps: number;
    totalSteps: number;
  };
  context: {
    attemptedInputs: Record<string, unknown>;
  };
  remediation: string; // How to fix + standard retry-and-fallback (see below)
}
```

**Remediation follows the DoubleO playbook's standard retry-and-fallback pattern:**

```
## How to fix:
1. {Specific remediation steps based on the error}
2. {Additional guidance}

If you have already retried with a different approach and are still encountering this error, skip this step and proceed to your next task.
```

This ensures parent agents know when to stop retrying and move on, preventing infinite retry loops.

#### Template-Based Response Generation

The `Pipeline.toolSuccessTemplate` and `Pipeline.toolErrorTemplate` fields work identically to `Action.toolSuccessTemplate` and `Action.toolErrorTemplate` from Simple Tool Export:

- **toolSuccessTemplate**: Defines how to format the `message` field using template variables (`{{data.contacts.length}}`, `{{meta.totalSteps}}`, etc.)
- **toolErrorTemplate**: Defines how to format the `message` and `remediation` fields for error cases
- **Generated by AI**: The description generator produces these templates alongside `toolDescription` at pipeline creation time
- **Fallback**: When no custom template exists, a default template is built from the pipeline's step names and output mapping

### 4.15 Description Generation

Pipeline descriptions follow the **same mini-prompt format** used by Simple Tool Export (`tool-export/descriptions/description-builder.ts`) and the DoubleO playbook's mandatory tool description format:

```
Use this tool to {what the pipeline does as a single cohesive operation}.

# Required inputs (always include these):
- {param}: {description with type, constraints, defaults}

# Optional inputs (include when {condition}):
- {param}: {description with when to include/exclude}

# CRITICAL {domain} rules:
{Numbered list of important constraints, valid/invalid input rules, or behavioral rules}
(Only include this section when the pipeline has non-obvious input constraints or rules)

# What the tool is going to output:
{Description of final output format and key fields}
```

The description generator for pipelines reuses the same structure and conventions:

- **Actionable verb phrase** opening (e.g., "Use this tool to find and create CRM leads...")
- **Required/Optional inputs** sections with examples, guidance on defaults, and what to include/exclude
- **CRITICAL sections** when the pipeline has input constraints (e.g., mutually exclusive parameters, format requirements, filtering rules) — following the playbook's email tool pattern
- **Output section** describing what the tool returns
- **Internal pipeline complexity is hidden** — the description presents the pipeline as a single operation

The generator is aware of the pipeline's steps and their tool descriptions, using them to synthesize a cohesive description that reflects the end-to-end workflow without exposing internal step details.

---

## 5. Implementation Tasks

### Phase 1: Database & Core Module

| #   | Task                                                                              | Estimate |
| --- | --------------------------------------------------------------------------------- | -------- |
| 1.1 | Create Prisma schema for Pipeline, PipelineStep, PipelineExecution, StepExecution | 45 min   |
| 1.2 | Run migration                                                                     | 10 min   |
| 1.3 | Create pipelines module structure                                                 | 15 min   |
| 1.4 | Implement pipeline.repository.ts (CRUD with step management)                      | 60 min   |
| 1.5 | Implement pipeline.schemas.ts (Zod validation for pipeline, steps, mappings)      | 45 min   |
| 1.6 | Implement pipeline.service.ts (basic CRUD, step ordering)                         | 60 min   |

### Phase 2: Template Resolution & State Management

| #   | Task                                                                          | Estimate |
| --- | ----------------------------------------------------------------------------- | -------- |
| 2.1 | Implement template-resolver.ts (parse and resolve `{{expression}}` templates) | 60 min   |
| 2.2 | Implement state-manager.ts (accumulate step outputs, manage pipeline state)   | 45 min   |
| 2.3 | Implement condition-evaluator.ts (evaluate step skip conditions)              | 30 min   |
| 2.4 | Implement safety-enforcer.ts (cost limits, duration limits, step count)       | 30 min   |

### Phase 3: Inter-Step Reasoning

| #   | Task                                                                                     | Estimate |
| --- | ---------------------------------------------------------------------------------------- | -------- |
| 3.1 | Implement reasoning-prompt-builder.ts (build prompts with step output and state context) | 45 min   |
| 3.2 | Implement inter-step-reasoner.ts (LLM call with structured output, cost tracking)        | 60 min   |
| 3.3 | Integrate with existing LLM client from agentic tools module                             | 30 min   |

### Phase 4: Pipeline Orchestrator

| #   | Task                                                                                                   | Estimate |
| --- | ------------------------------------------------------------------------------------------------------ | -------- |
| 4.1 | Implement step-executor.ts (resolve input, invoke tool, run reasoning, handle errors)                  | 60 min   |
| 4.2 | Implement pipeline-orchestrator.ts (sequential execution loop, state updates, safety checks)           | 60 min   |
| 4.3 | Integrate tool delegation (simple → gateway, composite → composite handler, agentic → agentic handler) | 45 min   |
| 4.4 | Implement execution logging (PipelineExecution + StepExecution records)                                | 45 min   |
| 4.5 | Implement output mapping (build final output from state)                                               | 30 min   |

### Phase 5: Export, Description Generation & Response Formatting

| #   | Task                                                                                                                                                                                                                                                           | Estimate |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| 5.1 | Implement description-generator.ts — reuse `tool-export/descriptions/description-builder.ts` mini-prompt format, synthesize pipeline-level description from step tool descriptions                                                                             | 45 min   |
| 5.2 | Implement pipeline response formatter — reuse `tool-export/responses/success-formatter.ts` and `error-formatter.ts` patterns for `PipelineSuccessResponse`/`PipelineErrorResponse` with `message`, `data`, `meta`, `context`, `nextSteps`/`remediation` fields | 45 min   |
| 5.3 | Implement pipeline.transformer.ts (Universal format export) — follow same transformer interface as `tool-export/formats/universal.transformer.ts`                                                                                                              | 30 min   |
| 5.4 | Add LangChain export support — follow `tool-export/formats/langchain.transformer.ts` pattern                                                                                                                                                                   | 20 min   |
| 5.5 | Add MCP export support — follow `tool-export/formats/mcp.transformer.ts` pattern                                                                                                                                                                               | 20 min   |
| 5.6 | Add pipeline type to unified tool abstraction (`unified-tool.service.ts`) and aggregated export endpoints (`/api/v1/tools/export/*`)                                                                                                                           | 30 min   |

### Phase 6: API Endpoints

| #   | Task                                                            | Estimate |
| --- | --------------------------------------------------------------- | -------- |
| 6.1 | Create pipeline CRUD endpoints                                  | 45 min   |
| 6.2 | Create step management endpoints (add, update, delete, reorder) | 45 min   |
| 6.3 | Create pipeline invoke endpoint                                 | 30 min   |
| 6.4 | Create execution query endpoints (list, detail, cancel)         | 45 min   |
| 6.5 | Create export endpoints (universal, langchain, mcp)             | 20 min   |

### Phase 7: Invocation Handler

| #   | Task                                                                                | Estimate |
| --- | ----------------------------------------------------------------------------------- | -------- |
| 7.1 | Implement invocation-handler.ts (API-level entry point, validation, tenant context) | 45 min   |
| 7.2 | Wire up invocation endpoint to orchestrator                                         | 15 min   |

### Phase 8: UI - Pipeline Configuration Dashboard

| #   | Task                                                                                                                                                    | Estimate |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| 8.1 | Add "Pipeline" to unified "Create Tool" flow type selector                                                                                              | 20 min   |
| 8.2 | Create pipeline config dashboard layout — single-page with Tool Identity, Steps, Settings, AI Description sections (follow agentic tool config pattern) | 60 min   |
| 8.3 | Create Tool Identity section (name, slug, description, input schema editor)                                                                             | 30 min   |
| 8.4 | Create Steps section — visual step sequence with add/remove/reorder, inline step configuration                                                          | 90 min   |
| 8.5 | Create step configuration panel (tool selection via unified tool abstraction, input mapping, error policy, reasoning-only toggle)                       | 60 min   |
| 8.6 | Create inter-step reasoning configuration (prompt editor, LLM config, reasoning-only mode for steps without tool invocation)                            | 60 min   |
| 8.7 | Create data mapping editor with template expression autocomplete (reference available step outputs/reasoning)                                           | 60 min   |
| 8.8 | Create Settings section (safety limits, output mapping, default LLM config)                                                                             | 30 min   |
| 8.9 | Create AI Description section (generate/edit tool description, success/error templates)                                                                 | 30 min   |

### Phase 9: UI - Execution Monitoring & Export

| #   | Task                                                                                                             | Estimate |
| --- | ---------------------------------------------------------------------------------------------------------------- | -------- |
| 9.1 | Create execution list view (recent runs with status, cost, duration) — accessible from pipeline config dashboard | 30 min   |
| 9.2 | Create execution detail view (step-by-step progress, outputs, reasoning)                                         | 60 min   |
| 9.3 | Add pipeline type to AI Tools list with Pipeline badge/icon                                                      | 15 min   |
| 9.4 | Add export section to pipeline config dashboard                                                                  | 20 min   |

---

## 6. Test Plan

### Unit Tests

- Template resolver: expression parsing, nested property access, array indexing, missing references
- State manager: state accumulation, step output storage, state immutability
- Condition evaluator: truthy/falsy evaluation, expression resolution
- Safety enforcer: cost limits, duration limits, step count limits
- Reasoning prompt builder: variable injection, context summarization
- Output mapping: field resolution, missing field handling
- Pipeline schemas: validation of pipeline, step, and mapping configurations

### Integration Tests

- Full pipeline CRUD (create pipeline with steps, update, delete)
- Step ordering (add, remove, reorder steps)
- Pipeline invocation with 3 sequential steps
- Data passing between steps via templates
- Inter-step LLM reasoning with structured output
- Error handling: step failure with `continue` policy
- Error handling: step failure with `fail_pipeline` policy
- Conditional step execution (skip based on condition)
- Safety limit enforcement (cost limit, duration limit)
- Pipeline export in all formats (Universal, LangChain, MCP)
- Execution query (list, detail)
- Pipeline cancel during execution

### E2E Tests

- Create a 3-step pipeline with the wizard UI
- Invoke pipeline and verify sequential execution with data passing
- View execution progress and verify step-level detail
- Edit pipeline after creation (modify step, add step)
- Export pipeline as Universal tool and verify schema

---

## 7. Edge Cases & Error Handling

| Scenario                                  | Handling                                                                          |
| ----------------------------------------- | --------------------------------------------------------------------------------- |
| Referenced step output doesn't exist      | Clear error: "Step 'search' referenced in template but hasn't completed"          |
| Template expression resolves to undefined | Return null; log warning; subsequent step validates its input                     |
| Step's tool has been deleted              | Mark pipeline as degraded; fail at invocation with clear error about missing tool |
| Inter-step LLM returns invalid JSON       | Retry once with error feedback; if still invalid, fail step with reasoning error  |
| Pipeline exceeds cost limit mid-step      | Complete current step, then stop pipeline; return partial results                 |
| Pipeline exceeds duration limit           | Cancel current step (if possible), stop pipeline; return partial results          |
| Circular template reference               | Impossible by design (steps reference only previous steps)                        |
| Empty pipeline (no steps)                 | Prevent invocation; return validation error                                       |
| All steps skipped by conditions           | Complete pipeline with empty output; log warning                                  |

---

## 8. Security Considerations

- Pipelines inherit tenant isolation from underlying tools
- Template expressions are evaluated server-side with sandboxed property access (no arbitrary code execution)
- Inter-step reasoning LLM calls use environment-variable API keys (not tenant-stored)
- Per-step credentials are loaded at invocation time from existing credential vault
- Cost limits prevent runaway spending on LLM reasoning
- Pipeline execution logs are sanitized (no credentials in logged state)
- Export endpoints require valid Waygate API key

---

## 9. Future Enhancements (Out of Scope)

- **Parallel step execution** — Fork-join patterns for independent steps (V2)
- **Dynamic step generation** — LLM decides what steps to add at runtime (V2)
- **Human-in-the-loop** — Approval gates that pause pipeline for human input (V2)
- **Looping/iteration** — Repeat steps with different inputs (e.g., for-each over a list) (V2)
- **Pipeline versioning** — Track versions, rollback to previous (V2)
- **Webhook triggers** — Start pipelines from external events (V2.2)
- **Nested pipelines** — Pipelines that contain other pipelines
- **Streaming progress** — Real-time WebSocket updates during execution (V2)
- **Pipeline templates** — Pre-built pipeline patterns for common workflows (V2)

---

## 10. Example Usage

### Example 1: Intelligent CRM Tool

The DoubleO playbook's CRM Tool pattern — where a user gives a general instruction and the tool internally handles search, triage, and operation selection.

**Pipeline Configuration:**

- Name: "CRM Tool"
- Input Schema: `{ task: string }` (natural language instruction)
- Safety Limits: $1 max cost, 5 min timeout

**Steps:**

| #   | Name              | Tool                       | Tool Type | Input Mapping                                                                                                                                     | Reasoning                                                                                                                                                                                                                                       |
| --- | ----------------- | -------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Search Records    | hubspot/search             | simple    | `query: {{input.task}}`                                                                                                                           | "Analyze the search results. Identify which record(s) are most relevant to the user's task. Return JSON: { relevantRecords: [{ id, name, type, matchReason }], suggestedOperation: 'read' \| 'update' \| 'create', operationDetails: { ... } }" |
| 2   | Triage & Plan     | (no tool — reasoning only) | —         | —                                                                                                                                                 | "Given the relevant records and suggested operation, build the exact API call parameters. Return JSON: { operation, recordIds: [...], updateFields: { ... } }"                                                                                  |
| 3   | Execute Operation | hubspot/batch-operation    | simple    | `operation: {{steps.triage.reasoning.operation}}, records: {{steps.triage.reasoning.recordIds}}, fields: {{steps.triage.reasoning.updateFields}}` | (none — final step)                                                                                                                                                                                                                             |

**Invocation:**

```typescript
const result = await fetch('/api/v1/pipelines/invoke', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${WAYGATE_API_KEY}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    pipeline: 'crm-tool',
    params: {
      task: 'Update all Acme Corp deals to Negotiation stage and add note about Dec 1 meeting',
    },
  }),
});

// Response follows ToolSuccessResponse format (see Simple Tool Export)
{
  success: true,
  message: "## Updated 3 Acme Corp deals to Negotiation stage:\n\n- Deal #123: \"Acme Corp Q4 Renewal\" → Negotiation\n- Deal #456: \"Acme Corp Expansion\" → Negotiation\n- Deal #789: \"Acme Corp Add-On\" → Negotiation\n\nAdded note to all 3: \"Demo scheduled Dec 1, 2024\"\n\n## In your response:\n- Confirm the updates were made, listing the deal names and new stage.\n- If this was part of a larger task, proceed with the next step.",
  data: {
    updatedDeals: [
      { id: "123", name: "Acme Corp Q4 Renewal", newStage: "negotiation" },
      { id: "456", name: "Acme Corp Expansion", newStage: "negotiation" },
      { id: "789", name: "Acme Corp Add-On", newStage: "negotiation" }
    ],
    notesAdded: 3
  },
  meta: {
    pipeline: "crm-tool",
    executionId: "exec_abc123",
    totalSteps: 3,
    completedSteps: 3,
    totalCostUsd: 0.04,
    totalTokens: 2180,
    durationMs: 4200,
    steps: [
      { name: "Search Records", status: "completed", durationMs: 1200, costUsd: 0.00 },
      { name: "Triage & Plan", status: "completed", durationMs: 800, costUsd: 0.02 },
      { name: "Execute Operation", status: "completed", durationMs: 1800, costUsd: 0.02 }
    ]
  },
  context: { resolvedInputs: {} },
  nextSteps: "## In your response:\n- Confirm that 3 deals were updated to Negotiation stage.\n- If asked about specific deals, provide the deal names and IDs.\n- If this was part of a more complex request, proceed as instructed by the user."
}
```

### Example 2: Research Tool

A tool that takes a research problem, generates a structured research plan, executes it, and returns a synthesized report.

**Pipeline Configuration:**

- Name: "Research Tool"
- Input Schema: `{ topic: string, depth: 'quick' | 'thorough' }`
- Safety Limits: $3 max cost, 15 min timeout

**Steps:**

| #   | Name             | Tool                       | Tool Type | Input Mapping                                                                                | Reasoning                                                                                                                                                                                             |
| --- | ---------------- | -------------------------- | --------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Plan Research    | (no tool — reasoning only) | —         | —                                                                                            | "Given the research topic '{{input.topic}}' and depth '{{input.depth}}', create a structured research plan. Return JSON: { queries: [{ source: 'web'\|'news', query: string }], maxSources: number }" |
| 2   | Execute Research | smart-research             | composite | `queries: {{steps.plan.reasoning.queries}}, maxSources: {{steps.plan.reasoning.maxSources}}` | "Synthesize the research results into a structured report. Return JSON: { summary: string, keyFindings: [...], sources: [...], confidence: 'high'\|'medium'\|'low' }"                                 |

**What happens internally:**

1. Step 1 has **no tool invocation** — it's reasoning-only. The LLM interprets the user's research topic and outputs a structured research plan as JSON (which sources to query, what to look for).
2. The research plan JSON triggers Step 2's **server-side** tool execution — a composite tool that runs the actual searches and scrapes.
3. Step 2's reasoning LLM triages all the raw research results and produces a clean, synthesized report.

The parent agent receives one clean output: a structured research report.

### Example 3: Invoice Processing Pipeline (Upload → Process → Store)

**Pipeline:** "Invoice Processor"
**Input:** `{ invoiceFile: string }` (file URL)

| #   | Name            | Tool          | Tool Type    | Input Mapping                                                                                                                                                                        | Reasoning                                                                                      |
| --- | --------------- | ------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| 1   | Extract Invoice | ocr-extractor | simple       | `file: {{input.invoiceFile}}, query: "Extract: invoice number, date, customer name, amount, line items"`                                                                             | "Structure the extracted data into JSON: { invoiceNumber, customer, amount, lineItems, date }" |
| 2   | Update CRM      | crm-tool      | **pipeline** | `task: "Find {{steps.extract.reasoning.customer}} company record. Create a deal for invoice {{steps.extract.reasoning.invoiceNumber}}, amount ${{steps.extract.reasoning.amount}}."` | (none — final step)                                                                            |

This demonstrates **tool composition** — the Invoice Processor pipeline uses the CRM Tool pipeline (Example 1) as a step, showing how pipelines can be nested as tools within other pipelines.

### Common Workflow Patterns

These patterns from the DoubleO playbook map directly to pipeline tool templates:

| Pattern                         | Internal Steps                                                                          | Example Tool                       |
| ------------------------------- | --------------------------------------------------------------------------------------- | ---------------------------------- |
| **Search → Triage → Act**       | 1. Search for records, 2. LLM triages to find relevant ones, 3. Execute operation       | CRM Tool, Project Management Tool  |
| **Plan → Execute → Synthesize** | 1. LLM creates structured plan, 2. Execute plan server-side, 3. LLM synthesizes results | Research Tool, Analysis Tool       |
| **Upload → Process → Store**    | 1. Process uploaded file, 2. Extract structured data, 3. Store in CRM/DB                | Invoice Processor, Document Intake |

These patterns serve as starting points when creating pipeline tools. Each can be assembled from existing simple, composite, and agentic tools in the Waygate tool catalog.

### Pipeline Exported as Tool

When exported as a Universal tool, the entire pipeline is presented as a **single tool** — the parent agent has no idea there are internal steps:

```json
{
  "name": "crm_tool",
  "description": "Use this tool to perform CRM operations including searching, reading, creating, and updating records in the user's connected CRM (HubSpot/Salesforce).\n\n# Required inputs (always include these):\n- task: Natural language description of what CRM operation to perform. Be specific about company names, deal stages, record types, and any notes to add. Example: \"Find all Acme Corp deals and update them to Negotiation stage\".\n\n# What the tool is going to output:\nReturns a summary of actions taken including: records found, operations performed (created/updated/read), and relevant record IDs. If records were read, includes the record details.",
  "parameters": {
    "type": "object",
    "properties": {
      "task": {
        "type": "string",
        "description": "Natural language description of the CRM operation to perform."
      }
    },
    "required": ["task"]
  }
}
```

---

## 11. Dependencies

**Uses Existing Infrastructure:**

- **Simple Tool Export patterns** (critical dependency):
  - `tool-export/descriptions/description-builder.ts` — mini-prompt format for `toolDescription` generation
  - `tool-export/responses/success-formatter.ts` / `error-formatter.ts` — `ToolSuccessResponse`/`ToolErrorResponse` format with `message`, `data`, `meta`, `context`, `nextSteps`/`remediation`
  - `tool-export/formats/` — transformer interface for Universal, LangChain, MCP export formats
  - `tool-export/handlers/context-resolver.ts` — reference data context resolution forwarded through pipeline steps
  - Aggregated export endpoints (`/api/v1/tools/export/*`) — pipelines included alongside all other tool types
- Unified tool abstraction (tool selection in step builder)
- Composite tool invocation handler (for composite tool steps)
- Agentic tool invocation handler (for agentic tool steps)
- Gateway action handler (for simple tool steps)
- LLM client infrastructure (for inter-step reasoning)
- API authentication middleware
- Cost tracking utilities from agentic tools

**New Dependencies:**

- None (uses existing stack)

---

## 12. Success Metrics

| Metric                          | Target                | Measurement                   |
| ------------------------------- | --------------------- | ----------------------------- |
| Pipelines created per tenant    | 2+ within first month | Database query                |
| Pipeline execution success rate | > 90%                 | Completed vs total executions |
| Average steps per pipeline      | 3-5                   | Database query                |
| Average pipeline cost           | < $0.50               | Cost tracking logs            |
| Time to create pipeline         | < 15 minutes          | User testing                  |
