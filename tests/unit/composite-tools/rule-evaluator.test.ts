/**
 * Rule Evaluator Unit Tests
 *
 * Tests for the routing rule evaluation system in composite tools.
 * Covers all condition types, case sensitivity, field extraction, and priority handling.
 */

import { describe, it, expect } from 'vitest';
import {
  evaluateCondition,
  evaluateRule,
  evaluateRulesInOrder,
  evaluateAllRules,
  extractFieldValue,
  type RoutingParams,
} from '@/lib/modules/composite-tools/routing/rule-evaluator';
import type { RoutingConditionType } from '@/lib/modules/composite-tools/composite-tool.schemas';
import type { RoutingRule } from '@prisma/client';

// =============================================================================
// Test Fixtures
// =============================================================================

function createMockRule(overrides: Partial<RoutingRule> = {}): RoutingRule {
  return {
    id: 'rule-1',
    compositeToolId: 'tool-1',
    operationId: 'operation-1',
    conditionType: 'contains',
    conditionField: 'url',
    conditionValue: 'example.com',
    caseSensitive: false,
    priority: 0,
    createdAt: new Date(),
    ...overrides,
  };
}

// =============================================================================
// extractFieldValue Tests
// =============================================================================

describe('extractFieldValue', () => {
  it('should extract top-level string field', () => {
    const params: RoutingParams = { url: 'https://example.com' };
    expect(extractFieldValue(params, 'url')).toBe('https://example.com');
  });

  it('should extract nested field using dot notation', () => {
    const params: RoutingParams = { data: { url: 'https://nested.com' } };
    expect(extractFieldValue(params, 'data.url')).toBe('https://nested.com');
  });

  it('should extract deeply nested field', () => {
    const params: RoutingParams = { a: { b: { c: { d: 'deep-value' } } } };
    expect(extractFieldValue(params, 'a.b.c.d')).toBe('deep-value');
  });

  it('should return null for missing field', () => {
    const params: RoutingParams = { url: 'https://example.com' };
    expect(extractFieldValue(params, 'missing')).toBeNull();
  });

  it('should return null for null value', () => {
    const params: RoutingParams = { url: null };
    expect(extractFieldValue(params, 'url')).toBeNull();
  });

  it('should return null for undefined value', () => {
    const params: RoutingParams = { url: undefined };
    expect(extractFieldValue(params, 'url')).toBeNull();
  });

  it('should return null for missing nested field', () => {
    const params: RoutingParams = { data: { other: 'value' } };
    expect(extractFieldValue(params, 'data.url')).toBeNull();
  });

  it('should convert number to string', () => {
    const params: RoutingParams = { count: 42 };
    expect(extractFieldValue(params, 'count')).toBe('42');
  });

  it('should convert boolean to string', () => {
    const params: RoutingParams = { active: true };
    expect(extractFieldValue(params, 'active')).toBe('true');
  });

  it('should stringify objects', () => {
    const params: RoutingParams = { meta: { key: 'value' } };
    expect(extractFieldValue(params, 'meta')).toBe('{"key":"value"}');
  });

  it('should stringify arrays', () => {
    const params: RoutingParams = { tags: ['a', 'b', 'c'] };
    expect(extractFieldValue(params, 'tags')).toBe('["a","b","c"]');
  });
});

// =============================================================================
// evaluateCondition Tests
// =============================================================================

