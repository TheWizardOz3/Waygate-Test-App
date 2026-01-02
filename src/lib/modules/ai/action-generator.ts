/**
 * Action Definition Generator
 *
 * Transforms parsed API documentation (ParsedApiDoc) into Action definitions
 * that can be stored in the database and used for API invocation.
 *
 * Key responsibilities:
 * - Convert ApiEndpoint → ActionDefinition
 * - Generate JSON Schema for input validation
 * - Generate JSON Schema for output validation
 * - Apply wishlist prioritization
 * - Generate URL-safe slugs
 */

import type { HttpMethod } from '@prisma/client';
import type {
  ParsedApiDoc,
  ApiEndpoint,
  ApiParameter,
  ApiResponse,
  ApiAuthMethod,
  RateLimitsConfig,
} from './scrape-job.schemas';

// =============================================================================
// Types
// =============================================================================

/**
 * JSON Schema structure for action input/output validation
 */
export interface JsonSchema {
  type: 'object' | 'array' | 'string' | 'number' | 'integer' | 'boolean' | 'null';
  properties?: Record<string, JsonSchemaProperty>;
  required?: string[];
  items?: JsonSchemaProperty;
  additionalProperties?: boolean | JsonSchemaProperty;
  description?: string;
  title?: string;
}

export interface JsonSchemaProperty {
  type: string | string[];
  description?: string;
  default?: unknown;
  enum?: (string | number | boolean)[];
  format?: string;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  items?: JsonSchemaProperty;
  properties?: Record<string, JsonSchemaProperty>;
  required?: string[];
  nullable?: boolean;
  additionalProperties?: boolean | JsonSchemaProperty;
  oneOf?: JsonSchemaProperty[];
  anyOf?: JsonSchemaProperty[];
  allOf?: JsonSchemaProperty[];
  $ref?: string;
}

/**
 * Action definition ready for database insertion
 */
export interface ActionDefinition {
  /** Human-readable action name */
  name: string;
  /** URL-safe unique identifier (scoped to integration) */
  slug: string;
  /** Action description */
  description?: string;
  /** HTTP method */
  httpMethod: HttpMethod;
  /** URL template with {param} placeholders */
  endpointTemplate: string;
  /** JSON Schema for input validation */
  inputSchema: JsonSchema;
  /** JSON Schema for output validation */
  outputSchema: JsonSchema;
  /** Optional pagination configuration */
  paginationConfig?: PaginationConfig;
  /** Optional retry configuration */
  retryConfig?: RetryConfig;
  /** Whether response can be cached */
  cacheable: boolean;
  /** Cache TTL in seconds (if cacheable) */
  cacheTtlSeconds?: number;
  /** Additional metadata */
  metadata: ActionMetadata;
}

/**
 * Pagination configuration for list endpoints
 */
export interface PaginationConfig {
  type: 'cursor' | 'offset' | 'page' | 'link';
  pageParam?: string;
  limitParam?: string;
  cursorParam?: string;
  responsePagePath?: string;
  responseTotalPath?: string;
  responseNextCursorPath?: string;
}

/**
 * Retry configuration for the action
 */
export interface RetryConfig {
  maxRetries?: number;
  retryableStatuses?: number[];
  backoffMultiplier?: number;
}

/**
 * Action metadata
 */
export interface ActionMetadata {
  /** Original endpoint path */
  originalPath: string;
  /** Tags/categories */
  tags?: string[];
  /** Whether endpoint is deprecated */
  deprecated?: boolean;
  /** AI confidence score for this action */
  aiConfidence?: number;
  /** Rate limit specific to this endpoint */
  rateLimit?: { requests: number; window: number };
  /** Source documentation URL */
  sourceUrl?: string;
  /** Wishlist match score (1 = matched, 0 = not matched) */
  wishlistScore?: number;
}

/**
 * Options for action generation
 */
