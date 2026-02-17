'use client';

import { useState } from 'react';
import {
  ArrowLeft,
  Trash2,
  Loader2,
  Check,
  Copy,
  Eye,
  EyeOff,
  RefreshCw,
  AlertTriangle,
  Key,
  Plug,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useApp, useUpdateApp, useRegenerateAppKey, useAppConnections } from '@/hooks/useApps';
import { toast } from 'sonner';

interface AppDetailPanelProps {
  appId: string;
  onBack: () => void;
  onDelete: () => void;
}

export function AppDetailPanel({ appId, onBack, onDelete }: AppDetailPanelProps) {
  const { data: app, isLoading } = useApp(appId);
  const updateMutation = useUpdateApp();
  const regenerateKeyMutation = useRegenerateAppKey();
  const { data: connectionsData, isLoading: connectionsLoading } = useAppConnections(appId);

  const [showRegenerateDialog, setShowRegenerateDialog] = useState(false);
  const [regeneratedKey, setRegeneratedKey] = useState<string | null>(null);
  const [isKeyCopied, setIsKeyCopied] = useState(false);
  const [isKeyVisible, setIsKeyVisible] = useState(false);

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
  const connections = connectionsData?.connections ?? [];

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

      {/* Connections Section */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Plug className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-medium">Connections</h3>
        </div>
        <p className="text-xs text-muted-foreground">
          Connections associated with this app. Manage credentials and configuration from the
          integration&apos;s Connections tab.
        </p>

        {connectionsLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 2 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : connections.length === 0 ? (
          <div className="rounded-lg border border-dashed p-6 text-center">
            <Plug className="mx-auto mb-3 h-8 w-8 text-muted-foreground/50" />
            <p className="text-sm font-medium">No connections</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Create a connection from an integration&apos;s Connections tab and associate it with
              this app.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {connections.map((conn) => (
              <div
                key={conn.id}
                className="flex items-center justify-between rounded-lg border px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <div>
                    <p className="text-sm font-medium">{conn.name}</p>
                    <p className="text-xs text-muted-foreground">{conn.integrationName}</p>
                  </div>
                </div>
                <Badge
                  variant="outline"
                  className={
                    conn.status === 'active'
                      ? 'bg-emerald-500/10 text-emerald-600'
                      : conn.status === 'error'
                        ? 'bg-red-500/10 text-red-600'
                        : 'bg-muted text-muted-foreground'
                  }
                >
                  {conn.status}
                </Badge>
              </div>
            ))}
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
    </div>
  );
}
