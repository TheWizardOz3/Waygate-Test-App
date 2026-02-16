/**
 * Agentic Tool Service
 *
 * Business logic layer for agentic tool management.
 * Handles CRUD operations with tenant verification and validation.
 *
 * All operations verify tenant ownership before accessing/modifying data.
 */

import { AgenticToolExecutionMode, AgenticToolStatus, Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/client';
import {
  createAgenticTool as repoCreateAgenticTool,
  findAgenticToolByIdAndTenant,
  findAgenticToolBySlug,
  findAgenticToolsPaginated,
  findAllAgenticToolsForTenant,
  isAgenticToolSlugTaken,
  updateAgenticTool as repoUpdateAgenticTool,
  updateAgenticToolStatus,
  deleteAgenticTool as repoDeleteAgenticTool,
  disableAgenticTool as repoDisableAgenticTool,
  getAgenticToolCountsByStatus,
  getAgenticToolExecutionStats,
  type CreateAgenticToolDbInput,
  type UpdateAgenticToolDbInput,
  type AgenticToolPaginationOptions,
} from './agentic-tool.repository';
import {
  CreateAgenticToolInputSchema,
  UpdateAgenticToolInputSchema,
  ListAgenticToolsQuerySchema,
  toAgenticToolResponse,
  AgenticToolErrorCodes,
  type CreateAgenticToolInput,
  type UpdateAgenticToolInput,
  type ListAgenticToolsQuery,
  type AgenticToolFilters,
  type AgenticToolResponse,
  type ListAgenticToolsResponse,
  type AgenticToolExecutionStats,
} from './agentic-tool.schemas';

import type { AgenticTool } from '@prisma/client';

// =============================================================================
// Error Class
// =============================================================================

/**
 * Error thrown when agentic tool operations fail
 */
export class AgenticToolError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number = 400
  ) {
    super(message);
    this.name = 'AgenticToolError';
  }
}

// =============================================================================
// Agentic Tool - Create Operations
// =============================================================================

/**
 * Creates a new agentic tool
 *
 * @param tenantId - The tenant creating the agentic tool
 * @param input - Agentic tool creation data
 * @returns The created agentic tool
 */
export async function createAgenticTool(
  tenantId: string,
  input: CreateAgenticToolInput
): Promise<AgenticToolResponse> {
  // Validate input
  const parsed = CreateAgenticToolInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new AgenticToolError(
      AgenticToolErrorCodes.INVALID_INPUT,
      `Invalid agentic tool data: ${parsed.error.message}`
    );
  }

  const data = parsed.data;

  // Check for slug collision
  const slugExists = await isAgenticToolSlugTaken(tenantId, data.slug);
  if (slugExists) {
    throw new AgenticToolError(
      AgenticToolErrorCodes.DUPLICATE_SLUG,
      `An agentic tool with slug '${data.slug}' already exists`
    );
  }

  // TODO: Validate action IDs in toolAllocation exist and belong to tenant
  // This will be implemented in later phases when we integrate with actions

  // Create the agentic tool
  const dbInput: CreateAgenticToolDbInput = {
    tenantId,
    name: data.name,
    slug: data.slug,
    description: data.description,
    executionMode: data.executionMode as AgenticToolExecutionMode,
    embeddedLLMConfig: data.embeddedLLMConfig as Prisma.InputJsonValue,
    systemPrompt: data.systemPrompt,
    toolAllocation: data.toolAllocation as Prisma.InputJsonValue,
    contextConfig: data.contextConfig as Prisma.InputJsonValue,
    inputSchema: data.inputSchema as Prisma.InputJsonValue,
    toolDescription: data.toolDescription,
    safetyLimits: data.safetyLimits as Prisma.InputJsonValue,
    status: data.status as AgenticToolStatus,
    metadata: data.metadata as Prisma.InputJsonValue,
  };

  const agenticTool = await repoCreateAgenticTool(dbInput);

  return toAgenticToolResponse(agenticTool);
}

// =============================================================================
// Agentic Tool - Read Operations
// =============================================================================

/**
 * Finds an agentic tool by ID with tenant verification
 *
 * @param id - Agentic tool ID
 * @param tenantId - Tenant ID for ownership verification
 * @returns The agentic tool
 */
export async function getAgenticToolById(
  id: string,
  tenantId: string
): Promise<AgenticToolResponse> {
  const agenticTool = await findAgenticToolByIdAndTenant(id, tenantId);

  if (!agenticTool) {
    throw new AgenticToolError(
      AgenticToolErrorCodes.AGENTIC_TOOL_NOT_FOUND,
      `Agentic tool '${id}' not found`,
      404
    );
  }

  const response = toAgenticToolResponse(agenticTool);

  // Check for invalid action references
  const hasInvalidActions = await checkForInvalidActions(agenticTool.toolAllocation);
  if (hasInvalidActions) {
    response.hasInvalidActions = true;
  }

  return response;
}

