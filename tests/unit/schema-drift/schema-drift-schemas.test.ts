/**
 * Schema Drift Detection Schemas Unit Tests
 *
 * Tests for Zod validation schemas, enum validation, response formatters,
 * constants, and helper functions.
 */

import { describe, it, expect } from 'vitest';
import {
  DriftSeveritySchema,
  DriftReportStatusSchema,
  DriftSensitivitySchema,
  DriftConfigSchema,
  DRIFT_THRESHOLDS,
  ListDriftReportsQuerySchema,
  UpdateDriftReportStatusSchema,
  UpdateDriftConfigSchema,
  DriftReportResponseSchema,
  DriftSummaryResponseSchema,
  ListDriftReportsResponseSchema,
  toDriftReportResponse,
  ISSUE_CODE_SEVERITY_MAP,
  DEFAULT_DRIFT_SEVERITY,
  VALID_STATUS_TRANSITIONS,
  SchemaDriftErrorCodes,
} from '@/lib/modules/schema-drift/schema-drift.schemas';

const UUID_1 = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
const UUID_2 = 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e';
const UUID_3 = 'c3d4e5f6-a7b8-4c9d-ae1f-2a3b4c5d6e7f';
const UUID_4 = 'd4e5f6a7-b8c9-4d0e-9f2a-3b4c5d6e7f8a';

// =============================================================================
// Enum Schema Tests
// =============================================================================

describe('DriftSeveritySchema', () => {
  it('should accept valid severities', () => {
    expect(DriftSeveritySchema.parse('info')).toBe('info');
    expect(DriftSeveritySchema.parse('warning')).toBe('warning');
    expect(DriftSeveritySchema.parse('breaking')).toBe('breaking');
  });

  it('should reject invalid severities', () => {
    expect(() => DriftSeveritySchema.parse('critical')).toThrow();
    expect(() => DriftSeveritySchema.parse('error')).toThrow();
    expect(() => DriftSeveritySchema.parse('')).toThrow();
  });
});

describe('DriftReportStatusSchema', () => {
  it('should accept valid statuses', () => {
    expect(DriftReportStatusSchema.parse('detected')).toBe('detected');
    expect(DriftReportStatusSchema.parse('acknowledged')).toBe('acknowledged');
    expect(DriftReportStatusSchema.parse('resolved')).toBe('resolved');
    expect(DriftReportStatusSchema.parse('dismissed')).toBe('dismissed');
  });

  it('should reject invalid statuses', () => {
    expect(() => DriftReportStatusSchema.parse('pending')).toThrow();
    expect(() => DriftReportStatusSchema.parse('active')).toThrow();
    expect(() => DriftReportStatusSchema.parse('')).toThrow();
  });
});

describe('DriftSensitivitySchema', () => {
  it('should accept valid sensitivities', () => {
    expect(DriftSensitivitySchema.parse('low')).toBe('low');
    expect(DriftSensitivitySchema.parse('medium')).toBe('medium');
    expect(DriftSensitivitySchema.parse('high')).toBe('high');
  });

  it('should reject invalid sensitivities', () => {
    expect(() => DriftSensitivitySchema.parse('very_high')).toThrow();
    expect(() => DriftSensitivitySchema.parse('')).toThrow();
  });
});

// =============================================================================
// Config Schema Tests
// =============================================================================

describe('DriftConfigSchema', () => {
  it('should apply defaults when parsing empty object', () => {
    const result = DriftConfigSchema.parse({});
    expect(result.enabled).toBe(true);
    expect(result.sensitivity).toBe('medium');
    expect(result.ignoreFieldPaths).toEqual([]);
  });

  it('should accept full config', () => {
    const result = DriftConfigSchema.parse({
      enabled: false,
      sensitivity: 'high',
      ignoreFieldPaths: ['data.metadata', 'data.debug'],
    });
    expect(result.enabled).toBe(false);
    expect(result.sensitivity).toBe('high');
    expect(result.ignoreFieldPaths).toEqual(['data.metadata', 'data.debug']);
  });

  it('should reject invalid sensitivity', () => {
    expect(() => DriftConfigSchema.parse({ enabled: true, sensitivity: 'ultra' })).toThrow();
  });

  it('should reject non-boolean enabled', () => {
    expect(() => DriftConfigSchema.parse({ enabled: 'yes' })).toThrow();
  });

  it('should reject non-string array for ignoreFieldPaths', () => {
    expect(() => DriftConfigSchema.parse({ ignoreFieldPaths: [123] })).toThrow();
  });
});

