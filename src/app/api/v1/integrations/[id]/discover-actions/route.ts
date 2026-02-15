/**
 * POST /api/v1/integrations/:id/discover-actions
 *
 * Discovers new actions for an integration using AI scraping with a wishlist.
 * Merges newly discovered actions with existing cached results.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withApiAuth } from '@/lib/api/middleware/auth';
import { getIntegrationById, IntegrationError } from '@/lib/modules/integrations';
import { createScrapeJob, startJobProcessing } from '@/lib/modules/ai';
import { findScrapeJobByUrl } from '@/lib/modules/ai/scrape-job.repository';
import type { ApiEndpoint } from '@/lib/modules/ai/scrape-job.schemas';

const DiscoverActionsInputSchema = z.object({
  wishlist: z.array(z.string()).min(1, 'At least one wishlist item is required'),
  forceRescrape: z.boolean().optional().default(false),
  specificUrls: z
    .array(z.string().url('Invalid URL in specificUrls'))
    .max(20, 'Maximum 20 specific URLs')
    .optional(),
});

export const POST = withApiAuth(async (request: NextRequest, { tenant }) => {
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

    // Parse and validate input
    const body = await request.json();
    const validationResult = DiscoverActionsInputSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid input',
            details: validationResult.error.flatten(),
          },
        },
        { status: 400 }
      );
    }

    const { wishlist, forceRescrape, specificUrls } = validationResult.data;

    // Get the integration
    const integration = await getIntegrationById(tenant.id, integrationId);

    if (!integration.documentationUrl) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'NO_DOCUMENTATION_URL',
            message: 'This integration does not have a documentation URL configured',
          },
        },
        { status: 400 }
      );
    }

    // Find existing scrape job to get existing endpoints count
    const existingScrapeJob = await findScrapeJobByUrl(tenant.id, integration.documentationUrl);
    const existingEndpoints: ApiEndpoint[] = existingScrapeJob?.result
      ? ((existingScrapeJob.result as { endpoints?: ApiEndpoint[] }).endpoints ?? [])
      : [];

    // Create a new scrape job with the wishlist
    // The createScrapeJob function handles merging with existing results
    // When specificUrls are provided, force a fresh scrape (user explicitly wants those pages)
    const createResult = await createScrapeJob(
      tenant.id,
      {
        documentationUrl: integration.documentationUrl,
        specificUrls,
        wishlist,
      },
      { force: forceRescrape || !!specificUrls?.length }
    );

    // If job already completed (cache hit but with new wishlist), return immediately
    if (createResult.status === 'COMPLETED') {
      return NextResponse.json(
        {
          success: true,
          data: {
            jobId: createResult.jobId,
            status: 'COMPLETED',
            message: 'Discovery complete. Results are ready.',
            existingEndpointCount: existingEndpoints.length,
          },
        },
        { status: 200 }
      );
    }

    // Start background processing
    startJobProcessing(createResult.jobId, {
      crawlMode: true,
      maxPages: 20,
      maxDepth: 3,
    });

    return NextResponse.json(
      {
        success: true,
        data: {
          jobId: createResult.jobId,
          message: 'Discovery started. Poll the job status for results.',
          existingEndpointCount: existingEndpoints.length,
        },
      },
      { status: 202 }
    );
  } catch (error) {
    if (error instanceof IntegrationError) {
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

    console.error('Discover actions error:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'An error occurred while discovering actions',
        },
      },
      { status: 500 }
    );
  }
});
