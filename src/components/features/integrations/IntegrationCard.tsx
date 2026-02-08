'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  MoreHorizontal,
  ExternalLink,
  Settings,
  Trash2,
  Sparkles,
  ArrowRight,
  Wand2,
} from 'lucide-react';

import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { IntegrationHealthBadge } from './IntegrationStatusBadge';
import { DriftBadge } from '@/components/features/schema-drift/DriftBadge';
import { TagList } from '@/components/ui/tag-badge';
import { cn } from '@/lib/utils';
import type { IntegrationSummary } from '@/lib/modules/integrations/integration.schemas';

interface IntegrationCardProps {
  integration: IntegrationSummary;
  onDelete?: (id: string) => void;
  className?: string;
  aiToolCount?: number;
}

/**
 * Card component for displaying an integration in a list/grid view.
 * Shows integration name, status, action count, and quick actions.
 * The entire card is clickable to navigate to the integration detail.
 */
export function IntegrationCard({
  integration,
  onDelete,
  className,
  aiToolCount,
}: IntegrationCardProps) {
  const router = useRouter();
  const { id, name, slug, description, status } = integration;

  const handleCardClick = (e: React.MouseEvent) => {
    // Only navigate if we didn't click on an interactive element
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('a') || target.closest('[role="menuitem"]')) {
      return;
    }
    router.push(`/integrations/${id}`);
  };

  return (
    <Card
      onClick={handleCardClick}
      className={cn(
        'group relative cursor-pointer transition-all hover:border-primary/50 hover:shadow-md',
        className
      )}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-4">
          {/* Icon and Title */}
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500/10 to-indigo-500/10 transition-colors group-hover:from-violet-500/20 group-hover:to-indigo-500/20">
              <Sparkles className="h-5 w-5 text-violet-600 dark:text-violet-400" />
            </div>
            <div className="min-w-0 flex-1">
              <span className="block truncate font-semibold transition-colors group-hover:text-primary">
                {name}
              </span>
              <p className="font-mono text-xs text-muted-foreground">{slug}</p>
            </div>
          </div>

          {/* Health/Status Badge & Arrow */}
          <div className="flex items-center gap-2">
            <IntegrationHealthBadge
              integrationStatus={status}
              connectionHealth={integration.connectionHealth}
              size="sm"
            />
            <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        {/* Description */}
        {description && (
          <p className="mb-2 line-clamp-2 text-sm text-muted-foreground">{description}</p>
        )}

        {/* Tags and AI Tool Count */}
        <div className="flex items-center justify-between gap-2">
          {integration.tags.length > 0 && (
            <TagList tags={integration.tags} size="sm" maxVisible={3} />
          )}
          <div className="flex shrink-0 items-center gap-1.5">
            <DriftBadge integrationId={id} />
            {aiToolCount !== undefined && aiToolCount > 0 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge
                    variant="secondary"
                    className="shrink-0 gap-1 bg-violet-500/10 text-violet-600 hover:bg-violet-500/20 dark:text-violet-400"
                  >
                    <Wand2 className="h-3 w-3" />
                    {aiToolCount}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  <p>
                    Used in {aiToolCount} composite tool{aiToolCount > 1 ? 's' : ''}
                  </p>
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>

        {/* More Menu - absolute positioned */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="absolute bottom-2 right-2 h-8 w-8 opacity-0 group-hover:opacity-100"
            >
              <MoreHorizontal className="h-4 w-4" />
              <span className="sr-only">More actions</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <Link href={`/integrations/${id}`}>
                <Settings className="mr-2 h-4 w-4" />
                View Details
              </Link>
            </DropdownMenuItem>
            {integration.documentationUrl && (
              <DropdownMenuItem asChild>
                <a href={integration.documentationUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="mr-2 h-4 w-4" />
                  View Docs
                </a>
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => onDelete?.(id)}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </CardContent>
    </Card>
  );
}

/**
 * Skeleton loader for IntegrationCard
 */
export function IntegrationCardSkeleton() {
  return (
    <Card className="animate-pulse">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-muted" />
            <div className="space-y-2">
              <div className="h-4 w-32 rounded bg-muted" />
              <div className="h-3 w-20 rounded bg-muted" />
            </div>
          </div>
          <div className="h-5 w-16 rounded-full bg-muted" />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="h-3 w-full rounded bg-muted" />
          <div className="h-3 w-2/3 rounded bg-muted" />
        </div>
        <div className="flex gap-4">
          <div className="h-3 w-16 rounded bg-muted" />
          <div className="h-3 w-12 rounded bg-muted" />
        </div>
      </CardContent>
    </Card>
  );
}
