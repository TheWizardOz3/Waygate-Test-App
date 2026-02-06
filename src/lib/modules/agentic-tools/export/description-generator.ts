/**
 * Agentic Tool Description Generator
 *
 * Generates LLM-optimized tool descriptions for agentic tools that clearly
 * communicate the tool's capabilities to parent agents.
 *
 * Key responsibilities:
 * - Generate descriptions that explain the embedded LLM's role
 * - Clarify the natural language input format
 * - Describe what the tool outputs
 * - Explain execution mode differences (Parameter Interpreter vs Autonomous Agent)
 */

import { getLLM } from '../../ai/llm/client';
import type { LLMResponseSchema } from '../../ai/llm/types';
import type {
  AgenticToolResponse,
  AgenticToolExecutionMode,
  EmbeddedLLMConfig,
} from '../agentic-tool.schemas';

// =============================================================================
// Types
// =============================================================================

/**
 * Generated descriptions for an agentic tool
 */
export interface GeneratedAgenticToolDescriptions {
  /** LLM-optimized tool description */
  toolDescription: string;
  /** Example usage scenarios */
  exampleUsages: string[];
}

/**
 * Input for generating agentic tool descriptions
 */
export interface AgenticToolDescriptionInput {
  /** Agentic tool name */
  name: string;
  /** Agentic tool slug */
  slug: string;
  /** User-provided description */
  description: string | null;
  /** Execution mode */
  executionMode: AgenticToolExecutionMode;
  /** Embedded LLM configuration */
  embeddedLLMConfig: EmbeddedLLMConfig;
  /** System prompt (to understand what the tool does) */
  systemPrompt: string;
  /** Input schema */
  inputSchema: Record<string, unknown>;
  /** Tool allocation (target actions or available tools) */
  toolAllocation: Record<string, unknown>;
}

// =============================================================================
// Response Schema for LLM
// =============================================================================

const AGENTIC_TOOL_DESCRIPTION_SCHEMA: LLMResponseSchema = {
  type: 'object',
  properties: {
    toolDescription: {
      type: 'string',
      description:
        'LLM-optimized agentic tool description that explains what the tool does, what input it expects, and what it returns',
      maxLength: 2500,
    },
    exampleUsages: {
      type: 'array',
      description: 'Array of 2-3 example usage scenarios (provide exactly 2-3 examples)',
      items: {
        type: 'string',
      },
    },
  },
  required: ['toolDescription', 'exampleUsages'],
};

// =============================================================================
// Prompts
// =============================================================================

const SYSTEM_PROMPT = `You are an expert at writing tool descriptions for AI agents. Your goal is to create clear, actionable descriptions that help parent AI agents understand how to use agentic tools effectively.

You must follow the EXACT format specified below. Tool descriptions are treated as mini-prompts that guide the parent agent.

CRITICAL: Always use this exact format:

Use this tool to {what the tool does in actionable terms}.

# Required inputs:
- {input_name}: {description with type, constraints, defaults}

# Optional inputs (include when {condition}):
- {input_name}: {description with when to include/exclude}

# What the tool outputs:
{Description of output format and key fields}`;

function buildAgenticToolGenerationPrompt(input: AgenticToolDescriptionInput): string {
  const modeDescription =
    input.executionMode === 'parameter_interpreter'
      ? 'The embedded LLM translates natural language requests into structured parameters, then executes a predetermined action (single LLM call).'
      : 'The embedded LLM autonomously selects and executes multiple tools to accomplish goals (multiple LLM calls).';

  const modelInfo = `${input.embeddedLLMConfig.provider}/${input.embeddedLLMConfig.model}`;

  // Extract tool information from allocation
  const toolAllocation = input.toolAllocation as {
    mode?: string;
    targetActions?: { actionId: string; actionSlug: string }[];
    availableTools?: { actionId: string; actionSlug: string; description?: string }[];
  };

  const allocatedTools: string[] = [];
  const toolDescriptions: string[] = [];

  if (toolAllocation.targetActions) {
    toolAllocation.targetActions.forEach((t) => allocatedTools.push(t.actionSlug));
  }
  if (toolAllocation.availableTools) {
    toolAllocation.availableTools.forEach((t) => {
      allocatedTools.push(t.actionSlug);
      if (t.description) {
        toolDescriptions.push(`- ${t.actionSlug}: ${t.description}`);
      }
    });
  }

  const toolsListText =
    allocatedTools.length > 0
      ? `Available underlying tools: ${allocatedTools.join(', ')}`
      : 'No specific tools configured yet';

  const toolDescText =
    toolDescriptions.length > 0 ? `\n\nTool descriptions:\n${toolDescriptions.join('\n')}` : '';

  // Extract key info from system prompt without exposing internal details
  const systemPromptSummary =
    input.systemPrompt.length > 500
      ? input.systemPrompt.substring(0, 500) + '...'
      : input.systemPrompt;

  return `Generate an agentic tool description following the EXACT format specified in the system prompt.

## Agentic Tool Details
- **Name**: ${input.name}
- **Slug**: ${input.slug}
- **User Description**: ${input.description || 'No description provided'}
- **Execution Mode**: ${input.executionMode} (${modeDescription})
- **Embedded LLM**: ${modelInfo}

## Tool Allocation
${toolsListText}${toolDescText}

## System Prompt Context
The embedded LLM uses these instructions:
\`\`\`
${systemPromptSummary}
\`\`\`

---

**Task**: Generate a tool description following this EXACT format:

\`\`\`
Use this tool to {what the tool does - be specific about the capabilities based on allocated tools}.

# Required inputs:
- task: {description of what natural language input to provide, including examples of well-formed requests}

# Optional inputs (include when needed):
- preferred_tools: {if autonomous mode, describe when to specify preferred tools}
- context: {describe any additional context that helps the embedded LLM}

# What the tool outputs:
{Describe the output format - structured JSON response from the executed tool(s), including:
- What data fields to expect
- How errors are reported
- Any metadata included}
\`\`\`

**Requirements**:
1. Start with "Use this tool to" - be specific about what operations this tool can perform
2. The "task" input is always required - describe it as accepting natural language
3. Include optional inputs only if relevant to this tool's execution mode
4. Describe outputs based on what the underlying tools return
5. Be concise but complete - parent agents need to know exactly how to use this tool
6. Do NOT mention internal LLM details - focus on what the tool DOES, not how it works internally`;
}

