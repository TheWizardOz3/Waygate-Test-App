/**
 * Unified Tool Types
 *
 * Type definitions for the unified tool abstraction layer.
 * Enables composite and agentic tools to wrap any tool type (simple, composite, or agentic).
 */

// =============================================================================
// Tool Types
// =============================================================================

/**
 * Type discriminator for different tool sources
 */
export type ToolType = 'simple' | 'composite' | 'agentic' | 'pipeline';

/**
 * Unified tool representation that can represent any tool type.
 * Used by wizards to select tools regardless of their underlying implementation.
 */
export interface UnifiedTool {
  /** Unique identifier - format varies by type (actionId, compositeToolId, agenticToolId) */
  id: string;

  /** Type discriminator */
  type: ToolType;

  /** Human-readable name */
  name: string;

  /** URL-safe identifier */
  slug: string;

  /**
   * AI-optimized description for LLM consumption.
   * For simple tools: Uses Action.toolDescription (LLM-generated) or falls back to Action.description
   * For composite/agentic tools: Uses their toolDescription field
   */
  description: string;

  /** Integration context - only for simple tools */
  integrationId?: string;
  integrationName?: string;
  integrationSlug?: string;

  /**
   * Tool's input schema (may be enhanced with AI instructions).
   * For simple tools: Derived from Action.inputSchema with flattening
   * For composite tools: The unifiedInputSchema
   * For agentic tools: The inputSchema (user-facing)
   */
  inputSchema: Record<string, unknown>;

  /** Tool's output schema if available */
  outputSchema?: Record<string, unknown>;

  /**
   * For simple tools only - references the underlying action
   */
  actionId?: string;
  actionSlug?: string;

  /**
   * For composite tools only - references child operation IDs
   */
  childOperationIds?: string[];

  /**
   * For agentic tools only - execution mode
   */
  executionMode?: 'parameter_interpreter' | 'autonomous_agent';

  /**
   * For pipeline tools only - number of steps
   */
  stepCount?: number;

  /** Tool status */
  status: 'active' | 'draft' | 'disabled';

  /** Whether any referenced actions no longer exist (e.g. integration was deleted) */
  hasInvalidActions?: boolean;

  /** Creation timestamp */
  createdAt: string;

  /** Last update timestamp */
  updatedAt: string;
}

/**
 * Simplified tool reference for storage in composite/agentic tools.
 * Stored in database, not the full UnifiedTool object.
 */
export interface ToolReference {
  /** Tool's unique identifier */
  toolId: string;

  /** Tool type for routing to correct service */
  toolType: ToolType;

  /** Cached slug for display/routing */
  toolSlug: string;
}

/**
 * Extended metadata for wizard use during tool selection.
 * Contains additional information needed for UI and prompt generation.
 */
export interface SelectedToolMeta {
  /** Tool ID */
  toolId: string;

  /** Tool type */
  toolType: ToolType;

  /** Tool name for display */
  toolName: string;

  /** Tool slug */
  toolSlug: string;

  /** Integration info (simple tools only) */
  integrationId?: string;
  integrationName?: string;

  /** AI-optimized description */
  description: string;

  /** Input schema for routing rules/prompt generation */
  inputSchema?: Record<string, unknown>;

  /** Output schema */
  outputSchema?: Record<string, unknown>;
}

// =============================================================================
// Filter Types
// =============================================================================

/**
 * Filters for querying unified tools
 */
export interface UnifiedToolFilters {
  /** Filter by tool types */
  types?: ToolType[];

  /** Filter by integration (simple tools only) */
  integrationId?: string;

  /** Search query for name/description */
  search?: string;

  /** Filter by status */
  status?: ('active' | 'draft' | 'disabled')[];

  /** Exclude specific tool IDs (e.g., prevent circular references) */
  excludeIds?: string[];
}

// =============================================================================
// Pagination Types
// =============================================================================

export interface UnifiedToolPagination {
  cursor?: string;
  limit: number;
}

export interface PaginatedUnifiedTools {
  tools: UnifiedTool[];
  pagination: {
    cursor: string | null;
    hasMore: boolean;
    totalCount: number;
  };
}
