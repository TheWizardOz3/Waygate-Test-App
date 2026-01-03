/**
 * Template Detector
 *
 * Automatically detects if scraped API documentation matches a known template pattern.
 * This allows us to augment AI-extracted actions with template-based actions for
 * schema-driven APIs like Supabase/PostgREST.
 */

import type { ParsedApiDoc } from '../scrape-job.schemas';
import type { IntegrationTemplate } from './types';
import { getTemplates } from './index';

/**
 * Detection result when a template pattern is identified
 */
export interface TemplateDetectionResult {
  /** Whether a template was detected */
  detected: boolean;
  /** The detected template (if any) */
  template: IntegrationTemplate | null;
  /** Confidence score 0-1 */
  confidence: number;
  /** Reasons for the detection */
  signals: string[];
  /** Suggested base URL for the template (extracted from docs) */
  suggestedBaseUrl?: string;
}

/**
 * Detection patterns for each template type
 */
interface TemplatePattern {
  templateId: string;
  /** URL patterns that indicate this template */
  urlPatterns: RegExp[];
  /** Content patterns (in scraped text) that indicate this template */
  contentPatterns: RegExp[];
  /** Endpoint path patterns */
  endpointPatterns: RegExp[];
  /** Keywords in the documentation */
  keywords: string[];
  /** Base URL extractor from scraped content */
  baseUrlExtractor?: (content: string, sourceUrl: string) => string | undefined;
}

