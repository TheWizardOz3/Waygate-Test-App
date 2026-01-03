/**
 * Intelligent Crawler
 *
 * Uses Firecrawl's map function combined with LLM-guided link prioritization
 * to intelligently select which documentation pages to scrape. This replaces
 * the basic breadth-first crawling approach with a smarter, more targeted approach.
 *
 * The flow is:
 * 1. Map the entire documentation site using Firecrawl's /map endpoint
 * 2. Have an LLM triage and rank the discovered URLs based on relevance
 * 3. Scrape only the highest-priority pages
 */

import { getLLM } from './llm';
import type { LLMModelId, LLMResponseSchema } from './llm';
import { scrapeUrl, ScrapeError } from './doc-scraper';
import type { CrawledPage } from './doc-scraper';

// =============================================================================
// Types
// =============================================================================

/**
 * Result from Firecrawl's /map endpoint
 */
export interface MapResult {
  /** All URLs discovered on the site */
  urls: string[];
  /** Total number of URLs found */
  totalUrls: number;
  /** Time taken to map the site */
  durationMs: number;
}

/**
 * A URL with its priority score and category from LLM triage
 */
export interface PrioritizedUrl {
  /** The URL */
  url: string;
  /** Priority score (0-100, higher = more important) */
  priority: number;
  /** Category of the page */
  category: UrlCategory;
  /** Why this URL was given this priority */
  reason: string;
  /** Whether this URL matches a wishlist item */
  matchesWishlist: boolean;
  /** Which wishlist items it matches, if any */
  matchedWishlistItems?: string[];
}

/**
 * Categories for URL classification
 */
export type UrlCategory =
  | 'api_endpoint' // Individual API endpoint documentation
  | 'api_reference' // API reference/overview pages
  | 'authentication' // Auth documentation
  | 'getting_started' // Quickstart/setup guides
  | 'rate_limits' // Rate limiting documentation
  | 'sdk_library' // SDK/library documentation
  | 'changelog' // Changelog/release notes
  | 'tutorial' // Tutorials and guides
  | 'other'; // Other pages

/**
 * Options for intelligent crawling
 */
export interface IntelligentCrawlOptions {
  /** Maximum number of pages to scrape (default: 30) */
  maxPages?: number;
  /** Wishlist of desired actions/endpoints to prioritize */
  wishlist?: string[];
  /** Model to use for URL triage (defaults to gemini-3-flash for speed) */
  model?: LLMModelId;
  /** Timeout for each page scrape in ms (default: 60000) */
  pageTimeout?: number;
  /** Delay between requests in ms (default: 500) */
  requestDelay?: number;
  /** Whether to continue on individual page errors (default: true) */
  continueOnError?: boolean;
  /** Callback for progress updates */
  onProgress?: (progress: IntelligentCrawlProgress) => void;
}

/**
 * Progress information during intelligent crawling
 */
export interface IntelligentCrawlProgress {
  /** Current stage */
  stage: 'mapping' | 'triaging' | 'scraping' | 'completed' | 'error';
  /** Human-readable message */
  message: string;
  /** Number of URLs discovered during mapping */
  urlsDiscovered?: number;
  /** Number of URLs selected for scraping after triage */
  urlsSelected?: number;
  /** Number of pages scraped so far */
  pagesCrawled?: number;
  /** Percentage complete (0-100) */
  percentComplete: number;
}

/**
 * Result of intelligent crawling
 */
export interface IntelligentCrawlResult {
  /** The root URL that was crawled */
  rootUrl: string;
  /** All successfully scraped pages */
  pages: CrawledPage[];
  /** Aggregated content from all pages */
  aggregatedContent: string;
  /** Total content length in characters */
  totalContentLength: number;
  /** Prioritized URLs that were considered */
  prioritizedUrls: PrioritizedUrl[];
  /** Total URLs discovered during mapping */
  totalUrlsDiscovered: number;
  /** Number of pages scraped */
  pagesCrawled: number;
  /** Number of pages that failed */
  pagesFailed: number;
  /** URLs that were skipped (low priority) */
  skippedUrls: string[];
  /** Duration of the entire process */
  durationMs: number;
}

// =============================================================================
// Constants
// =============================================================================

/** Default max pages to scrape */
const DEFAULT_MAX_PAGES = 30;

/** Default page timeout */
const DEFAULT_PAGE_TIMEOUT = 60000;

