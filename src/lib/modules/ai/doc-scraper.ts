/**
 * Documentation Scraper
 *
 * Firecrawl integration for scraping API documentation.
 * Provides URL scraping with timeout handling and error management.
 */

import FirecrawlApp from '@mendable/firecrawl-js';

// =============================================================================
// Types
// =============================================================================

/**
 * Result of a single URL scrape
 */
export interface ScrapeResult {
  /** The URL that was scraped */
  url: string;
  /** The scraped content in markdown format */
  content: string;
  /** When the scrape was performed */
  scrapedAt: Date;
  /** Page title if available */
  title?: string;
  /** Page description/meta if available */
  description?: string;
  /** Links found on the page */
  links?: string[];
}

/**
 * Result of documentation scraping (higher-level)
 */
export interface DocumentationScrapeResult {
  /** The URL that was scraped */
  url: string;
  /** The scraped content in markdown format */
  content: string;
  /** The content type (always 'markdown' for now) */
  contentType: 'markdown';
  /** When the scrape was performed */
  scrapedAt: Date;
  /** Page title if available */
  title?: string;
  /** Page description if available */
  description?: string;
  /** Links found on the page (for potential crawling) */
  links?: string[];
  /** Content length in characters */
  contentLength: number;
}

/**
 * Result of a single page in a crawl
 */
export interface CrawledPage {
  /** The URL that was scraped */
  url: string;
  /** The scraped content in markdown format */
  content: string;
  /** Page title if available */
  title?: string;
  /** Depth level (0 = root URL) */
  depth: number;
  /** Whether this page was successfully scraped */
  success: boolean;
  /** Error message if scrape failed */
  error?: string;
}

/**
 * Result of multi-page documentation crawling
 */
export interface CrawlResult {
  /** The root URL that was crawled */
  rootUrl: string;
  /** All successfully scraped pages */
  pages: CrawledPage[];
  /** Aggregated content from all pages */
  aggregatedContent: string;
  /** Total content length in characters */
  totalContentLength: number;
  /** Total number of pages crawled */
  pagesCrawled: number;
  /** Number of pages that failed to scrape */
  pagesFailed: number;
  /** URLs that were skipped (already visited, filtered out, etc.) */
  skippedUrls: string[];
  /** When the crawl started */
  startedAt: Date;
  /** When the crawl completed */
  completedAt: Date;
  /** Total duration in milliseconds */
  durationMs: number;
}

/**
 * Options for scraping a URL
 */
export interface ScrapeOptions {
  /** Timeout in milliseconds (default: 60000) */
  timeout?: number;
  /** Whether to include links in the result (default: false) */
  includeLinks?: boolean;
  /** Only extract main content (default: true) */
  onlyMainContent?: boolean;
}

/**
 * Options for documentation scraping
 */
export interface DocumentationScrapeOptions {
  /** Timeout in milliseconds (default: 300000 = 5 minutes) */
  timeout?: number;
  /** Whether to include discovered links (default: true for documentation) */
  includeLinks?: boolean;
  /** Callback for progress updates */
  onProgress?: (message: string) => void;
}

/**
 * Options for multi-page documentation crawling
 */
export interface CrawlOptions {
  /** Maximum crawl depth from root URL (default: 3) */
  maxDepth?: number;
  /** Maximum number of pages to crawl (default: 20) */
  maxPages?: number;
  /** Timeout per page in milliseconds (default: 60000) */
  pageTimeout?: number;
  /** Total crawl timeout in milliseconds (default: 600000 = 10 minutes) */
  totalTimeout?: number;
  /** Delay between requests in milliseconds (default: 1000) */
  requestDelay?: number;
  /** Whether to continue on individual page errors (default: true) */
  continueOnError?: boolean;
  /** Callback for progress updates */
  onProgress?: (progress: CrawlProgress) => void;
  /** Custom link filter function (in addition to default filtering) */
  linkFilter?: (url: string) => boolean;
}

/**
 * Progress information during crawling
 */
export interface CrawlProgress {
  /** Current status */
  status: 'crawling' | 'completed' | 'error';
  /** Number of pages crawled so far */
  pagesCrawled: number;
  /** Total pages discovered */
  pagesDiscovered: number;
  /** Current URL being scraped */
  currentUrl?: string;
  /** Current depth level */
  currentDepth: number;
  /** Percentage complete (0-100) */
  percentComplete: number;
  /** Human-readable message */
  message: string;
}

/**
 * Error thrown when scraping fails
 */
