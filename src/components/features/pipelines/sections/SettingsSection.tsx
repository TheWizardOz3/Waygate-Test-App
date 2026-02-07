'use client';

import { useState } from 'react';
import { Pencil, Save, X, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { useUpdatePipeline } from '@/hooks/usePipelines';
import type { PipelineDetailResponse } from '@/lib/modules/pipelines/pipeline.schemas';

// =============================================================================
// Types
// =============================================================================

interface SettingsSectionProps {
  pipeline: PipelineDetailResponse;
  onUpdate: () => void;
}

interface OutputField {
  name: string;
  source: string;
  description: string;
}

// =============================================================================
// Helpers
// =============================================================================

function parseSafetyLimits(limits: Record<string, unknown>) {
  return {
    maxCostUsd: (limits.maxCostUsd as number) ?? 5,
    maxDurationSeconds: (limits.maxDurationSeconds as number) ?? 1800,
  };
}

function parseReasoningConfig(config: Record<string, unknown>) {
  return {
    provider: ((config.provider as string) ?? 'anthropic') as 'anthropic' | 'google',
    model: (config.model as string) ?? 'claude-sonnet-4.5',
    temperature: (config.temperature as number) ?? 0.2,
    maxTokens: (config.maxTokens as number) ?? 2000,
  };
}

function parseOutputMapping(mapping: Record<string, unknown>): {
  fields: OutputField[];
  includeMeta: boolean;
} {
  const fields = (mapping.fields ?? {}) as Record<
    string,
    { source?: string; description?: string }
  >;
  const includeMeta = (mapping.includeMeta as boolean) ?? false;
  return {
    fields: Object.entries(fields).map(([name, f]) => ({
      name,
      source: f.source ?? '',
      description: f.description ?? '',
    })),
    includeMeta,
  };
}

function buildOutputMapping(
  fields: OutputField[],
  includeMeta: boolean
): { fields: Record<string, { source: string; description?: string }>; includeMeta: boolean } {
  const fieldsObj: Record<string, { source: string; description?: string }> = {};
  for (const f of fields) {
    if (f.name.trim() && f.source.trim()) {
      fieldsObj[f.name.trim()] = {
        source: f.source.trim(),
        ...(f.description.trim() ? { description: f.description.trim() } : {}),
      };
    }
  }
  return { fields: fieldsObj, includeMeta };
}

// =============================================================================
// Component
// =============================================================================

export function SettingsSection({ pipeline, onUpdate }: SettingsSectionProps) {
  const updatePipeline = useUpdatePipeline();
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Safety limits
  const initialLimits = parseSafetyLimits(pipeline.safetyLimits);
  const [maxCostUsd, setMaxCostUsd] = useState(initialLimits.maxCostUsd);
  const [maxDurationSeconds, setMaxDurationSeconds] = useState(initialLimits.maxDurationSeconds);

  // Reasoning config
  const initialReasoning = parseReasoningConfig(pipeline.reasoningConfig);
  const [provider, setProvider] = useState(initialReasoning.provider);
  const [model, setModel] = useState(initialReasoning.model);
  const [temperature, setTemperature] = useState(initialReasoning.temperature);
  const [maxTokens, setMaxTokens] = useState(initialReasoning.maxTokens);

  // Output mapping
  const initialOutput = parseOutputMapping(pipeline.outputMapping);
  const [outputFields, setOutputFields] = useState<OutputField[]>(initialOutput.fields);
  const [includeMeta, setIncludeMeta] = useState(initialOutput.includeMeta);

  const handleCancel = () => {
    const limits = parseSafetyLimits(pipeline.safetyLimits);
    setMaxCostUsd(limits.maxCostUsd);
    setMaxDurationSeconds(limits.maxDurationSeconds);
    const reasoning = parseReasoningConfig(pipeline.reasoningConfig);
    setProvider(reasoning.provider);
    setModel(reasoning.model);
    setTemperature(reasoning.temperature);
    setMaxTokens(reasoning.maxTokens);
    const output = parseOutputMapping(pipeline.outputMapping);
    setOutputFields(output.fields);
    setIncludeMeta(output.includeMeta);
    setIsEditing(false);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await updatePipeline.mutateAsync({
        id: pipeline.id,
        safetyLimits: { maxCostUsd, maxDurationSeconds },
        reasoningConfig: { provider, model, temperature, maxTokens },
        outputMapping: buildOutputMapping(outputFields, includeMeta),
      });
      setIsEditing(false);
      onUpdate();
    } catch (err) {
      console.error('Failed to update settings:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const addOutputField = () => {
    setOutputFields([...outputFields, { name: '', source: '', description: '' }]);
  };

  const removeOutputField = (index: number) => {
    setOutputFields(outputFields.filter((_, i) => i !== index));
  };

  const updateOutputField = (index: number, field: keyof OutputField, value: string) => {
    setOutputFields(outputFields.map((f, i) => (i === index ? { ...f, [field]: value } : f)));
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <div>
          <CardTitle>Settings</CardTitle>
          <CardDescription>Safety limits, default LLM config, and output mapping</CardDescription>
        </div>
        {isEditing ? (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleCancel} disabled={isSaving}>
              <X className="mr-1 h-3 w-3" />
              Cancel
            </Button>
            <Button size="sm" onClick={handleSave} disabled={isSaving}>
              <Save className="mr-1 h-3 w-3" />
              {isSaving ? 'Saving...' : 'Save'}
            </Button>
          </div>
        ) : (
          <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
            <Pencil className="mr-1 h-3 w-3" />
            Edit
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Safety Limits */}
        <div className="space-y-3">
          <Label className="text-sm font-medium">Safety Limits</Label>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label className="text-xs">Max Cost (USD)</Label>
              {isEditing ? (
                <Input
                  type="number"
                  value={maxCostUsd}
                  onChange={(e) => setMaxCostUsd(parseFloat(e.target.value) || 5)}
                  min={0.01}
                  max={100}
                  step={0.01}
                  className="h-8 text-sm"
                />
              ) : (
                <p className="text-sm">${initialLimits.maxCostUsd.toFixed(2)}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label className="text-xs">
                Max Duration{' '}
                {isEditing
                  ? `(${Math.round(maxDurationSeconds / 60)} min)`
                  : `(${Math.round(initialLimits.maxDurationSeconds / 60)} min)`}
              </Label>
              {isEditing ? (
                <Input
                  type="number"
                  value={maxDurationSeconds}
                  onChange={(e) => setMaxDurationSeconds(parseInt(e.target.value) || 1800)}
                  min={30}
                  max={3600}
                  className="h-8 text-sm"
                />
              ) : (
                <p className="text-sm">{initialLimits.maxDurationSeconds}s</p>
              )}
            </div>
          </div>
        </div>

        {/* Default Reasoning Config */}
        <div className="space-y-3">
          <Label className="text-sm font-medium">Default Reasoning Config</Label>
          <p className="text-xs text-muted-foreground">
            Default LLM settings for inter-step reasoning (steps can override)
          </p>
          {isEditing ? (
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1">
                <Label className="text-xs">Provider</Label>
                <Select
                  value={provider}
                  onValueChange={(v) => setProvider(v as 'anthropic' | 'google')}
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
              <div className="space-y-1">
                <Label className="text-xs">Model</Label>
                <Input
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Temperature: {temperature}</Label>
                <Slider
                  value={[temperature]}
                  min={0}
                  max={1}
                  step={0.1}
                  onValueChange={([v]) => setTemperature(v)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Max Tokens</Label>
                <Input
                  type="number"
                  value={maxTokens}
                  onChange={(e) => setMaxTokens(parseInt(e.target.value) || 2000)}
                  min={100}
                  max={8000}
                  className="h-8 text-xs"
                />
              </div>
            </div>
          ) : (
            <div className="grid gap-2 text-sm md:grid-cols-4">
              <div>
                <span className="text-xs text-muted-foreground">Provider:</span>{' '}
                {initialReasoning.provider}
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Model:</span>{' '}
                {initialReasoning.model}
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Temp:</span>{' '}
                {initialReasoning.temperature}
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Max Tokens:</span>{' '}
                {initialReasoning.maxTokens}
              </div>
            </div>
          )}
        </div>

        {/* Output Mapping */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium">Output Mapping</Label>
              <p className="text-xs text-muted-foreground">
                How to build the final pipeline output from step results
              </p>
            </div>
            {isEditing && (
              <Button variant="outline" size="sm" onClick={addOutputField} className="h-7 text-xs">
                <Plus className="mr-1 h-3 w-3" />
                Add Field
              </Button>
            )}
          </div>

          {isEditing ? (
            <>
              <div className="flex items-center gap-2">
                <Switch checked={includeMeta} onCheckedChange={setIncludeMeta} />
                <Label className="text-xs">Include execution metadata in output</Label>
              </div>
              {outputFields.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No output fields defined. The full pipeline state will be returned.
                </p>
              ) : (
                <div className="space-y-2">
                  {outputFields.map((field, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <Input
                        placeholder="field name"
                        value={field.name}
                        onChange={(e) => updateOutputField(index, 'name', e.target.value)}
                        className="h-8 flex-1 font-mono text-xs"
                      />
                      <Input
                        placeholder="{{steps.create.output.created}}"
                        value={field.source}
                        onChange={(e) => updateOutputField(index, 'source', e.target.value)}
                        className="h-8 flex-[2] font-mono text-xs"
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive"
                        onClick={() => removeOutputField(index)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="text-sm">
              {initialOutput.fields.length === 0 ? (
                <p className="text-muted-foreground">
                  No output mapping configured — full state returned
                </p>
              ) : (
                <div className="space-y-1">
                  {initialOutput.fields.map((f, i) => (
                    <div key={i} className="flex gap-2 font-mono text-xs">
                      <span className="text-muted-foreground">{f.name}:</span>
                      <span>{f.source}</span>
                    </div>
                  ))}
                </div>
              )}
              {initialOutput.includeMeta && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Execution metadata included in output
                </p>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