// =============================================================================
// Threshold Constants
// =============================================================================

describe('DRIFT_THRESHOLDS', () => {
  it('should have thresholds for all sensitivity levels', () => {
    expect(DRIFT_THRESHOLDS.high).toEqual({ minFailures: 3, timeWindowHours: 24 });
    expect(DRIFT_THRESHOLDS.medium).toEqual({ minFailures: 5, timeWindowHours: 24 });
    expect(DRIFT_THRESHOLDS.low).toEqual({ minFailures: 10, timeWindowHours: 48 });
  });

  it('should have higher minFailures for lower sensitivity', () => {
    expect(DRIFT_THRESHOLDS.low.minFailures).toBeGreaterThan(DRIFT_THRESHOLDS.medium.minFailures);
    expect(DRIFT_THRESHOLDS.medium.minFailures).toBeGreaterThan(DRIFT_THRESHOLDS.high.minFailures);
  });
});

// =============================================================================
// Query Schema Tests
// =============================================================================

describe('ListDriftReportsQuerySchema', () => {
  it('should apply defaults', () => {
    const result = ListDriftReportsQuerySchema.parse({});
    expect(result.limit).toBe(20);
    expect(result.cursor).toBeUndefined();
    expect(result.severity).toBeUndefined();
    expect(result.status).toBeUndefined();
    expect(result.actionId).toBeUndefined();
  });

  it('should accept valid full query', () => {
    const result = ListDriftReportsQuerySchema.parse({
      cursor: 'some-cursor-id',
      limit: 50,
      severity: 'breaking',
      status: 'detected',
      actionId: UUID_1,
    });
    expect(result.limit).toBe(50);
    expect(result.severity).toBe('breaking');
    expect(result.status).toBe('detected');
    expect(result.actionId).toBe(UUID_1);
  });

  it('should coerce string limit to number', () => {
    const result = ListDriftReportsQuerySchema.parse({ limit: '10' });
    expect(result.limit).toBe(10);
  });

  it('should reject limit below 1', () => {
    expect(() => ListDriftReportsQuerySchema.parse({ limit: 0 })).toThrow();
  });

  it('should reject limit above 100', () => {
    expect(() => ListDriftReportsQuerySchema.parse({ limit: 101 })).toThrow();
  });

  it('should reject invalid severity filter', () => {
    expect(() => ListDriftReportsQuerySchema.parse({ severity: 'critical' })).toThrow();
  });

  it('should reject invalid status filter', () => {
    expect(() => ListDriftReportsQuerySchema.parse({ status: 'pending' })).toThrow();
  });

  it('should reject invalid actionId format', () => {
    expect(() => ListDriftReportsQuerySchema.parse({ actionId: 'not-a-uuid' })).toThrow();
  });
});

// =============================================================================
// Input Schema Tests
// =============================================================================

describe('UpdateDriftReportStatusSchema', () => {
  it('should accept valid target statuses', () => {
    expect(UpdateDriftReportStatusSchema.parse({ status: 'acknowledged' }).status).toBe(
      'acknowledged'
    );
    expect(UpdateDriftReportStatusSchema.parse({ status: 'resolved' }).status).toBe('resolved');
    expect(UpdateDriftReportStatusSchema.parse({ status: 'dismissed' }).status).toBe('dismissed');
  });

  it('should reject "detected" as target status', () => {
    expect(() => UpdateDriftReportStatusSchema.parse({ status: 'detected' })).toThrow();
  });

  it('should reject invalid status', () => {
    expect(() => UpdateDriftReportStatusSchema.parse({ status: 'active' })).toThrow();
  });

  it('should reject missing status', () => {
    expect(() => UpdateDriftReportStatusSchema.parse({})).toThrow();
  });
});

describe('UpdateDriftConfigSchema', () => {
  it('should accept partial config with defaults applied', () => {
    // DriftConfigSchema.partial() still applies defaults for missing fields
    const result = UpdateDriftConfigSchema.parse({ enabled: false });
    expect(result.enabled).toBe(false);
    expect(result.sensitivity).toBe('medium');
    expect(result.ignoreFieldPaths).toEqual([]);
  });

  it('should accept empty object with all defaults', () => {
    const result = UpdateDriftConfigSchema.parse({});
    expect(result).toEqual({
      enabled: true,
      sensitivity: 'medium',
      ignoreFieldPaths: [],
    });
  });

  it('should accept only sensitivity', () => {
    const result = UpdateDriftConfigSchema.parse({ sensitivity: 'high' });
    expect(result.sensitivity).toBe('high');
  });

  it('should reject invalid sensitivity value', () => {
    expect(() => UpdateDriftConfigSchema.parse({ sensitivity: 'ultra' })).toThrow();
  });
});

