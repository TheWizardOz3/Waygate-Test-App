/**
 * Auto-Maintenance Error Classes Unit Tests
 *
 * Tests for custom error classes with correct codes, messages, and status codes.
 */

import { describe, it, expect } from 'vitest';
import {
  AutoMaintenanceError,
  ProposalNotFoundError,
  InvalidProposalTransitionError,
  ProposalConflictError,
  SchemaApplicationError,
  RevertError,
} from '@/lib/modules/auto-maintenance/auto-maintenance.errors';

const UUID_1 = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';

describe('AutoMaintenanceError', () => {
  it('should create base error with code, message, and default statusCode', () => {
    const error = new AutoMaintenanceError('TEST_CODE', 'Test message');
    expect(error.code).toBe('TEST_CODE');
    expect(error.message).toBe('Test message');
    expect(error.statusCode).toBe(400);
    expect(error.name).toBe('AutoMaintenanceError');
    expect(error).toBeInstanceOf(Error);
  });

  it('should accept custom statusCode', () => {
    const error = new AutoMaintenanceError('CUSTOM', 'Custom error', 500);
    expect(error.statusCode).toBe(500);
  });
});

describe('ProposalNotFoundError', () => {
  it('should have correct code, statusCode, and include proposalId in message', () => {
    const error = new ProposalNotFoundError(UUID_1);
    expect(error.code).toBe('PROPOSAL_NOT_FOUND');
    expect(error.statusCode).toBe(404);
    expect(error.message).toContain(UUID_1);
    expect(error.name).toBe('ProposalNotFoundError');
    expect(error).toBeInstanceOf(AutoMaintenanceError);
  });
});

describe('InvalidProposalTransitionError', () => {
  it('should have correct code and include both statuses in message', () => {
    const error = new InvalidProposalTransitionError('rejected', 'approved');
    expect(error.code).toBe('INVALID_PROPOSAL_TRANSITION');
    expect(error.statusCode).toBe(400);
    expect(error.message).toContain('rejected');
    expect(error.message).toContain('approved');
    expect(error.name).toBe('InvalidProposalTransitionError');
    expect(error).toBeInstanceOf(AutoMaintenanceError);
  });
});

describe('ProposalConflictError', () => {
  it('should have correct code and include actionId in message', () => {
    const error = new ProposalConflictError(UUID_1);
    expect(error.code).toBe('PROPOSAL_CONFLICT');
    expect(error.statusCode).toBe(409);
    expect(error.message).toContain(UUID_1);
    expect(error.name).toBe('ProposalConflictError');
    expect(error).toBeInstanceOf(AutoMaintenanceError);
  });
});

describe('SchemaApplicationError', () => {
  it('should have correct code and include proposalId and reason', () => {
    const error = new SchemaApplicationError(UUID_1, 'Action not found');
    expect(error.code).toBe('SCHEMA_APPLICATION_ERROR');
    expect(error.statusCode).toBe(500);
    expect(error.message).toContain(UUID_1);
    expect(error.message).toContain('Action not found');
    expect(error.name).toBe('SchemaApplicationError');
    expect(error).toBeInstanceOf(AutoMaintenanceError);
  });
});

describe('RevertError', () => {
  it('should have correct code and include proposalId and reason', () => {
    const error = new RevertError(UUID_1, 'Snapshot missing');
    expect(error.code).toBe('REVERT_ERROR');
    expect(error.statusCode).toBe(500);
    expect(error.message).toContain(UUID_1);
    expect(error.message).toContain('Snapshot missing');
    expect(error.name).toBe('RevertError');
    expect(error).toBeInstanceOf(AutoMaintenanceError);
  });
});
