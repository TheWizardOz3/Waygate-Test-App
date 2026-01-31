'use client';

import { useState, useMemo } from 'react';
import { Variable, Plus, Pencil, Trash2, Lock, Info, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
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
import { useVariables, useDeleteVariable, BUILT_IN_VARIABLES } from '@/hooks';
import { VariableDialog } from './VariableDialog';
import { DeleteVariableDialog } from './DeleteVariableDialog';
import { toast } from 'sonner';
import type { VariableResponse } from '@/lib/modules/variables/variable.schemas';

export function VariablesSection() {
  const [searchQuery, setSearchQuery] = useState('');
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editVariable, setEditVariable] = useState<VariableResponse | null>(null);
  const [deleteVariable, setDeleteVariable] = useState<VariableResponse | null>(null);

  const { data, isLoading } = useVariables({ search: searchQuery || undefined });
  const deleteMutation = useDeleteVariable();

  const variables = useMemo(() => data?.data ?? [], [data]);

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
      return JSON.stringify(variable.value).slice(0, 50) + '...';
    }
    return String(variable.value);
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

  const getEnvColor = (env: string | null) => {
    switch (env) {
      case 'production':
        return 'bg-red-500/10 text-red-600';
      case 'staging':
        return 'bg-amber-500/10 text-amber-600';
      case 'development':
        return 'bg-blue-500/10 text-blue-600';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Variables</h2>
        <p className="text-sm text-muted-foreground">
          Define variables that can be referenced in action configurations using{' '}
          <code className="rounded bg-muted px-1 text-xs">${'{var.name}'}</code>
        </p>
      </div>

      {/* Tenant Variables */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">Tenant Variables</h3>
          <Button size="sm" onClick={() => setCreateDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add Variable
          </Button>
        </div>

        {/* Search */}
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search variables..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Variables Table */}
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : variables.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center">
            <Variable className="mx-auto mb-3 h-8 w-8 text-muted-foreground/50" />
            <p className="text-sm font-medium">No variables defined</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Create variables to use in action configurations
            </p>
            <Button size="sm" className="mt-4" onClick={() => setCreateDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Add Variable
            </Button>
          </div>
        ) : (
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Key</TableHead>
                  <TableHead>Value</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Environment</TableHead>
                  <TableHead className="w-[60px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {variables.map((variable) => (
                  <TableRow key={variable.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <code className="font-mono text-sm">{variable.key}</code>
                        {variable.sensitive && (
                          <Tooltip>
                            <TooltipTrigger>
                              <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                            </TooltipTrigger>
                            <TooltipContent>Sensitive - value is encrypted</TooltipContent>
                          </Tooltip>
                        )}
                        {variable.description && (
                          <Tooltip>
                            <TooltipTrigger>
                              <Info className="h-3.5 w-3.5 text-muted-foreground" />
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
                      <Badge variant="outline" className={getTypeColor(variable.valueType)}>
                        {variable.valueType}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={getEnvColor(variable.environment)}>
                        {variable.environment ?? 'all'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <span className="sr-only">Open menu</span>
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setEditVariable(variable)}>
                            <Pencil className="mr-2 h-4 w-4" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => setDeleteVariable(variable)}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
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
        )}
      </div>

      {/* Built-in Variables Reference */}
      <div className="space-y-4 border-t pt-6">
        <div>
          <h3 className="text-sm font-medium">Built-in Variables</h3>
          <p className="text-xs text-muted-foreground">
            These are automatically available in all actions
          </p>
        </div>
        <div className="grid gap-2 text-sm">
          {BUILT_IN_VARIABLES.map((v) => (
            <div
              key={v.path}
              className="flex items-center gap-4 rounded-md border bg-muted/30 px-3 py-2"
            >
              <code className="min-w-[180px] font-mono text-xs text-primary">
                ${'{' + v.path + '}'}
              </code>
              <span className="text-xs text-muted-foreground">{v.description}</span>
            </div>
          ))}
        </div>
      </div>

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
    </div>
  );
}
