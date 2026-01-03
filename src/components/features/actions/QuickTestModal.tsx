'use client';

import { useState, useCallback } from 'react';
import { Play } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MethodBadge } from './MethodBadge';
import { DynamicSchemaForm } from './DynamicSchemaForm';
import { RequestResponseViewer } from './RequestResponseViewer';
import { addToTestHistory } from './TestHistory';
import { apiClient } from '@/lib/api/client';
import type { ActionResponse, JsonSchema } from '@/lib/modules/actions/action.schemas';

interface QuickTestModalProps {
  action: ActionResponse;
  integrationSlug: string;
  trigger?: React.ReactNode;
}

interface TestResult {
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

export function QuickTestModal({ action, integrationSlug, trigger }: QuickTestModalProps) {
  const [open, setOpen] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);

  const handleExecute = useCallback(
    async (input: Record<string, unknown>) => {
      setIsExecuting(true);
      setResult(null);

      const startTime = Date.now();

      try {
        // Build the request preview
        const requestPreview = {
          method: action.httpMethod,
          url: `/api/v1/gateway/${integrationSlug}${action.endpointTemplate}`,
          headers: {
            'Content-Type': 'application/json',
            'X-Waygate-Integration': integrationSlug,
          },
          body: action.httpMethod !== 'GET' ? input : undefined,
        };

        setResult({ request: requestPreview });

        // Execute the action through the gateway API
        // API endpoint: POST /api/v1/actions/{integration}/{action}
        const response = await apiClient.post<{
          data: unknown;
          meta?: {
            execution?: {
              latencyMs: number;
              cached: boolean;
            };
          };
        }>(`/actions/${integrationSlug}/${action.slug}`, input);

        const duration = Date.now() - startTime;

        const executionDuration = response.meta?.execution?.latencyMs || duration;

        const testResult: TestResult = {
          request: requestPreview,
          response: {
            status: 200,
            statusText: 'OK',
            body: response.data,
            duration: executionDuration,
          },
        };

        setResult(testResult);

        // Add to history
        addToTestHistory({
          actionId: action.id,
          timestamp: Date.now(),
          input,
          response: {
            status: 200,
            duration: executionDuration,
          },
        });
      } catch (err) {
        const error = err as { message?: string; code?: string; details?: unknown };

        setResult((prev) => ({
          request: prev?.request,
          error: {
            message: error.message || 'Unknown error',
            code: error.code,
            details: error.details,
          },
        }));

        // Add to history with error
        addToTestHistory({
          actionId: action.id,
          timestamp: Date.now(),
          input,
          error: error.message || 'Unknown error',
        });
      } finally {
        setIsExecuting(false);
      }
    },
    [action, integrationSlug]
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="ghost" size="sm">
            <Play className="mr-1 h-4 w-4" />
            Test
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <DialogTitle>{action.name}</DialogTitle>
            <MethodBadge method={action.httpMethod} />
          </div>
          <DialogDescription className="font-mono">{action.endpointTemplate}</DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="input" className="w-full">
          <TabsList className="w-full">
            <TabsTrigger value="input" className="flex-1">
              Input
            </TabsTrigger>
            <TabsTrigger value="result" className="flex-1">
              Result
            </TabsTrigger>
          </TabsList>

          <TabsContent value="input" className="mt-4">
            <DynamicSchemaForm
              schema={action.inputSchema as JsonSchema}
              onSubmit={handleExecute}
              isLoading={isExecuting}
            />
          </TabsContent>

          <TabsContent value="result" className="mt-4">
            {result ? (
              <RequestResponseViewer
                request={result.request}
                response={result.response}
                error={result.error}
              />
            ) : (
              <div className="py-12 text-center text-muted-foreground">
                <p>Execute the action to see results</p>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
