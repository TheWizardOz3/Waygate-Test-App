'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PlusCircle } from 'lucide-react';
import { ActionTable } from '@/components/features/actions/ActionTable';

interface IntegrationActionsTabProps {
  integrationId: string;
}

export function IntegrationActionsTab({ integrationId }: IntegrationActionsTabProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Actions</CardTitle>
          <CardDescription>Manage the API actions available for this integration</CardDescription>
        </div>
        <Button asChild>
          <Link href={`/integrations/${integrationId}/actions/new`}>
            <PlusCircle className="mr-2 h-4 w-4" />
            New Action
          </Link>
        </Button>
      </CardHeader>
      <CardContent>
        <ActionTable integrationId={integrationId} />
      </CardContent>
    </Card>
  );
}
