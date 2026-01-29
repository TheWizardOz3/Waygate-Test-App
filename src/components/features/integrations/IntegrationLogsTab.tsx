'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollText, ArrowRight, ExternalLink } from 'lucide-react';

interface IntegrationLogsTabProps {
  integrationId: string;
  connectionId?: string | null;
}

export function IntegrationLogsTab({ integrationId, connectionId }: IntegrationLogsTabProps) {
  // Build the logs URL with optional connection filter
  const logsUrl = connectionId
    ? `/logs?integration=${integrationId}&connection=${connectionId}`
    : `/logs?integration=${integrationId}`;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Request Logs</CardTitle>
          <CardDescription>
            {connectionId
              ? 'View API request history for the selected connection'
              : 'View API request history for this integration'}
          </CardDescription>
        </div>
        <Button variant="outline" asChild>
          <Link href={logsUrl}>
            <ExternalLink className="mr-2 h-4 w-4" />
            View All Logs
          </Link>
        </Button>
      </CardHeader>
      <CardContent>
        <div className="space-y-4 py-12 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <ScrollText className="h-6 w-6 text-muted-foreground" />
          </div>
          <div className="space-y-2">
            <h3 className="font-medium">Logs Viewer Coming Soon</h3>
            <p className="mx-auto max-w-md text-sm text-muted-foreground">
              The full request log viewer with filtering and detailed request/response views will be
              available in a later phase.
            </p>
          </div>
          <Button variant="outline" asChild>
            <Link href={logsUrl}>
              Go to Logs
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