/** Default request delay */
const DEFAULT_REQUEST_DELAY = 500;

/** Default model for triage (use flash for speed) */
const DEFAULT_TRIAGE_MODEL: LLMModelId = 'gemini-3-flash';

/** Maximum URLs to return from map (Firecrawl limit) */
const MAX_MAP_URLS = 5000;

// =============================================================================
// Firecrawl Map Function
// =============================================================================

/**
 * Get the Firecrawl API key
 */
function getFirecrawlApiKey(): string {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) {
    throw new ScrapeError(
      '',
      'CONFIGURATION_ERROR',
      'FIRECRAWL_API_KEY environment variable is not set',
      { retryable: false }
    );
  }
  return apiKey;
}

/**
 * Map a website to discover all URLs using Firecrawl's /map endpoint
 *
 * This is MUCH faster than crawling - it uses sitemaps and intelligent
 * discovery to find all pages without actually scraping their content.
 *
 * @param url - The root URL to map
 * @param options - Map options
 * @returns All discovered URLs
 */
export async function mapWebsite(
  url: string,
  options: {
    /** Search term to filter URLs (optional) */
    search?: string;
    /** Maximum URLs to return (default: 5000) */
    limit?: number;
    /** Timeout in ms (default: 30000) */
    timeout?: number;
  } = {}
): Promise<MapResult> {
  const apiKey = getFirecrawlApiKey();
  const limit = options.limit ?? MAX_MAP_URLS;
  const timeout = options.timeout ?? 30000;

  const startTime = Date.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    console.log(`[Firecrawl Map] Mapping ${url}...`);

    const requestBody: Record<string, unknown> = {
      url,
      limit,
      // Include sitemaps for better coverage
      includeSubdomains: false,
    };

    // Add search term if provided (helps filter to relevant pages)
    if (options.search) {
      requestBody.search = options.search;
    }

    const response = await fetch('https://api.firecrawl.dev/v1/map', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || 'Firecrawl map failed');
    }

    const urls = data.links || [];
    console.log(`[Firecrawl Map] Found ${urls.length} URLs`);

    return {
      urls,
      totalUrls: urls.length,
      durationMs: Date.now() - startTime,
    };
  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof Error && error.name === 'AbortError') {
      throw new ScrapeError(url, 'TIMEOUT', `Map request timed out after ${timeout}ms`, {
        retryable: true,
      });
    }

    throw error;
  }
}

// =============================================================================
// URL Pattern Detection
// =============================================================================

/**
 * URL patterns that indicate different types of documentation
 */
const URL_PATTERNS = {
  // High-priority: API endpoint documentation
  apiEndpoint: [
    /\/api\/v\d+\/[a-z-]+\/?$/i, // /api/v1/users
    /\/methods\/[a-z.-]+\/?$/i, // /methods/chat.postMessage
    /\/endpoints?\/[a-z-]+\/?$/i, // /endpoints/create-user
    /\/reference\/[a-z-]+\/?$/i, // /reference/users
    /\/rest\/[a-z-]+\/?$/i, // /rest/users
    /\/resources?\/[a-z-]+\/?$/i, // /resources/messages
    /\/operations?\/[a-z-]+\/?$/i, // /operations/sendMessage
  ],

  // High-priority: API reference overview
  apiReference: [
    /\/api-reference\/?$/i,
    /\/api-docs?\/?$/i,
    /\/api\/reference\/?$/i,
    /\/reference\/?$/i,
    /\/api\/?$/i,
    /\/rest-api\/?$/i,
    /\/graphql\/?$/i,
  ],

  // High-priority: Authentication
  authentication: [
    /\/auth(entication)?\/?$/i,
    /\/oauth\/?$/i,
    /\/security\/?$/i,
    /\/api-?keys?\/?$/i,
    /\/tokens?\/?$/i,
    /\/credentials?\/?$/i,
    /\/access\/?$/i,
  ],

  // Medium-priority: Getting started
  gettingStarted: [
    /\/getting-?started\/?$/i,
    /\/quickstart\/?$/i,
    /\/quick-?start\/?$/i,
    /\/setup\/?$/i,
    /\/installation?\/?$/i,
    /\/overview\/?$/i,
    /\/introduction\/?$/i,
    /\/basics?\/?$/i,
  ],

  // Medium-priority: Rate limits
  rateLimits: [
    /\/rate-?limits?\/?$/i,
    /\/limits?\/?$/i,
    /\/throttling\/?$/i,
    /\/quotas?\/?$/i,
    /\/usage-?limits?\/?$/i,
  ],

  // Lower priority: Exclude these
  exclude: [
    /\/blog\//i,
    /\/blog\/?$/i,
    /\/news\//i,
    /\/news\/?$/i,
    /\/pricing\/?$/i,
    /\/about\/?$/i,
    /\/contact\/?$/i,
    /\/careers?\/?$/i,
    /\/jobs?\/?$/i,
    /\/login\/?$/i,
    /\/signup\/?$/i,
    /\/register\/?$/i,
    /\/changelog\/?$/i,
    /\/release-?notes?\/?$/i,
    /\/status\/?$/i,
    /\/terms\/?$/i,
    /\/privacy\/?$/i,
    /\/legal\/?$/i,
    /\.(pdf|zip|png|jpg|jpeg|gif|svg|ico|css|js)$/i,
    /\/community\/?$/i,
    /\/forum\/?$/i,
    /\/support\/?$/i,
    /\/help\/?$/i,
  ],
};

