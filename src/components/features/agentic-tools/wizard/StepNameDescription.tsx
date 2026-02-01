'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useAgenticToolWizardStore } from '@/stores/agenticToolWizard.store';

export function StepNameDescription() {
  const { data, setNameAndDescription, canProceed, getNextStep, goToStep } =
    useAgenticToolWizardStore();

  const [name, setName] = useState(data.name);
  const [slug, setSlug] = useState(data.slug);
  const [description, setDescription] = useState(data.description);

  // Update store when local state changes
  useEffect(() => {
    setNameAndDescription(name, slug, description);
  }, [name, slug, description, setNameAndDescription]);

  const handleNext = () => {
    const nextStep = getNextStep();
    if (nextStep && canProceed()) {
      goToStep(nextStep);
    }
  };

  const autoGenerateSlug = () => {
    if (name) {
      const generatedSlug = name
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .trim();
      setSlug(generatedSlug);
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        {/* Name */}
        <div className="space-y-2">
          <Label htmlFor="name">Tool Name *</Label>
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Database Manager"
            autoFocus
          />
          <p className="text-sm text-muted-foreground">A descriptive name for your agentic tool.</p>
        </div>

        {/* Slug */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="slug">Slug *</Label>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={autoGenerateSlug}
              disabled={!name}
            >
              Auto-generate
            </Button>
          </div>
          <Input
            id="slug"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="database-manager"
            pattern="[a-z0-9-]+"
          />
          <p className="text-sm text-muted-foreground">
            URL-friendly identifier (lowercase letters, numbers, and hyphens only).
          </p>
        </div>

        {/* Description */}
        <div className="space-y-2">
          <Label htmlFor="description">Description (optional)</Label>
          <Textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Translate natural language into SQL queries and execute database operations."
            rows={3}
          />
          <p className="text-sm text-muted-foreground">
            Describe what this tool does and when to use it.
          </p>
        </div>
      </div>

      <div className="flex justify-end">
        <Button onClick={handleNext} disabled={!canProceed()}>
          Next
        </Button>
      </div>
    </div>
  );
}
