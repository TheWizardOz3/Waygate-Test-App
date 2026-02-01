'use client';

import { useState, useEffect, useMemo } from 'react';
import { Sparkles, Info, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useAgenticToolWizardStore, type SelectedToolMeta } from '@/stores/agenticToolWizard.store';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

// =============================================================================
// Schema Formatting Helpers
// =============================================================================

interface SchemaProperty {
  type?: string;
  description?: string;
  enum?: string[];
  format?: string;
  required?: boolean;
}

interface JsonSchema {
  type?: string;
  properties?: Record<string, SchemaProperty>;
  required?: string[];
  description?: string;
}

/**
 * Format a JSON Schema into a readable markdown-like format for the LLM prompt
 */
function formatSchemaForPrompt(toolMeta: SelectedToolMeta): string {
  const schema = toolMeta.inputSchema as JsonSchema | null;
  if (!schema || !schema.properties) {
    return `  (No schema available for ${toolMeta.toolName})`;
  }

  const requiredFields = new Set(schema.required || []);
  const lines: string[] = [];

  for (const [fieldName, fieldDef] of Object.entries(schema.properties)) {
    const isRequired = requiredFields.has(fieldName);
    const typeStr = fieldDef.type || 'any';
    const reqStr = isRequired ? ' (required)' : ' (optional)';
    const enumStr = fieldDef.enum ? ` - one of: ${fieldDef.enum.join(', ')}` : '';
    const descStr = fieldDef.description ? ` - ${fieldDef.description}` : '';

    lines.push(`  - ${fieldName}: ${typeStr}${reqStr}${enumStr}${descStr}`);
  }

  return lines.join('\n');
}

/**
 * Generate a schema-aware prompt for parameter interpreter mode
 */
function generateParameterInterpreterPrompt(toolsMeta: SelectedToolMeta[]): string {
  if (toolsMeta.length === 0) {
    return `You are a parameter generation assistant. Convert natural language requests into structured API parameters.

# User Request:
{{user_input}}

# Instructions:
1. Analyze the user's request to understand their intent
2. Generate structured JSON parameters based on the request
3. Return ONLY valid JSON

# Output Format:
{
  "parameter_name": "value"
}

Note: No tools have been selected yet. Select tools in the Tool Allocation step to generate a schema-aware prompt.`;
  }

  const schemaSection = toolsMeta
    .map((tool) => {
      const formattedSchema = formatSchemaForPrompt(tool);
      const contextPrefix = tool.integrationName ? `${tool.integrationName}: ` : '';
      return `## ${contextPrefix}${tool.toolName}
Tool: ${tool.toolSlug} (${tool.toolType})
${tool.description ? `Description: ${tool.description}\n` : ''}Parameters:
${formattedSchema}`;
    })
    .join('\n\n');

  return `You are a parameter generation assistant. Convert natural language requests into structured API parameters.

# User Request:
{{user_input}}

# Target Action Schema:
${schemaSection}

# Instructions:
1. Analyze the user's request to understand their intent
2. Use the schema above to identify the correct field names and valid values
3. Generate structured JSON parameters that match the schema
4. Return ONLY valid JSON - no explanations or markdown

# Output Format:
{
  "parameter_name": "value",
  "another_parameter": "value"
}

Be precise and use only fields defined in the schema. Pay attention to required vs optional fields.`;
}

/**
 * Generate a schema-aware prompt for autonomous agent mode
 */
function generateAutonomousAgentPrompt(toolsMeta: SelectedToolMeta[]): string {
  if (toolsMeta.length === 0) {
    return `You are an autonomous assistant. Accomplish tasks using the available tools.

# User Request:
{{user_input}}

# Instructions:
1. Analyze the request to understand what information or action is needed
2. Select appropriate tools and execute them
3. Synthesize findings into a clear answer

Note: No tools have been selected yet. Select tools in the Tool Allocation step to generate a tool-aware prompt.`;
  }

  const toolsSection = toolsMeta
    .map((tool) => {
      const schema = tool.inputSchema as JsonSchema | null;
      const params = schema?.properties
        ? Object.keys(schema.properties).join(', ')
        : 'no parameters';
      const contextPrefix = tool.integrationName ? ` (${tool.integrationName})` : '';
      // Use the AI-optimized description if available
      const desc = tool.description || tool.toolName;
      return `- **${tool.toolSlug}** [${tool.toolType}]${contextPrefix}: ${desc}
  Parameters: ${params}`;
    })
    .join('\n');

  return `You are an autonomous assistant. Accomplish tasks using the available tools.

# Available Tools:
${toolsSection}

# User Request:
{{user_input}}

# Instructions:
1. Analyze the request to understand what information or action is needed
2. Select appropriate tools from the available tools list above
3. Execute tools in sequence to gather or process information
4. Synthesize findings into a clear, well-structured answer
5. Always cite which tools you used and why

You can call tools multiple times. Continue until the task is fully satisfied or you reach safety limits.

# Tool Call Format:
When calling a tool, use valid JSON with the exact parameter names from the schema above.`;
}

// =============================================================================
// Variable Options
// =============================================================================

const VARIABLE_OPTIONS = [
  { key: '{{user_input}}', description: 'The natural language task/request from the user' },
  {
    key: '{{integration_schema}}',
    description: 'Schema for target integration (auto-injected at runtime)',
  },
  { key: '{{reference_data}}', description: 'Reference data from configured sources' },
  { key: '{{available_tools}}', description: 'List of tools available for autonomous mode' },
];

