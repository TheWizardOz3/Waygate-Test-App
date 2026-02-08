/**
 * Single Drift Report Endpoint
 *
 * GET  /api/v1/integrations/:id/drift/reports/:reportId
 * PATCH /api/v1/integrations/:id/drift/reports/:reportId
 *
 * Get report detail or update report status (acknowledge/resolve/dismiss).
 */

import { NextRequest, NextResponse } from 'next/server';
import { withApiAuth } from '@/lib/api/middleware/auth';
import { getReport, updateReportStatus } from '@/lib/modules/schema-drift/schema-drift.service';
import { UpdateDriftReportStatusSchema } from '@/lib/modules/schema-drift/schema-drift.schemas';
import { SchemaDriftError } from '@/lib/modules/schema-drift/schema-drift.errors';

/**
 * Extract integration ID and report ID from URL path
 * URL pattern: /api/v1/integrations/{id}/drift/reports/{reportId}
 */
function extractIds(url: string): { integrationId: string | null; reportId: string | null } {
  const urlObj = new URL(url);
  const pathParts = urlObj.pathname.split('/');

  const integrationsIndex = pathParts.indexOf('integrations');
  const reportsIndex = pathParts.indexOf('reports');

  const integrationId = integrationsIndex !== -1 ? pathParts[integrationsIndex + 1] : null;
  const reportId = reportsIndex !== -1 ? pathParts[reportsIndex + 1] : null;

  return { integrationId, reportId };
}

/**
 * GET /api/v1/integrations/:id/drift/reports/:reportId
 *
 * Fetch a single drift report by ID.
 */
export const GET = withApiAuth(async (request: NextRequest, { tenant }) => {
  try {
    const { reportId } = extractIds(request.url);

    if (!reportId) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_REQUEST',
            message: 'Report ID is required',
          },
        },
        { status: 400 }
      );
    }

    const report = await getReport(tenant.id, reportId);

    return NextResponse.json(
      {
        success: true,
        data: report,
      },
      { status: 200 }
    );
  } catch (error) {
    if (error instanceof SchemaDriftError) {
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

    console.error('[DRIFT_REPORT_GET] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'An error occurred while fetching the drift report',
        },
      },
      { status: 500 }
    );
  }
});

/**
 * PATCH /api/v1/integrations/:id/drift/reports/:reportId
 *
 * Update drift report status: acknowledge, resolve, or dismiss.
 */
export const PATCH = withApiAuth(async (request: NextRequest, { tenant }) => {
  try {
    const { reportId } = extractIds(request.url);

    if (!reportId) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_REQUEST',
            message: 'Report ID is required',
          },
        },
        { status: 400 }
      );
    }

    const body = await request.json();
    const validationResult = UpdateDriftReportStatusSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request body',
            details: validationResult.error.flatten(),
          },
        },
        { status: 400 }
      );
    }

    const updated = await updateReportStatus(tenant.id, reportId, validationResult.data);

    return NextResponse.json(
      {
        success: true,
        data: updated,
      },
      { status: 200 }
    );
  } catch (error) {
    if (error instanceof SchemaDriftError) {
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

    console.error('[DRIFT_REPORT_UPDATE] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'An error occurred while updating the drift report',
        },
      },
      { status: 500 }
    );
  }
});
