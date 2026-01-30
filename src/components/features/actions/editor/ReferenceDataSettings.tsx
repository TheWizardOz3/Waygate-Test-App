'use client';

import { UseFormReturn, FieldValues } from 'react-hook-form';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Database, Info, Plus, X } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { useState } from 'react';

interface ReferenceDataSettingsProps {
  form: UseFormReturn<FieldValues>;
}

export function ReferenceDataSettings({ form }: ReferenceDataSettingsProps) {
  const referenceData = form.watch('metadata.referenceData');
  const enabled = referenceData?.syncable ?? false;
  const [newMetadataField, setNewMetadataField] = useState('');

  const updateReferenceData = (updates: Record<string, unknown>) => {
    const current = form.getValues('metadata.referenceData') || {};
    const metadata = form.getValues('metadata') || {};
    form.setValue('metadata', {
      ...metadata,
      referenceData: {
        dataType: '',
        syncable: false,
        extractionPath: '',
        idField: 'id',
        nameField: 'name',
        metadataFields: [],
        defaultTtlSeconds: 3600,
        ...current,
        ...updates,
      },
    });
  };

  const toggleEnabled = (checked: boolean) => {
    if (checked) {
      updateReferenceData({ syncable: true });
    } else {
      // Clear reference data config when disabled
      const metadata = form.getValues('metadata') || {};
      form.setValue('metadata', {
        ...metadata,
        referenceData: undefined,
      });
    }
  };

  const metadataFields = referenceData?.metadataFields ?? [];

  const addMetadataField = () => {
    if (newMetadataField.trim() && !metadataFields.includes(newMetadataField.trim())) {
      updateReferenceData({
        metadataFields: [...metadataFields, newMetadataField.trim()],
      });
      setNewMetadataField('');
    }
  };

  const removeMetadataField = (field: string) => {
    updateReferenceData({
      metadataFields: metadataFields.filter((f: string) => f !== field),
    });
  };

  return (
    <div className="space-y-4 rounded-lg border bg-card p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-500/10">
            <Database className="h-4 w-4 text-violet-600" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <p className="font-medium">Reference Data Sync</p>
              <Badge variant="outline" className="text-xs">
                AI Context
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Cache response data for AI tool context (users, channels, etc.)
            </p>
          </div>
        </div>
        <Switch checked={enabled} onCheckedChange={toggleEnabled} />
      </div>

      {enabled && (
        <div className="space-y-4 pt-2">
          <div className="grid grid-cols-2 gap-4">
            {/* Data Type */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <Label className="text-sm">Data Type</Label>
                <Tooltip>
                  <TooltipTrigger>
                    <Info className="h-3.5 w-3.5 text-muted-foreground" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    Category of data (e.g., &quot;users&quot;, &quot;channels&quot;,
                    &quot;repos&quot;). Used to group cached items.
                  </TooltipContent>
                </Tooltip>
              </div>
              <Input
                placeholder="users, channels, etc."
                value={referenceData?.dataType ?? ''}
                onChange={(e) => updateReferenceData({ dataType: e.target.value })}
              />
            </div>

            {/* Extraction Path */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <Label className="text-sm">Extraction Path</Label>
                <Tooltip>
                  <TooltipTrigger>
                    <Info className="h-3.5 w-3.5 text-muted-foreground" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    JSONPath to extract array of items from response (e.g., $.members[*],
                    $.channels[*])
                  </TooltipContent>
                </Tooltip>
              </div>
              <Input
                placeholder="$.members[*]"
                value={referenceData?.extractionPath ?? ''}
                onChange={(e) => updateReferenceData({ extractionPath: e.target.value })}
                className="font-mono text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            {/* ID Field */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <Label className="text-sm">ID Field</Label>
                <Tooltip>
                  <TooltipTrigger>
                    <Info className="h-3.5 w-3.5 text-muted-foreground" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    Field name for the unique identifier in each item
                  </TooltipContent>
                </Tooltip>
              </div>
              <Input
                placeholder="id"
                value={referenceData?.idField ?? ''}
                onChange={(e) => updateReferenceData({ idField: e.target.value })}
                className="font-mono text-sm"
              />
            </div>

            {/* Name Field */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <Label className="text-sm">Name Field</Label>
                <Tooltip>
                  <TooltipTrigger>
                    <Info className="h-3.5 w-3.5 text-muted-foreground" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    Field name for the display name in each item
                  </TooltipContent>
                </Tooltip>
              </div>
              <Input
                placeholder="name"
                value={referenceData?.nameField ?? ''}
                onChange={(e) => updateReferenceData({ nameField: e.target.value })}
                className="font-mono text-sm"
              />
            </div>

            {/* TTL */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <Label className="text-sm">Sync Interval</Label>
                <Tooltip>
                  <TooltipTrigger>
                    <Info className="h-3.5 w-3.5 text-muted-foreground" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    How often to re-sync this data (in seconds). Default: 3600 (1 hour)
                  </TooltipContent>
                </Tooltip>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={60}
                  max={86400}
                  placeholder="3600"
                  value={referenceData?.defaultTtlSeconds ?? 3600}
                  onChange={(e) =>
                    updateReferenceData({ defaultTtlSeconds: parseInt(e.target.value, 10) || 3600 })
                  }
                  className="w-24"
                />
                <span className="text-xs text-muted-foreground">seconds</span>
              </div>
            </div>
          </div>

          {/* Metadata Fields */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label className="text-sm">Additional Fields</Label>
              <Tooltip>
                <TooltipTrigger>
                  <Info className="h-3.5 w-3.5 text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  Extra fields to capture from each item (e.g., email, is_admin, profile)
                </TooltipContent>
              </Tooltip>
            </div>

            <div className="flex flex-wrap gap-2">
              {metadataFields.map((field: string) => (
                <Badge key={field} variant="secondary" className="gap-1 font-mono text-xs">
                  {field}
                  <button
                    type="button"
                    onClick={() => removeMetadataField(field)}
                    className="ml-1 rounded-full hover:bg-destructive/20"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
              <div className="flex items-center gap-1">
                <Input
                  placeholder="field_name"
                  value={newMetadataField}
                  onChange={(e) => setNewMetadataField(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addMetadataField();
                    }
                  }}
                  className="h-6 w-24 font-mono text-xs"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={addMetadataField}
                  className="h-6 w-6 p-0"
                >
                  <Plus className="h-3 w-3" />
                </Button>
              </div>
            </div>
          </div>

          {/* Info box */}
          <div className="rounded-lg border bg-muted/30 p-3">
            <p className="text-xs text-muted-foreground">
              <strong>How it works:</strong> When reference data sync is enabled, Waygate will
              periodically call this action and cache the extracted items. AI tools can then use
              this cached data to resolve names to IDs (e.g., &quot;@john&quot; → &quot;U123&quot;).
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
