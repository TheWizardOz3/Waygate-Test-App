/**
 * Auto-Maintenance Schemas Unit Tests
 *
 * Tests for Zod validation schemas, enum validation, response formatters,
 * status transitions, and error codes.
 */

import { describe, it, expect } from 'vitest';
import {
  ProposalStatusSchema,
  ProposalSeveritySchema,
  ProposalSourceSchema,
  SchemaDirectionSchema,
  ChangeTypeSchema,
  AffectedToolTypeSchema,
  DescriptionSuggestionStatusSchema,
  MaintenanceConfigSchema,
  UpdateMaintenanceConfigSchema,
  ProposalChangeSchema,
  AffectedToolSchema,
  DescriptionSuggestionSchema,
  ListProposalsQuerySchema,
  DescriptionDecisionInputSchema,
  MaintenanceProposalResponseSchema,
  ProposalSummaryResponseSchema,
  ListProposalsResponseSchema,
  toMaintenanceProposalResponse,
  VALID_PROPOSAL_TRANSITIONS,
  AutoMaintenanceErrorCodes,
} from '@/lib/modules/auto-maintenance/auto-maintenance.schemas';

const UUID_1 = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
const UUID_2 = 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e';
const UUID_3 = 'c3d4e5f6-a7b8-4c9d-ae1f-2a3b4c5d6e7f';
const UUID_4 = 'd4e5f6a7-b8c9-4d0e-9f2a-3b4c5d6e7f8a';

// =============================================================================
// Enum Schema Tests
// =============================================================================

describe('ProposalStatusSchema', () => {
  it('should accept valid statuses', () => {
    expect(ProposalStatusSchema.parse('pending')).toBe('pending');
    expect(ProposalStatusSchema.parse('approved')).toBe('approved');
    expect(ProposalStatusSchema.parse('rejected')).toBe('rejected');
    expect(ProposalStatusSchema.parse('expired')).toBe('expired');
    expect(ProposalStatusSchema.parse('reverted')).toBe('reverted');
  });

  it('should reject invalid statuses', () => {
    expect(() => ProposalStatusSchema.parse('active')).toThrow();
    expect(() => ProposalStatusSchema.parse('detected')).toThrow();
    expect(() => ProposalStatusSchema.parse('')).toThrow();
  });
});

describe('ProposalSeveritySchema', () => {
  it('should accept valid severities', () => {
    expect(ProposalSeveritySchema.parse('info')).toBe('info');
    expect(ProposalSeveritySchema.parse('warning')).toBe('warning');
    expect(ProposalSeveritySchema.parse('breaking')).toBe('breaking');
  });

  it('should reject invalid severities', () => {
    expect(() => ProposalSeveritySchema.parse('critical')).toThrow();
    expect(() => ProposalSeveritySchema.parse('')).toThrow();
  });
});

describe('ProposalSourceSchema', () => {
  it('should accept valid sources', () => {
    expect(ProposalSourceSchema.parse('inference')).toBe('inference');
    expect(ProposalSourceSchema.parse('rescrape')).toBe('rescrape');
  });

  it('should reject invalid sources', () => {
    expect(() => ProposalSourceSchema.parse('manual')).toThrow();
    expect(() => ProposalSourceSchema.parse('')).toThrow();
  });
});

describe('SchemaDirectionSchema', () => {
  it('should accept valid directions', () => {
    expect(SchemaDirectionSchema.parse('input')).toBe('input');
    expect(SchemaDirectionSchema.parse('output')).toBe('output');
  });

  it('should reject invalid directions', () => {
    expect(() => SchemaDirectionSchema.parse('both')).toThrow();
    expect(() => SchemaDirectionSchema.parse('')).toThrow();
  });
});

describe('ChangeTypeSchema', () => {
  it('should accept all valid change types', () => {
    expect(ChangeTypeSchema.parse('field_made_nullable')).toBe('field_made_nullable');
    expect(ChangeTypeSchema.parse('field_type_changed')).toBe('field_type_changed');
    expect(ChangeTypeSchema.parse('field_added')).toBe('field_added');
    expect(ChangeTypeSchema.parse('field_made_optional')).toBe('field_made_optional');
    expect(ChangeTypeSchema.parse('enum_value_added')).toBe('enum_value_added');
    expect(ChangeTypeSchema.parse('field_added_required')).toBe('field_added_required');
  });

  it('should reject invalid change types', () => {
    expect(() => ChangeTypeSchema.parse('field_removed')).toThrow();
    expect(() => ChangeTypeSchema.parse('')).toThrow();
  });
});

