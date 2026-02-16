/**
 * Documentation Triage
 *
 * Implements a triage-first approach to documentation scraping:
 * 1. Map the entire site to discover URLs (fast, no content)
 * 2. Scrape ONLY the landing page for context
 * 3. LLM analyzes landing content + URL list to prioritize pages
 * 4. Return recommended pages for parallel scraping (max 10)
 *
 * This approach is faster, cheaper, and gives users visibility into what's being scraped.
 */

import { getLLM } from './llm';
import type { LLMModelId, LLMResponseSchema } from './llm';
import { mapWebsite, preFilterUrls } from './intelligent-crawler';
import { scrapeUrl, ScrapeError } from './doc-scraper';

// =============================================================================
// Types
// =============================================================================

/**
 * Result of the triage process
 */
export interface TriageResult {
  /** Name/title of the API (from landing page) */
  apiName: string;
  /** Brief description of what the API does */
  apiPurpose: string;
  /** Detected or likely auth type */
  detectedAuthType: 'none' | 'api_key' | 'oauth2' | 'bearer' | 'basic' | 'unknown';
  /** Pages prioritized for scraping, in order */
  prioritizedPages: PrioritizedPage[];
  /** Pages that were deprioritized (for "discover more" later) */
  skippedPages: SkippedPage[];
  /** Total URLs discovered in mapping */
  totalUrlsFound: number;
  /** Whether this is considered a large API (many pages) */
  isLargeApi: boolean;
  /** The landing page content (for immediate use) */
  landingPageContent: string;
  /** URL of the landing page */
  landingPageUrl: string;
  /** Duration of the triage process in ms */
  durationMs: number;
}

/**
 * A page selected for scraping with priority info
 */
export interface PrioritizedPage {
  /** Full URL to scrape */
  url: string;
  /** Why this page was selected */
  reason: string;
  /** Priority rank (1 = highest) */
  priority: number;
  /** Category of the page */
  category: 'auth' | 'overview' | 'endpoint' | 'rate_limits' | 'getting_started' | 'other';
}

/**
 * A page that was skipped (for discover more later)
 */
export interface SkippedPage {
  /** Full URL */
  url: string;
  /** Why it was skipped */
  reason: string;
}

/**
 * Options for triage
 */
export interface TriageOptions {
  /** Maximum pages to recommend for scraping (default: 10) */
  maxPages?: number;
  /** Wishlist of desired actions to prioritize */
  wishlist?: string[];
  /** LLM model to use for triage (default: gemini-3-flash) */
  model?: LLMModelId;
  /** Callback for progress updates */
  onProgress?: (message: string) => void;
}

// =============================================================================
// Constants
// =============================================================================

/** Default max pages to scrape */
const DEFAULT_MAX_PAGES = 10;

/** Threshold for "large API" designation */
const LARGE_API_THRESHOLD = 15;

/** Default model for triage (fast) */
const DEFAULT_TRIAGE_MODEL: LLMModelId = 'gemini-3-flash';

// =============================================================================
// LLM Schema for Triage
// =============================================================================

const TRIAGE_RESPONSE_SCHEMA: LLMResponseSchema = {
  type: 'object',
  properties: {
    apiName: {
      type: 'string',
      description: 'The name of the API',
    },
    apiPurpose: {
      type: 'string',
      description: 'Brief description of what this API does (1-2 sentences)',
    },
    detectedAuthType: {
      type: 'string',
      enum: ['none', 'api_key', 'oauth2', 'bearer', 'basic', 'unknown'],
      description: 'The authentication type detected or inferred from the documentation',
    },
    prioritizedPages: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          url: { type: 'string' },
          reason: { type: 'string' },
          priority: { type: 'number' },
          category: {
            type: 'string',
            enum: ['auth', 'overview', 'endpoint', 'rate_limits', 'getting_started', 'other'],
          },
        },
        required: ['url', 'reason', 'priority', 'category'],
      },
      description: 'Pages to scrape, ordered by priority (most important first)',
    },
    skippedPages: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          url: { type: 'string' },
          reason: { type: 'string' },
        },
        required: ['url', 'reason'],
      },
      description: 'Pages that were not selected and why',
    },
  },
  required: ['apiName', 'apiPurpose', 'detectedAuthType', 'prioritizedPages'],
};

// =============================================================================
// Triage Prompt Builder
// =============================================================================

