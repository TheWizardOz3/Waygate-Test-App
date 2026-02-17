'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PlusCircle, Sparkles, Zap, FileText } from 'lucide-react';
import { ActionTable } from '@/components/features/actions/ActionTable';
import { IntegrationDocumentationTab } from './IntegrationDocumentationTab';
import type { IntegrationResponse } from '@/lib/modules/integrations/integration.schemas';

interface IntegrationActionsTabProps {
  integrationId: string;
  integration?: IntegrationResponse;
  selectedConnectionId?: string | null;
}

export function IntegrationActionsTab({
  integrationId,
  integration,
  selectedConnectionId,
}: IntegrationActionsTabProps) {
  const [activeSubTab, setActiveSubTab] = useState('actions');

  return (
    <Tabs value={activeSubTab} onValueChange={setActiveSubTab}>
      <TabsList>
        <TabsTrigger value="actions" className="gap-1.5">
          <Zap className="h-3.5 w-3.5" />
          Actions
        </TabsTrigger>
        <TabsTrigger value="documentation" className="gap-1.5">
          <FileText className="h-3.5 w-3.5" />
          Documentation
        </TabsTrigger>
      </TabsList>

      <TabsContent value="actions" className="mt-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Actions</h2>
            <p className="text-sm text-muted-foreground">
              Manage the API actions available for this integration
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <Link href={`/integrations/${integrationId}/actions/new`}>
                <Sparkles className="mr-2 h-4 w-4" />
                Discover More
              </Link>
            </Button>
            <Button asChild>
              <Link href={`/integrations/${integrationId}/actions/new/manual`}>
                <PlusCircle className="mr-2 h-4 w-4" />
                New Action
              </Link>
            </Button>
          </div>
        </div>
        <Card>
          <CardContent className="pt-6">
            <ActionTable
              integrationId={integrationId}
              integration={integration}
              selectedConnectionId={selectedConnectionId}
            />
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="documentation" className="mt-4">
        <IntegrationDocumentationTab integrationId={integrationId} integration={integration} />
      </TabsContent>
    </Tabs>
  );
}
