/**
 * Variable Encryption Module
 *
 * Provides encryption/decryption for sensitive variable values.
 * Uses AES-256-GCM (same as credential encryption) for secure storage.
 *
 * Sensitive variables:
 * - Are encrypted before storage in the `encryptedValue` field
 * - Have their `value` field cleared (set to null placeholder)
 * - Are decrypted only when needed for resolution
 * - Are masked as [REDACTED] in API responses and logs
 */

import { encrypt, decrypt, EncryptionError } from '@/lib/modules/credentials/encryption';
import { REDACTED_VALUE } from './variable.schemas';

/**
 * Error thrown when variable encryption/decryption fails
 */
export class VariableEncryptionError extends Error {
  constructor(
    message: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'VariableEncryptionError';
  }
}

/**
 * Encrypts a variable value for secure storage
 *
 * @param value - The value to encrypt (will be JSON-stringified)
 * @returns Buffer containing encrypted data
 * @throws VariableEncryptionError if encryption fails
 *
 * @example
 * ```ts
 * const encrypted = encryptVariableValue('my-secret-api-key');
 * // Store encrypted buffer in database encryptedValue field
 * ```
 */
export function encryptVariableValue(value: unknown): Buffer {
  try {
    // Convert value to JSON string for consistent encoding
    const jsonValue = JSON.stringify(value);
    return encrypt(jsonValue);
  } catch (error) {
    if (error instanceof EncryptionError) {
      throw new VariableEncryptionError(
        'Failed to encrypt variable value: ' + error.message,
        error
      );
    }
    throw new VariableEncryptionError(
      'Failed to encrypt variable value',
      error instanceof Error ? error : undefined
    );
  }
}

/**
 * Decrypts an encrypted variable value
 *
 * @param encryptedData - Buffer containing encrypted data
 * @returns The decrypted value (parsed from JSON)
 * @throws VariableEncryptionError if decryption fails
 *
 * @example
 * ```ts
 * const decryptedValue = decryptVariableValue(encryptedBuffer);
 * // decryptedValue is the original value that was encrypted
 * ```
 */
export function decryptVariableValue(encryptedData: Buffer | Uint8Array): unknown {
  try {
    // Ensure we have a proper Buffer
    const buffer = Buffer.isBuffer(encryptedData) ? encryptedData : Buffer.from(encryptedData);

    const jsonValue = decrypt(buffer);
    return JSON.parse(jsonValue);
  } catch (error) {
    if (error instanceof EncryptionError) {
      throw new VariableEncryptionError(
        'Failed to decrypt variable value: invalid or corrupted data',
        error
      );
    }
    throw new VariableEncryptionError(
      'Failed to decrypt variable value',
      error instanceof Error ? error : undefined
    );
  }
}

/**
 * Checks if a value should be masked (for logging/display)
 */
export function shouldMaskValue(sensitive: boolean): boolean {
  return sensitive;
}

/**
 * Masks a value for safe logging/display
 *
 * @param value - The value to potentially mask
 * @param sensitive - Whether the value is sensitive
 * @returns The original value or [REDACTED] if sensitive
 */
export function maskValue(value: unknown, sensitive: boolean): unknown {
  return sensitive ? REDACTED_VALUE : value;
}

/**
 * Placeholder value stored in the `value` field for sensitive variables
 * This is stored to maintain type consistency while the real value is encrypted
 * We use a string placeholder since the actual value is in encryptedValue
 */
export const SENSITIVE_VALUE_PLACEHOLDER = '__ENCRYPTED__';
