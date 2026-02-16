import { describe, it, expect } from 'vitest';
import {
  generateApiKey,
  generateAppApiKey,
  generateConnectSessionToken,
  validateApiKey,
  extractApiKey,
  isValidKeyFormat,
  isValidConnectSessionToken,
  maskApiKey,
  getKeyType,
  computeKeyIndex,
} from '@/lib/modules/auth/api-key';

describe('API Key Utilities', () => {
  // ────────────────────────────────────────────
  // getKeyType
  // ────────────────────────────────────────────
  describe('getKeyType', () => {
    it('should return "tenant" for wg_live_ prefix', () => {
      expect(getKeyType('wg_live_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6')).toBe('tenant');
    });

    it('should return "app" for wg_app_ prefix', () => {
      expect(getKeyType('wg_app_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6')).toBe('app');
    });

    it('should return null for unrecognized prefix', () => {
      expect(getKeyType('wg_test_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6')).toBeNull();
      expect(getKeyType('xx_live_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6')).toBeNull();
    });

    it('should return null for empty string', () => {
      expect(getKeyType('')).toBeNull();
    });

    it('should return null for connect session token prefix', () => {
      expect(getKeyType('wg_cs_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6')).toBeNull();
    });
  });

  // ────────────────────────────────────────────
  // computeKeyIndex
  // ────────────────────────────────────────────
  describe('computeKeyIndex', () => {
    it('should return a 64-character hex string (SHA-256)', () => {
      const index = computeKeyIndex('wg_live_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6');
      expect(index).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should be deterministic for the same input', () => {
      const key = 'wg_live_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6';
      const index1 = computeKeyIndex(key);
      const index2 = computeKeyIndex(key);
      expect(index1).toBe(index2);
    });

    it('should produce different outputs for different inputs', () => {
      const index1 = computeKeyIndex('wg_live_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6');
      const index2 = computeKeyIndex('wg_live_ffffffffffffffffffffffffffffffff');
      expect(index1).not.toBe(index2);
    });

    it('should produce different outputs for tenant vs app keys with same random part', () => {
      const randomPart = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6';
      const tenantIndex = computeKeyIndex(`wg_live_${randomPart}`);
      const appIndex = computeKeyIndex(`wg_app_${randomPart}`);
      expect(tenantIndex).not.toBe(appIndex);
    });
  });

  // ────────────────────────────────────────────
  // generateApiKey (tenant key, wg_live_)
  // ────────────────────────────────────────────
  describe('generateApiKey', () => {
    it('should generate a key with the correct prefix', async () => {
      const { key } = await generateApiKey();
      expect(key.startsWith('wg_live_')).toBe(true);
    });

    it('should generate a key with the correct length', async () => {
      const { key } = await generateApiKey();
      // wg_live_ (8 chars) + 32 hex chars = 40 total
      expect(key).toHaveLength(40);
    });

    it('should generate unique keys each time', async () => {
      const { key: key1 } = await generateApiKey();
      const { key: key2 } = await generateApiKey();
      expect(key1).not.toBe(key2);
    });

    it('should generate unique hashes for different keys', async () => {
      const { hash: hash1 } = await generateApiKey();
      const { hash: hash2 } = await generateApiKey();
      expect(hash1).not.toBe(hash2);
    });

    it('should generate a valid bcrypt hash', async () => {
      const { hash } = await generateApiKey();
      // Bcrypt hashes start with $2a$, $2b$, or $2y$
      expect(hash).toMatch(/^\$2[aby]\$\d{2}\$/);
    });
  });

  // ────────────────────────────────────────────
  // generateAppApiKey (app key, wg_app_)
  // ────────────────────────────────────────────
  describe('generateAppApiKey', () => {
    it('should generate a key with the wg_app_ prefix', async () => {
      const { key } = await generateAppApiKey();
      expect(key.startsWith('wg_app_')).toBe(true);
    });

    it('should generate a key with the correct length', async () => {
      const { key } = await generateAppApiKey();
      // wg_app_ (7 chars) + 32 hex chars = 39 total
      expect(key).toHaveLength(39);
    });

    it('should generate unique keys each time', async () => {
      const { key: key1 } = await generateAppApiKey();
      const { key: key2 } = await generateAppApiKey();
      expect(key1).not.toBe(key2);
    });

    it('should generate a valid bcrypt hash', async () => {
      const { hash } = await generateAppApiKey();
      expect(hash).toMatch(/^\$2[aby]\$\d{2}\$/);
    });

    it('should return a SHA-256 hex index', async () => {
      const { index } = await generateAppApiKey();
      expect(index).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should produce an index consistent with computeKeyIndex', async () => {
      const { key, index } = await generateAppApiKey();
      expect(index).toBe(computeKeyIndex(key));
    });

    it('should produce a key that validates against its hash', async () => {
      const { key, hash } = await generateAppApiKey();
      const isValid = await validateApiKey(key, hash);
      expect(isValid).toBe(true);
    });
  });

  // ────────────────────────────────────────────
  // generateConnectSessionToken (wg_cs_)
  // ────────────────────────────────────────────
  describe('generateConnectSessionToken', () => {
    it('should generate a token with the wg_cs_ prefix', () => {
      const token = generateConnectSessionToken();
      expect(token.startsWith('wg_cs_')).toBe(true);
    });

    it('should generate a token with the correct length', () => {
      const token = generateConnectSessionToken();
      // wg_cs_ (6 chars) + 32 hex chars = 38 total
      expect(token).toHaveLength(38);
    });

    it('should generate unique tokens each time', () => {
      const token1 = generateConnectSessionToken();
      const token2 = generateConnectSessionToken();
      expect(token1).not.toBe(token2);
    });

    it('should contain only hex characters after the prefix', () => {
      const token = generateConnectSessionToken();
      const randomPart = token.slice(6); // after 'wg_cs_'
      expect(randomPart).toMatch(/^[0-9a-f]{32}$/);
    });
  });

  // ────────────────────────────────────────────
  // isValidConnectSessionToken
  // ────────────────────────────────────────────
  describe('isValidConnectSessionToken', () => {
    it('should return true for a valid connect session token', () => {
      const token = generateConnectSessionToken();
      expect(isValidConnectSessionToken(token)).toBe(true);
    });

    it('should return true for a manually constructed valid token', () => {
      expect(isValidConnectSessionToken('wg_cs_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6')).toBe(true);
    });

    it('should return false for wrong prefix', () => {
      expect(isValidConnectSessionToken('wg_live_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6')).toBe(false);
      expect(isValidConnectSessionToken('wg_app_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6')).toBe(false);
    });

    it('should return false for too short random part', () => {
      expect(isValidConnectSessionToken('wg_cs_tooshort')).toBe(false);
    });

    it('should return false for too long random part', () => {
      expect(isValidConnectSessionToken('wg_cs_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6extra')).toBe(false);
    });

    it('should return false for non-hex characters', () => {
      expect(isValidConnectSessionToken('wg_cs_g1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6')).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(isValidConnectSessionToken('')).toBe(false);
    });
  });

  // ────────────────────────────────────────────
  // validateApiKey
  // ────────────────────────────────────────────
  describe('validateApiKey', () => {
    it('should return true for matching tenant key and hash', async () => {
      const { key, hash } = await generateApiKey();
      const isValid = await validateApiKey(key, hash);
      expect(isValid).toBe(true);
    });

    it('should return true for matching app key and hash', async () => {
      const { key, hash } = await generateAppApiKey();
      const isValid = await validateApiKey(key, hash);
      expect(isValid).toBe(true);
    });

    it('should return false for non-matching key', async () => {
      const { hash } = await generateApiKey();
      const wrongKey = 'wg_live_wrongkeywrongkeywrongkey12';
      const isValid = await validateApiKey(wrongKey, hash);
      expect(isValid).toBe(false);
    });

    it('should return false for modified key', async () => {
      const { key, hash } = await generateApiKey();
      const modifiedKey = key.slice(0, -1) + 'x';
      const isValid = await validateApiKey(modifiedKey, hash);
      expect(isValid).toBe(false);
    });

    it('should not cross-validate between tenant and app hashes', async () => {
      const { hash: tenantHash } = await generateApiKey();
      const { key: appKey } = await generateAppApiKey();
      const isValid = await validateApiKey(appKey, tenantHash);
      expect(isValid).toBe(false);
    });
  });

  // ────────────────────────────────────────────
  // extractApiKey
  // ────────────────────────────────────────────
  describe('extractApiKey', () => {
    describe('with wg_live_ prefix', () => {
      it('should extract key from Bearer token format', () => {
        const key = 'wg_live_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6';
        const result = extractApiKey(`Bearer ${key}`);
        expect(result).toBe(key);
      });

      it('should handle Bearer with extra whitespace', () => {
        const key = 'wg_live_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6';
        const result = extractApiKey(`Bearer   ${key}  `);
        expect(result).toBe(key);
      });

      it('should extract raw key format', () => {
        const key = 'wg_live_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6';
        const result = extractApiKey(key);
        expect(result).toBe(key);
      });
    });

    describe('with wg_app_ prefix', () => {
      it('should extract key from Bearer token format', () => {
        const key = 'wg_app_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6';
        const result = extractApiKey(`Bearer ${key}`);
        expect(result).toBe(key);
      });

      it('should handle Bearer with extra whitespace', () => {
        const key = 'wg_app_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6';
        const result = extractApiKey(`Bearer   ${key}  `);
        expect(result).toBe(key);
      });

      it('should extract raw key format', () => {
        const key = 'wg_app_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6';
        const result = extractApiKey(key);
        expect(result).toBe(key);
      });
    });

    describe('invalid inputs', () => {
      it('should return null for null input', () => {
        const result = extractApiKey(null);
        expect(result).toBeNull();
      });

      it('should return null for empty string', () => {
        const result = extractApiKey('');
        expect(result).toBeNull();
      });

      it('should return null for Basic auth', () => {
        const result = extractApiKey('Basic dXNlcjpwYXNz');
        expect(result).toBeNull();
      });

      it('should return null for invalid key format', () => {
        const result = extractApiKey('Bearer invalid_key');
        expect(result).toBeNull();
      });

      it('should return null for key with wrong prefix', () => {
        const result = extractApiKey('Bearer wg_test_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6');
        expect(result).toBeNull();
      });

      it('should return null for connect session token', () => {
        const result = extractApiKey('Bearer wg_cs_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6');
        expect(result).toBeNull();
      });
    });
  });

  // ────────────────────────────────────────────
  // isValidKeyFormat
  // ────────────────────────────────────────────
  describe('isValidKeyFormat', () => {
    describe('with wg_live_ prefix', () => {
      it('should return true for valid key format', () => {
        const key = 'wg_live_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6';
        expect(isValidKeyFormat(key)).toBe(true);
      });

      it('should return true for uppercase hex chars', () => {
        const key = 'wg_live_A1B2C3D4E5F6A7B8C9D0E1F2A3B4C5D6';
        expect(isValidKeyFormat(key)).toBe(true);
      });

      it('should return false for wrong length', () => {
        expect(isValidKeyFormat('wg_live_tooshort')).toBe(false);
        expect(isValidKeyFormat('wg_live_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6extra')).toBe(false);
      });

      it('should return false for non-hex characters', () => {
        expect(isValidKeyFormat('wg_live_g1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6')).toBe(false);
      });
    });

    describe('with wg_app_ prefix', () => {
      it('should return true for valid key format', () => {
        const key = 'wg_app_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6';
        expect(isValidKeyFormat(key)).toBe(true);
      });

      it('should return true for uppercase hex chars', () => {
        const key = 'wg_app_A1B2C3D4E5F6A7B8C9D0E1F2A3B4C5D6';
        expect(isValidKeyFormat(key)).toBe(true);
      });

      it('should return false for wrong length', () => {
        expect(isValidKeyFormat('wg_app_tooshort')).toBe(false);
        expect(isValidKeyFormat('wg_app_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6extra')).toBe(false);
      });

      it('should return false for non-hex characters', () => {
        expect(isValidKeyFormat('wg_app_g1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6')).toBe(false);
      });
    });

    describe('invalid prefixes and edge cases', () => {
      it('should return false for wrong prefix', () => {
        expect(isValidKeyFormat('wg_test_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6')).toBe(false);
        expect(isValidKeyFormat('xx_live_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6')).toBe(false);
      });

      it('should return false for connect session prefix', () => {
        expect(isValidKeyFormat('wg_cs_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6')).toBe(false);
      });

      it('should return false for empty string', () => {
        expect(isValidKeyFormat('')).toBe(false);
      });
    });
  });

  // ────────────────────────────────────────────
  // maskApiKey
  // ────────────────────────────────────────────
  describe('maskApiKey', () => {
    describe('with wg_live_ prefix', () => {
      it('should mask the middle of the key', () => {
        const key = 'wg_live_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6';
        const masked = maskApiKey(key);
        expect(masked).toBe('wg_live_****c5d6');
      });

      it('should preserve the prefix and last 4 chars', () => {
        const key = 'wg_live_0000000000000000000000000000wxyz';
        const masked = maskApiKey(key);
        expect(masked).toBe('wg_live_****wxyz');
      });
    });

    describe('with wg_app_ prefix', () => {
      it('should mask the middle of the key', () => {
        const key = 'wg_app_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6';
        const masked = maskApiKey(key);
        expect(masked).toBe('wg_app_****c5d6');
      });

      it('should preserve the prefix and last 4 chars', () => {
        const key = 'wg_app_0000000000000000000000000000wxyz';
        const masked = maskApiKey(key);
        expect(masked).toBe('wg_app_****wxyz');
      });
    });

    describe('invalid inputs', () => {
      it('should return **** for invalid key format', () => {
        expect(maskApiKey('invalid')).toBe('****');
        expect(maskApiKey('')).toBe('****');
      });

      it('should return **** for connect session token', () => {
        expect(maskApiKey('wg_cs_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6')).toBe('****');
      });

      it('should return **** for unrecognized prefix', () => {
        expect(maskApiKey('wg_test_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6')).toBe('****');
      });
    });
  });
});
