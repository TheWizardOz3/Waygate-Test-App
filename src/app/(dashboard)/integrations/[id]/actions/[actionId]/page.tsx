'use client';

import dynamic from 'next/dynamic';
import { useParams, useSearchParams } from 'next/navigation';
import { Skeleton } from '@/components/ui/skeleton';

const ActionEditor = dynamic(
  () => import('@/components/features/actions/ActionEditor').then((mod) => mod.ActionEditor),
  {
    loading: () => (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-10 w-24" />
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <Skeleton className="h-[400px]" />
          <Skeleton className="h-[400px]" />
        </div>
      </div>
    ),
  }
);

export default function EditActionPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const integrationId = params.id as string;
  const actionId = params.actionId as string;
  const connectionId = searchParams.get('connection');

  return (
    <ActionEditor integrationId={integrationId} actionId={actionId} connectionId={connectionId} />
  );
}
