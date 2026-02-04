'use client';

import * as React from 'react';
import {
  Copy,
  Download,
  FileJson,
  Code2,
  Server,
  Loader2,
  Sparkles,
  AlertCircle,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CopyButton } from '@/components/ui/copy-button';
import { apiClient } from '@/lib/api/client';
import { toast } from 'sonner';
import type { CompositeToolDetailResponse } from '@/lib/modules/composite-tools/composite-tool.schemas';
import type { AgenticToolResponse } from '@/lib/modules/agentic-tools/agentic-tool.schemas';

// =============================================================================
// Types
// =============================================================================

interface ExportTabProps {
  tool: CompositeToolDetailResponse | AgenticToolResponse;
  toolType: 'composite' | 'agentic';
  onUpdate?: () => void;
}

type ExportFormat = 'universal' | 'langchain' | 'mcp';

interface UniversalToolExport {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, unknown>;
    required: string[];
  };
}

// =============================================================================
// Helpers
// =============================================================================

function generateUniversalExport(
  tool: CompositeToolDetailResponse | AgenticToolResponse,
  toolType: 'composite' | 'agentic',
  aiDescription?: string
): UniversalToolExport {
  // Use AI-generated description if provided, otherwise fall back to basic description
  const description = aiDescription || tool.description || `${tool.name} - AI Tool`;

  if (toolType === 'composite') {
    const compositeTool = tool as CompositeToolDetailResponse;
    const operations = compositeTool.operations || [];

    // Use the unifiedInputSchema if available - it contains the merged parameters from all operations
    const unifiedSchema = compositeTool.unifiedInputSchema as {
      type?: string;
      properties?: Record<string, unknown>;
      required?: string[];
    } | null;

    // If we have a unified schema with properties, use it
    if (unifiedSchema?.properties && Object.keys(unifiedSchema.properties).length > 0) {
      return {
        name: tool.slug,
        description,
        parameters: {
          type: 'object',
          properties: unifiedSchema.properties,
          required: unifiedSchema.required || [],
        },
      };
    }

    // Fallback: Build a basic schema for composite tools
    const properties: Record<string, unknown> = {};
    const required: string[] = [];

    if (compositeTool.routingMode === 'agent_driven') {
      properties['operation'] = {
        type: 'string',
        description: 'Which operation to perform',
        enum: operations.map((op) => op.operationSlug),
      };
      required.push('operation');
    }

    // Add a generic input property for composite tools
    if (operations.length > 0) {
      properties['input'] = {
        type: 'object',
        description: 'Input parameters for the selected operation',
        additionalProperties: true,
      };
    }

    return {
      name: tool.slug,
      description,
      parameters: {
        type: 'object',
        properties,
        required,
      },
    };
  } else {
    const agenticTool = tool as AgenticToolResponse;

    // Use the inputSchema if available
    const inputSchema = agenticTool.inputSchema as {
      type?: string;
      properties?: Record<string, unknown>;
      required?: string[];
    } | null;

    if (inputSchema?.properties && Object.keys(inputSchema.properties).length > 0) {
      return {
        name: tool.slug,
        description,
        parameters: {
          type: 'object',
          properties: inputSchema.properties,
          required: inputSchema.required || [],
        },
      };
    }

    // Fallback: Build a basic schema for agentic tools
    const allocation = agenticTool.toolAllocation as
      | {
          mode?: string;
          targetActions?: { actionId: string; actionSlug: string }[];
          availableTools?: { actionId: string; actionSlug: string }[];
        }
      | undefined;

    const properties: Record<string, unknown> = {
      task: {
        type: 'string',
        description: 'The task or request in natural language',
      },
    };

    if (agenticTool.executionMode === 'autonomous_agent' && allocation?.availableTools) {
      properties['preferred_tools'] = {
        type: 'array',
        items: {
          type: 'string',
          enum: allocation.availableTools.map((t) => t.actionSlug),
        },
        description: 'Optional: specific tools to prefer using',
      };
    }

    return {
      name: tool.slug,
      description,
      parameters: {
        type: 'object',
        properties,
        required: ['task'],
      },
    };
  }
}

