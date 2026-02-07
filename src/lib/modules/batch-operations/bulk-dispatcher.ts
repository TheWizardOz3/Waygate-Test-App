/**
 * Bulk Dispatcher
 *
 * Transforms N individual item payloads into bulk API call(s) and maps
 * the bulk response back to individual item results. Handles chunking
 * when the bulk API has a per-call item limit.
 */

import type { BulkConfig } from './batch-operations.schemas';
import { BulkDispatchError } from './batch-operations.errors';
import { rateLimitTracker } from './rate-limit-tracker';
import { extractRateLimitInfo } from '@/lib/modules/execution/http-client';

// =============================================================================
// Types
// =============================================================================

export interface BulkItem {
  /** AsyncJobItem ID */
  itemId: string;
  /** Item input payload */
  input: Record<string, unknown>;
}

export interface BulkItemResult {
  /** AsyncJobItem ID */
  itemId: string;
  /** Whether this item succeeded */
  success: boolean;
  /** Output data if successful */
  output?: Record<string, unknown>;
  /** Error message if failed */
  error?: string;
}

export interface BulkDispatchContext {
  /** Integration ID (for rate limit tracking) */
  integrationId: string;
  /** Full URL base for the integration */
  baseUrl: string;
  /** Auth headers to include */
  authHeaders: Record<string, string>;
}

// =============================================================================
// Payload Transformers
// =============================================================================

function transformToArray(items: BulkItem[]): unknown[] {
  return items.map((item) => item.input);
}

function transformToCsv(items: BulkItem[]): string {
  if (items.length === 0) return '';

  const keys = Object.keys(items[0].input);
  const header = keys.join(',');
  const rows = items.map((item) =>
    keys
      .map((key) => {
        const val = item.input[key];
        const str = val === null || val === undefined ? '' : String(val);
        return str.includes(',') || str.includes('"') || str.includes('\n')
          ? `"${str.replace(/"/g, '""')}"`
          : str;
      })
      .join(',')
  );

  return [header, ...rows].join('\n');
}

function transformToNdjson(items: BulkItem[]): string {
  return items.map((item) => JSON.stringify(item.input)).join('\n');
}

// =============================================================================
// Bulk Dispatcher
// =============================================================================

/**
 * Dispatch items via the bulk API endpoint.
 * Chunks items by maxItemsPerCall, transforms payloads, sends bulk requests,
 * and maps responses back to individual item results.
 */
export async function dispatchBulk(
  items: BulkItem[],
  bulkConfig: BulkConfig,
  context: BulkDispatchContext
): Promise<BulkItemResult[]> {
  const maxPerCall = bulkConfig.maxItemsPerCall ?? 200;
  const chunks = chunkArray(items, maxPerCall);
  const allResults: BulkItemResult[] = [];

  for (const chunk of chunks) {
    // Pace by rate limit budget
    await rateLimitTracker.acquireBudget(context.integrationId);

    try {
      const results = await dispatchBulkChunk(chunk, bulkConfig, context);
      allResults.push(...results);
    } catch (error) {
      // Mark all items in this chunk as failed
      const failedResults: BulkItemResult[] = chunk.map((item) => ({
        itemId: item.itemId,
        success: false,
        error: error instanceof Error ? error.message : 'Bulk API call failed',
      }));
      allResults.push(...failedResults);
    }
  }

  return allResults;
}

/**
 * Dispatch a single chunk of items via the bulk API endpoint.
 */
async function dispatchBulkChunk(
  items: BulkItem[],
  bulkConfig: BulkConfig,
  context: BulkDispatchContext
): Promise<BulkItemResult[]> {
  // Build payload
  let body: string;
  let contentType: string;

  switch (bulkConfig.payloadTransform) {
    case 'csv':
      body = transformToCsv(items);
      contentType = 'text/csv';
      break;
    case 'ndjson':
      body = transformToNdjson(items);
      contentType = 'application/x-ndjson';
      break;
    case 'array':
    default: {
      const payload = transformToArray(items);
      const wrapped = bulkConfig.wrapperKey ? { [bulkConfig.wrapperKey]: payload } : payload;
      body = JSON.stringify(wrapped);
      contentType = 'application/json';
      break;
    }
  }

  // Build URL
  const url = bulkConfig.endpoint.startsWith('http')
    ? bulkConfig.endpoint
    : `${context.baseUrl}${bulkConfig.endpoint}`;

  // Send request
  const response = await fetch(url, {
    method: bulkConfig.httpMethod,
    headers: {
      'Content-Type': contentType,
      ...context.authHeaders,
    },
    body,
    signal: AbortSignal.timeout(60_000),
  });

  // Update rate limit tracking from response
  const rateLimitInfo = extractRateLimitInfo(response.headers);
  if (rateLimitInfo) {
    rateLimitTracker.updateFromHeaders(context.integrationId, rateLimitInfo);
  }

  if (!response.ok) {
    const errorBody = await response.text().catch(() => 'Unknown error');
    throw new BulkDispatchError(`Bulk API returned ${response.status}: ${errorBody}`, {
      status: response.status,
      body: errorBody,
    });
  }

  // Parse response and map to item results
  const responseData = await response.json();
  return mapBulkResponse(items, responseData, bulkConfig);
}

/**
 * Map bulk API response back to individual item results using responseMapping.
 */
function mapBulkResponse(
  items: BulkItem[],
  responseData: unknown,
  bulkConfig: BulkConfig
): BulkItemResult[] {
  const { responseMapping } = bulkConfig;

  // If response is an array, map by index
  if (Array.isArray(responseData)) {
    return items.map((item, index) => {
      const resultItem = responseData[index];
      if (!resultItem) {
        return { itemId: item.itemId, success: false, error: 'No response for item' };
      }
      return mapSingleItemResult(item.itemId, resultItem, responseMapping);
    });
  }

  // If response is an object, look for an array field
  if (responseData && typeof responseData === 'object') {
    const data = responseData as Record<string, unknown>;

    // Try to find the results array using common patterns
    const resultsArray =
      (data['results'] as unknown[]) ??
      (data['items'] as unknown[]) ??
      (data['records'] as unknown[]) ??
      (data['data'] as unknown[]);

    if (Array.isArray(resultsArray)) {
      return items.map((item, index) => {
        const resultItem = resultsArray[index];
        if (!resultItem) {
          return { itemId: item.itemId, success: false, error: 'No response for item' };
        }
        return mapSingleItemResult(item.itemId, resultItem, responseMapping);
      });
    }
  }

  // Cannot parse response — mark all as succeeded (optimistic for now)
  return items.map((item) => ({
    itemId: item.itemId,
    success: true,
    output: responseData as Record<string, unknown>,
  }));
}

/**
 * Map a single result item from the bulk response.
 */
function mapSingleItemResult(
  itemId: string,
  resultItem: unknown,
  mapping: BulkConfig['responseMapping']
): BulkItemResult {
  if (!resultItem || typeof resultItem !== 'object') {
    return { itemId, success: true, output: { result: resultItem } };
  }

  const data = resultItem as Record<string, unknown>;
  const successValue = getNestedValue(data, mapping.successField);
  const errorValue = getNestedValue(data, mapping.errorField);

  // Determine success: check the success field value
  const isSuccess = successValue === true || successValue === 'true' || successValue === 'Success';

  if (isSuccess) {
    return { itemId, success: true, output: data };
  }

  return {
    itemId,
    success: false,
    error: errorValue ? String(errorValue) : 'Item failed in bulk response',
  };
}

// =============================================================================
// Helpers
// =============================================================================

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}
