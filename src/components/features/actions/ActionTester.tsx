'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { ArrowLeft, ExternalLink, Code2 } from 'lucide-react';
import { CopyButton } from '@/components/ui/copy-button';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { MethodBadge } from './MethodBadge';
import { DynamicSchemaForm } from './DynamicSchemaForm';
import { RequestResponseViewer } from './RequestResponseViewer';
import { TestHistory, addToTestHistory } from './TestHistory';
import { ValidationResultDisplay, ValidationBadge } from './ValidationResultDisplay';
import { useAction, useIntegration, useConnections } from '@/hooks';
import { ConnectionSelector } from '@/components/features/connections';
import type { JsonSchema } from '@/lib/modules/actions/action.schemas';

interface ActionTesterProps {
  integrationId: string;
  actionId: string;
  connectionId?: string | null;
}

// Validation metadata from gateway response
interface ValidationMetadata {
  valid: boolean;
  mode: 'strict' | 'warn' | 'lenient';
  issueCount: number;
  issues?: Array<{
    path: string;
    message: string;
    code: string;
    severity?: 'error' | 'warning';
    expected?: unknown;
    received?: unknown;
  }>;
  fieldsCoerced: number;
  fieldsStripped: number;
  fieldsDefaulted: number;
  validationDurationMs: number;
  driftStatus?: 'normal' | 'warning' | 'alert';
  driftMessage?: string;
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
  validation?: ValidationMetadata;
  error?: {
    message: string;
    code?: string;
    details?: unknown;
  };
}

