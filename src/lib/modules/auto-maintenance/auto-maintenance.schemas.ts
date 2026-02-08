/**
 * Auto-Maintenance System Schemas
 *
 * Zod schemas for maintenance configuration, proposal responses, and API inputs.
 * The auto-maintenance system generates schema update proposals from drift reports,
 * manages approval workflows, and cascades description updates to affected tools.
 */

import { z } from 'zod';

// =============================================================================
// Enums
// =============================================================================

/**
 * Proposal status lifecycle (matches DB values)
 */
export const ProposalStatusSchema = z.enum([
  'pending',
  'approved',
  'rejected',
  'expired',
  'reverted',
]);
export type ProposalStatus = z.infer<typeof ProposalStatusSchema>;

/**
 * Proposal severity — highest severity of included drift reports
 */
export const ProposalSeveritySchema = z.enum(['info', 'warning', 'breaking']);
export type ProposalSeverity = z.infer<typeof ProposalSeveritySchema>;

/**
 * How the proposal was generated
 */
export const ProposalSourceSchema = z.enum(['inference', 'rescrape']);
export type ProposalSource = z.infer<typeof ProposalSourceSchema>;

/**
 * Direction of schema change
 */
export const SchemaDirectionSchema = z.enum(['input', 'output']);
export type SchemaDirection = z.infer<typeof SchemaDirectionSchema>;

/**
 * Type of schema change
 */
export const ChangeTypeSchema = z.enum([
  'field_made_nullable',
  'field_type_changed',
  'field_added',
  'field_made_optional',
  'enum_value_added',
  'field_added_required',
]);
export type ChangeType = z.infer<typeof ChangeTypeSchema>;

/**
 * Tool type for affected tools and description suggestions
 */
export const AffectedToolTypeSchema = z.enum(['action', 'composite', 'agentic']);
export type AffectedToolType = z.infer<typeof AffectedToolTypeSchema>;

/**
 * Status of a description suggestion
 */
export const DescriptionSuggestionStatusSchema = z.enum(['pending', 'accepted', 'skipped']);
export type DescriptionSuggestionStatus = z.infer<typeof DescriptionSuggestionStatusSchema>;

// =============================================================================
// Configuration Schemas
// =============================================================================

/**
 * Per-integration auto-maintenance configuration
 * Stored as JSON in Integration.maintenanceConfig
 */
export const MaintenanceConfigSchema = z.object({
  enabled: z.boolean().default(true),
  autoApproveInfoLevel: z.boolean().default(false),
  rescrapeOnBreaking: z.boolean().default(false),
});
export type MaintenanceConfig = z.infer<typeof MaintenanceConfigSchema>;

/**
 * Partial update for maintenance config
 */
export const UpdateMaintenanceConfigSchema = MaintenanceConfigSchema.partial();
export type UpdateMaintenanceConfigInput = z.infer<typeof UpdateMaintenanceConfigSchema>;

// =============================================================================
// Change & Tool Schemas
// =============================================================================

/**
 * Individual schema change within a proposal
 */
export const ProposalChangeSchema = z.object({
  direction: SchemaDirectionSchema,
  fieldPath: z.string(),
  changeType: ChangeTypeSchema,
  description: z.string(),
  driftReportId: z.string().uuid(),
  beforeValue: z.unknown().optional(),
  afterValue: z.unknown().optional(),
});
export type ProposalChange = z.infer<typeof ProposalChangeSchema>;

/**
 * Affected tool reference (snapshot at proposal time)
 */
export const AffectedToolSchema = z.object({
  toolType: AffectedToolTypeSchema,
  toolId: z.string().uuid(),
  toolName: z.string(),
});
export type AffectedTool = z.infer<typeof AffectedToolSchema>;

/**
 * Description update suggestion for an affected tool
 */
export const DescriptionSuggestionSchema = z.object({
  toolType: AffectedToolTypeSchema,
  toolId: z.string().uuid(),
  toolName: z.string(),
  currentDescription: z.string().nullable(),
  suggestedDescription: z.string(),
  status: DescriptionSuggestionStatusSchema,
});
export type DescriptionSuggestion = z.infer<typeof DescriptionSuggestionSchema>;

// =============================================================================
// Query Schemas
// =============================================================================

/**
 * Query parameters for listing maintenance proposals (API)
 */
export const ListProposalsQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: ProposalStatusSchema.optional(),
  severity: ProposalSeveritySchema.optional(),
  actionId: z.string().uuid().optional(),
});
export type ListProposalsQuery = z.infer<typeof ListProposalsQuerySchema>;

// =============================================================================
// Input Schemas
// =============================================================================

/**
 * Input for accepting/skipping description suggestions
 */
export const DescriptionDecisionInputSchema = z.object({
  decisions: z.array(
    z.object({
      toolId: z.string().uuid(),
      accept: z.boolean(),
    })
  ),
});
export type DescriptionDecisionInput = z.infer<typeof DescriptionDecisionInputSchema>;

// =============================================================================
// API Response Schemas
// =============================================================================

/**
 * Maintenance proposal as returned by the API
 */