export interface GenerateActionsOptions {
  /** Wishlist terms for prioritization */
  wishlist?: string[];
  /** Source URL for metadata */
  sourceUrl?: string;
  /** AI confidence to include in metadata */
  aiConfidence?: number;
  /** Default cache TTL for GET requests (seconds) */
  defaultCacheTtl?: number;
  /** Whether to include deprecated endpoints */
  includeDeprecated?: boolean;
}

/**
 * Result of action generation
 */
export interface GenerateActionsResult {
  /** Generated action definitions */
  actions: ActionDefinition[];
  /** Actions that matched wishlist items (if provided) */
  matchedActions: string[];
  /** Actions that did not match wishlist items */
  unmatchedActions: string[];
  /** Warnings during generation */
  warnings: string[];
  /** Statistics */
  stats: {
    totalEndpoints: number;
    generatedActions: number;
    skippedDeprecated: number;
    skippedDuplicates: number;
  };
}

// =============================================================================
// Main Generator
// =============================================================================

/**
 * Generate Action definitions from parsed API documentation
 *
 * @param parsedDoc - Parsed API documentation
 * @param options - Generation options
 * @returns Generated action definitions with metadata
 *
 * @example
 * ```ts
 * const result = generateActions(parsedDoc, {
 *   wishlist: ['send message', 'list users'],
 *   sourceUrl: 'https://api.slack.com/docs',
 * });
 *
 * // Result contains sorted actions with wishlist matches first
 * for (const action of result.actions) {
 *   await createAction(integrationId, action);
 * }
 * ```
 */
export function generateActions(
  parsedDoc: ParsedApiDoc,
  options: GenerateActionsOptions = {}
): GenerateActionsResult {
  const {
    wishlist = [],
    sourceUrl,
    aiConfidence,
    defaultCacheTtl = 300, // 5 minutes
    includeDeprecated = false,
  } = options;

  const warnings: string[] = [];
  const seenSlugs = new Set<string>();
  const actions: ActionDefinition[] = [];
  let skippedDeprecated = 0;
  let skippedDuplicates = 0;

  // Normalize wishlist for matching
  const normalizedWishlist = wishlist.map((term) => term.toLowerCase().trim());

  // Process each endpoint
  for (const endpoint of parsedDoc.endpoints) {
    // Skip deprecated if not included
    if (endpoint.deprecated && !includeDeprecated) {
      skippedDeprecated++;
      continue;
    }

    // Generate slug
    let slug = generateSlug(endpoint.slug || endpoint.name);

    // Handle duplicate slugs
    if (seenSlugs.has(slug)) {
      const originalSlug = slug;
      slug = makeUniqueSlug(slug, endpoint.method, seenSlugs);
      warnings.push(`Duplicate slug "${originalSlug}" renamed to "${slug}"`);
      skippedDuplicates++;
    }
    seenSlugs.add(slug);

    // Calculate wishlist match score
    const wishlistScore = calculateWishlistScore(endpoint, normalizedWishlist);

    // Generate the action definition
    const action = generateActionDefinition(endpoint, {
      slug,
      baseUrl: parsedDoc.baseUrl,
      rateLimits: parsedDoc.rateLimits,
      sourceUrl,
      aiConfidence,
      defaultCacheTtl,
      wishlistScore,
    });

    actions.push(action);
  }

  // Sort by wishlist score (matched first), then by name
  actions.sort((a, b) => {
    const scoreA = a.metadata.wishlistScore ?? 0;
    const scoreB = b.metadata.wishlistScore ?? 0;
    if (scoreA !== scoreB) {
      return scoreB - scoreA; // Higher score first
    }
    return a.name.localeCompare(b.name);
  });

  // Categorize matched vs unmatched
  const matchedActions = actions
    .filter((a) => (a.metadata.wishlistScore ?? 0) > 0)
    .map((a) => a.slug);
  const unmatchedActions = actions
    .filter((a) => (a.metadata.wishlistScore ?? 0) === 0)
    .map((a) => a.slug);

  return {
    actions,
    matchedActions,
    unmatchedActions,
    warnings,
    stats: {
      totalEndpoints: parsedDoc.endpoints.length,
      generatedActions: actions.length,
      skippedDeprecated,
      skippedDuplicates,
    },
  };
}

