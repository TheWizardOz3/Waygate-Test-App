/**
 * Composite Tool Description Generator
 *
 * Generates LLM-optimized tool descriptions for composite tools by aggregating
 * information from sub-operations. Uses the same mini-prompt format as simple tools.
 *
 * Key responsibilities:
 * - Aggregate toolDescription from each sub-operation's action
 * - Merge parameter documentation from all operations
 * - Generate unified description that covers all operations and routing behavior
 * - Generate success/error templates aggregated from operations
 */

import { getLLM } from '../../ai/llm/client';
import type { LLMResponseSchema } from '../../ai/llm/types';
import type {
  CompositeToolDetailResponse,
  CompositeToolRoutingMode,
} from '../composite-tool.schemas';
import { findActionByIdWithIntegration } from '../../actions/action.repository';

// =============================================================================
// Types
// =============================================================================

/**
 * Action data needed for description generation
 */
export interface OperationActionData {
  operationSlug: string;
  displayName: string;
  actionId: string;
  actionName: string;
  actionDescription: string | null;
  toolDescription: string | null;
  toolSuccessTemplate: string | null;
  toolErrorTemplate: string | null;
  integrationName: string;
  inputSchema: Record<string, unknown>;
  endpointTemplate: string | null;
  httpMethod: string | null;
  contextTypes: string[];
}

/**
 * Generated descriptions for a composite tool
 */
export interface GeneratedCompositeToolDescriptions {
  /** LLM-optimized mini-prompt description */
  toolDescription: string;
  /** Template for formatting successful responses */
  toolSuccessTemplate: string;
  /** Template for formatting error responses */
  toolErrorTemplate: string;
}

/**
 * Input for generating composite tool descriptions
 */
export interface CompositeToolDescriptionInput {
  /** Composite tool name */
  name: string;
  /** Composite tool slug */
  slug: string;
  /** User-provided description */
  description: string | null;
  /** Routing mode */
  routingMode: CompositeToolRoutingMode;
  /** Unified input schema */
  unifiedInputSchema: Record<string, unknown>;
  /** Operations with their action data */
  operations: OperationActionData[];
  /** Whether there's a default operation */
  hasDefaultOperation: boolean;
}

// =============================================================================
// Response Schema for LLM
// =============================================================================

const COMPOSITE_TOOL_DESCRIPTION_SCHEMA: LLMResponseSchema = {
  type: 'object',
  properties: {
    toolDescription: {
      type: 'string',
      description: 'LLM-optimized composite tool description in mini-prompt format',
      maxLength: 2500,
    },
    toolSuccessTemplate: {
      type: 'string',
      description: 'Template for formatting successful tool responses',
      maxLength: 1000,
    },
    toolErrorTemplate: {
      type: 'string',
      description: 'Template for formatting error responses',
      maxLength: 1000,
    },
  },
  required: ['toolDescription', 'toolSuccessTemplate', 'toolErrorTemplate'],
};

// =============================================================================
// Prompts
// =============================================================================

const SYSTEM_PROMPT = `You are an expert at writing tool descriptions for AI agents. Your goal is to create clear, actionable descriptions that help AI agents understand:
1. What the composite tool does (aggregates multiple operations)
2. What inputs are required and what values to pass
3. How the tool selects which operation to use (routing)
4. What the tool outputs and how to use the response

You write in a direct, technical style without unnecessary words. You follow the mini-prompt format exactly.`;

