'use client';

import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  ScrollText,
  ExternalLink,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
} from 'lucide-react';
import { useLogs } from '@/hooks';
import { cn } from '@/lib/utils';

interface IntegrationLogsTabProps {
  integrationId: string;
  connectionId?: string | null;
}

export function IntegrationLogsTab({ integrationId, connectionId }: IntegrationLogsTabProps) {
  // Note: connectionId filtering is available but the logs API endpoint
  // would need to be updated to support it. For now, we show all integration logs.
  const {
    data: logsData,
    isLoading,
    isError,
  } = useLogs({
    integrationId,
    limit: 50,
  });

  // Build the logs URL with optional connection filter
  const logsUrl = connectionId
    ? `/logs?integration=${integrationId}&connection=${connectionId}`
    : `/logs?integration=${integrationId}`;

  const logs = logsData?.logs ?? [];

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success':
        return <CheckCircle2 className="h-4 w-4 text-emerald-600" />;
      case 'error':
        return <XCircle className="h-4 w-4 text-red-600" />;
      case 'timeout':
        return <Clock className="h-4 w-4 text-amber-600" />;
      default:
        return <AlertTriangle className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'success':
        return (
          <Badge variant="outline" className="gap-1 bg-emerald-500/10 text-emerald-600">
            <CheckCircle2 className="h-3 w-3" />
            Success
          </Badge>
        );
      case 'error':
        return (
          <Badge variant="outline" className="gap-1 bg-red-500/10 text-red-600">
            <XCircle className="h-3 w-3" />
            Error
          </Badge>
        );
      case 'timeout':
        return (
          <Badge variant="outline" className="gap-1 bg-amber-500/10 text-amber-600">
            <Clock className="h-3 w-3" />
            Timeout
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Request Logs</CardTitle>
          <CardDescription>
            {connectionId
              ? 'View API request history for the selected connection'
              : 'View API request history for this integration'}
          </CardDescription>
        </div>
        <Button variant="outline" asChild>
          <Link href={logsUrl}>
            <ExternalLink className="mr-2 h-4 w-4" />
            View All Logs
          </Link>
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4">
                <Skeleton className="h-4 w-4 rounded-full" />
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-4 w-24" />
              </div>
            ))}
          </div>
        ) : isError ? (
          <div className="py-12 text-center">
            <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">Failed to load logs</p>
          </div>
        ) : logs.length === 0 ? (
          <div className="py-12 text-center">
            <ScrollText className="mx-auto mb-3 h-8 w-8 text-muted-foreground/50" />
            <p className="font-medium">No logs yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Request logs will appear here once actions are invoked
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10"></TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Duration</TableHead>
                <TableHead>Time</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((log) => {
                const timestamp = log.timestamp ? new Date(log.timestamp) : null;
                const isValidDate = timestamp && !isNaN(timestamp.getTime());

                return (
                  <TableRow key={log.id}>
                    <TableCell>{getStatusIcon(log.status)}</TableCell>
                    <TableCell>
                      <span className="font-mono text-sm">
                        {log.actionName || log.actionSlug || 'Unknown'}
                      </span>
                    </TableCell>
                    <TableCell>{getStatusBadge(log.status)}</TableCell>
                    <TableCell className="text-right">
                      <span
                        className={cn(
                          'tabular-nums',
                          log.duration < 200
                            ? 'text-emerald-600'
                            : log.duration < 500
                              ? 'text-foreground'
                              : log.duration < 1000
                                ? 'text-amber-600'
                                : 'text-red-600'
                        )}
                      >
                        {log.duration}ms
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {isValidDate ? formatDistanceToNow(timestamp, { addSuffix: true }) : '—'}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
