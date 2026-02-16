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
  /** Model to use for parsing (defaults to gemini-2.0-pro) */
  model?: LLMModelId;
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
  /** Auth detection confidence score (0-1) */
  authConfidence: number;
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

/** Maximum content length for single-shot processing (~200K tokens) */
const MAX_CONTENT_LENGTH = 800_000;

/** Default model for parsing - Pro for better reasoning and longer outputs */
const DEFAULT_MODEL: LLMModelId = 'gemini-3-pro';

/** Max output tokens for endpoint extraction (high for extracting many endpoints) */
const ENDPOINT_EXTRACTION_MAX_TOKENS = 32768;

/** Timeout for endpoint extraction - longer due to large content size */
const ENDPOINT_EXTRACTION_TIMEOUT_MS = 300_000; // 5 minutes

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

  // Validate content
  if (!content || content.trim().length === 0) {
    throw new ParseError('EMPTY_CONTENT', 'Documentation content is empty');
  }

  // Truncate if over limit (800K chars ≈ 200K tokens)
  let processContent = content;
  if (content.length > MAX_CONTENT_LENGTH) {
    const originalLength = content.length;
    processContent = content.slice(0, MAX_CONTENT_LENGTH);
    warnings.push(
      `Content truncated from ${(originalLength / 1000).toFixed(0)}K to ${(MAX_CONTENT_LENGTH / 1000).toFixed(0)}K chars`
    );
    console.log(
      `[Document Parser] Content truncated: ${originalLength} -> ${MAX_CONTENT_LENGTH} chars`
    );
  }

  options.onProgress?.(
    `Starting AI documentation parsing (${(processContent.length / 1000).toFixed(0)}K chars)...`
  );

  // Single-shot parsing - no chunking needed with 1M token context window
  const result = await parseSingleDocument(processContent, options);
  const doc = result.doc;
  const confidence = result.confidence;
  const authConfidence = result.authConfidence;
  warnings.push(...result.warnings);

  // Add metadata
  doc.metadata = {
    scrapedAt: new Date().toISOString(),
    sourceUrls: options.sourceUrls ?? [],
    aiConfidence: confidence,
    authConfidence,
    warnings,
  };

  const durationMs = Date.now() - startTime;
  options.onProgress?.(`Parsing complete in ${durationMs}ms`);

  // DEBUG: Log parsing results
  console.log(`[Document Parser] Parsing complete in ${durationMs}ms`);
  console.log(`[Document Parser] API Name: ${doc.name}`);
  console.log(`[Document Parser] Base URL: ${doc.baseUrl}`);
  console.log(`[Document Parser] Endpoints found: ${doc.endpoints?.length ?? 0}`);
  console.log(`[Document Parser] Auth methods found: ${doc.authMethods?.length ?? 0}`);
  console.log(`[Document Parser] Auth confidence: ${(authConfidence * 100).toFixed(1)}%`);
  console.log(`[Document Parser] Overall confidence: ${(confidence * 100).toFixed(1)}%`);
  console.log(`[Document Parser] Warnings: ${warnings.length > 0 ? warnings.join('; ') : 'None'}`);

  return {
    doc,
    confidence,
    authConfidence,
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
): Promise<{ doc: ParsedApiDoc; confidence: number; authConfidence: number; warnings: string[] }> {
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

  return { doc, confidence, authConfidence: authMethods.confidence, warnings };
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

  // DEBUG: Log content being sent to LLM
  console.log(`[extractEndpoints] Content length being analyzed: ${content.length} chars`);
  if (content.length < 100) {
    console.log(`[extractEndpoints] WARNING: Very short content! Full content:\n${content}`);
  }

  try {
    const prompt = buildEndpointExtractionPrompt(content);
    console.log(`[extractEndpoints] Sending prompt to LLM (${prompt.length} chars)...`);

    const result = await llm.generate<ApiEndpoint[]>(prompt, {
      responseSchema: ENDPOINTS_ARRAY_SCHEMA,
      maxOutputTokens: ENDPOINT_EXTRACTION_MAX_TOKENS, // Higher limit for extracting many endpoints
      timeout: ENDPOINT_EXTRACTION_TIMEOUT_MS, // Extended timeout for large content
    });

    console.log(`[extractEndpoints] LLM returned ${result.content?.length ?? 0} endpoints`);
    if (result.content && result.content.length > 0) {
      console.log(
        `[extractEndpoints] First endpoint: ${JSON.stringify(result.content[0], null, 2)}`
      );
    }

    // Validate and clean endpoints
    const validEndpoints = (result.content || []).filter((ep: ApiEndpoint) => {
      if (!ep.name || !ep.method || !ep.path) {
        warnings.push(`Skipped invalid endpoint: missing required fields`);
        return false;
      }
      return true;
    });

    // Post-process endpoints
    for (const ep of validEndpoints) {
      if (!ep.slug) {
        ep.slug = generateSlug(ep.name);
      }
      // Ensure responses object exists
      if (!ep.responses) {
        ep.responses = { '200': { description: 'Successful response' } };
      }
      // Normalize requestBody.schema fields that may be JSON strings
      // (Gemini structured output returns strings for dynamic object schemas)
      normalizeRequestBodySchema(ep);
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
    const hasData = result.content?.default || (result.content?.perEndpoint?.length ?? 0) > 0;

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
 * Normalize requestBody.schema fields that the LLM may return as JSON strings
 * (due to Gemini requiring non-empty properties for OBJECT types).
 * Parses stringified `properties` and `required` back into proper objects/arrays.
 */
function normalizeRequestBodySchema(endpoint: ApiEndpoint): void {
  const schema = endpoint.requestBody?.schema;
  if (!schema) return;

  // Parse properties if it's a JSON string
  if (typeof schema.properties === 'string') {
    try {
      schema.properties = JSON.parse(schema.properties);
    } catch {
      // If it can't be parsed, remove the invalid field
      console.warn(
        `[Document Parser] Failed to parse requestBody.schema.properties for ${endpoint.name}`
      );
      delete schema.properties;
    }
  }

  // Parse required if it's a JSON string
  if (typeof schema.required === 'string') {
    try {
      schema.required = JSON.parse(schema.required);
    } catch {
      delete schema.required;
    }
  }
}

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
