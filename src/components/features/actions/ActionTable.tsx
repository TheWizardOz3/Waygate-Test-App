'use client';

import { useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  useReactTable,
  SortingState,
  ColumnFiltersState,
  RowSelectionState,
} from '@tanstack/react-table';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Search,
  MoreHorizontal,
  Pencil,
  Trash2,
  Play,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  Shield,
  ShieldCheck,
  ShieldAlert,
} from 'lucide-react';
import { CopyButton } from '@/components/ui/copy-button';
import { MethodBadge } from './MethodBadge';
import { DeleteActionDialog, BulkDeleteActionsDialog } from './DeleteActionDialog';
import { BulkActionBar } from './BulkActionBar';
import { TagFilter } from '@/components/features/integrations/TagFilter';
import { TagList } from '@/components/ui/tag-badge';
import { useActions, useBulkDeleteActions, useIntegration, useTags } from '@/hooks';
import type { ActionResponse } from '@/lib/modules/actions/action.schemas';
import type { IntegrationResponse } from '@/lib/modules/integrations/integration.schemas';

interface ActionTableProps {
  integrationId: string;
  /** Pass integration to avoid redundant fetch - if not provided, will be fetched */
  integration?: IntegrationResponse;
  /** Selected connection ID to include in action navigation links */
  selectedConnectionId?: string | null;
}

/**
 * Build the Waygate Gateway API endpoint for an action
 */
function buildWaygateEndpoint(integrationSlug: string, actionSlug: string): string {
  return `/api/v1/actions/${integrationSlug}/${actionSlug}`;
}

