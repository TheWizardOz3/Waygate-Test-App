'use client';

import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { WizardStep } from '@/stores/wizard.store';

interface WizardProgressProps {
  currentStep: WizardStep;
  /** Callback when a step is clicked. Only completed steps are clickable. */
  onStepClick?: (step: WizardStep) => void;
  /** Steps that should not be clickable (e.g., 'scraping' during async operation) */
  disabledSteps?: WizardStep[];
  className?: string;
}

const STEPS: { id: WizardStep; label: string; shortLabel: string }[] = [
  { id: 'url-input', label: 'Documentation URL', shortLabel: 'URL' },
  { id: 'scraping', label: 'Scraping', shortLabel: 'Scrape' },
  { id: 'review-actions', label: 'Review Actions', shortLabel: 'Review' },
  { id: 'configure-auth', label: 'Configure Auth', shortLabel: 'Auth' },
  { id: 'success', label: 'Complete', shortLabel: 'Done' },
];

function getStepIndex(step: WizardStep): number {
  return STEPS.findIndex((s) => s.id === step);
}

export function WizardProgress({
  currentStep,
  onStepClick,
  disabledSteps = [],
  className,
}: WizardProgressProps) {
  const currentIndex = getStepIndex(currentStep);

  return (
    <nav aria-label="Progress" className={className}>
      <ol className="flex items-center">
        {STEPS.map((step, index) => {
          const isCompleted = index < currentIndex;
          const isCurrent = index === currentIndex;
          const isUpcoming = index > currentIndex;
          const isDisabled = disabledSteps.includes(step.id);
          const isClickable = isCompleted && !isDisabled && onStepClick;

          const handleClick = () => {
            if (isClickable) {
              onStepClick(step.id);
            }
          };

          return (
            <li key={step.id} className="relative flex-1">
              {/* Connector line */}
              {index > 0 && (
                <div
                  className={cn(
                    'absolute left-0 top-4 -ml-px h-0.5 w-full -translate-x-1/2',
                    isCompleted || isCurrent ? 'bg-secondary' : 'bg-border'
                  )}
                  aria-hidden="true"
                />
              )}

              <button
                type="button"
                onClick={handleClick}
                disabled={!isClickable}
                className={cn(
                  'group relative flex w-full flex-col items-center',
                  isClickable && 'cursor-pointer'
                )}
                aria-current={isCurrent ? 'step' : undefined}
              >
                {/* Step circle */}
                <span
                  className={cn(
                    'flex h-8 w-8 items-center justify-center rounded-full border-2 transition-all',
                    isCompleted && 'border-secondary bg-secondary text-secondary-foreground',
                    isCurrent && 'border-secondary bg-background text-secondary',
                    isUpcoming && 'border-border bg-background text-muted-foreground',
                    isClickable &&
                      'hover:scale-110 hover:ring-2 hover:ring-secondary/50 hover:ring-offset-2'
                  )}
                >
                  {isCompleted ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <span className="text-sm font-medium">{index + 1}</span>
                  )}
                </span>

                {/* Step label */}
                <span
                  className={cn(
                    'mt-2 text-xs font-medium transition-colors',
                    isCurrent && 'text-secondary',
                    isCompleted && 'text-foreground',
                    isUpcoming && 'text-muted-foreground',
                    isClickable && 'group-hover:text-secondary'
                  )}
                >
                  {/* Show short label on mobile, full label on desktop */}
                  <span className="hidden sm:inline">{step.label}</span>
                  <span className="sm:hidden">{step.shortLabel}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
