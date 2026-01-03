'use client';

import { useState, useMemo } from 'react';
import {
  ArrowRight,
  Search,
  Star,
  Sparkles,
  CheckSquare,
  Square,
  LayoutTemplate,
  Plus,
  Info,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useWizardStore, type SelectedAction } from '@/stores/wizard.store';
import { cn } from '@/lib/utils';
import { generateFromTemplate, getTemplateById } from '@/lib/modules/ai/templates';

// Method badge colors
const METHOD_COLORS: Record<string, string> = {
  GET: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
  POST: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  PUT: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
  PATCH: 'bg-orange-500/10 text-orange-600 border-orange-500/20',
  DELETE: 'bg-red-500/10 text-red-600 border-red-500/20',
};

interface ActionReviewCardProps {
  action: SelectedAction;
  onToggle: () => void;
  isTemplateAction?: boolean;
}

function ActionReviewCard({ action, onToggle, isTemplateAction }: ActionReviewCardProps) {
  // Confidence rating (1-3 stars)
  const confidenceStars = Math.ceil(action.confidence * 3);
  const confidenceLabel = confidenceStars >= 3 ? 'High' : confidenceStars >= 2 ? 'Medium' : 'Low';

  return (
    <div
      className={cn(
        'flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50',
        action.selected ? 'border-secondary/50 bg-secondary/5' : 'border-border/50 bg-background',
        isTemplateAction && 'border-l-4 border-l-violet-500'
      )}
      onClick={onToggle}
    >
      <Checkbox
        checked={action.selected}
        className="mt-1"
        onCheckedChange={() => onToggle()}
        onClick={(e) => e.stopPropagation()}
      />

      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate font-mono text-sm font-medium">{action.name}</span>
          <Badge
            variant="outline"
            className={cn('font-mono text-xs uppercase', METHOD_COLORS[action.method])}
          >
            {action.method}
          </Badge>
          {isTemplateAction && (
            <Badge
              variant="outline"
              className="border-violet-300 bg-violet-50 text-xs text-violet-700"
            >
              Template
            </Badge>
          )}
        </div>

        <p className="truncate font-mono text-xs text-muted-foreground">{action.path}</p>

        {action.description && (
          <p className="line-clamp-1 text-sm text-muted-foreground">{action.description}</p>
        )}
      </div>

      {/* Confidence indicator */}
      <div className="flex shrink-0 items-center gap-1" title={`${confidenceLabel} confidence`}>
        {Array.from({ length: 3 }).map((_, i) => (
          <Star
            key={i}
            className={cn(
              'h-3 w-3',
              i < confidenceStars ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/30'
            )}
          />
        ))}
      </div>
    </div>
  );
}

