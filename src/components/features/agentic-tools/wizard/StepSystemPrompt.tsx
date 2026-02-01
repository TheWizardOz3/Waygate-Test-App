'use client';

import { useState, useEffect } from 'react';
import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useAgenticToolWizardStore } from '@/stores/agenticToolWizard.store';
import { Alert, AlertDescription } from '@/components/ui/alert';

const PARAMETER_INTERPRETER_TEMPLATE = `You are a parameter generation assistant. Convert natural language requests into structured API parameters.

# User Request:
{{user_input}}

# Integration Schema:
{{integration_schema}}

# Instructions:
1. Analyze the user's request to understand their intent
2. Use the schema above to identify correct field names and valid values
3. Generate structured JSON parameters
4. Return ONLY valid JSON

# Output Format:
{
  "parameter_name": "value",
  "another_parameter": "value"
}

Be precise and use only fields defined in the schema.`;

const AUTONOMOUS_AGENT_TEMPLATE = `You are an autonomous assistant. Accomplish tasks using the available tools.

# Available Tools:
{{available_tools}}

# User Request:
{{user_input}}

# Instructions:
1. Analyze the request to understand what information or action is needed
2. Select appropriate tools from the available tools list
3. Execute tools in sequence to gather or process information
4. Synthesize findings into a clear answer
5. Always cite sources when applicable

You can call tools multiple times. Continue until the task is fully satisfied or you reach safety limits.`;

const VARIABLE_OPTIONS = [
  { key: '{{user_input}}', description: 'The natural language task/request from the user' },
  {
    key: '{{integration_schema}}',
    description: 'Schema for target integration (fields, types, valid values)',
  },
  { key: '{{reference_data}}', description: 'Reference data from configured sources' },
  { key: '{{available_tools}}', description: 'List of tools available for autonomous mode' },
];

export function StepSystemPrompt() {
  const { data, setSystemPrompt, canProceed, getNextStep, goToStep } = useAgenticToolWizardStore();

  const [prompt, setPrompt] = useState(data.systemPrompt);

  useEffect(() => {
    setSystemPrompt(prompt);
  }, [prompt, setSystemPrompt]);

  useEffect(() => {
    // Auto-generate template if empty
    if (!prompt) {
      const template =
        data.executionMode === 'parameter_interpreter'
          ? PARAMETER_INTERPRETER_TEMPLATE
          : AUTONOMOUS_AGENT_TEMPLATE;
      setPrompt(template);
    }
  }, [data.executionMode, prompt]);

  const handleGenerateTemplate = () => {
    const template =
      data.executionMode === 'parameter_interpreter'
        ? PARAMETER_INTERPRETER_TEMPLATE
        : AUTONOMOUS_AGENT_TEMPLATE;
    setPrompt(template);
  };

  const handleInsertVariable = (variable: string) => {
    setPrompt((prev) => prev + variable);
  };

  const handleNext = () => {
    const nextStep = getNextStep();
    if (nextStep && canProceed()) {
      goToStep(nextStep);
    }
  };

  return (
    <div className="space-y-6">
      <Alert>
        <Sparkles className="h-4 w-4" />
        <AlertDescription>
          Use variable placeholders like <code className="text-xs">{'{{user_input}}'}</code> that
          will be replaced with actual values at runtime.
        </AlertDescription>
      </Alert>

      <div className="space-y-4">
        {/* System Prompt */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="systemPrompt">System Prompt *</Label>
            <Button type="button" variant="outline" size="sm" onClick={handleGenerateTemplate}>
              <Sparkles className="mr-2 h-3 w-3" />
              Generate Template
            </Button>
          </div>
          <Textarea
            id="systemPrompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Enter instructions for the embedded LLM..."
            rows={16}
            className="font-mono text-sm"
          />
          <p className="text-sm text-muted-foreground">
            Instructions that guide the embedded LLM. Use variables in double curly braces.
          </p>
        </div>

        {/* Variable Reference */}
        <div className="space-y-2">
          <Label>Available Variables</Label>
          <div className="grid gap-2">
            {VARIABLE_OPTIONS.map((variable) => (
              <button
                key={variable.key}
                onClick={() => handleInsertVariable(variable.key)}
                className="flex items-start gap-3 rounded-lg border p-3 text-left hover:border-violet-600 hover:bg-violet-600/5"
              >
                <code className="shrink-0 rounded bg-muted px-2 py-1 font-mono text-xs">
                  {variable.key}
                </code>
                <span className="text-sm text-muted-foreground">{variable.description}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Character count */}
        <div className="flex justify-end">
          <span className="text-xs text-muted-foreground">
            {prompt.length} characters (minimum 10)
          </span>
        </div>
      </div>

      <div className="flex justify-end">
        <Button onClick={handleNext} disabled={!canProceed()}>
          Next
        </Button>
      </div>
    </div>
  );
}