export class ScrapeError extends Error {
  public readonly url: string;
  public readonly code: ScrapeErrorCode;
  public readonly retryable: boolean;
  public readonly retryAfterMs?: number;

  constructor(
    url: string,
    code: ScrapeErrorCode,
    message: string,
    options?: {
      retryable?: boolean;
      retryAfterMs?: number;
      cause?: unknown;
    }
  ) {
    super(message, { cause: options?.cause });
    this.name = 'ScrapeError';
    this.url = url;
    this.code = code;
    this.retryable = options?.retryable ?? false;
    this.retryAfterMs = options?.retryAfterMs;
  }
}

/**
 * Error codes for scrape failures
 */
export type ScrapeErrorCode =
  | 'CONFIGURATION_ERROR'
  | 'NETWORK_ERROR'
  | 'TIMEOUT'
  | 'RATE_LIMITED'
  | 'ACCESS_DENIED'
  | 'NOT_FOUND'
  | 'SCRAPE_FAILED'
  | 'INVALID_URL'
  | 'UNKNOWN_ERROR';

// =============================================================================
// Constants
// =============================================================================

/** Default timeout for single URL scrapes */
const DEFAULT_TIMEOUT_MS = 60000; // 60 seconds

/** Default timeout for documentation scraping (longer for complex pages) */
const DOCUMENTATION_TIMEOUT_MS = 300000; // 5 minutes

/** Minimum content length to consider a successful scrape */
const MIN_CONTENT_LENGTH = 100;

/** Maximum crawl depth from root URL */
const DEFAULT_MAX_DEPTH = 3;

/** Maximum number of pages to crawl */
const DEFAULT_MAX_PAGES = 20;

/** Total crawl timeout */
const DEFAULT_CRAWL_TIMEOUT_MS = 600000; // 10 minutes

/** Delay between requests to avoid rate limiting */
const DEFAULT_REQUEST_DELAY_MS = 1000; // 1 second

// =============================================================================
// Client Initialization
// =============================================================================

/**
 * Firecrawl client singleton
 */
let firecrawlClient: FirecrawlApp | null = null;

/**
 * Get or create the Firecrawl client
 *
 * @throws ScrapeError if FIRECRAWL_API_KEY is not set
 */
function getClient(): FirecrawlApp {
  if (firecrawlClient) {
    return firecrawlClient;
  }

  const apiKey = process.env.FIRECRAWL_API_KEY;

  if (!apiKey) {
    throw new ScrapeError(
      '',
      'CONFIGURATION_ERROR',
      'FIRECRAWL_API_KEY environment variable is not set',
      { retryable: false }
    );
  }

  firecrawlClient = new FirecrawlApp({ apiKey });
  return firecrawlClient;
}

/**
 * Reset the client (useful for testing)
 */
export function resetClient(): void {
  firecrawlClient = null;
}

// =============================================================================
// URL Validation
// =============================================================================

/**
 * Validate and normalize a URL
 *
 * @param url - URL to validate
 * @returns Normalized URL
 * @throws ScrapeError if URL is invalid
 */
function validateUrl(url: string): string {
  try {
    const parsed = new URL(url);

    // Only allow http and https protocols
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new ScrapeError(
        url,
        'INVALID_URL',
        `Invalid URL protocol: ${parsed.protocol}. Only http and https are supported.`,
        { retryable: false }
      );
    }

    return parsed.href;
  } catch (error) {
    if (error instanceof ScrapeError) {
      throw error;
    }
    throw new ScrapeError(url, 'INVALID_URL', `Invalid URL: ${url}`, {
      retryable: false,
      cause: error,
    });
  }
}

// =============================================================================
// Scraping Functions
// =============================================================================

/**
 * Scrape a single URL and return its content
 *
 * @param url - The URL to scrape
 * @param options - Scraping options
 * @returns The scraped content
 * @throws ScrapeError on failure
 */
