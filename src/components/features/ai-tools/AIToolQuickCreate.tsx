'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { GitMerge, Brain, Loader2, ArrowLeft, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import { useCreateCompositeTool } from '@/hooks/useCompositeTools';
import { apiClient } from '@/lib/api/client';

// =============================================================================
// Types
// =============================================================================

type ToolType = 'composite' | 'agentic';

// =============================================================================
// Helper Functions
// =============================================================================

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

// =============================================================================
// Component
// =============================================================================

export function AIToolQuickCreate() {
  const router = useRouter();
  const createCompositeTool = useCreateCompositeTool();

  // Form state
  const [toolType, setToolType] = useState<ToolType | null>(null);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-generate slug from name
  const handleNameChange = (value: string) => {
    setName(value);
    // Only auto-generate if slug hasn't been manually edited
    if (!slug || slug === generateSlug(name)) {
      setSlug(generateSlug(value));
    }
  };

  const handleCreate = async () => {
    if (!toolType || !name.trim() || !slug.trim()) return;

    setIsCreating(true);
    setError(null);

    try {
      if (toolType === 'composite') {
        // Create composite tool with minimal data
        const result = await createCompositeTool.mutateAsync({
          name: name.trim(),
          slug: slug.trim(),
          description: description.trim() || undefined,
          routingMode: 'rule_based', // Default
          status: 'draft',
          unifiedInputSchema: {},
          metadata: {},
          operations: [], // Will be added in the dashboard
          routingRules: [],
        });
        router.push(`/ai-tools/${result.id}`);
      } else {
        // Create agentic tool with default configuration
        const result = await apiClient.post<{ id: string }>('/agentic-tools', {
          name: name.trim(),
          slug: slug.trim(),
          description: description.trim() || undefined,
          executionMode: 'parameter_interpreter', // Default
          embeddedLLMConfig: {
            provider: 'anthropic',
            model: 'claude-sonnet-4.5',
            reasoningLevel: 'none',
            temperature: 0.2,
            maxTokens: 4000,
          },
          systemPrompt:
            'You are a helpful assistant. Process the user input and generate appropriate parameters for the target action.',
          toolAllocation: {
            mode: 'parameter_interpreter',
            targetActions: [], // Will be added in the dashboard
          },
          contextConfig: {
            variables: {},
            autoInjectSchemas: true,
          },
          safetyLimits: {
            maxToolCalls: 10,
            timeoutSeconds: 300,
            maxTotalCost: 1.0,
          },
          status: 'draft',
        });
        router.push(`/ai-tools/${result.id}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create tool. Please try again.');
      setIsCreating(false);
    }
  };

  const canCreate = toolType && name.trim() && slug.trim();

  // Step 1: Select tool type
  if (!toolType) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.push('/ai-tools')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="font-heading text-2xl font-bold">Create AI Tool</h1>
            <p className="text-muted-foreground">Choose the type of tool you want to create</p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {/* Composite Tool Card */}
          <Card
            className={cn('cursor-pointer transition-all hover:border-primary/50 hover:shadow-md')}
            onClick={() => setToolType('composite')}
          >
            <CardHeader>
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                <GitMerge className="h-6 w-6 text-primary" />
              </div>
              <CardTitle className="mt-4">Composite Tool</CardTitle>
              <CardDescription>
                Combine multiple operations with intelligent routing. Route requests to the right
                operation using rules or expose operations as an enum argument.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                <span className="rounded-md bg-muted px-2 py-1 text-xs">Rule-based routing</span>
                <span className="rounded-md bg-muted px-2 py-1 text-xs">Multi-operation</span>
              </div>
            </CardContent>
          </Card>

          {/* Agentic Tool Card */}
          <Card
            className={cn(
              'cursor-pointer transition-all hover:border-violet-500/50 hover:shadow-md'
            )}
            onClick={() => setToolType('agentic')}
          >
            <CardHeader>
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-violet-600/10">
                <Brain className="h-6 w-6 text-violet-600" />
              </div>
              <CardTitle className="mt-4">Agentic Tool</CardTitle>
              <CardDescription>
                Embed an LLM that translates natural language into API parameters or autonomously
                executes tools to accomplish complex goals.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                <span className="rounded-md bg-violet-600/10 px-2 py-1 text-xs text-violet-600">
                  Query transformation
                </span>
                <span className="rounded-md bg-violet-600/10 px-2 py-1 text-xs text-violet-600">
                  Embedded LLM
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Step 2: Enter name and description
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => setToolType(null)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex items-center gap-3">
          <div
            className={cn(
              'flex h-10 w-10 items-center justify-center rounded-lg',
              toolType === 'composite' ? 'bg-primary/10' : 'bg-violet-600/10'
            )}
          >
            {toolType === 'composite' ? (
              <GitMerge className="h-5 w-5 text-primary" />
            ) : (
              <Brain className="h-5 w-5 text-violet-600" />
            )}
          </div>
          <div>
            <h1 className="font-heading text-2xl font-bold">
              Create {toolType === 'composite' ? 'Composite' : 'Agentic'} Tool
            </h1>
            <p className="text-muted-foreground">Enter the basic details for your tool</p>
          </div>
        </div>
      </div>

      <Card>
        <CardContent className="space-y-4 pt-6">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="name">
              Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="e.g., Smart Scraper, Research Assistant"
              disabled={isCreating}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="slug">
              Slug <span className="text-destructive">*</span>
            </Label>
            <Input
              id="slug"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="e.g., smart-scraper"
              disabled={isCreating}
            />
            <p className="text-xs text-muted-foreground">
              Used in API calls and exports. Lowercase letters, numbers, and hyphens only.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does this tool do?"
              rows={3}
              disabled={isCreating}
            />
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button
              variant="outline"
              onClick={() => router.push('/ai-tools')}
              disabled={isCreating}
            >
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={!canCreate || isCreating}>
              {isCreating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  Create & Configure
                  <ArrowRight className="ml-2 h-4 w-4" />
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      <p className="text-center text-sm text-muted-foreground">
        After creating, you&apos;ll be able to configure operations, routing, and AI descriptions.
      </p>
    </div>
  );
}
