'use client';

import { GitBranch, Plug } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ConnectionMappingList } from '@/components/features/connections/mappings';
import { useActions } from '@/hooks';

interface IntegrationFieldMappingsTabProps {
  integrationId: string;
  connectionId: string | null;
}

/**
 * Field Mappings tab - shows connection-specific field mapping overrides
 */
export function IntegrationFieldMappingsTab({
  integrationId,
  connectionId,
}: IntegrationFieldMappingsTabProps) {
  const { data: actionsData, isLoading } = useActions(integrationId);

  if (!connectionId) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <GitBranch className="h-5 w-5 text-muted-foreground" />
            <CardTitle>Field Mappings</CardTitle>
          </div>
          <CardDescription>
            Customize how data is transformed between your app and the external API
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="py-12 text-center">
            <Plug className="mx-auto mb-3 h-8 w-8 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">No connection selected</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Select a connection above to configure field mappings
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="flex items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const actions = actionsData?.actions ?? [];

  return (
    <ConnectionMappingList
      connectionId={connectionId}
      actions={actions.map((a) => ({
        id: a.id,
        name: a.name,
        slug: a.slug,
        inputSchema: a.inputSchema,
        outputSchema: a.outputSchema,
      }))}
    />
  );
}
