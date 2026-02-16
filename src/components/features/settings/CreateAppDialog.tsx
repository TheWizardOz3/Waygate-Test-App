'use client';

import { useState, useEffect } from 'react';
import { Loader2, Copy, Check, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useCreateApp } from '@/hooks/useApps';
import { toast } from 'sonner';

interface CreateAppDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function CreateAppDialog({ open, onOpenChange, onSuccess }: CreateAppDialogProps) {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [autoSlug, setAutoSlug] = useState(true);
  const [description, setDescription] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  // After creation, show the API key
  const [createdApiKey, setCreatedApiKey] = useState<string | null>(null);
  const [isCopied, setIsCopied] = useState(false);

  const createMutation = useCreateApp();

  useEffect(() => {
    if (open) {
      setName('');
      setSlug('');
      setAutoSlug(true);
      setDescription('');
      setErrors({});
      setCreatedApiKey(null);
      setIsCopied(false);
    }
  }, [open]);

  // Auto-generate slug from name
  useEffect(() => {
    if (autoSlug && name) {
      setSlug(
        name
          .toLowerCase()
          .replace(/[^a-z0-9\s-]/g, '')
          .replace(/\s+/g, '-')
          .replace(/-+/g, '-')
          .slice(0, 100)
      );
    }
  }, [name, autoSlug]);

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!name.trim()) newErrors.name = 'App name is required';
    if (!slug.trim()) {
      newErrors.slug = 'Slug is required';
    } else if (!/^[a-z0-9-]+$/.test(slug)) {
      newErrors.slug = 'Slug must be lowercase alphanumeric with hyphens';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    try {
      const result = await createMutation.mutateAsync({
        name: name.trim(),
        slug: slug.trim(),
        description: description.trim() || undefined,
        metadata: {},
      });
      setCreatedApiKey(result.apiKey);
      toast.success('App created successfully');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create app';
      toast.error(message);
    }
  };

  const handleCopyKey = async () => {
    if (!createdApiKey) return;
    try {
      await navigator.clipboard.writeText(createdApiKey);
      setIsCopied(true);
      toast.success('API key copied to clipboard');
      setTimeout(() => setIsCopied(false), 2000);
    } catch {
      toast.error('Failed to copy API key');
    }
  };

  const handleClose = () => {
    onOpenChange(false);
    if (createdApiKey) {
      onSuccess?.();
    }
  };

  // After creation: show the API key
  if (createdApiKey) {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>App Created</DialogTitle>
            <DialogDescription>
              Your app has been created. Copy the API key below — it will only be shown once.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                <p className="text-sm text-amber-600">
                  This API key will not be shown again. Store it securely before closing this
                  dialog.
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label>App API Key</Label>
              <div className="flex gap-2">
                <Input value={createdApiKey} readOnly className="font-mono text-sm" />
                <Button variant="outline" size="icon" onClick={handleCopyKey}>
                  {isCopied ? (
                    <Check className="h-4 w-4 text-emerald-500" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Use this key with the <code className="rounded bg-muted px-1">wg_app_</code> prefix
                to authenticate requests from your consuming application.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button onClick={handleClose}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  // Before creation: show the form
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create App</DialogTitle>
          <DialogDescription>
            Create a consuming application with its own API key for end-user auth delegation.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="app-name">App Name</Label>
            <Input
              id="app-name"
              placeholder="My App"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="app-slug">Slug</Label>
            <Input
              id="app-slug"
              placeholder="my-app"
              value={slug}
              onChange={(e) => {
                setSlug(e.target.value);
                setAutoSlug(false);
              }}
              className="font-mono"
            />
            {errors.slug && <p className="text-xs text-destructive">{errors.slug}</p>}
            <p className="text-xs text-muted-foreground">
              Unique identifier for this app. Auto-generated from name.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="app-description">Description (optional)</Label>
            <Input
              id="app-description"
              placeholder="What does this app do?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        </form>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={createMutation.isPending}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={createMutation.isPending}>
            {createMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating...
              </>
            ) : (
              'Create App'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
