'use client';

import { useState, useMemo } from 'react';
import { Search, Zap, GitBranch, Bot, X, Workflow } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useUnifiedTools } from '@/hooks/useUnifiedTools';
import { cn } from '@/lib/utils';
import type { ToolType } from '@/lib/modules/tools/unified-tool.schemas';

// =============================================================================
// Types
// =============================================================================

interface StepToolSelectorProps {
  selectedToolId: string | null;
  selectedToolType: string | null;
  selectedToolSlug: string | null;
  isReasoningOnly: boolean;
  onToolSelect: (tool: { toolId: string; toolType: string; toolSlug: string } | null) => void;
  onReasoningOnlyToggle: (enabled: boolean) => void;
  excludeIds?: string[];
}

// =============================================================================
// Helpers
// =============================================================================

function getToolIcon(type: ToolType) {
  switch (type) {
    case 'simple':
      return Zap;
    case 'composite':
      return GitBranch;
    case 'agentic':
      return Bot;
    case 'pipeline':
      return Workflow;
    default:
      return Zap;
  }
}

function getToolIconColor(type: ToolType) {
  switch (type) {
    case 'simple':
      return 'text-emerald-600';
    case 'composite':
      return 'text-violet-600';
    case 'agentic':
      return 'text-amber-600';
    case 'pipeline':
      return 'text-blue-600';
    default:
      return 'text-muted-foreground';
  }
}

// =============================================================================
// Component
// =============================================================================

export function StepToolSelector({
  selectedToolId,
  selectedToolType,
  selectedToolSlug,
  isReasoningOnly,
  onToolSelect,
  onReasoningOnlyToggle,
  excludeIds = [],
}: StepToolSelectorProps) {
  const [search, setSearch] = useState('');

  const { data } = useUnifiedTools({
    search: search || undefined,
    types: ['simple', 'composite', 'agentic'] as ToolType[],
    status: ['active', 'draft'],
    excludeIds: excludeIds.length > 0 ? excludeIds : undefined,
  });

  const tools = useMemo(() => data?.tools ?? [], [data?.tools]);

  const selectedTool = useMemo(
    () => tools.find((t) => t.id === selectedToolId),
    [tools, selectedToolId]
  );

  const handleToggleReasoningOnly = (enabled: boolean) => {
    onReasoningOnlyToggle(enabled);
    if (enabled) {
      onToolSelect(null);
    }
  };

  return (
    <div className="space-y-3">
      {/* Reasoning-Only Toggle */}
      <div className="flex items-center justify-between rounded-md border p-3">
        <div>
          <Label className="text-sm font-medium">Reasoning Only</Label>
          <p className="text-xs text-muted-foreground">
            No tool invocation — LLM produces structured JSON from pipeline state
          </p>
        </div>
        <Switch checked={isReasoningOnly} onCheckedChange={handleToggleReasoningOnly} />
      </div>

      {/* Tool Selection */}
      {!isReasoningOnly && (
        <div className="space-y-2">
          <Label className="text-sm">Select Tool</Label>

          {/* Selected Tool Display */}
          {selectedToolId && selectedToolSlug && (
            <div className="flex items-center justify-between rounded-md border bg-muted/50 p-2">
              <div className="flex items-center gap-2">
                {selectedToolType &&
                  (() => {
                    const Icon = getToolIcon(selectedToolType as ToolType);
                    return (
                      <Icon
                        className={cn('h-4 w-4', getToolIconColor(selectedToolType as ToolType))}
                      />
                    );
                  })()}
                <span className="text-sm font-medium">
                  {selectedTool?.name ?? selectedToolSlug}
                </span>
                <Badge variant="outline" className="text-xs">
                  {selectedToolType}
                </Badge>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => onToolSelect(null)}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          )}

          {/* Search & List */}
          {!selectedToolId && (
            <>
              <div className="relative">
                <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search tools..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-8 pl-7 text-sm"
                />
              </div>
              <ScrollArea className="h-[200px] rounded-md border">
                <div className="p-1">
                  {tools.length === 0 ? (
                    <p className="p-4 text-center text-xs text-muted-foreground">No tools found</p>
                  ) : (
                    tools.map((tool) => {
                      const Icon = getToolIcon(tool.type);
                      return (
                        <button
                          key={tool.id}
                          className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent"
                          onClick={() =>
                            onToolSelect({
                              toolId: tool.id,
                              toolType: tool.type,
                              toolSlug: tool.slug,
                            })
                          }
                        >
                          <Icon
                            className={cn('h-3.5 w-3.5 shrink-0', getToolIconColor(tool.type))}
                          />
                          <span className="min-w-0 flex-1 truncate">{tool.name}</span>
                          <Badge variant="outline" className="shrink-0 text-[10px]">
                            {tool.type}
                          </Badge>
                        </button>
                      );
                    })
                  )}
                </div>
              </ScrollArea>
            </>
          )}
        </div>
      )}
    </div>
  );
}
