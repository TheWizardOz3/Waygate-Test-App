'use client';

import * as React from 'react';
import {
  GitBranch,
  Bot,
  Check,
  Plus,
  Trash2,
  GripVertical,
  ArrowDown,
  Loader2,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import { apiClient } from '@/lib/api/client';
import { cn } from '@/lib/utils';
import type {
  CompositeToolDetailResponse,
  CompositeToolRoutingMode,
  RoutingConditionType,
} from '@/lib/modules/composite-tools/composite-tool.schemas';

// =============================================================================
// Types
// =============================================================================

interface CompositeIntelligenceProps {
  tool: CompositeToolDetailResponse;
  onUpdate?: () => void;
}

interface RoutingRuleState {
  id: string;
  operationSlug: string;
  conditionType: RoutingConditionType;
  conditionField: string;
  conditionValue: string;
  caseSensitive: boolean;
}

// =============================================================================
// Constants
// =============================================================================

const CONDITION_TYPES: { value: RoutingConditionType; label: string }[] = [
  { value: 'contains', label: 'Contains' },
  { value: 'equals', label: 'Equals' },
  { value: 'starts_with', label: 'Starts With' },
  { value: 'ends_with', label: 'Ends With' },
  { value: 'matches', label: 'Matches (Regex)' },
];

// =============================================================================
// Helpers
// =============================================================================

interface DerivedField {
  value: string;
  label: string;
  description: string;
}

interface JsonSchemaProperty {
  type?: string;
  description?: string;
  properties?: Record<string, JsonSchemaProperty>;
}

interface JsonSchema {
  type?: string;
  properties?: Record<string, JsonSchemaProperty>;
  required?: string[];
}

function deriveFieldsFromTool(tool: CompositeToolDetailResponse): DerivedField[] {
  const fieldsMap = new Map<string, DerivedField>();

  // First, try to extract fields from the unifiedInputSchema (JSON Schema format)
  const unifiedSchema = tool.unifiedInputSchema as JsonSchema | undefined;
  if (unifiedSchema?.properties) {
    for (const [fieldName, fieldSchema] of Object.entries(unifiedSchema.properties)) {
      if (!fieldsMap.has(fieldName)) {
        fieldsMap.set(fieldName, {
          value: fieldName,
          label: fieldName,
          description: fieldSchema.description || `${fieldSchema.type || 'any'} field`,
        });
      }
    }
  }

  // Also check parameterMapping keys from operations as fallback
  for (const operation of tool.operations) {
    const paramMapping = operation.parameterMapping as Record<string, unknown> | undefined;
    if (paramMapping) {
      for (const fieldName of Object.keys(paramMapping)) {
        if (!fieldsMap.has(fieldName)) {
          fieldsMap.set(fieldName, {
            value: fieldName,
            label: fieldName,
            description: 'Parameter from operation mapping',
          });
        }
      }
    }
  }

  // If no fields found, add common input field suggestions
  if (fieldsMap.size === 0) {
    // Add "input" as a common catch-all field
    fieldsMap.set('input', {
      value: 'input',
      label: 'input',
      description: 'Primary input text/data',
    });
  }

  const fields = Array.from(fieldsMap.values()).sort((a, b) => a.label.localeCompare(b.label));

  // Always add custom field option
  fields.push({
    value: 'custom',
    label: 'Custom field...',
    description: 'Enter a custom field name',
  });

  return fields;
}

function generateRuleId(): string {
  return `rule-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// =============================================================================
// Component
// =============================================================================

export function CompositeIntelligence({ tool, onUpdate }: CompositeIntelligenceProps) {
  const [routingMode, setRoutingMode] = React.useState<CompositeToolRoutingMode>(tool.routingMode);
  // Use operation slug for UI, map to/from ID when saving
  const [defaultOperationSlug, setDefaultOperationSlug] = React.useState<string | null>(() => {
    if (!tool.defaultOperationId) return null;
    const op = tool.operations.find((o) => o.id === tool.defaultOperationId);
    return op?.operationSlug || null;
  });
  const [routingRules, setRoutingRules] = React.useState<RoutingRuleState[]>(() =>
    (tool.routingRules || []).map((rule) => {
      // Map operationId to operationSlug for UI display
      const op = tool.operations.find((o) => o.id === rule.operationId);
      return {
        id: rule.id || generateRuleId(),
        operationSlug: op?.operationSlug || '',
        conditionType: rule.conditionType,
        conditionField: rule.conditionField,
        conditionValue: rule.conditionValue,
        caseSensitive: rule.caseSensitive ?? false,
      };
    })
  );
  const [isSaving, setIsSaving] = React.useState(false);

  // State for editing operation slugs (for agent_driven mode)
  // Maps operation ID to edited slug value
  const [operationEdits, setOperationEdits] = React.useState<Map<string, string>>(() => new Map());

  const availableFields = React.useMemo(() => deriveFieldsFromTool(tool), [tool]);

  // Get the original default operation slug for comparison
  const originalDefaultSlug = React.useMemo(() => {
    if (!tool.defaultOperationId) return null;
    const op = tool.operations.find((o) => o.id === tool.defaultOperationId);
    return op?.operationSlug || null;
  }, [tool.defaultOperationId, tool.operations]);

  const hasChanges = React.useMemo(() => {
    if (routingMode !== tool.routingMode) return true;
    if (defaultOperationSlug !== originalDefaultSlug) return true;

    // Check for operation edits
    if (operationEdits.size > 0) return true;

    const originalRules = tool.routingRules || [];
    if (routingRules.length !== originalRules.length) return true;

    for (let i = 0; i < routingRules.length; i++) {
      const curr = routingRules[i];
      const orig = originalRules[i];
      // Map original operationId to slug for comparison
      const origOp = tool.operations.find((o) => o.id === orig.operationId);
      const origSlug = origOp?.operationSlug || '';
      if (
        curr.operationSlug !== origSlug ||
        curr.conditionType !== orig.conditionType ||
        curr.conditionField !== orig.conditionField ||
        curr.conditionValue !== orig.conditionValue ||
        curr.caseSensitive !== orig.caseSensitive
      ) {
        return true;
      }
    }

    return false;
  }, [routingMode, defaultOperationSlug, routingRules, tool, originalDefaultSlug, operationEdits]);

  const handleAddRule = () => {
    const firstOperation = tool.operations[0];
    if (!firstOperation) return;

    const defaultField = availableFields.find((f) => f.value !== 'custom')?.value || '';

    setRoutingRules((prev) => [
      ...prev,
      {
        id: generateRuleId(),
        operationSlug: firstOperation.operationSlug,
        conditionType: 'contains',
        conditionField: defaultField,
        conditionValue: '',
        caseSensitive: false,
      },
    ]);
  };

  const handleUpdateRule = (id: string, updates: Partial<RoutingRuleState>) => {
    setRoutingRules((prev) =>
      prev.map((rule) => (rule.id === id ? { ...rule, ...updates } : rule))
    );
  };

  const handleRemoveRule = (id: string) => {
    setRoutingRules((prev) => prev.filter((rule) => rule.id !== id));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // Save operation slug edits first
      for (const [operationId, newSlug] of Array.from(operationEdits.entries())) {
        await apiClient.patch(`/composite-tools/${tool.id}/operations/${operationId}`, {
          operationSlug: newSlug,
        });
      }

      // Map operation slug to operation ID for the API
      const defaultOp = defaultOperationSlug
        ? tool.operations.find((o) => o.operationSlug === defaultOperationSlug)
        : null;

      await apiClient.patch(`/composite-tools/${tool.id}`, {
        routingMode,
        defaultOperationId: defaultOp?.id || null,
        routingRules:
          routingMode === 'rule_based'
            ? routingRules.map((rule, index) => ({
                operationSlug: rule.operationSlug,
                conditionType: rule.conditionType,
                conditionField: rule.conditionField,
                conditionValue: rule.conditionValue,
                caseSensitive: rule.caseSensitive,
                priority: index,
              }))
            : [],
      });

      // Clear operation edits after successful save
      setOperationEdits(new Map());
      onUpdate?.();
    } catch (error) {
      console.error('Failed to save routing config:', error);
    } finally {
      setIsSaving(false);
    }
  };

  // Check if there are no operations
  const hasNoOperations = tool.operations.length === 0;

  return (
    <div className="space-y-6">
      {/* Warning if no operations */}
      {hasNoOperations && (
        <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-4">
          <p className="font-medium text-amber-700 dark:text-amber-400">No tools selected</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Add tools in the <strong>Tools/Actions</strong> tab and save your changes before
            configuring routing rules.
          </p>
        </div>
      )}

      {/* Routing Mode Selection */}
      <div className="space-y-4">
        <h3 className="text-sm font-medium">Routing Mode</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <RoutingModeCard
            mode="rule_based"
            title="Rule-Based Routing"
            description="Define conditions to automatically route requests to the right operation."
            icon={GitBranch}
            selected={routingMode === 'rule_based'}
            onSelect={() => setRoutingMode('rule_based')}
            features={['Automatic routing based on input', 'Deterministic behavior']}
          />
          <RoutingModeCard
            mode="agent_driven"
            title="Argument-Driven Routing"
            description="Let the AI agent choose which operation via a tool argument."
            icon={Bot}
            selected={routingMode === 'agent_driven'}
            onSelect={() => setRoutingMode('agent_driven')}
            features={['Operation exposed as enum parameter', 'Agent decides based on context']}
          />
        </div>
      </div>

      {/* Rule-based configuration */}
      {routingMode === 'rule_based' && (
        <>
          {/* Default Operation */}
          <div className="space-y-2">
            <Label>Default Operation (Optional)</Label>
            <Select
              value={defaultOperationSlug || '_none'}
              onValueChange={(v) => setDefaultOperationSlug(v === '_none' ? null : v)}
              disabled={hasNoOperations}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={hasNoOperations ? 'No tools available' : 'Select default operation'}
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">No default (require matching rule)</SelectItem>
                {tool.operations.map((op) => (
                  <SelectItem key={op.operationSlug} value={op.operationSlug}>
                    {op.displayName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Used when no routing rule matches the input.
            </p>
          </div>

          {/* Routing Rules */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium">Routing Rules ({routingRules.length})</h3>
              <Button
                variant="outline"
                size="sm"
                onClick={handleAddRule}
                disabled={hasNoOperations}
                className="gap-1"
              >
                <Plus className="h-3 w-3" />
                Add Rule
              </Button>
            </div>

            {routingRules.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center">
                <p className="text-sm text-muted-foreground">
                  {hasNoOperations
                    ? 'Add tools first before creating routing rules.'
                    : defaultOperationSlug
                      ? 'No routing rules defined. All requests will use the default operation.'
                      : 'No routing rules defined. Add rules to route requests to operations.'}
                </p>
                {!hasNoOperations && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleAddRule}
                    className="mt-4 gap-1"
                  >
                    <Plus className="h-3 w-3" />
                    Add Your First Rule
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                {routingRules.map((rule, index) => (
                  <React.Fragment key={rule.id}>
                    {index > 0 && (
                      <div className="flex items-center justify-center py-1">
                        <ArrowDown className="h-4 w-4 text-muted-foreground" />
                      </div>
                    )}
                    <RoutingRuleCard
                      rule={rule}
                      operations={tool.operations}
                      availableFields={availableFields}
                      index={index}
                      onUpdate={(updates) => handleUpdateRule(rule.id, updates)}
                      onRemove={() => handleRemoveRule(rule.id)}
                    />
                  </React.Fragment>
                ))}
              </div>
            )}
          </div>

          {/* Default fallback info */}
          {defaultOperationSlug && (
            <Card className="border-muted bg-muted/30">
              <CardContent className="flex items-center gap-3 p-3">
                <Badge variant="secondary">Default</Badge>
                <p className="flex-1 text-sm text-muted-foreground">
                  If no rules match, use{' '}
                  <span className="font-medium text-foreground">
                    {tool.operations.find((op) => op.operationSlug === defaultOperationSlug)
                      ?.displayName || defaultOperationSlug}
                  </span>
                </p>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Agent-driven info */}
      {routingMode === 'agent_driven' && (
        <div className="rounded-lg bg-muted/50 p-4">
          <h4 className="font-medium">How Argument-Driven Routing Works</h4>
          <p className="mt-1 text-sm text-muted-foreground">
            When exported, the tool will include an &quot;operation&quot; parameter as an enum. The
            AI agent will see all available operations and choose the appropriate one.
          </p>
          <div className="mt-3">
            <p className="text-xs font-medium text-muted-foreground">Operations available:</p>
            {hasNoOperations ? (
              <p className="mt-1 text-sm italic text-muted-foreground">
                No operations yet. Add tools in the Tools/Actions tab.
              </p>
            ) : (
              <div className="mt-2 space-y-2">
                {tool.operations.map((op) => {
                  const editedSlug = operationEdits.get(op.id);
                  const currentSlug = editedSlug ?? op.operationSlug;

                  return (
                    <div
                      key={op.id}
                      className="flex items-center gap-3 rounded-lg border bg-background p-3"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{op.displayName}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {op.action?.integration?.name ? `${op.action.integration.name} · ` : ''}
                          {op.action?.slug || 'action'}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Label className="whitespace-nowrap text-xs text-muted-foreground">
                          Enum value:
                        </Label>
                        <Input
                          value={currentSlug}
                          onChange={(e) => {
                            const newSlug = e.target.value
                              .toLowerCase()
                              .replace(/[^a-z0-9-]/g, '-');
                            setOperationEdits((prev) => {
                              const next = new Map(prev);
                              if (newSlug === op.operationSlug) {
                                next.delete(op.id);
                              } else {
                                next.set(op.id, newSlug);
                              }
                              return next;
                            });
                          }}
                          className="h-8 w-48 font-mono text-sm"
                          placeholder="operation-slug"
                        />
                        {editedSlug && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setOperationEdits((prev) => {
                                const next = new Map(prev);
                                next.delete(op.id);
                                return next;
                              });
                            }}
                            className="h-8 px-2 text-muted-foreground"
                          >
                            Reset
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Save Button */}
      {hasChanges && (
        <div className="flex justify-end border-t pt-4">
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              'Save Changes'
            )}
          </Button>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Routing Mode Card
// =============================================================================

interface RoutingModeCardProps {
  mode: CompositeToolRoutingMode;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  selected: boolean;
  onSelect: () => void;
  features: string[];
}

function RoutingModeCard({
  title,
  description,
  icon: Icon,
  selected,
  onSelect,
  features,
}: RoutingModeCardProps) {
  return (
    <Card
      className={cn(
        'cursor-pointer transition-all hover:border-primary/50',
        selected && 'border-primary bg-primary/5'
      )}
      onClick={onSelect}
    >
      <CardHeader className="pb-2">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              'flex h-10 w-10 items-center justify-center rounded-lg',
              selected ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
            )}
          >
            <Icon className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <CardTitle className="text-base">{title}</CardTitle>
          </div>
          {selected && (
            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary">
              <Check className="h-3 w-3 text-primary-foreground" />
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <CardDescription>{description}</CardDescription>
        <ul className="mt-3 space-y-1">
          {features.map((feature, i) => (
            <li key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
              <div className="h-1 w-1 rounded-full bg-muted-foreground" />
              {feature}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

// =============================================================================
// Routing Rule Card
// =============================================================================

interface RoutingRuleCardProps {
  rule: RoutingRuleState;
  operations: { operationSlug: string; displayName: string }[];
  availableFields: DerivedField[];
  index: number;
  onUpdate: (updates: Partial<RoutingRuleState>) => void;
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
                      {field.label}
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
