'use client';

import { useState, useRef, useCallback, useMemo } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { PipelineStepResponse } from '@/lib/modules/pipelines/pipeline.schemas';

// =============================================================================
// Types
// =============================================================================

interface StepInputMappingProps {
  inputMapping: Record<string, unknown>;
  onChange: (mapping: Record<string, unknown>) => void;
  pipelineInputSchema: Record<string, unknown>;
  previousSteps: PipelineStepResponse[];
}

interface MappingRow {
  key: string;
  value: string;
}

// =============================================================================
// Helpers
// =============================================================================

function toRows(mapping: Record<string, unknown>): MappingRow[] {
  const entries = Object.entries(mapping);
  return entries.length > 0
    ? entries.map(([key, value]) => ({ key, value: String(value ?? '') }))
    : [];
}

function toMapping(rows: MappingRow[]): Record<string, unknown> {
  const mapping: Record<string, unknown> = {};
  for (const row of rows) {
    if (row.key.trim()) {
      mapping[row.key.trim()] = row.value;
    }
  }
  return mapping;
}

function buildSuggestions(
  inputSchema: Record<string, unknown>,
  previousSteps: PipelineStepResponse[]
): string[] {
  const suggestions: string[] = [];

  // Input parameters
  const properties = (inputSchema.properties ?? {}) as Record<string, unknown>;
  for (const key of Object.keys(properties)) {
    suggestions.push(`{{input.${key}}}`);
  }

  // Previous step outputs and reasoning
  for (const step of previousSteps) {
    if (step.toolId) {
      suggestions.push(`{{steps.${step.slug}.output}}`);
    }
    if (step.reasoningEnabled) {
      suggestions.push(`{{steps.${step.slug}.reasoning}}`);
    }
    suggestions.push(`{{steps.${step.slug}.status}}`);
  }

  return suggestions;
}

// =============================================================================
// Component
// =============================================================================

export function StepInputMapping({
  inputMapping,
  onChange,
  pipelineInputSchema,
  previousSteps,
}: StepInputMappingProps) {
  const [rows, setRows] = useState<MappingRow[]>(toRows(inputMapping));
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const suggestions = useMemo(
    () => buildSuggestions(pipelineInputSchema, previousSteps),
    [pipelineInputSchema, previousSteps]
  );

  const updateRows = useCallback(
    (newRows: MappingRow[]) => {
      setRows(newRows);
      onChange(toMapping(newRows));
    },
    [onChange]
  );

  const addRow = () => {
    updateRows([...rows, { key: '', value: '' }]);
  };

  const removeRow = (index: number) => {
    updateRows(rows.filter((_, i) => i !== index));
  };

  const updateRow = (index: number, field: 'key' | 'value', value: string) => {
    const newRows = rows.map((r, i) => (i === index ? { ...r, [field]: value } : r));
    updateRows(newRows);

    // Show suggestions when typing {{ in value field
    if (field === 'value' && value.includes('{{')) {
      setActiveIndex(index);
      setShowSuggestions(true);
    } else if (field === 'value') {
      setShowSuggestions(false);
    }
  };

  const insertSuggestion = (index: number, suggestion: string) => {
    const currentValue = rows[index].value;
    // Replace the last {{ with the suggestion
    const lastBraceIndex = currentValue.lastIndexOf('{{');
    const newValue =
      lastBraceIndex >= 0
        ? currentValue.substring(0, lastBraceIndex) + suggestion
        : currentValue + suggestion;
    const newRows = rows.map((r, i) => (i === index ? { ...r, value: newValue } : r));
    updateRows(newRows);
    setShowSuggestions(false);

    // Focus back on the input
    inputRefs.current[index]?.focus();
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-sm">Input Mapping</Label>
        <Button variant="outline" size="sm" onClick={addRow} className="h-7 text-xs">
          <Plus className="mr-1 h-3 w-3" />
          Add Field
        </Button>
      </div>

      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No input mappings. Click &quot;Add Field&quot; to map data to this step&apos;s tool input.
        </p>
      ) : (
        <div className="space-y-2">
          {rows.map((row, index) => (
            <div key={index} className="flex items-start gap-2">
              <Input
                placeholder="field name"
                value={row.key}
                onChange={(e) => updateRow(index, 'key', e.target.value)}
                className="h-8 flex-1 font-mono text-xs"
              />
              <div className="relative flex-[2]">
                <Input
                  ref={(el) => {
                    inputRefs.current[index] = el;
                  }}
                  placeholder="{{input.task}} or {{steps.search.output}}"
                  value={row.value}
                  onChange={(e) => updateRow(index, 'value', e.target.value)}
                  onFocus={() => {
                    if (row.value.includes('{{')) {
                      setActiveIndex(index);
                      setShowSuggestions(true);
                    }
                  }}
                  onBlur={() => {
                    // Delay to allow click on suggestion
                    setTimeout(() => setShowSuggestions(false), 200);
                  }}
                  className="h-8 font-mono text-xs"
                />
                {showSuggestions && activeIndex === index && suggestions.length > 0 && (
                  <div className="absolute left-0 top-full z-10 mt-1 max-h-[150px] w-full overflow-y-auto rounded-md border bg-popover p-1 shadow-md">
                    {suggestions.map((s) => (
                      <button
                        key={s}
                        className="block w-full rounded-sm px-2 py-1 text-left font-mono text-xs hover:bg-accent"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          insertSuggestion(index, s);
                        }}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 text-destructive"
                onClick={() => removeRow(index)}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
