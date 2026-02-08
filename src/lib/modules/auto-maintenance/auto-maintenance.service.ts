/**
 * Auto-Maintenance Service
 *
 * Business logic layer: proposal management, approval workflow with description
 * cascade, revert, and batch operations.
 *
 * All operations verify tenant ownership before accessing/modifying data.
 * Schema updates and drift resolution are wrapped in transactions for atomicity.
 */

import prisma from '@/lib/db/client';
import { Prisma } from '@prisma/client';
import {
  ListProposalsQuerySchema,
  UpdateMaintenanceConfigSchema,
  DescriptionDecisionInputSchema,
  MaintenanceConfigSchema,
  VALID_PROPOSAL_TRANSITIONS,
  AutoMaintenanceErrorCodes,
  toMaintenanceProposalResponse,
  type MaintenanceProposalResponse,
  type ListProposalsResponse,
  type ProposalSummaryResponse,
  type MaintenanceConfig,
  type ProposalStatus,
} from './auto-maintenance.schemas';
import {
  ProposalNotFoundError,
  InvalidProposalTransitionError,
  SchemaApplicationError,
  RevertError,
  AutoMaintenanceError,
} from './auto-maintenance.errors';
import {
  createProposal,
  findProposalById,
  findProposalsByIntegration,
  findPendingByActionId,
  findPendingByIntegration,
  updateProposalStatus,
  updateDescriptionSuggestions,
  countByIntegrationAndStatus,
  findAndExpireStaleProposals,
  type CreateProposalInput,
} from './auto-maintenance.repository';
import { inferSchemaUpdates, findAffectedTools } from './schema-inference';
import {
  generateDescriptionSuggestions,
  applyDescriptionDecisions as cascadeApplyDescriptionDecisions,
} from './description-cascade';
import { createScrapeJob } from '@/lib/modules/ai/scrape-job.service';

// =============================================================================
// List & Get
// =============================================================================

/**
 * List proposals for an integration with pagination and filters.
 */
export async function listProposals(
  tenantId: string,
  integrationId: string,
  query: unknown
): Promise<ListProposalsResponse> {
  const parsed = ListProposalsQuerySchema.safeParse(query);
  if (!parsed.success) {
    throw new AutoMaintenanceError(
      AutoMaintenanceErrorCodes.INVALID_INPUT,
      `Invalid query parameters: ${parsed.error.message}`
    );
  }

  const { cursor, limit, status, severity, actionId } = parsed.data;

  const result = await findProposalsByIntegration(
    integrationId,
    tenantId,
    { cursor, limit },
    { status, severity, actionId }
  );

  return {
    proposals: result.proposals.map(toMaintenanceProposalResponse),
    pagination: {
      cursor: result.nextCursor,
      hasMore: result.nextCursor !== null,
      totalCount: result.totalCount,
    },
  };
}

/**
 * Get a single proposal by ID with tenant verification.
 */
export async function getProposal(
  tenantId: string,
  proposalId: string
): Promise<MaintenanceProposalResponse> {
  const proposal = await findProposalById(proposalId, tenantId);
  if (!proposal) {
    throw new ProposalNotFoundError(proposalId);
  }
  return toMaintenanceProposalResponse(proposal);
}

/**
 * Get proposal counts by status for an integration.
 */
export async function getProposalSummary(
  tenantId: string,
  integrationId: string
): Promise<ProposalSummaryResponse> {
  const counts = await countByIntegrationAndStatus(integrationId, tenantId);
  return {
    ...counts,
    total: counts.pending + counts.approved + counts.rejected + counts.expired + counts.reverted,
  };
}

// =============================================================================
// Approve
// =============================================================================

/**
 * Approve a pending proposal: apply schema updates + resolve drift reports
 * in a transaction, then generate description suggestions (best-effort).
 */
