/**
 * AI Document Parser
 *
 * Uses AI (Gemini) to extract structured API information from documentation.
 * Handles unstructured markdown/text and converts it to ParsedApiDoc format.
 */

import { getLLM } from './llm';
import type { LLMProvider, LLMModelId } from './llm';
import {
  buildApiInfoExtractionPrompt,
  buildEndpointExtractionPrompt,
  buildAuthDetectionPrompt,
  buildRateLimitDetectionPrompt,
  API_INFO_SCHEMA,
  ENDPOINTS_ARRAY_SCHEMA,
  AUTH_METHODS_ARRAY_SCHEMA,
  RATE_LIMITS_SCHEMA,
} from './prompts';
import type {
  ParsedApiDoc,
  ApiEndpoint,
  ApiAuthMethod,
  RateLimitsConfig,
} from './scrape-job.schemas';

// =============================================================================
// Types
// =============================================================================

/**
 * Options for parsing API documentation
 */
export interface ParseOptions {
  /** Source URLs for metadata */
  sourceUrls?: string[];
  /** Model to use for parsing (defaults to gemini-1.5-flash) */
  model?: LLMModelId;
  /** Whether to use chunked parsing for large documents */
  chunkedParsing?: boolean;
  /** Maximum content length before chunking (default: 100000 chars) */
  maxContentLength?: number;
  /** Callback for progress updates */
  onProgress?: (message: string) => void;
}

/**
 * Result of parsing API documentation
 */
export interface ParseResult {
  /** The parsed API documentation */
  doc: ParsedApiDoc;
  /** Overall confidence score (0-1) */
  confidence: number;
  /** Warnings encountered during parsing */
  warnings: string[];
  /** Parsing duration in milliseconds */
  durationMs: number;
}

/**
 * Error thrown when parsing fails
 */
export class ParseError extends Error {
  constructor(
    public code: ParseErrorCode,
    message: string,
    public cause?: unknown
  ) {
    super(message);
    this.name = 'ParseError';
  }
}

export type ParseErrorCode =
  | 'EMPTY_CONTENT'
  | 'AI_ERROR'
  | 'INVALID_RESPONSE'
  | 'EXTRACTION_FAILED'
  | 'TIMEOUT';

// =============================================================================
// Constants
// =============================================================================

/** Maximum content length before using chunked parsing */
const DEFAULT_MAX_CONTENT_LENGTH = 100_000;

/** Default model for parsing */
const DEFAULT_MODEL: LLMModelId = 'gemini-1.5-flash';

/** Chunk size for large documents */
const CHUNK_SIZE = 50_000;

/** Overlap between chunks to maintain context */
const CHUNK_OVERLAP = 2_000;

// =============================================================================
// Main Parser
// =============================================================================

/**
 * Parse API documentation content using AI
 *
 * This is the main entry point for AI-powered documentation parsing.
 * It extracts structured API information from unstructured markdown/text.
 *
 * @param content - The documentation content to parse (markdown/text)
 * @param options - Parsing options
 * @returns Parsed API documentation with confidence scores
 *
 * @example
 * ```ts
 * const result = await parseApiDocumentation(markdownContent, {
 *   sourceUrls: ['https://api.example.com/docs'],
 *   onProgress: (msg) => console.log(msg),
 * });
 * console.log(result.doc.endpoints); // Extracted endpoints
 * console.log(result.confidence);    // 0.85
 * ```
 */
