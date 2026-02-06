'use client';

import * as React from 'react';
import {
  Search,
  Trash2,
  Sparkles,
  GripVertical,
  Layers,
  Bot,
  Wrench,
  Loader2,
  Check,
  ChevronDown,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useIntegrations } from '@/hooks';
import { useUnifiedTools } from '@/hooks/useUnifiedTools';
import { useCreateOperation, useDeleteOperation } from '@/hooks/useCompositeTools';
import { apiClient } from '@/lib/api/client';
import { cn } from '@/lib/utils';
import type { UnifiedToolResponse, ToolType, ToolStatus } from '@/lib/modules/tools';
import type { CompositeToolDetailResponse } from '@/lib/modules/composite-tools/composite-tool.schemas';
import type { AgenticToolResponse } from '@/lib/modules/agentic-tools/agentic-tool.schemas';

// =============================================================================
// Types
// =============================================================================

interface ToolsActionsTabProps {
  tool: CompositeToolDetailResponse | AgenticToolResponse;
  toolType: 'composite' | 'agentic';
  onUpdate?: () => void;
}

interface SelectedToolInfo {
  id: string;
  name: string;
  slug: string;
  type: ToolType;
  integrationName?: string;
  description?: string;
}

// Tool type filter options
const TOOL_TYPE_OPTIONS = [
  { value: 'simple', label: 'Simple' },
  { value: 'composite', label: 'Composite' },
  { value: 'agentic', label: 'Agentic' },
] as const;

// Status filter options
const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'draft', label: 'Draft' },
] as const;

// =============================================================================
// Helper Functions
// =============================================================================

function getToolTypeIcon(type: ToolType) {
  switch (type) {
    case 'simple':
      return Wrench;
    case 'composite':
      return Layers;
    case 'agentic':
      return Bot;
    default:
      return Wrench;
  }
}

function getToolTypeBadge(type: ToolType): {
  label: string;
  variant: 'default' | 'secondary' | 'outline';
} {
  switch (type) {
    case 'simple':
      return { label: 'Simple', variant: 'outline' };
    case 'composite':
      return { label: 'Composite', variant: 'secondary' };
    case 'agentic':
      return { label: 'Agentic', variant: 'default' };
    default:
      return { label: type, variant: 'outline' };
  }
}

// Get the execution mode from an agentic tool
function getAgenticExecutionMode(
  tool: AgenticToolResponse
): 'parameter_interpreter' | 'autonomous_agent' {
  return tool.executionMode || 'parameter_interpreter';
}

// Check if we're in single-select mode (parameter interpreter for agentic tools)
function isSingleSelectMode(
  toolType: 'composite' | 'agentic',
  tool: AgenticToolResponse | CompositeToolDetailResponse
): boolean {
  if (toolType !== 'agentic') return false;
  const agenticTool = tool as AgenticToolResponse;
  return getAgenticExecutionMode(agenticTool) === 'parameter_interpreter';
}

// Get currently selected tools from the tool
function getSelectedTools(
  tool: CompositeToolDetailResponse | AgenticToolResponse,
  toolType: 'composite' | 'agentic'
): SelectedToolInfo[] {
  if (toolType === 'composite') {
    const compositeTool = tool as CompositeToolDetailResponse;
    return compositeTool.operations.map((op) => ({
      id: op.actionId,
      name: op.displayName,
      slug: op.operationSlug,
      type: 'simple' as ToolType, // Operations are simple tools
      integrationName: op.action?.integration?.name,
      description: undefined, // Description not available in operation response
    }));
  } else {
    const agenticTool = tool as AgenticToolResponse;
    const allocation = agenticTool.toolAllocation as {
      mode?: string;
      targetActions?: { actionId: string; actionSlug: string }[];
      availableTools?: { actionId: string; actionSlug: string; description: string }[];
    };

    if (allocation.mode === 'parameter_interpreter' && allocation.targetActions) {
      return allocation.targetActions.map((ta) => ({
        id: ta.actionId,
        name: ta.actionSlug,
        slug: ta.actionSlug,
        type: 'simple' as ToolType,
      }));
    } else if (allocation.availableTools) {
      return allocation.availableTools.map((at) => ({
        id: at.actionId,
        name: at.actionSlug,
        slug: at.actionSlug,
        type: 'simple' as ToolType,
        description: at.description,
      }));
    }
    return [];
  }
}

