'use client';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { CheckCircle2, AlertCircle, XCircle } from 'lucide-react';

interface ConnectionStatusBadgeProps {
  status: 'active' | 'error' | 'disabled';
  size?: 'sm' | 'default';
  className?: string;
}

const statusConfig = {
  active: {
    label: 'Active',
    variant: 'default' as const,
    icon: CheckCircle2,
    className: 'bg-emerald-500/15 text-emerald-600 border-emerald-500/20 hover:bg-emerald-500/20',
  },
  error: {
    label: 'Error',
    variant: 'destructive' as const,
    icon: AlertCircle,
    className: 'bg-red-500/15 text-red-600 border-red-500/20 hover:bg-red-500/20',
  },
  disabled: {
    label: 'Disabled',
    variant: 'secondary' as const,
    icon: XCircle,
    className: 'bg-zinc-500/15 text-zinc-500 border-zinc-500/20 hover:bg-zinc-500/20',
  },
};

export function ConnectionStatusBadge({
  status,
  size = 'default',
  className,
}: ConnectionStatusBadgeProps) {
  const config = statusConfig[status] || statusConfig.disabled;
  const Icon = config.icon;

  return (
    <Badge
      variant="outline"
      className={cn(
        'gap-1 font-medium',
        config.className,
        size === 'sm' && 'px-1.5 py-0 text-xs',
        className
      )}
    >
      <Icon className={cn('h-3 w-3', size === 'sm' && 'h-2.5 w-2.5')} />
      {config.label}
    </Badge>
  );
}
