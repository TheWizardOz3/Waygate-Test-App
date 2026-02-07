'use client';

import { useState } from 'react';
import { Pencil, Save, X, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useUpdatePipeline } from '@/hooks/usePipelines';
import type { PipelineDetailResponse } from '@/lib/modules/pipelines/pipeline.schemas';

// =============================================================================
// Types
// =============================================================================

interface AIDescriptionSectionProps {
  pipeline: PipelineDetailResponse;
  onUpdate: () => void;
}

// =============================================================================
// Component
// =============================================================================

export function AIDescriptionSection({ pipeline, onUpdate }: AIDescriptionSectionProps) {
  const updatePipeline = useUpdatePipeline();
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);

  const [toolDescription, setToolDescription] = useState(pipeline.toolDescription ?? '');
  const [toolSuccessTemplate, setToolSuccessTemplate] = useState(
    pipeline.toolSuccessTemplate ?? ''
  );
  const [toolErrorTemplate, setToolErrorTemplate] = useState(pipeline.toolErrorTemplate ?? '');

  const handleCancel = () => {
    setToolDescription(pipeline.toolDescription ?? '');
    setToolSuccessTemplate(pipeline.toolSuccessTemplate ?? '');
    setToolErrorTemplate(pipeline.toolErrorTemplate ?? '');
    setIsEditing(false);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await updatePipeline.mutateAsync({
        id: pipeline.id,
        toolDescription: toolDescription.trim() || null,
        toolSuccessTemplate: toolSuccessTemplate.trim() || null,
        toolErrorTemplate: toolErrorTemplate.trim() || null,
      });
      setIsEditing(false);
      onUpdate();
    } catch (err) {
      console.error('Failed to update description:', err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <div>
          <CardTitle>AI Description</CardTitle>
          <CardDescription>Tool description and response templates for export</CardDescription>
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
      <CardContent className="space-y-4">
        {/* Tool Description */}
        <div className="space-y-2">
          <Label className="text-sm">Tool Description</Label>
          <p className="text-xs text-muted-foreground">
            LLM-optimized description used when exporting as a tool
          </p>
          {isEditing ? (
            <Textarea
              value={toolDescription}
              onChange={(e) => setToolDescription(e.target.value)}
              placeholder="Use this tool to..."
              rows={6}
              className="font-mono text-xs"
            />
          ) : (
            <div className="rounded-md border bg-muted/50 p-3">
              <pre className="whitespace-pre-wrap text-xs">
                {pipeline.toolDescription || 'No description set'}
              </pre>
            </div>
          )}
        </div>

        {/* Response Templates (collapsible) */}
        <div className="space-y-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 px-2 text-xs"
            onClick={() => setShowTemplates(!showTemplates)}
          >
            {showTemplates ? (
              <ChevronUp className="h-3 w-3" />
            ) : (
              <ChevronDown className="h-3 w-3" />
            )}
            Response Templates
          </Button>

          {showTemplates && (
            <div className="space-y-4 pl-2">
              {/* Success Template */}
              <div className="space-y-2">
                <Label className="text-xs">Success Response Template</Label>
                {isEditing ? (
                  <Textarea
                    value={toolSuccessTemplate}
                    onChange={(e) => setToolSuccessTemplate(e.target.value)}
                    placeholder="Template for successful pipeline execution responses..."
                    rows={4}
                    className="font-mono text-xs"
                  />
                ) : (
                  <div className="rounded-md border bg-muted/50 p-3">
                    <pre className="whitespace-pre-wrap text-xs">
                      {pipeline.toolSuccessTemplate || 'Using default template'}
                    </pre>
                  </div>
                )}
              </div>

              {/* Error Template */}
              <div className="space-y-2">
                <Label className="text-xs">Error Response Template</Label>
                {isEditing ? (
                  <Textarea
                    value={toolErrorTemplate}
                    onChange={(e) => setToolErrorTemplate(e.target.value)}
                    placeholder="Template for failed pipeline execution responses..."
                    rows={4}
                    className="font-mono text-xs"
                  />
                ) : (
                  <div className="rounded-md border bg-muted/50 p-3">
                    <pre className="whitespace-pre-wrap text-xs">
                      {pipeline.toolErrorTemplate || 'Using default template'}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
