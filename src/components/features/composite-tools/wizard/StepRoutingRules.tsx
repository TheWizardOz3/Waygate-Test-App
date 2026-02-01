'use client';

import * as React from 'react';
import { ArrowRight, Plus, Trash2, GripVertical, ArrowDown } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  useCompositeToolWizardStore,
  type RoutingRule,
  type SelectedOperation,
} from '@/stores/compositeToolWizard.store';
import type { RoutingConditionType } from '@/lib/modules/composite-tools/composite-tool.schemas';

// =============================================================================
// Constants
// =============================================================================

const CONDITION_TYPES: { value: RoutingConditionType; label: string; example: string }[] = [
  { value: 'contains', label: 'Contains', example: 'url contains "linkedin.com"' },
  { value: 'equals', label: 'Equals', example: 'type equals "profile"' },
  { value: 'starts_with', label: 'Starts With', example: 'url starts with "https://api."' },
  { value: 'ends_with', label: 'Ends With', example: 'url ends with ".json"' },
  { value: 'matches', label: 'Matches (Regex)', example: 'url matches "^https://.*\\.com/"' },
];

// =============================================================================
// Helpers
// =============================================================================

interface DerivedField {
  value: string;
  label: string;
  description: string;
}

/**
 * Extract field names from the inputSchema of operations.
 * Aggregates fields from all selected operations and deduplicates them.
 */
function deriveFieldsFromOperations(operations: SelectedOperation[]): DerivedField[] {
  const fieldsMap = new Map<string, DerivedField>();

  for (const operation of operations) {
    const schema = operation.inputSchema as {
      type?: string;
      properties?: Record<string, { type?: string; description?: string }>;
    } | null;

    if (!schema || schema.type !== 'object' || !schema.properties) {
      continue;
    }

    for (const [fieldName, fieldDef] of Object.entries(schema.properties)) {
      if (!fieldsMap.has(fieldName)) {
        fieldsMap.set(fieldName, {
          value: fieldName,
          label: fieldName,
          description: fieldDef.description || `${fieldDef.type || 'any'} field`,
        });
      }
    }
  }

  // Convert to array and sort alphabetically
  const fields = Array.from(fieldsMap.values()).sort((a, b) => a.label.localeCompare(b.label));

  // Always add a "custom" option at the end
  fields.push({
    value: 'custom',
    label: 'Custom field...',
    description: 'Enter a custom field name',
  });

  return fields;
}

// =============================================================================
// Component
// =============================================================================

