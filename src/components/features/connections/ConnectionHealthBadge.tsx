'use client';

import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { CheckCircle2, AlertCircle, XCircle, Clock, HelpCircle } from 'lucide-react';

type CredentialStatus = 'active' | 'expired' | 'revoked' | 'needs_reauth' | null;

interface ConnectionHealthBadgeProps {
  hasCredentials: boolean;
  credentialStatus: CredentialStatus;
  size?: 'sm' | 'default';
  showTooltip?: boolean;
  className?: string;
}

const healthConfig = {
  active: {
    label: 'Healthy',
    description: 'Credentials are active and working',
    icon: CheckCircle2,
    className: 'bg-emerald-500/15 text-emerald-600 border-emerald-500/20',
  },
  expired: {
    label: 'Expired',
    description: 'Credentials have expired and need to be refreshed',
    icon: Clock,
    className: 'bg-amber-500/15 text-amber-600 border-amber-500/20',
  },
  revoked: {
    label: 'Revoked',
    description: 'Credentials have been revoked and need to be reconnected',
    icon: XCircle,
    className: 'bg-red-500/15 text-red-600 border-red-500/20',
  },
  needs_reauth: {
    label: 'Needs Re-auth',
    description: 'Re-authentication required to restore access',
    icon: AlertCircle,
    className: 'bg-orange-500/15 text-orange-600 border-orange-500/20',
  },
  disconnected: {
    label: 'Disconnected',
    description: 'No credentials configured for this connection',
    icon: HelpCircle,
    className: 'bg-zinc-500/15 text-zinc-500 border-zinc-500/20',
  },
};

export function ConnectionHealthBadge({
  hasCredentials,
  credentialStatus,
  size = 'default',
  showTooltip = true,
  className,
}: ConnectionHealthBadgeProps) {
  const status = !hasCredentials ? 'disconnected' : credentialStatus || 'disconnected';
  const config = healthConfig[status] || healthConfig.disconnected;
  const Icon = config.icon;

  const badge = (
    <Badge
      variant="outline"
      className={cn(
        'gap-1.5 font-medium',
        config.className,
        size === 'sm' && 'px-1.5 py-0 text-xs',
        className
      )}
    >
      <Icon className={cn('h-3.5 w-3.5', size === 'sm' && 'h-3 w-3')} />
      {config.label}
    </Badge>
  );

  if (!showTooltip) {
    return badge;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>{badge}</TooltipTrigger>
      <TooltipContent>
        <p>{config.description}</p>
      </TooltipContent>
    </Tooltip>
  );
}
