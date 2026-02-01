/**
 * Parameter Interpreter Orchestrator
 *
 * Executes agentic tools in Parameter Interpreter mode:
 * 1. Single LLM call with prompt containing task and context
 * 2. LLM generates structured JSON parameters
 * 3. Validate LLM output against target action schema
 * 4. Execute target action(s) with generated parameters
 * 5. Return formatted result
 *
 * This mode is for tools that translate natural language → precise API parameters.
 */

import type { AgenticTool } from '@prisma/client';
import type {
  EmbeddedLLMConfig,
  ToolAllocation,
  SafetyLimits,
  ContextConfig,
} from '../agentic-tool.schemas';
import { createLLMClient, type LLMCallResponse } from '../llm/llm-client';
import { processPrompt } from '../llm/prompt-processor';
import { buildContext } from '../context/variable-injector';
import { invokeAction } from '../../gateway/gateway.service';
import type { GatewaySuccessResponse, GatewayErrorResponse } from '../../gateway/gateway.schemas';
import { validateActionInput } from '../../actions/json-schema-validator';
import { findActionById } from '../../actions/action.repository';
import { prisma } from '@/lib/db/client';
import { SafetyEnforcer, SafetyLimitError } from './safety-enforcer';

// =============================================================================
// Types
// =============================================================================

/**
 * Input for parameter interpreter execution
 */
export interface ParameterInterpreterInput {
  /** The agentic tool being executed */
  agenticTool: AgenticTool;
  /** Tenant ID for data access */
  tenantId: string;
  /** User's natural language task/request */
  userInput: string;
  /** Optional request ID for tracing */
  requestId?: string;
  /** Optional connection ID for multi-app connections */
  connectionId?: string;
}

/**
 * Result of parameter interpreter execution
 */
export interface ParameterInterpreterResult {
  /** Whether execution succeeded */
  success: boolean;
  /** Execution result data (if successful) */
  data?: unknown;
  /** Error details (if failed) */
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
  /** Execution metadata */
  metadata: {
    /** LLM calls made */
    llmCalls: Array<{
      sequence: number;
      purpose: string;
      model: string;
      tokensInput: number;
      tokensOutput: number;
      cost: number;
      durationMs: number;
    }>;
    /** Target actions executed */
    actionExecutions: Array<{
      actionId: string;
      actionSlug: string;
      success: boolean;
      durationMs?: number;
    }>;
    /** Total cost in USD */
    totalCost: number;
    /** Total tokens used */
    totalTokens: number;
    /** Total duration in milliseconds */
    durationMs: number;
    /** Request ID for tracing */
    requestId?: string;
  };
}

/**
 * Generated parameters from LLM
 */
interface GeneratedParameters {
  /** The generated parameters as JSON */
  parameters: Record<string, unknown>;
  /** Optional metadata about the generation */
  metadata?: {
    reasoning?: string;
    confidence?: number;
    [key: string]: unknown;
  };
}

// =============================================================================
// Parameter Interpreter Orchestrator
// =============================================================================

/**
 * Execute an agentic tool in Parameter Interpreter mode
 *
 * Flow:
 * 1. Build prompt context (load schemas, reference data, etc.)
 * 2. Process system prompt with variable replacement
 * 3. Call LLM once to generate parameters
 * 4. Validate generated parameters against action schemas
 * 5. Execute target action(s) with generated parameters
 * 6. Return result with full metadata
 *
 * @param input - Parameter interpreter input
 * @returns Execution result with metadata
 */
