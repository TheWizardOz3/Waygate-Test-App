'use client';

import { Wrench } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useProposalSummary } from '@/hooks/useAutoMaintenance';

interface MaintenanceBadgeProps {
  integrationId: string;
  className?: string;
}

/**
 * Small badge showing pending maintenance proposal count.
 * Displays on integration cards when proposals are waiting for review.
 * Only renders when there are pending proposals.
 */
export function MaintenanceBadge({ integrationId, className }: MaintenanceBadgeProps) {
  const { data: summary } = useProposalSummary(integrationId);

  if (!summary || summary.pending === 0) return null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            'inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
            'bg-amber-500/10 text-amber-600',
            className
          )}
        >
          <Wrench className="h-3 w-3" />
          {summary.pending}
        </span>
      </TooltipTrigger>
      <TooltipContent>
        <p>
          {summary.pending} pending maintenance proposal{summary.pending !== 1 ? 's' : ''}
        </p>
      </TooltipContent>
    </Tooltip>
  );
}
