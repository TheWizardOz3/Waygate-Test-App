'use client';

import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle, LayoutDashboard, Zap, ScrollText } from 'lucide-react';
import { useIntegration } from '@/hooks';
import { IntegrationHeader } from './IntegrationHeader';
import { IntegrationOverview } from './IntegrationOverview';
import { IntegrationActionsTab } from './IntegrationActionsTab';
import { IntegrationLogsTab } from './IntegrationLogsTab';

interface IntegrationDetailProps {
  integrationId: string;
}

export function IntegrationDetail({ integrationId }: IntegrationDetailProps) {
  const [activeTab, setActiveTab] = useState('actions');
  const { data: integration, isLoading, isError, error } = useIntegration(integrationId);

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

  return (
    <div className="space-y-6">
      {/* Header with integration info and quick actions */}
      <IntegrationHeader integration={integration} />

      {/* Tabbed content */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="actions" className="gap-2">
            <Zap className="h-4 w-4" />
            Actions
          </TabsTrigger>
          <TabsTrigger value="overview" className="gap-2">
            <LayoutDashboard className="h-4 w-4" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="logs" className="gap-2">
            <ScrollText className="h-4 w-4" />
            Logs
          </TabsTrigger>
        </TabsList>

        <TabsContent value="actions" className="space-y-4">
          <IntegrationActionsTab integrationId={integrationId} />
        </TabsContent>

        <TabsContent value="overview" className="space-y-4">
          <IntegrationOverview integration={integration} />
        </TabsContent>

        <TabsContent value="logs" className="space-y-4">
          <IntegrationLogsTab integrationId={integrationId} />
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

      {/* Tabs skeleton */}
      <Skeleton className="h-10 w-80" />

      {/* Content skeleton */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
      </div>
    </div>
  );
}
