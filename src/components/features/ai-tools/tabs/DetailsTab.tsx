'use client';

import { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useUpdateCompositeTool } from '@/hooks/useCompositeTools';
import { apiClient } from '@/lib/api/client';
import type { CompositeToolDetailResponse } from '@/lib/modules/composite-tools/composite-tool.schemas';
import type { AgenticToolResponse } from '@/lib/modules/agentic-tools/agentic-tool.schemas';

// =============================================================================
// Types
// =============================================================================

interface DetailsTabProps {
  tool: CompositeToolDetailResponse | AgenticToolResponse;
  toolType: 'composite' | 'agentic';
  onUpdate?: () => void;
}

type ToolStatus = 'draft' | 'active' | 'disabled';

// =============================================================================
// Helper Functions
// =============================================================================

function getStatusBadgeVariant(status: ToolStatus) {
  switch (status) {
    case 'active':
      return 'default';
    case 'draft':
      return 'secondary';
    case 'disabled':
      return 'outline';
    default:
      return 'secondary';
  }
}

// =============================================================================
// Component
// =============================================================================

export function DetailsTab({ tool, toolType, onUpdate }: DetailsTabProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(tool.name);
  const [description, setDescription] = useState(tool.description || '');
  const [status, setStatus] = useState<ToolStatus>(tool.status as ToolStatus);
  const [isSaving, setIsSaving] = useState(false);

  const updateCompositeTool = useUpdateCompositeTool();

  // Reset form when tool changes
  useEffect(() => {
    setName(tool.name);
    setDescription(tool.description || '');
    setStatus(tool.status as ToolStatus);
    setIsEditing(false);
  }, [tool]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      if (toolType === 'composite') {
        await updateCompositeTool.mutateAsync({
          id: tool.id,
          name,
          description: description || null,
          status,
        });
      } else {
        await apiClient.patch(`/agentic-tools/${tool.id}`, {
          name,
          description: description || null,
          status,
        });
      }
      setIsEditing(false);
      onUpdate?.();
    } catch (error) {
      console.error('Failed to update tool:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setName(tool.name);
    setDescription(tool.description || '');
    setStatus(tool.status as ToolStatus);
    setIsEditing(false);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Basic Information Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Basic Information</CardTitle>
            {!isEditing && (
              <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
                Edit
              </Button>
            )}
          </div>
          <CardDescription>The name and description shown to users and AI agents</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            {isEditing ? (
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={isSaving}
              />
            ) : (
              <p className="text-sm">{tool.name}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Slug</Label>
            <code className="block rounded bg-muted px-2 py-1 text-sm">{tool.slug}</code>
            <p className="text-xs text-muted-foreground">
              Used in API calls. Cannot be changed after creation.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            {isEditing ? (
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe what this tool does..."
                rows={3}
                disabled={isSaving}
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                {tool.description || 'No description'}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Status</Label>
            {isEditing ? (
              <Select
                value={status}
                onValueChange={(v) => setStatus(v as ToolStatus)}
                disabled={isSaving}
              >
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
              <Badge variant={getStatusBadgeVariant(tool.status as ToolStatus)}>
                {tool.status}
              </Badge>
            )}
          </div>

          {isEditing && (
            <div className="flex gap-2 pt-2">
              <Button onClick={handleSave} disabled={isSaving}>
                {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Changes
              </Button>
              <Button variant="outline" onClick={handleCancel} disabled={isSaving}>
                Cancel
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Metadata Card */}
      <Card>
        <CardHeader>
          <CardTitle>Metadata</CardTitle>
          <CardDescription>System information about this tool</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Tool ID</span>
            <code className="text-xs">{tool.id}</code>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Tool Type</span>
            <Badge variant="outline">{toolType === 'composite' ? 'Composite' : 'Agentic'}</Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Created</span>
            <span className="text-sm">{new Date(tool.createdAt).toLocaleDateString()}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Last Updated</span>
            <span className="text-sm">{new Date(tool.updatedAt).toLocaleDateString()}</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
