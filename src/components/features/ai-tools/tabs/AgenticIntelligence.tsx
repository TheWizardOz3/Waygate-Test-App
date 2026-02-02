'use client';

import * as React from 'react';
import { Bot, Wand2, Sparkles, Plus, X, Loader2, ChevronDown, ChevronUp, Info } from 'lucide-react';

import { Button } from '@/components/ui/button';
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
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { apiClient } from '@/lib/api/client';
import { cn } from '@/lib/utils';
import type {
  AgenticToolResponse,
  AgenticToolExecutionMode,
  LLMProvider,
  ReasoningLevel,
} from '@/lib/modules/agentic-tools/agentic-tool.schemas';

// =============================================================================
// Types
// =============================================================================

interface AgenticIntelligenceProps {
  tool: AgenticToolResponse;
  onUpdate?: () => void;
}

interface ContextVariable {
  type: 'custom' | 'integration_schema' | 'reference_data';
  value?: string;
  source?: string;
}

// =============================================================================
// Constants
// =============================================================================

const EXECUTION_MODES = [
  {
    mode: 'parameter_interpreter' as AgenticToolExecutionMode,
    icon: Wand2,
    title: 'Query Transformation',
    description:
      'LLM translates natural language into structured API parameters. Single LLM call per invocation.',
    features: ['Natural language → JSON parameters', 'One LLM call', 'Predictable execution'],
  },
  {
    mode: 'autonomous_agent' as AgenticToolExecutionMode,
    icon: Bot,
    title: 'Autonomous Agent',
    description:
      'LLM autonomously selects and executes tools to accomplish goals. Multiple tool calls per invocation.',
    features: ['Natural language → tool selection', 'Multiple LLM calls', 'Autonomous execution'],
  },
] as const;

const LLM_MODELS = [
  {
    provider: 'anthropic' as LLMProvider,
    model: 'claude-opus-4.5',
    name: 'Claude Opus 4.5',
    description: 'Most capable. Best for complex reasoning.',
    supportsReasoning: true,
  },
  {
    provider: 'anthropic' as LLMProvider,
    model: 'claude-sonnet-4.5',
    name: 'Claude Sonnet 4.5',
    description: 'Balanced performance and cost.',
    supportsReasoning: true,
  },
  {
    provider: 'google' as LLMProvider,
    model: 'gemini-3',
    name: 'Gemini 3',
    description: "Google's flagship model.",
    supportsReasoning: false,
  },
] as const;

const REASONING_LEVELS: { value: ReasoningLevel; label: string; description: string }[] = [
  { value: 'none', label: 'None', description: 'Fastest, cheapest' },
  { value: 'low', label: 'Low', description: 'Basic reasoning' },
  { value: 'medium', label: 'Medium', description: 'Standard tasks' },
  { value: 'high', label: 'High', description: 'Complex tasks' },
];

const VARIABLE_OPTIONS = [
  { key: '{{user_input}}', description: 'The natural language task/request from the user' },
  { key: '{{integration_schema}}', description: 'Schema for target integration (auto-injected)' },
  { key: '{{reference_data}}', description: 'Reference data from configured sources' },
  { key: '{{available_tools}}', description: 'List of tools available for autonomous mode' },
];

// =============================================================================
// Helpers
// =============================================================================

interface ToolAllocation {
  mode?: string;
  targetActions?: { actionId: string; actionSlug: string }[];
  availableTools?: { actionId: string; actionSlug: string; description?: string }[];
}

function getToolsFromAllocation(allocation: ToolAllocation | undefined): string[] {
  if (!allocation) return [];
  if (allocation.targetActions) {
    return allocation.targetActions.map((t) => t.actionSlug);
  }
  if (allocation.availableTools) {
    return allocation.availableTools.map((t) => t.actionSlug);
  }
  return [];
}

// =============================================================================
// Component
// =============================================================================

