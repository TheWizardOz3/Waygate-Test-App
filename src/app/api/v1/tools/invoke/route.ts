/**
 * Tool Invoke Endpoint
 *
 * POST /api/v1/tools/invoke - Invoke a tool with context injection
 *
 * This endpoint provides agent-readable responses optimized for AI agents,
 * with context resolution (name-to-ID mapping) and structured success/error messages.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withApiAuth } from '@/lib/api/middleware/auth';
import { invokeAction, getHttpStatusForError } from '@/lib/modules/gateway';
import { prisma } from '@/lib/db/client';
import {
  formatSuccessResponse as formatToolSuccessResponse,
  formatErrorResponse as formatToolErrorResponse,
  createErrorInputFromGateway,
  type SuccessFormatterInput,
  type ResolutionContext,
} from '@/lib/modules/tool-export';
import {
  RuntimeVariablesSchema,
  type GatewaySuccessResponse,
  type GatewayErrorResponse,
  type RuntimeVariables,
} from '@/lib/modules/gateway/gateway.schemas';

// =============================================================================
// Request Schema
// =============================================================================

/**
 * Context item for name-to-ID resolution
 */
const ContextItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

/**
 * Request body schema for tool invocation
 */
const ToolInvokeRequestSchema = z.object({
  /** The tool name (e.g., "slack_send_message") */
  tool: z.string().min(1),
  /** Parameters to pass to the tool */
  params: z.record(z.string(), z.unknown()).default({}),
  /** Optional context for name-to-ID resolution */
  context: z.record(z.string(), z.array(ContextItemSchema)).optional(),
  /** Optional connection ID for multi-app integrations */
  connectionId: z.string().uuid().optional(),
  /**
   * Optional runtime variables for dynamic context injection.
   * These override stored tenant/connection variables with highest priority.
   *
   * @example
   * {
   *   current_user: { id: "user_123", name: "John Doe" },
   *   api_version: "v2",
   *   custom_setting: "some_value"
   * }
   */
  variables: RuntimeVariablesSchema.optional(),
  /**
   * Optional invocation options (primarily for wg_app_ key flows).
   */
  options: z
    .object({
      /**
       * External user ID for end-user credential resolution.
       * When provided with a wg_app_ key, uses the user's own credential
       * (AppUserCredential) instead of the shared connection credential.
       */
      externalUserId: z.string().optional(),
    })
    .optional(),
});

// =============================================================================
// Tool Name Parsing
// =============================================================================

/**
 * Parse a tool name into integration and action slugs.
 * Tool names follow the pattern: {integrationSlug}_{actionSlug}
 * where actionSlug uses underscores in tool names but hyphens in DB.
 *
 * @example
 * "slack_send_message" -> { integrationSlug: "slack", actionSlug: "send-message" }
 * "github_create_issue" -> { integrationSlug: "github", actionSlug: "create-issue" }
 */
