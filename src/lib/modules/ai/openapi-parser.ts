/**
 * OpenAPI Parser
 *
 * Parses OpenAPI/Swagger specifications and converts them to ParsedApiDoc format.
 * Supports OpenAPI 2.0 (Swagger) and OpenAPI 3.x specifications.
 * No AI needed - direct structural conversion.
 */

import { validate as validateSpec, dereference as dereferenceSpec } from '@readme/openapi-parser';
import YAML from 'yaml';
import type {
  ParsedApiDoc,
  ApiEndpoint,
  ApiAuthMethod,
  ApiParameter,
  ApiRequestBody,
  ApiResponse,
} from './scrape-job.schemas';

// =============================================================================
// Types
// =============================================================================

/**
 * Options for parsing OpenAPI specifications
 */
export interface OpenApiParseOptions {
  /** Source URL for metadata */
  sourceUrl?: string;
  /** Whether to validate the spec (default: true) */
  validate?: boolean;
  /** Whether to dereference $ref pointers (default: true) */
  dereference?: boolean;
}

/**
 * Result of parsing an OpenAPI specification
 */
export interface OpenApiParseResult {
  /** The parsed API documentation */
  doc: ParsedApiDoc;
  /** OpenAPI version detected */
  openApiVersion: string;
  /** Whether the spec was valid */
  isValid: boolean;
  /** Validation warnings (if any) */
  warnings: string[];
  /** Parsing duration in milliseconds */
  durationMs: number;
}

/**
 * Error thrown when OpenAPI parsing fails
 */
export class OpenApiParseError extends Error {
  constructor(
    public code: OpenApiParseErrorCode,
    message: string,
    public cause?: unknown
  ) {
    super(message);
    this.name = 'OpenApiParseError';
  }
}

export type OpenApiParseErrorCode =
  | 'INVALID_FORMAT'
  | 'PARSE_ERROR'
  | 'VALIDATION_ERROR'
  | 'UNSUPPORTED_VERSION'
  | 'CONVERSION_ERROR';

// =============================================================================
// OpenAPI Types (simplified for our needs)
// =============================================================================

interface OpenApiSpec {
  openapi?: string;
  swagger?: string;
  info: {
    title: string;
    description?: string;
    version: string;
  };
  servers?: Array<{ url: string; description?: string }>;
  host?: string; // Swagger 2.0
  basePath?: string; // Swagger 2.0
  schemes?: string[]; // Swagger 2.0
  paths: Record<string, PathItem>;
  components?: {
    securitySchemes?: Record<string, SecurityScheme>;
    schemas?: Record<string, unknown>;
  };
  securityDefinitions?: Record<string, SecurityScheme>; // Swagger 2.0
  security?: Array<Record<string, string[]>>;
}

interface PathItem {
  get?: Operation;
  post?: Operation;
  put?: Operation;
  patch?: Operation;
  delete?: Operation;
  parameters?: ParameterObject[];
}

interface Operation {
  operationId?: string;
  summary?: string;
  description?: string;
  tags?: string[];
  deprecated?: boolean;
  parameters?: ParameterObject[];
  requestBody?: RequestBodyObject;
  responses?: Record<string, ResponseObject>;
  security?: Array<Record<string, string[]>>;
}

interface ParameterObject {
  name: string;
  in: 'query' | 'header' | 'path' | 'cookie' | 'body' | 'formData';
  description?: string;
  required?: boolean;
  schema?: SchemaObject;
  type?: string; // Swagger 2.0
  format?: string;
  enum?: string[];
  default?: unknown;
}

interface RequestBodyObject {
  description?: string;
  required?: boolean;
  content?: Record<string, { schema?: SchemaObject }>;
  schema?: SchemaObject; // Swagger 2.0 body parameter
}

interface ResponseObject {
  description: string;
  content?: Record<string, { schema?: SchemaObject }>;
  schema?: SchemaObject; // Swagger 2.0
}

interface SchemaObject {
  type?: string;
  format?: string;
  properties?: Record<string, SchemaObject>;
  items?: SchemaObject;
  required?: string[];
  enum?: string[];
  description?: string;
  default?: unknown;
  $ref?: string;
}

interface SecurityScheme {
  type: string;
  description?: string;
  name?: string;
  in?: string;
  scheme?: string;
  bearerFormat?: string;
  flows?: {
    authorizationCode?: OAuthFlow;
    implicit?: OAuthFlow;
    password?: OAuthFlow;
    clientCredentials?: OAuthFlow;
  };
  // Swagger 2.0
  flow?: string;
  authorizationUrl?: string;
  tokenUrl?: string;
  scopes?: Record<string, string>;
}

interface OAuthFlow {
  authorizationUrl?: string;
  tokenUrl?: string;
  refreshUrl?: string;
  scopes?: Record<string, string>;
}

