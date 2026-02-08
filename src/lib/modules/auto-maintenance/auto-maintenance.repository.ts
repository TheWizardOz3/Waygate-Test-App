/**
 * Auto-Maintenance Repository
 *
 * Data access layer for MaintenanceProposal. Handles CRUD operations,
 * paginated queries, status transitions, and conflict detection.
 *
 * All queries are tenant-scoped for data isolation.
 */

import prisma from '@/lib/db/client';
import { Prisma } from '@prisma/client';
import type { MaintenanceProposal } from '@prisma/client';
import type {
  ProposalChange,
  AffectedTool,
  DescriptionSuggestion,
} from './auto-maintenance.schemas';

// =============================================================================
// Types
// =============================================================================

export interface CreateProposalInput {
  integrationId: string;
  tenantId: string;
  actionId: string;
  severity: string;
  currentInputSchema: Record<string, unknown>;
  currentOutputSchema: Record<string, unknown>;
  proposedInputSchema: Record<string, unknown> | null;
  proposedOutputSchema: Record<string, unknown> | null;
  changes: ProposalChange[];
  reasoning: string;
  source: string;
  driftReportIds: string[];
  affectedTools: AffectedTool[] | null;
}

export interface ProposalPaginationOptions {
  cursor?: string;
  limit?: number;
}

export interface ProposalFilterOptions {
  status?: string;
  severity?: string;
  actionId?: string;
}

export interface PaginatedProposals {
  proposals: MaintenanceProposal[];
  nextCursor: string | null;
  totalCount: number;
}

export interface ProposalStatusCounts {
  pending: number;
  approved: number;
  rejected: number;
  expired: number;
  reverted: number;
}

// =============================================================================
// Create
// =============================================================================

/**
 * Create a new maintenance proposal.
 * Checks for existing pending proposal on the same action to prevent duplicates.
 */
export async function createProposal(input: CreateProposalInput): Promise<MaintenanceProposal> {
  // Check for existing pending proposal on this action
  const existing = await prisma.maintenanceProposal.findFirst({
    where: {
      actionId: input.actionId,
      status: 'pending',
    },
    select: { id: true },
  });

  if (existing) {
    throw new Error(`PROPOSAL_CONFLICT:${input.actionId}`);
  }

  return prisma.maintenanceProposal.create({
    data: {
      integrationId: input.integrationId,
      tenantId: input.tenantId,
      actionId: input.actionId,
      severity: input.severity,
      currentInputSchema: JSON.parse(
        JSON.stringify(input.currentInputSchema)
      ) as Prisma.InputJsonValue,
      currentOutputSchema: JSON.parse(
        JSON.stringify(input.currentOutputSchema)
      ) as Prisma.InputJsonValue,
      proposedInputSchema: input.proposedInputSchema
        ? (JSON.parse(JSON.stringify(input.proposedInputSchema)) as Prisma.InputJsonValue)
        : Prisma.DbNull,
      proposedOutputSchema: input.proposedOutputSchema
        ? (JSON.parse(JSON.stringify(input.proposedOutputSchema)) as Prisma.InputJsonValue)
        : Prisma.DbNull,
      changes: JSON.parse(JSON.stringify(input.changes)) as Prisma.InputJsonValue,
      reasoning: input.reasoning,
      source: input.source,
      driftReportIds: input.driftReportIds,
      affectedTools: input.affectedTools
        ? (JSON.parse(JSON.stringify(input.affectedTools)) as Prisma.InputJsonValue)
        : Prisma.DbNull,
      descriptionSuggestions: Prisma.DbNull,
    },
  });
}

// =============================================================================
// Read
// =============================================================================

/**
 * Find a proposal by ID with tenant verification.
 */
export async function findProposalById(
  id: string,
  tenantId: string
): Promise<MaintenanceProposal | null> {
  return prisma.maintenanceProposal.findFirst({
    where: { id, tenantId },
  });
}

/**
 * Find proposals for an integration with cursor-based pagination and filtering.
 */
export async function findProposalsByIntegration(
  integrationId: string,
  tenantId: string,
  pagination: ProposalPaginationOptions = {},
  filters: ProposalFilterOptions = {}
): Promise<PaginatedProposals> {
  const { cursor, limit = 20 } = pagination;

  const where: Prisma.MaintenanceProposalWhereInput = {
    integrationId,
    tenantId,
  };

  if (filters.status) {
    where.status = filters.status;
  }
  if (filters.severity) {
    where.severity = filters.severity;
  }
  if (filters.actionId) {
    where.actionId = filters.actionId;
  }

  const totalCount = await prisma.maintenanceProposal.count({ where });

  const proposals = await prisma.maintenanceProposal.findMany({
    where,
    take: limit + 1,
    orderBy: { createdAt: 'desc' },
    ...(cursor && {
      cursor: { id: cursor },
      skip: 1,
    }),
  });

  const hasMore = proposals.length > limit;
  if (hasMore) {
    proposals.pop();
  }

  const nextCursor = hasMore && proposals.length > 0 ? proposals[proposals.length - 1].id : null;

  return { proposals, nextCursor, totalCount };
}

/**
 * Check if a pending proposal already exists for this action.
 */
export async function findPendingByActionId(actionId: string): Promise<MaintenanceProposal | null> {
  return prisma.maintenanceProposal.findFirst({
    where: {
      actionId,
      status: 'pending',
    },
  });
}

