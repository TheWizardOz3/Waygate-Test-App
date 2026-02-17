'use client';

import { ChevronDown, Plus, Plug, Star, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ConnectorTypeBadge } from './ConnectorTypeBadge';
import { HealthStatusDot } from '@/components/features/health';
import type { ConnectionResponse } from '@/lib/modules/connections/connection.schemas';
import { cn } from '@/lib/utils';

interface ConnectionSelectorProps {
  connections: ConnectionResponse[];
  selectedConnectionId: string | null;
  onSelect: (connectionId: string) => void;
  onAddConnection: () => void;
  className?: string;
}

/**
 * Dropdown selector for switching between connections.
 * Shows connection name, status, and health at a glance.
 */
export function ConnectionSelector({
  connections,
  selectedConnectionId,
  onSelect,
  onAddConnection,
  className,
}: ConnectionSelectorProps) {
  const selectedConnection = connections.find((c) => c.id === selectedConnectionId);

  // If no connections, show add button
  if (connections.length === 0) {
    return (
      <Button onClick={onAddConnection} className={className}>
        <Plus className="mr-2 h-4 w-4" />
        Add Connection
      </Button>
    );
  }

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className="min-w-[200px] justify-between">
            <div className="flex items-center gap-2">
              <Plug className="h-4 w-4 text-muted-foreground" />
              {selectedConnection ? (
                <>
                  <span className="font-medium">{selectedConnection.name}</span>
                  {selectedConnection.isPrimary && (
                    <Star className="h-3 w-3 fill-amber-500 text-amber-500" />
                  )}
                  <HealthStatusDot status={selectedConnection.healthStatus} />
                </>
              ) : (
                <span className="text-muted-foreground">Select connection...</span>
              )}
            </div>
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-[320px]">
          <DropdownMenuLabel className="text-xs text-muted-foreground">
            {connections.length} connection{connections.length !== 1 ? 's' : ''}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {connections.map((connection) => (
            <DropdownMenuItem
              key={connection.id}
              onClick={() => onSelect(connection.id)}
              className="flex items-center justify-between py-2"
            >
              <div className="flex items-center gap-2">
                <HealthStatusDot status={connection.healthStatus} />
                <div className="flex flex-col">
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium">{connection.name}</span>
                    {connection.isPrimary && (
                      <Star className="h-3 w-3 fill-amber-500 text-amber-500" />
                    )}
                  </div>
                  <span className="font-mono text-xs text-muted-foreground">{connection.slug}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <ConnectorTypeBadge type={connection.connectorType} size="sm" />
                {connection.id === selectedConnectionId && (
                  <Check className="h-4 w-4 text-primary" />
                )}
              </div>
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={onAddConnection} className="gap-2">
            <Plus className="h-4 w-4" />
            Add Connection
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
