/**
 * API Documentation Extraction Prompts
 *
 * System prompts and structured output schemas for extracting
 * API information from documentation using AI.
 */

import type { LLMResponseSchema } from '../llm';

// =============================================================================
// System Prompts
// =============================================================================

/**
 * Main system prompt for API documentation extraction
 */
export const API_EXTRACTION_SYSTEM_PROMPT = `You are an expert API documentation parser. Your task is to extract structured information from API documentation and return it in a precise JSON format.

## Your Capabilities
- Extract API endpoints, methods, parameters, and response schemas
- Identify authentication methods (OAuth2, API keys, Bearer tokens, etc.)
- Detect rate limits and usage quotas
- Infer missing information when documentation is incomplete

## Guidelines
1. **Be Precise**: Extract exact paths, method names, and parameter types
2. **Be Complete**: Include all endpoints you find, even if some fields are missing
3. **Be Consistent**: Use consistent naming conventions (snake_case for slugs)
4. **Handle Ambiguity**: When information is unclear, make reasonable assumptions and note low confidence
5. **Preserve Context**: Include descriptions and examples when available

## Output Format
Always return valid JSON matching the requested schema. Do not include markdown formatting or code blocks in your response.`;

/**
 * System prompt specifically for endpoint extraction
 */
export const ENDPOINT_EXTRACTION_SYSTEM_PROMPT = `You are an API endpoint extraction specialist. Extract API endpoints from the documentation.

## CRITICAL PRIORITIES (Follow This Order):
1. **SKIP deprecated endpoints** - Do NOT include any endpoint marked as deprecated, legacy, or scheduled for removal
2. **Focus on core functionality first** - Prioritize the most commonly used, essential endpoints (CRUD operations, main features)
3. **Quality over quantity** - Extract complete, accurate information for fewer endpoints rather than incomplete data for many
4. **Skip admin/internal endpoints** - Unless specifically requested, skip administrative, internal, or rarely-used endpoints

## For Each Endpoint, Extract:
- **name**: Human-readable name (e.g., "Send Message", "List Users")
- **slug**: URL-safe identifier (e.g., "send-message", "list-users")
- **method**: HTTP method (GET, POST, PUT, PATCH, DELETE)
- **path**: API path with parameters (e.g., "/users/{id}/messages")
- **description**: What the endpoint does
- **deprecated**: Set to true ONLY if keeping for reference, otherwise omit deprecated endpoints entirely
- **parameters**: Path, query, and header parameters with types
- **requestBody**: Request body schema if applicable
- **responses**: Expected response schemas by status code

## Parameter Type Mapping
- Strings: "string"
- Numbers: "number" or "integer"
- Booleans: "boolean"
- Arrays: "array"
- Objects: "object"
- Dates: "string" (with format note)
- Enums: "string" (with enum values listed)

## Path Parameter Format
Use curly braces for path parameters: /users/{userId}/posts/{postId}

## Output Guidelines
- Extract the 30-50 most important, non-deprecated endpoints
- If the API has fewer endpoints, extract all non-deprecated ones
- Ensure each endpoint has at minimum: name, slug, method, path, and description`;

/**
 * System prompt for authentication detection
 */
export const AUTH_DETECTION_SYSTEM_PROMPT = `You are an API authentication specialist. Analyze documentation to identify all supported authentication methods.

## Authentication Types to Detect:
1. **oauth2**: OAuth 2.0 flows (authorization code, client credentials, etc.)
2. **api_key**: API key authentication (header, query, or body)
3. **bearer**: Bearer token authentication
4. **basic**: HTTP Basic authentication
5. **custom_header**: Custom header-based authentication

## For Each Auth Method, Extract:
- **type**: The authentication type
- **config**: Configuration details (scopes, URLs, etc.)
- **location**: Where credentials are placed (header, query, body)
- **paramName**: The parameter/header name

## Common Patterns to Look For:
- "Authorization: Bearer {token}"
- "X-API-Key: {key}"
- "?api_key={key}"
- OAuth2 authorization URLs and token endpoints
- "Basic {base64(username:password)}"`;

/**
 * System prompt for rate limit detection
 */
export const RATE_LIMIT_DETECTION_SYSTEM_PROMPT = `You are an API rate limit specialist. Extract rate limiting information from documentation.

## Information to Extract:
- **requests**: Number of requests allowed
- **window**: Time window in seconds (convert from minutes/hours if needed)
- **scope**: Whether limits are per-endpoint, per-user, or global

## Common Patterns:
- "100 requests per minute" → { requests: 100, window: 60 }
- "1000 requests per hour" → { requests: 1000, window: 3600 }
- "10 requests per second" → { requests: 10, window: 1 }
- "Rate limited to 50 calls/min" → { requests: 50, window: 60 }

## If Multiple Limits Exist:
- Extract the default/global limit
- Note per-endpoint limits separately if specified`;

// =============================================================================
// Few-Shot Examples
// =============================================================================

/**
 * Example input/output for endpoint extraction
 */
