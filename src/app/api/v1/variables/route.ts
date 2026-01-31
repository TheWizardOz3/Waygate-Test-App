/**
 * Variables List Endpoint
 *
 * GET /api/v1/variables
 * POST /api/v1/variables
 *
 * List and create tenant-level variables.
 *
 * @route GET /api/v1/variables
 * @route POST /api/v1/variables
 */

import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { withApiAuth } from '@/lib/api/middleware/auth';
import {
  listTenantVariables,
  createTenantVariable,
  VariableError,
  VariableErrorCodes,
} from '@/lib/modules/variables';

/**
 * GET /api/v1/variables
 *
 * Returns paginated list of tenant-level variables.
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

    const result = await listTenantVariables(tenant.id, cleanQuery);

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

    console.error('[VARIABLES_LIST] Error:', error);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'An error occurred fetching variables',
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
 * POST /api/v1/variables
 *
 * Creates a new tenant-level variable.
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
    const body = await request.json();

    const variable = await createTenantVariable(tenant.id, body);

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

    console.error('[VARIABLES_CREATE] Error:', error);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'An error occurred creating variable',
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
      return 'A variable with this key already exists. Choose a different key.';
    case VariableErrorCodes.INVALID_VARIABLE_VALUE:
      return 'The variable value does not match the declared type';
    case VariableErrorCodes.INVALID_VARIABLE_KEY:
      return 'Variable key must start with a letter and contain only letters, numbers, and underscores';
    case VariableErrorCodes.RESERVED_VARIABLE_KEY:
      return 'This key name is reserved. Use a different key.';
    case VariableErrorCodes.MAX_VARIABLES_EXCEEDED:
      return 'Maximum number of variables exceeded for this scope';
    default:
      return 'An error occurred while processing the variable request';
  }
}
