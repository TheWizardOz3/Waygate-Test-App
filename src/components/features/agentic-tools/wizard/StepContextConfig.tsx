'use client';

import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useAgenticToolWizardStore } from '@/stores/agenticToolWizard.store';
import { Alert, AlertDescription } from '@/components/ui/alert';

export function StepContextConfig() {
  const {
    data,
    setContextVariable,
    removeContextVariable,
    setAutoInjectSchemas,
    canProceed,
    getNextStep,
    goToStep,
  } = useAgenticToolWizardStore();

  const handleNext = () => {
    const nextStep = getNextStep();
    if (nextStep && canProceed()) {
      goToStep(nextStep);
    }
  };

  const handleAddCustomVariable = () => {
    const key = prompt('Enter variable name (without {{}}):');
    if (!key) return;

    const value = prompt('Enter variable value:');
    if (value === null) return;

    setContextVariable(key, {
      type: 'custom',
      value,
    });
  };

  return (
    <div className="space-y-6">
      <Alert>
        <AlertDescription>
          Context variables are injected into the system prompt at runtime. This step is optional -
          you can skip if you don&apos;t need additional context beyond the defaults.
        </AlertDescription>
      </Alert>

      <div className="space-y-6">
        {/* Auto-inject schemas */}
        <div className="flex items-center justify-between rounded-lg border p-4">
          <div className="space-y-0.5">
            <Label htmlFor="autoInject">Auto-inject Integration Schemas</Label>
            <p className="text-sm text-muted-foreground">
              Automatically inject API schemas for allocated tools as{' '}
              <code className="text-xs">{'{{integration_schema}}'}</code>
            </p>
          </div>
          <Switch
            id="autoInject"
            checked={data.autoInjectSchemas}
            onCheckedChange={setAutoInjectSchemas}
          />
        </div>

        {/* Custom variables */}
        <div className="space-y-2">
          <Label>Custom Variables (optional)</Label>
          <p className="text-sm text-muted-foreground">
            Define custom variables that can be referenced in the system prompt.
          </p>

          {Object.keys(data.contextVariables).length > 0 && (
            <div className="space-y-2">
              {Object.entries(data.contextVariables).map(([key, variable]) => (
                <div key={key} className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <code className="font-mono text-sm">{`{{${key}}}`}</code>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {variable.type === 'custom' && variable.value}
                      {variable.type === 'integration_schema' && 'Integration Schema'}
                      {variable.type === 'reference_data' && `Reference Data: ${variable.source}`}
                    </p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => removeContextVariable(key)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          <Button variant="outline" className="w-full" onClick={handleAddCustomVariable}>
            <Plus className="mr-2 h-4 w-4" />
            Add Custom Variable
          </Button>
        </div>

        {/* Built-in variables info */}
        <div className="rounded-lg bg-muted/50 p-4">
          <p className="text-sm font-medium">Built-in Variables</p>
          <p className="mt-2 text-sm text-muted-foreground">
            The following variables are always available:
          </p>
          <ul className="mt-2 space-y-1 text-sm">
            <li>
              <code className="text-xs">{'{{user_input}}'}</code> - The task from the parent agent
            </li>
            <li>
              <code className="text-xs">{'{{available_tools}}'}</code> - List of tools (autonomous
              mode only)
            </li>
          </ul>
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={handleNext}>
          Skip
        </Button>
        <Button onClick={handleNext} disabled={!canProceed()}>
          Next
        </Button>
      </div>
    </div>
  );
}
