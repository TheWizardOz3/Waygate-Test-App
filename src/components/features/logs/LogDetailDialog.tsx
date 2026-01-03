'use client';

import { format } from 'date-fns';
import { CheckCircle2, XCircle, Clock, ExternalLink, Zap, RefreshCw } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { CopyButton } from '@/components/ui/copy-button';
import { MethodBadge } from '@/components/features/actions/MethodBadge';
import { cn } from '@/lib/utils';
import type { LogEntry } from '@/hooks/useLogs';
import Link from 'next/link';

interface LogDetailDialogProps {
  log: LogEntry | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function LogDetailDialog({ log, open, onOpenChange }: LogDetailDialogProps) {
  if (!log) return null;

  const statusConfig = getStatusConfig(log.status, log.statusCode);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] max-w-3xl flex-col overflow-hidden">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <DialogTitle className="flex items-center gap-2">
              <MethodBadge method={log.httpMethod} />
              {log.actionName}
            </DialogTitle>
            <Badge variant="outline" className={cn('gap-1', statusConfig.className)}>
              {statusConfig.icon}
              {log.statusCode}
            </Badge>
          </div>
          <DialogDescription className="flex items-center gap-4 pt-1">
            <span>{format(new Date(log.timestamp), 'PPpp')}</span>
            <span className="text-muted-foreground">•</span>
            <span>{log.duration}ms</span>
            {log.cached && (
              <>
                <span className="text-muted-foreground">•</span>
                <Badge variant="secondary" className="gap-1">
                  <Zap className="h-3 w-3" />
                  Cached
                </Badge>
              </>
            )}
            {log.retryCount > 0 && (
              <>
                <span className="text-muted-foreground">•</span>
                <Badge variant="secondary" className="gap-1">
                  <RefreshCw className="h-3 w-3" />
                  {log.retryCount} retries
                </Badge>
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        {/* Integration & Action Links */}
        <div className="flex items-center gap-4 border-b py-2">
          <div className="text-sm">
            <span className="text-muted-foreground">Integration:</span>{' '}
            <Link
              href={`/integrations/${log.integrationId}`}
              className="inline-flex items-center gap-1 font-medium hover:underline"
            >
              {log.integrationName}
              <ExternalLink className="h-3 w-3" />
            </Link>
          </div>
          <div className="text-sm">
            <span className="text-muted-foreground">Action:</span>{' '}
            <Link
              href={`/integrations/${log.integrationId}/actions/${log.actionId}`}
              className="inline-flex items-center gap-1 font-medium hover:underline"
            >
              {log.actionSlug}
              <ExternalLink className="h-3 w-3" />
            </Link>
          </div>
        </div>

        {/* Error Message */}
        {log.errorMessage && (
          <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-3">
            <p className="text-sm font-medium text-destructive">
              {log.errorCode && <span className="font-mono">[{log.errorCode}]</span>}{' '}
              {log.errorMessage}
            </p>
          </div>
        )}

        {/* Request/Response Tabs */}
        <Tabs defaultValue="request" className="min-h-0 flex-1">
          <TabsList>
            <TabsTrigger value="request">Request</TabsTrigger>
            <TabsTrigger value="response">Response</TabsTrigger>
          </TabsList>

          <TabsContent value="request" className="h-[400px]">
            <ScrollArea className="h-full">
              <div className="space-y-4 pr-4">
                <div>
                  <h4 className="mb-2 text-sm font-medium">Endpoint</h4>
                  <div className="flex items-center gap-2">
                    <code className="rounded bg-muted px-2 py-1 text-sm">{log.endpoint}</code>
                    <CopyButton value={log.endpoint} label="Endpoint copied" />
                  </div>
                </div>

                {log.requestHeaders && Object.keys(log.requestHeaders).length > 0 && (
                  <div>
                    <h4 className="mb-2 text-sm font-medium">Headers</h4>
                    <JsonViewer data={log.requestHeaders} />
                  </div>
                )}

                {log.requestBody !== undefined && (
                  <div>
                    <h4 className="mb-2 text-sm font-medium">Body</h4>
                    <JsonViewer data={log.requestBody} />
                  </div>
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="response" className="h-[400px]">
            <ScrollArea className="h-full">
              <div className="space-y-4 pr-4">
                {log.responseHeaders && Object.keys(log.responseHeaders).length > 0 && (
                  <div>
                    <h4 className="mb-2 text-sm font-medium">Headers</h4>
                    <JsonViewer data={log.responseHeaders} />
                  </div>
                )}

                {log.responseBody !== undefined && (
                  <div>
                    <h4 className="mb-2 text-sm font-medium">Body</h4>
                    <JsonViewer data={log.responseBody} />
                  </div>
                )}

                {!log.responseHeaders && log.responseBody === undefined && (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    No response data available
                  </p>
                )}
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function JsonViewer({ data }: { data: unknown }) {
  const jsonString = typeof data === 'string' ? data : JSON.stringify(data, null, 2) || '';

  return (
    <div className="group relative">
      <pre className="max-h-[300px] overflow-x-auto rounded-md bg-muted/50 p-4 text-sm">
        <code className="text-foreground">{jsonString}</code>
      </pre>
      <CopyButton
        value={jsonString}
        label="JSON copied"
        className="absolute right-2 top-2 opacity-0 transition-opacity group-hover:opacity-100"
      />
    </div>
  );
}

function getStatusConfig(status: LogEntry['status'], statusCode: number) {
  if (status === 'success' || (statusCode >= 200 && statusCode < 300)) {
    return {
      icon: <CheckCircle2 className="h-3.5 w-3.5" />,
      className: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
    };
  }
  if (status === 'timeout') {
    return {
      icon: <Clock className="h-3.5 w-3.5" />,
      className: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
    };
  }
  return {
    icon: <XCircle className="h-3.5 w-3.5" />,
    className: 'bg-red-500/10 text-red-600 border-red-500/20',
  };
}
