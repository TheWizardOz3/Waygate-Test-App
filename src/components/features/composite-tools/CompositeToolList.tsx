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
  Wand2,
  Edit,
  Download,
  GitBranch,
  Sparkles,
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
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import { useCompositeTools, useDeleteCompositeTool } from '@/hooks/useCompositeTools';
import { cn } from '@/lib/utils';
import type {
  CompositeToolStatus,
  CompositeToolRoutingMode,
  CompositeToolResponse,
} from '@/lib/modules/composite-tools/composite-tool.schemas';

// =============================================================================
// Types
// =============================================================================

interface CompositeToolListProps {
  className?: string;
}

type ViewMode = 'grid' | 'list';
type ToolTypeFilter = 'all' | 'composite';

// =============================================================================
// Helpers
// =============================================================================

function getStatusBadgeVariant(status: CompositeToolStatus) {
  switch (status) {
    case 'active':
      return 'default';
    case 'draft':
      return 'secondary';
    case 'disabled':
      return 'outline';
    default:
      return 'secondary';
  }
}

function getRoutingModeLabel(mode: CompositeToolRoutingMode) {
  switch (mode) {
    case 'rule_based':
      return 'Rule-Based';
    case 'agent_driven':
      return 'Agent-Driven';
    default:
      return mode;
  }
}

// =============================================================================
// Component
// =============================================================================

/**
 * Main AI Tools list component with search, filters, and grid/list view.
 */
export function CompositeToolList({ className }: CompositeToolListProps) {
  // State
  const [search, setSearch] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState<CompositeToolStatus | 'all'>('all');
  const [typeFilter, setTypeFilter] = React.useState<ToolTypeFilter>('all');
  const [routingModeFilter, setRoutingModeFilter] = React.useState<
    CompositeToolRoutingMode | 'all'
  >('all');
  const [viewMode, setViewMode] = React.useState<ViewMode>('grid');

  // Debounced search
  const [debouncedSearch, setDebouncedSearch] = React.useState('');
  React.useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Query
  const { data, isLoading, error } = useCompositeTools({
    search: debouncedSearch || undefined,
    status: statusFilter === 'all' ? undefined : statusFilter,
    routingMode: routingModeFilter === 'all' ? undefined : routingModeFilter,
  });

  // Mutations
  const deleteTool = useDeleteCompositeTool();

  const handleDelete = React.useCallback(
    (id: string) => {
      if (confirm('Are you sure you want to delete this tool? This cannot be undone.')) {
        deleteTool.mutate(id);
      }
    },
    [deleteTool]
  );

  // Computed
  const tools = data?.compositeTools ?? [];
  const hasTools = tools.length > 0;
  const hasFilters =
    debouncedSearch ||
    statusFilter !== 'all' ||
    routingModeFilter !== 'all' ||
    typeFilter !== 'all';
  const isEmpty = !isLoading && tools.length === 0;

  return (
    <div className={cn('space-y-6', className)}>
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold">AI Tools</h1>
          <p className="text-muted-foreground">Manage your composite and agentic tools</p>
        </div>
        <Button asChild className="gap-2">
          <Link href="/ai-tools/new">
            <Plus className="h-4 w-4" />
            Create Tool
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
            placeholder="Search tools..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Type Filter (for future: Simple | Composite | Agentic) */}
        <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as ToolTypeFilter)}>
          <SelectTrigger className="w-[140px]">
            <Filter className="mr-2 h-4 w-4" />
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="composite">Composite</SelectItem>
          </SelectContent>
        </Select>

        {/* Status Filter */}
        <Select
          value={statusFilter}
          onValueChange={(v) => setStatusFilter(v as CompositeToolStatus | 'all')}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="disabled">Disabled</SelectItem>
          </SelectContent>
        </Select>

        {/* Routing Mode Filter */}
        <Select
          value={routingModeFilter}
          onValueChange={(v) => setRoutingModeFilter(v as CompositeToolRoutingMode | 'all')}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Routing" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Routing</SelectItem>
            <SelectItem value="rule_based">Rule-Based</SelectItem>
            <SelectItem value="agent_driven">Agent-Driven</SelectItem>
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
      {!isLoading && hasTools && (
        <p className="text-sm text-muted-foreground">
          {data?.pagination.totalCount ?? tools.length} tool{tools.length !== 1 ? 's' : ''}
          {hasFilters && ' found'}
        </p>
      )}

      {/* Content */}
      {isLoading ? (
        // Loading State
        viewMode === 'grid' ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <CompositeToolCardSkeleton key={i} />
            ))}
          </div>
        ) : (
          <CompositeToolTableSkeleton />
        )
      ) : error ? (
        // Error State
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-6 text-center">
          <p className="font-medium text-destructive">Failed to load tools</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {error instanceof Error ? error.message : 'An unknown error occurred'}
          </p>
        </div>
      ) : isEmpty && !hasFilters ? (
        // Empty State (no tools at all)
        <CompositeToolEmptyState />
      ) : isEmpty && hasFilters ? (
        // No Results State (filters applied but no matches)
        <CompositeToolNoResults />
      ) : viewMode === 'grid' ? (
        // Grid View
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {tools.map((tool) => (
            <CompositeToolCard key={tool.id} tool={tool} onDelete={handleDelete} />
          ))}
        </div>
      ) : (
        // Table/List View
        <CompositeToolTable tools={tools} onDelete={handleDelete} />
      )}
    </div>
  );
}

