/**
 * GET /api/v1/integrations/:id/scraped-pages
 *
 * Returns the list of documentation pages that have been scraped for an integration,
 * along with the date each page was last scraped. Aggregates across all completed
 * scrape jobs for the integration's documentation URL.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withApiAuth } from '@/lib/api/middleware/auth';
import { getIntegrationById, IntegrationError } from '@/lib/modules/integrations';
import { findAllScrapeJobsByUrl } from '@/lib/modules/ai/scrape-job.repository';

interface ScrapedPage {
  url: string;
  lastScrapedAt: string;
}

interface ScrapedPagesResponse {
  success: boolean;
  data: {
    pages: ScrapedPage[];
    documentationUrl: string | null;
    totalJobs: number;
  };
}

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

    // Get the integration
    const integration = await getIntegrationById(tenant.id, integrationId);

    if (!integration.documentationUrl) {
      return NextResponse.json<ScrapedPagesResponse>(
        {
          success: true,
          data: {
            pages: [],
            documentationUrl: null,
            totalJobs: 0,
          },
        },
        { status: 200 }
      );
    }

    // Find all completed scrape jobs for this documentation URL (newest first)
    const scrapeJobs = await findAllScrapeJobsByUrl(tenant.id, integration.documentationUrl);

    if (scrapeJobs.length === 0) {
      return NextResponse.json<ScrapedPagesResponse>(
        {
          success: true,
          data: {
            pages: [],
            documentationUrl: integration.documentationUrl,
            totalJobs: 0,
          },
        },
        { status: 200 }
      );
    }

    // Aggregate pages across all scrape jobs, deduplicating by URL
    // Jobs are ordered newest-first, so first occurrence = most recent scrape date
    const pageMap = new Map<string, string>();

    for (const job of scrapeJobs) {
      const result = job.result as { metadata?: { sourceUrls?: string[] } } | null;
      const sourceUrls = result?.metadata?.sourceUrls ?? [];
      // Also include specificUrls (explicitly-requested pages)
      const allUrls = Array.from(new Set([...sourceUrls, ...job.specificUrls]));
      const scrapedAt = job.completedAt?.toISOString() ?? job.updatedAt.toISOString();

      for (const pageUrl of allUrls) {
        if (pageUrl && !pageMap.has(pageUrl)) {
          pageMap.set(pageUrl, scrapedAt);
        }
      }
    }

    // Convert to sorted array
    const pages: ScrapedPage[] = Array.from(pageMap.entries())
      .map(([pageUrl, lastScrapedAt]) => ({ url: pageUrl, lastScrapedAt }))
      .sort((a, b) => a.url.localeCompare(b.url));

    return NextResponse.json<ScrapedPagesResponse>(
      {
        success: true,
        data: {
          pages,
          documentationUrl: integration.documentationUrl,
          totalJobs: scrapeJobs.length,
        },
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
          },
        },
        { status: error.statusCode }
      );
    }

    console.error('Get scraped pages error:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'An error occurred while fetching scraped pages',
        },
      },
      { status: 500 }
    );
  }
});
