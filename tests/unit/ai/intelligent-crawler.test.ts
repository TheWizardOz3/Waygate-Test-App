/**
 * Intelligent Crawler Tests
 *
 * Tests for the LLM-guided intelligent crawling system.
 */

import { describe, it, expect } from 'vitest';
import { detectUrlCategory, preFilterUrls } from '@/lib/modules/ai/intelligent-crawler';

// =============================================================================
// URL Category Detection Tests
// =============================================================================

describe('detectUrlCategory', () => {
  describe('API endpoint detection', () => {
    const apiEndpointUrls = [
      'https://api.example.com/api/v1/users',
      'https://docs.slack.com/methods/chat.postMessage',
      'https://docs.example.com/endpoints/create-user',
      'https://api.stripe.com/reference/charges',
      'https://developer.github.com/rest/users',
      'https://docs.example.com/resources/messages',
    ];

    it.each(apiEndpointUrls)('should detect %s as api_endpoint', (url) => {
      const result = detectUrlCategory(url);
      expect(result.category).toBe('api_endpoint');
      expect(result.patternScore).toBeGreaterThanOrEqual(80);
      expect(result.shouldExclude).toBe(false);
    });
  });

  describe('API reference detection', () => {
    const apiReferenceUrls = [
      'https://api.example.com/api-reference',
      'https://docs.example.com/api-docs',
      'https://developer.example.com/reference',
      'https://docs.example.com/api',
      'https://api.example.com/rest-api',
    ];

    it.each(apiReferenceUrls)('should detect %s as api_reference', (url) => {
      const result = detectUrlCategory(url);
      expect(result.category).toBe('api_reference');
      expect(result.patternScore).toBeGreaterThanOrEqual(60);
      expect(result.shouldExclude).toBe(false);
    });
  });

  describe('Authentication detection', () => {
    const authUrls = [
      'https://docs.example.com/authentication',
      'https://docs.example.com/auth',
      'https://developer.example.com/oauth',
      'https://docs.example.com/api-keys',
      'https://docs.example.com/security',
      'https://docs.example.com/tokens',
    ];

    it.each(authUrls)('should detect %s as authentication', (url) => {
      const result = detectUrlCategory(url);
      expect(result.category).toBe('authentication');
      expect(result.patternScore).toBeGreaterThanOrEqual(90);
      expect(result.shouldExclude).toBe(false);
    });
  });

  describe('Getting started detection', () => {
    const gettingStartedUrls = [
      'https://docs.example.com/getting-started',
      'https://docs.example.com/quickstart',
      'https://docs.example.com/overview',
      'https://docs.example.com/introduction',
      'https://developer.example.com/basics',
    ];

    it.each(gettingStartedUrls)('should detect %s as getting_started', (url) => {
      const result = detectUrlCategory(url);
      expect(result.category).toBe('getting_started');
      expect(result.patternScore).toBeGreaterThanOrEqual(70);
      expect(result.shouldExclude).toBe(false);
    });
  });

  describe('Rate limits detection', () => {
    const rateLimitUrls = [
      'https://docs.example.com/rate-limits',
      'https://docs.example.com/limits',
      'https://developer.example.com/throttling',
      'https://docs.example.com/quotas',
    ];

    it.each(rateLimitUrls)('should detect %s as rate_limits', (url) => {
      const result = detectUrlCategory(url);
      expect(result.category).toBe('rate_limits');
      expect(result.patternScore).toBeGreaterThanOrEqual(80);
      expect(result.shouldExclude).toBe(false);
    });
  });

  describe('Exclusion patterns', () => {
    const excludeUrls = [
      'https://example.com/blog/new-feature',
      'https://example.com/pricing',
      'https://example.com/about',
      'https://example.com/careers',
      'https://example.com/login',
      'https://example.com/signup',
      'https://example.com/changelog',
      'https://example.com/docs/image.png',
      'https://example.com/download.pdf',
      'https://example.com/community',
    ];

    it.each(excludeUrls)('should exclude %s', (url) => {
      const result = detectUrlCategory(url);
      expect(result.shouldExclude).toBe(true);
    });
  });

  describe('Edge cases', () => {
    it('should handle invalid URLs gracefully', () => {
      const result = detectUrlCategory('not-a-valid-url');
      expect(result.shouldExclude).toBe(true);
      expect(result.patternScore).toBe(0);
    });

    it('should categorize generic docs paths under api_reference', () => {
      const result = detectUrlCategory('https://docs.example.com/api/users/list');
      expect(['api_endpoint', 'api_reference']).toContain(result.category);
      expect(result.shouldExclude).toBe(false);
    });
  });
});