export function ActionTester({
  integrationId,
  actionId,
  connectionId: initialConnectionId,
}: ActionTesterProps) {
  const { data: integration, isLoading: integrationLoading } = useIntegration(integrationId);
  const { data: action, isLoading: actionLoading } = useAction(actionId, integrationId);
  const { data: connectionsData } = useConnections(integrationId);
  const connections = connectionsData?.connections ?? [];

  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(
    initialConnectionId ?? null
  );
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
        // Build the request preview - show the Waygate Gateway URL
        const requestPreview = {
          method: action.httpMethod,
          url: buildEndpointUrl(integration.slug, action.slug),
          headers: {
            'Content-Type': 'application/json',
            'X-Waygate-Api-Key': '<your-waygate-api-key>',
          },
          body: input,
        };

        setResult({ request: requestPreview });

        // Execute the action through the gateway API
        // API endpoint: POST /api/v1/actions/{integration}/{action}
        // Note: apiClient already extracts the 'data' field from the API response
        // But we need the full response to get meta.validation
        const devApiKey = process.env.NEXT_PUBLIC_DEV_API_KEY;
        const fullResponse = await fetch(`/api/v1/actions/${integration.slug}/${action.slug}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(devApiKey ? { Authorization: `Bearer ${devApiKey}` } : {}),
            ...(selectedConnectionId ? { 'X-Waygate-Connection-Id': selectedConnectionId } : {}),
          },
          body: JSON.stringify(input),
        });

        const responseJson = await fullResponse.json();
        const duration = Date.now() - startTime;

        // Extract validation metadata from the response
        const validationMeta = responseJson?.meta?.validation as ValidationMetadata | undefined;

        const testResult: TestResult = {
          request: requestPreview,
          response: {
            status: fullResponse.status,
            statusText: fullResponse.statusText,
            body: responseJson.success ? responseJson.data : responseJson,
            duration: responseJson?.meta?.execution?.totalDurationMs || duration,
          },
          validation: validationMeta,
        };

        setResult(testResult);

        // Add to history
        addToTestHistory({
          actionId,
          timestamp: Date.now(),
          input,
          response: {
            status: 200,
            duration: duration,
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
    [action, integration, actionId, selectedConnectionId]
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
          href={`/integrations/${integrationId}${selectedConnectionId ? `?connection=${selectedConnectionId}` : ''}`}
          className="transition-colors hover:text-foreground"
        >
          {integration?.name ?? 'Integration'}
        </Link>
        <span>/</span>
        <span className="text-foreground">Test</span>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link
              href={`/integrations/${integrationId}${selectedConnectionId ? `?connection=${selectedConnectionId}` : ''}`}
            >
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
              <CopyButton
                value={
                  typeof window !== 'undefined' && integration?.slug
                    ? `${window.location.origin}/api/v1/actions/${integration.slug}/${action.slug}`
                    : action.endpointTemplate
                }
                label="Waygate endpoint copied"
                size="sm"
              />
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link
              href={`/integrations/${integrationId}/actions/${actionId}${selectedConnectionId ? `?connection=${selectedConnectionId}` : ''}`}
            >
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

      {/* Connection Selector */}
      {connections.length > 0 && (
        <div className="flex items-center gap-3 rounded-lg border bg-muted/30 px-3 py-2">
          <span className="text-sm font-medium text-muted-foreground">Connection:</span>
          <ConnectionSelector
            connections={connections}
            selectedConnectionId={selectedConnectionId}
            onSelect={setSelectedConnectionId}
            onAddConnection={() => {}}
          />
        </div>
      )}

      {/* Main content - responsive layout */}
      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        {/* Left: Input - compact sidebar */}
        <div className="space-y-3">
          <Card className="overflow-hidden">
            <CardHeader className="py-3">
              <CardTitle className="text-sm">Parameters</CardTitle>
            </CardHeader>
            <CardContent className="py-3 pt-0">
              <DynamicSchemaForm
                schema={action.inputSchema as JsonSchema}
                onSubmit={handleExecute}
                isLoading={isExecuting}
                defaultValues={defaultValues}
                compact
              />
            </CardContent>
          </Card>

          <TestHistory actionId={actionId} onReplay={handleReplay} />
        </div>

        {/* Right: Response - takes priority */}
        <div>
          <Tabs defaultValue="result" className="h-full">
            <Card className="h-full">
              <CardHeader className="py-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-sm">Response</CardTitle>
                    {result?.validation && <ValidationBadge validation={result.validation} />}
                  </div>
                  <TabsList className="h-7">
                    <TabsTrigger value="result" className="px-2 py-1 text-xs">
                      Result
                    </TabsTrigger>
                    <TabsTrigger value="validation" className="px-2 py-1 text-xs">
                      Validation
                    </TabsTrigger>
                    <TabsTrigger value="schema" className="px-2 py-1 text-xs">
                      Schema
                    </TabsTrigger>
                  </TabsList>
                </div>
              </CardHeader>
              <CardContent className="py-3 pt-0">
                <TabsContent value="result" className="mt-0">
                  {result ? (
                    <RequestResponseViewer
                      request={result.request}
                      response={result.response}
                      error={result.error}
                    />
                  ) : (
                    <div className="flex h-[300px] items-center justify-center rounded-lg border border-dashed text-muted-foreground">
                      <p className="text-sm">Execute the action to see results</p>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="validation" className="mt-0">
                  {result?.validation ? (
                    <ValidationResultDisplay validation={result.validation} />
                  ) : result ? (
                    <div className="flex h-[200px] items-center justify-center rounded-lg border border-dashed text-muted-foreground">
                      <p className="text-sm">No validation data available</p>
                    </div>
                  ) : (
                    <div className="flex h-[200px] items-center justify-center rounded-lg border border-dashed text-muted-foreground">
                      <p className="text-sm">Execute the action to see validation results</p>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="schema" className="mt-0">
                  <pre className="max-h-[400px] overflow-auto rounded-md bg-muted/50 p-3 text-xs">
                    <code>{JSON.stringify(action.outputSchema, null, 2)}</code>
                  </pre>
                </TabsContent>
              </CardContent>
            </Card>
          </Tabs>
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

function buildEndpointUrl(integrationSlug: string, actionSlug: string): string {
  // The Waygate Gateway URL is the correct endpoint for consuming apps
  // Format: /api/v1/actions/{integration}/{action}
  // The actual external API URL (with path params) is resolved server-side
  return `/api/v1/actions/${integrationSlug}/${actionSlug}`;
}
