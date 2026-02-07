'use client';

/**
 * BatchSubmitForm
 *
 * Dashboard form for creating batch operations.
 * Select integration + action, enter items as JSON, configure overrides, submit.
 */

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Zap, AlertCircle, CheckCircle2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useSubmitBatch } from '@/hooks';

// =============================================================================
// Types
// =============================================================================

export interface BatchSubmitFormProps {
  /** Pre-selected integration slug */
  integrationSlug?: string;
  /** Pre-selected action slug */
  actionSlug?: string;
  /** Whether this action has bulk config */
  hasBulkRoute?: boolean;
}

// =============================================================================
// Component
// =============================================================================

export function BatchSubmitForm({
  integrationSlug: initialIntegration,
  actionSlug: initialAction,
  hasBulkRoute = false,
}: BatchSubmitFormProps) {
  const router = useRouter();
  const submitBatch = useSubmitBatch();

  // Form state
  const [integrationSlug, setIntegrationSlug] = useState(initialIntegration ?? '');
  const [actionSlug, setActionSlug] = useState(initialAction ?? '');
  const [itemsJson, setItemsJson] = useState('[\n  { "input": {} }\n]');
  const [concurrency, setConcurrency] = useState(5);
  const [delayMs, setDelayMs] = useState(0);
  const [skipInvalid, setSkipInvalid] = useState(false);

  // Validation
  const [parseError, setParseError] = useState<string | null>(null);
  const [parsedCount, setParsedCount] = useState<number | null>(null);

  const validateJson = useCallback((json: string) => {
    try {
      const parsed = JSON.parse(json);
      if (!Array.isArray(parsed)) {
        setParseError('Items must be a JSON array');
        setParsedCount(null);
        return null;
      }
      // Ensure each item has an input field, or wrap the whole object
      const items = parsed.map((item: unknown) => {
        if (typeof item === 'object' && item !== null && 'input' in item) {
          return item as { input: Record<string, unknown> };
        }
        // Treat the whole object as the input
        return { input: item as Record<string, unknown> };
      });
      setParseError(null);
      setParsedCount(items.length);
      return items;
    } catch (e) {
      setParseError(e instanceof Error ? e.message : 'Invalid JSON');
      setParsedCount(null);
      return null;
    }
  }, []);

  function handleItemsChange(value: string) {
    setItemsJson(value);
    validateJson(value);
  }

  async function handleSubmit() {
    const items = validateJson(itemsJson);
    if (!items || !integrationSlug || !actionSlug) return;

    try {
      const result = await submitBatch.mutateAsync({
        integrationSlug,
        actionSlug,
        items,
        config: {
          concurrency,
          delayMs,
          skipInvalidItems: skipInvalid,
        },
      });

      // Navigate to job detail
      router.push(`/jobs?selected=${result.jobId}`);
    } catch {
      // Error is handled by the mutation state
    }
  }

  const canSubmit =
    integrationSlug &&
    actionSlug &&
    parsedCount !== null &&
    parsedCount > 0 &&
    !parseError &&
    !submitBatch.isPending;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Zap className="h-4 w-4" />
          Submit Batch Operation
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Target */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="integration-slug">Integration slug</Label>
            <Input
              id="integration-slug"
              placeholder="e.g., salesforce"
              value={integrationSlug}
              onChange={(e) => setIntegrationSlug(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="action-slug">Action slug</Label>
            <Input
              id="action-slug"
              placeholder="e.g., update-record"
              value={actionSlug}
              onChange={(e) => setActionSlug(e.target.value)}
            />
          </div>
        </div>

        {hasBulkRoute && (
          <Badge variant="outline" className="gap-1">
            <CheckCircle2 className="h-3 w-3 text-emerald-500" />
            Bulk API route available
          </Badge>
        )}

        {/* Items JSON */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="items-json">Items (JSON array)</Label>
            {parsedCount !== null && (
              <span className="text-xs text-muted-foreground">
                {parsedCount} item{parsedCount !== 1 ? 's' : ''}
              </span>
            )}
          </div>
          <textarea
            id="items-json"
            className="flex min-h-[200px] w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            value={itemsJson}
            onChange={(e) => handleItemsChange(e.target.value)}
            placeholder='[\n  { "input": { "name": "example" } }\n]'
          />
          {parseError && (
            <p className="flex items-center gap-1 text-xs text-destructive">
              <AlertCircle className="h-3 w-3" />
              {parseError}
            </p>
          )}
        </div>

        {/* Config overrides */}
        <div className="space-y-4">
          <h4 className="text-sm font-medium">Configuration</h4>

          <div className="space-y-2">
            <Label>Concurrency: {concurrency}</Label>
            <Slider
              min={1}
              max={20}
              step={1}
              value={[concurrency]}
              onValueChange={([val]) => setConcurrency(val)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="submit-delay">Delay between items (ms)</Label>
            <Input
              id="submit-delay"
              type="number"
              min={0}
              max={5000}
              value={delayMs}
              onChange={(e) => setDelayMs(parseInt(e.target.value) || 0)}
            />
          </div>

          <div className="flex items-center gap-3">
            <Switch id="skip-invalid" checked={skipInvalid} onCheckedChange={setSkipInvalid} />
            <Label htmlFor="skip-invalid">Skip invalid items (process valid items only)</Label>
          </div>
        </div>

        {/* Error display */}
        {submitBatch.isError && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              {submitBatch.error instanceof Error
                ? submitBatch.error.message
                : 'Failed to submit batch'}
            </AlertDescription>
          </Alert>
        )}

        {/* Submit */}
        <Button onClick={handleSubmit} disabled={!canSubmit} className="w-full">
          {submitBatch.isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Submitting...
            </>
          ) : (
            <>
              <Zap className="mr-2 h-4 w-4" />
              Submit Batch ({parsedCount ?? 0} items)
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
