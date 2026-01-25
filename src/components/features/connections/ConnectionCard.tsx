'use client';

import * as React from 'react';
import { MoreHorizontal, Plug, Unplug, Trash2, Edit2, Star, ArrowRight } from 'lucide-react';

import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { ConnectionStatusBadge } from './ConnectionStatusBadge';
import { cn } from '@/lib/utils';
import type { ConnectionResponse } from '@/lib/modules/connections/connection.schemas';

interface ConnectionCardProps {
  connection: ConnectionResponse;
  onConnect?: (id: string) => void;
  onDisconnect?: (id: string) => void;
  onEdit?: (id: string) => void;
  onDelete?: (id: string) => void;
  onSelect?: (id: string) => void;
  isSelected?: boolean;
  className?: string;
}

/**
 * Card component for displaying a connection in a list/grid view.
 * Shows connection name, status, and quick actions.
 */
export function ConnectionCard({
  connection,
  onConnect,
  onDisconnect,
  onEdit,
  onDelete,
  onSelect,
  isSelected,
  className,
}: ConnectionCardProps) {
  const { id, name, slug, status, isPrimary, baseUrl, createdAt } = connection;

  const handleCardClick = (e: React.MouseEvent) => {
    // Only select if we didn't click on an interactive element
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('[role="menuitem"]')) {
      return;
    }
    onSelect?.(id);
  };

  const formattedDate = new Date(createdAt).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <Card
      onClick={handleCardClick}
      className={cn(
        'group relative transition-all',
        onSelect && 'cursor-pointer hover:border-primary/50 hover:shadow-md',
        isSelected && 'border-primary ring-1 ring-primary/20',
        className
      )}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-4">
          {/* Icon and Title */}
          <div className="flex items-center gap-3">
            <div
              className={cn(
                'flex h-10 w-10 items-center justify-center rounded-lg transition-colors',
                status === 'active'
                  ? 'bg-emerald-500/10 group-hover:bg-emerald-500/20'
                  : status === 'error'
                    ? 'bg-red-500/10 group-hover:bg-red-500/20'
                    : 'bg-zinc-500/10 group-hover:bg-zinc-500/20'
              )}
            >
              <Plug
                className={cn(
                  'h-5 w-5',
                  status === 'active'
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : status === 'error'
                      ? 'text-red-600 dark:text-red-400'
                      : 'text-zinc-500'
                )}
              />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="block truncate font-semibold transition-colors group-hover:text-primary">
                  {name}
                </span>
                {isPrimary && (
                  <Badge
                    variant="outline"
                    className="gap-1 border-amber-500/20 bg-amber-500/10 px-1.5 py-0 text-xs text-amber-600"
                  >
                    <Star className="h-2.5 w-2.5 fill-current" />
                    Primary
                  </Badge>
                )}
              </div>
              <p className="font-mono text-xs text-muted-foreground">{slug}</p>
            </div>
          </div>

          {/* Status Badge & Arrow */}
          <div className="flex items-center gap-2">
            <ConnectionStatusBadge status={status} size="sm" />
            {onSelect && (
              <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        {/* Base URL if set */}
        {baseUrl && (
          <p className="mb-2 truncate font-mono text-xs text-muted-foreground">{baseUrl}</p>
        )}

        {/* Footer: Date and Actions */}
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">Created {formattedDate}</p>

          {/* Actions Menu */}
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
              {status === 'active' ? (
                <DropdownMenuItem onClick={() => onDisconnect?.(id)}>
                  <Unplug className="mr-2 h-4 w-4" />
                  Disconnect
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem onClick={() => onConnect?.(id)}>
                  <Plug className="mr-2 h-4 w-4" />
                  Connect
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => onEdit?.(id)}>
                <Edit2 className="mr-2 h-4 w-4" />
                Edit
              </DropdownMenuItem>
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
 * Skeleton loader for ConnectionCard
 */
export function ConnectionCardSkeleton() {
  return (
    <Card className="animate-pulse">
      <CardHeader className="pb-2">
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
      <CardContent className="pt-0">
        <div className="flex items-center justify-between">
          <div className="h-3 w-24 rounded bg-muted" />
        </div>
      </CardContent>
    </Card>
  );
}
