'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { KeyRound, CheckCircle2, AlertTriangle, Pencil } from 'lucide-react';
import { useIntegrationConfig } from '@/hooks/useApps';
import { AppIntegrationConfigDialog } from '@/components/features/settings/AppIntegrationConfigDialog';
import type { ConnectionResponse } from '@/lib/modules/connections/connection.schemas';
import type { IntegrationResponse } from '@/lib/modules/integrations/integration.schemas';

interface ConnectionOAuthConfigSectionProps {
  connection: ConnectionResponse;
  integration: IntegrationResponse;
  onConfigChange?: () => void;
}

export function ConnectionOAuthConfigSection({
  connection,
  integration,
  onConfigChange,
}: ConnectionOAuthConfigSectionProps) {
  const [configDialogOpen, setConfigDialogOpen] = useState(false);

  const {
    data: config,
    isLoading,
    refetch,
  } = useIntegrationConfig(connection.appId ?? undefined, integration.id);

  const isConfigured = config && config.hasClientId && config.hasClientSecret;

  const handleConfigSuccess = () => {
    refetch();
    onConfigChange?.();
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-base">OAuth App Credentials</CardTitle>
            </div>
            {isConfigured && (
              <Button variant="ghost" size="sm" onClick={() => setConfigDialogOpen(true)}>
                <Pencil className="mr-1.5 h-3.5 w-3.5" />
                Edit
              </Button>
            )}
          </div>
          <CardDescription>
            Your registered OAuth app credentials for {integration.name}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isConfigured ? (
            <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                <span className="text-sm font-medium">Configured</span>
              </div>
              {config.scopes.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {config.scopes.map((scope) => (
                    <Badge
                      key={scope}
                      variant="secondary"
                      className="px-1.5 py-0 font-mono text-xs"
                    >
                      {scope}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3 rounded-lg border border-amber-500/20 bg-amber-500/5 p-4 text-center">
              <AlertTriangle className="mx-auto h-6 w-6 text-amber-500" />
              <div>
                <p className="text-sm font-medium">Setup Required</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Register your OAuth app credentials (Client ID &amp; Secret) to enable end-user
                  connections through your app.
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={() => setConfigDialogOpen(true)}>
                Configure OAuth App
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <AppIntegrationConfigDialog
        open={configDialogOpen}
        onOpenChange={setConfigDialogOpen}
        appId={connection.appId!}
        integrationId={integration.id}
        existingConfig={isConfigured ? config : null}
        onSuccess={handleConfigSuccess}
      />
    </>
  );
}