/**
 * Get all pending proposals for an integration, optionally filtered by max severity.
 * Used for batch approve.
 */
export async function findPendingByIntegration(
  integrationId: string,
  tenantId: string,
  maxSeverity?: string
): Promise<MaintenanceProposal[]> {
  const where: Prisma.MaintenanceProposalWhereInput = {
    integrationId,
    tenantId,
    status: 'pending',
  };

  if (maxSeverity) {
    // Filter to proposals at or below the given severity level
    const severityLevels: Record<string, string[]> = {
      info: ['info'],
      warning: ['info', 'warning'],
      breaking: ['info', 'warning', 'breaking'],
    };
    where.severity = { in: severityLevels[maxSeverity] || ['info'] };
  }

  return prisma.maintenanceProposal.findMany({
    where,
    orderBy: { createdAt: 'asc' },
  });
}

// =============================================================================
// Update
// =============================================================================

/**
 * Update proposal status with appropriate timestamp.
 */
export async function updateProposalStatus(
  id: string,
  tenantId: string,
  status: string,
  timestamps: Partial<{
    approvedAt: Date;
    rejectedAt: Date;
    expiredAt: Date;
    revertedAt: Date;
    appliedAt: Date;
  }> = {}
): Promise<MaintenanceProposal> {
  return prisma.maintenanceProposal.update({
    where: { id },
    data: {
      status,
      ...timestamps,
    },
  });
}

/**
 * Update description suggestions on a proposal.
 */
export async function updateDescriptionSuggestions(
  id: string,
  suggestions: DescriptionSuggestion[]
): Promise<MaintenanceProposal> {
  return prisma.maintenanceProposal.update({
    where: { id },
    data: {
      descriptionSuggestions: JSON.parse(JSON.stringify(suggestions)) as Prisma.InputJsonValue,
    },
  });
}

// =============================================================================
// Counts & Aggregations
// =============================================================================

/**
 * Get proposal counts by status for an integration.
 */
export async function countByIntegrationAndStatus(
  integrationId: string,
  tenantId: string
): Promise<ProposalStatusCounts> {
  const results = await prisma.maintenanceProposal.groupBy({
    by: ['status'],
    where: { integrationId, tenantId },
    _count: { status: true },
  });

  const counts: ProposalStatusCounts = {
    pending: 0,
    approved: 0,
    rejected: 0,
    expired: 0,
    reverted: 0,
  };

  for (const row of results) {
    const status = row.status as keyof ProposalStatusCounts;
    if (status in counts) {
      counts[status] = row._count.status;
    }
  }

  return counts;
}

// =============================================================================
// Expiration
// =============================================================================

/**
 * Expire pending proposals whose drift reports have all been resolved.
 * Called during maintenance job cleanup phase.
 */
export async function expireProposalsForResolvedDrift(driftReportIds: string[]): Promise<number> {
  if (driftReportIds.length === 0) return 0;

  // Find pending proposals that reference any of these drift report IDs
  const proposals = await prisma.maintenanceProposal.findMany({
    where: {
      status: 'pending',
      driftReportIds: { hasSome: driftReportIds },
    },
    select: { id: true, driftReportIds: true },
  });

  if (proposals.length === 0) return 0;

  // Check if all drift reports for each proposal are in the resolved set
  const resolvedSet = new Set(driftReportIds);
  const toExpire: string[] = [];

  for (const proposal of proposals) {
    const allResolved = proposal.driftReportIds.every((id) => resolvedSet.has(id));
    if (allResolved) {
      toExpire.push(proposal.id);
    }
  }

  if (toExpire.length === 0) return 0;

  const result = await prisma.maintenanceProposal.updateMany({
    where: { id: { in: toExpire } },
    data: {
      status: 'expired',
      expiredAt: new Date(),
    },
  });

  return result.count;
}

/**
 * Find all pending proposals and check which ones have fully resolved drift reports.
 * Used for periodic cleanup during maintenance job.
 */
export async function findAndExpireStaleProposals(): Promise<number> {
  const pendingProposals = await prisma.maintenanceProposal.findMany({
    where: { status: 'pending' },
    select: { id: true, driftReportIds: true },
  });

  if (pendingProposals.length === 0) return 0;

  // Collect all referenced drift report IDs
  const allDriftIds = new Set<string>();
  for (const p of pendingProposals) {
    for (const id of p.driftReportIds) {
      allDriftIds.add(id);
    }
  }

  // Check which drift reports are still unresolved
  const unresolvedReports = await prisma.driftReport.findMany({
    where: {
      id: { in: Array.from(allDriftIds) },
      status: { in: ['detected', 'acknowledged'] },
    },
    select: { id: true },
  });
  const unresolvedIds = new Set(unresolvedReports.map((r) => r.id));

  // Expire proposals where ALL drift reports have been resolved
  const toExpire: string[] = [];
  for (const proposal of pendingProposals) {
    const hasUnresolved = proposal.driftReportIds.some((id) => unresolvedIds.has(id));
    if (!hasUnresolved) {
      toExpire.push(proposal.id);
    }
  }

  if (toExpire.length === 0) return 0;

  const result = await prisma.maintenanceProposal.updateMany({
    where: { id: { in: toExpire } },
    data: {
      status: 'expired',
      expiredAt: new Date(),
    },
  });

  return result.count;
}
