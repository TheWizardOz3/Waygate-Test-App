/**
 * Agentic Tool Invocation Handler
 *
 * Main entry point for invoking agentic tools. Routes execution to the appropriate
 * orchestrator based on execution mode (Parameter Interpreter or Autonomous Agent).
 *
 * This handler:
 * 1. Resolves the agentic tool by ID or slug
 * 2. Validates tool status and configuration
 * 3. Routes to appropriate orchestrator
 * 4. Logs execution metadata
 * 5. Returns standardized response
 */

import { prisma } from '@/lib/db/client';
import type { AgenticTool } from '@prisma/client';
import {
  executeParameterInterpreter,
  type ParameterInterpreterResult,
} from '../orchestrator/parameter-interpreter';
import { AgenticToolErrorCodes } from '../agentic-tool.schemas';

// =============================================================================
// Types
// =============================================================================

/**
 * Input for invoking an agentic tool
 */
export interface InvokeAgenticToolInput {
  /** Agentic tool ID or slug */
  toolIdentifier: string;
  /** Tenant ID */
  tenantId: string;
  /** User's natural language task/request */
  task: string;
  /** Optional request ID for tracing */
  requestId?: string;
  /** Optional connection ID for multi-app connections */
  connectionId?: string;
  /** Whether to log execution to database */
  logExecution?: boolean;
}

/**
 * Result of agentic tool invocation
 */
export interface InvokeAgenticToolResult {
  /** Whether execution succeeded */
  success: boolean;
  /** Execution result data */
  data?: unknown;
  /** Error details (if failed) */
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
  /** Execution metadata */
  metadata: {
    /** Agentic tool ID */
    agenticToolId: string;
    /** Agentic tool slug */
    agenticToolSlug: string;
    /** Execution mode used */
    executionMode: 'parameter_interpreter' | 'autonomous_agent';
    /** LLM calls made */
    llmCalls: number;
    /** Actions executed (parameter interpreter) or tool calls (autonomous agent) */
    toolCalls: number;
    /** Total cost in USD */
    totalCost: number;
    /** Total tokens used */
    totalTokens: number;
    /** Total duration in milliseconds */
    durationMs: number;
    /** Request ID for tracing */
    requestId?: string;
    /** Execution log ID (if logged) */
    executionId?: string;
  };
}

// =============================================================================
// Main Invocation Handler
// =============================================================================

/**
 * Invoke an agentic tool
 *
 * This is the main entry point for executing agentic tools. It:
 * 1. Resolves the tool by ID or slug
 * 2. Validates tool is active
 * 3. Routes to appropriate orchestrator
 * 4. Logs execution
 * 5. Returns result
 *
 * @param input - Invocation input
 * @returns Invocation result with metadata
 */
