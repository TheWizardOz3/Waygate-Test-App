/**
 * Action Invocation Endpoint
 *
 * POST /api/v1/actions/:integration/:action
 *
 * The main Gateway API endpoint for invoking actions on external APIs.
 * Accepts integration and action slugs (not UUIDs) for human-friendly URLs.
 *
 * Authentication: Requires Waygate API key in Authorization header
 *
 * @example
 * ```
 * POST /api/v1/actions/slack/send-message
 * Authorization: Bearer wg_live_xxx
 * Content-Type: application/json
 *
 * {
 *   "channel": "#general",
 *   "text": "Hello from Waygate!"
 * }
 *
 * Response (success):
 * {
 *   "success": true,
 *   "data": { "ok": true, "ts": "1234567890.123456" },
 *   "meta": {
 *     "requestId": "req_123...",
 *     "timestamp": "2026-01-02T...",
 *     "execution": {
 *       "latencyMs": 234,
 *       "retryCount": 0,
 *       "cached": false
 *     }
 *   }
 * }
 *
 * Response (error):
 * {
 *   "success": false,
 *   "error": {
 *     "code": "VALIDATION_ERROR",
 *     "message": "Missing required field 'channel'",
 *     "requestId": "req_123...",
 *     "suggestedResolution": {
 *       "action": "RETRY_WITH_MODIFIED_INPUT",
 *       "description": "Include the 'channel' field in your request body",
 *       "retryable": true
 *     }
 *   }
 * }
 * ```
 */

import { NextRequest, NextResponse } from 'next/server';
import { withApiAuth } from '@/lib/api/middleware/auth';
import {
  invokeAction,
  getHttpStatusForError,
  GatewayInvokeOptionsSchema,
  type GatewayInvokeOptions,
  type GatewayErrorResponse,
} from '@/lib/modules/gateway';

/**
 * POST /api/v1/actions/:integration/:action
 *
 * Invokes an action on an external API through the Waygate Gateway.
 *
 * @param request - The incoming request with action input as JSON body
 * @returns GatewaySuccessResponse or GatewayErrorResponse
 */
export const POST = withApiAuth(async (request: NextRequest, { tenant, app }) => {
  // Extract integration and action slugs from URL
  const { integrationSlug, actionSlug } = extractSlugsFromUrl(request.url);

  if (!integrationSlug || !actionSlug) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INVALID_REQUEST',
          message: 'Integration slug and action slug are required in URL path',
          requestId: generateQuickRequestId(),
          suggestedResolution: {
            action: 'RETRY_WITH_MODIFIED_INPUT',
            description: 'Use the format: POST /api/v1/actions/{integrationSlug}/{actionSlug}',
            retryable: false,
          },
        },
      } satisfies GatewayErrorResponse,
      { status: 400 }
    );
  }

  // Parse request body as action input
  let input: Record<string, unknown> = {};
  try {
    const body = await request.text();
    if (body && body.trim()) {
      input = JSON.parse(body);
      if (typeof input !== 'object' || input === null || Array.isArray(input)) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'INVALID_REQUEST',
              message: 'Request body must be a JSON object',
              requestId: generateQuickRequestId(),
              suggestedResolution: {
                action: 'RETRY_WITH_MODIFIED_INPUT',
                description: 'Send a JSON object as the request body, e.g., {"key": "value"}',
                retryable: true,
              },
            },
          } satisfies GatewayErrorResponse,
          { status: 400 }
        );
      }
    }
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INVALID_REQUEST',
          message: 'Invalid JSON in request body',
          requestId: generateQuickRequestId(),
          suggestedResolution: {
            action: 'RETRY_WITH_MODIFIED_INPUT',
            description: 'Ensure the request body is valid JSON',
            retryable: true,
          },
        },
      } satisfies GatewayErrorResponse,
      { status: 400 }
    );
  }

  // Parse optional invocation options from headers
  const options = parseInvocationOptions(request);

  // When authenticated with a wg_app_ key, inject app context for
  // app-scoped connection resolution and user-aware credential resolution.
  if (app) {
    options.appId = app.id;
  }

  // Invoke the action through the Gateway service
  const response = await invokeAction(tenant.id, integrationSlug, actionSlug, input, options);

  // Determine HTTP status code
  const statusCode = response.success ? 200 : getHttpStatusForError(response);

  return NextResponse.json(response, { status: statusCode });
});

/**
 * Extract integration and action slugs from the URL path
 *
 * URL pattern: /api/v1/actions/{integration}/{action}
 */
function extractSlugsFromUrl(url: string): {
  integrationSlug: string | null;
  actionSlug: string | null;
} {
  const urlObj = new URL(url);
  const pathParts = urlObj.pathname.split('/');

  // Find 'actions' in path and get the next two segments
  const actionsIndex = pathParts.indexOf('actions');

  if (actionsIndex === -1) {
    return { integrationSlug: null, actionSlug: null };
  }

  const integrationSlug = pathParts[actionsIndex + 1] || null;
  const actionSlug = pathParts[actionsIndex + 2] || null;

  return { integrationSlug, actionSlug };
}

