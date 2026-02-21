import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { verifyCronSecret } from '@/lib/api/middleware/cron-auth';

function makeRequest(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest('http://localhost:3000/api/v1/internal/test', {
    headers,
  });
}

describe('verifyCronSecret', () => {
  const LOG_PREFIX = '[TEST_CRON]';

  beforeEach(() => {
    vi.stubEnv('CRON_SECRET', '');
    vi.stubEnv('NODE_ENV', 'production');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('production behavior', () => {
    it('returns false when CRON_SECRET is not set', () => {
      delete process.env.CRON_SECRET;
      const request = makeRequest({ authorization: 'Bearer anything' });
      expect(verifyCronSecret(request, LOG_PREFIX)).toBe(false);
    });

    it('returns false when Authorization header is missing', () => {
      vi.stubEnv('CRON_SECRET', 'test-secret-123');
      const request = makeRequest();
      expect(verifyCronSecret(request, LOG_PREFIX)).toBe(false);
    });

    it('returns false when Authorization header has wrong value', () => {
      vi.stubEnv('CRON_SECRET', 'test-secret-123');
      const request = makeRequest({ authorization: 'Bearer wrong-secret' });
      expect(verifyCronSecret(request, LOG_PREFIX)).toBe(false);
    });

    it('returns false when Authorization header is missing Bearer prefix', () => {
      vi.stubEnv('CRON_SECRET', 'test-secret-123');
      const request = makeRequest({ authorization: 'test-secret-123' });
      expect(verifyCronSecret(request, LOG_PREFIX)).toBe(false);
    });

    it('returns true when Authorization header matches CRON_SECRET', () => {
      vi.stubEnv('CRON_SECRET', 'test-secret-123');
      const request = makeRequest({ authorization: 'Bearer test-secret-123' });
      expect(verifyCronSecret(request, LOG_PREFIX)).toBe(true);
    });

    it('is case-sensitive for the secret', () => {
      vi.stubEnv('CRON_SECRET', 'Test-Secret-123');
      const request = makeRequest({ authorization: 'Bearer test-secret-123' });
      expect(verifyCronSecret(request, LOG_PREFIX)).toBe(false);
    });
  });

  describe('development behavior', () => {
    it('allows requests when CRON_SECRET is not set in development', () => {
      delete process.env.CRON_SECRET;
      vi.stubEnv('NODE_ENV', 'development');
      const request = makeRequest();
      expect(verifyCronSecret(request, LOG_PREFIX)).toBe(true);
    });

    it('still validates when CRON_SECRET is set in development', () => {
      vi.stubEnv('NODE_ENV', 'development');
      vi.stubEnv('CRON_SECRET', 'dev-secret');
      const request = makeRequest({ authorization: 'Bearer wrong' });
      expect(verifyCronSecret(request, LOG_PREFIX)).toBe(false);
    });

    it('passes validation with correct secret in development', () => {
      vi.stubEnv('NODE_ENV', 'development');
      vi.stubEnv('CRON_SECRET', 'dev-secret');
      const request = makeRequest({ authorization: 'Bearer dev-secret' });
      expect(verifyCronSecret(request, LOG_PREFIX)).toBe(true);
    });
  });
});
