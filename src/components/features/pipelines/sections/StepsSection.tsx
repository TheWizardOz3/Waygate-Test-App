'use client';

import { useState, useMemo } from 'react';
import { Plus, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAddStep, useDeleteStep, useReorderSteps } from '@/hooks/usePipelines';
import { StepCard } from './StepCard';
import type { PipelineDetailResponse } from '@/lib/modules/pipelines/pipeline.schemas';

// =============================================================================
// Types
// =============================================================================

interface StepsSectionProps {
  pipeline: PipelineDetailResponse;
  onUpdate: () => void;
}

// =============================================================================
// Helpers
// =============================================================================

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

// =============================================================================
// Component
// =============================================================================

export function StepsSection({ pipeline, onUpdate }: StepsSectionProps) {
  const addStep = useAddStep();
  const deleteStep = useDeleteStep();
  const reorderSteps = useReorderSteps();
  const [isAdding, setIsAdding] = useState(false);

  const sortedSteps = useMemo(
    () => [...pipeline.steps].sort((a, b) => a.stepNumber - b.stepNumber),
    [pipeline.steps]
  );

  const handleAddStep = async () => {
    setIsAdding(true);
    const stepNumber = sortedSteps.length + 1;
    const defaultName = `Step ${stepNumber}`;
    try {
      await addStep.mutateAsync({
        pipelineId: pipeline.id,
        stepNumber,
        name: defaultName,
        slug: generateSlug(defaultName),
        reasoningEnabled: false,
        onError: 'fail_pipeline',
        timeoutSeconds: 300,
        inputMapping: {},
        metadata: {},
      });
      onUpdate();
    } catch (err) {
      console.error('Failed to add step:', err);
    } finally {
      setIsAdding(false);
    }
  };

  const handleDeleteStep = async (stepId: string) => {
    if (!confirm('Are you sure you want to delete this step?')) return;
    try {
      await deleteStep.mutateAsync({ pipelineId: pipeline.id, stepId });
      onUpdate();
    } catch (err) {
      console.error('Failed to delete step:', err);
    }
  };

  const handleMoveStep = async (stepIndex: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? stepIndex - 1 : stepIndex + 1;
    if (targetIndex < 0 || targetIndex >= sortedSteps.length) return;

    // Build new order by swapping
    const newOrder = [...sortedSteps];
    [newOrder[stepIndex], newOrder[targetIndex]] = [newOrder[targetIndex], newOrder[stepIndex]];

    try {
      await reorderSteps.mutateAsync({
        pipelineId: pipeline.id,
        steps: newOrder.map((s, i) => ({ id: s.id, stepNumber: i + 1 })),
      });
      onUpdate();
    } catch (err) {
      console.error('Failed to reorder steps:', err);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <div>
          <CardTitle>Steps</CardTitle>
          <CardDescription>
            {sortedSteps.length} step{sortedSteps.length !== 1 ? 's' : ''} — executed sequentially
          </CardDescription>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleAddStep}
          disabled={isAdding || sortedSteps.length >= 20}
        >
          {isAdding ? (
            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
          ) : (
            <Plus className="mr-1 h-3 w-3" />
          )}
          Add Step
        </Button>
      </CardHeader>
      <CardContent className="space-y-2">
        {sortedSteps.length === 0 ? (
          <div className="rounded-md border border-dashed p-6 text-center">
            <p className="text-sm text-muted-foreground">
              No steps yet. Click &quot;Add Step&quot; to start building your pipeline.
            </p>
          </div>
        ) : (
          sortedSteps.map((step, index) => (
            <StepCard
              key={step.id}
              step={step}
              totalSteps={sortedSteps.length}
              pipelineId={pipeline.id}
              pipelineInputSchema={pipeline.inputSchema}
              defaultReasoningConfig={pipeline.reasoningConfig}
              previousSteps={sortedSteps.slice(0, index)}
              onUpdate={onUpdate}
              onMoveUp={index > 0 ? () => handleMoveStep(index, 'up') : undefined}
              onMoveDown={
                index < sortedSteps.length - 1 ? () => handleMoveStep(index, 'down') : undefined
              }
              onDelete={() => handleDeleteStep(step.id)}
            />
          ))
        )}
      </CardContent>
    </Card>
  );
}
