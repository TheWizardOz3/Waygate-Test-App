'use client';

import { useParams } from 'next/navigation';
import { ListChecks } from 'lucide-react';
import { JobDetail } from '@/components/features/jobs/JobDetail';

export default function JobDetailPage() {
  const params = useParams();
  const jobId = params.id as string;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <ListChecks className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="font-heading text-2xl font-bold">Job Details</h1>
            <p className="text-sm text-muted-foreground">View job progress, status, and results</p>
          </div>
        </div>
      </div>

      {/* Job Detail */}
      <JobDetail jobId={jobId} />
    </div>
  );
}
