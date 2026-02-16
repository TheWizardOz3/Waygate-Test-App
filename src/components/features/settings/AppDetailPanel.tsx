'use client';

import { useState, useMemo } from 'react';
import {
  ArrowLeft,
  Pencil,
  Trash2,
  Plus,
  Loader2,
  Check,
  Copy,
  Eye,
  EyeOff,
  RefreshCw,
  AlertTriangle,
  Shield,
  Key,
  Users,
  CheckCircle2,
  Clock,
  AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useApp, useUpdateApp, useRegenerateAppKey, useAppCredentialStats } from '@/hooks/useApps';
import { useIntegrations } from '@/hooks';
import { AppIntegrationConfigDialog } from './AppIntegrationConfigDialog';
import { toast } from 'sonner';
import { apiClient } from '@/lib/api/client';
import type { IntegrationConfigResponse } from '@/lib/modules/apps/app.schemas';

interface AppDetailPanelProps {
  appId: string;
  onBack: () => void;
  onDelete: () => void;
}

export function AppDetailPanel({ appId, onBack, onDelete }: AppDetailPanelProps) {
  const { data: app, isLoading } = useApp(appId);
  const updateMutation = useUpdateApp();
  const regenerateKeyMutation = useRegenerateAppKey();
  const { data: credentialStats, isLoading: credentialStatsLoading } = useAppCredentialStats(appId);

  const [showRegenerateDialog, setShowRegenerateDialog] = useState(false);
  const [regeneratedKey, setRegeneratedKey] = useState<string | null>(null);
  const [isKeyCopied, setIsKeyCopied] = useState(false);
  const [isKeyVisible, setIsKeyVisible] = useState(false);

  // Integration configs
  const [integrationConfigs, setIntegrationConfigs] = useState<IntegrationConfigResponse[]>([]);
  const [configsLoading, setConfigsLoading] = useState(true);
  const [addConfigOpen, setAddConfigOpen] = useState(false);
  const [editConfig, setEditConfig] = useState<IntegrationConfigResponse | null>(null);

  // Integration data for resolving names
  const { data: integrationsData } = useIntegrations({ limit: 100 });
  const integrationMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const integration of integrationsData?.integrations ?? []) {
      map.set(integration.id, integration.name);
    }
    return map;
  }, [integrationsData]);

  // Fetch integration configs for this app
  useState(() => {
    if (appId) {
      setConfigsLoading(true);
      // Fetch all integration configs for this app
      // The API doesn't have a list endpoint, so we fetch known integrations
      fetchIntegrationConfigs(appId).then((configs) => {
        setIntegrationConfigs(configs);
        setConfigsLoading(false);
      });
    }
  });

  const handleToggleStatus = async () => {
    if (!app) return;
    const newStatus = app.status === 'active' ? 'disabled' : 'active';
    try {
      await updateMutation.mutateAsync({ id: app.id, status: newStatus });
      toast.success(`App ${newStatus === 'active' ? 'enabled' : 'disabled'}`);
    } catch {
      toast.error('Failed to update app status');
    }
  };

  const handleRegenerateKey = async () => {
    try {
      const result = await regenerateKeyMutation.mutateAsync(appId);
      setRegeneratedKey(result.apiKey);
      setShowRegenerateDialog(false);
      toast.success('API key regenerated');
    } catch {
      toast.error('Failed to regenerate API key');
    }
  };

  const handleCopyKey = async () => {
    if (!regeneratedKey) return;
    try {
      await navigator.clipboard.writeText(regeneratedKey);
      setIsKeyCopied(true);
      toast.success('API key copied');
      setTimeout(() => setIsKeyCopied(false), 2000);
    } catch {
      toast.error('Failed to copy');
    }
  };

  const handleConfigSuccess = () => {
    // Refresh configs
    fetchIntegrationConfigs(appId).then(setIntegrationConfigs);
  };

  const handleDeleteConfig = async (config: IntegrationConfigResponse) => {
    try {
      await apiClient.delete(`/apps/${appId}/integrations/${config.integrationId}/config`);
      setIntegrationConfigs((prev) => prev.filter((c) => c.id !== config.id));
      toast.success('Integration config removed');
    } catch {
      toast.error('Failed to remove integration config');
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-64" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!app) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Apps
        </Button>
        <p className="text-sm text-muted-foreground">App not found.</p>
      </div>
    );
  }

  const maskedKey = 'wg_app_' + '\u2022'.repeat(24) + '\u2022\u2022\u2022\u2022';

  return (
    <div className="space-y-6">
      {/* Header with back button */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onBack} className="h-8 w-8">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold">{app.name}</h2>
              <Badge
                variant="outline"
                className={
                  app.status === 'active'
                    ? 'bg-emerald-500/10 text-emerald-600'
                    : 'bg-red-500/10 text-red-600'
                }
              >
                {app.status}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              <code className="rounded bg-muted px-1 font-mono text-xs">{app.slug}</code>
              {app.description && <span className="ml-2">{app.description}</span>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleToggleStatus}
            disabled={updateMutation.isPending}
          >
            {app.status === 'active' ? 'Disable' : 'Enable'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={onDelete}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </Button>
        </div>
      </div>

      <Separator />

      {/* API Key Section */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Key className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-medium">API Key</h3>
        </div>

        {regeneratedKey ? (
          <div className="space-y-3">
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                <p className="text-sm text-amber-600">
                  New API key generated. Copy it now — it will not be shown again.
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Input
                value={isKeyVisible ? regeneratedKey : maskedKey}
                readOnly
                className="font-mono text-sm"
              />
              <Button variant="ghost" size="icon" onClick={() => setIsKeyVisible(!isKeyVisible)}>
                {isKeyVisible ? (
                  <EyeOff className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <Eye className="h-4 w-4 text-muted-foreground" />
                )}
              </Button>
              <Button variant="outline" size="icon" onClick={handleCopyKey}>
                {isKeyCopied ? (
                  <Check className="h-4 w-4 text-emerald-500" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div className="space-y-0.5">
              <p className="font-mono text-sm text-muted-foreground">{maskedKey}</p>
              <p className="text-xs text-muted-foreground">
                The API key is only shown when first created or regenerated.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowRegenerateDialog(true)}
              className="text-destructive hover:text-destructive"
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Regenerate
            </Button>
          </div>
        )}
      </div>

      <Separator />

      {/* Integration Configs Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-medium">Integration Configs</h3>
          </div>
          <Button size="sm" onClick={() => setAddConfigOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add Config
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Register your OAuth app credentials (client ID / secret) per integration. End-users will
          authorize through your registered app.
        </p>

        {configsLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 2 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : integrationConfigs.length === 0 ? (
          <div className="rounded-lg border border-dashed p-6 text-center">
            <Shield className="mx-auto mb-3 h-8 w-8 text-muted-foreground/50" />
            <p className="text-sm font-medium">No integration configs</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Add OAuth app credentials for integrations your app will use.
            </p>
            <Button size="sm" className="mt-4" onClick={() => setAddConfigOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Add Config
            </Button>
          </div>
        ) : (
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Integration</TableHead>
                  <TableHead>Client ID</TableHead>
                  <TableHead>Client Secret</TableHead>
                  <TableHead>Scopes</TableHead>
                  <TableHead className="w-[60px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {integrationConfigs.map((config) => (
                  <TableRow key={config.id}>
                    <TableCell className="font-medium">
                      {integrationMap.get(config.integrationId) ?? config.integrationId}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={
                          config.hasClientId
                            ? 'bg-emerald-500/10 text-emerald-600'
                            : 'bg-red-500/10 text-red-600'
                        }
                      >
                        {config.hasClientId ? 'Configured' : 'Missing'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={
                          config.hasClientSecret
                            ? 'bg-emerald-500/10 text-emerald-600'
                            : 'bg-red-500/10 text-red-600'
                        }
                      >
                        {config.hasClientSecret ? 'Configured' : 'Missing'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {config.scopes.length > 0 ? (
                        <span className="font-mono text-xs text-muted-foreground">
                          {config.scopes.slice(0, 3).join(', ')}
                          {config.scopes.length > 3 && ` +${config.scopes.length - 3}`}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">None</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setEditConfig(config)}>
                            <Pencil className="mr-2 h-4 w-4" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => handleDeleteConfig(config)}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Remove
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <Separator />

      {/* End-User Credentials Section */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-medium">End-User Credentials</h3>
        </div>
        <p className="text-xs text-muted-foreground">
          Aggregate stats for end-user credentials across all connections. Individual user details
          are managed via API by your consuming app.
        </p>

        {credentialStatsLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : !credentialStats || credentialStats.total === 0 ? (
          <div className="rounded-lg border border-dashed p-6 text-center">
            <Users className="mx-auto mb-3 h-8 w-8 text-muted-foreground/50" />
            <p className="text-sm font-medium">No end-user credentials</p>
            <p className="mt-1 text-xs text-muted-foreground">
              End-users will appear here once they connect via the connect flow.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Summary stats */}
            <div className="grid grid-cols-4 gap-3">
              <div className="rounded-lg border p-3 text-center">
                <p className="text-2xl font-semibold">{credentialStats.total}</p>
                <p className="text-xs text-muted-foreground">Total</p>
              </div>
              <div className="rounded-lg border p-3 text-center">
                <div className="flex items-center justify-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                  <p className="text-2xl font-semibold text-emerald-600">
                    {credentialStats.byStatus.active ?? 0}
                  </p>
                </div>
                <p className="text-xs text-muted-foreground">Active</p>
              </div>
              <div className="rounded-lg border p-3 text-center">
                <div className="flex items-center justify-center gap-1">
                  <Clock className="h-3.5 w-3.5 text-amber-600" />
                  <p className="text-2xl font-semibold text-amber-600">
                    {credentialStats.byStatus.expired ?? 0}
                  </p>
                </div>
                <p className="text-xs text-muted-foreground">Expired</p>
              </div>
              <div className="rounded-lg border p-3 text-center">
                <div className="flex items-center justify-center gap-1">
                  <AlertCircle className="h-3.5 w-3.5 text-orange-600" />
                  <p className="text-2xl font-semibold text-orange-600">
                    {credentialStats.byStatus.needs_reauth ?? 0}
                  </p>
                </div>
                <p className="text-xs text-muted-foreground">Needs Re-auth</p>
              </div>
            </div>

            {/* Per-connection breakdown */}
            {credentialStats.byConnection.length > 0 && (
              <div className="rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Integration</TableHead>
                      <TableHead>Connection</TableHead>
                      <TableHead className="text-center">Active</TableHead>
                      <TableHead className="text-center">Expired</TableHead>
                      <TableHead className="text-center">Re-auth</TableHead>
                      <TableHead className="text-center">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {credentialStats.byConnection.map((conn) => (
                      <TableRow key={conn.connectionId}>
                        <TableCell className="font-medium">{conn.integrationName}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {conn.connectionName}
                        </TableCell>
                        <TableCell className="text-center">
                          {conn.byStatus.active ? (
                            <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600">
                              {conn.byStatus.active}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">0</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          {conn.byStatus.expired ? (
                            <Badge variant="outline" className="bg-amber-500/10 text-amber-600">
                              {conn.byStatus.expired}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">0</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          {conn.byStatus.needs_reauth ? (
                            <Badge variant="outline" className="bg-orange-500/10 text-orange-600">
                              {conn.byStatus.needs_reauth}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">0</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center font-medium">{conn.total}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        )}
      </div>

      <Separator />

      {/* App Info */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium">Details</h3>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <Label className="text-xs text-muted-foreground">Created</Label>
            <p>{new Date(app.createdAt).toLocaleDateString()}</p>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Last Updated</Label>
            <p>{new Date(app.updatedAt).toLocaleDateString()}</p>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">App ID</Label>
            <p className="font-mono text-xs">{app.id}</p>
          </div>
        </div>
      </div>

      {/* Regenerate Key Confirmation */}
      <AlertDialog open={showRegenerateDialog} onOpenChange={setShowRegenerateDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10">
                <AlertTriangle className="h-5 w-5 text-destructive" />
              </div>
              <AlertDialogTitle>Regenerate API Key?</AlertDialogTitle>
            </div>
            <AlertDialogDescription className="pt-2">
              This will permanently invalidate the current API key for <strong>{app.name}</strong>.
              All consuming applications using this key will need to be updated immediately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowRegenerateDialog(false)}
              disabled={regenerateKeyMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleRegenerateKey}
              disabled={regenerateKeyMutation.isPending}
            >
              {regenerateKeyMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Regenerating...
                </>
              ) : (
                'Regenerate Key'
              )}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Add/Edit Integration Config Dialog */}
      <AppIntegrationConfigDialog
        open={addConfigOpen || !!editConfig}
        onOpenChange={(open) => {
          if (!open) {
            setAddConfigOpen(false);
            setEditConfig(null);
          }
        }}
        appId={appId}
        existingConfig={editConfig}
        onSuccess={handleConfigSuccess}
      />
    </div>
  );
}

/**
 * Fetches all integration configs for an app.
 * Since there's no list endpoint, we fetch configs for all known integrations.
 */
async function fetchIntegrationConfigs(appId: string): Promise<IntegrationConfigResponse[]> {
  try {
    // Fetch integrations list to know which ones to check
    const integrationsResponse = await apiClient.get<{
      integrations: Array<{ id: string; name: string }>;
      pagination: { cursor: string | null; hasMore: boolean; totalCount: number };
    }>('/integrations', { limit: 100 });

    const integrations = integrationsResponse.integrations;
    const configs: IntegrationConfigResponse[] = [];

    // Try fetching config for each integration (silently ignore 404s)
    const results = await Promise.allSettled(
      integrations.map((integration) =>
        apiClient
          .get<IntegrationConfigResponse>(`/apps/${appId}/integrations/${integration.id}/config`)
          .then((config) => ({ config, found: true }))
          .catch(() => ({ config: null, found: false }))
      )
    );

    for (const result of results) {
      if (result.status === 'fulfilled' && result.value.found && result.value.config) {
        configs.push(result.value.config);
      }
    }

    return configs;
  } catch {
    return [];
  }
}
