'use client';

import { MessageSquare, Plug } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PreambleTemplateInput } from '@/components/features/connections/mappings';

interface IntegrationLLMResponseTabProps {
  integrationId: string;
  connectionId: string | null;
  integrationName: string;
  integrationSlug: string;
}

/**
 * LLM Response tab - configures the preamble template for LLM responses
 */
export function IntegrationLLMResponseTab({
  integrationId,
  connectionId,
  integrationName,
  integrationSlug,
}: IntegrationLLMResponseTabProps) {
  if (!connectionId) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-muted-foreground" />
            <CardTitle>LLM Response Format</CardTitle>
          </div>
          <CardDescription>
            Customize how responses are formatted for LLM consumption
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="py-12 text-center">
            <Plug className="mx-auto mb-3 h-8 w-8 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">No connection selected</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Select a connection above to configure LLM response format
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <PreambleTemplateInput
      connectionId={connectionId}
      integrationId={integrationId}
      integrationName={integrationName}
      integrationSlug={integrationSlug}
    />
  );
}
