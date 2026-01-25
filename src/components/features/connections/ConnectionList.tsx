'use client';

import { useState } from 'react';
import { Plus, Plug } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import {
  useConnections,
  useConnectConnection,
  useDisconnectConnection,
  useDeleteConnection,
  useIntegration,
} from '@/hooks';
import { ConnectionCard, ConnectionCardSkeleton } from './ConnectionCard';
import { ConnectionDetail } from './ConnectionDetail';
import { ConnectionInfoBanner } from './ConnectionInfoBanner';
import { CreateConnectionDialog } from './CreateConnectionDialog';
import { DeleteConnectionDialog } from './DeleteConnectionDialog';
import { toast } from 'sonner';

interface ConnectionListProps {
  integrationId: string;
}

/**
 * List of connections for an integration.
 * Shows connection cards with status and quick actions.
 */
export function ConnectionList({ integrationId }: ConnectionListProps) {
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [connectionToDelete, setConnectionToDelete] = useState<string | null>(null);
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);

  const { data: integration } = useIntegration(integrationId);
  const { data, isLoading, isError, refetch } = useConnections(integrationId);
  const connectMutation = useConnectConnection(integrationId);
  const disconnectMutation = useDisconnectConnection(integrationId);
  const deleteMutation = useDeleteConnection(integrationId);

  const handleConnect = async (connectionId: string) => {
    try {
      const result = await connectMutation.mutateAsync(connectionId);
      // Redirect to OAuth provider
      if (result.authorizationUrl) {
        window.location.href = result.authorizationUrl;
      }
    } catch (error) {
      toast.error('Failed to initiate connection', {
        description: error instanceof Error ? error.message : 'Please try again',
      });
    }
  };

  const handleDisconnect = async (connectionId: string) => {
    try {
      await disconnectMutation.mutateAsync(connectionId);
      toast.success('Connection disconnected');
    } catch (error) {
      toast.error('Failed to disconnect', {
        description: error instanceof Error ? error.message : 'Please try again',
      });
    }
  };

  const handleDeleteClick = (connectionId: string) => {
    setConnectionToDelete(connectionId);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!connectionToDelete) return;

    try {
      await deleteMutation.mutateAsync(connectionToDelete);
      toast.success('Connection deleted');
      setDeleteDialogOpen(false);
      setConnectionToDelete(null);
    } catch (error) {
      toast.error('Failed to delete connection', {
        description: error instanceof Error ? error.message : 'Please try again',
      });
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="h-8 w-48 animate-pulse rounded bg-muted" />
          <div className="h-9 w-32 animate-pulse rounded bg-muted" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <ConnectionCardSkeleton key={i} />
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

  const connections = data?.connections ?? [];

  return (
    <div className="space-y-4">
      {/* Info Banner for single/default connection */}
      <ConnectionInfoBanner connectionCount={connections.length} />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Connections</h3>
          <p className="text-sm text-muted-foreground">
            {connections.length === 0
              ? 'No connections yet'
              : `${connections.length} connection${connections.length === 1 ? '' : 's'}`}
          </p>
        </div>
        <Button onClick={() => setCreateDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add Connection
        </Button>
      </div>

      {/* Empty State */}
      {connections.length === 0 ? (
        <EmptyState
          icon={Plug}
          title="No connections"
          description="Create a connection to link a consuming app with this integration."
          action={{
            label: 'Create Connection',
            onClick: () => setCreateDialogOpen(true),
          }}
        />
      ) : (
        /* Connection Grid */
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {connections.map((connection) => (
            <ConnectionCard
              key={connection.id}
              connection={connection}
              onConnect={handleConnect}
              onDisconnect={handleDisconnect}
              onDelete={handleDeleteClick}
              onSelect={setSelectedConnectionId}
            />
          ))}
        </div>
      )}

      {/* Create Dialog */}
      <CreateConnectionDialog
        integrationId={integrationId}
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
      />

      {/* Delete Confirmation Dialog */}
      <DeleteConnectionDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={handleDeleteConfirm}
        isDeleting={deleteMutation.isPending}
      />

      {/* Connection Detail Panel */}
      {selectedConnectionId && integration && (
        <ConnectionDetail
          connectionId={selectedConnectionId}
          integration={integration}
          onClose={() => setSelectedConnectionId(null)}
          onDeleted={() => refetch()}
        />
      )}
    </div>
  );
}
