/**
 * Connection Variables Endpoint
 *
 * GET /api/v1/connections/:id/variables
 * POST /api/v1/connections/:id/variables
 *
 * List and create connection-level variables.
 *
 * @route GET /api/v1/connections/:id/variables
 * @route POST /api/v1/connections/:id/variables
 */

import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { withApiAuth } from '@/lib/api/middleware/auth';
import {
  listConnectionVariables,
  createConnectionVariable,
  VariableError,
  VariableErrorCodes,
} from '@/lib/modules/variables';

/**
 * Extract connection ID from URL path
 * URL pattern: /api/v1/connections/{id}/variables
 */
function extractConnectionId(url: string): string | null {
  const urlObj = new URL(url);
  const pathParts = urlObj.pathname.split('/');

  // Find 'connections' in path and get the next segment
  const connectionsIndex = pathParts.indexOf('connections');
  if (connectionsIndex === -1) {
    return null;
  }

  return pathParts[connectionsIndex + 1] || null;
}

/**
 * GET /api/v1/connections/:id/variables
 *
 * Returns paginated list of connection-level variables.
 *
 * Query Parameters:
 * - `cursor` (optional): Pagination cursor from previous response
 * - `limit` (optional): Number of variables per page (1-500, default: 100)
 * - `environment` (optional): Filter by environment (development, staging, production)
 * - `sensitive` (optional): Filter by sensitive flag (true/false)
 * - `search` (optional): Search by key or description
 */
export const GET = withApiAuth(async (request: NextRequest, { tenant }) => {
  try {
    const connectionId = extractConnectionId(request.url);

    if (!connectionId) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_REQUEST',
            message: 'Connection ID is required',
            suggestedResolution: {
              action: 'RETRY_WITH_MODIFIED_INPUT',
              description: 'Include a valid connection ID in the URL path',
              retryable: false,
            },
          },
        },
        { status: 400 }
      );
    }

    const url = new URL(request.url);
    const query = {
      cursor: url.searchParams.get('cursor') ?? undefined,
      limit: url.searchParams.get('limit') ?? undefined,
      environment: url.searchParams.get('environment') ?? undefined,
      sensitive: url.searchParams.get('sensitive') ?? undefined,
      search: url.searchParams.get('search') ?? undefined,
    };

    // Filter out undefined values
    const cleanQuery = Object.fromEntries(Object.entries(query).filter(([, v]) => v !== undefined));

    const result = await listConnectionVariables(tenant.id, connectionId, cleanQuery);

    return NextResponse.json(
      {
        success: true,
        data: result,
      },
      { status: 200 }
    );
  } catch (error) {
    if (error instanceof VariableError) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: error.code,
            message: error.message,
            suggestedResolution: {
              action: 'RETRY_WITH_MODIFIED_INPUT',
              description: getErrorDescription(error.code),
              retryable: true,
            },
          },
        },
        { status: error.statusCode }
      );
    }

    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid query parameters',
            details: error.issues,
            suggestedResolution: {
              action: 'RETRY_WITH_MODIFIED_INPUT',
              description: 'Check query parameter values and try again',
              retryable: true,
            },
          },
        },
        { status: 400 }
      );
    }

    console.error('[CONNECTION_VARIABLES_LIST] Error:', error);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message:
            error instanceof Error
              ? error.message
              : 'An error occurred fetching connection variables',
          suggestedResolution: {
            action: 'ESCALATE_TO_ADMIN',
            description: 'An internal error occurred. Please try again or contact support.',
            retryable: false,
          },
        },
      },
      { status: 500 }
    );
  }
});

/**
 * POST /api/v1/connections/:id/variables
 *
 * Creates a new connection-level variable.
 *
 * Request Body:
 * - `key` (required): Variable name (alphanumeric, underscores, starting with letter)
 * - `value` (required): Variable value (must match valueType)
 * - `valueType` (required): Type of value (string, number, boolean, json)
 * - `sensitive` (optional): Whether to encrypt and mask the value (default: false)
 * - `environment` (optional): Environment scope (development, staging, production, or null for all)
 * - `description` (optional): Human-readable description
 */
export const POST = withApiAuth(async (request: NextRequest, { tenant }) => {
  try {
    const connectionId = extractConnectionId(request.url);

    if (!connectionId) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_REQUEST',
            message: 'Connection ID is required',
            suggestedResolution: {
              action: 'RETRY_WITH_MODIFIED_INPUT',
              description: 'Include a valid connection ID in the URL path',
              retryable: false,
            },
          },
        },
        { status: 400 }
      );
    }

    const body = await request.json();

    const variable = await createConnectionVariable(tenant.id, connectionId, body);

    return NextResponse.json(
      {
        success: true,
        data: variable,
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof VariableError) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: error.code,
            message: error.message,
            suggestedResolution: {
              action: 'RETRY_WITH_MODIFIED_INPUT',
              description: getErrorDescription(error.code),
              retryable: error.statusCode !== 409,
            },
          },
        },
        { status: error.statusCode }
      );
    }

    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request body',
            details: error.issues,
            suggestedResolution: {
              action: 'RETRY_WITH_MODIFIED_INPUT',
              description: 'Check request body values and try again',
              retryable: true,
            },
          },
        },
        { status: 400 }
      );
    }

    console.error('[CONNECTION_VARIABLES_CREATE] Error:', error);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message:
            error instanceof Error
              ? error.message
              : 'An error occurred creating connection variable',
          suggestedResolution: {
            action: 'ESCALATE_TO_ADMIN',
            description: 'An internal error occurred. Please try again or contact support.',
            retryable: false,
          },
        },
      },
      { status: 500 }
    );
  }
});

/**
 * Get human-readable error description
 */
function getErrorDescription(code: string): string {
  switch (code) {
    case VariableErrorCodes.VARIABLE_NOT_FOUND:
      return 'The specified variable was not found';
    case VariableErrorCodes.VARIABLE_KEY_EXISTS:
      return 'A variable with this key already exists for this connection. Choose a different key.';
    case VariableErrorCodes.INVALID_VARIABLE_VALUE:
      return 'The variable value does not match the declared type';
    case VariableErrorCodes.INVALID_VARIABLE_KEY:
      return 'Variable key must start with a letter and contain only letters, numbers, and underscores';
    case VariableErrorCodes.RESERVED_VARIABLE_KEY:
      return 'This key name is reserved. Use a different key.';
    case VariableErrorCodes.CONNECTION_NOT_FOUND:
      return 'The specified connection was not found';
    case VariableErrorCodes.MAX_VARIABLES_EXCEEDED:
      return 'Maximum number of variables exceeded for this connection';
    default:
      return 'An error occurred while processing the variable request';
  }
}
