'use client';

import { useState, useMemo } from 'react';
import { Variable, Plus, Pencil, Trash2, Lock, Info, ChevronDown, ChevronUp } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useConnectionVariables, useVariables, useDeleteVariable } from '@/hooks';
import { VariableDialog } from '@/components/features/settings/VariableDialog';
import { DeleteVariableDialog } from '@/components/features/settings/DeleteVariableDialog';
import { toast } from 'sonner';
import type { VariableResponse } from '@/lib/modules/variables/variable.schemas';

interface ConnectionVariablesSectionProps {
  connectionId: string;
}

export function ConnectionVariablesSection({ connectionId }: ConnectionVariablesSectionProps) {
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editVariable, setEditVariable] = useState<VariableResponse | null>(null);
  const [deleteVariable, setDeleteVariable] = useState<VariableResponse | null>(null);
  const [showInherited, setShowInherited] = useState(false);

  // Connection-specific variables
  const { data: connectionData, isLoading: connectionLoading } =
    useConnectionVariables(connectionId);
  // Tenant-level variables (inherited)
  const { data: tenantData, isLoading: tenantLoading } = useVariables();
  const deleteMutation = useDeleteVariable(connectionId);

  const connectionVariables = useMemo(() => connectionData?.data ?? [], [connectionData]);
  const tenantVariables = useMemo(() => tenantData?.data ?? [], [tenantData]);

  // Keys that are overridden at connection level
  const overriddenKeys = useMemo(
    () => new Set(connectionVariables.map((v) => v.key)),
    [connectionVariables]
  );

  // Inherited variables (tenant-level, not overridden)
  const inheritedVariables = useMemo(
    () => tenantVariables.filter((v) => !overriddenKeys.has(v.key)),
    [tenantVariables, overriddenKeys]
  );

  const handleDelete = async () => {
    if (!deleteVariable) return;
    try {
      await deleteMutation.mutateAsync(deleteVariable.id);
      toast.success('Variable deleted');
      setDeleteVariable(null);
    } catch {
      toast.error('Failed to delete variable');
    }
  };

  const formatValue = (variable: VariableResponse) => {
    if (variable.sensitive) {
      return '[REDACTED]';
    }
    if (variable.valueType === 'json') {
      return JSON.stringify(variable.value).slice(0, 40) + '...';
    }
    const str = String(variable.value);
    return str.length > 40 ? str.slice(0, 40) + '...' : str;
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'string':
        return 'bg-blue-500/10 text-blue-600';
      case 'number':
        return 'bg-purple-500/10 text-purple-600';
      case 'boolean':
        return 'bg-amber-500/10 text-amber-600';
      case 'json':
        return 'bg-emerald-500/10 text-emerald-600';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  const isLoading = connectionLoading || tenantLoading;

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Variable className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-base">Variables</CardTitle>
            </div>
            <Button size="sm" variant="outline" onClick={() => setCreateDialogOpen(true)}>
              <Plus className="mr-2 h-3.5 w-3.5" />
              Add Override
            </Button>
          </div>
          <CardDescription>
            Connection-level variables override tenant defaults for this connection only.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 2 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : connectionVariables.length === 0 && inheritedVariables.length === 0 ? (
            <div className="rounded-lg border border-dashed p-6 text-center">
              <Variable className="mx-auto mb-2 h-6 w-6 text-muted-foreground/50" />
              <p className="text-sm font-medium">No variables configured</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Add connection-specific overrides or define tenant variables in Settings.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Connection-level overrides */}
              {connectionVariables.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">
                    Connection Overrides ({connectionVariables.length})
                  </p>
                  <div className="rounded-lg border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[140px]">Key</TableHead>
                          <TableHead>Value</TableHead>
                          <TableHead className="w-[70px]">Type</TableHead>
                          <TableHead className="w-[40px]"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {connectionVariables.map((variable) => (
                          <TableRow key={variable.id}>
                            <TableCell>
                              <div className="flex items-center gap-1.5">
                                <code className="font-mono text-xs">{variable.key}</code>
                                {variable.sensitive && (
                                  <Lock className="h-3 w-3 text-muted-foreground" />
                                )}
                                {variable.description && (
                                  <Tooltip>
                                    <TooltipTrigger>
                                      <Info className="h-3 w-3 text-muted-foreground" />
                                    </TooltipTrigger>
                                    <TooltipContent className="max-w-xs">
                                      {variable.description}
                                    </TooltipContent>
                                  </Tooltip>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <code className="font-mono text-xs text-muted-foreground">
                                {formatValue(variable)}
                              </code>
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant="outline"
                                className={`text-[10px] ${getTypeColor(variable.valueType)}`}
                              >
                                {variable.valueType}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-7 w-7">
                                    <Pencil className="h-3.5 w-3.5" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem onClick={() => setEditVariable(variable)}>
                                    <Pencil className="mr-2 h-3.5 w-3.5" />
                                    Edit
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    className="text-destructive"
                                    onClick={() => setDeleteVariable(variable)}
                                  >
                                    <Trash2 className="mr-2 h-3.5 w-3.5" />
                                    Delete
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}

              {/* Inherited tenant variables */}
              {inheritedVariables.length > 0 && (
                <Collapsible open={showInherited} onOpenChange={setShowInherited}>
                  <CollapsibleTrigger asChild>
                    <button className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted/50">
                      <span>Inherited from Tenant ({inheritedVariables.length})</span>
                      {showInherited ? (
                        <ChevronUp className="h-3.5 w-3.5" />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="pt-2">
                    <div className="rounded-lg border bg-muted/20">
                      <Table>
                        <TableBody>
                          {inheritedVariables.map((variable) => (
                            <TableRow key={variable.id} className="hover:bg-transparent">
                              <TableCell className="w-[140px]">
                                <div className="flex items-center gap-1.5">
                                  <code className="font-mono text-xs text-muted-foreground">
                                    {variable.key}
                                  </code>
                                  {variable.sensitive && (
                                    <Lock className="h-3 w-3 text-muted-foreground/50" />
                                  )}
                                </div>
                              </TableCell>
                              <TableCell>
                                <code className="font-mono text-xs text-muted-foreground/60">
                                  {formatValue(variable)}
                                </code>
                              </TableCell>
                              <TableCell className="w-[70px]">
                                <Badge
                                  variant="outline"
                                  className="border-muted-foreground/20 bg-transparent text-[10px] text-muted-foreground/60"
                                >
                                  {variable.valueType}
                                </Badge>
                              </TableCell>
                              <TableCell className="w-[40px]"></TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      To override a tenant variable, click &quot;Add Override&quot; and use the same
                      key.
                    </p>
                  </CollapsibleContent>
                </Collapsible>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <VariableDialog
        open={createDialogOpen || !!editVariable}
        onOpenChange={(open) => {
          if (!open) {
            setCreateDialogOpen(false);
            setEditVariable(null);
          }
        }}
        variable={editVariable}
        connectionId={connectionId}
        onSuccess={() => {
          setCreateDialogOpen(false);
          setEditVariable(null);
        }}
      />

      {/* Delete Dialog */}
      <DeleteVariableDialog
        open={!!deleteVariable}
        onOpenChange={(open) => !open && setDeleteVariable(null)}
        variableKey={deleteVariable?.key ?? ''}
        onConfirm={handleDelete}
        isDeleting={deleteMutation.isPending}
      />
    </>
  );
}
