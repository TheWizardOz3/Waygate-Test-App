'use client';

import { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertCircle,
  AlertTriangle,
  Info,
  CheckCircle2,
  XCircle,
  Clock,
  Undo2,
  Sparkles,
  Search,
  Loader2,
  ArrowDownUp,
  Wrench,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useProposals, useTriggerMaintenance, useBatchApprove } from '@/hooks/useAutoMaintenance';
import type {
  MaintenanceProposalResponse,
  ProposalStatus,
  ProposalSeverity,
  ProposalSource,
} from '@/lib/modules/auto-maintenance/auto-maintenance.schemas';

// =============================================================================
// Props
// =============================================================================

interface MaintenanceProposalListProps {
  integrationId: string;
  onSelectProposal?: (proposal: MaintenanceProposalResponse) => void;
}

// =============================================================================
// Config
// =============================================================================

const severityConfig: Record<
  ProposalSeverity,
  { label: string; icon: React.ElementType; className: string }
> = {
  breaking: {
    label: 'Breaking',
    icon: AlertCircle,
    className: 'gap-1 bg-destructive/10 text-destructive border-destructive/20',
  },
  warning: {
    label: 'Warning',
    icon: AlertTriangle,
    className: 'gap-1 bg-amber-500/10 text-amber-600 border-amber-500/20',
  },
  info: {
    label: 'Info',
    icon: Info,
    className: 'gap-1 bg-muted text-muted-foreground',
  },
};

const statusConfig: Record<
  ProposalStatus,
  { label: string; icon: React.ElementType; className: string }
> = {
  pending: {
    label: 'Pending',
    icon: Clock,
    className: 'gap-1 bg-blue-500/10 text-blue-600 border-blue-500/20',
  },
  approved: {
    label: 'Approved',
    icon: CheckCircle2,
    className: 'gap-1 bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
  },
  rejected: {
    label: 'Rejected',
    icon: XCircle,
    className: 'gap-1 bg-muted text-muted-foreground',
  },
  expired: {
    label: 'Expired',
    icon: Clock,
    className: 'gap-1 bg-muted text-muted-foreground/60',
  },
  reverted: {
    label: 'Reverted',
    icon: Undo2,
    className: 'gap-1 bg-amber-500/10 text-amber-600 border-amber-500/20',
  },
};

const sourceLabels: Record<ProposalSource, string> = {
  inference: 'Inference',
  rescrape: 'Re-scrape',
};

// =============================================================================
// Sub-Components
// =============================================================================

function SeverityBadge({ severity }: { severity: ProposalSeverity }) {
  const config = severityConfig[severity];
  const Icon = config.icon;
  return (
    <Badge variant="outline" className={config.className}>
      <Icon className="h-3 w-3" />
      {config.label}
    </Badge>
  );
}

function StatusBadge({ status }: { status: ProposalStatus }) {
  const config = statusConfig[status];
  const Icon = config.icon;
  return (
    <Badge variant="outline" className={config.className}>
      <Icon className="h-3 w-3" />
      {config.label}
    </Badge>
  );
}

