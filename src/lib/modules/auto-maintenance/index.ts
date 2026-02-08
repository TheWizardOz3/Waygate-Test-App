/**
 * Auto-Maintenance System Module
 *
 * Automatically generates schema update proposals from drift reports,
 * manages approval workflows, and cascades description updates to affected tools.
 *
 * Registers the auto_maintenance job handler with the async job system.
 * Handler registration is a side effect of importing this module.
 */

// =============================================================================
// Handler Registration (side-effect)
// =============================================================================

import { registerJobHandler } from '@/lib/modules/jobs/jobs.handlers';
import { maintenanceHandler } from './handlers/maintenance.handler';

registerJobHandler('auto_maintenance', {
  handler: maintenanceHandler,
  concurrencyLimit: 1,
});

// =============================================================================
// Schemas & Types
// =============================================================================

export {
  // Enums
  ProposalStatusSchema,
  ProposalSeveritySchema,
  ProposalSourceSchema,
  SchemaDirectionSchema,
  ChangeTypeSchema,
  AffectedToolTypeSchema,
  DescriptionSuggestionStatusSchema,
  // Config
  MaintenanceConfigSchema,
  UpdateMaintenanceConfigSchema,
  // Change & Tool
  ProposalChangeSchema,
  AffectedToolSchema,
  DescriptionSuggestionSchema,
  // Query / Input
  ListProposalsQuerySchema,
  DescriptionDecisionInputSchema,
  // Response
  MaintenanceProposalResponseSchema,
  ProposalSummaryResponseSchema,
  ListProposalsResponseSchema,
  // Helpers
  toMaintenanceProposalResponse,
  // Status transitions
  VALID_PROPOSAL_TRANSITIONS,
  // Error codes
  AutoMaintenanceErrorCodes,
} from './auto-maintenance.schemas';

export type {
  ProposalStatus,
  ProposalSeverity,
  ProposalSource,
  SchemaDirection,
  ChangeType,
  AffectedToolType,
  DescriptionSuggestionStatus,
  MaintenanceConfig,
  UpdateMaintenanceConfigInput,
  ProposalChange,
  AffectedTool,
  DescriptionSuggestion,
  ListProposalsQuery,
  DescriptionDecisionInput,
  MaintenanceProposalResponse,
  ProposalSummaryResponse,
  ListProposalsResponse,
} from './auto-maintenance.schemas';

// =============================================================================
// Errors
// =============================================================================

export {
  AutoMaintenanceError,
  ProposalNotFoundError,
  InvalidProposalTransitionError,
  ProposalConflictError,
  SchemaApplicationError,
  RevertError,
} from './auto-maintenance.errors';

// =============================================================================
// Repository (Data Access)
// =============================================================================

export {
  createProposal,
  findProposalById,
  findProposalsByIntegration,
  findPendingByActionId,
  findPendingByIntegration,
  updateProposalStatus,
  updateDescriptionSuggestions,
  countByIntegrationAndStatus,
  expireProposalsForResolvedDrift,
  findAndExpireStaleProposals,
} from './auto-maintenance.repository';

export type {
  CreateProposalInput,
  ProposalPaginationOptions,
  ProposalFilterOptions,
  PaginatedProposals,
  ProposalStatusCounts,
} from './auto-maintenance.repository';

// =============================================================================
// Service (Business Logic)
// =============================================================================

export {
  listProposals,
  getProposal,
  getProposalSummary,
  approveProposal,
  rejectProposal,
  revertProposal,
  applyDescriptionDecisions,
  batchApproveByIntegration,
  generateProposalsForIntegration,
  generateProposalWithRescrape,
  updateMaintenanceConfig,
  getMaintenanceConfig,
  expireStaleProposals,
} from './auto-maintenance.service';

// =============================================================================
// Schema Inference
// =============================================================================

export { inferSchemaUpdates, findAffectedTools } from './schema-inference';

// =============================================================================
// Description Cascade
// =============================================================================

export {
  generateDescriptionSuggestions,
  applyDescriptionDecisions as cascadeApplyDescriptionDecisions,
} from './description-cascade';

// =============================================================================
// Handlers
// =============================================================================

export { maintenanceHandler } from './handlers/maintenance.handler';
