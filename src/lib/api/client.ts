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

  post<T>(endpoint: string, body?: unknown) {
    return request<T>(endpoint, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
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
  },

  /**
   * Scrape Job API methods
   */
  scrape: {
    create(input: CreateScrapeJobInput) {
      return apiClient.post<CreateScrapeJobResponse>('/scrape', input);
    },

    getStatus(jobId: string) {
      return apiClient.get<ScrapeJobResponse>(`/scrape/${jobId}`);
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

    get(id: string) {
      return apiClient.get<ActionResponse>(`/actions/${id}`);
    },

    create(input: CreateActionInput) {
      return apiClient.post<ActionResponse>('/actions', input);
    },

    update(id: string, input: UpdateActionInput) {
      return apiClient.patch<ActionResponse>(`/actions/${id}`, input);
    },

    delete(id: string) {
      return apiClient.delete<void>(`/actions/${id}`);
    },
  },
};