/**
 * Detect URL category based on path patterns
 */
export function detectUrlCategory(url: string): {
  category: UrlCategory;
  patternScore: number;
  shouldExclude: boolean;
} {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.toLowerCase();

    // Check exclusions first
    for (const pattern of URL_PATTERNS.exclude) {
      if (pattern.test(path)) {
        return { category: 'other', patternScore: 0, shouldExclude: true };
      }
    }

    // Check for API endpoints (highest priority)
    for (const pattern of URL_PATTERNS.apiEndpoint) {
      if (pattern.test(path)) {
        return { category: 'api_endpoint', patternScore: 90, shouldExclude: false };
      }
    }

    // Check for API reference
    for (const pattern of URL_PATTERNS.apiReference) {
      if (pattern.test(path)) {
        return { category: 'api_reference', patternScore: 85, shouldExclude: false };
      }
    }

    // Check for authentication
    for (const pattern of URL_PATTERNS.authentication) {
      if (pattern.test(path)) {
        return { category: 'authentication', patternScore: 95, shouldExclude: false };
      }
    }

    // Check for rate limits
    for (const pattern of URL_PATTERNS.rateLimits) {
      if (pattern.test(path)) {
        return { category: 'rate_limits', patternScore: 80, shouldExclude: false };
      }
    }

    // Check for getting started
    for (const pattern of URL_PATTERNS.gettingStarted) {
      if (pattern.test(path)) {
        return { category: 'getting_started', patternScore: 70, shouldExclude: false };
      }
    }

    // Check for common API doc indicators in path
    if (/\/(api|docs?|reference|methods|endpoints)\//i.test(path)) {
      return { category: 'api_reference', patternScore: 60, shouldExclude: false };
    }

    // Default
    return { category: 'other', patternScore: 20, shouldExclude: false };
  } catch {
    return { category: 'other', patternScore: 0, shouldExclude: true };
  }
}

/**
 * Pre-filter URLs based on patterns before LLM triage
 * This reduces the number of URLs we send to the LLM
 */
export function preFilterUrls(
  urls: string[],
  rootUrl: string
): { included: string[]; excluded: string[] } {
  const included: string[] = [];
  const excluded: string[] = [];

  let rootHost: string;
  try {
    rootHost = new URL(rootUrl).hostname;
  } catch {
    return { included: urls, excluded: [] };
  }

  for (const url of urls) {
    try {
      const parsed = new URL(url);

      // Must be same host
      if (parsed.hostname !== rootHost) {
        excluded.push(url);
        continue;
      }

      const detection = detectUrlCategory(url);
      if (detection.shouldExclude) {
        excluded.push(url);
      } else {
        included.push(url);
      }
    } catch {
      excluded.push(url);
    }
  }

  return { included, excluded };
}

// =============================================================================
// LLM Triage
// =============================================================================

/**
 * Schema for LLM URL prioritization response
 */