// =============================================================================
// Card Component
// =============================================================================

interface CompositeToolCardProps {
  tool: CompositeToolResponse;
  onDelete: (id: string) => void;
}

function CompositeToolCard({ tool, onDelete }: CompositeToolCardProps) {
  return (
    <Card className="group relative overflow-hidden transition-shadow hover:shadow-md">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <Link href={`/ai-tools/${tool.id}`} className="min-w-0 flex-1">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500/10 to-indigo-500/10">
                <Wand2 className="h-5 w-5 text-violet-600 dark:text-violet-400" />
              </div>
              <div className="min-w-0">
                <h3 className="truncate font-medium group-hover:text-primary">{tool.name}</h3>
                <code className="text-xs text-muted-foreground">{tool.slug}</code>
              </div>
            </div>
          </Link>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                <MoreHorizontal className="h-4 w-4" />
                <span className="sr-only">More actions</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link href={`/ai-tools/${tool.id}`}>
                  <Edit className="mr-2 h-4 w-4" />
                  Edit
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href={`/ai-tools/${tool.id}?tab=export`}>
                  <Download className="mr-2 h-4 w-4" />
                  Export
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => onDelete(tool.id)}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {tool.description && (
          <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">{tool.description}</p>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Badge variant={getStatusBadgeVariant(tool.status)}>{tool.status}</Badge>
          <Badge variant="outline" className="gap-1">
            <GitBranch className="h-3 w-3" />
            {getRoutingModeLabel(tool.routingMode)}
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}

function CompositeToolCardSkeleton() {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <Skeleton className="h-10 w-10 rounded-lg" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
        <Skeleton className="mt-3 h-8 w-full" />
        <div className="mt-4 flex gap-2">
          <Skeleton className="h-5 w-16 rounded-full" />
          <Skeleton className="h-5 w-24 rounded-full" />
        </div>
      </CardContent>
    </Card>
  );
}

// =============================================================================
// Table View Component
// =============================================================================

interface CompositeToolTableProps {
  tools: CompositeToolResponse[];
  onDelete: (id: string) => void;
}

function CompositeToolTable({ tools, onDelete }: CompositeToolTableProps) {
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[300px]">Tool</TableHead>
            <TableHead>Slug</TableHead>
            <TableHead>Routing</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="w-[40px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tools.map((tool) => (
            <TableRow key={tool.id} className="group">
              <TableCell>
                <Link
                  href={`/ai-tools/${tool.id}`}
                  className="flex items-center gap-3 hover:text-primary"
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-md bg-gradient-to-br from-violet-500/10 to-indigo-500/10">
                    <Wand2 className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                  </div>
                  <div className="min-w-0">
                    <span className="block truncate font-medium">{tool.name}</span>
                    {tool.description && (
                      <span className="block truncate text-xs text-muted-foreground">
                        {tool.description}
                      </span>
                    )}
                  </div>
                </Link>
              </TableCell>
              <TableCell>
                <code className="text-sm text-muted-foreground">{tool.slug}</code>
              </TableCell>
              <TableCell>
                <Badge variant="outline" className="gap-1">
                  <GitBranch className="h-3 w-3" />
                  {getRoutingModeLabel(tool.routingMode)}
                </Badge>
              </TableCell>
              <TableCell>
                <Badge variant={getStatusBadgeVariant(tool.status)}>{tool.status}</Badge>
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
                      <Link href={`/ai-tools/${tool.id}`}>
                        <Edit className="mr-2 h-4 w-4" />
                        Edit
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href={`/ai-tools/${tool.id}?tab=export`}>
                        <Download className="mr-2 h-4 w-4" />
                        Export
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={() => onDelete(tool.id)}
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

function CompositeToolTableSkeleton() {
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[300px]">Tool</TableHead>
            <TableHead>Slug</TableHead>
            <TableHead>Routing</TableHead>
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
                <Skeleton className="h-5 w-24 rounded-full" />
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

// =============================================================================
// Empty States
// =============================================================================

function CompositeToolEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-violet-100 dark:bg-violet-900/20">
        <Wand2 className="h-8 w-8 text-violet-600 dark:text-violet-400" />
      </div>
      <h3 className="mt-4 font-heading text-lg font-semibold">No AI Tools Yet</h3>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">
        Create your first composite tool to combine multiple operations into a single, intelligent
        tool for your AI agents.
      </p>
      <Button asChild className="mt-6 gap-2">
        <Link href="/ai-tools/new">
          <Plus className="h-4 w-4" />
          Create Your First Tool
        </Link>
      </Button>
    </div>
  );
}

function CompositeToolNoResults() {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border p-12 text-center">
      <Sparkles className="h-10 w-10 text-muted-foreground" />
      <h3 className="mt-4 font-heading text-lg font-semibold">No Tools Found</h3>
      <p className="mt-2 text-sm text-muted-foreground">
        No tools match your current filters. Try adjusting your search criteria.
      </p>
    </div>
  );
}

export default CompositeToolList;
