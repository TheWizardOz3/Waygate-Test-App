/**
 * Scraped Content Storage
 *
 * Provides storage for scraped documentation content using Supabase Storage.
 * Used for caching previously scraped documentation to avoid re-scraping.
 *
 * Features:
 * - Store raw scraped content by job ID
 * - Retrieve cached content for re-processing
 * - 30-day retention policy (handled by Supabase bucket configuration)
 * - Compressed storage to reduce costs
 */

import { supabaseAdmin } from '@/lib/db/supabase';
import { gzip, gunzip } from 'zlib';
import { promisify } from 'util';

// =============================================================================
// Constants
// =============================================================================

/** Bucket name for scraped documentation content */
const BUCKET_NAME = 'scraped-content';

/** Content type for stored files */
const CONTENT_TYPE = 'application/gzip';

/** Maximum content size (10MB uncompressed) */
const MAX_CONTENT_SIZE = 10 * 1024 * 1024;

/** Compression utilities */
const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

// =============================================================================
// Error Types
// =============================================================================

export type StorageErrorCode =
  | 'STORAGE_UNAVAILABLE'
  | 'BUCKET_NOT_FOUND'
  | 'UPLOAD_FAILED'
  | 'DOWNLOAD_FAILED'
  | 'DELETE_FAILED'
  | 'CONTENT_TOO_LARGE'
  | 'COMPRESSION_FAILED'
  | 'DECOMPRESSION_FAILED'
  | 'NOT_FOUND';

export class StorageError extends Error {
  constructor(
    public code: StorageErrorCode,
    message: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'StorageError';
  }
}

// =============================================================================
// Type Guards
// =============================================================================

export function isStorageError(error: unknown): error is StorageError {
  return error instanceof StorageError;
}

// =============================================================================
// Internal Helpers
// =============================================================================

/**
 * Ensure the Supabase admin client is available
 */
function getClient() {
  if (!supabaseAdmin) {
    throw new StorageError(
      'STORAGE_UNAVAILABLE',
      'Supabase admin client not available. Check SUPABASE_SERVICE_ROLE_KEY.'
    );
  }
  return supabaseAdmin;
}

/**
 * Generate a storage key for a job's content
 */
function getStorageKey(jobId: string, filename: string = 'content.gz'): string {
  return `jobs/${jobId}/${filename}`;
}

/**
 * Compress content using gzip
 */