const URL_PRIORITIZATION_SCHEMA: LLMResponseSchema = {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'The URL' },
      priority: {
        type: 'integer',
        description: 'Priority score 0-100 (higher = more important)',
      },
      category: {
        type: 'string',
        enum: [
          'api_endpoint',
          'api_reference',
          'authentication',
          'getting_started',
          'rate_limits',
          'sdk_library',
          'changelog',
          'tutorial',
          'other',
        ],
        description: 'Category of the page',
      },
      reason: { type: 'string', description: 'Brief reason for this priority' },
      matchesWishlist: {
        type: 'boolean',
        description: 'Whether this URL likely matches a wishlist item',
      },
      matchedWishlistItems: {
        type: 'array',
        items: { type: 'string' },
        description: 'Which wishlist items this URL matches',
      },
    },
    required: ['url', 'priority', 'category', 'reason', 'matchesWishlist'],
  },
};

/**
 * Build the prompt for URL triage
 */
function buildTriagePrompt(urls: string[], wishlist?: string[]): string {
  const wishlistSection = wishlist?.length
    ? `
## Wishlist (Prioritize URLs related to these)
The user specifically wants to find these actions/endpoints:
${wishlist.map((w) => `- ${w}`).join('\n')}

NOTE: The wishlist is a guide, not a strict filter. Prioritize matching URLs, but also include
other valuable API documentation. Don't ONLY find wishlist items - we want comprehensive coverage.
`
    : '';

  return `You are an API documentation URL prioritizer. Analyze these URLs from a documentation site and rank them by relevance for understanding and using the API.

## URLs to Analyze
${urls.map((u, i) => `${i + 1}. ${u}`).join('\n')}
${wishlistSection}
## Priority Guidelines

Assign priority scores (0-100) based on these rules:

### Highest Priority (90-100):
- Individual API endpoint documentation (e.g., /api/v1/users/create, /methods/chat.postMessage)
- Authentication/authorization documentation (CRITICAL - we need this)
- API reference overview pages

### High Priority (70-89):
- Rate limiting documentation
- Error handling documentation  
- Getting started/quickstart guides (often contain important context)
- Core API concepts

### Medium Priority (50-69):
- SDK/library documentation (useful for understanding patterns)
- Pagination, filtering, webhooks documentation
- Common patterns documentation

### Lower Priority (30-49):
- Tutorials and guides (less dense info)
- Example applications
- Best practices

### Skip (0-29):
- Blog posts, news, changelogs
- Marketing pages
- Community/forum pages
- Non-documentation pages

## Important Notes
1. Authentication docs are CRITICAL - prioritize them highly
2. Individual endpoint docs are more valuable than overview pages
3. Match against wishlist items but don't be dogmatic - include other valuable pages
4. When in doubt, include rather than exclude

Return a JSON array of prioritized URLs with their scores and categories.`;
}

/**
 * Use LLM to triage and prioritize URLs
 *
 * @param urls - URLs to triage (should be pre-filtered)
 * @param wishlist - Optional wishlist items to prioritize
 * @param model - LLM model to use
 * @returns Prioritized URLs sorted by priority
 */
export async function triageUrls(
  urls: string[],
  wishlist?: string[],
  model: LLMModelId = DEFAULT_TRIAGE_MODEL
): Promise<PrioritizedUrl[]> {
  // If we have too many URLs, batch them
  const BATCH_SIZE = 100;
  const batches: string[][] = [];

  for (let i = 0; i < urls.length; i += BATCH_SIZE) {
    batches.push(urls.slice(i, i + BATCH_SIZE));
  }

  console.log(`[Triage] Processing ${urls.length} URLs in ${batches.length} batches`);

  const llm = getLLM(model);
  const allResults: PrioritizedUrl[] = [];

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    console.log(`[Triage] Processing batch ${i + 1}/${batches.length} (${batch.length} URLs)`);

    const prompt = buildTriagePrompt(batch, wishlist);

    try {
      const result = await llm.generate<PrioritizedUrl[]>(prompt, {
        responseSchema: URL_PRIORITIZATION_SCHEMA,
        temperature: 0.1, // Low temperature for consistent ranking
      });

      allResults.push(...result.content);
    } catch (error) {
      console.error(`[Triage] Batch ${i + 1} failed:`, error);
      // Fall back to pattern-based scoring for this batch
      for (const url of batch) {
        const detection = detectUrlCategory(url);
        allResults.push({
          url,
          priority: detection.patternScore,
          category: detection.category,
          reason: 'Pattern-based fallback (LLM failed)',
          matchesWishlist: false,
        });
      }
    }
  }

  // Sort by priority (descending)
  allResults.sort((a, b) => b.priority - a.priority);

  // Apply wishlist boost if not already applied by LLM
  if (wishlist?.length) {
    const wishlistLower = wishlist.map((w) => w.toLowerCase());
    for (const item of allResults) {
      // Check if URL path contains any wishlist terms
      try {
        const path = new URL(item.url).pathname.toLowerCase();
        const matchedItems = wishlistLower.filter((w) => path.includes(w.replace(/[_\s]+/g, '-')));
        if (matchedItems.length > 0 && !item.matchesWishlist) {
          item.matchesWishlist = true;
          item.matchedWishlistItems = matchedItems;
          // Boost priority if not already high
          item.priority = Math.min(100, item.priority + 15);
        }
      } catch {
        // Ignore URL parsing errors
      }
    }

    // Re-sort after wishlist boost
    allResults.sort((a, b) => b.priority - a.priority);
  }

  return allResults;
}

