'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Shield,
  Key,
  CheckCircle2,
  AlertCircle,
  Clock,
  RefreshCw,
  Unplug,
  Loader2,
  Plug,
  Zap,
} from 'lucide-react';
import { toast } from 'sonner';
import { apiClient } from '@/lib/api/client';
import { useConnectConnection, useDisconnectConnection } from '@/hooks';
import { CredentialSourceBadge } from './ConnectorTypeBadge';
import type { ConnectionResponse } from '@/lib/modules/connections/connection.schemas';
import type { IntegrationResponse } from '@/lib/modules/integrations/integration.schemas';

interface ConnectionCredentialPanelProps {
  connection: ConnectionResponse;
  integration: IntegrationResponse;
  onCredentialChange?: () => void;
}

type CredentialStatus = 'connected' | 'expired' | 'needs_reauth' | 'disconnected';

interface CredentialApiResponse {
  connection: {
    id: string;
    name: string;
  };
  credentials: {
    hasCredentials: boolean;
    status?: string;
    credentialType?: string;
    credentialSource?: 'platform' | 'user_owned';
    expiresAt?: string | null;
    scopes?: string[];
  };
}

interface CredentialStatusData {
  status: CredentialStatus;
  expiresAt?: string;
  scopes?: string[];
  credentialType?: string;
  credentialSource?: 'platform' | 'user_owned';
}

