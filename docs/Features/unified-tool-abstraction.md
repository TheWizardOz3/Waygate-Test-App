# Unified Tool Abstraction Layer

## Overview

The Unified Tool Abstraction Layer provides a consistent interface for working with all tool types in Waygate. This enables composite and agentic tools to wrap any tool type (simple, composite, or agentic), supporting true tool composition.

## Architecture

### Tool Types

| Type          | Description                         | Source                         |
| ------------- | ----------------------------------- | ------------------------------ |
| **Simple**    | Individual API operations (Actions) | `Action` table via Integration |
| **Composite** | Multi-operation tools with routing  | `CompositeTool` table          |
| **Agentic**   | AI-driven tools with embedded LLM   | `AgenticTool` table            |

### Unified Tool Interface

```typescript
interface UnifiedTool {
  id: string;
  type: 'simple' | 'composite' | 'agentic';
  name: string;
  slug: string;
  description: string; // AI-optimized description
  integrationId?: string; // Simple tools only
  integrationName?: string; // Simple tools only
  inputSchema: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  actionId?: string; // Simple tools only
  childOperationIds?: string[]; // Composite tools only
  executionMode?: string; // Agentic tools only
  status: 'active' | 'draft' | 'disabled';
  createdAt: string;
  updatedAt: string;
}
```

## API Endpoint

### GET /api/v1/tools

Returns a unified list of all tools (simple, composite, agentic).

**Query Parameters:**

| Parameter       | Type   | Description                                                        |
| --------------- | ------ | ------------------------------------------------------------------ |
| `types`         | string | Comma-separated tool types to include (simple, composite, agentic) |
| `integrationId` | uuid   | Filter simple tools by integration                                 |
| `search`        | string | Search by name, description, or slug                               |
| `status`        | string | Comma-separated statuses (active, draft, disabled)                 |
| `excludeIds`    | string | Comma-separated tool IDs to exclude                                |
| `limit`         | number | Page size (default: 50, max: 100)                                  |
| `cursor`        | string | Pagination cursor                                                  |

**Example Response:**

```json
{
  "success": true,
  "data": {
    "tools": [
      {
        "id": "uuid-1",
        "type": "simple",
        "name": "Send Message",
        "slug": "send-message",
        "description": "Send a message to a Slack channel...",
        "integrationId": "uuid-int",
        "integrationName": "Slack",
        "inputSchema": { ... },
        "status": "active",
        "createdAt": "2024-01-01T00:00:00Z",
        "updatedAt": "2024-01-01T00:00:00Z"
      },
      {
        "id": "uuid-2",
        "type": "composite",
        "name": "Data Pipeline",
        "slug": "data-pipeline",
        "description": "Orchestrates multiple tools...",
        "inputSchema": { ... },
        "childOperationIds": ["op-1", "op-2"],
        "status": "active",
        "createdAt": "2024-01-01T00:00:00Z",
        "updatedAt": "2024-01-01T00:00:00Z"
      }
    ],
    "pagination": {
      "cursor": null,
      "hasMore": false,
      "totalCount": 2
    }
  }
}
```

## UI Components

### Tool Selection in Wizards

Both Composite Tool and Agentic Tool wizards now use the unified tools endpoint to select tools:

1. **Tool Type Tabs** - Filter by All Tools, Simple, Composite, or Agentic
2. **Integration Filter** - Filter simple tools by integration (when applicable)
3. **Search** - Search across all tool types
4. **Tool Type Indicators** - Visual badges showing tool type (Simple, Composite, Agentic)

### Tool Type Icons

| Type      | Icon   |
| --------- | ------ |
| Simple    | Wrench |
| Composite | Layers |
| Agentic   | Bot    |

## Store Changes

### CompositeToolWizard Store

The `SelectedOperation` interface now uses the unified tool abstraction:

```typescript
interface SelectedOperation {
  toolId: string; // Primary identifier
  toolType: ToolType; // 'simple' | 'composite' | 'agentic'
  toolName: string;
  toolSlug: string;
  integrationId?: string; // Simple tools only
  integrationName?: string;
  operationSlug: string; // Unique within composite tool
  displayName: string;
  priority: number;
  inputSchema?: unknown;
  description?: string; // AI-optimized
}
```

### AgenticToolWizard Store

The `SelectedToolMeta` interface provides tool metadata for prompt generation:

```typescript
interface SelectedToolMeta {
  toolId: string;
  toolType: ToolType;
  toolSlug: string;
  toolName: string;
  integrationId?: string;
  integrationName?: string;
  description: string; // AI-optimized
  inputSchema?: unknown;
  outputSchema?: unknown;
}
```

## AI-Optimized Descriptions

For simple tools, the system prefers `Action.toolDescription` (LLM-generated) over `Action.description` (basic API description). This provides better context for:

- System prompt generation in agentic tools
- Tool selection hints for autonomous agents
- User-facing descriptions in the UI

## Backwards Compatibility

The implementation maintains backwards compatibility:

1. **Legacy Fields** - `actionId`, `actionSlug`, `actionName` are still supported
2. **Dual Metadata Storage** - Both `selectedToolsMeta` and `selectedActionsMeta` are maintained
3. **Graceful Fallbacks** - Components check both new and legacy fields

## Future Considerations

### Database Schema Changes (Not Implemented)

Currently, `CompositeToolOperation.actionId` only references the `Action` table. To fully support tool composition (composite wrapping composite/agentic), the database schema would need to support polymorphic references.

Options for future implementation:

- Add `toolType` and `toolId` columns to `CompositeToolOperation`
- Create a separate `Tool` table with polymorphic associations
- Use a discriminated union pattern in the `toolAllocation` JSON field

### Circular Reference Prevention

When selecting tools for composition, the UI excludes:

- The current tool being edited (for composite tools)
- Already selected tools
- Tools that would create circular references (future enhancement)

## Files Modified

| File                                                                      | Purpose                 |
| ------------------------------------------------------------------------- | ----------------------- |
| `src/lib/modules/tools/unified-tool.types.ts`                             | TypeScript interfaces   |
| `src/lib/modules/tools/unified-tool.schemas.ts`                           | Zod validation schemas  |
| `src/lib/modules/tools/unified-tool.service.ts`                           | Aggregation service     |
| `src/app/api/v1/tools/route.ts`                                           | API endpoint            |
| `src/stores/compositeToolWizard.store.ts`                                 | Wizard state management |
| `src/stores/agenticToolWizard.store.ts`                                   | Wizard state management |
| `src/components/features/composite-tools/wizard/StepSelectOperations.tsx` | UI component            |
| `src/components/features/composite-tools/wizard/StepReview.tsx`           | UI component            |
| `src/components/features/agentic-tools/wizard/StepToolAllocation.tsx`     | UI component            |
| `src/components/features/agentic-tools/wizard/StepSystemPrompt.tsx`       | UI component            |
