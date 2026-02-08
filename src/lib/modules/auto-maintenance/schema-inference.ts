/**
 * Schema Inference Engine
 *
 * Core logic to infer schema updates from drift reports and validation failure data.
 * Handles both input and output schemas. The primary (free, fast) proposal generation
 * strategy — infers changes from existing ValidationFailure records without external calls.
 */

import prisma from '@/lib/db/client';
import type { ValidationFailure, DriftReport } from '@prisma/client';
import type {
  ProposalChange,
  AffectedTool,
  ChangeType,
  SchemaDirection,
} from './auto-maintenance.schemas';

// =============================================================================
// Types
// =============================================================================

/** JSON Schema type definition (simplified for our manipulation needs) */
interface JsonSchemaProperty {
  type?: string | string[];
  enum?: unknown[];
  properties?: Record<string, JsonSchemaProperty>;
  items?: JsonSchemaProperty;
  required?: string[];
  [key: string]: unknown;
}

interface JsonSchema {
  type?: string;
  properties?: Record<string, JsonSchemaProperty>;
  required?: string[];
  [key: string]: unknown;
}

/** Result of schema inference */
export interface InferenceResult {
  proposedInputSchema: JsonSchema | null;
  proposedOutputSchema: JsonSchema | null;
  changes: ProposalChange[];
  reasoning: string;
}

// =============================================================================
// Issue Code to Change Type Mapping
// =============================================================================

const OUTPUT_ISSUE_MAP: Record<string, ChangeType> = {
  type_mismatch: 'field_type_changed',
  unexpected_field: 'field_added',
  missing_required_field: 'field_made_optional',
  invalid_enum_value: 'enum_value_added',
};

const INPUT_ISSUE_MAP: Record<string, ChangeType> = {
  missing_required_field: 'field_added_required',
  type_mismatch: 'field_type_changed',
};

// =============================================================================
// Core Inference
// =============================================================================

/**
 * Infer schema updates from drift reports and their associated validation failures.
 * Groups failures by direction, applies changes to cloned schemas.
 */
export async function inferSchemaUpdates(
  actionId: string,
  driftReports: DriftReport[],
  currentInputSchema: JsonSchema,
  currentOutputSchema: JsonSchema
): Promise<InferenceResult> {
  if (driftReports.length === 0) {
    return { proposedInputSchema: null, proposedOutputSchema: null, changes: [], reasoning: '' };
  }

  // Load validation failures for this action that match the drift reports
  const driftReportIds = driftReports.map((r) => r.id);
  const failures = await prisma.validationFailure.findMany({
    where: { actionId },
    orderBy: { failureCount: 'desc' },
  });

  // Match failures to drift reports by issueCode + fieldPath
  const driftFingerprints = new Set(driftReports.map((r) => `${r.issueCode}:${r.fieldPath}`));
  const relevantFailures = failures.filter((f) =>
    driftFingerprints.has(`${f.issueCode}:${f.fieldPath}`)
  );

  if (relevantFailures.length === 0) {
    return { proposedInputSchema: null, proposedOutputSchema: null, changes: [], reasoning: '' };
  }

  // Group failures by direction
  const outputFailures = relevantFailures.filter((f) => f.direction === 'output');
  const inputFailures = relevantFailures.filter((f) => f.direction === 'input');

  const changes: ProposalChange[] = [];
  let proposedInputSchema: JsonSchema | null = null;
  let proposedOutputSchema: JsonSchema | null = null;

  // Process output failures
  if (outputFailures.length > 0) {
    proposedOutputSchema = structuredClone(currentOutputSchema);
    for (const failure of outputFailures) {
      const driftReport = driftReports.find(
        (r) => r.issueCode === failure.issueCode && r.fieldPath === failure.fieldPath
      );
      if (!driftReport) continue;

      const change = applyFailureToSchema(proposedOutputSchema, failure, 'output', driftReport.id);
      if (change) {
        changes.push(change);
      }
    }
    // If no changes were actually applied, null it out
    if (changes.filter((c) => c.direction === 'output').length === 0) {
      proposedOutputSchema = null;
    }
  }

  // Process input failures
  if (inputFailures.length > 0) {
    proposedInputSchema = structuredClone(currentInputSchema);
    for (const failure of inputFailures) {
      const driftReport = driftReports.find(
        (r) => r.issueCode === failure.issueCode && r.fieldPath === failure.fieldPath
      );
      if (!driftReport) continue;

      const change = applyFailureToSchema(proposedInputSchema, failure, 'input', driftReport.id);
      if (change) {
        changes.push(change);
      }
    }
    if (changes.filter((c) => c.direction === 'input').length === 0) {
      proposedInputSchema = null;
    }
  }

  const reasoning = generateOverallReasoning(changes, driftReportIds);

  return { proposedInputSchema, proposedOutputSchema, changes, reasoning };
}