describe('AffectedToolTypeSchema', () => {
  it('should accept valid tool types', () => {
    expect(AffectedToolTypeSchema.parse('action')).toBe('action');
    expect(AffectedToolTypeSchema.parse('composite')).toBe('composite');
    expect(AffectedToolTypeSchema.parse('agentic')).toBe('agentic');
  });

  it('should reject invalid tool types', () => {
    expect(() => AffectedToolTypeSchema.parse('pipeline')).toThrow();
    expect(() => AffectedToolTypeSchema.parse('')).toThrow();
  });
});

describe('DescriptionSuggestionStatusSchema', () => {
  it('should accept valid statuses', () => {
    expect(DescriptionSuggestionStatusSchema.parse('pending')).toBe('pending');
    expect(DescriptionSuggestionStatusSchema.parse('accepted')).toBe('accepted');
    expect(DescriptionSuggestionStatusSchema.parse('skipped')).toBe('skipped');
  });

  it('should reject invalid statuses', () => {
    expect(() => DescriptionSuggestionStatusSchema.parse('rejected')).toThrow();
    expect(() => DescriptionSuggestionStatusSchema.parse('')).toThrow();
  });
});

// =============================================================================
// Configuration Schema Tests
// =============================================================================

describe('MaintenanceConfigSchema', () => {
  it('should apply defaults when parsing empty object', () => {
    const result = MaintenanceConfigSchema.parse({});
    expect(result.enabled).toBe(true);
    expect(result.autoApproveInfoLevel).toBe(false);
    expect(result.rescrapeOnBreaking).toBe(false);
  });

  it('should accept full config', () => {
    const result = MaintenanceConfigSchema.parse({
      enabled: false,
      autoApproveInfoLevel: true,
      rescrapeOnBreaking: true,
    });
    expect(result.enabled).toBe(false);
    expect(result.autoApproveInfoLevel).toBe(true);
    expect(result.rescrapeOnBreaking).toBe(true);
  });

  it('should reject non-boolean enabled', () => {
    expect(() => MaintenanceConfigSchema.parse({ enabled: 'yes' })).toThrow();
  });

  it('should reject non-boolean autoApproveInfoLevel', () => {
    expect(() => MaintenanceConfigSchema.parse({ autoApproveInfoLevel: 1 })).toThrow();
  });
});

describe('UpdateMaintenanceConfigSchema', () => {
  it('should accept partial config', () => {
    const result = UpdateMaintenanceConfigSchema.parse({ enabled: false });
    expect(result.enabled).toBe(false);
  });

  it('should accept empty object', () => {
    const result = UpdateMaintenanceConfigSchema.parse({});
    expect(result).toBeDefined();
  });
});

// =============================================================================
// Change & Tool Schema Tests
// =============================================================================

describe('ProposalChangeSchema', () => {
  const validChange = {
    direction: 'output' as const,
    fieldPath: 'user.email',
    changeType: 'field_made_nullable' as const,
    description: 'Field user.email received null values',
    driftReportId: UUID_1,
  };

  it('should accept valid change', () => {
    const result = ProposalChangeSchema.parse(validChange);
    expect(result.direction).toBe('output');
    expect(result.fieldPath).toBe('user.email');
    expect(result.changeType).toBe('field_made_nullable');
  });

  it('should accept change with optional before/after values', () => {
    const result = ProposalChangeSchema.parse({
      ...validChange,
      beforeValue: 'string',
      afterValue: 'string | null',
    });
    expect(result.beforeValue).toBe('string');
    expect(result.afterValue).toBe('string | null');
  });

  it('should reject invalid direction', () => {
    expect(() => ProposalChangeSchema.parse({ ...validChange, direction: 'both' })).toThrow();
  });

  it('should reject invalid changeType', () => {
    expect(() =>
      ProposalChangeSchema.parse({ ...validChange, changeType: 'field_removed' })
    ).toThrow();
  });

  it('should reject non-UUID driftReportId', () => {
    expect(() =>
      ProposalChangeSchema.parse({ ...validChange, driftReportId: 'not-a-uuid' })
    ).toThrow();
  });

  it('should reject missing required fields', () => {
    expect(() => ProposalChangeSchema.parse({})).toThrow();
    expect(() => ProposalChangeSchema.parse({ direction: 'output' })).toThrow();
  });
});

