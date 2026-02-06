'use client';

import * as React from 'react';
import {
  Bot,
  Wand2,
  Sparkles,
  Loader2,
  Info,
  Check,
  RefreshCw,
  Database,
  Plus,
  Trash2,
  GripVertical,
} from 'lucide-react';
import { toast } from 'sonner';

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
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
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

/**
 * Reference data source configuration.
 * Represents a data type from an integration that can be injected as context.
 */
interface ReferenceDataSource {
  /** Integration ID this data comes from */
  integrationId: string;
  /** Integration name for display */
  integrationName: string;
  /** Data type label (e.g., 'users', 'channels') */
  dataType: string;
  /** Whether this source is enabled for injection */
  enabled: boolean;
  /** Last sync timestamp if available */
  lastSyncedAt?: string;
  /** Number of items synced */
  itemCount?: number;
}

/**
 * Context configuration stored in the agentic tool
 */
interface ContextConfig {
  /** Whether to auto-inject schemas for allocated tools */
  autoInjectSchemas: boolean;
  /** Reference data sources to inject */
  referenceDataSources: ReferenceDataSource[];
}

/**
 * Input argument for the agentic tool
 */
interface InputArgument {
  /** Unique key for the argument */
  name: string;
  /** Display label */
  label?: string;
  /** Argument type */
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  /** Description of the argument */
  description: string;
  /** Whether the argument is required */
  required: boolean;
  /** Default value if any */
  default?: unknown;
  /** Source: 'custom' for user-created, or actionSlug for inherited */
  source: 'custom' | string;
  /** Whether this argument is enabled (for inherited args) */
  enabled: boolean;
}

const ARGUMENT_TYPES = [
  { value: 'string', label: 'String' },
  { value: 'number', label: 'Number' },
  { value: 'boolean', label: 'Boolean' },
  { value: 'object', label: 'Object' },
  { value: 'array', label: 'Array' },
] as const;

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

// System variables (auto-injected based on context)
const SYSTEM_VARIABLE_OPTIONS = [
  { key: '{{integration_schema}}', description: 'Schema for target integration (auto-injected)' },
  { key: '{{available_tools}}', description: 'List of tools available for autonomous mode' },
];

// Variable options that are added dynamically based on enabled reference data
const getReferenceDataVariables = (sources: ReferenceDataSource[]) =>
  sources
    .filter((s) => s.enabled)
    .map((s) => ({
      key: `{{${s.dataType}}}`,
      description: `${s.integrationName} ${s.dataType} (${s.itemCount ?? 0} items)`,
    }));

// Variable options from defined input arguments
const getInputArgumentVariables = (args: InputArgument[]) =>
  args
    .filter((arg) => arg.enabled)
    .map((arg) => ({
      key: `{{${arg.name}}}`,
      description: arg.description,
      isArgument: true,
    }));

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
  // For parameter_interpreter mode, use targetActions
  if (allocation.mode === 'parameter_interpreter' && allocation.targetActions) {
    return allocation.targetActions.map((t) => t.actionSlug);
  }
  // For autonomous_agent mode (or when mode not set), use availableTools
  if (allocation.availableTools) {
    return allocation.availableTools.map((t) => t.actionSlug);
  }
  // Fallback: check targetActions even if mode doesn't match (for backwards compatibility)
  if (allocation.targetActions) {
    return allocation.targetActions.map((t) => t.actionSlug);
  }
  return [];
}

// =============================================================================
// Execution Mode Card Component (matches CompositeIntelligence pattern)
// =============================================================================

interface ExecutionModeCardProps {
  mode: AgenticToolExecutionMode;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  selected: boolean;
  onSelect: () => void;
  features: readonly string[];
}

