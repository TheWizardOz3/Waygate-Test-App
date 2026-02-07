/**
 * Batch Operations Endpoint
 *
 * POST /api/v1/batch — Submit a batch operation for background processing.
 *
 * @route POST /api/v1/batch
 */

import { NextRequest, NextResponse } from 'next/server';
import { withApiAuth } from '@/lib/api/middleware/auth';
import { submitBatchOperation } from '@/lib/modules/batch-operations/batch-operations.service';
import {
  BatchOperationError,
  BatchValidationError,
} from '@/lib/modules/batch-operations/batch-operations.errors';

/**
 * POST /api/v1/batch
 *
 * Body:
 * - integrationSlug: string
 * - actionSlug: string
 * - items: Array<{ input: Record<string, unknown> }>
 * - config?: { concurrency?, delayMs?, timeoutSeconds?, skipInvalidItems? }
 *
 * Returns 202 with { jobId, status, itemCount, hasBulkRoute }
 */
export const POST = withApiAuth(async (request: NextRequest, { tenant }) => {
  try {
    const body = await request.json();

    const result = await submitBatchOperation(tenant.id, body);

    return NextResponse.json(
      {
        success: true,
        data: result,
      },
      { status: 202 }
    );
  } catch (error) {
    if (error instanceof BatchValidationError) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: error.code,
            message: error.message,
            details: {
              validCount: error.validCount,
              invalidCount: error.invalidCount,
              itemErrors: error.itemErrors,
            },
            suggestedResolution: {
              action: 'RETRY_WITH_MODIFIED_INPUT',
              description:
                'Fix the invalid items and resubmit, or set config.skipInvalidItems to true to skip invalid items.',
              retryable: true,
            },
          },
        },
        { status: error.statusCode }
      );
    }

    if (error instanceof BatchOperationError) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: error.code,
            message: error.message,
            suggestedResolution: {
              action: 'RETRY_WITH_MODIFIED_INPUT',
              description: error.message,
              retryable: true,
            },
          },
        },
        { status: error.statusCode }
      );
    }

    // Handle upstream errors (ActionError, IntegrationError) that propagate
    if (error instanceof Error && 'statusCode' in error) {
      const typed = error as Error & { code?: string; statusCode: number };
      return NextResponse.json(
        {
          success: false,
          error: {
            code: typed.code ?? 'UPSTREAM_ERROR',
            message: typed.message,
            suggestedResolution: {
              action: 'RETRY_WITH_MODIFIED_INPUT',
              description: typed.message,
              retryable: true,
            },
          },
        },
        { status: typed.statusCode }
      );
    }

    console.error('[BATCH_SUBMIT] Error:', error);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'An error occurred submitting batch',
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