export const ENDPOINT_EXTRACTION_EXAMPLE = {
  input: `## Send a Message

POST /chat.postMessage

Sends a message to a channel.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| channel | string | Yes | Channel ID |
| text | string | Yes | Message text |
| thread_ts | string | No | Thread timestamp |

### Response

Returns a message object on success.

\`\`\`json
{
  "ok": true,
  "channel": "C1234567890",
  "ts": "1234567890.123456",
  "message": {
    "text": "Hello world",
    "username": "bot"
  }
}
\`\`\``,

  output: {
    name: 'Send Message',
    slug: 'send-message',
    method: 'POST',
    path: '/chat.postMessage',
    description: 'Sends a message to a channel.',
    pathParameters: [],
    queryParameters: [],
    requestBody: {
      contentType: 'application/json',
      required: true,
      schema: {
        type: 'object',
        properties: {
          channel: { type: 'string', description: 'Channel ID' },
          text: { type: 'string', description: 'Message text' },
          thread_ts: { type: 'string', description: 'Thread timestamp' },
        },
        required: ['channel', 'text'],
      },
    },
    responses: {
      '200': {
        description: 'Returns a message object on success.',
        schema: {
          type: 'object',
          properties: {
            ok: { type: 'boolean' },
            channel: { type: 'string' },
            ts: { type: 'string' },
            message: { type: 'object' },
          },
        },
      },
    },
    tags: ['messaging'],
  },
};

/**
 * Example input/output for authentication detection
 */
export const AUTH_DETECTION_EXAMPLE = {
  input: `## Authentication

The API supports two authentication methods:

### OAuth 2.0

For user-context requests, use OAuth 2.0 authorization code flow:

1. Redirect to: https://api.example.com/oauth/authorize
2. Exchange code at: https://api.example.com/oauth/token
3. Include token: Authorization: Bearer {access_token}

Scopes: read, write, admin

### API Key

For server-to-server requests, use an API key:

Include your API key in the X-API-Key header:
\`\`\`
X-API-Key: your_api_key_here
\`\`\``,

  output: [
    {
      type: 'oauth2',
      config: {
        authorizationUrl: 'https://api.example.com/oauth/authorize',
        tokenUrl: 'https://api.example.com/oauth/token',
        scopes: ['read', 'write', 'admin'],
        flow: 'authorization_code',
      },
      location: 'header',
      paramName: 'Authorization',
    },
    {
      type: 'api_key',
      config: {},
      location: 'header',
      paramName: 'X-API-Key',
    },
  ],
};

/**
 * Example input/output for rate limit detection
 */
export const RATE_LIMIT_DETECTION_EXAMPLE = {
  input: `## Rate Limits

The API enforces the following rate limits:

- **Standard tier**: 100 requests per minute
- **Premium tier**: 1000 requests per minute

Individual endpoints may have lower limits:
- /search: 10 requests per minute
- /bulk-import: 5 requests per hour`,

  output: {
    default: {
      requests: 100,
      window: 60,
    },
    perEndpoint: {
      '/search': { requests: 10, window: 60 },
      '/bulk-import': { requests: 5, window: 3600 },
    },
  },
};

// =============================================================================
// Prompt Builders
// =============================================================================

/**
 * Build a complete prompt for full API extraction
 */
export function buildFullExtractionPrompt(documentationContent: string): string {
  return `${API_EXTRACTION_SYSTEM_PROMPT}

## Documentation to Parse

${documentationContent}

## Instructions

Extract all API information from the documentation above and return a JSON object with the following structure:

{
  "name": "API name",
  "description": "API description",
  "baseUrl": "https://api.example.com",
  "version": "v1",
  "authMethods": [...],
  "endpoints": [...],
  "rateLimits": {...}
}

Return ONLY the JSON object, no markdown formatting.`;
}

/**
 * Build a prompt for endpoint extraction only
 */
export function buildEndpointExtractionPrompt(documentationContent: string): string {
  return `${ENDPOINT_EXTRACTION_SYSTEM_PROMPT}

## Example

Input documentation:
${ENDPOINT_EXTRACTION_EXAMPLE.input}

Expected output:
${JSON.stringify(ENDPOINT_EXTRACTION_EXAMPLE.output, null, 2)}

## Documentation to Parse

${documentationContent}

## Instructions

Extract all API endpoints from the documentation above. Return a JSON array of endpoint objects.
Return ONLY the JSON array, no markdown formatting.`;
}

/**
 * Build a prompt for authentication detection only
 */
export function buildAuthDetectionPrompt(documentationContent: string): string {
  return `${AUTH_DETECTION_SYSTEM_PROMPT}

## Example

Input documentation:
${AUTH_DETECTION_EXAMPLE.input}

Expected output:
${JSON.stringify(AUTH_DETECTION_EXAMPLE.output, null, 2)}

## Documentation to Parse

${documentationContent}

## Instructions

Identify all authentication methods from the documentation above. Return a JSON array of auth method objects.
Return ONLY the JSON array, no markdown formatting.`;
}

/**
 * Build a prompt for rate limit detection only
 */
