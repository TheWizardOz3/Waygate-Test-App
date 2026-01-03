/**
 * Template Generator
 *
 * Transforms integration templates into action definitions that can be
 * saved to the database and used like AI-generated actions.
 */

import type { JSONSchema7 } from 'json-schema';
import type { IntegrationTemplate, ActionTemplate, TemplateParameterDef } from './types';
import type { ParsedApiDoc } from '../scrape-job.schemas';
import { getTemplateById } from './index';

/**
 * Options for generating actions from a template
 */
export interface GenerateFromTemplateOptions {
  /** Template ID to use */
  templateId: string;
  /** Base URL for the API */
  baseUrl: string;
  /** Integration name (defaults to template name) */
  integrationName?: string;
  /** Integration slug (generated from name if not provided) */
  integrationSlug?: string;
  /** Auth type override */
  authType?: 'none' | 'oauth2' | 'api_key' | 'basic' | 'bearer' | 'custom_header';
}

/**
 * Result of template generation
 */
export interface GenerateFromTemplateResult {
  success: true;
  data: ParsedApiDoc;
  template: IntegrationTemplate;
}

/**
 * Error result from template generation
 */
export interface GenerateFromTemplateError {
  success: false;
  error: string;
}

/**
 * Generate a ParsedApiDoc from a template
 *
 * @param options - Generation options
 * @returns ParsedApiDoc compatible with scrape job results
 */
export function generateFromTemplate(
  options: GenerateFromTemplateOptions
): GenerateFromTemplateResult | GenerateFromTemplateError {
  const { templateId, baseUrl, integrationName, integrationSlug, authType } = options;

  // Get the template
  const template = getTemplateById(templateId);
  if (!template) {
    return {
      success: false,
      error: `Template not found: ${templateId}`,
    };
  }

  // Validate base URL
  if (!baseUrl || !baseUrl.startsWith('http')) {
    return {
      success: false,
      error: 'Invalid base URL. Must start with http:// or https://',
    };
  }

  // Normalize base URL (remove trailing slash)
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, '');

  // Generate slug from name
  const name = integrationName || template.name;
  const slug =
    integrationSlug ||
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

  // Convert template actions to endpoints
  const endpoints = template.actions.map((action) =>
    templateActionToEndpoint(action, slug, template.id)
  );

  // Build auth methods from template suggestion
  const effectiveAuthType = authType || template.suggestedAuthType;
  const authMethods: ParsedApiDoc['authMethods'] = [];

  if (effectiveAuthType !== 'none') {
    authMethods.push({
      type: effectiveAuthType as Exclude<typeof effectiveAuthType, 'none'>,
      config: template.suggestedAuthConfig || {},
      location: template.suggestedAuthConfig?.placement || 'header',
      paramName: template.suggestedAuthConfig?.paramName,
    });
  }

  // Build the ParsedApiDoc
  const parsedDoc: ParsedApiDoc = {
    name,
    description: template.description,
    baseUrl: normalizedBaseUrl,
    authMethods,
    endpoints,
    metadata: {
      scrapedAt: new Date().toISOString(),
      sourceUrls: [template.documentationUrl || baseUrl],
      aiConfidence: 1.0, // Templates are 100% confident
      warnings: [],
      detectedTemplate: {
        templateId: template.id,
        templateName: template.name,
        confidence: 1.0, // Manual template selection = 100% confidence
        signals: ['manually-selected'],
      },
    },
  };

  return {
    success: true,
    data: parsedDoc,
    template,
  };
}

/**
 * Convert a template action to an endpoint definition
 */
function templateActionToEndpoint(
  action: ActionTemplate,
  integrationSlug: string,
  templateId: string
): ParsedApiDoc['endpoints'][0] {
  // Generate unique action slug
  const actionSlug = `${action.id}`;

  // Convert path parameters
  const pathParameters = action.pathParameters.map((param) => ({
    name: param.name,
    type: param.type,
    required: param.required,
    description: param.description,
  }));

  // Convert query parameters
  const queryParameters = action.queryParameters?.map((param) => ({
    name: param.name,
    type: param.type,
    required: param.required,
    description: param.description,
  }));

  // Build request body schema
  let requestBody: ParsedApiDoc['endpoints'][0]['requestBody'] | undefined;
  if (action.requestBody) {
    requestBody = {
      contentType: action.requestBody.contentType,
      schema: action.requestBody.schema as Record<string, unknown>,
      required: action.requestBody.required,
    };
  }

  // Build response schema
  const responses: Record<string, { description: string; schema?: Record<string, unknown> }> = {
    '200': {
      description: 'Successful response',
      schema: action.responseSchema as Record<string, unknown> | undefined,
    },
  };

  return {
    name: action.name,
    slug: actionSlug,
    description: action.description,
    method: action.method,
    path: action.pathTemplate,
    pathParameters,
    queryParameters,
    requestBody,
    responses,
    // Include template metadata in tags for identification
    tags: [
      ...(action.tags || []),
      `template:${templateId}`,
      ...(action.headers ? Object.entries(action.headers).map(([k, v]) => `header:${k}:${v}`) : []),
    ],
    deprecated: false,
  };
}

/**
 * Build JSON Schema from template parameters
 */
export function buildInputSchemaFromTemplate(action: ActionTemplate): JSONSchema7 {
  const properties: Record<string, JSONSchema7> = {};
  const required: string[] = [];

  // Add path parameters
  for (const param of action.pathParameters) {
    properties[param.name] = parameterToJsonSchema(param);
    if (param.required) {
      required.push(param.name);
    }
  }

  // Add query parameters
  for (const param of action.queryParameters || []) {
    properties[param.name] = parameterToJsonSchema(param);
    if (param.required) {
      required.push(param.name);
    }
  }

  // Add request body if present
  if (action.requestBody) {
    properties['body'] = {
      ...action.requestBody.schema,
      description: 'Request body',
    };
    if (action.requestBody.required) {
      required.push('body');
    }
  }

  return {
    type: 'object',
    properties,
    required: required.length > 0 ? required : undefined,
    additionalProperties: false,
  };
}

/**
 * Convert a parameter definition to JSON Schema
 */
function parameterToJsonSchema(param: TemplateParameterDef): JSONSchema7 {
  const schema: JSONSchema7 = {
    description: param.description,
  };

  switch (param.type) {
    case 'string':
      schema.type = 'string';
      if (param.enum) {
        schema.enum = param.enum;
      }
      break;
    case 'number':
      schema.type = 'number';
      break;
    case 'boolean':
      schema.type = 'boolean';
      break;
    case 'object':
      schema.type = 'object';
      schema.additionalProperties = true;
      break;
    case 'array':
      schema.type = 'array';
      schema.items = { type: 'string' };
      break;
  }

  if (param.default !== undefined) {
    schema.default = param.default as JSONSchema7['default'];
  }

  return schema;
}