// =============================================================================
// Response Schema Tests
// =============================================================================

describe('DriftReportResponseSchema', () => {
  const validResponse = {
    id: UUID_1,
    integrationId: UUID_2,
    tenantId: UUID_3,
    actionId: UUID_4,
    fingerprint: 'abc123def456',
    issueCode: 'type_mismatch',
    severity: 'breaking',
    status: 'detected',
    fieldPath: 'data.user.email',
    expectedType: 'string',
    currentType: 'null',
    description: "Field 'data.user.email' type changed from string to null",
    failureCount: 10,
    scanCount: 2,
    firstDetectedAt: '2025-01-01T00:00:00.000Z',
    lastDetectedAt: '2025-01-02T00:00:00.000Z',
    acknowledgedAt: null,
    resolvedAt: null,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-02T00:00:00.000Z',
  };

  it('should accept valid response', () => {
    const result = DriftReportResponseSchema.parse(validResponse);
    expect(result.id).toBe(UUID_1);
    expect(result.severity).toBe('breaking');
    expect(result.failureCount).toBe(10);
  });

  it('should accept nullable types', () => {
    const result = DriftReportResponseSchema.parse({
      ...validResponse,
      expectedType: null,
      currentType: null,
      acknowledgedAt: '2025-01-02T00:00:00.000Z',
      resolvedAt: '2025-01-03T00:00:00.000Z',
    });
    expect(result.expectedType).toBeNull();
    expect(result.acknowledgedAt).toBe('2025-01-02T00:00:00.000Z');
  });

  it('should reject non-uuid id', () => {
    expect(() => DriftReportResponseSchema.parse({ ...validResponse, id: 'bad' })).toThrow();
  });
});

describe('DriftSummaryResponseSchema', () => {
  it('should accept valid summary', () => {
    const result = DriftSummaryResponseSchema.parse({
      breaking: 2,
      warning: 1,
      info: 0,
      total: 3,
    });
    expect(result.total).toBe(3);
  });

  it('should reject non-integer values', () => {
    expect(() =>
      DriftSummaryResponseSchema.parse({ breaking: 1.5, warning: 0, info: 0, total: 1.5 })
    ).toThrow();
  });
});

describe('ListDriftReportsResponseSchema', () => {
  it('should accept valid paginated response', () => {
    const validReport = {
      id: UUID_1,
      integrationId: UUID_2,
      tenantId: UUID_3,
      actionId: UUID_4,
      fingerprint: 'abc123',
      issueCode: 'type_mismatch',
      severity: 'breaking',
      status: 'detected',
      fieldPath: 'data.field',
      expectedType: 'string',
      currentType: 'number',
      description: 'test',
      failureCount: 5,
      scanCount: 1,
      firstDetectedAt: '2025-01-01T00:00:00.000Z',
      lastDetectedAt: '2025-01-01T00:00:00.000Z',
      acknowledgedAt: null,
      resolvedAt: null,
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
    };
    const result = ListDriftReportsResponseSchema.parse({
      reports: [validReport],
      pagination: { cursor: 'next-id', hasMore: true, totalCount: 10 },
    });
    expect(result.reports).toHaveLength(1);
    expect(result.pagination.hasMore).toBe(true);
    expect(result.pagination.totalCount).toBe(10);
  });

  it('should accept empty reports', () => {
    const result = ListDriftReportsResponseSchema.parse({
      reports: [],
      pagination: { cursor: null, hasMore: false, totalCount: 0 },
    });
    expect(result.reports).toHaveLength(0);
    expect(result.pagination.cursor).toBeNull();
  });
});

// =============================================================================
// toDriftReportResponse Tests
// =============================================================================

