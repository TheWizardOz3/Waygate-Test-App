'use client';

import * as React from 'react';
import { ArrowRight, GitBranch, Bot, Check } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { useCompositeToolWizardStore } from '@/stores/compositeToolWizard.store';
import { cn } from '@/lib/utils';
import type { CompositeToolRoutingMode } from '@/lib/modules/composite-tools/composite-tool.schemas';

// =============================================================================
// Component
// =============================================================================

export function StepRoutingMode() {
  const { data, setRoutingMode, setDefaultOperation, goToStep, getNextStep } =
    useCompositeToolWizardStore();

  const handleModeSelect = (mode: CompositeToolRoutingMode) => {
    setRoutingMode(mode);
  };

  const handleContinue = () => {
    const nextStep = getNextStep();
    if (nextStep) {
      goToStep(nextStep);
    }
  };

  return (
    <div className="space-y-6">
      {/* Routing mode selection */}
      <div className="grid gap-4 sm:grid-cols-2">
        <RoutingModeCard
          mode="rule_based"
          title="Rule-Based Routing"
          description="Define conditions to automatically route requests to the right operation based on input parameters."
          icon={GitBranch}
          selected={data.routingMode === 'rule_based'}
          onSelect={() => handleModeSelect('rule_based')}
          features={[
            'Automatic routing based on input',
            'No agent decision needed',
            'Deterministic behavior',
          ]}
        />
        <RoutingModeCard
          mode="agent_driven"
          title="Agent-Driven Selection"
          description="Let the AI agent choose which operation to use based on context and requirements."
          icon={Bot}
          selected={data.routingMode === 'agent_driven'}
          onSelect={() => handleModeSelect('agent_driven')}
          features={[
            'Operation exposed as enum parameter',
            'Agent decides based on context',
            'More flexible routing',
          ]}
        />
      </div>

      {/* Default operation (for rule-based) */}
      {data.routingMode === 'rule_based' && (
        <div className="space-y-2">
          <Label>Default Operation (Optional)</Label>
          <Select
            value={data.defaultOperationSlug || '_none'}
            onValueChange={(v) => setDefaultOperation(v === '_none' ? null : v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select default operation" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">No default (require matching rule)</SelectItem>
              {data.operations.map((op) => (
                <SelectItem key={op.operationSlug} value={op.operationSlug}>
                  {op.displayName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Used when no routing rule matches the input. If not set, requests without matching rules
            will fail.
          </p>
        </div>
      )}

      {/* Info about agent-driven mode */}
      {data.routingMode === 'agent_driven' && (
        <div className="rounded-lg bg-muted/50 p-4">
          <h4 className="font-medium">How Agent-Driven Selection Works</h4>
          <p className="mt-1 text-sm text-muted-foreground">
            When exported, the tool will include an &quot;operation&quot; parameter as an enum. The
            AI agent will see all available operations and choose the appropriate one based on the
            context of the request.
          </p>
          <div className="mt-3">
            <p className="text-xs font-medium text-muted-foreground">Operations available:</p>
            <ul className="mt-1 space-y-1">
              {data.operations.map((op) => (
                <li key={op.operationSlug} className="text-sm">
                  <code className="rounded bg-muted px-1">{op.operationSlug}</code>
                  <span className="text-muted-foreground"> - {op.displayName}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="flex justify-end border-t pt-4">
        <Button onClick={handleContinue} className="gap-2">
          Continue
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

// =============================================================================
// Routing Mode Card
// =============================================================================

interface RoutingModeCardProps {
  mode: CompositeToolRoutingMode;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  selected: boolean;
  onSelect: () => void;
  features: string[];
}

function RoutingModeCard({
  title,
  description,
  icon: Icon,
  selected,
  onSelect,
  features,
}: RoutingModeCardProps) {
  return (
    <Card
      className={cn(
        'cursor-pointer transition-all hover:border-primary/50',
        selected && 'border-primary bg-primary/5'
      )}
      onClick={onSelect}
    >
      <CardHeader className="pb-2">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              'flex h-10 w-10 items-center justify-center rounded-lg',
              selected ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
            )}
          >
            <Icon className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <CardTitle className="text-base">{title}</CardTitle>
          </div>
          {selected && (
            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary">
              <Check className="h-3 w-3 text-primary-foreground" />
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <CardDescription>{description}</CardDescription>
        <ul className="mt-3 space-y-1">
          {features.map((feature, i) => (
            <li key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
              <div className="h-1 w-1 rounded-full bg-muted-foreground" />
              {feature}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
