/**
 * Description Suggestion Generator
 *
 * Generates *suggested* description updates for affected tools when an action's
 * schema changes. Does NOT auto-apply — stores suggestions for user review.
 *
 * On approval of a maintenance proposal, this module:
 * 1. Generates what the new toolDescription would be for the action itself
 * 2. Generates updated descriptions for composite tools that use the action
 * 3. Generates updated descriptions for agentic tools that reference the action
 * 4. Returns suggestions as DescriptionSuggestion[] for per-tool opt-in
 */

import prisma from '@/lib/db/client';
import { regenerateToolDescriptions } from '@/lib/modules/tool-export/descriptions/tool-description-generator';
import {
  generateCompositeToolDescriptions,
  loadOperationActionData,
} from '@/lib/modules/composite-tools/export/composite-tool-description-generator';
import type { DescriptionSuggestion } from './auto-maintenance.schemas';

// =============================================================================
// Types
// =============================================================================

interface ToolAllocationParameterInterpreter {
  mode: 'parameter_interpreter';
  targetActions: Array<{ actionId: string; actionSlug: string }>;
}

interface ToolAllocationAutonomousAgent {
  mode: 'autonomous_agent';
  availableTools: Array<{ actionId: string; actionSlug: string; description: string }>;
}

type ToolAllocation = ToolAllocationParameterInterpreter | ToolAllocationAutonomousAgent;

// =============================================================================
// Suggestion Generation
// =============================================================================

/**
 * Generate description suggestions for all tools affected by an action's schema change.
 * Returns suggestions without applying them — the user opts in per tool.
 *
 * Error handling: logs failures but never throws — schema update should succeed
 * even if description suggestion generation fails.
 */
export async function generateDescriptionSuggestions(
  actionId: string,
  tenantId: string
): Promise<DescriptionSuggestion[]> {
  const suggestions: DescriptionSuggestion[] = [];

  // 1. Action-level description suggestion
  try {
    const actionSuggestion = await generateActionDescriptionSuggestion(actionId);
    if (actionSuggestion) {
      suggestions.push(actionSuggestion);
    }
  } catch (error) {
    console.error(
      `[description-cascade] Failed to generate action description suggestion for ${actionId}:`,
      error
    );
  }

  // 2. Composite tool description suggestions
  try {
    const compositeSuggestions = await generateCompositeDescriptionSuggestions(actionId, tenantId);
    suggestions.push(...compositeSuggestions);
  } catch (error) {
    console.error(
      `[description-cascade] Failed to generate composite tool suggestions for action ${actionId}:`,
      error
    );
  }

  // 3. Agentic tool description suggestions
  try {
    const agenticSuggestions = await generateAgenticDescriptionSuggestions(actionId, tenantId);
    suggestions.push(...agenticSuggestions);
  } catch (error) {
    console.error(
      `[description-cascade] Failed to generate agentic tool suggestions for action ${actionId}:`,
      error
    );
  }

  return suggestions;
}

// =============================================================================
// Action-Level Description
// =============================================================================

/**
 * Generate what the action's new toolDescription would be after schema change.
 * Uses regenerateToolDescriptions then restores the originals so it's not auto-applied.
 */
async function generateActionDescriptionSuggestion(
  actionId: string
): Promise<DescriptionSuggestion | null> {
  const action = await prisma.action.findUnique({
    where: { id: actionId },
    select: {
      id: true,
      name: true,
      toolDescription: true,
      toolSuccessTemplate: true,
      toolErrorTemplate: true,
    },
  });
  if (!action) return null;

  const currentDescription = action.toolDescription;
  const currentSuccessTemplate = action.toolSuccessTemplate;
  const currentErrorTemplate = action.toolErrorTemplate;

  // Generate new descriptions — this writes to DB, so we restore afterward
  const generated = await regenerateToolDescriptions(actionId, prisma);
  if (!generated) return null;

  // Restore original values
  await prisma.action.update({
    where: { id: actionId },
    data: {
      toolDescription: currentDescription,
      toolSuccessTemplate: currentSuccessTemplate,
      toolErrorTemplate: currentErrorTemplate,
    },
  });

  // Only suggest if different
  if (generated.toolDescription === currentDescription) {
    return null;
  }

  return {
    toolType: 'action',
    toolId: action.id,
    toolName: action.name,
    currentDescription,
    suggestedDescription: generated.toolDescription,
    status: 'pending',
  };
}

