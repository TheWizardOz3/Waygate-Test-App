'use client';

import { Layers, CheckCircle2, AlertCircle, Activity, Zap, Clock } from 'lucide-react';
import { StatsCard } from './StatsCard';
import { RecentActivity } from './RecentActivity';
import { useIntegrations, useLogStats } from '@/hooks';

export function DashboardHome() {
  const { data: integrationsData, isLoading: integrationsLoading } = useIntegrations();
  const { data: logStats, isLoading: statsLoading } = useLogStats();

  const integrations = integrationsData?.integrations ?? [];
  const totalIntegrations = integrations.length;
  const healthyIntegrations = integrations.filter((i) => i.status === 'active').length;
  const unhealthyIntegrations = integrations.filter(
    (i) => i.status === 'error' || i.status === 'disabled'
  ).length;

  const totalRequests = logStats?.totalRequests ?? 0;
  const successRate = logStats?.successRate ?? 0;
  const avgLatency = logStats?.averageLatency ?? 0;
  const errorCount = logStats?.errorCount ?? 0;

  return (
    <div className="space-y-8">
      {/* Welcome Header */}
      <div>
        <h1 className="font-heading text-3xl font-bold">Welcome back</h1>
        <p className="mt-1 text-muted-foreground">
          Here&apos;s an overview of your integrations and API activity.
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          title="Total Integrations"
          value={totalIntegrations}
          icon={Layers}
          loading={integrationsLoading}
          variant="default"
        />
        <StatsCard
          title="Healthy"
          value={healthyIntegrations}
          description={`${totalIntegrations > 0 ? Math.round((healthyIntegrations / totalIntegrations) * 100) : 0}% of total`}
          icon={CheckCircle2}
          loading={integrationsLoading}
          variant="success"
        />
        <StatsCard
          title="Needs Attention"
          value={unhealthyIntegrations}
          description={unhealthyIntegrations > 0 ? 'Errors or disabled' : 'All systems go'}
          icon={AlertCircle}
          loading={integrationsLoading}
          variant={unhealthyIntegrations > 0 ? 'warning' : 'success'}
        />
        <StatsCard
          title="Total Requests"
          value={formatNumber(totalRequests)}
          description="Last 7 days"
          icon={Activity}
          loading={statsLoading}
          trend={{
            value: 12, // Mock trend data
            label: 'vs last week',
          }}
        />
      </div>

      {/* Secondary Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <StatsCard
          title="Success Rate"
          value={`${successRate.toFixed(1)}%`}
          icon={CheckCircle2}
          loading={statsLoading}
          variant={successRate >= 99 ? 'success' : successRate >= 95 ? 'warning' : 'danger'}
        />
        <StatsCard
          title="Avg Latency"
          value={`${avgLatency.toFixed(0)}ms`}
          icon={Clock}
          loading={statsLoading}
          variant={avgLatency < 200 ? 'success' : avgLatency < 500 ? 'warning' : 'danger'}
        />
        <StatsCard
          title="Errors"
          value={formatNumber(errorCount)}
          description="Last 7 days"
          icon={Zap}
          loading={statsLoading}
          variant={errorCount === 0 ? 'success' : 'danger'}
        />
      </div>

      {/* Recent Activity */}
      <RecentActivity limit={8} />
    </div>
  );
}

function formatNumber(num: number): string {
  if (num >= 1000000) {
    return `${(num / 1000000).toFixed(1)}M`;
  }
  if (num >= 1000) {
    return `${(num / 1000).toFixed(1)}K`;
  }
  return num.toString();
}