async function compressContent(content: string): Promise<Buffer> {
  try {
    return await gzipAsync(Buffer.from(content, 'utf-8'));
  } catch (error) {
    throw new StorageError('COMPRESSION_FAILED', 'Failed to compress content', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Decompress gzipped content
 */
async function decompressContent(buffer: Buffer): Promise<string> {
  try {
    const decompressed = await gunzipAsync(buffer);
    return decompressed.toString('utf-8');
  } catch (error) {
    throw new StorageError('DECOMPRESSION_FAILED', 'Failed to decompress content', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

// =============================================================================
// Storage Operations
// =============================================================================

/**
 * Store scraped content for a job
 *
 * @param jobId - The scrape job ID
 * @param content - The scraped content (raw text/markdown)
 * @param metadata - Optional metadata to store alongside content
 * @returns The storage key for retrieval
 *
 * @example
 * ```ts
 * const key = await storeScrapedContent('job-123', scrapedMarkdown, {
 *   sourceUrl: 'https://api.example.com/docs',
 *   scrapedAt: new Date().toISOString(),
 * });
 * ```
 */
export async function storeScrapedContent(
  jobId: string,
  content: string,
  metadata?: Record<string, string>
): Promise<string> {
  const client = getClient();

  // Validate content size
  const contentSize = Buffer.byteLength(content, 'utf-8');
  if (contentSize > MAX_CONTENT_SIZE) {
    throw new StorageError(
      'CONTENT_TOO_LARGE',
      `Content size (${contentSize} bytes) exceeds maximum (${MAX_CONTENT_SIZE} bytes)`,
      { size: contentSize, maxSize: MAX_CONTENT_SIZE }
    );
  }

  // Compress content
  const compressed = await compressContent(content);
  const storageKey = getStorageKey(jobId);

  // Upload to Supabase Storage
  const { error } = await client.storage.from(BUCKET_NAME).upload(storageKey, compressed, {
    contentType: CONTENT_TYPE,
    upsert: true, // Allow overwriting existing content
    cacheControl: '3600', // 1 hour cache
    ...(metadata && { metadata }),
  });

  if (error) {
    throw new StorageError('UPLOAD_FAILED', `Failed to upload content: ${error.message}`, {
      jobId,
      storageKey,
      error: error.message,
    });
  }

  return storageKey;
}

/**
 * Retrieve scraped content by storage key
 *
 * @param storageKey - The storage key returned from storeScrapedContent
 * @returns The original scraped content
 *
 * @example
 * ```ts
 * const content = await getScrapedContent('jobs/job-123/content.gz');
 * ```
 */
export async function getScrapedContent(storageKey: string): Promise<string> {
  const client = getClient();

  const { data, error } = await client.storage.from(BUCKET_NAME).download(storageKey);

  if (error) {
    if (error.message.includes('not found') || error.message.includes('Object not found')) {
      throw new StorageError('NOT_FOUND', `Content not found: ${storageKey}`, { storageKey });
    }
    throw new StorageError('DOWNLOAD_FAILED', `Failed to download content: ${error.message}`, {
      storageKey,
      error: error.message,
    });
  }

  // Convert Blob to Buffer and decompress
  const arrayBuffer = await data.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  return decompressContent(buffer);
}

/**
 * Get scraped content for a job by job ID
 *
 * @param jobId - The scrape job ID
 * @returns The scraped content, or null if not found
 *
 * @example
 * ```ts
 * const content = await getScrapedContentByJobId('job-123');
 * if (content) {
 *   // Use cached content
 * }
 * ```
 */
export async function getScrapedContentByJobId(jobId: string): Promise<string | null> {
  const storageKey = getStorageKey(jobId);
  try {
    return await getScrapedContent(storageKey);
  } catch (error) {
    if (isStorageError(error) && error.code === 'NOT_FOUND') {
      return null;
    }
    throw error;
  }
}

/**
 * Delete scraped content for a job
 *
 * @param jobId - The scrape job ID
 * @returns True if deleted, false if not found
 *
 * @example
 * ```ts
 * await deleteScrapedContent('job-123');
 * ```
 */
export async function deleteScrapedContent(jobId: string): Promise<boolean> {
  const client = getClient();
  const storageKey = getStorageKey(jobId);

  const { error } = await client.storage.from(BUCKET_NAME).remove([storageKey]);

  if (error) {
    // Supabase doesn't error on missing files, but let's handle it anyway
    if (error.message.includes('not found')) {
      return false;
    }
    throw new StorageError('DELETE_FAILED', `Failed to delete content: ${error.message}`, {
      jobId,
      storageKey,
      error: error.message,
    });
  }

  return true;
}

/**
 * Check if scraped content exists for a job
 *
 * @param jobId - The scrape job ID
 * @returns True if content exists
 */
export async function hasScrapedContent(jobId: string): Promise<boolean> {
  const client = getClient();

  const { data, error } = await client.storage.from(BUCKET_NAME).list(`jobs/${jobId}`, {
    limit: 1,
    search: 'content.gz',
  });

  if (error) {
    // List might fail if folder doesn't exist, treat as no content
    return false;
  }

  return data.length > 0;
}

/**
 * Get storage metadata for a job's content
 *
 * @param jobId - The scrape job ID
 * @returns Metadata including size, created date, etc.
 */
export async function getContentMetadata(jobId: string): Promise<{
  key: string;
  size: number;
  createdAt: string;
  metadata?: Record<string, string>;
} | null> {
  const client = getClient();
  const storageKey = getStorageKey(jobId);

  const { data, error } = await client.storage.from(BUCKET_NAME).list(`jobs/${jobId}`, {
    limit: 1,
    search: 'content.gz',
  });

  if (error || data.length === 0) {
    return null;
  }

  const file = data[0];
  return {
    key: storageKey,
    size: file.metadata?.size ?? 0,
    createdAt: file.created_at,
    metadata: file.metadata as Record<string, string> | undefined,
  };
}

// =============================================================================
// Bucket Management (for setup/admin)
// =============================================================================

/**
 * Ensure the scraped-content bucket exists
 * Should be called during application initialization or deployment
 *
 * @returns True if bucket was created, false if it already exists
 */
export async function ensureBucketExists(): Promise<boolean> {
  const client = getClient();

  // Check if bucket exists
  const { data: buckets, error: listError } = await client.storage.listBuckets();

  if (listError) {
    throw new StorageError('STORAGE_UNAVAILABLE', `Failed to list buckets: ${listError.message}`);
  }

  const bucketExists = buckets.some((b) => b.name === BUCKET_NAME);
  if (bucketExists) {
    return false;
  }

  // Create bucket with 30-day retention (handled via Supabase dashboard or policies)
  const { error: createError } = await client.storage.createBucket(BUCKET_NAME, {
    public: false, // Private bucket - only accessible via service role
    fileSizeLimit: MAX_CONTENT_SIZE, // 10MB limit
  });

  if (createError) {
    throw new StorageError('BUCKET_NOT_FOUND', `Failed to create bucket: ${createError.message}`);
  }

  return true;
}

/**
 * Get bucket info and statistics
 *
 * @returns Bucket information
 */
export async function getBucketInfo(): Promise<{
  name: string;
  public: boolean;
  fileSizeLimit: number | null;
  allowedMimeTypes: string[] | null;
}> {
  const client = getClient();

  const { data, error } = await client.storage.getBucket(BUCKET_NAME);

  if (error) {
    throw new StorageError('BUCKET_NOT_FOUND', `Bucket not found: ${error.message}`);
  }

  return {
    name: data.name,
    public: data.public,
    fileSizeLimit: data.file_size_limit ?? null,
    allowedMimeTypes: data.allowed_mime_types ?? null,
  };
}