export function ConnectionCredentialPanel({
  connection,
  integration,
  onCredentialChange,
}: ConnectionCredentialPanelProps) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [credentialData, setCredentialData] = useState<CredentialStatusData>({
    status: 'disconnected',
  });

  const connectMutation = useConnectConnection(integration.id);
  const disconnectMutation = useDisconnectConnection(integration.id);

  // Fetch credential status on mount
  useEffect(() => {
    async function fetchCredentialStatus() {
      setIsLoading(true);
      try {
        const response = await apiClient.get<CredentialApiResponse>(
          `/connections/${connection.id}/credentials`
        );

        const creds = response.credentials;

        if (!creds.hasCredentials) {
          setCredentialData({ status: 'disconnected' });
        } else {
          let uiStatus: CredentialStatus = 'connected';
          if (creds.status === 'expired') {
            uiStatus = 'expired';
          } else if (creds.status === 'needs_reauth' || creds.status === 'invalid') {
            uiStatus = 'needs_reauth';
          }

          setCredentialData({
            status: uiStatus,
            expiresAt: creds.expiresAt || undefined,
            scopes: creds.scopes,
            credentialType: creds.credentialType,
            credentialSource: creds.credentialSource,
          });
        }
      } catch {
        // No credentials found or error - show disconnected state
        setCredentialData({ status: 'disconnected' });
      } finally {
        setIsLoading(false);
      }
    }
    fetchCredentialStatus();
  }, [connection.id]);

  const credentialStatus = credentialData.status;
  const expiresAt = credentialData.expiresAt ? new Date(credentialData.expiresAt) : null;
  const scopes = credentialData.scopes || [];
  const credentialSource = credentialData.credentialSource;
  const isPlatformConnection = connection.connectorType === 'platform';

  const handleConnect = async () => {
    try {
      const result = await connectMutation.mutateAsync(connection.id);
      if (result.authorizationUrl) {
        window.location.href = result.authorizationUrl;
      }
    } catch (err) {
      toast.error('Failed to initiate connection', {
        description: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await apiClient.post(`/connections/${connection.id}/refresh`);
      // Re-fetch credential status
      const response = await apiClient.get<CredentialApiResponse>(
        `/connections/${connection.id}/credentials`
      );
      const creds = response.credentials;
      setCredentialData({
        status: creds.hasCredentials ? 'connected' : 'disconnected',
        expiresAt: creds.expiresAt || undefined,
        scopes: creds.scopes,
      });
      toast.success('Credentials refreshed successfully');
      onCredentialChange?.();
    } catch (err) {
      toast.error('Failed to refresh credentials', {
        description: err instanceof Error ? err.message : 'Unknown error',
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      await disconnectMutation.mutateAsync(connection.id);
      setCredentialData({ status: 'disconnected' });
      toast.success('Connection disconnected');
      onCredentialChange?.();
    } catch (err) {
      toast.error('Failed to disconnect', {
        description: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const getStatusIcon = (status: CredentialStatus) => {
    switch (status) {
      case 'connected':
        return <CheckCircle2 className="h-4 w-4 text-emerald-600" />;
      case 'expired':
        return <Clock className="h-4 w-4 text-amber-600" />;
      case 'needs_reauth':
        return <AlertCircle className="h-4 w-4 text-orange-600" />;
      case 'disconnected':
        return <Unplug className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getStatusBadge = (status: CredentialStatus) => {
    switch (status) {
      case 'connected':
        return (
          <Badge className="border-emerald-500/20 bg-emerald-500/15 text-emerald-600">
            Connected
          </Badge>
        );
      case 'expired':
        return (
          <Badge className="border-amber-500/20 bg-amber-500/15 text-amber-600">Expired</Badge>
        );
      case 'needs_reauth':
        return (
          <Badge className="border-orange-500/20 bg-orange-500/15 text-orange-600">
            Needs Re-auth
          </Badge>
        );
      case 'disconnected':
        return <Badge variant="secondary">Disconnected</Badge>;
    }
  };

  // If integration doesn't require authentication, show appropriate message
  if (integration.authType === 'none') {
    // Check if the auth type was unverified (AI couldn't detect it)
    if (integration.metadata?.authTypeUnverified) {
      return (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-amber-600" />
                <CardTitle className="text-lg">Authentication</CardTitle>
              </div>
              <Badge className="border-amber-500/20 bg-amber-500/15 text-amber-600">
                Unverified
              </Badge>
            </div>
            <CardDescription>
              Auth type could not be determined from the API documentation. This API may require
              authentication credentials.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" size="sm" asChild>
              <a href={`/integrations/${integration.id}/settings`}>
                <Key className="mr-2 h-4 w-4" />
                Update Auth Type
              </a>
            </Button>
          </CardContent>
        </Card>
      );
    }

    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              <CardTitle className="text-lg">Authentication</CardTitle>
            </div>
            <Badge className="border-emerald-500/20 bg-emerald-500/15 text-emerald-600">
              Not Required
            </Badge>
          </div>
          <CardDescription>
            This integration does not require authentication credentials.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {integration.authType === 'oauth2' ? (
              <Shield className="h-5 w-5 text-violet-600" />
            ) : (
              <Key className="h-5 w-5 text-violet-600" />
            )}
            <CardTitle className="text-lg">Credentials</CardTitle>
          </div>
          {getStatusBadge(credentialStatus)}
        </div>
        <CardDescription>
          {integration.authType === 'oauth2'
            ? 'OAuth 2.0 connection status'
            : 'API key authentication status'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Status */}
        <div className="flex items-center gap-2">
          {getStatusIcon(credentialStatus)}
          <span className="text-sm">
            {credentialStatus === 'connected' && 'Credentials are active and working'}
            {credentialStatus === 'expired' && 'Credentials have expired'}
            {credentialStatus === 'needs_reauth' && 'Re-authentication required'}
            {credentialStatus === 'disconnected' && 'No credentials configured'}
          </span>
        </div>

        {/* Credential Details (for connected OAuth) */}
        {integration.authType === 'oauth2' && credentialStatus === 'connected' && (
          <div className="space-y-2 rounded-lg bg-muted/50 p-3">
            {/* Credential Source */}
            {credentialSource && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Source</span>
                <CredentialSourceBadge source={credentialSource} size="sm" />
              </div>
            )}
            {/* Expiration */}
            {expiresAt && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Expires</span>
                <span className="font-medium">
                  {expiresAt.toLocaleDateString()} at {expiresAt.toLocaleTimeString()}
                </span>
              </div>
            )}
            {/* Scopes */}
            {scopes.length > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Scopes</span>
                <div className="flex flex-wrap justify-end gap-1">
                  {scopes.slice(0, 3).map((scope) => (
                    <Badge key={scope} variant="outline" className="text-xs">
                      {scope}
                    </Badge>
                  ))}
                  {scopes.length > 3 && (
                    <Badge variant="outline" className="text-xs">
                      +{scopes.length - 3} more
                    </Badge>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-2">
          {credentialStatus === 'connected' ? (
            <>
              {integration.authType === 'oauth2' && (
                <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isRefreshing}>
                  {isRefreshing ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="mr-2 h-4 w-4" />
                  )}
                  Refresh
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={handleDisconnect}
                disabled={disconnectMutation.isPending}
                className="text-destructive hover:text-destructive"
              >
                {disconnectMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Unplug className="mr-2 h-4 w-4" />
                )}
                Disconnect
              </Button>
            </>
          ) : (
            <Button
              onClick={handleConnect}
              disabled={connectMutation.isPending}
              className={isPlatformConnection ? 'bg-violet-600 hover:bg-violet-700' : undefined}
            >
              {connectMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : isPlatformConnection ? (
                <Zap className="mr-2 h-4 w-4" />
              ) : integration.authType === 'oauth2' ? (
                <Shield className="mr-2 h-4 w-4" />
              ) : (
                <Plug className="mr-2 h-4 w-4" />
              )}
              {isPlatformConnection
                ? 'Connect with Waygate'
                : integration.authType === 'oauth2'
                  ? 'Connect with OAuth'
                  : 'Add Credentials'}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
