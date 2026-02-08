/**
 * Drift Passive Analysis Handler Unit Tests
 *
 * Tests for the background job handler that runs the passive analyzer
 * across all integrations with drift detection enabled.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock Prisma
vi.mock('@/lib/db/client', () => ({
  default: {
    integration: {
      findMany: vi.fn(),
    },
  },
}));

// Mock the analyzer
vi.mock('@/lib/modules/schema-drift/passive-drift-analyzer', () => ({
  analyzeIntegration: vi.fn(),
}));

import prisma from '@/lib/db/client';
import { analyzeIntegration } from '@/lib/modules/schema-drift/passive-drift-analyzer';
import { driftPassiveAnalysisHandler } from '@/lib/modules/schema-drift/handlers/drift-passive.handler';

const UUID_1 = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
const UUID_2 = 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e';
const UUID_3 = 'c3d4e5f6-a7b8-4c9d-0e1f-2a3b4c5d6e7f';
const UUID_4 = 'd4e5f6a7-b8c9-4d0e-1f2a-3b4c5d6e7f8a';

function createMockContext() {
  return {
    jobId: UUID_1,
    job: {
      id: UUID_1,
      type: 'schema_drift',
      status: 'running',
      input: {},
    },
    updateProgress: vi.fn(),
    isCancelled: vi.fn().mockReturnValue(false),
  };
}

describe('driftPassiveAnalysisHandler', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.resetAllMocks());

  it('should return early with zeros when no integrations found', async () => {
    vi.mocked(prisma.integration.findMany).mockResolvedValue([]);
    const ctx = createMockContext();

    const result = await driftPassiveAnalysisHandler(ctx as never);

    expect(result).toEqual({
      integrationsAnalyzed: 0,
      totalIntegrations: 0,
      reportsCreated: 0,
      reportsUpdated: 0,
    });
    expect(ctx.updateProgress).toHaveBeenCalledWith(
      100,
      expect.objectContaining({ stage: 'completed' })
    );
    expect(analyzeIntegration).not.toHaveBeenCalled();
  });

  it('should analyze all integrations and aggregate results', async () => {
    vi.mocked(prisma.integration.findMany).mockResolvedValue([
      { id: UUID_2, tenantId: UUID_3 },
      { id: UUID_4, tenantId: UUID_3 },
    ] as never);
    vi.mocked(analyzeIntegration)
      .mockResolvedValueOnce({ integrationId: UUID_2, reportsCreated: 2, reportsUpdated: 1 })
      .mockResolvedValueOnce({ integrationId: UUID_4, reportsCreated: 0, reportsUpdated: 3 });

    const ctx = createMockContext();
    const result = await driftPassiveAnalysisHandler(ctx as never);

    expect(result).toEqual(
      expect.objectContaining({
        integrationsAnalyzed: 2,
        totalIntegrations: 2,
        reportsCreated: 2,
        reportsUpdated: 4,
      })
    );
    expect(analyzeIntegration).toHaveBeenCalledTimes(2);
    expect(analyzeIntegration).toHaveBeenCalledWith(UUID_2, UUID_3);
    expect(analyzeIntegration).toHaveBeenCalledWith(UUID_4, UUID_3);
  });

  it('should update progress during analysis', async () => {
    vi.mocked(prisma.integration.findMany).mockResolvedValue([
      { id: UUID_2, tenantId: UUID_3 },
    ] as never);
    vi.mocked(analyzeIntegration).mockResolvedValue({
      integrationId: UUID_2,
      reportsCreated: 0,
      reportsUpdated: 0,
    });

    const ctx = createMockContext();
    await driftPassiveAnalysisHandler(ctx as never);

    // Should have progress calls: initial (0), analyzing (5), per-integration, final (100)
    expect(ctx.updateProgress).toHaveBeenCalledWith(
      0,
      expect.objectContaining({ stage: 'querying_integrations' })
    );
    expect(ctx.updateProgress).toHaveBeenCalledWith(
      5,
      expect.objectContaining({ stage: 'analyzing' })
    );
    expect(ctx.updateProgress).toHaveBeenCalledWith(
      100,
      expect.objectContaining({ stage: 'completed' })
    );
  });

  it('should continue processing when one integration fails', async () => {
    vi.mocked(prisma.integration.findMany).mockResolvedValue([
      { id: UUID_2, tenantId: UUID_3 },
      { id: UUID_4, tenantId: UUID_3 },
    ] as never);
    vi.mocked(analyzeIntegration)
      .mockRejectedValueOnce(new Error('DB connection lost'))
      .mockResolvedValueOnce({ integrationId: UUID_4, reportsCreated: 1, reportsUpdated: 0 });

    const ctx = createMockContext();
    const result = await driftPassiveAnalysisHandler(ctx as never);

    expect(result).toEqual(
      expect.objectContaining({
        integrationsAnalyzed: 2,
        totalIntegrations: 2,
        reportsCreated: 1,
        reportsUpdated: 0,
        errors: [
          expect.objectContaining({
            integrationId: UUID_2,
            error: 'DB connection lost',
          }),
        ],
      })
    );
    // Second integration should still be called
    expect(analyzeIntegration).toHaveBeenCalledTimes(2);
  });

  it('should not include errors in result when all succeed', async () => {
    vi.mocked(prisma.integration.findMany).mockResolvedValue([
      { id: UUID_2, tenantId: UUID_3 },
    ] as never);
    vi.mocked(analyzeIntegration).mockResolvedValue({
      integrationId: UUID_2,
      reportsCreated: 0,
      reportsUpdated: 0,
    });

    const ctx = createMockContext();
    const result = (await driftPassiveAnalysisHandler(ctx as never)) as Record<string, unknown>;

    expect(result).not.toHaveProperty('errors');
  });

  it('should query integrations where drift is not explicitly disabled', async () => {
    vi.mocked(prisma.integration.findMany).mockResolvedValue([]);
    const ctx = createMockContext();

    await driftPassiveAnalysisHandler(ctx as never);

    expect(prisma.integration.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          NOT: {
            driftConfig: { path: ['enabled'], equals: false },
          },
        },
        select: { id: true, tenantId: true },
      })
    );
  });
});
