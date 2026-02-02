'use client';

import { useParams } from 'next/navigation';
import { AIToolDashboard } from '@/components/features/ai-tools';

export default function AIToolDetailPage() {
  const { id } = useParams<{ id: string }>();

  return <AIToolDashboard toolId={id} />;
}
