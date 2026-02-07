/**
 * Pipeline Description Generator
 *
 * Generates LLM-optimized tool descriptions for pipeline tools that clearly
 * communicate the pipeline's capabilities to parent agents. Internal step
 * complexity is hidden — the description presents the pipeline as a single tool.
 *
 * Key responsibilities:
 * - Generate descriptions that explain what the pipeline does as one operation
 * - Clarify the input format expected by the pipeline
 * - Describe what the tool outputs
 * - Hide internal step details from the parent agent
 *
 * Follows the mini-prompt format from tool-export/descriptions/description-builder.ts
 */

import { getLLM } from '../../ai/llm/client';
import type { LLMResponseSchema } from '../../ai/llm/types';
import type { PipelineResponse, PipelineStepResponse } from '../pipeline.schemas';

// =============================================================================
// Types
// =============================================================================

/**
 * Generated descriptions for a pipeline tool
 */
export interface GeneratedPipelineDescriptions {
  /** LLM-optimized tool description */
  toolDescription: string;
  /** Example usage scenarios */
  exampleUsages: string[];
}

/**
 * Input for generating pipeline tool descriptions
 */
export interface PipelineDescriptionInput {
  /** Pipeline name */
  name: string;
  /** Pipeline slug */
  slug: string;
  /** User-provided description */
  description: string | null;
  /** Pipeline input schema */
  inputSchema: Record<string, unknown>;
  /** Pipeline steps (for understanding what the tool does) */
  steps: PipelineStepResponse[];
  /** Output mapping (to describe what the tool returns) */
  outputMapping: Record<string, unknown>;
}

// =============================================================================
// Response Schema for LLM
// =============================================================================

