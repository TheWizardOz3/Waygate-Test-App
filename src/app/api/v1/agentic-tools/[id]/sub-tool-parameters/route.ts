/**
 * Agentic Tool Sub-Tool Parameters Endpoint
 *
 * GET /api/v1/agentic-tools/:id/sub-tool-parameters
 * Returns input parameters from all allocated actions (sub-tools).
 * Used to discover available arguments that can be inherited by the agentic tool.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withApiAuth } from '@/lib/api/middleware/auth';
import { getAgenticToolById, AgenticToolError } from '@/lib/modules/agentic-tools';
import { getAction } from '@/lib/modules/actions';
import type { JsonSchemaProperty } from '@/lib/modules/actions/action.schemas';

interface ToolAllocation {
  mode?: string;
  targetActions?: { actionId: string; actionSlug: string }[];
  availableTools?: { actionId: string; actionSlug: string; description?: string }[];
}

interface SubToolParameter {
  /** Parameter name */
  name: string;
  /** Display label */
  label: string;
  /** Parameter type */
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  /** Description */
  description: string;
  /** Whether required in the original action */
  required: boolean;
  /** Default value if any */
  default?: unknown;
  /** Source action slug */
  source: string;
  /** Source action name */
  sourceName: string;
}

/**
 * Extract agentic tool ID from URL
 */
function extractAgenticToolId(request: NextRequest): string | null {
  const url = new URL(request.url);
  const pathParts = url.pathname.split('/');
  const agenticToolsIndex = pathParts.indexOf('agentic-tools');
  return agenticToolsIndex !== -1 ? pathParts[agenticToolsIndex + 1] : null;
}

/**
 * Map JSON Schema type to simplified type
 */
function mapSchemaType(
  type: JsonSchemaProperty['type']
): 'string' | 'number' | 'boolean' | 'object' | 'array' {
  if (Array.isArray(type)) {
    // Use first non-null type
    const nonNullType = type.find((t) => t !== 'null');
    return mapSchemaType(nonNullType ?? 'string');
  }
  switch (type) {
    case 'integer':
    case 'number':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'object':
      return 'object';
    case 'array':
      return 'array';
    default:
      return 'string';
  }
}

/**
 * Extract parameters from a JSON Schema
 */
function extractParameters(
  schema: { properties?: Record<string, JsonSchemaProperty>; required?: string[] },
  actionSlug: string,
  actionName: string
): SubToolParameter[] {
  const params: SubToolParameter[] = [];

  if (!schema.properties) {
    return params;
  }

  const requiredFields = new Set(schema.required ?? []);

  for (const [name, prop] of Object.entries(schema.properties)) {
    params.push({
      name,
      label: name
        .replace(/_/g, ' ')
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/\b\w/g, (c) => c.toUpperCase()),
      type: mapSchemaType(prop.type),
      description: prop.description ?? `${name} parameter`,
      required: requiredFields.has(name),
      default: prop.default,
      source: actionSlug,
      sourceName: actionName,
    });
  }

  return params;
}

/**
 * GET /api/v1/agentic-tools/:id/sub-tool-parameters
 *
 * Returns input parameters from all allocated actions.
 * This allows the UI to show which parameters can be inherited from sub-tools.
 */
export const GET = withApiAuth(async (request: NextRequest, { tenant }) => {
  try {
    const agenticToolId = extractAgenticToolId(request);
    console.log('[SUB_TOOL_PARAMS] Request for tool:', agenticToolId);

    if (!agenticToolId) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_REQUEST',
            message: 'Agentic tool ID is required',
          },
        },
        { status: 400 }
      );
    }

    // Get the agentic tool
    const agenticTool = await getAgenticToolById(agenticToolId, tenant.id);
    console.log(
      '[SUB_TOOL_PARAMS] Tool allocation:',
      JSON.stringify(agenticTool.toolAllocation, null, 2)
    );
    const toolAllocation = agenticTool.toolAllocation as ToolAllocation;

    // Get all action references from tool allocation
    const actionRefs = [
      ...(toolAllocation?.targetActions ?? []),
      ...(toolAllocation?.availableTools ?? []),
    ];
    console.log('[SUB_TOOL_PARAMS] Action refs found:', actionRefs.length, actionRefs);

    if (actionRefs.length === 0) {
      console.log('[SUB_TOOL_PARAMS] No action refs, returning empty');
      return NextResponse.json(
        {
          success: true,
          parameters: [],
        },
        { status: 200 }
      );
    }

    // Collect parameters from all actions
    const allParameters: SubToolParameter[] = [];
    const seenParams = new Set<string>(); // Track unique params by name+source

    for (const actionRef of actionRefs) {
      try {
        const action = await getAction(tenant.id, actionRef.actionId);
        const inputSchema = action.inputSchema as {
          properties?: Record<string, JsonSchemaProperty>;
          required?: string[];
        };

        const params = extractParameters(inputSchema, actionRef.actionSlug, action.name);

        for (const param of params) {
          const key = `${param.source}:${param.name}`;
          if (!seenParams.has(key)) {
            seenParams.add(key);
            allParameters.push(param);
          }
        }
      } catch {
        // Skip actions that can't be found
        continue;
      }
    }

    console.log('[SUB_TOOL_PARAMS] Total parameters found:', allParameters.length);
    return NextResponse.json(
      {
        success: true,
        parameters: allParameters,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('[SUB_TOOL_PARAMS] Error:', error);
    if (error instanceof AgenticToolError) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: error.code,
            message: error.message,
          },
        },
        { status: error.statusCode }
      );
    }

    console.error('[AGENTIC_TOOL_SUB_TOOL_PARAMS] Error:', error);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message:
            error instanceof Error
              ? error.message
              : 'An error occurred fetching sub-tool parameters',
        },
      },
      { status: 500 }
    );
  }
});
