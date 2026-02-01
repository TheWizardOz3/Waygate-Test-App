'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  AlertCircle,
  LayoutDashboard,
  Layers,
  GitBranch,
  FileText,
  Download,
  MoreHorizontal,
  Trash2,
  Loader2,
  Check,
  RefreshCw,
  Copy,
  Wand2,
  Bot,
  Sparkles,
  ExternalLink,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  useCompositeTool,
  useUpdateCompositeTool,
  useDeleteCompositeTool,
  useRegenerateDescription,
  useCompositeToolUniversalExport,
  useCompositeToolLangChainExport,
  useCompositeToolMCPExport,
} from '@/hooks/useCompositeTools';
import { cn } from '@/lib/utils';
import type {
  CompositeToolStatus,
  CompositeToolDetailResponse,
} from '@/lib/modules/composite-tools/composite-tool.schemas';

// =============================================================================
// Types
// =============================================================================

interface CompositeToolDetailProps {
  toolId: string;
}

// =============================================================================
// Helpers
// =============================================================================

function getStatusBadgeVariant(status: CompositeToolStatus) {
  switch (status) {
    case 'active':
      return 'default';
    case 'draft':
      return 'secondary';
    case 'disabled':
      return 'outline';
    default:
      return 'secondary';
  }
}

// =============================================================================
// Main Component
// =============================================================================