// =============================================================================
// Schema Modification
// =============================================================================

/**
 * Apply a single validation failure as a change to the schema.
 * Returns the ProposalChange if applied, null if the failure type is unknown.
 */
function applyFailureToSchema(
  schema: JsonSchema,
  failure: ValidationFailure,
  direction: SchemaDirection,
  driftReportId: string
): ProposalChange | null {
  const issueMap = direction === 'output' ? OUTPUT_ISSUE_MAP : INPUT_ISSUE_MAP;
  const changeType = issueMap[failure.issueCode];
  if (!changeType) return null;

  const fieldPath = failure.fieldPath;

  switch (changeType) {
    case 'field_made_nullable':
    case 'field_type_changed': {
      // type_mismatch: check if received is null → make nullable, else change type
      if (failure.receivedType === 'null') {
        applyFieldChange(schema, fieldPath, 'make_nullable');
        return {
          direction,
          fieldPath,
          changeType: 'field_made_nullable',
          description: generateChangeDescription(
            'field_made_nullable',
            fieldPath,
            direction,
            failure
          ),
          driftReportId,
          beforeValue: failure.expectedType,
          afterValue: `${failure.expectedType} | null`,
        };
      }
      // Type actually changed
      const newType = inferFieldType(failure.receivedType);
      applyFieldChange(schema, fieldPath, 'change_type', newType);
      return {
        direction,
        fieldPath,
        changeType: 'field_type_changed',
        description: generateChangeDescription('field_type_changed', fieldPath, direction, failure),
        driftReportId,
        beforeValue: failure.expectedType,
        afterValue: failure.receivedType,
      };
    }

    case 'field_added': {
      // unexpected_field: add as optional field with inferred type
      const inferredType = inferFieldType(failure.receivedType);
      applyFieldChange(schema, fieldPath, 'add_optional', inferredType);
      return {
        direction,
        fieldPath,
        changeType: 'field_added',
        description: generateChangeDescription('field_added', fieldPath, direction, failure),
        driftReportId,
        afterValue: inferredType,
      };
    }

    case 'field_made_optional': {
      // missing_required_field: remove from required array
      applyFieldChange(schema, fieldPath, 'make_optional');
      return {
        direction,
        fieldPath,
        changeType: 'field_made_optional',
        description: generateChangeDescription(
          'field_made_optional',
          fieldPath,
          direction,
          failure
        ),
        driftReportId,
        beforeValue: 'required',
        afterValue: 'optional',
      };
    }

    case 'enum_value_added': {
      // invalid_enum_value: add new enum value
      applyFieldChange(schema, fieldPath, 'add_enum_value', failure.receivedType);
      return {
        direction,
        fieldPath,
        changeType: 'enum_value_added',
        description: generateChangeDescription('enum_value_added', fieldPath, direction, failure),
        driftReportId,
        afterValue: failure.receivedType,
      };
    }

    case 'field_added_required': {
      // Input missing_required_field: add field as required
      const type = inferFieldType(failure.expectedType);
      applyFieldChange(schema, fieldPath, 'add_required', type);
      return {
        direction,
        fieldPath,
        changeType: 'field_added_required',
        description: generateChangeDescription(
          'field_added_required',
          fieldPath,
          direction,
          failure
        ),
        driftReportId,
        afterValue: type,
      };
    }

    default:
      return null;
  }
}

/**
 * Navigate into a JSON Schema to the target field and apply modification.
 * Supports dot-notation paths (e.g., "user.profile.email").
 */
