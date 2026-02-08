/**
 * Passive Drift Analysis Job Handler
 *
 * Background job handler that runs the passive drift analyzer across all
 * integrations with drift detection enabled. Registered as 'schema_drift'
 * handler with the async job system.
 *
 * On each run:
 * 1. Queries all integrations (drift is enabled by default)
 * 2. Calls analyzeIntegration() for each
 * 3. Tracks totals and updates progress
 * 4. Returns summary as job output
 */

import type { Prisma } from '@prisma/client';

import prisma from '@/lib/db/client';
import type { JobHandlerContext } from '@/lib/modules/jobs/jobs.handlers';

import { analyzeIntegration } from '../passive-drift-analyzer';

// =============================================================================
// Handler
// =============================================================================

/**
 * Passive drift analysis job handler.
 * Called by the worker when a schema_drift job is claimed.
 *
 * Iterates over all integrations where drift detection is not explicitly
 * disabled, runs the passive analyzer on each, and returns aggregate results.
 */
export async function driftPassiveAnalysisHandler(
  context: JobHandlerContext
): Promise<Prisma.InputJsonValue> {
  const { updateProgress } = context;

  await updateProgress(0, { stage: 'querying_integrations' });

  // Query all integrations — exclude ones where driftConfig.enabled is explicitly false.
  // Integrations with null driftConfig or driftConfig without an 'enabled' field
  // default to enabled (handled by analyzeIntegration's parseDriftConfig).
  const integrations = await prisma.integration.findMany({
    where: {
      NOT: {
        driftConfig: { path: ['enabled'], equals: false },
      },
    },
    select: { id: true, tenantId: true },
  });

  const totalIntegrations = integrations.length;

  if (totalIntegrations === 0) {
    await updateProgress(100, { stage: 'completed', totalIntegrations: 0 });
    return {
      integrationsAnalyzed: 0,
      totalIntegrations: 0,
      reportsCreated: 0,
      reportsUpdated: 0,
    };
  }

  let integrationsAnalyzed = 0;
  let totalReportsCreated = 0;
  let totalReportsUpdated = 0;
  const errors: Array<{ integrationId: string; error: string }> = [];

  await updateProgress(5, { stage: 'analyzing', totalIntegrations });

  for (const integration of integrations) {
    try {
      const result = await analyzeIntegration(integration.id, integration.tenantId);
      totalReportsCreated += result.reportsCreated;
      totalReportsUpdated += result.reportsUpdated;
    } catch (error) {
      console.error(`[DRIFT_PASSIVE] Error analyzing integration ${integration.id}:`, error);
      errors.push({
        integrationId: integration.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    integrationsAnalyzed++;

    const progress = Math.min(95, 5 + Math.round((integrationsAnalyzed / totalIntegrations) * 90));
    await updateProgress(progress, {
      stage: 'analyzing',
      integrationsAnalyzed,
      totalIntegrations,
      reportsCreated: totalReportsCreated,
      reportsUpdated: totalReportsUpdated,
    });
  }

  await updateProgress(100, { stage: 'completed' });

  const summary: Record<string, unknown> = {
    integrationsAnalyzed,
    totalIntegrations,
    reportsCreated: totalReportsCreated,
    reportsUpdated: totalReportsUpdated,
  };

  if (errors.length > 0) {
    summary.errors = errors;
  }

  return summary as Prisma.InputJsonValue;
}
