/**
 * Scrape Job Service Unit Tests
 *
 * Tests for scrape job business logic and state management.
 * Uses mocked repository and external service dependencies.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ScrapeJobError } from '@/lib/modules/ai/scrape-job.service';
import { ScrapeJobStatus } from '@prisma/client';

// =============================================================================
// Test Setup - Mock Dependencies
// =============================================================================

// Mock the repository
vi.mock('@/lib/modules/ai/scrape-job.repository', () => ({
  createScrapeJob: vi.fn(),
  findScrapeJobByIdAndTenant: vi.fn(),
  findScrapeJobsByTenant: vi.fn(),
  findScrapeJobByUrl: vi.fn(),
  findScrapeJobById: vi.fn(),
  updateScrapeJob: vi.fn(),
  updateScrapeJobStatus: vi.fn(),
  markScrapeJobFailed: vi.fn(),
  markScrapeJobCompleted: vi.fn(),
}));

// Mock the doc scraper
vi.mock('@/lib/modules/ai/doc-scraper', () => ({
  scrapeDocumentation: vi.fn(),
  crawlDocumentation: vi.fn(),
  isScrapeError: vi.fn(() => false),
}));

// Mock the document parser
vi.mock('@/lib/modules/ai/document-parser', () => ({
  parseApiDocumentation: vi.fn(),
  isParseError: vi.fn(() => false),
}));

// Mock the OpenAPI parser
vi.mock('@/lib/modules/ai/openapi-parser', () => ({
  parseOpenApiSpec: vi.fn(),
  isOpenApiSpec: vi.fn(() => false),
  isOpenApiParseError: vi.fn(() => false),
}));

// Mock storage
vi.mock('@/lib/modules/ai/storage', () => ({
  storeScrapedContent: vi.fn(),
  isStorageError: vi.fn(() => false),
}));

// Import after mocks are set up
import {
  createScrapeJob,
  getScrapeJob,
  listScrapeJobs,
  updateJobStatus,
  updateJobProgress,
  completeJob,
  failJob,
  canRetryJob,
  isJobRunning,
} from '@/lib/modules/ai/scrape-job.service';

import * as repo from '@/lib/modules/ai/scrape-job.repository';

// =============================================================================
// Test Fixtures
// =============================================================================

const mockJob = {
  id: 'job-123',
  tenantId: 'tenant-456',
  status: 'PENDING' as ScrapeJobStatus,
  documentationUrl: 'https://docs.example.com',
  specificUrls: [] as string[],
  wishlist: ['send message'],
  progress: 0,
  result: null,
  error: null,
  cachedContentKey: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  completedAt: null,
};

const mockCompletedJob = {
  ...mockJob,
  status: 'COMPLETED' as ScrapeJobStatus,
  progress: 100,
  result: {
    name: 'Test API',
    baseUrl: 'https://api.example.com',
    authMethods: [],
    endpoints: [
      {
        name: 'Get Users',
        slug: 'get-users',
        method: 'GET',
        path: '/users',
        description: 'List all users',
      },
    ],
  },
  completedAt: new Date(),
};

const mockFailedJob = {
  ...mockJob,
  status: 'FAILED' as ScrapeJobStatus,
  error: {
    code: 'SCRAPE_FAILED',
    message: 'Failed to scrape',
    retryable: true,
    occurredAt: new Date().toISOString(),
  },
  completedAt: new Date(),
};

// =============================================================================
// Setup / Teardown
// =============================================================================

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.resetAllMocks();
});

// =============================================================================
// createScrapeJob Tests
// =============================================================================

describe('createScrapeJob', () => {
  it('should create a new job with PENDING status', async () => {
    vi.mocked(repo.findScrapeJobByUrl).mockResolvedValue(null);
    vi.mocked(repo.createScrapeJob).mockResolvedValue(mockJob);

    const result = await createScrapeJob('tenant-456', {
      documentationUrl: 'https://docs.example.com',
      wishlist: ['send message'],
    });

    expect(result.jobId).toBe('job-123');
    expect(result.status).toBe('PENDING');
    expect(result.estimatedDuration).toBeGreaterThan(0);
    expect(repo.createScrapeJob).toHaveBeenCalledWith({
      tenantId: 'tenant-456',
      documentationUrl: 'https://docs.example.com',
      specificUrls: [],
      wishlist: ['send message'],
    });
  });

  it('should return existing completed job if URL was previously scraped', async () => {
    vi.mocked(repo.findScrapeJobByUrl).mockResolvedValue(mockCompletedJob);

    const result = await createScrapeJob('tenant-456', {
      documentationUrl: 'https://docs.example.com',
      wishlist: [],
    });

    expect(result.jobId).toBe('job-123');
    expect(result.status).toBe('COMPLETED');
    expect(result.estimatedDuration).toBe(0);
    expect(repo.createScrapeJob).not.toHaveBeenCalled();
  });

  it('should throw ScrapeJobError for invalid input', async () => {
    await expect(
      createScrapeJob('tenant-456', {
        documentationUrl: 'not-a-valid-url',
        wishlist: [],
      })
    ).rejects.toThrow(ScrapeJobError);
  });

  it('should throw ScrapeJobError for missing URL', async () => {
    await expect(
      // @ts-expect-error - Testing invalid input
      createScrapeJob('tenant-456', {})
    ).rejects.toThrow(ScrapeJobError);
  });
});

// =============================================================================
// getScrapeJob Tests
// =============================================================================

describe('getScrapeJob', () => {
  it('should return job status for pending job', async () => {
    vi.mocked(repo.findScrapeJobByIdAndTenant).mockResolvedValue(mockJob);

    const result = await getScrapeJob('tenant-456', 'job-123');

    expect(result.jobId).toBe('job-123');
    expect(result.status).toBe('PENDING');
    expect(result.documentationUrl).toBe('https://docs.example.com');
  });

  it('should include result for completed job', async () => {
    vi.mocked(repo.findScrapeJobByIdAndTenant).mockResolvedValue(mockCompletedJob);

    const result = await getScrapeJob('tenant-456', 'job-123');

    expect(result.status).toBe('COMPLETED');
    expect('result' in result).toBe(true);
    if ('result' in result) {
      expect(result.result).toBeDefined();
    }
  });

  it('should include error for failed job', async () => {
    vi.mocked(repo.findScrapeJobByIdAndTenant).mockResolvedValue(mockFailedJob);

    const result = await getScrapeJob('tenant-456', 'job-123');

    expect(result.status).toBe('FAILED');
    expect('error' in result).toBe(true);
  });

  it('should throw ScrapeJobError for non-existent job', async () => {
    vi.mocked(repo.findScrapeJobByIdAndTenant).mockResolvedValue(null);

    await expect(getScrapeJob('tenant-456', 'invalid-id')).rejects.toThrow(ScrapeJobError);
  });

  it('should enforce tenant isolation', async () => {
    vi.mocked(repo.findScrapeJobByIdAndTenant).mockResolvedValue(null);

    await expect(getScrapeJob('other-tenant', 'job-123')).rejects.toThrow(ScrapeJobError);

    expect(repo.findScrapeJobByIdAndTenant).toHaveBeenCalledWith('job-123', 'other-tenant');
  });
});

// =============================================================================
// listScrapeJobs Tests
// =============================================================================

describe('listScrapeJobs', () => {
  it('should return list of jobs for tenant', async () => {
    vi.mocked(repo.findScrapeJobsByTenant).mockResolvedValue([mockJob, mockCompletedJob]);

    const result = await listScrapeJobs('tenant-456');

    expect(result).toHaveLength(2);
    expect(repo.findScrapeJobsByTenant).toHaveBeenCalledWith('tenant-456', {
      status: undefined,
    });
  });

  it('should filter by status', async () => {
    vi.mocked(repo.findScrapeJobsByTenant).mockResolvedValue([mockCompletedJob]);

    const result = await listScrapeJobs('tenant-456', { status: 'COMPLETED' });

    expect(result).toHaveLength(1);
    expect(repo.findScrapeJobsByTenant).toHaveBeenCalledWith('tenant-456', {
      status: 'COMPLETED',
    });
  });

  it('should respect limit', async () => {
    vi.mocked(repo.findScrapeJobsByTenant).mockResolvedValue([
      mockJob,
      mockCompletedJob,
      mockFailedJob,
    ]);

    const result = await listScrapeJobs('tenant-456', { limit: 2 });

    expect(result).toHaveLength(2);
  });
});

// =============================================================================
// updateJobStatus Tests
// =============================================================================

describe('updateJobStatus', () => {
  it('should update status and progress', async () => {
    vi.mocked(repo.updateScrapeJobStatus).mockResolvedValue({
      ...mockJob,
      status: 'CRAWLING' as ScrapeJobStatus,
      progress: 25,
    });

    const result = await updateJobStatus('job-123', 'CRAWLING');

    expect(result.status).toBe('CRAWLING');
    expect(repo.updateScrapeJobStatus).toHaveBeenCalledWith('job-123', 'CRAWLING', 25);
  });

  it('should use default progress for status', async () => {
    vi.mocked(repo.updateScrapeJobStatus).mockResolvedValue({
      ...mockJob,
      status: 'PARSING' as ScrapeJobStatus,
      progress: 50,
    });

    await updateJobStatus('job-123', 'PARSING');

    expect(repo.updateScrapeJobStatus).toHaveBeenCalledWith('job-123', 'PARSING', 50);
  });

  it('should allow custom progress', async () => {
    vi.mocked(repo.updateScrapeJobStatus).mockResolvedValue({
      ...mockJob,
      status: 'CRAWLING' as ScrapeJobStatus,
      progress: 35,
    });

    await updateJobStatus('job-123', 'CRAWLING', 35);

    expect(repo.updateScrapeJobStatus).toHaveBeenCalledWith('job-123', 'CRAWLING', 35);
  });
});

// =============================================================================
// updateJobProgress Tests
// =============================================================================

describe('updateJobProgress', () => {
  it('should update progress only', async () => {
    vi.mocked(repo.updateScrapeJob).mockResolvedValue({
      ...mockJob,
      progress: 45,
    });

    const result = await updateJobProgress('job-123', 45);

    expect(result.progress).toBe(45);
    expect(repo.updateScrapeJob).toHaveBeenCalledWith('job-123', { progress: 45 });
  });

  it('should throw for invalid progress values', async () => {
    await expect(updateJobProgress('job-123', -1)).rejects.toThrow(ScrapeJobError);
    await expect(updateJobProgress('job-123', 101)).rejects.toThrow(ScrapeJobError);
  });

  it('should accept boundary values', async () => {
    vi.mocked(repo.updateScrapeJob).mockResolvedValue({ ...mockJob, progress: 0 });
    await expect(updateJobProgress('job-123', 0)).resolves.toBeDefined();

    vi.mocked(repo.updateScrapeJob).mockResolvedValue({ ...mockJob, progress: 100 });
    await expect(updateJobProgress('job-123', 100)).resolves.toBeDefined();
  });
});

// =============================================================================
// completeJob Tests
// =============================================================================

describe('completeJob', () => {
  it('should mark job as completed with result', async () => {
    const result = {
      name: 'Test API',
      baseUrl: 'https://api.example.com',
      authMethods: [],
      endpoints: [],
    };

    vi.mocked(repo.markScrapeJobCompleted).mockResolvedValue({
      ...mockJob,
      status: 'COMPLETED' as ScrapeJobStatus,
      progress: 100,
      result,
      completedAt: new Date(),
    });

    const job = await completeJob('job-123', result);

    expect(job.status).toBe('COMPLETED');
    expect(repo.markScrapeJobCompleted).toHaveBeenCalledWith(
      'job-123',
      expect.any(Object),
      undefined
    );
  });

  it('should include cached content key if provided', async () => {
    const result = {
      name: 'Test API',
      baseUrl: 'https://api.example.com',
      authMethods: [],
      endpoints: [],
    };

    vi.mocked(repo.markScrapeJobCompleted).mockResolvedValue(mockCompletedJob);

    await completeJob('job-123', result, 'cache-key-123');

    expect(repo.markScrapeJobCompleted).toHaveBeenCalledWith(
      'job-123',
      expect.any(Object),
      'cache-key-123'
    );
  });
});

// =============================================================================
// failJob Tests
// =============================================================================

describe('failJob', () => {
  it('should mark job as failed with error details', async () => {
    vi.mocked(repo.markScrapeJobFailed).mockResolvedValue(mockFailedJob);

    const job = await failJob('job-123', {
      code: 'SCRAPE_TIMEOUT',
      message: 'Request timed out',
      retryable: true,
    });

    expect(job.status).toBe('FAILED');
    expect(repo.markScrapeJobFailed).toHaveBeenCalledWith(
      'job-123',
      expect.objectContaining({
        code: 'SCRAPE_TIMEOUT',
        message: 'Request timed out',
        retryable: true,
        occurredAt: expect.any(String),
      })
    );
  });

  it('should include error details if provided', async () => {
    vi.mocked(repo.markScrapeJobFailed).mockResolvedValue(mockFailedJob);

    await failJob('job-123', {
      code: 'PARSE_ERROR',
      message: 'Parse failed',
      details: { lineNumber: 42 },
    });

    expect(repo.markScrapeJobFailed).toHaveBeenCalledWith(
      'job-123',
      expect.objectContaining({
        details: { lineNumber: 42 },
      })
    );
  });

  it('should default retryable to false', async () => {
    vi.mocked(repo.markScrapeJobFailed).mockResolvedValue(mockFailedJob);

    await failJob('job-123', {
      code: 'UNKNOWN',
      message: 'Something went wrong',
    });

    expect(repo.markScrapeJobFailed).toHaveBeenCalledWith(
      'job-123',
      expect.objectContaining({
        retryable: false,
      })
    );
  });
});

// =============================================================================
// canRetryJob Tests
// =============================================================================

describe('canRetryJob', () => {
  it('should return true for failed job with retryable error', () => {
    expect(canRetryJob(mockFailedJob)).toBe(true);
  });

  it('should return false for non-failed jobs', () => {
    expect(canRetryJob(mockJob)).toBe(false);
    expect(canRetryJob(mockCompletedJob)).toBe(false);
  });

  it('should return false for non-retryable error', () => {
    const nonRetryableJob = {
      ...mockFailedJob,
      error: {
        ...mockFailedJob.error,
        retryable: false,
      },
    };
    expect(canRetryJob(nonRetryableJob)).toBe(false);
  });
});

// =============================================================================
// isJobRunning Tests
// =============================================================================

describe('isJobRunning', () => {
  it('should return true for in-progress statuses', () => {
    expect(isJobRunning({ ...mockJob, status: 'PENDING' as ScrapeJobStatus })).toBe(true);
    expect(isJobRunning({ ...mockJob, status: 'CRAWLING' as ScrapeJobStatus })).toBe(true);
    expect(isJobRunning({ ...mockJob, status: 'PARSING' as ScrapeJobStatus })).toBe(true);
    expect(isJobRunning({ ...mockJob, status: 'GENERATING' as ScrapeJobStatus })).toBe(true);
  });

  it('should return false for terminal statuses', () => {
    expect(isJobRunning(mockCompletedJob)).toBe(false);
    expect(isJobRunning(mockFailedJob)).toBe(false);
  });
});

// =============================================================================
// ScrapeJobError Tests
// =============================================================================

describe('ScrapeJobError', () => {
  it('should create error with code and message', () => {
    const error = new ScrapeJobError('TEST_ERROR', 'Test message');
    expect(error.code).toBe('TEST_ERROR');
    expect(error.message).toBe('Test message');
    expect(error.statusCode).toBe(400); // Default
    expect(error.name).toBe('ScrapeJobError');
  });

  it('should accept custom status code', () => {
    const error = new ScrapeJobError('NOT_FOUND', 'Job not found', 404);
    expect(error.statusCode).toBe(404);
  });

  it('should be instanceof Error', () => {
    const error = new ScrapeJobError('TEST', 'Test');
    expect(error instanceof Error).toBe(true);
  });
});
