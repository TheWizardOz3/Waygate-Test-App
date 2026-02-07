'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, AlertCircle, MoreHorizontal, Trash2, Workflow } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
import { usePipeline, useDeletePipeline } from '@/hooks/usePipelines';
import {
  ToolIdentitySection,
  StepsSection,
  SettingsSection,
  AIDescriptionSection,
  ExecutionsSection,
  ExportSection,
} from './sections';

// =============================================================================
// Types
// =============================================================================

interface PipelineDashboardProps {
  pipelineId: string;
}

// =============================================================================
// Helpers
// =============================================================================

function getStatusBadgeVariant(status: string) {
  switch (status) {
    case 'active':
      return 'default' as const;
    case 'draft':
      return 'secondary' as const;
    case 'disabled':
      return 'outline' as const;
    default:
      return 'secondary' as const;
  }
}

// =============================================================================
// Component
// =============================================================================

export function PipelineDashboard({ pipelineId }: PipelineDashboardProps) {
  const router = useRouter();
  const { data: pipeline, isLoading, error, refetch } = usePipeline(pipelineId);
  const deletePipeline = useDeletePipeline();

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this pipeline? This cannot be undone.')) {
      return;
    }
    try {
      await deletePipeline.mutateAsync(pipelineId);
      router.push('/ai-tools');
    } catch (err) {
      console.error('Failed to delete pipeline:', err);
    }
  };

  const handleUpdate = () => {
    refetch();
  };

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Failed to load pipeline</AlertTitle>
        <AlertDescription>
          {error instanceof Error ? error.message : 'An unknown error occurred'}
        </AlertDescription>
      </Alert>
    );
  }

  if (!pipeline) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Pipeline not found</AlertTitle>
        <AlertDescription>The requested pipeline could not be found.</AlertDescription>
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
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500/10 to-cyan-500/10">
              <Workflow className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-heading text-2xl font-bold">{pipeline.name}</h1>
                <Badge variant={getStatusBadgeVariant(pipeline.status)}>{pipeline.status}</Badge>
              </div>
              <code className="text-sm text-muted-foreground">{pipeline.slug}</code>
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
              Delete Pipeline
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Sections */}
      <ToolIdentitySection pipeline={pipeline} onUpdate={handleUpdate} />
      <StepsSection pipeline={pipeline} onUpdate={handleUpdate} />
      <SettingsSection pipeline={pipeline} onUpdate={handleUpdate} />
      <AIDescriptionSection pipeline={pipeline} onUpdate={handleUpdate} />
      <ExecutionsSection pipeline={pipeline} />
      <ExportSection pipeline={pipeline} onUpdate={handleUpdate} />
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
      <Skeleton className="h-[200px] w-full" />
      <Skeleton className="h-[300px] w-full" />
      <Skeleton className="h-[200px] w-full" />
      <Skeleton className="h-[150px] w-full" />
    </div>
  );
}
