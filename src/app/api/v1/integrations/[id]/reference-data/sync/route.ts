/**
 * Reference Data Sync Endpoints
 *
 * POST /api/v1/integrations/:id/reference-data/sync
 *   - Triggers a manual sync of reference data
 *   - Optionally filter by connectionId or dataType
 *
 * @route POST /api/v1/integrations/:id/reference-data/sync
 *
 * @example
 * ```
 * POST /api/v1/integrations/123e4567-e89b-12d3-a456-426614174000/reference-data/sync
 * Authorization: Bearer wg_live_xxx
 * Content-Type: application/json
 *
 * {
 *   "connectionId": "456...",  // optional
 *   "dataType": "users"        // optional
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "data": {
 *     "jobs": [
 *       { "jobId": "...", "dataType": "users", "actionSlug": "list-users", "status": "completed" }
 *     ]
 *   }
 * }
 * ```
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withApiAuth } from '@/lib/api/middleware/auth';
import { findIntegrationById } from '@/lib/modules/integrations/integration.repository';
import { triggerSync, SyncJobError } from '@/lib/modules/reference-data/sync-job.service';

/**
 * Request body schema for triggering a sync
 */
const TriggerSyncRequestSchema = z.object({
  connectionId: z.string().uuid().optional(),
  dataType: z.string().min(1).max(100).optional(),
  force: z.boolean().optional().default(false),
});

/**
 * POST /api/v1/integrations/:id/reference-data/sync
 *
 * Triggers a manual sync of reference data for an integration.
 *
 * Request Body:
 * - connectionId: (optional) Sync only for a specific connection
 * - dataType: (optional) Sync only a specific data type (e.g., 'users')
 * - force: (optional) Force sync even if already in progress (default: false)
 */
export const POST = withApiAuth(async (request: NextRequest, { tenant }) => {
  try {
    // Extract integration ID from URL
    const integrationId = extractIntegrationId(request.url);

    if (!integrationId) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_REQUEST',
            message: 'Integration ID is required',
            suggestedResolution: {
              action: 'RETRY_WITH_MODIFIED_INPUT',
              description: 'Include a valid integration ID in the URL path',
              retryable: false,
            },
          },
        },
        { status: 400 }
      );
    }

    // Verify integration exists and belongs to tenant
    const integration = await findIntegrationById(integrationId);
    if (!integration || integration.tenantId !== tenant.id) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INTEGRATION_NOT_FOUND',
            message: 'The specified integration does not exist',
            suggestedResolution: {
              action: 'CHECK_INTEGRATION_ID',
              description: 'Verify the integration ID is correct and belongs to your account',
              retryable: false,
            },
          },
        },
        { status: 404 }
      );
    }

    // Parse request body
    let body = {};
    try {
      const text = await request.text();
      if (text) {
        body = JSON.parse(text);
      }
    } catch {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_REQUEST',
            message: 'Invalid JSON in request body',
            suggestedResolution: {
              action: 'RETRY_WITH_MODIFIED_INPUT',
              description: 'Ensure the request body is valid JSON',
              retryable: true,
            },
          },
        },
        { status: 400 }
      );
    }

    // Validate request body
    const parsed = TriggerSyncRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_REQUEST',
            message: 'Invalid request body',
            details: parsed.error.issues,
            suggestedResolution: {
              action: 'RETRY_WITH_MODIFIED_INPUT',
              description: 'Fix the validation issues and retry',
              retryable: true,
            },
          },
        },
        { status: 400 }
      );
    }

    const { connectionId, dataType, force } = parsed.data;

    // Trigger the sync
    const result = await triggerSync({
      tenantId: tenant.id,
      integrationId,
      connectionId,
      dataType,
      force,
    });

    return NextResponse.json(
      {
        success: result.success,
        data: {
          jobs: result.jobs,
          errors: result.errors,
        },
      },
      { status: result.success ? 200 : 207 } // 207 Multi-Status if partial success
    );
  } catch (error) {
    if (error instanceof SyncJobError) {
      const statusCode = getStatusCodeForError(error.code);
      return NextResponse.json(
        {
          success: false,
          error: {
            code: error.code,
            message: error.message,
            details: error.details,
            suggestedResolution: {
              action: getSuggestedActionForError(error.code),
              description: getSuggestedDescriptionForError(error.code),
              retryable: isRetryableError(error.code),
            },
          },
        },
        { status: statusCode }
      );
    }

    console.error('[REFERENCE_DATA_SYNC] Error:', error);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'An error occurred',
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
 * Extract integration ID from URL path
 * URL pattern: /api/v1/integrations/{id}/reference-data/sync
 */
function extractIntegrationId(url: string): string | null {
  const urlObj = new URL(url);
  const pathParts = urlObj.pathname.split('/');

  // Find 'integrations' in path and get the next segment
  const integrationsIndex = pathParts.indexOf('integrations');
  if (integrationsIndex === -1) {
    return null;
  }

  return pathParts[integrationsIndex + 1] || null;
}

/**
 * Get HTTP status code for error
 */
function getStatusCodeForError(code: string): number {
  switch (code) {
    case 'INTEGRATION_NOT_FOUND':
    case 'CONNECTION_NOT_FOUND':
      return 404;
    case 'SYNC_ALREADY_IN_PROGRESS':
      return 409;
    case 'ACTION_NOT_SYNCABLE':
      return 400;
    default:
      return 500;
  }
}

/**
 * Get suggested action for error
 */
function getSuggestedActionForError(code: string): string {
  switch (code) {
    case 'INTEGRATION_NOT_FOUND':
      return 'CHECK_INTEGRATION_ID';
    case 'CONNECTION_NOT_FOUND':
      return 'CREATE_CONNECTION';
    case 'SYNC_ALREADY_IN_PROGRESS':
      return 'WAIT_AND_RETRY';
    case 'ACTION_NOT_SYNCABLE':
      return 'CONFIGURE_REFERENCE_DATA';
    default:
      return 'ESCALATE_TO_ADMIN';
  }
}

/**
 * Get suggested description for error
 */
function getSuggestedDescriptionForError(code: string): string {
  switch (code) {
    case 'INTEGRATION_NOT_FOUND':
      return 'Verify the integration ID is correct and belongs to your account';
    case 'CONNECTION_NOT_FOUND':
      return 'Create a connection for this integration before syncing reference data';
    case 'SYNC_ALREADY_IN_PROGRESS':
      return 'Wait for the current sync to complete, or use force=true to override';
    case 'ACTION_NOT_SYNCABLE':
      return 'Configure reference data settings on actions that can provide reference data';
    default:
      return 'An internal error occurred. Please try again or contact support.';
  }
}

/**
 * Check if error is retryable
 */
function isRetryableError(code: string): boolean {
  return code === 'SYNC_ALREADY_IN_PROGRESS' || code === 'SYNC_FAILED';
}
