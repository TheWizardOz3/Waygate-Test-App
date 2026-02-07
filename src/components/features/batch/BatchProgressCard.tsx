'use client';

/**
 * BatchProgressCard
 *
 * Enhanced progress visualization for batch jobs.
 * Shows stacked progress bar, item counts, processing mode, and failed items.
 */

import {
  CheckCircle2,
  XCircle,
  Clock,
  SkipForward,
  Loader2,
  Zap,
  ArrowRightLeft,
} from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useBatchProgress } from '@/hooks';
import type { AsyncJobDetailResponse } from '@/lib/modules/jobs/jobs.schemas';

// =============================================================================
// Types
// =============================================================================

export interface BatchProgressCardProps {
  jobId: string;
}

// =============================================================================
// Component
// =============================================================================

export function BatchProgressCard({ jobId }: BatchProgressCardProps) {
  const { data: job, isLoading } = useBatchProgress(jobId);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!job) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">Job not found</CardContent>
      </Card>
    );
  }

  const counts = job.itemCounts;
  const total = counts.total || 1;
  const output = job.output as Record<string, unknown> | null;

  // Determine processing mode
  const bulkCallsMade = Number(output?.bulkCallsMade ?? 0);
  const isBulkMode = bulkCallsMade > 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Zap className="h-4 w-4" />
            Batch Progress
          </CardTitle>
          <div className="flex items-center gap-2">
            <ProcessingModeBadge isBulk={!!isBulkMode} />
            <StatusBadge status={job.status} />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Stacked progress bar */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>{job.progress}% complete</span>
            <span>
              {counts.completed + counts.failed + counts.skipped} / {counts.total} items
            </span>
          </div>
          <StackedProgressBar counts={counts} total={total} />
        </div>

        {/* Item counts */}
        <div className="grid grid-cols-4 gap-3">
          <CountCard
            label="Succeeded"
            count={counts.completed}
            icon={CheckCircle2}
            color="text-emerald-500"
          />
          <CountCard label="Failed" count={counts.failed} icon={XCircle} color="text-destructive" />
          <CountCard
            label="Pending"
            count={counts.pending + counts.running}
            icon={Clock}
            color="text-muted-foreground"
          />
          <CountCard
            label="Skipped"
            count={counts.skipped}
            icon={SkipForward}
            color="text-muted-foreground"
          />
        </div>

        {/* Result summary (when complete) */}
        {output && job.status === 'completed' && <ResultSummary output={output} />}
      </CardContent>
    </Card>
  );
}

// =============================================================================
// Subcomponents
// =============================================================================

function StackedProgressBar({
  counts,
  total,
}: {
  counts: AsyncJobDetailResponse['itemCounts'];
  total: number;
}) {
  const succeededPct = (counts.completed / total) * 100;
  const failedPct = (counts.failed / total) * 100;
  const skippedPct = (counts.skipped / total) * 100;
  const runningPct = (counts.running / total) * 100;

  return (
    <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
      {succeededPct > 0 && (
        <div
          className="bg-emerald-500 transition-all duration-500"
          style={{ width: `${succeededPct}%` }}
        />
      )}
      {failedPct > 0 && (
        <div
          className="bg-destructive transition-all duration-500"
          style={{ width: `${failedPct}%` }}
        />
      )}
      {skippedPct > 0 && (
        <div
          className="bg-muted-foreground/30 transition-all duration-500"
          style={{ width: `${skippedPct}%` }}
        />
      )}
      {runningPct > 0 && (
        <div
          className="animate-pulse bg-blue-500 transition-all duration-500"
          style={{ width: `${runningPct}%` }}
        />
      )}
    </div>
  );
}

function CountCard({
  label,
  count,
  icon: Icon,
  color,
}: {
  label: string;
  count: number;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}) {
  return (
    <div className="rounded-lg border p-3 text-center">
      <Icon className={`mx-auto mb-1 h-4 w-4 ${color}`} />
      <div className="text-lg font-semibold">{count}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

function ProcessingModeBadge({ isBulk }: { isBulk: boolean }) {
  return (
    <Badge variant="outline" className="gap-1 text-xs">
      <ArrowRightLeft className="h-3 w-3" />
      {isBulk ? 'Bulk API' : 'Individual (paced)'}
    </Badge>
  );
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<
    string,
    { variant: 'default' | 'secondary' | 'destructive' | 'outline'; label: string }
  > = {
    queued: { variant: 'secondary', label: 'Queued' },
    running: { variant: 'default', label: 'Running' },
    completed: { variant: 'outline', label: 'Completed' },
    failed: { variant: 'destructive', label: 'Failed' },
    cancelled: { variant: 'secondary', label: 'Cancelled' },
  };

  const { variant, label } = config[status] ?? {
    variant: 'secondary' as const,
    label: status,
  };

  return <Badge variant={variant}>{label}</Badge>;
}

function ResultSummary({ output }: { output: Record<string, unknown> }) {
  const bulkCalls = (output.bulkCallsMade as number) ?? 0;
  const individualCalls = (output.individualCallsMade as number) ?? 0;

  return (
    <div className="space-y-2 rounded-lg border p-4">
      <h4 className="text-sm font-medium">Result Summary</h4>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Metric</TableHead>
            <TableHead className="text-right">Value</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell>Succeeded</TableCell>
            <TableCell className="text-right text-emerald-500">
              {(output.succeeded as number) ?? 0}
            </TableCell>
          </TableRow>
          <TableRow>
            <TableCell>Failed</TableCell>
            <TableCell className="text-right text-destructive">
              {(output.failed as number) ?? 0}
            </TableCell>
          </TableRow>
          <TableRow>
            <TableCell>Skipped</TableCell>
            <TableCell className="text-right">{(output.skipped as number) ?? 0}</TableCell>
          </TableRow>
          {bulkCalls > 0 && (
            <TableRow>
              <TableCell>Bulk API calls</TableCell>
              <TableCell className="text-right">{bulkCalls}</TableCell>
            </TableRow>
          )}
          {individualCalls > 0 && (
            <TableRow>
              <TableCell>Individual API calls</TableCell>
              <TableCell className="text-right">{individualCalls}</TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
