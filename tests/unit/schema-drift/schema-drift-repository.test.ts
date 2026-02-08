/**
 * Schema Drift Detection Repository Unit Tests
 *
 * Tests for data access layer: upsert dedup, pagination, filtering,
 * status updates with timestamps, count queries, and bulk operations.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/db/client', () => ({
  default: {
    driftReport: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      count: vi.fn(),
      groupBy: vi.fn(),
    },
  },
}));

import prisma from '@/lib/db/client';
import {
  upsertDriftReport,
  findDriftReportById,
  findDriftReportsByIntegration,
  updateDriftReportStatus,
  countUnresolvedByIntegration,
  countUnresolvedByTenant,
  bulkResolveByAction,
} from '@/lib/modules/schema-drift/schema-drift.repository';

const UUID_1 = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
const UUID_2 = 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e';
const UUID_3 = 'c3d4e5f6-a7b8-4c9d-0e1f-2a3b4c5d6e7f';

const baseInput = {
  integrationId: UUID_1,
  tenantId: UUID_2,
  actionId: UUID_3,
  fingerprint: 'fp_abc123',
  issueCode: 'type_mismatch',
  severity: 'breaking' as const,
  fieldPath: 'data.email',
  expectedType: 'string',
  currentType: 'null',
  description: "Field 'data.email' type changed from string to null",
  failureCount: 10,
};

describe('upsertDriftReport', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.resetAllMocks());

  it('should create new report when no existing report found', async () => {
    vi.mocked(prisma.driftReport.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.driftReport.create).mockResolvedValue({} as never);

    const wasCreated = await upsertDriftReport(baseInput);

    expect(wasCreated).toBe(true);
    expect(prisma.driftReport.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          integrationId: UUID_1,
          tenantId: UUID_2,
          actionId: UUID_3,
          fingerprint: 'fp_abc123',
          status: 'detected',
          scanCount: 1,
        }),
      })
    );
  });

  it('should update existing unresolved report (detected)', async () => {
    vi.mocked(prisma.driftReport.findUnique).mockResolvedValue({
      id: 'existing-id',
      status: 'detected',
    } as never);
    vi.mocked(prisma.driftReport.update).mockResolvedValue({} as never);

    const wasCreated = await upsertDriftReport(baseInput);

    expect(wasCreated).toBe(false);
    expect(prisma.driftReport.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'existing-id' },
        data: expect.objectContaining({
          scanCount: { increment: 1 },
          failureCount: 10,
        }),
      })
    );
    expect(prisma.driftReport.create).not.toHaveBeenCalled();
  });

  it('should update existing acknowledged report', async () => {
    vi.mocked(prisma.driftReport.findUnique).mockResolvedValue({
      id: 'existing-id',
      status: 'acknowledged',
    } as never);
    vi.mocked(prisma.driftReport.update).mockResolvedValue({} as never);

    const wasCreated = await upsertDriftReport(baseInput);

    expect(wasCreated).toBe(false);
    expect(prisma.driftReport.update).toHaveBeenCalled();
  });

  it('should skip resolved report (returns false, no create/update)', async () => {
    vi.mocked(prisma.driftReport.findUnique).mockResolvedValue({
      id: 'existing-id',
      status: 'resolved',
    } as never);

    const wasCreated = await upsertDriftReport(baseInput);

    expect(wasCreated).toBe(false);
    expect(prisma.driftReport.create).not.toHaveBeenCalled();
    expect(prisma.driftReport.update).not.toHaveBeenCalled();
  });

  it('should skip dismissed report (returns false, no create/update)', async () => {
    vi.mocked(prisma.driftReport.findUnique).mockResolvedValue({
      id: 'existing-id',
      status: 'dismissed',
    } as never);

    const wasCreated = await upsertDriftReport(baseInput);

    expect(wasCreated).toBe(false);
    expect(prisma.driftReport.create).not.toHaveBeenCalled();
    expect(prisma.driftReport.update).not.toHaveBeenCalled();
  });

  it('should look up by composite unique index (integrationId + fingerprint)', async () => {
    vi.mocked(prisma.driftReport.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.driftReport.create).mockResolvedValue({} as never);

    await upsertDriftReport(baseInput);

    expect(prisma.driftReport.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          drift_reports_integration_fingerprint_idx: {
            integrationId: UUID_1,
            fingerprint: 'fp_abc123',
          },
        },
      })
    );
  });
});

describe('findDriftReportById', () => {
  beforeEach(() => vi.clearAllMocks());

  it('should find report by ID with tenant scope', async () => {
    const mockReport = { id: UUID_1, tenantId: UUID_2 };
    vi.mocked(prisma.driftReport.findFirst).mockResolvedValue(mockReport as never);

    const result = await findDriftReportById(UUID_1, UUID_2);

    expect(result).toEqual(mockReport);
    expect(prisma.driftReport.findFirst).toHaveBeenCalledWith({
      where: { id: UUID_1, tenantId: UUID_2 },
    });
  });

  it('should return null when report not found', async () => {
    vi.mocked(prisma.driftReport.findFirst).mockResolvedValue(null);

    const result = await findDriftReportById(UUID_1, UUID_2);

    expect(result).toBeNull();
  });
});

describe('findDriftReportsByIntegration', () => {
  beforeEach(() => vi.clearAllMocks());

  it('should return paginated results with default limit', async () => {
    const mockReports = Array.from({ length: 20 }, (_, i) => ({
      id: `report-${i}`,
      integrationId: UUID_1,
      tenantId: UUID_2,
    }));
    vi.mocked(prisma.driftReport.count).mockResolvedValue(20);
    vi.mocked(prisma.driftReport.findMany).mockResolvedValue(mockReports as never);

    const result = await findDriftReportsByIntegration(UUID_1, UUID_2);

    expect(result.reports).toHaveLength(20);
    expect(result.nextCursor).toBeNull();
    expect(result.totalCount).toBe(20);
  });

  it('should set hasMore when more results exist', async () => {
    // Returns limit+1 items to signal more
    const mockReports = Array.from({ length: 6 }, (_, i) => ({
      id: `report-${i}`,
    }));
    vi.mocked(prisma.driftReport.count).mockResolvedValue(10);
    vi.mocked(prisma.driftReport.findMany).mockResolvedValue(mockReports as never);

    const result = await findDriftReportsByIntegration(UUID_1, UUID_2, { limit: 5 });

    expect(result.reports).toHaveLength(5);
    expect(result.nextCursor).toBe('report-4');
  });

  it('should apply cursor-based pagination', async () => {
    vi.mocked(prisma.driftReport.count).mockResolvedValue(5);
    vi.mocked(prisma.driftReport.findMany).mockResolvedValue([] as never);

    await findDriftReportsByIntegration(UUID_1, UUID_2, { cursor: 'cursor-id', limit: 10 });

    expect(prisma.driftReport.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 11,
        cursor: { id: 'cursor-id' },
        skip: 1,
      })
    );
  });

  it('should apply severity filter', async () => {
    vi.mocked(prisma.driftReport.count).mockResolvedValue(0);
    vi.mocked(prisma.driftReport.findMany).mockResolvedValue([]);

    await findDriftReportsByIntegration(UUID_1, UUID_2, {}, { severity: 'breaking' });

    expect(prisma.driftReport.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ severity: 'breaking' }),
      })
    );
  });

  it('should apply status filter', async () => {
    vi.mocked(prisma.driftReport.count).mockResolvedValue(0);
    vi.mocked(prisma.driftReport.findMany).mockResolvedValue([]);

    await findDriftReportsByIntegration(UUID_1, UUID_2, {}, { status: 'detected' });

    expect(prisma.driftReport.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'detected' }),
      })
    );
  });

  it('should apply actionId filter', async () => {
    vi.mocked(prisma.driftReport.count).mockResolvedValue(0);
    vi.mocked(prisma.driftReport.findMany).mockResolvedValue([]);

    await findDriftReportsByIntegration(UUID_1, UUID_2, {}, { actionId: UUID_3 });

    expect(prisma.driftReport.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ actionId: UUID_3 }),
      })
    );
  });

  it('should order by lastDetectedAt desc', async () => {
    vi.mocked(prisma.driftReport.count).mockResolvedValue(0);
    vi.mocked(prisma.driftReport.findMany).mockResolvedValue([]);

    await findDriftReportsByIntegration(UUID_1, UUID_2);

    expect(prisma.driftReport.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { lastDetectedAt: 'desc' },
      })
    );
  });
});

describe('updateDriftReportStatus', () => {
  beforeEach(() => vi.clearAllMocks());

  it('should set acknowledgedAt when acknowledging', async () => {
    vi.mocked(prisma.driftReport.update).mockResolvedValue({} as never);

    await updateDriftReportStatus(UUID_1, UUID_2, 'acknowledged' as never);

    expect(prisma.driftReport.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'acknowledged',
          acknowledgedAt: expect.any(Date),
        }),
      })
    );
  });

  it('should set resolvedAt when resolving', async () => {
    vi.mocked(prisma.driftReport.update).mockResolvedValue({} as never);

    await updateDriftReportStatus(UUID_1, UUID_2, 'resolved' as never);

    expect(prisma.driftReport.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'resolved',
          resolvedAt: expect.any(Date),
        }),
      })
    );
  });

  it('should not set extra timestamps when dismissing', async () => {
    vi.mocked(prisma.driftReport.update).mockResolvedValue({} as never);

    await updateDriftReportStatus(UUID_1, UUID_2, 'dismissed' as never);

    const callData = vi.mocked(prisma.driftReport.update).mock.calls[0][0].data;
    expect(callData).toEqual({ status: 'dismissed' });
  });

  it('should scope update by both id and tenantId', async () => {
    vi.mocked(prisma.driftReport.update).mockResolvedValue({} as never);

    await updateDriftReportStatus(UUID_1, UUID_2, 'resolved' as never);

    expect(prisma.driftReport.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: UUID_1, tenantId: UUID_2 },
      })
    );
  });
});

describe('countUnresolvedByIntegration', () => {
  beforeEach(() => vi.clearAllMocks());

  it('should return counts grouped by severity', async () => {
    vi.mocked(prisma.driftReport.groupBy).mockResolvedValue([
      { severity: 'breaking', _count: 3 },
      { severity: 'warning', _count: 1 },
    ] as never);

    const result = await countUnresolvedByIntegration(UUID_1);

    expect(result).toEqual({ breaking: 3, warning: 1, info: 0 });
  });

  it('should return all zeros when no unresolved reports', async () => {
    vi.mocked(prisma.driftReport.groupBy).mockResolvedValue([] as never);

    const result = await countUnresolvedByIntegration(UUID_1);

    expect(result).toEqual({ breaking: 0, warning: 0, info: 0 });
  });

  it('should only count detected and acknowledged statuses', async () => {
    vi.mocked(prisma.driftReport.groupBy).mockResolvedValue([] as never);

    await countUnresolvedByIntegration(UUID_1);

    expect(prisma.driftReport.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          integrationId: UUID_1,
          status: { in: ['detected', 'acknowledged'] },
        }),
      })
    );
  });
});

describe('countUnresolvedByTenant', () => {
  beforeEach(() => vi.clearAllMocks());

  it('should return counts grouped by severity for tenant', async () => {
    vi.mocked(prisma.driftReport.groupBy).mockResolvedValue([
      { severity: 'info', _count: 5 },
    ] as never);

    const result = await countUnresolvedByTenant(UUID_2);

    expect(result).toEqual({ breaking: 0, warning: 0, info: 5 });
  });

  it('should scope by tenantId', async () => {
    vi.mocked(prisma.driftReport.groupBy).mockResolvedValue([] as never);

    await countUnresolvedByTenant(UUID_2);

    expect(prisma.driftReport.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: UUID_2,
          status: { in: ['detected', 'acknowledged'] },
        }),
      })
    );
  });
});

describe('bulkResolveByAction', () => {
  beforeEach(() => vi.clearAllMocks());

  it('should resolve all unresolved reports for an action', async () => {
    vi.mocked(prisma.driftReport.updateMany).mockResolvedValue({ count: 5 } as never);

    const count = await bulkResolveByAction(UUID_3, UUID_2);

    expect(count).toBe(5);
    expect(prisma.driftReport.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          actionId: UUID_3,
          tenantId: UUID_2,
          status: { in: ['detected', 'acknowledged'] },
        },
        data: expect.objectContaining({
          status: 'resolved',
          resolvedAt: expect.any(Date),
        }),
      })
    );
  });

  it('should return 0 when no matching reports', async () => {
    vi.mocked(prisma.driftReport.updateMany).mockResolvedValue({ count: 0 } as never);

    const count = await bulkResolveByAction(UUID_3, UUID_2);

    expect(count).toBe(0);
  });
});
