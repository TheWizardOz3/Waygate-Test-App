'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  RefreshCw,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  Ban,
  RotateCcw,
  StopCircle,
} from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { useJob, useJobItems, useCancelJob, useRetryJob } from '@/hooks';

// =============================================================================
// Status Helpers
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

const ITEM_STATUS_CONFIG: Record<
  string,
  { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }
> = {
  pending: { label: 'Pending', variant: 'secondary' },
  running: { label: 'Running', variant: 'default' },
  completed: { label: 'Completed', variant: 'outline' },
  failed: { label: 'Failed', variant: 'destructive' },
  skipped: { label: 'Skipped', variant: 'secondary' },
};

function JobStatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] ?? {
    label: status,
    variant: 'secondary' as const,
    icon: Clock,
  };
  const Icon = config.icon;
  return (
    <Badge variant={config.variant} className="gap-1 text-sm">
      <Icon className={`h-3.5 w-3.5 ${status === 'running' ? 'animate-spin' : ''}`} />
      {config.label}
    </Badge>
  );
}

function ItemStatusBadge({ status }: { status: string }) {
  const config = ITEM_STATUS_CONFIG[status] ?? { label: status, variant: 'secondary' as const };
  return <Badge variant={config.variant}>{config.label}</Badge>;
}

// =============================================================================
// JobDetail Component
// =============================================================================

interface JobDetailProps {
  jobId: string;
}

