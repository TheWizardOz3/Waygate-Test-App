'use client';

import { Plug } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { ConnectionMappingList } from '@/components/features/connections/mappings';
import { useActionSummaries } from '@/hooks';

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
  const { data: actionsData, isLoading } = useActionSummaries(integrationId);

  if (!connectionId) {
    return (
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Field Mappings</h2>
          <p className="text-sm text-muted-foreground">
            Customize how data is transformed between your app and the external API
          </p>
        </div>
        <Card>
          <CardContent className="pt-6">
            <div className="py-12 text-center">
              <Plug className="mx-auto mb-3 h-8 w-8 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">No connection selected</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Select a connection above to configure field mappings
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
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
      integrationId={integrationId}
      actions={actions.map((a) => ({
        id: a.id,
        name: a.name,
        slug: a.slug,
      }))}
    />
  );
}