function generateLangChainExport(universalExport: UniversalToolExport): string {
  return `import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";

// ${universalExport.name} Tool
const ${toCamelCase(universalExport.name)}Tool = new DynamicStructuredTool({
  name: "${universalExport.name}",
  description: \`${universalExport.description}\`,
  schema: z.object({
${Object.entries(universalExport.parameters.properties)
  .map(([key, value]) => {
    const v = value as { type?: string; description?: string; enum?: string[] };
    let zodType = 'z.string()';
    if (v.type === 'number') zodType = 'z.number()';
    if (v.type === 'boolean') zodType = 'z.boolean()';
    if (v.type === 'array') zodType = 'z.array(z.string())';
    if (v.enum) zodType = `z.enum([${v.enum.map((e) => `"${e}"`).join(', ')}])`;
    const optional = !universalExport.parameters.required.includes(key) ? '.optional()' : '';
    const desc = v.description ? `.describe("${v.description}")` : '';
    return `    ${key}: ${zodType}${optional}${desc},`;
  })
  .join('\n')}
  }),
  func: async (input) => {
    const response = await fetch(\`\${WAYGATE_API_BASE}/${universalExport.name}/invoke\`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-waygate-api-key': process.env.WAYGATE_API_KEY!,
      },
      body: JSON.stringify(input),
    });
    return response.json();
  },
});

export { ${toCamelCase(universalExport.name)}Tool };`;
}

function generateMCPExport(universalExport: UniversalToolExport): string {
  return JSON.stringify(
    {
      name: universalExport.name,
      description: universalExport.description,
      inputSchema: universalExport.parameters,
    },
    null,
    2
  );
}

function toCamelCase(str: string): string {
  return str
    .replace(/[-_](.)/g, (_, c) => c.toUpperCase())
    .replace(/^(.)/, (_, c) => c.toLowerCase());
}

// =============================================================================
// Component
// =============================================================================

