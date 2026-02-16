'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Loader2, Shield, ExternalLink, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface ConnectPageClientProps {
  token: string;
  appName: string;
  appLogoUrl?: string | null;
  accentColor?: string | null;
  privacyUrl?: string | null;
  integrationName: string;
  integrationLogoUrl?: string | null;
  scopes: string[];
}

type ConnectState = 'idle' | 'connecting' | 'error';

export function ConnectPageClient({
  token,
  appName,
  appLogoUrl,
  accentColor,
  privacyUrl,
  integrationName,
  integrationLogoUrl,
  scopes,
}: ConnectPageClientProps) {
  const [state, setState] = useState<ConnectState>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const handleConnect = async () => {
    setState('connecting');
    setErrorMessage('');

    try {
      const response = await fetch('/api/v1/connect/authorize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        const msg = result.error?.message || 'Failed to initiate connection';
        setState('error');
        setErrorMessage(msg);
        return;
      }

      // Redirect to the OAuth provider (full-page redirect)
      window.location.href = result.data.authorizationUrl;
    } catch {
      setState('error');
      setErrorMessage('Network error. Please check your connection and try again.');
    }
  };

  const handleRetry = () => {
    setState('idle');
    setErrorMessage('');
  };

  // Custom accent color style for the connect button
  const buttonStyle = accentColor
    ? { backgroundColor: accentColor, borderColor: accentColor }
    : undefined;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="flex flex-col items-center gap-4 pb-2 text-center">
          {/* App logo */}
          {appLogoUrl && (
            <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-xl border bg-card">
              <Image
                src={appLogoUrl}
                alt={`${appName} logo`}
                width={48}
                height={48}
                className="object-contain"
                unoptimized
              />
            </div>
          )}

          {/* Title */}
          <div className="space-y-1">
            <h1 className="text-xl font-semibold tracking-tight">Connect to {integrationName}</h1>
            <p className="text-sm text-muted-foreground">
              {appName} wants to connect your {integrationName} account
            </p>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Integration info */}
          <div className="flex items-center gap-3 rounded-lg border bg-muted/50 p-3">
            {integrationLogoUrl ? (
              <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-card">
                <Image
                  src={integrationLogoUrl}
                  alt={`${integrationName} logo`}
                  width={32}
                  height={32}
                  className="object-contain"
                  unoptimized
                />
              </div>
            ) : (
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border bg-card">
                <ExternalLink className="h-5 w-5 text-muted-foreground" />
              </div>
            )}
            <div className="min-w-0">
              <p className="text-sm font-medium">{integrationName}</p>
              <p className="text-xs text-muted-foreground">OAuth 2.0 Authorization</p>
            </div>
          </div>

          {/* Scopes */}
          {scopes.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                <Shield className="h-3.5 w-3.5 text-muted-foreground" />
                <p className="text-xs font-medium text-muted-foreground">Requested Permissions</p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {scopes.map((scope) => (
                  <Badge key={scope} variant="secondary" className="text-xs font-normal">
                    {scope}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Error state */}
          {state === 'error' && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/5 p-3">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              <div className="space-y-1">
                <p className="text-sm text-destructive">{errorMessage}</p>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-auto p-0 text-xs"
                  onClick={handleRetry}
                >
                  Try again
                </Button>
              </div>
            </div>
          )}
        </CardContent>

        <CardFooter className="flex flex-col gap-3">
          {/* Connect button */}
          <Button
            onClick={handleConnect}
            disabled={state === 'connecting'}
            className="w-full"
            style={buttonStyle}
          >
            {state === 'connecting' ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Connecting...
              </>
            ) : (
              'Connect'
            )}
          </Button>

          {/* Privacy policy link */}
          {privacyUrl && (
            <a
              href={privacyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-muted-foreground hover:underline"
            >
              Privacy Policy
            </a>
          )}

          {/* Powered by Waygate */}
          <p className="text-xs text-muted-foreground/60">Secured by Waygate</p>
        </CardFooter>
      </Card>
    </div>
  );
}
