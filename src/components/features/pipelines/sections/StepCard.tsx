'use client';

import { useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  ArrowUp,
  ArrowDown,
  Trash2,
  Save,
  Brain,
  Zap,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { useUpdateStep } from '@/hooks/usePipelines';
import { StepToolSelector } from './StepToolSelector';
import { StepInputMapping } from './StepInputMapping';
import { StepReasoningConfig } from './StepReasoningConfig';
import type {
  PipelineStepResponse,
  ReasoningConfig,
} from '@/lib/modules/pipelines/pipeline.schemas';

// =============================================================================
// Types
// =============================================================================

interface StepCardProps {
  step: PipelineStepResponse;
  totalSteps: number;
  pipelineId: string;
  pipelineInputSchema: Record<string, unknown>;
  defaultReasoningConfig: Record<string, unknown>;
  previousSteps: PipelineStepResponse[];
  onUpdate: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onDelete: () => void;
}

// =============================================================================
// Component
// =============================================================================

export function StepCard({
  step,
  totalSteps,
  pipelineId,
  pipelineInputSchema,
  defaultReasoningConfig,
  previousSteps,
  onUpdate,
  onMoveUp,
  onMoveDown,
  onDelete,
}: StepCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const updateStep = useUpdateStep();

  // Local edit state
  const [name, setName] = useState(step.name);
  const [slug, setSlug] = useState(step.slug);
  const [toolId, setToolId] = useState(step.toolId);
  const [toolType, setToolType] = useState(step.toolType);
  const [toolSlug, setToolSlug] = useState(step.toolSlug);
  const [inputMapping, setInputMapping] = useState(step.inputMapping);
  const [onError, setOnError] = useState(step.onError);
  const [timeoutSeconds, setTimeoutSeconds] = useState(step.timeoutSeconds);
  const [retryMaxRetries, setRetryMaxRetries] = useState(
    (step.retryConfig as { maxRetries?: number })?.maxRetries ?? 0
  );
  const [retryBackoffMs, setRetryBackoffMs] = useState(
    (step.retryConfig as { backoffMs?: number })?.backoffMs ?? 1000
  );
  const [reasoningEnabled, setReasoningEnabled] = useState(step.reasoningEnabled);
  const [reasoningPrompt, setReasoningPrompt] = useState(step.reasoningPrompt);
  const [reasoningConfig, setReasoningConfig] = useState(step.reasoningConfig);
  const [conditionExpression, setConditionExpression] = useState(
    (step.condition as { expression?: string })?.expression ?? ''
  );
  const [conditionSkipWhen, setConditionSkipWhen] = useState<'truthy' | 'falsy'>(
    (step.condition as { skipWhen?: 'truthy' | 'falsy' })?.skipWhen ?? 'falsy'
  );

  const isReasoningOnly = !toolId && !toolType;

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await updateStep.mutateAsync({
        pipelineId,
        stepId: step.id,
        name: name.trim(),
        slug: slug.trim(),
        toolId: toolId ?? null,
        toolType: toolType ?? null,
        toolSlug: toolSlug ?? null,
        inputMapping,
        onError,
        timeoutSeconds,
        retryConfig: { maxRetries: retryMaxRetries, backoffMs: retryBackoffMs },
        reasoningEnabled,
        reasoningPrompt,
        reasoningConfig: reasoningConfig as ReasoningConfig | null,
        condition: conditionExpression.trim()
          ? {
              type: 'expression' as const,
              expression: conditionExpression.trim(),
              skipWhen: conditionSkipWhen,
            }
          : null,
      });
      onUpdate();
    } catch (err) {
      console.error('Failed to update step:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleToolSelect = (
    tool: { toolId: string; toolType: string; toolSlug: string } | null
  ) => {
    if (tool) {
      setToolId(tool.toolId);
      setToolType(tool.toolType as 'simple' | 'composite' | 'agentic');
      setToolSlug(tool.toolSlug);
    } else {
      setToolId(null);
      setToolType(null);
      setToolSlug(null);
    }
  };

  const handleReasoningOnlyToggle = (enabled: boolean) => {
    if (enabled) {
      setToolId(null);
      setToolType(null);
      setToolSlug(null);
      setReasoningEnabled(true);
    }
  };

  const handleReasoningUpdate = (config: {
    reasoningEnabled: boolean;
    reasoningPrompt: string | null;
    reasoningConfig: Record<string, unknown> | null;
  }) => {
    setReasoningEnabled(config.reasoningEnabled);
    setReasoningPrompt(config.reasoningPrompt);
    setReasoningConfig(config.reasoningConfig);
  };

  return (
    <Card className="overflow-hidden">
      {/* Collapsed Header */}
      <button
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/50"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {/* Step Number */}
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-600/10 text-xs font-bold text-blue-600">
          {step.stepNumber}
        </div>

        {/* Name */}
        <span className="min-w-0 flex-1 truncate font-medium">{step.name}</span>

        {/* Badges */}
        <div className="flex shrink-0 items-center gap-1.5">
          {isReasoningOnly ? (
            <Badge variant="secondary" className="gap-1 text-[10px]">
              <Brain className="h-3 w-3" />
              Reasoning Only
            </Badge>
          ) : (
            <Badge variant="outline" className="gap-1 text-[10px]">
              <Zap className="h-3 w-3" />
              {toolSlug ?? 'No tool'}
            </Badge>
          )}
          {reasoningEnabled && !isReasoningOnly && (
            <Badge variant="secondary" className="text-[10px]">
              <Brain className="mr-0.5 h-3 w-3" />
              Reasoning
            </Badge>
          )}
          <Badge
            variant={onError === 'fail_pipeline' ? 'destructive' : 'outline'}
            className="text-[10px]"
          >
            {onError === 'fail_pipeline'
              ? 'Fail'
              : onError === 'continue'
                ? 'Continue'
                : 'Skip rest'}
          </Badge>
        </div>

        {/* Reorder & Actions */}
        <div className="flex shrink-0 items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            disabled={step.stepNumber === 1}
            onClick={(e) => {
              e.stopPropagation();
              onMoveUp?.();
            }}
          >
            <ArrowUp className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            disabled={step.stepNumber === totalSteps}
            onClick={(e) => {
              e.stopPropagation();
              onMoveDown?.();
            }}
          >
            <ArrowDown className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-destructive"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>

        {isExpanded ? (
          <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
      </button>

      {/* Expanded Content */}
      {isExpanded && (
        <CardContent className="space-y-4 border-t pt-4">
          {/* Step Basics */}
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs">Name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Slug</Label>
              <Input
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                className="h-8 font-mono text-sm"
              />
            </div>
          </div>

          <Separator />

          {/* Tool Configuration */}
          <StepToolSelector
            selectedToolId={toolId}
            selectedToolType={toolType}
            selectedToolSlug={toolSlug}
            isReasoningOnly={isReasoningOnly}
            onToolSelect={handleToolSelect}
            onReasoningOnlyToggle={handleReasoningOnlyToggle}
            excludeIds={[pipelineId]}
          />

          {/* Input Mapping */}
          {!isReasoningOnly && (
            <>
              <Separator />
              <StepInputMapping
                inputMapping={inputMapping}
                onChange={setInputMapping}
                pipelineInputSchema={pipelineInputSchema}
                previousSteps={previousSteps}
              />
            </>
          )}

          <Separator />

          {/* Reasoning Configuration */}
          <StepReasoningConfig
            reasoningEnabled={reasoningEnabled}
            reasoningPrompt={reasoningPrompt}
            reasoningConfig={reasoningConfig}
            defaultReasoningConfig={defaultReasoningConfig}
            onUpdate={handleReasoningUpdate}
          />

          <Separator />

          {/* Error Handling & Execution Config */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Execution Settings</Label>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1">
                <Label className="text-xs">On Error</Label>
                <Select value={onError} onValueChange={(v) => setOnError(v as typeof onError)}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fail_pipeline">Fail Pipeline</SelectItem>
                    <SelectItem value="continue">Continue</SelectItem>
                    <SelectItem value="skip_remaining">Skip Remaining</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Timeout (seconds)</Label>
                <Input
                  type="number"
                  value={timeoutSeconds}
                  onChange={(e) => setTimeoutSeconds(parseInt(e.target.value) || 300)}
                  min={5}
                  max={1800}
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Max Retries</Label>
                <Input
                  type="number"
                  value={retryMaxRetries}
                  onChange={(e) => setRetryMaxRetries(parseInt(e.target.value) || 0)}
                  min={0}
                  max={5}
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Backoff (ms)</Label>
                <Input
                  type="number"
                  value={retryBackoffMs}
                  onChange={(e) => setRetryBackoffMs(parseInt(e.target.value) || 1000)}
                  min={100}
                  max={30000}
                  className="h-8 text-xs"
                />
              </div>
            </div>
          </div>

          {/* Condition */}
          <div className="space-y-2">
            <Label className="text-xs">Skip Condition (optional)</Label>
            <div className="flex items-center gap-2">
              <Input
                placeholder="e.g., {{steps.search.output.results.length}}"
                value={conditionExpression}
                onChange={(e) => setConditionExpression(e.target.value)}
                className="h-8 flex-1 font-mono text-xs"
              />
              <Select
                value={conditionSkipWhen}
                onValueChange={(v) => setConditionSkipWhen(v as 'truthy' | 'falsy')}
              >
                <SelectTrigger className="h-8 w-[120px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="falsy">Skip if falsy</SelectItem>
                  <SelectItem value="truthy">Skip if truthy</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground">
              Skip this step when the expression evaluates to the selected condition
            </p>
          </div>

          {/* Save Button */}
          <div className="flex justify-end pt-2">
            <Button size="sm" onClick={handleSave} disabled={isSaving}>
              {isSaving ? (
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              ) : (
                <Save className="mr-1 h-3 w-3" />
              )}
              {isSaving ? 'Saving...' : 'Save Step'}
            </Button>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