// =============================================================================
// Main Intelligent Crawl Function
// =============================================================================

/**
 * Intelligently crawl API documentation
 *
 * This function:
 * 1. Maps the entire site to discover URLs (fast)
 * 2. Uses LLM to triage and prioritize URLs
 * 3. Scrapes only the highest-priority pages
 *
 * @param rootUrl - The root documentation URL
 * @param options - Crawl options
 * @returns Aggregated content from the most relevant pages
 */
export async function intelligentCrawl(
  rootUrl: string,
  options: IntelligentCrawlOptions = {}
): Promise<IntelligentCrawlResult> {
  const {
    maxPages = DEFAULT_MAX_PAGES,
    wishlist = [],
    model = DEFAULT_TRIAGE_MODEL,
    pageTimeout = DEFAULT_PAGE_TIMEOUT,
    requestDelay = DEFAULT_REQUEST_DELAY,
    continueOnError = true,
    onProgress,
  } = options;

  const startTime = Date.now();
  const pages: CrawledPage[] = [];
  const skippedUrls: string[] = [];

  // Helper to report progress
  const report = (
    stage: IntelligentCrawlProgress['stage'],
    message: string,
    extra: Partial<IntelligentCrawlProgress> = {}
  ) => {
    onProgress?.({
      stage,
      message,
      percentComplete: 0,
      ...extra,
    });
  };

  try {
    // =========================================================================
    // Stage 1: Map the website
    // =========================================================================
    report('mapping', `Mapping documentation site: ${rootUrl}`, { percentComplete: 5 });

    // Try to focus on docs/api sections if possible
    const mapResult = await mapWebsite(rootUrl, {
      search: 'api docs reference',
      limit: MAX_MAP_URLS,
    });

    report('mapping', `Discovered ${mapResult.urls.length} URLs`, {
      urlsDiscovered: mapResult.urls.length,
      percentComplete: 15,
    });

    // =========================================================================
    // Stage 2: Pre-filter and triage URLs
    // =========================================================================
    report('triaging', 'Pre-filtering URLs based on patterns...', { percentComplete: 20 });

    // Pre-filter to remove obvious non-doc pages
    const { included: filteredUrls, excluded } = preFilterUrls(mapResult.urls, rootUrl);
    skippedUrls.push(...excluded);

    console.log(
      `[Intelligent Crawl] Pre-filtered: ${filteredUrls.length} included, ${excluded.length} excluded`
    );

    report('triaging', `Analyzing ${filteredUrls.length} potential documentation URLs...`, {
      urlsDiscovered: mapResult.urls.length,
      percentComplete: 25,
    });

    // LLM triage
    const prioritizedUrls = await triageUrls(filteredUrls, wishlist, model);

    report('triaging', `Prioritized ${prioritizedUrls.length} URLs`, {
      urlsSelected: Math.min(prioritizedUrls.length, maxPages),
      percentComplete: 35,
    });

    // Select top URLs (prioritizing auth + endpoints)
    const urlsToScrape = selectUrlsToScrape(prioritizedUrls, maxPages);

    console.log(`[Intelligent Crawl] Selected ${urlsToScrape.length} URLs for scraping`);

    // Track skipped (low priority) URLs
    const selectedSet = new Set(urlsToScrape.map((u) => u.url));
    for (const pUrl of prioritizedUrls) {
      if (!selectedSet.has(pUrl.url)) {
        skippedUrls.push(pUrl.url);
      }
    }

    // =========================================================================
    // Stage 3: Scrape selected pages
    // =========================================================================
    report('scraping', `Starting to scrape ${urlsToScrape.length} pages...`, {
      urlsSelected: urlsToScrape.length,
      pagesCrawled: 0,
      percentComplete: 40,
    });

    for (let i = 0; i < urlsToScrape.length; i++) {
      const pUrl = urlsToScrape[i];
      const progressPercent = 40 + Math.round((i / urlsToScrape.length) * 55);

      report('scraping', `[${i + 1}/${urlsToScrape.length}] Scraping: ${pUrl.url}`, {
        pagesCrawled: pages.filter((p) => p.success).length,
        percentComplete: progressPercent,
      });

      try {
        const result = await scrapeUrl(pUrl.url, {
          timeout: pageTimeout,
          onlyMainContent: true,
        });

        pages.push({
          url: pUrl.url,
          content: result.content,
          title: result.title,
          depth: 0, // Intelligent crawl doesn't use depth concept
          success: true,
        });
      } catch (error) {
        pages.push({
          url: pUrl.url,
          content: '',
          depth: 0,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });

        if (!continueOnError) {
          throw error;
        }
      }

      // Delay between requests
      if (i < urlsToScrape.length - 1 && requestDelay > 0) {
        await sleep(requestDelay);
      }
    }

    // =========================================================================
    // Stage 4: Aggregate results
    // =========================================================================
    const successfulPages = pages.filter((p) => p.success);
    const aggregatedContent = aggregatePageContent(successfulPages, prioritizedUrls, rootUrl);

    report('completed', `Successfully scraped ${successfulPages.length} pages`, {
      pagesCrawled: successfulPages.length,
      percentComplete: 100,
    });

    return {
      rootUrl,
      pages,
      aggregatedContent,
      totalContentLength: aggregatedContent.length,
      prioritizedUrls,
      totalUrlsDiscovered: mapResult.urls.length,
      pagesCrawled: successfulPages.length,
      pagesFailed: pages.length - successfulPages.length,
      skippedUrls,
      durationMs: Date.now() - startTime,
    };
  } catch (error) {
    report('error', `Crawl failed: ${error instanceof Error ? error.message : 'Unknown error'}`, {
      percentComplete: 0,
    });
    throw error;
  }
}