export function JobDetail({ jobId }: JobDetailProps) {
  const { data: job, isLoading, isError, refetch } = useJob(jobId);
  const cancelMutation = useCancelJob();
  const retryMutation = useRetryJob();

  const [itemStatusFilter, setItemStatusFilter] = useState<string>('all');

  const { data: itemsData, isLoading: itemsLoading } = useJobItems(jobId, {
    status: itemStatusFilter !== 'all' ? itemStatusFilter : undefined,
    limit: 50,
  });

  if (isLoading) {
    return <JobDetailSkeleton />;
  }

  if (isError || !job) {
    return (
      <div className="space-y-4">
        <Link
          href="/jobs"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Jobs
        </Link>
        <div className="py-12 text-center text-muted-foreground">
          Job not found or failed to load.
          <Button variant="link" onClick={() => refetch()}>
            Try again
          </Button>
        </div>
      </div>
    );
  }

  const canCancel = job.status === 'queued' || job.status === 'running';
  const canRetry = job.status === 'failed';
  const hasItems = job.itemCounts.total > 0;

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link
        href="/jobs"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Jobs
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h2 className="font-heading text-xl font-bold">
              {job.type.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
            </h2>
            <JobStatusBadge status={job.status} />
          </div>
          <p className="text-sm text-muted-foreground">
            <code>{job.id}</code>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
          {canCancel && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => cancelMutation.mutate(jobId)}
              disabled={cancelMutation.isPending}
            >
              <StopCircle className="mr-2 h-4 w-4" />
              Cancel
            </Button>
          )}
          {canRetry && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => retryMutation.mutate(jobId)}
              disabled={retryMutation.isPending}
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              Retry
            </Button>
          )}
        </div>
      </div>

      {/* Progress */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Progress</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{job.progress}% complete</span>
            <span className="text-muted-foreground">
              Attempt {job.attempts}/{job.maxAttempts}
            </span>
          </div>
          <Progress value={job.progress} className="h-2" />
          {job.progressDetails && (
            <p className="text-xs text-muted-foreground">{JSON.stringify(job.progressDetails)}</p>
          )}
        </CardContent>
      </Card>

      {/* Details Grid */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Created</p>
            <p className="text-sm font-medium">
              {format(new Date(job.createdAt), 'MMM d, HH:mm:ss')}
            </p>
            <p className="text-xs text-muted-foreground">
              {formatDistanceToNow(new Date(job.createdAt), { addSuffix: true })}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Started</p>
            <p className="text-sm font-medium">
              {job.startedAt ? format(new Date(job.startedAt), 'MMM d, HH:mm:ss') : 'Not started'}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Completed</p>
            <p className="text-sm font-medium">
              {job.completedAt
                ? format(new Date(job.completedAt), 'MMM d, HH:mm:ss')
                : 'In progress'}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Timeout</p>
            <p className="text-sm font-medium">{job.timeoutSeconds}s</p>
          </CardContent>
        </Card>
      </div>

      {/* Error Details */}
      {job.error && (
        <Card className="border-destructive/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-destructive">Error Details</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="whitespace-pre-wrap rounded-md bg-destructive/5 p-3 text-xs">
              {JSON.stringify(job.error, null, 2)}
            </pre>
          </CardContent>
        </Card>
      )}

      {/* Output */}
      {job.output && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Output</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="whitespace-pre-wrap rounded-md bg-muted p-3 text-xs">
              {JSON.stringify(job.output, null, 2)}
            </pre>
          </CardContent>
        </Card>
      )}

      {/* Input */}
      {job.input && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Input</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="whitespace-pre-wrap rounded-md bg-muted p-3 text-xs">
              {JSON.stringify(job.input, null, 2)}
            </pre>
          </CardContent>
        </Card>
      )}

      {/* Batch Items */}
      {hasItems && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium">Items ({job.itemCounts.total})</CardTitle>
              <div className="flex items-center gap-2">
                <ItemCountBadges counts={job.itemCounts} />
                <Select value={itemStatusFilter} onValueChange={setItemStatusFilter}>
                  <SelectTrigger className="h-8 w-[140px]">
                    <SelectValue placeholder="Filter status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="running">Running</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="failed">Failed</SelectItem>
                    <SelectItem value="skipped">Skipped</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[120px]">ID</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Attempts</TableHead>
                    <TableHead>Completed</TableHead>
                    <TableHead>Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {itemsLoading ? (
                    Array.from({ length: 3 }).map((_, i) => (
                      <TableRow key={i}>
                        <TableCell>
                          <Skeleton className="h-4 w-20" />
                        </TableCell>
                        <TableCell>
                          <Skeleton className="h-5 w-16" />
                        </TableCell>
                        <TableCell>
                          <Skeleton className="h-4 w-8" />
                        </TableCell>
                        <TableCell>
                          <Skeleton className="h-4 w-24" />
                        </TableCell>
                        <TableCell>
                          <Skeleton className="h-4 w-32" />
                        </TableCell>
                      </TableRow>
                    ))
                  ) : !itemsData?.items.length ? (
                    <TableRow>
                      <TableCell colSpan={5} className="py-4 text-center text-muted-foreground">
                        No items found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    itemsData.items.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>
                          <code className="text-xs text-muted-foreground">
                            {item.id.slice(0, 8)}...
                          </code>
                        </TableCell>
                        <TableCell>
                          <ItemStatusBadge status={item.status} />
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {item.attempts}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {item.completedAt
                            ? formatDistanceToNow(new Date(item.completedAt), { addSuffix: true })
                            : '-'}
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate text-xs text-muted-foreground">
                          {item.error
                            ? JSON.stringify(item.error)
                            : item.output
                              ? JSON.stringify(item.output)
                              : '-'}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
            {itemsData?.pagination && itemsData.pagination.totalCount > 50 && (
              <p className="mt-2 text-xs text-muted-foreground">
                Showing first 50 of {itemsData.pagination.totalCount} items.
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// =============================================================================
// Item Count Badges
// =============================================================================

function ItemCountBadges({
  counts,
}: {
  counts: { completed: number; failed: number; pending: number; running: number; skipped: number };
}) {
  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
      {counts.completed > 0 && (
        <span className="flex items-center gap-0.5">
          <CheckCircle2 className="h-3 w-3 text-emerald-500" />
          {counts.completed}
        </span>
      )}
      {counts.failed > 0 && (
        <span className="flex items-center gap-0.5">
          <XCircle className="h-3 w-3 text-destructive" />
          {counts.failed}
        </span>
      )}
      {counts.running > 0 && (
        <span className="flex items-center gap-0.5">
          <Loader2 className="h-3 w-3 animate-spin text-primary" />
          {counts.running}
        </span>
      )}
      {counts.pending > 0 && (
        <span className="flex items-center gap-0.5">
          <Clock className="h-3 w-3" />
          {counts.pending}
        </span>
      )}
    </div>
  );
}

// =============================================================================
// Skeleton
// =============================================================================

function JobDetailSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-4 w-24" />
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-9 w-24" />
      </div>
      <Skeleton className="h-24 w-full" />
      <div className="grid grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    </div>
  );
}
