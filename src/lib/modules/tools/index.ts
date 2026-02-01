/**
 * Unified Tools Module
 *
 * Exports for the unified tool abstraction layer.
 */

// Types
export type {
  ToolType,
  UnifiedTool,
  ToolReference,
  SelectedToolMeta,
  UnifiedToolFilters,
  UnifiedToolPagination,
  PaginatedUnifiedTools,
} from './unified-tool.types';

// Schemas
export {
  ToolTypeSchema,
  ToolStatusSchema,
  ListUnifiedToolsQuerySchema,
  UnifiedToolResponseSchema,
  ListUnifiedToolsResponseSchema,
  ToolReferenceSchema,
  SelectedToolMetaSchema,
  UnifiedToolErrorCodes,
} from './unified-tool.schemas';

export type {
  ToolType as ToolTypeEnum,
  ToolStatus,
  ListUnifiedToolsQuery,
  UnifiedToolResponse,
  ListUnifiedToolsResponse,
  SelectedToolMeta as SelectedToolMetaType,
} from './unified-tool.schemas';

// Service
export { listUnifiedTools, getUnifiedToolById } from './unified-tool.service';