describe('evaluateCondition', () => {
  describe('contains', () => {
    it('should match when value contains substring', () => {
      expect(
        evaluateCondition('contains', 'https://linkedin.com/in/user', 'linkedin.com', false)
      ).toBe(true);
    });

    it('should not match when value does not contain substring', () => {
      expect(evaluateCondition('contains', 'https://twitter.com/user', 'linkedin.com', false)).toBe(
        false
      );
    });

    it('should be case-insensitive by default', () => {
      expect(
        evaluateCondition('contains', 'https://LINKEDIN.COM/user', 'linkedin.com', false)
      ).toBe(true);
    });

    it('should be case-sensitive when specified', () => {
      expect(evaluateCondition('contains', 'https://LINKEDIN.COM/user', 'linkedin.com', true)).toBe(
        false
      );
    });

    it('should match case-sensitive when cases match', () => {
      expect(evaluateCondition('contains', 'https://linkedin.com/user', 'linkedin.com', true)).toBe(
        true
      );
    });
  });

  describe('equals', () => {
    it('should match when values are exactly equal', () => {
      expect(evaluateCondition('equals', 'reddit.com', 'reddit.com', false)).toBe(true);
    });

    it('should not match when values differ', () => {
      expect(evaluateCondition('equals', 'reddit.com', 'twitter.com', false)).toBe(false);
    });

    it('should be case-insensitive by default', () => {
      expect(evaluateCondition('equals', 'REDDIT.COM', 'reddit.com', false)).toBe(true);
    });

    it('should be case-sensitive when specified', () => {
      expect(evaluateCondition('equals', 'REDDIT.COM', 'reddit.com', true)).toBe(false);
    });

    it('should not match partial values', () => {
      expect(evaluateCondition('equals', 'https://reddit.com', 'reddit.com', false)).toBe(false);
    });
  });

  describe('starts_with', () => {
    it('should match when value starts with prefix', () => {
      expect(
        evaluateCondition('starts_with', 'https://github.com/repo', 'https://github.com', false)
      ).toBe(true);
    });

    it('should not match when value does not start with prefix', () => {
      expect(
        evaluateCondition('starts_with', 'https://gitlab.com/repo', 'https://github.com', false)
      ).toBe(false);
    });

    it('should be case-insensitive by default', () => {
      expect(
        evaluateCondition('starts_with', 'HTTPS://GITHUB.COM/repo', 'https://github.com', false)
      ).toBe(true);
    });

    it('should be case-sensitive when specified', () => {
      expect(
        evaluateCondition('starts_with', 'HTTPS://GITHUB.COM/repo', 'https://github.com', true)
      ).toBe(false);
    });
  });

  describe('ends_with', () => {
    it('should match when value ends with suffix', () => {
      expect(evaluateCondition('ends_with', 'document.pdf', '.pdf', false)).toBe(true);
    });

    it('should not match when value does not end with suffix', () => {
      expect(evaluateCondition('ends_with', 'document.doc', '.pdf', false)).toBe(false);
    });

    it('should be case-insensitive by default', () => {
      expect(evaluateCondition('ends_with', 'document.PDF', '.pdf', false)).toBe(true);
    });

    it('should be case-sensitive when specified', () => {
      expect(evaluateCondition('ends_with', 'document.PDF', '.pdf', true)).toBe(false);
    });
  });

  describe('matches (regex)', () => {
    it('should match valid regex pattern', () => {
      expect(
        evaluateCondition(
          'matches',
          'https://www.yelp.com/biz/restaurant',
          '^https://www\\.yelp\\.com/',
          false
        )
      ).toBe(true);
    });

    it('should not match when regex does not match', () => {
      expect(
        evaluateCondition('matches', 'https://google.com', '^https://www\\.yelp\\.com/', false)
      ).toBe(false);
    });

    it('should handle complex patterns', () => {
      expect(
        evaluateCondition(
          'matches',
          'user@example.com',
          '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$',
          false
        )
      ).toBe(true);
    });

    it('should return false for invalid regex', () => {
      expect(evaluateCondition('matches', 'test', '[invalid(regex', false)).toBe(false);
    });

    it('should be case-insensitive by default', () => {
      expect(evaluateCondition('matches', 'HTTPS://YELP.COM', 'yelp\\.com', false)).toBe(true);
    });

    it('should be case-sensitive when specified', () => {
      expect(evaluateCondition('matches', 'HTTPS://YELP.COM', 'yelp\\.com', true)).toBe(false);
    });
  });

  describe('unknown condition type', () => {
    it('should return false for unknown condition type', () => {
      expect(
        evaluateCondition('unknown_type' as RoutingConditionType, 'value', 'test', false)
      ).toBe(false);
    });
  });
});

// =============================================================================
// evaluateRule Tests
// =============================================================================

