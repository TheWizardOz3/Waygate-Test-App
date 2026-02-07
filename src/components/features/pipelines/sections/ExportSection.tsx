'use client';

import * as React from 'react';
import { Copy, Download, FileJson, Code2, Server, Loader2, AlertCircle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CopyButton } from '@/components/ui/copy-button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  usePipelineUniversalExport,
  usePipelineLangChainExport,
  usePipelineMCPExport,
  useUpdatePipeline,
} from '@/hooks/usePipelines';
import { toast } from 'sonner';
import type { PipelineDetailResponse } from '@/lib/modules/pipelines/pipeline.schemas';

// =============================================================================
// Types
// =============================================================================

interface ExportSectionProps {
  pipeline: PipelineDetailResponse;
  onUpdate: () => void;
}

type ExportFormat = 'universal' | 'langchain' | 'mcp';

// =============================================================================
// Component
// =============================================================================

export function ExportSection({ pipeline, onUpdate }: ExportSectionProps) {
  const [activeFormat, setActiveFormat] = React.useState<ExportFormat>('universal');
  const savedDescription = pipeline.toolDescription || pipeline.description || '';
  const [aiDescription, setAiDescription] = React.useState(savedDescription);
  const updatePipeline = useUpdatePipeline();

  React.useEffect(() => {
    const newSavedDescription = pipeline.toolDescription || pipeline.description || '';
    setAiDescription(newSavedDescription);
  }, [pipeline.toolDescription, pipeline.description]);

  const hasDescriptionChanges = aiDescription !== savedDescription;

  // Fetch exports from API
  const { data: universalExport, isLoading: isLoadingUniversal } = usePipelineUniversalExport(
    pipeline.id
  );

  const { data: langchainExport, isLoading: isLoadingLangChain } = usePipelineLangChainExport(
    pipeline.id
  );

  const { data: mcpExport, isLoading: isLoadingMCP } = usePipelineMCPExport(pipeline.id);

  const handleSaveDescription = async () => {
    try {
      await updatePipeline.mutateAsync({
        id: pipeline.id,
        toolDescription: aiDescription,
      });
      toast.success('Description saved');
      onUpdate();
    } catch {
      toast.error('Failed to save description');
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

  const getExportContent = (format: ExportFormat): string => {
    switch (format) {
      case 'universal':
        return universalExport ? JSON.stringify(universalExport, null, 2) : '';
      case 'langchain':
        return langchainExport
          ? typeof langchainExport === 'string'
            ? langchainExport
            : JSON.stringify(langchainExport, null, 2)
          : '';
      case 'mcp':
        return mcpExport ? JSON.stringify(mcpExport, null, 2) : '';
      default:
        return '';
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Download className="h-5 w-5" />
          Export
        </CardTitle>
        <CardDescription>
          Export this pipeline as a single tool for AI agents and LLM frameworks
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* AI Description */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label htmlFor="exportDescription">AI Tool Description</Label>
          </div>
          <Textarea
            id="exportDescription"
            value={aiDescription}
            onChange={(e) => setAiDescription(e.target.value)}
            placeholder="Describe what this pipeline tool does, what inputs it expects, and what it returns..."
            rows={3}
            className="resize-none"
          />
          <p className="text-xs text-muted-foreground">
            This description helps AI agents understand what your tool does. The pipeline&apos;s
            internal steps are hidden from the agent.
          </p>
          {hasDescriptionChanges && (
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setAiDescription(savedDescription)}
              >
                Reset
              </Button>
              <Button size="sm" onClick={handleSaveDescription} disabled={updatePipeline.isPending}>
                {updatePipeline.isPending ? (
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
        </div>

        {/* Format Selector Cards */}
        <div>
          <h4 className="mb-3 text-sm font-medium">Export Format</h4>
          <div className="grid gap-3 md:grid-cols-3">
            <FormatCard
              icon={FileJson}
              title="Universal Format"
              subtitle="OpenAI, Anthropic, Gemini"
              active={activeFormat === 'universal'}
              onClick={() => setActiveFormat('universal')}
            />
            <FormatCard
              icon={Code2}
              title="LangChain"
              subtitle="TypeScript integration"
              active={activeFormat === 'langchain'}
              onClick={() => setActiveFormat('langchain')}
            />
            <FormatCard
              icon={Server}
              title="MCP"
              subtitle="Claude Desktop"
              active={activeFormat === 'mcp'}
              onClick={() => setActiveFormat('mcp')}
            />
          </div>
        </div>

        {/* Export Content */}
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

          {(['universal', 'langchain', 'mcp'] as ExportFormat[]).map((format) => {
            const content = getExportContent(format);
            const isLoading =
              (format === 'universal' && isLoadingUniversal) ||
              (format === 'langchain' && isLoadingLangChain) ||
              (format === 'mcp' && isLoadingMCP);

            const titles: Record<ExportFormat, { title: string; description: string }> = {
              universal: { title: 'Tool Definition', description: 'LLM-agnostic JSON format' },
              langchain: {
                title: 'LangChain Integration',
                description: 'Ready-to-use TypeScript code',
              },
              mcp: { title: 'MCP Tool Schema', description: 'For Claude Desktop integration' },
            };

            const fileExtensions: Record<ExportFormat, { ext: string; type: string }> = {
              universal: { ext: '.json', type: 'application/json' },
              langchain: { ext: '.ts', type: 'text/typescript' },
              mcp: { ext: '-mcp.json', type: 'application/json' },
            };

            return (
              <TabsContent key={format} value={format} className="space-y-4">
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-sm">{titles[format].title}</CardTitle>
                        <CardDescription>{titles[format].description}</CardDescription>
                      </div>
                      {content && (
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleCopyToClipboard(content, titles[format].title)}
                          >
                            <Copy className="mr-2 h-4 w-4" />
                            Copy
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              handleDownload(
                                `${pipeline.slug}${fileExtensions[format].ext}`,
                                content,
                                fileExtensions[format].type
                              )
                            }
                          >
                            <Download className="mr-2 h-4 w-4" />
                            Download
                          </Button>
                        </div>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent>
                    {isLoading ? (
                      <div className="space-y-2">
                        <Skeleton className="h-4 w-full" />
                        <Skeleton className="h-4 w-3/4" />
                        <Skeleton className="h-4 w-1/2" />
                      </div>
                    ) : content ? (
                      <div className="relative">
                        <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-muted p-4 text-xs">
                          <code>{content}</code>
                        </pre>
                        <CopyButton
                          value={content}
                          label="Copied"
                          className="absolute right-2 top-2"
                        />
                      </div>
                    ) : (
                      <Alert>
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription>
                          Export not available. Make sure the pipeline has at least one step and an
                          active status.
                        </AlertDescription>
                      </Alert>
                    )}
                  </CardContent>
                </Card>

                {format === 'mcp' && (
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      To use this tool in Claude Desktop, add it to your Waygate MCP server
                      configuration. See the main Export tab for the full server setup.
                    </AlertDescription>
                  </Alert>
                )}
              </TabsContent>
            );
          })}
        </Tabs>
      </CardContent>
    </Card>
  );
}

// =============================================================================
// Format Card
// =============================================================================

function FormatCard({
  icon: Icon,
  title,
  subtitle,
  active,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <Card
      className={`cursor-pointer transition-colors ${active ? 'border-primary' : 'hover:border-muted-foreground/50'}`}
      onClick={onClick}
    >
      <CardHeader className="p-3 pb-1">
        <CardTitle className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <Icon className="h-4 w-4" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-3 pb-3 pt-0">
        <p className="text-sm">{subtitle}</p>
      </CardContent>
    </Card>
  );
}
