'use client';

import * as React from 'react';
import { Search, Plus, Trash2, ArrowRight, Sparkles, GripVertical } from 'lucide-react';

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
import { useIntegrations } from '@/hooks';
import { useCompositeToolWizardStore } from '@/stores/compositeToolWizard.store';
import { cn } from '@/lib/utils';
import { apiClient } from '@/lib/api/client';
import type { ActionResponse } from '@/lib/modules/actions/action.schemas';

// =============================================================================
// Component
// =============================================================================

export function StepSelectOperations() {
  const { data, addOperation, removeOperation, goToStep, canProceed } =
    useCompositeToolWizardStore();

  // State for search and filtering
  const [search, setSearch] = React.useState('');
  const [selectedIntegrationId, setSelectedIntegrationId] = React.useState<string>('');
  const [actions, setActions] = React.useState<ActionResponse[]>([]);
  const [isLoadingActions, setIsLoadingActions] = React.useState(false);

  // Fetch integrations
  const { data: integrationsData, isLoading: isLoadingIntegrations } = useIntegrations();
  const integrations = integrationsData?.integrations ?? [];

  // Fetch actions when integration is selected
  React.useEffect(() => {
    if (!selectedIntegrationId) {
      setActions([]);
      return;
    }

    const fetchActions = async () => {
      setIsLoadingActions(true);
      try {
        const result = await apiClient.get<{
          actions: ActionResponse[];
          pagination: { cursor: string | null; hasMore: boolean; totalCount: number };
        }>(`/integrations/${selectedIntegrationId}/actions`, { limit: 100 });
        setActions(result.actions);
      } catch (error) {
        console.error('Failed to fetch actions:', error);
        setActions([]);
      } finally {
        setIsLoadingActions(false);
      }
    };

    fetchActions();
  }, [selectedIntegrationId]);

  // Filter actions by search
  const filteredActions = React.useMemo(() => {
    if (!search) return actions;
    const lowerSearch = search.toLowerCase();
    return actions.filter(
      (action) =>
        action.name.toLowerCase().includes(lowerSearch) ||
        action.slug.toLowerCase().includes(lowerSearch) ||
        action.description?.toLowerCase().includes(lowerSearch)
    );
  }, [actions, search]);

  // Check if action is already selected
  const isActionSelected = (actionId: string) => {
    return data.operations.some((op) => op.actionId === actionId);
  };

  // Handle adding an operation
  const handleAddOperation = (action: ActionResponse) => {
    const integration = integrations.find((i) => i.id === selectedIntegrationId);
    if (!integration) return;

    addOperation({
      actionId: action.id,
      integrationId: integration.id,
      integrationName: integration.name,
      actionName: action.name,
      actionSlug: action.slug,
      operationSlug: `${integration.slug}-${action.slug}`,
      displayName: `${integration.name}: ${action.name}`,
      priority: data.operations.length,
    });
  };

  // Handle continue
  const handleContinue = () => {
    goToStep('routing-mode');
  };

  return (
    <div className="space-y-6">
      {/* Search and filter */}
      <div className="flex flex-col gap-4 sm:flex-row">
        <Select value={selectedIntegrationId} onValueChange={setSelectedIntegrationId}>
          <SelectTrigger className="w-full sm:w-[200px]">
            <SelectValue placeholder="Select integration" />
          </SelectTrigger>
          <SelectContent>
            {isLoadingIntegrations ? (
              <SelectItem value="_loading" disabled>
                Loading...
              </SelectItem>
            ) : integrations.length === 0 ? (
              <SelectItem value="_empty" disabled>
                No integrations
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

        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search actions..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            disabled={!selectedIntegrationId}
          />
        </div>
      </div>

      {/* Selected operations */}
      {data.operations.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium">Selected Operations ({data.operations.length})</h3>
          <div className="space-y-2">
            {data.operations.map((operation, index) => (
              <Card key={operation.actionId} className="border-primary/20 bg-primary/5">
                <CardContent className="flex items-center gap-3 p-3">
                  <GripVertical className="h-4 w-4 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{operation.displayName}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {operation.operationSlug}
                    </p>
                  </div>
                  <Badge variant="secondary">{index + 1}</Badge>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={() => removeOperation(operation.actionId)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Available actions */}
      <div className="space-y-2">
        <h3 className="text-sm font-medium">
          {selectedIntegrationId ? 'Available Actions' : 'Select an integration to see actions'}
        </h3>

        {!selectedIntegrationId ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center">
            <Sparkles className="h-10 w-10 text-muted-foreground" />
            <p className="mt-2 text-sm text-muted-foreground">
              Choose an integration from the dropdown above to browse its actions.
            </p>
          </div>
        ) : isLoadingActions ? (
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
        ) : filteredActions.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center">
            <p className="text-sm text-muted-foreground">
              {search ? 'No actions match your search.' : 'No actions found for this integration.'}
            </p>
          </div>
        ) : (
          <div className="max-h-[300px] space-y-2 overflow-y-auto">
            {filteredActions.map((action) => {
              const selected = isActionSelected(action.id);
              return (
                <Card
                  key={action.id}
                  className={cn(
                    'transition-colors',
                    selected && 'border-primary/20 bg-primary/5 opacity-60'
                  )}
                >
                  <CardContent className="flex items-center gap-3 p-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted">
                      <Badge variant="outline" className="text-xs">
                        {action.httpMethod}
                      </Badge>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{action.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {action.description || action.endpointTemplate}
                      </p>
                    </div>
                    <Button
                      variant={selected ? 'secondary' : 'outline'}
                      size="sm"
                      onClick={() => !selected && handleAddOperation(action)}
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
