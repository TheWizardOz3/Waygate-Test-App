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
import type { ValidationConfig } from '../execution/validation';

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
  /** Optional validation configuration */
  validationConfig?: ValidationConfig;
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
 * Enhanced to support LLM-friendly limits
 */
export interface PaginationConfig {
  /** Whether pagination is enabled */
  enabled: boolean;
  /** Pagination strategy type */
  strategy: 'cursor' | 'offset' | 'page_number' | 'link_header' | 'auto';
  /** Cursor parameter name (for cursor strategy) */
  cursorParam?: string;
  /** JSONPath to cursor in response */
  cursorPath?: string;
  /** Offset parameter name (for offset strategy) */
  offsetParam?: string;
  /** Limit parameter name */
  limitParam?: string;
  /** Page parameter name (for page_number strategy) */
  pageParam?: string;
  /** JSONPath to total count in response */
  totalPath?: string;
  /** JSONPath to total pages in response */
  totalPagesPath?: string;
  /** JSONPath to data array in response */
  dataPath?: string;
  /** JSONPath to hasMore boolean in response */
  hasMorePath?: string;
  /** Max pages to fetch (default: 5) */
  maxPages?: number;
  /** Max items to fetch (default: 500) */
  maxItems?: number;
  /** Max characters to fetch (default: 100000 ~25K tokens) */
  maxCharacters?: number;
  /** Max duration in ms (default: 30000) */
  maxDurationMs?: number;
  /** Default page size (default: 100) */
  defaultPageSize?: number;
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
  /** Specific documentation page URLs for targeted re-scraping */
  sourceUrls?: string[];
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

    // Build sourceUrls for targeted re-scraping: combine sourceUrl option with parsed doc metadata
    const actionSourceUrls = buildSourceUrls(sourceUrl, parsedDoc.metadata?.sourceUrls);