export async function invokeAgenticTool(
  input: InvokeAgenticToolInput
): Promise<InvokeAgenticToolResult> {
  const { toolIdentifier, tenantId, task, requestId, connectionId, logExecution = true } = input;

  try {
    // Step 1: Resolve agentic tool
    const agenticTool = await resolveAgenticTool(tenantId, toolIdentifier);

    // Step 2: Validate tool status
    validateToolStatus(agenticTool);

    // Step 3: Route to appropriate orchestrator based on execution mode
    const executionMode = agenticTool.executionMode;

    let result: ParameterInterpreterResult;

    if (executionMode === 'parameter_interpreter') {
      // Execute in Parameter Interpreter mode
      result = await executeParameterInterpreter({
        agenticTool,
        tenantId,
        userInput: task,
        requestId,
        connectionId,
      });
    } else if (executionMode === 'autonomous_agent') {
      // Autonomous Agent mode - not yet implemented
      throw new InvocationError(
        'AUTONOMOUS_AGENT_NOT_IMPLEMENTED',
        'Autonomous agent mode is not yet implemented (coming in Phase 5)'
      );
    } else {
      throw new InvocationError(
        'INVALID_EXECUTION_MODE',
        `Unknown execution mode: ${executionMode}`
      );
    }

    // Step 4: Log execution to database (if enabled)
    let executionId: string | undefined;
    if (logExecution) {
      executionId = await logExecutionToDatabase(agenticTool.id, tenantId, task, result);
    }

    // Step 5: Return standardized result
    return {
      success: result.success,
      data: result.data,
      error: result.error,
      metadata: {
        agenticToolId: agenticTool.id,
        agenticToolSlug: agenticTool.slug,
        executionMode: executionMode as 'parameter_interpreter' | 'autonomous_agent',
        llmCalls: result.metadata.llmCalls.length,
        toolCalls: result.metadata.actionExecutions.length,
        totalCost: result.metadata.totalCost,
        totalTokens: result.metadata.totalTokens,
        durationMs: result.metadata.durationMs,
        requestId: result.metadata.requestId,
        executionId,
      },
    };
  } catch (error) {
    // Handle errors
    if (error instanceof InvocationError) {
      return {
        success: false,
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
        },
        metadata: {
          agenticToolId: '',
          agenticToolSlug: '',
          executionMode: 'parameter_interpreter',
          llmCalls: 0,
          toolCalls: 0,
          totalCost: 0,
          totalTokens: 0,
          durationMs: 0,
        },
      };
    }

    // Unknown error
    return {
      success: false,
      error: {
        code: 'UNKNOWN_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error occurred',
      },
      metadata: {
        agenticToolId: '',
        agenticToolSlug: '',
        executionMode: 'parameter_interpreter',
        llmCalls: 0,
        toolCalls: 0,
        totalCost: 0,
        totalTokens: 0,
        durationMs: 0,
      },
    };
  }
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Resolve agentic tool by ID or slug
 *
 * @param tenantId - Tenant ID
 * @param identifier - Tool ID (UUID) or slug
 * @returns Agentic tool
 */
async function resolveAgenticTool(tenantId: string, identifier: string): Promise<AgenticTool> {
  // Check if identifier is a UUID
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(identifier);

  const agenticTool = await prisma.agenticTool.findFirst({
    where: {
      tenantId,
      ...(isUuid ? { id: identifier } : { slug: identifier }),
    },
  });

  if (!agenticTool) {
    throw new InvocationError(
      AgenticToolErrorCodes.AGENTIC_TOOL_NOT_FOUND,
      `Agentic tool not found: ${identifier}`
    );
  }

  return agenticTool;
}

/**
 * Validate tool status
 *
 * @param agenticTool - Agentic tool to validate
 */
function validateToolStatus(agenticTool: AgenticTool): void {
  if (agenticTool.status === 'disabled') {
    throw new InvocationError(
      AgenticToolErrorCodes.AGENTIC_TOOL_DISABLED,
      `Agentic tool is disabled: ${agenticTool.slug}`
    );
  }

  if (agenticTool.status === 'draft') {
    throw new InvocationError(
      AgenticToolErrorCodes.INVALID_STATUS,
      `Cannot invoke draft agentic tool: ${agenticTool.slug}`
    );
  }
}

/**
 * Log execution to database
 *
 * @param agenticToolId - Agentic tool ID
 * @param tenantId - Tenant ID
 * @param task - User task/request
 * @param result - Execution result
 * @returns Execution ID
 */
async function logExecutionToDatabase(
  agenticToolId: string,
  tenantId: string,
  task: string,
  result: ParameterInterpreterResult
): Promise<string> {
  const execution = await prisma.agenticToolExecution.create({
    data: {
      agenticToolId,
      tenantId,
      parentRequest: { task },
      llmCalls: result.metadata.llmCalls,
      toolCalls: result.metadata.actionExecutions,
      result: result.data ?? undefined,
      status: result.success ? 'success' : 'error',
      error: result.error ?? undefined,
      totalCost: result.metadata.totalCost,
      totalTokens: result.metadata.totalTokens,
      durationMs: result.metadata.durationMs,
      traceId: result.metadata.requestId ?? null,
      completedAt: new Date(),
    },
  });

  return execution.id;
}

// =============================================================================
// Error Class
// =============================================================================

/**
 * Error thrown during agentic tool invocation
 */
export class InvocationError extends Error {
  constructor(
    public code: string,
    message: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'InvocationError';
  }
}
