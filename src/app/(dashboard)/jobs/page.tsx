'use client';

import { ListChecks } from 'lucide-react';
import { JobList } from '@/components/features/jobs/JobList';

export default function JobsPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <ListChecks className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="font-heading text-2xl font-bold">Jobs</h1>
            <p className="text-sm text-muted-foreground">
              Monitor background jobs, batch operations, and async tasks
            </p>
          </div>
        </div>
      </div>

      {/* Job List */}
      <JobList />
    </div>
  );
}