/**
 * Select which URLs to scrape based on priorities and categories
 *
 * Ensures we get a good mix of:
 * - Authentication docs (MUST have)
 * - API endpoints (primary content)
 * - Reference/overview (context)
 * - Getting started (setup info)
 */
function selectUrlsToScrape(prioritizedUrls: PrioritizedUrl[], maxPages: number): PrioritizedUrl[] {
  const selected: PrioritizedUrl[] = [];
  const selectedUrls = new Set<string>();

  // Helper to add URL if not already selected
  const addUrl = (pUrl: PrioritizedUrl): boolean => {
    if (selectedUrls.has(pUrl.url)) return false;
    selected.push(pUrl);
    selectedUrls.add(pUrl.url);
    return true;
  };

  // Phase 1: ALWAYS include authentication docs (critical)
  const authUrls = prioritizedUrls.filter((u) => u.category === 'authentication');
  for (const url of authUrls.slice(0, 3)) {
    // Max 3 auth pages
    addUrl(url);
  }

  // Phase 2: Include wishlist matches
  const wishlistMatches = prioritizedUrls.filter((u) => u.matchesWishlist && u.priority >= 50);
  for (const url of wishlistMatches) {
    if (selected.length >= maxPages * 0.6) break; // Reserve 40% for general coverage
    addUrl(url);
  }

  // Phase 3: Include high-priority API endpoints
  const apiEndpoints = prioritizedUrls.filter(
    (u) => u.category === 'api_endpoint' && u.priority >= 60
  );
  for (const url of apiEndpoints) {
    if (selected.length >= maxPages * 0.8) break; // Reserve 20% for other
    addUrl(url);
  }

  // Phase 4: Include API reference and getting started
  const referenceUrls = prioritizedUrls.filter(
    (u) => (u.category === 'api_reference' || u.category === 'getting_started') && u.priority >= 50
  );
  for (const url of referenceUrls.slice(0, 5)) {
    // Max 5 reference pages
    addUrl(url);
  }

  // Phase 5: Include rate limits
  const rateLimitUrls = prioritizedUrls.filter((u) => u.category === 'rate_limits');
  for (const url of rateLimitUrls.slice(0, 2)) {
    // Max 2 rate limit pages
    addUrl(url);
  }

  // Phase 6: Fill remaining slots with highest priority URLs
  for (const url of prioritizedUrls) {
    if (selected.length >= maxPages) break;
    addUrl(url);
  }

  return selected.slice(0, maxPages);
}