export async function parseApiDocumentation(
  content: string,
  options: ParseOptions = {}
): Promise<ParseResult> {
  const startTime = Date.now();
  const warnings: string[] = [];
  const maxContentLength = options.maxContentLength ?? DEFAULT_MAX_CONTENT_LENGTH;

  // Validate content
  if (!content || content.trim().length === 0) {
    throw new ParseError('EMPTY_CONTENT', 'Documentation content is empty');
  }

  options.onProgress?.('Starting AI documentation parsing...');

  // Check if we need chunked parsing
  const useChunking = options.chunkedParsing ?? content.length > maxContentLength;

  let doc: ParsedApiDoc;
  let confidence: number;

  if (useChunking && content.length > maxContentLength) {
    options.onProgress?.('Document is large, using chunked parsing...');
    const result = await parseInChunks(content, options);
    doc = result.doc;
    confidence = result.confidence;
    warnings.push(...result.warnings);
  } else {
    const result = await parseSingleDocument(content, options);
    doc = result.doc;
    confidence = result.confidence;
    warnings.push(...result.warnings);
  }

  // Add metadata
  doc.metadata = {
    scrapedAt: new Date().toISOString(),
    sourceUrls: options.sourceUrls ?? [],
    aiConfidence: confidence,
    warnings,
  };

  const durationMs = Date.now() - startTime;
  options.onProgress?.(`Parsing complete in ${durationMs}ms`);

  return {
    doc,
    confidence,
    warnings,
    durationMs,
  };
}

// =============================================================================
// Single Document Parsing
// =============================================================================

/**
 * Parse a single document (not chunked)
 */
async function parseSingleDocument(
  content: string,
  options: ParseOptions
): Promise<{ doc: ParsedApiDoc; confidence: number; warnings: string[] }> {
  const warnings: string[] = [];
  const llm = getLLM(options.model ?? DEFAULT_MODEL);

  // Extract components in parallel for speed
  options.onProgress?.('Extracting API information...');

  const [apiInfo, endpoints, authMethods, rateLimits] = await Promise.all([
    extractApiInfo(content, llm),
    extractEndpoints(content, llm),
    extractAuthMethods(content, llm),
    extractRateLimits(content, llm),
  ]);

  // Calculate overall confidence
  const confidences = [
    apiInfo.confidence,
    endpoints.confidence,
    authMethods.confidence,
    rateLimits.confidence,
  ];
  const confidence = confidences.reduce((a, b) => a + b, 0) / confidences.length;

  // Collect warnings
  warnings.push(
    ...apiInfo.warnings,
    ...endpoints.warnings,
    ...authMethods.warnings,
    ...rateLimits.warnings
  );

  // Build the final document
  const doc: ParsedApiDoc = {
    name: apiInfo.data.name || 'Unknown API',
    description: apiInfo.data.description,
    baseUrl: apiInfo.data.baseUrl || 'https://api.example.com',
    version: apiInfo.data.version,
    authMethods: authMethods.data,
    endpoints: endpoints.data,
    rateLimits: rateLimits.data,
  };

  // Add warnings for missing critical data
  if (!apiInfo.data.name) {
    warnings.push('API name could not be determined');
  }
  if (!apiInfo.data.baseUrl) {
    warnings.push('Base URL could not be determined, using placeholder');
  }
  if (endpoints.data.length === 0) {
    warnings.push('No endpoints were extracted');
  }
  if (authMethods.data.length === 0) {
    warnings.push('No authentication methods were detected');
  }

  return { doc, confidence, warnings };
}

// =============================================================================
// Chunked Parsing
// =============================================================================

/**
 * Parse a large document by splitting into chunks
 */
