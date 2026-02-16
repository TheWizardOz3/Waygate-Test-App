/**
 * Waygate API Key Utilities
 *
 * Handles generation, hashing, and validation of Waygate API keys.
 *
 * Key types:
 * - Tenant keys (wg_live_): Manage integrations, connections, apps
 * - App keys (wg_app_): Invoke actions on behalf of end-users
 * - Connect session tokens (wg_cs_): Short-lived tokens for end-user OAuth flows
 */

import { createHash, randomBytes } from 'crypto';
import bcrypt from 'bcrypt';

const TENANT_KEY_PREFIX = 'wg_live_';
const APP_KEY_PREFIX = 'wg_app_';
const CONNECT_SESSION_PREFIX = 'wg_cs_';
const KEY_LENGTH = 32; // 32 hex chars = 16 bytes of randomness
const BCRYPT_ROUNDS = 12;

/** Valid key prefixes for format validation */
const VALID_KEY_PREFIXES = [TENANT_KEY_PREFIX, APP_KEY_PREFIX] as const;

export type KeyType = 'tenant' | 'app';

/**
 * Determines the key type from the prefix
 *
 * @returns 'tenant' for wg_live_, 'app' for wg_app_, null for unrecognized
 */
export function getKeyType(key: string): KeyType | null {
  if (key.startsWith(TENANT_KEY_PREFIX)) return 'tenant';
  if (key.startsWith(APP_KEY_PREFIX)) return 'app';
  return null;
}

/**
 * Computes a SHA-256 hex index for O(1) database lookup.
 * Used instead of iterating all rows and bcrypt-comparing each.
 */
export function computeKeyIndex(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

/**
 * Generates a new Waygate tenant API key (wg_live_ prefix)
 *
 * @returns Object containing the plaintext key and its bcrypt hash
 */
export async function generateApiKey(): Promise<{ key: string; hash: string }> {
  const randomPart = randomBytes(KEY_LENGTH / 2).toString('hex');
  const key = `${TENANT_KEY_PREFIX}${randomPart}`;
  const hash = await bcrypt.hash(key, BCRYPT_ROUNDS);

  return { key, hash };
}

/**
 * Generates a new App API key (wg_app_ prefix) with hash and index for O(1) lookup
 *
 * @returns Object containing the plaintext key, bcrypt hash, and SHA-256 index
 */
export async function generateAppApiKey(): Promise<{
  key: string;
  hash: string;
  index: string;
}> {
  const randomPart = randomBytes(KEY_LENGTH / 2).toString('hex');
  const key = `${APP_KEY_PREFIX}${randomPart}`;
  const hash = await bcrypt.hash(key, BCRYPT_ROUNDS);
  const index = computeKeyIndex(key);

  return { key, hash, index };
}

/**
 * Generates a cryptographic connect session token (wg_cs_ prefix)
 *
 * These are short-lived, single-use tokens for the end-user OAuth connect flow.
 */
export function generateConnectSessionToken(): string {
  const randomPart = randomBytes(KEY_LENGTH / 2).toString('hex');
  return `${CONNECT_SESSION_PREFIX}${randomPart}`;
}

/**
 * Validates a plaintext API key against a stored bcrypt hash
 *
 * @param key - The plaintext API key from the request
 * @param hash - The stored bcrypt hash
 * @returns True if the key matches the hash
 */
export async function validateApiKey(key: string, hash: string): Promise<boolean> {
  return bcrypt.compare(key, hash);
}

/**
 * Extracts the API key from an Authorization header value
 *
 * Supports both "Bearer <key>" and raw key formats.
 * Works with both wg_live_ and wg_app_ prefixes.
 *
 * @param authHeader - The Authorization header value
 * @returns The extracted key or null if invalid format
 */
export function extractApiKey(authHeader: string | null): string | null {
  if (!authHeader) {
    return null;
  }

  // Handle "Bearer <key>" format
  if (authHeader.startsWith('Bearer ')) {
    const key = authHeader.slice(7).trim();
    return isValidKeyFormat(key) ? key : null;
  }

  // Handle raw key format (for flexibility)
  if (isValidKeyFormat(authHeader)) {
    return authHeader;
  }

  return null;
}

/**
 * Checks if a string matches a valid Waygate API key format (wg_live_ or wg_app_)
 *
 * @param key - String to validate
 * @returns True if the key has a recognized prefix and correct format
 */
export function isValidKeyFormat(key: string): boolean {
  const prefix = VALID_KEY_PREFIXES.find((p) => key.startsWith(p));
  if (!prefix) return false;

  const randomPart = key.slice(prefix.length);
  return /^[0-9a-f]{32}$/i.test(randomPart);
}

/**
 * Checks if a string is a valid connect session token (wg_cs_ prefix)
 */
export function isValidConnectSessionToken(token: string): boolean {
  if (!token.startsWith(CONNECT_SESSION_PREFIX)) return false;
  const randomPart = token.slice(CONNECT_SESSION_PREFIX.length);
  return /^[0-9a-f]{32}$/i.test(randomPart);
}

/**
 * Masks an API key for safe logging/display
 *
 * Works with both wg_live_ and wg_app_ prefixes.
 *
 * @param key - The API key to mask
 * @returns Masked version showing only prefix and last 4 chars
 */
export function maskApiKey(key: string): string {
  const prefix = VALID_KEY_PREFIXES.find((p) => key.startsWith(p));
  if (!prefix) return '****';

  const lastFour = key.slice(-4);
  return `${prefix}****${lastFour}`;
}