export function AgenticIntelligence({ tool, onUpdate }: AgenticIntelligenceProps) {
  const [activeSection, setActiveSection] = React.useState<string>('execution');

  // State for all configuration
  const [executionMode, setExecutionMode] = React.useState<AgenticToolExecutionMode>(
    tool.executionMode
  );
  const [provider, setProvider] = React.useState<LLMProvider>(tool.embeddedLLMConfig.provider);
  const [model, setModel] = React.useState(tool.embeddedLLMConfig.model);
  const [reasoningLevel, setReasoningLevel] = React.useState<ReasoningLevel>(
    tool.embeddedLLMConfig.reasoningLevel || 'none'
  );
  const [temperature, setTemperature] = React.useState(tool.embeddedLLMConfig.temperature);
  const [maxTokens, setMaxTokens] = React.useState(tool.embeddedLLMConfig.maxTokens);
  const [systemPrompt, setSystemPrompt] = React.useState(tool.systemPrompt);
  const [autoInjectSchemas, setAutoInjectSchemas] = React.useState(true);
  const [contextVariables, setContextVariables] = React.useState<Record<string, ContextVariable>>(
    {}
  );
  const [showSchemaPreview, setShowSchemaPreview] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);

  const selectedModel = LLM_MODELS.find((m) => m.model === model);
  const allocatedTools = getToolsFromAllocation(tool.toolAllocation as ToolAllocation);

  const hasChanges = React.useMemo(() => {
    if (executionMode !== tool.executionMode) return true;
    if (provider !== tool.embeddedLLMConfig.provider) return true;
    if (model !== tool.embeddedLLMConfig.model) return true;
    if (reasoningLevel !== (tool.embeddedLLMConfig.reasoningLevel || 'none')) return true;
    if (temperature !== tool.embeddedLLMConfig.temperature) return true;
    if (maxTokens !== tool.embeddedLLMConfig.maxTokens) return true;
    if (systemPrompt !== tool.systemPrompt) return true;
    return false;
  }, [executionMode, provider, model, reasoningLevel, temperature, maxTokens, systemPrompt, tool]);

  const handleModelChange = (newModel: string) => {
    const modelInfo = LLM_MODELS.find((m) => m.model === newModel);
    if (modelInfo) {
      setModel(newModel);
      setProvider(modelInfo.provider);
      if (!modelInfo.supportsReasoning) {
        setReasoningLevel('none');
      }
    }
  };

  const handleGeneratePrompt = () => {
    const template =
      executionMode === 'parameter_interpreter'
        ? `You are a parameter generation assistant. Convert natural language requests into structured API parameters.

# User Request:
{{user_input}}

# Instructions:
1. Analyze the user's request to understand their intent
2. Generate structured JSON parameters based on the request
3. Return ONLY valid JSON - no explanations or markdown

# Output Format:
{
  "parameter_name": "value"
}

${allocatedTools.length > 0 ? `# Available Tools: ${allocatedTools.join(', ')}` : ''}`
        : `You are an autonomous assistant. Accomplish tasks using the available tools.

# User Request:
{{user_input}}

${allocatedTools.length > 0 ? `# Available Tools:\n${allocatedTools.map((t) => `- ${t}`).join('\n')}` : ''}

# Instructions:
1. Analyze the request to understand what information or action is needed
2. Select appropriate tools and execute them
3. Synthesize findings into a clear answer
4. Always cite which tools you used and why`;

    setSystemPrompt(template);
  };

  const handleInsertVariable = (variable: string) => {
    setSystemPrompt((prev) => prev + variable);
  };

  const handleAddContextVariable = () => {
    const key = prompt('Enter variable name (without {{}}):');
    if (!key) return;
    const value = prompt('Enter variable value:');
    if (value === null) return;

    setContextVariables((prev) => ({
      ...prev,
      [key]: { type: 'custom', value },
    }));
  };

  const handleRemoveContextVariable = (key: string) => {
    setContextVariables((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await apiClient.patch(`/agentic-tools/${tool.id}`, {
        executionMode,
        embeddedLLMConfig: {
          provider,
          model,
          reasoningLevel,
          temperature,
          maxTokens,
        },
        systemPrompt,
      });
      onUpdate?.();
    } catch (error) {
      console.error('Failed to save intelligence config:', error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <Tabs value={activeSection} onValueChange={setActiveSection}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="execution">Mode</TabsTrigger>
          <TabsTrigger value="llm">LLM Config</TabsTrigger>
          <TabsTrigger value="prompt">System Prompt</TabsTrigger>
          <TabsTrigger value="context">Context</TabsTrigger>
        </TabsList>

        {/* Execution Mode Section */}
        <TabsContent value="execution" className="space-y-4">
          {EXECUTION_MODES.map(({ mode, icon: Icon, title, description, features }) => (
            <button
              key={mode}
              onClick={() => setExecutionMode(mode)}
              className={cn(
                'group relative w-full rounded-lg border-2 p-6 text-left transition-all',
                'hover:border-violet-600 hover:bg-violet-600/5',
                'focus:outline-none focus:ring-2 focus:ring-violet-600 focus:ring-offset-2',
                executionMode === mode &&
                  'border-violet-600 bg-violet-600/5 ring-2 ring-violet-600 ring-offset-2'
              )}
            >
              <div className="flex items-start gap-4">
                <div
                  className={cn(
                    'flex h-12 w-12 shrink-0 items-center justify-center rounded-lg transition-colors',
                    executionMode === mode
                      ? 'bg-violet-600 text-white'
                      : 'bg-violet-600/10 text-violet-600 group-hover:bg-violet-600 group-hover:text-white'
                  )}
                >
                  <Icon className="h-6 w-6" />
                </div>
                <div className="flex-1">
                  <h3 className="font-heading text-lg font-semibold">{title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{description}</p>
                  <div className="mt-3 space-y-1">
                    {features.map((feature) => (
                      <div key={feature} className="flex items-center gap-2 text-sm">
                        <div className="h-1.5 w-1.5 rounded-full bg-violet-600" />
                        <span>{feature}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </button>
          ))}
        </TabsContent>

        {/* LLM Configuration Section */}
        <TabsContent value="llm" className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="model">Language Model</Label>
            <Select value={model} onValueChange={handleModelChange}>
              <SelectTrigger id="model">
                <SelectValue placeholder="Select a model" />
              </SelectTrigger>
              <SelectContent>
                {LLM_MODELS.map((m) => (
                  <SelectItem key={m.model} value={m.model}>
                    <div>
                      <div className="font-medium">{m.name}</div>
                      <div className="text-xs text-muted-foreground">{m.description}</div>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedModel?.supportsReasoning && (
            <div className="space-y-2">
              <Label htmlFor="reasoning">Reasoning Level</Label>
              <Select
                value={reasoningLevel}
                onValueChange={(v) => setReasoningLevel(v as ReasoningLevel)}
              >
                <SelectTrigger id="reasoning">
                  <SelectValue placeholder="Select reasoning level" />
                </SelectTrigger>
                <SelectContent>
                  {REASONING_LEVELS.map((level) => (
                    <SelectItem key={level.value} value={level.value}>
                      <div>
                        <div className="font-medium">{level.label}</div>
                        <div className="text-xs text-muted-foreground">{level.description}</div>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="temperature">Temperature</Label>
              <span className="text-sm font-medium text-muted-foreground">
                {temperature.toFixed(1)}
              </span>
            </div>
            <Slider
              id="temperature"
              min={0}
              max={1}
              step={0.1}
              value={[temperature]}
              onValueChange={([value]) => setTemperature(value)}
              className="py-4"
            />
            <p className="text-sm text-muted-foreground">
              Lower = more deterministic. Higher = more creative.
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="maxTokens">Max Tokens</Label>
              <span className="text-sm font-medium text-muted-foreground">{maxTokens}</span>
            </div>
            <Input
              id="maxTokens"
              type="number"
              min={1000}
              max={8000}
              step={100}
              value={maxTokens}
              onChange={(e) => setMaxTokens(parseInt(e.target.value) || 4000)}
            />
          </div>
        </TabsContent>

        {/* System Prompt Section */}
        <TabsContent value="prompt" className="space-y-4">
          <Alert>
            <Sparkles className="h-4 w-4" />
            <AlertDescription>
              Use variable placeholders like <code className="text-xs">{'{{user_input}}'}</code>{' '}
              that will be replaced at runtime.
            </AlertDescription>
          </Alert>

          {allocatedTools.length > 0 && (
            <Card>
              <CardHeader className="py-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium">
                    Allocated Tools ({allocatedTools.length})
                  </CardTitle>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleGeneratePrompt}
                    className="gap-2"
                  >
                    <Sparkles className="h-3 w-3" />
                    Generate Prompt
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="flex flex-wrap gap-2">
                  {allocatedTools.map((slug) => (
                    <Badge key={slug} variant="secondary">
                      {slug}
                    </Badge>
                  ))}
                </div>
                <Collapsible open={showSchemaPreview} onOpenChange={setShowSchemaPreview}>
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" size="sm" className="mt-3 gap-2 text-muted-foreground">
                      {showSchemaPreview ? (
                        <ChevronUp className="h-3 w-3" />
                      ) : (
                        <ChevronDown className="h-3 w-3" />
                      )}
                      {showSchemaPreview ? 'Hide' : 'Show'} Tool Details
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="mt-2 rounded-md bg-muted/50 p-3 text-sm text-muted-foreground">
                      <p>
                        Tool schemas will be available via{' '}
                        <code className="text-xs">{'{{integration_schema}}'}</code>
                      </p>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </CardContent>
            </Card>
          )}

          {allocatedTools.length === 0 && (
            <Alert variant="default">
              <Info className="h-4 w-4" />
              <AlertDescription>
                No tools allocated yet. Go to the Tools/Actions tab to select tools.
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="systemPrompt">System Prompt</Label>
            <Textarea
              id="systemPrompt"
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder="Enter instructions for the embedded LLM..."
              rows={12}
              className="font-mono text-sm"
            />
            <div className="flex justify-between">
              <p className="text-sm text-muted-foreground">
                Instructions that guide the embedded LLM.
              </p>
              <span className="text-xs text-muted-foreground">
                {systemPrompt.length} characters
              </span>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Available Variables</Label>
            <div className="grid gap-2 sm:grid-cols-2">
              {VARIABLE_OPTIONS.map((variable) => (
                <button
                  key={variable.key}
                  onClick={() => handleInsertVariable(variable.key)}
                  className="flex items-start gap-2 rounded-lg border p-3 text-left hover:border-violet-600 hover:bg-violet-600/5"
                >
                  <code className="shrink-0 rounded bg-muted px-1 py-0.5 font-mono text-xs">
                    {variable.key}
                  </code>
                  <span className="text-xs text-muted-foreground">{variable.description}</span>
                </button>
              ))}
            </div>
          </div>
        </TabsContent>

        {/* Context Configuration Section */}
        <TabsContent value="context" className="space-y-6">
          <Alert>
            <AlertDescription>
              Context variables are injected into the system prompt at runtime. This is optional.
            </AlertDescription>
          </Alert>

          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-0.5">
              <Label htmlFor="autoInject">Auto-inject Integration Schemas</Label>
              <p className="text-sm text-muted-foreground">
                Automatically inject API schemas for allocated tools.
              </p>
            </div>
            <Switch
              id="autoInject"
              checked={autoInjectSchemas}
              onCheckedChange={setAutoInjectSchemas}
            />
          </div>

          <div className="space-y-2">
            <Label>Custom Variables (optional)</Label>
            {Object.keys(contextVariables).length > 0 && (
              <div className="space-y-2">
                {Object.entries(contextVariables).map(([key, variable]) => (
                  <div
                    key={key}
                    className="flex items-center justify-between rounded-lg border p-3"
                  >
                    <div>
                      <code className="font-mono text-sm">{`{{${key}}}`}</code>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {variable.type === 'custom' && variable.value}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemoveContextVariable(key)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
            <Button variant="outline" className="w-full" onClick={handleAddContextVariable}>
              <Plus className="mr-2 h-4 w-4" />
              Add Custom Variable
            </Button>
          </div>

          <div className="rounded-lg bg-muted/50 p-4">
            <p className="text-sm font-medium">Built-in Variables</p>
            <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
              <li>
                <code className="text-xs">{'{{user_input}}'}</code> - The task from the parent agent
              </li>
              <li>
                <code className="text-xs">{'{{available_tools}}'}</code> - List of tools (autonomous
                mode)
              </li>
            </ul>
          </div>
        </TabsContent>
      </Tabs>

      {/* Save Button */}
      {hasChanges && (
        <div className="flex justify-end border-t pt-4">
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              'Save Changes'
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
