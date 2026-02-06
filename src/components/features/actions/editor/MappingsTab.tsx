'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import {
  Plus,
  Trash2,
  ArrowRight,
  Loader2,
  Info,
  Users,
  ChevronDown,
  Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  useMappings,
  useMappingConfig,
  useCreateMapping,
  useDeleteMapping,
} from '@/hooks/useMappings';
import {
  getSchemaFieldPaths,
  type FieldMapping,
  type MappingDirection,
  type CoercionType,
  type SchemaFieldInfo,
} from '@/lib/modules/execution/mapping';
import type { JsonSchema } from '@/lib/modules/actions/action.schemas';

interface MappingsTabProps {
  actionId: string;
  integrationId: string;
  inputSchema?: JsonSchema | null;
  outputSchema?: JsonSchema | null;
}

export function MappingsTab({
  actionId,
  integrationId,
  inputSchema,
  outputSchema,
}: MappingsTabProps) {
  const {
    data: mappingsData,
    isLoading,
    refetch,
  } = useMappings(actionId, integrationId, {
    includeStats: true,
  });
  const {
    data: config,
    mutateAsync: updateConfig,
    isPending: configPending,
  } = useMappingConfig(actionId, integrationId);

  const mappings = useMemo(() => mappingsData?.mappings ?? [], [mappingsData?.mappings]);
  const stats = mappingsData?.stats;
  const connectionsWithOverrides = stats?.connectionsWithOverrides ?? 0;

  // Optimistic state for responsive toggles
  const [optimisticEnabled, setOptimisticEnabled] = useState<boolean | null>(null);
  const [optimisticFailureMode, setOptimisticFailureMode] = useState<string | null>(null);

  // Use optimistic state if set, otherwise fall back to server state
  const enabled = optimisticEnabled ?? config?.enabled ?? false;
  const failureMode = optimisticFailureMode ?? config?.failureMode ?? 'passthrough';

  // Reset optimistic state when server state updates
  useEffect(() => {
    if (config) {
      setOptimisticEnabled(null);
      setOptimisticFailureMode(null);
    }
  }, [config]);

  // Determine if schemas are array types at root
  const isOutputArray = outputSchema?.type === 'array';
  const isInputArray = inputSchema?.type === 'array';

  // Extract fields from schemas
  const outputFields = useMemo(() => {
    if (!outputSchema) return [];
    return getSchemaFieldPaths(outputSchema as Parameters<typeof getSchemaFieldPaths>[0]);
  }, [outputSchema]);

  const inputFields = useMemo(() => {
    if (!inputSchema) return [];
    return getSchemaFieldPaths(inputSchema as Parameters<typeof getSchemaFieldPaths>[0]);
  }, [inputSchema]);

  // Check if there are schema fields available
  const hasSchemaFields = outputFields.length > 0 || inputFields.length > 0;

  // Filter out fields that already have mappings configured
  const configuredOutputPaths = useMemo(
    () => new Set(mappings.filter((m) => m.direction === 'output').map((m) => m.sourcePath)),
    [mappings]
  );

  const configuredInputPaths = useMemo(
    () => new Set(mappings.filter((m) => m.direction === 'input').map((m) => m.sourcePath)),
    [mappings]
  );

  const availableOutputFields = useMemo(
    () => outputFields.filter((f) => !configuredOutputPaths.has(f.path)),
    [outputFields, configuredOutputPaths]
  );

  const availableInputFields = useMemo(
    () => inputFields.filter((f) => !configuredInputPaths.has(f.path)),
    [inputFields, configuredInputPaths]
  );

  // Check if root mapping is already configured
  const hasRootOutputMapping = configuredOutputPaths.has('$');
  const hasRootInputMapping = configuredInputPaths.has('$');

  const handleToggleEnabled = useCallback(
    async (value: boolean) => {
      // Optimistic update - set immediately for responsive UI
      setOptimisticEnabled(value);
      try {
        await updateConfig({ enabled: value });
        toast.success(value ? 'Mapping enabled' : 'Mapping disabled');
        refetch();
      } catch {
        // Revert optimistic update on error
        setOptimisticEnabled(null);
        toast.error('Failed to update');
      }
    },
    [updateConfig, refetch]
  );

  const handleChangeFailureMode = useCallback(
    async (value: string) => {
      // Optimistic update - set immediately for responsive UI
      setOptimisticFailureMode(value);
      try {
        await updateConfig({ failureMode: value as 'fail' | 'passthrough' });
        toast.success('Failure mode updated');
        refetch();
      } catch {
        // Revert optimistic update on error
        setOptimisticFailureMode(null);
        toast.error('Failed to update');
      }
    },
    [updateConfig, refetch]
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold">Field Mapping</h2>
        <p className="text-sm text-muted-foreground">
          Transform fields between your app and the external API using JSONPath
        </p>
      </div>

      {/* Main controls - always visible */}
      <div className="flex items-center justify-between rounded-lg border bg-card p-4">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Label className="font-medium">Enable Mapping</Label>
            <Tooltip>
              <TooltipTrigger>
                <Info className="h-3.5 w-3.5 text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                When enabled, field mappings will be applied to transform data between your app and
                the external API.
              </TooltipContent>
            </Tooltip>
          </div>
          <Switch
            checked={enabled}
            onCheckedChange={handleToggleEnabled}
            disabled={configPending || isLoading}
          />
        </div>

        <div className="flex items-center gap-4">
          {/* Failure Mode */}
          <div className="flex items-center gap-2">
            <Label className="text-sm">On Error</Label>
            <Tooltip>
              <TooltipTrigger>
                <Info className="h-3.5 w-3.5 text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <strong>Passthrough:</strong> Return original data if mapping fails (safe).
                <br />
                <strong>Strict:</strong> Fail the request if mapping fails.
              </TooltipContent>
            </Tooltip>
          </div>
          <Select
            value={failureMode}
            onValueChange={handleChangeFailureMode}
            disabled={configPending || !enabled || isLoading}
          >
            <SelectTrigger className="h-8 w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="passthrough">Passthrough</SelectItem>
              <SelectItem value="fail">Strict</SelectItem>
            </SelectContent>
          </Select>

          {/* Connection Overrides Indicator */}
          {connectionsWithOverrides > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge
                  variant="outline"
                  className="gap-1.5 border-violet-500/30 bg-violet-500/10 text-violet-600 dark:text-violet-400"
                >
                  <Users className="h-3 w-3" />
                  {connectionsWithOverrides} connection{connectionsWithOverrides !== 1 ? 's' : ''}{' '}
                  with overrides
                </Badge>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <p className="text-xs">
                  {connectionsWithOverrides} connection
                  {connectionsWithOverrides !== 1 ? 's have' : ' has'} custom mapping overrides.
                  View connection details to manage per-app mappings.
                </p>
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>

      {/* Content area - always visible but styled based on enabled state */}
      <div className={`space-y-4 ${!enabled ? 'pointer-events-none opacity-50' : ''}`}>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {/* Configured Mappings Table - Only show if there are mappings */}
            {mappings.length > 0 && (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="w-24">Direction</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead className="w-8"></TableHead>
                      <TableHead>Target</TableHead>
                      <TableHead className="w-24">Coerce To</TableHead>
                      <TableHead className="w-12"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {mappings.map((mapping) => (
                      <MappingRow
                        key={mapping.id}
                        mapping={mapping}
                        actionId={actionId}
                        integrationId={integrationId}
                        onDelete={refetch}
                      />
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {/* Schema Fields Section - Primary way to add mappings */}
            {hasSchemaFields && (
              <SchemaFieldsSection
                outputFields={availableOutputFields}
                inputFields={availableInputFields}
                isOutputArray={isOutputArray}
                isInputArray={isInputArray}
                hasRootOutputMapping={hasRootOutputMapping}
                hasRootInputMapping={hasRootInputMapping}
                actionId={actionId}
                integrationId={integrationId}
                onMappingAdded={refetch}
              />
            )}

            {/* Manual add fallback - Only show when no schema fields available */}
            {!hasSchemaFields && (
              <ManualAddSection actionId={actionId} integrationId={integrationId} onAdd={refetch} />
            )}

            {/* Empty state */}
            {mappings.length === 0 && !hasSchemaFields && (
              <div className="rounded-lg bg-muted/50 p-4 text-center">
                <p className="text-sm text-muted-foreground">
                  No schema detected. Add mappings manually using the form above.
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  Example: <code className="rounded bg-muted px-1">$.data.user_email</code> →{' '}
                  <code className="rounded bg-muted px-1">$.email</code>
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// Mapping Row (for existing mappings)
// =============================================================================

interface MappingRowProps {
  mapping: FieldMapping;
  actionId: string;
  integrationId: string;
  onDelete: () => void;
}

function MappingRow({ mapping, actionId, integrationId, onDelete }: MappingRowProps) {
  const { mutateAsync: deleteMapping, isPending } = useDeleteMapping(actionId, integrationId);

  const handleDelete = async () => {
    if (!mapping.id) return;
    try {
      await deleteMapping(mapping.id);
      toast.success('Mapping deleted');
      onDelete();
    } catch {
      toast.error('Failed to delete');
    }
  };

  const coercionType = mapping.transformConfig?.coercion?.type;

  return (
    <TableRow>
      <TableCell>
        <Badge variant="outline" className="text-xs">
          {mapping.direction}
        </Badge>
      </TableCell>
      <TableCell>
        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
          {mapping.sourcePath}
        </code>
      </TableCell>
      <TableCell>
        <ArrowRight className="h-3 w-3 text-muted-foreground" />
      </TableCell>
      <TableCell>
        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
          {mapping.targetPath}
        </code>
      </TableCell>
      <TableCell>
        {coercionType ? (
          <Badge variant="secondary" className="text-xs">
            {coercionType}
          </Badge>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-destructive"
          onClick={handleDelete}
          disabled={isPending}
        >
          {isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Trash2 className="h-3.5 w-3.5" />
          )}
        </Button>
      </TableCell>
    </TableRow>
  );
}

// =============================================================================
// Schema Fields Section
// =============================================================================

interface SchemaFieldsSectionProps {
  outputFields: SchemaFieldInfo[];
  inputFields: SchemaFieldInfo[];
  isOutputArray: boolean;
  isInputArray: boolean;
  hasRootOutputMapping: boolean;
  hasRootInputMapping: boolean;
  actionId: string;
  integrationId: string;
  onMappingAdded: () => void;
}

function SchemaFieldsSection({
  outputFields,
  inputFields,
  isOutputArray,
  isInputArray,
  hasRootOutputMapping,
  hasRootInputMapping,
  actionId,
  integrationId,
  onMappingAdded,
}: SchemaFieldsSectionProps) {
  const [outputExpanded, setOutputExpanded] = useState(true);
  const [inputExpanded, setInputExpanded] = useState(false);

  const hasOutputFields = outputFields.length > 0 || (isOutputArray && !hasRootOutputMapping);
  const hasInputFields = inputFields.length > 0 || (isInputArray && !hasRootInputMapping);

  if (!hasOutputFields && !hasInputFields) {
    return null;
  }

  return (
    <div className="space-y-4 rounded-lg border border-dashed border-violet-500/30 bg-violet-500/5 p-4">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-violet-500" />
        <span className="text-sm font-medium">Available Fields from Schema</span>
        <Badge variant="secondary" className="text-xs">
          {outputFields.length +
            inputFields.length +
            (isOutputArray && !hasRootOutputMapping ? 1 : 0) +
            (isInputArray && !hasRootInputMapping ? 1 : 0)}{' '}
          fields
        </Badge>
        <Tooltip>
          <TooltipTrigger>
            <Info className="h-3.5 w-3.5 text-muted-foreground" />
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">
            <p className="text-xs">
              These fields are detected from your action&apos;s schema. Enter a target path and
              click Add to create a mapping.
            </p>
          </TooltipContent>
        </Tooltip>
      </div>

      {/* Output Fields */}
      {hasOutputFields && (
        <div className="space-y-2">
          <button
            type="button"
            className="flex w-full items-center gap-2 text-left text-sm font-medium text-muted-foreground hover:text-foreground"
            onClick={() => setOutputExpanded(!outputExpanded)}
          >
            <ChevronDown
              className={`h-4 w-4 transition-transform ${outputExpanded ? '' : '-rotate-90'}`}
            />
            Output Fields (API → Your App)
            <Badge variant="outline" className="ml-auto text-xs">
              {outputFields.length + (isOutputArray && !hasRootOutputMapping ? 1 : 0)}
            </Badge>
          </button>
          {outputExpanded && (
            <div className="space-y-1 pl-6">
              {/* Root array mapping option */}
              {isOutputArray && !hasRootOutputMapping && (
                <RootMappingRow
                  label="Entire response (array)"
                  path="$"
                  type="array"
                  direction="output"
                  actionId={actionId}
                  integrationId={integrationId}
                  onMappingAdded={onMappingAdded}
                />
              )}
              {outputFields.map((field) => (
                <SchemaFieldRow
                  key={field.path}
                  field={field}
                  direction="output"
                  actionId={actionId}
                  integrationId={integrationId}
                  onMappingAdded={onMappingAdded}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Input Fields */}
      {hasInputFields && (
        <div className="space-y-2">
          <button
            type="button"
            className="flex w-full items-center gap-2 text-left text-sm font-medium text-muted-foreground hover:text-foreground"
            onClick={() => setInputExpanded(!inputExpanded)}
          >
            <ChevronDown
              className={`h-4 w-4 transition-transform ${inputExpanded ? '' : '-rotate-90'}`}
            />
            Input Fields (Your App → API)
            <Badge variant="outline" className="ml-auto text-xs">
              {inputFields.length + (isInputArray && !hasRootInputMapping ? 1 : 0)}
            </Badge>
          </button>
          {inputExpanded && (
            <div className="space-y-1 pl-6">
              {/* Root array mapping option */}
              {isInputArray && !hasRootInputMapping && (
                <RootMappingRow
                  label="Entire request (array)"
                  path="$"
                  type="array"
                  direction="input"
                  actionId={actionId}
                  integrationId={integrationId}
                  onMappingAdded={onMappingAdded}
                />
              )}
              {inputFields.map((field) => (
                <SchemaFieldRow
                  key={field.path}
                  field={field}
                  direction="input"
                  actionId={actionId}
                  integrationId={integrationId}
                  onMappingAdded={onMappingAdded}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Root Mapping Row (for mapping entire array/object)
// =============================================================================

interface RootMappingRowProps {
  label: string;
  path: string;
  type: string;
  direction: MappingDirection;
  actionId: string;
  integrationId: string;
  onMappingAdded: () => void;
}

function RootMappingRow({
  label,
  path,
  type,
  direction,
  actionId,
  integrationId,
  onMappingAdded,
}: RootMappingRowProps) {
  const [targetPath, setTargetPath] = useState('');
  const { mutateAsync: createMapping, isPending } = useCreateMapping(actionId, integrationId);

  const handleAdd = async () => {
    if (!targetPath.trim()) return;

    try {
      await createMapping({
        sourcePath: path,
        targetPath: targetPath.trim().startsWith('$')
          ? targetPath.trim()
          : `$.${targetPath.trim()}`,
        direction,
        transformConfig: {
          omitIfNull: false,
          omitIfEmpty: false,
          arrayMode: 'all' as const,
        },
      });
      toast.success('Mapping added');
      setTargetPath('');
      onMappingAdded();
    } catch {
      toast.error('Failed to add mapping');
    }
  };

  return (
    <div className="flex items-center gap-2 rounded-md border border-dashed border-emerald-500/30 bg-emerald-500/5 px-3 py-2">
      <Tooltip>
        <TooltipTrigger asChild>
          <code className="flex-shrink-0 rounded bg-emerald-500/10 px-1.5 py-0.5 font-mono text-xs text-emerald-700 dark:text-emerald-400">
            {path}
          </code>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <div className="space-y-1 text-xs">
            <p className="font-medium">{label}</p>
            <p className="text-muted-foreground">
              Maps the entire {type} to a single field in your app.
            </p>
          </div>
        </TooltipContent>
      </Tooltip>
      <Badge variant="secondary" className="text-[10px]">
        {type}
      </Badge>
      <span className="text-xs text-muted-foreground">{label}</span>
      <ArrowRight className="ml-auto h-3 w-3 flex-shrink-0 text-muted-foreground" />
      <Input
        value={targetPath}
        onChange={(e) => setTargetPath(e.target.value)}
        placeholder="$.data"
        className="h-7 w-32 font-mono text-xs"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && targetPath.trim()) {
            handleAdd();
          }
        }}
      />
      <Button
        variant="ghost"
        size="sm"
        className="h-7 gap-1 px-2 text-xs"
        onClick={handleAdd}
        disabled={!targetPath.trim() || isPending}
      >
        {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
        Add
      </Button>
    </div>
  );
}

// =============================================================================
// Schema Field Row
// =============================================================================

interface SchemaFieldRowProps {
  field: SchemaFieldInfo;
  direction: MappingDirection;
  actionId: string;
  integrationId: string;
  onMappingAdded: () => void;
}

function SchemaFieldRow({
  field,
  direction,
  actionId,
  integrationId,
  onMappingAdded,
}: SchemaFieldRowProps) {
  const [targetPath, setTargetPath] = useState('');
  const { mutateAsync: createMapping, isPending } = useCreateMapping(actionId, integrationId);

  const handleAdd = async () => {
    if (!targetPath.trim()) return;

    try {
      await createMapping({
        sourcePath: field.path,
        targetPath: targetPath.trim().startsWith('$')
          ? targetPath.trim()
          : `$.${targetPath.trim()}`,
        direction,
        transformConfig: {
          omitIfNull: false,
          omitIfEmpty: false,
          arrayMode: 'all' as const,
        },
      });
      toast.success('Mapping added');
      setTargetPath('');
      onMappingAdded();
    } catch {
      toast.error('Failed to add mapping');
    }
  };

  return (
    <div className="flex items-center gap-2 rounded-md bg-background/50 px-3 py-2">
      <Tooltip>
        <TooltipTrigger asChild>
          <code className="flex-shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
            {field.path}
          </code>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <div className="space-y-1 text-xs">
            <p className="font-medium">{field.name}</p>
            <p className="text-muted-foreground">Type: {field.type}</p>
            {field.description && <p className="text-muted-foreground">{field.description}</p>}
            {field.required && (
              <Badge variant="outline" className="text-[10px]">
                Required
              </Badge>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
      <Badge variant="secondary" className="text-[10px]">
        {field.type}
      </Badge>
      {field.required && (
        <Badge variant="outline" className="border-amber-500/30 text-[10px] text-amber-600">
          req
        </Badge>
      )}
      <ArrowRight className="ml-auto h-3 w-3 flex-shrink-0 text-muted-foreground" />
      <Input
        value={targetPath}
        onChange={(e) => setTargetPath(e.target.value)}
        placeholder={`$.${field.name}`}
        className="h-7 w-32 font-mono text-xs"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && targetPath.trim()) {
            handleAdd();
          }
        }}
      />
      <Button
        variant="ghost"
        size="sm"
        className="h-7 gap-1 px-2 text-xs"
        onClick={handleAdd}
        disabled={!targetPath.trim() || isPending}
      >
        {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
        Add
      </Button>
    </div>
  );
}

// =============================================================================
// Manual Add Section (fallback when no schema)
// =============================================================================

interface ManualAddSectionProps {
  actionId: string;
  integrationId: string;
  onAdd: () => void;
}

function ManualAddSection({ actionId, integrationId, onAdd }: ManualAddSectionProps) {
  const [direction, setDirection] = useState<MappingDirection>('output');
  const [sourcePath, setSourcePath] = useState('');
  const [targetPath, setTargetPath] = useState('');
  const [coercionType, setCoercionType] = useState<CoercionType | 'none'>('none');

  const { mutateAsync: createMapping, isPending } = useCreateMapping(actionId, integrationId);

  const canAdd = sourcePath.trim() && targetPath.trim();

  const handleAdd = async () => {
    if (!canAdd) return;

    try {
      const transformConfig = {
        omitIfNull: false,
        omitIfEmpty: false,
        arrayMode: 'all' as const,
        ...(coercionType !== 'none' && { coercion: { type: coercionType } }),
      };

      await createMapping({
        sourcePath: sourcePath.trim(),
        targetPath: targetPath.trim(),
        direction,
        transformConfig,
      });
      toast.success('Mapping added');
      setSourcePath('');
      setTargetPath('');
      setCoercionType('none');
      onAdd();
    } catch {
      toast.error('Failed to add mapping');
    }
  };

  return (
    <div className="space-y-3 rounded-lg border bg-muted/30 p-4">
      <p className="text-sm font-medium">Add Mapping Manually</p>
      <div className="flex items-center gap-2">
        <Select value={direction} onValueChange={(v) => setDirection(v as MappingDirection)}>
          <SelectTrigger className="h-8 w-24 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="output">output</SelectItem>
            <SelectItem value="input">input</SelectItem>
          </SelectContent>
        </Select>
        <Input
          value={sourcePath}
          onChange={(e) => setSourcePath(e.target.value)}
          placeholder="$.source.path"
          className="h-8 flex-1 font-mono text-xs"
        />
        <ArrowRight className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
        <Input
          value={targetPath}
          onChange={(e) => setTargetPath(e.target.value)}
          placeholder="$.target.path"
          className="h-8 flex-1 font-mono text-xs"
        />
        <Select
          value={coercionType}
          onValueChange={(v) => setCoercionType(v as CoercionType | 'none')}
        >
          <SelectTrigger className="h-8 w-24 text-xs">
            <SelectValue placeholder="Coerce" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">—</SelectItem>
            <SelectItem value="string">string</SelectItem>
            <SelectItem value="number">number</SelectItem>
            <SelectItem value="boolean">boolean</SelectItem>
          </SelectContent>
        </Select>
        <Button size="sm" className="h-8" onClick={handleAdd} disabled={!canAdd || isPending}>
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}