// =============================================================================
// Action Definition Generation
// =============================================================================

interface ActionGenerationContext {
  slug: string;
  baseUrl: string;
  rateLimits?: RateLimitsConfig;
  sourceUrl?: string;
  aiConfidence?: number;
  defaultCacheTtl: number;
  wishlistScore: number;
}

function generateActionDefinition(
  endpoint: ApiEndpoint,
  context: ActionGenerationContext
): ActionDefinition {
  const { slug, baseUrl, rateLimits, sourceUrl, aiConfidence, defaultCacheTtl, wishlistScore } =
    context;

  // Build endpoint template (baseUrl + path with {param} placeholders)
  const endpointTemplate = buildEndpointTemplate(baseUrl, endpoint.path);

  // Generate input schema from parameters and request body
  const inputSchema = generateInputSchema(endpoint);

  // Generate output schema from responses
  const outputSchema = generateOutputSchema(endpoint.responses);

  // Determine cacheability (GET requests without side effects)
  const cacheable = endpoint.method === 'GET';

  // Check for pagination indicators
  const paginationConfig = detectPaginationConfig(endpoint);

  // Get endpoint-specific rate limit
  const endpointRateLimit = rateLimits?.perEndpoint?.[endpoint.path] || rateLimits?.default;

  return {
    name: endpoint.name,
    slug,
    description: endpoint.description,
    httpMethod: endpoint.method as HttpMethod,
    endpointTemplate,
    inputSchema,
    outputSchema,
    paginationConfig,
    cacheable,
    cacheTtlSeconds: cacheable ? defaultCacheTtl : undefined,
    metadata: {
      originalPath: endpoint.path,
      tags: endpoint.tags,
      deprecated: endpoint.deprecated,
      aiConfidence,
      rateLimit: endpointRateLimit,
      sourceUrl,
      wishlistScore: wishlistScore > 0 ? wishlistScore : undefined,
    },
  };
}

// =============================================================================
// Input Schema Generation
// =============================================================================

function generateInputSchema(endpoint: ApiEndpoint): JsonSchema {
  const properties: Record<string, JsonSchemaProperty> = {};
  const required: string[] = [];

  // Add path parameters
  if (endpoint.pathParameters) {
    for (const param of endpoint.pathParameters) {
      properties[param.name] = parameterToSchemaProperty(param);
      if (param.required) {
        required.push(param.name);
      }
    }
  }

  // Add query parameters
  if (endpoint.queryParameters) {
    for (const param of endpoint.queryParameters) {
      properties[param.name] = parameterToSchemaProperty(param);
      if (param.required) {
        required.push(param.name);
      }
    }
  }

  // Add header parameters (excluding standard headers)
  if (endpoint.headerParameters) {
    const nonStandardHeaders = endpoint.headerParameters.filter((p) => !isStandardHeader(p.name));
    for (const param of nonStandardHeaders) {
      properties[param.name] = parameterToSchemaProperty(param);
      if (param.required) {
        required.push(param.name);
      }
    }
  }

  // Add request body properties
  if (endpoint.requestBody?.schema) {
    const bodySchema = endpoint.requestBody.schema;

    // If body has properties, merge them
    if (bodySchema.properties && typeof bodySchema.properties === 'object') {
      for (const [key, value] of Object.entries(bodySchema.properties)) {
        // Prefix body properties with 'body.' to distinguish from params
        // Actually, let's keep them flat for simplicity - most APIs expect flat input
        properties[key] = value as JsonSchemaProperty;
      }

      // Add required body properties
      if (Array.isArray(bodySchema.required)) {
        for (const req of bodySchema.required) {
          if (typeof req === 'string' && !required.includes(req)) {
            required.push(req);
          }
        }
      }
    } else {
      // Body is not an object schema - wrap it
      properties['body'] = bodySchema as unknown as JsonSchemaProperty;
      if (endpoint.requestBody.required) {
        required.push('body');
      }
    }
  }

  return {
    type: 'object',
    properties,
    required: required.length > 0 ? required : undefined,
    additionalProperties: false,
  };
}

