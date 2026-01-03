'use client';

import { useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { WizardProgress } from './WizardProgress';
import { StepUrlInput } from './StepUrlInput';
import { StepScraping } from './StepScraping';
import { StepReviewActions } from './StepReviewActions';
import { StepConfigureAuth } from './StepConfigureAuth';
import { StepSuccess } from './StepSuccess';
import { useWizardStore, type WizardStep } from '@/stores/wizard.store';

const STEP_TITLES: Record<string, { title: string; description: string }> = {
  'url-input': {
    title: 'Enter Documentation URL',
    description: 'Provide the API documentation URL and optionally list specific actions you need.',
  },
  scraping: {
    title: 'Analyzing Documentation',
    description: 'Our AI is reading the documentation and extracting API endpoints.',
  },
  'review-actions': {
    title: 'Review Detected Actions',
    description: 'Select which actions to include in your integration.',
  },
  'configure-auth': {
    title: 'Configure Authentication',
    description: 'Set up the credentials needed to connect to this API.',
  },
  success: {
    title: 'Integration Created!',
    description: 'Your integration is ready to use.',
  },
};

export function CreateIntegrationWizard() {
  const router = useRouter();
  const { currentStep, canGoBack, goBack, goToStep, reset } = useWizardStore();

  // Reset wizard state when component mounts
  useEffect(() => {
    reset();
  }, [reset]);

  const handleCancel = () => {
    reset();
    router.push('/integrations');
  };

  const handleBack = () => {
    if (canGoBack()) {
      goBack();
    }
  };

  // Handle clicking on a completed step in the progress indicator
  const handleStepClick = useCallback(
    (step: WizardStep) => {
      // Navigate directly to the clicked step (only works for completed steps)
      goToStep(step);
    },
    [goToStep]
  );

  const stepInfo = STEP_TITLES[currentStep];
  const showBackButton = canGoBack() && currentStep !== 'scraping' && currentStep !== 'success';
  const showCancelButton = currentStep !== 'success';

  // Disable clicking on scraping step (it's an async process) and success step
  const disabledSteps: WizardStep[] = ['scraping', 'success'];

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      {/* Progress indicator */}
      <WizardProgress
        currentStep={currentStep}
        onStepClick={handleStepClick}
        disabledSteps={disabledSteps}
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
              <CardTitle className="font-heading text-2xl">{stepInfo.title}</CardTitle>
              <CardDescription className="mt-1.5">{stepInfo.description}</CardDescription>
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
          {/* Step content */}
          {currentStep === 'url-input' && <StepUrlInput />}
          {currentStep === 'scraping' && <StepScraping />}
          {currentStep === 'review-actions' && <StepReviewActions />}
          {currentStep === 'configure-auth' && <StepConfigureAuth />}
          {currentStep === 'success' && <StepSuccess />}
        </CardContent>
      </Card>
    </div>
  );
}
