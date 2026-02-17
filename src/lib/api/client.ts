/**
 * API Client
 *
 * Centralized API client for making requests to the Waygate API.
 * All API calls should go through this client for consistent error handling.
 */

import type { ApiResponse } from '@/types/api';
import type {
  CreateScrapeJobInput,
  CreateScrapeJobResponse,
  ScrapeJobResponse,
} from '@/lib/modules/ai/scrape-job.schemas';
import type {
  CreateIntegrationInput,
  IntegrationResponse,
  IntegrationSummary,
  ListIntegrationsQuery,
} from '@/lib/modules/integrations/integration.schemas';
import type {
  ActionResponse,
  ActionSummary,
  CreateActionInput,
  UpdateActionInput,
  ListActionsQuery,
} from '@/lib/modules/actions/action.schemas';

const API_BASE_URL = '/api/v1';

// Get API key for development (this key is only used in development mode)
const DEV_API_KEY = process.env.NEXT_PUBLIC_DEV_API_KEY;

export class ApiError extends Error {
  code: string;
  status: number;
  details?: Record<string, unknown>;

  constructor(message: string, code: string, status: number, details?: Record<string, unknown>) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

interface RequestOptions extends RequestInit {
  params?: Record<string, string | number | boolean | undefined>;
}

/**
 * Makes a request to the API and handles errors consistently
 */
async function request<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
  const { params, ...fetchOptions } = options;

  // Build URL with query parameters
  let url = `${API_BASE_URL}${endpoint}`;
  if (params) {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) {
        searchParams.append(key, String(value));
      }
    });
    const queryString = searchParams.toString();
    if (queryString) {
      url += `?${queryString}`;
    }
  }

  // Default headers
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(DEV_API_KEY ? { Authorization: `Bearer ${DEV_API_KEY}` } : {}),
    ...fetchOptions.headers,
  };

  const response = await fetch(url, {
    ...fetchOptions,
    headers,
  });

  // Parse response
  const data = (await response.json()) as ApiResponse<T>;

  // Handle error responses
  if (!response.ok || !data.success) {
    const error = data.error || {
      code: 'UNKNOWN_ERROR',
      message: 'An unknown error occurred',
    };
    throw new ApiError(error.message, error.code, response.status, error.details);
  }

  return data.data as T;
}

/**
 * API client with methods for each HTTP verb
 */
export const apiClient = {
  get<T>(endpoint: string, params?: Record<string, string | number | boolean | undefined>) {
    return request<T>(endpoint, { method: 'GET', params });
  },

  post<T>(endpoint: string, body?: unknown, options?: { headers?: Record<string, string> }) {
    return request<T>(endpoint, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
      headers: options?.headers,
    });
  },

  patch<T>(endpoint: string, body?: unknown) {
    return request<T>(endpoint, {
      method: 'PATCH',
      body: body ? JSON.stringify(body) : undefined,
    });
  },

  put<T>(endpoint: string, body?: unknown) {
    return request<T>(endpoint, {
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined,
    });
  },

  delete<T>(endpoint: string) {
    return request<T>(endpoint, { method: 'DELETE' });
  },
};

// =============================================================================
// Domain-Specific Client Methods
// =============================================================================

