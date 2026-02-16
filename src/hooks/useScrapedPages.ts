/**
 * Scraped Pages Hooks
 *
 * React Query hook for fetching scraped documentation pages for an integration.
 */

import { useQuery } from '@tanstack/react-query';
import { client } from '@/lib/api/client';

// =============================================================================
// Query Keys
// =============================================================================

export const scrapedPageKeys = {
  all: ['scraped-pages'] as const,
  list: (integrationId: string) => [...scrapedPageKeys.all, integrationId] as const,
};

// =============================================================================
// Types
// =============================================================================

export interface ScrapedPage {
  url: string;
  lastScrapedAt: string;
}

export interface ScrapedPagesData {
  pages: ScrapedPage[];
  documentationUrl: string | null;
  totalJobs: number;
}

// =============================================================================
// Hooks
// =============================================================================

/**
 * Hook to fetch scraped documentation pages for an integration
 */
export function useScrapedPages(integrationId: string | undefined) {
  return useQuery({
    queryKey: scrapedPageKeys.list(integrationId!),
    queryFn: () => client.actions.getScrapedPages(integrationId!),
    enabled: !!integrationId,
    staleTime: 5 * 60 * 1000, // 5 minutes — scrape data changes rarely
  });
}
