'use client';

import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ShieldAlert, Wrench } from 'lucide-react';
import { MaintenanceProposalList } from './MaintenanceProposalList';
import { ProposalDetail } from './ProposalDetail';
import { DriftReportsList } from '@/components/features/schema-drift/DriftReportsList';
import { DriftBadge } from '@/components/features/schema-drift/DriftBadge';
import { MaintenanceBadge } from './MaintenanceBadge';
import type { MaintenanceProposalResponse } from '@/lib/modules/auto-maintenance/auto-maintenance.schemas';

interface MaintenanceTabProps {
  integrationId: string;
}

/**
 * Consolidated maintenance tab with sub-tabs for Schema Drift reports
 * and Maintenance Proposals. Switches to proposal detail view when selected.
 */
export function MaintenanceTab({ integrationId }: MaintenanceTabProps) {
  const [selectedProposalId, setSelectedProposalId] = useState<string | null>(null);

  if (selectedProposalId) {
    return (
      <ProposalDetail
        integrationId={integrationId}
        proposalId={selectedProposalId}
        onBack={() => setSelectedProposalId(null)}
      />
    );
  }

  return (
    <Tabs defaultValue="drift-reports" className="space-y-4">
      <TabsList>
        <TabsTrigger value="drift-reports" className="gap-2">
          <ShieldAlert className="h-4 w-4" />
          Schema Drift
          <DriftBadge integrationId={integrationId} className="ml-1" />
        </TabsTrigger>
        <TabsTrigger value="proposals" className="gap-2">
          <Wrench className="h-4 w-4" />
          Proposals
          <MaintenanceBadge integrationId={integrationId} className="ml-1" />
        </TabsTrigger>
      </TabsList>

      <TabsContent value="drift-reports">
        <DriftReportsList integrationId={integrationId} />
      </TabsContent>

      <TabsContent value="proposals">
        <MaintenanceProposalList
          integrationId={integrationId}
          onSelectProposal={(proposal: MaintenanceProposalResponse) =>
            setSelectedProposalId(proposal.id)
          }
        />
      </TabsContent>
    </Tabs>
  );
}
