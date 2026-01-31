import { describe, it, expect } from 'vitest';
import {
  parseVariableReferences,
  parsePath,
  isValidNamespace,
  validateVariableSyntax,
  containsVariableReferences,
  extractUniqueVariables,
  categorizeByNamespace,
  replaceVariableReferences,
  valueToString,
  validateTemplate,
  VALID_NAMESPACES,
} from '@/lib/modules/variables/variable.parser';
import type { ParsedVariableReference } from '@/lib/modules/variables/types';

describe('Variable Parser', () => {
  describe('parseVariableReferences', () => {
    it('should parse a single variable reference', () => {
      const refs = parseVariableReferences('/api/${var.api_version}/users');

      expect(refs).toHaveLength(1);
      expect(refs[0].fullMatch).toBe('${var.api_version}');
      expect(refs[0].path).toBe('var.api_version');
      expect(refs[0].namespace).toBe('var');
      expect(refs[0].key).toBe('api_version');
    });

    it('should parse multiple variable references', () => {
      const refs = parseVariableReferences('/api/${var.api_version}/users/${current_user.id}');

      expect(refs).toHaveLength(2);
      expect(refs[0].path).toBe('var.api_version');
      expect(refs[1].path).toBe('current_user.id');
    });

    it('should parse built-in namespaces', () => {
      const refs = parseVariableReferences('${current_user.id} ${connection.name} ${request.id}');

      expect(refs).toHaveLength(3);
      expect(refs[0].namespace).toBe('current_user');
      expect(refs[0].key).toBe('id');
      expect(refs[1].namespace).toBe('connection');
      expect(refs[1].key).toBe('name');
      expect(refs[2].namespace).toBe('request');
      expect(refs[2].key).toBe('id');
    });

    it('should return empty array for strings without variable references', () => {
      const refs = parseVariableReferences('/api/v2/users');

      expect(refs).toHaveLength(0);
    });

    it('should capture correct start and end indices', () => {
      const template = 'Hello ${var.name}!';
      const refs = parseVariableReferences(template);

      expect(refs).toHaveLength(1);
      expect(refs[0].startIndex).toBe(6);
      expect(refs[0].endIndex).toBe(17);
      expect(template.slice(refs[0].startIndex, refs[0].endIndex)).toBe('${var.name}');
    });

    it('should parse variables with underscores', () => {
      const refs = parseVariableReferences('${var.my_api_key}');

      expect(refs).toHaveLength(1);
      expect(refs[0].key).toBe('my_api_key');
    });

    it('should parse variables with numbers', () => {
      const refs = parseVariableReferences('${var.api_v2}');

      expect(refs).toHaveLength(1);
      expect(refs[0].key).toBe('api_v2');
    });

    it('should handle adjacent variables', () => {
      const refs = parseVariableReferences('${var.a}${var.b}');

      expect(refs).toHaveLength(2);
      expect(refs[0].key).toBe('a');
      expect(refs[1].key).toBe('b');
    });

    it('should handle duplicate variables', () => {
      const refs = parseVariableReferences('${var.name} and ${var.name}');

      expect(refs).toHaveLength(2);
      expect(refs[0].path).toBe('var.name');
      expect(refs[1].path).toBe('var.name');
    });
  });

  describe('parsePath', () => {
    it('should parse var namespace', () => {
      const result = parsePath('var.api_version');

      expect(result.namespace).toBe('var');
      expect(result.key).toBe('api_version');
    });

    it('should parse current_user namespace', () => {
      const result = parsePath('current_user.id');

      expect(result.namespace).toBe('current_user');
      expect(result.key).toBe('id');
    });

    it('should parse connection namespace', () => {
      const result = parsePath('connection.workspaceId');

      expect(result.namespace).toBe('connection');
      expect(result.key).toBe('workspaceId');
    });

    it('should parse request namespace', () => {
      const result = parsePath('request.timestamp');

      expect(result.namespace).toBe('request');
      expect(result.key).toBe('timestamp');
    });

    it('should treat single identifier as var namespace', () => {
      const result = parsePath('my_variable');

      expect(result.namespace).toBe('var');
      expect(result.key).toBe('my_variable');
    });

    it('should treat unknown namespace as var with full path as key', () => {
      const result = parsePath('unknown.key');

      expect(result.namespace).toBe('var');
      expect(result.key).toBe('unknown.key');
    });

    it('should handle nested keys', () => {
      const result = parsePath('var.config.nested.value');

      expect(result.namespace).toBe('var');
      expect(result.key).toBe('config.nested.value');
    });
  });

  describe('isValidNamespace', () => {
    it('should return true for valid namespaces', () => {
      expect(isValidNamespace({ namespace: 'var' } as ParsedVariableReference)).toBe(true);
      expect(isValidNamespace({ namespace: 'current_user' } as ParsedVariableReference)).toBe(true);
      expect(isValidNamespace({ namespace: 'connection' } as ParsedVariableReference)).toBe(true);
      expect(isValidNamespace({ namespace: 'request' } as ParsedVariableReference)).toBe(true);
    });

    it('should return false for invalid namespaces', () => {
      expect(isValidNamespace({ namespace: 'invalid' } as ParsedVariableReference)).toBe(false);
      expect(isValidNamespace({ namespace: 'user' } as ParsedVariableReference)).toBe(false);
    });
  });

  describe('validateVariableSyntax', () => {
    it('should return valid for correct syntax', () => {
      expect(validateVariableSyntax('var.api_version').valid).toBe(true);
      expect(validateVariableSyntax('current_user.id').valid).toBe(true);
      expect(validateVariableSyntax('connection.name').valid).toBe(true);
    });

    it('should return invalid for empty reference', () => {
      const result = validateVariableSyntax('');

      expect(result.valid).toBe(false);
      expect(result.error).toContain('empty');
    });

    it('should return invalid for bad identifier format', () => {
      const result = validateVariableSyntax('123invalid');

      expect(result.valid).toBe(false);
      expect(result.error).toContain('identifier');
    });

    it('should return invalid for special characters', () => {
      const result = validateVariableSyntax('var.my-key');

      expect(result.valid).toBe(false);
    });
  });

  describe('containsVariableReferences', () => {
    it('should return true when string contains references', () => {
      expect(containsVariableReferences('${var.name}')).toBe(true);
      expect(containsVariableReferences('prefix ${var.name} suffix')).toBe(true);
    });

    it('should return false when string has no references', () => {
      expect(containsVariableReferences('plain text')).toBe(false);
      expect(containsVariableReferences('')).toBe(false);
    });
  });

  describe('extractUniqueVariables', () => {
    it('should extract unique variable paths', () => {
      const uniques = extractUniqueVariables('${var.a} ${var.b} ${var.a}');

      expect(uniques.size).toBe(2);
      expect(uniques.has('var.a')).toBe(true);
      expect(uniques.has('var.b')).toBe(true);
    });

    it('should return empty set for no variables', () => {
      const uniques = extractUniqueVariables('no variables');

      expect(uniques.size).toBe(0);
    });
  });

  describe('categorizeByNamespace', () => {
    it('should categorize references by namespace', () => {
      const refs = parseVariableReferences(
        '${var.a} ${current_user.id} ${connection.name} ${var.b}'
      );
      const categorized = categorizeByNamespace(refs);

      expect(categorized.var).toHaveLength(2);
      expect(categorized.current_user).toHaveLength(1);
      expect(categorized.connection).toHaveLength(1);
      expect(categorized.request).toHaveLength(0);
    });
  });

  describe('replaceVariableReferences', () => {
    it('should replace variables with resolved values', () => {
      const result = replaceVariableReferences('/api/${var.api_version}/users/${current_user.id}', {
        'var.api_version': 'v2',
        'current_user.id': 'U123',
      });

      expect(result).toBe('/api/v2/users/U123');
    });

    it('should handle missing values with empty string by default', () => {
      const result = replaceVariableReferences('/api/${var.missing}/users', {});

      expect(result).toBe('/api//users');
    });

    it('should use custom missing value when provided', () => {
      const result = replaceVariableReferences(
        '/api/${var.missing}/users',
        {},
        { missingValue: 'DEFAULT' }
      );

      expect(result).toBe('/api/DEFAULT/users');
    });

    it('should keep original reference when keepMissing is true', () => {
      const result = replaceVariableReferences(
        '/api/${var.missing}/users',
        {},
        { keepMissing: true }
      );

      expect(result).toBe('/api/${var.missing}/users');
    });

    it('should handle various value types', () => {
      const result = replaceVariableReferences('${var.str} ${var.num} ${var.bool}', {
        'var.str': 'hello',
        'var.num': 42,
        'var.bool': true,
      });

      expect(result).toBe('hello 42 true');
    });

    it('should handle null and undefined values', () => {
      const result = replaceVariableReferences('${var.null} ${var.undefined}', {
        'var.null': null,
        'var.undefined': undefined,
      });

      expect(result).toBe(' ');
    });

    it('should JSON stringify object values', () => {
      const result = replaceVariableReferences('${var.obj}', {
        'var.obj': { key: 'value' },
      });

      expect(result).toBe('{"key":"value"}');
    });
  });

  describe('valueToString', () => {
    it('should convert string values', () => {
      expect(valueToString('hello')).toBe('hello');
    });

    it('should convert number values', () => {
      expect(valueToString(42)).toBe('42');
      expect(valueToString(3.14)).toBe('3.14');
    });

    it('should convert boolean values', () => {
      expect(valueToString(true)).toBe('true');
      expect(valueToString(false)).toBe('false');
    });

    it('should convert null and undefined to empty string', () => {
      expect(valueToString(null)).toBe('');
      expect(valueToString(undefined)).toBe('');
    });

    it('should JSON stringify objects', () => {
      expect(valueToString({ a: 1 })).toBe('{"a":1}');
      expect(valueToString([1, 2, 3])).toBe('[1,2,3]');
    });
  });

  describe('validateTemplate', () => {
    it('should return valid for template with no references', () => {
      const result = validateTemplate('no variables here');

      expect(result.valid).toBe(true);
      expect(result.references).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
    });

    it('should return valid for template with valid references', () => {
      const result = validateTemplate('${var.api_version} ${current_user.id}');

      expect(result.valid).toBe(true);
      expect(result.references).toHaveLength(2);
      expect(result.errors).toHaveLength(0);
    });

    it('should warn about unknown user-defined variables', () => {
      const knownVariables = new Set(['var.known']);
      const result = validateTemplate('${var.known} ${var.unknown}', knownVariables);

      expect(result.valid).toBe(true); // Warnings don't make it invalid
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0].reference.key).toBe('unknown');
    });

    it('should not warn about built-in variables', () => {
      const knownVariables = new Set<string>();
      const result = validateTemplate('${current_user.id}', knownVariables);

      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(0);
    });
  });

  describe('VALID_NAMESPACES', () => {
    it('should contain all expected namespaces', () => {
      expect(VALID_NAMESPACES).toContain('var');
      expect(VALID_NAMESPACES).toContain('current_user');
      expect(VALID_NAMESPACES).toContain('connection');
      expect(VALID_NAMESPACES).toContain('request');
      expect(VALID_NAMESPACES).toHaveLength(4);
    });
  });
});