function getFilterSummary(
  selected: string[],
  options: readonly { value: string; label: string }[],
  allLabel: string
): string {
  if (selected.length === 0 || selected.length === options.length) {
    return allLabel;
  }
  if (selected.length === 1) {
    return options.find((o) => o.value === selected[0])?.label ?? selected[0];
  }
  return `${selected.length} selected`;
}

// =============================================================================
// Component
// =============================================================================

export function ToolsActionsTab({ tool, toolType, onUpdate }: ToolsActionsTabProps) {
  const singleSelect = isSingleSelectMode(toolType, tool);
  const existingSelections = React.useMemo(
    () => getSelectedTools(tool, toolType),
    [tool, toolType]
  );

  // State for search and filtering
  const [search, setSearch] = React.useState('');
  const [debouncedSearch, setDebouncedSearch] = React.useState('');
  const [typeFilters, setTypeFilters] = React.useState<ToolType[]>([
    'simple',
    'composite',
    'agentic',
  ]);
  const [statusFilters, setStatusFilters] = React.useState<ToolStatus[]>(['active', 'draft']);
  const [integrationFilters, setIntegrationFilters] = React.useState<string[]>([]);
  const [isSaving, setIsSaving] = React.useState(false);

  // Store full tool metadata for selected tools (needed for save even if filters change)
  const [selectedToolsMap, setSelectedToolsMap] = React.useState<Map<string, UnifiedToolResponse>>(
    new Map()
  );
  const pendingSelections = React.useMemo(
    () => new Set(selectedToolsMap.keys()),
    [selectedToolsMap]
  );

  // Debounced search
  React.useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Hooks for composite tool operations
  const createOperation = useCreateOperation(tool.id);
  const deleteOperation = useDeleteOperation(tool.id);

  // Fetch integrations for filter dropdown
  const { data: integrationsData, isLoading: isLoadingIntegrations } = useIntegrations({
    limit: 100,
  });
  const integrations = React.useMemo(() => {
    const list = integrationsData?.integrations ?? [];
    return [...list].sort((a, b) => a.name.localeCompare(b.name));
  }, [integrationsData?.integrations]);

  // Fetch tools using the unified hook
  const {
    data: toolsData,
    isLoading: isLoadingTools,
    error: toolsError,
  } = useUnifiedTools({
    search: debouncedSearch || undefined,
    types:
      typeFilters.length > 0 && typeFilters.length < TOOL_TYPE_OPTIONS.length
        ? typeFilters
        : undefined,
    status:
      statusFilters.length > 0 && statusFilters.length < STATUS_OPTIONS.length
        ? statusFilters
        : undefined,
    integrationId: integrationFilters.length === 1 ? integrationFilters[0] : undefined,
    excludeIds: [tool.id], // Exclude current tool to prevent circular references
  });

  // Get tools and filter by multiple integrations client-side
  const tools = React.useMemo(() => {
    let result = toolsData?.tools ?? [];

    // Filter by multiple integrations client-side
    if (integrationFilters.length > 1) {
      result = result.filter(
        (t) => t.integrationId && integrationFilters.includes(t.integrationId)
      );
    }

    return result;
  }, [toolsData?.tools, integrationFilters]);

  // Sync selected tools when tool data changes (after save or initial load)
  React.useEffect(() => {
    // Initialize from existing selections - we need to fetch full tool data for these
    const existingIds = new Set(existingSelections.map((s) => s.id));
    setSelectedToolsMap((prev) => {
      const next = new Map<string, UnifiedToolResponse>();
      // Keep existing selections that are still in the tool
      Array.from(prev.entries()).forEach(([id, tool]) => {
        if (existingIds.has(id)) {
          next.set(id, tool);
        }
      });
      // Add any existing selections we don't have metadata for yet
      // (will be populated when tools load and user sees them)
      return next;
    });
  }, [existingSelections]);

  // When tools load, populate metadata for existing selections we don't have yet
  React.useEffect(() => {
    if (!tools.length) return;
    const existingIds = new Set(existingSelections.map((s) => s.id));
    setSelectedToolsMap((prev) => {
      const next = new Map(prev);
      tools.forEach((tool) => {
        if (existingIds.has(tool.id) && !next.has(tool.id)) {
          next.set(tool.id, tool);
        }
      });
      return next;
    });
  }, [tools, existingSelections]);

  const isToolSelected = (toolId: string) => pendingSelections.has(toolId);

  const toggleToolSelection = (selectedTool: UnifiedToolResponse) => {
    setSelectedToolsMap((prev) => {
      const next = new Map(prev);
      if (next.has(selectedTool.id)) {
        next.delete(selectedTool.id);
      } else {
        if (singleSelect) {
          // In single-select mode, clear previous selection
          next.clear();
        }
        next.set(selectedTool.id, selectedTool);
      }
      return next;
    });
  };

  // Toggle helpers for multi-select filters
  const toggleTypeFilter = (value: ToolType) => {
    setTypeFilters((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]
    );
  };

  const toggleStatusFilter = (value: ToolStatus) => {
    setStatusFilters((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]
    );
  };

  const toggleIntegrationFilter = (id: string) => {
    setIntegrationFilters((prev) =>
      prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]
    );
  };

  // Check if there are unsaved changes
  const hasChanges = React.useMemo(() => {
    const existingIds = new Set(existingSelections.map((s) => s.id));
    const pendingIds = Array.from(pendingSelections);
    if (pendingIds.length !== existingIds.size) return true;
    return pendingIds.some((id) => !existingIds.has(id));
  }, [existingSelections, pendingSelections]);

  // Save changes
  const handleSave = async () => {
    setIsSaving(true);
    try {
      const existingIds = new Set(existingSelections.map((s) => s.id));
      const pendingIds = Array.from(pendingSelections);
      const toAdd = pendingIds.filter((id) => !existingIds.has(id));
      const toRemove = existingSelections.filter((s) => !pendingSelections.has(s.id));

      if (toolType === 'composite') {
        const compositeTool = tool as CompositeToolDetailResponse;

        // Remove operations
        for (const selection of toRemove) {
          const operation = compositeTool.operations.find((op) => op.actionId === selection.id);
          if (operation) {
            await deleteOperation.mutateAsync(operation.id);
          }
        }

        // Add new operations (use selectedToolsMap which has full tool info)
        for (const toolId of toAdd) {
          const toolToAdd = selectedToolsMap.get(toolId);
          if (toolToAdd) {
            await createOperation.mutateAsync({
              actionId: toolToAdd.id,
              operationSlug: toolToAdd.integrationSlug
                ? `${toolToAdd.integrationSlug}-${toolToAdd.slug}`
                : toolToAdd.slug,
              displayName: toolToAdd.integrationName
                ? `${toolToAdd.integrationName}: ${toolToAdd.name}`
                : toolToAdd.name,
              priority: compositeTool.operations.length + toAdd.indexOf(toolId),
              parameterMapping: {},
            });
          }
        }
      } else {
        // For agentic tools, update the toolAllocation
        const agenticTool = tool as AgenticToolResponse;
        const mode = getAgenticExecutionMode(agenticTool);

        // Get selected tools from the Map (has full metadata)
        const selectedToolsList = Array.from(selectedToolsMap.values());

        if (mode === 'parameter_interpreter') {
          await apiClient.patch(`/agentic-tools/${tool.id}`, {
            toolAllocation: {
              mode: 'parameter_interpreter',
              targetActions: selectedToolsList.map((t) => ({
                actionId: t.id,
                actionSlug: t.integrationSlug ? `${t.integrationSlug}/${t.slug}` : t.slug,
              })),
            },
          });
        } else {
          await apiClient.patch(`/agentic-tools/${tool.id}`, {
            toolAllocation: {
              mode: 'autonomous_agent',
              availableTools: selectedToolsList.map((t) => ({
                actionId: t.id,
                actionSlug: t.integrationSlug ? `${t.integrationSlug}/${t.slug}` : t.slug,
                description: t.description || t.name,
              })),
            },
          });
        }
      }

      onUpdate?.();
    } catch (error) {
      console.error('Failed to save tool selections:', error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-w-0 space-y-6 overflow-hidden">
      {/* Info alert for parameter interpreter mode */}
      {singleSelect && (
        <Alert>
          <AlertDescription>
            Parameter Interpreter mode allows only <strong>one target action</strong>. The embedded
            LLM will generate parameters for this action based on natural language input.
          </AlertDescription>
        </Alert>
      )}

      {/* Filters Bar */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="relative w-full sm:w-auto sm:max-w-xs sm:flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search tools..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Type Filter (Multi-select) */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="w-[140px] shrink-0 justify-between">
              <span className="truncate">
                {getFilterSummary(typeFilters, TOOL_TYPE_OPTIONS, 'All Types')}
              </span>
              <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-[160px]" align="start">
            {TOOL_TYPE_OPTIONS.map((option) => (
              <DropdownMenuCheckboxItem
                key={option.value}
                checked={typeFilters.includes(option.value as ToolType)}
                onCheckedChange={() => toggleTypeFilter(option.value as ToolType)}
                onSelect={(e) => e.preventDefault()}
              >
                {option.label}
              </DropdownMenuCheckboxItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setTypeFilters([])}>Clear All</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Status Filter (Multi-select) */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="w-[120px] shrink-0 justify-between">
              <span className="truncate">
                {getFilterSummary(statusFilters, STATUS_OPTIONS, 'All Status')}
              </span>
              <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-[140px]" align="start">
            {STATUS_OPTIONS.map((option) => (
              <DropdownMenuCheckboxItem
                key={option.value}
                checked={statusFilters.includes(option.value as ToolStatus)}
                onCheckedChange={() => toggleStatusFilter(option.value as ToolStatus)}
                onSelect={(e) => e.preventDefault()}
              >
                {option.label}
              </DropdownMenuCheckboxItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setStatusFilters([])}>Clear All</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Integration Filter (Multi-select) */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="w-[180px] shrink-0 justify-between">
              <span className="truncate">
                {integrationFilters.length === 0
                  ? 'All Integrations'
                  : integrationFilters.length === 1
                    ? (integrations.find((i) => i.id === integrationFilters[0])?.name ??
                      '1 selected')
                    : `${integrationFilters.length} selected`}
              </span>
              <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="max-h-[300px] w-[220px] overflow-y-auto" align="start">
            {isLoadingIntegrations ? (
              <DropdownMenuItem disabled>Loading...</DropdownMenuItem>
            ) : integrations.length === 0 ? (
              <DropdownMenuItem disabled>No integrations</DropdownMenuItem>
            ) : (
              integrations.map((integration) => (
                <DropdownMenuCheckboxItem
                  key={integration.id}
                  checked={integrationFilters.includes(integration.id)}
                  onCheckedChange={() => toggleIntegrationFilter(integration.id)}
                  onSelect={(e) => e.preventDefault()}
                >
                  {integration.name}
                </DropdownMenuCheckboxItem>
              ))
            )}
            {integrations.length > 0 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setIntegrationFilters([])}>
                  Clear All
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Selected tools summary */}
      {selectedToolsMap.size > 0 && (
        <Card className="min-w-0 overflow-hidden">
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <CardTitle className="text-base">
                  Selected {singleSelect ? 'Tool' : 'Tools'} ({selectedToolsMap.size})
                </CardTitle>
                <CardDescription>
                  {toolType === 'composite'
                    ? 'Operations that are part of this composite tool'
                    : singleSelect
                      ? 'The target action for parameter interpretation'
                      : 'Tools available for autonomous execution'}
                </CardDescription>
              </div>
              {hasChanges && (
                <Button onClick={handleSave} disabled={isSaving} size="sm">
                  {isSaving ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    'Save Changes'
                  )}
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {Array.from(selectedToolsMap.entries()).map(([id, selectedTool]) => {
              const existingTool = existingSelections.find((s) => s.id === id);

              // Get display info from selected tool or existing selection
              const name = selectedTool?.name || existingTool?.name || 'Unknown Tool';
              const slug = selectedTool?.slug || existingTool?.slug || id;
              const type = selectedTool?.type || existingTool?.type || ('simple' as ToolType);
              const TypeIcon = getToolTypeIcon(type);
              const badge = getToolTypeBadge(type);

              return (
                <div
                  key={id}
                  className="flex items-center gap-3 rounded-lg border bg-primary/5 p-2"
                >
                  <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted">
                    <TypeIcon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1 overflow-hidden">
                    <p className="truncate font-medium">{name}</p>
                    <p className="truncate text-xs text-muted-foreground">{slug}</p>
                  </div>
                  <Badge variant={badge.variant} className="shrink-0">
                    {badge.label}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={() => {
                      setSelectedToolsMap((prev) => {
                        const next = new Map(prev);
                        next.delete(id);
                        return next;
                      });
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Results Count */}
      {!isLoadingTools && tools.length > 0 && (
        <p className="text-sm text-muted-foreground">
          {tools.length} tool{tools.length !== 1 ? 's' : ''} available
        </p>
      )}

      {/* Available tools */}
      <div className="space-y-2 overflow-hidden">
        <h3 className="text-sm font-medium">Available Tools</h3>

        {toolsError ? (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-6 text-center">
            <p className="font-medium text-destructive">Failed to load tools</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {toolsError instanceof Error ? toolsError.message : 'An unknown error occurred'}
            </p>
          </div>
        ) : isLoadingTools ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Card key={i}>
                <CardContent className="flex items-center gap-3 p-3">
                  <Skeleton className="h-5 w-5" />
                  <Skeleton className="h-8 w-8 rounded-md" />
                  <div className="flex-1 space-y-1">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-48" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : tools.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center">
            <Sparkles className="h-10 w-10 text-muted-foreground" />
            <p className="mt-2 text-sm text-muted-foreground">
              {debouncedSearch
                ? 'No tools match your search.'
                : integrationFilters.length > 0
                  ? 'No tools found for selected integrations.'
                  : typeFilters.length === 0
                    ? 'Select at least one tool type to see available tools.'
                    : 'No tools available. Create some integrations first.'}
            </p>
          </div>
        ) : (
          <div className="max-h-[400px] space-y-2 overflow-y-auto overflow-x-hidden">
            {tools.map((availableTool) => {
              const selected = isToolSelected(availableTool.id);
              const TypeIcon = getToolTypeIcon(availableTool.type);
              const badge = getToolTypeBadge(availableTool.type);

              return (
                <Card
                  key={availableTool.id}
                  className={cn(
                    'cursor-pointer overflow-hidden transition-colors hover:bg-accent/50',
                    selected && 'border-primary bg-primary/5'
                  )}
                  onClick={() => toggleToolSelection(availableTool)}
                >
                  <CardContent className="flex items-center gap-3 p-3">
                    <Checkbox
                      checked={selected}
                      onCheckedChange={() => toggleToolSelection(availableTool)}
                      onClick={(e) => e.stopPropagation()}
                      className="shrink-0"
                    />
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted">
                      <TypeIcon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1 overflow-hidden">
                      <div className="flex items-center gap-2">
                        <p className="truncate font-medium">{availableTool.name}</p>
                        <Badge variant={badge.variant} className="shrink-0 text-xs">
                          {badge.label}
                        </Badge>
                      </div>
                      <p className="truncate text-xs text-muted-foreground">
                        {availableTool.integrationName ? `${availableTool.integrationName} · ` : ''}
                        {availableTool.description || availableTool.slug}
                      </p>
                    </div>
                    {selected && <Check className="h-4 w-4 shrink-0 text-primary" />}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