function buildTriagePrompt(
  landingContent: string,
  urls: string[],
  maxPages: number,
  wishlist?: string[]
): string {
  const wishlistSection = wishlist?.length
    ? `\n## USER WISHLIST - Prioritize pages related to:\n${wishlist.map((w) => `- "${w}"`).join('\n')}\n`
    : '';

  // Truncate landing content if too long (keep reasonable for context)
  const maxLandingLength = 30000;
  const truncatedContent =
    landingContent.length > maxLandingLength
      ? landingContent.slice(0, maxLandingLength) + '\n\n[Content truncated...]'
      : landingContent;

  return `Analyze this API documentation and select the most important pages to scrape.

## LANDING PAGE CONTENT
${truncatedContent}

## ALL AVAILABLE URLS (${urls.length} total)
${urls.join('\n')}
${wishlistSection}
## TASK

From the URLs above, select up to ${maxPages} DOCUMENTATION pages to scrape:

INCLUDE:
- Authentication/authorization docs (CRITICAL - always include if exists)
- API overview or getting started
- Core endpoint reference pages
- Rate limiting docs

EXCLUDE:
- Live API data endpoints (e.g., /api/users, /v1/items/123)
- Changelog, blog posts, community content
- SDK/library-specific docs
- URLs with dynamic IDs or parameters

## RESPONSE FORMAT

You must respond with ONLY a JSON object. No markdown code fences. No explanations before or after.

EXAMPLE RESPONSE (use this exact structure):
{"apiName":"Stripe API","apiPurpose":"Payment processing and subscription management","detectedAuthType":"api_key","prioritizedPages":[{"url":"https://stripe.com/docs/api/authentication","reason":"Auth documentation","priority":1,"category":"auth"},{"url":"https://stripe.com/docs/api","reason":"API overview","priority":2,"category":"overview"}],"skippedPages":[{"url":"https://stripe.com/docs/changelog","reason":"Changelog not needed"}]}

FIELD REQUIREMENTS:
- apiName: string (the API name)
- apiPurpose: string (1-2 sentence description)
- detectedAuthType: one of "none", "api_key", "oauth2", "bearer", "basic", "unknown"
- prioritizedPages: array of objects with url (full URL from list), reason (string), priority (number 1-${maxPages}), category (one of "auth", "overview", "endpoint", "rate_limits", "getting_started", "other")
- skippedPages: array of objects with url and reason (include 3-5 notable skipped pages)

Respond with valid JSON only. No other text.`;
}

// =============================================================================
// Main Triage Function
// =============================================================================

/**
 * Perform documentation triage
 *
 * This function:
 * 1. Maps the site to discover all URLs
 * 2. Scrapes only the landing page
 * 3. Uses LLM to analyze content + URLs and prioritize pages
 *
 * @param url - The documentation URL to triage
 * @param options - Triage options
 * @returns Triage result with prioritized pages
 */
