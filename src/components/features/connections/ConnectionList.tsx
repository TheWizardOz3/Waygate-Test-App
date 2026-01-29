'use client';

import { useState, useMemo } from 'react';
import { Plus, Plug } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { useConnections, useDeleteConnection, useIntegration } from '@/hooks';
import { ConnectionCard } from './ConnectionCard';
import { CreateConnectionDialog } from './CreateConnectionDialog';
import { EditConnectionDialog } from './EditConnectionDialog';
import { DeleteConnectionDialog } from './DeleteConnectionDialog';
import { toast } from 'sonner';
import type { IntegrationResponse } from '@/lib/modules/integrations/integration.schemas';
import type { ConnectionResponse } from '@/lib/modules/connections/connection.schemas';

interface ConnectionListProps {
  integrationId: string;
  /** Pass integration to avoid redundant fetch - if not provided, will be fetched */
  integration?: IntegrationResponse;
  /** Callback when a connection is selected */
  onConnectionSelect?: (connectionId: string) => void;
}

/**
 * Connections management view - shows a grid of connection cards.
 * Simplified to just list/add/edit/delete. Config is handled by other tabs.
 */
export function ConnectionList({
  integrationId,
  integration: integrationProp,
  onConnectionSelect,
}: ConnectionListProps) {
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedConnection, setSelectedConnection] = useState<ConnectionResponse | null>(null);

  // Only fetch integration if not passed as prop (avoids redundant queries)
  const { data: fetchedIntegration } = useIntegration(integrationProp ? undefined : integrationId);
  const integration = integrationProp ?? fetchedIntegration;
  const { data, isLoading, isError, refetch } = useConnections(integrationId);
  const deleteMutation = useDeleteConnection(integrationId);

  const connections = useMemo(() => data?.connections ?? [], [data?.connections]);

  const handleConnectionCreated = () => {
    refetch();
  };

  const handleEdit = (connection: ConnectionResponse) => {
    setSelectedConnection(connection);
    setEditDialogOpen(true);
  };

  const handleDeleteClick = (connection: ConnectionResponse) => {
    setSelectedConnection(connection);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!selectedConnection) return;

    try {
      await deleteMutation.mutateAsync(selectedConnection.id);
      toast.success('Connection deleted');
      setDeleteDialogOpen(false);
      setSelectedConnection(null);
    } catch (error) {
      toast.error('Failed to delete connection', {
        description: error instanceof Error ? error.message : 'Please try again',
      });
    }
  };

  const handleCardClick = (connection: ConnectionResponse) => {
    onConnectionSelect?.(connection.id);
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-9 w-36" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-lg" />
          ))}
        </div>
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
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-medium">
            {connections.length} Connection{connections.length !== 1 ? 's' : ''}
          </h3>
          <p className="text-sm text-muted-foreground">
            Manage connections for different apps or environments
          </p>
        </div>
        <Button onClick={() => setCreateDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add Connection
        </Button>
      </div>

      {/* Connection Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {connections.map((connection) => (
          <ConnectionCard
            key={connection.id}
            connection={connection}
            onSelect={() => handleCardClick(connection)}
            onEdit={() => handleEdit(connection)}
            onDelete={() => handleDeleteClick(connection)}
          />
        ))}
      </div>

      {/* Dialogs */}
      <CreateConnectionDialog
        integrationId={integrationId}
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onSuccess={handleConnectionCreated}
      />

      {selectedConnection && integration && (
        <EditConnectionDialog
          connection={selectedConnection}
          integrationId={integrationId}
          open={editDialogOpen}
          onOpenChange={setEditDialogOpen}
          onSuccess={() => {
            refetch();
            setSelectedConnection(null);
          }}
        />
      )}

      <DeleteConnectionDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={handleDeleteConfirm}
        isDeleting={deleteMutation.isPending}
      />
    </div>
  );
}
