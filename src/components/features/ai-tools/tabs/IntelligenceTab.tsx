'use client';

import { CompositeIntelligence } from './CompositeIntelligence';
import { AgenticIntelligence } from './AgenticIntelligence';
import type { CompositeToolDetailResponse } from '@/lib/modules/composite-tools/composite-tool.schemas';
import type { AgenticToolResponse } from '@/lib/modules/agentic-tools/agentic-tool.schemas';

// =============================================================================
// Types
// =============================================================================

interface IntelligenceTabProps {
  tool: CompositeToolDetailResponse | AgenticToolResponse;
  toolType: 'composite' | 'agentic';
  onUpdate?: () => void;
}

// =============================================================================
// Component
// =============================================================================

export function IntelligenceTab({ tool, toolType, onUpdate }: IntelligenceTabProps) {
  if (toolType === 'composite') {
    return <CompositeIntelligence tool={tool as CompositeToolDetailResponse} onUpdate={onUpdate} />;
  }

  return <AgenticIntelligence tool={tool as AgenticToolResponse} onUpdate={onUpdate} />;
}