export function CompositeToolDetail({ toolId }: CompositeToolDetailProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTab = searchParams.get('tab') || 'overview';
  const [activeTab, setActiveTab] = React.useState(initialTab);

  const { data: tool, isLoading, isError, error } = useCompositeTool(toolId);
  const deleteTool = useDeleteCompositeTool();

  const handleDelete = async () => {
    if (confirm('Are you sure you want to delete this tool? This cannot be undone.')) {
      await deleteTool.mutateAsync(toolId);
      router.push('/ai-tools');
    }
  };

  if (isLoading) {
    return <CompositeToolDetailSkeleton />;
  }

  if (isError || !tool) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Failed to load tool</AlertTitle>
        <AlertDescription>
          {error instanceof Error ? error.message : 'An unknown error occurred'}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <Button variant="ghost" size="icon" asChild className="mt-1 shrink-0">
            <Link href="/ai-tools">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500/10 to-indigo-500/10">
              <Wand2 className="h-6 w-6 text-violet-600 dark:text-violet-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-heading text-2xl font-bold">{tool.name}</h1>
                <Badge variant={getStatusBadgeVariant(tool.status)}>{tool.status}</Badge>
              </div>
              <code className="text-sm text-muted-foreground">{tool.slug}</code>
            </div>
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={handleDelete}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete Tool
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="h-auto w-full justify-start rounded-none border-b bg-transparent p-0">
          <TabsTrigger
            value="overview"
            className="relative gap-2 rounded-none border-b-2 border-transparent px-4 pb-3 pt-2 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
          >
            <LayoutDashboard className="h-4 w-4" />
            Overview
          </TabsTrigger>
          <TabsTrigger
            value="operations"
            className="relative gap-2 rounded-none border-b-2 border-transparent px-4 pb-3 pt-2 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
          >
            <Layers className="h-4 w-4" />
            Operations ({tool.operations.length})
          </TabsTrigger>
          <TabsTrigger
            value="routing"
            className="relative gap-2 rounded-none border-b-2 border-transparent px-4 pb-3 pt-2 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
          >
            <GitBranch className="h-4 w-4" />
            Routing
          </TabsTrigger>
          <TabsTrigger
            value="description"
            className="relative gap-2 rounded-none border-b-2 border-transparent px-4 pb-3 pt-2 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
          >
            <FileText className="h-4 w-4" />
            AI Description
          </TabsTrigger>
          <TabsTrigger
            value="export"
            className="relative gap-2 rounded-none border-b-2 border-transparent px-4 pb-3 pt-2 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
          >
            <Download className="h-4 w-4" />
            Export
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <OverviewTab tool={tool} />
        </TabsContent>
        <TabsContent value="operations">
          <OperationsTab tool={tool} />
        </TabsContent>
        <TabsContent value="routing">
          <RoutingTab tool={tool} />
        </TabsContent>
        <TabsContent value="description">
          <DescriptionTab tool={tool} />
        </TabsContent>
        <TabsContent value="export">
          <ExportTab toolId={toolId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// =============================================================================
// Overview Tab
// =============================================================================

function OverviewTab({ tool }: { tool: CompositeToolDetailResponse }) {
  const [isEditing, setIsEditing] = React.useState(false);
  const [name, setName] = React.useState(tool.name);
  const [description, setDescription] = React.useState(tool.description || '');
  const [status, setStatus] = React.useState(tool.status);

  const updateTool = useUpdateCompositeTool();

  const handleSave = async () => {
    await updateTool.mutateAsync({
      id: tool.id,
      name,
      description: description || null,
      status,
    });
    setIsEditing(false);
  };

  const handleCancel = () => {
    setName(tool.name);
    setDescription(tool.description || '');
    setStatus(tool.status);
    setIsEditing(false);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Basic Information</CardTitle>
            {!isEditing && (
              <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
                Edit
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Name</Label>
            {isEditing ? (
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            ) : (
              <p className="text-sm">{tool.name}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label>Slug</Label>
            <code className="block rounded bg-muted px-2 py-1 text-sm">{tool.slug}</code>
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            {isEditing ? (
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe what this tool does..."
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                {tool.description || 'No description'}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label>Status</Label>
            {isEditing ? (
              <Select value={status} onValueChange={(v) => setStatus(v as CompositeToolStatus)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="disabled">Disabled</SelectItem>
                </SelectContent>
              </Select>
            ) : (
              <Badge variant={getStatusBadgeVariant(tool.status)}>{tool.status}</Badge>
            )}
          </div>
          {isEditing && (
            <div className="flex gap-2 pt-2">
              <Button onClick={handleSave} disabled={updateTool.isPending}>
                {updateTool.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Changes
              </Button>
              <Button variant="outline" onClick={handleCancel}>
                Cancel
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Configuration Summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Routing Mode</span>
            <Badge variant="outline" className="gap-1">
              {tool.routingMode === 'rule_based' ? (
                <>
                  <GitBranch className="h-3 w-3" />
                  Rule-Based
                </>
              ) : (
                <>
                  <Bot className="h-3 w-3" />
                  Agent-Driven
                </>
              )}
            </Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Operations</span>
            <span className="font-medium">{tool.operations.length}</span>
          </div>
          {tool.routingMode === 'rule_based' && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Routing Rules</span>
              <span className="font-medium">{tool.routingRules.length}</span>
            </div>
          )}
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">AI Description</span>
            <span className="font-medium">
              {tool.toolDescription ? 'Configured' : 'Not configured'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Created</span>
            <span className="text-sm">{new Date(tool.createdAt).toLocaleDateString()}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Last Updated</span>
            <span className="text-sm">{new Date(tool.updatedAt).toLocaleDateString()}</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// =============================================================================
// Operations Tab
// =============================================================================

function OperationsTab({ tool }: { tool: CompositeToolDetailResponse }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-medium">Operations</h3>
          <p className="text-sm text-muted-foreground">
            Actions that are part of this composite tool.
          </p>
        </div>
      </div>

      <div className="space-y-2">
        {tool.operations.map((op, index) => (
          <Card key={op.id} className="group">
            <CardContent className="flex items-center gap-4 p-4">
              <Badge variant="outline">{index + 1}</Badge>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{op.displayName}</p>
                <code className="text-xs text-muted-foreground">{op.operationSlug}</code>
                {op.action && (
                  <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                    <Sparkles className="h-3 w-3" />
                    <span>{op.action.integration.name}</span>
                    <span>/</span>
                    <span>{op.action.name}</span>
                  </div>
                )}
              </div>
              {op.action && (
                <Link
                  href={`/integrations/${op.action.integrationId}/actions/${op.actionId}`}
                  className="flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-primary"
                >
                  <span className="hidden sm:inline">View Action</span>
                  <ExternalLink className="h-4 w-4" />
                </Link>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

// =============================================================================
// Routing Tab
// =============================================================================

function RoutingTab({ tool }: { tool: CompositeToolDetailResponse }) {
  if (tool.routingMode === 'agent_driven') {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Bot className="h-5 w-5" />
            <CardTitle>Agent-Driven Selection</CardTitle>
          </div>
          <CardDescription>
            The AI agent chooses which operation to use based on context.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            When this tool is exported, it will include an &quot;operation&quot; parameter as an
            enum. The agent will see all available operations and select the appropriate one.
          </p>
          <div className="mt-4 space-y-2">
            <p className="text-sm font-medium">Available operations:</p>
            {tool.operations.map((op) => (
              <div key={op.id} className="flex items-center gap-2 text-sm">
                <code className="rounded bg-muted px-2 py-0.5">{op.operationSlug}</code>
                <span className="text-muted-foreground">- {op.displayName}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <GitBranch className="h-5 w-5" />
            <CardTitle>Rule-Based Routing</CardTitle>
          </div>
          <CardDescription>
            Requests are automatically routed based on matching conditions.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {tool.routingRules.length === 0 ? (
            <p className="text-sm text-muted-foreground">No routing rules configured.</p>
          ) : (
            <div className="space-y-2">
              {tool.routingRules
                .sort((a, b) => a.priority - b.priority)
                .map((rule, index) => (
                  <div
                    key={rule.id}
                    className="flex items-center gap-3 rounded-lg border bg-muted/30 p-3"
                  >
                    <Badge variant="outline">{index + 1}</Badge>
                    <div className="flex-1 text-sm">
                      If <code className="rounded bg-muted px-1">{rule.conditionField}</code>{' '}
                      {rule.conditionType.replace('_', ' ')}{' '}
                      <code className="rounded bg-muted px-1">
                        &quot;{rule.conditionValue}&quot;
                      </code>
                      {!rule.caseSensitive && (
                        <span className="text-muted-foreground"> (case-insensitive)</span>
                      )}
                    </div>
                    <span className="text-muted-foreground">→</span>
                    <code className="rounded bg-primary/10 px-2 py-0.5 text-primary">
                      {tool.operations.find((op) => op.id === rule.operationId)?.operationSlug ||
                        'Unknown'}
                    </code>
                  </div>
                ))}
            </div>
          )}
          {tool.defaultOperationId && (
            <div className="mt-4 rounded-lg border border-dashed bg-muted/20 p-3">
              <p className="text-sm">
                <span className="text-muted-foreground">Default (no rule matches):</span>{' '}
                <code className="rounded bg-muted px-1">
                  {tool.operations.find((op) => op.id === tool.defaultOperationId)?.operationSlug ||
                    'Unknown'}
                </code>
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// =============================================================================
// Description Tab
// =============================================================================

function DescriptionTab({ tool }: { tool: CompositeToolDetailResponse }) {
  const [description, setDescription] = React.useState(tool.toolDescription || '');
  const [successTemplate, setSuccessTemplate] = React.useState(tool.toolSuccessTemplate || '');
  const [errorTemplate, setErrorTemplate] = React.useState(tool.toolErrorTemplate || '');
  const [isEditing, setIsEditing] = React.useState(false);

  const updateTool = useUpdateCompositeTool();
  const regenerate = useRegenerateDescription();

  const handleSave = async () => {
    await updateTool.mutateAsync({
      id: tool.id,
      toolDescription: description || null,
      toolSuccessTemplate: successTemplate || null,
      toolErrorTemplate: errorTemplate || null,
    });
    setIsEditing(false);
  };

  const handleRegenerate = async () => {
    const result = await regenerate.mutateAsync(tool.id);
    setDescription(result.toolDescription);
    setSuccessTemplate(result.toolSuccessTemplate);
    setErrorTemplate(result.toolErrorTemplate);
    setIsEditing(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-medium">AI Tool Description</h3>
          <p className="text-sm text-muted-foreground">
            LLM-optimized descriptions used when exporting this tool.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={handleRegenerate}
            disabled={regenerate.isPending}
            className="gap-2"
          >
            {regenerate.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            {tool.toolDescription ? 'Regenerate' : 'Generate'}
          </Button>
          {!isEditing && tool.toolDescription && (
            <Button variant="outline" onClick={() => setIsEditing(true)}>
              Edit
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tool Description</CardTitle>
          <CardDescription>
            The main description shown to the AI agent. Includes usage instructions.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isEditing ? (
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="min-h-[200px] font-mono text-sm"
              placeholder="Enter the tool description..."
            />
          ) : description ? (
            <pre className="whitespace-pre-wrap rounded bg-muted p-4 text-sm">{description}</pre>
          ) : (
            <p className="text-sm italic text-muted-foreground">
              No description configured. Click &quot;Generate&quot; to create one.
            </p>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Success Template</CardTitle>
            <CardDescription>Message format when the tool succeeds.</CardDescription>
          </CardHeader>
          <CardContent>
            {isEditing ? (
              <Textarea
                value={successTemplate}
                onChange={(e) => setSuccessTemplate(e.target.value)}
                className="min-h-[100px] font-mono text-sm"
              />
            ) : successTemplate ? (
              <pre className="whitespace-pre-wrap rounded bg-muted p-3 text-sm">
                {successTemplate}
              </pre>
            ) : (
              <p className="text-sm italic text-muted-foreground">Not configured</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Error Template</CardTitle>
            <CardDescription>Message format when the tool fails.</CardDescription>
          </CardHeader>
          <CardContent>
            {isEditing ? (
              <Textarea
                value={errorTemplate}
                onChange={(e) => setErrorTemplate(e.target.value)}
                className="min-h-[100px] font-mono text-sm"
              />
            ) : errorTemplate ? (
              <pre className="whitespace-pre-wrap rounded bg-muted p-3 text-sm">
                {errorTemplate}
              </pre>
            ) : (
              <p className="text-sm italic text-muted-foreground">Not configured</p>
            )}
          </CardContent>
        </Card>
      </div>

      {isEditing && (
        <div className="flex gap-2">
          <Button onClick={handleSave} disabled={updateTool.isPending}>
            {updateTool.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save Changes
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setDescription(tool.toolDescription || '');
              setSuccessTemplate(tool.toolSuccessTemplate || '');
              setErrorTemplate(tool.toolErrorTemplate || '');
              setIsEditing(false);
            }}
          >
            Cancel
          </Button>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Export Tab
// =============================================================================

function ExportTab({ toolId }: { toolId: string }) {
  const [format, setFormat] = React.useState<'universal' | 'langchain' | 'mcp'>('universal');
  const [copied, setCopied] = React.useState(false);

  const universalExport = useCompositeToolUniversalExport(
    format === 'universal' ? toolId : undefined
  );
  const langchainExport = useCompositeToolLangChainExport(
    format === 'langchain' ? toolId : undefined
  );
  const mcpExport = useCompositeToolMCPExport(format === 'mcp' ? toolId : undefined);

  const currentExport =
    format === 'universal' ? universalExport : format === 'langchain' ? langchainExport : mcpExport;

  const exportData = currentExport.data?.tool;
  const exportJson = exportData ? JSON.stringify(exportData, null, 2) : '';

  const handleCopy = async () => {
    await navigator.clipboard.writeText(exportJson);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-medium">Export Tool</h3>
          <p className="text-sm text-muted-foreground">
            Export this composite tool for use with AI frameworks.
          </p>
        </div>
      </div>

      {/* Format selector */}
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { id: 'universal', label: 'Universal', description: 'OpenAI-compatible format' },
          { id: 'langchain', label: 'LangChain', description: 'LangChain tools format' },
          { id: 'mcp', label: 'MCP', description: 'Model Context Protocol' },
        ].map((option) => (
          <Card
            key={option.id}
            className={cn(
              'cursor-pointer transition-all hover:border-primary/50',
              format === option.id && 'border-primary bg-primary/5'
            )}
            onClick={() => setFormat(option.id as typeof format)}
          >
            <CardContent className="flex items-center gap-3 p-4">
              <div
                className={cn(
                  'flex h-4 w-4 items-center justify-center rounded-full border',
                  format === option.id && 'border-primary bg-primary'
                )}
              >
                {format === option.id && <Check className="h-2.5 w-2.5 text-primary-foreground" />}
              </div>
              <div>
                <p className="font-medium">{option.label}</p>
                <p className="text-xs text-muted-foreground">{option.description}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Export output */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-base">Tool Definition</CardTitle>
          <Button variant="outline" size="sm" onClick={handleCopy} disabled={!exportJson}>
            {copied ? (
              <>
                <Check className="mr-2 h-3 w-3" />
                Copied
              </>
            ) : (
              <>
                <Copy className="mr-2 h-3 w-3" />
                Copy
              </>
            )}
          </Button>
        </CardHeader>
        <CardContent>
          {currentExport.isLoading ? (
            <Skeleton className="h-[300px] w-full" />
          ) : currentExport.isError ? (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Failed to load export. Make sure the tool has a description configured.
              </AlertDescription>
            </Alert>
          ) : (
            <pre className="max-h-[400px] overflow-auto rounded bg-muted p-4 text-sm">
              {exportJson || 'No export data available'}
            </pre>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// =============================================================================
// Skeleton
// =============================================================================

function CompositeToolDetailSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-start gap-4">
        <Skeleton className="h-10 w-10 rounded-md" />
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-32" />
        </div>
      </div>
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-[400px] w-full" />
    </div>
  );
}

export default CompositeToolDetail;
