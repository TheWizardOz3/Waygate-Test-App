'use client';

import * as React from 'react';
import {
  Search,
  Plus,
  Trash2,
  ArrowRight,
  Sparkles,
  GripVertical,
  Layers,
  Bot,
  Wrench,
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
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useIntegrations } from '@/hooks';
import {
  useCompositeToolWizardStore,
  type SelectedOperation,
} from '@/stores/compositeToolWizard.store';
import { cn } from '@/lib/utils';
import { apiClient } from '@/lib/api/client';
import type { UnifiedToolResponse, ToolType } from '@/lib/modules/tools';

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

export function StepSelectOperations() {
  const { data, addOperation, removeOperation, goToStep, canProceed } =
    useCompositeToolWizardStore();

  // State for search and filtering
  const [search, setSearch] = React.useState('');
  const [selectedIntegrationId, setSelectedIntegrationId] = React.useState<string>('all');
  const [selectedToolType, setSelectedToolType] = React.useState<'all' | ToolType>('all');
  const [tools, setTools] = React.useState<UnifiedToolResponse[]>([]);
  const [isLoadingTools, setIsLoadingTools] = React.useState(false);

  // Fetch integrations for filter dropdown
  const { data: integrationsData, isLoading: isLoadingIntegrations } = useIntegrations();
  const integrations = integrationsData?.integrations ?? [];

  // Build exclude list - exclude the current composite tool if editing, and already selected tools
  const excludeIds = React.useMemo(() => {
    return data.operations.map((op) => op.toolId).filter(Boolean);
  }, [data.operations]);

  // Fetch tools from unified endpoint
  React.useEffect(() => {
    const fetchTools = async () => {
      setIsLoadingTools(true);
      try {
        const params: Record<string, string> = {
          limit: '100',
          status: 'active,draft', // Include draft tools for wizard
        };

        // Apply type filter
        if (selectedToolType !== 'all') {
          params.types = selectedToolType;
        }

        // Apply integration filter (only for simple tools)
        if (selectedIntegrationId !== 'all') {
          params.integrationId = selectedIntegrationId;
          params.types = 'simple'; // Integration filter only applies to simple tools
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
    return data.operations.some((op) => op.toolId === toolId || op.actionId === toolId);
  };

  // Handle adding an operation from a unified tool
  const handleAddOperation = (tool: UnifiedToolResponse) => {
    const operation: SelectedOperation = {
      toolId: tool.id,
      toolType: tool.type,
      toolName: tool.name,
      toolSlug: tool.slug,
      integrationId: tool.integrationId,
      integrationName: tool.integrationName,
      operationSlug: tool.integrationSlug ? `${tool.integrationSlug}-${tool.slug}` : tool.slug,
      displayName: tool.integrationName ? `${tool.integrationName}: ${tool.name}` : tool.name,
      priority: data.operations.length,
      inputSchema: tool.inputSchema,
      description: tool.description,
      // Legacy fields for backwards compatibility
      actionId: tool.type === 'simple' ? tool.id : undefined,
      actionSlug: tool.type === 'simple' ? tool.slug : undefined,
      actionName: tool.type === 'simple' ? tool.name : undefined,
    };

    addOperation(operation);
  };

  // Handle continue
  const handleContinue = () => {
    goToStep('name-description');
  };

  return (
    <div className="space-y-6">
      {/* Tool type tabs */}
      <Tabs
        value={selectedToolType}
        onValueChange={(v) => {
          setSelectedToolType(v as 'all' | ToolType);
          // Reset integration filter when switching to non-simple types
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

      {/* Selected operations */}
      {data.operations.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium">Selected Operations ({data.operations.length})</h3>
          <div className="space-y-2">
            {data.operations.map((operation, index) => {
              const TypeIcon = getToolTypeIcon(operation.toolType);
              const badge = getToolTypeBadge(operation.toolType);
              return (
                <Card
                  key={operation.toolId || operation.actionId}
                  className="border-primary/20 bg-primary/5"
                >
                  <CardContent className="flex items-center gap-3 p-3">
                    <GripVertical className="h-4 w-4 text-muted-foreground" />
                    <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted">
                      <TypeIcon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{operation.displayName}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {operation.operationSlug}
                      </p>
                    </div>
                    <Badge variant={badge.variant}>{badge.label}</Badge>
                    <Badge variant="secondary">{index + 1}</Badge>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={() => removeOperation(operation.toolId || operation.actionId || '')}
                    >
                      <Trash2 className="h-4 w-4" />
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
        <h3 className="text-sm font-medium">Available Tools</h3>

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
                      onClick={() => !selected && handleAddOperation(tool)}
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

      {/* Footer */}
      <div className="flex items-center justify-between border-t pt-4">
        <p className="text-sm text-muted-foreground">
          {data.operations.length < 2
            ? `Add at least ${2 - data.operations.length} more operation${data.operations.length === 1 ? '' : 's'}`
            : `${data.operations.length} operations selected`}
        </p>
        <Button onClick={handleContinue} disabled={!canProceed()} className="gap-2">
          Continue
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
