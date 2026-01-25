'use client';

import { useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Info, X, Plug } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ConnectionInfoBannerProps {
  connectionCount: number;
  className?: string;
}

/**
 * Info banner explaining multi-app connections feature.
 * Shows for integrations that have only a default connection or when user might benefit from understanding the feature.
 */
export function ConnectionInfoBanner({ connectionCount, className }: ConnectionInfoBannerProps) {
  const [dismissed, setDismissed] = useState(false);

  // Only show if connections exist but might be new/default
  // Or if user has a single connection (likely auto-created default)
  if (dismissed || connectionCount > 1) {
    return null;
  }

  return (
    <Alert
      className={cn(
        'relative border-violet-500/20 bg-gradient-to-r from-violet-500/5 to-indigo-500/5',
        className
      )}
    >
      <Info className="h-4 w-4 text-violet-600" />
      <AlertTitle className="flex items-center gap-2 text-violet-900 dark:text-violet-100">
        <Plug className="h-4 w-4" />
        Multi-App Connections
      </AlertTitle>
      <AlertDescription className="mt-2 text-muted-foreground">
        <p className="mb-2">
          Connections let you link multiple apps to this integration with separate credentials. This
          is useful when you need to:
        </p>
        <ul className="mb-3 ml-4 list-disc space-y-1 text-sm">
          <li>Connect different environments (dev, staging, production)</li>
          <li>Support multiple clients with their own API credentials</li>
          <li>Isolate credentials between different applications</li>
        </ul>
        <p className="text-sm">
          The default connection was automatically created and works with your existing setup. You
          can create additional connections as needed.
        </p>
      </AlertDescription>
      <Button
        variant="ghost"
        size="icon"
        className="absolute right-2 top-2 h-6 w-6 text-muted-foreground hover:text-foreground"
        onClick={() => setDismissed(true)}
      >
        <X className="h-4 w-4" />
        <span className="sr-only">Dismiss</span>
      </Button>
    </Alert>
  );
}
