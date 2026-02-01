'use client';

import { use, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { CompositeToolDetail } from '@/components/features/composite-tools';
import { AgenticToolDetail } from '@/components/features/agentic-tools';
import type { AgenticToolResponse } from '@/lib/modules/agentic-tools/agentic-tool.schemas';

interface PageProps {
  params: Promise<{ id: string }>;
}

type ToolType = 'composite' | 'agentic';

export default function AIToolDetailPage({ params }: PageProps) {
  const { id } = use(params);
  const [toolType, setToolType] = useState<ToolType | null>(null);
  const [agenticTool, setAgenticTool] = useState<AgenticToolResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchTool() {
      try {
        // Try fetching as agentic tool first
        const agenticResponse = await fetch(`/api/v1/agentic-tools/${id}`);

        if (agenticResponse.ok) {
          const result = await agenticResponse.json();
          setAgenticTool(result.data);
          setToolType('agentic');
        } else if (agenticResponse.status === 404) {
          // If not found as agentic, assume it's composite
          setToolType('composite');
        } else {
          throw new Error('Failed to fetch tool');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load tool');
      } finally {
        setIsLoading(false);
      }
    }

    fetchTool();
  }, [id]);

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">{error}</div>
    );
  }

  if (toolType === 'agentic' && agenticTool) {
    return <AgenticToolDetail tool={agenticTool} />;
  }

  if (toolType === 'composite') {
    return <CompositeToolDetail toolId={id} />;
  }

  return (
    <div className="flex h-64 items-center justify-center text-muted-foreground">
      Tool not found
    </div>
  );
}