export function ActionTable({
  integrationId,
  integration: integrationProp,
  selectedConnectionId,
}: ActionTableProps) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [methodFilter, setMethodFilter] = useState<string>('all');
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const [actionToDelete, setActionToDelete] = useState<ActionResponse | null>(null);
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);

  const { data, isLoading, isError } = useActions(integrationId);
  // Only fetch integration if not passed as prop (avoids redundant queries)
  const { data: fetchedIntegration } = useIntegration(integrationProp ? undefined : integrationId);
  const integration = integrationProp ?? fetchedIntegration;
  const { data: tagsData } = useTags('actions');
  const bulkDelete = useBulkDeleteActions();

  const integrationSlug = integration?.slug;

  // Build action URLs with optional connection param
  const actionUrl = useCallback(
    (actionId: string, suffix?: string) => {
      const base = `/integrations/${integrationId}/actions/${actionId}${suffix ?? ''}`;
      return selectedConnectionId ? `${base}?connection=${selectedConnectionId}` : base;
    },
    [integrationId, selectedConnectionId]
  );

  const availableTags = tagsData?.tags ?? [];

  // Filter by method and tags
  const filteredActions = useMemo(() => {
    const actions = data?.actions ?? [];
    return actions.filter((action) => {
      if (methodFilter !== 'all' && action.httpMethod !== methodFilter) return false;
      if (tagFilter.length > 0 && !tagFilter.some((tag) => action.tags?.includes(tag))) {
        return false;
      }
      return true;
    });
  }, [data?.actions, methodFilter, tagFilter]);

  // Define columns
  const columns: ColumnDef<ActionResponse>[] = useMemo(
    () => [
      {
        id: 'select',
        header: ({ table }) => (
          <Checkbox
            checked={
              table.getIsAllPageRowsSelected() ||
              (table.getIsSomePageRowsSelected() && 'indeterminate')
            }
            onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
            aria-label="Select all"
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(value) => row.toggleSelected(!!value)}
            aria-label="Select row"
          />
        ),
        enableSorting: false,
        enableHiding: false,
        size: 40,
      },
      {
        id: 'test',
        header: '',
        cell: ({ row }) => (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-accent"
            asChild
            title="Test action"
          >
            <Link href={actionUrl(row.original.id, '/test')}>
              <Play className="h-4 w-4" />
              <span className="sr-only">Test</span>
            </Link>
          </Button>
        ),
        enableSorting: false,
        enableHiding: false,
        size: 40,
      },
      {
        accessorKey: 'name',
        header: ({ column }) => (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            className="-ml-4"
          >
            Name
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        ),
        cell: ({ row }) => (
          <Link
            href={actionUrl(row.original.id)}
            className="font-medium text-foreground hover:text-secondary hover:underline"
          >
            {row.getValue('name')}
          </Link>
        ),
      },
      {
        accessorKey: 'httpMethod',
        header: 'Method',
        cell: ({ row }) => <MethodBadge method={row.getValue('httpMethod')} />,
        size: 100,
      },
      {
        accessorKey: 'endpointTemplate',
        header: 'Endpoint',
        cell: ({ row }) => {
          const endpoint = row.getValue('endpointTemplate') as string;
          const actionSlug = row.original.slug;
          // Build the full Waygate Gateway URL for copying
          const waygateEndpoint = integrationSlug
            ? buildWaygateEndpoint(integrationSlug, actionSlug)
            : endpoint;
          const fullUrl =
            typeof window !== 'undefined' && integrationSlug
              ? `${window.location.origin}${waygateEndpoint}`
              : waygateEndpoint;
          return (
            <div className="group/endpoint flex items-center gap-1">
              <code className="text-sm text-muted-foreground">{endpoint}</code>
              <CopyButton
                value={fullUrl}
                label="Waygate endpoint copied"
                size="sm"
                className="opacity-0 transition-opacity group-hover/endpoint:opacity-100"
                showTooltip={false}
              />
            </div>
          );
        },
      },
      {
        accessorKey: 'description',
        header: 'Description',
        size: 250,
        cell: ({ row }) => (
          <span
            className="line-clamp-2 text-sm text-muted-foreground"
            title={row.getValue('description') || ''}
          >
            {row.getValue('description') || '—'}
          </span>
        ),
      },
      {
        id: 'tags',
        header: 'Tags',
        size: 150,
        cell: ({ row }) => <TagList tags={row.original.tags ?? []} size="sm" maxVisible={2} />,
      },
      {
        id: 'validation',
        header: 'Validation',
        size: 120,
        cell: ({ row }) => {
          const validationConfig = row.original.validationConfig as
            | {
                enabled?: boolean;
                mode?: 'strict' | 'warn' | 'lenient';
              }
            | null
            | undefined;

          if (!validationConfig || validationConfig.enabled === false) {
            return (
              <Badge variant="outline" className="gap-1 text-xs text-muted-foreground">
                <Shield className="h-3 w-3" />
                Off
              </Badge>
            );
          }

          const mode = validationConfig.mode || 'warn';
          const modeConfig = {
            strict: {
              icon: ShieldAlert,
              label: 'Strict',
              variant: 'destructive' as const,
            },
            warn: {
              icon: ShieldCheck,
              label: 'Warn',
              variant: 'secondary' as const,
            },
            lenient: {
              icon: Shield,
              label: 'Lenient',
              variant: 'outline' as const,
            },
          };

          const config = modeConfig[mode];
          const Icon = config.icon;

          return (
            <Badge variant={config.variant} className="gap-1 text-xs">
              <Icon className="h-3 w-3" />
              {config.label}
            </Badge>
          );
        },
      },
      {
        id: 'actions',
        cell: ({ row }) => (
          <div className="flex items-center gap-1">
            {/* More Actions Menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <MoreHorizontal className="h-4 w-4" />
                  <span className="sr-only">Actions</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem asChild>
                  <Link href={actionUrl(row.original.id)}>
                    <Pencil className="mr-2 h-4 w-4" />
                    Edit
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href={actionUrl(row.original.id, '/test')}>
                    <Play className="mr-2 h-4 w-4" />
                    Test
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setActionToDelete(row.original)}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ),
        size: 80,
      },
    ],
    [integrationSlug, actionUrl]
  );

  const table = useReactTable({
    data: filteredActions,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onRowSelectionChange: setRowSelection,
    state: {
      sorting,
      columnFilters,
      rowSelection,
    },
    initialState: {
      pagination: {
        pageSize: 10,
      },
    },
  });

  const selectedRowIds = Object.keys(rowSelection).filter((key) => rowSelection[key]);
  const selectedActions = selectedRowIds.map((id) => filteredActions[parseInt(id)]).filter(Boolean);

  const handleBulkDelete = async () => {
    await bulkDelete.mutateAsync({
      ids: selectedActions.map((a) => a.id),
      integrationId,
    });
    setRowSelection({});
  };

  if (isLoading) {
    return <ActionTableSkeleton />;
  }

  if (isError) {
    return (
      <div className="py-12 text-center text-destructive">
        Failed to load actions. Please try again.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="relative min-w-[200px] max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search actions..."
            value={(table.getColumn('name')?.getFilterValue() as string) ?? ''}
            onChange={(e) => table.getColumn('name')?.setFilterValue(e.target.value)}
            className="pl-9"
          />
        </div>

        <Select value={methodFilter} onValueChange={setMethodFilter}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Method" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Methods</SelectItem>
            <SelectItem value="GET">GET</SelectItem>
            <SelectItem value="POST">POST</SelectItem>
            <SelectItem value="PUT">PUT</SelectItem>
            <SelectItem value="PATCH">PATCH</SelectItem>
            <SelectItem value="DELETE">DELETE</SelectItem>
          </SelectContent>
        </Select>

        {availableTags.length > 0 && (
          <TagFilter
            selectedTags={tagFilter}
            onSelectionChange={setTagFilter}
            availableTags={availableTags}
          />
        )}
      </div>

      {/* Bulk action bar */}
      {selectedActions.length > 0 && (
        <BulkActionBar
          selectedCount={selectedActions.length}
          onDelete={() => setShowBulkDeleteDialog(true)}
          onClearSelection={() => setRowSelection({})}
        />
      )}

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id} style={{ width: header.getSize() }}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id} data-state={row.getIsSelected() && 'selected'}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center">
                  No actions found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {filteredActions.length} action{filteredActions.length !== 1 && 's'}
          {selectedActions.length > 0 && ` (${selectedActions.length} selected)`}
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            <ChevronLeft className="h-4 w-4" />
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Delete dialogs */}
      <DeleteActionDialog
        action={actionToDelete}
        open={!!actionToDelete}
        onOpenChange={(open) => !open && setActionToDelete(null)}
      />

      <BulkDeleteActionsDialog
        count={selectedActions.length}
        integrationId={integrationId}
        open={showBulkDeleteDialog}
        onOpenChange={setShowBulkDeleteDialog}
        onConfirm={handleBulkDelete}
        isPending={bulkDelete.isPending}
      />
    </div>
  );
}

function ActionTableSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <Skeleton className="h-10 max-w-sm flex-1" />
        <Skeleton className="h-10 w-[140px]" />
        <Skeleton className="h-10 w-[140px]" />
      </div>
      <div className="rounded-md border">
        <div className="space-y-4 p-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4">
              <Skeleton className="h-4 w-4" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-6 w-16" />
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-8 w-8" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