const PIPELINE_DESCRIPTION_SCHEMA: LLMResponseSchema = {
  type: 'object',
  properties: {
    toolDescription: {
      type: 'string',
      description:
        'LLM-optimized pipeline tool description that explains what the tool does as a single operation, what input it expects, and what it returns. Internal step complexity must be hidden.',
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

const SYSTEM_PROMPT = `You are an expert at writing tool descriptions for AI agents. Your goal is to create clear, actionable descriptions that help parent AI agents understand how to use pipeline tools effectively.

CRITICAL: The pipeline's internal steps are HIDDEN from the parent agent. The description must present the pipeline as a SINGLE tool — do NOT mention steps, stages, or internal pipeline complexity.

You must follow the EXACT format specified below. Tool descriptions are treated as mini-prompts that guide the parent agent.

CRITICAL: Always use this exact format:

Use this tool to {what the tool does as a single cohesive operation}.

# Required inputs (always include these):
- {input_name}: {description with type, constraints, defaults}

# Optional inputs (include when {condition}):
- {input_name}: {description with when to include/exclude}

# What the tool is going to output:
{Description of final output format and key fields}`;

function buildPipelineGenerationPrompt(input: PipelineDescriptionInput): string {
  // Summarize steps without exposing details
  const stepSummaries = input.steps.map((step) => {
    const toolInfo = step.toolSlug ? ` (uses: ${step.toolSlug})` : ' (reasoning only)';
    return `- Step ${step.stepNumber}: "${step.name}"${toolInfo}`;
  });

  // Extract input parameters
  const schema = input.inputSchema;
  const properties = (schema as { properties?: Record<string, unknown> }).properties || {};
  const required = (schema as { required?: string[] }).required || [];

  const paramLines: string[] = [];
  for (const [name, value] of Object.entries(properties)) {
    const prop = value as { type?: string; description?: string };
    paramLines.push(
      `- ${name} (${prop.type || 'unknown'}): ${prop.description || 'No description'}`
    );
  }

  // Output mapping summary
  const outputMapping = input.outputMapping as {
    fields?: Record<string, { source: string; description?: string }>;
    includeMeta?: boolean;
  };
  const outputFields: string[] = [];
  if (outputMapping?.fields) {
    for (const [field, config] of Object.entries(outputMapping.fields)) {
      outputFields.push(`- ${field}: ${config.description || config.source}`);
    }
  }

  return `Generate a pipeline tool description following the EXACT format specified in the system prompt.

## Pipeline Tool Details
- **Name**: ${input.name}
- **Slug**: ${input.slug}
- **User Description**: ${input.description || 'No description provided'}

## Internal Steps (DO NOT expose these in the description)
${stepSummaries.join('\n')}

## Input Parameters
${paramLines.length > 0 ? paramLines.join('\n') : 'No specific input parameters defined'}
Required fields: ${required.length > 0 ? required.join(', ') : 'none'}

## Output Fields
${outputFields.length > 0 ? outputFields.join('\n') : 'Returns the result of the pipeline execution'}

---

**Task**: Generate a tool description that presents this pipeline as a SINGLE tool. Do NOT mention steps, stages, or internal complexity. Focus on:
1. What the tool DOES as one operation
2. What inputs it expects
3. What it returns

**Requirements**:
1. Start with "Use this tool to" - be specific about the end-to-end capability
2. Describe inputs based on the pipeline's input schema
3. Describe outputs based on the output mapping
4. Be concise but complete
5. Do NOT mention internal steps, stages, LLMs, or pipeline architecture`;
}

// =============================================================================
// Basic Description Generator (Fallback)
// =============================================================================

/**
 * Generate a basic description without using an LLM.
 * Used as fallback or for quick previews.
 * Follows the mini-prompt format from description-builder.ts.
 */
export function generateBasicPipelineDescription(
  input: PipelineDescriptionInput
): GeneratedPipelineDescriptions {
  const parts: string[] = [];

  // 1. Opening line
  const baseDescription = input.description || input.name;
  parts.push(
    `Use this tool to ${baseDescription.charAt(0).toLowerCase()}${baseDescription.slice(1).replace(/\.$/, '')}.`
  );

  // 2. Extract parameters from input schema
  const schema = input.inputSchema;
  if (schema && typeof schema === 'object') {
    const properties = (schema as { properties?: Record<string, unknown> }).properties || {};
    const required = (schema as { required?: string[] }).required || [];
    const requiredSet = new Set(required);

    const requiredParams: Array<{ name: string; desc: string }> = [];
    const optionalParams: Array<{ name: string; desc: string }> = [];

    for (const [name, propValue] of Object.entries(properties)) {
      const prop = propValue as { description?: string; type?: string };
      let description = prop.description || `The ${name}`;
      if (prop.type) {
        description += ` (${prop.type})`;
      }

      if (requiredSet.has(name)) {
        requiredParams.push({ name, desc: description });
      } else {
        optionalParams.push({ name, desc: description });
      }
    }

    if (requiredParams.length > 0) {
      parts.push('');
      parts.push('# Required inputs (always include these):');
      for (const param of requiredParams) {
        parts.push(`- ${param.name}: ${param.desc}`);
      }
    }

    if (optionalParams.length > 0) {
      parts.push('');
      parts.push('# Optional inputs:');
      for (const param of optionalParams) {
        parts.push(`- ${param.name}: ${param.desc}`);
      }
    }
  }

  // 3. Output description
  const outputMapping = input.outputMapping as {
    fields?: Record<string, { source: string; description?: string }>;
  };

  parts.push('');
  parts.push('# What the tool is going to output:');

  if (outputMapping?.fields && Object.keys(outputMapping.fields).length > 0) {
    const fieldDescs: string[] = [];
    for (const [field, config] of Object.entries(outputMapping.fields)) {
      fieldDescs.push(config.description || field);
    }
    parts.push(
      `Returns structured data including: ${fieldDescs.join(', ')}. ` +
        'The response includes execution metadata such as duration and cost.'
    );
  } else {
    parts.push(
      'Returns the result of the operation including relevant data and execution metadata.'
    );
  }

  const toolDescription = parts.join('\n');

  // Generate example usages based on the pipeline name/description
  const exampleUsages = generateExampleUsages(input);

  return {
    toolDescription,
    exampleUsages,
  };
}

/**
 * Generate example usages from pipeline context
 */
function generateExampleUsages(input: PipelineDescriptionInput): string[] {
  const schema = input.inputSchema;
  const properties = (schema as { properties?: Record<string, unknown> }).properties || {};
  const paramNames = Object.keys(properties);

  if (paramNames.length === 0) {
    return [
      `${input.name}: Perform the default operation`,
      `${input.name}: Execute with default settings`,
    ];
  }

  // Generate examples based on first parameter
  const firstParam = paramNames[0];
  const firstProp = properties[firstParam] as { description?: string; type?: string };

  if (firstParam === 'task' || firstParam === 'query' || firstParam === 'input') {
    return [
      `${firstParam}: "Describe what you want to accomplish"`,
      `${firstParam}: "Provide specific details about the operation"`,
      `${firstParam}: "Include relevant identifiers and context"`,
    ];
  }

  return [
    `${firstParam}: ${firstProp.description || `Provide the ${firstParam}`}`,
    `Example: Use the tool with a specific ${firstParam} value`,
  ];
}

// =============================================================================
// AI-Powered Description Generator
// =============================================================================

/**
 * Generate descriptions using AI.
 * Uses Gemini (fast and cheap) for description generation.
 */
export async function generatePipelineDescription(
  input: PipelineDescriptionInput
): Promise<GeneratedPipelineDescriptions> {
  try {
    const llm = getLLM();
    const prompt = buildPipelineGenerationPrompt(input);

    const result = await llm.generate<GeneratedPipelineDescriptions>(prompt, {
      systemInstruction: SYSTEM_PROMPT,
      responseSchema: PIPELINE_DESCRIPTION_SCHEMA,
      temperature: 0.3,
      maxOutputTokens: 2000,
    });

    return {
      toolDescription: result.content.toolDescription,
      exampleUsages: result.content.exampleUsages,
    };
  } catch (error) {
    console.error('[PipelineDescriptionGenerator] AI generation failed, using fallback:', error);
    return generateBasicPipelineDescription(input);
  }
}

// =============================================================================
// Convenience Functions
// =============================================================================

/**
 * Generate descriptions from a PipelineResponse + steps.
 */
export async function generateDescriptionsFromPipeline(
  pipeline: PipelineResponse,
  steps: PipelineStepResponse[]
): Promise<GeneratedPipelineDescriptions> {
  const input: PipelineDescriptionInput = {
    name: pipeline.name,
    slug: pipeline.slug,
    description: pipeline.description,
    inputSchema: pipeline.inputSchema,
    steps,
    outputMapping: pipeline.outputMapping,
  };

  return generatePipelineDescription(input);
}

/**
 * Regenerate description for an existing pipeline.
 */
export async function regeneratePipelineDescription(
  pipeline: PipelineResponse,
  steps: PipelineStepResponse[]
): Promise<string> {
  const descriptions = await generateDescriptionsFromPipeline(pipeline, steps);
  return descriptions.toolDescription;
}
