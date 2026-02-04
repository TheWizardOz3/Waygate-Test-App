/**
 * AI Prompts Module
 *
 * Exports all prompt builders and schemas for AI-powered extraction.
 */

export {
  // System prompts
  API_EXTRACTION_SYSTEM_PROMPT,
  ENDPOINT_EXTRACTION_SYSTEM_PROMPT,
  AUTH_DETECTION_SYSTEM_PROMPT,
  RATE_LIMIT_DETECTION_SYSTEM_PROMPT,
  // Few-shot examples
  ENDPOINT_EXTRACTION_EXAMPLE,
  PAGINATED_ENDPOINT_EXTRACTION_EXAMPLE,
  AUTH_DETECTION_EXAMPLE,
  RATE_LIMIT_DETECTION_EXAMPLE,
  // Prompt builders
  buildFullExtractionPrompt,
  buildEndpointExtractionPrompt,
  buildAuthDetectionPrompt,
  buildRateLimitDetectionPrompt,
  buildApiInfoExtractionPrompt,
  // Response schemas
  API_INFO_SCHEMA,
  PARAMETER_SCHEMA,
  REQUEST_BODY_SCHEMA,
  ENDPOINT_SCHEMA,
  ENDPOINTS_ARRAY_SCHEMA,
  AUTH_METHOD_SCHEMA,
  AUTH_METHODS_ARRAY_SCHEMA,
  RATE_LIMITS_SCHEMA,
  PARSED_API_DOC_SCHEMA,
  // Confidence helpers
  CONFIDENCE_SUFFIX,
  withConfidenceScoring,
} from './extract-api';