export async function scrapeUrl(url: string, options: ScrapeOptions = {}): Promise<ScrapeResult> {
  const validatedUrl = validateUrl(url);
  const timeout = options.timeout ?? DEFAULT_TIMEOUT_MS;
  const includeLinks = options.includeLinks ?? false;
  const onlyMainContent = options.onlyMainContent ?? true;

  const client = getClient();

  // Build formats array
  const formats: ('markdown' | 'links')[] = ['markdown'];
  if (includeLinks) {
    formats.push('links');
  }

  // Set up timeout
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(
        new ScrapeError(validatedUrl, 'TIMEOUT', `Scrape timed out after ${timeout}ms`, {
          retryable: true,
        })
      );
    }, timeout);
  });

  try {
    // Race between scrape and timeout
    const result = await Promise.race([
      client.scrape(validatedUrl, {
        formats,
        onlyMainContent,
        timeout: Math.floor(timeout / 1000), // Firecrawl uses seconds
      }),
      timeoutPromise,
    ]);

    // Extract content - prefer markdown
    const content = result.markdown || result.html || '';

    if (!content) {
      throw new ScrapeError(validatedUrl, 'SCRAPE_FAILED', 'No content returned from scrape', {
        retryable: false,
      });
    }

    return {
      url: validatedUrl,
      content,
      scrapedAt: new Date(),
      title: result.metadata?.title,
      description: result.metadata?.description,
      links: result.links,
    };
  } catch (error) {
    // Re-throw ScrapeErrors
    if (error instanceof ScrapeError) {
      throw error;
    }

    // Handle Firecrawl-specific errors
    if (error instanceof Error) {
      const message = error.message.toLowerCase();

      // Rate limiting
      if (message.includes('rate limit') || message.includes('429')) {
        throw new ScrapeError(validatedUrl, 'RATE_LIMITED', 'Rate limited by Firecrawl', {
          retryable: true,
          retryAfterMs: 60000, // Default to 1 minute
          cause: error,
        });
      }

      // Access denied
      if (
        message.includes('403') ||
        message.includes('forbidden') ||
        message.includes('access denied')
      ) {
        throw new ScrapeError(validatedUrl, 'ACCESS_DENIED', 'Access denied to URL', {
          retryable: false,
          cause: error,
        });
      }

      // Not found
      if (message.includes('404') || message.includes('not found')) {
        throw new ScrapeError(validatedUrl, 'NOT_FOUND', 'URL not found', {
          retryable: false,
          cause: error,
        });
      }

      // Network errors
      if (
        message.includes('network') ||
        message.includes('econnrefused') ||
        message.includes('enotfound')
      ) {
        throw new ScrapeError(validatedUrl, 'NETWORK_ERROR', `Network error: ${error.message}`, {
          retryable: true,
          cause: error,
        });
      }
    }

    // Unknown error
    throw new ScrapeError(
      validatedUrl,
      'UNKNOWN_ERROR',
      error instanceof Error ? error.message : 'Unknown scrape error',
      {
        retryable: false,
        cause: error,
      }
    );
  }
}

// =============================================================================
// Documentation Scraping
// =============================================================================

/**
 * Scrape API documentation from a URL
 *
 * This is the primary entry point for documentation scraping. It wraps
 * the lower-level scrapeUrl function with documentation-specific defaults
 * and additional metadata.
 *
 * @param url - The documentation URL to scrape
 * @param options - Documentation scraping options
 * @returns The scraped documentation with metadata
 * @throws ScrapeError on failure
 *
 * @example
 * ```ts
 * const result = await scrapeDocumentation('https://api.slack.com/docs/conversations.list');
 * console.log(result.content); // Markdown content
 * console.log(result.links);   // Discovered links for crawling
 * ```
 */
export async function scrapeDocumentation(
  url: string,
  options: DocumentationScrapeOptions = {}
): Promise<DocumentationScrapeResult> {
  const timeout = options.timeout ?? DOCUMENTATION_TIMEOUT_MS;
  const includeLinks = options.includeLinks ?? true;

  options.onProgress?.(`Starting scrape of ${url}`);

  const result = await scrapeUrl(url, {
    timeout,
    includeLinks,
    onlyMainContent: true,
  });

  options.onProgress?.(`Scraped ${result.content.length} characters from ${url}`);

  // Validate content
  if (result.content.length < MIN_CONTENT_LENGTH) {
    throw new ScrapeError(
      url,
      'SCRAPE_FAILED',
      `Scraped content too short (${result.content.length} chars). The page may be protected or have no content.`,
      { retryable: false }
    );
  }

  return {
    url: result.url,
    content: result.content,
    contentType: 'markdown',
    scrapedAt: result.scrapedAt,
    title: result.title,
    description: result.description,
    links: result.links,
    contentLength: result.content.length,
  };
}

/**
 * Crawl multiple pages of API documentation starting from a root URL
 *
 * This function performs depth-limited crawling of documentation pages,
 * aggregating content from multiple related pages. It's useful for APIs
 * with documentation spread across many pages.
 *
 * @param rootUrl - The starting URL for the crawl
 * @param options - Crawl options
 * @returns Aggregated content from all crawled pages
 * @throws ScrapeError if the root URL fails to scrape
 *
 * @example
 * ```ts
 * const result = await crawlDocumentation('https://api.slack.com/methods', {
 *   maxDepth: 2,
 *   maxPages: 15,
 *   onProgress: (p) => console.log(p.message),
 * });
 * console.log(result.aggregatedContent); // Combined markdown from all pages
 * console.log(result.pagesCrawled);      // 15
 * ```
 */