export const MaintenanceProposalResponseSchema = z.object({
  id: z.string().uuid(),
  integrationId: z.string().uuid(),
  tenantId: z.string().uuid(),
  actionId: z.string().uuid(),
  status: ProposalStatusSchema,
  severity: ProposalSeveritySchema,
  currentInputSchema: z.record(z.string(), z.unknown()),
  currentOutputSchema: z.record(z.string(), z.unknown()),
  proposedInputSchema: z.record(z.string(), z.unknown()).nullable(),
  proposedOutputSchema: z.record(z.string(), z.unknown()).nullable(),
  changes: z.array(ProposalChangeSchema),
  reasoning: z.string(),
  source: ProposalSourceSchema,
  driftReportIds: z.array(z.string()),
  affectedTools: z.array(AffectedToolSchema).nullable(),
  descriptionSuggestions: z.array(DescriptionSuggestionSchema).nullable(),
  approvedAt: z.string().nullable(),
  rejectedAt: z.string().nullable(),
  expiredAt: z.string().nullable(),
  revertedAt: z.string().nullable(),
  appliedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type MaintenanceProposalResponse = z.infer<typeof MaintenanceProposalResponseSchema>;

/**
 * Proposal counts by status
 */
export const ProposalSummaryResponseSchema = z.object({
  pending: z.number().int(),
  approved: z.number().int(),
  rejected: z.number().int(),
  expired: z.number().int(),
  reverted: z.number().int(),
  total: z.number().int(),
});
export type ProposalSummaryResponse = z.infer<typeof ProposalSummaryResponseSchema>;

/**
 * Paginated list of proposals
 */
export const ListProposalsResponseSchema = z.object({
  proposals: z.array(MaintenanceProposalResponseSchema),
  pagination: z.object({
    cursor: z.string().nullable(),
    hasMore: z.boolean(),
    totalCount: z.number().int(),
  }),
});
export type ListProposalsResponse = z.infer<typeof ListProposalsResponseSchema>;

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Converts a database MaintenanceProposal to API response format
 */
export function toMaintenanceProposalResponse(proposal: {
  id: string;
  integrationId: string;
  tenantId: string;
  actionId: string;
  status: string;
  severity: string;
  currentInputSchema: unknown;
  currentOutputSchema: unknown;
  proposedInputSchema: unknown;
  proposedOutputSchema: unknown;
  changes: unknown;
  reasoning: string;
  source: string;
  driftReportIds: string[];
  affectedTools: unknown;
  descriptionSuggestions: unknown;
  approvedAt: Date | null;
  rejectedAt: Date | null;
  expiredAt: Date | null;
  revertedAt: Date | null;
  appliedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): MaintenanceProposalResponse {
  return {
    id: proposal.id,
    integrationId: proposal.integrationId,
    tenantId: proposal.tenantId,
    actionId: proposal.actionId,
    status: proposal.status as ProposalStatus,
    severity: proposal.severity as ProposalSeverity,
    currentInputSchema: proposal.currentInputSchema as Record<string, unknown>,
    currentOutputSchema: proposal.currentOutputSchema as Record<string, unknown>,
    proposedInputSchema: (proposal.proposedInputSchema as Record<string, unknown>) ?? null,
    proposedOutputSchema: (proposal.proposedOutputSchema as Record<string, unknown>) ?? null,
    changes: proposal.changes as ProposalChange[],
    reasoning: proposal.reasoning,
    source: proposal.source as ProposalSource,
    driftReportIds: proposal.driftReportIds,
    affectedTools: (proposal.affectedTools as AffectedTool[]) ?? null,
    descriptionSuggestions: (proposal.descriptionSuggestions as DescriptionSuggestion[]) ?? null,
    approvedAt: proposal.approvedAt?.toISOString() ?? null,
    rejectedAt: proposal.rejectedAt?.toISOString() ?? null,
    expiredAt: proposal.expiredAt?.toISOString() ?? null,
    revertedAt: proposal.revertedAt?.toISOString() ?? null,
    appliedAt: proposal.appliedAt?.toISOString() ?? null,
    createdAt: proposal.createdAt.toISOString(),
    updatedAt: proposal.updatedAt.toISOString(),
  };
}

// =============================================================================
// Status Transitions
// =============================================================================

/**
 * Valid status transitions for maintenance proposals
 */
export const VALID_PROPOSAL_TRANSITIONS: Record<ProposalStatus, ProposalStatus[]> = {
  pending: ['approved', 'rejected', 'expired'],
  approved: ['reverted'],
  rejected: [],
  expired: [],
  reverted: [],
};

// =============================================================================
// Error Codes
// =============================================================================

export const AutoMaintenanceErrorCodes = {
  PROPOSAL_NOT_FOUND: 'PROPOSAL_NOT_FOUND',
  INVALID_PROPOSAL_TRANSITION: 'INVALID_PROPOSAL_TRANSITION',
  PROPOSAL_CONFLICT: 'PROPOSAL_CONFLICT',
  SCHEMA_APPLICATION_ERROR: 'SCHEMA_APPLICATION_ERROR',
  REVERT_ERROR: 'REVERT_ERROR',
  INVALID_INPUT: 'INVALID_INPUT',
} as const;