function buildCompositeToolGenerationPrompt(input: CompositeToolDescriptionInput): string {
  const operationsText = input.operations
    .map(
      (op) => `
### ${op.operationSlug} (${op.displayName})
- **Integration**: ${op.integrationName}
- **Action**: ${op.actionName}
- **Description**: ${op.actionDescription || 'No description'}
- **Tool Description**: ${op.toolDescription || 'No tool description available'}
- **Context Types**: ${op.contextTypes.length > 0 ? op.contextTypes.join(', ') : 'None'}
`
    )
    .join('\n');

  const unifiedSchemaText = JSON.stringify(input.unifiedInputSchema, null, 2);

  const routingExplanation =
    input.routingMode === 'rule_based'
      ? `**Rule-Based Routing**: The tool automatically selects the appropriate operation based on input patterns (e.g., URL domain, content type). The user does not need to specify which operation to use.`
      : `**Agent-Driven Routing**: The agent must explicitly select which operation to use via an "operation" parameter. The agent should choose based on the task requirements.`;

  return `Generate a composite tool description that aggregates these operations into a single unified tool.

## Composite Tool Details
- **Name**: ${input.name}
- **Slug**: ${input.slug}
- **Description**: ${input.description || 'No description provided'}
- **Routing Mode**: ${input.routingMode}
- **Has Default Operation**: ${input.hasDefaultOperation ? 'Yes' : 'No'}

## Routing Mode
${routingExplanation}

## Operations (${input.operations.length} total)
${operationsText}

## Unified Input Schema
\`\`\`json
${unifiedSchemaText}
\`\`\`

## Instructions

### For toolDescription:
Write a mini-prompt format description following this structure:

\`\`\`
Use this tool to {what the composite tool does - mention it intelligently routes to ${input.operations.length} operations}.

# Required inputs (always include these):
- {param_name}: {Clear guidance on what value to pass}
${
  input.routingMode === 'agent_driven'
    ? `- operation: Must be one of: ${input.operations.map((o) => o.operationSlug).join(', ')}. Choose based on {guidance on when to use each}.
`
    : ''
}
# Optional inputs (include when {specific condition}):
- {param_name}: {When and why to include this parameter}

${
  input.routingMode === 'rule_based'
    ? `# How the tool selects operations:
{Explain automatic routing behavior - when each operation is selected}
`
    : `# Operation selection guidance:
{For each operation, explain when to use it}
`
}
# What the tool outputs:
{Description of output format, mention it varies by operation but follows consistent structure}
\`\`\`

Guidelines:
- Start with "Use this tool to..." followed by an imperative verb
- Mention the tool aggregates ${input.operations.length} operations
- For required params, explain WHAT value to pass, not just the type
- For rule-based: explain how routing works automatically
- For agent-driven: list operations and when to use each
- Keep total description under 2500 characters

### For toolSuccessTemplate:
Create a template for successful responses. Use placeholders:
- {{operation_used}} - Which operation was selected
- {{summary}} - Brief summary of what was done
- {{key_result}} - Key result or ID from the response
- {{source_info}} - Information about the source (URL, ID, etc.)

Example: "## {{operation_used}} completed successfully\\n\\n{{summary}}\\n\\nResult: {{key_result}}"

### For toolErrorTemplate:
Create a template for error responses. Use placeholders:
- {{operation_attempted}} - Which operation was attempted
- {{error_type}} - Category of error
- {{error_message}} - The specific error message
- {{remediation}} - How to fix the issue

Example: "## {{error_type}} Error ({{operation_attempted}})\\n\\n{{error_message}}\\n\\n**How to fix:**\\n{{remediation}}"

Generate all three fields now.`;
}

// =============================================================================
// Generator Functions
// =============================================================================

/**
 * Load action data for operations.
 * Fetches full action details including toolDescription for each operation.
 */
