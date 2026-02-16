'use client';

import { useState, useMemo } from 'react';
import { Boxes, Plus, Search, Pencil, Trash2 } from 'lucide-react';
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
import { useApps, useDeleteApp } from '@/hooks/useApps';
import { CreateAppDialog } from './CreateAppDialog';
import { DeleteAppDialog } from './DeleteAppDialog';
import { AppDetailPanel } from './AppDetailPanel';
import { toast } from 'sonner';
import type { AppResponse } from '@/lib/modules/apps/app.schemas';

export function AppsSection() {
  const [searchQuery, setSearchQuery] = useState('');
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [deleteApp, setDeleteApp] = useState<AppResponse | null>(null);
  const [selectedAppId, setSelectedAppId] = useState<string | null>(null);

  const { data, isLoading } = useApps({
    search: searchQuery || undefined,
  });
  const deleteMutation = useDeleteApp();

  const apps = useMemo(() => data?.apps ?? [], [data]);

  const handleDelete = async () => {
    if (!deleteApp) return;
    try {
      await deleteMutation.mutateAsync(deleteApp.id);
      toast.success('App deleted');
      setDeleteApp(null);
      if (selectedAppId === deleteApp.id) {
        setSelectedAppId(null);
      }
    } catch {
      toast.error('Failed to delete app');
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-emerald-500/10 text-emerald-600';
      case 'disabled':
        return 'bg-red-500/10 text-red-600';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  // If an app is selected, show its detail panel
  if (selectedAppId) {
    return (
      <AppDetailPanel
        appId={selectedAppId}
        onBack={() => setSelectedAppId(null)}
        onDelete={() => {
          const app = apps.find((a) => a.id === selectedAppId);
          if (app) setDeleteApp(app);
        }}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Apps</h2>
        <p className="text-sm text-muted-foreground">
          Consuming applications with dedicated API keys for end-user auth delegation.
        </p>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">Your Apps</h3>
          <Button size="sm" onClick={() => setCreateDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Create App
          </Button>
        </div>

        {/* Search */}
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search apps..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Apps Table */}
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : apps.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center">
            <Boxes className="mx-auto mb-3 h-8 w-8 text-muted-foreground/50" />
            <p className="text-sm font-medium">No apps created</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Create an app to get a dedicated API key for end-user auth delegation.
            </p>
            <Button size="sm" className="mt-4" onClick={() => setCreateDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Create App
            </Button>
          </div>
        ) : (
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Slug</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="w-[60px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {apps.map((app) => (
                  <TableRow
                    key={app.id}
                    className="cursor-pointer"
                    onClick={() => setSelectedAppId(app.id)}
                  >
                    <TableCell>
                      <div>
                        <p className="font-medium">{app.name}</p>
                        {app.description && (
                          <p className="line-clamp-1 text-xs text-muted-foreground">
                            {app.description}
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <code className="font-mono text-xs">{app.slug}</code>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={getStatusColor(app.status)}>
                        {app.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(app.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <span className="sr-only">Open menu</span>
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedAppId(app.id);
                            }}
                          >
                            <Pencil className="mr-2 h-4 w-4" />
                            Manage
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteApp(app);
                            }}
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

      {/* Create App Dialog */}
      <CreateAppDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onSuccess={() => setCreateDialogOpen(false)}
      />

      {/* Delete App Dialog */}
      <DeleteAppDialog
        open={!!deleteApp}
        onOpenChange={(open) => !open && setDeleteApp(null)}
        appName={deleteApp?.name ?? ''}
        onConfirm={handleDelete}
        isDeleting={deleteMutation.isPending}
      />
    </div>
  );
}