// =============================================================================
// Pre-filter Tests
// =============================================================================

describe('preFilterUrls', () => {
  it('should filter out non-documentation URLs', () => {
    const urls = [
      'https://api.example.com/docs/auth',
      'https://api.example.com/blog/news',
      'https://api.example.com/reference/users',
      'https://api.example.com/pricing',
      'https://api.example.com/api/v1/messages',
    ];

    const result = preFilterUrls(urls, 'https://api.example.com/docs');

    expect(result.included).toContain('https://api.example.com/docs/auth');
    expect(result.included).toContain('https://api.example.com/reference/users');
    expect(result.included).toContain('https://api.example.com/api/v1/messages');
    expect(result.excluded).toContain('https://api.example.com/blog/news');
    expect(result.excluded).toContain('https://api.example.com/pricing');
  });

  it('should filter out URLs from different hosts', () => {
    const urls = [
      'https://api.example.com/docs/auth',
      'https://other-site.com/docs/auth',
      'https://api.example.com/reference/users',
    ];

    const result = preFilterUrls(urls, 'https://api.example.com/docs');

    expect(result.included).toContain('https://api.example.com/docs/auth');
    expect(result.included).toContain('https://api.example.com/reference/users');
    expect(result.excluded).toContain('https://other-site.com/docs/auth');
  });

  it('should handle empty URL arrays', () => {
    const result = preFilterUrls([], 'https://api.example.com/docs');
    expect(result.included).toHaveLength(0);
    expect(result.excluded).toHaveLength(0);
  });

  it('should handle invalid root URL gracefully', () => {
    const urls = ['https://api.example.com/docs/auth', 'https://api.example.com/reference/users'];

    const result = preFilterUrls(urls, 'not-a-valid-url');

    // Should return all URLs when root is invalid
    expect(result.included).toEqual(urls);
    expect(result.excluded).toHaveLength(0);
  });

  it('should filter out file extensions', () => {
    const urls = [
      'https://api.example.com/docs/auth',
      'https://api.example.com/images/logo.png',
      'https://api.example.com/downloads/sdk.zip',
      'https://api.example.com/pdfs/guide.pdf',
    ];

    const result = preFilterUrls(urls, 'https://api.example.com/docs');

    expect(result.included).toContain('https://api.example.com/docs/auth');
    expect(result.excluded).toContain('https://api.example.com/images/logo.png');
    expect(result.excluded).toContain('https://api.example.com/downloads/sdk.zip');
    expect(result.excluded).toContain('https://api.example.com/pdfs/guide.pdf');
  });
});

// =============================================================================
// URL Priority Selection Tests
// =============================================================================

describe('URL Selection Logic', () => {
  // These are integration-style tests that verify the selection logic
  // without actually calling the LLM

  it('should prioritize authentication URLs', () => {
    const authUrls = [
      'https://api.example.com/docs/authentication',
      'https://api.example.com/docs/oauth',
      'https://api.example.com/docs/api-keys',
    ];

    for (const url of authUrls) {
      const result = detectUrlCategory(url);
      expect(result.category).toBe('authentication');
      expect(result.patternScore).toBeGreaterThanOrEqual(95);
    }
  });

  it('should give high scores to API endpoint URLs', () => {
    const endpointUrls = [
      'https://api.example.com/api/v1/users',
      'https://docs.slack.com/methods/chat.postMessage',
    ];

    for (const url of endpointUrls) {
      const result = detectUrlCategory(url);
      expect(result.category).toBe('api_endpoint');
      expect(result.patternScore).toBeGreaterThanOrEqual(90);
    }
  });
});
