/**
 * Generic REST CRUD Template
 *
 * Template for standard REST APIs with resource-based endpoints.
 * Works with most RESTful APIs that follow conventional patterns.
 */

import type { IntegrationTemplate } from './types';

export const restCrudTemplate: IntegrationTemplate = {
  id: 'rest-crud',
  name: 'Generic REST API',
  description:
    'For standard REST APIs with resource-based endpoints (GET /resource, POST /resource, etc.). Works with most RESTful APIs.',
  icon: 'Globe',
  suggestedAuthType: 'bearer',
  suggestedAuthConfig: {
    placement: 'header',
    paramName: 'Authorization',
    headerPrefix: 'Bearer ',
  },
  baseUrlPlaceholder: 'https://api.example.com/v1',
  baseUrlHint: 'Enter the base URL for the API, including version prefix if applicable.',
  exampleBaseUrls: ['https://api.example.com/v1', 'https://app.example.com/api'],
  actions: [
    {
      id: 'list-resources',
      name: 'List Resources',
      description: 'Retrieve a list of resources with optional pagination.',
      method: 'GET',
      pathTemplate: '/{resource}',
      pathParameters: [
        {
          name: 'resource',
          type: 'string',
          required: true,
          description: 'Resource name/path (e.g., "users", "products", "orders")',
          placeholder: 'resource',
        },
      ],
      queryParameters: [
        {
          name: 'limit',
          type: 'number',
          required: false,
          description: 'Maximum number of items to return',
          default: 20,
        },
        {
          name: 'offset',
          type: 'number',
          required: false,
          description: 'Number of items to skip (for pagination)',
          default: 0,
        },
        {
          name: 'page',
          type: 'number',
          required: false,
          description: 'Page number (alternative to offset)',
        },
        {
          name: 'sort',
          type: 'string',
          required: false,
          description: 'Sort field and direction (e.g., "created_at:desc")',
        },
      ],
      responseSchema: {
        type: 'object',
        properties: {
          data: {
            type: 'array',
            items: { type: 'object' },
          },
          total: { type: 'number' },
          page: { type: 'number' },
          limit: { type: 'number' },
        },
      },
      headers: {
        Accept: 'application/json',
      },
      tags: ['read', 'list'],
    },
    {
      id: 'get-resource',
      name: 'Get Resource',
      description: 'Retrieve a single resource by its ID.',
      method: 'GET',
      pathTemplate: '/{resource}/{id}',
      pathParameters: [
        {
          name: 'resource',
          type: 'string',
          required: true,
          description: 'Resource name/path',
          placeholder: 'resource',
        },
        {
          name: 'id',
          type: 'string',
          required: true,
          description: 'Resource ID',
          placeholder: 'id',
        },
      ],
      responseSchema: {
        type: 'object',
        description: 'The requested resource',
      },
      headers: {
        Accept: 'application/json',
      },
      tags: ['read'],
    },
    {
      id: 'create-resource',
      name: 'Create Resource',
      description: 'Create a new resource.',
      method: 'POST',
      pathTemplate: '/{resource}',
      pathParameters: [
        {
          name: 'resource',
          type: 'string',
          required: true,
          description: 'Resource name/path',
          placeholder: 'resource',
        },
      ],
      requestBody: {
        contentType: 'application/json',
        required: true,
        schema: {
          type: 'object',
          description: 'Resource data to create',
          additionalProperties: true,
        },
      },
      responseSchema: {
        type: 'object',
        description: 'The created resource',
      },
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      tags: ['write', 'create'],
    },
    {
      id: 'update-resource',
      name: 'Update Resource (Full)',
      description: 'Fully replace a resource with new data.',
      method: 'PUT',
      pathTemplate: '/{resource}/{id}',
      pathParameters: [
        {
          name: 'resource',
          type: 'string',
          required: true,
          description: 'Resource name/path',
          placeholder: 'resource',
        },
        {
          name: 'id',
          type: 'string',
          required: true,
          description: 'Resource ID',
          placeholder: 'id',
        },
      ],
      requestBody: {
        contentType: 'application/json',
        required: true,
        schema: {
          type: 'object',
          description: 'Complete resource data',
          additionalProperties: true,
        },
      },
      responseSchema: {
        type: 'object',
        description: 'The updated resource',
      },
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      tags: ['write', 'update'],
    },
    {
      id: 'patch-resource',
      name: 'Update Resource (Partial)',
      description: 'Partially update a resource with only the specified fields.',
      method: 'PATCH',
      pathTemplate: '/{resource}/{id}',
      pathParameters: [
        {
          name: 'resource',
          type: 'string',
          required: true,
          description: 'Resource name/path',
          placeholder: 'resource',
        },
        {
          name: 'id',
          type: 'string',
          required: true,
          description: 'Resource ID',
          placeholder: 'id',
        },
      ],
      requestBody: {
        contentType: 'application/json',
        required: true,
        schema: {
          type: 'object',
          description: 'Fields to update',
          additionalProperties: true,
        },
      },
      responseSchema: {
        type: 'object',
        description: 'The updated resource',
      },
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      tags: ['write', 'update'],
    },
    {
      id: 'delete-resource',
      name: 'Delete Resource',
      description: 'Delete a resource by its ID.',
      method: 'DELETE',
      pathTemplate: '/{resource}/{id}',
      pathParameters: [
        {
          name: 'resource',
          type: 'string',
          required: true,
          description: 'Resource name/path',
          placeholder: 'resource',
        },
        {
          name: 'id',
          type: 'string',
          required: true,
          description: 'Resource ID',
          placeholder: 'id',
        },
      ],
      responseSchema: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          message: { type: 'string' },
        },
      },
      headers: {
        Accept: 'application/json',
      },
      tags: ['write', 'delete'],
    },
  ],
};
