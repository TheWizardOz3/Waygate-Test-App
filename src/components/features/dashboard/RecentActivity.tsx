'use client';

import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { CheckCircle2, XCircle, Clock, ArrowRight, Zap, Activity } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { MethodBadge } from '@/components/features/actions/MethodBadge';
import { useLogs, type LogEntry } from '@/hooks';
import { cn } from '@/lib/utils';

interface RecentActivityProps {
  limit?: number;
}

export function RecentActivity({ limit = 5 }: RecentActivityProps) {
  const { data, isLoading } = useLogs({ limit });
  const logs = data?.logs ?? [];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Recent Activity
          </CardTitle>
          <CardDescription>Latest API requests across all integrations</CardDescription>
        </div>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/logs">
            View All
            <ArrowRight className="ml-1 h-4 w-4" />
          </Link>
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <RecentActivitySkeleton count={limit} />
        ) : logs.length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-muted-foreground">No recent activity</p>
          </div>
        ) : (
          <div className="space-y-4">
            {logs.slice(0, limit).map((log) => (
              <ActivityItem key={log.id} log={log} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ActivityItem({ log }: { log: LogEntry }) {
  const statusConfig = getStatusConfig(log.status, log.statusCode);

  // Safely parse timestamp
  const timestamp = log.timestamp ? new Date(log.timestamp) : null;
  const isValidDate = timestamp && !isNaN(timestamp.getTime());

  return (
    <Link
      href={`/logs?id=${log.id}`}
      className="group flex items-center justify-between rounded-lg p-3 transition-colors hover:bg-muted/50"
    >
      <div className="flex min-w-0 items-center gap-3">
        <div className={cn('rounded-lg p-2', statusConfig.bgClass)}>{statusConfig.icon}</div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate font-medium">{log.integrationName}</span>
            <MethodBadge method={log.httpMethod} className="hidden sm:inline-flex" />
          </div>
          <p className="truncate text-sm text-muted-foreground">{log.actionName}</p>
        </div>
      </div>

      <div className="flex flex-shrink-0 items-center gap-4">
        {log.cached && (
          <Badge variant="secondary" className="hidden gap-1 md:flex">
            <Zap className="h-3 w-3" />
            Cached
          </Badge>
        )}
        <div className="text-right">
          <Badge variant="outline" className={cn('gap-1', statusConfig.badgeClass)}>
            {log.statusCode}
          </Badge>
          <p className="mt-1 text-xs text-muted-foreground">
            {isValidDate ? formatDistanceToNow(timestamp, { addSuffix: true }) : '—'}
          </p>
        </div>
        <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
      </div>
    </Link>
  );
}

function RecentActivitySkeleton({ count }: { count: number }) {
  return (
    <div className="space-y-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center justify-between p-3">
          <div className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 rounded-lg" />
            <div>
              <Skeleton className="h-4 w-32" />
              <Skeleton className="mt-1 h-3 w-24" />
            </div>
          </div>
          <div className="text-right">
            <Skeleton className="h-5 w-12" />
            <Skeleton className="mt-1 h-3 w-16" />
          </div>
        </div>
      ))}
    </div>
  );
}

function getStatusConfig(status: LogEntry['status'], statusCode: number) {
  if (status === 'success' || (statusCode >= 200 && statusCode < 300)) {
    return {
      icon: <CheckCircle2 className="h-4 w-4 text-emerald-600" />,
      bgClass: 'bg-emerald-500/10',
      badgeClass: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
    };
  }
  if (status === 'timeout') {
    return {
      icon: <Clock className="h-4 w-4 text-amber-600" />,
      bgClass: 'bg-amber-500/10',
      badgeClass: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
    };
  }
  return {
    icon: <XCircle className="h-4 w-4 text-red-600" />,
    bgClass: 'bg-red-500/10',
    badgeClass: 'bg-red-500/10 text-red-600 border-red-500/20',
  };
}
