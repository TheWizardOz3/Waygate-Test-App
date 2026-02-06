# Feature: Simple Tool Export

**Milestone:** V1.1 (AI Tool Foundations)
**Status:** Complete
**Dependencies:** Actions (MVP), Reference Data Sync
**Priority:** P0

---

## Implementation Summary

Implemented a complete tool export system enabling Waygate actions to be consumed by AI agents across all major LLM platforms.

**Key Components:**

- **Universal Transformer**: Exports actions in LLM-agnostic format with flattened JSON Schema (no $ref, oneOf, anyOf) compatible with OpenAI, Anthropic, and Gemini
- **LangChain Transformer**: Generates LangChain-compatible tool definitions with Python-ready code
- **MCP Transformer**: Generates Model Context Protocol server definitions for Claude Desktop
- **Description Builder**: Creates LLM-optimized mini-prompt descriptions for each tool (template-based fallback)
- **AI Description Generator**: Generates high-quality tool descriptions using LLM at action creation time (stored in DB)
- **Context Resolver**: Resolves human-friendly names (#general, @sarah) to IDs using injected reference data
- **Response Formatters**: Generates agent-readable success/error messages with follow-on instructions

**Database Fields (Action model):**

- `toolDescription`: LLM-generated mini-prompt description stored with each action
- `toolSuccessTemplate`: Custom success response template for the action
- `toolErrorTemplate`: Custom error response template for the action

**API Endpoints:**

Per-Integration Export:

- `GET /api/v1/integrations/:id/tools/universal` - Universal format export
- `GET /api/v1/integrations/:id/tools/langchain` - LangChain format export
- `GET /api/v1/integrations/:id/tools/mcp` - MCP format export

Aggregated Export (All Tools):

- `GET /api/v1/tools/export/universal` - Export all tools (simple, composite, agentic) in universal format
- `GET /api/v1/tools/export/langchain` - Export all tools in LangChain format
- `GET /api/v1/tools/export/mcp` - Export all tools in MCP format

Tool Operations:

- `POST /api/v1/tools/invoke` - Tool invocation with context injection
- `POST /api/v1/integrations/:id/actions/:actionId/regenerate-tool-descriptions` - Regenerate AI descriptions for an action

**UI:**

- AI Tools page with tabbed interface:
  - "Tools" tab: List and manage all tools (simple, composite, agentic)
  - "Export" tab: Export all tools with format selection (Universal, LangChain, MCP)
    - Tool summary cards showing count by type (simple, composite, agentic)
    - Format selection cards with format-specific export options
    - Copy/download functionality for all formats
    - Code snippets for LangChain (TypeScript/Python)
    - MCP server files with Claude Desktop config
- Combined "AI Tools" tab on Integration detail page (merged Export Tools + LLM Response):
  - Tool Definitions section with format tabs (Universal, LangChain, MCP)
  - Available Tools summary showing tool names with parameter counts (link to action editor for customization)
  - Response Formatting section for preamble template configuration
  - Response Format Examples showing success/error structure
- Copy-to-clipboard and download functionality for all formats
- Live preview of tool definitions with text wrapping (no horizontal scroll)
- Dedicated "AI Tools" tab in Action editor (separate from Settings tab):
  - **Tool Description Section**: View/edit LLM-optimized mini-prompt description
  - **Success/Error Templates**: Configurable response templates with clickable variable badges
  - **Generate with AI**: Button to regenerate descriptions using LLM
  - **Reference Data Sync Section**: Configure data caching for AI context
    - Data Category: Label for the type of data (users, channels, etc.)
    - Response Path: JSONPath to extract array from API response
    - ID/Name Field mapping
    - Sync Frequency in days (not seconds)
    - Additional fields with tag-based input
  - Status badges showing "Configured" vs "Using defaults"
  - Cleaner layout following the notifications settings pattern (no nested boxes)

---

## Overview

Simple Tool Export enables developers to export Waygate actions as AI-consumable tool definitions compatible with all major LLM platforms (OpenAI, Anthropic, Gemini) and tool frameworks (LangChain, MCP). This transforms Waygate from an integration gateway into an AI tool factory, allowing LLM agents to discover and invoke actions through standardized tool interfaces.

### Why This Matters

AI agents need structured tool definitions to understand what actions they can take. Currently, developers must manually:

1. Read Waygate action schemas and translate them to LLM-specific formats
2. Handle argument format differences between LLMs (Gemini vs OpenAI vs Anthropic)
3. Write wrapper functions that call the Waygate Gateway API
4. Create agent-readable success/error response formatting
5. Maintain synchronization as actions evolve

Simple Tool Export automates all of this: export any Waygate action as a ready-to-use AI tool with proper typing, LLM-optimized descriptions, context injection, and agent-readable response handling.

---

## User Stories

**As an AI application developer**, I want to export my Waygate actions as tools that work with any LLM (Gemini, OpenAI, Anthropic), so that I'm not locked into one provider.

**As an MCP server builder**, I want to generate MCP-compatible tool definitions from my Waygate integrations, so that Claude Desktop and other MCP clients can use my integrations directly.

**As a developer**, I want tools to include injectable context (reference data, user info, connection settings), so that AI agents can resolve human-friendly names to IDs without extra API calls.

**As an AI agent**, I want tool responses to include structured success/error messages with follow-on instructions, so that I know exactly what happened and what to do next.

---

## Requirements

### Functional Requirements

| ID    | Requirement                                                                | Priority | Notes                                                 |
| ----- | -------------------------------------------------------------------------- | -------- | ----------------------------------------------------- |
| FR-1  | Export tools in LLM-agnostic format (works with Gemini, OpenAI, Anthropic) | MUST     | Different LLMs have different argument expectations   |
| FR-2  | Export actions as LangChain-compatible tool schemas                        | MUST     | Core feature                                          |
| FR-3  | Export actions as MCP-compatible tool definitions                          | MUST     | Core feature                                          |
| FR-4  | Generate LLM-optimized descriptions (mini-prompts)                         | MUST     | Following playbook format                             |
| FR-5  | Support context injection for reference data                               | MUST     | Similar to current_user injection pattern             |
| FR-6  | Include structured success messages in responses                           | MUST     | Agent-readable with metadata + follow-on instructions |
| FR-7  | Include structured error messages with remediation                         | MUST     | Agent-readable with what happened + how to fix        |
| FR-8  | Map JSON Schema input parameters to tool parameters                        | MUST     | Preserve types, constraints, descriptions             |
| FR-9  | Generate invocation handlers that call Gateway API                         | MUST     | Ready-to-use, not just schemas                        |
| FR-10 | Support bulk export of all actions for an integration                      | SHOULD   | Export entire integration as tool collection          |
| FR-11 | Provide TypeScript type definitions for tools                              | SHOULD   | Better DX for TypeScript users                        |

### Non-Functional Requirements

| Requirement | Target                                     | Measurement           |
| ----------- | ------------------------------------------ | --------------------- |
| Performance | Tool export < 500ms for 50 actions         | API latency metrics   |
| Size        | Individual tool definition < 10KB          | Response size         |
| Caching     | Tool definitions cacheable for 5 minutes   | Cache-Control headers |
| Security    | No credential exposure in tool definitions | Security audit        |

### Acceptance Criteria

- [ ] **Given** a Slack integration, **when** exported for Gemini, **then** the tools work without argument format errors
- [ ] **Given** a Slack integration, **when** exported for OpenAI function calling, **then** the tools work without modification
- [ ] **Given** a tool invocation, **when** successful, **then** the response includes action metadata, content, and follow-on instructions
- [ ] **Given** a tool invocation, **when** failed, **then** the response includes what happened, why, and remediation steps
- [ ] **Given** an action with reference data configured, **when** invoked, **then** reference data is injected as context
- [ ] **Given** exported MCP tools, **when** used in Claude Desktop, **then** the tools work without modification

### Out of Scope

- Composite tools (chaining multiple actions) - deferred to V1.5
- Intelligent/agentic tools (embedded LLMs inside tools) - deferred to V1.5
- Custom tool naming/aliasing
- Tool versioning and pinning
- Webhook-triggered tools

---

## Technical Design

### LLM Compatibility Strategy

Different LLMs have different expectations for tool arguments. Our export format must work across all major LLMs:

| LLM       | Argument Format                          | Key Considerations                          |
| --------- | ---------------------------------------- | ------------------------------------------- |
| OpenAI    | JSON Schema with `properties`            | Standard JSON Schema                        |
| Anthropic | JSON Schema with `properties`            | Prefers explicit `description` on each prop |
| Gemini    | Simplified schema, dislikes `$ref`       | Must flatten all references, no `oneOf`     |
| LangChain | Zod-like schema converted to JSON Schema | Works with all above formats                |

**Strategy:** Export a "universal" format that's the intersection of what all LLMs accept:

- Flat JSON Schema (no `$ref`, no `oneOf/anyOf`)
- Explicit `description` on every property
- Explicit `type` on every property (no type inference)
- All optional fields marked with `required: []` properly
- Enums as `enum: [...]` not as `const`

```typescript
// Universal tool schema format
interface UniversalToolSchema {
  name: string; // snake_case, e.g., "slack_send_message"
  description: string; // LLM-optimized mini-prompt
  parameters: {
    type: 'object';
    properties: Record<
      string,
      {
        type: string; // Explicit type for each prop
        description: string; // Required description for each prop
        enum?: string[]; // For constrained values
        default?: unknown; // Default value if any
      }
    >;
    required: string[];
  };
}
```

### Tool Description Format (Mini-Prompts)

Following the playbook pattern, tool descriptions are treated as mini-prompts. Every tool description follows this structure:

```
Use this tool to {what the tool does in actionable terms}.

# Required inputs:
- {input_name}: {description with type, constraints, defaults}

# Optional inputs (include when {condition}):
- {input_name}: {description with when to include/exclude}

# What the tool outputs:
{Description of output format and key fields}
```

**Example: Slack Send Message Tool Description:**

```
Use this tool to send a message to a Slack channel or user.

# Required inputs:
- channel: The Slack channel ID (starts with 'C') or user ID (starts with 'U'). Use reference data to resolve channel names like "#general" to IDs.
- text: The message content. Supports Slack mrkdwn formatting. Keep concise and professional.

# Optional inputs (include for richer messages):
- blocks: Slack Block Kit blocks for rich formatting. Only use if you need buttons, images, or structured layouts.
- thread_ts: Parent message timestamp to reply in a thread. Include to keep conversations organized.

# What the tool outputs:
Returns the sent message details including channel, timestamp (ts), and message content. Use the timestamp if you need to reply to or update this message.
```

### Context Injection System

Reference data and other context are **injected at invocation time**, not embedded in tool definitions. This follows the playbook's context injection pattern.

#### How It Works

1. **Tool Export:** Tool definitions declare what context they can accept
2. **Runtime:** Consuming app provides context when invoking tools
3. **Gateway:** Waygate injects context into the request before execution

```typescript
// Tool definition includes context declarations
interface ToolDefinition {
  name: string;
  description: string;
  parameters: JSONSchema;
  contextTypes?: string[];  // What context this tool can use
  // e.g., ["users", "channels", "current_connection"]
}

// At invocation time, context is provided via headers
// X-Waygate-Context-Users: [{id: "U123", name: "sarah"}, ...]
// X-Waygate-Context-Channels: [{id: "C456", name: "general"}, ...]

// Or via a context object in the request body
{
  params: { channel: "#general", text: "Hello!" },
  context: {
    users: [...],      // Injected reference data
    channels: [...],   // Injected reference data
    connection: {...}  // Current connection info
  }
}
```

#### Context Resolution at Invocation

When the Gateway receives a tool invocation with context:

1. **Name Resolution:** If `channel: "#general"`, Gateway looks up `general` in `context.channels` to get the ID
2. **Context Enrichment:** Gateway adds resolved IDs to the actual API request
3. **Response Enrichment:** Response includes resolved context for agent visibility

```typescript
// Gateway request pipeline with context resolution
async function invokeToolWithContext(
  action: Action,
  params: Record<string, unknown>,
  context: ToolContext
): Promise<ToolResponse> {
  // Resolve human-friendly names to IDs using injected context
  const resolvedParams = resolveContextReferences(params, context);

  // Execute the actual API call
  const result = await executeAction(action, resolvedParams);

  // Build agent-readable response
  return formatToolResponse(action, params, resolvedParams, result, context);
}
```

### Agent-Readable Response Format

**Every tool response includes structured success/error messages** following the playbook format. This makes responses actionable for AI agents.

#### Success Response Format

```typescript
interface ToolSuccessResponse {
  success: true;
  message: string; // Human/agent-readable summary
  data: unknown; // The actual response data
  meta: {
    action: string; // What action was performed
    integration: string; // Which integration
    requestId: string; // For debugging
    latencyMs: number; // Execution time
  };
  context: {
    // Resolved context for visibility
    resolvedInputs: Record<string, { original: string; resolved: string }>;
  };
  nextSteps: string; // Follow-on instructions for the agent
}
```

**Example Success Response:**

```json
{
  "success": true,
  "message": "## Sent message to #general:\n\n\"Hello team! Meeting at 3pm.\"\n\nMessage ID: 1234567890.123456",
  "data": {
    "ok": true,
    "channel": "C0123456789",
    "ts": "1234567890.123456",
    "message": {
      "text": "Hello team! Meeting at 3pm.",
      "user": "U9876543210"
    }
  },
  "meta": {
    "action": "slack_send_message",
    "integration": "slack",
    "requestId": "req_abc123",
    "latencyMs": 234
  },
  "context": {
    "resolvedInputs": {
      "channel": { "original": "#general", "resolved": "C0123456789" }
    }
  },
  "nextSteps": "## In your response:\n- If asked to send a message, confirm it was sent with the channel and content.\n- If this was part of a larger task, proceed with the next step.\n- The message timestamp (ts: 1234567890.123456) can be used to reply in a thread or update the message."
}
```

#### Error Response Format

```typescript
interface ToolErrorResponse {
  success: false;
  message: string; // What went wrong
  error: {
    code: string; // Error code
    details: unknown; // Specific error details
  };
  meta: {
    action: string;
    integration: string;
    requestId: string;
  };
  context: {
    attemptedInputs: Record<string, unknown>;
  };
  remediation: string; // How to fix and what to do next
}
```

**Example Error Response:**

```json
{
  "success": false,
  "message": "## Failed to send message to #nonexistent:\n\nChannel not found. The channel '#nonexistent' does not exist or the bot is not a member.",
  "error": {
    "code": "CHANNEL_NOT_FOUND",
    "details": {
      "channelName": "#nonexistent",
      "suggestion": "Use slack_list_channels to find valid channel names"
    }
  },
  "meta": {
    "action": "slack_send_message",
    "integration": "slack",
    "requestId": "req_def456"
  },
  "context": {
    "attemptedInputs": {
      "channel": "#nonexistent",
      "text": "Hello!"
    }
  },
  "remediation": "## How to fix:\n1. Verify the channel name is correct (channel names are case-sensitive)\n2. Use the slack_list_channels tool to see available channels\n3. Ensure the Slack bot has been added to the channel\n\nIf you have already retried with a different channel and are still encountering this error, skip this step and proceed to your next task."
}
```

### Module Structure

```
src/lib/modules/tool-export/
├── index.ts                        # Module exports
├── tool-export.service.ts          # Business logic
├── tool-export.schemas.ts          # Zod schemas
├── formats/
│   ├── universal.transformer.ts    # LLM-agnostic format
│   ├── langchain.transformer.ts    # LangChain-specific adjustments
│   └── mcp.transformer.ts          # MCP-specific format
├── descriptions/
│   ├── description-builder.ts      # Mini-prompt generation (template-based fallback)
│   ├── templates.ts                # Description templates
│   └── tool-description-generator.ts  # LLM-powered description generation
├── responses/
│   ├── success-formatter.ts        # Success message builder
│   ├── error-formatter.ts          # Error message builder
│   └── response.schemas.ts         # Response Zod schemas
└── handlers/
    ├── context-resolver.ts         # Reference data context resolution
    ├── invocation-handler.ts       # Generate callable handlers
    └── typescript-codegen.ts       # TypeScript SDK generation
```

### LLM-Generated Tool Descriptions

Tool descriptions can be generated using an LLM at action creation time for higher quality, contextually-aware descriptions. This provides:

- **Better parameter guidance**: Instructions on what values to pass, not just type information
- **Action-specific success/error templates**: Based on the actual output schema
- **Stored in database**: Generated once, used at export time for fast, consistent results

```typescript
// Generate descriptions at action creation time
import { generateToolDescriptions } from '@/lib/modules/tool-export/descriptions';

const descriptions = await generateToolDescriptions({
  actionName: 'Send Message',
  actionSlug: 'send-message',
  actionDescription: 'Sends a message to a channel or user',
  httpMethod: 'POST',
  endpointTemplate: '/chat.postMessage',
  inputSchema: { ... },
  outputSchema: { ... },
  integrationName: 'Slack',
  integrationSlug: 'slack',
  contextTypes: ['channels', 'users'],
});

// Store with the action
await prisma.action.update({
  where: { id: actionId },
  data: {
    toolDescription: descriptions.toolDescription,
    toolSuccessTemplate: descriptions.toolSuccessTemplate,
    toolErrorTemplate: descriptions.toolErrorTemplate,
  },
});
```

When exporting tools, stored descriptions are used when available, with fallback to template-based generation.

### API Endpoints

**Per-Integration Export:**

| Method | Endpoint                                      | Purpose                         |
| ------ | --------------------------------------------- | ------------------------------- |
| GET    | `/api/v1/integrations/:id/tools`              | List all actions as tools       |
| GET    | `/api/v1/integrations/:id/tools/universal`    | Export in LLM-agnostic format   |
| GET    | `/api/v1/integrations/:id/tools/langchain`    | Export as LangChain tools       |
| GET    | `/api/v1/integrations/:id/tools/mcp`          | Export as MCP server definition |
| GET    | `/api/v1/integrations/:id/actions/:slug/tool` | Export single action as tool    |

**Aggregated Export (All Tools):**

| Method | Endpoint                         | Purpose                                            |
| ------ | -------------------------------- | -------------------------------------------------- |
| GET    | `/api/v1/tools/export/universal` | Export all tools (simple, composite, agentic)      |
| GET    | `/api/v1/tools/export/langchain` | Export all tools in LangChain format with snippets |
| GET    | `/api/v1/tools/export/mcp`       | Export all tools as MCP server definition          |

**Tool Operations:**

| Method | Endpoint               | Purpose                            |
| ------ | ---------------------- | ---------------------------------- |
| POST   | `/api/v1/tools/invoke` | Invoke tool with context injection |

---

## Implementation Tasks

### Phase 1: Core Module & Universal Format (~2-3 hours)

| #   | Task                                                     | Estimate |
| --- | -------------------------------------------------------- | -------- |
| 1.1 | Create tool-export module structure                      | 15 min   |
| 1.2 | Define Zod schemas for universal tool format             | 30 min   |
| 1.3 | Implement universal.transformer.ts (LLM-agnostic export) | 45 min   |
| 1.4 | Handle JSON Schema flattening (no $ref, oneOf, anyOf)    | 30 min   |
| 1.5 | Add explicit type/description to all properties          | 30 min   |

### Phase 2: LLM-Optimized Descriptions (~1-2 hours)

| #   | Task                                                       | Estimate |
| --- | ---------------------------------------------------------- | -------- |
| 2.1 | Implement description-builder.ts with mini-prompt format   | 45 min   |
| 2.2 | Create templates for common action types (CRUD, messaging) | 30 min   |
| 2.3 | Add context type declarations to descriptions              | 30 min   |

### Phase 3: Context Injection System (~2-3 hours)

| #   | Task                                                 | Estimate |
| --- | ---------------------------------------------------- | -------- |
| 3.1 | Implement context-resolver.ts for name→ID resolution | 45 min   |
| 3.2 | Add context headers support to Gateway API           | 30 min   |
| 3.3 | Implement context injection in request pipeline      | 45 min   |
| 3.4 | Add context types to tool definitions                | 30 min   |

### Phase 4: Agent-Readable Responses (~2-3 hours)

| #   | Task                                                      | Estimate |
| --- | --------------------------------------------------------- | -------- |
| 4.1 | Implement success-formatter.ts with metadata + next steps | 45 min   |
| 4.2 | Implement error-formatter.ts with remediation guidance    | 45 min   |
| 4.3 | Define response Zod schemas                               | 30 min   |
| 4.4 | Integrate formatters into Gateway response pipeline       | 30 min   |

### Phase 5: Export Formats (LangChain + MCP) (~1-2 hours)

| #   | Task                                                     | Estimate |
| --- | -------------------------------------------------------- | -------- |
| 5.1 | Implement langchain.transformer.ts                       | 30 min   |
| 5.2 | Implement mcp.transformer.ts with resources for ref data | 45 min   |
| 5.3 | Add MCP server file generation                           | 30 min   |

### Phase 6: API Endpoints (~1-2 hours)

| #   | Task                                                  | Estimate |
| --- | ----------------------------------------------------- | -------- |
| 6.1 | Create GET /integrations/:id/tools/universal endpoint | 30 min   |
| 6.2 | Create GET /integrations/:id/tools/langchain endpoint | 20 min   |
| 6.3 | Create GET /integrations/:id/tools/mcp endpoint       | 20 min   |
| 6.4 | Create POST /tools/invoke endpoint with context       | 30 min   |

### Phase 7: UI Integration (~1 hour)

| #   | Task                                                  | Estimate |
| --- | ----------------------------------------------------- | -------- |
| 7.1 | Add "Export Tools" section to Integration detail page | 30 min   |
| 7.2 | Add copy-to-clipboard for tool definitions            | 15 min   |
| 7.3 | Add download buttons for SDK/server files             | 15 min   |

---

## Test Plan

### Unit Tests

- JSON Schema flattening (remove $ref, oneOf, anyOf)
- Universal format compatibility (test against OpenAI, Anthropic, Gemini validators)
- Description builder mini-prompt generation
- Context resolver name→ID resolution
- Success/error message formatting

### Integration Tests

- Full export flow: integration → actions → tools
- Context injection in request pipeline
- Agent-readable response formatting
- API endpoints return valid tool definitions

### E2E Tests

- Export Slack integration as universal tools
- Use tools with OpenAI function calling
- Use tools with Anthropic tool use
- Use tools with Gemini function calling
- Export as MCP server and validate with Claude Desktop

---

## Edge Cases & Error Handling

| Scenario                     | Handling                                              |
| ---------------------------- | ----------------------------------------------------- |
| Action has no input schema   | Return tool with empty parameters object              |
| Action has `$ref` in schema  | Resolve and inline the referenced schema              |
| Action has `oneOf`/`anyOf`   | Flatten to single object with all possible properties |
| Action description is empty  | Generate description from action name + schema        |
| Context resolution fails     | Include original value + warning in response          |
| Reference data not available | Proceed without resolution, note in response          |
| Very long descriptions       | Truncate at 1000 chars with ellipsis                  |

---

## Security Considerations

- Tool definitions never include credentials or API keys
- Context data is provided by consuming app (not stored in tool definition)
- Reference data included is non-sensitive (names/IDs only)
- Export endpoints require valid Waygate API key authentication
- MCP server definitions don't embed secrets

---

## Future Enhancements (Out of Scope for V1.1)

- Composite tools (chain multiple actions) - V1.5
- Intelligent/agentic tools (embedded LLMs) - V1.5
- Tool versioning and pinning
- Custom tool naming/aliases
- Tool usage analytics
- Automatic context resolution without explicit injection

---

## Dependencies

**Uses Existing Infrastructure:**

- Action service (schema retrieval)
- Integration service (integration metadata)
- Reference data service (context data source)
- Gateway API (invocation target + response formatting)
- API authentication middleware

**New Dependencies:**

- None (uses existing stack)

---

## Example Usage

### Universal Tool with Context Injection

```typescript
// 1. Export tools from Waygate
const toolsResponse = await fetch(
  'https://app.waygate.dev/api/v1/integrations/slack/tools/universal',
  { headers: { Authorization: `Bearer ${WAYGATE_API_KEY}` } }
);
const { tools, contextTypes } = await toolsResponse.json();
// contextTypes: ["users", "channels"]

// 2. Fetch reference data to inject
const refDataResponse = await fetch(
  'https://app.waygate.dev/api/v1/integrations/slack/reference-data',
  { headers: { Authorization: `Bearer ${WAYGATE_API_KEY}` } }
);
const referenceData = await refDataResponse.json();

// 3. Invoke tool with context injection
const result = await fetch('https://app.waygate.dev/api/v1/tools/invoke', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${WAYGATE_API_KEY}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    tool: 'slack_send_message',
    params: {
      channel: '#general', // Human-friendly name
      text: 'Hello team!',
    },
    context: {
      channels: referenceData.channels, // Injected for resolution
      users: referenceData.users,
    },
  }),
});

// 4. Agent-readable response
console.log(result);
// {
//   success: true,
//   message: "## Sent message to #general:\n\n\"Hello team!\"\n\n...",
//   data: { ... },
//   nextSteps: "## In your response:\n- Confirm the message was sent..."
// }
```

### LangChain Integration

```typescript
import { DynamicStructuredTool } from '@langchain/core/tools';

// Create tools with context-aware invocation
const langchainTools = tools.map(
  (tool) =>
    new DynamicStructuredTool({
      name: tool.name,
      description: tool.description,
      schema: tool.parameters,
      func: async (params) => {
        const response = await fetch('https://app.waygate.dev/api/v1/tools/invoke', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${WAYGATE_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            tool: tool.name,
            params,
            context: referenceData, // Pre-fetched reference data
          }),
        });
        const result = await response.json();

        // Return agent-readable message (includes next steps)
        return result.success
          ? `${result.message}\n\n${result.nextSteps}`
          : `${result.message}\n\n${result.remediation}`;
      },
    })
);
```

### MCP Server

```typescript
// Generated MCP server includes reference data as resources
import { Server } from '@modelcontextprotocol/sdk/server/index.js';

const server = new Server(
  {
    name: 'waygate-slack',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
      resources: {}, // Reference data exposed as resources
    },
  }
);

// Tools with agent-readable responses
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const result = await invokeWaygateAction(request.params.name, request.params.arguments, {
    context: await fetchReferenceData(),
  });

  // Return formatted message for Claude
  const text = result.success
    ? `${result.message}\n\n${result.nextSteps}`
    : `${result.message}\n\n${result.remediation}`;

  return { content: [{ type: 'text', text }] };
});
```