function ExecutionModeCard({
  title,
  description,
  icon: Icon,
  selected,
  onSelect,
  features,
}: ExecutionModeCardProps) {
  return (
    <Card
      className={cn(
        'cursor-pointer transition-all hover:border-primary/50',
        selected && 'border-primary bg-primary/5'
      )}
      onClick={onSelect}
    >
      <CardHeader className="pb-2">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              'flex h-10 w-10 items-center justify-center rounded-lg',
              selected ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
            )}
          >
            <Icon className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <CardTitle className="text-base">{title}</CardTitle>
          </div>
          {selected && (
            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary">
              <Check className="h-3 w-3 text-primary-foreground" />
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <CardDescription>{description}</CardDescription>
        <ul className="mt-3 space-y-1">
          {features.map((feature, i) => (
            <li key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
              <div className="h-1 w-1 rounded-full bg-muted-foreground" />
              {feature}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

// =============================================================================
// Component
// =============================================================================

export function AgenticIntelligence({ tool, onUpdate }: AgenticIntelligenceProps) {
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

  // Parse context config from tool
  const parsedContextConfig = React.useMemo(() => {
    const config = tool.contextConfig as Partial<ContextConfig> | undefined;
    return {
      autoInjectSchemas: config?.autoInjectSchemas ?? true,
      referenceDataSources: config?.referenceDataSources ?? [],
    };
  }, [tool.contextConfig]);

  const [referenceDataSources, setReferenceDataSources] = React.useState<ReferenceDataSource[]>(
    parsedContextConfig.referenceDataSources
  );

  // Parse input arguments from tool's inputSchema
  const parsedInputArguments = React.useMemo(() => {
    const schema = tool.inputSchema as Record<string, unknown> | undefined;
    if (!schema || !schema.arguments) return [];
    return (schema.arguments as InputArgument[]) ?? [];
  }, [tool.inputSchema]);

  const [inputArguments, setInputArguments] = React.useState<InputArgument[]>(parsedInputArguments);
  const [isAddingArgument, setIsAddingArgument] = React.useState(false);
  const [newArgument, setNewArgument] = React.useState<Partial<InputArgument>>({
    name: '',
    type: 'string',
    description: '',
    required: false,
    source: 'custom',
    enabled: true,
  });

  const [isSaving, setIsSaving] = React.useState(false);
  const [isGeneratingPrompt, setIsGeneratingPrompt] = React.useState(false);
  const [isLoadingRefData, setIsLoadingRefData] = React.useState(false);
  const [isLoadingSubToolParams, setIsLoadingSubToolParams] = React.useState(false);

  const selectedModel = LLM_MODELS.find((m) => m.model === model);
  const allocatedTools = getToolsFromAllocation(tool.toolAllocation as ToolAllocation);

  // Get dynamic reference data variables
  const referenceDataVariables = getReferenceDataVariables(referenceDataSources);

  // Get input argument variables for prompt insertion
  const inputArgumentVariables = getInputArgumentVariables(inputArguments);

  // Check if contextConfig has changed
  const originalRefDataSources = parsedContextConfig.referenceDataSources;

  const hasChanges = React.useMemo(() => {
    if (executionMode !== tool.executionMode) return true;
    if (provider !== tool.embeddedLLMConfig.provider) return true;
    if (model !== tool.embeddedLLMConfig.model) return true;
    if (reasoningLevel !== (tool.embeddedLLMConfig.reasoningLevel || 'none')) return true;
    if (temperature !== tool.embeddedLLMConfig.temperature) return true;
    if (maxTokens !== tool.embeddedLLMConfig.maxTokens) return true;
    if (systemPrompt !== tool.systemPrompt) return true;
    if (JSON.stringify(referenceDataSources) !== JSON.stringify(originalRefDataSources))
      return true;
    if (JSON.stringify(inputArguments) !== JSON.stringify(parsedInputArguments)) return true;
    return false;
  }, [
    executionMode,
    provider,
    model,
    reasoningLevel,
    temperature,
    maxTokens,
    systemPrompt,
    referenceDataSources,
    inputArguments,
    tool,
    originalRefDataSources,
    parsedInputArguments,
  ]);

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

  const handleGeneratePrompt = async () => {
    setIsGeneratingPrompt(true);
    try {
      // Call the LLM-powered API endpoint to generate a proper system prompt
      const response = await apiClient.post<{
        toolDescription?: string;
        exampleUsages?: string[];
      }>(`/agentic-tools/${tool.id}/regenerate-prompt`);
      if (response.toolDescription) {
        // The API returns a toolDescription - we can use this as a basis for the system prompt
        // For now, generate a schema-aware system prompt locally since the API generates tool descriptions
        const modePrefix =
          executionMode === 'parameter_interpreter'
            ? `You are an autonomous parameter generation assistant powered by an embedded LLM (${model}). It is designed to translate natural language requests into structured JSON parameters specifically for the following tools.`
            : `You are an autonomous assistant powered by an embedded LLM (${model}). You autonomously select and execute tools to accomplish goals. Multiple tool calls per invocation are supported.`;

        const toolsSection =
          allocatedTools.length > 0
            ? `\n\n# Available Tools:\n${allocatedTools.map((t) => `- ${t}`).join('\n')}`
            : '';

        const instructionsSection =
          executionMode === 'parameter_interpreter'
            ? `\n\n# Instructions:
1. Analyze the user's request to understand their intent
2. Map the request to the correct tool schema, determining required and optional parameters
3. Generate structured JSON parameters based on the request
4. Return ONLY valid JSON without markdown or explanatory text

# Output Format:
The output will be the structured JSON response formatted strictly as valid JSON.`
            : `\n\n# Instructions:
1. Analyze the request to understand what information or action is needed
2. Select the most appropriate tool(s) for the task
3. Execute tools in sequence as needed
4. Synthesize findings into a clear, actionable answer
5. Always explain which tools you used and why`;

        const newPrompt = `${modePrefix}${toolsSection}

# User Request:
{{user_input}}
${instructionsSection}`;

        setSystemPrompt(newPrompt);
      }
    } catch (error) {
      console.error('Failed to generate prompt via API, using fallback:', error);
      // Fallback to template-based generation if API fails
      const fallbackPrompt =
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

      setSystemPrompt(fallbackPrompt);
    } finally {
      setIsGeneratingPrompt(false);
    }
  };

  const handleInsertVariable = (variable: string) => {
    setSystemPrompt((prev) => prev + variable);
  };

  const handleToggleReferenceDataSource = (index: number) => {
    setReferenceDataSources((prev) =>
      prev.map((source, i) => (i === index ? { ...source, enabled: !source.enabled } : source))
    );
  };

  const handleLoadReferenceData = React.useCallback(async () => {
    // Get integration IDs from allocated tools
    const toolAllocation = tool.toolAllocation as ToolAllocation;
    const actionIds = [
      ...(toolAllocation?.targetActions?.map((t) => t.actionId) ?? []),
      ...(toolAllocation?.availableTools?.map((t) => t.actionId) ?? []),
    ];

    if (actionIds.length === 0) return;

    setIsLoadingRefData(true);
    try {
      // Fetch integration info and reference data summaries for actions
      // We need to get the integrations that these actions belong to
      const response = await apiClient.get<{
        sources: ReferenceDataSource[];
      }>(`/agentic-tools/${tool.id}/reference-data-sources`);

      if (response.sources) {
        // Merge with existing state (preserve enabled status)
        const existingMap = new Map(
          referenceDataSources.map((s) => [`${s.integrationId}-${s.dataType}`, s])
        );
        const merged = response.sources.map((source) => {
          const key = `${source.integrationId}-${source.dataType}`;
          const existing = existingMap.get(key);
          return existing ? { ...source, enabled: existing.enabled } : source;
        });
        setReferenceDataSources(merged);
      }
    } catch (error) {
      console.error('Failed to load reference data sources:', error);
    } finally {
      setIsLoadingRefData(false);
    }
  }, [tool.id, tool.toolAllocation, referenceDataSources]);

  const handleLoadSubToolParameters = React.useCallback(async () => {
    const toolAllocation = tool.toolAllocation as ToolAllocation;

    const actionIds = [
      ...(toolAllocation?.targetActions?.map((t) => t.actionId) ?? []),
      ...(toolAllocation?.availableTools?.map((t) => t.actionId) ?? []),
    ];

    if (actionIds.length === 0) {
      toast.error('No sub-tools allocated', {
        description: 'Allocate tools in the Tools/Actions tab first.',
      });
      return;
    }

    setIsLoadingSubToolParams(true);
    try {
      const response = await apiClient.get<{
        parameters: Array<{
          name: string;
          label: string;
          type: 'string' | 'number' | 'boolean' | 'object' | 'array';
          description: string;
          required: boolean;
          default?: unknown;
          source: string;
          sourceName: string;
        }>;
      }>(`/agentic-tools/${tool.id}/sub-tool-parameters`);

      if (response.parameters) {
        // Create a map of existing arguments by name to check for duplicates
        const existingNames = new Set(inputArguments.map((arg) => arg.name));

        // Convert sub-tool parameters to InputArgument format
        const newArgs: InputArgument[] = response.parameters
          .filter((param) => !existingNames.has(param.name)) // Skip duplicates
          .map((param) => ({
            name: param.name,
            label: param.label,
            type: param.type,
            description: param.description,
            required: param.required,
            default: param.default,
            source: param.source,
            enabled: true,
          }));

        if (newArgs.length > 0) {
          setInputArguments((prev) => [...prev, ...newArgs]);
          toast.success(`Loaded ${newArgs.length} parameters`, {
            description: `From ${new Set(newArgs.map((a) => a.source)).size} sub-tool(s).`,
          });
        } else if (response.parameters.length > 0) {
          toast.info('All parameters already added', {
            description: `${response.parameters.length} parameters found, but all are duplicates.`,
          });
        } else {
          toast.info('No parameters found', {
            description: 'The allocated tools have no input parameters.',
          });
        }
      }
    } catch (error) {
      console.error('Failed to load sub-tool parameters:', error);
      toast.error('Failed to load parameters', {
        description: error instanceof Error ? error.message : 'An error occurred.',
      });
    } finally {
      setIsLoadingSubToolParams(false);
    }
  }, [tool.id, tool.toolAllocation, inputArguments]);

  const handleAddArgument = () => {
    if (!newArgument.name || !newArgument.description) return;

    const argument: InputArgument = {
      name: newArgument.name.replace(/\s+/g, '_').toLowerCase(),
      label: newArgument.name,
      type: newArgument.type || 'string',
      description: newArgument.description,
      required: newArgument.required ?? false,
      source: 'custom',
      enabled: true,
    };

    setInputArguments((prev) => [...prev, argument]);
    setNewArgument({
      name: '',
      type: 'string',
      description: '',
      required: false,
      source: 'custom',
      enabled: true,
    });
    setIsAddingArgument(false);
  };

  const handleRemoveArgument = (index: number) => {
    setInputArguments((prev) => prev.filter((_, i) => i !== index));
  };

  const handleToggleArgumentRequired = (index: number) => {
    setInputArguments((prev) =>
      prev.map((arg, i) => (i === index ? { ...arg, required: !arg.required } : arg))
    );
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
        contextConfig: {
          autoInjectSchemas: true, // Always enabled - injects API schemas for allocated tools
          referenceDataSources,
        },
        inputSchema: {
          arguments: inputArguments,
        },
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
      {/* Save Button at Top (when changes exist) */}
      {hasChanges && (
        <div className="flex justify-end">
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

      {/* Execution Mode Selection (Card-based, matching Composite Tools) */}
      <div className="space-y-4">
        <h3 className="text-sm font-medium">Execution Mode</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          {EXECUTION_MODES.map(({ mode, icon, title, description, features }) => (
            <ExecutionModeCard
              key={mode}
              mode={mode}
              title={title}
              description={description}
              icon={icon}
              selected={executionMode === mode}
              onSelect={() => setExecutionMode(mode)}
              features={features}
            />
          ))}
        </div>
      </div>

      {/* Input Arguments */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Input Arguments</CardTitle>
              <CardDescription>
                Define the inputs for this tool. The LLM will map natural language to these
                arguments.
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={handleLoadSubToolParameters}
                disabled={isLoadingSubToolParams || allocatedTools.length === 0}
                title={
                  allocatedTools.length === 0
                    ? 'Allocate tools first in the Tools/Actions tab'
                    : 'Import parameters from allocated actions'
                }
              >
                {isLoadingSubToolParams ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <RefreshCw className="h-3 w-3" />
                )}
                {allocatedTools.length === 0 ? 'No Sub-tools' : 'Load from Sub-tools'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => setIsAddingArgument(true)}
              >
                <Plus className="h-3 w-3" />
                Add Custom
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Existing Arguments */}
          {inputArguments.length > 0 ? (
            <div className="space-y-2">
              {inputArguments.map((arg, index) => (
                <div
                  key={`${arg.source}-${arg.name}`}
                  className={cn(
                    'flex items-center gap-3 rounded-lg border p-3',
                    arg.source !== 'custom' && 'border-blue-500/30 bg-blue-500/5'
                  )}
                >
                  <GripVertical className="h-4 w-4 cursor-grab text-muted-foreground/50" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-medium">{arg.name}</span>
                      <Badge variant="outline" className="text-xs">
                        {arg.type}
                      </Badge>
                      {arg.source !== 'custom' ? (
                        <Badge
                          variant="secondary"
                          className="border-blue-500/30 bg-blue-500/20 text-xs text-blue-700 dark:text-blue-400"
                        >
                          from {arg.source}
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-xs">
                          custom
                        </Badge>
                      )}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">{arg.description}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Checkbox
                        checked={arg.required}
                        onCheckedChange={() => handleToggleArgumentRequired(index)}
                      />
                      Required
                    </label>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                      onClick={() => handleRemoveArgument(index)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed p-6 text-center">
              <p className="text-sm text-muted-foreground">
                No arguments defined. Click &quot;Load from Sub-tools&quot; to import parameters
                from allocated actions, or add a custom argument like &quot;user_query&quot; for
                natural language input.
              </p>
            </div>
          )}

          {/* Add Argument Form */}
          {isAddingArgument && (
            <div className="space-y-3 rounded-lg border bg-muted/30 p-4">
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">Name</Label>
                  <Input
                    placeholder="e.g., user_query"
                    value={newArgument.name}
                    onChange={(e) => setNewArgument((prev) => ({ ...prev, name: e.target.value }))}
                    className="h-9"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Type</Label>
                  <Select
                    value={newArgument.type}
                    onValueChange={(v) =>
                      setNewArgument((prev) => ({ ...prev, type: v as InputArgument['type'] }))
                    }
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ARGUMENT_TYPES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-2 space-y-1.5">
                  <Label className="text-xs">Description</Label>
                  <Input
                    placeholder="Describe what this argument is for"
                    value={newArgument.description}
                    onChange={(e) =>
                      setNewArgument((prev) => ({ ...prev, description: e.target.value }))
                    }
                    className="h-9"
                  />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={newArgument.required}
                    onCheckedChange={(checked) =>
                      setNewArgument((prev) => ({ ...prev, required: !!checked }))
                    }
                  />
                  Required argument
                </label>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setIsAddingArgument(false);
                      setNewArgument({
                        name: '',
                        type: 'string',
                        description: '',
                        required: false,
                        source: 'custom',
                        enabled: true,
                      });
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleAddArgument}
                    disabled={!newArgument.name || !newArgument.description}
                  >
                    Add
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Quick Add Suggestions */}
          {!isAddingArgument && inputArguments.length === 0 && (
            <div className="flex flex-wrap gap-2">
              <span className="text-xs text-muted-foreground">Quick add:</span>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => {
                  setInputArguments([
                    {
                      name: 'user_query',
                      label: 'User Query',
                      type: 'string',
                      description: 'Natural language request from the user',
                      required: true,
                      source: 'custom',
                      enabled: true,
                    },
                  ]);
                }}
              >
                + user_query (natural language)
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => {
                  setInputArguments([
                    {
                      name: 'task',
                      label: 'Task',
                      type: 'string',
                      description: 'The task or action to perform',
                      required: true,
                      source: 'custom',
                      enabled: true,
                    },
                    {
                      name: 'context',
                      label: 'Context',
                      type: 'string',
                      description: 'Additional context or constraints',
                      required: false,
                      source: 'custom',
                      enabled: true,
                    },
                  ]);
                }}
              >
                + task + context
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* System Prompt */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">System Prompt</CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={handleGeneratePrompt}
              disabled={isGeneratingPrompt}
              className="gap-2"
            >
              {isGeneratingPrompt ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Sparkles className="h-3 w-3" />
              )}
              Generate with AI
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {allocatedTools.length === 0 && (
            <Alert variant="default">
              <Info className="h-4 w-4" />
              <AlertDescription>
                No tools allocated yet. Go to the Tools/Actions tab to select tools.
              </AlertDescription>
            </Alert>
          )}

          {/* System Prompt Editor */}
          <div className="space-y-2">
            <Textarea
              id="systemPrompt"
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder="Enter instructions for the embedded LLM..."
              rows={10}
              className="font-mono text-sm"
            />
            <div className="flex justify-between">
              <p className="text-xs text-muted-foreground">
                Use variable placeholders like <code>{'{{argument_name}}'}</code> that will be
                replaced at runtime with input values.
              </p>
              <span className="text-xs text-muted-foreground">
                {systemPrompt.length} characters
              </span>
            </div>
          </div>

          {/* Available Variables */}
          <div className="space-y-2">
            <Label className="text-sm">Insert Variable</Label>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {/* Input argument variables (most important - highlighted) */}
              {inputArgumentVariables.map((variable) => (
                <button
                  key={variable.key}
                  onClick={() => handleInsertVariable(variable.key)}
                  className="flex items-start gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-2 text-left hover:border-emerald-500/50 hover:bg-emerald-500/10"
                >
                  <code className="shrink-0 rounded bg-emerald-500/20 px-1 py-0.5 font-mono text-xs text-emerald-700 dark:text-emerald-400">
                    {variable.key}
                  </code>
                  <span className="text-xs text-muted-foreground">{variable.description}</span>
                </button>
              ))}
              {/* System variables (auto-injected) */}
              {SYSTEM_VARIABLE_OPTIONS.map((variable) => (
                <button
                  key={variable.key}
                  onClick={() => handleInsertVariable(variable.key)}
                  className="flex items-start gap-2 rounded-lg border p-2 text-left hover:border-primary/50 hover:bg-primary/5"
                >
                  <code className="shrink-0 rounded bg-muted px-1 py-0.5 font-mono text-xs">
                    {variable.key}
                  </code>
                  <span className="text-xs text-muted-foreground">{variable.description}</span>
                </button>
              ))}
              {/* Reference data variables */}
              {referenceDataVariables.map((variable) => (
                <button
                  key={variable.key}
                  onClick={() => handleInsertVariable(variable.key)}
                  className="flex items-start gap-2 rounded-lg border border-primary/30 bg-primary/5 p-2 text-left hover:border-primary/50 hover:bg-primary/10"
                >
                  <code className="shrink-0 rounded bg-primary/20 px-1 py-0.5 font-mono text-xs text-primary">
                    {variable.key}
                  </code>
                  <span className="text-xs text-muted-foreground">{variable.description}</span>
                </button>
              ))}
            </div>
          </div>

          {/* LLM Configuration - Compact single row */}
          <div className="space-y-3 border-t pt-4">
            <Label className="text-sm">LLM Configuration</Label>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <div className="space-y-1.5">
                <Label htmlFor="model" className="text-xs text-muted-foreground">
                  Model
                </Label>
                <Select value={model} onValueChange={handleModelChange}>
                  <SelectTrigger id="model" className="h-9">
                    <SelectValue placeholder="Select model" />
                  </SelectTrigger>
                  <SelectContent>
                    {LLM_MODELS.map((m) => (
                      <SelectItem key={m.model} value={m.model}>
                        {m.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="reasoning" className="text-xs text-muted-foreground">
                  Reasoning
                </Label>
                <Select
                  value={reasoningLevel}
                  onValueChange={(v) => setReasoningLevel(v as ReasoningLevel)}
                  disabled={!selectedModel?.supportsReasoning}
                >
                  <SelectTrigger id="reasoning" className="h-9">
                    <SelectValue placeholder="Level" />
                  </SelectTrigger>
                  <SelectContent>
                    {REASONING_LEVELS.map((level) => (
                      <SelectItem key={level.value} value={level.value}>
                        {level.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="temperature" className="text-xs text-muted-foreground">
                  Temperature ({temperature.toFixed(1)})
                </Label>
                <Slider
                  id="temperature"
                  min={0}
                  max={1}
                  step={0.1}
                  value={[temperature]}
                  onValueChange={([value]) => setTemperature(value)}
                  className="mt-3"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="maxTokens" className="text-xs text-muted-foreground">
                  Max Tokens
                </Label>
                <Input
                  id="maxTokens"
                  type="number"
                  min={1000}
                  max={8000}
                  step={100}
                  value={maxTokens}
                  onChange={(e) => setMaxTokens(parseInt(e.target.value) || 4000)}
                  className="h-9"
                />
              </div>
            </div>
          </div>

          {/* Reference Data Sources (less frequently used, at bottom) */}
          <div className="space-y-3 border-t pt-4">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm">Reference Data Sources</Label>
                <p className="text-xs text-muted-foreground">
                  Inject synced integration data (users, channels, etc.) as context.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={handleLoadReferenceData}
                disabled={isLoadingRefData || allocatedTools.length === 0}
              >
                {isLoadingRefData ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <RefreshCw className="h-3 w-3" />
                )}
                Load Available
              </Button>
            </div>

            {referenceDataSources.length > 0 ? (
              <div className="space-y-2">
                {referenceDataSources.map((source, index) => (
                  <div
                    key={`${source.integrationId}-${source.dataType}`}
                    className="flex items-center justify-between rounded-lg border p-2"
                  >
                    <div className="flex items-center gap-2">
                      <Database
                        className={cn(
                          'h-4 w-4',
                          source.enabled ? 'text-primary' : 'text-muted-foreground'
                        )}
                      />
                      <div className="flex items-center gap-2">
                        <span className="text-sm">{source.dataType}</span>
                        <Badge variant="outline" className="text-xs">
                          {source.integrationName}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          ({source.itemCount ?? 0} items)
                        </span>
                      </div>
                    </div>
                    <Switch
                      checked={source.enabled}
                      onCheckedChange={() => handleToggleReferenceDataSource(index)}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                {allocatedTools.length === 0
                  ? 'Add tools first to enable reference data.'
                  : 'Click "Load Available" to discover synced reference data.'}
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