export function StepRoutingRules() {
  const { data, addRoutingRule, updateRoutingRule, removeRoutingRule, goToStep, canProceed } =
    useCompositeToolWizardStore();

  // Derive available fields from the selected operations' input schemas
  const availableFields = React.useMemo(
    () => deriveFieldsFromOperations(data.operations),
    [data.operations]
  );

  const handleAddRule = () => {
    // Default to the first operation
    const firstOperation = data.operations[0];
    if (!firstOperation) return;

    // Use the first non-custom field as default, or empty string if only custom is available
    const defaultField = availableFields.find((f) => f.value !== 'custom')?.value || '';

    addRoutingRule({
      operationSlug: firstOperation.operationSlug,
      conditionType: 'contains',
      conditionField: defaultField,
      conditionValue: '',
      caseSensitive: false,
    });
  };

  const handleContinue = () => {
    goToStep('review');
  };

  return (
    <div className="space-y-6">
      {/* Info */}
      <div className="rounded-lg bg-muted/50 p-4">
        <h4 className="font-medium">How Routing Rules Work</h4>
        <p className="mt-1 text-sm text-muted-foreground">
          Rules are evaluated in order from top to bottom. The first rule that matches the input
          will route the request to its associated operation.
          {data.defaultOperationSlug && (
            <span>
              {' '}
              If no rules match, the default operation (
              <code className="rounded bg-muted px-1">{data.defaultOperationSlug}</code>) will be
              used.
            </span>
          )}
        </p>
        {availableFields.length > 1 && (
          <p className="mt-2 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">
              Available fields from your operations:
            </span>{' '}
            {availableFields
              .filter((f) => f.value !== 'custom')
              .map((f) => f.label)
              .join(', ')}
          </p>
        )}
      </div>

      {/* Rules list */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">Routing Rules ({data.routingRules.length})</h3>
          <Button variant="outline" size="sm" onClick={handleAddRule} className="gap-1">
            <Plus className="h-3 w-3" />
            Add Rule
          </Button>
        </div>

        {data.routingRules.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center">
            <p className="text-sm text-muted-foreground">
              No routing rules defined.
              {data.defaultOperationSlug
                ? ' All requests will use the default operation.'
                : ' Add rules to route requests to operations.'}
            </p>
            <Button variant="outline" size="sm" onClick={handleAddRule} className="mt-4 gap-1">
              <Plus className="h-3 w-3" />
              Add Your First Rule
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {data.routingRules.map((rule, index) => (
              <React.Fragment key={rule.id}>
                {index > 0 && (
                  <div className="flex items-center justify-center py-1">
                    <ArrowDown className="h-4 w-4 text-muted-foreground" />
                  </div>
                )}
                <RoutingRuleCard
                  rule={rule}
                  operations={data.operations}
                  availableFields={availableFields}
                  index={index}
                  onUpdate={(updates) => updateRoutingRule(rule.id, updates)}
                  onRemove={() => removeRoutingRule(rule.id)}
                />
              </React.Fragment>
            ))}
          </div>
        )}
      </div>

      {/* Default fallback info */}
      {data.defaultOperationSlug && (
        <Card className="border-muted bg-muted/30">
          <CardContent className="flex items-center gap-3 p-3">
            <Badge variant="secondary">Default</Badge>
            <p className="flex-1 text-sm text-muted-foreground">
              If no rules match, use{' '}
              <span className="font-medium text-foreground">
                {data.operations.find((op) => op.operationSlug === data.defaultOperationSlug)
                  ?.displayName || data.defaultOperationSlug}
              </span>
            </p>
          </CardContent>
        </Card>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between border-t pt-4">
        <p className="text-sm text-muted-foreground">
          {data.routingRules.length === 0 && !data.defaultOperationSlug
            ? 'Add at least one rule or set a default operation'
            : `${data.routingRules.length} rule${data.routingRules.length !== 1 ? 's' : ''} configured`}
        </p>
        <Button onClick={handleContinue} disabled={!canProceed()} className="gap-2">
          Continue
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

// =============================================================================
// Routing Rule Card
// =============================================================================

interface RoutingRuleCardProps {
  rule: RoutingRule;
  operations: { operationSlug: string; displayName: string }[];
  availableFields: DerivedField[];
  index: number;
  onUpdate: (updates: Partial<RoutingRule>) => void;
  onRemove: () => void;
}

function RoutingRuleCard({
  rule,
  operations,
  availableFields,
  index,
  onUpdate,
  onRemove,
}: RoutingRuleCardProps) {
  const [isCustomField, setIsCustomField] = React.useState(() => {
    // Check if current field is a custom field (not in available fields list)
    const isDerived = availableFields.some(
      (f) => f.value === rule.conditionField && f.value !== 'custom'
    );
    return !isDerived && rule.conditionField !== '';
  });

  const handleFieldSelect = (value: string) => {
    if (value === 'custom') {
      setIsCustomField(true);
      onUpdate({ conditionField: '' });
    } else {
      setIsCustomField(false);
      onUpdate({ conditionField: value });
    }
  };

  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <div className="flex items-center gap-2">
          <GripVertical className="h-4 w-4 text-muted-foreground" />
          <Badge variant="outline">Rule {index + 1}</Badge>
          <div className="flex-1" />
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-destructive"
            onClick={onRemove}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>

        {/* Condition */}
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label className="text-xs">If field</Label>
            {isCustomField ? (
              <Input
                value={rule.conditionField}
                onChange={(e) => onUpdate({ conditionField: e.target.value })}
                placeholder="Enter field name"
                className="h-9"
              />
            ) : (
              <Select
                value={
                  rule.conditionField ||
                  (availableFields[0]?.value !== 'custom' ? availableFields[0]?.value : '')
                }
                onValueChange={handleFieldSelect}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Select a field" />
                </SelectTrigger>
                <SelectContent>
                  {availableFields.map((field) => (
                    <SelectItem key={field.value} value={field.value}>
                      <div className="flex items-center gap-2">
                        <span>{field.label}</span>
                        {field.description && field.value !== 'custom' && (
                          <span className="text-xs text-muted-foreground">
                            ({field.description})
                          </span>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {isCustomField && availableFields.length > 1 && (
              <button
                onClick={() => {
                  setIsCustomField(false);
                  const firstNonCustomField = availableFields.find((f) => f.value !== 'custom');
                  onUpdate({ conditionField: firstNonCustomField?.value || '' });
                }}
                className="text-xs text-muted-foreground underline hover:text-foreground"
              >
                Use schema field
              </button>
            )}
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Condition</Label>
            <Select
              value={rule.conditionType}
              onValueChange={(v) => onUpdate({ conditionType: v as RoutingConditionType })}
            >
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CONDITION_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Value</Label>
            <Input
              value={rule.conditionValue}
              onChange={(e) => onUpdate({ conditionValue: e.target.value })}
              placeholder="e.g., linkedin.com"
              className="h-9"
            />
          </div>
        </div>

        {/* Target operation */}
        <div className="flex items-center gap-4">
          <div className="flex-1 space-y-1.5">
            <Label className="text-xs">Route to operation</Label>
            <Select
              value={rule.operationSlug}
              onValueChange={(v) => onUpdate({ operationSlug: v })}
            >
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {operations.map((op) => (
                  <SelectItem key={op.operationSlug} value={op.operationSlug}>
                    {op.displayName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2 pt-5">
            <Switch
              checked={rule.caseSensitive}
              onCheckedChange={(v) => onUpdate({ caseSensitive: v })}
              id={`case-${rule.id}`}
            />
            <Label htmlFor={`case-${rule.id}`} className="text-xs">
              Case sensitive
            </Label>
          </div>
        </div>

        {/* Preview */}
        <div className="rounded bg-muted/50 p-2 text-xs text-muted-foreground">
          <span className="font-medium">Preview:</span> If{' '}
          <code className="rounded bg-muted px-1">{rule.conditionField || '?'}</code>{' '}
          {rule.conditionType.replace('_', ' ')}{' '}
          <code className="rounded bg-muted px-1">&quot;{rule.conditionValue || '?'}&quot;</code>
          {!rule.caseSensitive && ' (case-insensitive)'} → use{' '}
          <code className="rounded bg-muted px-1">{rule.operationSlug}</code>
        </div>
      </CardContent>
    </Card>
  );
}