async function parseInChunks(
  content: string,
  options: ParseOptions
): Promise<{ doc: ParsedApiDoc; confidence: number; warnings: string[] }> {
  const warnings: string[] = [];
  const llm = getLLM(options.model ?? DEFAULT_MODEL);

  // Split content into overlapping chunks
  const chunks = splitIntoChunks(content, CHUNK_SIZE, CHUNK_OVERLAP);
  options.onProgress?.(`Split document into ${chunks.length} chunks`);

  // Extract API info from first chunk (usually has overview)
  options.onProgress?.('Extracting API information from overview...');
  const apiInfo = await extractApiInfo(chunks[0], llm);

  // Extract endpoints from all chunks
  options.onProgress?.('Extracting endpoints from all chunks...');
  const allEndpoints: ApiEndpoint[] = [];
  const endpointConfidences: number[] = [];

  for (let i = 0; i < chunks.length; i++) {
    options.onProgress?.(`Processing chunk ${i + 1}/${chunks.length}...`);
    const result = await extractEndpoints(chunks[i], llm);
    allEndpoints.push(...result.data);
    endpointConfidences.push(result.confidence);
    warnings.push(...result.warnings);
  }

  // Deduplicate endpoints by slug
  const uniqueEndpoints = deduplicateEndpoints(allEndpoints);

  // Extract auth from first few chunks (usually in getting started sections)
  const authChunks = chunks.slice(0, Math.min(3, chunks.length)).join('\n\n');
  const authMethods = await extractAuthMethods(authChunks, llm);

  // Extract rate limits (often in first or last chunk)
  const rateLimitContent = chunks[0] + '\n\n' + chunks[chunks.length - 1];
  const rateLimits = await extractRateLimits(rateLimitContent, llm);

  // Calculate confidence
  const avgEndpointConfidence =
    endpointConfidences.length > 0
      ? endpointConfidences.reduce((a, b) => a + b, 0) / endpointConfidences.length
      : 0.5;

  const confidence =
    (apiInfo.confidence + avgEndpointConfidence + authMethods.confidence + rateLimits.confidence) /
    4;

  // Build document
  const doc: ParsedApiDoc = {
    name: apiInfo.data.name || 'Unknown API',
    description: apiInfo.data.description,
    baseUrl: apiInfo.data.baseUrl || 'https://api.example.com',
    version: apiInfo.data.version,
    authMethods: authMethods.data,
    endpoints: uniqueEndpoints,
    rateLimits: rateLimits.data,
  };

  warnings.push(...apiInfo.warnings, ...authMethods.warnings, ...rateLimits.warnings);

  if (allEndpoints.length !== uniqueEndpoints.length) {
    warnings.push(
      `Deduplicated ${allEndpoints.length - uniqueEndpoints.length} duplicate endpoints across chunks`
    );
  }

  return { doc, confidence, warnings };
}

/**
 * Split content into overlapping chunks
 */
function splitIntoChunks(content: string, chunkSize: number, overlap: number): string[] {
  const chunks: string[] = [];
  let start = 0;

  while (start < content.length) {
    const end = Math.min(start + chunkSize, content.length);
    chunks.push(content.slice(start, end));

    // Move start forward, accounting for overlap
    start = end - overlap;

    // Avoid infinite loop if overlap is larger than remaining content
    if (start >= content.length - overlap) {
      break;
    }
  }

  return chunks;
}

/**
 * Deduplicate endpoints by slug
 */
function deduplicateEndpoints(endpoints: ApiEndpoint[]): ApiEndpoint[] {
  const seen = new Map<string, ApiEndpoint>();

  for (const endpoint of endpoints) {
    const key = `${endpoint.method}:${endpoint.path}`;
    if (!seen.has(key)) {
      seen.set(key, endpoint);
    } else {
      // Merge: keep the one with more complete data
      const existing = seen.get(key)!;
      if (
        (endpoint.description && !existing.description) ||
        (endpoint.requestBody && !existing.requestBody) ||
        Object.keys(endpoint.responses || {}).length > Object.keys(existing.responses || {}).length
      ) {
        seen.set(key, endpoint);
      }
    }
  }

  return Array.from(seen.values());
}

// =============================================================================
// Component Extractors
// =============================================================================

interface ExtractionResult<T> {
  data: T;
  confidence: number;
  warnings: string[];
}

/**
 * Extract basic API info (name, baseUrl, description)
 */
async function extractApiInfo(
  content: string,
  llm: LLMProvider
): Promise<
  ExtractionResult<{ name?: string; description?: string; baseUrl?: string; version?: string }>
