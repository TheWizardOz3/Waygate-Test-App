/**
 * AI Module
 *
 * Documentation scraping and AI-powered extraction for API integrations.
 *
 * - **Doc Scraper**: Firecrawl integration for web scraping
 * - **LLM**: Centralized model management for AI operations
 * - **Scrape Jobs**: Service and repository for scrape job management
 * - **Prompts**: AI prompt templates for API extraction
 * - **Document Parser**: AI-powered documentation parsing
 */

// Doc Scraper (Firecrawl integration)
export {
  // Core scraping functions
  scrapeUrl,
  scrapeDocumentation,
  crawlDocumentation,
  // Link filtering helpers
  filterDocumentationLinks,
  isLikelyApiDocumentation,
  // Client management
  resetClient,
  // Error handling
  isScrapeError,
  isRetryableScrapeError,
  ScrapeError,
  // Types
  type ScrapeResult,
  type ScrapeOptions,
  type ScrapeErrorCode,
  type DocumentationScrapeResult,
  type DocumentationScrapeOptions,
  type CrawlResult,
  type CrawlOptions,
  type CrawlProgress,
  type CrawledPage,
} from './doc-scraper';

// Intelligent Crawler (LLM-guided page selection)
export {
  // Main intelligent crawl function
  intelligentCrawl,
  // Firecrawl map function
  mapWebsite,
  // LLM-guided URL triage
  triageUrls,
  // URL pattern detection
  detectUrlCategory,
  preFilterUrls,
  // Types
  type MapResult,
  type PrioritizedUrl,
  type UrlCategory,
  type IntelligentCrawlOptions,
  type IntelligentCrawlProgress,
  type IntelligentCrawlResult,
} from './intelligent-crawler';

// LLM (Centralized model management)
export {
  // Client
  getLLM,
  getAvailableModels,
  getDefaultModel,
  isValidModel,
  clearProviderCache,
  // Types
  LLMError,
  LLM_MODELS,
  type LLMProvider,
  type LLMProviderType,
  type LLMModelId,
  type LLMModelConfig,
  type LLMGenerateOptions,
  type LLMGenerateResult,
  type LLMResponseSchema,
  type LLMSchemaProperty,
  type LLMUsage,
  type LLMErrorCode,
  // Providers (direct access)
  GeminiProvider,
  createGeminiProvider,
} from './llm';

// Scrape Job Service (Business Logic)
export {
  createScrapeJob,
  getScrapeJob,
  listScrapeJobs,
  updateJobStatus,
  updateJobProgress,
  completeJob,
  failJob,
  canRetryJob,
  isJobRunning,
  // Job processing
  processJob,
  startJobProcessing,
  // Re-analysis (re-extraction from cached content)
  reanalyzeJob,
  canReanalyzeJob,
  // Cancel job
  cancelScrapeJob,
  markJobCancelled,
  isJobCancelled,
  ScrapeJobError,
  // Types
  type ProcessJobOptions,
  type CreateScrapeJobOptions,
  type ReanalyzeJobOptions,
} from './scrape-job.service';

// Scrape Job Schemas
export {
  // Status enum and helpers
  ScrapeJobStatusSchema,
  isJobInProgress,
  isJobComplete,
  // Parsed API structure schemas
  ParsedApiDocSchema,
  ApiEndpointSchema,
  ApiAuthMethodSchema,
  ApiParameterSchema,
  ApiRequestBodySchema,
  ApiResponseSchema,
  RateLimitSchema,
  RateLimitsConfigSchema,
  ScrapeMetadataSchema,
  // Input/Output schemas
  CreateScrapeJobInputSchema,
  UpdateScrapeJobStatusInputSchema,
  CreateScrapeJobResponseSchema,
  ScrapeJobStatusResponseSchema,
  ScrapeJobCompletedResponseSchema,
  ScrapeJobFailedResponseSchema,
  ScrapeJobResponseSchema,
  ScrapeJobErrorDetailsSchema,
  // Validation helpers
  validateParsedApiDoc,
  safeParseParsedApiDoc,
  // Types
  type ScrapeJobStatusType,
  type ParsedApiDoc,
  type ApiEndpoint,
  type ApiAuthMethod,
  type ApiParameter,
  type ApiRequestBody,
  type ApiResponse,
  type RateLimit,
  type RateLimitsConfig,
  type ScrapeMetadata,
  type CreateScrapeJobInput,
  type UpdateScrapeJobStatusInput,
  type CreateScrapeJobResponse,
  type ScrapeJobStatusResponse,
  type ScrapeJobCompletedResponse,
  type ScrapeJobFailedResponse,
  type ScrapeJobResponse,
  type ScrapeJobErrorDetails,
} from './scrape-job.schemas';

