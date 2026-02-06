'use client';

import { useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, X, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { StepNameDescription } from './StepNameDescription';
import { StepExecutionMode } from './StepExecutionMode';
import { StepLLMConfig } from './StepLLMConfig';
import { StepSystemPrompt } from './StepSystemPrompt';
import { StepToolAllocation } from './StepToolAllocation';
import { StepContextConfig } from './StepContextConfig';
import { StepReview } from './StepReview';
import {
  useAgenticToolWizardStore,
  type AgenticToolWizardStep,
} from '@/stores/agenticToolWizard.store';
import { cn } from '@/lib/utils';

// =============================================================================
// Step Configuration
// =============================================================================

const STEP_CONFIG: Record<AgenticToolWizardStep, { title: string; description: string }> = {
  'name-description': {
    title: 'Name Your Tool',
    description: 'Give your agentic tool a name and description.',
  },
  'execution-mode': {
    title: 'Select Execution Mode',
    description: 'Choose how the embedded LLM will operate.',
  },
  'llm-config': {
    title: 'Configure LLM',
    description: 'Select and configure the embedded language model.',
  },
  'system-prompt': {
    title: 'System Prompt',
    description: 'Define instructions for the embedded LLM.',
  },
  'tool-allocation': {
    title: 'Allocate Tools',
    description: 'Select which actions or tools the LLM can use.',
  },
  'context-config': {
    title: 'Context Variables',
    description: 'Configure data injection for the system prompt.',
  },
  review: {
    title: 'Review & Create',
    description: 'Review your configuration and create the tool.',
  },
};

const STEPS: AgenticToolWizardStep[] = [
  'tool-allocation',
  'name-description',
  'execution-mode',
  'llm-config',
  'system-prompt',
  'context-config',
  'review',
];

// =============================================================================
// Progress Indicator
// =============================================================================

interface WizardProgressProps {
  currentStep: AgenticToolWizardStep;
  onStepClick?: (step: AgenticToolWizardStep) => void;
  className?: string;
}

function WizardProgress({ currentStep, onStepClick, className }: WizardProgressProps) {
  const currentIndex = STEPS.indexOf(currentStep);

  return (
    <div className={cn('flex items-center justify-center gap-2', className)}>
      {STEPS.map((step, index) => {
        const isCompleted = index < currentIndex;
        const isCurrent = step === currentStep;
        const canClick = isCompleted && onStepClick;

        return (
          <div key={step} className="flex items-center">
            {index > 0 && (
              <div
                className={cn(
                  'mx-2 h-0.5 w-8 transition-colors',
                  isCompleted ? 'bg-violet-600' : 'bg-muted'
                )}
              />
            )}
            <button
              onClick={() => canClick && onStepClick(step)}
              disabled={!canClick}
              className={cn(
                'flex h-8 w-8 items-center justify-center rounded-full border-2 text-sm font-medium transition-all',
                isCurrent && 'border-violet-600 bg-violet-600 text-white',
                isCompleted && 'border-violet-600 bg-violet-600 text-white',
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

export function CreateAgenticToolWizard() {
  const router = useRouter();
  const { currentStep, canGoBack, goBack, goToStep, reset, data } = useAgenticToolWizardStore();

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
    (step: AgenticToolWizardStep) => {
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
      <WizardProgress currentStep={currentStep} onStepClick={handleStepClick} className="px-4" />

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
          {currentStep === 'execution-mode' && <StepExecutionMode />}
          {currentStep === 'llm-config' && <StepLLMConfig />}
          {currentStep === 'system-prompt' && <StepSystemPrompt />}
          {currentStep === 'tool-allocation' && <StepToolAllocation />}
          {currentStep === 'context-config' && <StepContextConfig />}
          {currentStep === 'review' && <StepReview />}
        </CardContent>
      </Card>
    </div>
  );
}