/**
 * Aggregate content from crawled pages with priority context
 */
function aggregatePageContent(
  pages: CrawledPage[],
  prioritizedUrls: PrioritizedUrl[],
  rootUrl: string
): string {
  if (pages.length === 0) {
    return '';
  }

  // Create URL to priority info lookup
  const urlInfo = new Map<string, PrioritizedUrl>();
  for (const pUrl of prioritizedUrls) {
    urlInfo.set(pUrl.url, pUrl);
  }

  // Sort pages by priority
  const sortedPages = [...pages].sort((a, b) => {
    const aPriority = urlInfo.get(a.url)?.priority ?? 0;
    const bPriority = urlInfo.get(b.url)?.priority ?? 0;
    return bPriority - aPriority;
  });

  // Group by category for better organization
  const authPages = sortedPages.filter((p) => urlInfo.get(p.url)?.category === 'authentication');
  const endpointPages = sortedPages.filter((p) => urlInfo.get(p.url)?.category === 'api_endpoint');
  const referencePages = sortedPages.filter(
    (p) =>
      urlInfo.get(p.url)?.category === 'api_reference' ||
      urlInfo.get(p.url)?.category === 'getting_started'
  );
  const otherPages = sortedPages.filter((p) => {
    const cat = urlInfo.get(p.url)?.category;
    return !['authentication', 'api_endpoint', 'api_reference', 'getting_started'].includes(
      cat ?? ''
    );
  });

  const sections: string[] = [];

  // Header
  sections.push('# API Documentation\n');
  sections.push(`> Intelligently crawled from: ${rootUrl}`);
  sections.push(`> Pages: ${pages.length}`);
  sections.push(`> Generated: ${new Date().toISOString()}\n`);
  sections.push('---\n');

  // Authentication section (first - critical)
  if (authPages.length > 0) {
    sections.push('# Authentication\n');
    sections.push('> This section contains authentication and authorization documentation.\n');
    for (const page of authPages) {
      sections.push(formatPageSection(page, urlInfo.get(page.url)));
    }
  }

  // Getting started / Reference section
  if (referencePages.length > 0) {
    sections.push('# API Overview & Getting Started\n');
    for (const page of referencePages) {
      sections.push(formatPageSection(page, urlInfo.get(page.url)));
    }
  }

  // API Endpoints section
  if (endpointPages.length > 0) {
    sections.push('# API Endpoints\n');
    for (const page of endpointPages) {
      sections.push(formatPageSection(page, urlInfo.get(page.url)));
    }
  }

  // Other pages
  if (otherPages.length > 0) {
    sections.push('# Additional Documentation\n');
    for (const page of otherPages) {
      sections.push(formatPageSection(page, urlInfo.get(page.url)));
    }
  }

  return sections.join('\n');
}

/**
 * Format a single page section for aggregated output
 */
function formatPageSection(page: CrawledPage, info?: PrioritizedUrl): string {
  const title = page.title || getPathFromUrl(page.url);
  const category = info?.category ? ` [${info.category.replace(/_/g, ' ')}]` : '';
  const wishlistNote = info?.matchesWishlist
    ? ` ⭐ matches: ${info.matchedWishlistItems?.join(', ')}`
    : '';

  const lines: string[] = [];
  lines.push(`## ${title}${category}\n`);
  lines.push(`> Source: ${page.url}${wishlistNote}\n`);
  lines.push(page.content);
  lines.push('\n---\n');

  return lines.join('\n');
}

/**
 * Extract a readable path segment from a URL
 */
function getPathFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname;
    const segments = path.split('/').filter(Boolean);
    if (segments.length > 0) {
      return segments[segments.length - 1].replace(/[-_]/g, ' ').replace(/\.(html?|md)$/i, '');
    }
    return parsed.hostname;
  } catch {
    return url;
  }
}

/**
 * Sleep utility
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// =============================================================================
// Exports
// =============================================================================

export { ScrapeError };
