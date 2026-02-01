'use client';

import * as React from 'react';
import { Check, Loader2, Wand2, GitBranch, Bot, AlertCircle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useCompositeToolWizardStore } from '@/stores/compositeToolWizard.store';
import { useCreateCompositeTool } from '@/hooks/useCompositeTools';
import Link from 'next/link';

// =============================================================================
// Component
// =============================================================================

export function StepReview() {
  const { data, setCreatedToolId } = useCompositeToolWizardStore();

  const createTool = useCreateCompositeTool();

  const handleCreate = async () => {
    try {
      const result = await createTool.mutateAsync({
        name: data.name,
        slug: data.slug,
        description: data.description || undefined,
        routingMode: data.routingMode,
        status: 'draft',
        unifiedInputSchema: {},
        metadata: {},
        operations: data.operations.map((op) => ({
          // Use toolId for simple tools (which equals actionId), or fall back to actionId for backwards compatibility
          actionId: op.toolType === 'simple' ? op.toolId : (op.actionId ?? op.toolId),
          operationSlug: op.operationSlug,
          displayName: op.displayName,
          priority: op.priority,
          parameterMapping: {},
        })),
        routingRules:
          data.routingMode === 'rule_based'
            ? data.routingRules.map((rule) => ({
                // Backend expects operationSlug in the operationId field during creation
                // Service layer maps this to the actual ID after creating operations
                operationId: rule.operationSlug,
                conditionType: rule.conditionType,
                conditionField: rule.conditionField,
                conditionValue: rule.conditionValue,
                caseSensitive: rule.caseSensitive,
                priority: rule.priority,
              }))
            : undefined,
        defaultOperationSlug: data.defaultOperationSlug || undefined,
      });

      setCreatedToolId(result.id);
    } catch (error) {
      console.error('Failed to create composite tool:', error);
    }
  };

  // Success state
  if (data.createdToolId) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/20">
            <Check className="h-8 w-8 text-green-600 dark:text-green-400" />
          </div>
          <h3 className="mt-4 font-heading text-xl font-semibold">Tool Created Successfully!</h3>
          <p className="mt-2 text-muted-foreground">
            Your composite tool &quot;{data.name}&quot; is ready to use.
          </p>
        </div>

        {/* Tool details */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Tool Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="text-xs font-medium text-muted-foreground">Name</p>
              <p className="text-sm">{data.name}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Slug</p>
              <code className="text-xs">{data.slug}</code>
            </div>
            {data.description && (
              <div>
                <p className="text-xs font-medium text-muted-foreground">Description</p>
                <p className="text-sm">{data.description}</p>
              </div>
            )}
            <div>
              <p className="text-xs font-medium text-muted-foreground">Routing Mode</p>
              <p className="text-sm">
                {data.routingMode === 'rule_based' ? 'Rule-Based Routing' : 'Route via Tool Arg'}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Operations</p>
              <p className="text-sm">{data.operations.length} operations configured</p>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-center gap-3">
          <Button asChild variant="outline">
            <Link href="/ai-tools">Back to AI Tools</Link>
          </Button>
          <Button asChild>
            <Link href={`/ai-tools/${data.createdToolId}`}>View Tool</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Error state */}
      {createTool.isError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {createTool.error instanceof Error
              ? createTool.error.message
              : 'Failed to create the tool. Please try again.'}
          </AlertDescription>
        </Alert>
      )}

      {/* Tool info */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500/10 to-indigo-500/10">
              <Wand2 className="h-5 w-5 text-violet-600 dark:text-violet-400" />
            </div>
            <div>
              <CardTitle>{data.name}</CardTitle>
              <code className="text-xs text-muted-foreground">{data.slug}</code>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {data.description && <p className="text-sm text-muted-foreground">{data.description}</p>}
        </CardContent>
      </Card>

      {/* Operations summary */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Operations ({data.operations.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {data.operations.map((op, index) => (
            <div
              key={op.actionId}
              className="flex items-center gap-3 rounded-lg border bg-muted/30 p-2"
            >
              <Badge variant="secondary">{index + 1}</Badge>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{op.displayName}</p>
                <p className="truncate text-xs text-muted-foreground">{op.operationSlug}</p>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Routing summary */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            {data.routingMode === 'rule_based' ? (
              <GitBranch className="h-4 w-4" />
            ) : (
              <Bot className="h-4 w-4" />
            )}
            <CardTitle className="text-base">
              {data.routingMode === 'rule_based' ? 'Rule-Based Routing' : 'Route via Tool Arg'}
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {data.routingMode === 'rule_based' ? (
            <div className="space-y-2">
              {data.routingRules.length > 0 ? (
                <>
                  <p className="text-sm text-muted-foreground">
                    {data.routingRules.length} routing rule
                    {data.routingRules.length !== 1 ? 's' : ''} configured
                  </p>
                  <ul className="space-y-1 text-sm">
                    {data.routingRules.map((rule, index) => (
                      <li key={rule.id} className="text-muted-foreground">
                        {index + 1}. If{' '}
                        <code className="rounded bg-muted px-1">{rule.conditionField}</code>{' '}
                        {rule.conditionType.replace('_', ' ')}{' '}
                        <code className="rounded bg-muted px-1">
                          &quot;{rule.conditionValue}&quot;
                        </code>{' '}
                        → use <code className="rounded bg-muted px-1">{rule.operationSlug}</code>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">No routing rules configured.</p>
              )}
              {data.defaultOperationSlug && (
                <p className="text-sm text-muted-foreground">
                  Default operation:{' '}
                  <code className="rounded bg-muted px-1">{data.defaultOperationSlug}</code>
                </p>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              The AI agent will choose from the available operations based on context.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Status info */}
      <Card className="border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/20">
        <CardContent className="flex items-start gap-3 p-4">
          <AlertCircle className="mt-0.5 h-4 w-4 text-amber-600 dark:text-amber-400" />
          <div>
            <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
              Tool will be created in Draft status
            </p>
            <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
              You can generate AI descriptions, configure parameter mappings, and activate the tool
              from the detail page after creation.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Footer */}
      <div className="flex justify-end border-t pt-4">
        <Button onClick={handleCreate} disabled={createTool.isPending} className="gap-2">
          {createTool.isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Creating...
            </>
          ) : (
            <>
              <Check className="h-4 w-4" />
              Create Tool
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
