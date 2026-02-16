/**
 * Connection User Credential Stats Endpoint
 *
 * GET /api/v1/connections/:id/user-credential-stats
 *
 * Returns end-user credential counts by status for a specific connection.
 * Used by the UI to display credential health summary on the connection detail panel.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withApiAuth } from '@/lib/api/middleware/auth';
import { getConnectionById, ConnectionError } from '@/lib/modules/connections';
import { getUserCredentialStats } from '@/lib/modules/app-user-credentials';

function extractConnectionId(url: string): string | null {
  const urlObj = new URL(url);
  const pathParts = urlObj.pathname.split('/');
  const connectionsIndex = pathParts.indexOf('connections');
  if (connectionsIndex === -1) return null;
  return pathParts[connectionsIndex + 1] || null;
}

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

    // Verify connection exists and belongs to tenant
    await getConnectionById(connectionId, tenant.id);

    const stats = await getUserCredentialStats(connectionId);
    const total = Object.values(stats).reduce((a, b) => a + b, 0);

    return NextResponse.json(
      {
        success: true,
        data: {
          connectionId,
          total,
          byStatus: stats,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    if (error instanceof ConnectionError) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: error.code,
            message: error.message,
            suggestedResolution: {
              action: 'RETRY_WITH_MODIFIED_INPUT',
              description: 'The specified connection was not found',
              retryable: false,
            },
          },
        },
        { status: error.statusCode }
      );
    }

    console.error('[CONNECTION_USER_CREDENTIAL_STATS] Error:', error);

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
