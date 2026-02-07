'use client';

import * as React from 'react';
import {
  ArrowLeft,
  Clock,
  DollarSign,
  Hash,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Timer,
  Ban,
  ChevronDown,
  ChevronRight,
  Brain,
  Wrench,
  SkipForward,
  Pause,
  Activity,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { usePipelineExecution, useCancelExecution } from '@/hooks/usePipelines';
import type { StepExecutionResponse } from '@/lib/modules/pipelines/pipeline.schemas';

// =============================================================================
// Types
// =============================================================================

interface ExecutionDetailViewProps {
  executionId: string;
  onBack: () => void;
}

// =============================================================================
// Helpers
// =============================================================================

function getStatusIcon(status: string) {
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
    case 'pending':
      return <Pause className="h-4 w-4 text-muted-foreground" />;
    case 'skipped':
      return <SkipForward className="h-4 w-4 text-muted-foreground" />;
    default:
      return <AlertCircle className="h-4 w-4 text-muted-foreground" />;
  }
}

function getStatusBadgeVariant(status: string) {
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
    case 'skipped':
      return 'outline' as const;
    case 'pending':
      return 'secondary' as const;
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

function formatTimestamp(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}

// =============================================================================
// Component
// =============================================================================

export function ExecutionDetailView({ executionId, onBack }: ExecutionDetailViewProps) {
  const { data: execution, isLoading, error } = usePipelineExecution(executionId);
  const cancelExecution = useCancelExecution();

  if (isLoading) {
    return <ExecutionDetailSkeleton onBack={onBack} />;
  }

  if (error || !execution) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          Back to Executions
        </Button>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {error instanceof Error ? error.message : 'Failed to load execution details'}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const totalDurationMs = execution.startedAt
    ? (execution.completedAt ? new Date(execution.completedAt).getTime() : Date.now()) -
      new Date(execution.startedAt).getTime()
    : null;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="icon" onClick={onBack} className="mt-0.5 shrink-0">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold">Execution Detail</h2>
              <Badge variant={getStatusBadgeVariant(execution.status)}>
                <span className="flex items-center gap-1">
                  {getStatusIcon(execution.status)}
                  {execution.status}
                </span>
              </Badge>
            </div>
            <code className="text-xs text-muted-foreground">{execution.id}</code>
          </div>
        </div>
        {execution.status === 'running' && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => cancelExecution.mutate(executionId)}
            disabled={cancelExecution.isPending}
            className="gap-2"
          >
            <Ban className="h-4 w-4" />
            Cancel
          </Button>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Activity className="h-3.5 w-3.5" />
              Steps
            </div>
            <p className="mt-1 text-lg font-semibold">
              {execution.currentStepNumber}/{execution.totalSteps}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              Duration
            </div>
            <p className="mt-1 text-lg font-semibold">{formatDuration(totalDurationMs)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <DollarSign className="h-3.5 w-3.5" />
              Cost
            </div>
            <p className="mt-1 text-lg font-semibold">{formatCost(execution.totalCostUsd)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Hash className="h-3.5 w-3.5" />
              Tokens
            </div>
            <p className="mt-1 text-lg font-semibold">{execution.totalTokens.toLocaleString()}</p>
          </CardContent>
        </Card>
      </div>

      {/* Timing */}
      <Card>
        <CardContent className="flex flex-wrap gap-6 p-4 text-sm">
          <div>
            <span className="text-muted-foreground">Started:</span>{' '}
            <span className="font-medium">{formatTimestamp(execution.startedAt)}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Completed:</span>{' '}
            <span className="font-medium">{formatTimestamp(execution.completedAt)}</span>
          </div>
        </CardContent>
      </Card>

      {/* Input */}
      {execution.input && Object.keys(execution.input).length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Pipeline Input</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="max-h-40 overflow-auto rounded-lg bg-muted p-3 text-xs">
              <code>{JSON.stringify(execution.input, null, 2)}</code>
            </pre>
          </CardContent>
        </Card>
      )}

      {/* Error */}
      {execution.error && (
        <Alert variant="destructive">
          <XCircle className="h-4 w-4" />
          <AlertDescription>
            <pre className="mt-1 whitespace-pre-wrap text-xs">
              {JSON.stringify(execution.error, null, 2)}
            </pre>
          </AlertDescription>
        </Alert>
      )}

      {/* Step Executions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Step-by-Step Progress</CardTitle>
          <CardDescription>Detailed view of each step&apos;s execution</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {execution.stepExecutions && execution.stepExecutions.length > 0 ? (
            execution.stepExecutions
              .sort((a, b) => a.stepNumber - b.stepNumber)
              .map((step) => <StepExecutionCard key={step.id} step={step} />)
          ) : (
            <p className="text-sm text-muted-foreground">No step executions recorded yet.</p>
          )}
        </CardContent>
      </Card>

      {/* Final Output */}
      {execution.output && Object.keys(execution.output).length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Pipeline Output</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="max-h-60 overflow-auto rounded-lg bg-muted p-3 text-xs">
              <code>{JSON.stringify(execution.output, null, 2)}</code>
            </pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// =============================================================================
// Step Execution Card
// =============================================================================

function StepExecutionCard({ step }: { step: StepExecutionResponse }) {
  const [expanded, setExpanded] = React.useState(false);

  return (
    <div className="rounded-lg border">
      {/* Step Header */}
      <button
        type="button"
        className="flex w-full items-center gap-3 p-3 text-left hover:bg-muted/50"
        onClick={() => setExpanded((prev) => !prev)}
      >
        {/* Step Number */}
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
          {step.stepNumber}
        </div>

        {/* Status */}
        <div className="flex items-center gap-2">
          {getStatusIcon(step.status)}
          <Badge variant={getStatusBadgeVariant(step.status)} className="text-xs">
            {step.status}
          </Badge>
        </div>

        {/* Meta */}
        <div className="flex flex-1 items-center gap-4 text-xs text-muted-foreground">
          {step.durationMs > 0 && (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {formatDuration(step.durationMs)}
            </span>
          )}
          {step.costUsd > 0 && (
            <span className="flex items-center gap-1">
              <DollarSign className="h-3 w-3" />
              {formatCost(step.costUsd)}
            </span>
          )}
          {step.tokensUsed > 0 && (
            <span className="flex items-center gap-1">
              <Hash className="h-3 w-3" />
              {step.tokensUsed.toLocaleString()}
            </span>
          )}
          {step.retryCount > 0 && (
            <span className="text-amber-600 dark:text-amber-400">{step.retryCount} retries</span>
          )}
        </div>

        {/* Expand */}
        {expanded ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
      </button>

      {/* Expanded Content */}
      {expanded && (
        <div className="space-y-3 border-t px-3 py-3">
          {/* Resolved Input */}
          {step.resolvedInput && Object.keys(step.resolvedInput).length > 0 && (
            <div>
              <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Wrench className="h-3 w-3" />
                Resolved Input
              </div>
              <pre className="max-h-32 overflow-auto rounded-md bg-muted p-2 text-xs">
                <code>{JSON.stringify(step.resolvedInput, null, 2)}</code>
              </pre>
            </div>
          )}

          {/* Tool Output */}
          {step.toolOutput && Object.keys(step.toolOutput).length > 0 && (
            <div>
              <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Wrench className="h-3 w-3" />
                Tool Output
              </div>
              <pre className="max-h-40 overflow-auto rounded-md bg-muted p-2 text-xs">
                <code>{JSON.stringify(step.toolOutput, null, 2)}</code>
              </pre>
            </div>
          )}

          {/* Reasoning Output */}
          {step.reasoningOutput && Object.keys(step.reasoningOutput).length > 0 && (
            <div>
              <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Brain className="h-3 w-3" />
                Reasoning Output
              </div>
              <pre className="max-h-40 overflow-auto rounded-md bg-muted p-2 text-xs">
                <code>{JSON.stringify(step.reasoningOutput, null, 2)}</code>
              </pre>
            </div>
          )}

          {/* Error */}
          {step.error && Object.keys(step.error).length > 0 && (
            <div>
              <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-destructive">
                <XCircle className="h-3 w-3" />
                Error
              </div>
              <pre className="max-h-32 overflow-auto rounded-md bg-destructive/10 p-2 text-xs text-destructive">
                <code>{JSON.stringify(step.error, null, 2)}</code>
              </pre>
            </div>
          )}

          {/* No data message */}
          {!step.resolvedInput && !step.toolOutput && !step.reasoningOutput && !step.error && (
            <p className="text-xs text-muted-foreground">
              No detailed data available for this step.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Skeleton
// =============================================================================

function ExecutionDetailSkeleton({ onBack }: { onBack: () => void }) {
  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" onClick={onBack} className="gap-2">
        <ArrowLeft className="h-4 w-4" />
        Back to Executions
      </Button>
      <div className="flex items-center gap-3">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-5 w-20 rounded-full" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-32 w-full rounded-lg" />
      <Skeleton className="h-48 w-full rounded-lg" />
    </div>
  );
}