describe('AffectedToolSchema', () => {
  it('should accept valid affected tool', () => {
    const result = AffectedToolSchema.parse({
      toolType: 'composite',
      toolId: UUID_1,
      toolName: 'My Composite Tool',
    });
    expect(result.toolType).toBe('composite');
    expect(result.toolName).toBe('My Composite Tool');
  });

  it('should reject invalid toolType', () => {
    expect(() =>
      AffectedToolSchema.parse({ toolType: 'pipeline', toolId: UUID_1, toolName: 'test' })
    ).toThrow();
  });

  it('should reject non-UUID toolId', () => {
    expect(() =>
      AffectedToolSchema.parse({ toolType: 'action', toolId: 'bad', toolName: 'test' })
    ).toThrow();
  });
});

describe('DescriptionSuggestionSchema', () => {
  it('should accept valid suggestion', () => {
    const result = DescriptionSuggestionSchema.parse({
      toolType: 'action',
      toolId: UUID_1,
      toolName: 'Send Message',
      currentDescription: 'Old description',
      suggestedDescription: 'New description',
      status: 'pending',
    });
    expect(result.status).toBe('pending');
    expect(result.currentDescription).toBe('Old description');
  });

  it('should accept null currentDescription', () => {
    const result = DescriptionSuggestionSchema.parse({
      toolType: 'action',
      toolId: UUID_1,
      toolName: 'Send Message',
      currentDescription: null,
      suggestedDescription: 'New description',
      status: 'pending',
    });
    expect(result.currentDescription).toBeNull();
  });

  it('should reject invalid status', () => {
    expect(() =>
      DescriptionSuggestionSchema.parse({
        toolType: 'action',
        toolId: UUID_1,
        toolName: 'Test',
        currentDescription: 'Old',
        suggestedDescription: 'New',
        status: 'rejected',
      })
    ).toThrow();
  });
});

// =============================================================================
// Query Schema Tests
// =============================================================================

describe('ListProposalsQuerySchema', () => {
  it('should apply defaults', () => {
    const result = ListProposalsQuerySchema.parse({});
    expect(result.limit).toBe(20);
    expect(result.cursor).toBeUndefined();
    expect(result.status).toBeUndefined();
    expect(result.severity).toBeUndefined();
    expect(result.actionId).toBeUndefined();
  });

  it('should accept valid full query', () => {
    const result = ListProposalsQuerySchema.parse({
      cursor: 'some-cursor',
      limit: 50,
      status: 'pending',
      severity: 'breaking',
      actionId: UUID_1,
    });
    expect(result.limit).toBe(50);
    expect(result.status).toBe('pending');
    expect(result.severity).toBe('breaking');
  });

  it('should coerce string limit to number', () => {
    const result = ListProposalsQuerySchema.parse({ limit: '10' });
    expect(result.limit).toBe(10);
  });

  it('should reject limit below 1', () => {
    expect(() => ListProposalsQuerySchema.parse({ limit: 0 })).toThrow();
  });

  it('should reject limit above 100', () => {
    expect(() => ListProposalsQuerySchema.parse({ limit: 101 })).toThrow();
  });

  it('should reject invalid status filter', () => {
    expect(() => ListProposalsQuerySchema.parse({ status: 'active' })).toThrow();
  });

  it('should reject invalid severity filter', () => {
    expect(() => ListProposalsQuerySchema.parse({ severity: 'critical' })).toThrow();
  });

  it('should reject invalid actionId format', () => {
    expect(() => ListProposalsQuerySchema.parse({ actionId: 'not-a-uuid' })).toThrow();
  });
});

// =============================================================================
// Input Schema Tests
// =============================================================================

describe('DescriptionDecisionInputSchema', () => {
  it('should accept valid decisions', () => {
    const result = DescriptionDecisionInputSchema.parse({
      decisions: [
        { toolId: UUID_1, accept: true },
        { toolId: UUID_2, accept: false },
      ],
    });
    expect(result.decisions).toHaveLength(2);
    expect(result.decisions[0].accept).toBe(true);
    expect(result.decisions[1].accept).toBe(false);
  });

  it('should accept empty decisions array', () => {
    const result = DescriptionDecisionInputSchema.parse({ decisions: [] });
    expect(result.decisions).toHaveLength(0);
  });

  it('should reject non-UUID toolId', () => {
    expect(() =>
      DescriptionDecisionInputSchema.parse({
        decisions: [{ toolId: 'bad', accept: true }],
      })
    ).toThrow();
  });

  it('should reject missing accept field', () => {
    expect(() =>
      DescriptionDecisionInputSchema.parse({
        decisions: [{ toolId: UUID_1 }],
      })
    ).toThrow();
  });

  it('should reject missing decisions field', () => {
    expect(() => DescriptionDecisionInputSchema.parse({})).toThrow();
  });
});

