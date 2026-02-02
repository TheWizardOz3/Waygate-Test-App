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
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useIntegrations } from '@/hooks';
import { useCreateOperation, useDeleteOperation } from '@/hooks/useCompositeTools';
import { apiClient } from '@/lib/api/client';
import { cn } from '@/lib/utils';
import type { UnifiedToolResponse, ToolType } from '@/lib/modules/tools';
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
  const [selectedIntegrationId, setSelectedIntegrationId] = React.useState<string>('all');
  const [selectedToolTypeFilter, setSelectedToolTypeFilter] = React.useState<'all' | ToolType>(
    'all'
  );
  const [tools, setTools] = React.useState<UnifiedToolResponse[]>([]);
  const [isLoadingTools, setIsLoadingTools] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);
  const [pendingSelections, setPendingSelections] = React.useState<Set<string>>(
    new Set(existingSelections.map((s) => s.id))
  );

  // Hooks for composite tool operations
  const createOperation = useCreateOperation(tool.id);
  const deleteOperation = useDeleteOperation(tool.id);

  // Fetch integrations for filter dropdown
  const { data: integrationsData, isLoading: isLoadingIntegrations } = useIntegrations();
  const integrations = integrationsData?.integrations ?? [];

  // Fetch tools from unified endpoint
  React.useEffect(() => {
    const fetchTools = async () => {
      setIsLoadingTools(true);
      try {
        const params: Record<string, string> = {
          limit: '100',
          status: 'active,draft',
        };

        if (selectedToolTypeFilter !== 'all') {
          params.types = selectedToolTypeFilter;
        }

        if (selectedIntegrationId !== 'all') {
          params.integrationId = selectedIntegrationId;
          params.types = 'simple';
        }

        if (search) {
          params.search = search;
        }

        // Exclude the current tool to prevent circular references
        params.excludeIds = tool.id;

        const result = await apiClient.get<{
          tools: UnifiedToolResponse[];
          pagination: { cursor: string | null; hasMore: boolean; totalCount: number };
        }>('/tools', params);

        setTools(result.tools);
      } catch (error) {
        console.error('Failed to fetch tools:', error);
        setTools([]);
      } finally {
        setIsLoadingTools(false);
      }
    };

    fetchTools();
  }, [selectedIntegrationId, selectedToolTypeFilter, search, tool.id]);

  // Sync pending selections when tool changes
  React.useEffect(() => {
    setPendingSelections(new Set(existingSelections.map((s) => s.id)));
  }, [existingSelections]);

  const isToolSelected = (toolId: string) => pendingSelections.has(toolId);

  const toggleToolSelection = (selectedTool: UnifiedToolResponse) => {
    setPendingSelections((prev) => {
      const next = new Set(prev);
      if (next.has(selectedTool.id)) {
        next.delete(selectedTool.id);
      } else {
        if (singleSelect) {
          // In single-select mode, clear previous selection
          next.clear();
        }
        next.add(selectedTool.id);
      }
      return next;
    });
  };

  // Check if there are unsaved changes
  const hasChanges = React.useMemo(() => {
    const existingIds = new Set(existingSelections.map((s) => s.id));
    if (pendingSelections.size !== existingIds.size) return true;
    // Convert Set to array to avoid downlevelIteration issues
    const pendingArray = Array.from(pendingSelections);
    for (const id of pendingArray) {
      if (!existingIds.has(id)) return true;
    }
    return false;
  }, [existingSelections, pendingSelections]);

  // Save changes
  const handleSave = async () => {
    setIsSaving(true);
    try {
      const existingIds = new Set(existingSelections.map((s) => s.id));
      const pendingArray = Array.from(pendingSelections);
      const toAdd = pendingArray.filter((id) => !existingIds.has(id));
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

        // Add new operations
        for (const toolId of toAdd) {
          const toolToAdd = tools.find((t) => t.id === toolId);
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

        const selectedToolsList = Array.from(pendingSelections)
          .map((id) => tools.find((t) => t.id === id))
          .filter(Boolean) as UnifiedToolResponse[];

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
    <div className="space-y-6">
      {/* Info alert for parameter interpreter mode */}
      {singleSelect && (
        <Alert>
          <AlertDescription>
            Parameter Interpreter mode allows only <strong>one target action</strong>. The embedded
            LLM will generate parameters for this action based on natural language input.
          </AlertDescription>
        </Alert>
      )}

      {/* Tool type tabs */}
      <Tabs
        value={selectedToolTypeFilter}
        onValueChange={(v) => {
          setSelectedToolTypeFilter(v as 'all' | ToolType);
          if (v !== 'all' && v !== 'simple') {
            setSelectedIntegrationId('all');
          }
        }}
      >
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="all">All Tools</TabsTrigger>
          <TabsTrigger value="simple">
            <Wrench className="mr-1 h-3 w-3" />
            Simple
          </TabsTrigger>
          <TabsTrigger value="composite">
            <Layers className="mr-1 h-3 w-3" />
            Composite
          </TabsTrigger>
          <TabsTrigger value="agentic">
            <Bot className="mr-1 h-3 w-3" />
            Agentic
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Search and integration filter */}
      <div className="flex flex-col gap-4 sm:flex-row">
        {(selectedToolTypeFilter === 'all' || selectedToolTypeFilter === 'simple') && (
          <Select value={selectedIntegrationId} onValueChange={setSelectedIntegrationId}>
            <SelectTrigger className="w-full sm:w-[200px]">
              <SelectValue placeholder="All integrations" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All integrations</SelectItem>
              {isLoadingIntegrations ? (
                <SelectItem value="_loading" disabled>
                  Loading...
                </SelectItem>
              ) : (
                integrations.map((integration) => (
                  <SelectItem key={integration.id} value={integration.id}>
                    {integration.name}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        )}

        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search tools..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Selected tools summary */}
      {pendingSelections.size > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              Selected {singleSelect ? 'Tool' : 'Tools'} ({pendingSelections.size})
            </CardTitle>
            <CardDescription>
              {toolType === 'composite'
                ? 'Operations that are part of this composite tool'
                : singleSelect
                  ? 'The target action for parameter interpretation'
                  : 'Tools available for autonomous execution'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {Array.from(pendingSelections).map((id) => {
              const unifiedTool = tools.find((t) => t.id === id);
              const existingTool = existingSelections.find((s) => s.id === id);
              if (!unifiedTool && !existingTool) return null;

              // Get display info from unified tool or existing selection
              const name = unifiedTool?.name || existingTool?.name || '';
              const slug = unifiedTool?.slug || existingTool?.slug || '';
              const type = unifiedTool?.type || existingTool?.type || ('simple' as ToolType);
              const TypeIcon = getToolTypeIcon(type);
              const badge = getToolTypeBadge(type);

              return (
                <div
                  key={id}
                  className="flex items-center gap-3 rounded-lg border bg-primary/5 p-2"
                >
                  <GripVertical className="h-4 w-4 text-muted-foreground" />
                  <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted">
                    <TypeIcon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{name}</p>
                    <p className="truncate text-xs text-muted-foreground">{slug}</p>
                  </div>
                  <Badge variant={badge.variant}>{badge.label}</Badge>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={() => {
                      setPendingSelections((prev) => {
                        const next = new Set(prev);
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

      {/* Available tools */}
      <div className="space-y-2">
        <h3 className="text-sm font-medium">Available Tools</h3>

        {isLoadingTools ? (
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
              {search
                ? 'No tools match your search.'
                : selectedIntegrationId !== 'all'
                  ? 'No tools found for this integration.'
                  : 'No tools available. Create some integrations first.'}
            </p>
          </div>
        ) : (
          <div className="max-h-[400px] space-y-2 overflow-y-auto">
            {tools.map((availableTool) => {
              const selected = isToolSelected(availableTool.id);
              const TypeIcon = getToolTypeIcon(availableTool.type);
              const badge = getToolTypeBadge(availableTool.type);

              return (
                <Card
                  key={availableTool.id}
                  className={cn(
                    'cursor-pointer transition-colors hover:bg-accent/50',
                    selected && 'border-primary bg-primary/5'
                  )}
                  onClick={() => toggleToolSelection(availableTool)}
                >
                  <CardContent className="flex items-center gap-3 p-3">
                    <Checkbox
                      checked={selected}
                      onCheckedChange={() => toggleToolSelection(availableTool)}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted">
                      <TypeIcon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate font-medium">{availableTool.name}</p>
                        <Badge variant={badge.variant} className="text-xs">
                          {badge.label}
                        </Badge>
                      </div>
                      <p className="truncate text-xs text-muted-foreground">
                        {availableTool.integrationName ? `${availableTool.integrationName} · ` : ''}
                        {availableTool.description || availableTool.slug}
                      </p>
                    </div>
                    {selected && <Check className="h-4 w-4 text-primary" />}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Save button */}
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