/**
 * Finds an agentic tool by slug with tenant verification
 *
 * @param slug - Agentic tool slug
 * @param tenantId - Tenant ID for ownership verification
 * @returns The agentic tool
 */
export async function getAgenticToolBySlug(
  slug: string,
  tenantId: string
): Promise<AgenticToolResponse> {
  const agenticTool = await findAgenticToolBySlug(tenantId, slug);

  if (!agenticTool) {
    throw new AgenticToolError(
      AgenticToolErrorCodes.AGENTIC_TOOL_NOT_FOUND,
      `Agentic tool with slug '${slug}' not found`,
      404
    );
  }

  return toAgenticToolResponse(agenticTool);
}

/**
 * Lists agentic tools with pagination and filters
 *
 * @param tenantId - Tenant ID
 * @param query - Query parameters
 * @returns Paginated list of agentic tools
 */
export async function listAgenticTools(
  tenantId: string,
  query: Partial<ListAgenticToolsQuery> = {}
): Promise<ListAgenticToolsResponse> {
  // Validate query
  const parsed = ListAgenticToolsQuerySchema.safeParse(query);
  if (!parsed.success) {
    throw new AgenticToolError(
      AgenticToolErrorCodes.INVALID_INPUT,
      `Invalid query parameters: ${parsed.error.message}`
    );
  }

  const { cursor, limit, status, executionMode, search } = parsed.data;

  const pagination: AgenticToolPaginationOptions = { cursor, limit };
  const filters: AgenticToolFilters = { status, executionMode, search };

  const result = await findAgenticToolsPaginated(tenantId, pagination, filters);

  return {
    agenticTools: result.agenticTools.map(toAgenticToolResponse),
    pagination: {
      cursor: result.nextCursor,
      hasMore: result.nextCursor !== null,
      totalCount: result.totalCount,
    },
  };
}

/**
 * Gets all agentic tools for a tenant (no pagination)
 *
 * @param tenantId - Tenant ID
 * @returns List of all agentic tools
 */
export async function getAllAgenticTools(tenantId: string): Promise<AgenticToolResponse[]> {
  const agenticTools = await findAllAgenticToolsForTenant(tenantId);
  return agenticTools.map(toAgenticToolResponse);
}

// =============================================================================
// Agentic Tool - Update Operations
// =============================================================================

/**
 * Updates an agentic tool
 *
 * @param id - Agentic tool ID
 * @param tenantId - Tenant ID for ownership verification
 * @param input - Update data
 * @returns The updated agentic tool
 */
export async function updateAgenticTool(
  id: string,
  tenantId: string,
  input: UpdateAgenticToolInput
): Promise<AgenticToolResponse> {
  // Validate input
  const parsed = UpdateAgenticToolInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new AgenticToolError(
      AgenticToolErrorCodes.INVALID_INPUT,
      `Invalid update data: ${parsed.error.message}`
    );
  }

  const data = parsed.data;

  // Verify tool exists and belongs to tenant
  const existing = await findAgenticToolByIdAndTenant(id, tenantId);
  if (!existing) {
    throw new AgenticToolError(
      AgenticToolErrorCodes.AGENTIC_TOOL_NOT_FOUND,
      `Agentic tool '${id}' not found`,
      404
    );
  }

  // Check for slug collision if slug is being changed
  if (data.slug && data.slug !== existing.slug) {
    const slugExists = await isAgenticToolSlugTaken(tenantId, data.slug, id);
    if (slugExists) {
      throw new AgenticToolError(
        AgenticToolErrorCodes.DUPLICATE_SLUG,
        `An agentic tool with slug '${data.slug}' already exists`
      );
    }
  }

  // Update the agentic tool
  const dbInput: UpdateAgenticToolDbInput = {
    name: data.name,
    slug: data.slug,
    description: data.description,
    executionMode: data.executionMode as AgenticToolExecutionMode | undefined,
    embeddedLLMConfig: data.embeddedLLMConfig as Prisma.InputJsonValue | undefined,
    systemPrompt: data.systemPrompt,
    toolAllocation: data.toolAllocation as Prisma.InputJsonValue | undefined,
    contextConfig: data.contextConfig as Prisma.InputJsonValue | undefined,
    inputSchema: data.inputSchema as Prisma.InputJsonValue | undefined,
    toolDescription: data.toolDescription,
    safetyLimits: data.safetyLimits as Prisma.InputJsonValue | undefined,
    status: data.status as AgenticToolStatus | undefined,
    metadata: data.metadata as Prisma.InputJsonValue | undefined,
  };

  const updated = await repoUpdateAgenticTool(id, dbInput);

  return toAgenticToolResponse(updated);
}

