/**
 * Autonomous Agent Orchestrator
 *
 * Executes agentic tools in Autonomous Agent mode:
 * 1. Initialize agentic loop with safety limits
 * 2. LLM autonomously selects and executes tools
 * 3. LLM reviews results and decides to continue or complete
 * 4. Loop continues until task is satisfied or safety limit hit
 * 5. Return synthesized result
 *
 * This mode is for tools that autonomously orchestrate multiple operations.
 */

import type { AgenticTool } from '@prisma/client';
import type {
  EmbeddedLLMConfig,
  ToolAllocation,
  SafetyLimits,
  ContextConfig,
} from '../agentic-tool.schemas';
import { createLLMClient, type LLMTool } from '../llm/llm-client';
import { processPrompt } from '../llm/prompt-processor';
import { buildContext } from '../context/variable-injector';
import { invokeAction } from '../../gateway/gateway.service';
import { findActionById } from '../../actions/action.repository';
import { prisma } from '@/lib/db/client';
import { SafetyEnforcer, SafetyLimitError } from './safety-enforcer';

// =============================================================================
// Types
// =============================================================================

/**
 * Input for autonomous agent execution
 */
export interface AutonomousAgentInput {
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
 * Result of autonomous agent execution
 */
export interface AutonomousAgentResult {
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
      toolCalls?: number;
    }>;
    /** Tool executions performed */
    toolExecutions: Array<{
      sequence: number;
      toolName: string;
      toolSlug: string;
      input: Record<string, unknown>;
      success: boolean;
      durationMs?: number;
      error?: string;
    }>;
    /** Total cost in USD */
    totalCost: number;
    /** Total tokens used */
    totalTokens: number;
    /** Total duration in milliseconds */
    durationMs: number;
    /** Request ID for tracing */
    requestId?: string;
    /** Whether execution hit safety limits */
    hitSafetyLimit?: boolean;
    /** Which safety limit was hit (if any) */
    safetyLimitType?: 'MAX_TOOL_CALLS' | 'TIMEOUT' | 'MAX_COST';
  };
}

/**
 * State of the autonomous agent loop
 */
interface AgentLoopState {
  /** Current iteration number */
  iteration: number;
  /** Number of tool calls made */
  toolCallCount: number;
  /** Total cost accumulated */
  totalCost: number;
  /** Total tokens used */
  totalTokens: number;
  /** Whether the agent has completed its task */
  isComplete: boolean;
  /** Final result (if complete) */
  result?: unknown;
  /** Conversation history for the agent */
  conversationHistory: Array<{
    role: 'user' | 'assistant' | 'tool';
    content: string;
    toolCallId?: string;
    toolName?: string;
  }>;
}

// =============================================================================
// Autonomous Agent Orchestrator
// =============================================================================

/**
 * Execute an agentic tool in Autonomous Agent mode
 *
 * Flow:
 * 1. Build prompt context and initialize agent loop
 * 2. Process system prompt with variable replacement
 * 3. Enter agentic loop:
 *    a. Call LLM with available tools
 *    b. If LLM makes tool calls, execute them
 *    c. Feed results back to LLM
 *    d. Repeat until LLM signals completion or safety limit hit
 * 4. Return synthesized result with full metadata
 *
 * @param input - Autonomous agent input
 * @returns Execution result with metadata
 */