function DirectionBadge({ proposal }: { proposal: MaintenanceProposalResponse }) {
  const hasInput = proposal.proposedInputSchema !== null;
  const hasOutput = proposal.proposedOutputSchema !== null;

  if (hasInput && hasOutput) {
    return (
      <Badge variant="outline" className="gap-1 text-xs">
        <ArrowDownUp className="h-3 w-3" />
        Both
      </Badge>
    );
  }
  if (hasInput) {
    return (
      <Badge
        variant="outline"
        className="gap-1 border-blue-500/20 bg-blue-500/10 text-xs text-blue-600"
      >
        Input
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1 text-xs">
      Output
    </Badge>
  );
}

function ChangeSummary({ changes }: { changes: MaintenanceProposalResponse['changes'] }) {
  if (changes.length === 0) return <span className="text-muted-foreground">No changes</span>;
  if (changes.length === 1) return <span className="text-sm">{changes[0].description}</span>;
  return (
    <span className="text-sm">
      {changes.length} field change{changes.length > 1 ? 's' : ''}
    </span>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export function MaintenanceProposalList({
  integrationId,
  onSelectProposal,
}: MaintenanceProposalListProps) {
  const [statusFilter, setStatusFilter] = useState<ProposalStatus | 'all'>('all');
  const [severityFilter, setSeverityFilter] = useState<ProposalSeverity | 'all'>('all');
  const [cursor, setCursor] = useState<string | undefined>(undefined);

  const { data, isLoading, isError } = useProposals(integrationId, {
    status: statusFilter === 'all' ? undefined : statusFilter,
    severity: severityFilter === 'all' ? undefined : severityFilter,
    cursor,
    limit: 20,
  });

  const { mutate: triggerMaintenance, isPending: isTriggering } =
    useTriggerMaintenance(integrationId);
  const { mutate: batchApprove, isPending: isBatchApproving } = useBatchApprove(integrationId);

  const proposals = data?.proposals ?? [];
  const pagination = data?.pagination;

  const pendingInfoCount = proposals.filter(
    (p) => p.status === 'pending' && p.severity === 'info'
  ).length;

  const handleLoadMore = () => {
    if (pagination?.cursor) {
      setCursor(pagination.cursor);
    }
  };

  const handleStatusChange = (value: string) => {
    setStatusFilter(value as ProposalStatus | 'all');
    setCursor(undefined);
  };

  const handleSeverityChange = (value: string) => {
    setSeverityFilter(value as ProposalSeverity | 'all');
    setCursor(undefined);
  };

  const handleTrigger = () => {
    triggerMaintenance(undefined, {
      onSuccess: (result) => {
        toast.success(
          `Generated ${result.proposalsCreated} proposal${result.proposalsCreated !== 1 ? 's' : ''} for ${result.actionsAffected} action${result.actionsAffected !== 1 ? 's' : ''}`
        );
      },
      onError: (err) => {
        toast.error(err instanceof Error ? err.message : 'Failed to trigger maintenance');
      },
    });
  };

  const handleBatchApprove = () => {
    batchApprove('info', {
      onSuccess: (result) => {
        toast.success(
          `Approved ${result.approved} info-level proposal${result.approved !== 1 ? 's' : ''}`
        );
      },
      onError: (err) => {
        toast.error(err instanceof Error ? err.message : 'Failed to batch approve');
      },
    });
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Maintenance Proposals</h2>
          <p className="text-sm text-muted-foreground">
            Schema update proposals generated from detected API drift
          </p>
        </div>
        <div className="flex items-center gap-2">
          {pendingInfoCount > 1 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleBatchApprove}
              disabled={isBatchApproving}
            >
              {isBatchApproving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="mr-2 h-4 w-4" />
              )}
              Batch Approve Info
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={handleTrigger} disabled={isTriggering}>
            {isTriggering ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="mr-2 h-4 w-4" />
            )}
            Generate Proposals
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <Select value={statusFilter} onValueChange={handleStatusChange}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
            <SelectItem value="expired">Expired</SelectItem>
            <SelectItem value="reverted">Reverted</SelectItem>
          </SelectContent>
        </Select>

        <Select value={severityFilter} onValueChange={handleSeverityChange}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Severity" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Severities</SelectItem>
            <SelectItem value="breaking">Breaking</SelectItem>
            <SelectItem value="warning">Warning</SelectItem>
            <SelectItem value="info">Info</SelectItem>
          </SelectContent>
        </Select>

        {pagination && (
          <span className="ml-auto text-sm text-muted-foreground">
            {pagination.totalCount} proposal{pagination.totalCount !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      <Card>
        <CardContent className="pt-6">
          {isLoading ? (
            <ProposalListSkeleton />
          ) : isError ? (
            <div className="py-12 text-center">
              <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">Failed to load proposals</p>
            </div>
          ) : proposals.length === 0 ? (
            <div className="py-12 text-center">
              <Wrench className="mx-auto mb-3 h-8 w-8 text-muted-foreground/50" />
              <p className="font-medium">No maintenance proposals</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {statusFilter !== 'all' || severityFilter !== 'all'
                  ? 'No proposals match the selected filters'
                  : 'No schema updates have been proposed for this integration'}
              </p>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Change Summary</TableHead>
                    <TableHead>Direction</TableHead>
                    <TableHead>Severity</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {proposals.map((proposal) => (
                    <ProposalRow
                      key={proposal.id}
                      proposal={proposal}
                      onClick={() => onSelectProposal?.(proposal)}
                    />
                  ))}
                </TableBody>
              </Table>

              {pagination?.hasMore && (
                <div className="flex justify-center pt-4">
                  <Button variant="outline" size="sm" onClick={handleLoadMore}>
                    Load More
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// =============================================================================
// Table Row
// =============================================================================

function ProposalRow({
  proposal,
  onClick,
}: {
  proposal: MaintenanceProposalResponse;
  onClick?: () => void;
}) {
  const createdAt = new Date(proposal.createdAt);
  const isValid = !isNaN(createdAt.getTime());

  return (
    <TableRow className={cn(onClick && 'cursor-pointer hover:bg-muted/50')} onClick={onClick}>
      <TableCell>
        <ChangeSummary changes={proposal.changes} />
      </TableCell>
      <TableCell>
        <DirectionBadge proposal={proposal} />
      </TableCell>
      <TableCell>
        <SeverityBadge severity={proposal.severity} />
      </TableCell>
      <TableCell>
        <span className="text-sm text-muted-foreground">
          {proposal.source === 'rescrape' ? (
            <Badge variant="outline" className="gap-1 text-xs">
              <Search className="h-3 w-3" />
              {sourceLabels[proposal.source]}
            </Badge>
          ) : (
            sourceLabels[proposal.source]
          )}
        </span>
      </TableCell>
      <TableCell>
        <StatusBadge status={proposal.status} />
      </TableCell>
      <TableCell className="text-muted-foreground">
        {isValid ? formatDistanceToNow(createdAt, { addSuffix: true }) : '—'}
      </TableCell>
    </TableRow>
  );
}

// =============================================================================
// Skeleton
// =============================================================================

function ProposalListSkeleton() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-5 w-16 rounded-full" />
          <Skeleton className="h-5 w-20 rounded-full" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-5 w-20 rounded-full" />
          <Skeleton className="h-4 w-24" />
        </div>
      ))}
    </div>
  );
}
