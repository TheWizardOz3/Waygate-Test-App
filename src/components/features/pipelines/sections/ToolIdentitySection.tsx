'use client';

import { useState } from 'react';
import { Pencil, Save, X, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useUpdatePipeline } from '@/hooks/usePipelines';
import type { PipelineDetailResponse } from '@/lib/modules/pipelines/pipeline.schemas';

// =============================================================================
// Types
// =============================================================================

interface ToolIdentitySectionProps {
  pipeline: PipelineDetailResponse;
  onUpdate: () => void;
}

interface InputParameter {
  name: string;
  type: string;
  description: string;
  required: boolean;
}

// =============================================================================
// Helpers
// =============================================================================

function parseInputSchema(schema: Record<string, unknown>): InputParameter[] {
  const properties = (schema.properties ?? {}) as Record<
    string,
    { type?: string; description?: string }
  >;
  const required = (schema.required ?? []) as string[];
  return Object.entries(properties).map(([name, prop]) => ({
    name,
    type: prop.type ?? 'string',
    description: prop.description ?? '',
    required: required.includes(name),
  }));
}

function buildInputSchema(params: InputParameter[]): Record<string, unknown> {
  if (params.length === 0) return {};
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  for (const param of params) {
    properties[param.name] = {
      type: param.type,
      ...(param.description ? { description: param.description } : {}),
    };
    if (param.required) required.push(param.name);
  }
  return {
    type: 'object',
    properties,
    ...(required.length > 0 ? { required } : {}),
  };
}

// =============================================================================
// Component
// =============================================================================

export function ToolIdentitySection({ pipeline, onUpdate }: ToolIdentitySectionProps) {
  const updatePipeline = useUpdatePipeline();

  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(pipeline.name);
  const [description, setDescription] = useState(pipeline.description ?? '');
  const [status, setStatus] = useState(pipeline.status);
  const [inputParams, setInputParams] = useState<InputParameter[]>(
    parseInputSchema(pipeline.inputSchema)
  );
  const [isSaving, setIsSaving] = useState(false);

  const handleCancel = () => {
    setName(pipeline.name);
    setDescription(pipeline.description ?? '');
    setStatus(pipeline.status);
    setInputParams(parseInputSchema(pipeline.inputSchema));
    setIsEditing(false);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await updatePipeline.mutateAsync({
        id: pipeline.id,
        name: name.trim(),
        description: description.trim() || null,
        status,
        inputSchema: buildInputSchema(inputParams.filter((p) => p.name.trim())),
      });
      setIsEditing(false);
      onUpdate();
    } catch (err) {
      console.error('Failed to update pipeline:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const addParam = () => {
    setInputParams([...inputParams, { name: '', type: 'string', description: '', required: true }]);
  };

  const removeParam = (index: number) => {
    setInputParams(inputParams.filter((_, i) => i !== index));
  };

  const updateParam = (index: number, field: keyof InputParameter, value: string | boolean) => {
    setInputParams(inputParams.map((p, i) => (i === index ? { ...p, [field]: value } : p)));
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <div>
          <CardTitle>Tool Identity</CardTitle>
          <CardDescription>Name, description, and input parameters</CardDescription>
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
        <div className="grid gap-4 md:grid-cols-2">
          {/* Name */}
          <div className="space-y-2">
            <Label>Name</Label>
            {isEditing ? (
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            ) : (
              <p className="text-sm">{pipeline.name}</p>
            )}
          </div>

          {/* Slug (read-only) */}
          <div className="space-y-2">
            <Label>Slug</Label>
            <code className="block text-sm text-muted-foreground">{pipeline.slug}</code>
          </div>

          {/* Status */}
          <div className="space-y-2">
            <Label>Status</Label>
            {isEditing ? (
              <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="disabled">Disabled</SelectItem>
                </SelectContent>
              </Select>
            ) : (
              <p className="text-sm capitalize">{pipeline.status}</p>
            )}
          </div>

          {/* Created / Updated */}
          <div className="space-y-2">
            <Label>Created</Label>
            <p className="text-sm text-muted-foreground">
              {new Date(pipeline.createdAt).toLocaleDateString()}
            </p>
          </div>
        </div>

        {/* Description */}
        <div className="space-y-2">
          <Label>Description</Label>
          {isEditing ? (
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does this pipeline do?"
              rows={3}
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              {pipeline.description || 'No description'}
            </p>
          )}
        </div>

        {/* Input Parameters */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>Input Parameters</Label>
            {isEditing && (
              <Button variant="outline" size="sm" onClick={addParam}>
                <Plus className="mr-1 h-3 w-3" />
                Add Parameter
              </Button>
            )}
          </div>

          {isEditing ? (
            inputParams.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No input parameters defined. Click &quot;Add Parameter&quot; to add one.
              </p>
            ) : (
              <div className="space-y-3">
                {inputParams.map((param, index) => (
                  <div key={index} className="flex items-start gap-2 rounded-md border p-3">
                    <div className="grid flex-1 gap-2 md:grid-cols-4">
                      <Input
                        placeholder="Parameter name"
                        value={param.name}
                        onChange={(e) => updateParam(index, 'name', e.target.value)}
                      />
                      <Select
                        value={param.type}
                        onValueChange={(v) => updateParam(index, 'type', v)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="string">String</SelectItem>
                          <SelectItem value="number">Number</SelectItem>
                          <SelectItem value="boolean">Boolean</SelectItem>
                          <SelectItem value="object">Object</SelectItem>
                          <SelectItem value="array">Array</SelectItem>
                        </SelectContent>
                      </Select>
                      <Input
                        placeholder="Description"
                        value={param.description}
                        onChange={(e) => updateParam(index, 'description', e.target.value)}
                        className="md:col-span-2"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1">
                        <Switch
                          checked={param.required}
                          onCheckedChange={(v) => updateParam(index, 'required', v)}
                        />
                        <Label className="text-xs">Req</Label>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive"
                        onClick={() => removeParam(index)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : inputParams.length === 0 ? (
            <p className="text-sm text-muted-foreground">No input parameters defined</p>
          ) : (
            <div className="rounded-md border">
              <div className="grid grid-cols-4 gap-2 border-b px-3 py-2 text-xs font-medium text-muted-foreground">
                <span>Name</span>
                <span>Type</span>
                <span className="col-span-2">Description</span>
              </div>
              {inputParams.map((param, index) => (
                <div
                  key={index}
                  className="grid grid-cols-4 gap-2 border-b px-3 py-2 text-sm last:border-b-0"
                >
                  <code className="text-xs">{param.name}</code>
                  <span className="text-muted-foreground">{param.type}</span>
                  <span className="col-span-2 text-muted-foreground">
                    {param.description || '—'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
