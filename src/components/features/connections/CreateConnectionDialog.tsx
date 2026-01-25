'use client';

import { useState } from 'react';
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
import { useCreateConnection } from '@/hooks';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

interface CreateConnectionDialogProps {
  integrationId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateConnectionDialog({
  integrationId,
  open,
  onOpenChange,
}: CreateConnectionDialogProps) {
  const createMutation = useCreateConnection(integrationId);

  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [isPrimary, setIsPrimary] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Auto-generate slug from name
  const handleNameChange = (value: string) => {
    setName(value);

    // Auto-generate slug
    const generatedSlug = value
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .substring(0, 100);

    setSlug(generatedSlug);
  };

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
      await createMutation.mutateAsync({
        name: name.trim(),
        slug: slug.trim(),
        baseUrl: baseUrl.trim() || null,
        isPrimary,
        metadata: {},
      });
      toast.success('Connection created', {
        description: `${name} has been created successfully.`,
      });
      // Reset form
      setName('');
      setSlug('');
      setBaseUrl('');
      setIsPrimary(false);
      setErrors({});
      onOpenChange(false);
    } catch (error) {
      toast.error('Failed to create connection', {
        description: error instanceof Error ? error.message : 'Please try again',
      });
    }
  };

  const handleClose = () => {
    // Reset form on close
    setName('');
    setSlug('');
    setBaseUrl('');
    setIsPrimary(false);
    setErrors({});
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Create Connection</DialogTitle>
          <DialogDescription>
            Add a new connection to link a consuming app with this integration.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              placeholder="Production App"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
            />
            {errors.name && <p className="text-sm text-destructive">{errors.name}</p>}
            <p className="text-xs text-muted-foreground">A friendly name for this connection</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="slug">Slug</Label>
            <Input
              id="slug"
              placeholder="production-app"
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase())}
            />
            {errors.slug && <p className="text-sm text-destructive">{errors.slug}</p>}
            <p className="text-xs text-muted-foreground">
              URL-safe identifier (auto-generated from name)
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="baseUrl">Base URL (Optional)</Label>
            <Input
              id="baseUrl"
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
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Connection
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