export async function approveProposal(
  tenantId: string,
  proposalId: string
): Promise<MaintenanceProposalResponse> {
  const proposal = await findProposalById(proposalId, tenantId);
  if (!proposal) {
    throw new ProposalNotFoundError(proposalId);
  }

  validateTransition(proposal.status, 'approved');

  const now = new Date();

  try {
    // Atomic: update action schemas + resolve drift + update proposal status
    await prisma.$transaction(async (tx) => {
      // Build action update data
      const actionUpdate: Prisma.ActionUpdateInput = {};
      if (proposal.proposedInputSchema) {
        actionUpdate.inputSchema = proposal.proposedInputSchema as Prisma.InputJsonValue;
      }
      if (proposal.proposedOutputSchema) {
        actionUpdate.outputSchema = proposal.proposedOutputSchema as Prisma.InputJsonValue;
      }

      // Apply schema updates to the action
      if (Object.keys(actionUpdate).length > 0) {
        await tx.action.update({
          where: { id: proposal.actionId },
          data: actionUpdate,
        });
      }

      // Resolve related drift reports
      await tx.driftReport.updateMany({
        where: {
          actionId: proposal.actionId,
          tenantId,
          status: { in: ['detected', 'acknowledged'] },
        },
        data: {
          status: 'resolved',
          resolvedAt: now,
        },
      });

      // Update proposal status
      await tx.maintenanceProposal.update({
        where: { id: proposalId },
        data: {
          status: 'approved',
          approvedAt: now,
          appliedAt: now,
        },
      });
    });
  } catch (error) {
    throw new SchemaApplicationError(
      proposalId,
      error instanceof Error ? error.message : 'Transaction failed'
    );
  }

  // Generate description suggestions (best-effort, non-blocking)
  try {
    const suggestions = await generateDescriptionSuggestions(proposal.actionId, tenantId);
    if (suggestions.length > 0) {
      await updateDescriptionSuggestions(proposalId, suggestions);
    }
  } catch (error) {
    console.error(
      `[auto-maintenance] Failed to generate description suggestions for proposal ${proposalId}:`,
      error
    );
  }

  // Re-fetch the updated proposal
  const updated = await findProposalById(proposalId, tenantId);
  if (!updated) {
    throw new ProposalNotFoundError(proposalId);
  }
  return toMaintenanceProposalResponse(updated);
}

// =============================================================================
// Reject
// =============================================================================

/**
 * Reject a pending proposal. Drift reports remain unresolved.
 */
export async function rejectProposal(
  tenantId: string,
  proposalId: string
): Promise<MaintenanceProposalResponse> {
  const proposal = await findProposalById(proposalId, tenantId);
  if (!proposal) {
    throw new ProposalNotFoundError(proposalId);
  }

  validateTransition(proposal.status, 'rejected');

  const updated = await updateProposalStatus(proposalId, tenantId, 'rejected', {
    rejectedAt: new Date(),
  });
  return toMaintenanceProposalResponse(updated);
}

// =============================================================================
// Revert
// =============================================================================

/**
 * Revert an approved proposal: restore previous schemas from snapshot,
 * re-open drift reports. Description updates the user accepted are NOT reverted.
 */
export async function revertProposal(
  tenantId: string,
  proposalId: string
): Promise<MaintenanceProposalResponse> {
  const proposal = await findProposalById(proposalId, tenantId);
  if (!proposal) {
    throw new ProposalNotFoundError(proposalId);
  }

  validateTransition(proposal.status, 'reverted');

  const now = new Date();

  try {
    await prisma.$transaction(async (tx) => {
      // Restore action schemas from snapshots
      await tx.action.update({
        where: { id: proposal.actionId },
        data: {
          inputSchema: proposal.currentInputSchema as Prisma.InputJsonValue,
          outputSchema: proposal.currentOutputSchema as Prisma.InputJsonValue,
        },
      });

      // Re-open related drift reports (back to "detected")
      if (proposal.driftReportIds.length > 0) {
        await tx.driftReport.updateMany({
          where: {
            id: { in: proposal.driftReportIds },
            tenantId,
          },
          data: {
            status: 'detected',
            resolvedAt: null,
          },
        });
      }

      // Update proposal status
      await tx.maintenanceProposal.update({
        where: { id: proposalId },
        data: {
          status: 'reverted',
          revertedAt: now,
        },
      });
    });
  } catch (error) {
    throw new RevertError(
      proposalId,
      error instanceof Error ? error.message : 'Transaction failed'
    );
  }

  const updated = await findProposalById(proposalId, tenantId);
  if (!updated) {
    throw new ProposalNotFoundError(proposalId);
  }
  return toMaintenanceProposalResponse(updated);
}

