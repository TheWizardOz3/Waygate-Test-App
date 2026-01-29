'use client';

import { useState, useEffect, useMemo } from 'react';
import { Plus, Plug } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { useConnections, useIntegration } from '@/hooks';
import { ConnectionSelector } from './ConnectionSelector';
import { ConnectionDetailInline, ConnectionDetailInlineSkeleton } from './ConnectionDetailInline';
import { CreateConnectionDialog } from './CreateConnectionDialog';
import type { IntegrationResponse } from '@/lib/modules/integrations/integration.schemas';

interface ConnectionListProps {
  integrationId: string;
  /** Pass integration to avoid redundant fetch - if not provided, will be fetched */
  integration?: IntegrationResponse;
}

/**
 * Connections management view with inline connection details.
 * Shows a connection selector at the top and full config inline below.
 */
export function ConnectionList({
  integrationId,
  integration: integrationProp,
}: ConnectionListProps) {
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);

  // Only fetch integration if not passed as prop (avoids redundant queries)
  const { data: fetchedIntegration } = useIntegration(integrationProp ? undefined : integrationId);
  const integration = integrationProp ?? fetchedIntegration;
  const { data, isLoading, isError, refetch } = useConnections(integrationId);

  const connections = useMemo(() => data?.connections ?? [], [data?.connections]);

  // Auto-select primary connection or first connection when connections load
  useEffect(() => {
    if (connections.length > 0 && !selectedConnectionId) {
      // Prefer primary connection, otherwise select first
      const primaryConnection = connections.find((c) => c.isPrimary);
      setSelectedConnectionId(primaryConnection?.id ?? connections[0].id);
    }
  }, [connections, selectedConnectionId]);

  // Clear selection if selected connection is deleted
  useEffect(() => {
    if (selectedConnectionId && connections.length > 0) {
      const stillExists = connections.some((c) => c.id === selectedConnectionId);
      if (!stillExists) {
        // Select another connection
        const primaryConnection = connections.find((c) => c.isPrimary);
        setSelectedConnectionId(primaryConnection?.id ?? connections[0]?.id ?? null);
      }
    } else if (connections.length === 0) {
      setSelectedConnectionId(null);
    }
  }, [connections, selectedConnectionId]);

  const handleConnectionCreated = () => {
    // Refetch to get the new connection, then it will be auto-selected
    refetch();
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        {/* Selector skeleton */}
        <div className="flex items-center justify-between">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-9 w-32" />
        </div>
        {/* Detail skeleton */}
        <ConnectionDetailInlineSkeleton />
      </div>
    );
  }

  if (isError) {
    return (
      <EmptyState
        icon={Plug}
        title="Failed to load connections"
        description="There was an error loading the connections. Please try again."
      />
    );
  }

  // Empty state - no connections yet
  if (connections.length === 0) {
    return (
      <div className="space-y-4">
        <EmptyState
          icon={Plug}
          title="No connections"
          description="Create a connection to link a consuming app with this integration. Each connection can have its own credentials and configuration."
          action={{
            label: 'Create Connection',
            onClick: () => setCreateDialogOpen(true),
          }}
        />

        {/* Create Dialog */}
        <CreateConnectionDialog
          integrationId={integrationId}
          open={createDialogOpen}
          onOpenChange={setCreateDialogOpen}
          onSuccess={handleConnectionCreated}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with connection selector and add button */}
      <div className="flex items-center justify-between gap-4">
        <ConnectionSelector
          connections={connections}
          selectedConnectionId={selectedConnectionId}
          onSelect={setSelectedConnectionId}
          onAddConnection={() => setCreateDialogOpen(true)}
        />
        <Button onClick={() => setCreateDialogOpen(true)} variant="outline">
          <Plus className="mr-2 h-4 w-4" />
          Add Connection
        </Button>
      </div>

      {/* Inline connection detail */}
      {selectedConnectionId && integration && (
        <ConnectionDetailInline
          connectionId={selectedConnectionId}
          integration={integration}
          onDeleted={() => refetch()}
        />
      )}

      {/* Create Dialog */}
      <CreateConnectionDialog
        integrationId={integrationId}
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onSuccess={handleConnectionCreated}
      />
    </div>
  );
}
