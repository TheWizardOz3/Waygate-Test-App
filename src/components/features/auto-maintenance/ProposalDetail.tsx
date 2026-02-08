'use client';

import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  AlertCircle,
  AlertTriangle,
  Info,
  CheckCircle2,
  XCircle,
  Clock,
  Undo2,
  ArrowLeft,
  Loader2,
  FileText,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  useProposal,
  useApproveProposal,
  useRejectProposal,
  useRevertProposal,
} from '@/hooks/useAutoMaintenance';
import { SchemaDiffViewer } from './SchemaDiffViewer';
import { AffectedToolsList } from './AffectedToolsList';
import type {
  ProposalStatus,
  ProposalSeverity,
  ProposalChange,
} from '@/lib/modules/auto-maintenance/auto-maintenance.schemas';

// =============================================================================
// Props
// =============================================================================

interface ProposalDetailProps {
  integrationId: string;
  proposalId: string;
  onBack?: () => void;
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
    label: 'Pending Review',
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

// =============================================================================
// Sub-Components
// =============================================================================

function SeverityBadge({ severity }: { severity: ProposalSeverity }) {
  const config = severityConfig[severity];
  const Icon = config.icon;
  return (
    <Badge variant="outline" className={cn('text-sm', config.className)}>
      <Icon className="h-4 w-4" />
      {config.label}
    </Badge>
  );
}

function StatusBadge({ status }: { status: ProposalStatus }) {
  const config = statusConfig[status];
  const Icon = config.icon;
  return (
    <Badge variant="outline" className={cn('text-sm', config.className)}>
      <Icon className="h-4 w-4" />
      {config.label}
    </Badge>
  );
}

function ChangeItem({ change }: { change: ProposalChange }) {
  return (
    <div className="flex items-start gap-3 py-2">
      <Badge
        variant="outline"
        className={cn(
          'mt-0.5 shrink-0 text-xs',
          change.direction === 'input'
            ? 'border-blue-500/20 bg-blue-500/10 text-blue-600'
            : 'bg-muted text-muted-foreground'
        )}
      >
        {change.direction}
      </Badge>
      <div className="min-w-0 flex-1">
        <p className="text-sm">
          <span className="font-mono text-xs">{change.fieldPath}</span>
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">{change.description}</p>
      </div>
    </div>
  );
}

function StatusTimeline({
  proposal,
}: {
  proposal: {
    createdAt: string;
    approvedAt: string | null;
    rejectedAt: string | null;
    appliedAt: string | null;
    revertedAt: string | null;
    expiredAt: string | null;
  };
}) {
  const events = [
    { label: 'Created', date: proposal.createdAt },
    proposal.approvedAt && { label: 'Approved', date: proposal.approvedAt },
    proposal.appliedAt && { label: 'Applied', date: proposal.appliedAt },
    proposal.rejectedAt && { label: 'Rejected', date: proposal.rejectedAt },
    proposal.expiredAt && { label: 'Expired', date: proposal.expiredAt },
    proposal.revertedAt && { label: 'Reverted', date: proposal.revertedAt },
  ].filter(Boolean) as { label: string; date: string }[];

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {events.map((event, i) => {
        const date = new Date(event.date);
        const isValid = !isNaN(date.getTime());
        return (
          <span key={i} className="flex items-center gap-1">
            <span className="font-medium">{event.label}:</span>
            {isValid ? format(date, 'MMM d, yyyy HH:mm') : '—'}
          </span>
        );
      })}
    </div>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export function ProposalDetail({ integrationId, proposalId, onBack }: ProposalDetailProps) {
  const { data: proposal, isLoading, isError } = useProposal(integrationId, proposalId);
  const { mutate: approve, isPending: isApproving } = useApproveProposal(integrationId);
  const { mutate: reject, isPending: isRejecting } = useRejectProposal(integrationId);
  const { mutate: revert, isPending: isReverting } = useRevertProposal(integrationId);

  const handleApprove = () => {
    approve(proposalId, {
      onSuccess: () => toast.success('Proposal approved — schema updated'),
      onError: (err) =>
        toast.error(err instanceof Error ? err.message : 'Failed to approve proposal'),
    });
  };

  const handleReject = () => {
    reject(proposalId, {
      onSuccess: () => toast.success('Proposal rejected'),
      onError: (err) =>
        toast.error(err instanceof Error ? err.message : 'Failed to reject proposal'),
    });
  };

  const handleRevert = () => {
    revert(proposalId, {
      onSuccess: () => toast.success('Proposal reverted — schema restored'),
      onError: (err) =>
        toast.error(err instanceof Error ? err.message : 'Failed to revert proposal'),
    });
  };

  if (isLoading) {
    return <ProposalDetailSkeleton onBack={onBack} />;
  }

  if (isError || !proposal) {
    return (
      <div className="space-y-4">
        {onBack && (
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to proposals
          </Button>
        )}
        <div className="py-12 text-center">
          <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">Failed to load proposal</p>
        </div>
      </div>
    );
  }

  const isPending = proposal.status === 'pending';
  const isApproved = proposal.status === 'approved';
  const isTerminal = ['rejected', 'expired', 'reverted'].includes(proposal.status);

  const hasInputChanges = proposal.proposedInputSchema !== null;
  const hasOutputChanges = proposal.proposedOutputSchema !== null;

  return (
    <div className="space-y-6">
      {/* Back button */}
      {onBack && (
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to proposals
        </Button>
      )}

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <SeverityBadge severity={proposal.severity} />
            <StatusBadge status={proposal.status} />
          </div>
          <p className="text-sm text-muted-foreground">
            {proposal.changes.length} change{proposal.changes.length !== 1 ? 's' : ''} proposed
            {' via '}
            {proposal.source === 'rescrape' ? 'documentation re-scrape' : 'failure inference'}
          </p>
          <StatusTimeline proposal={proposal} />
        </div>

        {/* Action Buttons */}
        <div className="flex shrink-0 items-center gap-2">
          {isPending && (
            <>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="default" size="sm" disabled={isApproving}>
                    {isApproving ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                    )}
                    Approve & Apply
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Approve Schema Update</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will update the action&apos;s schema and resolve the related drift
                      reports. The change can be reverted later if needed.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleApprove}>Approve & Apply</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              <Button variant="outline" size="sm" onClick={handleReject} disabled={isRejecting}>
                {isRejecting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <XCircle className="mr-2 h-4 w-4" />
                )}
                Reject
              </Button>
            </>
          )}