// =============================================================================
// Description Decisions
// =============================================================================

/**
 * Apply accept/skip decisions for description suggestions on an approved proposal.
 */
export async function applyDescriptionDecisions(
  tenantId: string,
  proposalId: string,
  input: unknown
): Promise<MaintenanceProposalResponse> {
  const parsed = DescriptionDecisionInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new AutoMaintenanceError(
      AutoMaintenanceErrorCodes.INVALID_INPUT,
      `Invalid description decisions: ${parsed.error.message}`
    );
  }

  const proposal = await findProposalById(proposalId, tenantId);
  if (!proposal) {
    throw new ProposalNotFoundError(proposalId);
  }

  if (proposal.status !== 'approved') {
    throw new InvalidProposalTransitionError(
      proposal.status,
      'apply description decisions (requires approved status)'
    );
  }

  await cascadeApplyDescriptionDecisions(proposalId, parsed.data.decisions);

  const updated = await findProposalById(proposalId, tenantId);
  if (!updated) {
    throw new ProposalNotFoundError(proposalId);
  }
  return toMaintenanceProposalResponse(updated);
}

// =============================================================================
// Batch Approve
// =============================================================================

/**
 * Approve all pending proposals for an integration up to a severity level.
 * Returns count of approved proposals.
 */
export async function batchApproveByIntegration(
  tenantId: string,
  integrationId: string,
  maxSeverity?: string
): Promise<{ approved: number; failed: number }> {
  const proposals = await findPendingByIntegration(integrationId, tenantId, maxSeverity);

  let approved = 0;
  let failed = 0;

  for (const proposal of proposals) {
    try {
      await approveProposal(tenantId, proposal.id);
      approved++;
    } catch (error) {
      console.error(`[auto-maintenance] Failed to batch-approve proposal ${proposal.id}:`, error);
      failed++;
    }
  }

  return { approved, failed };
}

// =============================================================================
// Proposal Generation
// =============================================================================

/**
 * Generate proposals for all drifted actions in an integration.
 * Reads unresolved drift reports, groups by action, infers schema updates,
 * and creates proposals.
 */
