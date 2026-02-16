/**
 * Extract API Prompts Unit Tests
 *
 * Tests for the endpoint extraction prompts with parameters.
 * Verifies prompt structure matches schema requirements.
 */

import { describe, it, expect } from 'vitest';
import {
  ENDPOINT_EXTRACTION_SYSTEM_PROMPT,
  ENDPOINT_SCHEMA,
  ENDPOINTS_ARRAY_SCHEMA,
  ENDPOINT_EXTRACTION_EXAMPLE,
  PAGINATED_ENDPOINT_EXTRACTION_EXAMPLE,
  buildEndpointExtractionPrompt,
} from '@/lib/modules/ai/prompts/extract-api';

// =============================================================================
// Endpoint Extraction System Prompt Tests
// =============================================================================

describe('ENDPOINT_EXTRACTION_SYSTEM_PROMPT', () => {
  it('should mention all extraction fields', () => {
    const prompt = ENDPOINT_EXTRACTION_SYSTEM_PROMPT;

    // Should mention all 8 fields
    expect(prompt).toContain('name');
    expect(prompt).toContain('slug');
    expect(prompt).toContain('method');
    expect(prompt).toContain('path');
    expect(prompt).toContain('description');
    expect(prompt).toContain('pathParameters');
    expect(prompt).toContain('queryParameters');
    expect(prompt).toContain('requestBody');
  });

  it('should emphasize JSON array output', () => {
    const prompt = ENDPOINT_EXTRACTION_SYSTEM_PROMPT;

    expect(prompt).toContain('JSON array');
    expect(prompt.toLowerCase()).toContain('no markdown');
  });

  it('should emphasize parameter extraction', () => {
    const prompt = ENDPOINT_EXTRACTION_SYSTEM_PROMPT;

    expect(prompt.toLowerCase()).toContain('parameter');
    expect(prompt).toContain('PARAMETER FORMAT');
  });
});

// =============================================================================
// Endpoint Schema Tests
// =============================================================================

describe('ENDPOINT_SCHEMA', () => {
  it('should be an object schema with 8 properties', () => {
    expect(ENDPOINT_SCHEMA.type).toBe('object');
    expect(ENDPOINT_SCHEMA.properties).toBeDefined();

    const propertyNames = Object.keys(ENDPOINT_SCHEMA.properties || {});
    expect(propertyNames).toHaveLength(8);
    expect(propertyNames).toContain('name');
    expect(propertyNames).toContain('slug');
    expect(propertyNames).toContain('method');
    expect(propertyNames).toContain('path');
    expect(propertyNames).toContain('description');
    expect(propertyNames).toContain('pathParameters');
    expect(propertyNames).toContain('queryParameters');
    expect(propertyNames).toContain('requestBody');
  });

  it('should have required fields', () => {
    expect(ENDPOINT_SCHEMA.required).toContain('name');
    expect(ENDPOINT_SCHEMA.required).toContain('slug');
    expect(ENDPOINT_SCHEMA.required).toContain('method');
    expect(ENDPOINT_SCHEMA.required).toContain('path');
  });

  it('should have string types for basic fields', () => {
    const properties = ENDPOINT_SCHEMA.properties || {};
    expect(properties.name?.type).toBe('string');
    expect(properties.slug?.type).toBe('string');
    expect(properties.path?.type).toBe('string');
    expect(properties.description?.type).toBe('string');
  });

  it('should have method as enum', () => {
    const methodProp = ENDPOINT_SCHEMA.properties?.method;
    expect(methodProp?.enum).toBeDefined();
    expect(methodProp?.enum).toContain('GET');
    expect(methodProp?.enum).toContain('POST');
    expect(methodProp?.enum).toContain('PUT');
    expect(methodProp?.enum).toContain('PATCH');
    expect(methodProp?.enum).toContain('DELETE');
  });

  it('should have array types for parameter fields', () => {
    const properties = ENDPOINT_SCHEMA.properties || {};
    expect(properties.pathParameters?.type).toBe('array');
    expect(properties.pathParameters?.items).toBeDefined();
    expect(properties.queryParameters?.type).toBe('array');
    expect(properties.queryParameters?.items).toBeDefined();
  });

  it('should have object type for requestBody', () => {
    const properties = ENDPOINT_SCHEMA.properties || {};
    expect(properties.requestBody?.type).toBe('object');
    expect(properties.requestBody?.nullable).toBe(true);
  });
});

describe('ENDPOINTS_ARRAY_SCHEMA', () => {
  it('should be an array of endpoint objects', () => {
    expect(ENDPOINTS_ARRAY_SCHEMA.type).toBe('array');
    expect(ENDPOINTS_ARRAY_SCHEMA.items).toBeDefined();
    expect(ENDPOINTS_ARRAY_SCHEMA.items).toBe(ENDPOINT_SCHEMA);
  });
});

// =============================================================================
// Example Output Tests
// =============================================================================

describe('ENDPOINT_EXTRACTION_EXAMPLE', () => {
  it('should have POST endpoint with requestBody', () => {
    const output = ENDPOINT_EXTRACTION_EXAMPLE.output;

    expect(output.name).toBeDefined();
    expect(output.slug).toBeDefined();
    expect(output.method).toBe('POST');
    expect(output.path).toBeDefined();
    expect(output.description).toBeDefined();
    expect(output.requestBody).toBeDefined();
    expect(output.requestBody?.contentType).toBe('application/json');
    expect(output.requestBody?.schema?.properties).toBeDefined();
    expect(output.requestBody?.required).toBe(true);
  });
});

describe('PAGINATED_ENDPOINT_EXTRACTION_EXAMPLE', () => {
  it('should have GET endpoint with path and query parameters', () => {
    const output = PAGINATED_ENDPOINT_EXTRACTION_EXAMPLE.output;

    expect(output.name).toBeDefined();
    expect(output.slug).toBeDefined();
    expect(output.method).toBe('GET');
    expect(output.path).toContain('{user_id}');
    expect(output.description).toBeDefined();
    expect(output.pathParameters).toBeDefined();
    expect(output.pathParameters).toHaveLength(1);
    expect(output.pathParameters?.[0]?.name).toBe('user_id');
    expect(output.queryParameters).toBeDefined();
    expect(output.queryParameters?.length).toBeGreaterThan(0);
  });
});

// =============================================================================
// Build Prompt Function Tests
// =============================================================================

describe('buildEndpointExtractionPrompt', () => {
  it('should include system prompt', () => {
    const prompt = buildEndpointExtractionPrompt('Sample docs');
    expect(prompt).toContain(ENDPOINT_EXTRACTION_SYSTEM_PROMPT);
  });

  it('should include documentation content', () => {
    const docs = 'This is sample API documentation';
    const prompt = buildEndpointExtractionPrompt(docs);
    expect(prompt).toContain(docs);
  });

  it('should ask for JSON array output only', () => {
    const prompt = buildEndpointExtractionPrompt('Sample docs');
    expect(prompt).toContain('JSON array');
  });

  it('should mention parameter extraction in task section', () => {
    const prompt = buildEndpointExtractionPrompt('Sample docs');
    const taskSection = prompt.split('## Task')[1] || '';

    expect(taskSection).toContain('name');
    expect(taskSection).toContain('method');
    expect(taskSection).toContain('path');
    expect(taskSection).toContain('pathParameters');
    expect(taskSection).toContain('queryParameters');
    expect(taskSection).toContain('requestBody');
  });
});
