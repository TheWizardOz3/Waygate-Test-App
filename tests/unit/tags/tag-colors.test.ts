/**
 * Tag Color Utility Tests
 *
 * Tests for the hash-based tag color generation system.
 */

import { describe, it, expect } from 'vitest';
import { getTagColor, getTagClasses } from '@/lib/utils/tag-colors';

describe('Tag Color Utility', () => {
  describe('getTagColor', () => {
    it('should return a valid color object', () => {
      const color = getTagColor('payment');

      expect(color).toHaveProperty('bg');
      expect(color).toHaveProperty('text');
      expect(color).toHaveProperty('border');
      expect(color).toHaveProperty('darkBg');
      expect(color).toHaveProperty('darkText');
      expect(color).toHaveProperty('darkBorder');
    });

    it('should return consistent colors for the same tag', () => {
      const color1 = getTagColor('communication');
      const color2 = getTagColor('communication');
      const color3 = getTagColor('communication');

      expect(color1).toEqual(color2);
      expect(color2).toEqual(color3);
    });

    it('should return consistent colors regardless of case', () => {
      const colorLower = getTagColor('payment');
      const colorUpper = getTagColor('PAYMENT');
      const colorMixed = getTagColor('Payment');

      expect(colorLower).toEqual(colorUpper);
      expect(colorUpper).toEqual(colorMixed);
    });

    it('should return different colors for different tags', () => {
      const tags = ['payment', 'communication', 'analytics', 'crm', 'storage'];
      const colors = tags.map((tag) => getTagColor(tag));

      // Not all colors should be the same
      const uniqueColors = new Set(colors.map((c) => c.bg));
      expect(uniqueColors.size).toBeGreaterThan(1);
    });

    it('should handle empty string', () => {
      const color = getTagColor('');

      expect(color).toHaveProperty('bg');
      expect(color).toHaveProperty('text');
    });

    it('should handle special characters', () => {
      const color = getTagColor('my-tag-123');

      expect(color).toHaveProperty('bg');
      expect(color).toHaveProperty('text');
    });

    it('should return Tailwind class names', () => {
      const color = getTagColor('test');

      expect(color.bg).toMatch(/^bg-\w+-\d+$/);
      expect(color.text).toMatch(/^text-\w+-\d+$/);
      expect(color.border).toMatch(/^border-\w+-\d+$/);
      expect(color.darkBg).toMatch(/^dark:bg-\w+-\d+\/\d+$/);
      expect(color.darkText).toMatch(/^dark:text-\w+-\d+$/);
      expect(color.darkBorder).toMatch(/^dark:border-\w+-\d+$/);
    });
  });

  describe('getTagClasses', () => {
    it('should return a string of space-separated classes', () => {
      const classes = getTagClasses('payment');

      expect(typeof classes).toBe('string');
      expect(classes.split(' ').length).toBe(6); // 6 class names
    });

    it('should include all color properties', () => {
      const classes = getTagClasses('test');

      expect(classes).toContain('bg-');
      expect(classes).toContain('text-');
      expect(classes).toContain('border-');
      expect(classes).toContain('dark:bg-');
      expect(classes).toContain('dark:text-');
      expect(classes).toContain('dark:border-');
    });

    it('should return consistent classes for the same tag', () => {
      const classes1 = getTagClasses('api');
      const classes2 = getTagClasses('api');

      expect(classes1).toBe(classes2);
    });
  });

  describe('Color Distribution', () => {
    it('should distribute colors across multiple tags', () => {
      // Test with 50 different tags to verify reasonable distribution
      const tags = Array.from({ length: 50 }, (_, i) => `tag-${i}`);
      const colorBgs = tags.map((tag) => getTagColor(tag).bg);

      // Count unique colors
      const uniqueColors = new Set(colorBgs);

      // With 10 possible colors and 50 tags, we should see at least 5 different colors
      expect(uniqueColors.size).toBeGreaterThanOrEqual(5);
    });
  });
});
