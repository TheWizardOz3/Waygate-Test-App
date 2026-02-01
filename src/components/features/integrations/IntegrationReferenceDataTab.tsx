'use client';

import { useState, useMemo } from 'react';
import { useReferenceData, useSyncJobs, useTriggerSync, useActions } from '@/hooks';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Database,
  RefreshCw,
  Search,
  Users,
  MessageSquare,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  AlertCircle,
  Settings2,
  ExternalLink,
  Info,
} from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import Link from 'next/link';

interface IntegrationReferenceDataTabProps {
  integrationId: string;
  connectionId?: string | null;
}

interface ReferenceDataConfig {
  syncable?: boolean;
  dataType?: string;
  extractionPath?: string;
  idField?: string;
  nameField?: string;
  defaultTtlSeconds?: number;
}

export function IntegrationReferenceDataTab({
  integrationId,
  connectionId,
}: IntegrationReferenceDataTabProps) {
  const [activeSubTab, setActiveSubTab] = useState('config');
  const [searchQuery, setSearchQuery] = useState('');
  const [dataTypeFilter, setDataTypeFilter] = useState<string>('all');

  // Fetch actions to show sync configuration
  const { data: actionsData, isLoading: actionsLoading } = useActions(integrationId);

  const {
    data: referenceData,
    isLoading: dataLoading,
    isError: dataError,
  } = useReferenceData(integrationId, {
    dataType: dataTypeFilter !== 'all' ? dataTypeFilter : undefined,
    search: searchQuery || undefined,
    connectionId: connectionId ?? undefined,
    status: 'active',
    limit: 100,
  });

  const {
    data: syncJobsData,
    isLoading: jobsLoading,
    isError: jobsError,
  } = useSyncJobs(integrationId, {
    connectionId: connectionId ?? undefined,
    limit: 20,
  });

  const triggerSync = useTriggerSync(integrationId);

  // Filter actions with reference data config
  const syncableActions = useMemo(() => {
    if (!actionsData?.actions) return [];
    return actionsData.actions.filter((action) => {
      const refData = (action.metadata as { referenceData?: ReferenceDataConfig })?.referenceData;
      return refData?.syncable === true;
    });
  }, [actionsData?.actions]);

  const handleTriggerSync = async () => {
    try {
      await triggerSync.mutateAsync({
        connectionId: connectionId ?? undefined,
        dataType: dataTypeFilter !== 'all' ? dataTypeFilter : undefined,
      });
      toast.success('Sync started successfully');
    } catch {
      toast.error('Failed to start sync');
    }
  };

  // Get unique data types from reference data
  const dataTypes = Array.from(
    new Set(referenceData?.data?.map((item) => item.dataType) ?? [])
  ).sort();

  // Add data types from sync jobs that may not be in current data
  const allDataTypes = Array.from(
    new Set([...dataTypes, ...(syncJobsData?.jobs?.map((job) => job.dataType) ?? [])])
  ).sort();

  const getDataTypeIcon = (dataType: string) => {
    switch (dataType.toLowerCase()) {
      case 'users':
        return <Users className="h-4 w-4" />;
      case 'channels':
        return <MessageSquare className="h-4 w-4" />;
      default:
        return <Database className="h-4 w-4" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return (
          <Badge variant="outline" className="gap-1 bg-emerald-500/10 text-emerald-600">
            <CheckCircle2 className="h-3 w-3" />
            Completed
          </Badge>
        );
      case 'failed':
        return (
          <Badge variant="outline" className="gap-1 bg-red-500/10 text-red-600">
            <XCircle className="h-3 w-3" />
            Failed
          </Badge>
        );
      case 'syncing':
        return (
          <Badge variant="outline" className="gap-1 bg-blue-500/10 text-blue-600">
            <Loader2 className="h-3 w-3 animate-spin" />
            Syncing
          </Badge>
        );
      case 'pending':
        return (
          <Badge variant="outline" className="gap-1 bg-amber-500/10 text-amber-600">
            <Clock className="h-3 w-3" />
            Pending
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Reference Data</h2>
          <p className="text-sm text-muted-foreground">
            Cached data from external APIs for AI context (users, channels, etc.)
          </p>
        </div>
        <Button onClick={handleTriggerSync} disabled={triggerSync.isPending}>
          {triggerSync.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-4 w-4" />
          )}
          Sync Now
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Items</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {dataLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                (referenceData?.pagination?.totalCount ?? 0)
              )}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Data Types</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {dataLoading ? <Skeleton className="h-8 w-16" /> : allDataTypes.length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Last Sync</CardTitle>
          </CardHeader>
          <CardContent>
            {jobsLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : syncJobsData?.jobs?.[0]?.completedAt ? (
              <div className="text-2xl font-bold">
                {formatDistanceToNow(new Date(syncJobsData.jobs[0].completedAt), {
                  addSuffix: true,
                })}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">Never</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Data/History Tabs */}
      <Tabs value={activeSubTab} onValueChange={setActiveSubTab}>
        <TabsList>
          <TabsTrigger value="config" className="gap-2">
            <Settings2 className="h-4 w-4" />
            Sync Configuration
          </TabsTrigger>
          <TabsTrigger value="data" className="gap-2">
            <Database className="h-4 w-4" />
            Cached Data
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-2">
            <Clock className="h-4 w-4" />
            Sync History
          </TabsTrigger>
        </TabsList>

        {/* Configuration Tab */}
        <TabsContent value="config" className="space-y-4">
          {actionsLoading ? (
            <DataTableSkeleton />
          ) : (actionsData?.actions?.length ?? 0) === 0 ? (
            <Card>
              <CardContent className="flex items-center justify-center py-8">
                <div className="flex flex-col items-center gap-2 text-center">
                  <Database className="h-8 w-8 text-muted-foreground" />
                  <p className="font-medium">No actions available</p>
                  <p className="text-sm text-muted-foreground">
                    Create actions for this integration first
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Enabled Sync Sources */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Active Sync Sources</CardTitle>
                  <CardDescription>
                    Actions configured to sync reference data for AI context
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {syncableActions.length === 0 ? (
                    <div className="py-6 text-center">
                      <Info className="mx-auto mb-2 h-8 w-8 text-muted-foreground/50" />
                      <p className="text-sm text-muted-foreground">
                        No actions are configured for reference data sync
                      </p>
                      <p className="mx-auto mt-2 max-w-md text-xs text-muted-foreground">
                        To enable reference data sync, go to the{' '}
                        <Link
                          href={`/integrations/${integrationId}?tab=actions`}
                          className="text-primary hover:underline"
                        >
                          Actions tab
                        </Link>
                        , select an action (like &quot;List Users&quot; or &quot;List
                        Channels&quot;), and enable &quot;Reference Data Sync&quot; in its Settings
                        tab.
                      </p>
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Action</TableHead>
                          <TableHead>Data Type</TableHead>
                          <TableHead>Extraction Path</TableHead>
                          <TableHead>Sync Interval</TableHead>
                          <TableHead className="w-20">Status</TableHead>
                          <TableHead className="w-10"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {syncableActions.map((action) => {
                          const refData = (
                            action.metadata as { referenceData?: ReferenceDataConfig }
                          )?.referenceData;
                          return (
                            <TableRow key={action.id}>
                              <TableCell>
                                <div>
                                  <p className="font-medium">{action.name}</p>
                                  <p className="text-xs text-muted-foreground">{action.slug}</p>
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  {getDataTypeIcon(refData?.dataType ?? 'unknown')}
                                  <span className="capitalize">{refData?.dataType ?? 'N/A'}</span>
                                </div>
                              </TableCell>
                              <TableCell>
                                <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                                  {refData?.extractionPath ?? 'N/A'}
                                </code>
                              </TableCell>
                              <TableCell>
                                <span className="text-sm">
                                  {formatSyncInterval(refData?.defaultTtlSeconds ?? 3600)}
                                </span>
                              </TableCell>
                              <TableCell>
                                <Badge
                                  variant="outline"
                                  className="gap-1 bg-emerald-500/10 text-emerald-600"
                                >
                                  <CheckCircle2 className="h-3 w-3" />
                                  Active
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-8 w-8 p-0"
                                      asChild
                                    >
                                      <Link
                                        href={`/integrations/${integrationId}/actions/${action.id}`}
                                      >
                                        <ExternalLink className="h-4 w-4" />
                                      </Link>
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Edit action</TooltipContent>
                                </Tooltip>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>

              {/* Help Info */}
              <Card className="border-dashed">
                <CardContent className="py-4">
                  <div className="flex items-start gap-3">
                    <Info className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
                    <div className="space-y-1 text-sm text-muted-foreground">
                      <p className="font-medium text-foreground">How Reference Data Sync Works</p>
                      <p>
                        1. Configure an action (like &quot;List Users&quot; or &quot;List
                        Channels&quot;) to sync reference data in the action&apos;s Settings tab.
                      </p>
                      <p>
                        2. Waygate periodically calls this action and caches the results (users,
                        channels, etc.).
                      </p>
                      <p>
                        3. When AI tools are invoked, they can use this cached data to resolve
                        human-friendly names to IDs (e.g., &quot;#general&quot; →
                        &quot;C123456&quot;).
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        <TabsContent value="data" className="space-y-4">
          {/* Filters */}
          <div className="flex items-center gap-4">
            <div className="relative max-w-sm flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={dataTypeFilter} onValueChange={setDataTypeFilter}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="All types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {allDataTypes.map((type) => (
                  <SelectItem key={type} value={type}>
                    <div className="flex items-center gap-2">
                      {getDataTypeIcon(type)}
                      {type}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Data Table */}
          {dataLoading ? (
            <DataTableSkeleton />
          ) : dataError ? (
            <Card>
              <CardContent className="flex items-center justify-center py-8">
                <div className="flex flex-col items-center gap-2 text-center">
                  <AlertCircle className="h-8 w-8 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">Failed to load reference data</p>
                </div>
              </CardContent>
            </Card>
          ) : referenceData?.data?.length === 0 ? (
            <Card>
              <CardContent className="flex items-center justify-center py-8">
                <div className="flex flex-col items-center gap-2 text-center">
                  <Database className="h-8 w-8 text-muted-foreground" />
                  <p className="font-medium">No reference data cached</p>
                  <p className="text-sm text-muted-foreground">
                    Configure actions with reference data sync to populate this cache
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>External ID</TableHead>
                    <TableHead>Last Synced</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {referenceData?.data?.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {getDataTypeIcon(item.dataType)}
                          <span className="capitalize">{item.dataType}</span>
                        </div>
                      </TableCell>
                      <TableCell className="font-medium">{item.name}</TableCell>
                      <TableCell>
                        <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                          {item.externalId}
                        </code>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDistanceToNow(new Date(item.lastSyncedAt), { addSuffix: true })}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="history" className="space-y-4">
          {/* Sync Jobs Table */}
          {jobsLoading ? (
            <DataTableSkeleton />
          ) : jobsError ? (
            <Card>
              <CardContent className="flex items-center justify-center py-8">
                <div className="flex flex-col items-center gap-2 text-center">
                  <AlertCircle className="h-8 w-8 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">Failed to load sync history</p>
                </div>
              </CardContent>
            </Card>
          ) : syncJobsData?.jobs?.length === 0 ? (
            <Card>
              <CardContent className="flex items-center justify-center py-8">
                <div className="flex flex-col items-center gap-2 text-center">
                  <Clock className="h-8 w-8 text-muted-foreground" />
                  <p className="font-medium">No sync history</p>
                  <p className="text-sm text-muted-foreground">
                    Sync jobs will appear here after the first sync
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Items</TableHead>
                    <TableHead>Started</TableHead>
                    <TableHead>Duration</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {syncJobsData?.jobs?.map((job) => (
                    <TableRow key={job.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {getDataTypeIcon(job.dataType)}
                          <span className="capitalize">{job.dataType}</span>
                        </div>
                      </TableCell>
                      <TableCell>{getStatusBadge(job.status)}</TableCell>
                      <TableCell>
                        <div className="text-sm">
                          <span className="text-emerald-600">+{job.itemsCreated}</span>
                          {job.itemsUpdated > 0 && (
                            <span className="ml-2 text-blue-600">~{job.itemsUpdated}</span>
                          )}
                          {job.itemsDeleted > 0 && (
                            <span className="ml-2 text-red-600">-{job.itemsDeleted}</span>
                          )}
                          {job.itemsFailed > 0 && (
                            <span className="ml-2 text-amber-600">!{job.itemsFailed}</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {job.startedAt
                          ? formatDistanceToNow(new Date(job.startedAt), { addSuffix: true })
                          : 'Pending'}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {job.startedAt && job.completedAt
                          ? `${Math.round(
                              (new Date(job.completedAt).getTime() -
                                new Date(job.startedAt).getTime()) /
                                1000
                            )}s`
                          : '-'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function DataTableSkeleton() {
  return (
    <Card>
      <div className="space-y-4 p-4">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex items-center gap-4">
            <Skeleton className="h-6 w-24" />
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-6 w-28" />
            <Skeleton className="h-6 w-20" />
          </div>
        ))}
      </div>
    </Card>
  );
}

function formatSyncInterval(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h`;
  return `${Math.round(seconds / 86400)}d`;
}
