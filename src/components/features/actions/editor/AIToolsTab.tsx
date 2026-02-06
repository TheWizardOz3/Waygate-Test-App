'use client';

import { useState, useMemo, useCallback, useEffect, memo } from 'react';
import { UseFormReturn, FieldValues, useWatch } from 'react-hook-form';
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
import { Sparkles, Database, Info, Loader2, Star } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { UsedInAIToolsSection } from '@/components/features/composite-tools/UsedInAIToolsSection';
import { useCompositeToolsByAction } from '@/hooks/useCompositeTools';
import type { JsonSchema } from '@/lib/modules/actions/action.schemas';

interface AIToolsTabProps {
  form: UseFormReturn<FieldValues>;
  integrationName?: string;
  outputSchema?: JsonSchema;
  onRegenerateToolDescriptions?: () => Promise<void>;
  actionId?: string;
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

function AIToolsTabInner({
  form,
  // integrationName is available for future use
  outputSchema,
  onRegenerateToolDescriptions,
  actionId,
}: AIToolsTabProps) {
  const [isGenerating, setIsGenerating] = useState(false);

  // Fetch composite tools that use this action
  const { data: compositeToolsData, isLoading: isLoadingCompositeTools } =
    useCompositeToolsByAction(actionId);

  // Use useWatch for optimized re-renders - only re-render when these specific values change
  const toolDescription = useWatch({ control: form.control, name: 'toolDescription' });
  const toolSuccessTemplate = useWatch({ control: form.control, name: 'toolSuccessTemplate' });
  const toolErrorTemplate = useWatch({ control: form.control, name: 'toolErrorTemplate' });
  const hasStoredDescriptions = toolDescription || toolSuccessTemplate || toolErrorTemplate;

  // Reference Data Sync fields - useWatch for optimized subscription
  const referenceData = useWatch({ control: form.control, name: 'metadata.referenceData' });
  const syncEnabled = referenceData?.syncable ?? false;

  // Local state for text inputs to prevent re-renders on every keystroke
  const [localDataType, setLocalDataType] = useState(referenceData?.dataType ?? '');
  const [localExtractionPath, setLocalExtractionPath] = useState(
    referenceData?.extractionPath ?? ''
  );
  const [localIdField, setLocalIdField] = useState(referenceData?.idField ?? 'id');
  const [localNameField, setLocalNameField] = useState(referenceData?.nameField ?? 'name');
  const [localSyncDays, setLocalSyncDays] = useState(
    Math.round((referenceData?.defaultTtlSeconds ?? 86400) / 86400)
  );

  // Sync local state when form data changes (e.g., on initial load)
  // We intentionally depend on individual properties to avoid re-syncing on every form update
  useEffect(() => {
    if (referenceData) {
      setLocalDataType(referenceData.dataType ?? '');
      setLocalExtractionPath(referenceData.extractionPath ?? '');
      setLocalIdField(referenceData.idField ?? 'id');
      setLocalNameField(referenceData.nameField ?? 'name');
      setLocalSyncDays(Math.round((referenceData.defaultTtlSeconds ?? 86400) / 86400));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    referenceData?.dataType,
    referenceData?.extractionPath,
    referenceData?.idField,
    referenceData?.nameField,
    referenceData?.defaultTtlSeconds,
  ]);

  const metadataFields = useMemo(
    () => referenceData?.metadataFields ?? [],
    [referenceData?.metadataFields]
  );
  const lookupFields = useMemo(
    () => referenceData?.lookupFields ?? [referenceData?.nameField ?? 'name'],
    [referenceData?.lookupFields, referenceData?.nameField]
  );
  const syncType = (referenceData?.syncType as SyncType) ?? 'list';
  const fuzzyMatch = referenceData?.fuzzyMatch ?? true;

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

  // Update form only when needed (on blur or for non-text fields)
  const updateReferenceData = useCallback(
    (updates: Record<string, unknown>) => {
      const current = form.getValues('metadata.referenceData') || {};
      const metadata = form.getValues('metadata') || {};

      const newReferenceData = {
        dataType: current.dataType ?? '',
        syncable: current.syncable ?? true,
        extractionPath: current.extractionPath ?? '',
        idField: current.idField ?? 'id',
        nameField: current.nameField ?? 'name',
        metadataFields: current.metadataFields ?? [],
        defaultTtlSeconds: current.defaultTtlSeconds ?? 86400,
        syncType: current.syncType ?? 'list',
        lookupFields: current.lookupFields ?? [current.nameField || 'name'],
        fuzzyMatch: current.fuzzyMatch ?? true,
        ...updates,
      };

      form.setValue(
        'metadata',
        {
          ...metadata,
          referenceData: newReferenceData,
        },
        { shouldDirty: true }
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
          { shouldDirty: true }
        );
        // Reset local state
        setLocalDataType('');
        setLocalExtractionPath('');
        setLocalIdField('id');
        setLocalNameField('name');
        setLocalSyncDays(1);
      } else {
        form.setValue(
          'metadata',
          {
            ...metadata,
            referenceData: undefined,
          },
          { shouldDirty: true }
        );
      }
    },
    [form]
  );

  // Get all cached fields (nameField + metadataFields)
  const cachedFields = useMemo(() => {
    const fields = new Set<string>();
    if (referenceData?.nameField) fields.add(referenceData.nameField);
    if (metadataFields) {
      metadataFields.forEach((f: string) => fields.add(f));
    }
    return Array.from(fields);
  }, [referenceData?.nameField, metadataFields]);

  const toggleCacheField = useCallback(
    (field: string, checked: boolean) => {
      const currentNameField = referenceData?.nameField || 'name';
      const currentMetadataFields = metadataFields || [];

      if (checked) {
        // Adding a field to cache
        if (!currentMetadataFields.includes(field) && field !== currentNameField) {
          updateReferenceData({
            metadataFields: [...currentMetadataFields, field],
          });
        }
      } else {
        // Removing a field from cache
        if (field === currentNameField) {
          // Can't uncheck the display name field - must choose another first
          return;
        }
        updateReferenceData({
          metadataFields: currentMetadataFields.filter((f: string) => f !== field),
          // Also remove from lookup fields if it was there
          lookupFields: (lookupFields || []).filter((f: string) => f !== field),
        });
      }
    },
    [referenceData?.nameField, metadataFields, lookupFields, updateReferenceData]
  );

  const setAsDisplayName = useCallback(
    (field: string) => {
      const currentNameField = referenceData?.nameField || 'name';
      const currentMetadataFields = metadataFields || [];

      // Move old nameField to metadataFields (if it's not there and not the same)
      let newMetadataFields = [...currentMetadataFields];
      if (
        currentNameField &&
        currentNameField !== field &&
        !newMetadataFields.includes(currentNameField)
      ) {
        newMetadataFields.push(currentNameField);
      }
      // Remove new nameField from metadataFields
      newMetadataFields = newMetadataFields.filter((f: string) => f !== field);

      updateReferenceData({
        nameField: field,
        metadataFields: newMetadataFields,
      });
      setLocalNameField(field);
    },
    [referenceData?.nameField, metadataFields, updateReferenceData]
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
      });
    },
    [form]
  );

  const insertErrorVariable = useCallback(
    (variable: string) => {
      const currentValue = form.getValues('toolErrorTemplate') || '';
      form.setValue('toolErrorTemplate', currentValue + `{{${variable}}}`, {
        shouldDirty: true,
      });
    },
    [form]
  );

  return (
    <div className="space-y-6 pb-16">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold">AI Tools</h2>
        <p className="text-sm text-muted-foreground">
          Configure how this action behaves when used by AI agents
        </p>
      </div>

      <div className="space-y-6">
        {/* Section 1: AI Tool Description */}
        <section className="space-y-4 rounded-lg border bg-card p-5">
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
              {/* Generate with AI button inline */}
              {onRegenerateToolDescriptions && (
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
              )}
            </div>
          </div>

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
                      The mini-prompt description shown to AI agents explaining what this tool does,
                      when to use it, and what inputs are required.
                    </TooltipContent>
                  </Tooltip>
                </div>
                <FormControl>
                  <Textarea
                    placeholder="Use this tool to..."
                    className="min-h-[100px] font-mono text-xs"
                    {...field}
                    value={field.value ?? ''}
                    onChange={(e) => {
                      field.onChange(e.target.value || null);
                    }}
                  />
                </FormControl>
                <p className="text-xs text-muted-foreground">
                  Leave empty to use auto-generated descriptions based on action schema.
                </p>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Success & Error Templates side by side */}
          <div className="grid gap-4 lg:grid-cols-2">
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
                      onChange={(e) => {
                        field.onChange(e.target.value || null);
                      }}
                    />
                  </FormControl>
                  {/* Variable badges */}
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
                      onChange={(e) => {
                        field.onChange(e.target.value || null);
                      }}
                    />
                  </FormControl>
                  {/* Variable badges */}
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
                  <FormMessage />
                </FormItem>
              )}
            />
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

              {/* Data Category - uses local state */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Data label</Label>
                <Input
                  placeholder="e.g., users, channels, crm_schema"
                  value={localDataType}
                  onChange={(e) => setLocalDataType(e.target.value)}
                  onBlur={() => updateReferenceData({ dataType: localDataType })}
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
                        value={localExtractionPath}
                        onValueChange={(value) => {
                          if (value !== '_custom') {
                            setLocalExtractionPath(value);
                            updateReferenceData({ extractionPath: value });
                          }
                        }}
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
                        value={localExtractionPath}
                        onChange={(e) => setLocalExtractionPath(e.target.value)}
                        onBlur={() => updateReferenceData({ extractionPath: localExtractionPath })}
                        className="max-w-md font-mono text-sm"
                      />
                    )}
                    {localExtractionPath === '_custom' && (
                      <Input
                        placeholder="$.members[*] or $.data.items[*]"
                        value=""
                        onChange={(e) => setLocalExtractionPath(e.target.value)}
                        onBlur={() => updateReferenceData({ extractionPath: localExtractionPath })}
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

                  {/* ID Field */}
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">ID field</Label>
                    {availableFields.length > 0 ? (
                      <Select
                        value={localIdField}
                        onValueChange={(value) => {
                          setLocalIdField(value);
                          updateReferenceData({ idField: value });
                        }}
                      >
                        <SelectTrigger className="max-w-xs font-mono text-sm">
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
                        value={localIdField}
                        onChange={(e) => setLocalIdField(e.target.value)}
                        onBlur={() => updateReferenceData({ idField: localIdField })}
                        className="max-w-xs font-mono text-sm"
                      />
                    )}
                    <p className="text-xs text-muted-foreground">
                      Field containing the unique identifier for each item
                    </p>
                  </div>

                  {/* Fields to Cache - unified section */}
                  <div className="space-y-3 rounded-lg border bg-muted/30 p-4">
                    <div>
                      <p className="text-sm font-medium">Fields to cache</p>
                      <p className="text-xs text-muted-foreground">
                        Select fields to store. Click the star to set as display name.
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {(availableFields.length > 0
                        ? availableFields.filter((f) => f !== localIdField)
                        : ['name', 'email', 'username', 'display_name', 'title', 'department']
                      ).map((field) => {
                        const isDisplayName = field === localNameField;
                        const isCached = isDisplayName || cachedFields.includes(field);

                        return (
                          <label
                            key={field}
                            className={`flex cursor-pointer items-center gap-2 rounded-md border bg-background px-3 py-1.5 text-sm transition-colors hover:bg-muted/50 ${
                              isCached ? 'border-primary bg-primary/5' : ''
                            }`}
                          >
                            <Checkbox
                              checked={isCached}
                              onCheckedChange={(checked) =>
                                toggleCacheField(field, checked as boolean)
                              }
                            />
                            <span className="font-mono text-xs">{field}</span>
                            {isCached && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  setAsDisplayName(field);
                                }}
                                className={`ml-1 rounded p-0.5 transition-colors ${
                                  isDisplayName
                                    ? 'text-amber-500'
                                    : 'text-muted-foreground/40 hover:text-amber-500'
                                }`}
                                title={isDisplayName ? 'Display name' : 'Set as display name'}
                              >
                                <Star
                                  className={`h-3.5 w-3.5 ${isDisplayName ? 'fill-current' : ''}`}
                                />
                              </button>
                            )}
                          </label>
                        );
                      })}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      <Star className="mr-1 inline h-3 w-3 fill-amber-500 text-amber-500" />
                      indicates the primary display name shown when looking up items
                    </p>
                  </div>

                  {/* Lookup Configuration */}
                  <div className="space-y-3 rounded-lg border bg-muted/30 p-4">
                    <div>
                      <p className="text-sm font-medium">Fields to search</p>
                      <p className="text-xs text-muted-foreground">
                        AI will search these fields when looking up items by name
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {(cachedFields.length > 0
                        ? cachedFields
                        : availableFields.length > 0
                          ? availableFields.filter((f) => f !== localIdField)
                          : ['name', 'email', 'username']
                      ).map((field) => (
                        <label
                          key={field}
                          className={`flex cursor-pointer items-center gap-2 rounded-md border bg-background px-3 py-1.5 text-sm transition-colors hover:bg-muted/50 ${
                            lookupFields.includes(field) ? 'border-primary bg-primary/5' : ''
                          }`}
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

                    {/* Fuzzy matching toggle */}
                    <div className="flex items-center justify-between border-t pt-3">
                      <div>
                        <Label className="text-xs font-medium">Fuzzy matching</Label>
                        <p className="text-xs text-muted-foreground">
                          &quot;Derek&quot; matches &quot;Derek Osgood&quot; (partial and case
                          insensitive)
                        </p>
                      </div>
                      <Switch
                        checked={fuzzyMatch}
                        onCheckedChange={(checked) => updateReferenceData({ fuzzyMatch: checked })}
                      />
                    </div>
                  </div>
                </>
              )}

              {/* Sync Interval - uses local state */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Refresh interval</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={1}
                    max={30}
                    value={localSyncDays}
                    onChange={(e) => setLocalSyncDays(parseInt(e.target.value, 10) || 1)}
                    onBlur={() => updateReferenceData({ defaultTtlSeconds: localSyncDays * 86400 })}
                    className="w-20"
                  />
                  <span className="text-sm text-muted-foreground">day(s)</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  How often to re-sync this data from the API
                </p>
              </div>

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

        {/* Used in Composite Tools Section */}
        {actionId && (
          <UsedInAIToolsSection
            compositeTools={compositeToolsData?.compositeTools}
            isLoading={isLoadingCompositeTools}
            title="Used in Composite Tools"
            description="This action is included in the following composite tools"
            emptyMessage="This action is not used in any composite tools yet."
          />
        )}
      </div>
    </div>
  );
}

// Memoize to prevent re-renders when parent form changes unrelated fields
export const AIToolsTab = memo(AIToolsTabInner);