/**
 * Updates an agentic tool's status
 *
 * @param id - Agentic tool ID
 * @param tenantId - Tenant ID for ownership verification
 * @param status - New status
 * @returns The updated agentic tool
 */
export async function setAgenticToolStatus(
  id: string,
  tenantId: string,
  status: AgenticToolStatus
): Promise<AgenticToolResponse> {
  // Verify tool exists and belongs to tenant
  const existing = await findAgenticToolByIdAndTenant(id, tenantId);
  if (!existing) {
    throw new AgenticToolError(
      AgenticToolErrorCodes.AGENTIC_TOOL_NOT_FOUND,
      `Agentic tool '${id}' not found`,
      404
    );
  }

  const updated = await updateAgenticToolStatus(id, status);

  return toAgenticToolResponse(updated);
}

// =============================================================================
// Agentic Tool - Delete Operations
// =============================================================================

/**
 * Deletes an agentic tool
 *
 * @param id - Agentic tool ID
 * @param tenantId - Tenant ID for ownership verification
 */
export async function deleteAgenticTool(id: string, tenantId: string): Promise<void> {
  // Verify tool exists and belongs to tenant
  const existing = await findAgenticToolByIdAndTenant(id, tenantId);
  if (!existing) {
    throw new AgenticToolError(
      AgenticToolErrorCodes.AGENTIC_TOOL_NOT_FOUND,
      `Agentic tool '${id}' not found`,
      404
    );
  }

  await repoDeleteAgenticTool(id);
}

/**
 * Disables an agentic tool (soft delete)
 *
 * @param id - Agentic tool ID
 * @param tenantId - Tenant ID for ownership verification
 * @returns The disabled agentic tool
 */
export async function disableAgenticTool(
  id: string,
  tenantId: string
): Promise<AgenticToolResponse> {
  // Verify tool exists and belongs to tenant
  const existing = await findAgenticToolByIdAndTenant(id, tenantId);
  if (!existing) {
    throw new AgenticToolError(
      AgenticToolErrorCodes.AGENTIC_TOOL_NOT_FOUND,
      `Agentic tool '${id}' not found`,
      404
    );
  }

  const disabled = await repoDisableAgenticTool(id);

  return toAgenticToolResponse(disabled);
}

// =============================================================================
// Statistics
// =============================================================================

/**
 * Gets execution statistics for an agentic tool
 *
 * @param id - Agentic tool ID
 * @param tenantId - Tenant ID for ownership verification
 * @returns Execution statistics
 */
export async function getExecutionStats(
  id: string,
  tenantId: string
): Promise<AgenticToolExecutionStats> {
  // Verify tool exists and belongs to tenant
  const existing = await findAgenticToolByIdAndTenant(id, tenantId);
  if (!existing) {
    throw new AgenticToolError(
      AgenticToolErrorCodes.AGENTIC_TOOL_NOT_FOUND,
      `Agentic tool '${id}' not found`,
      404
    );
  }

  return getAgenticToolExecutionStats(id);
}

/**
 * Gets agentic tool counts by status for a tenant
 *
 * @param tenantId - Tenant ID
 * @returns Counts by status
 */
export async function getStatusCounts(
  tenantId: string
): Promise<Record<AgenticToolStatus, number>> {
  return getAgenticToolCountsByStatus(tenantId);
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Generates a slug from a name
 *
 * @param name - The tool name
 * @returns A URL-safe slug
 */
export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Validates that an agentic tool is active
 *
 * @param tool - The agentic tool
 */
export function validateAgenticToolActive(tool: AgenticTool): void {
  if (tool.status === AgenticToolStatus.disabled) {
    throw new AgenticToolError(
      AgenticToolErrorCodes.AGENTIC_TOOL_DISABLED,
      `Agentic tool '${tool.slug}' is disabled`,
      403
    );
  }
}

/**
 * Checks whether a tool allocation references any actions that no longer exist.
 */
async function checkForInvalidActions(toolAllocation: unknown): Promise<boolean> {
  const allocation = toolAllocation as {
    mode?: string;
    targetActions?: { actionId: string }[];
    availableTools?: { actionId: string }[];
  } | null;

  if (!allocation) return false;

  const actionIds =
    allocation.targetActions?.map((a) => a.actionId) ??
    allocation.availableTools?.map((a) => a.actionId) ??
    [];

  if (actionIds.length === 0) return false;

  const existingActions = await prisma.action.findMany({
    where: { id: { in: actionIds } },
    select: { id: true },
  });

  return existingActions.length < actionIds.length;
}