// =============================================================================
// Response Schema Tests
// =============================================================================

describe('MaintenanceProposalResponseSchema', () => {
  const validResponse = {
    id: UUID_1,
    integrationId: UUID_2,
    tenantId: UUID_3,
    actionId: UUID_4,
    status: 'pending',
    severity: 'breaking',
    currentInputSchema: { type: 'object', properties: {} },
    currentOutputSchema: { type: 'object', properties: {} },
    proposedInputSchema: null,
    proposedOutputSchema: { type: 'object', properties: { email: { type: ['string', 'null'] } } },
    changes: [
      {
        direction: 'output',
        fieldPath: 'email',
        changeType: 'field_made_nullable',
        description: 'Field email received null values',
        driftReportId: UUID_1,
      },
    ],
    reasoning: 'Field email is now nullable',
    source: 'inference',
    driftReportIds: [UUID_1],
    affectedTools: [{ toolType: 'action', toolId: UUID_4, toolName: 'Get User' }],
    descriptionSuggestions: null,
    approvedAt: null,
    rejectedAt: null,
    expiredAt: null,
    revertedAt: null,
    appliedAt: null,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  };

  it('should accept valid response', () => {
    const result = MaintenanceProposalResponseSchema.parse(validResponse);
    expect(result.id).toBe(UUID_1);
    expect(result.status).toBe('pending');
    expect(result.severity).toBe('breaking');
    expect(result.changes).toHaveLength(1);
  });

  it('should accept response with all nullable fields populated', () => {
    const result = MaintenanceProposalResponseSchema.parse({
      ...validResponse,
      status: 'approved',
      approvedAt: '2025-01-02T00:00:00.000Z',
      appliedAt: '2025-01-02T00:00:00.000Z',
      descriptionSuggestions: [
        {
          toolType: 'action',
          toolId: UUID_4,
          toolName: 'Get User',
          currentDescription: 'Old',
          suggestedDescription: 'New',
          status: 'pending',
        },
      ],
    });
    expect(result.approvedAt).toBe('2025-01-02T00:00:00.000Z');
    expect(result.descriptionSuggestions).toHaveLength(1);
  });

  it('should reject non-UUID id', () => {
    expect(() =>
      MaintenanceProposalResponseSchema.parse({ ...validResponse, id: 'bad' })
    ).toThrow();
  });

  it('should reject invalid status', () => {
    expect(() =>
      MaintenanceProposalResponseSchema.parse({ ...validResponse, status: 'active' })
    ).toThrow();
  });
});

describe('ProposalSummaryResponseSchema', () => {
  it('should accept valid summary', () => {
    const result = ProposalSummaryResponseSchema.parse({
      pending: 3,
      approved: 2,
      rejected: 1,
      expired: 0,
      reverted: 0,
      total: 6,
    });
    expect(result.total).toBe(6);
    expect(result.pending).toBe(3);
  });

  it('should reject non-integer values', () => {
    expect(() =>
      ProposalSummaryResponseSchema.parse({
        pending: 1.5,
        approved: 0,
        rejected: 0,
        expired: 0,
        reverted: 0,
        total: 1.5,
      })
    ).toThrow();
  });

  it('should reject missing fields', () => {
    expect(() => ProposalSummaryResponseSchema.parse({ pending: 1, approved: 0 })).toThrow();
  });
});

describe('ListProposalsResponseSchema', () => {
  it('should accept valid paginated response', () => {
    const result = ListProposalsResponseSchema.parse({
      proposals: [],
      pagination: { cursor: null, hasMore: false, totalCount: 0 },
    });
    expect(result.proposals).toHaveLength(0);
    expect(result.pagination.hasMore).toBe(false);
  });

  it('should accept response with pagination cursor', () => {
    const result = ListProposalsResponseSchema.parse({
      proposals: [],
      pagination: { cursor: 'next-id', hasMore: true, totalCount: 25 },
    });
    expect(result.pagination.cursor).toBe('next-id');
    expect(result.pagination.totalCount).toBe(25);
  });
});

// =============================================================================
// toMaintenanceProposalResponse Tests
// =============================================================================

