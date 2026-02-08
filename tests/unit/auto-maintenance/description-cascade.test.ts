/**
 * Description Cascade Unit Tests
 *
 * Tests for the description suggestion generator that identifies affected tools
 * and generates description update suggestions. All external dependencies (Prisma,
 * tool description generators) are mocked.
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

// Mock Prisma
vi.mock('@/lib/db/client', () => ({
  default: {
    action: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    compositeToolOperation: {
      findMany: vi.fn(),
    },
    compositeTool: {
      update: vi.fn(),
    },
    agenticTool: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    maintenanceProposal: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

// Mock tool description generators
vi.mock('@/lib/modules/tool-export/descriptions/tool-description-generator', () => ({
  regenerateToolDescriptions: vi.fn(),
}));

vi.mock('@/lib/modules/composite-tools/export/composite-tool-description-generator', () => ({
  generateCompositeToolDescriptions: vi.fn(),
  loadOperationActionData: vi.fn(),
}));

import prisma from '@/lib/db/client';
import {
  generateDescriptionSuggestions,
  applyDescriptionSuggestion,
  applyDescriptionDecisions,
} from '@/lib/modules/auto-maintenance/description-cascade';
import { regenerateToolDescriptions } from '@/lib/modules/tool-export/descriptions/tool-description-generator';
import {
  generateCompositeToolDescriptions,
  loadOperationActionData,
} from '@/lib/modules/composite-tools/export/composite-tool-description-generator';
import type { DescriptionSuggestion } from '@/lib/modules/auto-maintenance/auto-maintenance.schemas';

const mockPrisma = prisma as unknown as {
  action: { findUnique: Mock; update: Mock };
  compositeToolOperation: { findMany: Mock };
  compositeTool: { update: Mock };
  agenticTool: { findMany: Mock; findUnique: Mock; update: Mock };
  maintenanceProposal: { findUnique: Mock; update: Mock };
};

const UUID_ACTION = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
const UUID_COMPOSITE = 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e';
const UUID_AGENTIC = 'c3d4e5f6-a7b8-4c9d-ae1f-2a3b4c5d6e7f';
const UUID_TENANT = 'd4e5f6a7-b8c9-4d0e-9f2a-3b4c5d6e7f8a';
const UUID_PROPOSAL = 'e5f6a7b8-c9d0-4e1f-a2b3-4c5d6e7f8a9b';

beforeEach(() => {
  vi.clearAllMocks();
});

// =============================================================================
// generateDescriptionSuggestions Tests
// =============================================================================

describe('generateDescriptionSuggestions', () => {
  it('should generate action-level suggestion when description changes', async () => {
    mockPrisma.action.findUnique.mockResolvedValue({
      id: UUID_ACTION,
      name: 'Get User',
      toolDescription: 'Old description',
      toolSuccessTemplate: 'success',
      toolErrorTemplate: 'error',
    });
    (regenerateToolDescriptions as Mock).mockResolvedValue({
      toolDescription: 'New description',
      toolSuccessTemplate: 'success',
      toolErrorTemplate: 'error',
    });
    mockPrisma.action.update.mockResolvedValue({});
    mockPrisma.compositeToolOperation.findMany.mockResolvedValue([]);
    mockPrisma.agenticTool.findMany.mockResolvedValue([]);

    const suggestions = await generateDescriptionSuggestions(UUID_ACTION, UUID_TENANT);

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].toolType).toBe('action');
    expect(suggestions[0].toolId).toBe(UUID_ACTION);
    expect(suggestions[0].currentDescription).toBe('Old description');
    expect(suggestions[0].suggestedDescription).toBe('New description');
    expect(suggestions[0].status).toBe('pending');
  });

  it('should not generate action-level suggestion when description unchanged', async () => {
    mockPrisma.action.findUnique.mockResolvedValue({
      id: UUID_ACTION,
      name: 'Get User',
      toolDescription: 'Same description',
      toolSuccessTemplate: 'success',
      toolErrorTemplate: 'error',
    });
    (regenerateToolDescriptions as Mock).mockResolvedValue({
      toolDescription: 'Same description',
      toolSuccessTemplate: 'success',
      toolErrorTemplate: 'error',
    });
    mockPrisma.action.update.mockResolvedValue({});
    mockPrisma.compositeToolOperation.findMany.mockResolvedValue([]);
    mockPrisma.agenticTool.findMany.mockResolvedValue([]);

    const suggestions = await generateDescriptionSuggestions(UUID_ACTION, UUID_TENANT);
    expect(suggestions).toHaveLength(0);
  });

  it('should restore original action description after dry-run regeneration', async () => {
    const originalDesc = 'Original description';
    mockPrisma.action.findUnique.mockResolvedValue({
      id: UUID_ACTION,
      name: 'Get User',
      toolDescription: originalDesc,
      toolSuccessTemplate: 'orig_success',
      toolErrorTemplate: 'orig_error',
    });
    (regenerateToolDescriptions as Mock).mockResolvedValue({
      toolDescription: 'New description',
      toolSuccessTemplate: 'new_success',
      toolErrorTemplate: 'new_error',
    });
    mockPrisma.action.update.mockResolvedValue({});
    mockPrisma.compositeToolOperation.findMany.mockResolvedValue([]);
    mockPrisma.agenticTool.findMany.mockResolvedValue([]);

    await generateDescriptionSuggestions(UUID_ACTION, UUID_TENANT);

    // Should restore original values
    expect(mockPrisma.action.update).toHaveBeenCalledWith({
      where: { id: UUID_ACTION },
      data: {
        toolDescription: originalDesc,
        toolSuccessTemplate: 'orig_success',
        toolErrorTemplate: 'orig_error',
      },
    });
  });

  it('should generate composite tool suggestions', async () => {
    // Action-level: no change
    mockPrisma.action.findUnique.mockResolvedValue({
      id: UUID_ACTION,
      name: 'Get User',
      toolDescription: 'Same',
      toolSuccessTemplate: 'success',
      toolErrorTemplate: 'error',
    });
    (regenerateToolDescriptions as Mock).mockResolvedValue({
      toolDescription: 'Same',
      toolSuccessTemplate: 'success',
      toolErrorTemplate: 'error',
    });
    mockPrisma.action.update.mockResolvedValue({});

    // Composite tool: has changed description
    mockPrisma.compositeToolOperation.findMany.mockResolvedValue([
      {
        compositeTool: {
          id: UUID_COMPOSITE,
          name: 'User Manager',
          slug: 'user-manager',
          description: 'Manages users',
          routingMode: 'rule_based',
          unifiedInputSchema: {},
          defaultOperationId: null,
          toolDescription: 'Old composite desc',
          operations: [
            {
              id: 'op1',
              operationSlug: 'get-user',
              displayName: 'Get User',
              actionId: UUID_ACTION,
            },
          ],
          routingRules: [],
        },
      },
    ]);
    (loadOperationActionData as Mock).mockResolvedValue([
      { operationSlug: 'get-user', actionName: 'Get User', actionDescription: 'Gets a user' },
    ]);
    (generateCompositeToolDescriptions as Mock).mockResolvedValue({
      toolDescription: 'New composite desc',
    });

    mockPrisma.agenticTool.findMany.mockResolvedValue([]);

    const suggestions = await generateDescriptionSuggestions(UUID_ACTION, UUID_TENANT);

    const compositeSuggestion = suggestions.find((s) => s.toolType === 'composite');
    expect(compositeSuggestion).toBeDefined();
    expect(compositeSuggestion!.toolId).toBe(UUID_COMPOSITE);
    expect(compositeSuggestion!.currentDescription).toBe('Old composite desc');
    expect(compositeSuggestion!.suggestedDescription).toBe('New composite desc');
  });

  it('should generate agentic tool suggestions for autonomous_agent mode', async () => {
    // Action-level: skip
    mockPrisma.action.findUnique.mockResolvedValue({
      id: UUID_ACTION,
      name: 'Get User',
      toolDescription: 'Updated action description',
      toolSuccessTemplate: 'success',
      toolErrorTemplate: 'error',
    });
    (regenerateToolDescriptions as Mock).mockResolvedValue({
      toolDescription: 'Updated action description',
    });
    mockPrisma.action.update.mockResolvedValue({});
    mockPrisma.compositeToolOperation.findMany.mockResolvedValue([]);

    // Agentic tool with autonomous_agent mode referencing this action
    mockPrisma.agenticTool.findMany.mockResolvedValue([
      {
        id: UUID_AGENTIC,
        name: 'User Agent',
        toolAllocation: {
          mode: 'autonomous_agent',
          availableTools: [
            {
              actionId: UUID_ACTION,
              actionSlug: 'get-user',
              description: 'Old agentic description',
            },
          ],
        },
      },
    ]);

    const suggestions = await generateDescriptionSuggestions(UUID_ACTION, UUID_TENANT);

    const agenticSuggestion = suggestions.find((s) => s.toolType === 'agentic');
    expect(agenticSuggestion).toBeDefined();
    expect(agenticSuggestion!.toolId).toBe(UUID_AGENTIC);
    expect(agenticSuggestion!.currentDescription).toBe('Old agentic description');
    expect(agenticSuggestion!.suggestedDescription).toBe('Updated action description');
  });

  it('should not generate agentic suggestion for parameter_interpreter mode', async () => {
    mockPrisma.action.findUnique.mockResolvedValue({
      id: UUID_ACTION,
      name: 'Get User',
      toolDescription: 'Same',
      toolSuccessTemplate: 'success',
      toolErrorTemplate: 'error',
    });
    (regenerateToolDescriptions as Mock).mockResolvedValue({
      toolDescription: 'Same',
    });
    mockPrisma.action.update.mockResolvedValue({});
    mockPrisma.compositeToolOperation.findMany.mockResolvedValue([]);

    mockPrisma.agenticTool.findMany.mockResolvedValue([
      {
        id: UUID_AGENTIC,
        name: 'Param Agent',
        toolAllocation: {
          mode: 'parameter_interpreter',
          targetActions: [{ actionId: UUID_ACTION, actionSlug: 'get-user' }],
        },
      },
    ]);

    const suggestions = await generateDescriptionSuggestions(UUID_ACTION, UUID_TENANT);
    const agenticSuggestion = suggestions.find((s) => s.toolType === 'agentic');
    expect(agenticSuggestion).toBeUndefined();
  });

  it('should handle regeneration failure gracefully', async () => {
    mockPrisma.action.findUnique.mockResolvedValue({
      id: UUID_ACTION,
      name: 'Get User',
      toolDescription: 'Old',
      toolSuccessTemplate: 'success',
      toolErrorTemplate: 'error',
    });
    (regenerateToolDescriptions as Mock).mockRejectedValue(new Error('AI service down'));
    mockPrisma.compositeToolOperation.findMany.mockResolvedValue([]);
    mockPrisma.agenticTool.findMany.mockResolvedValue([]);

    // Should not throw — errors are caught and logged
    const suggestions = await generateDescriptionSuggestions(UUID_ACTION, UUID_TENANT);
    expect(suggestions).toHaveLength(0);
  });

  it('should return empty array when action not found', async () => {
    mockPrisma.action.findUnique.mockResolvedValue(null);
    mockPrisma.compositeToolOperation.findMany.mockResolvedValue([]);
    mockPrisma.agenticTool.findMany.mockResolvedValue([]);

    const suggestions = await generateDescriptionSuggestions(UUID_ACTION, UUID_TENANT);
    expect(suggestions).toHaveLength(0);
  });

  it('should deduplicate composite tools appearing in multiple operations', async () => {
    mockPrisma.action.findUnique.mockResolvedValue({
      id: UUID_ACTION,
      name: 'Get User',
      toolDescription: 'Same',
      toolSuccessTemplate: 's',
      toolErrorTemplate: 'e',
    });
    (regenerateToolDescriptions as Mock).mockResolvedValue({ toolDescription: 'Same' });
    mockPrisma.action.update.mockResolvedValue({});

    // Same composite tool referenced twice
    mockPrisma.compositeToolOperation.findMany.mockResolvedValue([
      {
        compositeTool: {
          id: UUID_COMPOSITE,
          name: 'Tool',
          slug: 'tool',
          description: 'desc',
          routingMode: 'rule_based',
          unifiedInputSchema: {},
          defaultOperationId: null,
          toolDescription: 'Old',
          operations: [],
          routingRules: [],
        },
      },
      {
        compositeTool: {
          id: UUID_COMPOSITE,
          name: 'Tool',
          slug: 'tool',
          description: 'desc',
          routingMode: 'rule_based',
          unifiedInputSchema: {},
          defaultOperationId: null,
          toolDescription: 'Old',
          operations: [],
          routingRules: [],
        },
      },
    ]);
    (loadOperationActionData as Mock).mockResolvedValue([]);
    (generateCompositeToolDescriptions as Mock).mockResolvedValue({
      toolDescription: 'New',
    });
    mockPrisma.agenticTool.findMany.mockResolvedValue([]);

    const suggestions = await generateDescriptionSuggestions(UUID_ACTION, UUID_TENANT);
    const compositeCount = suggestions.filter((s) => s.toolType === 'composite').length;
    expect(compositeCount).toBe(1);
  });
});

// =============================================================================
// applyDescriptionSuggestion Tests
// =============================================================================

describe('applyDescriptionSuggestion', () => {
  it('should update action toolDescription', async () => {
    mockPrisma.action.update.mockResolvedValue({});
    const suggestion: DescriptionSuggestion = {
      toolType: 'action',
      toolId: UUID_ACTION,
      toolName: 'Get User',
      currentDescription: 'Old',
      suggestedDescription: 'New',
      status: 'pending',
    };

    await applyDescriptionSuggestion(suggestion);

    expect(mockPrisma.action.update).toHaveBeenCalledWith({
      where: { id: UUID_ACTION },
      data: { toolDescription: 'New' },
    });
  });

  it('should update composite tool toolDescription', async () => {
    mockPrisma.compositeTool.update.mockResolvedValue({});
    const suggestion: DescriptionSuggestion = {
      toolType: 'composite',
      toolId: UUID_COMPOSITE,
      toolName: 'User Manager',
      currentDescription: 'Old',
      suggestedDescription: 'New',
      status: 'pending',
    };

    await applyDescriptionSuggestion(suggestion);

    expect(mockPrisma.compositeTool.update).toHaveBeenCalledWith({
      where: { id: UUID_COMPOSITE },
      data: { toolDescription: 'New' },
    });
  });

  it('should update agentic tool availableTools description', async () => {
    mockPrisma.agenticTool.findUnique.mockResolvedValue({
      toolAllocation: {
        mode: 'autonomous_agent',
        availableTools: [
          { actionId: UUID_ACTION, actionSlug: 'get-user', description: 'Old agentic' },
          { actionId: 'other-id', actionSlug: 'other-action', description: 'Unchanged' },
        ],
      },
    });
    mockPrisma.agenticTool.update.mockResolvedValue({});

    const suggestion: DescriptionSuggestion = {
      toolType: 'agentic',
      toolId: UUID_AGENTIC,
      toolName: 'User Agent',
      currentDescription: 'Old agentic',
      suggestedDescription: 'New agentic',
      status: 'pending',
    };

    await applyDescriptionSuggestion(suggestion);

    expect(mockPrisma.agenticTool.update).toHaveBeenCalledWith({
      where: { id: UUID_AGENTIC },
      data: {
        toolAllocation: {
          mode: 'autonomous_agent',
          availableTools: [
            { actionId: UUID_ACTION, actionSlug: 'get-user', description: 'New agentic' },
            { actionId: 'other-id', actionSlug: 'other-action', description: 'Unchanged' },
          ],
        },
      },
    });
  });

  it('should handle missing agentic tool gracefully', async () => {
    mockPrisma.agenticTool.findUnique.mockResolvedValue(null);

    const suggestion: DescriptionSuggestion = {
      toolType: 'agentic',
      toolId: UUID_AGENTIC,
      toolName: 'Agent',
      currentDescription: 'Old',
      suggestedDescription: 'New',
      status: 'pending',
    };

    // Should not throw
    await expect(applyDescriptionSuggestion(suggestion)).resolves.toBeUndefined();
    expect(mockPrisma.agenticTool.update).not.toHaveBeenCalled();
  });
});

// =============================================================================
// applyDescriptionDecisions Tests
// =============================================================================

describe('applyDescriptionDecisions', () => {
  it('should apply accepted and skip rejected decisions', async () => {
    const suggestions: DescriptionSuggestion[] = [
      {
        toolType: 'action',
        toolId: UUID_ACTION,
        toolName: 'Get User',
        currentDescription: 'Old',
        suggestedDescription: 'New',
        status: 'pending',
      },
      {
        toolType: 'composite',
        toolId: UUID_COMPOSITE,
        toolName: 'User Manager',
        currentDescription: 'Old',
        suggestedDescription: 'New',
        status: 'pending',
      },
    ];

    mockPrisma.maintenanceProposal.findUnique.mockResolvedValue({
      descriptionSuggestions: suggestions,
    });
    mockPrisma.action.update.mockResolvedValue({});
    mockPrisma.maintenanceProposal.update.mockResolvedValue({});

    const result = await applyDescriptionDecisions(UUID_PROPOSAL, [
      { toolId: UUID_ACTION, accept: true },
      { toolId: UUID_COMPOSITE, accept: false },
    ]);

    expect(result[0].status).toBe('accepted');
    expect(result[1].status).toBe('skipped');

    // Action description should have been updated
    expect(mockPrisma.action.update).toHaveBeenCalledWith({
      where: { id: UUID_ACTION },
      data: { toolDescription: 'New' },
    });
  });

  it('should return empty array when proposal has no suggestions', async () => {
    mockPrisma.maintenanceProposal.findUnique.mockResolvedValue({
      descriptionSuggestions: null,
    });

    const result = await applyDescriptionDecisions(UUID_PROPOSAL, []);
    expect(result).toEqual([]);
  });

  it('should ignore decisions for unknown toolIds', async () => {
    const suggestions: DescriptionSuggestion[] = [
      {
        toolType: 'action',
        toolId: UUID_ACTION,
        toolName: 'Get User',
        currentDescription: 'Old',
        suggestedDescription: 'New',
        status: 'pending',
      },
    ];

    mockPrisma.maintenanceProposal.findUnique.mockResolvedValue({
      descriptionSuggestions: suggestions,
    });
    mockPrisma.maintenanceProposal.update.mockResolvedValue({});

    const result = await applyDescriptionDecisions(UUID_PROPOSAL, [
      { toolId: 'unknown-id', accept: true },
    ]);

    // Original suggestion should remain pending since the decision was for an unknown ID
    expect(result[0].status).toBe('pending');
  });

  it('should handle apply failure gracefully (keep as pending)', async () => {
    const suggestions: DescriptionSuggestion[] = [
      {
        toolType: 'action',
        toolId: UUID_ACTION,
        toolName: 'Get User',
        currentDescription: 'Old',
        suggestedDescription: 'New',
        status: 'pending',
      },
    ];

    mockPrisma.maintenanceProposal.findUnique.mockResolvedValue({
      descriptionSuggestions: suggestions,
    });
    mockPrisma.action.update.mockRejectedValue(new Error('DB error'));
    mockPrisma.maintenanceProposal.update.mockResolvedValue({});

    const result = await applyDescriptionDecisions(UUID_PROPOSAL, [
      { toolId: UUID_ACTION, accept: true },
    ]);

    // Should remain pending on failure
    expect(result[0].status).toBe('pending');
  });
});
