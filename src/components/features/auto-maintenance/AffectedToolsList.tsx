'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Zap, Layers, Bot, Check, X, CheckCheck, XCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useApplyDescriptionDecisions } from '@/hooks/useAutoMaintenance';
import type {
  AffectedTool,
  AffectedToolType,
  DescriptionSuggestion,
} from '@/lib/modules/auto-maintenance/auto-maintenance.schemas';

// =============================================================================
// Types
// =============================================================================

interface AffectedToolsListProps {
  integrationId: string;
  proposalId: string;
  proposalStatus: string;
  affectedTools: AffectedTool[] | null;
  descriptionSuggestions: DescriptionSuggestion[] | null;
  className?: string;
}

// =============================================================================
// Config
// =============================================================================

const toolTypeConfig: Record<
  AffectedToolType,
  { label: string; icon: React.ElementType; className: string }
> = {
  action: {
    label: 'Action',
    icon: Zap,
    className: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  },
  composite: {
    label: 'Composite',
    icon: Layers,
    className: 'bg-violet-500/10 text-violet-600 border-violet-500/20',
  },
  agentic: {
    label: 'Agentic',
    icon: Bot,
    className: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
  },
};

// =============================================================================
// Sub-Components
// =============================================================================

function ToolTypeBadge({ toolType }: { toolType: AffectedToolType }) {
  const config = toolTypeConfig[toolType];
  const Icon = config.icon;
  return (
    <Badge variant="outline" className={cn('gap-1', config.className)}>
      <Icon className="h-3 w-3" />
      {config.label}
    </Badge>
  );
}

function DescriptionCompare({ current, suggested }: { current: string | null; suggested: string }) {
  const [showSuggested, setShowSuggested] = useState(true);

  return (
    <div className="mt-2 space-y-1">
      <div className="flex gap-2">
        <Button
          variant={!showSuggested ? 'secondary' : 'ghost'}
          size="sm"
          className="h-6 text-xs"
          onClick={() => setShowSuggested(false)}
        >
          Current
        </Button>
        <Button
          variant={showSuggested ? 'secondary' : 'ghost'}
          size="sm"
          className="h-6 text-xs"
          onClick={() => setShowSuggested(true)}
        >
          Suggested
        </Button>
      </div>
      <div className="rounded-md bg-muted/50 p-2 text-xs leading-relaxed">
        {showSuggested ? suggested : (current ?? 'No description')}
      </div>
    </div>
  );
}

// =============================================================================
// Main Component
// =============================================================================

/**
 * Shows affected tools and, after approval, lets the user accept/skip
 * description update suggestions per tool.
 */
export function AffectedToolsList({
  integrationId,
  proposalId,
  proposalStatus,
  affectedTools,
  descriptionSuggestions,
  className,
}: AffectedToolsListProps) {
  const { mutate: applyDecisions, isPending } = useApplyDescriptionDecisions(integrationId);
  const [localDecisions, setLocalDecisions] = useState<Record<string, boolean>>({});

  const isApproved = proposalStatus === 'approved';
  const hasSuggestions = isApproved && descriptionSuggestions && descriptionSuggestions.length > 0;
  const pendingSuggestions = descriptionSuggestions?.filter((s) => s.status === 'pending') ?? [];
  const hasPendingSuggestions = pendingSuggestions.length > 0;

  // Before approval: show affected tools list
  if (!isApproved) {
    if (!affectedTools || affectedTools.length === 0) {
      return (
        <div className={cn('text-sm text-muted-foreground', className)}>
          No other tools reference this action
        </div>
      );
    }

    return (
      <Card className={className}>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Affected Tools</CardTitle>
          <CardDescription className="text-xs">
            These tools may need description updates after approval
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {affectedTools.map((tool) => (
            <div key={tool.toolId} className="flex items-center gap-2">
              <ToolTypeBadge toolType={tool.toolType} />
              <span className="text-sm">{tool.toolName}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  // After approval: show description suggestions with accept/skip actions
  if (!hasSuggestions) {
    return (
      <div className={cn('text-sm text-muted-foreground', className)}>
        No description suggestions available
      </div>
    );
  }

  const handleDecision = (toolId: string, accept: boolean) => {
    setLocalDecisions((prev) => ({ ...prev, [toolId]: accept }));
  };

  const handleSubmitDecisions = () => {
    const decisions = Object.entries(localDecisions).map(([toolId, accept]) => ({
      toolId,
      accept,
    }));

    if (decisions.length === 0) {
      toast.error('No decisions to submit');
      return;
    }

    applyDecisions(
      { proposalId, decisions },
      {
        onSuccess: () => {
          toast.success('Description decisions applied');
          setLocalDecisions({});
        },
        onError: (err) => {
          toast.error(err instanceof Error ? err.message : 'Failed to apply decisions');
        },
      }
    );
  };

  const handleAcceptAll = () => {
    const allDecisions: Record<string, boolean> = {};
    for (const s of pendingSuggestions) {
      allDecisions[s.toolId] = true;
    }
    setLocalDecisions(allDecisions);
  };

  const handleSkipAll = () => {
    const allDecisions: Record<string, boolean> = {};
    for (const s of pendingSuggestions) {
      allDecisions[s.toolId] = false;
    }
    setLocalDecisions(allDecisions);
  };

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm">Description Update Suggestions</CardTitle>
            <CardDescription className="text-xs">
              Review and accept or skip suggested description updates for affected tools
            </CardDescription>
          </div>
          {hasPendingSuggestions && (
            <div className="flex gap-1">
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={handleAcceptAll}>
                <CheckCheck className="mr-1 h-3 w-3" />
                Accept All
              </Button>
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={handleSkipAll}>
                <XCircle className="mr-1 h-3 w-3" />
                Skip All
              </Button>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {descriptionSuggestions.map((suggestion) => {
          const isPending = suggestion.status === 'pending';
          const localDecision = localDecisions[suggestion.toolId];

          return (
            <div
              key={suggestion.toolId}
              className={cn('rounded-lg border p-3', !isPending && 'opacity-60')}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ToolTypeBadge toolType={suggestion.toolType} />
                  <span className="text-sm font-medium">{suggestion.toolName}</span>
                </div>
                {isPending ? (
                  <div className="flex gap-1">
                    <Button
                      variant={localDecision === true ? 'default' : 'outline'}
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => handleDecision(suggestion.toolId, true)}
                    >
                      <Check className="mr-1 h-3 w-3" />
                      Accept
                    </Button>
                    <Button
                      variant={localDecision === false ? 'secondary' : 'outline'}
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => handleDecision(suggestion.toolId, false)}
                    >
                      <X className="mr-1 h-3 w-3" />
                      Skip
                    </Button>
                  </div>
                ) : (
                  <Badge
                    variant="outline"
                    className={
                      suggestion.status === 'accepted'
                        ? 'bg-emerald-500/10 text-emerald-600'
                        : 'bg-muted text-muted-foreground'
                    }
                  >
                    {suggestion.status === 'accepted' ? 'Accepted' : 'Skipped'}
                  </Badge>
                )}
              </div>
              <DescriptionCompare
                current={suggestion.currentDescription}
                suggested={suggestion.suggestedDescription}
              />
            </div>
          );
        })}

        {hasPendingSuggestions && Object.keys(localDecisions).length > 0 && (
          <div className="flex justify-end pt-2">
            <Button onClick={handleSubmitDecisions} disabled={isPending} size="sm">
              {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Apply {Object.keys(localDecisions).length} Decision
              {Object.keys(localDecisions).length !== 1 ? 's' : ''}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
