'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TagInput } from '@/components/ui/tag-input';
import { Zap, Clock, CheckCircle2, AlertTriangle, Activity, Key, Tags } from 'lucide-react';
import { CredentialsPanel } from './CredentialsPanel';
import { useTags, useUpdateIntegration } from '@/hooks';
import type { IntegrationResponse } from '@/lib/modules/integrations/integration.schemas';

interface IntegrationOverviewProps {
  integration: IntegrationResponse;
}

interface StatCardProps {
  title: string;
  value: string | number;
  description?: string;
  icon: React.ReactNode;
  trend?: {
    value: number;
    isPositive: boolean;
  };
}

function StatCard({ title, value, description, icon, trend }: StatCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <div className="text-muted-foreground">{icon}</div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {description && <p className="mt-1 text-xs text-muted-foreground">{description}</p>}
        {trend && (
          <p className={`mt-1 text-xs ${trend.isPositive ? 'text-accent' : 'text-destructive'}`}>
            {trend.isPositive ? '+' : ''}
            {trend.value}% from last week
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export function IntegrationOverview({ integration }: IntegrationOverviewProps) {
  const { data: tagsData } = useTags('integrations');
  const updateIntegration = useUpdateIntegration();

  const handleTagsChange = (newTags: string[]) => {
    updateIntegration.mutate({
      id: integration.id,
      tags: newTags,
    });
  };

  // Mock stats - in real app, these would come from API
  const stats = {
    totalActions: 12,
    requestsToday: 234,
    successRate: 98.5,
    avgLatency: 145,
  };

  return (
    <div className="space-y-6">
      {/* Stats grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Actions"
          value={stats.totalActions}
          description="Active endpoints"
          icon={<Zap className="h-4 w-4" />}
        />
        <StatCard
          title="Requests Today"
          value={stats.requestsToday}
          description="API calls processed"
          icon={<Activity className="h-4 w-4" />}
          trend={{ value: 12, isPositive: true }}
        />
        <StatCard
          title="Success Rate"
          value={`${stats.successRate}%`}
          description="Last 7 days"
          icon={<CheckCircle2 className="h-4 w-4" />}
        />
        <StatCard
          title="Avg Latency"
          value={`${stats.avgLatency}ms`}
          description="Response time"
          icon={<Clock className="h-4 w-4" />}
        />
      </div>

      {/* Two column layout for details */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Credentials Panel */}
        <CredentialsPanel integration={integration} />

        {/* Integration Details */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Configuration</CardTitle>
            <CardDescription>Integration settings and metadata</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Tags */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Tags className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm font-medium text-muted-foreground">Tags</p>
              </div>
              <TagInput
                value={integration.tags}
                onChange={handleTagsChange}
                suggestions={tagsData?.tags ?? []}
                placeholder="Add tags to organize..."
              />
            </div>

            {/* Base URL */}
            {integration.authConfig?.baseUrl && (
              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground">Base URL</p>
                <p className="rounded bg-muted px-2 py-1 font-mono text-sm">
                  {integration.authConfig.baseUrl as string}
                </p>
              </div>
            )}

            {/* Auth Type */}
            <div className="space-y-1">
              <p className="text-sm font-medium text-muted-foreground">Authentication</p>
              <div className="flex items-center gap-2">
                <Key className="h-4 w-4 text-muted-foreground" />
                <Badge variant="outline">
                  {integration.authType === 'oauth2'
                    ? 'OAuth 2.0'
                    : integration.authType === 'api_key'
                      ? 'API Key'
                      : integration.authType}
                </Badge>
              </div>
            </div>

            {/* Created / Updated */}
            <div className="grid grid-cols-2 gap-4 border-t pt-2">
              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground">Created</p>
                <p className="text-sm">
                  {integration.createdAt && !isNaN(new Date(integration.createdAt).getTime())
                    ? new Date(integration.createdAt).toLocaleDateString()
                    : 'Unknown'}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground">Last Updated</p>
                <p className="text-sm">
                  {integration.updatedAt && !isNaN(new Date(integration.updatedAt).getTime())
                    ? new Date(integration.updatedAt).toLocaleDateString()
                    : 'Unknown'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Recent Activity</CardTitle>
          <CardDescription>Latest API requests for this integration</CardDescription>
        </CardHeader>
        <CardContent>
          <RecentActivityList integrationId={integration.id} />
        </CardContent>
      </Card>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function RecentActivityList(_props: { integrationId: string }) {
  // Mock recent activity - in real app, would fetch from logs API using _props.integrationId
  const recentActivity = [
    {
      id: '1',
      action: 'chat.postMessage',
      status: 'success' as const,
      latency: 120,
      timestamp: new Date(Date.now() - 1000 * 60 * 5),
    },
    {
      id: '2',
      action: 'users.list',
      status: 'success' as const,
      latency: 89,
      timestamp: new Date(Date.now() - 1000 * 60 * 12),
    },
    {
      id: '3',
      action: 'channels.create',
      status: 'error' as const,
      latency: 2340,
      timestamp: new Date(Date.now() - 1000 * 60 * 45),
    },
    {
      id: '4',
      action: 'chat.postMessage',
      status: 'success' as const,
      latency: 156,
      timestamp: new Date(Date.now() - 1000 * 60 * 60),
    },
  ];

  if (recentActivity.length === 0) {
    return (
      <div className="py-8 text-center text-muted-foreground">
        <Activity className="mx-auto mb-2 h-8 w-8 opacity-50" />
        <p>No recent activity</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {recentActivity.map((activity) => (
        <div
          key={activity.id}
          className="flex items-center justify-between border-b py-2 last:border-0"
        >
          <div className="flex items-center gap-3">
            {activity.status === 'success' ? (
              <CheckCircle2 className="h-4 w-4 text-accent" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-destructive" />
            )}
            <span className="font-mono text-sm">{activity.action}</span>
          </div>
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span>{activity.latency}ms</span>
            <span>{formatRelativeTime(activity.timestamp)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffInSeconds < 60) return 'just now';
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
  return `${Math.floor(diffInSeconds / 86400)}d ago`;
}
