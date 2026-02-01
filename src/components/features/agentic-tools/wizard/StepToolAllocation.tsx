'use client';

import { useState } from 'react';
import { Plus, X, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog';
import { useAgenticToolWizardStore } from '@/stores/agenticToolWizard.store';
import type { AvailableTool } from '@/lib/modules/agentic-tools/agentic-tool.schemas';

// Placeholder: In real implementation, this would fetch from API
const MOCK_ACTIONS = [
  {
    actionId: '1',
    actionSlug: 'postgres-execute-query',
    name: 'PostgreSQL Execute Query',
    integration: 'PostgreSQL',
  },
  {
    actionId: '2',
    actionSlug: 'hubspot-search-contacts',
    name: 'HubSpot Search Contacts',
    integration: 'HubSpot',
  },
  {
    actionId: '3',
    actionSlug: 'google-search',
    name: 'Google Search',
    integration: 'Google',
  },
  {
    actionId: '4',
    actionSlug: 'firecrawl-scrape',
    name: 'Firecrawl Scrape',
    integration: 'Firecrawl',
  },
];

export function StepToolAllocation() {
  const {
    data,
    addTargetAction,
    removeTargetAction,
    addAvailableTool,
    removeAvailableTool,
    updateAvailableTool,
    canProceed,
    getNextStep,
    goToStep,
  } = useAgenticToolWizardStore();

  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [selectedAction, setSelectedAction] = useState<string>('');
  const [toolDescription, setToolDescription] = useState('');
  const [editingTool, setEditingTool] = useState<AvailableTool | null>(null);

  const isParameterInterpreter = data.executionMode === 'parameter_interpreter';

  const handleAddAction = () => {
    const action = MOCK_ACTIONS.find((a) => a.actionId === selectedAction);
    if (!action) return;

    if (isParameterInterpreter) {
      addTargetAction({
        actionId: action.actionId,
        actionSlug: action.actionSlug,
      });
    } else {
      addAvailableTool({
        actionId: action.actionId,
        actionSlug: action.actionSlug,
        description: toolDescription || action.name,
      });
    }

    setIsAddDialogOpen(false);
    setSelectedAction('');
    setToolDescription('');
  };

  const handleEditTool = (tool: AvailableTool) => {
    setEditingTool(tool);
    setToolDescription(tool.description);
  };

  const handleSaveEdit = () => {
    if (editingTool) {
      updateAvailableTool(editingTool.actionId, { description: toolDescription });
      setEditingTool(null);
      setToolDescription('');
    }
  };

  const handleNext = () => {
    const nextStep = getNextStep();
    if (nextStep && canProceed()) {
      goToStep(nextStep);
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        {/* Mode explanation */}
        <div className="rounded-lg bg-muted/50 p-4">
          <p className="text-sm">
            {isParameterInterpreter ? (
              <>
                <span className="font-medium">Parameter Interpreter Mode:</span> Select the
                action(s) that the LLM will generate parameters for. The LLM won&apos;t choose which
                action to execute - it will generate parameters for the specified action(s).
              </>
            ) : (
              <>
                <span className="font-medium">Autonomous Agent Mode:</span> Select tools that the
                LLM can autonomously choose from and execute. The LLM will decide which tools to use
                and when.
              </>
            )}
          </p>
        </div>

        {/* Selected actions/tools list */}
        <div className="space-y-2">
          <Label>
            {isParameterInterpreter ? 'Target Actions' : 'Available Tools'} *
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              (Minimum 1 required)
            </span>
          </Label>

          {isParameterInterpreter && data.targetActions.length > 0 && (
            <div className="space-y-2">
              {data.targetActions.map((action) => {
                const actionInfo = MOCK_ACTIONS.find((a) => a.actionId === action.actionId);
                return (
                  <div
                    key={action.actionId}
                    className="flex items-center justify-between rounded-lg border p-3"
                  >
                    <div>
                      <div className="font-medium">{actionInfo?.name}</div>
                      <div className="text-sm text-muted-foreground">{actionInfo?.integration}</div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeTargetAction(action.actionId)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                );
              })}
            </div>
          )}

          {!isParameterInterpreter && data.availableTools.length > 0 && (
            <div className="space-y-2">
              {data.availableTools.map((tool) => {
                const actionInfo = MOCK_ACTIONS.find((a) => a.actionId === tool.actionId);
                return (
                  <div
                    key={tool.actionId}
                    className="flex items-center justify-between rounded-lg border p-3"
                  >
                    <div className="flex-1">
                      <div className="font-medium">{actionInfo?.name}</div>
                      <div className="text-sm text-muted-foreground">{tool.description}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="ghost" size="sm" onClick={() => handleEditTool(tool)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeAvailableTool(tool.actionId)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {((isParameterInterpreter && data.targetActions.length === 0) ||
            (!isParameterInterpreter && data.availableTools.length === 0)) && (
            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              No {isParameterInterpreter ? 'actions' : 'tools'} selected yet. Click the button below
              to add {isParameterInterpreter ? 'an action' : 'a tool'}.
            </div>
          )}

          {/* Add button */}
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="w-full">
                <Plus className="mr-2 h-4 w-4" />
                Add {isParameterInterpreter ? 'Action' : 'Tool'}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add {isParameterInterpreter ? 'Action' : 'Tool'}</DialogTitle>
                <DialogDescription>
                  Select an action from your integrations to add.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Action</Label>
                  <select
                    value={selectedAction}
                    onChange={(e) => setSelectedAction(e.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="">Select an action...</option>
                    {MOCK_ACTIONS.map((action) => (
                      <option key={action.actionId} value={action.actionId}>
                        {action.integration} - {action.name}
                      </option>
                    ))}
                  </select>
                </div>

                {!isParameterInterpreter && selectedAction && (
                  <div className="space-y-2">
                    <Label>Tool Description for LLM</Label>
                    <Textarea
                      value={toolDescription}
                      onChange={(e) => setToolDescription(e.target.value)}
                      placeholder="Describe what this tool does and when the LLM should use it..."
                      rows={3}
                    />
                    <p className="text-xs text-muted-foreground">
                      This description helps the LLM decide when to use this tool.
                    </p>
                  </div>
                )}
              </div>

              <DialogFooter>
                <Button variant="ghost" onClick={() => setIsAddDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleAddAction} disabled={!selectedAction}>
                  Add
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Edit tool description dialog */}
          {editingTool && (
            <Dialog open={!!editingTool} onOpenChange={() => setEditingTool(null)}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Edit Tool Description</DialogTitle>
                  <DialogDescription>
                    Update the description that helps the LLM understand when to use this tool.
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-2">
                  <Label>Tool Description</Label>
                  <Textarea
                    value={toolDescription}
                    onChange={(e) => setToolDescription(e.target.value)}
                    placeholder="Describe what this tool does and when the LLM should use it..."
                    rows={3}
                  />
                </div>

                <DialogFooter>
                  <Button variant="ghost" onClick={() => setEditingTool(null)}>
                    Cancel
                  </Button>
                  <Button onClick={handleSaveEdit}>Save</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      <div className="flex justify-end">
        <Button onClick={handleNext} disabled={!canProceed()}>
          Next
        </Button>
      </div>
    </div>
  );
}
