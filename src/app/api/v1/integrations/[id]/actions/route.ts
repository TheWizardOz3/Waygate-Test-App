/**
 * Actions List Endpoint
 *
 * GET /api/v1/integrations/:id/actions
 *
 * List all actions for an integration with pagination and filtering.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withApiAuth } from '@/lib/api/middleware/auth';
import { listActions, ActionError } from '@/lib/modules/actions';

export const GET = withApiAuth(async (request: NextRequest, { tenant }) => {
  try {
    // Extract integration ID from URL
    const url = new URL(request.url);
    const pathParts = url.pathname.split('/');
    const integrationIdIndex = pathParts.indexOf('integrations') + 1;
    const integrationId = pathParts[integrationIdIndex];

    if (!integrationId) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_REQUEST',
            message: 'Integration ID is required',
          },
        },
        { status: 400 }
      );
    }

    // Parse query parameters
    const searchParams = url.searchParams;
    const httpMethodParam = searchParams.get('httpMethod');
    const validHttpMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;
    const httpMethod =
      httpMethodParam &&
      validHttpMethods.includes(httpMethodParam as (typeof validHttpMethods)[number])
        ? (httpMethodParam as (typeof validHttpMethods)[number])
        : undefined;

    const query = {
      cursor: searchParams.get('cursor') || undefined,
      limit: searchParams.get('limit') ? parseInt(searchParams.get('limit')!, 10) : undefined,
      search: searchParams.get('search') || undefined,
      tags: searchParams.get('tags') || undefined,
      httpMethod,
      cacheable: searchParams.has('cacheable')
        ? searchParams.get('cacheable') === 'true'
        : undefined,
    };

    // List actions
    const result = await listActions(tenant.id, integrationId, query);

    return NextResponse.json(
      {
        success: true,
        data: {
          actions: result.actions,
          pagination: result.pagination,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    if (error instanceof ActionError) {
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

    console.error('List actions error:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'An error occurred while fetching actions',
        },
      },
      { status: 500 }
    );
  }
});
