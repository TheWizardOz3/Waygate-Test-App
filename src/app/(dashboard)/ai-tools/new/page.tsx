'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Brain, GitMerge, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { CreateCompositeToolWizard } from '@/components/features/composite-tools';
import { CreateAgenticToolWizard } from '@/components/features/agentic-tools';

type ToolType = 'composite' | 'agentic' | null;

export default function CreateAIToolPage() {
  const router = useRouter();
  const [selectedToolType, setSelectedToolType] = useState<ToolType>(null);

  if (selectedToolType === 'composite') {
    return <CreateCompositeToolWizard />;
  }

  if (selectedToolType === 'agentic') {
    return <CreateAgenticToolWizard />;
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <Card className="border-border/50 shadow-lg">
        <CardHeader>
          <CardTitle className="font-heading text-2xl">Create AI Tool</CardTitle>
          <CardDescription>
            Choose the type of AI tool you want to create. Each type serves different use cases.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Composite Tool Option */}
          <button
            onClick={() => setSelectedToolType('composite')}
            className={cn(
              'group relative w-full rounded-lg border-2 p-6 text-left transition-all',
              'hover:border-primary hover:bg-accent/50',
              'focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2'
            )}
          >
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                <GitMerge className="h-6 w-6" />
              </div>
              <div className="flex-1">
                <h3 className="font-heading text-lg font-semibold">Composite Tool</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Combine multiple operations with intelligent routing. The tool routes requests to
                  the right operation using rules or an AI agent.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="inline-flex items-center rounded-md bg-accent px-2 py-1 text-xs font-medium text-accent-foreground">
                    Rule-based routing
                  </span>
                  <span className="inline-flex items-center rounded-md bg-accent px-2 py-1 text-xs font-medium text-accent-foreground">
                    Agent-driven routing
                  </span>
                </div>
              </div>
              <ArrowRight className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-primary" />
            </div>
          </button>

          {/* Agentic Tool Option */}
          <button
            onClick={() => setSelectedToolType('agentic')}
            className={cn(
              'group relative w-full rounded-lg border-2 p-6 text-left transition-all',
              'hover:border-primary hover:bg-accent/50',
              'focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2'
            )}
          >
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-violet-600/10 text-violet-600 transition-colors group-hover:bg-violet-600 group-hover:text-white">
                <Brain className="h-6 w-6" />
              </div>
              <div className="flex-1">
                <h3 className="font-heading text-lg font-semibold">Agentic Tool</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Embed an LLM that translates natural language into API parameters or autonomously
                  executes tools to accomplish complex goals.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="inline-flex items-center rounded-md bg-violet-600/10 px-2 py-1 text-xs font-medium text-violet-600">
                    Parameter interpreter
                  </span>
                  <span className="inline-flex items-center rounded-md bg-violet-600/10 px-2 py-1 text-xs font-medium text-violet-600">
                    Autonomous agent
                  </span>
                </div>
              </div>
              <ArrowRight className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-violet-600" />
            </div>
          </button>

          <div className="pt-4">
            <Button variant="ghost" onClick={() => router.push('/ai-tools')} className="w-full">
              Cancel
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
