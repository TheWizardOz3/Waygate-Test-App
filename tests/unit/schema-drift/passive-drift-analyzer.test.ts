/**
 * Passive Drift Analyzer Unit Tests
 *
 * Tests for the core analysis logic: severity classification, fingerprint
 * generation, description building, and the analyzeIntegration flow.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock Prisma before imports that use it
vi.mock('@/lib/db/client', () => ({
  default: {
    integration: {
      findFirst: vi.fn(),
    },
    action: {
      findMany: vi.fn(),
    },
    validationFailure: {
      findMany: vi.fn(),
    },
    driftReport: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import prisma from '@/lib/db/client';
import {
  classifySeverity,
  buildFingerprint,
  buildDescription,
  analyzeIntegration,
} from '@/lib/modules/schema-drift/passive-drift-analyzer';

const UUID_1 = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
const UUID_2 = 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e';
const UUID_3 = 'c3d4e5f6-a7b8-4c9d-0e1f-2a3b4c5d6e7f';

describe('classifySeverity', () => {
  it('should classify type_mismatch as breaking', () => {
    expect(classifySeverity('type_mismatch')).toBe('breaking');
  });

  it('should classify missing_required_field as breaking', () => {
    expect(classifySeverity('missing_required_field')).toBe('breaking');
  });

  it('should classify invalid_enum_value as breaking', () => {
    expect(classifySeverity('invalid_enum_value')).toBe('breaking');
  });

  it('should classify schema_validation_error as warning', () => {
    expect(classifySeverity('schema_validation_error')).toBe('warning');
  });

  it('should classify unexpected_field as info', () => {
    expect(classifySeverity('unexpected_field')).toBe('info');
  });

  it('should fall back to warning for unknown issue codes', () => {
    expect(classifySeverity('unknown_code')).toBe('warning');
    expect(classifySeverity('custom_issue')).toBe('warning');
  });
});

describe('buildFingerprint', () => {
  it('should return a hex string', () => {
    const fp = buildFingerprint(UUID_1, 'type_mismatch', 'data.email');
    expect(fp).toMatch(/^[0-9a-f]+$/);
  });

  it('should be at most 64 characters', () => {
    const fp = buildFingerprint(UUID_1, 'type_mismatch', 'data.email');
    expect(fp.length).toBeLessThanOrEqual(64);
  });

  it('should be deterministic (same inputs produce same output)', () => {
    const fp1 = buildFingerprint(UUID_1, 'type_mismatch', 'data.email');
    const fp2 = buildFingerprint(UUID_1, 'type_mismatch', 'data.email');
    expect(fp1).toBe(fp2);
  });

  it('should produce different fingerprints for different inputs', () => {
    const fp1 = buildFingerprint(UUID_1, 'type_mismatch', 'data.email');
    const fp2 = buildFingerprint(UUID_1, 'type_mismatch', 'data.name');
    const fp3 = buildFingerprint(UUID_2, 'type_mismatch', 'data.email');
    const fp4 = buildFingerprint(UUID_1, 'unexpected_field', 'data.email');
    expect(fp1).not.toBe(fp2);
    expect(fp1).not.toBe(fp3);
    expect(fp1).not.toBe(fp4);
  });
});

describe('buildDescription', () => {
  it('should describe type_mismatch with types', () => {
    const desc = buildDescription('type_mismatch', 'data.email', 'string', 'null');
    expect(desc).toContain('data.email');
    expect(desc).toContain('string');
    expect(desc).toContain('null');
    expect(desc).toContain('type changed');
  });

  it('should describe type_mismatch with unknown types when null', () => {
    const desc = buildDescription('type_mismatch', 'data.email', null, null);
    expect(desc).toContain('unknown');
  });

  it('should describe missing_required_field', () => {
    const desc = buildDescription('missing_required_field', 'data.id', null, null);
    expect(desc).toContain('data.id');
    expect(desc).toContain('no longer present');
  });

  it('should describe unexpected_field', () => {
    const desc = buildDescription('unexpected_field', 'data.newField', null, 'string');
    expect(desc).toContain('data.newField');
    expect(desc).toContain('appeared');
    expect(desc).toContain('string');
  });

  it('should describe invalid_enum_value', () => {
    const desc = buildDescription(
      'invalid_enum_value',
      'data.status',
      'active|inactive',
      'archived'
    );
    expect(desc).toContain('data.status');
    expect(desc).toContain('active|inactive');
    expect(desc).toContain('archived');
  });

  it('should describe schema_validation_error', () => {
    const desc = buildDescription('schema_validation_error', 'data.payload', null, null);
    expect(desc).toContain('data.payload');
    expect(desc).toContain('Schema validation failed');
  });

  it('should handle unknown issue codes with generic description', () => {
    const desc = buildDescription('custom_error', 'data.field', null, null);
    expect(desc).toContain('custom_error');
    expect(desc).toContain('data.field');
  });
});

// =============================================================================
// analyzeIntegration Tests
// =============================================================================

describe('analyzeIntegration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('should return zeros when integration not found', async () => {
    vi.mocked(prisma.integration.findFirst).mockResolvedValue(null);

    const result = await analyzeIntegration(UUID_1, UUID_2);

    expect(result).toEqual({
      integrationId: UUID_1,
      reportsCreated: 0,
      reportsUpdated: 0,
    });
  });

  it('should return zeros when drift detection is disabled', async () => {
    vi.mocked(prisma.integration.findFirst).mockResolvedValue({
      id: UUID_1,
      driftConfig: { enabled: false, sensitivity: 'medium', ignoreFieldPaths: [] },
    } as never);

    const result = await analyzeIntegration(UUID_1, UUID_2);

    expect(result).toEqual({
      integrationId: UUID_1,
      reportsCreated: 0,
      reportsUpdated: 0,
    });
    expect(prisma.action.findMany).not.toHaveBeenCalled();
  });

  it('should return zeros when integration has no actions', async () => {
    vi.mocked(prisma.integration.findFirst).mockResolvedValue({
      id: UUID_1,
      driftConfig: null,
    } as never);
    vi.mocked(prisma.action.findMany).mockResolvedValue([]);

    const result = await analyzeIntegration(UUID_1, UUID_2);

    expect(result.reportsCreated).toBe(0);
    expect(result.reportsUpdated).toBe(0);
  });

  it('should return zeros when no failures exceed threshold', async () => {
    vi.mocked(prisma.integration.findFirst).mockResolvedValue({
      id: UUID_1,
      driftConfig: null,
    } as never);
    vi.mocked(prisma.action.findMany).mockResolvedValue([{ id: UUID_3 }] as never);
    vi.mocked(prisma.validationFailure.findMany).mockResolvedValue([]);

    const result = await analyzeIntegration(UUID_1, UUID_2);

    expect(result.reportsCreated).toBe(0);
    expect(result.reportsUpdated).toBe(0);
  });

  it('should create new drift report when pattern exceeds threshold', async () => {
    vi.mocked(prisma.integration.findFirst).mockResolvedValue({
      id: UUID_1,
      driftConfig: null,
    } as never);
    vi.mocked(prisma.action.findMany).mockResolvedValue([{ id: UUID_3 }] as never);
    vi.mocked(prisma.validationFailure.findMany).mockResolvedValue([
      {
        actionId: UUID_3,
        issueCode: 'type_mismatch',
        fieldPath: 'data.email',
        failureCount: 10,
        expectedType: 'string',
        receivedType: 'null',
      },
    ] as never);
    vi.mocked(prisma.driftReport.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.driftReport.create).mockResolvedValue({} as never);

    const result = await analyzeIntegration(UUID_1, UUID_2);

    expect(result.reportsCreated).toBe(1);
    expect(result.reportsUpdated).toBe(0);
    expect(prisma.driftReport.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          integrationId: UUID_1,
          tenantId: UUID_2,
          actionId: UUID_3,
          issueCode: 'type_mismatch',
          severity: 'breaking',
          status: 'detected',
          fieldPath: 'data.email',
          expectedType: 'string',
          currentType: 'null',
        }),
      })
    );
  });

  it('should update existing unresolved report instead of creating duplicate', async () => {
    vi.mocked(prisma.integration.findFirst).mockResolvedValue({
      id: UUID_1,
      driftConfig: null,
    } as never);
    vi.mocked(prisma.action.findMany).mockResolvedValue([{ id: UUID_3 }] as never);
    vi.mocked(prisma.validationFailure.findMany).mockResolvedValue([
      {
        actionId: UUID_3,
        issueCode: 'type_mismatch',
        fieldPath: 'data.email',
        failureCount: 15,
        expectedType: 'string',
        receivedType: 'null',
      },
    ] as never);
    vi.mocked(prisma.driftReport.findUnique).mockResolvedValue({
      id: 'existing-report-id',
      status: 'detected',
    } as never);
    vi.mocked(prisma.driftReport.update).mockResolvedValue({} as never);

    const result = await analyzeIntegration(UUID_1, UUID_2);

    expect(result.reportsCreated).toBe(0);
    expect(result.reportsUpdated).toBe(1);
    expect(prisma.driftReport.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'existing-report-id' },
        data: expect.objectContaining({
          scanCount: { increment: 1 },
          failureCount: 15,
        }),
      })
    );
    expect(prisma.driftReport.create).not.toHaveBeenCalled();
  });

  it('should skip resolved reports (not reopen them)', async () => {
    vi.mocked(prisma.integration.findFirst).mockResolvedValue({
      id: UUID_1,
      driftConfig: null,
    } as never);
    vi.mocked(prisma.action.findMany).mockResolvedValue([{ id: UUID_3 }] as never);
    vi.mocked(prisma.validationFailure.findMany).mockResolvedValue([
      {
        actionId: UUID_3,
        issueCode: 'type_mismatch',
        fieldPath: 'data.email',
        failureCount: 10,
        expectedType: 'string',
        receivedType: 'null',
      },
    ] as never);
    vi.mocked(prisma.driftReport.findUnique).mockResolvedValue({
      id: 'resolved-report-id',
      status: 'resolved',
    } as never);

    const result = await analyzeIntegration(UUID_1, UUID_2);

    // Resolved report returns false from upsert → counted as "updated" by the loop,
    // but no actual DB write occurs (no create or update call)
    expect(result.reportsCreated).toBe(0);
    expect(result.reportsUpdated).toBe(1);
    expect(prisma.driftReport.create).not.toHaveBeenCalled();
    expect(prisma.driftReport.update).not.toHaveBeenCalled();
  });

  it('should skip dismissed reports (not reopen them)', async () => {
    vi.mocked(prisma.integration.findFirst).mockResolvedValue({
      id: UUID_1,
      driftConfig: null,
    } as never);
    vi.mocked(prisma.action.findMany).mockResolvedValue([{ id: UUID_3 }] as never);
    vi.mocked(prisma.validationFailure.findMany).mockResolvedValue([
      {
        actionId: UUID_3,
        issueCode: 'type_mismatch',
        fieldPath: 'data.email',
        failureCount: 10,
        expectedType: 'string',
        receivedType: 'null',
      },
    ] as never);
    vi.mocked(prisma.driftReport.findUnique).mockResolvedValue({
      id: 'dismissed-report-id',
      status: 'dismissed',
    } as never);

    const result = await analyzeIntegration(UUID_1, UUID_2);

    // Same as resolved — upsert returns false, counted as "updated" but no DB write
    expect(result.reportsCreated).toBe(0);
    expect(result.reportsUpdated).toBe(1);
  });

  it('should use correct threshold for high sensitivity', async () => {
    vi.mocked(prisma.integration.findFirst).mockResolvedValue({
      id: UUID_1,
      driftConfig: { enabled: true, sensitivity: 'high', ignoreFieldPaths: [] },
    } as never);
    vi.mocked(prisma.action.findMany).mockResolvedValue([{ id: UUID_3 }] as never);
    vi.mocked(prisma.validationFailure.findMany).mockResolvedValue([]);

    await analyzeIntegration(UUID_1, UUID_2);

    // High sensitivity: minFailures = 3, timeWindowHours = 24
    expect(prisma.validationFailure.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          failureCount: { gte: 3 },
        }),
      })
    );
  });

  it('should use correct threshold for low sensitivity', async () => {
    vi.mocked(prisma.integration.findFirst).mockResolvedValue({
      id: UUID_1,
      driftConfig: { enabled: true, sensitivity: 'low', ignoreFieldPaths: [] },
    } as never);
    vi.mocked(prisma.action.findMany).mockResolvedValue([{ id: UUID_3 }] as never);
    vi.mocked(prisma.validationFailure.findMany).mockResolvedValue([]);

    await analyzeIntegration(UUID_1, UUID_2);

    // Low sensitivity: minFailures = 10, timeWindowHours = 48
    expect(prisma.validationFailure.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          failureCount: { gte: 10 },
        }),
      })
    );
  });

  it('should exclude ignored field paths', async () => {
    vi.mocked(prisma.integration.findFirst).mockResolvedValue({
      id: UUID_1,
      driftConfig: {
        enabled: true,
        sensitivity: 'medium',
        ignoreFieldPaths: ['data.debug', 'data.metadata'],
      },
    } as never);
    vi.mocked(prisma.action.findMany).mockResolvedValue([{ id: UUID_3 }] as never);
    vi.mocked(prisma.validationFailure.findMany).mockResolvedValue([]);

    await analyzeIntegration(UUID_1, UUID_2);

    expect(prisma.validationFailure.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          fieldPath: { notIn: ['data.debug', 'data.metadata'] },
        }),
      })
    );
  });

  it('should handle multiple failure patterns in one analysis', async () => {
    vi.mocked(prisma.integration.findFirst).mockResolvedValue({
      id: UUID_1,
      driftConfig: null,
    } as never);
    vi.mocked(prisma.action.findMany).mockResolvedValue([{ id: UUID_3 }] as never);
    vi.mocked(prisma.validationFailure.findMany).mockResolvedValue([
      {
        actionId: UUID_3,
        issueCode: 'type_mismatch',
        fieldPath: 'data.email',
        failureCount: 10,
        expectedType: 'string',
        receivedType: 'null',
      },
      {
        actionId: UUID_3,
        issueCode: 'unexpected_field',
        fieldPath: 'data.newField',
        failureCount: 8,
        expectedType: null,
        receivedType: 'string',
      },
    ] as never);
    vi.mocked(prisma.driftReport.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.driftReport.create).mockResolvedValue({} as never);

    const result = await analyzeIntegration(UUID_1, UUID_2);

    expect(result.reportsCreated).toBe(2);
    expect(prisma.driftReport.create).toHaveBeenCalledTimes(2);
  });

  it('should default to enabled/medium when driftConfig is null', async () => {
    vi.mocked(prisma.integration.findFirst).mockResolvedValue({
      id: UUID_1,
      driftConfig: null,
    } as never);
    vi.mocked(prisma.action.findMany).mockResolvedValue([{ id: UUID_3 }] as never);
    vi.mocked(prisma.validationFailure.findMany).mockResolvedValue([]);

    await analyzeIntegration(UUID_1, UUID_2);

    // Medium sensitivity: minFailures = 5
    expect(prisma.validationFailure.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          failureCount: { gte: 5 },
        }),
      })
    );
  });
});
