'use client';

import { useState } from 'react';
import {
  useAllToolsUniversalExport,
  useAllToolsLangChainExport,
  useAllToolsMCPExport,
} from '@/hooks/useToolExport';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CopyButton } from '@/components/ui/copy-button';
import {
  Wrench,
  Download,
  Copy,
  Code2,
  Server,
  FileJson,
  AlertCircle,
  ExternalLink,
  Layers,
  Bot,
  Zap,
} from 'lucide-react';
import { toast } from 'sonner';

type ExportFormat = 'universal' | 'langchain' | 'mcp';

export function AllToolsExportTab() {
  const [activeFormat, setActiveFormat] = useState<ExportFormat>('universal');

  const {
    data: universalData,
    isLoading: universalLoading,
    isError: universalError,
  } = useAllToolsUniversalExport();

  const {
    data: langchainData,
    isLoading: langchainLoading,
    isError: langchainError,
  } = useAllToolsLangChainExport();

  const { data: mcpData, isLoading: mcpLoading, isError: mcpError } = useAllToolsMCPExport();

  const toolCount = universalData?.summary?.total ?? 0;
  const simpleCount = universalData?.summary?.simple ?? 0;
  const compositeCount = universalData?.summary?.composite ?? 0;
  const agenticCount = universalData?.summary?.agentic ?? 0;

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
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Export All Tools</h2>
          <p className="text-sm text-muted-foreground">
            Export all your tools (simple, composite, and agentic) for AI consumption
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="gap-1">
            <Wrench className="h-3 w-3" />
            {universalLoading ? '...' : toolCount} tools
          </Badge>
        </div>
      </div>

      {/* Tool Summary */}
      {!universalLoading && toolCount > 0 && (
        <div className="grid gap-3 sm:grid-cols-3">
          <Card className="border-emerald-500/20 bg-emerald-500/5">
            <CardContent className="flex items-center gap-3 p-4">
              <Zap className="h-5 w-5 text-emerald-600" />
              <div>
                <p className="text-sm font-medium">{simpleCount} Simple Tools</p>
                <p className="text-xs text-muted-foreground">Individual API actions</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-violet-500/20 bg-violet-500/5">
            <CardContent className="flex items-center gap-3 p-4">
              <Layers className="h-5 w-5 text-violet-600" />
              <div>
                <p className="text-sm font-medium">{compositeCount} Composite Tools</p>
                <p className="text-xs text-muted-foreground">Multi-action workflows</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-amber-500/20 bg-amber-500/5">
            <CardContent className="flex items-center gap-3 p-4">
              <Bot className="h-5 w-5 text-amber-600" />
              <div>
                <p className="text-sm font-medium">{agenticCount} Agentic Tools</p>
                <p className="text-xs text-muted-foreground">AI-powered tools</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Format Summary Cards */}
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
            <p className="text-sm">OpenAI, Anthropic, Gemini compatible</p>
          </CardContent>
        </Card>
        <Card
          className={`cursor-pointer transition-colors ${activeFormat === 'langchain' ? 'border-primary' : 'hover:border-muted-foreground/50'}`}
          onClick={() => setActiveFormat('langchain')}
        >
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Code2 className="h-4 w-4" />
              LangChain Format
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">TypeScript and Python code snippets</p>
          </CardContent>
        </Card>
        <Card
          className={`cursor-pointer transition-colors ${activeFormat === 'mcp' ? 'border-primary' : 'hover:border-muted-foreground/50'}`}
          onClick={() => setActiveFormat('mcp')}
        >
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Server className="h-4 w-4" />
              MCP Server
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">Ready-to-use for Claude Desktop</p>
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

        {/* Universal Format Tab */}
        <TabsContent value="universal" className="space-y-4">
          {universalLoading ? (
            <ExportSkeleton />
          ) : universalError ? (
            <ErrorCard message="Failed to load universal export" />
          ) : universalData && universalData.tools.length > 0 ? (
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>Tool Definitions</CardTitle>
                      <CardDescription>
                        LLM-agnostic format with mini-prompt descriptions
                      </CardDescription>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          handleCopyToClipboard(
                            JSON.stringify(universalData.tools, null, 2),
                            'Tool definitions'
                          )
                        }
                      >
                        <Copy className="mr-2 h-4 w-4" />
                        Copy JSON
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          handleDownload(
                            'waygate-all-tools.json',
                            JSON.stringify(universalData, null, 2)
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
                    <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-muted p-4 text-xs">
                      <code>{JSON.stringify(universalData.tools, null, 2)}</code>
                    </pre>
                    <CopyButton
                      value={JSON.stringify(universalData.tools, null, 2)}
                      label="Copied to clipboard"
                      className="absolute right-2 top-2"
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Context Types */}
              {universalData.contextTypes.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Available Context Types</CardTitle>
                    <CardDescription>
                      Reference data that can be injected for name-to-ID resolution
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2">
                      {universalData.contextTypes.map((contextType) => (
                        <Badge key={contextType} variant="outline">
                          {contextType}
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          ) : (
            <EmptyCard />
          )}
        </TabsContent>

        {/* LangChain Format Tab */}
        <TabsContent value="langchain" className="space-y-4">
          {langchainLoading ? (
            <ExportSkeleton />
          ) : langchainError ? (
            <ErrorCard message="Failed to load LangChain export" />
          ) : langchainData && langchainData.tools.length > 0 ? (
            <div className="space-y-4">
              {/* TypeScript Snippet */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>TypeScript Integration</CardTitle>
                      <CardDescription>Ready-to-use code for LangChain.js</CardDescription>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          handleCopyToClipboard(
                            langchainData.codeSnippets.typescript,
                            'TypeScript code'
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
                            'waygate-all-tools-langchain.ts',
                            langchainData.codeSnippets.typescript,
                            'text/typescript'
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
                      <code>{langchainData.codeSnippets.typescript}</code>
                    </pre>
                    <CopyButton
                      value={langchainData.codeSnippets.typescript}
                      label="Copied to clipboard"
                      className="absolute right-2 top-2"
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Python Snippet */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>Python Integration</CardTitle>
                      <CardDescription>Ready-to-use code for LangChain Python</CardDescription>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          handleCopyToClipboard(langchainData.codeSnippets.python, 'Python code')
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
                            'waygate_all_tools_langchain.py',
                            langchainData.codeSnippets.python,
                            'text/x-python'
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
                      <code>{langchainData.codeSnippets.python}</code>
                    </pre>
                    <CopyButton
                      value={langchainData.codeSnippets.python}
                      label="Copied to clipboard"
                      className="absolute right-2 top-2"
                    />
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : (
            <EmptyCard />
          )}
        </TabsContent>

        {/* MCP Format Tab */}
        <TabsContent value="mcp" className="space-y-4">
          {mcpLoading ? (
            <ExportSkeleton />
          ) : mcpError ? (
            <ErrorCard message="Failed to load MCP export" />
          ) : mcpData && mcpData.server.tools.length > 0 ? (
            <div className="space-y-4">
              {/* Quick Start */}
              <Card className="border-primary/20 bg-primary/5">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Server className="h-5 w-5" />
                    MCP Server for Claude Desktop
                  </CardTitle>
                  <CardDescription>
                    Use all your Waygate tools directly in Claude Desktop
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="rounded-lg bg-background p-4">
                    <h4 className="mb-2 font-medium">Quick Setup</h4>
                    <ol className="list-inside list-decimal space-y-2 text-sm text-muted-foreground">
                      <li>Download the server files below</li>
                      <li>
                        Run <code className="rounded bg-muted px-1">npm install</code> in the server
                        directory
                      </li>
                      <li>
                        Set your <code className="rounded bg-muted px-1">WAYGATE_API_KEY</code>{' '}
                        environment variable
                      </li>
                      <li>Add the config snippet to your Claude Desktop settings</li>
                    </ol>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      onClick={() => {
                        handleDownload(
                          'waygate-all-tools-mcp-server.ts',
                          mcpData.serverFile.typescript,
                          'text/typescript'
                        );
                      }}
                    >
                      <Download className="mr-2 h-4 w-4" />
                      Download Server
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        handleDownload('package.json', mcpData.serverFile.packageJson);
                      }}
                    >
                      <Download className="mr-2 h-4 w-4" />
                      package.json
                    </Button>
                    <Button variant="outline" asChild>
                      <a
                        href="https://docs.anthropic.com/en/build-with-claude/mcp"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <ExternalLink className="mr-2 h-4 w-4" />
                        MCP Docs
                      </a>
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Claude Desktop Config */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>Claude Desktop Configuration</CardTitle>
                      <CardDescription>Add this to your claude_desktop_config.json</CardDescription>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        handleCopyToClipboard(
                          mcpData.serverFile.claudeDesktopConfig,
                          'Config snippet'
                        )
                      }
                    >
                      <Copy className="mr-2 h-4 w-4" />
                      Copy
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="relative">
                    <pre className="overflow-auto whitespace-pre-wrap break-words rounded-lg bg-muted p-4 text-xs">
                      <code>{mcpData.serverFile.claudeDesktopConfig}</code>
                    </pre>
                    <CopyButton
                      value={mcpData.serverFile.claudeDesktopConfig}
                      label="Copied to clipboard"
                      className="absolute right-2 top-2"
                    />
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : (
            <EmptyCard />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ExportSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-64" />
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <Skeleton className="h-32 w-full" />
          <div className="flex gap-2">
            <Skeleton className="h-9 w-24" />
            <Skeleton className="h-9 w-24" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ErrorCard({ message }: { message: string }) {
  return (
    <Card>
      <CardContent className="flex items-center justify-center py-8">
        <div className="flex flex-col items-center gap-2 text-center">
          <AlertCircle className="h-8 w-8 text-destructive" />
          <p className="font-medium">{message}</p>
          <p className="text-sm text-muted-foreground">
            Please try again or contact support if the error persists.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyCard() {
  return (
    <Card>
      <CardContent className="flex items-center justify-center py-8">
        <div className="flex flex-col items-center gap-2 text-center">
          <Wrench className="h-8 w-8 text-muted-foreground" />
          <p className="font-medium">No tools available</p>
          <p className="text-sm text-muted-foreground">
            Create actions in your integrations or add composite/agentic tools to export them.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

export default AllToolsExportTab;