/**
 * Parse invocation options from request headers
 *
 * Supported headers:
 * - X-Waygate-Skip-Validation: "true" to skip input validation
 * - X-Waygate-Timeout: Timeout in milliseconds (1000-300000)
 * - X-Idempotency-Key: Idempotency key for safe retries
 * - X-Waygate-Include-Raw: "true" to include raw response from external API
 * - X-Waygate-Validation-Mode: "strict" | "warn" | "lenient" - override response validation mode
 * - X-Waygate-Bypass-Response-Validation: "true" to skip response validation entirely
 * - X-Waygate-Connection-Id: UUID of the connection to use (for multi-app connections)
 * - X-Waygate-Context: JSON object with context for name-to-ID resolution
 * - X-Waygate-Context-{Type}: JSON array of context items for a specific type (e.g., X-Waygate-Context-Users)
 */
function parseInvocationOptions(request: NextRequest): GatewayInvokeOptions {
  const options: GatewayInvokeOptions = {};

  // Skip input validation
  const skipValidation = request.headers.get('X-Waygate-Skip-Validation');
  if (skipValidation?.toLowerCase() === 'true') {
    options.skipValidation = true;
  }

  // Custom timeout
  const timeout = request.headers.get('X-Waygate-Timeout');
  if (timeout) {
    const timeoutMs = parseInt(timeout, 10);
    if (!isNaN(timeoutMs)) {
      options.timeoutMs = timeoutMs;
    }
  }

  // Idempotency key
  const idempotencyKey = request.headers.get('X-Idempotency-Key');
  if (idempotencyKey) {
    options.idempotencyKey = idempotencyKey;
  }

  // Include raw response
  const includeRaw = request.headers.get('X-Waygate-Include-Raw');
  if (includeRaw?.toLowerCase() === 'true') {
    options.includeRawResponse = true;
  }

  // Response validation mode override
  const validationMode = request.headers.get('X-Waygate-Validation-Mode');
  if (validationMode && ['strict', 'warn', 'lenient'].includes(validationMode.toLowerCase())) {
    options.validation = {
      ...options.validation,
      mode: validationMode.toLowerCase() as 'strict' | 'warn' | 'lenient',
    };
  }

  // Bypass response validation
  const bypassValidation = request.headers.get('X-Waygate-Bypass-Response-Validation');
  if (bypassValidation?.toLowerCase() === 'true') {
    options.validation = {
      ...options.validation,
      bypassValidation: true,
    };
  }

  // Connection ID for multi-app connections
  const connectionId = request.headers.get('X-Waygate-Connection-Id');
  if (connectionId) {
    options.connectionId = connectionId;
  }

  // External user ID for end-user credential resolution (wg_app_ key flows)
  const externalUserId = request.headers.get('X-Waygate-External-User-Id');
  if (externalUserId) {
    options.externalUserId = externalUserId;
  }

  // Context for name-to-ID resolution
  // Type is validated by GatewayInvokeOptionsSchema.safeParse below
  const context = parseContextFromHeaders(request);
  if (context && Object.keys(context).length > 0) {
    // The context will be validated by the schema; use type assertion for assignment
    options.context = context as GatewayInvokeOptions['context'];
  }

  // Validate options
  const parsed = GatewayInvokeOptionsSchema.safeParse(options);
  if (parsed.success) {
    return parsed.data;
  }

  // If validation fails, return empty options (use defaults)
  return {};
}

/**
 * Parse context from request headers for name-to-ID resolution.
 *
 * Supports two formats:
 * 1. X-Waygate-Context: Full context object as JSON
 *    Example: X-Waygate-Context: {"channels": [{"id": "C123", "name": "general"}]}
 *
 * 2. X-Waygate-Context-{Type}: Individual context type as JSON array
 *    Example: X-Waygate-Context-Users: [{"id": "U123", "name": "sarah"}]
 *    Example: X-Waygate-Context-Channels: [{"id": "C456", "name": "general"}]
 *
 * Both formats can be combined - individual type headers are merged into the full context.
 */
function parseContextFromHeaders(request: NextRequest): Record<string, unknown[]> | undefined {
  const context: Record<string, unknown[]> = {};

  // Parse full context header
  const fullContextHeader = request.headers.get('X-Waygate-Context');
  if (fullContextHeader) {
    try {
      const parsed = JSON.parse(fullContextHeader);
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        for (const [key, value] of Object.entries(parsed)) {
          if (Array.isArray(value)) {
            context[key] = value;
          }
        }
      }
    } catch {
      // Ignore invalid JSON in full context header
      console.warn('[GATEWAY] Invalid JSON in X-Waygate-Context header');
    }
  }

  // Parse individual context type headers (X-Waygate-Context-{Type})
  const contextPrefix = 'x-waygate-context-';
  request.headers.forEach((value, key) => {
    const lowerKey = key.toLowerCase();
    if (lowerKey.startsWith(contextPrefix) && lowerKey !== 'x-waygate-context') {
      const contextType = lowerKey.slice(contextPrefix.length);
      if (contextType) {
        try {
          const parsed = JSON.parse(value);
          if (Array.isArray(parsed)) {
            context[contextType] = parsed;
          }
        } catch {
          // Ignore invalid JSON in context type header
          console.warn(`[GATEWAY] Invalid JSON in X-Waygate-Context-${contextType} header`);
        }
      }
    }
  });

  return Object.keys(context).length > 0 ? context : undefined;
}

/**
 * Generate a quick request ID for early errors (before gateway service is invoked)
 */
function generateQuickRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}
