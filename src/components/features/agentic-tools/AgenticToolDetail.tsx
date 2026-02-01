'use client';

import { useState } from 'react';
import { Brain, Play, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import type { AgenticToolResponse } from '@/lib/modules/agentic-tools/agentic-tool.schemas';

interface AgenticToolDetailProps {
  tool: AgenticToolResponse;
}

export function AgenticToolDetail({ tool }: AgenticToolDetailProps) {
  const [testInput, setTestInput] = useState('');
  const [isTestting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    data?: unknown;
    error?: string;
    meta?: {
      llmCalls?: number;
      totalCost?: number;
      totalTokens?: number;
      durationMs?: number;
    };
  } | null>(null);

  const handleTestPrompt = async () => {
    if (!testInput.trim()) return;

    setIsTesting(true);
    setTestResult(null);

    try {
      const response = await fetch(`/api/v1/agentic-tools/${tool.id}/test-prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task: testInput }),
      });

      const result = await response.json();

      if (!response.ok) {
        setTestResult({
          success: false,
          error: result.error?.message || 'Test failed',
        });
      } else {
        setTestResult({
          success: true,
          data: result.data,
          meta: result.meta,
        });
      }
    } catch (err) {
      setTestResult({
        success: false,
        error: err instanceof Error ? err.message : 'Failed to test prompt',
      });
    } finally {
      setIsTesting(false);
    }
  };

  const toolAllocation = tool.toolAllocation as {
    mode?: string;
    targetActions?: { actionSlug: string }[];
    availableTools?: { actionSlug: string; description: string }[];
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-violet-600/10 text-violet-600">
            <Brain className="h-6 w-6" />
          </div>
          <div>
            <h1 className="font-heading text-2xl font-bold">{tool.name}</h1>
            {tool.description && <p className="mt-1 text-muted-foreground">{tool.description}</p>}
            <div className="mt-2 flex items-center gap-2">
              <Badge variant={tool.status === 'active' ? 'default' : 'secondary'}>
                {tool.status}
              </Badge>
              <Badge variant="outline">
                {tool.executionMode === 'parameter_interpreter'
                  ? 'Parameter Interpreter'
                  : 'Autonomous Agent'}
              </Badge>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="system-prompt">System Prompt</TabsTrigger>
          <TabsTrigger value="test">Test Prompt</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="mt-6 space-y-6">
          {/* LLM Configuration */}
          <Card>
            <CardHeader>
              <CardTitle>LLM Configuration</CardTitle>
              <CardDescription>Embedded language model settings</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs text-muted-foreground">Model</Label>
                  <p className="text-sm font-medium">{tool.embeddedLLMConfig.model}</p>
                </div>
                {tool.embeddedLLMConfig.reasoningLevel && (
                  <div>
                    <Label className="text-xs text-muted-foreground">Reasoning Level</Label>
                    <p className="text-sm font-medium">{tool.embeddedLLMConfig.reasoningLevel}</p>
                  </div>
                )}
                <div>
                  <Label className="text-xs text-muted-foreground">Temperature</Label>
                  <p className="text-sm font-medium">{tool.embeddedLLMConfig.temperature}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Max Tokens</Label>
                  <p className="text-sm font-medium">{tool.embeddedLLMConfig.maxTokens}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Tool Allocation */}
          <Card>
            <CardHeader>
              <CardTitle>
                {toolAllocation.mode === 'parameter_interpreter'
                  ? 'Target Actions'
                  : 'Available Tools'}
              </CardTitle>
              <CardDescription>
                {toolAllocation.mode === 'parameter_interpreter'
                  ? 'Actions that the LLM generates parameters for'
                  : 'Tools that the LLM can autonomously select and execute'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {toolAllocation.mode === 'parameter_interpreter' &&
                  toolAllocation.targetActions?.map((action) => (
                    <div key={action.actionSlug} className="rounded-lg border p-3">
                      <code className="font-mono text-sm">{action.actionSlug}</code>
                    </div>
                  ))}
                {toolAllocation.mode === 'autonomous_agent' &&
                  toolAllocation.availableTools?.map((tool) => (
                    <div key={tool.actionSlug} className="rounded-lg border p-3">
                      <code className="font-mono text-sm">{tool.actionSlug}</code>
                      <p className="mt-1 text-sm text-muted-foreground">{tool.description}</p>
                    </div>
                  ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* System Prompt Tab */}
        <TabsContent value="system-prompt" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>System Prompt</CardTitle>
              <CardDescription>Instructions for the embedded LLM</CardDescription>
            </CardHeader>
            <CardContent>
              <pre className="max-h-96 overflow-auto rounded-lg bg-muted p-4 text-sm">
                {tool.systemPrompt}
              </pre>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Test Prompt Tab */}
        <TabsContent value="test" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Test Prompt</CardTitle>
              <CardDescription>
                Test your agentic tool with sample input to see how it performs
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="testInput">Test Input</Label>
                <Textarea
                  id="testInput"
                  value={testInput}
                  onChange={(e) => setTestInput(e.target.value)}
                  placeholder={
                    tool.executionMode === 'parameter_interpreter'
                      ? 'Enter a natural language task, e.g., "find all active users"'
                      : 'Enter a task for the autonomous agent, e.g., "research competitor pricing"'
                  }
                  rows={3}
                  disabled={isTestting}
                />
              </div>

              <Button
                onClick={handleTestPrompt}
                disabled={!testInput.trim() || isTestting}
                className="w-full"
              >
                {isTestting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Testing...
                  </>
                ) : (
                  <>
                    <Play className="mr-2 h-4 w-4" />
                    Test Prompt
                  </>
                )}
              </Button>

              {testResult && (
                <Alert variant={testResult.success ? 'default' : 'destructive'}>
                  {testResult.success ? (
                    <CheckCircle2 className="h-4 w-4" />
                  ) : (
                    <XCircle className="h-4 w-4" />
                  )}
                  <AlertDescription>
                    {testResult.success ? (
                      <div className="space-y-2">
                        <div className="font-medium">Test Successful</div>
                        {testResult.meta && (
                          <div className="space-y-1 text-xs">
                            <div>LLM Calls: {testResult.meta.llmCalls}</div>
                            <div>Tokens: {testResult.meta.totalTokens}</div>
                            <div>Cost: ${testResult.meta.totalCost?.toFixed(4)}</div>
                            <div>Duration: {testResult.meta.durationMs}ms</div>
                          </div>
                        )}
                        <details className="mt-2">
                          <summary className="cursor-pointer text-xs">View Result</summary>
                          <pre className="mt-2 max-h-40 overflow-auto rounded bg-background p-2 text-xs">
                            {JSON.stringify(testResult.data, null, 2)}
                          </pre>
                        </details>
                      </div>
                    ) : (
                      <div>
                        <div className="font-medium">Test Failed</div>
                        <div className="text-sm">{testResult.error}</div>
                      </div>
                    )}
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