export async function executeAutonomousAgent(
  input: AutonomousAgentInput
): Promise<AutonomousAgentResult> {
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
  const llmCalls: AutonomousAgentResult['metadata']['llmCalls'] = [];
  const toolExecutions: AutonomousAgentResult['metadata']['toolExecutions'] = [];

  try {
    // Step 1: Parse tool allocation
    const toolAllocation = agenticTool.toolAllocation as ToolAllocation;
    if (toolAllocation.mode !== 'autonomous_agent') {
      throw new AutonomousAgentError(
        'INVALID_EXECUTION_MODE',
        `Expected autonomous_agent mode, got ${toolAllocation.mode}`
      );
    }

    const availableTools = toolAllocation.availableTools;
    if (!availableTools || availableTools.length === 0) {
      throw new AutonomousAgentError(
        'NO_AVAILABLE_TOOLS',
        'No available tools configured for autonomous agent'
      );
    }

    // Step 2: Build prompt context
    const promptContext = await buildContext({
      tenantId,
      userInput,
      contextConfig: (agenticTool.contextConfig as ContextConfig) || undefined,
      integrationIds: availableTools.map((t) => t.actionId).filter(Boolean),
    });

    // Add available tools list to context
    const toolsList = availableTools
      .map((tool) => `- ${tool.actionSlug}: ${tool.description}`)
      .join('\n');
    promptContext.available_tools = toolsList;

    // Step 3: Process system prompt
    const { processedPrompt, missingVariables } = processPrompt(
      agenticTool.systemPrompt,
      promptContext
    );

    if (missingVariables.length > 0) {
      console.warn(`[AutonomousAgent] Missing variables: ${missingVariables.join(', ')}`);
    }

    // Step 4: Build LLM tools array
    const llmTools = await buildLLMTools(tenantId, availableTools);

    // Step 5: Initialize agent loop state
    const loopState: AgentLoopState = {
      iteration: 0,
      toolCallCount: 0,
      totalCost: 0,
      totalTokens: 0,
      isComplete: false,
      conversationHistory: [
        {
          role: 'user',
          content: userInput,
        },
      ],
    };

    // Step 6: Execute agentic loop
    const llmConfig = agenticTool.embeddedLLMConfig as EmbeddedLLMConfig;
    const llmClient = createLLMClient(llmConfig);

    while (!loopState.isComplete) {
      loopState.iteration++;

      // Check safety limits before each iteration
      try {
        safetyEnforcer.checkTimeout();
        safetyEnforcer.checkCostLimit(loopState.totalCost);
        safetyEnforcer.checkToolCallLimit(loopState.toolCallCount);
      } catch (error) {
        if (error instanceof SafetyLimitError) {
          // Hit safety limit - return partial results
          return buildPartialResult(
            loopState,
            llmCalls,
            toolExecutions,
            error,
            startTime,
            requestId
          );
        }
        throw error;
      }

      // Call LLM with tools
      const llmCallStart = Date.now();
      const llmResponse = await llmClient.call({
        systemPrompt: processedPrompt,
        prompt: buildConversationPrompt(loopState.conversationHistory),
        temperature: llmConfig.temperature,
        maxTokens: llmConfig.maxTokens,
        tools: llmTools,
      });
      const llmCallDuration = Date.now() - llmCallStart;

      // Track LLM call
      llmCalls.push({
        sequence: loopState.iteration,
        purpose: loopState.iteration === 1 ? 'initial_planning' : 'continuation',
        model: llmResponse.model,
        tokensInput: llmResponse.usage.inputTokens,
        tokensOutput: llmResponse.usage.outputTokens,
        cost: llmResponse.cost,
        durationMs: llmCallDuration,
        toolCalls: llmResponse.toolCalls?.length ?? 0,
      });

      loopState.totalCost += llmResponse.cost;
      loopState.totalTokens += llmResponse.usage.totalTokens;

      // Check if LLM made tool calls
      if (llmResponse.toolCalls && llmResponse.toolCalls.length > 0) {
        // Add assistant message with tool calls to history
        loopState.conversationHistory.push({
          role: 'assistant',
          content: llmResponse.rawText,
        });

        // Execute each tool call
        for (const toolCall of llmResponse.toolCalls) {
          // Check safety limit before each tool call
          safetyEnforcer.checkToolCallLimit(loopState.toolCallCount);

          const toolExecutionStart = Date.now();
          loopState.toolCallCount++;

          try {
            // Find the tool configuration
            const toolConfig = availableTools.find((t) => t.actionSlug === toolCall.name);
            if (!toolConfig) {
              throw new AutonomousAgentError(
                'TOOL_NOT_FOUND',
                `Tool not found in available tools: ${toolCall.name}`
              );
            }

            // Get action and integration details
            const action = await findActionById(toolConfig.actionId);
            if (!action) {
              throw new AutonomousAgentError(
                'ACTION_NOT_FOUND',
                `Action not found: ${toolConfig.actionId}`
              );
            }

            const integration = await prisma.integration.findUnique({
              where: { id: action.integrationId },
              select: { slug: true },
            });

            if (!integration) {
              throw new AutonomousAgentError(
                'INTEGRATION_NOT_FOUND',
                `Integration not found for action: ${toolConfig.actionId}`
              );
            }

            // Execute tool via gateway
            const result = await invokeAction(
              tenantId,
              integration.slug,
              toolConfig.actionSlug,
              toolCall.input,
              {
                connectionId,
                requestId,
              }
            );

            const toolExecutionDuration = Date.now() - toolExecutionStart;

            // Track tool execution
            toolExecutions.push({
              sequence: loopState.toolCallCount,
              toolName: toolCall.name,
              toolSlug: toolConfig.actionSlug,
              input: toolCall.input,
              success: result.success,
              durationMs: toolExecutionDuration,
              error: result.success ? undefined : result.error?.message,
            });

            // Add tool result to conversation history
            loopState.conversationHistory.push({
              role: 'tool',
              content: JSON.stringify(result.success ? result.data : result.error),
              toolCallId: toolCall.id,
              toolName: toolCall.name,
            });

            // If tool execution failed, continue to next iteration
            // (let LLM decide how to handle the error)
          } catch (error) {
            // Track failed tool execution
            toolExecutions.push({
              sequence: loopState.toolCallCount,
              toolName: toolCall.name,
              toolSlug: toolCall.name,
              input: toolCall.input,
              success: false,
              durationMs: Date.now() - toolExecutionStart,
              error: error instanceof Error ? error.message : String(error),
            });

            // Add error to conversation history
            loopState.conversationHistory.push({
              role: 'tool',
              content: JSON.stringify({
                error: error instanceof Error ? error.message : String(error),
              }),
              toolCallId: toolCall.id,
              toolName: toolCall.name,
            });
          }
        }

        // Continue to next iteration to let LLM process tool results
        continue;
      } else {
        // No tool calls - LLM has completed the task
        loopState.isComplete = true;
        loopState.result = llmResponse.content;

        // Add final assistant message to history
        loopState.conversationHistory.push({
          role: 'assistant',
          content: llmResponse.rawText,
        });
      }
    }

    // Step 7: Return successful result
    const durationMs = Date.now() - startTime;

    return {
      success: true,
      data: loopState.result,
      metadata: {
        llmCalls,
        toolExecutions,
        totalCost: loopState.totalCost,
        totalTokens: loopState.totalTokens,
        durationMs,
        requestId,
      },
    };
  } catch (error) {
    // Handle errors
    const durationMs = Date.now() - startTime;

    if (error instanceof AutonomousAgentError) {
      return {
        success: false,
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
        },
        metadata: {
          llmCalls,
          toolExecutions,
          totalCost: llmCalls.reduce((sum, call) => sum + call.cost, 0),
          totalTokens: llmCalls.reduce(
            (sum, call) => sum + call.tokensInput + call.tokensOutput,
            0
          ),
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
          toolExecutions,
          totalCost: llmCalls.reduce((sum, call) => sum + call.cost, 0),
          totalTokens: llmCalls.reduce(
            (sum, call) => sum + call.tokensInput + call.tokensOutput,
            0
          ),
          durationMs,
          requestId,
          hitSafetyLimit: true,
          safetyLimitType: error.code,
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
        toolExecutions,
        totalCost: llmCalls.reduce((sum, call) => sum + call.cost, 0),
        totalTokens: llmCalls.reduce((sum, call) => sum + call.tokensInput + call.tokensOutput, 0),
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
 * Build LLM tools array from available tools
 */
async function buildLLMTools(
  tenantId: string,
  availableTools: Array<{ actionId: string; actionSlug: string; description: string }>
): Promise<LLMTool[]> {
  const llmTools: LLMTool[] = [];

  for (const tool of availableTools) {
    const action = await findActionById(tool.actionId);
    if (!action) {
      console.warn(`[AutonomousAgent] Action not found: ${tool.actionId}`);
      continue;
    }

    llmTools.push({
      name: tool.actionSlug,
      description: tool.description,
      inputSchema: (action.inputSchema as Record<string, unknown>) ?? {},
    });
  }

  return llmTools;
}

/**
 * Build conversation prompt from history
 */
function buildConversationPrompt(history: AgentLoopState['conversationHistory']): string {
  return history
    .map((msg) => {
      if (msg.role === 'user') {
        return `User: ${msg.content}`;
      } else if (msg.role === 'assistant') {
        return `Assistant: ${msg.content}`;
      } else if (msg.role === 'tool') {
        return `Tool (${msg.toolName}): ${msg.content}`;
      }
      return '';
    })
    .join('\n\n');
}

/**
 * Build partial result when safety limit is hit
 */
function buildPartialResult(
  loopState: AgentLoopState,
  llmCalls: AutonomousAgentResult['metadata']['llmCalls'],
  toolExecutions: AutonomousAgentResult['metadata']['toolExecutions'],
  safetyError: SafetyLimitError,
  startTime: number,
  requestId?: string
): AutonomousAgentResult {
  const durationMs = Date.now() - startTime;

  return {
    success: false,
    error: {
      code: safetyError.code,
      message: `${safetyError.message}. Partial results available.`,
      details: {
        limit: safetyError.limit,
        actual: safetyError.actual,
        partialResults: {
          iterationsCompleted: loopState.iteration,
          toolCallsMade: loopState.toolCallCount,
          conversationHistory: loopState.conversationHistory,
        },
      },
    },
    metadata: {
      llmCalls,
      toolExecutions,
      totalCost: loopState.totalCost,
      totalTokens: loopState.totalTokens,
      durationMs,
      requestId,
      hitSafetyLimit: true,
      safetyLimitType: safetyError.code,
    },
  };
}

// =============================================================================
// Error Class
// =============================================================================

/**
 * Error thrown during autonomous agent execution
 */
export class AutonomousAgentError extends Error {
  constructor(
    public code: string,
    message: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'AutonomousAgentError';
  }
}

// =============================================================================
// Exports
// =============================================================================

export { SafetyEnforcer, SafetyLimitError } from './safety-enforcer';