> {
  const warnings: string[] = [];

  try {
    const prompt = buildApiInfoExtractionPrompt(content);
    const result = await llm.generate<{
      name?: string;
      description?: string;
      baseUrl?: string;
      version?: string;
    }>(prompt, { responseSchema: API_INFO_SCHEMA });

    // Estimate confidence based on completeness
    let confidence = 1.0;
    if (!result.content.name) confidence -= 0.3;
    if (!result.content.baseUrl) confidence -= 0.3;
    if (!result.content.description) confidence -= 0.1;

    return {
      data: result.content,
      confidence: Math.max(0.3, confidence),
      warnings,
    };
  } catch (error) {
    warnings.push(
      `API info extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
    return {
      data: {},
      confidence: 0.0,
      warnings,
    };
  }
}

/**
 * Extract API endpoints
 */
async function extractEndpoints(
  content: string,
  llm: LLMProvider
): Promise<ExtractionResult<ApiEndpoint[]>> {
  const warnings: string[] = [];

  try {
    const prompt = buildEndpointExtractionPrompt(content);
    const result = await llm.generate<ApiEndpoint[]>(prompt, {
      responseSchema: ENDPOINTS_ARRAY_SCHEMA,
    });

    // Validate and clean endpoints
    const validEndpoints = (result.content || []).filter((ep: ApiEndpoint) => {
      if (!ep.name || !ep.method || !ep.path) {
        warnings.push(`Skipped invalid endpoint: missing required fields`);
        return false;
      }
      return true;
    });

    // Ensure slugs are set
    for (const ep of validEndpoints) {
      if (!ep.slug) {
        ep.slug = generateSlug(ep.name);
      }
      // Ensure responses object exists
      if (!ep.responses) {
        ep.responses = { '200': { description: 'Successful response' } };
      }
    }

    // Estimate confidence based on endpoint quality
    let confidence = 0.8;
    if (validEndpoints.length === 0) {
      confidence = 0.0;
    } else {
      const withDescriptions = validEndpoints.filter((ep: ApiEndpoint) => ep.description).length;
      const withParams = validEndpoints.filter(
        (ep: ApiEndpoint) =>
          ep.pathParameters?.length || ep.queryParameters?.length || ep.requestBody
      ).length;
      confidence =
        0.5 +
        (withDescriptions / validEndpoints.length) * 0.25 +
        (withParams / validEndpoints.length) * 0.25;
    }

    return {
      data: validEndpoints,
      confidence,
      warnings,
    };
  } catch (error) {
    warnings.push(
      `Endpoint extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
    return {
      data: [],
      confidence: 0.0,
      warnings,
    };
  }
}

/**
 * Extract authentication methods
 */
async function extractAuthMethods(
  content: string,
  llm: LLMProvider
): Promise<ExtractionResult<ApiAuthMethod[]>> {
  const warnings: string[] = [];

  try {
    const prompt = buildAuthDetectionPrompt(content);
    const result = await llm.generate<ApiAuthMethod[]>(prompt, {
      responseSchema: AUTH_METHODS_ARRAY_SCHEMA,
    });

    // Validate auth methods
    const validMethods = (result.content || []).filter((auth: ApiAuthMethod) => {
      if (!auth.type) {
        warnings.push(`Skipped invalid auth method: missing type`);
        return false;
      }
      return true;
    });

    // Ensure config exists
    for (const auth of validMethods) {
      if (!auth.config) {
        auth.config = {};
      }
    }

    // Estimate confidence
    const confidence = validMethods.length > 0 ? 0.8 : 0.3;

    return {
      data: validMethods,
      confidence,
      warnings,
    };
  } catch (error) {
    warnings.push(
      `Auth detection failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
    return {
      data: [],
      confidence: 0.0,
      warnings,
    };
  }
}

/**
 * Extract rate limits
 */
async function extractRateLimits(
  content: string,
  llm: LLMProvider
): Promise<ExtractionResult<RateLimitsConfig | undefined>> {
  const warnings: string[] = [];

  try {
    const prompt = buildRateLimitDetectionPrompt(content);
    const result = await llm.generate<RateLimitsConfig>(prompt, {
      responseSchema: RATE_LIMITS_SCHEMA,
    });

    // Check if we got meaningful data
    const hasData =
      result.content?.default || Object.keys(result.content?.perEndpoint || {}).length > 0;

    return {
      data: hasData ? result.content : undefined,
      confidence: hasData ? 0.7 : 0.5,
      warnings,
    };
  } catch (error) {
    warnings.push(
      `Rate limit detection failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
    return {
      data: undefined,
      confidence: 0.5,
      warnings,
    };
  }
}

// =============================================================================
// Utilities
// =============================================================================

/**
 * Generate a URL-safe slug from a name
 */
function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Type guard for ParseError
 */
export function isParseError(error: unknown): error is ParseError {
  return error instanceof ParseError;
}
