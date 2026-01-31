'use client';

import { useState, useMemo, useCallback } from 'react';
import { UseFormReturn, FieldValues } from 'react-hook-form';
import { FormControl, FormField, FormItem, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Sparkles, Database, Info, Plus, X, Loader2, ChevronDown } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import type { JsonSchema } from '@/lib/modules/actions/action.schemas';

interface AIToolsTabProps {
  form: UseFormReturn<FieldValues>;
  integrationName?: string;
  outputSchema?: JsonSchema;
  onRegenerateToolDescriptions?: () => Promise<void>;
}

// Available variables for success template
const SUCCESS_TEMPLATE_VARIABLES = [
  { name: 'action_name', description: 'Name of the action executed' },
  { name: 'resource_type', description: 'Type of resource affected' },
  { name: 'key_id', description: 'Unique identifier of the result' },
  { name: 'summary', description: 'Brief summary of what happened' },
];

// Available variables for error template
const ERROR_TEMPLATE_VARIABLES = [
  { name: 'error_type', description: 'Category of error' },
  { name: 'error_message', description: 'Detailed error message' },
  { name: 'remediation', description: 'Suggested steps to fix' },
];

// Sync types
type SyncType = 'list' | 'object';

// Extract field paths from JSON Schema
function extractFieldPaths(
  schema: JsonSchema | undefined,
  prefix: string = ''
): { path: string; type: string }[] {
  if (!schema) return [];

  const fields: { path: string; type: string }[] = [];

  // Handle array type - look at items
  if (schema.type === 'array' && schema.items) {
    const itemSchema = schema.items as JsonSchema;
    if (itemSchema.properties) {
      Object.entries(itemSchema.properties).forEach(([key, prop]) => {
        const propType = Array.isArray(prop.type) ? prop.type[0] : prop.type;
        fields.push({ path: key, type: propType || 'unknown' });
      });
    }
    return fields;
  }

  // Handle object type
  if (schema.properties) {
    Object.entries(schema.properties).forEach(([key, prop]) => {
      const fullPath = prefix ? `${prefix}.${key}` : key;
      const propType = Array.isArray(prop.type) ? prop.type[0] : prop.type;

      // If it's an array, this might be the list we want to extract from
      if (propType === 'array' && prop.items) {
        fields.push({ path: fullPath, type: 'array' });
        // Also extract fields from the array items
        const itemSchema = prop.items as JsonSchema;
        if (itemSchema.properties) {
          Object.entries(itemSchema.properties).forEach(([itemKey, itemProp]) => {
            const itemPropType = Array.isArray(itemProp.type) ? itemProp.type[0] : itemProp.type;
            fields.push({
              path: `${fullPath}[*].${itemKey}`,
              type: itemPropType || 'unknown',
            });
          });
        }
      } else if (propType === 'object' && prop.properties) {
        fields.push({ path: fullPath, type: 'object' });
        // Recurse into nested objects
        const nested = extractFieldPaths(prop as JsonSchema, fullPath);
        fields.push(...nested);
      } else {
        fields.push({ path: fullPath, type: propType || 'unknown' });
      }
    });
  }

  return fields;
}

// Get simple field names from array items in schema
function getArrayItemFields(schema: JsonSchema | undefined): string[] {
  if (!schema) return [];

  // Direct array
  if (schema.type === 'array' && schema.items) {
    const itemSchema = schema.items as JsonSchema;
    if (itemSchema.properties) {
      return Object.keys(itemSchema.properties);
    }
  }

  // Look for arrays in properties
  if (schema.properties) {
    for (const [, prop] of Object.entries(schema.properties)) {
      if (prop.type === 'array' && prop.items) {
        const itemSchema = prop.items as JsonSchema;
        if (itemSchema.properties) {
          return Object.keys(itemSchema.properties);
        }
      }
    }
  }

  return [];
}

// Get array paths from schema for extraction path dropdown
function getArrayPaths(schema: JsonSchema | undefined): string[] {
  if (!schema) return [];

  const paths: string[] = [];

  // If root is array
  if (schema.type === 'array') {
    paths.push('$[*]');
  }

  // Look for arrays in properties
  if (schema.properties) {
    Object.entries(schema.properties).forEach(([key, prop]) => {
      if (prop.type === 'array') {
        paths.push(`$.${key}[*]`);
      } else if (prop.type === 'object' && prop.properties) {
        // Check nested objects for arrays
        Object.entries(prop.properties).forEach(([nestedKey, nestedProp]) => {
          if (nestedProp.type === 'array') {
            paths.push(`$.${key}.${nestedKey}[*]`);
          }
        });
      }
    });
  }

  return paths;
}