// =============================================================================
// Composite Tool Descriptions
// =============================================================================

/**
 * Generate description suggestions for composite tools that use this action.
 */
async function generateCompositeDescriptionSuggestions(
  actionId: string,
  tenantId: string
): Promise<DescriptionSuggestion[]> {
  const suggestions: DescriptionSuggestion[] = [];

  // Find composite tools referencing this action
  const operations = await prisma.compositeToolOperation.findMany({
    where: {
      actionId,
      compositeTool: { tenantId },
    },
    include: {
      compositeTool: {
        include: {
          operations: true,
          routingRules: true,
        },
      },
    },
  });

  // Deduplicate by composite tool
  const seenTools = new Set<string>();

  for (const op of operations) {
    const tool = op.compositeTool;
    if (seenTools.has(tool.id)) continue;
    seenTools.add(tool.id);

    try {
      // Load operation action data for all operations of this composite tool
      const operationData = await loadOperationActionData(
        tool.operations.map((o) => ({
          id: o.id,
          operationSlug: o.operationSlug,
          displayName: o.displayName,
          actionId: o.actionId,
        }))
      );

      // Generate new descriptions
      const generated = await generateCompositeToolDescriptions({
        name: tool.name,
        slug: tool.slug,
        description: tool.description,
        routingMode: tool.routingMode as 'rule_based' | 'agent_driven',
        unifiedInputSchema: (tool.unifiedInputSchema as Record<string, unknown>) ?? {},
        operations: operationData,
        hasDefaultOperation: !!tool.defaultOperationId,
      });

      // Only suggest if different from current
      if (generated.toolDescription !== tool.toolDescription) {
        suggestions.push({
          toolType: 'composite',
          toolId: tool.id,
          toolName: tool.name,
          currentDescription: tool.toolDescription,
          suggestedDescription: generated.toolDescription,
          status: 'pending',
        });
      }
    } catch (error) {
      console.error(
        `[description-cascade] Failed to generate suggestion for composite tool ${tool.id}:`,
        error
      );
    }
  }

  return suggestions;
}

// =============================================================================
// Agentic Tool Descriptions
// =============================================================================

/**
 * Generate description suggestions for agentic tools that reference this action.
 * For autonomous_agent mode: suggests updated availableTools[].description entries.
 * For parameter_interpreter mode: no description to update (only actionId/slug).
 */
async function generateAgenticDescriptionSuggestions(
  actionId: string,
  tenantId: string
): Promise<DescriptionSuggestion[]> {
  const suggestions: DescriptionSuggestion[] = [];

  // Get the action's current (post-update) tool description to use as the suggested value
  const action = await prisma.action.findUnique({
    where: { id: actionId },
    select: { id: true, toolDescription: true },
  });
  if (!action?.toolDescription) return suggestions;

  // Find agentic tools for this tenant
  const agenticTools = await prisma.agenticTool.findMany({
    where: { tenantId },
    select: { id: true, name: true, toolAllocation: true },
  });

  for (const tool of agenticTools) {
    const allocation = tool.toolAllocation as unknown as ToolAllocation | null;
    if (!allocation) continue;

    // Only autonomous_agent mode has descriptions in availableTools
    if (allocation.mode === 'autonomous_agent') {
      const matchingTool = allocation.availableTools.find((t) => t.actionId === actionId);
      if (matchingTool) {
        const currentDesc = matchingTool.description;
        const suggestedDesc = action.toolDescription;

        if (currentDesc !== suggestedDesc) {
          suggestions.push({
            toolType: 'agentic',
            toolId: tool.id,
            toolName: tool.name,
            currentDescription: currentDesc,
            suggestedDescription: suggestedDesc,
            status: 'pending',
          });
        }
      }
    }

    // parameter_interpreter mode only has actionId/actionSlug — no description to update
    if (allocation.mode === 'parameter_interpreter') {
      const matchingAction = allocation.targetActions.find((t) => t.actionId === actionId);
      if (matchingAction) {
        // For parameter_interpreter tools, suggest updating the tool-level toolDescription
        // if it exists, since it may reference the action's capabilities
        const toolRecord = await prisma.agenticTool.findUnique({
          where: { id: tool.id },
          select: { toolDescription: true },
        });
        if (toolRecord?.toolDescription && action.toolDescription) {
          // Only suggest if the agentic tool has a tool description that might be stale
          // We don't regenerate it — just flag it as potentially affected
          // Skip for now; parameter_interpreter tools don't snapshot action descriptions
        }
      }
    }
  }

  return suggestions;
}