export async function generateProposalsForIntegration(
  integrationId: string,
  tenantId: string
): Promise<{ proposalsCreated: number; actionsAffected: number }> {
  // Load unresolved drift reports for this integration
  const driftReports = await prisma.driftReport.findMany({
    where: {
      integrationId,
      tenantId,
      status: { in: ['detected', 'acknowledged'] },
      severity: { in: ['breaking', 'warning', 'info'] },
    },
  });

  if (driftReports.length === 0) {
    return { proposalsCreated: 0, actionsAffected: 0 };
  }

  // Group drift reports by actionId
  const reportsByAction: Record<string, typeof driftReports> = {};
  for (const report of driftReports) {
    if (!reportsByAction[report.actionId]) {
      reportsByAction[report.actionId] = [];
    }
    reportsByAction[report.actionId].push(report);
  }

  // Load maintenance config for rescrape setting
  const integration = await prisma.integration.findUnique({
    where: { id: integrationId },
    select: { maintenanceConfig: true },
  });
  const config = parseMaintenanceConfig(integration?.maintenanceConfig);

  let proposalsCreated = 0;

  for (const actionId of Object.keys(reportsByAction)) {
    const reports = reportsByAction[actionId];
    // Skip if a pending proposal already exists for this action
    const existing = await findPendingByActionId(actionId);
    if (existing) continue;

    try {
      // Load the action's current schemas
      const action = await prisma.action.findUnique({
        where: { id: actionId },
        select: {
          id: true,
          integrationId: true,
          inputSchema: true,
          outputSchema: true,
          metadata: true,
        },
      });
      if (!action) continue;

      const currentInputSchema = (action.inputSchema as Record<string, unknown>) ?? {};
      const currentOutputSchema = (action.outputSchema as Record<string, unknown>) ?? {};

      // Infer schema updates from validation failure data
      const inference = await inferSchemaUpdates(
        actionId,
        reports,
        currentInputSchema,
        currentOutputSchema
      );

      // Skip if no changes inferred
      if (inference.changes.length === 0) continue;

      // Determine highest severity
      const severity = determineHighestSeverity(reports);

      // Find affected tools
      const affectedTools = await findAffectedTools(actionId);

      // Create proposal
      const proposalInput: CreateProposalInput = {
        integrationId,
        tenantId,
        actionId,
        severity,
        currentInputSchema,
        currentOutputSchema,
        proposedInputSchema: inference.proposedInputSchema as Record<string, unknown> | null,
        proposedOutputSchema: inference.proposedOutputSchema as Record<string, unknown> | null,
        changes: inference.changes,
        reasoning: inference.reasoning,
        source: 'inference',
        driftReportIds: reports.map((r) => r.id),
        affectedTools,
      };

      await createProposal(proposalInput);
      proposalsCreated++;

      // If rescrapeOnBreaking is enabled and there are breaking reports,
      // trigger a targeted re-scrape for higher-confidence proposal
      if (config.rescrapeOnBreaking && severity === 'breaking') {
        const metadata = action.metadata as Record<string, unknown> | null;
        const sourceUrls = metadata?.sourceUrls as string[] | undefined;
        if (sourceUrls && sourceUrls.length > 0) {
          try {
            await triggerTargetedRescrape(tenantId, actionId, sourceUrls);
          } catch (error) {
            console.error(
              `[auto-maintenance] Failed to trigger re-scrape for action ${actionId}:`,
              error
            );
          }
        }
      }
    } catch (error) {
      console.error(
        `[auto-maintenance] Failed to generate proposal for action ${actionId}:`,
        error
      );
    }
  }

  return { proposalsCreated, actionsAffected: Object.keys(reportsByAction).length };
}

/**
 * Generate a proposal with targeted doc re-scrape for a specific action.
 * Uses specificUrls mode to scrape only the relevant documentation pages.
 */
export async function generateProposalWithRescrape(
  actionId: string,
  tenantId: string
): Promise<MaintenanceProposalResponse | null> {
  const action = await prisma.action.findUnique({
    where: { id: actionId },
    select: {
      id: true,
      slug: true,
      integrationId: true,
      metadata: true,
    },
  });
  if (!action) return null;

  const metadata = action.metadata as Record<string, unknown> | null;
  const sourceUrls = metadata?.sourceUrls as string[] | undefined;
  if (!sourceUrls || sourceUrls.length === 0) return null;

  // Trigger a scrape job with specificUrls targeting this action's doc pages
  await triggerTargetedRescrape(tenantId, actionId, sourceUrls);

  // The scrape job runs asynchronously — the proposal will be created by
  // the next maintenance cycle after the scrape completes and drift is re-analyzed.
  // Return null to indicate the re-scrape was triggered but proposal isn't ready yet.
  return null;
}

// =============================================================================
// Maintenance Config
// =============================================================================

/**
 * Update the maintenance configuration for an integration.
 */
