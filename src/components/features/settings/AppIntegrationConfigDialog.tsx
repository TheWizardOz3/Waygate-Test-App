'use client';

import { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useIntegrations } from '@/hooks';
import { useSetIntegrationConfig } from '@/hooks/useApps';
import { toast } from 'sonner';
import type { IntegrationConfigResponse } from '@/lib/modules/apps/app.schemas';

interface AppIntegrationConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appId: string;
  /** If provided, locks the integration selector to this integration */
  integrationId?: string;
  /** If provided, editing existing config for this integration */
  existingConfig?: IntegrationConfigResponse | null;
  onSuccess?: () => void;
}

export function AppIntegrationConfigDialog({
  open,
  onOpenChange,
  appId,
  integrationId: integrationIdProp,
  existingConfig,
  onSuccess,
}: AppIntegrationConfigDialogProps) {
  const isEditing = !!existingConfig;
  const isIntegrationLocked = !!integrationIdProp;

  const [integrationId, setIntegrationId] = useState('');
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [scopes, setScopes] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { data: integrationsData } = useIntegrations({ limit: 100 });
  const setConfigMutation = useSetIntegrationConfig();

  const integrations = integrationsData?.integrations ?? [];

  useEffect(() => {
    if (open) {
      if (existingConfig) {
        setIntegrationId(existingConfig.integrationId);
        setClientId('');
        setClientSecret('');
        setScopes(existingConfig.scopes.join(', '));
      } else {
        setIntegrationId(integrationIdProp ?? '');
        setClientId('');
        setClientSecret('');
        setScopes('');
      }
      setErrors({});
    }
  }, [open, existingConfig, integrationIdProp]);

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!integrationId) newErrors.integrationId = 'Integration is required';
    if (!clientId.trim()) newErrors.clientId = 'Client ID is required';
    if (!clientSecret.trim()) newErrors.clientSecret = 'Client Secret is required';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    try {
      const scopeList = scopes
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      await setConfigMutation.mutateAsync({
        appId,
        integrationId,
        clientId: clientId.trim(),
        clientSecret: clientSecret.trim(),
        scopes: scopeList,
        metadata: {},
      });

      toast.success(isEditing ? 'Integration config updated' : 'Integration config added');
      onOpenChange(false);
      onSuccess?.();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save integration config';
      toast.error(message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? 'Update Integration Config' : 'Add Integration Config'}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? 'Update the OAuth app credentials for this integration.'
              : 'Register your OAuth app credentials for an integration. These are the client ID and secret from your registered OAuth app (e.g., from the Slack API dashboard).'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Integration</Label>
            <Select
              value={integrationId}
              onValueChange={setIntegrationId}
              disabled={isEditing || isIntegrationLocked}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select an integration" />
              </SelectTrigger>
              <SelectContent>
                {integrations.map((integration) => (
                  <SelectItem key={integration.id} value={integration.id}>
                    {integration.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.integrationId && (
              <p className="text-xs text-destructive">{errors.integrationId}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="client-id">Client ID</Label>
            <Input
              id="client-id"
              placeholder={isEditing ? '(enter new value to update)' : 'OAuth Client ID'}
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className="font-mono text-sm"
            />
            {errors.clientId && <p className="text-xs text-destructive">{errors.clientId}</p>}
            {isEditing && existingConfig?.hasClientId && (
              <p className="text-xs text-muted-foreground">
                A client ID is already configured. Enter a new value to replace it.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="client-secret">Client Secret</Label>
            <Input
              id="client-secret"
              type="password"
              placeholder={isEditing ? '(enter new value to update)' : 'OAuth Client Secret'}
              value={clientSecret}
              onChange={(e) => setClientSecret(e.target.value)}
              className="font-mono text-sm"
            />
            {errors.clientSecret && (
              <p className="text-xs text-destructive">{errors.clientSecret}</p>
            )}
            {isEditing && existingConfig?.hasClientSecret && (
              <p className="text-xs text-muted-foreground">
                A client secret is already configured. Enter a new value to replace it.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="scopes">Scopes (optional)</Label>
            <Input
              id="scopes"
              placeholder="chat:write, users:read"
              value={scopes}
              onChange={(e) => setScopes(e.target.value)}
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">Comma-separated list of OAuth scopes.</p>
          </div>
        </form>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={setConfigMutation.isPending}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={setConfigMutation.isPending}>
            {setConfigMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : isEditing ? (
              'Update Config'
            ) : (
              'Add Config'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