function parseToolName(toolName: string): { integrationSlug: string; actionSlug: string } | null {
  const underscoreIndex = toolName.indexOf('_');
  if (underscoreIndex === -1) {
    return null;
  }

  const integrationSlug = toolName.slice(0, underscoreIndex);
  // Convert remaining underscores to hyphens for action slug
  const actionSlug = toolName.slice(underscoreIndex + 1).replace(/_/g, '-');

  if (!integrationSlug || !actionSlug) {
    return null;
  }

  return { integrationSlug, actionSlug };
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get integration and action display names for response formatting
 */
async function getDisplayNames(
  tenantId: string,
  integrationSlug: string,
  actionSlug: string
): Promise<{
  integrationName: string;
  actionName: string;
} | null> {
  const integration = await prisma.integration.findFirst({
    where: {
      slug: integrationSlug,
      tenantId,
    },
    select: {
      id: true,
      name: true,
      actions: {
        where: { slug: actionSlug },
        select: { name: true },
        take: 1,
      },
    },
  });

  if (!integration || integration.actions.length === 0) {
    return null;
  }

  return {
    integrationName: integration.name,
    actionName: integration.actions[0].name,
  };
}

// =============================================================================
// Endpoint Handler
// =============================================================================

export const POST = withApiAuth(async (request: NextRequest, { tenant, app }) => {
  try {
    // Parse request body
    const body = await request.json();
    const validationResult = ToolInvokeRequestSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request body',
            details: validationResult.error.flatten(),
            suggestedResolution: {
              action: 'RETRY_WITH_MODIFIED_INPUT',
              description:
                'Check the request body format. Required fields: tool (string), params (object).',
              retryable: true,
            },
          },
        },
        { status: 400 }
      );
    }

    const {
      tool,
      params,
      context,
      connectionId,
      variables,
      options: invokeOptions,
    } = validationResult.data;

    // Parse tool name
    const parsed = parseToolName(tool);
    if (!parsed) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_TOOL_NAME',
            message: `Invalid tool name format: "${tool}". Expected format: {integration}_{action_name}`,
            suggestedResolution: {
              action: 'RETRY_WITH_MODIFIED_INPUT',
              description:
                'Tool names should be in the format "integration_action_name" (e.g., "slack_send_message").',
              retryable: true,
            },
          },
        },
        { status: 400 }
      );
    }

    const { integrationSlug, actionSlug } = parsed;

    // Get display names for response formatting
    const displayNames = await getDisplayNames(tenant.id, integrationSlug, actionSlug);
    if (!displayNames) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'TOOL_NOT_FOUND',
            message: `Tool "${tool}" not found. Integration "${integrationSlug}" or action "${actionSlug}" does not exist.`,
            suggestedResolution: {
              action: 'RETRY_WITH_MODIFIED_INPUT',
              description:
                'Verify the tool name is correct. Use the tools export endpoint to list available tools.',
              retryable: false,
            },
          },
        },
        { status: 404 }
      );
    }

    // Invoke the action through the gateway
    // When authenticated with a wg_app_ key, pass appId so the gateway
    // resolves the App's connection and uses user-aware credential resolution.
    const startTime = Date.now();
    const result = await invokeAction(tenant.id, integrationSlug, actionSlug, params, {
      context: context as ResolutionContext | undefined,
      connectionId,
      variables: variables as RuntimeVariables | undefined,
      appId: app?.id,
      externalUserId: invokeOptions?.externalUserId,
    });
    const latencyMs = Date.now() - startTime;

    // Format response based on success/failure
    if (result.success) {
      const gatewayResult = result as GatewaySuccessResponse;

      // Build formatter input
      const formatterInput: SuccessFormatterInput = {
        actionName: tool,
        actionDisplayName: displayNames.actionName,
        integrationSlug,
        integrationDisplayName: displayNames.integrationName,
        requestId: gatewayResult.meta.requestId,
        latencyMs,
        originalInput: params,
        responseData: gatewayResult.data,
        resolvedInputs: gatewayResult.resolvedInputs
          ? Object.fromEntries(
              Object.entries(gatewayResult.resolvedInputs).map(([k, v]) => [
                k,
                { original: v.original, resolved: v.resolved },
              ])
            )
          : undefined,
      };

      // Format as agent-readable success response
      const toolResponse = formatToolSuccessResponse(formatterInput);

      return NextResponse.json(toolResponse, { status: 200 });
    } else {
      const gatewayResult = result as GatewayErrorResponse;

      // Create error formatter input from gateway error
      const errorInput = createErrorInputFromGateway(
        tool,
        displayNames.actionName,
        integrationSlug,
        displayNames.integrationName,
        {
          code: gatewayResult.error.code,
          message: gatewayResult.error.message,
          details: gatewayResult.error.details,
          requestId: gatewayResult.error.requestId,
          suggestedResolution: gatewayResult.error.suggestedResolution,
        },
        params
      );

      // Format as agent-readable error response
      const toolResponse = formatToolErrorResponse(errorInput);
      const httpStatus = getHttpStatusForError(gatewayResult);

      return NextResponse.json(toolResponse, { status: httpStatus });
    }
  } catch (error) {
    console.error('[ToolInvoke] Error:', error);

    return NextResponse.json(
      {
        success: false,
        message: '## Internal Error\n\nAn unexpected error occurred while invoking the tool.',
        error: {
          code: 'INTERNAL_ERROR',
          details: error instanceof Error ? { message: error.message } : undefined,
        },
        meta: {
          action: 'unknown',
          integration: 'unknown',
          requestId: `req_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
          latencyMs: 0,
        },
        context: {
          attemptedInputs: {},
        },
        remediation:
          '## How to fix:\n1. This is an unexpected internal error\n2. Please try again\n3. If the error persists, contact support with the request ID\n\nIf you have already retried and are still encountering this error, skip this step and proceed with your next task.',
      },
      { status: 500 }
    );
  }
});
