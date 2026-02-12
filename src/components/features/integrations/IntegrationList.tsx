'use client';

import * as React from 'react';
import {
  Search,
  Plus,
  LayoutGrid,
  List,
  MoreHorizontal,
  Trash2,
  ExternalLink,
  Sparkles,
  Wand2,
  X,
} from 'lucide-react';
import Link from 'next/link';

import { Badge } from '@/components/ui/badge';
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
import { MultiSelectFilter } from '@/components/ui/multi-select-filter';
import { IntegrationCard, IntegrationCardSkeleton } from './IntegrationCard';
import { IntegrationHealthBadge } from './IntegrationStatusBadge';
import { IntegrationEmptyState, IntegrationNoResults } from './IntegrationEmptyState';
import { TagList } from '@/components/ui/tag-badge';
import { useIntegrations, useDeleteIntegration, useTags } from '@/hooks';
import { useCompositeToolCounts } from '@/hooks/useCompositeTools';
import { DriftBadge } from '@/components/features/schema-drift/DriftBadge';
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

const AUTH_TYPE_OPTIONS = [
  { value: 'oauth2', label: 'OAuth 2.0' },
  { value: 'api_key', label: 'API Key' },
  { value: 'basic', label: 'Basic Auth' },
  { value: 'bearer', label: 'Bearer Token' },
  { value: 'custom_header', label: 'Custom Header' },
];

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
  const [authTypeFilters, setAuthTypeFilters] = React.useState<string[]>([]);
  const [tagFilters, setTagFilters] = React.useState<string[]>([]);
  const [viewMode, setViewMode] = React.useState<ViewMode>('grid');

  // Debounced search
  const [debouncedSearch, setDebouncedSearch] = React.useState('');
  React.useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Fetch available tags for filter
  const { data: tagsData } = useTags('integrations');
  const tagOptions = React.useMemo(
    () => (tagsData?.tags ?? []).map((tag) => ({ value: tag, label: tag })),
    [tagsData?.tags]
  );

  // Query - pass single authType to API when exactly 1 selected, otherwise fetch all
  const { data, isLoading, error } = useIntegrations({
    search: debouncedSearch || undefined,
    status: statusFilter === 'all' ? undefined : statusFilter,
    authType: authTypeFilters.length === 1 ? (authTypeFilters[0] as AuthType) : undefined,
    tags: tagFilters.length > 0 ? tagFilters : undefined,
  });

  // Mutations
  const deleteIntegration = useDeleteIntegration();

  // Fetch composite tool counts per integration
  const { data: compositeToolCountsData } = useCompositeToolCounts();
  const aiToolCounts = compositeToolCountsData?.counts ?? {};

  const handleDelete = React.useCallback(
    (id: string) => {
      if (confirm('Are you sure you want to delete this integration? This cannot be undone.')) {
        deleteIntegration.mutate(id);
      }
    },
    [deleteIntegration]
  );

  // Client-side filtering for multi-select auth type
  const filteredIntegrations = React.useMemo(() => {
    let results = data?.integrations ?? [];
    if (authTypeFilters.length > 1) {
      results = results.filter((i) => authTypeFilters.includes(i.authType));
    }
    return results;
  }, [data?.integrations, authTypeFilters]);

  // Computed
  const hasIntegrations = filteredIntegrations.length > 0;
  const hasFilters =
    debouncedSearch ||
    statusFilter !== 'all' ||
    authTypeFilters.length > 0 ||
    tagFilters.length > 0;
  const isEmpty = !isLoading && filteredIntegrations.length === 0;

  const clearAllFilters = () => {
    setSearch('');
    setStatusFilter('all');
    setAuthTypeFilters([]);
    setTagFilters([]);
  };

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

        {/* Status Filter (single-select, small fixed set) */}
        <Select
          value={statusFilter}
          onValueChange={(v) => setStatusFilter(v as IntegrationStatus | 'all')}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="All Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="error">Error</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="disabled">Disabled</SelectItem>
          </SelectContent>
        </Select>

        {/* Auth Type Filter (multi-select with search) */}
        <MultiSelectFilter
          options={AUTH_TYPE_OPTIONS}
          selected={authTypeFilters}
          onSelectionChange={setAuthTypeFilters}
          placeholder="All Types"
          searchPlaceholder="Search types..."
          emptyMessage="No types found."
          className="w-[160px]"
        />

        {/* Tag Filter (multi-select with search) */}
        {tagOptions.length > 0 && (
          <MultiSelectFilter
            options={tagOptions}
            selected={tagFilters}
            onSelectionChange={setTagFilters}
            placeholder="All Tags"
            searchPlaceholder="Search tags..."
            emptyMessage="No tags found."
            className="w-[160px]"
          />
        )}

        {/* Clear Filters */}
        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearAllFilters}
            className="h-9 gap-1 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
            Clear
          </Button>
        )}

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
          {filteredIntegrations.length} integration
          {filteredIntegrations.length !== 1 ? 's' : ''}
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
          {filteredIntegrations.map((integration) => (
            <IntegrationCard
              key={integration.id}
              integration={integration}
              onDelete={handleDelete}
              aiToolCount={aiToolCounts[integration.id]}
            />
          ))}
        </div>
      ) : (
        // Table/List View
        <IntegrationTable
          integrations={filteredIntegrations}
          onDelete={handleDelete}
          aiToolCounts={aiToolCounts}
        />
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
  aiToolCounts?: Record<string, number>;
}

function IntegrationTable({ integrations, onDelete, aiToolCounts = {} }: IntegrationTableProps) {
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[300px]">Integration</TableHead>
            <TableHead>Slug</TableHead>
            <TableHead>Tags</TableHead>
            <TableHead>AI Tools</TableHead>
            <TableHead>Drift</TableHead>
            <TableHead>Health</TableHead>
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
                  <div className="flex h-8 w-8 items-center justify-center rounded-md bg-gradient-to-br from-violet-500/10 to-indigo-500/10">
                    <Sparkles className="h-4 w-4 text-violet-600 dark:text-violet-400" />
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
                <TagList tags={integration.tags} size="sm" maxVisible={2} />
              </TableCell>
              <TableCell>
                {aiToolCounts[integration.id] ? (
                  <Badge
                    variant="secondary"
                    className="gap-1 bg-violet-500/10 text-violet-600 dark:text-violet-400"
                  >
                    <Wand2 className="h-3 w-3" />
                    {aiToolCounts[integration.id]}
                  </Badge>
                ) : (
                  <span className="text-sm text-muted-foreground">-</span>
                )}
              </TableCell>
              <TableCell>
                <DriftBadge integrationId={integration.id} />
              </TableCell>
              <TableCell>
                <IntegrationHealthBadge
                  integrationStatus={integration.status}
                  connectionHealth={integration.connectionHealth}
                  size="sm"
                />
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
            <TableHead>Tags</TableHead>
            <TableHead>AI Tools</TableHead>
            <TableHead>Drift</TableHead>
            <TableHead>Health</TableHead>
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
                <Skeleton className="h-5 w-20 rounded-md" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-5 w-10 rounded-md" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-5 w-12 rounded-full" />
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
