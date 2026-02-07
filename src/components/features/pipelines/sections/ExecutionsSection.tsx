'use client';

import * as React from 'react';
import {
  Clock,
  DollarSign,
  Hash,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Timer,
  Ban,
  ChevronRight,
  Activity,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { usePipelineExecutions, useCancelExecution } from '@/hooks/usePipelines';
import { ExecutionDetailView } from './ExecutionDetailView';
import type { PipelineDetailResponse } from '@/lib/modules/pipelines/pipeline.schemas';
import type { PipelineExecutionResponse } from '@/lib/modules/pipelines/pipeline.schemas';

// =============================================================================
// Types
// =============================================================================

interface ExecutionsSectionProps {
  pipeline: PipelineDetailResponse;
}

// =============================================================================
// Helpers
// =============================================================================

function getExecutionStatusIcon(status: string) {
  switch (status) {
    case 'completed':
      return <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />;
    case 'failed':
      return <XCircle className="h-4 w-4 text-destructive" />;
    case 'running':
      return <Loader2 className="h-4 w-4 animate-spin text-blue-600 dark:text-blue-400" />;
    case 'timeout':
      return <Timer className="h-4 w-4 text-amber-600 dark:text-amber-400" />;
    case 'cancelled':
      return <Ban className="h-4 w-4 text-muted-foreground" />;
    default:
      return <AlertCircle className="h-4 w-4 text-muted-foreground" />;
  }
}

function getExecutionStatusBadgeVariant(status: string) {
  switch (status) {
    case 'completed':
      return 'default' as const;
    case 'failed':
      return 'destructive' as const;
    case 'running':
      return 'secondary' as const;
    case 'timeout':
      return 'outline' as const;
    case 'cancelled':
      return 'outline' as const;
    default:
      return 'secondary' as const;
  }
}

function formatDuration(ms: number | null | undefined): string {
  if (!ms && ms !== 0) return '—';
  if (ms < 1000) return `${ms}ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = (seconds % 60).toFixed(0);
  return `${minutes}m ${remainingSeconds}s`;
}

function formatCost(cost: number): string {
  if (cost === 0) return '$0.00';
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  return `$${cost.toFixed(2)}`;
}

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

function computeDurationMs(execution: PipelineExecutionResponse): number | null {
  if (!execution.startedAt) return null;
  const start = new Date(execution.startedAt).getTime();
  const end = execution.completedAt ? new Date(execution.completedAt).getTime() : Date.now();
  return end - start;
}

// =============================================================================
// Component
// =============================================================================

export function ExecutionsSection({ pipeline }: ExecutionsSectionProps) {
  const [selectedExecutionId, setSelectedExecutionId] = React.useState<string | null>(null);

  const { data, isLoading, error } = usePipelineExecutions({ pipelineId: pipeline.id, limit: 20 });

  const cancelExecution = useCancelExecution();

  const executions = data?.executions ?? [];

  if (selectedExecutionId) {
    return (
      <ExecutionDetailView
        executionId={selectedExecutionId}
        onBack={() => setSelectedExecutionId(null)}
      />
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Executions
            </CardTitle>
            <CardDescription>Recent pipeline runs with status, cost, and duration</CardDescription>
          </div>
          {!isLoading && data?.pagination && (
            <Badge variant="secondary">{data.pagination.totalCount} total</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <ExecutionsSkeleton />
        ) : error ? (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-center">
            <p className="text-sm font-medium text-destructive">Failed to load executions</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {error instanceof Error ? error.message : 'An unknown error occurred'}
            </p>
          </div>
        ) : executions.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center">
            <Activity className="h-8 w-8 text-muted-foreground" />
            <h3 className="mt-3 text-sm font-medium">No Executions Yet</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Invoke this pipeline to see execution history here.
            </p>
          </div>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[180px]">Status</TableHead>
                  <TableHead className="w-[100px]">Steps</TableHead>
                  <TableHead className="w-[120px]">Duration</TableHead>
                  <TableHead className="w-[100px]">Cost</TableHead>
                  <TableHead className="w-[100px]">Tokens</TableHead>
                  <TableHead className="w-[120px]">Started</TableHead>
                  <TableHead className="w-[80px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {executions.map((execution) => {
                  const durationMs = computeDurationMs(execution);
                  return (
                    <TableRow
                      key={execution.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => setSelectedExecutionId(execution.id)}
                    >
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {getExecutionStatusIcon(execution.status)}
                          <Badge variant={getExecutionStatusBadgeVariant(execution.status)}>
                            {execution.status}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-muted-foreground">
                          {execution.currentStepNumber}/{execution.totalSteps}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-sm text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          {formatDuration(durationMs)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-sm text-muted-foreground">
                          <DollarSign className="h-3 w-3" />
                          {formatCost(execution.totalCostUsd)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-sm text-muted-foreground">
                          <Hash className="h-3 w-3" />
                          {execution.totalTokens.toLocaleString()}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-muted-foreground">
                          {formatTimestamp(execution.startedAt)}
                        </span>
                      </TableCell>
                      <TableCell>
                        {execution.status === 'running' ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              cancelExecution.mutate(execution.id);
                            }}
                            disabled={cancelExecution.isPending}
                          >
                            <Ban className="h-4 w-4" />
                          </Button>
                        ) : (
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// =============================================================================
// Skeleton
// =============================================================================

function ExecutionsSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 rounded-md border p-3">
          <Skeleton className="h-5 w-20 rounded-full" />
          <Skeleton className="h-4 w-12" />
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-14" />
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-14" />
        </div>
      ))}
    </div>
  );
}
