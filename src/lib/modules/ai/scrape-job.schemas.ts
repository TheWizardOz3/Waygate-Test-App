/**
 * Scrape Job Schemas
 *
 * Zod schemas for scrape job validation and API responses.
 * Defines the structure of scrape job data and parsed API documentation.
 */

import { z } from 'zod';

// =============================================================================
// Enums
// =============================================================================

export const ScrapeJobStatusSchema = z.enum([
  'PENDING',
  'CRAWLING',
  'PARSING',
  'GENERATING',
  'COMPLETED',
  'FAILED',
]);

export type ScrapeJobStatusType = z.infer<typeof ScrapeJobStatusSchema>;

export const HttpMethodSchema = z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);

export const AuthTypeSchema = z.enum(['oauth2', 'api_key', 'basic', 'bearer', 'custom_header']);

// =============================================================================
// Parsed API Structure Schemas
// =============================================================================

/**
 * Parameter definition (path, query, header)
 */
export const ApiParameterSchema = z.object({
  name: z.string(),
  type: z.string(),
  required: z.boolean(),
  description: z.string().optional(),
  default: z.unknown().optional(),
  enum: z.array(z.string()).optional(),
});

export type ApiParameter = z.infer<typeof ApiParameterSchema>;

/**
 * Request body definition
 */
export const ApiRequestBodySchema = z.object({
  contentType: z.string(),
  schema: z.record(z.string(), z.unknown()), // JSON Schema
  required: z.boolean(),
});

export type ApiRequestBody = z.infer<typeof ApiRequestBodySchema>;

/**
 * Response definition
 */
export const ApiResponseSchema = z.object({
  description: z.string(),
  schema: z.record(z.string(), z.unknown()).optional(), // JSON Schema
});

export type ApiResponse = z.infer<typeof ApiResponseSchema>;

/**
 * API endpoint definition
 */
export const ApiEndpointSchema = z.object({
  name: z.string(),
  slug: z.string(),
  description: z.string().optional(),
  method: HttpMethodSchema,
  path: z.string(),
  pathParameters: z.array(ApiParameterSchema).optional(),
  queryParameters: z.array(ApiParameterSchema).optional(),
  headerParameters: z.array(ApiParameterSchema).optional(),
  requestBody: ApiRequestBodySchema.optional(),
  responses: z.record(z.string(), ApiResponseSchema),
  tags: z.array(z.string()).optional(),
  deprecated: z.boolean().optional(),
});

export type ApiEndpoint = z.infer<typeof ApiEndpointSchema>;

/**
 * Authentication method definition
 */
export const ApiAuthMethodSchema = z.object({
  type: AuthTypeSchema,
  config: z.record(z.string(), z.unknown()),
  location: z.enum(['header', 'query', 'body']).optional(),
  paramName: z.string().optional(),
});

export type ApiAuthMethod = z.infer<typeof ApiAuthMethodSchema>;

/**
 * Rate limit definition
 */
export const RateLimitSchema = z.object({
  requests: z.number().positive(),
  window: z.number().positive(), // seconds
});

export type RateLimit = z.infer<typeof RateLimitSchema>;

/**
 * Rate limits configuration
 */
export const RateLimitsConfigSchema = z.object({
  default: RateLimitSchema.optional(),
  perEndpoint: z.record(z.string(), RateLimitSchema).optional(),
});

export type RateLimitsConfig = z.infer<typeof RateLimitsConfigSchema>;

/**
 * Scrape metadata
 */
export const ScrapeMetadataSchema = z.object({
  scrapedAt: z.string().datetime(),
  sourceUrls: z.array(z.string().url()),
  aiConfidence: z.number().min(0).max(1),
  warnings: z.array(z.string()),
});

export type ScrapeMetadata = z.infer<typeof ScrapeMetadataSchema>;

/**
 * Complete parsed API documentation structure
 */
export const ParsedApiDocSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  baseUrl: z.string().url(),
  version: z.string().optional(),
  authMethods: z.array(ApiAuthMethodSchema),
  endpoints: z.array(ApiEndpointSchema),
  rateLimits: RateLimitsConfigSchema.optional(),
  metadata: ScrapeMetadataSchema.optional(),
});

export type ParsedApiDoc = z.infer<typeof ParsedApiDocSchema>;

// =============================================================================
// Scrape Job Error Schema
// =============================================================================

/**
 * Error details for failed scrape jobs
 */
export const ScrapeJobErrorDetailsSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.record(z.string(), z.unknown()).optional(),
  retryable: z.boolean(),
  occurredAt: z.string().datetime(),
});

export type ScrapeJobErrorDetails = z.infer<typeof ScrapeJobErrorDetailsSchema>;

// =============================================================================
// API Input Schemas
// =============================================================================

/**
 * Input for creating a new scrape job
 */
export const CreateScrapeJobInputSchema = z.object({
  documentationUrl: z.string().url('Invalid documentation URL'),
  wishlist: z
    .array(z.string().min(1))
    .optional()
    .default([])
    .describe('List of specific actions/endpoints to prioritize'),
});

export type CreateScrapeJobInput = z.infer<typeof CreateScrapeJobInputSchema>;

/**
 * Input for updating scrape job status
 */
export const UpdateScrapeJobStatusInputSchema = z.object({
  status: ScrapeJobStatusSchema,
  progress: z.number().min(0).max(100).optional(),
  currentStep: z.string().optional(),
});

export type UpdateScrapeJobStatusInput = z.infer<typeof UpdateScrapeJobStatusInputSchema>;

// =============================================================================
// API Response Schemas
// =============================================================================

/**
 * Response for scrape job creation
 */
export const CreateScrapeJobResponseSchema = z.object({
  jobId: z.string().uuid(),
  status: ScrapeJobStatusSchema,
  estimatedDuration: z.number().positive().describe('Estimated duration in milliseconds'),
});

export type CreateScrapeJobResponse = z.infer<typeof CreateScrapeJobResponseSchema>;

/**
 * Response for scrape job status (in progress)
 */
export const ScrapeJobStatusResponseSchema = z.object({
  jobId: z.string().uuid(),
  status: ScrapeJobStatusSchema,
  progress: z.number().min(0).max(100),
  currentStep: z.string().optional(),
  documentationUrl: z.string().url(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type ScrapeJobStatusResponse = z.infer<typeof ScrapeJobStatusResponseSchema>;

/**
 * Response for completed scrape job
 */
export const ScrapeJobCompletedResponseSchema = ScrapeJobStatusResponseSchema.extend({
  status: z.literal('COMPLETED'),
  progress: z.literal(100),
  result: ParsedApiDocSchema,
  completedAt: z.string().datetime(),
});

export type ScrapeJobCompletedResponse = z.infer<typeof ScrapeJobCompletedResponseSchema>;

/**
 * Response for failed scrape job
 */
export const ScrapeJobFailedResponseSchema = ScrapeJobStatusResponseSchema.extend({
  status: z.literal('FAILED'),
  error: ScrapeJobErrorDetailsSchema,
  completedAt: z.string().datetime(),
});

export type ScrapeJobFailedResponse = z.infer<typeof ScrapeJobFailedResponseSchema>;

/**
 * Union type for scrape job response (any status)
 */
export const ScrapeJobResponseSchema = z.discriminatedUnion('status', [
  ScrapeJobStatusResponseSchema.extend({ status: z.literal('PENDING') }),
  ScrapeJobStatusResponseSchema.extend({ status: z.literal('CRAWLING') }),
  ScrapeJobStatusResponseSchema.extend({ status: z.literal('PARSING') }),
  ScrapeJobStatusResponseSchema.extend({ status: z.literal('GENERATING') }),
  ScrapeJobCompletedResponseSchema,
  ScrapeJobFailedResponseSchema,
]);

export type ScrapeJobResponse = z.infer<typeof ScrapeJobResponseSchema>;

// =============================================================================
// Validation Helpers
// =============================================================================

/**
 * Validates a parsed API document
 */
export function validateParsedApiDoc(data: unknown): ParsedApiDoc {
  return ParsedApiDocSchema.parse(data);
}

/**
 * Safely validates a parsed API document, returning null on failure
 */
export function safeParseParsedApiDoc(data: unknown): ParsedApiDoc | null {
  const result = ParsedApiDocSchema.safeParse(data);
  return result.success ? result.data : null;
}

/**
 * Checks if a status indicates the job is still in progress
 */
export function isJobInProgress(status: ScrapeJobStatusType): boolean {
  return ['PENDING', 'CRAWLING', 'PARSING', 'GENERATING'].includes(status);
}

/**
 * Checks if a status indicates the job is complete (success or failure)
 */
export function isJobComplete(status: ScrapeJobStatusType): boolean {
  return ['COMPLETED', 'FAILED'].includes(status);
}