// Scrape Job Repository (Direct DB Access - use service for business logic)
export {
  // Low-level CRUD operations (prefer service methods)
  createScrapeJob as createScrapeJobRecord,
  findScrapeJobById,
  findScrapeJobByIdAndTenant,
  findScrapeJobsByTenant,
  findRecentScrapeJobs,
  findInProgressJobs,
  findScrapeJobByUrl,
  updateScrapeJob as updateScrapeJobRecord,
  updateScrapeJobForTenant,
  updateScrapeJobStatus as updateScrapeJobStatusRecord,
  markScrapeJobFailed as markScrapeJobFailedRecord,
  markScrapeJobCompleted as markScrapeJobCompletedRecord,
  deleteScrapeJob,
  deleteScrapeJobForTenant,
  deleteOldScrapeJobs,
  countScrapeJobsByStatus,
  // Types
  type CreateScrapeJobInput as CreateScrapeJobRecordInput,
  type UpdateScrapeJobInput as UpdateScrapeJobRecordInput,
  type ScrapeJobFilters,
} from './scrape-job.repository';

// AI Extraction Prompts
export {
  // System prompts
  API_EXTRACTION_SYSTEM_PROMPT,
  ENDPOINT_EXTRACTION_SYSTEM_PROMPT,
  AUTH_DETECTION_SYSTEM_PROMPT,
  RATE_LIMIT_DETECTION_SYSTEM_PROMPT,
  // Few-shot examples
  ENDPOINT_EXTRACTION_EXAMPLE,
  AUTH_DETECTION_EXAMPLE,
  RATE_LIMIT_DETECTION_EXAMPLE,
  // Prompt builders
  buildFullExtractionPrompt,
  buildEndpointExtractionPrompt,
  buildAuthDetectionPrompt,
  buildRateLimitDetectionPrompt,
  buildApiInfoExtractionPrompt,
  // Response schemas for structured output
  API_INFO_SCHEMA,
  ENDPOINT_SCHEMA,
  ENDPOINTS_ARRAY_SCHEMA,
  AUTH_METHOD_SCHEMA,
  AUTH_METHODS_ARRAY_SCHEMA,
  RATE_LIMITS_SCHEMA,
  PARSED_API_DOC_SCHEMA,
  // Confidence helpers
  CONFIDENCE_SUFFIX,
  withConfidenceScoring,
} from './prompts';

// AI Document Parser
export {
  parseApiDocumentation,
  isParseError,
  ParseError,
  type ParseOptions,
  type ParseResult,
  type ParseErrorCode,
} from './document-parser';

// OpenAPI Parser (No AI - direct conversion)
export {
  parseOpenApiSpec,
  isOpenApiSpec,
  isOpenApiParseError,
  OpenApiParseError,
  type OpenApiParseOptions,
  type OpenApiParseResult,
  type OpenApiParseErrorCode,
} from './openapi-parser';

// Scraped Content Storage (Supabase Storage)
export {
  // Core operations
  storeScrapedContent,
  getScrapedContent,
  getScrapedContentByJobId,
  deleteScrapedContent,
  hasScrapedContent,
  getContentMetadata,
  // Bucket management
  ensureBucketExists,
  getBucketInfo,
  // Error handling
  StorageError,
  isStorageError,
  // Types
  type StorageErrorCode,
} from './storage';

// Action Definition Generator
export {
  // Main generator
  generateActions,
  // Utility functions
  generateSlug,
  extractAuthConfig,
  summarizeActions,
  // Types
  type JsonSchema,
  type JsonSchemaProperty,
  type ActionDefinition,
  type PaginationConfig,
  type RetryConfig,
  type ActionMetadata,
  type GenerateActionsOptions,
  type GenerateActionsResult,
} from './action-generator';

// AI Service - Main Orchestrator
export {
  // Main processing function
  processDocumentation,
  // Utility functions
  getProcessingStatusMessage,
  isPartialSuccess,
  // Types
  type ProcessDocumentationOptions,
  type ProcessDocumentationResult,
  type ProcessingError,
  type ProcessingStats,
} from './ai.service';
