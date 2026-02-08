'use client';

import { useState } from 'react';
import { MaintenanceProposalList } from './MaintenanceProposalList';
import { ProposalDetail } from './ProposalDetail';
import type { MaintenanceProposalResponse } from '@/lib/modules/auto-maintenance/auto-maintenance.schemas';

interface MaintenanceTabProps {
  integrationId: string;
}

/**
 * Maintenance tab content for integration detail page.
 * Switches between proposal list and detail views.
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
    <MaintenanceProposalList
      integrationId={integrationId}
      onSelectProposal={(proposal: MaintenanceProposalResponse) =>
        setSelectedProposalId(proposal.id)
      }
    />
  );
}
