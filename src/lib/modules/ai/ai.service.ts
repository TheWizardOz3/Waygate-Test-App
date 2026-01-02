/**
 * AI Service - Documentation Processing Orchestrator
 *
 * Main entry point for processing API documentation and creating integrations.
 * Orchestrates the complete flow: scrape → parse → generate actions → create integration.
 *
 * This service connects:
 * - Scrape job management (scrape-job.service)
 * - Documentation parsing (document-parser, openapi-parser)
 * - Action generation (action-generator)
 * - Integration/Action creation (direct Prisma for now)
 */

import { prisma } from '@/lib/db/client';
import type { Integration, Action, AuthType, IntegrationStatus } from '@prisma/client';
import {
  createScrapeJob,
  processJob,
  getScrapeJob,
  type ProcessJobOptions,
} from './scrape-job.service';
import { generateActions, generateSlug, type ActionDefinition } from './action-generator';
import type { ParsedApiDoc, ApiAuthMethod } from './scrape-job.schemas';

// =============================================================================
// Types
// =============================================================================

/**
 * Options for processing documentation
 */
export interface ProcessDocumentationOptions {
  /** Tenant ID */
  tenantId: string;
  /** Documentation URL to process */
  documentationUrl: string;
  /** Wishlist of desired actions/capabilities */
  wishlist?: string[];
  /** Custom integration name (defaults to API name from docs) */
  integrationName?: string;
  /** Custom integration slug (auto-generated if not provided) */
  integrationSlug?: string;
  /** Tags to apply to the integration */
  tags?: string[];
  /** Whether to use multi-page crawling */
  crawlMode?: boolean;
  /** Max pages to crawl */
  maxPages?: number;
  /** Max crawl depth */
  maxDepth?: number;
  /** Progress callback */
  onProgress?: (stage: string, message: string, progress?: number) => void;
}

/**
 * Result of processing documentation
 */
export interface ProcessDocumentationResult {
  /** Whether processing was successful */
  success: boolean;
  /** The scrape job ID */
  jobId: string;
  /** Created integration (if successful) */
  integration?: Integration;
  /** Created actions (if successful) */
  actions?: Action[];
  /** Errors that occurred */
  errors: ProcessingError[];
  /** Warnings (non-fatal issues) */
  warnings: string[];
  /** Processing statistics */
  stats: ProcessingStats;
}

/**
 * Processing error
 */
