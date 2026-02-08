/**
 * Schema Drift Detection Errors Unit Tests
 *
 * Tests for custom error classes: correct codes, messages, and status codes.
 */

import { describe, it, expect } from 'vitest';
import {
  SchemaDriftError,
  DriftReportNotFoundError,
  InvalidDriftStatusTransitionError,
} from '@/lib/modules/schema-drift/schema-drift.errors';

describe('SchemaDriftError', () => {
  it('should create error with code, message, and default statusCode', () => {
    const error = new SchemaDriftError('TEST_CODE', 'Test message');
    expect(error.code).toBe('TEST_CODE');
    expect(error.message).toBe('Test message');
    expect(error.statusCode).toBe(400);
    expect(error.name).toBe('SchemaDriftError');
    expect(error).toBeInstanceOf(Error);
  });

  it('should accept custom statusCode', () => {
    const error = new SchemaDriftError('NOT_FOUND', 'Not found', 404);
    expect(error.statusCode).toBe(404);
  });
});

describe('DriftReportNotFoundError', () => {
  it('should create 404 error with report ID in message', () => {
    const reportId = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
    const error = new DriftReportNotFoundError(reportId);
    expect(error.code).toBe('DRIFT_REPORT_NOT_FOUND');
    expect(error.statusCode).toBe(404);
    expect(error.message).toContain(reportId);
    expect(error.name).toBe('DriftReportNotFoundError');
    expect(error).toBeInstanceOf(SchemaDriftError);
    expect(error).toBeInstanceOf(Error);
  });
});

describe('InvalidDriftStatusTransitionError', () => {
  it('should create 400 error with current and target status in message', () => {
    const error = new InvalidDriftStatusTransitionError('resolved', 'acknowledged');
    expect(error.code).toBe('INVALID_DRIFT_STATUS_TRANSITION');
    expect(error.statusCode).toBe(400);
    expect(error.message).toContain('resolved');
    expect(error.message).toContain('acknowledged');
    expect(error.name).toBe('InvalidDriftStatusTransitionError');
    expect(error).toBeInstanceOf(SchemaDriftError);
  });
});