export async function executeParameterInterpreter(
  input: ParameterInterpreterInput
): Promise<ParameterInterpreterResult> {
  const startTime = Date.now();
  const { agenticTool, tenantId, userInput, requestId, connectionId } = input;

  // Initialize safety enforcer
  const safetyLimits = (agenticTool.safetyLimits as SafetyLimits | null) ?? {
    maxToolCalls: 10,
    timeoutSeconds: 300,
    maxTotalCost: 1.0,
  };
  const safetyEnforcer = new SafetyEnforcer(safetyLimits, startTime);

  // Initialize result tracking
  const llmCalls: ParameterInterpreterResult['metadata']['llmCalls'] = [];
  const actionExecutions: ParameterInterpreterResult['metadata']['actionExecutions'] = [];
  let totalCost = 0;
  let totalTokens = 0;

  try {
    // Step 1: Parse tool allocation
    const toolAllocation = agenticTool.toolAllocation as ToolAllocation;
    if (toolAllocation.mode !== 'parameter_interpreter') {
      throw new ParameterInterpreterError(
        'INVALID_EXECUTION_MODE',
        `Expected parameter_interpreter mode, got ${toolAllocation.mode}`
      );
    }

    const targetActions = toolAllocation.targetActions;
    if (!targetActions || targetActions.length === 0) {
      throw new ParameterInterpreterError(
        'NO_TARGET_ACTIONS',
        'No target actions configured for parameter interpreter'
      );
    }

    // Step 2: Build prompt context
    const promptContext = await buildContext({
      tenantId,
      userInput,
      contextConfig: (agenticTool.contextConfig as ContextConfig) || undefined,
      integrationIds: targetActions.map((a) => a.actionId).filter(Boolean),
    });

    // Step 3: Process system prompt
    const { processedPrompt, missingVariables } = processPrompt(
      agenticTool.systemPrompt,
      promptContext
    );

    if (missingVariables.length > 0) {
      console.warn(`[ParameterInterpreter] Missing variables: ${missingVariables.join(', ')}`);
    }

    // Step 4: Call LLM to generate parameters
    const llmConfig = agenticTool.embeddedLLMConfig as EmbeddedLLMConfig;
    const llmClient = createLLMClient(llmConfig);

    const llmCallStart = Date.now();
    const llmResponse = await llmClient.call({
      systemPrompt: processedPrompt,
      prompt: userInput,
      temperature: llmConfig.temperature,
      maxTokens: llmConfig.maxTokens,
      responseFormat: 'json',
    });
    const llmCallDuration = Date.now() - llmCallStart;

    // Check safety limits after LLM call
    safetyEnforcer.checkCostLimit(llmResponse.cost);

    // Track LLM call
    llmCalls.push({
      sequence: 1,
      purpose: 'parameter_generation',
      model: llmResponse.model,
      tokensInput: llmResponse.usage.inputTokens,
      tokensOutput: llmResponse.usage.outputTokens,
      cost: llmResponse.cost,
      durationMs: llmCallDuration,
    });
    totalCost += llmResponse.cost;
    totalTokens += llmResponse.usage.totalTokens;

    // Step 5: Parse and validate LLM output
    const generatedParams = parseLLMOutput(llmResponse);

    // Step 6: Validate parameters against target action schemas
    const validationErrors = await validateParameters(
      tenantId,
      targetActions,
      generatedParams.parameters
    );

    if (validationErrors.length > 0) {
      throw new ParameterInterpreterError(
        'INVALID_GENERATED_PARAMETERS',
        'LLM generated invalid parameters',
        { validationErrors }
      );
    }

    // Step 7: Execute target action(s)
    const executionResults: Array<GatewaySuccessResponse | GatewayErrorResponse> = [];

    for (const targetAction of targetActions) {
      const actionStart = Date.now();

      try {
        // Check timeout before each action execution
        safetyEnforcer.checkTimeout();

        // Get action to determine integration slug
        const action = await findActionById(targetAction.actionId);
        if (!action) {
          throw new ParameterInterpreterError(
            'ACTION_NOT_FOUND',
            `Action not found: ${targetAction.actionId}`
          );
        }

        // Get integration slug from action
        const integration = await prisma.integration.findUnique({
          where: { id: action.integrationId },
          select: { slug: true },
        });

        if (!integration) {
          throw new ParameterInterpreterError(
            'INTEGRATION_NOT_FOUND',
            `Integration not found for action: ${targetAction.actionId}`
          );
        }

        // Execute action via gateway
        const result = await invokeAction(
          tenantId,
          integration.slug,
          targetAction.actionSlug,
          generatedParams.parameters,
          {
            connectionId,
            requestId,
          }
        );

        executionResults.push(result);

        // Track execution
        actionExecutions.push({
          actionId: targetAction.actionId,
          actionSlug: targetAction.actionSlug,
          success: result.success,
          durationMs: Date.now() - actionStart,
        });

        // If action failed, throw error
        if (!result.success) {
          throw new ParameterInterpreterError(
            'ACTION_EXECUTION_FAILED',
            `Action execution failed: ${result.error?.message}`,
            { actionSlug: targetAction.actionSlug, error: result.error }
          );
        }
      } catch (error) {
        // Track failed execution
        actionExecutions.push({
          actionId: targetAction.actionId,
          actionSlug: targetAction.actionSlug,
          success: false,
          durationMs: Date.now() - actionStart,
        });
        throw error;
      }
    }

    // Step 8: Return successful result
    const durationMs = Date.now() - startTime;

    return {
      success: true,
      data: executionResults.length === 1 ? executionResults[0].data : executionResults,
      metadata: {
        llmCalls,
        actionExecutions,
        totalCost,
        totalTokens,
        durationMs,
        requestId,
      },
    };
  } catch (error) {
    // Handle errors
    const durationMs = Date.now() - startTime;

    if (error instanceof ParameterInterpreterError) {
      return {
        success: false,
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
        },
        metadata: {
          llmCalls,
          actionExecutions,
          totalCost,
          totalTokens,
          durationMs,
          requestId,
        },
      };
    }

    if (error instanceof SafetyLimitError) {
      return {
        success: false,
        error: {
          code: error.code,
          message: error.message,
          details: {
            limit: error.limit,
            actual: error.actual,
          },
        },
        metadata: {
          llmCalls,
          actionExecutions,
          totalCost,
          totalTokens,
          durationMs,
          requestId,
        },
      };
    }

    // Unknown error
    return {
      success: false,
      error: {
        code: 'UNKNOWN_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error occurred',
        details: { error: String(error) },
      },
      metadata: {
        llmCalls,
        actionExecutions,
        totalCost,
        totalTokens,
        durationMs,
        requestId,
      },
    };
  }
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Parse LLM output to extract generated parameters
 *
 * Expected format:
 * ```json
 * {
 *   "parameters": { ... },
 *   "metadata": { ... }  // optional
 * }
 * ```
 *
 * @param llmResponse - LLM call response
 * @returns Parsed parameters
 */
