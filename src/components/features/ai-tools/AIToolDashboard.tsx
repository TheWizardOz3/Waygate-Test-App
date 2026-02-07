'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  AlertCircle,
  FileText,
  Layers,
  Sparkles,
  Download,
  MoreHorizontal,
  Trash2,
  GitMerge,
  Brain,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useCompositeTool, useDeleteCompositeTool } from '@/hooks/useCompositeTools';
import { apiClient } from '@/lib/api/client';
import { DetailsTab, ToolsActionsTab, IntelligenceTab, ExportTab } from './tabs';
import { PipelineDashboard } from '@/components/features/pipelines';
import type { CompositeToolDetailResponse } from '@/lib/modules/composite-tools/composite-tool.schemas';
import type { AgenticToolResponse } from '@/lib/modules/agentic-tools/agentic-tool.schemas';

// =============================================================================
// Types
// =============================================================================

interface AIToolDashboardProps {
  toolId: string;
}

type ToolType = 'composite' | 'agentic' | 'pipeline';
type TabValue = 'details' | 'tools' | 'intelligence' | 'export';

// =============================================================================
// Helper Functions
// =============================================================================

function getStatusBadgeVariant(status: string) {
  switch (status) {
    case 'active':
      return 'default';
    case 'draft':
      return 'secondary';
    case 'disabled':
      return 'outline';
    default:
      return 'secondary';
  }
}

// =============================================================================
// Component
// =============================================================================