export async function loadOperationActionData(
  operations: Array<{
    id: string;
    operationSlug: string;
    displayName: string;
    actionId: string;
  }>
): Promise<OperationActionData[]> {
  const results: OperationActionData[] = [];

  for (const op of operations) {
    const action = await findActionByIdWithIntegration(op.actionId);
    if (!action) {
      // Skip operations with missing actions
      continue;
    }

    // Extract context types from metadata
    const contextTypes: string[] = [];
    const metadata = action.metadata as { referenceData?: { dataType?: string } } | null;
    if (metadata?.referenceData?.dataType) {
      contextTypes.push(metadata.referenceData.dataType);
    }

    results.push({
      operationSlug: op.operationSlug,
      displayName: op.displayName,
      actionId: op.actionId,
      actionName: action.name,
      actionDescription: action.description,
      toolDescription: action.toolDescription,
      toolSuccessTemplate: action.toolSuccessTemplate,
      toolErrorTemplate: action.toolErrorTemplate,
      integrationName: action.integration.name,
      inputSchema: (action.inputSchema as Record<string, unknown>) ?? {},
      endpointTemplate: action.endpointTemplate,
      httpMethod: action.httpMethod,
      contextTypes,
    });
  }

  return results;
}

/**
 * Generate LLM-optimized tool descriptions for a composite tool.
 *
 * This aggregates information from all sub-operations and generates:
 * - A unified toolDescription in mini-prompt format
 * - A toolSuccessTemplate for formatting successful responses
 * - A toolErrorTemplate for formatting error responses
 *
 * @param input - Composite tool details and operation data
 * @returns Generated descriptions
 *
 * @example
 * ```ts
 * const operationData = await loadOperationActionData(compositeTool.operations);
 * const descriptions = await generateCompositeToolDescriptions({
 *   name: compositeTool.name,
 *   slug: compositeTool.slug,
 *   description: compositeTool.description,
 *   routingMode: compositeTool.routingMode,
 *   unifiedInputSchema: compositeTool.unifiedInputSchema,
 *   operations: operationData,
 *   hasDefaultOperation: !!compositeTool.defaultOperationId,
 * });
 *
 * // Store with the composite tool
 * await updateCompositeTool(compositeTool.id, {
 *   toolDescription: descriptions.toolDescription,
 *   toolSuccessTemplate: descriptions.toolSuccessTemplate,
 *   toolErrorTemplate: descriptions.toolErrorTemplate,
 * });
 * ```
 */
export async function generateCompositeToolDescriptions(
  input: CompositeToolDescriptionInput
): Promise<GeneratedCompositeToolDescriptions> {
  const llm = getLLM('gemini-3-flash'); // Use fast model for description generation

  const prompt = buildCompositeToolGenerationPrompt(input);

  const result = await llm.generate<GeneratedCompositeToolDescriptions>(prompt, {
    systemInstruction: SYSTEM_PROMPT,
    responseSchema: COMPOSITE_TOOL_DESCRIPTION_SCHEMA,
    temperature: 0.3, // Low temperature for consistent, factual output
    maxOutputTokens: 5000,
  });

  return result.content;
}

/**
 * Generate descriptions for a composite tool from its detail response.
 * Convenience wrapper that loads operation data automatically.
 *
 * @param compositeTool - Composite tool detail response
 * @returns Generated descriptions
 */
export async function generateDescriptionsFromCompositeTool(
  compositeTool: CompositeToolDetailResponse
): Promise<GeneratedCompositeToolDescriptions> {
  // Load action data for all operations
  const operationData = await loadOperationActionData(
    compositeTool.operations.map((op) => ({
      id: op.id,
      operationSlug: op.operationSlug,
      displayName: op.displayName,
      actionId: op.actionId,
    }))
  );

  // Generate descriptions
  return generateCompositeToolDescriptions({
    name: compositeTool.name,
    slug: compositeTool.slug,
    description: compositeTool.description,
    routingMode: compositeTool.routingMode,
    unifiedInputSchema: compositeTool.unifiedInputSchema,
    operations: operationData,
    hasDefaultOperation: !!compositeTool.defaultOperationId,
  });
}

// =============================================================================
// Fallback Template Generation
// =============================================================================

/**
 * Generate a basic description without LLM (for fallback scenarios).
 * Uses operation data to build a structured description.
 */
