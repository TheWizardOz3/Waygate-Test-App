/**
 * Batch Tool Variant Generator
 *
 * Generates batch UniversalTool variants for actions with batchEnabled: true.
 * The batch variant wraps the original tool's parameters in an items[] array
 * and adds optional config overrides.
 *
 * Generated at the UniversalTool level (post-transformation), same pattern
 * as the existing transformer chain.
 */

import type { Action } from '@prisma/client';

import type {
  UniversalTool,
  UniversalToolProperty,
} from '@/lib/modules/tool-export/tool-export.schemas';
import { BatchConfigSchema, type BatchConfig } from './batch-operations.schemas';

// =============================================================================
// Single Variant Generation
// =============================================================================

/**
 * Generate a batch variant of a UniversalTool for a batch-enabled action.
 * Returns null if the action does not have batchEnabled: true.
 */
export function generateBatchVariant(
  tool: UniversalTool,
  action: Pick<Action, 'batchEnabled' | 'batchConfig'>
): UniversalTool | null {
  if (!action.batchEnabled) return null;

  const batchConfig = parseBatchConfig(action.batchConfig);

  // Build config parameter
  const configProperty: UniversalToolProperty = {
    type: 'object',
    description: 'Optional configuration overrides for this batch operation',
    properties: {
      concurrency: {
        type: 'integer',
        description: `Number of parallel items to process (1-20, default ${batchConfig.defaultConcurrency})`,
      },
      delayMs: {
        type: 'integer',
        description: `Delay between items in milliseconds (0-5000, default ${batchConfig.defaultDelayMs})`,
      },
    },
  };

  // Build description
  const description =
    batchConfig.toolDescription ?? buildBatchDescription(tool.name, tool.description);

  return {
    name: `batch_${tool.name}`,
    description,
    parameters: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          description:
            'Array of items to process in batch. Each item contains the same parameters as the individual tool.',
          items: {
            type: 'object',
            description: 'A single batch item with input parameters',
          },
        },
        config: configProperty,
      },
      required: ['items'],
    },
    contextTypes: tool.contextTypes,
  };
}

// =============================================================================
// Bulk Variant Generation
// =============================================================================

/**
 * Generate batch variants for all batch-enabled actions.
 * Returns only the variants (caller concatenates with originals).
 *
 * @param tools - All simple action UniversalTools (already transformed)
 * @param actions - Corresponding Action records (same order/mapping by tool name)
 */
export function generateBatchVariants(
  tools: UniversalTool[],
  actions: Array<
    Pick<Action, 'batchEnabled' | 'batchConfig' | 'slug'> & { integration: { slug: string } }
  >
): UniversalTool[] {
  const variants: UniversalTool[] = [];

  // Build a lookup: tool name -> action
  const actionByToolName = new Map<string, (typeof actions)[number]>();
  for (const action of actions) {
    const toolName = `${action.integration.slug}_${action.slug}`.toLowerCase().replace(/-/g, '_');
    actionByToolName.set(toolName, action);
  }

  for (const tool of tools) {
    const action = actionByToolName.get(tool.name);
    if (!action) continue;

    const variant = generateBatchVariant(tool, action);
    if (variant) {
      variants.push(variant);
    }
  }

  return variants;
}

// =============================================================================
// Helpers
// =============================================================================

function parseBatchConfig(raw: unknown): BatchConfig {
  if (!raw || typeof raw !== 'object') {
    return { maxItems: 1000, defaultConcurrency: 5, defaultDelayMs: 0 };
  }
  const result = BatchConfigSchema.safeParse(raw);
  return result.success
    ? result.data
    : { maxItems: 1000, defaultConcurrency: 5, defaultDelayMs: 0 };
}

function buildBatchDescription(toolName: string, originalDescription: string): string {
  const readableName = toolName.replace(/_/g, ' ');
  return (
    `Batch version of ${readableName}. Submit multiple items for background processing. ` +
    `Use this instead of calling ${toolName} individually when processing more than ~5 items. ` +
    `Returns a job ID for progress tracking.\n\n` +
    `Original tool: ${originalDescription}`
  );
}
