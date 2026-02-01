'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { useAgenticToolWizardStore } from '@/stores/agenticToolWizard.store';
import type { LLMProvider, ReasoningLevel } from '@/lib/modules/agentic-tools/agentic-tool.schemas';

const LLM_MODELS = [
  {
    provider: 'anthropic' as LLMProvider,
    model: 'claude-opus-4.5',
    name: 'Claude Opus 4.5',
    description: 'Most capable model. Best for complex reasoning and autonomous agents.',
    supportsReasoning: true,
  },
  {
    provider: 'anthropic' as LLMProvider,
    model: 'claude-sonnet-4.5',
    name: 'Claude Sonnet 4.5',
    description: 'Balanced performance and cost. Recommended for parameter interpretation.',
    supportsReasoning: true,
  },
  {
    provider: 'google' as LLMProvider,
    model: 'gemini-3',
    name: 'Gemini 3',
    description: "Google's flagship model with strong reasoning capabilities.",
    supportsReasoning: false,
  },
] as const;

const REASONING_LEVELS: { value: ReasoningLevel; label: string; description: string }[] = [
  { value: 'none', label: 'None', description: 'No extended reasoning (fastest, cheapest)' },
  { value: 'low', label: 'Low', description: 'Basic reasoning for simple tasks' },
  { value: 'medium', label: 'Medium', description: 'Moderate reasoning for standard tasks' },
  {
    value: 'high',
    label: 'High',
    description: 'Deep reasoning for complex tasks (slower, costlier)',
  },
];

export function StepLLMConfig() {
  const { data, setLLMConfig, canProceed, getNextStep, goToStep } = useAgenticToolWizardStore();

  const [provider, setProvider] = useState<LLMProvider>(data.embeddedLLMConfig.provider);
  const [model, setModel] = useState(data.embeddedLLMConfig.model);
  const [reasoningLevel, setReasoningLevel] = useState<ReasoningLevel>(
    data.embeddedLLMConfig.reasoningLevel || 'none'
  );
  const [temperature, setTemperature] = useState(data.embeddedLLMConfig.temperature);
  const [maxTokens, setMaxTokens] = useState(data.embeddedLLMConfig.maxTokens);

  const selectedModel = LLM_MODELS.find((m) => m.model === model);

  useEffect(() => {
    setLLMConfig({ provider, model, reasoningLevel, temperature, maxTokens });
  }, [provider, model, reasoningLevel, temperature, maxTokens, setLLMConfig]);

  const handleModelChange = (newModel: string) => {
    const modelInfo = LLM_MODELS.find((m) => m.model === newModel);
    if (modelInfo) {
      setModel(newModel);
      setProvider(modelInfo.provider);
      // Reset reasoning level if model doesn't support it
      if (!modelInfo.supportsReasoning) {
        setReasoningLevel('none');
      }
    }
  };

  const handleNext = () => {
    const nextStep = getNextStep();
    if (nextStep && canProceed()) {
      goToStep(nextStep);
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-6">
        {/* Model Selection */}
        <div className="space-y-2">
          <Label htmlFor="model">Language Model *</Label>
          <Select value={model} onValueChange={handleModelChange}>
            <SelectTrigger id="model">
              <SelectValue placeholder="Select a model" />
            </SelectTrigger>
            <SelectContent>
              {LLM_MODELS.map((m) => (
                <SelectItem key={m.model} value={m.model}>
                  <div>
                    <div className="font-medium">{m.name}</div>
                    <div className="text-xs text-muted-foreground">{m.description}</div>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedModel && (
            <p className="text-sm text-muted-foreground">{selectedModel.description}</p>
          )}
        </div>

        {/* Reasoning Level */}
        {selectedModel?.supportsReasoning && (
          <div className="space-y-2">
            <Label htmlFor="reasoning">Reasoning Level</Label>
            <Select
              value={reasoningLevel}
              onValueChange={(value) => setReasoningLevel(value as ReasoningLevel)}
            >
              <SelectTrigger id="reasoning">
                <SelectValue placeholder="Select reasoning level" />
              </SelectTrigger>
              <SelectContent>
                {REASONING_LEVELS.map((level) => (
                  <SelectItem key={level.value} value={level.value}>
                    <div>
                      <div className="font-medium">{level.label}</div>
                      <div className="text-xs text-muted-foreground">{level.description}</div>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Temperature */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="temperature">Temperature</Label>
            <span className="text-sm font-medium text-muted-foreground">
              {temperature.toFixed(1)}
            </span>
          </div>
          <Slider
            id="temperature"
            min={0}
            max={1}
            step={0.1}
            value={[temperature]}
            onValueChange={([value]) => setTemperature(value)}
            className="py-4"
          />
          <p className="text-sm text-muted-foreground">
            Lower = more consistent and deterministic. Higher = more creative and varied.
            Recommended: 0.1-0.2 for parameter interpretation, 0.3-0.5 for autonomous agents.
          </p>
        </div>

        {/* Max Tokens */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="maxTokens">Max Tokens</Label>
            <span className="text-sm font-medium text-muted-foreground">{maxTokens}</span>
          </div>
          <Input
            id="maxTokens"
            type="number"
            min={1000}
            max={8000}
            step={100}
            value={maxTokens}
            onChange={(e) => setMaxTokens(parseInt(e.target.value))}
          />
          <p className="text-sm text-muted-foreground">
            Maximum output length (1000-8000). Higher values allow longer responses but increase
            cost.
          </p>
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