// =============================================================================
// Basic Description Generator (Fallback)
// =============================================================================

/**
 * Generate a basic description without using an LLM.
 * Used as fallback or for quick previews.
 * Follows the simple-tool-export.md mini-prompt format.
 */
export function generateBasicAgenticToolDescription(
  input: AgenticToolDescriptionInput
): GeneratedAgenticToolDescriptions {
  // Extract tool information from allocation
  const toolAllocation = input.toolAllocation as {
    mode?: string;
    targetActions?: { actionId: string; actionSlug: string }[];
    availableTools?: { actionId: string; actionSlug: string; description?: string }[];
  };

  const allocatedTools: string[] = [];
  if (toolAllocation.targetActions) {
    toolAllocation.targetActions.forEach((t) => allocatedTools.push(t.actionSlug));
  }
  if (toolAllocation.availableTools) {
    toolAllocation.availableTools.forEach((t) => allocatedTools.push(t.actionSlug));
  }

  const toolsContext =
    allocatedTools.length > 0
      ? `specifically for ${allocatedTools.slice(0, 3).join(', ')}${allocatedTools.length > 3 ? ` and ${allocatedTools.length - 3} more tools` : ''}`
      : 'for the configured operations';

  const actionDescription =
    input.executionMode === 'parameter_interpreter'
      ? `translate natural language requests into structured JSON parameters ${toolsContext}`
      : `accomplish goals by autonomously selecting and executing tools ${toolsContext}`;

  const modeSpecificInput =
    input.executionMode === 'autonomous_agent'
      ? `
# Optional inputs (include when needed):
- preferred_tools: Array of tool slugs to prioritize. Include when you want to guide tool selection.
- context: Additional context or constraints for the task.`
      : '';

  const outputDescription =
    input.executionMode === 'parameter_interpreter'
      ? 'The output will be the structured JSON response from the executed tool, formatted strictly as valid JSON without markdown or explanatory text.'
      : 'Returns the synthesized result from all tool executions, including individual tool responses and a summary of actions taken.';

  const toolDescription = `Use this tool to ${actionDescription}.

# Required inputs:
- task: The task or request in natural language. Be specific and include any necessary identifiers like IDs, names, or values. The embedded LLM will process this input, map it to the correct tool schema, and execute the action.
${modeSpecificInput}

# What the tool outputs:
${outputDescription}`;

  const exampleUsages = [
    `Task: "Cancel the refund with ID re_abc123"`,
    `Task: "Send a message to the #general channel saying 'Meeting in 5 minutes'"`,
    `Task: "Get the latest 10 transactions for customer cus_xyz789"`,
  ];

  return {
    toolDescription,
    exampleUsages,
  };
}

// =============================================================================
// AI-Powered Description Generator
// =============================================================================

/**
 * Generate descriptions using AI.
 * Uses Gemini (fast and cheap) for description generation.
 */
export async function generateAgenticToolDescription(
  input: AgenticToolDescriptionInput
): Promise<GeneratedAgenticToolDescriptions> {
  try {
    const llm = getLLM();
    const prompt = buildAgenticToolGenerationPrompt(input);

    const result = await llm.generate<GeneratedAgenticToolDescriptions>(prompt, {
      systemInstruction: SYSTEM_PROMPT,
      responseSchema: AGENTIC_TOOL_DESCRIPTION_SCHEMA,
      temperature: 0.3, // Low temperature for consistent output
      maxOutputTokens: 2000,
    });

    return {
      toolDescription: result.content.toolDescription,
      exampleUsages: result.content.exampleUsages,
    };
  } catch (error) {
    console.error('[AgenticToolDescriptionGenerator] AI generation failed, using fallback:', error);
    // Fallback to basic description if AI generation fails
    return generateBasicAgenticToolDescription(input);
  }
}

// =============================================================================
// Convenience Functions
// =============================================================================

/**
 * Generate descriptions from an AgenticToolResponse object.
 */
export async function generateDescriptionsFromAgenticTool(
  agenticTool: AgenticToolResponse
): Promise<GeneratedAgenticToolDescriptions> {
  const input: AgenticToolDescriptionInput = {
    name: agenticTool.name,
    slug: agenticTool.slug,
    description: agenticTool.description,
    executionMode: agenticTool.executionMode,
    embeddedLLMConfig: agenticTool.embeddedLLMConfig,
    systemPrompt: agenticTool.systemPrompt,
    inputSchema: agenticTool.inputSchema,
    toolAllocation: agenticTool.toolAllocation,
  };

  return generateAgenticToolDescription(input);
}

/**
 * Regenerate description for an existing agentic tool.
 */
export async function regenerateAgenticToolDescription(
  agenticTool: AgenticToolResponse
): Promise<string> {
  const descriptions = await generateDescriptionsFromAgenticTool(agenticTool);
  return descriptions.toolDescription;
}