export interface ProcessingError {
  stage: 'scrape' | 'parse' | 'integration' | 'actions';
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

/**
 * Processing statistics
 */
export interface ProcessingStats {
  /** Total time in milliseconds */
  totalTimeMs: number;
  /** Scraping time */
  scrapeTimeMs?: number;
  /** Parsing time */
  parseTimeMs?: number;
  /** Number of endpoints parsed */
  endpointsParsed: number;
  /** Number of actions created */
  actionsCreated: number;
  /** Number of actions that failed to create */
  actionsFailed: number;
}

// =============================================================================
// Main Orchestrator
// =============================================================================

/**
 * Process documentation URL and create an integration with actions
 *
 * This is the main entry point for the AI documentation scraper feature.
 * It orchestrates the complete flow from URL to working integration.
 *
 * @param options - Processing options
 * @returns Processing result with integration and actions
 *
 * @example
 * ```ts
 * const result = await processDocumentation({
 *   tenantId: 'tenant-123',
 *   documentationUrl: 'https://api.slack.com/docs',
 *   wishlist: ['send message', 'list channels'],
 *   tags: ['communication', 'messaging'],
 * });
 *
 * if (result.success) {
 *   console.log(`Created integration: ${result.integration.slug}`);
 *   console.log(`With ${result.actions.length} actions`);
 * }
 * ```
 */
export async function processDocumentation(
  options: ProcessDocumentationOptions
): Promise<ProcessDocumentationResult> {
  const startTime = Date.now();
  const errors: ProcessingError[] = [];
  const warnings: string[] = [];
  let scrapeTimeMs: number | undefined;
  let parseTimeMs: number | undefined;

  const {
    tenantId,
    documentationUrl,
    wishlist = [],
    integrationName,
    integrationSlug,
    tags = [],
    crawlMode = false,
    maxPages = 20,
    maxDepth = 3,
    onProgress,
  } = options;

  // ==========================================================================
  // Step 1: Create and process scrape job
  // ==========================================================================
  onProgress?.('scrape', 'Creating scrape job...', 5);

  const scrapeStart = Date.now();
  const createResult = await createScrapeJob(tenantId, {
    documentationUrl,
    wishlist,
  });

  const jobId = createResult.jobId;

  // Check if we have a cached result
  if (createResult.status === 'COMPLETED') {
    onProgress?.('scrape', 'Using cached scrape result', 25);
    scrapeTimeMs = Date.now() - scrapeStart;
  } else {
    // Process the job
    onProgress?.('scrape', 'Processing documentation...', 10);

    const processOptions: ProcessJobOptions = {
      crawlMode,
      maxPages,
      maxDepth,
      onProgress: (stage, message) => {
        const progress = stage === 'CRAWLING' ? 15 : stage === 'PARSING' ? 40 : 60;
        onProgress?.(stage.toLowerCase(), message, progress);
      },
    };

    try {
      await processJob(jobId, processOptions);
      scrapeTimeMs = Date.now() - scrapeStart;
    } catch (error) {
      scrapeTimeMs = Date.now() - scrapeStart;
      errors.push({
        stage: 'scrape',
        code: 'SCRAPE_FAILED',
        message: error instanceof Error ? error.message : 'Scraping failed',
      });

      return {
        success: false,
        jobId,
        errors,
        warnings,
        stats: {
          totalTimeMs: Date.now() - startTime,
          scrapeTimeMs,
          endpointsParsed: 0,
          actionsCreated: 0,
          actionsFailed: 0,
        },
      };
    }
  }

  // ==========================================================================
  // Step 2: Get parsed result
  // ==========================================================================
  onProgress?.('parse', 'Retrieving parsed documentation...', 65);

  const parseStart = Date.now();
  const jobResult = await getScrapeJob(tenantId, jobId);

  if (jobResult.status !== 'COMPLETED' || !('result' in jobResult)) {
    parseTimeMs = Date.now() - parseStart;
    errors.push({
      stage: 'parse',
      code: 'PARSE_FAILED',
      message: 'Scrape job did not complete successfully',
      details: 'error' in jobResult ? { error: jobResult.error } : undefined,
    });

    return {
      success: false,
      jobId,
      errors,
      warnings,
      stats: {
        totalTimeMs: Date.now() - startTime,
        scrapeTimeMs,
        parseTimeMs,
        endpointsParsed: 0,
        actionsCreated: 0,
        actionsFailed: 0,
      },
    };
  }

  const parsedDoc = jobResult.result as ParsedApiDoc;
  parseTimeMs = Date.now() - parseStart;

  // ==========================================================================
  // Step 3: Generate action definitions
  // ==========================================================================
  onProgress?.('generate', 'Generating action definitions...', 70);

  const actionResult = generateActions(parsedDoc, {
    wishlist,
    sourceUrl: documentationUrl,
    aiConfidence: parsedDoc.metadata?.aiConfidence,
  });

  warnings.push(...actionResult.warnings);

  // ==========================================================================
  // Step 4: Create integration
  // ==========================================================================
  onProgress?.('integration', 'Creating integration...', 80);

  let integration: Integration;
  try {
    integration = await createIntegration(tenantId, parsedDoc, {
      name: integrationName,
      slug: integrationSlug,
      documentationUrl,
      tags,
    });
  } catch (error) {
    errors.push({
      stage: 'integration',
      code: 'INTEGRATION_CREATE_FAILED',
      message: error instanceof Error ? error.message : 'Failed to create integration',
    });

    return {
      success: false,
      jobId,
      errors,
      warnings,
      stats: {
        totalTimeMs: Date.now() - startTime,
        scrapeTimeMs,
        parseTimeMs,
        endpointsParsed: parsedDoc.endpoints.length,
        actionsCreated: 0,
        actionsFailed: 0,
      },
    };
  }

  // ==========================================================================
  // Step 5: Create actions
  // ==========================================================================
  onProgress?.('actions', 'Creating actions...', 85);

  const { createdActions, failedActions } = await createActions(
    integration.id,
    actionResult.actions,
    (progress) => {
      const pct = 85 + Math.round(progress * 10); // 85-95%
      onProgress?.('actions', `Creating actions (${Math.round(progress * 100)}%)...`, pct);
    }
  );

  // Add failures as errors
  for (const failure of failedActions) {
    errors.push({
      stage: 'actions',
      code: 'ACTION_CREATE_FAILED',
      message: `Failed to create action "${failure.slug}": ${failure.error}`,
    });
  }

  // ==========================================================================
  // Step 6: Update scrape job with integration ID
  // ==========================================================================
  onProgress?.('complete', 'Finalizing...', 98);

  try {
    await updateJobWithIntegration(jobId, integration.id);
  } catch (error) {
    warnings.push(`Failed to update scrape job with integration ID: ${error}`);
  }

  onProgress?.('complete', 'Processing complete', 100);

  // ==========================================================================
  // Return result
  // ==========================================================================
  const success = errors.filter((e) => e.stage !== 'actions').length === 0;

  return {
    success,
    jobId,
    integration,
    actions: createdActions,
    errors,
    warnings,
    stats: {
      totalTimeMs: Date.now() - startTime,
      scrapeTimeMs,
      parseTimeMs,
      endpointsParsed: parsedDoc.endpoints.length,
      actionsCreated: createdActions.length,
      actionsFailed: failedActions.length,
    },
  };
}

// =============================================================================
// Integration Creation
// =============================================================================

interface CreateIntegrationOptions {
  name?: string;
  slug?: string;
  documentationUrl: string;
  tags?: string[];
}

async function createIntegration(
  tenantId: string,
  parsedDoc: ParsedApiDoc,
  options: CreateIntegrationOptions
): Promise<Integration> {
  const name = options.name || parsedDoc.name || 'Unknown API';
  const slug = options.slug || generateSlug(name);

  // Determine auth type from parsed doc
  const authType = determineAuthType(parsedDoc.authMethods);
  const authConfig = buildAuthConfig(parsedDoc.authMethods);

  // Check for existing integration with same slug
  const existing = await prisma.integration.findUnique({
    where: {
      integrations_tenant_slug_idx: {
        tenantId,
        slug,
      },
    },
  });

  if (existing) {
    // Update existing integration
    return prisma.integration.update({
      where: { id: existing.id },
      data: {
        name,
        description: parsedDoc.description,
        documentationUrl: options.documentationUrl,
        authType,
        authConfig: JSON.parse(JSON.stringify(authConfig)),
        tags: options.tags || [],
        metadata: JSON.parse(
          JSON.stringify({
            baseUrl: parsedDoc.baseUrl,
            version: parsedDoc.version,
            aiGenerated: true,
            scrapedAt: parsedDoc.metadata?.scrapedAt,
            aiConfidence: parsedDoc.metadata?.aiConfidence,
          })
        ),
        updatedAt: new Date(),
      },
    });
  }

  // Create new integration
  return prisma.integration.create({
    data: {
      tenantId,
      name,
      slug,
      description: parsedDoc.description,
      documentationUrl: options.documentationUrl,
      authType,
      authConfig: JSON.parse(JSON.stringify(authConfig)),
      status: 'draft' as IntegrationStatus,
      tags: options.tags || [],
      metadata: JSON.parse(
        JSON.stringify({
          baseUrl: parsedDoc.baseUrl,
          version: parsedDoc.version,
          aiGenerated: true,
          scrapedAt: parsedDoc.metadata?.scrapedAt,
          aiConfidence: parsedDoc.metadata?.aiConfidence,
        })
      ),
    },
  });
}

function determineAuthType(authMethods: ApiAuthMethod[]): AuthType {
  if (!authMethods || authMethods.length === 0) {
    return 'none' as AuthType;
  }

  // Use first auth method as primary
  const primary = authMethods[0];

  const typeMap: Record<string, AuthType> = {
    oauth2: 'oauth2' as AuthType,
    api_key: 'api_key' as AuthType,
    basic: 'basic' as AuthType,
    bearer: 'bearer' as AuthType,
    custom_header: 'custom_header' as AuthType,
  };

  return typeMap[primary.type] || ('api_key' as AuthType);
}

function buildAuthConfig(authMethods: ApiAuthMethod[]): Record<string, unknown> {
  if (!authMethods || authMethods.length === 0) {
    return {};
  }

  const primary = authMethods[0];
  return {
    ...primary.config,
    location: primary.location,
    paramName: primary.paramName,
    // Include info about additional supported auth methods
    supportedMethods: authMethods.map((m) => m.type),
  };
}

// =============================================================================
// Action Creation
// =============================================================================

interface ActionCreationResult {
  createdActions: Action[];
  failedActions: Array<{ slug: string; error: string }>;
}

async function createActions(
  integrationId: string,
  actionDefs: ActionDefinition[],
  onProgress?: (progress: number) => void
): Promise<ActionCreationResult> {
  const createdActions: Action[] = [];
  const failedActions: Array<{ slug: string; error: string }> = [];

  for (let i = 0; i < actionDefs.length; i++) {
    const def = actionDefs[i];
    onProgress?.(i / actionDefs.length);

    try {
      // Check for existing action with same slug
      const existing = await prisma.action.findUnique({
        where: {
          actions_integration_slug_idx: {
            integrationId,
            slug: def.slug,
          },
        },
      });

      let action: Action;

      if (existing) {
        // Update existing action
        action = await prisma.action.update({
          where: { id: existing.id },
          data: {
            name: def.name,
            description: def.description,
            httpMethod: def.httpMethod,
            endpointTemplate: def.endpointTemplate,
            inputSchema: JSON.parse(JSON.stringify(def.inputSchema)),
            outputSchema: JSON.parse(JSON.stringify(def.outputSchema)),
            paginationConfig: def.paginationConfig
              ? JSON.parse(JSON.stringify(def.paginationConfig))
              : undefined,
            retryConfig: def.retryConfig ? JSON.parse(JSON.stringify(def.retryConfig)) : undefined,
            cacheable: def.cacheable,
            cacheTtlSeconds: def.cacheTtlSeconds,
            metadata: JSON.parse(JSON.stringify(def.metadata)),
            updatedAt: new Date(),
          },
        });
      } else {
        // Create new action
        action = await prisma.action.create({
          data: {
            integrationId,
            name: def.name,
            slug: def.slug,
            description: def.description,
            httpMethod: def.httpMethod,
            endpointTemplate: def.endpointTemplate,
            inputSchema: JSON.parse(JSON.stringify(def.inputSchema)),
            outputSchema: JSON.parse(JSON.stringify(def.outputSchema)),
            paginationConfig: def.paginationConfig
              ? JSON.parse(JSON.stringify(def.paginationConfig))
              : undefined,
            retryConfig: def.retryConfig ? JSON.parse(JSON.stringify(def.retryConfig)) : undefined,
            cacheable: def.cacheable,
            cacheTtlSeconds: def.cacheTtlSeconds,
            metadata: JSON.parse(JSON.stringify(def.metadata)),
          },
        });
      }

      createdActions.push(action);
    } catch (error) {
      failedActions.push({
        slug: def.slug,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  onProgress?.(1);
  return { createdActions, failedActions };
}

// =============================================================================
// Scrape Job Update
// =============================================================================

async function updateJobWithIntegration(jobId: string, integrationId: string): Promise<void> {
  await prisma.scrapeJob.update({
    where: { id: jobId },
    data: {
      result: {
        // Preserve existing result, add integration reference
        integrationId,
      },
    },
  });
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Get processing status summary
 */
export function getProcessingStatusMessage(result: ProcessDocumentationResult): string {
  if (result.success) {
    return `Successfully created integration "${result.integration?.name}" with ${result.stats.actionsCreated} actions`;
  }

  const errorSummary = result.errors.map((e) => `${e.stage}: ${e.message}`).join('; ');
  return `Processing failed: ${errorSummary}`;
}

/**
 * Check if result has partial success (integration created but some actions failed)
 */
export function isPartialSuccess(result: ProcessDocumentationResult): boolean {
  return (
    result.integration !== undefined &&
    result.stats.actionsCreated > 0 &&
    result.stats.actionsFailed > 0
  );
}
