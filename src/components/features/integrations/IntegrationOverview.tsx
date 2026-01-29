'use client';

import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Zap,
  Clock,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Activity,
  Key,
  ArrowRight,
  Settings2,
  Link2,
  HelpCircle,
} from 'lucide-react';
import { CredentialsPanel } from './CredentialsPanel';
import {
  ConnectionCredentialPanel,
  ConnectionHealthSection,
} from '@/components/features/connections';
import { useActions, useLogs, useLogStats, useConnections, useConnection } from '@/hooks';
import type { IntegrationResponse } from '@/lib/modules/integrations/integration.schemas';
import { cn } from '@/lib/utils';

interface IntegrationOverviewProps {
  integration: IntegrationResponse;
  selectedConnection?: {
    id: string;
    name: string;
    slug: string;
    status: 'active' | 'error' | 'disabled';
    healthStatus?: 'healthy' | 'degraded' | 'unhealthy' | null;
    connectorType: 'platform' | 'custom';
    isPrimary: boolean;
  };
}

export function IntegrationOverview({ integration, selectedConnection }: IntegrationOverviewProps) {
  // Fetch real data
  const { data: actionsData, isLoading: actionsLoading } = useActions(integration.id);
  const { data: logStats, isLoading: statsLoading } = useLogStats({
    integrationId: integration.id,
  });
  const { data: logsData, isLoading: logsLoading } = useLogs({
    integrationId: integration.id,
    limit: 5,
  });
  const { data: connectionsData, isLoading: connectionsLoading } = useConnections(integration.id);

  // Fetch full connection data for selected connection
  const { data: connectionData } = useConnection(selectedConnection?.id);

  const totalActions = actionsData?.actions?.length ?? 0;
  const totalRequests = logStats?.totalRequests ?? 0;
  const successRate = logStats?.successRate ?? 0;
  const avgLatency = logStats?.averageLatency ?? 0;

  // Aggregate connection health
  const connections = connectionsData?.connections ?? [];
  const healthSummary = {
    total: connections.length,
    healthy: connections.filter((c) => c.healthStatus === 'healthy').length,
    degraded: connections.filter((c) => c.healthStatus === 'degraded').length,
    unhealthy: connections.filter((c) => c.healthStatus === 'unhealthy').length,
    unknown: connections.filter((c) => !c.healthStatus).length,
  };

  return (
    <div className="space-y-8">
      {/* Compact Stats Row - Linear style minimal cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <CompactStat
          label="Actions"
          value={totalActions}
          icon={<Zap className="h-4 w-4" />}
          loading={actionsLoading}
        />
        <CompactStat
          label="Requests (7d)"
          value={totalRequests}
          icon={<Activity className="h-4 w-4" />}
          loading={statsLoading}
        />
        <CompactStat
          label="Success Rate"
          value={totalRequests > 0 ? `${successRate.toFixed(1)}%` : '—'}
          icon={<CheckCircle2 className="h-4 w-4" />}
          variant={
            totalRequests === 0
              ? 'muted'
              : successRate >= 99
                ? 'success'
                : successRate >= 95
                  ? 'warning'
                  : 'danger'
          }
          loading={statsLoading}
        />
        <CompactStat
          label="Avg Latency"
          value={totalRequests > 0 ? `${avgLatency.toFixed(0)}ms` : '—'}
          icon={<Clock className="h-4 w-4" />}
          variant={
            totalRequests === 0
              ? 'muted'
              : avgLatency < 200
                ? 'success'
                : avgLatency < 500
                  ? 'warning'
                  : 'danger'
          }
          loading={statsLoading}
        />
      </div>

      {/* Connection Health Summary */}
      <div className="space-y-4 rounded-lg border bg-card p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Link2 className="h-4 w-4 text-muted-foreground" />
            <div>
              <h3 className="font-medium">Connection Health</h3>
              <p className="text-xs text-muted-foreground">Health status across all connections</p>
            </div>
          </div>
          <Link
            href={`/integrations/${integration.id}?tab=connections`}
            className="flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Manage connections
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>

        {connectionsLoading ? (
          <div className="grid grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-16 rounded-lg" />
            ))}
          </div>
        ) : healthSummary.total === 0 ? (
          <div className="py-6 text-center text-muted-foreground">
            <Link2 className="mx-auto mb-2 h-8 w-8 opacity-50" />
            <p>No connections configured</p>
            <p className="mt-1 text-xs">
              <Link
                href={`/integrations/${integration.id}?tab=connections`}
                className="text-primary hover:underline"
              >
                Create your first connection
              </Link>
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <HealthStatCard
              label="Healthy"
              value={healthSummary.healthy}
              icon={<CheckCircle2 className="h-4 w-4" />}
              variant="success"
            />
            <HealthStatCard
              label="Degraded"
              value={healthSummary.degraded}
              icon={<AlertTriangle className="h-4 w-4" />}
              variant="warning"
            />
            <HealthStatCard
              label="Unhealthy"
              value={healthSummary.unhealthy}
              icon={<XCircle className="h-4 w-4" />}
              variant="danger"
            />
            <HealthStatCard
              label="Pending"
              value={healthSummary.unknown}
              icon={<HelpCircle className="h-4 w-4" />}
              variant="muted"
            />
          </div>
        )}
      </div>

      {/* Selected Connection Auth & Health (when a connection is selected) */}
      {connectionData && (
        <div className="grid gap-6 lg:grid-cols-2">
          <ConnectionCredentialPanel connection={connectionData} integration={integration} />
          <ConnectionHealthSection connectionId={connectionData.id} />
        </div>
      )}

      {/* Two column layout for details - Linear style sections */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Credentials Panel - only show when no connection selected */}
        {!selectedConnection && <CredentialsPanel integration={integration} />}

        {/* Configuration Section */}
        <div className="space-y-4 rounded-lg border bg-card p-5">
          <div className="flex items-center gap-2">
            <Settings2 className="h-4 w-4 text-muted-foreground" />
            <div>
              <h3 className="font-medium">Configuration</h3>
              <p className="text-xs text-muted-foreground">Integration settings and metadata</p>
            </div>
          </div>

          <div className="space-y-4 pt-2">
            {/* Base URL */}
            {integration.authConfig?.baseUrl && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Base URL
                </p>
                <p className="break-all rounded-md border bg-muted/30 px-3 py-2 font-mono text-sm">
                  {integration.authConfig.baseUrl as string}
                </p>
              </div>
            )}

            {/* Auth Type */}
            <div className="space-y-1.5">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Authentication
              </p>
              <div className="flex items-center gap-2">
                <Key className="h-4 w-4 text-muted-foreground" />
                <Badge variant="secondary" className="font-normal">
                  {integration.authType === 'oauth2'
                    ? 'OAuth 2.0'
                    : integration.authType === 'api_key'
                      ? 'API Key'
                      : integration.authType === 'basic'
                        ? 'Basic Auth'
                        : integration.authType === 'bearer'
                          ? 'Bearer Token'
                          : integration.authType === 'none'
                            ? 'No Auth Required'
                            : integration.authType}
                </Badge>
                {/* Show setup status indicator based on integration status */}
                {integration.authType !== 'none' && integration.status === 'draft' && (
                  <Badge
                    variant="outline"
                    className="gap-1 border-amber-500/30 bg-amber-500/10 text-amber-600"
                  >
                    <AlertTriangle className="h-3 w-3" />
                    Setup Required
                  </Badge>
                )}
                {integration.authType !== 'none' && integration.status === 'active' && (
                  <Badge
                    variant="outline"
                    className="gap-1 border-emerald-500/30 bg-emerald-500/10 text-emerald-600"
                  >
                    <CheckCircle2 className="h-3 w-3" />
                    Configured
                  </Badge>
                )}
              </div>
            </div>

            {/* Created / Updated */}
            <div className="grid grid-cols-2 gap-4 border-t pt-4">
              <div className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Created
                </p>
                <p className="text-sm">
                  {integration.createdAt && !isNaN(new Date(integration.createdAt).getTime())
                    ? new Date(integration.createdAt).toLocaleDateString()
                    : 'Unknown'}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Last Updated
                </p>
                <p className="text-sm">
                  {integration.updatedAt && !isNaN(new Date(integration.updatedAt).getTime())
                    ? new Date(integration.updatedAt).toLocaleDateString()
                    : 'Unknown'}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Activity - Linear style section */}
      <div className="space-y-4 rounded-lg border bg-card p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-muted-foreground" />
            <div>
              <h3 className="font-medium">Recent Activity</h3>
              <p className="text-xs text-muted-foreground">
                Latest API requests for this integration
              </p>
            </div>
          </div>
          <Link
            href={`/logs?integration=${integration.id}`}
            className="flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            View all
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
        <RecentActivityList logs={logsData?.logs ?? []} loading={logsLoading} />
      </div>
    </div>
  );
}