export function AIToolDashboard({ toolId }: AIToolDashboardProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTab = (searchParams.get('tab') as TabValue) || 'details';
  const [activeTab, setActiveTab] = useState<TabValue>(initialTab);

  const [toolType, setToolType] = useState<ToolType | null>(null);
  const [agenticTool, setAgenticTool] = useState<AgenticToolResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const {
    data: compositeTool,
    isLoading: isLoadingComposite,
    refetch: refetchComposite,
  } = useCompositeTool(toolType === 'composite' ? toolId : undefined);
  const deleteCompositeTool = useDeleteCompositeTool();

  // Detect tool type on mount
  useEffect(() => {
    async function detectToolType() {
      try {
        // Try fetching as pipeline first
        const pipelineResult = await apiClient.get(`/pipelines/${toolId}`).catch(() => null);

        if (pipelineResult) {
          setToolType('pipeline');
          setIsLoading(false);
          return;
        }

        // Try fetching as agentic tool
        // Note: apiClient.get already extracts the 'data' field from the API response
        const agenticResult = await apiClient
          .get<AgenticToolResponse>(`/agentic-tools/${toolId}`)
          .catch(() => null);

        if (agenticResult) {
          setAgenticTool(agenticResult);
          setToolType('agentic');
        } else {
          // If not found as agentic, assume it's composite
          setToolType('composite');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load tool');
      } finally {
        setIsLoading(false);
      }
    }

    detectToolType();
  }, [toolId]);

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this tool? This cannot be undone.')) {
      return;
    }

    try {
      if (toolType === 'composite') {
        await deleteCompositeTool.mutateAsync(toolId);
      } else {
        await apiClient.delete(`/agentic-tools/${toolId}`);
      }
      router.push('/ai-tools');
    } catch (err) {
      console.error('Failed to delete tool:', err);
    }
  };

  const handleTabChange = (value: string) => {
    setActiveTab(value as TabValue);
    // Update URL without navigation
    const url = new URL(window.location.href);
    if (value === 'details') {
      url.searchParams.delete('tab');
    } else {
      url.searchParams.set('tab', value);
    }
    window.history.replaceState({}, '', url.toString());
  };

  const handleUpdate = () => {
    if (toolType === 'composite') {
      refetchComposite();
    } else {
      // Refetch agentic tool
      // Note: apiClient.get already extracts the 'data' field from the API response
      apiClient
        .get<AgenticToolResponse>(`/agentic-tools/${toolId}`)
        .then((result) => setAgenticTool(result))
        .catch(console.error);
    }
  };

  // Loading state
  if (isLoading || (toolType === 'composite' && isLoadingComposite)) {
    return <DashboardSkeleton />;
  }

  // Error state
  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Failed to load tool</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  // Pipeline tools use their own dashboard
  if (toolType === 'pipeline') {
    return <PipelineDashboard pipelineId={toolId} />;
  }

  // Get the tool data
  const tool = toolType === 'composite' ? compositeTool : agenticTool;
  if (!tool) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Tool not found</AlertTitle>
        <AlertDescription>The requested tool could not be found.</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <Button variant="ghost" size="icon" asChild className="mt-1 shrink-0">
            <Link href="/ai-tools">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div className="flex items-center gap-3">
            <div
              className={`flex h-12 w-12 items-center justify-center rounded-lg ${
                toolType === 'composite'
                  ? 'bg-gradient-to-br from-violet-500/10 to-indigo-500/10'
                  : 'bg-violet-600/10'
              }`}
            >
              {toolType === 'composite' ? (
                <GitMerge className="h-6 w-6 text-violet-600 dark:text-violet-400" />
              ) : (
                <Brain className="h-6 w-6 text-violet-600 dark:text-violet-400" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-heading text-2xl font-bold">{tool.name}</h1>
                <Badge variant={getStatusBadgeVariant(tool.status)}>{tool.status}</Badge>
              </div>
              <code className="text-sm text-muted-foreground">{tool.slug}</code>
            </div>
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={handleDelete}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete Tool
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-4">
        <TabsList className="h-auto w-full justify-start rounded-none border-b bg-transparent p-0">
          <TabsTrigger
            value="details"
            className="relative gap-2 rounded-none border-b-2 border-transparent px-4 pb-3 pt-2 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
          >
            <FileText className="h-4 w-4" />
            Details
          </TabsTrigger>
          <TabsTrigger
            value="tools"
            className="relative gap-2 rounded-none border-b-2 border-transparent px-4 pb-3 pt-2 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
          >
            <Layers className="h-4 w-4" />
            Tools/Actions
            {toolType === 'composite' && compositeTool && compositeTool.operations.length > 0 && (
              <Badge variant="secondary" className="ml-1">
                {compositeTool.operations.length}
              </Badge>
            )}
            {toolType === 'agentic' &&
              agenticTool &&
              (() => {
                const allocation = agenticTool.toolAllocation as
                  | {
                      targetActions?: unknown[];
                      availableTools?: unknown[];
                    }
                  | undefined;
                const count =
                  allocation?.targetActions?.length || allocation?.availableTools?.length || 0;
                return count > 0 ? (
                  <Badge variant="secondary" className="ml-1">
                    {count}
                  </Badge>
                ) : null;
              })()}
          </TabsTrigger>
          <TabsTrigger
            value="intelligence"
            className="relative gap-2 rounded-none border-b-2 border-transparent px-4 pb-3 pt-2 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
          >
            <Sparkles className="h-4 w-4" />
            Intelligence
          </TabsTrigger>
          <TabsTrigger
            value="export"
            className="relative gap-2 rounded-none border-b-2 border-transparent px-4 pb-3 pt-2 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
          >
            <Download className="h-4 w-4" />
            Export
          </TabsTrigger>
        </TabsList>

        <TabsContent value="details" forceMount className="data-[state=inactive]:hidden">
          <DetailsTab
            tool={tool as CompositeToolDetailResponse | AgenticToolResponse}
            toolType={toolType!}
            onUpdate={handleUpdate}
          />
        </TabsContent>

        <TabsContent value="tools" forceMount className="min-w-0 data-[state=inactive]:hidden">
          <ToolsActionsTab
            tool={tool as CompositeToolDetailResponse | AgenticToolResponse}
            toolType={toolType!}
            onUpdate={handleUpdate}
          />
        </TabsContent>

        <TabsContent value="intelligence" forceMount className="data-[state=inactive]:hidden">
          <IntelligenceTab
            tool={tool as CompositeToolDetailResponse | AgenticToolResponse}
            toolType={toolType!}
            onUpdate={handleUpdate}
          />
        </TabsContent>

        <TabsContent value="export" forceMount className="data-[state=inactive]:hidden">
          <ExportTab
            tool={tool as CompositeToolDetailResponse | AgenticToolResponse}
            toolType={toolType!}
            onUpdate={handleUpdate}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// =============================================================================
// Skeleton
// =============================================================================

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-start gap-4">
        <Skeleton className="h-10 w-10 rounded-md" />
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-32" />
        </div>
      </div>
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-[400px] w-full" />
    </div>
  );
}
