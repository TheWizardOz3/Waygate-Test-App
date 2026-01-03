/**
 * Template Types
 *
 * Type definitions for integration templates that support schema-driven APIs
 * like Supabase/PostgREST, Airtable, Notion, etc.
 */

import type { JSONSchema7 } from 'json-schema';

/**
 * Parameter definition for template actions
 */
export interface TemplateParameterDef {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  required: boolean;
  description?: string;
  default?: unknown;
  enum?: string[];
  /** For path parameters, this is the placeholder in the path template */
  placeholder?: string;
}

/**
 * A single action within a template
 */
export interface ActionTemplate {
  /** Unique identifier within the template */
  id: string;
  /** Human-readable name */
  name: string;
  /** Description of what this action does */
  description: string;
  /** HTTP method */
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /**
   * Path template with placeholders
   * e.g., "/rest/v1/{resource}" or "/{resource}/{id}"
   */
  pathTemplate: string;
  /** Parameters that go in the URL path */
  pathParameters: TemplateParameterDef[];
  /** Parameters that go in the query string */
  queryParameters?: TemplateParameterDef[];
  /** Request body definition */
  requestBody?: {
    contentType: string;
    schema: JSONSchema7;
    required: boolean;
  };
  /** Expected response schema */
  responseSchema?: JSONSchema7;
  /** Default headers to include */
  headers?: Record<string, string>;
  /** Tags for categorization */
  tags?: string[];
}

/**
 * Authentication type supported by integrations
 */
export type AuthType = 'none' | 'oauth2' | 'api_key' | 'basic' | 'bearer' | 'custom_header';

/**
 * Full integration template definition
 */
export interface IntegrationTemplate {
  /** Unique template identifier */
  id: string;
  /** Human-readable template name */
  name: string;
  /** Description of what this template is for */
  description: string;
  /** Lucide icon name for UI */
  icon: string;
  /** Suggested authentication type */
  suggestedAuthType: AuthType;
  /** Suggested auth configuration hints */
  suggestedAuthConfig?: {
    placement?: 'header' | 'query';
    paramName?: string;
    headerPrefix?: string;
  };
  /** Placeholder for base URL input */
  baseUrlPlaceholder: string;
  /** Help text for base URL */
  baseUrlHint: string;
  /** Actions included in this template */
  actions: ActionTemplate[];
  /** Example base URLs */
  exampleBaseUrls?: string[];
  /** Documentation URL for reference */
  documentationUrl?: string;
}

/**
 * Template registry entry with metadata
 */
export interface TemplateRegistryEntry {
  template: IntegrationTemplate;
  /** Category for grouping */
  category: 'database' | 'cms' | 'generic' | 'custom';
  /** Whether this is a featured/popular template */
  featured?: boolean;
  /** Sort order */
  order: number;
}