export async function updateMaintenanceConfig(
  tenantId: string,
  integrationId: string,
  input: unknown
): Promise<MaintenanceConfig> {
  const parsed = UpdateMaintenanceConfigSchema.safeParse(input);
  if (!parsed.success) {
    throw new AutoMaintenanceError(
      AutoMaintenanceErrorCodes.INVALID_INPUT,
      `Invalid maintenance config: ${parsed.error.message}`
    );
  }

  // Verify integration belongs to tenant
  const integration = await prisma.integration.findFirst({
    where: { id: integrationId, tenantId },
    select: { id: true, maintenanceConfig: true },
  });
  if (!integration) {
    throw new AutoMaintenanceError(
      AutoMaintenanceErrorCodes.INVALID_INPUT,
      `Integration not found: ${integrationId}`,
      404
    );
  }

  // Merge with existing config
  const currentConfig = parseMaintenanceConfig(integration.maintenanceConfig);
  const updatedConfig: MaintenanceConfig = {
    ...currentConfig,
    ...parsed.data,
  };

  await prisma.integration.update({
    where: { id: integrationId },
    data: {
      maintenanceConfig: updatedConfig as unknown as Prisma.InputJsonValue,
    },
  });

  return updatedConfig;
}

/**
 * Get the maintenance configuration for an integration.
 */
export async function getMaintenanceConfig(
  tenantId: string,
  integrationId: string
): Promise<MaintenanceConfig> {
  const integration = await prisma.integration.findFirst({
    where: { id: integrationId, tenantId },
    select: { maintenanceConfig: true },
  });
  if (!integration) {
    throw new AutoMaintenanceError(
      AutoMaintenanceErrorCodes.INVALID_INPUT,
      `Integration not found: ${integrationId}`,
      404
    );
  }

  return parseMaintenanceConfig(integration.maintenanceConfig);
}

// =============================================================================
// Stale Proposal Expiration
// =============================================================================

/**
 * Expire proposals whose drift reports have all been resolved naturally.
 * Called during maintenance job cleanup phase.
 */
export async function expireStaleProposals(): Promise<number> {
  return findAndExpireStaleProposals();
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Validate a status transition using the allowed transitions map.
 */
function validateTransition(currentStatus: string, targetStatus: ProposalStatus): void {
  const allowed = VALID_PROPOSAL_TRANSITIONS[currentStatus as ProposalStatus];
  if (!allowed || !allowed.includes(targetStatus)) {
    throw new InvalidProposalTransitionError(currentStatus, targetStatus);
  }
}

/**
 * Determine the highest severity from a set of drift reports.
 */
function determineHighestSeverity(reports: Array<{ severity: string }>): string {
  const severityOrder = ['breaking', 'warning', 'info'];
  for (const level of severityOrder) {
    if (reports.some((r) => r.severity === level)) {
      return level;
    }
  }
  return 'info';
}

/**
 * Parse maintenanceConfig JSON from the integration, applying defaults.
 */
function parseMaintenanceConfig(config: unknown): MaintenanceConfig {
  if (!config) {
    return { enabled: true, autoApproveInfoLevel: false, rescrapeOnBreaking: false };
  }
  const parsed = MaintenanceConfigSchema.safeParse(config);
  return parsed.success
    ? parsed.data
    : { enabled: true, autoApproveInfoLevel: false, rescrapeOnBreaking: false };
}

/**
 * Trigger a targeted doc re-scrape for a specific action's source URLs.
 */
async function triggerTargetedRescrape(
  tenantId: string,
  actionId: string,
  sourceUrls: string[]
): Promise<void> {
  // Load action slug for the wishlist filter
  const action = await prisma.action.findUnique({
    where: { id: actionId },
    select: { slug: true },
  });
  if (!action) return;

  await createScrapeJob(tenantId, {
    specificUrls: sourceUrls,
    wishlist: [action.slug],
  });
}