function parameterToSchemaProperty(param: ApiParameter): JsonSchemaProperty {
  const property: JsonSchemaProperty = {
    type: mapParameterType(param.type),
    description: param.description,
  };

  if (param.default !== undefined) {
    property.default = param.default;
  }

  if (param.enum && param.enum.length > 0) {
    property.enum = param.enum;
  }

  return property;
}

function mapParameterType(type: string): string {
  const typeMap: Record<string, string> = {
    string: 'string',
    number: 'number',
    integer: 'integer',
    boolean: 'boolean',
    array: 'array',
    object: 'object',
    file: 'string', // Files are typically base64 or URLs
    date: 'string',
    datetime: 'string',
    uuid: 'string',
    email: 'string',
    url: 'string',
    uri: 'string',
  };

  return typeMap[type.toLowerCase()] || 'string';
}

function isStandardHeader(name: string): boolean {
  const standardHeaders = [
    'content-type',
    'accept',
    'authorization',
    'user-agent',
    'host',
    'connection',
    'cache-control',
  ];
  return standardHeaders.includes(name.toLowerCase());
}

// =============================================================================
// Output Schema Generation
// =============================================================================

function generateOutputSchema(responses: Record<string, ApiResponse>): JsonSchema {
  // Find the success response (200, 201, 204)
  const successResponse =
    responses['200'] || responses['201'] || responses['204'] || responses['default'];

  if (!successResponse?.schema) {
    // No schema defined, return generic object
    return {
      type: 'object',
      additionalProperties: true,
      description: successResponse?.description || 'Response data',
    };
  }

  const schema = successResponse.schema;

  // If it's already a valid JSON Schema object, return it
  if (schema.type) {
    return schema as unknown as JsonSchema;
  }

  // Wrap in object type
  return {
    type: 'object',
    properties: schema.properties as Record<string, JsonSchemaProperty> | undefined,
    required: schema.required as string[] | undefined,
    additionalProperties: true,
    description: successResponse.description,
  };
}

// =============================================================================
// Slug Generation
// =============================================================================

/**
 * Generate a URL-safe slug from a name
 */
export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-') // Replace non-alphanumeric with hyphens
    .replace(/^-+|-+$/g, '') // Remove leading/trailing hyphens
    .replace(/-+/g, '-') // Collapse multiple hyphens
    .slice(0, 100); // Max length
}

/**
 * Make a slug unique by appending method or counter
 */
function makeUniqueSlug(slug: string, method: string, existing: Set<string>): string {
  // First try appending method
  const withMethod = `${slug}-${method.toLowerCase()}`;
  if (!existing.has(withMethod)) {
    return withMethod;
  }

  // Fall back to counter
  let counter = 2;
  while (existing.has(`${slug}-${counter}`)) {
    counter++;
  }
  return `${slug}-${counter}`;
}

// =============================================================================
// Endpoint Template Building
// =============================================================================

function buildEndpointTemplate(baseUrl: string, path: string): string {
  // Normalize base URL (remove trailing slash)
  const normalizedBase = baseUrl.replace(/\/+$/, '');

  // Normalize path (ensure leading slash)
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;

  // Convert :param style to {param} style
  const templatePath = normalizedPath.replace(/:([a-zA-Z_][a-zA-Z0-9_]*)/g, '{$1}');

  return `${normalizedBase}${templatePath}`;
}

// =============================================================================
// Pagination Detection
// =============================================================================