interface CompactStatProps {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'muted';
  loading?: boolean;
}

function CompactStat({ label, value, icon, variant = 'default', loading }: CompactStatProps) {
  const variantStyles = {
    default: 'text-foreground',
    success: 'text-emerald-600 dark:text-emerald-400',
    warning: 'text-amber-600 dark:text-amber-400',
    danger: 'text-red-600 dark:text-red-400',
    muted: 'text-muted-foreground',
  };

  return (
    <div className="flex items-center gap-3 rounded-lg border bg-card p-4">
      <div className="rounded-lg bg-muted/50 p-2 text-muted-foreground">{icon}</div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        {loading ? (
          <Skeleton className="mt-1 h-6 w-12" />
        ) : (
          <p className={cn('text-xl font-semibold tabular-nums', variantStyles[variant])}>
            {value}
          </p>
        )}
      </div>
    </div>
  );
}

interface HealthStatCardProps {
  label: string;
  value: number;
  icon: React.ReactNode;
  variant: 'success' | 'warning' | 'danger' | 'muted';
}

function HealthStatCard({ label, value, icon, variant }: HealthStatCardProps) {
  const variantStyles = {
    success: {
      bg: 'bg-emerald-500/10',
      text: 'text-emerald-600 dark:text-emerald-400',
      icon: 'text-emerald-600 dark:text-emerald-400',
    },
    warning: {
      bg: 'bg-amber-500/10',
      text: 'text-amber-600 dark:text-amber-400',
      icon: 'text-amber-600 dark:text-amber-400',
    },
    danger: {
      bg: 'bg-red-500/10',
      text: 'text-red-600 dark:text-red-400',
      icon: 'text-red-600 dark:text-red-400',
    },
    muted: {
      bg: 'bg-muted/50',
      text: 'text-muted-foreground',
      icon: 'text-muted-foreground',
    },
  };

  const styles = variantStyles[variant];

  return (
    <div className={cn('flex items-center gap-3 rounded-lg p-4', styles.bg)}>
      <div className={styles.icon}>{icon}</div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className={cn('text-xl font-semibold tabular-nums', styles.text)}>{value}</p>
      </div>
    </div>
  );
}

