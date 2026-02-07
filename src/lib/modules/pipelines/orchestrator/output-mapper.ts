/**
 * Output Mapper
 *
 * Builds the pipeline's final output from accumulated state using
 * the pipeline's output mapping configuration.
 *
 * Output mapping maps template expressions to named output fields:
 *   {
 *     fields: {
 *       contacts: { source: "{{steps.create_leads.output.created}}" },
 *       companiesFound: { source: "{{steps.search.reasoning.companies.length}}" }
 *     },
 *     includeMeta: true
 *   }
 */

import type { OutputMapping } from '../pipeline.schemas';
import type { PipelineState } from './state-manager';
import { resolveTemplateString } from './template-resolver';
import { getStepStatusCounts } from './state-manager';

// =============================================================================
// Output Mapping
// =============================================================================

/**
 * Resolves the pipeline's output mapping against the final pipeline state.
 * Returns a plain object with the mapped fields.
 *
 * If a field's source expression can't be resolved (e.g., the referenced step
 * failed), the field is set to null rather than failing the entire output.
 */
export function resolveOutputMapping(
  mapping: OutputMapping,
  state: PipelineState
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  // Resolve each field
  if (mapping.fields) {
    for (const [fieldName, fieldConfig] of Object.entries(mapping.fields)) {
      try {
        result[fieldName] = resolveTemplateString(fieldConfig.source, state);
      } catch {
        // If template resolution fails, set to null
        result[fieldName] = null;
      }
    }
  }

  // Optionally include metadata about step execution
  if (mapping.includeMeta) {
    const counts = getStepStatusCounts(state);
    result._meta = {
      stepsCompleted: counts.completed,
      stepsFailed: counts.failed,
      stepsSkipped: counts.skipped,
      stepResults: Object.fromEntries(
        Object.entries(state.steps).map(([slug, r]) => [
          slug,
          { status: r.status, error: r.error ?? null },
        ])
      ),
    };
  }

  return result;
}
