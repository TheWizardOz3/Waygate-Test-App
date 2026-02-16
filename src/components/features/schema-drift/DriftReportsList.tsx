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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertTriangle,
  AlertCircle,
  Info,
  CheckCircle2,
  XCircle,
  Eye,
  MoreHorizontal,
  Loader2,
  ShieldAlert,
} from 'lucide-react';
import { toast } from 'sonner';
import { useDriftReports, useUpdateDriftReportStatus } from '@/hooks/useSchemaDrift';
import type {
  DriftReportResponse,
  DriftSeverity,
  DriftReportStatus,
} from '@/lib/modules/schema-drift/schema-drift.schemas';
import { VALID_STATUS_TRANSITIONS } from '@/lib/modules/schema-drift/schema-drift.schemas';

// =============================================================================
// Props
// =============================================================================

interface DriftReportsListProps {
  integrationId: string;
}

// =============================================================================
// Severity & Status Config
// =============================================================================

const severityConfig: Record<
  DriftSeverity,
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
  DriftReportStatus,
  { label: string; icon: React.ElementType; className: string }
> = {
  detected: {
    label: 'Detected',
    icon: AlertTriangle,
    className: 'gap-1 bg-amber-500/10 text-amber-600 border-amber-500/20',
  },
  acknowledged: {
    label: 'Acknowledged',
    icon: Eye,
    className: 'gap-1 bg-blue-500/10 text-blue-600 border-blue-500/20',
  },
  resolved: {
    label: 'Resolved',
    icon: CheckCircle2,
    className: 'gap-1 bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
  },
  dismissed: {
    label: 'Dismissed',
    icon: XCircle,
    className: 'gap-1 bg-muted text-muted-foreground',
  },
};

// Human-readable labels for issue codes
const issueCodeLabels: Record<string, string> = {
  type_mismatch: 'Type Changed',
  missing_required_field: 'Field Removed',
  unexpected_field: 'New Field',
  invalid_enum_value: 'Enum Changed',
  schema_validation_error: 'Schema Mismatch',
};

// =============================================================================
// Sub-Components
// =============================================================================

function SeverityBadge({ severity }: { severity: DriftSeverity }) {
  const config = severityConfig[severity];
  const Icon = config.icon;
  return (
    <Badge variant="outline" className={config.className}>
      <Icon className="h-3 w-3" />
      {config.label}
    </Badge>
  );
}

function StatusBadge({ status }: { status: DriftReportStatus }) {
  const config = statusConfig[status];
  const Icon = config.icon;
  return (
    <Badge variant="outline" className={config.className}>
      <Icon className="h-3 w-3" />
      {config.label}
    </Badge>
  );
}

