'use client';

import { use } from 'react';
import { CompositeToolDetail } from '@/components/features/composite-tools';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function CompositeToolDetailPage({ params }: PageProps) {
  const { id } = use(params);
  return <CompositeToolDetail toolId={id} />;
}
