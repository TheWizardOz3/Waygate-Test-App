'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { RefreshCw, Clock, CheckCircle2, XCircle, Loader2, Ban } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
import { Skeleton } from '@/components/ui/skeleton';
import { useJobs } from '@/hooks';
import type { AsyncJobResponse } from '@/lib/modules/jobs/jobs.schemas';

// =============================================================================
// Status Badge
// =============================================================================

const STATUS_CONFIG: Record<
  string,
  {
    label: string;
    variant: 'default' | 'secondary' | 'destructive' | 'outline';
    icon: React.ComponentType<{ className?: string }>;
  }
> = {
  queued: { label: 'Queued', variant: 'secondary', icon: Clock },
  running: { label: 'Running', variant: 'default', icon: Loader2 },
  completed: { label: 'Completed', variant: 'outline', icon: CheckCircle2 },
  failed: { label: 'Failed', variant: 'destructive', icon: XCircle },
  cancelled: { label: 'Cancelled', variant: 'secondary', icon: Ban },
};

function JobStatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] ?? {
    label: status,
    variant: 'secondary' as const,
    icon: Clock,
  };
  const Icon = config.icon;

  return (
    <Badge variant={config.variant} className="gap-1">
      <Icon className={`h-3 w-3 ${status === 'running' ? 'animate-spin' : ''}`} />
      {config.label}
    </Badge>
  );
}

// =============================================================================
// Job Type Badge
// =============================================================================

function JobTypeBadge({ type }: { type: string }) {
  const label = type.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
  return <Badge variant="outline">{label}</Badge>;
}

// =============================================================================
// Progress Bar (inline)
// =============================================================================

function InlineProgress({ progress }: { progress: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-20 rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: `${progress}%` }}
        />
      </div>
      <span className="text-xs text-muted-foreground">{progress}%</span>
    </div>
  );
}

// =============================================================================
// Job Row
// =============================================================================

function JobRow({ job }: { job: AsyncJobResponse }) {
  return (
    <TableRow className="cursor-pointer hover:bg-muted/50">
      <TableCell>
        <Link href={`/jobs/${job.id}`} className="block">
          <code className="text-xs text-muted-foreground">{job.id.slice(0, 8)}...</code>
        </Link>
      </TableCell>
      <TableCell>
        <Link href={`/jobs/${job.id}`} className="block">
          <JobTypeBadge type={job.type} />
        </Link>
      </TableCell>
      <TableCell>
        <Link href={`/jobs/${job.id}`} className="block">
          <JobStatusBadge status={job.status} />
        </Link>
      </TableCell>
      <TableCell>
        <Link href={`/jobs/${job.id}`} className="block">
          <InlineProgress progress={job.progress} />
        </Link>
      </TableCell>
      <TableCell>
        <Link href={`/jobs/${job.id}`} className="block text-xs text-muted-foreground">
          {job.attempts}/{job.maxAttempts}
        </Link>
      </TableCell>
      <TableCell>
        <Link href={`/jobs/${job.id}`} className="block text-xs text-muted-foreground">
          {formatDistanceToNow(new Date(job.createdAt), { addSuffix: true })}
        </Link>
      </TableCell>
    </TableRow>
  );
}

// =============================================================================
// Loading Skeleton
// =============================================================================

function LoadingSkeleton() {
  return (
    <>
      {Array.from({ length: 5 }).map((_, i) => (
        <TableRow key={i}>
          <TableCell>
            <Skeleton className="h-4 w-20" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-5 w-24" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-5 w-20" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-2 w-24" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-8" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-24" />
          </TableCell>
        </TableRow>
      ))}
    </>
  );
}

// =============================================================================
// JobList Component
// =============================================================================

export function JobList() {
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [cursor, setCursor] = useState<string | undefined>(undefined);

  const params = {
    type: typeFilter !== 'all' ? typeFilter : undefined,
    status: statusFilter !== 'all' ? statusFilter : undefined,
    cursor,
    limit: 20,
  };

  const { data, isLoading, isError, refetch, isFetching } = useJobs(params);

  const jobs = data?.jobs ?? [];
  const pagination = data?.pagination;

  const handleNextPage = useCallback(() => {
    if (pagination?.cursor) {
      setCursor(pagination.cursor);
    }
  }, [pagination?.cursor]);

  const handleReset = useCallback(() => {
    setCursor(undefined);
    setTypeFilter('all');
    setStatusFilter('all');
  }, []);

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4">
        {/* Type Filter */}
        <Select
          value={typeFilter}
          onValueChange={(v) => {
            setTypeFilter(v);
            setCursor(undefined);
          }}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Job type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="batch_operation">Batch Operation</SelectItem>
            <SelectItem value="schema_drift">Schema Drift</SelectItem>
            <SelectItem value="scrape">Scrape</SelectItem>
          </SelectContent>
        </Select>

        {/* Status Filter */}
        <Select
          value={statusFilter}
          onValueChange={(v) => {
            setStatusFilter(v);
            setCursor(undefined);
          }}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="queued">Queued</SelectItem>
            <SelectItem value="running">Running</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>

        <div className="flex-1" />

        {/* Refresh */}
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[120px]">ID</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Progress</TableHead>
              <TableHead className="w-[80px]">Attempts</TableHead>
              <TableHead>Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <LoadingSkeleton />
            ) : isError ? (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                  Failed to load jobs.{' '}
                  <Button variant="link" onClick={() => refetch()}>
                    Try again
                  </Button>
                </TableCell>
              </TableRow>
            ) : jobs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                  No jobs found.
                  {(typeFilter !== 'all' || statusFilter !== 'all') && (
                    <Button variant="link" onClick={handleReset}>
                      Clear filters
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ) : (
              jobs.map((job) => <JobRow key={job.id} job={job} />)
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {pagination && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {pagination.totalCount} job{pagination.totalCount !== 1 ? 's' : ''} total
          </p>
          <div className="flex items-center gap-2">
            {cursor && (
              <Button variant="outline" size="sm" onClick={() => setCursor(undefined)}>
                First page
              </Button>
            )}
            {pagination.hasMore && (
              <Button variant="outline" size="sm" onClick={handleNextPage}>
                Next page
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
