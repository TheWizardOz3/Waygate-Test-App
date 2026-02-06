'use client';

import { useState, useMemo } from 'react';
import {
  Plus,
  Loader2,
  RotateCcw,
  Copy,
  Layers,
  GitBranch,
  Pencil,
  ChevronDown,
  Info,
  ArrowRight,
  Trash2,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { MappingInheritanceBadge } from './MappingInheritanceBadge';
import { OverrideMappingDialog } from './OverrideMappingDialog';
import { ResetMappingsDialog } from './ResetMappingsDialog';
import {
  useConnectionMappings,
  useCopyDefaultsToConnection,
  useDeleteConnectionOverride,
  useCreateConnectionOverride,
} from '@/hooks';
import type { ResolvedMapping, SchemaFieldInfo } from '@/lib/modules/execution/mapping';
import { getSchemaFieldPaths } from '@/lib/modules/execution/mapping';
import type { JsonSchema } from '@/lib/modules/actions/action.schemas';

interface ActionWithSchema {
  id: string;
  name: string;
  slug: string;
  inputSchema?: JsonSchema;
  outputSchema?: JsonSchema;
}

interface ConnectionMappingListProps {
  connectionId: string;
  actions: ActionWithSchema[];
}

/**
 * List of connection-specific mappings for a selected action
 */
export function ConnectionMappingList({ connectionId, actions }: ConnectionMappingListProps) {
  const [selectedActionId, setSelectedActionId] = useState<string | undefined>(
    actions.length > 0 ? actions[0].id : undefined
  );
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [showSchemaFields, setShowSchemaFields] = useState(true);

  const {
    data: mappingsData,
    isLoading,
    refetch,
  } = useConnectionMappings(connectionId, selectedActionId);

  const { mutateAsync: copyDefaults, isPending: copyPending } =
    useCopyDefaultsToConnection(connectionId);

  const stats = mappingsData?.stats;
  const config = mappingsData?.config;

  // Memoize mappings to avoid unstable references
  const mappings = useMemo(() => mappingsData?.mappings ?? [], [mappingsData?.mappings]);

  // Get the selected action's schema
  const selectedAction = useMemo(
    () => actions.find((a) => a.id === selectedActionId),
    [actions, selectedActionId]
  );

  // Determine if schemas are array types at root
  const isOutputArray = selectedAction?.outputSchema?.type === 'array';
  const isInputArray = selectedAction?.inputSchema?.type === 'array';

  // Extract schema fields as potential source paths
  const outputSchemaFields = useMemo(() => {
    if (!selectedAction?.outputSchema) return [];
    return getSchemaFieldPaths(
      selectedAction.outputSchema as Parameters<typeof getSchemaFieldPaths>[0]
    );
  }, [selectedAction?.outputSchema]);

  const inputSchemaFields = useMemo(() => {
    if (!selectedAction?.inputSchema) return [];
    return getSchemaFieldPaths(
      selectedAction.inputSchema as Parameters<typeof getSchemaFieldPaths>[0]
    );
  }, [selectedAction?.inputSchema]);

  // Find which schema fields already have mappings configured
  const configuredOutputPaths = useMemo(() => {
    return new Set(
      mappings.filter((m) => m.mapping.direction === 'output').map((m) => m.mapping.sourcePath)
    );
  }, [mappings]);

  const configuredInputPaths = useMemo(() => {
    return new Set(
      mappings.filter((m) => m.mapping.direction === 'input').map((m) => m.mapping.sourcePath)
    );
  }, [mappings]);

  // Check if root mapping is already configured
  const hasRootOutputMapping = configuredOutputPaths.has('$');
  const hasRootInputMapping = configuredInputPaths.has('$');

  // Get unconfigured schema fields
  const unconfiguredOutputFields = useMemo(() => {
    return outputSchemaFields.filter((f) => !configuredOutputPaths.has(f.path));
  }, [outputSchemaFields, configuredOutputPaths]);

  const unconfiguredInputFields = useMemo(() => {
    return inputSchemaFields.filter((f) => !configuredInputPaths.has(f.path));
  }, [inputSchemaFields, configuredInputPaths]);

  const handleCopyDefaults = async () => {
    if (!selectedActionId) return;
    try {
      await copyDefaults({ actionId: selectedActionId });
      refetch();
    } catch {
      // Error toast handled by hook
    }
  };

  if (actions.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Layers className="mx-auto mb-3 h-8 w-8 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">
            No actions configured for this integration yet.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Create actions in the integration settings to configure custom mappings.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-base">
              <Layers className="h-4 w-4" />
              Field Mappings
            </CardTitle>
            <CardDescription>Customize how data is transformed for this connection</CardDescription>
          </div>

          {/* Action Selector */}
          <Select value={selectedActionId} onValueChange={setSelectedActionId}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Select action" />
            </SelectTrigger>
            <SelectContent>
              {actions.map((action) => (
                <SelectItem key={action.id} value={action.id}>
                  {action.name || action.slug}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Stats Bar */}
        {stats && selectedActionId && (
          <div className="mt-4 flex items-center gap-4 rounded-lg border bg-muted/30 px-4 py-2.5">
            <div className="flex items-center gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1.5 text-sm">
                    <GitBranch className="h-3.5 w-3.5 text-slate-500" />
                    <span className="font-medium">{stats.defaultsCount}</span>
                    <span className="text-muted-foreground">inherited</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs">Mappings inherited from action defaults</p>
                </TooltipContent>
              </Tooltip>
            </div>

            <div className="h-4 w-px bg-border" />

            <div className="flex items-center gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1.5 text-sm">
                    <Pencil className="h-3.5 w-3.5 text-violet-500" />
                    <span className="font-medium">{stats.overridesCount}</span>
                    <span className="text-muted-foreground">
                      override{stats.overridesCount !== 1 ? 's' : ''}
                    </span>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs">Custom mappings for this connection</p>
                </TooltipContent>
              </Tooltip>
            </div>

            <div className="flex-1" />

            {/* Actions Menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1">
                  Actions
                  <ChevronDown className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setAddDialogOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Override
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleCopyDefaults} disabled={copyPending}>
                  {copyPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Copy className="mr-2 h-4 w-4" />
                  )}
                  Copy Defaults to Overrides
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => setResetDialogOpen(true)}
                  disabled={stats.overridesCount === 0}
                  className="text-destructive focus:text-destructive"
                >
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Reset to Defaults
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Mapping Config Info - always visible when disabled */}
        {config && !config.enabled && !isLoading && selectedActionId && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
            <div className="text-sm">
              <p className="font-medium text-amber-600 dark:text-amber-400">
                Mapping is disabled for this action
              </p>
              <p className="text-muted-foreground">
                Enable mapping in the action settings for these mappings to take effect.
              </p>
            </div>
          </div>
        )}

        {/* Content area */}
        {!selectedActionId ? (
          <div className="py-12 text-center">
            <p className="text-sm text-muted-foreground">Select an action to view its mappings</p>
          </div>
        ) : isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : mappings.length === 0 &&
          unconfiguredOutputFields.length === 0 &&
          unconfiguredInputFields.length === 0 ? (
          <div className="py-12 text-center">
            <Layers className="mx-auto mb-3 h-8 w-8 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">No mappings configured for this action</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Mappings transform data between your app and the external API
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={() => setAddDialogOpen(true)}
            >
              <Plus className="mr-2 h-4 w-4" />
              Add First Override
            </Button>
          </div>
        ) : (
          <>
            {/* Mappings Table - always show if there are mappings */}
            {mappings.length > 0 && (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="w-20">Type</TableHead>
                      <TableHead>Source Path</TableHead>
                      <TableHead className="w-8"></TableHead>
                      <TableHead>Target Path</TableHead>
                      <TableHead className="w-24">Transform</TableHead>
                      <TableHead className="w-24">Source</TableHead>
                      <TableHead className="w-16"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {mappings.map((rm, idx) => (
                      <MappingTableRow
                        key={rm.mapping.id ?? `mapping-${idx}`}
                        resolvedMapping={rm}
                        connectionId={connectionId}
                        actionId={selectedActionId}
                        onDeleted={() => refetch()}
                      />
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {/* Schema Fields Section - show when there are unconfigured fields */}
            {(unconfiguredOutputFields.length > 0 ||
              unconfiguredInputFields.length > 0 ||
              (isOutputArray && !hasRootOutputMapping) ||
              (isInputArray && !hasRootInputMapping)) &&
              (showSchemaFields || mappings.length === 0) && (
                <SchemaFieldsSection
                  connectionId={connectionId}
                  actionId={selectedActionId}
                  outputFields={unconfiguredOutputFields}
                  inputFields={unconfiguredInputFields}
                  isOutputArray={isOutputArray}
                  isInputArray={isInputArray}
                  hasRootOutputMapping={hasRootOutputMapping}
                  hasRootInputMapping={hasRootInputMapping}
                  onMappingCreated={() => refetch()}
                  collapsible={mappings.length > 0}
                  onDismiss={mappings.length > 0 ? () => setShowSchemaFields(false) : undefined}
                />
              )}
          </>
        )}
      </CardContent>

      {/* Dialogs */}
      {selectedActionId && (
        <>
          <OverrideMappingDialog
            open={addDialogOpen}
            onOpenChange={setAddDialogOpen}
            connectionId={connectionId}
            actionId={selectedActionId}
            onCreated={() => refetch()}
          />
          <ResetMappingsDialog
            open={resetDialogOpen}
            onOpenChange={setResetDialogOpen}
            connectionId={connectionId}
            actionId={selectedActionId}
            overrideCount={stats?.overridesCount ?? 0}
            onReset={() => refetch()}
          />
        </>
      )}
    </Card>
  );
}

/**
 * Schema fields section showing available fields from the action's schema
 */
interface SchemaFieldsSectionProps {
  connectionId: string;
  actionId: string;
  outputFields: SchemaFieldInfo[];
  inputFields: SchemaFieldInfo[];
  isOutputArray?: boolean;
  isInputArray?: boolean;
  hasRootOutputMapping?: boolean;
  hasRootInputMapping?: boolean;
  onMappingCreated?: () => void;
  collapsible?: boolean;
  onDismiss?: () => void;
}

function SchemaFieldsSection({
  connectionId,
  actionId,
  outputFields,
  inputFields,
  isOutputArray = false,
  isInputArray = false,
  hasRootOutputMapping = false,
  hasRootInputMapping = false,
  onMappingCreated,
  collapsible,
  onDismiss,
}: SchemaFieldsSectionProps) {
  const [expandedOutput, setExpandedOutput] = useState(true);
  const [expandedInput, setExpandedInput] = useState(false);

  const hasOutputFields = outputFields.length > 0 || (isOutputArray && !hasRootOutputMapping);
  const hasInputFields = inputFields.length > 0 || (isInputArray && !hasRootInputMapping);

  if (!hasOutputFields && !hasInputFields) {
    return null;
  }

  // Calculate total field count including root array options
  const totalFields =
    outputFields.length +
    inputFields.length +
    (isOutputArray && !hasRootOutputMapping ? 1 : 0) +
    (isInputArray && !hasRootInputMapping ? 1 : 0);

  return (
    <div className="space-y-4 rounded-lg border border-dashed border-violet-500/30 bg-violet-500/5 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-violet-500" />
          <span className="text-sm font-medium">Available Fields from Schema</span>
          <Badge variant="secondary" className="text-xs">
            {totalFields} fields
          </Badge>
        </div>
        {collapsible && onDismiss && (
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onDismiss}>
            Hide
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        These fields are available in the action schema. Add a target path to create a mapping.
      </p>

      {/* Output Fields */}
      {hasOutputFields && (
        <div className="space-y-2">
          <button
            type="button"
            className="flex w-full items-center gap-2 text-left text-sm font-medium text-muted-foreground hover:text-foreground"
            onClick={() => setExpandedOutput(!expandedOutput)}
          >
            <ChevronDown
              className={`h-4 w-4 transition-transform ${expandedOutput ? '' : '-rotate-90'}`}
            />
            Output Fields (API → App)
            <Badge variant="outline" className="ml-auto text-xs">
              {outputFields.length + (isOutputArray && !hasRootOutputMapping ? 1 : 0)}
            </Badge>
          </button>
          {expandedOutput && (
            <div className="space-y-1 pl-6">
              {/* Root array mapping option */}
              {isOutputArray && !hasRootOutputMapping && (
                <RootMappingRow
                  label="Entire response (array)"
                  path="$"
                  type="array"
                  direction="output"
                  connectionId={connectionId}
                  actionId={actionId}
                  onCreated={onMappingCreated}
                />
              )}
              {outputFields.map((field) => (
                <SchemaFieldRow
                  key={field.path}
                  field={field}
                  direction="output"
                  connectionId={connectionId}
                  actionId={actionId}
                  onCreated={onMappingCreated}
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
            onClick={() => setExpandedInput(!expandedInput)}
          >
            <ChevronDown
              className={`h-4 w-4 transition-transform ${expandedInput ? '' : '-rotate-90'}`}
            />
            Input Fields (App → API)
            <Badge variant="outline" className="ml-auto text-xs">
              {inputFields.length + (isInputArray && !hasRootInputMapping ? 1 : 0)}
            </Badge>
          </button>
          {expandedInput && (
            <div className="space-y-1 pl-6">
              {/* Root array mapping option */}
              {isInputArray && !hasRootInputMapping && (
                <RootMappingRow
                  label="Entire request (array)"
                  path="$"
                  type="array"
                  direction="input"
                  connectionId={connectionId}
                  actionId={actionId}
                  onCreated={onMappingCreated}
                />
              )}
              {inputFields.map((field) => (
                <SchemaFieldRow
                  key={field.path}
                  field={field}
                  direction="input"
                  connectionId={connectionId}
                  actionId={actionId}
                  onCreated={onMappingCreated}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Root mapping row for mapping entire array/object
 */
interface RootMappingRowProps {
  label: string;
  path: string;
  type: string;
  direction: 'input' | 'output';
  connectionId: string;
  actionId: string;
  onCreated?: () => void;
}

function RootMappingRow({
  label,
  path,
  type,
  direction,
  connectionId,
  actionId,
  onCreated,
}: RootMappingRowProps) {
  const [targetPath, setTargetPath] = useState('');
  const { mutateAsync: createOverride, isPending } = useCreateConnectionOverride(connectionId);

  const handleAdd = async () => {
    if (!targetPath.trim()) return;

    try {
      await createOverride({
        actionId,
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
      setTargetPath('');
      onCreated?.();
    } catch {
      // Error handled by hook
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

/**
 * Single schema field row with editable target path
 */
interface SchemaFieldRowProps {
  field: SchemaFieldInfo;
  direction: 'input' | 'output';
  connectionId: string;
  actionId: string;
  onCreated?: () => void;
}

function SchemaFieldRow({
  field,
  direction,
  connectionId,
  actionId,
  onCreated,
}: SchemaFieldRowProps) {
  const [targetPath, setTargetPath] = useState('');
  const { mutateAsync: createOverride, isPending } = useCreateConnectionOverride(connectionId);

  const handleAdd = async () => {
    if (!targetPath.trim()) return;

    try {
      await createOverride({
        actionId,
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
      setTargetPath('');
      onCreated?.();
    } catch {
      // Error handled by hook
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

      <ArrowRight className="h-3 w-3 flex-shrink-0 text-muted-foreground" />

      <Input
        value={targetPath}
        onChange={(e) => setTargetPath(e.target.value)}
        placeholder={`$.${field.name}`}
        className="h-7 flex-1 font-mono text-xs"
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

/**
 * Table row component for a single mapping
 */
interface MappingTableRowProps {
  resolvedMapping: ResolvedMapping;
  connectionId: string;
  actionId: string;
  onDeleted?: () => void;
}

function MappingTableRow({
  resolvedMapping,
  connectionId,
  actionId,
  onDeleted,
}: MappingTableRowProps) {
  const { mapping, source, overridden, defaultMapping } = resolvedMapping;
  const { mutateAsync: deleteOverride, isPending } = useDeleteConnectionOverride(connectionId);

  const coercionType = mapping.transformConfig?.coercion?.type;
  const isOverride = source === 'connection';

  const handleRevertToDefault = async () => {
    if (!mapping.id) return;
    try {
      await deleteOverride({ mappingId: mapping.id, actionId });
      onDeleted?.();
    } catch {
      // Error toast handled by hook
    }
  };

  return (
    <TableRow className="group">
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
        <MappingInheritanceBadge source={source} overridden={overridden} />
      </TableCell>
      <TableCell>
        {isOverride && (
          <div className="flex items-center justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            {overridden && defaultMapping && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-foreground"
                    onClick={handleRevertToDefault}
                    disabled={isPending}
                  >
                    {isPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <RotateCcw className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs">Revert to default</p>
                </TooltipContent>
              </Tooltip>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                  onClick={handleRevertToDefault}
                  disabled={isPending}
                >
                  {isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">Remove override</p>
              </TooltipContent>
            </Tooltip>
          </div>
        )}
      </TableCell>
    </TableRow>
  );
}