describe('toDriftReportResponse', () => {
  it('should convert DB record to API response with ISO date strings', () => {
    const now = new Date('2025-01-15T10:30:00.000Z');
    const dbReport = {
      id: UUID_1,
      integrationId: UUID_2,
      tenantId: UUID_3,
      actionId: UUID_4,
      fingerprint: 'fp123',
      issueCode: 'type_mismatch',
      severity: 'breaking',
      status: 'detected',
      fieldPath: 'data.email',
      expectedType: 'string',
      currentType: 'null',
      description: 'Field changed',
      failureCount: 7,
      scanCount: 2,
      firstDetectedAt: now,
      lastDetectedAt: now,
      acknowledgedAt: null,
      resolvedAt: null,
      createdAt: now,
      updatedAt: now,
    };

    const result = toDriftReportResponse(dbReport);
    expect(result.id).toBe(UUID_1);
    expect(result.severity).toBe('breaking');
    expect(result.firstDetectedAt).toBe('2025-01-15T10:30:00.000Z');
    expect(result.lastDetectedAt).toBe('2025-01-15T10:30:00.000Z');
    expect(result.acknowledgedAt).toBeNull();
    expect(result.resolvedAt).toBeNull();
    expect(result.createdAt).toBe('2025-01-15T10:30:00.000Z');
  });

  it('should convert nullable date fields when present', () => {
    const now = new Date();
    const ackDate = new Date('2025-01-16T00:00:00.000Z');
    const resolvedDate = new Date('2025-01-17T00:00:00.000Z');

    const result = toDriftReportResponse({
      id: UUID_1,
      integrationId: UUID_2,
      tenantId: UUID_3,
      actionId: UUID_4,
      fingerprint: 'fp123',
      issueCode: 'type_mismatch',
      severity: 'acknowledged',
      status: 'resolved',
      fieldPath: 'data.email',
      expectedType: null,
      currentType: null,
      description: 'test',
      failureCount: 1,
      scanCount: 1,
      firstDetectedAt: now,
      lastDetectedAt: now,
      acknowledgedAt: ackDate,
      resolvedAt: resolvedDate,
      createdAt: now,
      updatedAt: now,
    });

    expect(result.acknowledgedAt).toBe('2025-01-16T00:00:00.000Z');
    expect(result.resolvedAt).toBe('2025-01-17T00:00:00.000Z');
  });
});

// =============================================================================
// Constants Tests
// =============================================================================

describe('ISSUE_CODE_SEVERITY_MAP', () => {
  it('should map known issue codes to correct severities', () => {
    expect(ISSUE_CODE_SEVERITY_MAP['type_mismatch']).toBe('breaking');
    expect(ISSUE_CODE_SEVERITY_MAP['missing_required_field']).toBe('breaking');
    expect(ISSUE_CODE_SEVERITY_MAP['invalid_enum_value']).toBe('breaking');
    expect(ISSUE_CODE_SEVERITY_MAP['schema_validation_error']).toBe('warning');
    expect(ISSUE_CODE_SEVERITY_MAP['unexpected_field']).toBe('info');
  });

  it('should have exactly 5 mapped issue codes', () => {
    expect(Object.keys(ISSUE_CODE_SEVERITY_MAP)).toHaveLength(5);
  });
});

describe('DEFAULT_DRIFT_SEVERITY', () => {
  it('should be warning', () => {
    expect(DEFAULT_DRIFT_SEVERITY).toBe('warning');
  });
});

describe('VALID_STATUS_TRANSITIONS', () => {
  it('should allow detected → acknowledged, resolved, dismissed', () => {
    expect(VALID_STATUS_TRANSITIONS['detected']).toEqual(
      expect.arrayContaining(['acknowledged', 'resolved', 'dismissed'])
    );
    expect(VALID_STATUS_TRANSITIONS['detected']).toHaveLength(3);
  });

  it('should allow acknowledged → resolved, dismissed', () => {
    expect(VALID_STATUS_TRANSITIONS['acknowledged']).toEqual(
      expect.arrayContaining(['resolved', 'dismissed'])
    );
    expect(VALID_STATUS_TRANSITIONS['acknowledged']).toHaveLength(2);
  });

  it('should make resolved a terminal state', () => {
    expect(VALID_STATUS_TRANSITIONS['resolved']).toEqual([]);
  });

  it('should make dismissed a terminal state', () => {
    expect(VALID_STATUS_TRANSITIONS['dismissed']).toEqual([]);
  });
});

describe('SchemaDriftErrorCodes', () => {
  it('should contain expected error codes', () => {
    expect(SchemaDriftErrorCodes.DRIFT_REPORT_NOT_FOUND).toBe('DRIFT_REPORT_NOT_FOUND');
    expect(SchemaDriftErrorCodes.INVALID_STATUS_TRANSITION).toBe('INVALID_STATUS_TRANSITION');
    expect(SchemaDriftErrorCodes.INVALID_INPUT).toBe('INVALID_INPUT');
  });

  it('should have exactly 3 error codes', () => {
    expect(Object.keys(SchemaDriftErrorCodes)).toHaveLength(3);
  });
});
