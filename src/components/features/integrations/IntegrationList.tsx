'use client';

import * as React from 'react';
import {
  Search,
  Filter,
  Plus,
  LayoutGrid,
  List,
  MoreHorizontal,
  Trash2,
  ExternalLink,
  Puzzle,
} from 'lucide-react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { IntegrationCard, IntegrationCardSkeleton } from './IntegrationCard';
import { IntegrationStatusBadge } from './IntegrationStatusBadge';
import { IntegrationEmptyState, IntegrationNoResults } from './IntegrationEmptyState';
import { useIntegrations, useDeleteIntegration } from '@/hooks/useIntegrations';
import { cn } from '@/lib/utils';
import type {
  IntegrationStatus,
  AuthType,
  IntegrationSummary,
} from '@/lib/modules/integrations/integration.schemas';

// =============================================================================
// Types
// =============================================================================

interface IntegrationListProps {
  className?: string;
}

type ViewMode = 'grid' | 'list';

// =============================================================================
// Component
// =============================================================================

/**
 * Main integration list component with search, filters, and grid/list view.
 */
export function IntegrationList({ className }: IntegrationListProps) {
  // State
  const [search, setSearch] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState<IntegrationStatus | 'all'>('all');
  const [authTypeFilter, setAuthTypeFilter] = React.useState<AuthType | 'all'>('all');
  const [viewMode, setViewMode] = React.useState<ViewMode>('grid');

  // Debounced search
  const [debouncedSearch, setDebouncedSearch] = React.useState('');
  React.useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Query
  const { data, isLoading, error } = useIntegrations({
    search: debouncedSearch || undefined,
    status: statusFilter === 'all' ? undefined : statusFilter,
    authType: authTypeFilter === 'all' ? undefined : authTypeFilter,
  });

  // Mutations
  const deleteIntegration = useDeleteIntegration();

  const handleDelete = React.useCallback(
    (id: string) => {
      if (confirm('Are you sure you want to delete this integration? This cannot be undone.')) {
        deleteIntegration.mutate(id);
      }
    },
    [deleteIntegration]
  );

  // Computed
  const integrations = data?.integrations ?? [];
  const hasIntegrations = integrations.length > 0;
  const hasFilters = debouncedSearch || statusFilter !== 'all' || authTypeFilter !== 'all';
  const isEmpty = !isLoading && integrations.length === 0;

  return (
    <div className={cn('space-y-6', className)}>
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold">Integrations</h1>
          <p className="text-muted-foreground">Manage your API integrations</p>
        </div>
        <Button asChild className="gap-2">
          <Link href="/integrations/new">
            <Plus className="h-4 w-4" />
            New Integration
          </Link>
        </Button>
      </div>

      {/* Filters Bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search integrations..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Status Filter */}
        <Select
          value={statusFilter}
          onValueChange={(v) => setStatusFilter(v as IntegrationStatus | 'all')}
        >
          <SelectTrigger className="w-[140px]">
            <Filter className="mr-2 h-4 w-4" />
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="error">Error</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="disabled">Disabled</SelectItem>
          </SelectContent>
        </Select>

        {/* Auth Type Filter */}
        <Select
          value={authTypeFilter}
          onValueChange={(v) => setAuthTypeFilter(v as AuthType | 'all')}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Auth Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="oauth2">OAuth 2.0</SelectItem>
            <SelectItem value="api_key">API Key</SelectItem>
            <SelectItem value="basic">Basic Auth</SelectItem>
            <SelectItem value="bearer">Bearer Token</SelectItem>
            <SelectItem value="custom_header">Custom Header</SelectItem>
          </SelectContent>
        </Select>

        {/* View Toggle */}
        <div className="flex rounded-md border">
          <Button
            variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
            size="icon"
            className="rounded-r-none"
            onClick={() => setViewMode('grid')}
          >
            <LayoutGrid className="h-4 w-4" />
            <span className="sr-only">Grid view</span>
          </Button>
          <Button
            variant={viewMode === 'list' ? 'secondary' : 'ghost'}
            size="icon"
            className="rounded-l-none"
            onClick={() => setViewMode('list')}
          >
            <List className="h-4 w-4" />
            <span className="sr-only">List view</span>
          </Button>
        </div>
      </div>

      {/* Results Count */}
      {!isLoading && hasIntegrations && (
        <p className="text-sm text-muted-foreground">
          {data?.pagination.totalCount ?? integrations.length} integration
          {integrations.length !== 1 ? 's' : ''}
          {hasFilters && ' found'}
        </p>
      )}

      {/* Content */}
      {isLoading ? (
        // Loading State
        viewMode === 'grid' ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <IntegrationCardSkeleton key={i} />
            ))}
          </div>
        ) : (
          <IntegrationTableSkeleton />
        )
      ) : error ? (
        // Error State
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-6 text-center">
          <p className="font-medium text-destructive">Failed to load integrations</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {error instanceof Error ? error.message : 'An unknown error occurred'}
          </p>
        </div>
      ) : isEmpty && !hasFilters ? (
        // Empty State (no integrations at all)
        <IntegrationEmptyState />
      ) : isEmpty && hasFilters ? (
        // No Results State (filters applied but no matches)
        <IntegrationNoResults />
      ) : viewMode === 'grid' ? (
        // Grid View
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {integrations.map((integration) => (
            <IntegrationCard
              key={integration.id}
              integration={integration}
              onDelete={handleDelete}
            />
          ))}
        </div>
      ) : (
        // Table/List View
        <IntegrationTable integrations={integrations} onDelete={handleDelete} />
      )}
    </div>
  );
}

// =============================================================================
// Table View Component
// =============================================================================

interface IntegrationTableProps {
  integrations: IntegrationSummary[];
  onDelete: (id: string) => void;
}

function IntegrationTable({ integrations, onDelete }: IntegrationTableProps) {
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[300px]">Integration</TableHead>
            <TableHead>Slug</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="w-[40px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {integrations.map((integration) => (
            <TableRow key={integration.id} className="group">
              <TableCell>
                <Link
                  href={`/integrations/${integration.id}`}
                  className="flex items-center gap-3 hover:text-primary"
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10">
                    <Puzzle className="h-4 w-4 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <span className="block truncate font-medium">{integration.name}</span>
                    {integration.description && (
                      <span className="block truncate text-xs text-muted-foreground">
                        {integration.description}
                      </span>
                    )}
                  </div>
                </Link>
              </TableCell>
              <TableCell>
                <code className="text-sm text-muted-foreground">{integration.slug}</code>
              </TableCell>
              <TableCell>
                <IntegrationStatusBadge status={integration.status} size="sm" />
              </TableCell>
              <TableCell>
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
                      <Link href={`/integrations/${integration.id}`}>View Details</Link>
                    </DropdownMenuItem>
                    {integration.documentationUrl && (
                      <DropdownMenuItem asChild>
                        <a
                          href={integration.documentationUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <ExternalLink className="mr-2 h-4 w-4" />
                          View Docs
                        </a>
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={() => onDelete(integration.id)}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function IntegrationTableSkeleton() {
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[300px]">Integration</TableHead>
            <TableHead>Slug</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="w-[40px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: 5 }).map((_, i) => (
            <TableRow key={i}>
              <TableCell>
                <div className="flex items-center gap-3">
                  <Skeleton className="h-8 w-8 rounded-md" />
                  <div className="space-y-1">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-48" />
                  </div>
                </div>
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-24" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-5 w-16 rounded-full" />
              </TableCell>
              <TableCell></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
