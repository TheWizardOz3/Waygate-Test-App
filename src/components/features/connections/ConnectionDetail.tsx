'use client';

import { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  ArrowLeft,
  Edit2,
  Trash2,
  Star,
  Clock,
  Globe,
  Settings2,
  Plug,
  Activity,
  Zap,
} from 'lucide-react';
import { useConnection, useDeleteConnection, useLogs, useActions } from '@/hooks';
import { ConnectionStatusBadge } from './ConnectionStatusBadge';
import { ConnectionCredentialPanel } from './ConnectionCredentialPanel';
import { ConnectionOAuthConfigSection } from './ConnectionOAuthConfigSection';
import { ConnectionHealthSection } from './ConnectionHealthSection';
import { ConnectionMappingList, PreambleTemplateInput } from './mappings';
import { ConnectionVariablesSection } from './ConnectionVariablesSection';
import { ConnectorTypeBadge } from './ConnectorTypeBadge';
import { EditConnectionDialog } from './EditConnectionDialog';
import { DeleteConnectionDialog } from './DeleteConnectionDialog';
import { useApp } from '@/hooks/useApps';
import { toast } from 'sonner';
import type { IntegrationResponse } from '@/lib/modules/integrations/integration.schemas';
import { cn } from '@/lib/utils';

interface ConnectionDetailProps {
  connectionId: string;
  integration: IntegrationResponse;
  onClose: () => void;
  onDeleted?: () => void;
}