const TEMPLATE_PATTERNS: TemplatePattern[] = [
  {
    templateId: 'postgrest',
    urlPatterns: [/supabase\.com/i, /supabase\.co/i, /postgrest/i, /\.supabase\./i],
    contentPatterns: [
      /PostgREST/i,
      /Supabase\s+(API|REST|Database)/i,
      /\.select\(\s*['"`]\*/i,
      /\.from\(\s*['"`]/i,
      /apikey/i,
      /anon\s*key/i,
      /service[_\s]?role[_\s]?key/i,
      /Row Level Security/i,
      /RLS/,
    ],
    endpointPatterns: [
      /\/rest\/v1\//i,
      /\/rpc\//i,
      /\?select=/i,
      /\?order=/i,
      /eq\./i,
      /neq\./i,
      /gt\./i,
      /lt\./i,
    ],
    keywords: [
      'supabase',
      'postgrest',
      'postgres',
      'row level security',
      'rls',
      'anon key',
      'service role',
      'jwt',
    ],
    baseUrlExtractor: (content, sourceUrl) => {
      // Try to extract Supabase project URL from content
      const supabaseUrlMatch = content.match(/https:\/\/[a-z0-9-]+\.supabase\.co/i);
      if (supabaseUrlMatch) return supabaseUrlMatch[0];

      // Try from source URL
      const sourceMatch = sourceUrl.match(/https:\/\/[a-z0-9-]+\.supabase\.co/i);
      if (sourceMatch) return sourceMatch[0];

      // Generic PostgREST pattern
      const postgrestMatch = content.match(/https?:\/\/[^\s"'<>]+\/rest\/v1/i);
      if (postgrestMatch) {
        return postgrestMatch[0].replace(/\/rest\/v1$/, '');
      }

      return undefined;
    },
  },
  {
    templateId: 'rest-crud',
    urlPatterns: [
      // Generic patterns - lower priority
      /\/api\/v\d+/i,
      /\/rest\//i,
    ],
    contentPatterns: [
      /RESTful\s+API/i,
      /CRUD\s+operations/i,
      /GET\s+\/[a-z]+\s/i,
      /POST\s+\/[a-z]+\s/i,
      /PUT\s+\/[a-z]+\/\{?id\}?\s/i,
      /DELETE\s+\/[a-z]+\/\{?id\}?\s/i,
    ],
    endpointPatterns: [
      /GET\s+\/\{?[a-z_]+\}?$/im,
      /POST\s+\/\{?[a-z_]+\}?$/im,
      /GET\s+\/\{?[a-z_]+\}?\/\{?:?id\}?$/im,
    ],
    keywords: ['crud', 'restful', 'resource', 'collection'],
    baseUrlExtractor: (content, sourceUrl) => {
      // Try to find API base URL
      const apiUrlMatch = content.match(/https?:\/\/[^\s"'<>]+\/api\/v\d+/i);
      if (apiUrlMatch) return apiUrlMatch[0];

      // From source URL
      try {
        const url = new URL(sourceUrl);
        return `${url.protocol}//${url.host}`;
      } catch {
        return undefined;
      }
    },
  },
];

/**
 * Detect if the parsed API documentation matches a template pattern
 *
 * @param parsedDoc - The AI-extracted API documentation
 * @param scrapedContent - Raw scraped markdown content
 * @param sourceUrls - URLs that were scraped
 * @returns Detection result with template and confidence
 */
export function detectTemplate(
  parsedDoc: ParsedApiDoc,
  scrapedContent: string,
  sourceUrls: string[]
): TemplateDetectionResult {
  const templates = getTemplates();
  let bestMatch: TemplateDetectionResult = {
    detected: false,
    template: null,
    confidence: 0,
    signals: [],
  };

  for (const pattern of TEMPLATE_PATTERNS) {
    const template = templates.find((t) => t.id === pattern.templateId);
    if (!template) continue;

    const signals: string[] = [];
    let score = 0;

    // Check URL patterns (high signal)
    for (const url of sourceUrls) {
      for (const urlPattern of pattern.urlPatterns) {
        if (urlPattern.test(url)) {
          signals.push(`URL matches ${pattern.templateId} pattern: ${url}`);
          score += 0.3;
          break;
        }
      }
    }

    // Check content patterns (medium signal)
    const contentLower = scrapedContent.toLowerCase();
    for (const contentPattern of pattern.contentPatterns) {
      if (contentPattern.test(scrapedContent)) {
        signals.push(`Content matches pattern: ${contentPattern.source}`);
        score += 0.15;
      }
    }

    // Check endpoint patterns in parsed doc (high signal)
    for (const endpoint of parsedDoc.endpoints) {
      for (const endpointPattern of pattern.endpointPatterns) {
        if (endpointPattern.test(endpoint.path)) {
          signals.push(`Endpoint path matches: ${endpoint.path}`);
          score += 0.2;
          break;
        }
      }
    }

    // Check keywords (low signal)
    for (const keyword of pattern.keywords) {
      if (contentLower.includes(keyword.toLowerCase())) {
        signals.push(`Keyword found: ${keyword}`);
        score += 0.05;
      }
    }

    // Cap score at 1.0
    const confidence = Math.min(score, 1.0);

    // Extract base URL if possible
    let suggestedBaseUrl: string | undefined;
    if (pattern.baseUrlExtractor) {
      suggestedBaseUrl = pattern.baseUrlExtractor(scrapedContent, sourceUrls[0] || '');
    }

    // Update best match if this is better
    if (confidence > bestMatch.confidence && confidence >= 0.3) {
      bestMatch = {
        detected: true,
        template,
        confidence,
        signals,
        suggestedBaseUrl,
      };
    }
  }

  return bestMatch;
}

/**
 * Check if a URL looks like it belongs to a templated API
 * (Quick check before full detection)
 */
export function quickTemplateCheck(url: string): {
  likely: boolean;
  templateHint?: string;
} {
  const urlLower = url.toLowerCase();

  if (urlLower.includes('supabase')) {
    return { likely: true, templateHint: 'postgrest' };
  }
  if (urlLower.includes('postgrest')) {
    return { likely: true, templateHint: 'postgrest' };
  }
  if (urlLower.includes('airtable')) {
    return { likely: true, templateHint: 'rest-crud' };
  }
  if (urlLower.includes('notion.so') || urlLower.includes('notion.com')) {
    return { likely: true, templateHint: 'rest-crud' };
  }

  return { likely: false };
}