// =============================================================================
// Apply Suggestions
// =============================================================================

/**
 * Apply a single accepted description suggestion to the database.
 */
export async function applyDescriptionSuggestion(suggestion: DescriptionSuggestion): Promise<void> {
  switch (suggestion.toolType) {
    case 'action': {
      await prisma.action.update({
        where: { id: suggestion.toolId },
        data: { toolDescription: suggestion.suggestedDescription },
      });
      break;
    }

    case 'composite': {
      await prisma.compositeTool.update({
        where: { id: suggestion.toolId },
        data: { toolDescription: suggestion.suggestedDescription },
      });
      break;
    }

    case 'agentic': {
      // Update the availableTools[].description in the toolAllocation JSON
      const tool = await prisma.agenticTool.findUnique({
        where: { id: suggestion.toolId },
        select: { toolAllocation: true },
      });
      if (!tool?.toolAllocation) break;

      const allocation = tool.toolAllocation as unknown as ToolAllocation;
      if (allocation.mode === 'autonomous_agent') {
        const updated = {
          ...allocation,
          availableTools: allocation.availableTools.map((t) => {
            // Find by matching current description since we may have multiple actions
            if (t.description === suggestion.currentDescription) {
              return { ...t, description: suggestion.suggestedDescription };
            }
            return t;
          }),
        };

        await prisma.agenticTool.update({
          where: { id: suggestion.toolId },
          data: { toolAllocation: updated },
        });
      }
      break;
    }
  }
}

/**
 * Batch apply/skip description decisions from the UI.
 * Updates suggestion statuses on the proposal and applies accepted ones.
 */
export async function applyDescriptionDecisions(
  proposalId: string,
  decisions: Array<{ toolId: string; accept: boolean }>
): Promise<DescriptionSuggestion[]> {
  // Load current suggestions from the proposal
  const proposal = await prisma.maintenanceProposal.findUnique({
    where: { id: proposalId },
    select: { descriptionSuggestions: true },
  });
  if (!proposal?.descriptionSuggestions) return [];

  const suggestions = proposal.descriptionSuggestions as DescriptionSuggestion[];
  const decisionMap = new Map(decisions.map((d) => [d.toolId, d.accept]));

  // Apply decisions
  for (const suggestion of suggestions) {
    const accept = decisionMap.get(suggestion.toolId);
    if (accept === undefined) continue;

    if (accept) {
      try {
        await applyDescriptionSuggestion(suggestion);
        suggestion.status = 'accepted';
      } catch (error) {
        console.error(
          `[description-cascade] Failed to apply suggestion for ${suggestion.toolType} ${suggestion.toolId}:`,
          error
        );
        // Leave as pending on failure
      }
    } else {
      suggestion.status = 'skipped';
    }
  }

  // Update the proposal with new suggestion statuses
  await prisma.maintenanceProposal.update({
    where: { id: proposalId },
    data: { descriptionSuggestions: suggestions },
  });

  return suggestions;
}
