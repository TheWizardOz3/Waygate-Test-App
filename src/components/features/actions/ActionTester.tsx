'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { ArrowLeft, ExternalLink, Code2 } from 'lucide-react';
import { CopyButton } from '@/components/ui/copy-button';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { MethodBadge } from './MethodBadge';
import { DynamicSchemaForm } from './DynamicSchemaForm';
import { RequestResponseViewer } from './RequestResponseViewer';
import { TestHistory, addToTestHistory } from './TestHistory';
import { useAction, useIntegration } from '@/hooks';
import { apiClient } from '@/lib/api/client';
import type { JsonSchema } from '@/lib/modules/actions/action.schemas';

interface ActionTesterProps {
  integrationId: string;
  actionId: string;
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

export function ActionTester({ integrationId, actionId }: ActionTesterProps) {
  const { data: integration, isLoading: integrationLoading } = useIntegration(integrationId);
  const { data: action, isLoading: actionLoading } = useAction(actionId);

  const [isExecuting, setIsExecuting] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);
  const [defaultValues, setDefaultValues] = useState<Record<string, unknown> | undefined>();

  const isLoading = integrationLoading || actionLoading;

  const handleExecute = useCallback(
    async (input: Record<string, unknown>) => {
      if (!action || !integration) return;

      setIsExecuting(true);
      setResult(null);

      const startTime = Date.now();

      try {
        // Build the request preview
        const requestPreview = {
          method: action.httpMethod,
          url: buildEndpointUrl(integration.slug, action.endpointTemplate, input),
          headers: {
            'Content-Type': 'application/json',
            'X-Waygate-Integration': integration.slug,
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
        }>(`/actions/${integration.slug}/${action.slug}`, input);

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
          actionId,
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
          actionId,
          timestamp: Date.now(),
          input,
          error: error.message || 'Unknown error',
        });
      } finally {
        setIsExecuting(false);
      }
    },
    [action, integration, actionId]
  );

  const handleReplay = useCallback((input: Record<string, unknown>) => {
    setDefaultValues({ ...input });
  }, []);

  if (isLoading) {
    return <ActionTesterSkeleton />;
  }

  if (!action) {
    return (
      <div className="py-12 text-center">
        <p className="text-muted-foreground">Action not found</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/integrations" className="transition-colors hover:text-foreground">
          Integrations
        </Link>
        <span>/</span>
        <Link
          href={`/integrations/${integrationId}`}
          className="transition-colors hover:text-foreground"
        >
          {integration?.name ?? 'Integration'}
        </Link>
        <span>/</span>
        <Link
          href={`/integrations/${integrationId}/actions`}
          className="transition-colors hover:text-foreground"
        >
          Actions
        </Link>
        <span>/</span>
        <span className="text-foreground">Test</span>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href={`/integrations/${integrationId}/actions`}>
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="font-heading text-2xl font-bold">{action.name}</h1>
              <MethodBadge method={action.httpMethod} />
            </div>
            <div className="flex items-center gap-1">
              <code className="font-mono text-sm text-muted-foreground">
                {action.endpointTemplate}
              </code>
              <CopyButton value={action.endpointTemplate} label="Endpoint copied" size="sm" />
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href={`/integrations/${integrationId}/actions/${actionId}`}>
              <Code2 className="mr-2 h-4 w-4" />
              Edit Action
            </Link>
          </Button>
          {integration?.documentationUrl && (
            <Button variant="outline" asChild>
              <a href={integration.documentationUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="mr-2 h-4 w-4" />
                Docs
              </a>
            </Button>
          )}
        </div>
      </div>

      {/* Description */}
      {action.description && <p className="text-muted-foreground">{action.description}</p>}

      {/* Main content */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Left: Input */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Input Parameters</CardTitle>
              <CardDescription>Fill in the parameters and execute the action</CardDescription>
            </CardHeader>
            <CardContent>
              <DynamicSchemaForm
                schema={action.inputSchema as JsonSchema}
                onSubmit={handleExecute}
                isLoading={isExecuting}
                defaultValues={defaultValues}
              />
            </CardContent>
          </Card>

          <TestHistory actionId={actionId} onReplay={handleReplay} />
        </div>

        {/* Right: Response */}
        <div>
          <Card className="h-full">
            <CardHeader>
              <CardTitle>Response</CardTitle>
              <CardDescription>View the request and response details</CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="result" className="w-full">
                <TabsList className="w-full">
                  <TabsTrigger value="result" className="flex-1">
                    Result
                  </TabsTrigger>
                  <TabsTrigger value="schema" className="flex-1">
                    Output Schema
                  </TabsTrigger>
                </TabsList>

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

                <TabsContent value="schema" className="mt-4">
                  <pre className="overflow-x-auto rounded-md bg-muted/50 p-4 text-sm">
                    <code>{JSON.stringify(action.outputSchema, null, 2)}</code>
                  </pre>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function ActionTesterSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-4 w-64" />
      <div className="flex items-center gap-4">
        <Skeleton className="h-10 w-10" />
        <div>
          <Skeleton className="h-8 w-48" />
          <Skeleton className="mt-2 h-4 w-32" />
        </div>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Skeleton className="h-96" />
        <Skeleton className="h-96" />
      </div>
    </div>
  );
}

function buildEndpointUrl(
  integrationSlug: string,
  template: string,
  params: Record<string, unknown>
): string {
  let url = template;

  // Replace path parameters
  Object.entries(params).forEach(([key, value]) => {
    url = url.replace(`{${key}}`, encodeURIComponent(String(value)));
  });

  return `/api/v1/gateway/${integrationSlug}${url}`;
}
