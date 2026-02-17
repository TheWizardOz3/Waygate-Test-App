'use client';

import Link from 'next/link';
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
  Shield,
} from 'lucide-react';
import {
  ConnectionCredentialPanel,
  ConnectionHealthSection,
} from '@/components/features/connections';
import { useActions, useLogStats, useConnections, useConnection } from '@/hooks';
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
  const { data: connectionsData, isLoading: connectionsLoading } = useConnections(integration.id);

  // Fetch full connection data for selected connection
  const { data: connectionData } = useConnection(selectedConnection?.id);

  const totalActions = actionsData?.actions?.length ?? 0;
  const totalRequests = logStats?.totalRequests ?? 0;
  const successRate = logStats?.successRate ?? 0;
  const avgLatency = logStats?.averageLatency ?? 0;

  // Aggregate connection health
  const connections = connectionsData?.connections ?? [];

  // A connection is "unchecked" if no health checks have ever been run
  const isConnectionUnchecked = (c: (typeof connections)[0]) => {
    const h = c.health;
    return !h?.lastCredentialCheckAt && !h?.lastConnectivityCheckAt && !h?.lastFullScanAt;
  };

  const healthSummary = {
    total: connections.length,
    healthy: connections.filter((c) => c.healthStatus === 'healthy' && !isConnectionUnchecked(c))
      .length,
    degraded: connections.filter((c) => c.healthStatus === 'degraded').length,
    unhealthy: connections.filter((c) => c.healthStatus === 'unhealthy').length,
    unchecked: connections.filter((c) => isConnectionUnchecked(c) && c.healthStatus === 'healthy')
      .length,
    unknown: connections.filter((c) => !c.healthStatus).length,
  };

  // Calculate overall health status
  const overallHealthStatus = connectionsLoading
    ? 'loading'
    : healthSummary.total === 0
      ? 'no-connections'
      : healthSummary.unhealthy > 0
        ? 'unhealthy'
        : healthSummary.degraded > 0
          ? 'degraded'
          : healthSummary.unchecked > 0 && healthSummary.healthy === 0
            ? 'unchecked'
            : 'healthy';

  return (
    <div className="space-y-6">
      {/* Metrics Row - Actions, Requests, Success Rate, Latency, Connection Health */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
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
        <CompactStat
          label="Connections"
          value={
            connectionsLoading
              ? '...'
              : healthSummary.total === 0
                ? '—'
                : `${healthSummary.healthy}/${healthSummary.total}`
          }
          icon={<Link2 className="h-4 w-4" />}
          variant={
            overallHealthStatus === 'loading' ||
            overallHealthStatus === 'no-connections' ||
            overallHealthStatus === 'unchecked'
              ? 'muted'
              : overallHealthStatus === 'healthy'
                ? 'success'
                : overallHealthStatus === 'degraded'
                  ? 'warning'
                  : 'danger'
          }
          loading={connectionsLoading}
          subtitle={
            healthSummary.total > 0
              ? `${healthSummary.healthy} healthy${healthSummary.degraded > 0 ? `, ${healthSummary.degraded} degraded` : ''}${healthSummary.unhealthy > 0 ? `, ${healthSummary.unhealthy} unhealthy` : ''}${healthSummary.unchecked > 0 ? `, ${healthSummary.unchecked} not verified` : ''}`
              : undefined
          }
        />
      </div>

      {/* Two column layout: Health Status first, then Auth & Configuration */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Health Status Section - first card */}
        {connectionData ? (
          <ConnectionHealthSection connectionId={connectionData.id} />
        ) : (
          <div className="space-y-4 rounded-lg border bg-card p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-muted-foreground" />
                <div>
                  <h3 className="font-medium">Health Status</h3>
                  <p className="text-xs text-muted-foreground">
                    Monitor connection health and run diagnostics
                  </p>
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
              <div className="py-6">
                <Skeleton className="mx-auto h-8 w-32" />
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
              <div className="space-y-3">
                <div className="grid grid-cols-4 gap-2">
                  <HealthStatCard
                    label="Healthy"
                    value={healthSummary.healthy}
                    icon={<CheckCircle2 className="h-3 w-3" />}
                    variant="success"
                    compact
                  />
                  <HealthStatCard
                    label="Degraded"
                    value={healthSummary.degraded}
                    icon={<AlertTriangle className="h-3 w-3" />}
                    variant="warning"
                    compact
                  />
                  <HealthStatCard
                    label="Unhealthy"
                    value={healthSummary.unhealthy}
                    icon={<XCircle className="h-3 w-3" />}
                    variant="danger"
                    compact
                  />
                  <HealthStatCard
                    label={healthSummary.unchecked > 0 ? 'Not Verified' : 'Pending'}
                    value={healthSummary.unchecked + healthSummary.unknown}
                    icon={<HelpCircle className="h-3 w-3" />}
                    variant="muted"
                    compact
                  />
                </div>
                <p className="text-center text-xs text-muted-foreground">
                  Select a connection above to run health checks
                </p>
              </div>
            )}
          </div>
        )}

        {/* Authentication Section - connection-specific or integration-level */}
        {connectionData ? (
          <ConnectionCredentialPanel connection={connectionData} integration={integration} />
        ) : (
          <div className="space-y-4 rounded-lg border bg-card p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Key className="h-4 w-4 text-muted-foreground" />
                <div>
                  <h3 className="font-medium">Credentials</h3>
                  <p className="text-xs text-muted-foreground">
                    {integration.authType === 'none'
                      ? 'No authentication required'
                      : integration.authType === 'oauth2'
                        ? 'OAuth 2.0 connection status'
                        : 'API key authentication status'}
                  </p>
                </div>
              </div>
              {integration.authType !== 'none' && (
                <Badge variant="secondary" className="font-normal">
                  {integration.authType === 'oauth2'
                    ? 'OAuth 2.0'
                    : integration.authType === 'api_key'
                      ? 'API Key'
                      : integration.authType === 'basic'
                        ? 'Basic Auth'
                        : integration.authType === 'bearer'
                          ? 'Bearer Token'
                          : integration.authType}
                </Badge>
              )}
            </div>

            {connectionsLoading ? (
              <div className="py-6">
                <Skeleton className="mx-auto h-8 w-32" />
              </div>
            ) : healthSummary.total === 0 ? (
              <div className="py-6 text-center text-muted-foreground">
                <Key className="mx-auto mb-2 h-8 w-8 opacity-50" />
                <p>No credentials configured</p>
                <p className="mt-1 text-xs">
                  <Link
                    href={`/integrations/${integration.id}?tab=connections`}
                    className="text-primary hover:underline"
                  >
                    Create your first connection
                  </Link>{' '}
                  to add credentials
                </p>
              </div>
            ) : (
              <div className="py-6 text-center text-muted-foreground">
                <Key className="mx-auto mb-2 h-8 w-8 opacity-50" />
                <p className="text-sm">Select a connection above to manage credentials</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Configuration Section - always visible */}
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

          {/* Created / Updated */}
          <div
            className={cn(
              'grid grid-cols-2 gap-4',
              integration.authConfig?.baseUrl && 'border-t pt-4'
            )}
          >
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
  );
}

interface CompactStatProps {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'muted';
  loading?: boolean;
  subtitle?: string;
}

function CompactStat({
  label,
  value,
  icon,
  variant = 'default',
  loading,
  subtitle,
}: CompactStatProps) {
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
          <>
            <p className={cn('text-xl font-semibold tabular-nums', variantStyles[variant])}>
              {value}
            </p>
            {subtitle && <p className="truncate text-xs text-muted-foreground">{subtitle}</p>}
          </>
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
  compact?: boolean;
}

function HealthStatCard({ label, value, icon, variant, compact }: HealthStatCardProps) {
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

  if (compact) {
    return (
      <div className={cn('flex flex-col items-center justify-center rounded-lg p-2', styles.bg)}>
        <div className="flex items-center gap-1">
          <span className={styles.icon}>{icon}</span>
          <span className={cn('text-lg font-semibold tabular-nums', styles.text)}>{value}</span>
        </div>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    );
  }

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
