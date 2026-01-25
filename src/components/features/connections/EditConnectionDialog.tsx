'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { useUpdateConnection } from '@/hooks';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import type { ConnectionResponse } from '@/lib/modules/connections/connection.schemas';

interface EditConnectionDialogProps {
  connection: ConnectionResponse;
  integrationId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function EditConnectionDialog({
  connection,
  integrationId,
  open,
  onOpenChange,
  onSuccess,
}: EditConnectionDialogProps) {
  const updateMutation = useUpdateConnection(integrationId);

  const [name, setName] = useState(connection.name);
  const [slug, setSlug] = useState(connection.slug);
  const [baseUrl, setBaseUrl] = useState(connection.baseUrl || '');
  const [isPrimary, setIsPrimary] = useState(connection.isPrimary);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Reset form when connection changes
  useEffect(() => {
    setName(connection.name);
    setSlug(connection.slug);
    setBaseUrl(connection.baseUrl || '');
    setIsPrimary(connection.isPrimary);
    setErrors({});
  }, [connection]);

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!name.trim()) {
      newErrors.name = 'Name is required';
    }

    if (!slug.trim()) {
      newErrors.slug = 'Slug is required';
    } else if (!/^[a-z0-9-]+$/.test(slug)) {
      newErrors.slug = 'Slug must be lowercase alphanumeric with hyphens';
    }

    if (baseUrl && !/^https?:\/\/.+/.test(baseUrl)) {
      newErrors.baseUrl = 'Must be a valid URL';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate()) return;

    try {
      await updateMutation.mutateAsync({
        id: connection.id,
        name: name.trim(),
        slug: slug.trim(),
        baseUrl: baseUrl.trim() || null,
        isPrimary,
      });
      toast.success('Connection updated', {
        description: `${name} has been updated successfully.`,
      });
      onOpenChange(false);
      onSuccess?.();
    } catch (error) {
      toast.error('Failed to update connection', {
        description: error instanceof Error ? error.message : 'Please try again',
      });
    }
  };

  const handleClose = () => {
    // Reset form on close
    setName(connection.name);
    setSlug(connection.slug);
    setBaseUrl(connection.baseUrl || '');
    setIsPrimary(connection.isPrimary);
    setErrors({});
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Edit Connection</DialogTitle>
          <DialogDescription>Update the connection settings.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-name">Name</Label>
            <Input
              id="edit-name"
              placeholder="Production App"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            {errors.name && <p className="text-sm text-destructive">{errors.name}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-slug">Slug</Label>
            <Input
              id="edit-slug"
              placeholder="production-app"
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase())}
            />
            {errors.slug && <p className="text-sm text-destructive">{errors.slug}</p>}
            <p className="text-xs text-muted-foreground">URL-safe identifier for API requests</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-baseUrl">Base URL (Optional)</Label>
            <Input
              id="edit-baseUrl"
              placeholder="https://api.example.com"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
            />
            {errors.baseUrl && <p className="text-sm text-destructive">{errors.baseUrl}</p>}
            <p className="text-xs text-muted-foreground">
              Override the default API base URL for this connection
            </p>
          </div>

          <div className="flex flex-row items-center justify-between rounded-lg border p-3">
            <div className="space-y-0.5">
              <Label>Primary Connection</Label>
              <p className="text-xs text-muted-foreground">
                Use this connection by default when no connection is specified
              </p>
            </div>
            <Switch checked={isPrimary} onCheckedChange={setIsPrimary} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={updateMutation.isPending}>
              {updateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
