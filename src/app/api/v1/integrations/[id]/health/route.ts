/**
 * Integration Health Endpoint
 *
 * GET /api/v1/integrations/:id/health
 *
 * Returns the health status of an integration, including:
 * - Overall health status (healthy, degraded, unhealthy)
 * - Credential status and expiration
 * - Circuit breaker status
 * - Last successful request time
 *
 * @route GET /api/v1/integrations/:id/health
 *
 * @example
 * ```
 * GET /api/v1/integrations/123e4567-e89b-12d3-a456-426614174000/health
 * Authorization: Bearer wg_live_xxx
 *
 * Response:
 * {
 *   "success": true,
 *   "data": {
 *     "status": "healthy",
 *     "credentials": {
 *       "status": "active",
 *       "expiresAt": "2026-01-03T10:00:00.000Z",
 *       "needsRefresh": false
 *     },
 *     "circuitBreaker": {
 *       "status": "closed",
 *       "failureCount": 0
 *     },
 *     "lastSuccessfulRequest": "2026-01-02T15:30:00.000Z"
 *   }
 * }
 * ```
 */

import { NextRequest, NextResponse } from 'next/server';
import { withApiAuth } from '@/lib/api/middleware/auth';
import { checkHealth, IntegrationError } from '@/lib/modules/integrations';
import type { IntegrationHealthResponse } from '@/lib/modules/gateway';

/**
 * GET /api/v1/integrations/:id/health
 *
 * Returns detailed health information for an integration.
 *
 * Health Status Meanings:
 * - `healthy`: Integration is fully operational
 * - `degraded`: Integration is operational but has issues (e.g., credentials expiring soon, circuit half-open)
 * - `unhealthy`: Integration is not operational (e.g., no credentials, circuit open, disabled)
 */
export const GET = withApiAuth(async (request: NextRequest, { tenant }) => {
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

    // Check integration health
    const healthData = await checkHealth(tenant.id, integrationId);

    const response: IntegrationHealthResponse = {
      success: true,
      data: healthData,
    };

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    if (error instanceof IntegrationError) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: error.code,
            message: error.message,
            suggestedResolution: {
              action: 'CHECK_INTEGRATION_CONFIG',
              description: getErrorDescription(error.code),
              retryable: false,
            },
          },
        },
        { status: error.statusCode }
      );
    }

    console.error('[INTEGRATION_HEALTH] Error:', error);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'An error occurred checking health',
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
 * URL pattern: /api/v1/integrations/{id}/health
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
 * Get human-readable error description
 */
function getErrorDescription(code: string): string {
  switch (code) {
    case 'INTEGRATION_NOT_FOUND':
      return 'The specified integration does not exist or does not belong to your account';
    case 'INTEGRATION_DISABLED':
      return 'The integration has been disabled. Enable it from the dashboard to restore functionality.';
    default:
      return 'An error occurred while checking integration health';
  }
}