export function generateBasicCompositeToolDescription(
  input: CompositeToolDescriptionInput
): GeneratedCompositeToolDescriptions {
  const operationList = input.operations.map((op) => op.operationSlug).join(', ');

  const routingText =
    input.routingMode === 'rule_based'
      ? 'Automatically selects the appropriate operation based on input patterns.'
      : 'Requires explicit operation selection via the operation parameter.';

  // Build basic description
  const toolDescription = `Use this tool to access ${input.operations.length} operations: ${operationList}.

# Required inputs:
${input.routingMode === 'agent_driven' ? `- operation: Must be one of: ${operationList}\n` : ''}- See individual operation documentation for required parameters

# How it works:
${routingText}

# What the tool outputs:
Returns operation-specific results. Check the operation_used field to understand which operation ran.`;

  const toolSuccessTemplate = `## {{operation_used}} completed successfully

{{summary}}

Result: {{key_result}}`;

  const toolErrorTemplate = `## {{error_type}} Error ({{operation_attempted}})

{{error_message}}

**How to fix:**
{{remediation}}`;

  return {
    toolDescription,
    toolSuccessTemplate,
    toolErrorTemplate,
  };
}

/**
 * Generate descriptions with fallback to basic generation if LLM fails.
 */
export async function generateCompositeToolDescriptionsWithFallback(
  input: CompositeToolDescriptionInput
): Promise<GeneratedCompositeToolDescriptions> {
  try {
    return await generateCompositeToolDescriptions(input);
  } catch (error) {
    console.error('LLM description generation failed, using basic fallback:', error);
    return generateBasicCompositeToolDescription(input);
  }
}

// =============================================================================
// Unified Input Schema Builder
// =============================================================================

/**
 * Build a unified JSON Schema from operation input schemas.
 * Merges parameters from all operations and adds operation selector for agent_driven mode.
 *
 * @param operations - Array of operation data with input schemas
 * @param routingMode - 'rule_based' or 'agent_driven'
 * @returns JSON Schema object for the composite tool
 */
/**
 * Extract path parameters from an endpoint template like "/v1/charges/{charge}/capture"
 */
function extractPathParams(endpointTemplate: string): string[] {
  const matches = endpointTemplate.match(/\{([^}]+)\}/g);
  if (!matches) return [];
  return matches.map((m) => m.slice(1, -1)); // Remove { and }
}

/**
 * Parse toolDescription to extract parameter hints
 * Looks for patterns like "- param_name: description" in Required/Optional inputs sections
 */
function extractParamsFromToolDescription(
  toolDescription: string | null
): Array<{ name: string; description: string; required: boolean }> {
  if (!toolDescription) return [];

  const params: Array<{ name: string; description: string; required: boolean }> = [];
  const lines = toolDescription.split('\n');
  let inRequired = false;
  let inOptional = false;

  for (const line of lines) {
    const lowerLine = line.toLowerCase();
    if (lowerLine.includes('required input')) {
      inRequired = true;
      inOptional = false;
      continue;
    }
    if (lowerLine.includes('optional input')) {
      inRequired = false;
      inOptional = true;
      continue;
    }
    if (line.startsWith('#') || line.startsWith('Use this tool')) {
      inRequired = false;
      inOptional = false;
      continue;
    }

    // Look for "- param_name: description" pattern
    const paramMatch = line.match(/^[\s-]*([a-z_][a-z0-9_]*)\s*[:\-]\s*(.+)/i);
    if (paramMatch && (inRequired || inOptional)) {
      params.push({
        name: paramMatch[1],
        description: paramMatch[2].trim(),
        required: inRequired,
      });
    }
  }

  return params;
}