export function AIToolsTab({
  form,
  integrationName,
  outputSchema,
  onRegenerateToolDescriptions,
}: AIToolsTabProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [newMetadataField, setNewMetadataField] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);

  // AI Tool Configuration fields
  const toolDescription = form.watch('toolDescription');
  const toolSuccessTemplate = form.watch('toolSuccessTemplate');
  const toolErrorTemplate = form.watch('toolErrorTemplate');
  const hasStoredDescriptions = toolDescription || toolSuccessTemplate || toolErrorTemplate;

  // Reference Data Sync fields
  const referenceData = form.watch('metadata.referenceData');
  const syncEnabled = referenceData?.syncable ?? false;
  const metadataFields = useMemo(
    () => referenceData?.metadataFields ?? [],
    [referenceData?.metadataFields]
  );
  const lookupFields = useMemo(
    () => referenceData?.lookupFields ?? [referenceData?.nameField ?? 'name'],
    [referenceData?.lookupFields, referenceData?.nameField]
  );
  const syncType = (referenceData?.syncType as SyncType) ?? 'list';

  // Get available fields from schema
  const availableFields = useMemo(() => getArrayItemFields(outputSchema), [outputSchema]);
  const availableArrayPaths = useMemo(() => getArrayPaths(outputSchema), [outputSchema]);
  const allFields = useMemo(() => extractFieldPaths(outputSchema), [outputSchema]);

  const handleRegenerate = async () => {
    if (!onRegenerateToolDescriptions) return;
    setIsGenerating(true);
    try {
      await onRegenerateToolDescriptions();
    } finally {
      setIsGenerating(false);
    }
  };

  const updateReferenceData = useCallback(
    (updates: Record<string, unknown>) => {
      const current = form.getValues('metadata.referenceData') || {};
      const metadata = form.getValues('metadata') || {};

      // Build new reference data, only including defaults for new fields
      const newReferenceData = {
        ...current,
        ...updates,
      };

      // Set defaults only if not already set
      if (newReferenceData.dataType === undefined) newReferenceData.dataType = '';
      if (newReferenceData.syncable === undefined) newReferenceData.syncable = true;
      if (newReferenceData.extractionPath === undefined) newReferenceData.extractionPath = '';
      if (newReferenceData.idField === undefined) newReferenceData.idField = 'id';
      if (newReferenceData.nameField === undefined) newReferenceData.nameField = 'name';
      if (newReferenceData.metadataFields === undefined) newReferenceData.metadataFields = [];
      if (newReferenceData.defaultTtlSeconds === undefined)
        newReferenceData.defaultTtlSeconds = 86400;
      if (newReferenceData.syncType === undefined) newReferenceData.syncType = 'list';
      if (newReferenceData.lookupFields === undefined)
        newReferenceData.lookupFields = [newReferenceData.nameField || 'name'];
      if (newReferenceData.fuzzyMatch === undefined) newReferenceData.fuzzyMatch = true;

      form.setValue(
        'metadata',
        {
          ...metadata,
          referenceData: newReferenceData,
        },
        { shouldDirty: true, shouldTouch: true }
      );
    },
    [form]
  );

  const toggleSyncEnabled = useCallback(
    (checked: boolean) => {
      const metadata = form.getValues('metadata') || {};
      if (checked) {
        form.setValue(
          'metadata',
          {
            ...metadata,
            referenceData: {
              dataType: '',
              syncable: true,
              extractionPath: '',
              idField: 'id',
              nameField: 'name',
              metadataFields: [],
              defaultTtlSeconds: 86400,
              syncType: 'list',
              lookupFields: ['name'],
              fuzzyMatch: true,
            },
          },
          { shouldDirty: true, shouldTouch: true }
        );
      } else {
        // Remove reference data config when disabled
        form.setValue(
          'metadata',
          {
            ...metadata,
            referenceData: undefined,
          },
          { shouldDirty: true, shouldTouch: true }
        );
      }
    },
    [form]
  );

  const addMetadataField = useCallback(() => {
    if (newMetadataField.trim() && !metadataFields.includes(newMetadataField.trim())) {
      updateReferenceData({
        metadataFields: [...metadataFields, newMetadataField.trim()],
      });
      setNewMetadataField('');
    }
  }, [newMetadataField, metadataFields, updateReferenceData]);

  const removeMetadataField = useCallback(
    (field: string) => {
      updateReferenceData({
        metadataFields: metadataFields.filter((f: string) => f !== field),
      });
    },
    [metadataFields, updateReferenceData]
  );

  const toggleLookupField = useCallback(
    (field: string, checked: boolean) => {
      const currentLookupFields = lookupFields || [];
      if (checked) {
        updateReferenceData({
          lookupFields: [...currentLookupFields, field],
        });
      } else {
        updateReferenceData({
          lookupFields: currentLookupFields.filter((f: string) => f !== field),
        });
      }
    },
    [lookupFields, updateReferenceData]
  );

  const insertSuccessVariable = useCallback(
    (variable: string) => {
      const currentValue = form.getValues('toolSuccessTemplate') || '';
      form.setValue('toolSuccessTemplate', currentValue + `{{${variable}}}`, {
        shouldDirty: true,
        shouldTouch: true,
      });
    },
    [form]
  );

  const insertErrorVariable = useCallback(
    (variable: string) => {
      const currentValue = form.getValues('toolErrorTemplate') || '';
      form.setValue('toolErrorTemplate', currentValue + `{{${variable}}}`, {
        shouldDirty: true,
        shouldTouch: true,
      });
    },
    [form]
  );

  // Convert seconds to days for display
  const syncIntervalDays = Math.round((referenceData?.defaultTtlSeconds ?? 86400) / 86400);

  return (
    <div className="space-y-8 pb-16">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold">AI Tools</h2>
        <p className="text-sm text-muted-foreground">
          Configure how this action behaves when used by AI agents
        </p>
      </div>

      <div className="max-w-2xl space-y-8">
        {/* Section 1: AI Tool Description */}
        <section className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Sparkles className="h-5 w-5 text-violet-500" />
              <div>
                <h3 className="font-medium">Tool Description</h3>
                <p className="text-sm text-muted-foreground">
                  How AI agents understand and use this action
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {hasStoredDescriptions ? (
                <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600">
                  Configured
                </Badge>
              ) : (
                <Badge variant="outline" className="bg-amber-500/10 text-amber-600">
                  Using defaults
                </Badge>
              )}
            </div>
          </div>

          <div className="space-y-6 pl-8">
            {/* Tool Description */}
            <FormField
              control={form.control}
              name="toolDescription"
              render={({ field }) => (
                <FormItem>
                  <div className="flex items-center gap-2">
                    <Label className="text-sm font-medium">Description</Label>
                    <Tooltip>
                      <TooltipTrigger>
                        <Info className="h-3.5 w-3.5 text-muted-foreground" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        The mini-prompt description shown to AI agents explaining what this tool
                        does, when to use it, and what inputs are required.
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <FormControl>
                    <Textarea
                      placeholder="Use this tool to..."
                      className="min-h-[100px] font-mono text-xs"
                      {...field}
                      value={field.value ?? ''}
                    />
                  </FormControl>
                  <p className="text-xs text-muted-foreground">
                    Leave empty to use auto-generated descriptions based on action schema.
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Separator />

            {/* Success Response Template */}
            <FormField
              control={form.control}
              name="toolSuccessTemplate"
              render={({ field }) => (
                <FormItem>
                  <div className="flex items-center gap-2">
                    <Label className="text-sm font-medium">Success Response Template</Label>
                    <Tooltip>
                      <TooltipTrigger>
                        <Info className="h-3.5 w-3.5 text-muted-foreground" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        Template for formatting successful responses. Use the available variables to
                        include dynamic content.
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <FormControl>
                    <Textarea
                      placeholder="## {{action_name}} completed&#10;&#10;{{summary}}&#10;&#10;ID: {{key_id}}"
                      className="min-h-[80px] font-mono text-xs"
                      {...field}
                      value={field.value ?? ''}
                    />
                  </FormControl>
                  {/* Variable badges */}
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Available Variables</Label>
                    <div className="flex flex-wrap gap-1.5">
                      {SUCCESS_TEMPLATE_VARIABLES.map((v) => (
                        <Tooltip key={v.name}>
                          <TooltipTrigger asChild>
                            <Badge
                              variant="outline"
                              className="cursor-pointer font-mono text-xs hover:bg-muted"
                              onClick={() => insertSuccessVariable(v.name)}
                            >
                              {`{{${v.name}}}`}
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent>{v.description}</TooltipContent>
                        </Tooltip>
                      ))}
                    </div>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Error Response Template */}
            <FormField
              control={form.control}
              name="toolErrorTemplate"
              render={({ field }) => (
                <FormItem>
                  <div className="flex items-center gap-2">
                    <Label className="text-sm font-medium">Error Response Template</Label>
                    <Tooltip>
                      <TooltipTrigger>
                        <Info className="h-3.5 w-3.5 text-muted-foreground" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        Template for formatting error responses. Helps AI agents understand what
                        went wrong and how to recover.
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <FormControl>
                    <Textarea
                      placeholder="## {{error_type}} Error&#10;&#10;{{error_message}}&#10;&#10;**How to fix:**&#10;{{remediation}}"
                      className="min-h-[80px] font-mono text-xs"
                      {...field}
                      value={field.value ?? ''}
                    />
                  </FormControl>
                  {/* Variable badges */}
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Available Variables</Label>
                    <div className="flex flex-wrap gap-1.5">
                      {ERROR_TEMPLATE_VARIABLES.map((v) => (
                        <Tooltip key={v.name}>
                          <TooltipTrigger asChild>
                            <Badge
                              variant="outline"
                              className="cursor-pointer font-mono text-xs hover:bg-muted"
                              onClick={() => insertErrorVariable(v.name)}
                            >
                              {`{{${v.name}}}`}
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent>{v.description}</TooltipContent>
                        </Tooltip>
                      ))}
                    </div>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Generate with AI */}
            {onRegenerateToolDescriptions && (
              <div className="flex items-center justify-between rounded-lg border bg-muted/30 p-4">
                <div>
                  <p className="text-sm font-medium">Generate with AI</p>
                  <p className="text-xs text-muted-foreground">
                    Create optimized descriptions based on
                    {integrationName ? ` ${integrationName}` : ''} action schema
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRegenerate}
                  disabled={isGenerating}
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Sparkles className="mr-2 h-3.5 w-3.5" />
                      Generate
                    </>
                  )}
                </Button>
              </div>
            )}
          </div>
        </section>

        <Separator />

        {/* Section 2: Reference Data Sync */}
        <section className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Database className="h-5 w-5 text-blue-500" />
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-medium">Reference Data Sync</h3>
                  <Badge variant="outline" className="text-xs">
                    Advanced
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  Cache data for AI to use without extra API calls
                </p>
              </div>
            </div>
            <Switch checked={syncEnabled} onCheckedChange={toggleSyncEnabled} />
          </div>

          {!syncEnabled && (
            <div className="rounded-lg border border-dashed bg-muted/20 p-4">
              <p className="text-sm font-medium">When should I enable this?</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Enable this when you want AI to access data from this action&apos;s response without
                making repeated API calls. This works for:
              </p>
              <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                <li>
                  <strong>Lists:</strong> Users, channels, projects, etc. AI can look up items by
                  name
                </li>
                <li>
                  <strong>Objects:</strong> Schemas, configs, etc. The full response is cached for
                  AI context
                </li>
              </ul>
            </div>
          )}

          {syncEnabled && (
            <div className="space-y-6 pl-8">
              {/* Sync Type Selection */}
              <div className="space-y-3">
                <Label className="text-sm font-medium">What type of data does this return?</Label>
                <div className="flex gap-4">
                  <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 hover:bg-muted/50 has-[:checked]:border-primary has-[:checked]:bg-primary/5">
                    <input
                      type="radio"
                      name="syncType"
                      value="list"
                      checked={syncType === 'list'}
                      onChange={() => updateReferenceData({ syncType: 'list' })}
                      className="mt-1"
                    />
                    <div>
                      <p className="font-medium">List of items</p>
                      <p className="text-xs text-muted-foreground">
                        Users, channels, projects, etc. AI can look up by name.
                      </p>
                    </div>
                  </label>
                  <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 hover:bg-muted/50 has-[:checked]:border-primary has-[:checked]:bg-primary/5">
                    <input
                      type="radio"
                      name="syncType"
                      value="object"
                      checked={syncType === 'object'}
                      onChange={() => updateReferenceData({ syncType: 'object' })}
                      className="mt-1"
                    />
                    <div>
                      <p className="font-medium">Complete object</p>
                      <p className="text-xs text-muted-foreground">
                        Schema, config, etc. Full response cached for AI context.
                      </p>
                    </div>
                  </label>
                </div>
              </div>

              {/* Data Category */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Data label</Label>
                <Input
                  placeholder="e.g., users, channels, crm_schema"
                  value={referenceData?.dataType ?? ''}
                  onChange={(e) => updateReferenceData({ dataType: e.target.value })}
                  className="max-w-sm"
                />
                <p className="text-xs text-muted-foreground">
                  A label to identify this data type. Used when multiple actions sync different
                  data.
                </p>
              </div>

              {/* List-specific configuration */}
              {syncType === 'list' && (
                <>
                  {/* Extraction Path */}
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Path to the list in response</Label>
                    {availableArrayPaths.length > 0 ? (
                      <Select
                        value={referenceData?.extractionPath ?? ''}
                        onValueChange={(value) => updateReferenceData({ extractionPath: value })}
                      >
                        <SelectTrigger className="max-w-md font-mono text-sm">
                          <SelectValue placeholder="Select array path from schema" />
                        </SelectTrigger>
                        <SelectContent>
                          {availableArrayPaths.map((path) => (
                            <SelectItem key={path} value={path} className="font-mono">
                              {path}
                            </SelectItem>
                          ))}
                          <SelectItem value="_custom" className="text-muted-foreground">
                            Enter custom path...
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        placeholder="$.members[*] or $.data.items[*]"
                        value={referenceData?.extractionPath ?? ''}
                        onChange={(e) => updateReferenceData({ extractionPath: e.target.value })}
                        className="max-w-md font-mono text-sm"
                      />
                    )}
                    {referenceData?.extractionPath === '_custom' && (
                      <Input
                        placeholder="$.members[*] or $.data.items[*]"
                        value=""
                        onChange={(e) => updateReferenceData({ extractionPath: e.target.value })}
                        className="max-w-md font-mono text-sm"
                        autoFocus
                      />
                    )}
                    <p className="text-xs text-muted-foreground">
                      JSONPath to the array of items. Example: if response is{' '}
                      <code className="rounded bg-muted px-1">{'{"users": [...]}'}</code>, use{' '}
                      <code className="rounded bg-muted px-1">$.users[*]</code>
                    </p>
                  </div>

                  {/* Field Mapping */}
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">ID field</Label>
                      {availableFields.length > 0 ? (
                        <Select
                          value={referenceData?.idField ?? 'id'}
                          onValueChange={(value) => updateReferenceData({ idField: value })}
                        >
                          <SelectTrigger className="font-mono text-sm">
                            <SelectValue placeholder="Select ID field" />
                          </SelectTrigger>
                          <SelectContent>
                            {availableFields.map((field) => (
                              <SelectItem key={field} value={field} className="font-mono">
                                {field}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input
                          placeholder="id"
                          value={referenceData?.idField ?? 'id'}
                          onChange={(e) => updateReferenceData({ idField: e.target.value })}
                          className="font-mono text-sm"
                        />
                      )}
                      <p className="text-xs text-muted-foreground">
                        Field containing the unique identifier
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Primary name field</Label>
                      {availableFields.length > 0 ? (
                        <Select
                          value={referenceData?.nameField ?? 'name'}
                          onValueChange={(value) => updateReferenceData({ nameField: value })}
                        >
                          <SelectTrigger className="font-mono text-sm">
                            <SelectValue placeholder="Select name field" />
                          </SelectTrigger>
                          <SelectContent>
                            {availableFields.map((field) => (
                              <SelectItem key={field} value={field} className="font-mono">
                                {field}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input
                          placeholder="name"
                          value={referenceData?.nameField ?? 'name'}
                          onChange={(e) => updateReferenceData({ nameField: e.target.value })}
                          className="font-mono text-sm"
                        />
                      )}
                      <p className="text-xs text-muted-foreground">
                        Main field AI uses for lookups (e.g., &quot;name&quot;)
                      </p>
                    </div>
                  </div>

                  {/* Lookup Configuration */}
                  <div className="space-y-3 rounded-lg border bg-muted/30 p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">Lookup Settings</p>
                        <p className="text-xs text-muted-foreground">
                          How AI finds items when given a name or partial match
                        </p>
                      </div>
                    </div>

                    {/* Multiple lookup fields */}
                    <div className="space-y-2">
                      <Label className="text-xs font-medium">Fields to search</Label>
                      <p className="text-xs text-muted-foreground">
                        AI will search these fields when looking up items. Select multiple for
                        flexible matching.
                      </p>
                      <div className="flex flex-wrap gap-2 pt-1">
                        {(availableFields.length > 0
                          ? availableFields
                          : ['name', 'email', 'username', 'display_name', 'title']
                        ).map((field) => (
                          <label
                            key={field}
                            className="flex cursor-pointer items-center gap-2 rounded-md border bg-background px-3 py-1.5 text-sm hover:bg-muted/50 has-[:checked]:border-primary has-[:checked]:bg-primary/5"
                          >
                            <Checkbox
                              checked={lookupFields.includes(field)}
                              onCheckedChange={(checked) =>
                                toggleLookupField(field, checked as boolean)
                              }
                            />
                            <span className="font-mono text-xs">{field}</span>
                          </label>
                        ))}
                      </div>
                    </div>

                    {/* Fuzzy matching toggle */}
                    <div className="flex items-center justify-between pt-2">
                      <div>
                        <Label className="text-xs font-medium">Fuzzy matching</Label>
                        <p className="text-xs text-muted-foreground">
                          &quot;Derek&quot; matches &quot;Derek Osgood&quot; (partial and case
                          insensitive)
                        </p>
                      </div>
                      <Switch
                        checked={referenceData?.fuzzyMatch ?? true}
                        onCheckedChange={(checked) => updateReferenceData({ fuzzyMatch: checked })}
                      />
                    </div>
                  </div>
                </>
              )}

              {/* Sync Interval */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Refresh interval</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={1}
                    max={30}
                    value={syncIntervalDays}
                    onChange={(e) => {
                      const days = parseInt(e.target.value, 10) || 1;
                      updateReferenceData({ defaultTtlSeconds: days * 86400 });
                    }}
                    className="w-20"
                  />
                  <span className="text-sm text-muted-foreground">day(s)</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  How often to re-sync this data from the API
                </p>
              </div>

              {/* Advanced Options - Collapsible */}
              {syncType === 'list' && (
                <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground">
                      <ChevronDown
                        className={`h-4 w-4 transition-transform ${showAdvanced ? 'rotate-180' : ''}`}
                      />
                      Advanced options
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="space-y-4 pt-4">
                    {/* Extra fields to cache */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Label className="text-sm font-medium">Extra fields to cache</Label>
                        <Tooltip>
                          <TooltipTrigger>
                            <Info className="h-3.5 w-3.5 text-muted-foreground" />
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs">
                            Beyond ID and name, which additional fields should be stored? These can
                            be used for filtering or providing extra context to AI.
                          </TooltipContent>
                        </Tooltip>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {metadataFields.map((field: string) => (
                          <Badge
                            key={field}
                            variant="secondary"
                            className="gap-1 font-mono text-xs"
                          >
                            {field}
                            <button
                              type="button"
                              onClick={() => removeMetadataField(field)}
                              className="ml-1 rounded-full hover:bg-destructive/20"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </Badge>
                        ))}
                        <div className="flex items-center gap-1">
                          {availableFields.length > 0 ? (
                            <Select
                              value=""
                              onValueChange={(value) => {
                                if (value && !metadataFields.includes(value)) {
                                  updateReferenceData({
                                    metadataFields: [...metadataFields, value],
                                  });
                                }
                              }}
                            >
                              <SelectTrigger className="h-7 w-32 font-mono text-xs">
                                <SelectValue placeholder="Add field" />
                              </SelectTrigger>
                              <SelectContent>
                                {availableFields
                                  .filter(
                                    (f) =>
                                      !metadataFields.includes(f) &&
                                      f !== referenceData?.idField &&
                                      f !== referenceData?.nameField
                                  )
                                  .map((field) => (
                                    <SelectItem key={field} value={field} className="font-mono">
                                      {field}
                                    </SelectItem>
                                  ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <>
                              <Input
                                placeholder="field_name"
                                value={newMetadataField}
                                onChange={(e) => setNewMetadataField(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    addMetadataField();
                                  }
                                }}
                                className="h-7 w-28 font-mono text-xs"
                              />
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={addMetadataField}
                                className="h-7 w-7 p-0"
                              >
                                <Plus className="h-3.5 w-3.5" />
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Example: &quot;email&quot;, &quot;is_admin&quot;, &quot;department&quot; for
                        user lists
                      </p>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              )}

              {/* Schema Preview for debugging */}
              {outputSchema && allFields.length > 0 && (
                <details className="text-xs">
                  <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                    View detected schema fields ({allFields.length})
                  </summary>
                  <div className="mt-2 max-h-40 overflow-auto rounded border bg-muted/30 p-2 font-mono">
                    {allFields.map((f) => (
                      <div key={f.path} className="flex gap-2">
                        <span className="text-muted-foreground">{f.type}</span>
                        <span>{f.path}</span>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
