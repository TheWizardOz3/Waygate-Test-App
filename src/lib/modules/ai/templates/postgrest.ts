/**
 * PostgREST Template
 *
 * Template for APIs following the PostgREST convention, including:
 * - Supabase
 * - Any self-hosted PostgREST instance
 * - APIs that auto-generate REST endpoints from PostgreSQL tables
 */

import type { IntegrationTemplate } from './types';

export const postgrestTemplate: IntegrationTemplate = {
  id: 'postgrest',
  name: 'PostgREST / Supabase',
  description:
    'For APIs that auto-generate REST endpoints from PostgreSQL tables. Works with Supabase, self-hosted PostgREST, and similar.',
  icon: 'Database',
  suggestedAuthType: 'api_key',
  suggestedAuthConfig: {
    placement: 'header',
    paramName: 'apikey',
  },
  baseUrlPlaceholder: 'https://YOUR-PROJECT.supabase.co',
  baseUrlHint:
    'Enter your Supabase project URL or PostgREST base URL. For Supabase, find this in Project Settings → API.',
  exampleBaseUrls: ['https://abcdefghijklmnop.supabase.co', 'https://api.example.com/postgrest'],
  documentationUrl: 'https://postgrest.org/en/stable/api.html',
  actions: [
    {
      id: 'query-resource',
      name: 'Query Resource',
      description:
        'Query rows from a table/view with optional filtering, ordering, and pagination. Uses PostgREST query syntax.',
      method: 'GET',
      pathTemplate: '/rest/v1/{resource}',
      pathParameters: [
        {
          name: 'resource',
          type: 'string',
          required: true,
          description: 'Table or view name to query',
          placeholder: 'resource',
        },
      ],
      queryParameters: [
        {
          name: 'select',
          type: 'string',
          required: false,
          description: 'Columns to return (e.g., "id,name,email" or "*")',
          default: '*',
        },
        {
          name: 'order',
          type: 'string',
          required: false,
          description: 'Order by column (e.g., "created_at.desc")',
        },
        {
          name: 'limit',
          type: 'number',
          required: false,
          description: 'Maximum number of rows to return',
        },
        {
          name: 'offset',
          type: 'number',
          required: false,
          description: 'Number of rows to skip',
        },
      ],
      responseSchema: {
        type: 'array',
        description: 'Array of matching rows',
        items: { type: 'object' },
      },
      headers: {
        'Content-Type': 'application/json',
      },
      tags: ['read', 'query'],
    },
    {
      id: 'get-by-id',
      name: 'Get By ID',
      description: 'Retrieve a single row by its ID.',
      method: 'GET',
      pathTemplate: '/rest/v1/{resource}',
      pathParameters: [
        {
          name: 'resource',
          type: 'string',
          required: true,
          description: 'Table or view name',
          placeholder: 'resource',
        },
      ],
      queryParameters: [
        {
          name: 'id',
          type: 'string',
          required: true,
          description: 'Row ID to retrieve (uses "id=eq.{value}" filter)',
        },
        {
          name: 'select',
          type: 'string',
          required: false,
          description: 'Columns to return',
          default: '*',
        },
      ],
      responseSchema: {
        type: 'array',
        description: 'Array with single matching row (or empty if not found)',
        items: { type: 'object' },
        maxItems: 1,
      },
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/vnd.pgrst.object+json',
      },
      tags: ['read'],
    },
    {
      id: 'insert-resource',
      name: 'Insert Resource',
      description: 'Insert one or more rows into a table.',
      method: 'POST',
      pathTemplate: '/rest/v1/{resource}',
      pathParameters: [
        {
          name: 'resource',
          type: 'string',
          required: true,
          description: 'Table name to insert into',
          placeholder: 'resource',
        },
      ],
      queryParameters: [
        {
          name: 'select',
          type: 'string',
          required: false,
          description: 'Columns to return from inserted rows',
        },
      ],
      requestBody: {
        contentType: 'application/json',
        required: true,
        schema: {
          oneOf: [
            {
              type: 'object',
              description: 'Single row to insert',
              additionalProperties: true,
            },
            {
              type: 'array',
              description: 'Multiple rows to insert',
              items: { type: 'object', additionalProperties: true },
            },
          ],
        },
      },
      responseSchema: {
        type: 'array',
        description: 'Inserted rows (if select specified)',
        items: { type: 'object' },
      },
      headers: {
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      tags: ['write', 'create'],
    },
    {
      id: 'update-resource',
      name: 'Update Resource',
      description:
        'Update rows matching a filter. Use query parameters to filter which rows to update.',
      method: 'PATCH',
      pathTemplate: '/rest/v1/{resource}',
      pathParameters: [
        {
          name: 'resource',
          type: 'string',
          required: true,
          description: 'Table name to update',
          placeholder: 'resource',
        },
      ],
      queryParameters: [
        {
          name: 'id',
          type: 'string',
          required: false,
          description: 'Row ID to update (uses "id=eq.{value}" filter)',
        },
        {
          name: 'select',
          type: 'string',
          required: false,
          description: 'Columns to return from updated rows',
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
        type: 'array',
        description: 'Updated rows (if select specified)',
        items: { type: 'object' },
      },
      headers: {
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      tags: ['write', 'update'],
    },
    {
      id: 'upsert-resource',
      name: 'Upsert Resource',
      description:
        'Insert rows, or update if they already exist (based on primary key or unique constraint).',
      method: 'POST',
      pathTemplate: '/rest/v1/{resource}',
      pathParameters: [
        {
          name: 'resource',
          type: 'string',
          required: true,
          description: 'Table name',
          placeholder: 'resource',
        },
      ],
      queryParameters: [
        {
          name: 'on_conflict',
          type: 'string',
          required: false,
          description: 'Column(s) to use for conflict detection (e.g., "id" or "email")',
        },
        {
          name: 'select',
          type: 'string',
          required: false,
          description: 'Columns to return',
        },
      ],
      requestBody: {
        contentType: 'application/json',
        required: true,
        schema: {
          oneOf: [
            { type: 'object', additionalProperties: true },
            { type: 'array', items: { type: 'object', additionalProperties: true } },
          ],
        },
      },
      responseSchema: {
        type: 'array',
        items: { type: 'object' },
      },
      headers: {
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=representation',
      },
      tags: ['write', 'upsert'],
    },
    {
      id: 'delete-resource',
      name: 'Delete Resource',
      description: 'Delete rows matching a filter.',
      method: 'DELETE',
      pathTemplate: '/rest/v1/{resource}',
      pathParameters: [
        {
          name: 'resource',
          type: 'string',
          required: true,
          description: 'Table name',
          placeholder: 'resource',
        },
      ],
      queryParameters: [
        {
          name: 'id',
          type: 'string',
          required: false,
          description: 'Row ID to delete (uses "id=eq.{value}" filter)',
        },
        {
          name: 'select',
          type: 'string',
          required: false,
          description: 'Columns to return from deleted rows',
        },
      ],
      responseSchema: {
        type: 'array',
        description: 'Deleted rows (if select specified)',
        items: { type: 'object' },
      },
      headers: {
        Prefer: 'return=representation',
      },
      tags: ['write', 'delete'],
    },
    {
      id: 'call-rpc',
      name: 'Call RPC Function',
      description:
        'Call a PostgreSQL function (stored procedure) exposed via RPC. Functions must be created in the database.',
      method: 'POST',
      pathTemplate: '/rest/v1/rpc/{function}',
      pathParameters: [
        {
          name: 'function',
          type: 'string',
          required: true,
          description: 'Name of the PostgreSQL function to call',
          placeholder: 'function',
        },
      ],
      requestBody: {
        contentType: 'application/json',
        required: false,
        schema: {
          type: 'object',
          description: 'Function arguments as key-value pairs',
          additionalProperties: true,
        },
      },
      responseSchema: {
        description: 'Function return value (varies based on function)',
      },
      headers: {
        'Content-Type': 'application/json',
      },
      tags: ['rpc', 'function'],
    },
  ],
};
