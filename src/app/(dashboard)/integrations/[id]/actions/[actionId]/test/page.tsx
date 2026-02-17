'use client';

import { useParams, useSearchParams } from 'next/navigation';
import { ActionTester } from '@/components/features/actions/ActionTester';

export default function ActionTestPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const integrationId = params.id as string;
  const actionId = params.actionId as string;
  const connectionId = searchParams.get('connection');

  return (
    <ActionTester integrationId={integrationId} actionId={actionId} connectionId={connectionId} />
  );
}
