/**
 * Auto-Maintenance Job Handler
 *
 * Background job handler that generates maintenance proposals from drift reports.
 * Triggered by the drift analyzer (event-driven) when new drift reports are found,
 * not a separate cron.
 *
 * On each run:
 * 1. Expire stale proposals (cleanup)
 * 2. Query integrations with maintenance enabled
 * 3. Generate proposals for each integration with unresolved drift
 * 4. Auto-approve info-level proposals if configured
 * 5. Return summary as job output
 */

import type { Prisma } from '@prisma/client';

import prisma from '@/lib/db/client';
import type { JobHandlerContext } from '@/lib/modules/jobs/jobs.handlers';

import {
  expireStaleProposals,
  generateProposalsForIntegration,
  approveProposal,
} from '../auto-maintenance.service';
import { MaintenanceConfigSchema } from '../auto-maintenance.schemas';

// =============================================================================
// Handler
// =============================================================================

/**
 * Auto-maintenance job handler.
 * Called by the worker when an auto_maintenance job is claimed.
 *
 * Iterates over all integrations where maintenance is not explicitly disabled,
 * generates proposals for those with unresolved drift reports, and optionally
 * auto-approves info-level proposals.
 */
export async function maintenanceHandler(
  context: JobHandlerContext
): Promise<Prisma.InputJsonValue> {
  const { updateProgress } = context;

  await updateProgress(0, { stage: 'expiring_stale_proposals' });

  // Phase 1: Expire stale proposals (cleanup)
  let expiredCount = 0;
  try {
    expiredCount = await expireStaleProposals();
  } catch (error) {
    console.error('[AUTO_MAINTENANCE] Error expiring stale proposals:', error);
  }

  await updateProgress(5, { stage: 'querying_integrations', expiredCount });

  // Phase 2: Query integrations with maintenance enabled (default = enabled)
  const integrations = await prisma.integration.findMany({
    where: {
      NOT: {
        maintenanceConfig: { path: ['enabled'], equals: false },
      },
    },
    select: { id: true, tenantId: true, maintenanceConfig: true },
  });

  const totalIntegrations = integrations.length;

  if (totalIntegrations === 0) {
    await updateProgress(100, { stage: 'completed', totalIntegrations: 0 });
    return {
      integrationsChecked: 0,
      proposalsCreated: 0,
      autoApproved: 0,
      expiredCount,
    };
  }

  let integrationsChecked = 0;
  let totalProposalsCreated = 0;
  let totalAutoApproved = 0;
  const errors: Array<{ integrationId: string; error: string }> = [];

  await updateProgress(10, { stage: 'generating_proposals', totalIntegrations });

  // Phase 3: Generate proposals for each integration
  for (const integration of integrations) {
    try {
      const result = await generateProposalsForIntegration(integration.id, integration.tenantId);
      totalProposalsCreated += result.proposalsCreated;

      // Phase 4: Auto-approve info-level proposals if configured
      const config = parseMaintenanceConfig(integration.maintenanceConfig);
      if (config.autoApproveInfoLevel && result.proposalsCreated > 0) {
        const autoApproved = await autoApproveInfoProposals(integration.id, integration.tenantId);
        totalAutoApproved += autoApproved;
      }
    } catch (error) {
      console.error(`[AUTO_MAINTENANCE] Error processing integration ${integration.id}:`, error);
      errors.push({
        integrationId: integration.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    integrationsChecked++;

    const progress = Math.min(95, 10 + Math.round((integrationsChecked / totalIntegrations) * 85));
    await updateProgress(progress, {
      stage: 'generating_proposals',
      integrationsChecked,
      totalIntegrations,
      proposalsCreated: totalProposalsCreated,
      autoApproved: totalAutoApproved,
    });
  }

  await updateProgress(100, { stage: 'completed' });

  const summary: Record<string, unknown> = {
    integrationsChecked,
    totalIntegrations,
    proposalsCreated: totalProposalsCreated,
    autoApproved: totalAutoApproved,
    expiredCount,
  };

  if (errors.length > 0) {
    summary.errors = errors;
  }

  return summary as Prisma.InputJsonValue;
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Parse maintenance config JSON, applying defaults.
 */
function parseMaintenanceConfig(config: unknown): {
  enabled: boolean;
  autoApproveInfoLevel: boolean;
  rescrapeOnBreaking: boolean;
} {
  if (!config) {
    return { enabled: true, autoApproveInfoLevel: false, rescrapeOnBreaking: false };
  }
  const parsed = MaintenanceConfigSchema.safeParse(config);
  return parsed.success
    ? parsed.data
    : { enabled: true, autoApproveInfoLevel: false, rescrapeOnBreaking: false };
}

/**
 * Auto-approve info-level pending proposals for an integration.
 * Returns count of auto-approved proposals.
 */
async function autoApproveInfoProposals(integrationId: string, tenantId: string): Promise<number> {
  const infoProposals = await prisma.maintenanceProposal.findMany({
    where: {
      integrationId,
      tenantId,
      status: 'pending',
      severity: 'info',
    },
    select: { id: true },
  });

  let approved = 0;
  for (const proposal of infoProposals) {
    try {
      await approveProposal(tenantId, proposal.id);
      approved++;
    } catch (error) {
      console.error(
        `[AUTO_MAINTENANCE] Failed to auto-approve info proposal ${proposal.id}:`,
        error
      );
    }
  }

  return approved;
}
