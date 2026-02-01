'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useAgenticToolWizardStore } from '@/stores/agenticToolWizard.store';

export function StepReview() {
  const router = useRouter();
  const { data, setCreatedToolId } = useAgenticToolWizardStore();
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    setIsCreating(true);
    setError(null);

    try {
      // Build the request payload
      const payload = {
        name: data.name,
        slug: data.slug,
        description: data.description || undefined,
        executionMode: data.executionMode,
        embeddedLLMConfig: data.embeddedLLMConfig,
        systemPrompt: data.systemPrompt,
        toolAllocation:
          data.executionMode === 'parameter_interpreter'
            ? {
                mode: 'parameter_interpreter',
                targetActions: data.targetActions,
              }
            : {
                mode: 'autonomous_agent',
                availableTools: data.availableTools,
              },
        contextConfig: {
          variables: data.contextVariables,
          autoInjectSchemas: data.autoInjectSchemas,
        },
        safetyLimits: data.safetyLimits,
        status: 'draft',
      };

      const response = await fetch('/api/v1/agentic-tools', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || 'Failed to create agentic tool');
      }

      const result = await response.json();
      setCreatedToolId(result.data.id);

      // Redirect to the created tool's detail page
      router.push(`/ai-tools/${result.data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create agentic tool');
      setIsCreating(false);
    }
  };

  if (data.createdToolId) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <CheckCircle2 className="mb-4 h-16 w-16 text-green-600" />
        <h3 className="text-xl font-semibold">Agentic Tool Created!</h3>
        <p className="mt-2 text-muted-foreground">
          Your agentic tool has been created successfully.
        </p>
        <Button className="mt-6" onClick={() => router.push('/ai-tools')}>
          View All Tools
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-6">
        {/* Basic Info */}
        <div className="space-y-2">
          <Label>Basic Information</Label>
          <div className="space-y-2 rounded-lg border p-4">
            <div>
              <span className="text-sm font-medium">Name:</span>
              <span className="ml-2 text-sm">{data.name}</span>
            </div>
            <div>
              <span className="text-sm font-medium">Slug:</span>
              <span className="ml-2 font-mono text-sm">{data.slug}</span>
            </div>
            {data.description && (
              <div>
                <span className="text-sm font-medium">Description:</span>
                <p className="mt-1 text-sm text-muted-foreground">{data.description}</p>
              </div>
            )}
          </div>
        </div>

        {/* Execution Mode */}
        <div className="space-y-2">
          <Label>Execution Mode</Label>
          <div className="rounded-lg border p-4">
            <span className="text-sm font-medium">
              {data.executionMode === 'parameter_interpreter'
                ? 'Parameter Interpreter'
                : 'Autonomous Agent'}
            </span>
          </div>
        </div>

        {/* LLM Config */}
        <div className="space-y-2">
          <Label>LLM Configuration</Label>
          <div className="space-y-2 rounded-lg border p-4">
            <div>
              <span className="text-sm font-medium">Model:</span>
              <span className="ml-2 text-sm">{data.embeddedLLMConfig.model}</span>
            </div>
            {data.embeddedLLMConfig.reasoningLevel && (
              <div>
                <span className="text-sm font-medium">Reasoning Level:</span>
                <span className="ml-2 text-sm">{data.embeddedLLMConfig.reasoningLevel}</span>
              </div>
            )}
            <div>
              <span className="text-sm font-medium">Temperature:</span>
              <span className="ml-2 text-sm">{data.embeddedLLMConfig.temperature}</span>
            </div>
            <div>
              <span className="text-sm font-medium">Max Tokens:</span>
              <span className="ml-2 text-sm">{data.embeddedLLMConfig.maxTokens}</span>
            </div>
          </div>
        </div>

        {/* Tool Allocation */}
        <div className="space-y-2">
          <Label>
            {data.executionMode === 'parameter_interpreter' ? 'Target Actions' : 'Available Tools'}
          </Label>
          <div className="rounded-lg border p-4">
            <div className="text-sm">
              {data.executionMode === 'parameter_interpreter'
                ? `${data.targetActions.length} action(s)`
                : `${data.availableTools.length} tool(s)`}
            </div>
          </div>
        </div>

        {/* System Prompt Preview */}
        <div className="space-y-2">
          <Label>System Prompt</Label>
          <div className="rounded-lg border p-4">
            <pre className="max-h-40 overflow-auto text-xs text-muted-foreground">
              {data.systemPrompt.slice(0, 300)}
              {data.systemPrompt.length > 300 && '...'}
            </pre>
          </div>
        </div>

        {/* Context Config */}
        {(data.autoInjectSchemas || Object.keys(data.contextVariables).length > 0) && (
          <div className="space-y-2">
            <Label>Context Configuration</Label>
            <div className="space-y-2 rounded-lg border p-4">
              {data.autoInjectSchemas && (
                <div className="text-sm">
                  <CheckCircle2 className="mr-2 inline h-4 w-4 text-green-600" />
                  Auto-inject integration schemas
                </div>
              )}
              {Object.keys(data.contextVariables).length > 0 && (
                <div className="text-sm">
                  {Object.keys(data.contextVariables).length} custom variable(s)
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={() => router.push('/ai-tools')} disabled={isCreating}>
          Cancel
        </Button>
        <Button onClick={handleCreate} disabled={isCreating}>
          {isCreating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isCreating ? 'Creating...' : 'Create Agentic Tool'}
        </Button>
      </div>
    </div>
  );
}
