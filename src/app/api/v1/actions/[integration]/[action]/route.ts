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
export const POST = withApiAuth(async (request: NextRequest, { tenant }) => {
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
 */
function parseInvocationOptions(request: NextRequest): GatewayInvokeOptions {
  const options: GatewayInvokeOptions = {};

  // Skip validation
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

  // Validate options
  const parsed = GatewayInvokeOptionsSchema.safeParse(options);
  if (parsed.success) {
    return parsed.data;
  }

  // If validation fails, return empty options (use defaults)
  return {};
}

/**
 * Generate a quick request ID for early errors (before gateway service is invoked)
 */
function generateQuickRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}
