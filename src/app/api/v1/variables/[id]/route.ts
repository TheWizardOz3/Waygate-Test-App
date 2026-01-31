/**
 * Single Variable Endpoint
 *
 * GET /api/v1/variables/:id
 * PATCH /api/v1/variables/:id
 * DELETE /api/v1/variables/:id
 *
 * Get, update, or delete a specific variable.
 *
 * @route GET /api/v1/variables/:id
 * @route PATCH /api/v1/variables/:id
 * @route DELETE /api/v1/variables/:id
 */

import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { withApiAuth } from '@/lib/api/middleware/auth';
import {
  getVariableById,
  updateVariableById,
  deleteVariableById,
  VariableError,
  VariableErrorCodes,
} from '@/lib/modules/variables';

/**
 * Extract variable ID from URL path
 * URL pattern: /api/v1/variables/{id}
 */
function extractVariableId(url: string): string | null {
  const urlObj = new URL(url);
  const pathParts = urlObj.pathname.split('/');

  // Find 'variables' in path and get the next segment
  const variablesIndex = pathParts.indexOf('variables');
  if (variablesIndex === -1) {
    return null;
  }

  const nextPart = pathParts[variablesIndex + 1];
  // Skip if the next part is a sub-route like 'resolve'
  if (!nextPart || nextPart === 'resolve') {
    return null;
  }

  return nextPart;
}

/**
 * GET /api/v1/variables/:id
 *
 * Returns a specific variable by ID.
 */
export const GET = withApiAuth(async (request: NextRequest, { tenant }) => {
  try {
    const variableId = extractVariableId(request.url);

    if (!variableId) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_REQUEST',
            message: 'Variable ID is required',
            suggestedResolution: {
              action: 'RETRY_WITH_MODIFIED_INPUT',
              description: 'Include a valid variable ID in the URL path',
              retryable: false,
            },
          },
        },
        { status: 400 }
      );
    }

    const variable = await getVariableById(tenant.id, variableId);

    return NextResponse.json(
      {
        success: true,
        data: variable,
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
              retryable: false,
            },
          },
        },
        { status: error.statusCode }
      );
    }

    console.error('[VARIABLE_GET] Error:', error);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'An error occurred fetching variable',
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
 * PATCH /api/v1/variables/:id
 *
 * Updates a specific variable.
 *
 * Request Body (all fields optional):
 * - `value`: New value (must match valueType or new valueType)
 * - `valueType`: New value type
 * - `sensitive`: Update sensitive flag
 * - `environment`: Update environment scope
 * - `description`: Update description
 */
export const PATCH = withApiAuth(async (request: NextRequest, { tenant }) => {
  try {
    const variableId = extractVariableId(request.url);

    if (!variableId) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_REQUEST',
            message: 'Variable ID is required',
            suggestedResolution: {
              action: 'RETRY_WITH_MODIFIED_INPUT',
              description: 'Include a valid variable ID in the URL path',
              retryable: false,
            },
          },
        },
        { status: 400 }
      );
    }

    const body = await request.json();

    const variable = await updateVariableById(tenant.id, variableId, body);

    return NextResponse.json(
      {
        success: true,
        data: variable,
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
              retryable: false,
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

    console.error('[VARIABLE_UPDATE] Error:', error);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'An error occurred updating variable',
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
 * DELETE /api/v1/variables/:id
 *
 * Deletes a specific variable.
 */
export const DELETE = withApiAuth(async (request: NextRequest, { tenant }) => {
  try {
    const variableId = extractVariableId(request.url);

    if (!variableId) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_REQUEST',
            message: 'Variable ID is required',
            suggestedResolution: {
              action: 'RETRY_WITH_MODIFIED_INPUT',
              description: 'Include a valid variable ID in the URL path',
              retryable: false,
            },
          },
        },
        { status: 400 }
      );
    }

    await deleteVariableById(tenant.id, variableId);

    return NextResponse.json(
      {
        success: true,
        message: 'Variable deleted successfully',
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
              retryable: false,
            },
          },
        },
        { status: error.statusCode }
      );
    }

    console.error('[VARIABLE_DELETE] Error:', error);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'An error occurred deleting variable',
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
      return 'A variable with this key already exists';
    case VariableErrorCodes.INVALID_VARIABLE_VALUE:
      return 'The variable value does not match the declared type';
    case VariableErrorCodes.INVALID_VARIABLE_KEY:
      return 'Variable key must start with a letter and contain only letters, numbers, and underscores';
    case VariableErrorCodes.RESERVED_VARIABLE_KEY:
      return 'This key name is reserved';
    case VariableErrorCodes.MAX_VARIABLES_EXCEEDED:
      return 'Maximum number of variables exceeded for this scope';
    default:
      return 'An error occurred while processing the variable request';
  }
}