// =============================================================================
// Main Parser
// =============================================================================

/**
 * Parse an OpenAPI/Swagger specification
 *
 * @param content - OpenAPI spec as string (JSON/YAML) or object
 * @param options - Parsing options
 * @returns Parsed API documentation in our standard format
 *
 * @example
 * ```ts
 * // Parse from JSON string
 * const result = await parseOpenApiSpec(jsonString);
 *
 * // Parse from YAML string
 * const result = await parseOpenApiSpec(yamlString);
 *
 * // Parse from object
 * const result = await parseOpenApiSpec(specObject);
 * ```
 */
export async function parseOpenApiSpec(
  content: string | object,
  options: OpenApiParseOptions = {}
): Promise<OpenApiParseResult> {
  const startTime = Date.now();
  const warnings: string[] = [];
  const validate = options.validate ?? true;
  const dereference = options.dereference ?? true;

  // Parse content if string
  let spec: OpenApiSpec;
  try {
    spec = typeof content === 'string' ? parseContent(content) : (content as OpenApiSpec);
  } catch (error) {
    throw new OpenApiParseError(
      'INVALID_FORMAT',
      `Failed to parse OpenAPI content: ${error instanceof Error ? error.message : 'Unknown error'}`,
      error
    );
  }

  // Detect version
  const openApiVersion = spec.openapi || spec.swagger || 'unknown';
  if (!spec.openapi && !spec.swagger) {
    throw new OpenApiParseError(
      'UNSUPPORTED_VERSION',
      'Could not detect OpenAPI/Swagger version. Missing "openapi" or "swagger" field.'
    );
  }

  // Validate and dereference using @readme/openapi-parser
  let parsedSpec = spec;
  let isValid = true;

  try {
    if (validate) {
      const result = await validateSpec(spec as never);
      isValid = result.valid;
      if (!result.valid && result.errors) {
        warnings.push(...result.errors.map((e) => `Validation error: ${e.message}`));
      }
      if (result.warnings) {
        warnings.push(...result.warnings.map((w) => `Validation warning: ${w.message}`));
      }
    }
    if (dereference) {
      parsedSpec = (await dereferenceSpec(spec as never)) as OpenApiSpec;
    }
  } catch (error) {
    isValid = false;
    warnings.push(`Parser warning: ${error instanceof Error ? error.message : 'Unknown error'}`);
    // Continue with original spec if dereference fails
  }

  // Convert to our format
  const doc = convertToParsedApiDoc(parsedSpec, options, warnings);

  return {
    doc,
    openApiVersion,
    isValid,
    warnings,
    durationMs: Date.now() - startTime,
  };
}

/**
 * Check if content looks like an OpenAPI/Swagger specification
 */
export function isOpenApiSpec(content: string | object): boolean {
  try {
    const obj = typeof content === 'string' ? parseContent(content) : content;
    return !!(
      (obj as OpenApiSpec).openapi ||
      (obj as OpenApiSpec).swagger ||
      ((obj as OpenApiSpec).paths && (obj as OpenApiSpec).info)
    );
  } catch {
    return false;
  }
}

// =============================================================================
// Content Parsing
// =============================================================================

/**
 * Parse string content as JSON or YAML
 */
function parseContent(content: string): OpenApiSpec {
  const trimmed = content.trim();

  // Try JSON first (faster)
  if (trimmed.startsWith('{')) {
    try {
      return JSON.parse(trimmed);
    } catch {
      // Fall through to YAML
    }
  }

  // Try YAML
  try {
    return YAML.parse(trimmed);
  } catch (error) {
    throw new OpenApiParseError(
      'PARSE_ERROR',
      `Content is neither valid JSON nor YAML: ${error instanceof Error ? error.message : 'Unknown error'}`,
      error
    );
  }
}

// =============================================================================
// Conversion to ParsedApiDoc
// =============================================================================

/**
 * Convert OpenAPI spec to our ParsedApiDoc format
 */
function convertToParsedApiDoc(
  spec: OpenApiSpec,
  options: OpenApiParseOptions,
  warnings: string[]
): ParsedApiDoc {
  // Extract base URL
  const baseUrl = extractBaseUrl(spec);
  if (!baseUrl) {
    warnings.push('Could not determine base URL, using placeholder');
  }

  // Convert endpoints
  const endpoints = convertEndpoints(spec, warnings);

  // Convert auth methods
  const authMethods = convertAuthMethods(spec);

  // Build the document
  const doc: ParsedApiDoc = {
    name: spec.info.title,
    description: spec.info.description,
    baseUrl: baseUrl || 'https://api.example.com',
    version: spec.info.version,
    authMethods,
    endpoints,
    metadata: {
      scrapedAt: new Date().toISOString(),
      sourceUrls: options.sourceUrl ? [options.sourceUrl] : [],
      aiConfidence: 1.0, // No AI, so 100% confidence
      warnings,
    },
  };

  return doc;
}

