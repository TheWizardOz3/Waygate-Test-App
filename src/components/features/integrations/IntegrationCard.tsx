'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  MoreHorizontal,
  ExternalLink,
  Settings,
  Trash2,
  Play,
  Puzzle,
  ArrowRight,
} from 'lucide-react';

import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { IntegrationStatusBadge } from './IntegrationStatusBadge';
import { cn } from '@/lib/utils';
import type { IntegrationSummary } from '@/lib/modules/integrations/integration.schemas';

interface IntegrationCardProps {
  integration: IntegrationSummary;
  onDelete?: (id: string) => void;
  className?: string;
}

/**
 * Card component for displaying an integration in a list/grid view.
 * Shows integration name, status, action count, and quick actions.
 * The entire card is clickable to navigate to the integration detail.
 */
export function IntegrationCard({ integration, onDelete, className }: IntegrationCardProps) {
  const router = useRouter();
  const { id, name, slug, description, status, authType, tags, actionCount } = integration;

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
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          {/* Icon and Title */}
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 transition-colors group-hover:bg-primary/20">
              <Puzzle className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <span className="block truncate font-semibold transition-colors group-hover:text-primary">
                {name}
              </span>
              <p className="text-xs text-muted-foreground">{slug}</p>
            </div>
          </div>

          {/* Status Badge & Arrow */}
          <div className="flex items-center gap-2">
            <IntegrationStatusBadge status={status} size="sm" />
            <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Description */}
        {description && <p className="line-clamp-2 text-sm text-muted-foreground">{description}</p>}

        {/* Meta Info */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="font-medium">{actionCount}</span> actions
          </span>
          <span className="capitalize">{authType.replace('_', ' ')}</span>
        </div>

        {/* Tags */}
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground"
              >
                {tag}
              </span>
            ))}
            {tags.length > 3 && (
              <span className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                +{tags.length - 3}
              </span>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between pt-2">
          <div className="flex gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href={`/integrations/${id}/actions`}>
                <Play className="mr-1 h-3 w-3" />
                Actions
              </Link>
            </Button>
          </div>

          {/* More Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 opacity-0 group-hover:opacity-100"
              >
                <MoreHorizontal className="h-4 w-4" />
                <span className="sr-only">More actions</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link href={`/integrations/${id}`}>
                  <Settings className="mr-2 h-4 w-4" />
                  Settings
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
        </div>
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