export function ExportTab({ tool, toolType, onUpdate }: ExportTabProps) {
  const [activeFormat, setActiveFormat] = React.useState<ExportFormat>('universal');
  // Prefer toolDescription (AI-generated) over basic description
  const savedDescription = tool.toolDescription || tool.description || '';
  const [aiDescription, setAiDescription] = React.useState(savedDescription);
  const [isGenerating, setIsGenerating] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);

  // Sync state when tool data changes (e.g., after generating new description)
  React.useEffect(() => {
    const newSavedDescription = tool.toolDescription || tool.description || '';
    setAiDescription(newSavedDescription);
  }, [tool.toolDescription, tool.description]);

  const hasDescriptionChanges = aiDescription !== savedDescription;

  // Generate exports
  const universalExport = React.useMemo(
    () => generateUniversalExport(tool, toolType, aiDescription),
    [tool, toolType, aiDescription]
  );

  const langchainExport = React.useMemo(
    () => generateLangChainExport(universalExport),
    [universalExport]
  );

  const mcpExport = React.useMemo(() => generateMCPExport(universalExport), [universalExport]);

  const handleGenerateDescription = async () => {
    setIsGenerating(true);
    try {
      const endpoint =
        toolType === 'agentic'
          ? `/agentic-tools/${tool.id}/regenerate-prompt`
          : `/composite-tools/${tool.id}/regenerate-description`;

      // apiClient already unwraps { success, data } and returns just 'data'
      // So result is directly: { compositeTool, regenerated } or { agenticTool, regenerated }
      const result = await apiClient.post<{
        compositeTool?: { toolDescription?: string };
        agenticTool?: { toolDescription?: string };
        regenerated?: { toolDescription?: string };
        toolDescription?: string;
      }>(endpoint, {});

      // Extract the description - apiClient returns data.data, so access directly
      const newDescription =
        result.regenerated?.toolDescription ||
        result.compositeTool?.toolDescription ||
        result.agenticTool?.toolDescription ||
        result.toolDescription ||
        '';

      if (newDescription) {
        setAiDescription(newDescription);
        toast.success('AI description generated');
        onUpdate?.(); // Refresh tool data
      } else {
        console.error('No toolDescription found in response:', result);
        toast.error('Generated description was empty');
      }
    } catch (error) {
      console.error('Failed to generate description:', error);
      toast.error('Failed to generate description');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSaveDescription = async () => {
    setIsSaving(true);
    try {
      const endpoint =
        toolType === 'agentic' ? `/agentic-tools/${tool.id}` : `/composite-tools/${tool.id}`;

      await apiClient.patch(endpoint, { description: aiDescription });
      toast.success('Description saved');
      onUpdate?.();
    } catch (error) {
      console.error('Failed to save description:', error);
      toast.error('Failed to save description');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDownload = (filename: string, content: string, contentType = 'application/json') => {
    const blob = new Blob([content], { type: contentType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(`Downloaded ${filename}`);
  };

  const handleCopyToClipboard = async (content: string, label: string) => {
    try {
      await navigator.clipboard.writeText(content);
      toast.success(`${label} copied to clipboard`);
    } catch {
      toast.error('Failed to copy to clipboard');
    }
  };

  return (
    <div className="space-y-6">
      {/* AI Description Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>AI Tool Description</CardTitle>
              <CardDescription>
                This description helps AI agents understand what your tool does
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleGenerateDescription}
              disabled={isGenerating}
              className="gap-2"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  Generate with AI
                </>
              )}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="aiDescription">Description</Label>
            <Textarea
              id="aiDescription"
              value={aiDescription}
              onChange={(e) => setAiDescription(e.target.value)}
              placeholder="Describe what this tool does, what inputs it expects, and what it returns..."
              rows={4}
              className="resize-none"
            />
            <p className="text-xs text-muted-foreground">
              A clear description improves AI agent accuracy when selecting and using this tool.
            </p>
          </div>

          {hasDescriptionChanges && (
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setAiDescription(savedDescription)}
              >
                Reset
              </Button>
              <Button size="sm" onClick={handleSaveDescription} disabled={isSaving}>
                {isSaving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Save Description'
                )}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Export Formats */}
      <div className="space-y-4">
        <h3 className="text-sm font-medium">Export Format</h3>

        {/* Format Cards */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card
            className={`cursor-pointer transition-colors ${activeFormat === 'universal' ? 'border-primary' : 'hover:border-muted-foreground/50'}`}
            onClick={() => setActiveFormat('universal')}
          >
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <FileJson className="h-4 w-4" />
                Universal Format
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm">OpenAI, Anthropic, Gemini</p>
            </CardContent>
          </Card>
          <Card
            className={`cursor-pointer transition-colors ${activeFormat === 'langchain' ? 'border-primary' : 'hover:border-muted-foreground/50'}`}
            onClick={() => setActiveFormat('langchain')}
          >
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <Code2 className="h-4 w-4" />
                LangChain
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm">TypeScript integration</p>
            </CardContent>
          </Card>
          <Card
            className={`cursor-pointer transition-colors ${activeFormat === 'mcp' ? 'border-primary' : 'hover:border-muted-foreground/50'}`}
            onClick={() => setActiveFormat('mcp')}
          >
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <Server className="h-4 w-4" />
                MCP
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm">Claude Desktop</p>
            </CardContent>
          </Card>
        </div>

        {/* Format Tabs Content */}
        <Tabs value={activeFormat} onValueChange={(v) => setActiveFormat(v as ExportFormat)}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="universal" className="gap-2">
              <FileJson className="h-4 w-4" />
              Universal
            </TabsTrigger>
            <TabsTrigger value="langchain" className="gap-2">
              <Code2 className="h-4 w-4" />
              LangChain
            </TabsTrigger>
            <TabsTrigger value="mcp" className="gap-2">
              <Server className="h-4 w-4" />
              MCP
            </TabsTrigger>
          </TabsList>

          {/* Universal Format */}
          <TabsContent value="universal" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Tool Definition</CardTitle>
                    <CardDescription>LLM-agnostic JSON format</CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        handleCopyToClipboard(
                          JSON.stringify(universalExport, null, 2),
                          'Tool definition'
                        )
                      }
                    >
                      <Copy className="mr-2 h-4 w-4" />
                      Copy
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        handleDownload(
                          `${tool.slug}-tool.json`,
                          JSON.stringify(universalExport, null, 2)
                        )
                      }
                    >
                      <Download className="mr-2 h-4 w-4" />
                      Download
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="relative">
                  <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-muted p-4 text-xs">
                    <code>{JSON.stringify(universalExport, null, 2)}</code>
                  </pre>
                  <CopyButton
                    value={JSON.stringify(universalExport, null, 2)}
                    label="Copied"
                    className="absolute right-2 top-2"
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* LangChain Format */}
          <TabsContent value="langchain" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>LangChain Integration</CardTitle>
                    <CardDescription>Ready-to-use TypeScript code</CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleCopyToClipboard(langchainExport, 'LangChain code')}
                    >
                      <Copy className="mr-2 h-4 w-4" />
                      Copy
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        handleDownload(`${tool.slug}-tool.ts`, langchainExport, 'text/typescript')
                      }
                    >
                      <Download className="mr-2 h-4 w-4" />
                      Download
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="relative">
                  <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-muted p-4 text-xs">
                    <code>{langchainExport}</code>
                  </pre>
                  <CopyButton
                    value={langchainExport}
                    label="Copied"
                    className="absolute right-2 top-2"
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* MCP Format */}
          <TabsContent value="mcp" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>MCP Tool Schema</CardTitle>
                    <CardDescription>For Claude Desktop integration</CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleCopyToClipboard(mcpExport, 'MCP schema')}
                    >
                      <Copy className="mr-2 h-4 w-4" />
                      Copy
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDownload(`${tool.slug}-mcp.json`, mcpExport)}
                    >
                      <Download className="mr-2 h-4 w-4" />
                      Download
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="relative">
                  <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-muted p-4 text-xs">
                    <code>{mcpExport}</code>
                  </pre>
                  <CopyButton value={mcpExport} label="Copied" className="absolute right-2 top-2" />
                </div>
              </CardContent>
            </Card>

            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                To use this tool in Claude Desktop, add it to your Waygate MCP server configuration.
                See the main Export tab for the full server setup.
              </AlertDescription>
            </Alert>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
