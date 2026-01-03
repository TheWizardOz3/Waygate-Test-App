/**
 * Single Integration Endpoint
 *
 * GET /api/v1/integrations/:id
 * PATCH /api/v1/integrations/:id
 * DELETE /api/v1/integrations/:id
 *
 * Get, update, or delete a specific integration.
 *
 * @route GET /api/v1/integrations/:id
 * @route PATCH /api/v1/integrations/:id
 * @route DELETE /api/v1/integrations/:id
 */

import { NextRequest, NextResponse } from 'next/server';
import { withApiAuth } from '@/lib/api/middleware/auth';
import {
  getIntegrationById,
  updateIntegration,
  deleteIntegration,
  IntegrationError,
} from '@/lib/modules/integrations';

/**
 * Extract integration ID from URL path
 * URL pattern: /api/v1/integrations/{id}
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
 * GET /api/v1/integrations/:id
 *
 * Returns a specific integration by ID.
 */
export const GET = withApiAuth(async (request: NextRequest, { tenant }) => {
  try {
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

    const integration = await getIntegrationById(tenant.id, integrationId);

    return NextResponse.json(
      {
        success: true,
        data: integration,
      },
      { status: 200 }
    );
  } catch (error) {
    if (error instanceof IntegrationError) {
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

    console.error('[INTEGRATION_GET] Error:', error);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message:
            error instanceof Error ? error.message : 'An error occurred fetching integration',
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
 * PATCH /api/v1/integrations/:id
 *
 * Updates a specific integration.
 *
 * Request Body (all fields optional):
 * - `name`: Display name
 * - `description`: Description
 * - `documentationUrl`: Link to API docs
 * - `authConfig`: Authentication configuration
 * - `tags`: Array of tags
 * - `metadata`: Additional metadata
 * - `status`: Integration status
 */
export const PATCH = withApiAuth(async (request: NextRequest, { tenant }) => {
  try {
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

    const body = await request.json();

    const integration = await updateIntegration(tenant.id, integrationId, body);

    return NextResponse.json(
      {
        success: true,
        data: integration,
      },
      { status: 200 }
    );
  } catch (error) {
    if (error instanceof IntegrationError) {
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

    console.error('[INTEGRATION_UPDATE] Error:', error);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message:
            error instanceof Error ? error.message : 'An error occurred updating integration',
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
 * DELETE /api/v1/integrations/:id
 *
 * Deletes a specific integration and all its associated data.
 */
export const DELETE = withApiAuth(async (request: NextRequest, { tenant }) => {
  try {
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

    await deleteIntegration(tenant.id, integrationId);

    return NextResponse.json(
      {
        success: true,
        message: 'Integration deleted successfully',
      },
      { status: 200 }
    );
  } catch (error) {
    if (error instanceof IntegrationError) {
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

    console.error('[INTEGRATION_DELETE] Error:', error);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message:
            error instanceof Error ? error.message : 'An error occurred deleting integration',
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
    case 'INTEGRATION_NOT_FOUND':
      return 'The specified integration was not found';
    case 'INVALID_AUTH_CONFIG':
      return 'Invalid authentication configuration provided. Check the format and try again.';
    case 'INTEGRATION_DISABLED':
      return 'This integration is currently disabled.';
    default:
      return 'An error occurred while processing the integration request';
  }
}