export function applyFieldChange(
  schema: JsonSchema,
  fieldPath: string,
  operation:
    | 'make_nullable'
    | 'change_type'
    | 'add_optional'
    | 'make_optional'
    | 'add_enum_value'
    | 'add_required',
  value?: string | null
): void {
  const parts = fieldPath.split('.');
  const fieldName = parts[parts.length - 1];
  const parentPath = parts.slice(0, -1);

  // Navigate to the parent object in the schema
  let current: JsonSchemaProperty = schema;
  for (const part of parentPath) {
    if (current.properties && current.properties[part]) {
      current = current.properties[part];
      // If it's an object type with nested properties, continue
      if (current.type === 'array' && current.items?.properties) {
        current = current.items;
      }
    } else {
      // Path doesn't exist in schema; create intermediate objects
      if (!current.properties) current.properties = {};
      current.properties[part] = { type: 'object', properties: {} };
      current = current.properties[part];
    }
  }

  if (!current.properties) current.properties = {};

  switch (operation) {
    case 'make_nullable': {
      const existing = current.properties[fieldName];
      if (existing) {
        const currentType = existing.type;
        if (Array.isArray(currentType)) {
          if (!currentType.includes('null')) {
            existing.type = [...currentType, 'null'];
          }
        } else if (currentType && currentType !== 'null') {
          existing.type = [currentType, 'null'];
        }
      }
      break;
    }

    case 'change_type': {
      const existing = current.properties[fieldName];
      if (existing && value) {
        existing.type = value;
      }
      break;
    }

    case 'add_optional': {
      if (!current.properties[fieldName]) {
        current.properties[fieldName] = { type: value || 'string' };
      }
      // Ensure it's NOT in the required array
      if (current.required) {
        current.required = current.required.filter((r) => r !== fieldName);
      }
      break;
    }

    case 'make_optional': {
      if (current.required) {
        current.required = current.required.filter((r) => r !== fieldName);
        if (current.required.length === 0) {
          delete current.required;
        }
      }
      break;
    }

    case 'add_enum_value': {
      const existing = current.properties[fieldName];
      if (existing?.enum && value) {
        if (!existing.enum.includes(value)) {
          existing.enum.push(value);
        }
      }
      break;
    }

    case 'add_required': {
      if (!current.properties[fieldName]) {
        current.properties[fieldName] = { type: value || 'string' };
      }
      if (!current.required) current.required = [];
      if (!current.required.includes(fieldName)) {
        current.required.push(fieldName);
      }
      break;
    }
  }
}

// =============================================================================
// Type Inference
// =============================================================================

/**
 * Map ValidationFailure receivedType/expectedType strings to JSON Schema types.
 */
export function inferFieldType(typeStr: string | null | undefined): string {
  if (!typeStr) return 'string';

  const normalized = typeStr.toLowerCase().trim();

  const typeMap: Record<string, string> = {
    string: 'string',
    number: 'number',
    integer: 'integer',
    boolean: 'boolean',
    object: 'object',
    array: 'array',
    null: 'null',
    float: 'number',
    int: 'integer',
    bool: 'boolean',
    undefined: 'string',
  };

  return typeMap[normalized] || 'string';
}

// =============================================================================
// Description & Reasoning
// =============================================================================

/**
 * Generate a human-readable description for a single change.
 */
export function generateChangeDescription(
  changeType: ChangeType,
  fieldPath: string,
  direction: SchemaDirection,
  failure: ValidationFailure
): string {
  const dirLabel = direction === 'input' ? 'Input' : 'Output';
  const count = failure.failureCount;

  switch (changeType) {
    case 'field_made_nullable':
      return `${dirLabel} field '${fieldPath}' received null values ${count} time(s). Making field nullable (${failure.expectedType} → ${failure.expectedType} | null).`;

    case 'field_type_changed':
      return `${dirLabel} field '${fieldPath}' type changed from ${failure.expectedType} to ${failure.receivedType} (observed ${count} time(s)).`;

    case 'field_added':
      return `${dirLabel} field '${fieldPath}' appeared unexpectedly ${count} time(s) with type ${failure.receivedType}. Adding as optional field.`;

    case 'field_made_optional':
      return `${dirLabel} field '${fieldPath}' was missing ${count} time(s) despite being required. Making field optional.`;

    case 'enum_value_added':
      return `${dirLabel} field '${fieldPath}' received unexpected enum value '${failure.receivedType}' ${count} time(s). Adding to allowed values.`;

    case 'field_added_required':
      return `${dirLabel} field '${fieldPath}' is now required by the API (observed ${count} rejection(s)). Adding as required field.`;

    default:
      return `${dirLabel} field '${fieldPath}' changed (${changeType}).`;
  }
}