describe('toMaintenanceProposalResponse', () => {
  const now = new Date('2025-01-15T10:30:00.000Z');

  const dbProposal = {
    id: UUID_1,
    integrationId: UUID_2,
    tenantId: UUID_3,
    actionId: UUID_4,
    status: 'pending',
    severity: 'breaking',
    currentInputSchema: { type: 'object' },
    currentOutputSchema: { type: 'object', properties: { email: { type: 'string' } } },
    proposedInputSchema: null,
    proposedOutputSchema: { type: 'object', properties: { email: { type: ['string', 'null'] } } },
    changes: [
      {
        direction: 'output',
        fieldPath: 'email',
        changeType: 'field_made_nullable',
        description: 'Field email is now nullable',
        driftReportId: UUID_1,
      },
    ],
    reasoning: 'Test reasoning',
    source: 'inference',
    driftReportIds: [UUID_1],
    affectedTools: [{ toolType: 'action', toolId: UUID_4, toolName: 'Get User' }],
    descriptionSuggestions: null,
    approvedAt: null,
    rejectedAt: null,
    expiredAt: null,
    revertedAt: null,
    appliedAt: null,
    createdAt: now,
    updatedAt: now,
  };

  it('should convert DB record to API response with ISO date strings', () => {
    const result = toMaintenanceProposalResponse(dbProposal);
    expect(result.id).toBe(UUID_1);
    expect(result.status).toBe('pending');
    expect(result.createdAt).toBe('2025-01-15T10:30:00.000Z');
    expect(result.updatedAt).toBe('2025-01-15T10:30:00.000Z');
    expect(result.proposedInputSchema).toBeNull();
    expect(result.proposedOutputSchema).toEqual({
      type: 'object',
      properties: { email: { type: ['string', 'null'] } },
    });
  });

  it('should convert nullable date fields when present', () => {
    const approvedDate = new Date('2025-01-16T00:00:00.000Z');
    const appliedDate = new Date('2025-01-16T00:01:00.000Z');

    const result = toMaintenanceProposalResponse({
      ...dbProposal,
      status: 'approved',
      approvedAt: approvedDate,
      appliedAt: appliedDate,
    });
    expect(result.approvedAt).toBe('2025-01-16T00:00:00.000Z');
    expect(result.appliedAt).toBe('2025-01-16T00:01:00.000Z');
    expect(result.rejectedAt).toBeNull();
  });

  it('should handle null affectedTools and descriptionSuggestions', () => {
    const result = toMaintenanceProposalResponse(dbProposal);
    expect(result.descriptionSuggestions).toBeNull();
  });

  it('should pass through affectedTools when present', () => {
    const result = toMaintenanceProposalResponse(dbProposal);
    expect(result.affectedTools).toEqual([
      { toolType: 'action', toolId: UUID_4, toolName: 'Get User' },
    ]);
  });
});

// =============================================================================
// Status Transitions Tests
// =============================================================================

describe('VALID_PROPOSAL_TRANSITIONS', () => {
  it('should allow pending → approved, rejected, expired', () => {
    expect(VALID_PROPOSAL_TRANSITIONS.pending).toEqual(
      expect.arrayContaining(['approved', 'rejected', 'expired'])
    );
    expect(VALID_PROPOSAL_TRANSITIONS.pending).toHaveLength(3);
  });

  it('should allow approved → reverted', () => {
    expect(VALID_PROPOSAL_TRANSITIONS.approved).toEqual(['reverted']);
  });

  it('should make rejected a terminal state', () => {
    expect(VALID_PROPOSAL_TRANSITIONS.rejected).toEqual([]);
  });

  it('should make expired a terminal state', () => {
    expect(VALID_PROPOSAL_TRANSITIONS.expired).toEqual([]);
  });

  it('should make reverted a terminal state', () => {
    expect(VALID_PROPOSAL_TRANSITIONS.reverted).toEqual([]);
  });
});

// =============================================================================
// Error Codes Tests
// =============================================================================

describe('AutoMaintenanceErrorCodes', () => {
  it('should contain expected error codes', () => {
    expect(AutoMaintenanceErrorCodes.PROPOSAL_NOT_FOUND).toBe('PROPOSAL_NOT_FOUND');
    expect(AutoMaintenanceErrorCodes.INVALID_PROPOSAL_TRANSITION).toBe(
      'INVALID_PROPOSAL_TRANSITION'
    );
    expect(AutoMaintenanceErrorCodes.PROPOSAL_CONFLICT).toBe('PROPOSAL_CONFLICT');
    expect(AutoMaintenanceErrorCodes.SCHEMA_APPLICATION_ERROR).toBe('SCHEMA_APPLICATION_ERROR');
    expect(AutoMaintenanceErrorCodes.REVERT_ERROR).toBe('REVERT_ERROR');
    expect(AutoMaintenanceErrorCodes.INVALID_INPUT).toBe('INVALID_INPUT');
  });

  it('should have exactly 6 error codes', () => {
    expect(Object.keys(AutoMaintenanceErrorCodes)).toHaveLength(6);
  });
});