export const client = {
  /**
   * Integration API methods
   */
  integrations: {
    list(params?: Partial<ListIntegrationsQuery>) {
      return apiClient.get<{
        integrations: IntegrationSummary[];
        pagination: { cursor: string | null; hasMore: boolean; totalCount: number };
      }>('/integrations', params as Record<string, string | number | boolean | undefined>);
    },

    get(id: string) {
      return apiClient.get<IntegrationResponse>(`/integrations/${id}`);
    },

    create(input: CreateIntegrationInput) {
      return apiClient.post<IntegrationResponse>('/integrations', input);
    },

    update(id: string, input: Partial<CreateIntegrationInput>) {
      return apiClient.patch<IntegrationResponse>(`/integrations/${id}`, input);
    },

    delete(id: string) {
      return apiClient.delete<void>(`/integrations/${id}`);
    },

    /**
     * Discover new actions for an integration using AI with a wishlist
     * Returns a job ID to poll for results
     */
    discoverActions(
      id: string,
      wishlist: string[],
      options?: { forceRescrape?: boolean; specificUrls?: string[] }
    ) {
      return apiClient.post<{
        jobId: string;
        message: string;
        existingEndpointCount: number;
      }>(`/integrations/${id}/discover-actions`, {
        wishlist,
        forceRescrape: options?.forceRescrape,
        specificUrls: options?.specificUrls,
      });
    },
  },

  /**
   * Scrape Job API methods
   */
  scrape: {
    create(input: CreateScrapeJobInput, options?: { force?: boolean }) {
      // Use async mode (sync: false) to get immediate response with job ID
      // This allows the UI to show progress while scraping happens in background
      return apiClient.post<CreateScrapeJobResponse>('/scrape', {
        ...input,
        sync: false,
        force: options?.force ?? false,
      });
    },

    getStatus(jobId: string) {
      return apiClient.get<ScrapeJobResponse>(`/scrape/${jobId}`);
    },

    /**
     * Re-analyze a completed job by re-running AI extraction on cached content
     * Returns updated job with new extraction results
     */
    reanalyze(jobId: string) {
      return apiClient.post<{
        jobId: string;
        status: string;
        result?: unknown;
        endpointCount?: number;
        error?: unknown;
        message: string;
      }>(`/scrape/${jobId}/reanalyze`);
    },

    /**
     * Cancel a running scrape job
     */
    cancel(jobId: string) {
      return apiClient.post<{
        jobId: string;
        status: string;
        message: string;
      }>(`/scrape/${jobId}/cancel`);
    },
  },

  /**
   * Action API methods
   */
  actions: {
    list(integrationId: string, params?: Partial<ListActionsQuery>) {
      return apiClient.get<{
        actions: ActionResponse[];
        pagination: { cursor: string | null; hasMore: boolean; totalCount: number };
      }>(
        `/integrations/${integrationId}/actions`,
        params as Record<string, string | number | boolean | undefined>
      );
    },

    listSummaries(integrationId: string, params?: Partial<ListActionsQuery>) {
      return apiClient.get<{
        actions: ActionSummary[];
        pagination: { cursor: string | null; hasMore: boolean; totalCount: number };
      }>(`/integrations/${integrationId}/actions`, { ...params, fields: 'summary' } as Record<
        string,
        string | number | boolean | undefined
      >);
    },

    get(id: string, integrationId?: string) {
      // If integrationId is provided, use nested route; otherwise fetch action to get integrationId first
      if (integrationId) {
        return apiClient.get<ActionResponse>(`/integrations/${integrationId}/actions/${id}`);
      }
      // Fallback: try to get action by fetching from all known integrations
      // For now, throw an error since we need the integration context
      throw new Error('integrationId is required to fetch action. Use getWithIntegration instead.');
    },

    getWithIntegration(actionId: string, integrationId: string) {
      return apiClient.get<ActionResponse>(`/integrations/${integrationId}/actions/${actionId}`);
    },

    create(input: CreateActionInput) {
      // Actions must be created under an integration
      return apiClient.post<ActionResponse>(`/integrations/${input.integrationId}/actions`, input);
    },

    update(id: string, input: UpdateActionInput, integrationId?: string) {
      if (integrationId) {
        return apiClient.patch<ActionResponse>(
          `/integrations/${integrationId}/actions/${id}`,
          input
        );
      }
      // Fallback to old route for backwards compatibility
      return apiClient.patch<ActionResponse>(`/actions/${id}`, input);
    },

    delete(id: string, integrationId?: string) {
      if (integrationId) {
        return apiClient.delete<void>(`/integrations/${integrationId}/actions/${id}`);
      }
      // Fallback to old route for backwards compatibility
      return apiClient.delete<void>(`/actions/${id}`);
    },

    /**
     * Get cached actions from previous scrape results
     * Returns actions that are available but not yet added to the integration
     */
    getCached(integrationId: string) {
      return apiClient.get<{
        actions: Array<{
          name: string;
          slug: string;
          method: string;
          path: string;
          description?: string;
          parameters?: unknown[];
          responseSchema?: unknown;
          alreadyAdded: boolean;
        }>;
        scrapeJobId: string | null;
        documentationUrl: string | null;
        canRescrape: boolean;
      }>(`/integrations/${integrationId}/cached-actions`);
    },

    /**
     * Get scraped documentation pages for an integration
     * Returns URLs and last-scraped dates aggregated across all scrape jobs
     */
    getScrapedPages(integrationId: string) {
      return apiClient.get<{
        pages: Array<{ url: string; lastScrapedAt: string }>;
        documentationUrl: string | null;
        totalJobs: number;
      }>(`/integrations/${integrationId}/scraped-pages`);
    },

    /**
     * Regenerate AI tool descriptions for an action
     * Uses LLM to generate optimized tool description, success template, and error template
     */
    regenerateToolDescriptions(actionId: string, integrationId: string) {
      return apiClient.post<{
        toolDescription: string;
        toolSuccessTemplate: string;
        toolErrorTemplate: string;
      }>(`/integrations/${integrationId}/actions/${actionId}/regenerate-tool-descriptions`);
    },
  },
};
