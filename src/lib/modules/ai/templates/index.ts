/**
 * Template Module
 *
 * Pre-built action templates for schema-driven APIs that can't be effectively scraped.
 * Supports PostgREST/Supabase, generic REST CRUD, and more.
 */

export * from './types';
export * from './postgrest';
export * from './rest-crud';
export * from './generator';
export * from './detector';

import type { IntegrationTemplate, TemplateRegistryEntry } from './types';
import { postgrestTemplate } from './postgrest';
import { restCrudTemplate } from './rest-crud';

/**
 * Template registry with all available templates
 */
export const templateRegistry: TemplateRegistryEntry[] = [
  {
    template: postgrestTemplate,
    category: 'database',
    featured: true,
    order: 1,
  },
  {
    template: restCrudTemplate,
    category: 'generic',
    featured: true,
    order: 2,
  },
];

/**
 * Get all available templates
 */
export function getTemplates(): IntegrationTemplate[] {
  return templateRegistry.sort((a, b) => a.order - b.order).map((entry) => entry.template);
}

/**
 * Get a template by ID
 */
export function getTemplateById(id: string): IntegrationTemplate | undefined {
  return templateRegistry.find((entry) => entry.template.id === id)?.template;
}

/**
 * Get featured templates for the wizard
 */
export function getFeaturedTemplates(): IntegrationTemplate[] {
  return templateRegistry
    .filter((entry) => entry.featured)
    .sort((a, b) => a.order - b.order)
    .map((entry) => entry.template);
}

/**
 * Get templates by category
 */
export function getTemplatesByCategory(
  category: TemplateRegistryEntry['category']
): IntegrationTemplate[] {
  return templateRegistry
    .filter((entry) => entry.category === category)
    .sort((a, b) => a.order - b.order)
    .map((entry) => entry.template);
}
