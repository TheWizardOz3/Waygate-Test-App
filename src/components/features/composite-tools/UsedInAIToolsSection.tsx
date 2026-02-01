'use client';

import Link from 'next/link';
import { Wand2, ArrowRight, Layers } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { CompositeToolResponse } from '@/lib/modules/composite-tools/composite-tool.schemas';

interface UsedInAIToolsSectionProps {
  compositeTools: CompositeToolResponse[] | undefined;
  isLoading: boolean;
  title?: string;
  description?: string;
  emptyMessage?: string;
  className?: string;
}

/**
 * Displays a section showing composite tools that use a specific action or integration.
 * Used in the Action editor's AI Tools tab and Integration AI Tools tab.
 */
export function UsedInAIToolsSection({
  compositeTools,
  isLoading,
  title = 'Used in Composite Tools',
  description = 'This is included in the following composite tools',
  emptyMessage = 'Not used in any composite tools yet.',
  className,
}: UsedInAIToolsSectionProps) {
  if (isLoading) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Layers className="h-4 w-4" />
            {title}
          </CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[1, 2].map((i) => (
              <div key={i} className="flex items-center justify-between rounded-lg border p-3">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-8 w-8 rounded-md" />
                  <div className="space-y-1">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                </div>
                <Skeleton className="h-5 w-16" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const hasTools = compositeTools && compositeTools.length > 0;

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Layers className="h-4 w-4" />
          {title}
          {hasTools && (
            <Badge variant="secondary" className="ml-1">
              {compositeTools.length}
            </Badge>
          )}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {hasTools ? (
          <div className="space-y-2">
            {compositeTools.map((tool) => (
              <Link
                key={tool.id}
                href={`/ai-tools/${tool.id}`}
                className="flex items-center justify-between rounded-lg border bg-card p-3 transition-colors hover:bg-muted/50"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-md bg-gradient-to-br from-violet-500/10 to-indigo-500/10">
                    <Wand2 className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                  </div>
                  <div>
                    <p className="font-medium">{tool.name}</p>
                    <code className="text-xs text-muted-foreground">{tool.slug}</code>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={tool.status === 'active' ? 'default' : 'secondary'}>
                    {tool.status}
                  </Badge>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed bg-muted/20 p-6 text-center">
            <Wand2 className="mx-auto h-8 w-8 text-muted-foreground/50" />
            <p className="mt-2 text-sm text-muted-foreground">{emptyMessage}</p>
            <Button variant="outline" size="sm" className="mt-3" asChild>
              <Link href="/ai-tools/new">Create Composite Tool</Link>
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default UsedInAIToolsSection;
