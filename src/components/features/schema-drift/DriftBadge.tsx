'use client';

import { AlertTriangle } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useDriftSummary } from '@/hooks/useSchemaDrift';

interface DriftBadgeProps {
  integrationId: string;
  className?: string;
}

const severityStyles = {
  breaking: 'bg-destructive/10 text-destructive',
  warning: 'bg-warning/10 text-warning',
  info: 'bg-muted text-muted-foreground',
} as const;

type HighestSeverity = keyof typeof severityStyles;

function getHighestSeverity(summary: {
  breaking: number;
  warning: number;
  info: number;
}): HighestSeverity {
  if (summary.breaking > 0) return 'breaking';
  if (summary.warning > 0) return 'warning';
  return 'info';
}

function buildTooltipText(summary: { breaking: number; warning: number; info: number }): string {
  const parts: string[] = [];
  if (summary.breaking > 0) parts.push(`${summary.breaking} breaking`);
  if (summary.warning > 0) parts.push(`${summary.warning} warning`);
  if (summary.info > 0) parts.push(`${summary.info} info`);
  return `Schema drift: ${parts.join(', ')}`;
}

/**
 * Small badge showing unresolved drift report count with severity color.
 * Displays on integration cards when drift has been detected.
 * Only renders when there are unresolved drift reports.
 */
export function DriftBadge({ integrationId, className }: DriftBadgeProps) {
  const { data: summary } = useDriftSummary(integrationId);

  if (!summary || summary.total === 0) return null;

  const severity = getHighestSeverity(summary);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            'inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
            severityStyles[severity],
            className
          )}
        >
          <AlertTriangle className="h-3 w-3" />
          {summary.total}
        </span>
      </TooltipTrigger>
      <TooltipContent>
        <p>{buildTooltipText(summary)}</p>
      </TooltipContent>
    </Tooltip>
  );
}
