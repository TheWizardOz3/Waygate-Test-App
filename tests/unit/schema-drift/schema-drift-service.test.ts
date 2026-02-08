/**
 * Schema Drift Detection Service Unit Tests
 *
 * Tests for business logic: report listing, status transitions, summary
 * queries, config management, and bulk operations.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock Prisma
vi.mock('@/lib/db/client', () => ({
  default: {
    integration: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  },
}));

// Mock repository
vi.mock('@/lib/modules/schema-drift/schema-drift.repository', () => ({
  findDriftReportById: vi.fn(),
  findDriftReportsByIntegration: vi.fn(),
  updateDriftReportStatus: vi.fn(),
  countUnresolvedByIntegration: vi.fn(),
  bulkResolveByAction: vi.fn(),
}));

import prisma from '@/lib/db/client';
import {
  findDriftReportById,
  findDriftReportsByIntegration,
  updateDriftReportStatus as repoUpdateStatus,
  countUnresolvedByIntegration,
  bulkResolveByAction,
} from '@/lib/modules/schema-drift/schema-drift.repository';
import {
  listReports,
  getReport,
  updateReportStatus,
  getIntegrationDriftSummary,
  updateDriftConfig,
  resolveReportsForAction,
} from '@/lib/modules/schema-drift/schema-drift.service';
import {
  DriftReportNotFoundError,
  InvalidDriftStatusTransitionError,
  SchemaDriftError,
} from '@/lib/modules/schema-drift/schema-drift.errors';

const UUID_1 = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
const UUID_2 = 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e';
const UUID_3 = 'c3d4e5f6-a7b8-4c9d-0e1f-2a3b4c5d6e7f';
const UUID_4 = 'd4e5f6a7-b8c9-4d0e-1f2a-3b4c5d6e7f8a';

const now = new Date('2025-01-15T10:30:00.000Z');

function makeMockReport(overrides: Record<string, unknown> = {}) {
  return {
    id: UUID_3,
    integrationId: UUID_1,
    tenantId: UUID_2,
    actionId: UUID_4,
    fingerprint: 'fp123',
    issueCode: 'type_mismatch',
    severity: 'breaking' as const,
    status: 'detected' as const,
    fieldPath: 'data.email',
    expectedType: 'string',
    currentType: 'null',
    description: 'test',
    failureCount: 10,
    scanCount: 1,
    firstDetectedAt: now,
    lastDetectedAt: now,
    acknowledgedAt: null,
    resolvedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('listReports', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.resetAllMocks());

  it('should return paginated reports for an integration', async () => {
    vi.mocked(prisma.integration.findFirst).mockResolvedValue({
      id: UUID_1,
      tenantId: UUID_2,
    } as never);
    vi.mocked(findDriftReportsByIntegration).mockResolvedValue({
      reports: [makeMockReport()],
      nextCursor: null,
      totalCount: 1,
    });

    const result = await listReports(UUID_2, UUID_1);

    expect(result.reports).toHaveLength(1);
    expect(result.pagination.hasMore).toBe(false);
    expect(result.pagination.totalCount).toBe(1);
  });

  it('should throw when integration not found', async () => {
    vi.mocked(prisma.integration.findFirst).mockResolvedValue(null);

    await expect(listReports(UUID_2, UUID_1)).rejects.toThrow(SchemaDriftError);
  });

  it('should pass filters to repository', async () => {
    vi.mocked(prisma.integration.findFirst).mockResolvedValue({ id: UUID_1 } as never);
    vi.mocked(findDriftReportsByIntegration).mockResolvedValue({
      reports: [],
      nextCursor: null,
      totalCount: 0,
    });

    await listReports(UUID_2, UUID_1, {
      severity: 'breaking',
      status: 'detected',
      limit: 10,
    });

    expect(findDriftReportsByIntegration).toHaveBeenCalledWith(
      UUID_1,
      UUID_2,
      { cursor: undefined, limit: 10 },
      { severity: 'breaking', status: 'detected', actionId: undefined }
    );
  });

  it('should throw on invalid query params', async () => {
    await expect(listReports(UUID_2, UUID_1, { limit: 0 } as never)).rejects.toThrow(
      SchemaDriftError
    );
  });
});

describe('getReport', () => {
  beforeEach(() => vi.clearAllMocks());

  it('should return report when found', async () => {
    const mockReport = makeMockReport();
    vi.mocked(findDriftReportById).mockResolvedValue(mockReport as never);

    const result = await getReport(UUID_2, UUID_3);

    expect(result.id).toBe(UUID_3);
    expect(result.severity).toBe('breaking');
  });

  it('should throw DriftReportNotFoundError when not found', async () => {
    vi.mocked(findDriftReportById).mockResolvedValue(null);

    await expect(getReport(UUID_2, UUID_3)).rejects.toThrow(DriftReportNotFoundError);
  });
});

describe('updateReportStatus', () => {
  beforeEach(() => vi.clearAllMocks());

  it('should transition detected → acknowledged', async () => {
    vi.mocked(findDriftReportById).mockResolvedValue(
      makeMockReport({ status: 'detected' }) as never
    );
    vi.mocked(repoUpdateStatus).mockResolvedValue(
      makeMockReport({ status: 'acknowledged' }) as never
    );

    const result = await updateReportStatus(UUID_2, UUID_3, { status: 'acknowledged' });

    expect(result.status).toBe('acknowledged');
    expect(repoUpdateStatus).toHaveBeenCalledWith(UUID_3, UUID_2, 'acknowledged');
  });

  it('should transition detected → resolved', async () => {
    vi.mocked(findDriftReportById).mockResolvedValue(
      makeMockReport({ status: 'detected' }) as never
    );
    vi.mocked(repoUpdateStatus).mockResolvedValue(
      makeMockReport({ status: 'resolved', resolvedAt: now }) as never
    );

    const result = await updateReportStatus(UUID_2, UUID_3, { status: 'resolved' });

    expect(result.status).toBe('resolved');
  });

  it('should transition detected → dismissed', async () => {
    vi.mocked(findDriftReportById).mockResolvedValue(
      makeMockReport({ status: 'detected' }) as never
    );
    vi.mocked(repoUpdateStatus).mockResolvedValue(makeMockReport({ status: 'dismissed' }) as never);

    const result = await updateReportStatus(UUID_2, UUID_3, { status: 'dismissed' });

    expect(result.status).toBe('dismissed');
  });

  it('should transition acknowledged → resolved', async () => {
    vi.mocked(findDriftReportById).mockResolvedValue(
      makeMockReport({ status: 'acknowledged' }) as never
    );
    vi.mocked(repoUpdateStatus).mockResolvedValue(makeMockReport({ status: 'resolved' }) as never);

    const result = await updateReportStatus(UUID_2, UUID_3, { status: 'resolved' });

    expect(result.status).toBe('resolved');
  });

  it('should transition acknowledged → dismissed', async () => {
    vi.mocked(findDriftReportById).mockResolvedValue(
      makeMockReport({ status: 'acknowledged' }) as never
    );
    vi.mocked(repoUpdateStatus).mockResolvedValue(makeMockReport({ status: 'dismissed' }) as never);

    const result = await updateReportStatus(UUID_2, UUID_3, { status: 'dismissed' });

    expect(result.status).toBe('dismissed');
  });

  it('should reject resolved → acknowledged (terminal state)', async () => {
    vi.mocked(findDriftReportById).mockResolvedValue(
      makeMockReport({ status: 'resolved' }) as never
    );

    await expect(updateReportStatus(UUID_2, UUID_3, { status: 'acknowledged' })).rejects.toThrow(
      InvalidDriftStatusTransitionError
    );
  });

  it('should reject dismissed → resolved (terminal state)', async () => {
    vi.mocked(findDriftReportById).mockResolvedValue(
      makeMockReport({ status: 'dismissed' }) as never
    );

    await expect(updateReportStatus(UUID_2, UUID_3, { status: 'resolved' })).rejects.toThrow(
      InvalidDriftStatusTransitionError
    );
  });

  it('should throw DriftReportNotFoundError when report not found', async () => {
    vi.mocked(findDriftReportById).mockResolvedValue(null);

    await expect(updateReportStatus(UUID_2, UUID_3, { status: 'acknowledged' })).rejects.toThrow(
      DriftReportNotFoundError
    );
  });

  it('should throw on invalid input', async () => {
    await expect(
      updateReportStatus(UUID_2, UUID_3, { status: 'invalid' } as never)
    ).rejects.toThrow(SchemaDriftError);
  });
});

describe('getIntegrationDriftSummary', () => {
  beforeEach(() => vi.clearAllMocks());

  it('should return summary with total', async () => {
    vi.mocked(prisma.integration.findFirst).mockResolvedValue({ id: UUID_1 } as never);
    vi.mocked(countUnresolvedByIntegration).mockResolvedValue({
      breaking: 2,
      warning: 1,
      info: 3,
    });

    const result = await getIntegrationDriftSummary(UUID_2, UUID_1);

    expect(result).toEqual({
      breaking: 2,
      warning: 1,
      info: 3,
      total: 6,
    });
  });

  it('should return all zeros when no drift', async () => {
    vi.mocked(prisma.integration.findFirst).mockResolvedValue({ id: UUID_1 } as never);
    vi.mocked(countUnresolvedByIntegration).mockResolvedValue({
      breaking: 0,
      warning: 0,
      info: 0,
    });

    const result = await getIntegrationDriftSummary(UUID_2, UUID_1);

    expect(result.total).toBe(0);
  });

  it('should throw when integration not found', async () => {
    vi.mocked(prisma.integration.findFirst).mockResolvedValue(null);

    await expect(getIntegrationDriftSummary(UUID_2, UUID_1)).rejects.toThrow(SchemaDriftError);
  });
});

describe('updateDriftConfig', () => {
  beforeEach(() => vi.clearAllMocks());

  it('should merge partial config with existing', async () => {
    vi.mocked(prisma.integration.findFirst).mockResolvedValue({
      id: UUID_1,
      driftConfig: { enabled: true, sensitivity: 'medium', ignoreFieldPaths: ['data.debug'] },
    } as never);
    vi.mocked(prisma.integration.update).mockResolvedValue({} as never);

    const result = await updateDriftConfig(UUID_2, UUID_1, {
      sensitivity: 'high',
      ignoreFieldPaths: ['data.debug'],
    });

    expect(result).toEqual({
      enabled: true,
      sensitivity: 'high',
      ignoreFieldPaths: ['data.debug'],
    });
  });

  it('should use defaults when existing config is null', async () => {
    vi.mocked(prisma.integration.findFirst).mockResolvedValue({
      id: UUID_1,
      driftConfig: null,
    } as never);
    vi.mocked(prisma.integration.update).mockResolvedValue({} as never);

    const result = await updateDriftConfig(UUID_2, UUID_1, { enabled: false });

    expect(result).toEqual({
      enabled: false,
      sensitivity: 'medium',
      ignoreFieldPaths: [],
    });
  });

  it('should throw when integration not found', async () => {
    vi.mocked(prisma.integration.findFirst).mockResolvedValue(null);

    await expect(updateDriftConfig(UUID_2, UUID_1, { enabled: false })).rejects.toThrow(
      SchemaDriftError
    );
  });

  it('should throw on invalid config input', async () => {
    await expect(
      updateDriftConfig(UUID_2, UUID_1, { sensitivity: 'ultra' } as never)
    ).rejects.toThrow(SchemaDriftError);
  });
});

describe('resolveReportsForAction', () => {
  beforeEach(() => vi.clearAllMocks());

  it('should delegate to bulkResolveByAction', async () => {
    vi.mocked(bulkResolveByAction).mockResolvedValue(3);

    const count = await resolveReportsForAction(UUID_2, UUID_4);

    expect(count).toBe(3);
    expect(bulkResolveByAction).toHaveBeenCalledWith(UUID_4, UUID_2);
  });
});
