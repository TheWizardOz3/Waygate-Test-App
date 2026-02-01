'use client';

import { Bot, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAgenticToolWizardStore } from '@/stores/agenticToolWizard.store';
import { cn } from '@/lib/utils';
import type { AgenticToolExecutionMode } from '@/lib/modules/agentic-tools/agentic-tool.schemas';

const EXECUTION_MODES = [
  {
    mode: 'parameter_interpreter' as AgenticToolExecutionMode,
    icon: Wand2,
    title: 'LLM Data Transformation',
    description:
      'LLM translates natural language into structured API parameters. Single LLM call per invocation.',
    features: ['Natural language → JSON parameters', 'One LLM call', 'Predictable execution'],
    useCase: 'Database queries, search filters, complex parameter generation',
  },
  {
    mode: 'autonomous_agent' as AgenticToolExecutionMode,
    icon: Bot,
    title: 'Autonomous Agent',
    description:
      'LLM autonomously selects and executes tools to accomplish goals. Multiple tool calls per invocation.',
    features: ['Natural language → tool selection', 'Multiple LLM calls', 'Autonomous execution'],
    useCase: 'Research tasks, multi-step workflows, complex data gathering',
  },
] as const;

export function StepExecutionMode() {
  const { data, setExecutionMode, canProceed, getNextStep, goToStep } = useAgenticToolWizardStore();

  const handleSelect = (mode: AgenticToolExecutionMode) => {
    setExecutionMode(mode);
  };

  const handleNext = () => {
    const nextStep = getNextStep();
    if (nextStep && canProceed()) {
      goToStep(nextStep);
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        {EXECUTION_MODES.map(({ mode, icon: Icon, title, description, features, useCase }) => (
          <button
            key={mode}
            onClick={() => handleSelect(mode)}
            className={cn(
              'group relative w-full rounded-lg border-2 p-6 text-left transition-all',
              'hover:border-violet-600 hover:bg-violet-600/5',
              'focus:outline-none focus:ring-2 focus:ring-violet-600 focus:ring-offset-2',
              data.executionMode === mode &&
                'border-violet-600 bg-violet-600/5 ring-2 ring-violet-600 ring-offset-2'
            )}
          >
            <div className="flex items-start gap-4">
              <div
                className={cn(
                  'flex h-12 w-12 shrink-0 items-center justify-center rounded-lg transition-colors',
                  data.executionMode === mode
                    ? 'bg-violet-600 text-white'
                    : 'bg-violet-600/10 text-violet-600 group-hover:bg-violet-600 group-hover:text-white'
                )}
              >
                <Icon className="h-6 w-6" />
              </div>
              <div className="flex-1">
                <h3 className="font-heading text-lg font-semibold">{title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{description}</p>

                <div className="mt-3 space-y-1">
                  {features.map((feature) => (
                    <div key={feature} className="flex items-center gap-2 text-sm">
                      <div className="h-1.5 w-1.5 rounded-full bg-violet-600" />
                      <span>{feature}</span>
                    </div>
                  ))}
                </div>

                <div className="mt-3 rounded-md bg-muted/50 p-2">
                  <p className="text-xs text-muted-foreground">
                    <span className="font-medium">Use case:</span> {useCase}
                  </p>
                </div>
              </div>
            </div>
          </button>
        ))}
      </div>

      <div className="flex justify-end">
        <Button onClick={handleNext} disabled={!canProceed()}>
          Next
        </Button>
      </div>
    </div>
  );
}
