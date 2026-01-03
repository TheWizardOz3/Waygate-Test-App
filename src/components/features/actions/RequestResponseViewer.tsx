'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { CopyButton } from '@/components/ui/copy-button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { MethodBadge } from './MethodBadge';

interface RequestResponseViewerProps {
  request?: {
    method: string;
    url: string;
    headers?: Record<string, string>;
    body?: unknown;
  };
  response?: {
    status: number;
    statusText?: string;
    headers?: Record<string, string>;
    body?: unknown;
    duration?: number;
  };
  error?: {
    message: string;
    code?: string;
    details?: unknown;
  };
}

export function RequestResponseViewer({ request, response, error }: RequestResponseViewerProps) {
  return (
    <div className="space-y-4">
      {request && <RequestPanel request={request} />}
      {response && <ResponsePanel response={response} />}
      {error && <ErrorPanel error={error} />}
    </div>
  );
}

function RequestPanel({
  request,
}: {
  request: NonNullable<RequestResponseViewerProps['request']>;
}) {
  const [isExpanded, setIsExpanded] = useState(true);

  return (
    <div className="rounded-lg border">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center justify-between p-4 transition-colors hover:bg-muted/50"
      >
        <div className="flex items-center gap-3">
          {isExpanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
          <span className="font-medium">Request</span>
          <MethodBadge method={request.method} />
        </div>
        <code className="max-w-[300px] truncate text-sm text-muted-foreground">{request.url}</code>
      </button>

      {isExpanded && (
        <div className="space-y-4 border-t p-4">
          {/* URL */}
          <div>
            <h4 className="mb-2 text-sm font-medium">URL</h4>
            <div className="flex items-start gap-2">
              <code className="flex-1 break-all text-sm">{request.url}</code>
              <CopyButton value={request.url} label="URL copied" />
            </div>
          </div>

          {/* Headers */}
          {request.headers && Object.keys(request.headers).length > 0 && (
            <div>
              <h4 className="mb-2 text-sm font-medium">Headers</h4>
              <JsonViewer data={request.headers} />
            </div>
          )}

          {/* Body */}
          {request.body !== undefined && (
            <div>
              <h4 className="mb-2 text-sm font-medium">Body</h4>
              <JsonViewer data={request.body} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ResponsePanel({
  response,
}: {
  response: NonNullable<RequestResponseViewerProps['response']>;
}) {
  const [isExpanded, setIsExpanded] = useState(true);

  const isSuccess = response.status >= 200 && response.status < 300;
  const isRedirect = response.status >= 300 && response.status < 400;
  const isClientError = response.status >= 400 && response.status < 500;

  return (
    <div className="rounded-lg border">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center justify-between p-4 transition-colors hover:bg-muted/50"
      >
        <div className="flex items-center gap-3">
          {isExpanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
          <span className="font-medium">Response</span>
          <Badge
            variant="outline"
            className={cn(
              isSuccess && 'border-emerald-500/20 bg-emerald-500/10 text-emerald-600',
              isRedirect && 'border-blue-500/20 bg-blue-500/10 text-blue-600',
              isClientError && 'border-amber-500/20 bg-amber-500/10 text-amber-600',
              !isSuccess &&
                !isRedirect &&
                !isClientError &&
                'border-red-500/20 bg-red-500/10 text-red-600'
            )}
          >
            {response.status} {response.statusText}
          </Badge>
        </div>
        {response.duration !== undefined && (
          <span className="text-sm text-muted-foreground">{response.duration}ms</span>
        )}
      </button>

      {isExpanded && (
        <div className="space-y-4 border-t p-4">
          {/* Headers */}
          {response.headers && Object.keys(response.headers).length > 0 && (
            <div>
              <h4 className="mb-2 text-sm font-medium">Headers</h4>
              <JsonViewer data={response.headers} />
            </div>
          )}

          {/* Body */}
          {response.body !== undefined && (
            <div>
              <h4 className="mb-2 text-sm font-medium">Body</h4>
              <JsonViewer data={response.body} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ErrorPanel({ error }: { error: NonNullable<RequestResponseViewerProps['error']> }) {
  return (
    <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-4">
      <div className="mb-3 flex items-center gap-2">
        <Badge variant="destructive">Error</Badge>
        {error.code && <code className="text-xs text-destructive">{error.code}</code>}
      </div>
      <p className="mb-3 text-sm font-medium text-destructive">{error.message}</p>
      {error.details !== undefined && error.details !== null && (
        <div>
          <h4 className="mb-2 text-sm font-medium">Details</h4>
          <JsonViewer data={error.details} />
        </div>
      )}
    </div>
  );
}

function JsonViewer({ data }: { data: unknown }) {
  const jsonString = typeof data === 'string' ? data : JSON.stringify(data, null, 2) || '';

  return (
    <div className="group relative">
      <pre className="overflow-x-auto rounded-md bg-muted/50 p-4 text-sm">
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
