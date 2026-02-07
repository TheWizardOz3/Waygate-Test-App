'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';

// =============================================================================
// Types
// =============================================================================

interface ReasoningConfigData {
  provider?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

interface StepReasoningConfigProps {
  reasoningEnabled: boolean;
  reasoningPrompt: string | null;
  reasoningConfig: Record<string, unknown> | null;
  defaultReasoningConfig: Record<string, unknown>;
  onUpdate: (config: {
    reasoningEnabled: boolean;
    reasoningPrompt: string | null;
    reasoningConfig: Record<string, unknown> | null;
  }) => void;
}

// =============================================================================
// Helpers
// =============================================================================

function parseConfig(config: Record<string, unknown> | null): ReasoningConfigData {
  if (!config) return {};
  return {
    provider: config.provider as string | undefined,
    model: config.model as string | undefined,
    temperature: config.temperature as number | undefined,
    maxTokens: config.maxTokens as number | undefined,
  };
}

// =============================================================================
// Component
// =============================================================================

export function StepReasoningConfig({
  reasoningEnabled,
  reasoningPrompt,
  reasoningConfig,
  defaultReasoningConfig,
  onUpdate,
}: StepReasoningConfigProps) {
  const [showLLMOverride, setShowLLMOverride] = useState(!!reasoningConfig);
  const parsed = parseConfig(reasoningConfig);
  const defaultParsed = parseConfig(defaultReasoningConfig);

  const handleToggleReasoning = (enabled: boolean) => {
    onUpdate({
      reasoningEnabled: enabled,
      reasoningPrompt: enabled ? reasoningPrompt : null,
      reasoningConfig: enabled ? reasoningConfig : null,
    });
  };

  const handlePromptChange = (prompt: string) => {
    onUpdate({
      reasoningEnabled,
      reasoningPrompt: prompt || null,
      reasoningConfig,
    });
  };

  const handleConfigChange = (field: string, value: unknown) => {
    const newConfig = { ...(reasoningConfig ?? {}), [field]: value };
    onUpdate({
      reasoningEnabled,
      reasoningPrompt,
      reasoningConfig: newConfig,
    });
  };

  const handleToggleLLMOverride = (enabled: boolean) => {
    setShowLLMOverride(enabled);
    if (!enabled) {
      onUpdate({
        reasoningEnabled,
        reasoningPrompt,
        reasoningConfig: null,
      });
    }
  };

  return (
    <div className="space-y-3">
      {/* Enable/Disable Toggle */}
      <div className="flex items-center justify-between">
        <div>
          <Label className="text-sm font-medium">Inter-Step Reasoning</Label>
          <p className="text-xs text-muted-foreground">
            Run LLM after this step to interpret output
          </p>
        </div>
        <Switch checked={reasoningEnabled} onCheckedChange={handleToggleReasoning} />
      </div>

      {reasoningEnabled && (
        <>
          {/* Reasoning Prompt */}
          <div className="space-y-2">
            <Label className="text-sm">Reasoning Prompt</Label>
            <Textarea
              value={reasoningPrompt ?? ''}
              onChange={(e) => handlePromptChange(e.target.value)}
              placeholder="Analyze the step output and produce structured JSON. Your output will be used by the next step in the pipeline."
              rows={4}
              className="font-mono text-xs"
            />
            <p className="text-xs text-muted-foreground">
              Available variables: {'{{step_output}}'}, {'{{pipeline_state_summary}}'},{' '}
              {'{{reasoning_instructions}}'}
            </p>
          </div>

          {/* LLM Override Toggle */}
          <div className="space-y-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 px-2 text-xs"
              onClick={() => handleToggleLLMOverride(!showLLMOverride)}
            >
              {showLLMOverride ? (
                <ChevronUp className="h-3 w-3" />
              ) : (
                <ChevronDown className="h-3 w-3" />
              )}
              {showLLMOverride
                ? 'Hide LLM Override'
                : `Using pipeline default (${defaultParsed.model ?? 'not set'})`}
            </Button>

            {showLLMOverride && (
              <div className="grid gap-3 rounded-md border p-3 md:grid-cols-2">
                {/* Provider */}
                <div className="space-y-1">
                  <Label className="text-xs">Provider</Label>
                  <Select
                    value={parsed.provider ?? defaultParsed.provider ?? 'anthropic'}
                    onValueChange={(v) => handleConfigChange('provider', v)}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="anthropic">Anthropic</SelectItem>
                      <SelectItem value="google">Google</SelectItem>
                      <SelectItem value="openai">OpenAI</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Model */}
                <div className="space-y-1">
                  <Label className="text-xs">Model</Label>
                  <Input
                    value={parsed.model ?? defaultParsed.model ?? ''}
                    onChange={(e) => handleConfigChange('model', e.target.value)}
                    placeholder="claude-sonnet-4.5"
                    className="h-8 text-xs"
                  />
                </div>

                {/* Temperature */}
                <div className="space-y-1">
                  <Label className="text-xs">
                    Temperature: {parsed.temperature ?? defaultParsed.temperature ?? 0.2}
                  </Label>
                  <Slider
                    value={[parsed.temperature ?? defaultParsed.temperature ?? 0.2]}
                    min={0}
                    max={1}
                    step={0.1}
                    onValueChange={([v]) => handleConfigChange('temperature', v)}
                  />
                </div>

                {/* Max Tokens */}
                <div className="space-y-1">
                  <Label className="text-xs">Max Tokens</Label>
                  <Input
                    type="number"
                    value={parsed.maxTokens ?? defaultParsed.maxTokens ?? 2000}
                    onChange={(e) =>
                      handleConfigChange('maxTokens', parseInt(e.target.value) || 2000)
                    }
                    min={100}
                    max={8000}
                    className="h-8 text-xs"
                  />
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
