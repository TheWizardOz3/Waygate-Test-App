/**
 * Maintenance Handler Unit Tests
 *
 * Tests for the auto-maintenance job handler that generates proposals
 * from drift reports. All external dependencies are mocked.
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

// Mock Prisma
vi.mock('@/lib/db/client', () => ({
  default: {
    integration: {
      findMany: vi.fn(),
    },
    maintenanceProposal: {
      findMany: vi.fn(),
    },
  },
}));

// Mock service functions
vi.mock('@/lib/modules/auto-maintenance/auto-maintenance.service', () => ({
  expireStaleProposals: vi.fn(),
  generateProposalsForIntegration: vi.fn(),
  approveProposal: vi.fn(),
}));

import prisma from '@/lib/db/client';
import {
  expireStaleProposals,
  generateProposalsForIntegration,
  approveProposal,
} from '@/lib/modules/auto-maintenance/auto-maintenance.service';
import { maintenanceHandler } from '@/lib/modules/auto-maintenance/handlers/maintenance.handler';
import type { JobHandlerContext } from '@/lib/modules/jobs/jobs.handlers';

const mockPrisma = prisma as unknown as {
  integration: { findMany: Mock };
  maintenanceProposal: { findMany: Mock };
};
const mockExpireStaleProposals = expireStaleProposals as Mock;
const mockGenerateProposalsForIntegration = generateProposalsForIntegration as Mock;
const mockApproveProposal = approveProposal as Mock;

const UUID_INTEGRATION_1 = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
const UUID_INTEGRATION_2 = 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e';
const UUID_TENANT = 'c3d4e5f6-a7b8-4c9d-ae1f-2a3b4c5d6e7f';
const UUID_PROPOSAL_1 = 'd4e5f6a7-b8c9-4d0e-9f2a-3b4c5d6e7f8a';

function createMockContext(): JobHandlerContext {
  return {
    jobId: 'test-job-id',
    input: { triggerSource: 'drift_analyzer' },
    updateProgress: vi.fn().mockResolvedValue(undefined),
    isCancelled: vi.fn().mockReturnValue(false),
  } as unknown as JobHandlerContext;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('maintenanceHandler', () => {
  it('should expire stale proposals first', async () => {
    mockExpireStaleProposals.mockResolvedValue(3);
    mockPrisma.integration.findMany.mockResolvedValue([]);

    const context = createMockContext();
    const result = await maintenanceHandler(context);

    expect(mockExpireStaleProposals).toHaveBeenCalled();
    expect(result).toMatchObject({
      integrationsChecked: 0,
      expiredCount: 3,
    });
  });

  it('should return early when no integrations found', async () => {
    mockExpireStaleProposals.mockResolvedValue(0);
    mockPrisma.integration.findMany.mockResolvedValue([]);

    const context = createMockContext();
    const result = await maintenanceHandler(context);

    expect(result).toMatchObject({
      integrationsChecked: 0,
      proposalsCreated: 0,
      autoApproved: 0,
      expiredCount: 0,
    });
    expect(mockGenerateProposalsForIntegration).not.toHaveBeenCalled();
  });

  it('should generate proposals for each integration', async () => {
    mockExpireStaleProposals.mockResolvedValue(0);
    mockPrisma.integration.findMany.mockResolvedValue([
      { id: UUID_INTEGRATION_1, tenantId: UUID_TENANT, maintenanceConfig: null },
      { id: UUID_INTEGRATION_2, tenantId: UUID_TENANT, maintenanceConfig: { enabled: true } },
    ]);
    mockGenerateProposalsForIntegration.mockResolvedValue({
      proposalsCreated: 2,
      actionsAffected: 2,
    });

    const context = createMockContext();
    const result = await maintenanceHandler(context);

    expect(mockGenerateProposalsForIntegration).toHaveBeenCalledTimes(2);
    expect(mockGenerateProposalsForIntegration).toHaveBeenCalledWith(
      UUID_INTEGRATION_1,
      UUID_TENANT
    );
    expect(mockGenerateProposalsForIntegration).toHaveBeenCalledWith(
      UUID_INTEGRATION_2,
      UUID_TENANT
    );
    expect(result).toMatchObject({
      integrationsChecked: 2,
      proposalsCreated: 4, // 2 per integration
    });
  });

  it('should auto-approve info-level proposals when configured', async () => {
    mockExpireStaleProposals.mockResolvedValue(0);
    mockPrisma.integration.findMany.mockResolvedValue([
      {
        id: UUID_INTEGRATION_1,
        tenantId: UUID_TENANT,
        maintenanceConfig: { enabled: true, autoApproveInfoLevel: true },
      },
    ]);
    mockGenerateProposalsForIntegration.mockResolvedValue({
      proposalsCreated: 1,
      actionsAffected: 1,
    });
    mockPrisma.maintenanceProposal.findMany.mockResolvedValue([{ id: UUID_PROPOSAL_1 }]);
    mockApproveProposal.mockResolvedValue({});

    const context = createMockContext();
    const result = await maintenanceHandler(context);

    expect(mockApproveProposal).toHaveBeenCalledWith(UUID_TENANT, UUID_PROPOSAL_1);
    expect(result).toMatchObject({
      autoApproved: 1,
    });
  });

  it('should not auto-approve when autoApproveInfoLevel is false', async () => {
    mockExpireStaleProposals.mockResolvedValue(0);
    mockPrisma.integration.findMany.mockResolvedValue([
      {
        id: UUID_INTEGRATION_1,
        tenantId: UUID_TENANT,
        maintenanceConfig: { enabled: true, autoApproveInfoLevel: false },
      },
    ]);
    mockGenerateProposalsForIntegration.mockResolvedValue({
      proposalsCreated: 1,
      actionsAffected: 1,
    });

    const context = createMockContext();
    const result = await maintenanceHandler(context);

    expect(mockApproveProposal).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      autoApproved: 0,
    });
  });

  it('should handle integration processing errors gracefully', async () => {
    mockExpireStaleProposals.mockResolvedValue(0);
    mockPrisma.integration.findMany.mockResolvedValue([
      { id: UUID_INTEGRATION_1, tenantId: UUID_TENANT, maintenanceConfig: null },
    ]);
    mockGenerateProposalsForIntegration.mockRejectedValue(new Error('DB error'));

    const context = createMockContext();
    const result = await maintenanceHandler(context);

    // Should complete without throwing, but record the error
    expect(result).toMatchObject({
      integrationsChecked: 1,
      proposalsCreated: 0,
    });
    expect((result as Record<string, unknown>).errors).toHaveLength(1);
  });

  it('should handle stale proposal expiration errors gracefully', async () => {
    mockExpireStaleProposals.mockRejectedValue(new Error('Expire failed'));
    mockPrisma.integration.findMany.mockResolvedValue([]);

    const context = createMockContext();
    // Should not throw
    const result = await maintenanceHandler(context);
    expect(result).toMatchObject({
      integrationsChecked: 0,
      expiredCount: 0,
    });
  });

  it('should update progress during processing', async () => {
    mockExpireStaleProposals.mockResolvedValue(0);
    mockPrisma.integration.findMany.mockResolvedValue([
      { id: UUID_INTEGRATION_1, tenantId: UUID_TENANT, maintenanceConfig: null },
    ]);
    mockGenerateProposalsForIntegration.mockResolvedValue({
      proposalsCreated: 0,
      actionsAffected: 0,
    });

    const context = createMockContext();
    await maintenanceHandler(context);

    // Should have called updateProgress multiple times
    expect(context.updateProgress).toHaveBeenCalledWith(0, expect.any(Object));
    expect(context.updateProgress).toHaveBeenCalledWith(
      100,
      expect.objectContaining({ stage: 'completed' })
    );
  });

  it('should treat null maintenanceConfig as enabled', async () => {
    mockExpireStaleProposals.mockResolvedValue(0);
    mockPrisma.integration.findMany.mockResolvedValue([
      { id: UUID_INTEGRATION_1, tenantId: UUID_TENANT, maintenanceConfig: null },
    ]);
    mockGenerateProposalsForIntegration.mockResolvedValue({
      proposalsCreated: 0,
      actionsAffected: 0,
    });

    const context = createMockContext();
    await maintenanceHandler(context);

    // Should still process integration with null config (defaults to enabled)
    expect(mockGenerateProposalsForIntegration).toHaveBeenCalledTimes(1);
  });
});