export function buildRateLimitDetectionPrompt(documentationContent: string): string {
  return `${RATE_LIMIT_DETECTION_SYSTEM_PROMPT}

## Example

Input documentation:
${RATE_LIMIT_DETECTION_EXAMPLE.input}

Expected output:
${JSON.stringify(RATE_LIMIT_DETECTION_EXAMPLE.output, null, 2)}

## Documentation to Parse

${documentationContent}

## Instructions

Extract rate limit information from the documentation above. Return a JSON object with default and per-endpoint limits.
If no rate limits are found, return: { "default": null, "perEndpoint": {} }
Return ONLY the JSON object, no markdown formatting.`;
}

/**
 * Build a prompt for extracting basic API info (name, base URL, description)
 */
export function buildApiInfoExtractionPrompt(documentationContent: string): string {
  return `You are an API documentation analyzer. Extract basic API information from the documentation.

## Documentation

${documentationContent}

## Instructions

Extract the following information and return as JSON:

{
  "name": "The API name (e.g., 'Slack API', 'GitHub REST API')",
  "description": "A brief description of what the API does",
  "baseUrl": "The base URL for API requests (e.g., 'https://api.slack.com')",
  "version": "The API version if mentioned (e.g., 'v1', '2.0'), or null if not found"
}

Return ONLY the JSON object, no markdown formatting.`;
}

// =============================================================================
// Response Schemas for Structured Output
// =============================================================================

/**
 * Schema for basic API info extraction
 */
export const API_INFO_SCHEMA: LLMResponseSchema = {
  type: 'object',
  properties: {
    name: { type: 'string', description: 'The API name' },
    description: { type: 'string', description: 'Brief API description' },
    baseUrl: { type: 'string', description: 'Base URL for API requests' },
    version: { type: 'string', description: 'API version if available' },
  },
  required: ['name', 'baseUrl'],
};

/**
 * Schema for a single endpoint
 */
export const ENDPOINT_SCHEMA: LLMResponseSchema = {
  type: 'object',
  properties: {
    name: { type: 'string', description: 'Human-readable endpoint name' },
    slug: { type: 'string', description: 'URL-safe identifier' },
    method: {
      type: 'string',
      enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
      description: 'HTTP method',
    },
    path: { type: 'string', description: 'API path with parameters' },
    description: { type: 'string', description: 'What the endpoint does' },
    deprecated: { type: 'boolean', description: 'Whether endpoint is deprecated' },
  },
  required: ['name', 'slug', 'method', 'path'],
};

/**
 * Schema for endpoints array extraction
 */
export const ENDPOINTS_ARRAY_SCHEMA: LLMResponseSchema = {
  type: 'array',
  items: ENDPOINT_SCHEMA,
};

/**
 * Schema for a single auth method
 */
export const AUTH_METHOD_SCHEMA: LLMResponseSchema = {
  type: 'object',
  properties: {
    type: {
      type: 'string',
      enum: ['oauth2', 'api_key', 'basic', 'bearer', 'custom_header'],
      description: 'Authentication type',
    },
    location: {
      type: 'string',
      enum: ['header', 'query', 'body'],
      description: 'Where credentials are placed',
    },
    paramName: { type: 'string', description: 'Parameter or header name' },
  },
  required: ['type'],
};

/**
 * Schema for auth methods array extraction
 */
export const AUTH_METHODS_ARRAY_SCHEMA: LLMResponseSchema = {
  type: 'array',
  items: AUTH_METHOD_SCHEMA,
};

/**
 * Schema for rate limits extraction
 */
export const RATE_LIMITS_SCHEMA: LLMResponseSchema = {
  type: 'object',
  properties: {
    default: {
      type: 'object',
      properties: {
        requests: { type: 'number', description: 'Number of requests allowed' },
        window: { type: 'number', description: 'Time window in seconds' },
      },
    },
    perEndpoint: {
      type: 'object',
      description: 'Endpoint-specific rate limits',
    },
  },
};

/**
 * Schema for complete parsed API documentation
 */
export const PARSED_API_DOC_SCHEMA: LLMResponseSchema = {
  type: 'object',
  properties: {
    name: { type: 'string', description: 'API name' },
    description: { type: 'string', description: 'API description' },
    baseUrl: { type: 'string', description: 'Base URL for API requests' },
    version: { type: 'string', description: 'API version' },
    authMethods: AUTH_METHODS_ARRAY_SCHEMA,
    endpoints: ENDPOINTS_ARRAY_SCHEMA,
    rateLimits: RATE_LIMITS_SCHEMA,
  },
  required: ['name', 'baseUrl', 'authMethods', 'endpoints'],
};

// =============================================================================
// Confidence Estimation
// =============================================================================

/**
 * Prompt suffix for requesting confidence scores
 */
export const CONFIDENCE_SUFFIX = `

Additionally, estimate your confidence (0.0 to 1.0) for each extracted item:
- 1.0: Information is explicitly stated in documentation
- 0.8: Information is strongly implied
- 0.5: Information is inferred from context
- 0.3: Information is guessed based on conventions
- 0.0: No information available, using defaults

Include a "confidence" field in your response.`;

/**
 * Build prompt with confidence scoring
 */
export function withConfidenceScoring(prompt: string): string {
  return prompt + CONFIDENCE_SUFFIX;
}
