'use client';

import { useState } from 'react';
import { Play, Loader2, CheckCircle2, XCircle, Clock, Copy, RotateCcw, Plug } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { apiClient } from '@/lib/api/client';
import { useConnections } from '@/hooks';

interface TestingTabProps {
  actionId: string;
  integrationId: string;
  integrationSlug: string;
  actionSlug: string;
  connectionId?: string | null;
}

interface TestResult {
  success: boolean;
  statusCode?: number;
  duration?: number;
  data?: unknown;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export function TestingTab({
  integrationId,
  integrationSlug,
  actionSlug,
  connectionId,
}: TestingTabProps) {
  const [input, setInput] = useState('{}');
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);

  const { data: connectionsData } = useConnections(integrationId);
  const connections = connectionsData?.connections ?? [];
  const selectedConnection = connectionId ? connections.find((c) => c.id === connectionId) : null;

  const handleTest = async () => {
    setIsRunning(true);
    setResult(null);

    const startTime = Date.now();

    try {
      let parsedInput = {};
      try {
        parsedInput = JSON.parse(input);
      } catch {
        toast.error('Invalid JSON input');
        setIsRunning(false);
        return;
      }

      const headers: Record<string, string> = {};
      if (connectionId) {
        headers['X-Waygate-Connection-Id'] = connectionId;
      }

      const response = await apiClient.post<{
        data: unknown;
        meta?: { statusCode?: number; duration?: number };
      }>(
        `/actions/${integrationSlug}/${actionSlug}`,
        parsedInput,
        Object.keys(headers).length > 0 ? { headers } : undefined
      );

      const duration = Date.now() - startTime;

      setResult({
        success: true,
        statusCode: response.meta?.statusCode ?? 200,
        duration: response.meta?.duration ?? duration,
        data: response.data ?? response,
      });
    } catch (error) {
      const duration = Date.now() - startTime;

      if (error instanceof Error && 'code' in error) {
        const apiError = error as {
          code: string;
          message: string;
          status?: number;
          details?: unknown;
        };
        setResult({
          success: false,
          statusCode: apiError.status,
          duration,
          error: {
            code: apiError.code,
            message: apiError.message,
            details: apiError.details,
          },
        });
      } else {
        setResult({
          success: false,
          duration,
          error: {
            code: 'UNKNOWN_ERROR',
            message: error instanceof Error ? error.message : 'An unknown error occurred',
          },
        });
      }
    } finally {
      setIsRunning(false);
    }
  };

  const handleCopy = () => {
    if (result) {
      navigator.clipboard.writeText(JSON.stringify(result.data ?? result.error, null, 2));
      toast.success('Copied to clipboard');
    }
  };

  const handleReset = () => {
    setResult(null);
    setInput('{}');
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Test Action</CardTitle>
        <CardDescription>Send a test request to this action and view the response</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Connection indicator */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Plug className="h-3.5 w-3.5" />
          {selectedConnection ? (
            <span>
              Testing with connection:{' '}
              <span className="font-medium text-foreground">{selectedConnection.name}</span>
            </span>
          ) : (
            <span>Testing with default connection</span>
          )}
        </div>

        {/* Input */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Request Body (JSON)</label>
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder='{"key": "value"}'
            className="h-32 font-mono text-sm"
          />
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <Button onClick={handleTest} disabled={isRunning} className="gap-2">
            {isRunning ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Running...
              </>
            ) : (
              <>
                <Play className="h-4 w-4" />
                Run Test
              </>
            )}
          </Button>
          {result && (
            <Button variant="outline" onClick={handleReset} className="gap-2">
              <RotateCcw className="h-4 w-4" />
              Reset
            </Button>
          )}
        </div>

        {/* Result */}
        {result && (
          <>
            <Separator />

            <div className="space-y-3">
              {/* Status */}
              <div className="flex items-center gap-3">
                {result.success ? (
                  <Badge className="gap-1.5 border-emerald-500/20 bg-emerald-500/10 text-emerald-600">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Success
                  </Badge>
                ) : (
                  <Badge variant="destructive" className="gap-1.5">
                    <XCircle className="h-3.5 w-3.5" />
                    Error
                  </Badge>
                )}
                {result.statusCode && <Badge variant="outline">{result.statusCode}</Badge>}
                {result.duration && (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    {result.duration}ms
                  </span>
                )}
                <div className="flex-1" />
                <Button variant="ghost" size="sm" onClick={handleCopy} className="gap-1.5">
                  <Copy className="h-3.5 w-3.5" />
                  Copy
                </Button>
              </div>

              {/* Response Body */}
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  {result.success ? 'Response' : 'Error'}
                </label>
                <ScrollArea className="h-64 rounded-md border bg-muted/30">
                  <pre className="whitespace-pre-wrap p-4 font-mono text-xs">
                    {JSON.stringify(result.success ? result.data : result.error, null, 2)}
                  </pre>
                </ScrollArea>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
