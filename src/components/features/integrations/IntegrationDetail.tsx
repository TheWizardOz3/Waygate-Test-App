'use client';

import { useState, useEffect, useMemo } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  AlertCircle,
  LayoutDashboard,
  Zap,
  ScrollText,
  Plug,
  GitBranch,
  Database,
  Sparkles,
  ShieldAlert,
  Wrench,
} from 'lucide-react';
import { useIntegration, useConnections } from '@/hooks';
import { IntegrationHeader } from './IntegrationHeader';
import { IntegrationOverview } from './IntegrationOverview';
import { IntegrationActionsTab } from './IntegrationActionsTab';
import { IntegrationLogsTab } from './IntegrationLogsTab';
import { IntegrationFieldMappingsTab } from './IntegrationFieldMappingsTab';
import { IntegrationReferenceDataTab } from './IntegrationReferenceDataTab';
import { IntegrationAIToolsTab } from './IntegrationAIToolsTab';
import { ConnectionList, ConnectionSelector } from '@/components/features/connections';
import { DriftReportsList } from '@/components/features/schema-drift/DriftReportsList';
import { DriftBadge } from '@/components/features/schema-drift/DriftBadge';
import { MaintenanceTab } from '@/components/features/auto-maintenance/MaintenanceTab';
import { MaintenanceBadge } from '@/components/features/auto-maintenance/MaintenanceBadge';

interface IntegrationDetailProps {
  integrationId: string;
}