          {isApproved && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-amber-500/30 text-amber-600 hover:bg-amber-500/10"
                  disabled={isReverting}
                >
                  {isReverting ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Undo2 className="mr-2 h-4 w-4" />
                  )}
                  Revert
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Revert Schema Update</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will restore the previous schema from the snapshot taken before this
                    proposal was applied. Description updates you&apos;ve accepted will remain.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleRevert}
                    className="bg-amber-600 hover:bg-amber-700"
                  >
                    Revert Schema
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>

      <Separator />

      {/* Changes List */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Changes</CardTitle>
        </CardHeader>
        <CardContent className="divide-y">
          {proposal.changes.map((change, i) => (
            <ChangeItem key={i} change={change} />
          ))}
        </CardContent>
      </Card>

      {/* Reasoning */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <FileText className="h-4 w-4" />
            Reasoning
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm leading-relaxed text-muted-foreground">{proposal.reasoning}</p>
        </CardContent>
      </Card>

      {/* Schema Diffs */}
      {hasInputChanges && (
        <SchemaDiffViewer
          currentSchema={proposal.currentInputSchema}
          proposedSchema={proposal.proposedInputSchema!}
          direction="Input Schema"
          changes={proposal.changes.filter((c) => c.direction === 'input')}
        />
      )}

      {hasOutputChanges && (
        <SchemaDiffViewer
          currentSchema={proposal.currentOutputSchema}
          proposedSchema={proposal.proposedOutputSchema!}
          direction="Output Schema"
          changes={proposal.changes.filter((c) => c.direction === 'output')}
        />
      )}

      {/* Affected Tools & Description Suggestions */}
      <AffectedToolsList
        integrationId={integrationId}
        proposalId={proposalId}
        proposalStatus={proposal.status}
        affectedTools={proposal.affectedTools}
        descriptionSuggestions={proposal.descriptionSuggestions}
      />

      {/* Terminal state note */}
      {isTerminal && (
        <div className="rounded-lg border bg-muted/30 p-4 text-center text-sm text-muted-foreground">
          This proposal is {proposal.status} and cannot be modified.
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Skeleton
// =============================================================================

function ProposalDetailSkeleton({ onBack }: { onBack?: () => void }) {
  return (
    <div className="space-y-6">
      {onBack && (
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to proposals
        </Button>
      )}
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <div className="flex gap-2">
            <Skeleton className="h-6 w-20 rounded-full" />
            <Skeleton className="h-6 w-28 rounded-full" />
          </div>
          <Skeleton className="h-4 w-64" />
          <Skeleton className="h-3 w-96" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-32" />
          <Skeleton className="h-9 w-20" />
        </div>
      </div>
      <Skeleton className="h-px w-full" />
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}