export async function triageDocumentation(
  url: string,
  options: TriageOptions = {}
): Promise<TriageResult> {
  const {
    maxPages = DEFAULT_MAX_PAGES,
    wishlist = [],
    model = DEFAULT_TRIAGE_MODEL,
    onProgress,
  } = options;

  const startTime = Date.now();

  // =========================================================================
  // Step 1: Map the site (fast, no content scraping)
  // =========================================================================
  onProgress?.('Mapping documentation site...');

  let allUrls: string[] = [];
  try {
    const mapResult = await mapWebsite(url, {
      limit: 5000,
      timeout: 30000,
    });
    allUrls = mapResult.urls;
    onProgress?.(`Found ${allUrls.length} pages on the site`);
  } catch (error) {
    // If mapping fails, we'll just scrape the landing page
    console.warn('[Triage] Site mapping failed, will use landing page only:', error);
    onProgress?.('Site mapping unavailable, using landing page only');
  }

  // =========================================================================
  // Step 2: Pre-filter and normalize URLs
  // =========================================================================
  onProgress?.('Filtering relevant documentation pages...');

  const { included: filteredUrls, excluded: excludedUrls } = preFilterUrls(allUrls, url);
  const normalizedUrls = normalizeAndDedupeUrls(filteredUrls);

  console.log(
    `[Triage] Pre-filter: ${allUrls.length} mapped → ${filteredUrls.length} included, ${excludedUrls.length} excluded`
  );
  if (excludedUrls.length > 0 && excludedUrls.length <= 20) {
    console.log(`[Triage] Excluded URLs: ${excludedUrls.join(', ')}`);
  } else if (excludedUrls.length > 20) {
    console.log(`[Triage] Excluded URLs (first 20): ${excludedUrls.slice(0, 20).join(', ')}`);
  }

  // Always include the root URL
  if (!normalizedUrls.includes(url)) {
    normalizedUrls.unshift(url);
  }

  onProgress?.(
    `${normalizedUrls.length} relevant pages identified (${excludedUrls.length} filtered out)`
  );

  // =========================================================================
  // Step 3: Scrape ONLY the landing page
  // =========================================================================
  onProgress?.('Analyzing landing page...');

  let landingContent = '';
  try {
    const landingResult = await scrapeUrl(url, {
      timeout: 30000,
      onlyMainContent: true,
    });
    landingContent = landingResult.content;
    onProgress?.(`Landing page loaded (${landingContent.length} chars)`);
  } catch (error) {
    throw new ScrapeError(
      url,
      'SCRAPE_FAILED',
      `Failed to scrape landing page: ${error instanceof Error ? error.message : 'Unknown error'}`,
      { retryable: true }
    );
  }

  // =========================================================================
  // Step 4: LLM Triage (landing content + URL list) with retry
  // =========================================================================
  onProgress?.('AI analyzing documentation structure...');

  const llm = getLLM(model);
  const prompt = buildTriagePrompt(landingContent, normalizedUrls, maxPages, wishlist);

  console.log(`[Triage] Sending ${prompt.length} char prompt to LLM`);

  // Try up to 3 times to get valid JSON
  let triageData: {
    apiName: string;
    apiPurpose: string;
    detectedAuthType: string;
    prioritizedPages: PrioritizedPage[];
    skippedPages?: SkippedPage[];
  } | null = null;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const llmResult = await llm.generate<{
        apiName: string;
        apiPurpose: string;
        detectedAuthType: string;
        prioritizedPages: PrioritizedPage[];
        skippedPages?: SkippedPage[];
      }>(prompt, {
        responseSchema: TRIAGE_RESPONSE_SCHEMA,
        temperature: attempt === 1 ? 0.1 : 0.0, // Lower temp on retries
        maxOutputTokens: 4096,
      });
      triageData = llmResult.content;

      // Validate we got usable data
      if (triageData?.apiName && Array.isArray(triageData?.prioritizedPages)) {
        console.log(`[Triage] Success on attempt ${attempt}`);
        break;
      } else {
        throw new Error('Invalid triage response structure');
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.warn(`[Triage] Attempt ${attempt} failed:`, lastError.message);

      if (attempt < 3) {
        onProgress?.(`Retrying analysis (attempt ${attempt + 1}/3)...`);
        await new Promise((resolve) => setTimeout(resolve, 1000)); // Brief delay
      }
    }
  }

  // If all retries failed, throw the last error
  if (!triageData) {
    throw lastError || new Error('Triage failed after 3 attempts');
  }

  onProgress?.(`Selected ${triageData.prioritizedPages?.length ?? 0} pages to analyze`);

  // =========================================================================
  // Build result
  // =========================================================================
  const isLargeApi = normalizedUrls.length > LARGE_API_THRESHOLD;

  // Validate and clean prioritized pages
  // Normalize LLM-returned URLs before matching to avoid silent drops from format differences
  const llmPages = (triageData.prioritizedPages || []).map((p) => ({
    ...p,
    url: normalizeUrl(p.url),
  }));
  const droppedPages = llmPages.filter((p) => !p.url || !normalizedUrls.includes(p.url));
  if (droppedPages.length > 0) {
    console.warn(
      `[Triage] Dropped ${droppedPages.length} LLM-selected pages not in normalized URL list:`,
      droppedPages.map((p) => p.url)
    );
  }
  const validPrioritizedPages = llmPages
    .filter((p) => p.url && normalizedUrls.includes(p.url))
    .slice(0, maxPages);
  console.log(
    `[Triage] LLM returned ${llmPages.length} pages, ${validPrioritizedPages.length} validated against URL list`
  );

  // Boost wishlist-matching URLs that the LLM may have missed
  // For large APIs (e.g., Slack with 200+ methods), the LLM picks ~20 pages from hundreds
  // of similar URLs and may not select the specific one matching the user's wishlist.
  if (wishlist.length > 0) {
    const wishlistMatches = findWishlistMatchingUrls(normalizedUrls, wishlist);
    const addedUrls = new Set(validPrioritizedPages.map((p) => p.url));

    const matchEntries = Array.from(wishlistMatches.entries());
    for (const [url, matchedItems] of matchEntries) {
      if (addedUrls.has(url)) continue;
      if (validPrioritizedPages.length >= maxPages) {
        // Replace the lowest-priority non-wishlist page to make room
        const reversed = validPrioritizedPages.slice().reverse();
        const nonWishlistIdx = reversed.findIndex((p) => !p.reason.includes('wishlist'));
        if (nonWishlistIdx >= 0) {
          const actualIdx = validPrioritizedPages.length - 1 - nonWishlistIdx;
          validPrioritizedPages.splice(actualIdx, 1);
        } else {
          break; // All slots are wishlist pages already
        }
      }
      validPrioritizedPages.push({
        url,
        reason: `Wishlist match: ${matchedItems.join(', ')} (URL pattern boost)`,
        priority: validPrioritizedPages.length + 1,
        category: 'endpoint',
      });
      addedUrls.add(url);
    }

    if (wishlistMatches.size > 0) {
      console.log(
        `[Triage] Boosted ${wishlistMatches.size} URLs matching wishlist items: ` +
          `${Array.from(wishlistMatches.keys()).join(', ')}`
      );
    }
  }

  // If LLM didn't return enough pages, fall back to pattern-based selection
  if (validPrioritizedPages.length < Math.min(3, normalizedUrls.length)) {
    console.warn('[Triage] LLM returned too few pages, adding pattern-based fallbacks');
    const addedUrls = new Set(validPrioritizedPages.map((p) => p.url));

    // Add auth-looking pages
    for (const u of normalizedUrls) {
      if (addedUrls.has(u)) continue;
      if (/auth|oauth|api-?key|token|security/i.test(u)) {
        validPrioritizedPages.push({
          url: u,
          reason: 'Authentication documentation (pattern match)',
          priority: validPrioritizedPages.length + 1,
          category: 'auth',
        });
        addedUrls.add(u);
        if (validPrioritizedPages.length >= maxPages) break;
      }
    }

    // Add endpoint-looking pages
    for (const u of normalizedUrls) {
      if (addedUrls.has(u)) continue;
      if (/endpoint|api|method|reference/i.test(u)) {
        validPrioritizedPages.push({
          url: u,
          reason: 'API endpoint documentation (pattern match)',
          priority: validPrioritizedPages.length + 1,
          category: 'endpoint',
        });
        addedUrls.add(u);
        if (validPrioritizedPages.length >= maxPages) break;
      }
    }
  }

  return {
    apiName: triageData.apiName || 'Unknown API',
    apiPurpose: triageData.apiPurpose || 'API documentation',
    detectedAuthType:
      (triageData.detectedAuthType as TriageResult['detectedAuthType']) || 'unknown',
    prioritizedPages: validPrioritizedPages,
    skippedPages: triageData.skippedPages || [],
    totalUrlsFound: normalizedUrls.length,
    isLargeApi,
    landingPageContent: landingContent,
    landingPageUrl: url,
    durationMs: Date.now() - startTime,
  };
}