// =============================================================================
// Component
// =============================================================================

export function StepSystemPrompt() {
  const { data, setSystemPrompt, canProceed, getNextStep, goToStep } = useAgenticToolWizardStore();

  const [prompt, setPrompt] = useState(data.systemPrompt);
  const [showSchemaPreview, setShowSchemaPreview] = useState(false);

  // Get selected tools metadata (using unified tool abstraction)
  const selectedToolsMeta = useMemo(() => {
    return Object.values(data.selectedToolsMeta);
  }, [data.selectedToolsMeta]);

  useEffect(() => {
    setSystemPrompt(prompt);
  }, [prompt, setSystemPrompt]);

  useEffect(() => {
    // Auto-generate template if empty and actions are selected
    if (!prompt && selectedToolsMeta.length > 0) {
      handleGenerateSmartPrompt();
    } else if (!prompt) {
      // Generate basic template if no actions selected yet
      const template =
        data.executionMode === 'parameter_interpreter'
          ? generateParameterInterpreterPrompt([])
          : generateAutonomousAgentPrompt([]);
      setPrompt(template);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleGenerateSmartPrompt = () => {
    const template =
      data.executionMode === 'parameter_interpreter'
        ? generateParameterInterpreterPrompt(selectedToolsMeta)
        : generateAutonomousAgentPrompt(selectedToolsMeta);
    setPrompt(template);
  };

  const handleInsertVariable = (variable: string) => {
    setPrompt((prev) => prev + variable);
  };

  const handleNext = () => {
    const nextStep = getNextStep();
    if (nextStep && canProceed()) {
      goToStep(nextStep);
    }
  };

  return (
    <div className="space-y-6">
      {/* Info Alert */}
      <Alert>
        <Sparkles className="h-4 w-4" />
        <AlertDescription>
          Use variable placeholders like <code className="text-xs">{'{{user_input}}'}</code> that
          will be replaced with actual values at runtime.
        </AlertDescription>
      </Alert>

      {/* Selected Actions Summary */}
      {selectedToolsMeta.length > 0 && (
        <Card>
          <CardHeader className="py-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium">
                Selected Tools ({selectedToolsMeta.length})
              </CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={handleGenerateSmartPrompt}
                className="gap-2"
              >
                <Sparkles className="h-3 w-3" />
                Generate Schema-Aware Prompt
              </Button>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex flex-wrap gap-2">
              {selectedToolsMeta.map((tool) => (
                <Badge key={tool.toolId} variant="secondary">
                  {tool.integrationName ? `${tool.integrationName}: ` : ''}
                  {tool.toolName}
                </Badge>
              ))}
            </div>

            {/* Schema Preview */}
            <Collapsible open={showSchemaPreview} onOpenChange={setShowSchemaPreview}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="mt-3 gap-2 text-muted-foreground">
                  {showSchemaPreview ? (
                    <ChevronUp className="h-3 w-3" />
                  ) : (
                    <ChevronDown className="h-3 w-3" />
                  )}
                  {showSchemaPreview ? 'Hide' : 'Show'} Schema Preview
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="mt-2 max-h-48 overflow-y-auto rounded-md bg-muted/50 p-3 font-mono text-xs">
                  {selectedToolsMeta.map((tool) => (
                    <div key={tool.toolId} className="mb-3 last:mb-0">
                      <div className="font-semibold text-foreground">
                        {tool.integrationName ? `${tool.integrationName}: ` : ''}
                        {tool.toolName}
                        <span className="ml-2 text-xs font-normal text-muted-foreground">
                          [{tool.toolType}]
                        </span>
                      </div>
                      {tool.description && (
                        <div className="mt-1 text-muted-foreground">{tool.description}</div>
                      )}
                      <pre className="mt-1 whitespace-pre-wrap text-muted-foreground">
                        {formatSchemaForPrompt(tool)}
                      </pre>
                    </div>
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>
          </CardContent>
        </Card>
      )}

      {/* No Tools Warning */}
      {selectedToolsMeta.length === 0 && (
        <Alert variant="default">
          <Info className="h-4 w-4" />
          <AlertDescription>
            No tools selected yet. Go back to the Tool Allocation step to select tools, then return
            here to generate a schema-aware prompt.
          </AlertDescription>
        </Alert>
      )}

      <div className="space-y-4">
        {/* System Prompt */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="systemPrompt">System Prompt *</Label>
          </div>
          <Textarea
            id="systemPrompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Enter instructions for the embedded LLM..."
            rows={16}
            className="font-mono text-sm"
          />
          <p className="text-sm text-muted-foreground">
            Instructions that guide the embedded LLM. Use variables in double curly braces.
          </p>
        </div>

        {/* Variable Reference */}
        <div className="space-y-2">
          <Label>Available Variables</Label>
          <div className="grid gap-2">
            {VARIABLE_OPTIONS.map((variable) => (
              <button
                key={variable.key}
                onClick={() => handleInsertVariable(variable.key)}
                className="flex items-start gap-3 rounded-lg border p-3 text-left hover:border-violet-600 hover:bg-violet-600/5"
              >
                <code className="shrink-0 rounded bg-muted px-2 py-1 font-mono text-xs">
                  {variable.key}
                </code>
                <span className="text-sm text-muted-foreground">{variable.description}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Character count */}
        <div className="flex justify-end">
          <span className="text-xs text-muted-foreground">
            {prompt.length} characters (minimum 10)
          </span>
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