function parseLLMOutput(llmResponse: LLMCallResponse): GeneratedParameters {
  // LLM should return JSON
  if (typeof llmResponse.content !== 'object') {
    throw new ParameterInterpreterError('INVALID_LLM_OUTPUT', 'LLM did not return valid JSON', {
      content: llmResponse.content,
    });
  }

  const content = llmResponse.content as Record<string, unknown>;

  // Check for parameters field
  if (!content.parameters || typeof content.parameters !== 'object') {
    throw new ParameterInterpreterError(
      'INVALID_LLM_OUTPUT',
      'LLM output missing "parameters" field',
      { content }
    );
  }

  return {
    parameters: content.parameters as Record<string, unknown>,
    metadata: content.metadata as GeneratedParameters['metadata'],
  };
}

/**
 * Validate generated parameters against target action schemas
 *
 * @param tenantId - Tenant ID
 * @param targetActions - Target actions to validate against
 * @param parameters - Generated parameters
 * @returns Array of validation errors (empty if valid)
 */
async function validateParameters(
  tenantId: string,
  targetActions: Array<{ actionId: string; actionSlug: string }>,
  parameters: Record<string, unknown>
): Promise<Array<{ actionSlug: string; errors: string[] }>> {
  const validationErrors: Array<{ actionSlug: string; errors: string[] }> = [];

  // For parameter interpreter mode, all target actions should accept the same parameters
  // We validate against the first action's schema
  const firstAction = targetActions[0];
  const action = await findActionById(firstAction.actionId);

  if (!action) {
    throw new ParameterInterpreterError(
      'ACTION_NOT_FOUND',
      `Action not found: ${firstAction.actionId}`
    );
  }

  // Validate parameters against action's input schema
  const validationResult = validateActionInput(
    parameters,
    action.inputSchema as Record<string, unknown>,
    action.slug
  );

  if (!validationResult.valid) {
    validationErrors.push({
      actionSlug: action.slug,
      errors: validationResult.errors?.map((e) => e.message) || ['Validation failed'],
    });
  }

  return validationErrors;
}

// =============================================================================
// Error Class
// =============================================================================

/**
 * Error thrown during parameter interpreter execution
 */
export class ParameterInterpreterError extends Error {
  constructor(
    public code: string,
    message: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'ParameterInterpreterError';
  }
}

// =============================================================================
// Exports
// =============================================================================

export { SafetyEnforcer, SafetyLimitError } from './safety-enforcer';
