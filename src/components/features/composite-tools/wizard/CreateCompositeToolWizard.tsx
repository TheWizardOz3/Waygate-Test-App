'use client';

import { useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, X, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { StepNameDescription } from './StepNameDescription';
import { StepSelectOperations } from './StepSelectOperations';
import { StepRoutingMode } from './StepRoutingMode';
import { StepRoutingRules } from './StepRoutingRules';
import { StepReview } from './StepReview';
import {
  useCompositeToolWizardStore,
  type CompositeToolWizardStep,
} from '@/stores/compositeToolWizard.store';
import { cn } from '@/lib/utils';

// =============================================================================
// Step Configuration
// =============================================================================

const STEP_CONFIG: Record<CompositeToolWizardStep, { title: string; description: string }> = {
  'tool-type': {
    title: 'Select Tool Type',
    description: 'Choose the type of AI tool you want to create.',
  },
  'name-description': {
    title: 'Name Your Tool',
    description: 'Give your composite tool a name and description.',
  },
  'select-operations': {
    title: 'Select Operations',
    description: 'Choose the actions to include in this composite tool.',
  },
  'routing-mode': {
    title: 'Configure Routing',
    description: 'Choose how requests are routed to operations.',
  },
  'routing-rules': {
    title: 'Define Routing Rules',
    description: 'Create rules to automatically route requests to the right operation.',
  },
  review: {
    title: 'Review & Create',
    description: 'Review your configuration and create the tool.',
  },
};

const STEPS: CompositeToolWizardStep[] = [
  'name-description',
  'select-operations',
  'routing-mode',
  'routing-rules',
  'review',
];

// =============================================================================
// Progress Indicator
// =============================================================================

interface WizardProgressProps {
  currentStep: CompositeToolWizardStep;
  routingMode: 'rule_based' | 'agent_driven';
  onStepClick?: (step: CompositeToolWizardStep) => void;
  className?: string;
}

function WizardProgress({ currentStep, routingMode, onStepClick, className }: WizardProgressProps) {
  // Filter out routing-rules step if agent-driven
  const visibleSteps = STEPS.filter(
    (step) => !(step === 'routing-rules' && routingMode === 'agent_driven')
  );
  const currentIndex = visibleSteps.indexOf(currentStep);

  return (
    <div className={cn('flex items-center justify-center gap-2', className)}>
      {visibleSteps.map((step, index) => {
        const isCompleted = index < currentIndex;
        const isCurrent = step === currentStep;
        const canClick = isCompleted && onStepClick;

        return (
          <div key={step} className="flex items-center">
            {index > 0 && (
              <div
                className={cn(
                  'mx-2 h-0.5 w-8 transition-colors',
                  isCompleted ? 'bg-primary' : 'bg-muted'
                )}
              />
            )}
            <button
              onClick={() => canClick && onStepClick(step)}
              disabled={!canClick}
              className={cn(
                'flex h-8 w-8 items-center justify-center rounded-full border-2 text-sm font-medium transition-all',
                isCurrent && 'border-primary bg-primary text-primary-foreground',
                isCompleted && 'border-primary bg-primary text-primary-foreground',
                !isCurrent && !isCompleted && 'border-muted bg-background text-muted-foreground',
                canClick && 'cursor-pointer hover:opacity-80'
              )}
            >
              {isCompleted ? <Check className="h-4 w-4" /> : index + 1}
            </button>
          </div>
        );
      })}
    </div>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export function CreateCompositeToolWizard() {
  const router = useRouter();
  const { currentStep, canGoBack, goBack, goToStep, reset, data } = useCompositeToolWizardStore();

  // Reset wizard state when component mounts
  useEffect(() => {
    reset();
  }, [reset]);

  const handleCancel = () => {
    reset();
    router.push('/ai-tools');
  };

  const handleBack = () => {
    if (canGoBack()) {
      goBack();
    }
  };

  const handleStepClick = useCallback(
    (step: CompositeToolWizardStep) => {
      goToStep(step);
    },
    [goToStep]
  );

  const stepConfig = STEP_CONFIG[currentStep];
  const showBackButton = canGoBack();
  const showCancelButton = currentStep !== 'review' || !data.createdToolId;

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      {/* Progress indicator */}
      <WizardProgress
        currentStep={currentStep}
        routingMode={data.routingMode}
        onStepClick={handleStepClick}
        className="px-4"
      />

      {/* Main card */}
      <Card className="border-border/50 shadow-lg">
        <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-4">
          <div className="flex items-start gap-4">
            {showBackButton && (
              <Button variant="ghost" size="icon" onClick={handleBack} className="mt-1 shrink-0">
                <ArrowLeft className="h-4 w-4" />
                <span className="sr-only">Go back</span>
              </Button>
            )}
            <div>
              <CardTitle className="font-heading text-2xl">{stepConfig.title}</CardTitle>
              <CardDescription className="mt-1.5">{stepConfig.description}</CardDescription>
            </div>
          </div>
          {showCancelButton && (
            <Button
              variant="ghost"
              size="icon"
              onClick={handleCancel}
              className="shrink-0 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
              <span className="sr-only">Cancel</span>
            </Button>
          )}
        </CardHeader>

        <CardContent className="pt-2">
          {currentStep === 'name-description' && <StepNameDescription />}
          {currentStep === 'select-operations' && <StepSelectOperations />}
          {currentStep === 'routing-mode' && <StepRoutingMode />}
          {currentStep === 'routing-rules' && <StepRoutingRules />}
          {currentStep === 'review' && <StepReview />}
        </CardContent>
      </Card>
    </div>
  );
}