export async function crawlDocumentation(
  rootUrl: string,
  options: CrawlOptions = {}
): Promise<CrawlResult> {
  const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;
  const maxPages = options.maxPages ?? DEFAULT_MAX_PAGES;
  const pageTimeout = options.pageTimeout ?? DEFAULT_TIMEOUT_MS;
  const totalTimeout = options.totalTimeout ?? DEFAULT_CRAWL_TIMEOUT_MS;
  const requestDelay = options.requestDelay ?? DEFAULT_REQUEST_DELAY_MS;
  const continueOnError = options.continueOnError ?? true;

  const startedAt = new Date();
  const deadline = Date.now() + totalTimeout;

  // Track visited URLs to avoid duplicates
  const visited = new Set<string>();
  const skippedUrls: string[] = [];
  const pages: CrawledPage[] = [];

  // Queue of URLs to visit: [url, depth]
  const queue: Array<[string, number]> = [[validateUrl(rootUrl), 0]];

  // Helper to report progress
  const reportProgress = (
    status: CrawlProgress['status'],
    currentUrl?: string,
    currentDepth: number = 0
  ) => {
    const progress: CrawlProgress = {
      status,
      pagesCrawled: pages.filter((p) => p.success).length,
      pagesDiscovered: visited.size + queue.length,
      currentUrl,
      currentDepth,
      percentComplete: Math.min(100, Math.round((pages.length / maxPages) * 100)),
      message: `Crawled ${pages.length}/${maxPages} pages (depth ${currentDepth}/${maxDepth})`,
    };
    options.onProgress?.(progress);
  };

  // Helper to normalize URL for deduplication
  const normalizeUrl = (url: string): string => {
    try {
      const parsed = new URL(url);
      // Remove trailing slash and hash
      parsed.hash = '';
      let normalized = parsed.href;
      if (normalized.endsWith('/')) {
        normalized = normalized.slice(0, -1);
      }
      return normalized;
    } catch {
      return url;
    }
  };

  // Process the queue
  while (queue.length > 0 && pages.length < maxPages) {
    // Check total timeout
    if (Date.now() > deadline) {
      reportProgress('completed');
      break;
    }

    const [currentUrl, depth] = queue.shift()!;
    const normalizedUrl = normalizeUrl(currentUrl);

    // Skip if already visited
    if (visited.has(normalizedUrl)) {
      continue;
    }
    visited.add(normalizedUrl);

    // Skip if beyond max depth
    if (depth > maxDepth) {
      skippedUrls.push(currentUrl);
      continue;
    }

    reportProgress('crawling', currentUrl, depth);

    try {
      // Scrape the page
      const result = await scrapeUrl(currentUrl, {
        timeout: pageTimeout,
        includeLinks: depth < maxDepth, // Only get links if we can go deeper
        onlyMainContent: true,
      });

      // Add successful page
      pages.push({
        url: currentUrl,
        content: result.content,
        title: result.title,
        depth,
        success: true,
      });

      // If we haven't hit max pages and have room for more depth, queue new links
      if (depth < maxDepth && result.links && pages.length < maxPages) {
        const filteredLinks = filterDocumentationLinks(result.links, rootUrl);

        // Apply custom filter if provided
        const finalLinks = options.linkFilter
          ? filteredLinks.filter(options.linkFilter)
          : filteredLinks;

        for (const link of finalLinks) {
          const normalizedLink = normalizeUrl(link);
          if (!visited.has(normalizedLink)) {
            queue.push([link, depth + 1]);
          }
        }
      }

      // Delay between requests to avoid rate limiting
      if (queue.length > 0 && requestDelay > 0) {
        await sleep(requestDelay);
      }
    } catch (error) {
      // Record failed page
      pages.push({
        url: currentUrl,
        content: '',
        depth,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      // If root URL fails and we're not continuing on error, throw
      if (depth === 0 && !continueOnError) {
        throw error;
      }

      // If not continuing on error, stop crawling
      if (!continueOnError) {
        break;
      }
    }
  }

  const completedAt = new Date();
  const successfulPages = pages.filter((p) => p.success);

  // Aggregate content from all successful pages
  const aggregatedContent = aggregatePageContent(successfulPages, rootUrl);

  reportProgress('completed');

  return {
    rootUrl,
    pages,
    aggregatedContent,
    totalContentLength: aggregatedContent.length,
    pagesCrawled: successfulPages.length,
    pagesFailed: pages.length - successfulPages.length,
    skippedUrls,
    startedAt,
    completedAt,
    durationMs: completedAt.getTime() - startedAt.getTime(),
  };
}

/**
 * Aggregate content from multiple crawled pages into a single document
 *
 * @param pages - Successfully crawled pages
 * @param rootUrl - The root URL for context
 * @returns Aggregated markdown content
 */
function aggregatePageContent(pages: CrawledPage[], rootUrl: string): string {
  if (pages.length === 0) {
    return '';
  }

  // Sort pages by depth (root first) then by URL for consistency
  const sortedPages = [...pages].sort((a, b) => {
    if (a.depth !== b.depth) return a.depth - b.depth;
    return a.url.localeCompare(b.url);
  });

  const sections: string[] = [];

  // Add header with crawl info
  sections.push(`# API Documentation\n`);
  sections.push(`> Crawled from: ${rootUrl}`);
  sections.push(`> Pages: ${pages.length}`);
  sections.push(`> Generated: ${new Date().toISOString()}\n`);
  sections.push('---\n');

  // Add content from each page
  for (const page of sortedPages) {
    const title = page.title || getPathFromUrl(page.url);
    const depthIndicator = '#'.repeat(Math.min(page.depth + 2, 6)); // h2 for root, h3 for depth 1, etc.

    sections.push(`${depthIndicator} ${title}\n`);
    sections.push(`> Source: ${page.url}\n`);
    sections.push(page.content);
    sections.push('\n---\n');
  }

  return sections.join('\n');
}

/**
 * Extract a readable path segment from a URL
 */
function getPathFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname;
    // Get last meaningful segment
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
 * Sleep for a specified duration
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Filter links to find potential API documentation pages
 *
 * @param links - Array of URLs to filter
 * @param baseUrl - The base documentation URL for context
 * @returns Filtered array of likely API doc URLs
 */
export function filterDocumentationLinks(links: string[], baseUrl: string): string[] {
  const base = new URL(baseUrl);
  const baseHost = base.hostname;

  // Keywords that indicate API documentation
  const docKeywords = [
    '/api/',
    '/docs/',
    '/documentation/',
    '/reference/',
    '/guide/',
    '/endpoints/',
    '/methods/',
    '/resources/',
    '/v1/',
    '/v2/',
    '/v3/',
  ];

  // Keywords to exclude (typically not API docs)
  const excludeKeywords = [
    '/blog/',
    '/news/',
    '/pricing/',
    '/about/',
    '/contact/',
    '/careers/',
    '/login',
    '/signup',
    '/auth/',
    '.pdf',
    '.zip',
    '.png',
    '.jpg',
    '.gif',
    '/changelog',
    '/release-notes',
  ];

  return links.filter((link) => {
    try {
      const url = new URL(link);

      // Must be same host
      if (url.hostname !== baseHost) {
        return false;
      }

      const path = url.pathname.toLowerCase();

      // Exclude non-doc pages
      if (excludeKeywords.some((kw) => path.includes(kw))) {
        return false;
      }

      // Include if matches doc keywords or is under same path as base
      const basePath = base.pathname.split('/').slice(0, 3).join('/');
      const isUnderBasePath = path.startsWith(basePath);
      const matchesDocKeyword = docKeywords.some((kw) => path.includes(kw));

      return isUnderBasePath || matchesDocKeyword;
    } catch {
      return false;
    }
  });
}

/**
 * Check if a URL is likely to be API documentation
 *
 * @param url - URL to check
 * @returns true if the URL appears to be API documentation
 */
export function isLikelyApiDocumentation(url: string): boolean {
  try {
    const parsed = new URL(url);
    const fullUrl = parsed.href.toLowerCase();

    const docIndicators = [
      'api',
      'docs',
      'documentation',
      'reference',
      'developer',
      'swagger',
      'openapi',
      'graphql',
      'rest',
      'endpoints',
    ];

    return docIndicators.some((indicator) => fullUrl.includes(indicator));
  } catch {
    return false;
  }
}

// =============================================================================
// Type Guards
// =============================================================================

/**
 * Check if an error is a ScrapeError
 */
export function isScrapeError(error: unknown): error is ScrapeError {
  return error instanceof ScrapeError;
}

/**
 * Check if a scrape error is retryable
 */
export function isRetryableScrapeError(error: unknown): boolean {
  if (isScrapeError(error)) {
    return error.retryable;
  }
  return false;
}
