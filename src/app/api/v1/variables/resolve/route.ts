/**
 * Variable Resolution Preview Endpoint
 *
 * POST /api/v1/variables/resolve
 *
 * Preview how variables will be resolved in a template.
 *
 * @route POST /api/v1/variables/resolve
 */

import { NextRequest, NextResponse } from 'next/server';
import { z, ZodError } from 'zod';
import { withApiAuth } from '@/lib/api/middleware/auth';
import {
  resolveTemplate,
  validateResolvability,
  maskSensitiveValues,
  summarizeResolution,
  VariableResolutionError,
  VariableErrorCodes,
} from '@/lib/modules/variables';
import { findConnectionByIdAndTenant } from '@/lib/modules/connections';

/**
 * Request body schema for resolution preview
 */
const ResolveRequestSchema = z.object({
  /** Template string containing ${...} variable references */
  template: z.string().min(1, 'Template is required'),
  /** Optional connection ID for connection-level variable resolution */
  connectionId: z.string().uuid().optional(),
  /** Optional environment for environment-specific resolution */
  environment: z.enum(['development', 'staging', 'production']).optional(),
  /** Optional runtime context values */
  context: z
    .object({
      current_user: z
        .object({
          id: z.string().nullable().optional(),
          email: z.string().nullable().optional(),
          name: z.string().nullable().optional(),
        })
        .optional(),
    })
    .catchall(z.unknown())
    .optional(),
  /** Whether to actually resolve (false = just validate) */
  resolve: z.boolean().default(true),
});

/**
 * POST /api/v1/variables/resolve
 *
 * Preview variable resolution in a template.
 *
 * Request Body:
 * - `template` (required): Template string with ${...} variable references
 * - `connectionId` (optional): Connection ID for connection-level variables
 * - `environment` (optional): Environment for environment-specific resolution
 * - `context` (optional): Runtime context (current_user, custom vars)
 * - `resolve` (optional): Whether to resolve values (default: true, false = validate only)
 *
 * Response:
 * - `resolved`: The resolved template string (if resolve=true)
 * - `variables`: Array of resolved variable details
 * - `valid`: Whether all variables can be resolved
 * - `missing`: Array of missing variable paths
 * - `summary`: Summary statistics
 */
export const POST = withApiAuth(async (request: NextRequest, { tenant }) => {
  try {
    const body = await request.json();
    const input = ResolveRequestSchema.parse(body);

    // Verify connection if provided
    if (input.connectionId) {
      const connection = await findConnectionByIdAndTenant(input.connectionId, tenant.id);
      if (!connection) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: VariableErrorCodes.CONNECTION_NOT_FOUND,
              message: 'Connection not found',
              suggestedResolution: {
                action: 'RETRY_WITH_MODIFIED_INPUT',
                description: 'Provide a valid connection ID belonging to your tenant',
                retryable: false,
              },
            },
          },
          { status: 404 }
        );
      }
    }

    // Build resolution options
    // Transform optional fields to null (RuntimeContext expects null, not undefined)
    const currentUser = input.context?.current_user;
    const options = {
      tenantId: tenant.id,
      connectionId: input.connectionId,
      environment: input.environment,
      runtimeContext: currentUser
        ? {
            current_user: {
              id: currentUser.id ?? null,
              email: currentUser.email ?? null,
              name: currentUser.name ?? null,
            },
          }
        : undefined,
      requestVariables: input.context,
      throwOnMissing: false,
    };

    if (input.resolve) {
      // Full resolution
      const result = await resolveTemplate(input.template, options);

      // Mask sensitive values in the response
      const maskedResult = maskSensitiveValues(result);
      const summary = summarizeResolution(result);

      return NextResponse.json(
        {
          success: true,
          data: {
            resolved: maskedResult.resolved,
            variables: maskedResult.variables.map((v) => ({
              path: v.reference.path,
              value: v.value,
              source: v.source,
              found: v.found,
              sensitive: v.sensitive,
            })),
            valid: result.allFound,
            missing: result.missing.map((m) => m.path),
            summary,
          },
        },
        { status: 200 }
      );
    } else {
      // Validation only (no actual resolution)
      const validation = await validateResolvability(input.template, options);

      return NextResponse.json(
        {
          success: true,
          data: {
            valid: validation.valid,
            resolvable: validation.resolvable,
            unresolvable: validation.unresolvable,
          },
        },
        { status: 200 }
      );
    }
  } catch (error) {
    if (error instanceof VariableResolutionError) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'RESOLUTION_ERROR',
            message: error.message,
            details: {
              missingVariables: error.missingReferences.map((r) => r.path),
            },
            suggestedResolution: {
              action: 'RETRY_WITH_MODIFIED_INPUT',
              description: 'Define the missing variables or update the template',
              retryable: true,
            },
          },
        },
        { status: 400 }
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

    console.error('[VARIABLES_RESOLVE] Error:', error);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'An error occurred resolving variables',
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