/**
 * Extract base URL from spec
 */
function extractBaseUrl(spec: OpenApiSpec): string | null {
  // OpenAPI 3.x
  if (spec.servers && spec.servers.length > 0) {
    return spec.servers[0].url;
  }

  // Swagger 2.0
  if (spec.host) {
    const scheme = spec.schemes?.[0] || 'https';
    const basePath = spec.basePath || '';
    return `${scheme}://${spec.host}${basePath}`;
  }

  return null;
}

/**
 * Convert OpenAPI paths to our endpoint format
 */
function convertEndpoints(spec: OpenApiSpec, warnings: string[]): ApiEndpoint[] {
  const endpoints: ApiEndpoint[] = [];
  const methods = ['get', 'post', 'put', 'patch', 'delete'] as const;

  for (const [path, pathItem] of Object.entries(spec.paths || {})) {
    // Get path-level parameters
    const pathParams = pathItem.parameters || [];

    for (const method of methods) {
      const operation = pathItem[method];
      if (!operation) continue;

      try {
        const endpoint = convertOperation(
          path,
          method.toUpperCase() as ApiEndpoint['method'],
          operation,
          pathParams
        );
        endpoints.push(endpoint);
      } catch (error) {
        warnings.push(
          `Failed to convert ${method.toUpperCase()} ${path}: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    }
  }

  return endpoints;
}

/**
 * Convert a single operation to our endpoint format
 */
function convertOperation(
  path: string,
  method: ApiEndpoint['method'],
  operation: Operation,
  pathLevelParams: ParameterObject[]
): ApiEndpoint {
  // Combine path-level and operation-level parameters
  const allParams = [...pathLevelParams, ...(operation.parameters || [])];

  // Generate name and slug
  const name = operation.summary || operation.operationId || `${method} ${path}`;
  const slug = generateSlug(operation.operationId || `${method.toLowerCase()}-${path}`);

  // Separate parameters by location
  const pathParameters = convertParameters(allParams.filter((p) => p.in === 'path'));
  const queryParameters = convertParameters(allParams.filter((p) => p.in === 'query'));
  const headerParameters = convertParameters(allParams.filter((p) => p.in === 'header'));

  // Handle request body
  let requestBody: ApiRequestBody | undefined;
  if (operation.requestBody) {
    requestBody = convertRequestBody(operation.requestBody);
  } else {
    // Swagger 2.0: body parameter
    const bodyParam = allParams.find((p) => p.in === 'body');
    if (bodyParam) {
      requestBody = {
        contentType: 'application/json',
        schema: convertSchemaToRecord(bodyParam.schema),
        required: bodyParam.required ?? false,
      };
    }
  }

  // Convert responses
  const responses = convertResponses(operation.responses || {});

  return {
    name,
    slug,
    description: operation.description || operation.summary,
    method,
    path,
    pathParameters: pathParameters.length > 0 ? pathParameters : undefined,
    queryParameters: queryParameters.length > 0 ? queryParameters : undefined,
    headerParameters: headerParameters.length > 0 ? headerParameters : undefined,
    requestBody,
    responses,
    tags: operation.tags,
    deprecated: operation.deprecated,
  };
}

/**
 * Convert parameters to our format
 */
function convertParameters(params: ParameterObject[]): ApiParameter[] {
  return params.map((param) => ({
    name: param.name,
    type: param.schema?.type || param.type || 'string',
    required: param.required ?? false,
    description: param.description,
    default: param.default ?? param.schema?.default,
    enum: param.enum ?? param.schema?.enum,
  }));
}

/**
 * Convert request body to our format
 */
function convertRequestBody(body: RequestBodyObject): ApiRequestBody {
  // Get content type and schema
  let contentType = 'application/json';
  let schema: Record<string, unknown> = {};

  if (body.content) {
    const contentTypes = Object.keys(body.content);
    contentType =
      contentTypes.find((ct) => ct.includes('json')) || contentTypes[0] || 'application/json';
    schema = convertSchemaToRecord(body.content[contentType]?.schema);
  } else if (body.schema) {
    // Swagger 2.0 style
    schema = convertSchemaToRecord(body.schema);
  }

  return {
    contentType,
    schema,
    required: body.required ?? false,
  };
}

/**
 * Convert responses to our format
 */
function convertResponses(responses: Record<string, ResponseObject>): Record<string, ApiResponse> {
  const result: Record<string, ApiResponse> = {};

  for (const [statusCode, response] of Object.entries(responses)) {
    let schema: Record<string, unknown> | undefined;

    if (response.content) {
      // OpenAPI 3.x
      const jsonContent = response.content['application/json'];
      if (jsonContent?.schema) {
        schema = convertSchemaToRecord(jsonContent.schema);
      }
    } else if (response.schema) {
      // Swagger 2.0
      schema = convertSchemaToRecord(response.schema);
    }

    result[statusCode] = {
      description: response.description || `Response ${statusCode}`,
      schema,
    };
  }

  // Ensure at least a 200 response
  if (Object.keys(result).length === 0) {
    result['200'] = { description: 'Successful response' };
  }

  return result;
}

/**
 * Convert schema to plain record
 */
function convertSchemaToRecord(schema?: SchemaObject): Record<string, unknown> {
  if (!schema) return {};

  const result: Record<string, unknown> = {};

  if (schema.type) result.type = schema.type;
  if (schema.format) result.format = schema.format;
  if (schema.description) result.description = schema.description;
  if (schema.enum) result.enum = schema.enum;
  if (schema.required) result.required = schema.required;

  if (schema.properties) {
    result.properties = Object.fromEntries(
      Object.entries(schema.properties).map(([key, value]) => [key, convertSchemaToRecord(value)])
    );
  }

  if (schema.items) {
    result.items = convertSchemaToRecord(schema.items);
  }

  return result;
}

// =============================================================================
// Auth Method Conversion
// =============================================================================

/**
 * Convert security schemes to our auth methods format
 */
function convertAuthMethods(spec: OpenApiSpec): ApiAuthMethod[] {
  const schemes = spec.components?.securitySchemes || spec.securityDefinitions || {};
  const methods: ApiAuthMethod[] = [];

  for (const [name, scheme] of Object.entries(schemes)) {
    const method = convertSecurityScheme(name, scheme);
    if (method) {
      methods.push(method);
    }
  }

  return methods;
}

/**
 * Convert a single security scheme to our auth method format
 */
function convertSecurityScheme(name: string, scheme: SecurityScheme): ApiAuthMethod | null {
  switch (scheme.type) {
    case 'apiKey':
      return {
        type: 'api_key',
        config: { name, description: scheme.description },
        location: scheme.in as 'header' | 'query' | undefined,
        paramName: scheme.name,
      };

    case 'http':
      if (scheme.scheme === 'bearer') {
        return {
          type: 'bearer',
          config: {
            name,
            description: scheme.description,
            bearerFormat: scheme.bearerFormat,
          },
          location: 'header',
          paramName: 'Authorization',
        };
      }
      if (scheme.scheme === 'basic') {
        return {
          type: 'basic',
          config: { name, description: scheme.description },
          location: 'header',
          paramName: 'Authorization',
        };
      }
      return null;

    case 'oauth2':
      return convertOAuth2Scheme(name, scheme);

    // Swagger 2.0 types
    case 'basic':
      return {
        type: 'basic',
        config: { name, description: scheme.description },
        location: 'header',
        paramName: 'Authorization',
      };

    default:
      return null;
  }
}

/**
 * Convert OAuth2 scheme
 */
function convertOAuth2Scheme(name: string, scheme: SecurityScheme): ApiAuthMethod {
  const config: Record<string, unknown> = {
    name,
    description: scheme.description,
  };

  // OpenAPI 3.x flows
  if (scheme.flows) {
    const flow =
      scheme.flows.authorizationCode ||
      scheme.flows.implicit ||
      scheme.flows.password ||
      scheme.flows.clientCredentials;

    if (flow) {
      config.authorizationUrl = flow.authorizationUrl;
      config.tokenUrl = flow.tokenUrl;
      config.refreshUrl = flow.refreshUrl;
      config.scopes = flow.scopes ? Object.keys(flow.scopes) : [];
    }

    // Determine flow type
    if (scheme.flows.authorizationCode) config.flow = 'authorization_code';
    else if (scheme.flows.implicit) config.flow = 'implicit';
    else if (scheme.flows.password) config.flow = 'password';
    else if (scheme.flows.clientCredentials) config.flow = 'client_credentials';
  }

  // Swagger 2.0
  if (scheme.flow) {
    config.flow = scheme.flow;
    config.authorizationUrl = scheme.authorizationUrl;
    config.tokenUrl = scheme.tokenUrl;
    config.scopes = scheme.scopes ? Object.keys(scheme.scopes) : [];
  }

  return {
    type: 'oauth2',
    config,
    location: 'header',
    paramName: 'Authorization',
  };
}

// =============================================================================
// Utilities
// =============================================================================

/**
 * Generate a URL-safe slug
 */
function generateSlug(input: string): string {
  return input
    .toLowerCase()
    .replace(/[{}]/g, '') // Remove path parameter braces
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Type guard for OpenApiParseError
 */
export function isOpenApiParseError(error: unknown): error is OpenApiParseError {
  return error instanceof OpenApiParseError;
}