function ReportActions({
  report,
  integrationId,
}: {
  report: DriftReportResponse;
  integrationId: string;
}) {
  const { mutate: updateStatus, isPending } = useUpdateDriftReportStatus(integrationId);

  const allowedTransitions = VALID_STATUS_TRANSITIONS[report.status as DriftReportStatus] ?? [];

  if (allowedTransitions.length === 0) return null;

  const handleTransition = (newStatus: 'acknowledged' | 'resolved' | 'dismissed') => {
    updateStatus(
      { reportId: report.id, status: newStatus },
      {
        onSuccess: () => {
          toast.success(`Report ${newStatus}`);
        },
        onError: (err) => {
          toast.error(err instanceof Error ? err.message : 'Failed to update status');
        },
      }
    );
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8" disabled={isPending}>
          {isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <MoreHorizontal className="h-4 w-4" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {allowedTransitions.includes('acknowledged') && (
          <DropdownMenuItem onClick={() => handleTransition('acknowledged')}>
            <Eye className="mr-2 h-4 w-4" />
            Acknowledge
          </DropdownMenuItem>
        )}
        {allowedTransitions.includes('resolved') && (
          <DropdownMenuItem onClick={() => handleTransition('resolved')}>
            <CheckCircle2 className="mr-2 h-4 w-4" />
            Resolve
          </DropdownMenuItem>
        )}
        {allowedTransitions.includes('dismissed') && (
          <DropdownMenuItem onClick={() => handleTransition('dismissed')}>
            <XCircle className="mr-2 h-4 w-4" />
            Dismiss
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// =============================================================================
// Main Component
// =============================================================================

/**
 * Drift reports table for an integration.
 * Shows detected schema drift with severity, status, action buttons, and filtering.
 * Supports cursor-based pagination via "Load More".
 */
export function DriftReportsList({ integrationId }: DriftReportsListProps) {
  const [severityFilter, setSeverityFilter] = useState<DriftSeverity | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<DriftReportStatus | 'all'>('all');
  const [cursor, setCursor] = useState<string | undefined>(undefined);

  const { data, isLoading, isError } = useDriftReports(integrationId, {
    severity: severityFilter === 'all' ? undefined : severityFilter,
    status: statusFilter === 'all' ? undefined : statusFilter,
    cursor,
    limit: 20,
  });

  const reports = data?.reports ?? [];
  const pagination = data?.pagination;

  const handleLoadMore = () => {
    if (pagination?.cursor) {
      setCursor(pagination.cursor);
    }
  };

  // Reset cursor when filters change
  const handleSeverityChange = (value: string) => {
    setSeverityFilter(value as DriftSeverity | 'all');
    setCursor(undefined);
  };

  const handleStatusChange = (value: string) => {
    setStatusFilter(value as DriftReportStatus | 'all');
    setCursor(undefined);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Schema Drift Reports</h2>
          <p className="text-sm text-muted-foreground">
            Detected changes in API response schemas from runtime validation failures
          </p>
        </div>
        {pagination && (
          <span className="text-sm text-muted-foreground">
            {pagination.totalCount} report{pagination.totalCount !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
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

        <Select value={statusFilter} onValueChange={handleStatusChange}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="detected">Detected</SelectItem>
            <SelectItem value="acknowledged">Acknowledged</SelectItem>
            <SelectItem value="resolved">Resolved</SelectItem>
            <SelectItem value="dismissed">Dismissed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="pt-6">
          {isLoading ? (
            <DriftReportsListSkeleton />
          ) : isError ? (
            <div className="py-12 text-center">
              <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">Failed to load drift reports</p>
            </div>
          ) : reports.length === 0 ? (
            <div className="py-12 text-center">
              <ShieldAlert className="mx-auto mb-3 h-8 w-8 text-muted-foreground/50" />
              <p className="font-medium">No drift reports</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {severityFilter !== 'all' || statusFilter !== 'all'
                  ? 'No reports match the selected filters'
                  : 'No schema drift has been detected for this integration'}
              </p>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Field Path</TableHead>
                    <TableHead>Change Type</TableHead>
                    <TableHead>Severity</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Failures</TableHead>
                    <TableHead>First Detected</TableHead>
                    <TableHead>Last Detected</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reports.map((report) => (
                    <DriftReportRow key={report.id} report={report} integrationId={integrationId} />
                  ))}
                </TableBody>
              </Table>

              {/* Load More */}
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

function DriftReportRow({
  report,
  integrationId,
}: {
  report: DriftReportResponse;
  integrationId: string;
}) {
  const firstDetected = new Date(report.firstDetectedAt);
  const lastDetected = new Date(report.lastDetectedAt);
  const isFirstValid = !isNaN(firstDetected.getTime());
  const isLastValid = !isNaN(lastDetected.getTime());

  return (
    <TableRow>
      <TableCell>
        <span className="font-mono text-sm">{report.fieldPath}</span>
        {report.expectedType && report.currentType && (
          <p className="mt-0.5 text-xs text-muted-foreground">
            {report.expectedType} → {report.currentType}
          </p>
        )}
      </TableCell>
      <TableCell>
        <span className="text-sm">{issueCodeLabels[report.issueCode] ?? report.issueCode}</span>
      </TableCell>
      <TableCell>
        <SeverityBadge severity={report.severity} />
      </TableCell>
      <TableCell>
        <StatusBadge status={report.status} />
      </TableCell>
      <TableCell className="text-right tabular-nums">{report.failureCount}</TableCell>
      <TableCell className="text-muted-foreground">
        {isFirstValid ? formatDistanceToNow(firstDetected, { addSuffix: true }) : '—'}
      </TableCell>
      <TableCell className="text-muted-foreground">
        {isLastValid ? formatDistanceToNow(lastDetected, { addSuffix: true }) : '—'}
      </TableCell>
      <TableCell>
        <ReportActions report={report} integrationId={integrationId} />
      </TableCell>
    </TableRow>
  );
}

// =============================================================================
// Skeleton
// =============================================================================

function DriftReportsListSkeleton() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-5 w-20 rounded-full" />
          <Skeleton className="h-5 w-20 rounded-full" />
          <Skeleton className="h-4 w-12" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-24" />
        </div>
      ))}
    </div>
  );
}