function detectPaginationConfig(endpoint: ApiEndpoint): PaginationConfig | undefined {
  // Only check GET endpoints (list operations)
  if (endpoint.method !== 'GET') {
    return undefined;
  }

  const queryParams = endpoint.queryParameters || [];
  const paramNames = queryParams.map((p) => p.name.toLowerCase());

  // Check for cursor pagination
  if (paramNames.some((p) => p.includes('cursor') || p.includes('after') || p.includes('before'))) {
    const cursorParam = queryParams.find((p) =>
      ['cursor', 'after', 'page_token', 'starting_after'].includes(p.name.toLowerCase())
    );
    return {
      type: 'cursor',
      cursorParam: cursorParam?.name,
      limitParam: queryParams.find((p) =>
        ['limit', 'page_size', 'per_page', 'count'].includes(p.name.toLowerCase())
      )?.name,
    };
  }

  // Check for offset pagination
  if (paramNames.some((p) => p.includes('offset') || p.includes('skip'))) {
    return {
      type: 'offset',
      pageParam: queryParams.find((p) => p.name.toLowerCase().includes('offset'))?.name || 'offset',
      limitParam: queryParams.find((p) =>
        ['limit', 'page_size', 'per_page', 'count'].includes(p.name.toLowerCase())
      )?.name,
    };
  }

  // Check for page number pagination
  if (paramNames.some((p) => p === 'page' || p === 'page_number' || p === 'pagenumber')) {
    return {
      type: 'page',
      pageParam: queryParams.find((p) =>
        ['page', 'page_number', 'pagenumber'].includes(p.name.toLowerCase())
      )?.name,
      limitParam: queryParams.find((p) =>
        ['limit', 'page_size', 'per_page', 'count', 'size'].includes(p.name.toLowerCase())
      )?.name,
    };
  }

  return undefined;
}

// =============================================================================
// Wishlist Matching
// =============================================================================

function calculateWishlistScore(endpoint: ApiEndpoint, normalizedWishlist: string[]): number {
  if (normalizedWishlist.length === 0) {
    return 0;
  }

  // Fields to search for matches
  const searchableText = [
    endpoint.name.toLowerCase(),
    endpoint.slug.toLowerCase(),
    endpoint.path.toLowerCase(),
    endpoint.description?.toLowerCase() || '',
    ...(endpoint.tags?.map((t) => t.toLowerCase()) || []),
  ].join(' ');

  // Count matching terms
  let matchCount = 0;
  for (const term of normalizedWishlist) {
    if (searchableText.includes(term)) {
      matchCount++;
    }
  }

  // Return score (0-1)
  return matchCount / normalizedWishlist.length;
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Convert auth methods from ParsedApiDoc to action-compatible format
 */
export function extractAuthConfig(authMethods: ApiAuthMethod[]): {
  primaryAuth?: ApiAuthMethod;
  supportedAuthTypes: string[];
} {
  if (authMethods.length === 0) {
    return { supportedAuthTypes: [] };
  }

  // Use first auth method as primary
  return {
    primaryAuth: authMethods[0],
    supportedAuthTypes: authMethods.map((a) => a.type),
  };
}

/**
 * Create a summary of generated actions for logging/display
 */
export function summarizeActions(result: GenerateActionsResult): string {
  const lines = [
    `Generated ${result.stats.generatedActions} actions from ${result.stats.totalEndpoints} endpoints`,
  ];

  if (result.stats.skippedDeprecated > 0) {
    lines.push(`  - Skipped ${result.stats.skippedDeprecated} deprecated endpoints`);
  }

  if (result.stats.skippedDuplicates > 0) {
    lines.push(`  - Renamed ${result.stats.skippedDuplicates} duplicate slugs`);
  }

  if (result.matchedActions.length > 0) {
    lines.push(`  - ${result.matchedActions.length} actions matched wishlist`);
  }

  if (result.warnings.length > 0) {
    lines.push(`  - ${result.warnings.length} warnings`);
  }

  return lines.join('\n');
}