/**
 * Generate a summary reasoning for the full proposal.
 */
export function generateOverallReasoning(
  changes: ProposalChange[],
  driftReportIds: string[]
): string {
  if (changes.length === 0) return '';

  const inputChanges = changes.filter((c) => c.direction === 'input');
  const outputChanges = changes.filter((c) => c.direction === 'output');

  const parts: string[] = [];
  parts.push(
    `This proposal addresses ${driftReportIds.length} drift report(s) with ${changes.length} schema change(s).`
  );

  if (outputChanges.length > 0) {
    const summary = summarizeChanges(outputChanges);
    parts.push(`Output schema: ${summary}`);
  }

  if (inputChanges.length > 0) {
    const summary = summarizeChanges(inputChanges);
    parts.push(`Input schema: ${summary}`);
  }

  return parts.join(' ');
}

function summarizeChanges(changes: ProposalChange[]): string {
  const counts: Record<string, number> = {};
  for (const c of changes) {
    counts[c.changeType] = (counts[c.changeType] || 0) + 1;
  }

  const descriptions: string[] = [];
  for (const [type, count] of Object.entries(counts)) {
    const label = type.replace(/_/g, ' ');
    descriptions.push(`${count} ${label}${count > 1 ? 's' : ''}`);
  }

  return descriptions.join(', ') + '.';
}

// =============================================================================
// Affected Tools Discovery
// =============================================================================

/**
 * Find all composite and agentic tools that reference a given action.
 * Returns a list for UI display and description cascade tracking.
 */
export async function findAffectedTools(actionId: string): Promise<AffectedTool[]> {
  const affected: AffectedTool[] = [];

  // 1. The action itself
  const action = await prisma.action.findUnique({
    where: { id: actionId },
    select: { id: true, name: true },
  });
  if (action) {
    affected.push({
      toolType: 'action',
      toolId: action.id,
      toolName: action.name,
    });
  }

  // 2. Composite tools that use this action via CompositeToolOperation
  const operations = await prisma.compositeToolOperation.findMany({
    where: { actionId },
    include: {
      compositeTool: {
        select: { id: true, name: true },
      },
    },
  });
  const seenComposite = new Set<string>();
  for (const op of operations) {
    if (!seenComposite.has(op.compositeTool.id)) {
      seenComposite.add(op.compositeTool.id);
      affected.push({
        toolType: 'composite',
        toolId: op.compositeTool.id,
        toolName: op.compositeTool.name,
      });
    }
  }

  // 3. Agentic tools that reference this action in their toolAllocation JSON
  // toolAllocation has either targetActions[].actionId or availableTools[].actionId
  const agenticTools = await prisma.agenticTool.findMany({
    select: { id: true, name: true, toolAllocation: true },
  });
  for (const tool of agenticTools) {
    const allocation = tool.toolAllocation as Record<string, unknown> | null;
    if (!allocation) continue;

    const referencesAction = jsonContainsValue(allocation, actionId);
    if (referencesAction) {
      affected.push({
        toolType: 'agentic',
        toolId: tool.id,
        toolName: tool.name,
      });
    }
  }

  return affected;
}

/**
 * Check if a JSON value contains a specific string anywhere in its structure.
 */
function jsonContainsValue(obj: unknown, target: string): boolean {
  if (typeof obj === 'string') return obj === target;
  if (Array.isArray(obj)) return obj.some((item) => jsonContainsValue(item, target));
  if (obj !== null && typeof obj === 'object') {
    return Object.values(obj as Record<string, unknown>).some((v) => jsonContainsValue(v, target));
  }
  return false;
}