export function IntegrationDetail({ integrationId }: IntegrationDetailProps) {
  const [activeTab, setActiveTab] = useState('actions');
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);

  const { data: integration, isLoading, isError, error } = useIntegration(integrationId);
  const { data: connectionsData, isLoading: connectionsLoading } = useConnections(integrationId);

  const connections = useMemo(
    () => connectionsData?.connections ?? [],
    [connectionsData?.connections]
  );

  // Auto-select primary connection or first connection when connections load
  useEffect(() => {
    if (connections.length > 0 && !selectedConnectionId) {
      const primaryConnection = connections.find((c) => c.isPrimary);
      setSelectedConnectionId(primaryConnection?.id ?? connections[0].id);
    }
  }, [connections, selectedConnectionId]);

  // Clear selection if selected connection is deleted
  useEffect(() => {
    if (selectedConnectionId && connections.length > 0) {
      const stillExists = connections.some((c) => c.id === selectedConnectionId);
      if (!stillExists) {
        const primaryConnection = connections.find((c) => c.isPrimary);
        setSelectedConnectionId(primaryConnection?.id ?? connections[0]?.id ?? null);
      }
    } else if (connections.length === 0) {
      setSelectedConnectionId(null);
    }
  }, [connections, selectedConnectionId]);

  if (isLoading) {
    return <IntegrationDetailSkeleton />;
  }

  if (isError || !integration) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Failed to load integration</AlertTitle>
        <AlertDescription>
          {error instanceof Error ? error.message : 'An unknown error occurred'}
        </AlertDescription>
      </Alert>
    );
  }

  const selectedConnection = connections.find((c) => c.id === selectedConnectionId);

  return (
    <div className="space-y-6">
      {/* Header with integration info and quick actions */}
      <IntegrationHeader integration={integration} />

      {/* Connection Selector - at integration level */}
      {!connectionsLoading && connections.length > 0 && (
        <div className="flex items-center gap-3 rounded-lg border bg-muted/30 p-3">
          <span className="text-sm font-medium text-muted-foreground">Active Connection:</span>
          <ConnectionSelector
            connections={connections}
            selectedConnectionId={selectedConnectionId}
            onSelect={setSelectedConnectionId}
            onAddConnection={() => setActiveTab('connections')}
          />
        </div>
      )}

      {/* Tabbed content */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="h-auto w-full justify-start rounded-none border-b bg-transparent p-0">
          <TabsTrigger
            value="actions"
            className="relative gap-2 rounded-none border-b-2 border-transparent px-4 pb-3 pt-2 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
          >
            <Zap className="h-4 w-4" />
            Actions
          </TabsTrigger>
          <TabsTrigger
            value="overview"
            className="relative gap-2 rounded-none border-b-2 border-transparent px-4 pb-3 pt-2 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
          >
            <LayoutDashboard className="h-4 w-4" />
            Overview
          </TabsTrigger>
          <TabsTrigger
            value="logs"
            className="relative gap-2 rounded-none border-b-2 border-transparent px-4 pb-3 pt-2 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
          >
            <ScrollText className="h-4 w-4" />
            Logs
          </TabsTrigger>
          <TabsTrigger
            value="mappings"
            className="relative gap-2 rounded-none border-b-2 border-transparent px-4 pb-3 pt-2 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
          >
            <GitBranch className="h-4 w-4" />
            Field Mappings
          </TabsTrigger>
          <TabsTrigger
            value="ai-tools"
            className="relative gap-2 rounded-none border-b-2 border-transparent px-4 pb-3 pt-2 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
          >
            <Sparkles className="h-4 w-4" />
            AI Tools
          </TabsTrigger>
          <TabsTrigger
            value="reference-data"
            className="relative gap-2 rounded-none border-b-2 border-transparent px-4 pb-3 pt-2 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
          >
            <Database className="h-4 w-4" />
            Reference Data
          </TabsTrigger>
          <TabsTrigger
            value="schema-drift"
            className="relative gap-2 rounded-none border-b-2 border-transparent px-4 pb-3 pt-2 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
          >
            <ShieldAlert className="h-4 w-4" />
            Schema Drift
            <DriftBadge integrationId={integrationId} className="ml-1" />
          </TabsTrigger>
          <TabsTrigger
            value="maintenance"
            className="relative gap-2 rounded-none border-b-2 border-transparent px-4 pb-3 pt-2 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
          >
            <Wrench className="h-4 w-4" />
            Maintenance
            <MaintenanceBadge integrationId={integrationId} className="ml-1" />
          </TabsTrigger>
          <TabsTrigger
            value="connections"
            className="relative gap-2 rounded-none border-b-2 border-transparent px-4 pb-3 pt-2 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
          >
            <Plug className="h-4 w-4" />
            Connections
          </TabsTrigger>
        </TabsList>

        <TabsContent value="actions" className="mt-6 space-y-4">
          <IntegrationActionsTab integrationId={integrationId} integration={integration} />
        </TabsContent>

        <TabsContent value="overview" className="mt-6 space-y-4">
          <IntegrationOverview integration={integration} selectedConnection={selectedConnection} />
        </TabsContent>

        <TabsContent value="logs" className="mt-6 space-y-4">
          <IntegrationLogsTab integrationId={integrationId} connectionId={selectedConnectionId} />
        </TabsContent>

        <TabsContent value="mappings" className="mt-6 space-y-4">
          <IntegrationFieldMappingsTab
            integrationId={integrationId}
            connectionId={selectedConnectionId}
          />
        </TabsContent>

        <TabsContent value="ai-tools" className="mt-6 space-y-4">
          <IntegrationAIToolsTab
            integrationId={integrationId}
            integrationName={integration.name}
            integrationSlug={integration.slug}
            connectionId={selectedConnectionId}
          />
        </TabsContent>

        <TabsContent value="reference-data" className="mt-6 space-y-4">
          <IntegrationReferenceDataTab
            integrationId={integrationId}
            connectionId={selectedConnectionId}
          />
        </TabsContent>

        <TabsContent value="schema-drift" className="mt-6 space-y-4">
          <DriftReportsList integrationId={integrationId} />
        </TabsContent>

        <TabsContent value="maintenance" className="mt-6 space-y-4">
          <MaintenanceTab integrationId={integrationId} />
        </TabsContent>

        <TabsContent value="connections" className="mt-6 space-y-4">
          <ConnectionList
            integrationId={integrationId}
            integration={integration}
            onConnectionSelect={setSelectedConnectionId}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function IntegrationDetailSkeleton() {
  return (
    <div className="space-y-6">
      {/* Header skeleton */}
      <div className="space-y-4">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-96" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-9 w-24" />
            <Skeleton className="h-9 w-24" />
          </div>
        </div>
      </div>

      {/* Connection selector skeleton */}
      <Skeleton className="h-12 w-80" />

      {/* Tabs skeleton */}
      <Skeleton className="h-10 w-full max-w-2xl" />

      {/* Content skeleton */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
      </div>
    </div>
  );
}