    // Generate the action definition
    const action = generateActionDefinition(endpoint, {
      slug,
      baseUrl: parsedDoc.baseUrl,
      rateLimits: parsedDoc.rateLimits,
      sourceUrl,
      sourceUrls: actionSourceUrls,
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
  sourceUrls?: string[];
  aiConfidence?: number;
  defaultCacheTtl: number;
  wishlistScore: number;
}

function generateActionDefinition(
  endpoint: ApiEndpoint,
  context: ActionGenerationContext
): ActionDefinition {
  const {
    slug,
    baseUrl,
    rateLimits,
    sourceUrl,
    sourceUrls,
    aiConfidence,
    defaultCacheTtl,
    wishlistScore,
  } = context;

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

  // Get endpoint-specific rate limit (perEndpoint is an array format)
  const endpointRateLimit =
    rateLimits?.perEndpoint?.find((r) => r.endpoint === endpoint.path) || rateLimits?.default;

  // Generate validation configuration with sensible defaults
  // Use 'warn' mode by default to be non-breaking
  // If output schema is well-defined (has explicit properties), we're more confident
  const hasDetailedOutputSchema = !!(
    outputSchema.properties && Object.keys(outputSchema.properties).length > 0
  );
  const validationConfig: ValidationConfig = {
    enabled: true,
    mode: 'warn', // Default to warn - non-breaking but informative
    nullHandling: 'pass',
    extraFields: 'preserve', // APIs often add new fields
    coercion: {
      stringToNumber: true,
      numberToString: true,
      stringToBoolean: true,
      emptyStringToNull: false,
      nullToDefault: true,
    },
    driftDetection: {
      enabled: hasDetailedOutputSchema, // Only enable if we have a real schema
      windowMinutes: 60,
      failureThreshold: 5,
      alertOnDrift: true,
    },
    bypassValidation: false,
  };

  return {
    name: endpoint.name,
    slug,
    description: endpoint.description,
    httpMethod: endpoint.method as HttpMethod,
    endpointTemplate,
    inputSchema,
    outputSchema,
    paginationConfig,
    validationConfig,
    cacheable,
    cacheTtlSeconds: cacheable ? defaultCacheTtl : undefined,
    metadata: {
      originalPath: endpoint.path,
      tags: endpoint.tags,
      deprecated: endpoint.deprecated,
      aiConfidence,
      rateLimit: endpointRateLimit,
      sourceUrl,
      sourceUrls: sourceUrls && sourceUrls.length > 0 ? sourceUrls : undefined,
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

/**
 * Common pagination parameter names for detection
 */
const PAGINATION_PATTERNS = {
  cursor: {
    params: [
      'cursor',
      'after',
      'before',
      'page_token',
      'pagetoken',
      'starting_after',
      'ending_before',
      'next_cursor',
      'continuation',
      'continuation_token',
    ],
    responsePaths: [
      'next_cursor',
      'nextCursor',
      'cursor',
      'pageToken',
      'nextPageToken',
      'page_token',
      'next_page_token',
      'continuation',
    ],
  },
  offset: {
    params: ['offset', 'skip', 'start', 'from'],
    responsePaths: ['offset', 'skip'],
  },
  page_number: {
    params: ['page', 'page_number', 'pagenumber', 'p'],
    responsePaths: ['page', 'currentPage', 'current_page', 'pageNumber'],
  },
  limit: {
    params: ['limit', 'page_size', 'pagesize', 'per_page', 'perpage', 'count', 'size', 'take'],
  },
  total: {
    responsePaths: [
      'total',
      'totalCount',
      'total_count',
      'count',
      'totalResults',
      'total_results',
      'totalItems',
      'total_items',
    ],
  },
  totalPages: {
    responsePaths: [
      'totalPages',
      'total_pages',
      'pages',
      'pageCount',
      'page_count',
      'lastPage',
      'last_page',
    ],
  },
  hasMore: {
    responsePaths: ['hasMore', 'has_more', 'hasNextPage', 'has_next_page', 'moreAvailable', 'more'],
  },
  data: {
    responsePaths: [
      'data',
      'results',
      'items',
      'records',
      'entries',
      'list',
      'rows',
      'objects',
      'values',
    ],
  },
};

/**
 * Detect pagination configuration from endpoint definition
 * Enhanced to detect from both parameters AND response schema
 */
function detectPaginationConfig(endpoint: ApiEndpoint): PaginationConfig | undefined {
  // Only check GET endpoints (list operations)
  if (endpoint.method !== 'GET') {
    return undefined;
  }

  const queryParams = endpoint.queryParameters || [];
  const paramNames = queryParams.map((p) => p.name.toLowerCase());

  // Get response schema for additional detection
  const successResponse = endpoint.responses?.['200'] || endpoint.responses?.['default'];
  const responseSchema = successResponse?.schema;

  // Detect pagination strategy from parameters
  const strategy = detectPaginationStrategy(paramNames);
  if (!strategy) {
    // No pagination parameters found, but check response schema for hints
    const responseHints = detectPaginationFromResponse(responseSchema);
    if (responseHints) {
      return responseHints;
    }
    return undefined;
  }

  // Build configuration based on detected strategy
  const config: PaginationConfig = {
    enabled: true,
    strategy: strategy,
    // LLM-friendly defaults
    maxPages: 5,
    maxItems: 500,
    maxCharacters: 100000, // ~25K tokens
    maxDurationMs: 30000,
    defaultPageSize: 100,
  };

  // Find limit parameter
  const limitParam = queryParams.find((p) =>
    PAGINATION_PATTERNS.limit.params.includes(p.name.toLowerCase())
  );
  if (limitParam) {
    config.limitParam = limitParam.name;
  }

  // Strategy-specific configuration
  switch (strategy) {
    case 'cursor': {
      const cursorParam = queryParams.find((p) =>
        PAGINATION_PATTERNS.cursor.params.includes(p.name.toLowerCase())
      );
      if (cursorParam) {
        config.cursorParam = cursorParam.name;
      }
      // Try to detect cursor path from response schema
      const cursorPath = detectFieldPath(responseSchema, PAGINATION_PATTERNS.cursor.responsePaths);
      if (cursorPath) {
        config.cursorPath = cursorPath;
      }
      break;
    }

    case 'offset': {
      const offsetParam = queryParams.find((p) =>
        PAGINATION_PATTERNS.offset.params.includes(p.name.toLowerCase())
      );
      if (offsetParam) {
        config.offsetParam = offsetParam.name;
      }
      // Detect total count path for offset pagination
      const totalPath = detectFieldPath(responseSchema, PAGINATION_PATTERNS.total.responsePaths);
      if (totalPath) {
        config.totalPath = totalPath;
      }
      break;
    }

    case 'page_number': {
      const pageParam = queryParams.find((p) =>
        PAGINATION_PATTERNS.page_number.params.includes(p.name.toLowerCase())
      );
      if (pageParam) {
        config.pageParam = pageParam.name;
      }
      // Detect total pages path
      const totalPagesPath = detectFieldPath(
        responseSchema,
        PAGINATION_PATTERNS.totalPages.responsePaths
      );
      if (totalPagesPath) {
        config.totalPagesPath = totalPagesPath;
      }
      break;
    }
  }

  // Detect common response paths
  const dataPath = detectFieldPath(responseSchema, PAGINATION_PATTERNS.data.responsePaths);
  if (dataPath) {
    config.dataPath = dataPath;
  }

  const hasMorePath = detectFieldPath(responseSchema, PAGINATION_PATTERNS.hasMore.responsePaths);
  if (hasMorePath) {
    config.hasMorePath = hasMorePath;
  }

  return config;
}

/**
 * Detect pagination strategy from query parameter names
 */
function detectPaginationStrategy(paramNames: string[]): PaginationConfig['strategy'] | undefined {
  // Check for cursor pagination (highest priority - most modern)
  if (
    paramNames.some((p) => PAGINATION_PATTERNS.cursor.params.some((pattern) => p.includes(pattern)))
  ) {
    return 'cursor';
  }

  // Check for offset pagination
  if (
    paramNames.some((p) =>
      PAGINATION_PATTERNS.offset.params.some((pattern) => p === pattern || p.includes(pattern))
    )
  ) {
    return 'offset';
  }

  // Check for page number pagination
  if (paramNames.some((p) => PAGINATION_PATTERNS.page_number.params.includes(p))) {
    return 'page_number';
  }

  return undefined;
}

/**
 * Detect pagination hints from response schema alone
 */
function detectPaginationFromResponse(schema: unknown): PaginationConfig | undefined {
  if (!schema || typeof schema !== 'object') {
    return undefined;
  }

  const schemaObj = schema as Record<string, unknown>;
  const properties = (schemaObj.properties as Record<string, unknown>) || {};
  const propertyNames = Object.keys(properties).map((p) => p.toLowerCase());

  // Check if response looks paginated (has data array + pagination indicators)
  const hasDataArray = propertyNames.some((p) =>
    PAGINATION_PATTERNS.data.responsePaths.map((r) => r.toLowerCase()).includes(p)
  );

  if (!hasDataArray) {
    return undefined;
  }

  // Check for cursor in response
  const hasCursor = propertyNames.some((p) =>
    PAGINATION_PATTERNS.cursor.responsePaths.map((r) => r.toLowerCase()).includes(p)
  );

  // Check for hasMore in response
  const hasMoreIndicator = propertyNames.some((p) =>
    PAGINATION_PATTERNS.hasMore.responsePaths.map((r) => r.toLowerCase()).includes(p)
  );

  // Check for total/totalPages in response
  const hasTotal = propertyNames.some((p) =>
    [...PAGINATION_PATTERNS.total.responsePaths, ...PAGINATION_PATTERNS.totalPages.responsePaths]
      .map((r) => r.toLowerCase())
      .includes(p)
  );

  if (hasCursor || hasMoreIndicator || hasTotal) {
    const config: PaginationConfig = {
      enabled: true,
      strategy: hasCursor ? 'cursor' : 'auto',
      maxPages: 5,
      maxItems: 500,
      maxCharacters: 100000,
      maxDurationMs: 30000,
      defaultPageSize: 100,
    };

    // Detect paths
    const dataPath = detectFieldPath(schema, PAGINATION_PATTERNS.data.responsePaths);
    if (dataPath) config.dataPath = dataPath;

    const cursorPath = detectFieldPath(schema, PAGINATION_PATTERNS.cursor.responsePaths);
    if (cursorPath) config.cursorPath = cursorPath;

    const hasMorePath = detectFieldPath(schema, PAGINATION_PATTERNS.hasMore.responsePaths);
    if (hasMorePath) config.hasMorePath = hasMorePath;

    const totalPath = detectFieldPath(schema, PAGINATION_PATTERNS.total.responsePaths);
    if (totalPath) config.totalPath = totalPath;

    return config;
  }

  return undefined;
}

/**
 * Detect field path in a schema by checking for matching property names
 */
function detectFieldPath(schema: unknown, patterns: string[]): string | undefined {
  if (!schema || typeof schema !== 'object') {
    return undefined;
  }

  const schemaObj = schema as Record<string, unknown>;
  const properties = (schemaObj.properties as Record<string, unknown>) || {};

  // Check root level properties
  for (const pattern of patterns) {
    if (properties[pattern]) {
      return `$.${pattern}`;
    }
    // Case-insensitive check
    const matchingKey = Object.keys(properties).find(
      (k) => k.toLowerCase() === pattern.toLowerCase()
    );
    if (matchingKey) {
      return `$.${matchingKey}`;
    }
  }

  // Check common wrapper objects (meta, pagination, etc.)
  const wrappers = ['meta', 'pagination', 'paging', '_meta', 'page_info', 'pageInfo'];
  for (const wrapper of wrappers) {
    const wrapperObj = properties[wrapper];
    if (wrapperObj && typeof wrapperObj === 'object') {
      const wrapperProps =
        ((wrapperObj as Record<string, unknown>).properties as Record<string, unknown>) || {};
      for (const pattern of patterns) {
        if (wrapperProps[pattern]) {
          return `$.${wrapper}.${pattern}`;
        }
        const matchingKey = Object.keys(wrapperProps).find(
          (k) => k.toLowerCase() === pattern.toLowerCase()
        );
        if (matchingKey) {
          return `$.${wrapper}.${matchingKey}`;
        }
      }
    }
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
 * Build deduplicated sourceUrls array from the sourceUrl option and parsed doc metadata.
 * These URLs enable targeted re-scraping for auto-maintenance.
 */
function buildSourceUrls(
  sourceUrl: string | undefined,
  metadataSourceUrls: string[] | undefined
): string[] | undefined {
  const urls = new Set<string>();
  if (sourceUrl) urls.add(sourceUrl);
  if (metadataSourceUrls) {
    for (const url of metadataSourceUrls) {
      urls.add(url);
    }
  }
  return urls.size > 0 ? Array.from(urls) : undefined;
}

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