// =============================================================================
// Re-export utilities from intelligent-crawler for use elsewhere
// =============================================================================

export { mapWebsite, preFilterUrls };

/**
 * Scan URLs for wishlist keyword matches and return matching URLs.
 * Used to guarantee wishlist-relevant pages are included even if the LLM didn't select them.
 */
function findWishlistMatchingUrls(urls: string[], wishlist: string[]): Map<string, string[]> {
  const matches = new Map<string, string[]>();
  if (!wishlist.length) return matches;

  // Normalize wishlist items into keyword tokens
  const wishlistTokens = wishlist.map((item) => ({
    original: item,
    tokens: item
      .toLowerCase()
      .split(/[\s.]+/)
      .filter((t) => t.length > 2),
  }));

  for (const url of urls) {
    const urlLower = url.toLowerCase();
    const matchedItems: string[] = [];

    for (const { original, tokens } of wishlistTokens) {
      // A URL matches if ALL significant tokens from the wishlist item appear in the URL
      // e.g., "list emoji" matches /methods/emoji.list, "emoji" matches /methods/emoji.list
      const allTokensMatch = tokens.length > 0 && tokens.every((token) => urlLower.includes(token));
      if (allTokensMatch) {
        matchedItems.push(original);
      }
    }

    if (matchedItems.length > 0) {
      matches.set(url, matchedItems);
    }
  }

  return matches;
}

// Helper to normalize URLs (re-export for use in parallel scraper)
function normalizeAndDedupeUrls(urls: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const url of urls) {
    const normalized = normalizeUrl(url);
    if (!seen.has(normalized)) {
      seen.add(normalized);
      result.push(normalized);
    }
  }

  return result;
}

function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    let normalized = `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
    if (normalized.endsWith('/') && parsed.pathname !== '/') {
      normalized = normalized.slice(0, -1);
    }
    return normalized;
  } catch {
    return url;
  }
}
