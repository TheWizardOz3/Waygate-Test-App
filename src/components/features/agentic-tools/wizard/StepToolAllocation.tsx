'use client';

import * as React from 'react';
import { Search, Plus, X, Pencil, Sparkles, GripVertical, Layers, Bot, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { useIntegrations } from '@/hooks';
import { useAgenticToolWizardStore, type SelectedToolMeta } from '@/stores/agenticToolWizard.store';
import { cn } from '@/lib/utils';
import { apiClient } from '@/lib/api/client';
import type { UnifiedToolResponse, ToolType } from '@/lib/modules/tools';
import type { AvailableTool } from '@/lib/modules/agentic-tools/agentic-tool.schemas';

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get icon for tool type
 */
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

/**
 * Get badge variant for tool type
 */
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

// =============================================================================
// Component
// =============================================================================

export function StepToolAllocation() {
  const {
    data,
    addTargetAction,
    removeTargetAction,
    addAvailableTool,
    removeAvailableTool,
    updateAvailableTool,
    canProceed,
    getNextStep,
    goToStep,
  } = useAgenticToolWizardStore();

  // State for search and filtering
  const [search, setSearch] = React.useState('');
  const [selectedIntegrationId, setSelectedIntegrationId] = React.useState<string>('all');
  const [selectedToolType, setSelectedToolType] = React.useState<'all' | ToolType>('all');
  const [tools, setTools] = React.useState<UnifiedToolResponse[]>([]);
  const [isLoadingTools, setIsLoadingTools] = React.useState(false);

  // State for tool description editing
  const [editingTool, setEditingTool] = React.useState<AvailableTool | null>(null);
  const [toolDescription, setToolDescription] = React.useState('');

  // Fetch integrations for filter dropdown
  const { data: integrationsData, isLoading: isLoadingIntegrations } = useIntegrations();
  const integrations = integrationsData?.integrations ?? [];

  const isParameterInterpreter = data.executionMode === 'parameter_interpreter';

  // Build exclude list from already selected tools
  const excludeIds = React.useMemo(() => {
    if (isParameterInterpreter) {
      return data.targetActions.map((a) => a.actionId);
    }
    return data.availableTools.map((t) => t.actionId);
  }, [isParameterInterpreter, data.targetActions, data.availableTools]);

  // Fetch tools from unified endpoint
  React.useEffect(() => {
    const fetchTools = async () => {
      setIsLoadingTools(true);
      try {
        const params: Record<string, string> = {
          limit: '100',
          status: 'active,draft',
        };

        // Apply type filter
        if (selectedToolType !== 'all') {
          params.types = selectedToolType;
        }

        // Apply integration filter (only for simple tools)
        if (selectedIntegrationId !== 'all') {
          params.integrationId = selectedIntegrationId;
          params.types = 'simple';
        }

        // Apply search
        if (search) {
          params.search = search;
        }

        // Exclude already selected tools
        if (excludeIds.length > 0) {
          params.excludeIds = excludeIds.join(',');
        }

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
  }, [selectedIntegrationId, selectedToolType, search, excludeIds]);

  // Check if tool is already selected
  const isToolSelected = (toolId: string) => {
    if (isParameterInterpreter) {
      return data.targetActions.some((a) => a.actionId === toolId);
    }
    return data.availableTools.some((t) => t.actionId === toolId);
  };

  // Handle adding a tool
  const handleAddTool = (tool: UnifiedToolResponse) => {
    // Create unified metadata
    const meta: SelectedToolMeta = {
      toolId: tool.id,
      toolType: tool.type,
      toolSlug: tool.slug,
      toolName: tool.name,
      integrationId: tool.integrationId,
      integrationName: tool.integrationName,
      description: tool.description,
      inputSchema: tool.inputSchema,
      outputSchema: tool.outputSchema,
    };

    if (isParameterInterpreter) {
      addTargetAction(
        {
          actionId: tool.id,
          actionSlug: tool.slug,
        },
        meta
      );
    } else {
      addAvailableTool(
        {
          actionId: tool.id,
          actionSlug: tool.slug,
          description: tool.description || tool.name,
        },
        meta
      );
    }
  };

  // Handle removing a tool
  const handleRemoveTool = (toolId: string) => {
    if (isParameterInterpreter) {
      removeTargetAction(toolId);
    } else {
      removeAvailableTool(toolId);
    }
  };

  // Handle editing tool description
  const handleEditTool = (tool: AvailableTool) => {
    setEditingTool(tool);
    setToolDescription(tool.description);
  };

  const handleSaveEdit = () => {
    if (editingTool) {
      updateAvailableTool(editingTool.actionId, { description: toolDescription });
      setEditingTool(null);
      setToolDescription('');
    }
  };

  // Get display info for a tool from the store's metadata
  const getToolDisplayInfo = (toolId: string): SelectedToolMeta | undefined => {
    return data.selectedToolsMeta[toolId];
  };

  const handleNext = () => {
    const nextStep = getNextStep();
    if (nextStep && canProceed()) {
      goToStep(nextStep);
    }
  };

  return (
    <div className="space-y-6">
      {/* Mode explanation */}
      <div className="rounded-lg bg-muted/50 p-4">
        <p className="text-sm">
          {isParameterInterpreter ? (
            <>
              <span className="font-medium">Query Transformation Mode:</span> Select the tool(s)
              that the LLM will generate parameters for. The LLM won&apos;t choose which tool to
              execute - it will generate parameters for the specified tool(s).
            </>
          ) : (
            <>
              <span className="font-medium">Autonomous Agent Mode:</span> Select tools that the LLM
              can autonomously choose from and execute. The LLM will decide which tools to use and
              when. You can include simple tools, composite tools, or even other agentic tools.
            </>
          )}
        </p>
      </div>

      {/* Tool type tabs */}
      <Tabs
        value={selectedToolType}
        onValueChange={(v) => {
          setSelectedToolType(v as 'all' | ToolType);
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

      {/* Search and filter */}
      <div className="flex flex-col gap-4 sm:flex-row">
        {(selectedToolType === 'all' || selectedToolType === 'simple') && (
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

      {/* Selected tools */}
      {((isParameterInterpreter && data.targetActions.length > 0) ||
        (!isParameterInterpreter && data.availableTools.length > 0)) && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium">
            {isParameterInterpreter ? 'Target Tools' : 'Available Tools'} (
            {isParameterInterpreter ? data.targetActions.length : data.availableTools.length})
          </h3>
          <div className="space-y-2">
            {isParameterInterpreter
              ? data.targetActions.map((action) => {
                  const info = getToolDisplayInfo(action.actionId);
                  const TypeIcon = info ? getToolTypeIcon(info.toolType) : Wrench;
                  const badge = info
                    ? getToolTypeBadge(info.toolType)
                    : { label: 'Simple', variant: 'outline' as const };
                  return (
                    <Card key={action.actionId} className="border-primary/20 bg-primary/5">
                      <CardContent className="flex items-center gap-3 p-3">
                        <GripVertical className="h-4 w-4 text-muted-foreground" />
                        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted">
                          <TypeIcon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium">
                            {info
                              ? `${info.integrationName ? `${info.integrationName}: ` : ''}${info.toolName}`
                              : action.actionSlug}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {action.actionSlug}
                          </p>
                        </div>
                        <Badge variant={badge.variant}>{badge.label}</Badge>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          onClick={() => handleRemoveTool(action.actionId)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </CardContent>
                    </Card>
                  );
                })
              : data.availableTools.map((tool) => {
                  const info = getToolDisplayInfo(tool.actionId);
                  const TypeIcon = info ? getToolTypeIcon(info.toolType) : Wrench;
                  const badge = info
                    ? getToolTypeBadge(info.toolType)
                    : { label: 'Simple', variant: 'outline' as const };
                  return (
                    <Card key={tool.actionId} className="border-primary/20 bg-primary/5">
                      <CardContent className="flex items-center gap-3 p-3">
                        <GripVertical className="h-4 w-4 text-muted-foreground" />
                        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted">
                          <TypeIcon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium">
                            {info
                              ? `${info.integrationName ? `${info.integrationName}: ` : ''}${info.toolName}`
                              : tool.actionSlug}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {tool.description}
                          </p>
                        </div>
                        <Badge variant={badge.variant}>{badge.label}</Badge>
                        <Button variant="ghost" size="sm" onClick={() => handleEditTool(tool)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          onClick={() => handleRemoveTool(tool.actionId)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </CardContent>
                    </Card>
                  );
                })}
          </div>
        </div>
      )}

      {/* Available tools */}
      <div className="space-y-2">
        <h3 className="text-sm font-medium">Browse Tools</h3>

        {isLoadingTools ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Card key={i}>
                <CardContent className="flex items-center gap-3 p-3">
                  <Skeleton className="h-8 w-8 rounded-md" />
                  <div className="flex-1 space-y-1">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-48" />
                  </div>
                  <Skeleton className="h-8 w-8 rounded-md" />
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
          <div className="max-h-[300px] space-y-2 overflow-y-auto">
            {tools.map((tool) => {
              const selected = isToolSelected(tool.id);
              const TypeIcon = getToolTypeIcon(tool.type);
              const badge = getToolTypeBadge(tool.type);

              return (
                <Card
                  key={tool.id}
                  className={cn(
                    'transition-colors',
                    selected && 'border-primary/20 bg-primary/5 opacity-60'
                  )}
                >
                  <CardContent className="flex items-center gap-3 p-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted">
                      <TypeIcon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate font-medium">{tool.name}</p>
                        <Badge variant={badge.variant} className="text-xs">
                          {badge.label}
                        </Badge>
                      </div>
                      <p className="truncate text-xs text-muted-foreground">
                        {tool.integrationName ? `${tool.integrationName} · ` : ''}
                        {tool.description || tool.slug}
                      </p>
                    </div>
                    <Button
                      variant={selected ? 'secondary' : 'outline'}
                      size="sm"
                      onClick={() => !selected && handleAddTool(tool)}
                      disabled={selected}
                    >
                      {selected ? (
                        'Added'
                      ) : (
                        <>
                          <Plus className="mr-1 h-3 w-3" />
                          Add
                        </>
                      )}
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Edit tool description dialog */}
      {editingTool && (
        <Dialog open={!!editingTool} onOpenChange={() => setEditingTool(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Tool Description</DialogTitle>
              <DialogDescription>
                Update the description that helps the LLM understand when to use this tool.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-2">
              <Label>Tool Description</Label>
              <Textarea
                value={toolDescription}
                onChange={(e) => setToolDescription(e.target.value)}
                placeholder="Describe what this tool does and when the LLM should use it..."
                rows={3}
              />
            </div>

            <DialogFooter>
              <Button variant="ghost" onClick={() => setEditingTool(null)}>
                Cancel
              </Button>
              <Button onClick={handleSaveEdit}>Save</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between border-t pt-4">
        <p className="text-sm text-muted-foreground">
          {(isParameterInterpreter && data.targetActions.length < 1) ||
          (!isParameterInterpreter && data.availableTools.length < 1)
            ? 'Add at least 1 tool'
            : `${isParameterInterpreter ? data.targetActions.length : data.availableTools.length} tool${(isParameterInterpreter ? data.targetActions.length : data.availableTools.length) !== 1 ? 's' : ''} selected`}
        </p>
        <Button onClick={handleNext} disabled={!canProceed()}>
          Next
        </Button>
      </div>
    </div>
  );
}
