/**
 * Action Validation
 *
 * Client-side validation functions for action configuration.
 */

import { z } from 'zod';
import {
  HttpMethodSchema,
  JsonSchemaSchema,
  TagSchema,
  ActionMetadataSchema,
} from './action.schemas';
import { ValidationConfigSchema } from '../execution/validation';

// =============================================================================
// Validation Schemas
// =============================================================================

/**
 * Schema for validating action editor form data
 */
export const ActionEditorSchema = z.object({
  name: z
    .string()
    .min(1, 'Name is required')
    .max(255, 'Name must be 255 characters or less')
    .regex(
      /^[a-zA-Z][a-zA-Z0-9\s._-]*$/,
      'Name must start with a letter and contain only letters, numbers, spaces, dots, underscores, and hyphens'
    ),
  slug: z
    .string()
    .max(100, 'Slug must be 100 characters or less')
    .regex(/^[a-z0-9-]*$/, 'Slug must contain only lowercase letters, numbers, and hyphens')
    .optional(),
  description: z.string().max(2000, 'Description must be 2000 characters or less').optional(),
  httpMethod: HttpMethodSchema,
  endpointTemplate: z
    .string()
    .min(1, 'Endpoint is required')
    .regex(/^\//, 'Endpoint must start with /'),
  inputSchema: JsonSchemaSchema,
  outputSchema: JsonSchemaSchema,
  cacheable: z.boolean().default(false),
  cacheTtlSeconds: z
    .number()
    .int()
    .min(0, 'Cache TTL must be positive')
    .max(86400, 'Cache TTL must be 24 hours or less')
    .nullable()
    .optional(),
  tags: z.array(TagSchema).max(10, 'Maximum 10 tags allowed').default([]),
  retryConfig: z
    .object({
      maxRetries: z.number().int().min(0).max(10),
      retryableStatuses: z.array(z.number().int().min(100).max(599)),
    })
    .nullable()
    .optional(),
  validationConfig: ValidationConfigSchema.nullable().optional(),
  metadata: ActionMetadataSchema.optional(),
  // AI Tool Export fields (LLM-generated descriptions)
  toolDescription: z.string().max(2000).nullable().optional(),
  toolSuccessTemplate: z.string().max(1000).nullable().optional(),
  toolErrorTemplate: z.string().max(1000).nullable().optional(),
});

export type ActionEditorData = z.input<typeof ActionEditorSchema>;

// =============================================================================
// Validation Functions
// =============================================================================

export interface ValidationError {
  field: string;
  message: string;
}

/**
 * Validate action form data and return errors
 */
export function validateActionForm(data: unknown): ValidationError[] {
  const result = ActionEditorSchema.safeParse(data);

  if (result.success) {
    return [];
  }

  return result.error.issues.map((issue) => ({
    field: issue.path.join('.'),
    message: issue.message,
  }));
}

/**
 * Validate endpoint template syntax
 */
export function validateEndpointTemplate(template: string): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!template.startsWith('/')) {
    errors.push({
      field: 'endpointTemplate',
      message: 'Endpoint must start with /',
    });
  }

  // Check for balanced braces
  const openBraces = (template.match(/{/g) || []).length;
  const closeBraces = (template.match(/}/g) || []).length;

  if (openBraces !== closeBraces) {
    errors.push({
      field: 'endpointTemplate',
      message: 'Endpoint has unbalanced braces',
    });
  }

  // Check for empty parameter names
  if (/{[^}]*}/.test(template)) {
    const params = template.match(/{([^}]*)}/g) || [];
    params.forEach((param) => {
      const name = param.slice(1, -1);
      if (!name || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
        errors.push({
          field: 'endpointTemplate',
          message: `Invalid parameter name: ${param}`,
        });
      }
    });
  }

  return errors;
}

/**
 * Extract path parameters from endpoint template
 */
export function extractPathParams(template: string): string[] {
  const matches = template.match(/{([^}]+)}/g) || [];
  return matches.map((m) => m.slice(1, -1));
}

/**
 * Validate that all path parameters are defined in input schema
 */
export function validatePathParamsInSchema(
  template: string,
  inputSchema: { properties?: Record<string, unknown> }
): ValidationError[] {
  const errors: ValidationError[] = [];
  const pathParams = extractPathParams(template);
  const schemaProps = inputSchema.properties || {};

  pathParams.forEach((param) => {
    if (!(param in schemaProps)) {
      errors.push({
        field: 'inputSchema',
        message: `Path parameter "${param}" is not defined in input schema`,
      });
    }
  });

  return errors;
}

/**
 * Generate a slug from a name
 */
export function generateSlugFromName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-')
    .slice(0, 100);
}