describe('evaluateRule', () => {
  it('should return matched=true when condition matches', () => {
    const rule = createMockRule({
      conditionType: 'contains',
      conditionField: 'url',
      conditionValue: 'linkedin.com',
    });
    const params: RoutingParams = { url: 'https://linkedin.com/in/user' };

    const result = evaluateRule(rule, params);

    expect(result.matched).toBe(true);
    expect(result.rule).toBe(rule);
    expect(result.reason).toContain('linkedin.com');
  });

  it('should return matched=false when condition does not match', () => {
    const rule = createMockRule({
      conditionType: 'contains',
      conditionField: 'url',
      conditionValue: 'linkedin.com',
    });
    const params: RoutingParams = { url: 'https://twitter.com/user' };

    const result = evaluateRule(rule, params);

    expect(result.matched).toBe(false);
    expect(result.reason).toContain('does not');
  });

  it('should return matched=false when field is missing', () => {
    const rule = createMockRule({
      conditionField: 'url',
    });
    const params: RoutingParams = { other: 'value' };

    const result = evaluateRule(rule, params);

    expect(result.matched).toBe(false);
    expect(result.reason).toContain('not found');
  });

  it('should handle nested field extraction', () => {
    const rule = createMockRule({
      conditionType: 'equals',
      conditionField: 'data.domain',
      conditionValue: 'reddit.com',
    });
    const params: RoutingParams = { data: { domain: 'reddit.com' } };

    const result = evaluateRule(rule, params);

    expect(result.matched).toBe(true);
  });

  it('should respect case sensitivity setting', () => {
    const ruleCaseSensitive = createMockRule({
      conditionType: 'equals',
      conditionField: 'domain',
      conditionValue: 'Example.COM',
      caseSensitive: true,
    });
    const ruleCaseInsensitive = createMockRule({
      conditionType: 'equals',
      conditionField: 'domain',
      conditionValue: 'Example.COM',
      caseSensitive: false,
    });
    const params: RoutingParams = { domain: 'example.com' };

    expect(evaluateRule(ruleCaseSensitive, params).matched).toBe(false);
    expect(evaluateRule(ruleCaseInsensitive, params).matched).toBe(true);
  });
});

// =============================================================================
// evaluateRulesInOrder Tests
// =============================================================================

describe('evaluateRulesInOrder', () => {
  it('should return first matching rule', () => {
    const rules = [
      createMockRule({ id: 'rule-1', conditionValue: 'linkedin.com', priority: 0 }),
      createMockRule({ id: 'rule-2', conditionValue: 'twitter.com', priority: 1 }),
    ];
    const params: RoutingParams = { url: 'https://linkedin.com/in/user' };

    const result = evaluateRulesInOrder(rules, params);

    expect(result).not.toBeNull();
    expect(result?.rule.id).toBe('rule-1');
  });

  it('should return null when no rules match', () => {
    const rules = [
      createMockRule({ conditionValue: 'linkedin.com' }),
      createMockRule({ conditionValue: 'twitter.com' }),
    ];
    const params: RoutingParams = { url: 'https://github.com/repo' };

    const result = evaluateRulesInOrder(rules, params);

    expect(result).toBeNull();
  });

  it('should skip non-matching rules and return later match', () => {
    const rules = [
      createMockRule({ id: 'rule-1', conditionValue: 'linkedin.com', priority: 0 }),
      createMockRule({ id: 'rule-2', conditionValue: 'reddit.com', priority: 1 }),
    ];
    const params: RoutingParams = { url: 'https://reddit.com/r/programming' };

    const result = evaluateRulesInOrder(rules, params);

    expect(result).not.toBeNull();
    expect(result?.rule.id).toBe('rule-2');
  });

  it('should return empty list result for empty rules array', () => {
    const result = evaluateRulesInOrder([], { url: 'test' });
    expect(result).toBeNull();
  });

  it('should respect array order (priority)', () => {
    const rules = [
      createMockRule({ id: 'rule-generic', conditionValue: '.com', priority: 2 }),
      createMockRule({ id: 'rule-specific', conditionValue: 'linkedin.com', priority: 1 }),
    ];
    const params: RoutingParams = { url: 'https://linkedin.com/profile' };

    // Both rules would match, but the first one in order should win
    const result = evaluateRulesInOrder(rules, params);
    expect(result?.rule.id).toBe('rule-generic');
  });
});

// =============================================================================
// evaluateAllRules Tests
// =============================================================================

describe('evaluateAllRules', () => {
  it('should evaluate all rules regardless of matches', () => {
    const rules = [
      createMockRule({ id: 'rule-1', conditionValue: 'linkedin.com' }),
      createMockRule({ id: 'rule-2', conditionValue: 'twitter.com' }),
      createMockRule({ id: 'rule-3', conditionValue: 'github.com' }),
    ];
    const params: RoutingParams = { url: 'https://github.com/repo' };

    const results = evaluateAllRules(rules, params);

    expect(results).toHaveLength(3);
    expect(results[0].matched).toBe(false);
    expect(results[1].matched).toBe(false);
    expect(results[2].matched).toBe(true);
  });

  it('should return empty array for empty rules', () => {
    const results = evaluateAllRules([], { url: 'test' });
    expect(results).toEqual([]);
  });

  it('should include all rule evaluations with reasons', () => {
    const rules = [createMockRule({ id: 'rule-1', conditionValue: 'test' })];
    const params: RoutingParams = { url: 'https://test.com' };

    const results = evaluateAllRules(rules, params);

    expect(results[0].reason).toBeDefined();
    expect(results[0].rule.id).toBe('rule-1');
  });
});