interface LogEntry {
  id: string;
  actionName?: string;
  actionSlug?: string;
  status: 'success' | 'error' | 'timeout';
  duration: number;
  timestamp: string;
}

function RecentActivityList({ logs, loading }: { logs: LogEntry[]; loading: boolean }) {
  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between py-2">
            <div className="flex items-center gap-3">
              <Skeleton className="h-4 w-4 rounded-full" />
              <Skeleton className="h-4 w-32" />
            </div>
            <div className="flex items-center gap-4">
              <Skeleton className="h-4 w-12" />
              <Skeleton className="h-4 w-16" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (logs.length === 0) {
    return (
      <div className="py-8 text-center text-muted-foreground">
        <Activity className="mx-auto mb-2 h-8 w-8 opacity-50" />
        <p>No recent activity</p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {logs.map((log) => {
        const timestamp = log.timestamp ? new Date(log.timestamp) : null;
        const isValidDate = timestamp && !isNaN(timestamp.getTime());

        return (
          <div
            key={log.id}
            className="flex items-center justify-between rounded-md px-2 py-2 hover:bg-muted/50"
          >
            <div className="flex items-center gap-3">
              {log.status === 'success' ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              ) : (
                <AlertTriangle className="h-4 w-4 text-red-600" />
              )}
              <span className="font-mono text-sm">
                {log.actionName || log.actionSlug || 'Unknown'}
              </span>
            </div>
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span className="tabular-nums">{log.duration}ms</span>
              <span className="text-xs">
                {isValidDate ? formatDistanceToNow(timestamp, { addSuffix: true }) : '—'}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