export function buildUnifiedInputSchema(
  operations: OperationActionData[],
  routingMode: CompositeToolRoutingMode
): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  const requiredSet = new Set<string>();

  // For agent_driven mode, add the operation selector
  if (routingMode === 'agent_driven') {
    properties['operation'] = {
      type: 'string',
      description: 'Which operation to perform',
      enum: operations.map((op) => op.operationSlug),
    };
    requiredSet.add('operation');
  }

  // Merge parameters from all operations
  for (const op of operations) {
    const schema = op.inputSchema;

    let opProperties: Record<string, unknown> = {};
    let opRequired: string[] = [];

    // Try to get properties from inputSchema first
    if (schema && typeof schema === 'object') {
      opProperties = (schema as { properties?: Record<string, unknown> }).properties || {};
      opRequired = (schema as { required?: string[] }).required || [];
    }

    // If inputSchema has no properties, try to extract from endpointTemplate
    if (Object.keys(opProperties).length === 0 && op.endpointTemplate) {
      const pathParams = extractPathParams(op.endpointTemplate);
      for (const param of pathParams) {
        opProperties[param] = {
          type: 'string',
          description: `Path parameter for ${op.displayName}`,
        };
        opRequired.push(param);
      }
    }

    // Also try to extract params from toolDescription
    if (op.toolDescription) {
      const descParams = extractParamsFromToolDescription(op.toolDescription);
      for (const param of descParams) {
        if (!opProperties[param.name]) {
          opProperties[param.name] = {
            type: 'string',
            description: param.description,
          };
          if (param.required) {
            opRequired.push(param.name);
          }
        }
      }
    }

    const opRequiredSet = new Set(opRequired);

    for (const [paramName, paramSchema] of Object.entries(opProperties)) {
      // Skip if already added from another operation
      if (properties[paramName]) {
        // Merge descriptions if different operations have the same parameter
        const existing = properties[paramName] as { description?: string };
        const incoming = paramSchema as { description?: string };
        if (incoming.description && !existing.description) {
          existing.description = incoming.description;
        }
        continue;
      }

      // Add the parameter with metadata about which operation it's from
      const paramCopy = { ...(paramSchema as Record<string, unknown>) };
      properties[paramName] = paramCopy;

      // For rule_based mode, params that are required in all operations stay required
      // For agent_driven, we make most params optional since different operations need different params
      if (routingMode === 'rule_based' && opRequiredSet.has(paramName)) {
        // In rule_based, add to required only if this is a common param across operations
        // For now, we'll be conservative and not mark as required
      }
    }
  }

  return {
    type: 'object',
    properties,
    required: Array.from(requiredSet),
  };
}

/**
 * Merge parameters extracted from a generated toolDescription into an existing schema.
 * This allows the LLM-generated description to inform the final schema.
 *
 * @param existingSchema - The schema built from operation data
 * @param toolDescription - The LLM-generated tool description
 * @returns Updated schema with merged parameters
 */
export function mergeParamsFromDescription(
  existingSchema: Record<string, unknown>,
  toolDescription: string
): Record<string, unknown> {
  const existingProperties = (existingSchema.properties as Record<string, unknown>) || {};
  const existingRequired = (existingSchema.required as string[]) || [];

  // Extract params from the generated description
  const descParams = extractParamsFromToolDescription(toolDescription);

  // Merge new params into existing schema
  const mergedProperties = { ...existingProperties };
  const mergedRequired = new Set(existingRequired);

  for (const param of descParams) {
    // Skip 'operation' as it's already handled
    if (param.name === 'operation') continue;

    if (!mergedProperties[param.name]) {
      mergedProperties[param.name] = {
        type: 'string',
        description: param.description,
      };
    } else {
      // Update description if existing one is generic
      const existing = mergedProperties[param.name] as { description?: string };
      if (
        existing.description &&
        (existing.description.startsWith('Path parameter') ||
          existing.description.length < param.description.length)
      ) {
        existing.description = param.description;
      }
    }

    // For agent_driven, we don't mark operation-specific params as required
    // since different operations need different params
    // But we could optionally mark them if they appear in "Required inputs"
  }

  return {
    type: 'object',
    properties: mergedProperties,
    required: Array.from(mergedRequired),
  };
}
