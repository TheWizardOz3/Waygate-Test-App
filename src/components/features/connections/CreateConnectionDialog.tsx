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
import { Loader2, Zap, Settings, ArrowLeft, ArrowRight } from 'lucide-react';
import { PlatformConnectorSelect } from './PlatformConnectorSelect';
import { cn } from '@/lib/utils';

interface CreateConnectionDialogProps {
  integrationId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

type ConnectorType = 'platform' | 'custom';
type Step = 'type' | 'platform-select' | 'details';

export function CreateConnectionDialog({
  integrationId,
  open,
  onOpenChange,
  onSuccess,
}: CreateConnectionDialogProps) {
  const createMutation = useCreateConnection(integrationId);

  // Multi-step state
  const [step, setStep] = useState<Step>('type');
  const [connectorType, setConnectorType] = useState<ConnectorType | null>(null);
  const [platformConnectorSlug, setPlatformConnectorSlug] = useState<string | null>(null);

  // Form state
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

    if (connectorType === 'platform' && !platformConnectorSlug) {
      newErrors.platformConnector = 'Please select a platform connector';
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
        connectorType: connectorType ?? 'custom',
        platformConnectorSlug:
          connectorType === 'platform' ? (platformConnectorSlug ?? undefined) : undefined,
        metadata: {},
      });
      toast.success('Connection created', {
        description: `${name} has been created successfully.`,
      });
      onSuccess?.();
      handleClose();
    } catch (error) {
      toast.error('Failed to create connection', {
        description: error instanceof Error ? error.message : 'Please try again',
      });
    }
  };

  const handleClose = () => {
    // Reset all state on close
    setStep('type');
    setConnectorType(null);
    setPlatformConnectorSlug(null);
    setName('');
    setSlug('');
    setBaseUrl('');
    setIsPrimary(false);
    setErrors({});
    onOpenChange(false);
  };

  const handleConnectorTypeSelect = (type: ConnectorType) => {
    setConnectorType(type);
    if (type === 'platform') {
      setStep('platform-select');
    } else {
      setStep('details');
    }
  };

  const handlePlatformConnectorSelect = (slug: string) => {
    setPlatformConnectorSlug(slug);
  };

  const handleBack = () => {
    if (step === 'platform-select') {
      setStep('type');
      setPlatformConnectorSlug(null);
    } else if (step === 'details') {
      if (connectorType === 'platform') {
        setStep('platform-select');
      } else {
        setStep('type');
        setConnectorType(null);
      }
    }
  };

  const handleNext = () => {
    if (step === 'platform-select' && platformConnectorSlug) {
      setStep('details');
    }
  };

  const getDialogTitle = () => {
    switch (step) {
      case 'type':
        return 'Create Connection';
      case 'platform-select':
        return 'Select Provider';
      case 'details':
        return 'Connection Details';
    }
  };

  const getDialogDescription = () => {
    switch (step) {
      case 'type':
        return 'Choose how you want to connect to this integration.';
      case 'platform-select':
        return 'Select a pre-configured provider for one-click connect.';
      case 'details':
        return 'Configure your connection settings.';
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{getDialogTitle()}</DialogTitle>
          <DialogDescription>{getDialogDescription()}</DialogDescription>
        </DialogHeader>

        {/* Step 1: Connector Type Selection */}
        {step === 'type' && (
          <div className="grid gap-3 py-4">
            <ConnectorTypeCard
              type="platform"
              title="Use Waygate's App"
              description="One-click connect using Waygate's verified OAuth application. No setup required."
              icon={<Zap className="h-5 w-5" />}
              badge="Recommended"
              isSelected={connectorType === 'platform'}
              onSelect={() => handleConnectorTypeSelect('platform')}
            />
            <ConnectorTypeCard
              type="custom"
              title="Use Your Own Credentials"
              description="Connect using your own OAuth app or API credentials. Full control over scopes and rate limits."
              icon={<Settings className="h-5 w-5" />}
              isSelected={connectorType === 'custom'}
              onSelect={() => handleConnectorTypeSelect('custom')}
            />
          </div>
        )}

        {/* Step 2a: Platform Connector Selection */}
        {step === 'platform-select' && (
          <div className="py-4">
            <PlatformConnectorSelect
              value={platformConnectorSlug}
              onChange={handlePlatformConnectorSelect}
            />
            {errors.platformConnector && (
              <p className="mt-2 text-sm text-destructive">{errors.platformConnector}</p>
            )}
            <DialogFooter className="mt-6">
              <Button type="button" variant="ghost" onClick={handleBack}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
              <Button type="button" onClick={handleNext} disabled={!platformConnectorSlug}>
                Continue
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* Step 2b/3: Connection Details Form */}
        {step === 'details' && (
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Show selected type indicator */}
            <div className="rounded-lg border bg-muted/30 p-3">
              <div className="flex items-center gap-2 text-sm">
                {connectorType === 'platform' ? (
                  <>
                    <Zap className="h-4 w-4 text-primary" />
                    <span className="font-medium">Platform Connection</span>
                    {platformConnectorSlug && (
                      <span className="text-muted-foreground">· {platformConnectorSlug}</span>
                    )}
                  </>
                ) : (
                  <>
                    <Settings className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">Custom Credentials</span>
                  </>
                )}
              </div>
            </div>

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

            {/* Only show base URL for custom connections */}
            {connectorType === 'custom' && (
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
            )}

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
              <Button type="button" variant="ghost" onClick={handleBack}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create Connection
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

interface ConnectorTypeCardProps {
  type: ConnectorType;
  title: string;
  description: string;
  icon: React.ReactNode;
  badge?: string;
  isSelected: boolean;
  onSelect: () => void;
}

function ConnectorTypeCard({
  title,
  description,
  icon,
  badge,
  isSelected,
  onSelect,
}: ConnectorTypeCardProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'relative flex items-start gap-4 rounded-lg border p-4 text-left transition-all',
        'hover:border-primary/50 hover:bg-accent/30',
        isSelected ? 'border-primary bg-primary/5 ring-1 ring-primary/20' : 'border-border bg-card'
      )}
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
        {icon}
      </div>
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium text-foreground">{title}</span>
          {badge && (
            <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
              {badge}
            </span>
          )}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
    </button>
  );
}
