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
      description: 'Array of 2-3 example usage scenarios',
      items: {
        type: 'string',
      },
      minItems: 2,
      maxItems: 3,
    },
  },
  required: ['toolDescription', 'exampleUsages'],
};

// =============================================================================
// Prompts
// =============================================================================

const SYSTEM_PROMPT = `You are an expert at writing tool descriptions for AI agents. Your goal is to create clear, actionable descriptions that help parent AI agents understand:
1. What the agentic tool does (and that it uses an embedded LLM)
2. What natural language input it expects
3. How the embedded LLM processes the input
4. What the tool outputs and how to use the response

You write in a direct, technical style without unnecessary words. Focus on practical usage.`;

function buildAgenticToolGenerationPrompt(input: AgenticToolDescriptionInput): string {
  const modeExplanation =
    input.executionMode === 'parameter_interpreter'
      ? `**Parameter Interpreter Mode**: The embedded LLM translates your natural language request into structured parameters, then executes a predetermined action. This is a single-step process where the LLM acts as a parameter generator.`
      : `**Autonomous Agent Mode**: The embedded LLM autonomously selects and executes multiple tools in sequence to accomplish your goal. The LLM reasons about which tools to use, when to use them, and how to synthesize results.`;

  const modelInfo = `${input.embeddedLLMConfig.provider}/${input.embeddedLLMConfig.model}`;

  const inputSchemaText = JSON.stringify(input.inputSchema, null, 2);

  // Extract key info from system prompt without exposing internal details
  const systemPromptSummary =
    input.systemPrompt.length > 500
      ? input.systemPrompt.substring(0, 500) + '...'
      : input.systemPrompt;

  return `Generate an agentic tool description for a parent AI agent to understand how to use this tool.

## Agentic Tool Details
- **Name**: ${input.name}
- **Slug**: ${input.slug}
- **Description**: ${input.description || 'No description provided'}
- **Execution Mode**: ${input.executionMode}
- **Embedded LLM**: ${modelInfo}

## Execution Mode
${modeExplanation}

## System Prompt (Embedded LLM Instructions)
The embedded LLM operates with these instructions:
\`\`\`
${systemPromptSummary}
\`\`\`

## Input Schema
The tool expects this input format:
\`\`\`json
${inputSchemaText}
\`\`\`

## Tool Allocation
${JSON.stringify(input.toolAllocation, null, 2)}

---

**Task**: Generate a concise, actionable tool description that:
1. Explains what this tool does in 1-2 sentences
2. Clarifies that it uses an embedded LLM (${input.executionMode} mode)
3. Describes what natural language input the parent agent should provide
4. Explains what the tool returns
5. Provides 2-3 concrete example usage scenarios

**Format Requirements**:
- Tool description: 200-500 words
- Use clear, direct language
- Focus on practical usage, not implementation details
- Emphasize the natural language interface
- Include examples that show the variety of tasks this tool can handle

**Remember**: The parent agent doesn't need to know about the embedded LLM's internal workings - just how to use the tool effectively.`;
}

// =============================================================================
// Basic Description Generator (Fallback)
// =============================================================================

/**
 * Generate a basic description without using an LLM.
 * Used as fallback or for quick previews.
 */
export function generateBasicAgenticToolDescription(
  input: AgenticToolDescriptionInput
): GeneratedAgenticToolDescriptions {
  const modeDescription =
    input.executionMode === 'parameter_interpreter'
      ? 'This tool uses an embedded LLM to interpret your natural language request and generate precise parameters for execution. The LLM acts as a smart parameter generator, translating your intent into structured API calls.'
      : 'This tool uses an autonomous agent with an embedded LLM that selects and executes multiple tools to accomplish your goal. The agent reasons about which tools to use and how to synthesize results.';

  const inputDescription =
    Object.keys(input.inputSchema).length > 0
      ? 'Provide input according to the defined schema.'
      : 'Provide a clear, natural language description of what you want to accomplish in the "task" parameter.';

  const toolDescription = `# ${input.name}

${input.description || 'An AI-powered tool with embedded intelligence.'}

## How it works
${modeDescription}

## Input
${inputDescription}

## Output
Returns the result of the operation(s) performed by the embedded agent, formatted for easy interpretation.

## Usage
Provide a clear, specific description of what you want to accomplish. The embedded LLM will handle the complexity of translating your request into the appropriate actions.`;

  const exampleUsages = [
    `Task: "Find all records matching the criteria and format them as a summary"`,
    `Task: "Update the status based on the latest information"`,
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

    const response = await llm.generateStructuredResponse(prompt, AGENTIC_TOOL_DESCRIPTION_SCHEMA, {
      systemPrompt: SYSTEM_PROMPT,
      temperature: 0.3, // Low temperature for consistent output
      maxTokens: 2000,
    });

    return {
      toolDescription: response.toolDescription as string,
      exampleUsages: response.exampleUsages as string[],
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