export function ConnectionDetail({
  connectionId,
  integration,
  onClose,
  onDeleted,
}: ConnectionDetailProps) {
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const { data: connection, isLoading, isError, refetch } = useConnection(connectionId);
  const deleteMutation = useDeleteConnection(integration.id);

  // Fetch associated app name for display
  const { data: appData } = useApp(connection?.appId ?? undefined);

  // Fetch actions for the mappings section
  const { data: actionsData } = useActions(integration.id);
  const actions = actionsData?.actions ?? [];

  // Get recent logs for this integration (connection-level filtering requires API update)
  // TODO: Add connectionId filter when API supports it
  const { data: logsData, isLoading: logsLoading } = useLogs({
    integrationId: integration.id,
    limit: 5,
  });

  const handleDelete = async () => {
    try {
      await deleteMutation.mutateAsync(connectionId);
      toast.success('Connection deleted');
      setDeleteDialogOpen(false);
      onDeleted?.();
      onClose();
    } catch (error) {
      toast.error('Failed to delete connection', {
        description: error instanceof Error ? error.message : 'Please try again',
      });
    }
  };

  if (isLoading) {
    return (
      <Sheet open onOpenChange={(open) => !open && onClose()}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-2xl lg:max-w-3xl">
          <SheetHeader>
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-64" />
          </SheetHeader>
          <div className="mt-6 space-y-6">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  if (isError || !connection) {
    return (
      <Sheet open onOpenChange={(open) => !open && onClose()}>
        <SheetContent className="w-full sm:max-w-2xl lg:max-w-3xl">
          <SheetHeader>
            <SheetTitle>Error</SheetTitle>
            <SheetDescription>Failed to load connection details.</SheetDescription>
          </SheetHeader>
          <div className="mt-6">
            <Button variant="outline" onClick={onClose}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Go Back
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  const createdAt = new Date(connection.createdAt);
  const updatedAt = new Date(connection.updatedAt);

  return (
    <>
      <Sheet open onOpenChange={(open) => !open && onClose()}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-2xl lg:max-w-3xl">
          <SheetHeader>
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <SheetTitle className="text-xl">{connection.name}</SheetTitle>
                  {connection.isPrimary && (
                    <Badge
                      variant="outline"
                      className="gap-1 border-amber-500/20 bg-amber-500/10 px-1.5 py-0 text-xs text-amber-600"
                    >
                      <Star className="h-2.5 w-2.5 fill-current" />
                      Primary
                    </Badge>
                  )}
                  <ConnectorTypeBadge type={connection.connectorType} size="sm" />
                </div>
                <SheetDescription className="font-mono text-xs">{connection.slug}</SheetDescription>
              </div>
              <ConnectionStatusBadge status={connection.status} />
            </div>
          </SheetHeader>

          <div className="mt-6 space-y-6">
            {/* Quick Actions */}
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditDialogOpen(true)}
                className="flex-1"
              >
                <Edit2 className="mr-2 h-4 w-4" />
                Edit
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDeleteDialogOpen(true)}
                className="flex-1 text-destructive hover:text-destructive"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </Button>
            </div>

            {/* OAuth App Config (only for OAuth2 integrations with an app) */}
            {integration.authType === 'oauth2' && connection.appId && (
              <ConnectionOAuthConfigSection
                connection={connection}
                integration={integration}
                onConfigChange={() => refetch()}
              />
            )}

            {/* Credentials Panel */}
            <ConnectionCredentialPanel
              connection={connection}
              integration={integration}
              onCredentialChange={() => refetch()}
            />

            {/* Health Status Section */}
            <ConnectionHealthSection connectionId={connection.id} />

            {/* Field Mappings Section */}
            {actions.length > 0 && (
              <ConnectionMappingList
                connectionId={connection.id}
                actions={actions.map((a) => ({
                  id: a.id,
                  name: a.name,
                  slug: a.slug,
                  inputSchema: a.inputSchema,
                  outputSchema: a.outputSchema,
                }))}
              />
            )}

            {/* LLM Response Preamble */}
            <PreambleTemplateInput
              connectionId={connection.id}
              integrationId={integration.id}
              integrationName={integration.name}
              integrationSlug={integration.slug}
            />

            {/* Connection Variables */}
            <ConnectionVariablesSection connectionId={connection.id} />

            {/* Configuration Card */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <Settings2 className="h-4 w-4 text-muted-foreground" />
                  <CardTitle className="text-base">Configuration</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Base URL */}
                {connection.baseUrl && (
                  <div className="space-y-1.5">
                    <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      <Globe className="h-3 w-3" />
                      Base URL
                    </p>
                    <p className="break-all rounded-md border bg-muted/30 px-3 py-2 font-mono text-sm">
                      {connection.baseUrl}
                    </p>
                  </div>
                )}

                {/* Connector Type */}
                <div className="space-y-1.5">
                  <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    {connection.connectorType === 'platform' ? (
                      <Zap className="h-3 w-3" />
                    ) : (
                      <Settings2 className="h-3 w-3" />
                    )}
                    Connector Type
                  </p>
                  <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2">
                    <ConnectorTypeBadge
                      type={connection.connectorType}
                      size="sm"
                      showIcon={false}
                    />
                    <span className="text-xs text-muted-foreground">
                      {connection.connectorType === 'platform'
                        ? "Using Waygate's verified OAuth app"
                        : 'Using your own OAuth credentials'}
                    </span>
                  </div>
                </div>

                {/* Associated App */}
                {connection.appId && appData && (
                  <div className="space-y-1.5">
                    <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      <Settings2 className="h-3 w-3" />
                      App
                    </p>
                    <p className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
                      {appData.name}
                    </p>
                  </div>
                )}

                {/* Connection ID */}
                <div className="space-y-1.5">
                  <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    <Plug className="h-3 w-3" />
                    Connection ID
                  </p>
                  <p className="break-all rounded-md border bg-muted/30 px-3 py-2 font-mono text-xs">
                    {connection.id}
                  </p>
                </div>

                {/* Timestamps */}
                <div className="grid grid-cols-2 gap-4 border-t pt-4">
                  <div className="space-y-1">
                    <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      Created
                    </p>
                    <p className="text-sm">{createdAt.toLocaleDateString()}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDistanceToNow(createdAt, { addSuffix: true })}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Last Updated
                    </p>
                    <p className="text-sm">{updatedAt.toLocaleDateString()}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDistanceToNow(updatedAt, { addSuffix: true })}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Recent Activity */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <Activity className="h-4 w-4 text-muted-foreground" />
                  <CardTitle className="text-base">Recent Activity</CardTitle>
                </div>
                <CardDescription>Latest API requests through this connection</CardDescription>
              </CardHeader>
              <CardContent>
                <RecentActivityList logs={logsData?.logs ?? []} loading={logsLoading} />
              </CardContent>
            </Card>
          </div>
        </SheetContent>
      </Sheet>

      {/* Edit Dialog */}
      <EditConnectionDialog
        connection={connection}
        integrationId={integration.id}
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        onSuccess={() => refetch()}
      />

      {/* Delete Dialog */}
      <DeleteConnectionDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={handleDelete}
        isDeleting={deleteMutation.isPending}
      />
    </>
  );
}

interface LogEntry {
  id: string;
  actionName?: string;
  actionSlug?: string;
  status: 'success' | 'error' | 'timeout';
  duration: number;
  timestamp: string;
}

function RecentActivityList({ logs, loading }: { logs: LogEntry[]; loading: boolean }) {
  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  if (logs.length === 0) {
    return (
      <div className="py-6 text-center text-muted-foreground">
        <Activity className="mx-auto mb-2 h-6 w-6 opacity-50" />
        <p className="text-sm">No recent activity</p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {logs.map((log) => {
        const timestamp = log.timestamp ? new Date(log.timestamp) : null;
        const isValidDate = timestamp && !isNaN(timestamp.getTime());

        return (
          <div
            key={log.id}
            className="flex items-center justify-between rounded-md px-2 py-2 hover:bg-muted/50"
          >
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  'h-2 w-2 rounded-full',
                  log.status === 'success' ? 'bg-emerald-500' : 'bg-red-500'
                )}
              />
              <span className="font-mono text-sm">
                {log.actionName || log.actionSlug || 'Unknown'}
              </span>
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="tabular-nums">{log.duration}ms</span>
              <span>{isValidDate ? formatDistanceToNow(timestamp, { addSuffix: true }) : '—'}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