export function StepReviewActions() {
  const [searchQuery, setSearchQuery] = useState('');
  const [templateActionsAdded, setTemplateActionsAdded] = useState(false);

  const {
    data,
    toggleActionSelection,
    selectAllActions,
    deselectAllActions,
    setDetectedActions,
    goToStep,
  } = useWizardStore();

  // Check for auto-detected template
  const detectedTemplate = data.detectedTemplate;
  const template = detectedTemplate ? getTemplateById(detectedTemplate.templateId) : null;

  // Handler to add template actions
  const handleAddTemplateActions = () => {
    if (!template || !data.detectedBaseUrl) return;

    const result = generateFromTemplate({
      templateId: template.id,
      baseUrl: data.detectedBaseUrl,
    });

    if (result.success) {
      // Merge template actions with existing, avoiding duplicates
      const existingPaths = new Set(data.detectedActions.map((a) => `${a.method}:${a.path}`));
      const newTemplateActions = result.data.endpoints.filter(
        (ep) => !existingPaths.has(`${ep.method}:${ep.path}`)
      );

      // Mark template actions and add them
      const templateActionsWithMeta = newTemplateActions.map((endpoint) => ({
        ...endpoint,
        selected: true,
        confidence: 1.0, // 100% confidence for templates
        tags: [...(endpoint.tags || []), 'from-template'],
      }));

      // Prepend template actions to the list
      setDetectedActions([...templateActionsWithMeta, ...data.detectedActions], undefined);
      setTemplateActionsAdded(true);
    }
  };

  // Filter actions by search query
  const filteredActions = useMemo(() => {
    if (!searchQuery.trim()) return data.detectedActions;

    const query = searchQuery.toLowerCase();
    return data.detectedActions.filter(
      (action) =>
        action.name.toLowerCase().includes(query) ||
        action.path.toLowerCase().includes(query) ||
        action.description?.toLowerCase().includes(query)
    );
  }, [data.detectedActions, searchQuery]);

  // Count selected actions
  const selectedCount = data.detectedActions.filter((a) => a.selected).length;
  const totalCount = data.detectedActions.length;
  const allSelected = selectedCount === totalCount;
  const someSelected = selectedCount > 0 && selectedCount < totalCount;

  const handleContinue = () => {
    if (selectedCount === 0) return;
    goToStep('configure-auth');
  };

  const handleToggleAll = () => {
    if (allSelected || someSelected) {
      deselectAllActions();
    } else {
      selectAllActions();
    }
  };

  return (
    <div className="space-y-4">
      {/* Template detected banner */}
      {detectedTemplate && template && !templateActionsAdded && (
        <Alert className="border-violet-200 bg-violet-50">
          <LayoutTemplate className="h-4 w-4 text-violet-600" />
          <AlertTitle className="text-violet-900">{template.name} pattern detected</AlertTitle>
          <AlertDescription className="text-violet-700">
            <p className="mb-2">
              This looks like a <strong>{template.name}</strong> API. We can add{' '}
              {template.actions.length} pre-built actions for common operations like query, insert,
              update, and delete.
            </p>
            <Button
              size="sm"
              variant="outline"
              className="border-violet-300 bg-white text-violet-700 hover:bg-violet-100"
              onClick={handleAddTemplateActions}
            >
              <Plus className="mr-1 h-3 w-3" />
              Add {template.actions.length} template actions
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Template actions added confirmation */}
      {templateActionsAdded && template && (
        <Alert className="border-emerald-200 bg-emerald-50">
          <Info className="h-4 w-4 text-emerald-600" />
          <AlertDescription className="text-emerald-700">
            Added {template.actions.length} {template.name} template actions. They&apos;re marked
            with a purple border below.
          </AlertDescription>
        </Alert>
      )}

      {/* Header with stats */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm">
          <Sparkles className="h-4 w-4 text-secondary" />
          <span className="text-muted-foreground">
            AI detected <span className="font-medium text-foreground">{totalCount}</span> actions
          </span>
          {selectedCount > 0 && (
            <Badge variant="secondary" className="ml-1">
              {selectedCount} selected
            </Badge>
          )}
        </div>

        <Button variant="ghost" size="sm" onClick={handleToggleAll} className="text-xs">
          {allSelected || someSelected ? (
            <>
              <Square className="mr-1 h-3 w-3" />
              Deselect All
            </>
          ) : (
            <>
              <CheckSquare className="mr-1 h-3 w-3" />
              Select All
            </>
          )}
        </Button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search actions..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Action list */}
      <ScrollArea className="h-[320px] rounded-lg border border-border/50 p-2">
        <div className="space-y-2">
          {filteredActions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Search className="mb-2 h-8 w-8 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">No actions match your search</p>
            </div>
          ) : (
            filteredActions.map((action) => (
              <ActionReviewCard
                key={action.slug}
                action={action}
                onToggle={() => toggleActionSelection(action.slug)}
                isTemplateAction={action.tags?.includes('from-template')}
              />
            ))
          )}
        </div>
      </ScrollArea>

      {/* Confidence legend */}
      <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
          <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
          <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
          High confidence
        </span>
        <span className="flex items-center gap-1">
          <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
          <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
          <Star className="h-3 w-3 text-muted-foreground/30" />
          Medium
        </span>
        <span className="flex items-center gap-1">
          <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
          <Star className="h-3 w-3 text-muted-foreground/30" />
          <Star className="h-3 w-3 text-muted-foreground/30" />
          Low
        </span>
      </div>

      {/* Continue button */}
      <div className="flex justify-end pt-2">
        <Button onClick={handleContinue} disabled={selectedCount === 0} size="lg">
          Continue with {selectedCount} Actions
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
